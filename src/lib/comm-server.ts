/**
 * موتور صلاحیت‌های ارتباطی — فقط سمت سرور
 *
 * اصل امنیتی: هر تصمیم ارسال/دریافت/مشاهده بر اساس دادهٔ واقعی دیتابیس گرفته می‌شود
 * (صنف‌ها، تقسیم مضامین، نگران صنف، فرزندان ثبت‌شدهٔ والد) — نه ظاهر برنامه.
 */
import { db } from '@/lib/db';
import { ApiError } from '@/lib/auth';
import { teacherClassIds } from '@/lib/teacher-scope';
import {
  type CommPerms, type CommPolicy, effectivePerms, parseCommPolicy,
  roleAllowed, COMM_ROLES,
} from '@/lib/comm';

export const COMM_POLICY_KEY = 'commPolicy';
const MIGRATED_KEY = 'msgRecipientsMigrated';

export interface CommUserCtx {
  id: string;
  name: string;
  role: string;
  teacherId: string | null;
  studentId: string | null;
}

/* ─────────────── سیاست ارتباطی ─────────────── */

export async function getCommPolicy(): Promise<CommPolicy> {
  const row = await db.setting.findUnique({ where: { key: COMM_POLICY_KEY } });
  return parseCommPolicy(row?.value);
}

export async function permsFor(user: CommUserCtx): Promise<CommPerms> {
  const policy = await getCommPolicy();
  return effectivePerms(user.role, user.id, policy);
}

/** ثبت اقدام حساس در گزارش فعالیت‌ها — هرگز جریان اصلی را نمی‌شکند */
export async function logAudit(
  actor: { id: string; name: string },
  action: string,
  detail: Record<string, unknown>,
) {
  try {
    await db.auditLog.create({
      data: { actorId: actor.id, actorName: actor.name, action, detail: JSON.stringify(detail).slice(0, 4000) },
    });
  } catch {
    /* گزارش فعالیت حیاتی نیست */
  }
}

/* ─────────────── روابط واقعی از دیتابیس ─────────────── */

/** همهٔ فرزندان ثبت‌شدهٔ یک والد — پیوند اصلی + پیوندهای اضافی (چند فرزند) */
export async function guardianChildClassIds(user: CommUserCtx): Promise<string[]> {
  const ids = new Set<string>();
  if (user.studentId) {
    const s = await db.student.findUnique({ where: { id: user.studentId }, select: { classId: true } });
    if (s?.classId) ids.add(s.classId);
  }
  const links = await db.guardianLink.findMany({
    where: { userId: user.id },
    select: { student: { select: { classId: true } } },
  });
  for (const l of links) if (l.student.classId) ids.add(l.student.classId);
  return [...ids];
}

/** صنف‌های تحت اختیار معلم — تدریس + نگرانی + نگرانی موقت */
export function teacherScopeClassIds(user: CommUserCtx): Promise<string[]> {
  return teacherClassIds(user.teacherId || '');
}

/** شناسهٔ کاربران معلمان مرتبط با صنف‌های مشخص (تدریس + نگرانی) */
export async function teacherUserIdsOfClassIds(classIds: string[]): Promise<string[]> {
  if (!classIds.length) return [];
  const [cs, classes] = await Promise.all([
    db.classSubject.findMany({ where: { classId: { in: classIds }, teacherId: { not: null } }, select: { teacherId: true } }),
    db.class.findMany({
      where: { OR: [{ id: { in: classIds }, supervisorId: { not: null } }, { id: { in: classIds }, actingSupervisorId: { not: null } }] },
      select: { supervisorId: true, actingSupervisorId: true },
    }),
  ]);
  const tIds = new Set<string>();
  for (const x of cs) if (x.teacherId) tIds.add(x.teacherId);
  for (const c of classes) {
    if (c.supervisorId) tIds.add(c.supervisorId);
    if (c.actingSupervisorId) tIds.add(c.actingSupervisorId);
  }
  if (!tIds.size) return [];
  const users = await db.user.findMany({
    where: { teacherId: { in: [...tIds] }, active: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** شناسهٔ کاربران والدین صنف‌های مشخص — پیوند اصلی + چند‌فرزندی */
export async function guardianUserIdsOfClassIds(classIds: string[]): Promise<string[]> {
  if (!classIds.length) return [];
  const [direct, linked] = await Promise.all([
    db.user.findMany({
      where: { active: true, role: 'GUARDIAN', studentProfile: { classId: { in: classIds } } },
      select: { id: true },
    }),
    db.user.findMany({
      where: {
        active: true, role: 'GUARDIAN',
        guardianLinks: { some: { student: { classId: { in: classIds } } } },
      },
      select: { id: true },
    }),
  ]);
  return [...new Set([...direct.map((u) => u.id), ...linked.map((u) => u.id)])];
}

/** شناسهٔ کاربران شاگردان صنف‌های مشخص (فقط حساب‌های فعال) */
export async function studentUserIdsOfClassIds(classIds: string[]): Promise<string[]> {
  if (!classIds.length) return [];
  const users = await db.user.findMany({
    where: { active: true, role: 'STUDENT', studentProfile: { classId: { in: classIds } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/* ─────────────── گیرندگان ─────────────── */

export interface MsgTarget {
  kind: 'all' | 'roles' | 'classes' | 'users';
  roles?: string[];
  classIds?: string[];
  audience?: 'guardians' | 'students' | 'teachers' | 'classAll';
  userIds?: string[];
}

export interface ResolvedRecipient {
  id: string;
  name: string;
  role: string;
}

export interface RecipientBreakdown {
  label: string;
  count: number;
}

/** گیرندگان یک بخش از هدف را برمی‌گرداند (بدون ددیوپ بین بخش‌ها) */
async function resolveComponent(me: CommUserCtx, t: MsgTarget): Promise<{ ids: string[]; label: string }> {
  switch (t.kind) {
    case 'all': {
      const users = await db.user.findMany({ where: { active: true, id: { not: me.id } }, select: { id: true } });
      return { ids: users.map((u) => u.id), label: 'تمام کاربران' };
    }
    case 'roles': {
      const roles = (t.roles || []).filter((r) => COMM_ROLES.includes(r as (typeof COMM_ROLES)[number]) || r === 'ALL');
      if (!roles.length) return { ids: [], label: 'نقش‌ها' };
      const where = roles.includes('ALL')
        ? { active: true, id: { not: me.id } }
        : { active: true, id: { not: me.id }, role: { in: roles } };
      const users = await db.user.findMany({ where, select: { id: true } });
      const labels: Record<string, string> = {
        ALL: 'همهٔ کاربران', ADMIN: 'مدیران', HEADTEACHER: 'سرمعلم', TEACHER: 'معلمان',
        STUDENT: 'شاگردان', GUARDIAN: 'والدین', STAFF: 'کارمندان', LIBRARIAN: 'کتابخانه',
      };
      return { ids: users.map((u) => u.id), label: roles.map((r) => labels[r] || r).join(' + ') };
    }
    case 'classes': {
      const classIds = t.classIds || [];
      if (!classIds.length) return { ids: [], label: 'صنف‌ها' };
      const classes = await db.class.findMany({ where: { id: { in: classIds } }, select: { name: true } });
      const clsLabel = classes.map((c) => c.name).join('، ') || 'صنف';
      const aud = t.audience || 'classAll';
      const [g, s, tch] = await Promise.all([
        aud === 'guardians' || aud === 'classAll' ? guardianUserIdsOfClassIds(classIds) : Promise.resolve([]),
        aud === 'students' || aud === 'classAll' ? studentUserIdsOfClassIds(classIds) : Promise.resolve([]),
        aud === 'teachers' || aud === 'classAll' ? teacherUserIdsOfClassIds(classIds) : Promise.resolve([]),
      ]);
      const audLabel: Record<string, string> = {
        guardians: 'والدین', students: 'شاگردان', teachers: 'معلمان', classAll: 'اعضای',
      };
      return { ids: [...new Set([...g, ...s, ...tch])], label: `${audLabel[aud]} صنف ${clsLabel}` };
    }
    case 'users': {
      const ids = (t.userIds || []).filter((x) => x && x !== me.id);
      if (!ids.length) return { ids: [], label: 'افراد' };
      const users = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
      return { ids: users.map((u) => u.id), label: `${users.length} شخص مشخص` };
    }
    default:
      return { ids: [], label: '' };
  }
}

/**
 * حل کامل گیرندگان با حذف تکراری — یک شخص از چند مسیر انتخاب‌شده فقط یک پیام می‌گیرد.
 * ترتیب اجزا حفظ می‌شود تا گزارش «گروه‌های انتخاب‌شده» درست باشد.
 */
export async function resolveRecipients(
  me: CommUserCtx,
  targets: MsgTarget[],
): Promise<{ recipients: ResolvedRecipient[]; breakdown: RecipientBreakdown[] }> {
  const seen = new Set<string>();
  const breakdown: RecipientBreakdown[] = [];
  const ordered: string[] = [];
  for (const t of targets) {
    const { ids, label } = await resolveComponent(me, t);
    const fresh = ids.filter((id) => !seen.has(id));
    for (const id of fresh) { seen.add(id); ordered.push(id); }
    breakdown.push({ label, count: fresh.length });
  }
  if (!ordered.length) return { recipients: [], breakdown };
  const users = await db.user.findMany({
    where: { id: { in: ordered } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const recipients = ordered
    .map((id) => byId.get(id))
    .filter((u): u is ResolvedRecipient => !!u)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
  return { recipients, breakdown };
}

/* ─────────────── آیا فرستنده اجازهٔ پیام به این کاربر را دارد؟ ─────────────── */

interface TargetInfo {
  id: string;
  active: boolean;
  role: string;
  teacherId: string | null;
  studentId: string | null;
  studentProfile: { classId: string | null } | null;
}

/** آیا این معلم با این والد/شاگرد ارتباط آموزشی دارد؟ (همهٔ فرزندان ثبت‌شدهٔ والد) */
async function teacherRelatesTo(me: CommUserCtx, target: TargetInfo): Promise<boolean> {
  let targetClassIds: string[] = [];
  if (target.role === 'GUARDIAN') {
    targetClassIds = await guardianChildClassIds({ id: target.id, name: '', role: target.role, teacherId: target.teacherId, studentId: target.studentId });
  } else if (target.role === 'STUDENT') {
    targetClassIds = target.studentProfile?.classId ? [target.studentProfile.classId] : [];
  } else {
    return false;
  }
  if (!targetClassIds.length) return false;
  const scope = await teacherScopeClassIds(me);
  return targetClassIds.some((c) => scope.includes(c));
}

/** آیا این والد با این معلم از طریق فرزندانش ارتباط دارد؟ */
async function guardianRelatesToTeacher(me: CommUserCtx, target: TargetInfo): Promise<boolean> {
  if (!target.teacherId) return false;
  const childClassIds = await guardianChildClassIds(me);
  if (!childClassIds.length) return false;
  const tUser = await db.user.findUnique({ where: { id: target.id }, select: { teacherId: true } });
  if (!tUser?.teacherId) return false;
  const related = await teacherUserIdsOfClassIds(childClassIds);
  return related.includes(target.id);
}

/**
 * بررسی نهایی مجاز بودن پیام مستقیم — همیشه قبل از ثبت روی سرور اجرا می‌شود.
 * ترتیب: فعال‌بودن، سیاست نقش/کاربر، مسدودسازی فردی، اجازهٔ ویژه، رابطهٔ واقعی.
 */
export async function canMessageUser(
  me: CommUserCtx,
  perms: CommPerms,
  targetId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (targetId === me.id) return { ok: false, reason: 'نمی‌توانید به خودتان پیام بدهید' };
  if (!perms.enabled) return { ok: false, reason: 'پیام‌رسانی برای شما غیرفعال است', };
  if (!perms.direct) return { ok: false, reason: 'ارسال پیام خصوصی برای شما غیرفعال است' };
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: {
      id: true, active: true, role: true, teacherId: true, studentId: true,
      studentProfile: { select: { classId: true } },
    },
  }) as TargetInfo | null;
  if (!target || !target.active) return { ok: false, reason: 'کاربر گیرنده یافت نشد' };

  const isAdmin = me.role === 'ADMIN';
  const targetPolicy = await permsFor({ id: target.id, name: '', role: target.role, teacherId: target.teacherId, studentId: null });
  if (!targetPolicy.enabled && !isAdmin) {
    return { ok: false, reason: 'دریافت پیام برای این کاربر توسط مدیر غیرفعال شده است' };
  }
  // مسدودسازی فردی — برای مدیر اعمال نمی‌شود تا کنترل کامل بماند
  if (!isAdmin && perms.blockedPeers.includes(targetId)) {
    return { ok: false, reason: 'ارسال پیام به این شخص برای شما مسدود شده است' };
  }
  // اجازهٔ ویژهٔ فردی — مدیر صریحاً اجازه داده
  if (perms.extraPeers.includes(targetId)) return { ok: true };

  if (!roleAllowed(perms, target.role)) {
    return { ok: false, reason: 'ارسال پیام به این نقش برای شما مجاز نیست' };
  }

  switch (me.role) {
    case 'ADMIN':
      return { ok: true };
    case 'HEADTEACHER':
      return { ok: true };
    case 'TEACHER': {
      if (['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(target.role)) return { ok: true };
      if (perms.relaxParentScope && ['GUARDIAN', 'STUDENT'].includes(target.role)) return { ok: true };
      const related = await teacherRelatesTo(me, target);
      if (related) return { ok: true };
      return { ok: false, reason: 'این والد/شاگرد در صنف‌های تحت مسئولیت شما نیست — اجازهٔ ویژه از مدیر لازم است' };
    }
    case 'GUARDIAN': {
      if (['ADMIN', 'HEADTEACHER'].includes(target.role)) return { ok: true };
      if (perms.relaxTeacherScope && target.role === 'TEACHER') return { ok: true };
      const related = await guardianRelatesToTeacher(me, target);
      if (related) return { ok: true };
      return { ok: false, reason: 'این معلم با صنف فرزند ثبت‌شدهٔ شما ارتباط ندارد — اجازهٔ ویژه از مدیر لازم است' };
    }
    case 'STUDENT': {
      if (['ADMIN', 'HEADTEACHER'].includes(target.role)) return { ok: true };
      if (target.role === 'TEACHER') {
        const myClass = (await db.student.findUnique({ where: { id: me.studentId || '' }, select: { classId: true } }))?.classId;
        if (myClass) {
          const related = await teacherUserIdsOfClassIds([myClass]);
          if (related.includes(target.id)) return { ok: true };
        }
      }
      return { ok: false, reason: 'فقط می‌توانید با مدیریت مکتب و معلمان صنف خود پیام ردوبدل کنید' };
    }
    default:
      // STAFF / LIBRARIAN — فقط مطابق نقش‌های مجاز سیاست
      return { ok: true };
  }
}

/* ─────────────── مهاجرت پیام‌های قدیمی ─────────────── */

/**
 * پیام‌های قبل از این نسخه گیرندهٔ ثبت‌شده ندارند — بار نخست، گیرندگان واقعی
 * همان پیام‌های موجود ساخته می‌شود (بدون اطلاع مجدد) تا صندوق‌ها و گزارش‌ها سالم بمانند.
 */
export async function ensureMessagesMigrated(): Promise<void> {
  try {
    const flag = await db.setting.findUnique({ where: { key: MIGRATED_KEY } });
    if (flag?.value === '1') return;
    const messages = await db.message.findMany({ where: { recipients: { none: {} } } });
    for (const m of messages) {
      let ids: string[] = [];
      if (m.toUserId) {
        ids = [m.toUserId];
      } else if (m.toClassId) {
        ids = m.toRole === 'STUDENT'
          ? await studentUserIdsOfClassIds([m.toClassId])
          : await guardianUserIdsOfClassIds([m.toClassId]);
      } else if (m.toRole) {
        const where = m.toRole === 'ALL'
          ? { active: true }
          : { active: true, role: m.toRole };
        const users = await db.user.findMany({ where, select: { id: true } });
        ids = users.map((u) => u.id);
      }
      let deletedList: string[] = [];
      try { deletedList = m.deletedFor ? (JSON.parse(m.deletedFor) as string[]) : []; } catch { /* ignore */ }
      if (ids.length) {
        // ایجاد ردیف‌به‌ردیف — تکراری (در صورت اجرای دوباره) بی‌صدا رد می‌شود
        for (const uid of ids) {
          try {
            await db.messageRecipient.create({
              data: {
                messageId: m.id, userId: uid,
                read: m.toUserId === uid ? m.read : false,
                deleted: deletedList.includes(uid),
              },
            });
          } catch { /* تکراری */ }
        }
      }
    }
    await db.setting.upsert({
      where: { key: MIGRATED_KEY },
      update: { value: '1' },
      create: { key: MIGRATED_KEY, value: '1' },
    });
  } catch {
    /* مهاجرت نباید خواندن پیام‌ها را بشکند — دفعهٔ بعد تلاش می‌شود */
  }
}

/* ─────────────── نگهبان‌های مشترک ─────────────── */

export function assertTargetShape(t: unknown): MsgTarget {
  if (!t || typeof t !== 'object') throw new ApiError('گیرندهٔ پیام نامعتبر است');
  const o = t as Record<string, unknown>;
  const kind = String(o.kind || '');
  if (!['all', 'roles', 'classes', 'users'].includes(kind)) throw new ApiError('نوع گیرنده نامعتبر است');
  return {
    kind: kind as MsgTarget['kind'],
    roles: Array.isArray(o.roles) ? o.roles.map(String).slice(0, 12) : [],
    classIds: Array.isArray(o.classIds) ? o.classIds.map(String).slice(0, 30) : [],
    audience: ['guardians', 'students', 'teachers', 'classAll'].includes(String(o.audience))
      ? (String(o.audience) as MsgTarget['audience']) : 'classAll',
    userIds: Array.isArray(o.userIds) ? o.userIds.map(String).slice(0, 300) : [],
  };
}

/**
 * گارد محدودهٔ صنف — معلم فقط به صنف‌های تحت مسئولیت خود (تدریس/نگرانی) پیام صنفی می‌دهد.
 * با فعال‌بودن «رفع محدودیت والدین» از پنل مدیر، محدوده گسترش می‌یابد.
 */
export async function assertClassScope(me: CommUserCtx, perms: CommPerms, targets: MsgTarget[]) {
  for (const t of targets) {
    if (t.kind !== 'classes') continue;
    if (!['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(me.role)) {
      throw new ApiError('ارسال پیام صنفی فقط برای مدیریت و معلمان ممکن است', 403);
    }
    if (me.role === 'ADMIN' || me.role === 'HEADTEACHER') continue;
    if (perms.relaxParentScope) continue;
    const classIds = t.classIds || [];
    if (!classIds.length) continue;
    const scope = await teacherScopeClassIds(me);
    const outside = classIds.filter((c) => !scope.includes(c));
    if (outside.length) {
      throw new ApiError('صنف انتخاب‌شده خارج از صنف‌های تحت مسئولیت شماست — اجازهٔ ویژه از مدیر لازم است', 403);
    }
  }
}

/** آیا سیاست اجازهٔ این نوع ارسال را می‌دهد؟ */
export function assertKindAllowed(perms: CommPerms, targets: MsgTarget[], isAnnounce: boolean) {
  if (!perms.enabled) throw new ApiError('پیام‌رسانی برای شما غیرفعال است', 403);
  for (const t of targets) {
    if (t.kind === 'all' && !perms.allUsers) {
      throw new ApiError('ارسال پیام به تمام کاربران برای شما غیرفعال است', 403);
    }
    if (t.kind === 'roles') {
      for (const r of t.roles || []) {
        // پخش سراسری به والدین/شاگردان/همهٔ مدرسه فقط برای کسی است که اجازهٔ سراسری دارد
        if (['GUARDIAN', 'STUDENT', 'ALL'].includes(r) && !perms.allUsers) {
          throw new ApiError('پیام سراسری به والدین/شاگردان تنها با اجازهٔ سراسری مدیر ممکن است — برای صنف مشخص از گزینهٔ «صنف‌ها» استفاده کنید', 403);
        }
        if (r !== 'ALL' && !roleAllowed(perms, r)) {
          throw new ApiError('ارسال پیام به این نقش برای شما مجاز نیست', 403);
        }
      }
    }
    if (t.kind === 'classes' && !perms.group) {
      throw new ApiError('ارسال پیام گروهی برای شما غیرفعال است', 403);
    }
  }
  const anyUsers = targets.some((t) => t.kind === 'users');
  const multi = targets.length > 1 || targets.some((t) =>
    (t.kind === 'users' && (t.userIds?.length || 0) > 1) ||
    (t.kind === 'roles' && (t.roles?.length || 0) > 1) ||
    (t.kind === 'classes' && (t.classIds?.length || 0) > 1));
  if (anyUsers && !perms.direct) throw new ApiError('ارسال پیام خصوصی برای شما غیرفعال است', 403);
  if (multi && !perms.group && anyUsers) throw new ApiError('ارسال پیام گروهی برای شما غیرفعال است', 403);
  if (isAnnounce && !perms.announce && targets.some((t) => t.kind === 'all' || t.kind === 'roles')) {
    // اطلاعیهٔ عمومی/سراسری — پیام صنفی (targets صنف) با گارد محدودهٔ صنف کنترل می‌شود
    throw new ApiError('ایجاد اطلاعیهٔ عمومی برای شما غیرفعال است', 403);
  }
}
