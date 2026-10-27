import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError, type AuthUser } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { sectionAllowed } from '@/lib/access';
import { teacherClassIds } from '@/lib/teacher-scope';
import {
  type MsgTarget, type ResolvedRecipient,
  assertTargetShape, assertKindAllowed, assertClassScope, canMessageUser, ensureMessagesMigrated,
  guardianChildClassIds, guardianUserIdsOfClassIds, permsFor, resolveRecipients,
  studentUserIdsOfClassIds, teacherScopeClassIds, teacherUserIdsOfClassIds, logAudit,
} from '@/lib/comm-server';
import { EDIT_WINDOW_MS, MAX_ATTACH_DATAURL, CATEGORIES_SAFE } from '@/lib/comm';

/**
 * پلتفرم یکپارچهٔ ارتباطات — نسخهٔ ۲.۳
 *  • گیرندگان واقعی هر پیام در جدول MessageRecipient ثبت می‌شود (رسید خواندن فردی، گزارش، بدون تکرار)
 *  • صلاحیت‌ها از سیاست ارتباطی (پنل مدیر) + روابط واقعی صنف‌ها و فرزندان تعیین می‌شود
 *  • هر تصمیم امنیتی سمت سرور گرفته می‌شود — دورزدن رابط کاربری بی‌اثر است
 */

const CONTACT_SELECT = { id: true, name: true, role: true } as const;
type Contact = { id: string; name: string; role: string; reason: string; classLabel?: string | null; subjectName?: string | null };

interface AttachJson { name: string; type: string; data: string }

function parseAttachment(raw: unknown): AttachJson | null {
  if (raw == null || raw === '') return null;
  try {
    const o = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
    const name = String(o.name || '').slice(0, 120);
    const type = String(o.type || '').slice(0, 80);
    const data = String(o.data || '');
    if (!data || !data.startsWith('data:')) throw new Error('bad');
    if (data.length > MAX_ATTACH_DATAURL) throw new Error('size');
    return { name: name || 'پیوست', type, data };
  } catch (e) {
    if (e instanceof Error && e.message === 'size') throw new ApiError('حجم پیوست بیش از حد مجاز است (حداکثر ۳۵۰ کیلوبایت)');
    throw new ApiError('پیوست نامعتبر است');
  }
}

/** برچسب گیرندگان برای فهرست «ارسال‌شده» */
function recipientsLabel(list: ResolvedRecipient[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].name;
  const names = list.slice(0, 3).map((r) => r.name).join('، ');
  return `${list.length} گیرنده — ${names}${list.length > 3 ? ' و …' : ''}`;
}

function notifyTitle(kind: string, priority: string, category: string, fromName: string): string {
  if (priority === 'URGENT') return `اطلاعیهٔ فوری از ${fromName}`;
  if (category === 'ANNOUNCEMENT' && kind === 'BROADCAST') return `اطلاعیه از ${fromName}`;
  return `پیام جدید از ${fromName}`;
}

function notifyBody(subject: string | null, text: string): string {
  const raw = subject ? `${subject} — ${text}` : text;
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

/** فهرست مخاطبان مجاز — بر اساس سیاست + روابط واقعی آموزشی */
async function listContacts(me: AuthUser): Promise<Contact[]> {
  const perms = await permsFor(me);
  const reasonOf = (role: string): string =>
    ({ ADMIN: 'مدیریت مکتب', HEADTEACHER: 'مدیریت مکتب', TEACHER: 'همکار', GUARDIAN: 'والد', STUDENT: 'شاگرد', STAFF: 'کارمند', LIBRARIAN: 'کتابخانه' } as Record<string, string>)[role] || 'کاربر';

  if (me.role === 'ADMIN') {
    const users = await db.user.findMany({
      where: { active: true, id: { not: me.id } },
      select: { ...CONTACT_SELECT, studentProfile: { select: { classId: true, class: { select: { name: true } } } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id, name: u.name, role: u.role, reason: reasonOf(u.role),
      classLabel: u.studentProfile?.class?.name || null,
    }));
  }

  if (['HEADTEACHER', 'STAFF', 'LIBRARIAN'].includes(me.role)) {
    const users = await db.user.findMany({
      where: { active: true, role: { in: perms.toRoles.includes('*') ? ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'] : perms.toRoles }, id: { not: me.id } },
      select: CONTACT_SELECT,
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ id: u.id, name: u.name, role: u.role, reason: reasonOf(u.role) }));
  }

  if (me.role === 'TEACHER') {
    const scope = await teacherScopeClassIds(me);
    const collect = async (classIds: string[]): Promise<Contact[]> => {
      if (!classIds.length) return [];
      const [gIds, sIds] = await Promise.all([
        guardianUserIdsOfClassIds(classIds),
        studentUserIdsOfClassIds(classIds),
      ]);
      const all = [...new Set([...gIds, ...sIds])];
      if (!all.length) return [];
      const users = await db.user.findMany({
        where: { id: { in: all }, active: true },
        select: { id: true, name: true, role: true, studentProfile: { select: { class: { select: { name: true } } } } },
        orderBy: { name: 'asc' },
      });
      return users.map((u) => ({
        id: u.id, name: u.name, role: u.role,
        reason: u.role === 'GUARDIAN' ? 'والدین صنف من' : 'شاگردان صنف من',
        classLabel: u.studentProfile?.class?.name || null,
      }));
    };
    const [mgmt, colleagues, scopeContacts, relaxed] = await Promise.all([
      db.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'HEADTEACHER'] } }, select: CONTACT_SELECT }),
      db.user.findMany({ where: { active: true, role: 'TEACHER', id: { not: me.id } }, select: CONTACT_SELECT }),
      collect(scope),
      perms.relaxParentScope
        ? db.user.findMany({
            where: { active: true, role: { in: ['GUARDIAN', 'STUDENT'] }, id: { not: me.id } },
            select: { id: true, name: true, role: true, studentProfile: { select: { class: { select: { name: true } } } } },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; role: string; studentProfile: { class: { name: string } } | null }>),
    ]);
    const extra = perms.extraPeers.length
      ? await db.user.findMany({
          where: { id: { in: perms.extraPeers }, active: true },
          select: { id: true, name: true, role: true, studentProfile: { select: { class: { select: { name: true } } } } },
        })
      : [];
    const map = new Map<string, Contact>();
    for (const u of mgmt) map.set(u.id, { ...u, reason: 'مدیریت مکتب' });
    for (const u of colleagues) map.set(u.id, { ...u, reason: 'همکار' });
    for (const u of scopeContacts) map.set(u.id, u);
    for (const u of relaxed) map.set(u.id, { id: u.id, name: u.name, role: u.role, reason: 'مجاز شده توسط مدیر', classLabel: u.studentProfile?.class?.name || null });
    for (const u of extra) map.set(u.id, { id: u.id, name: u.name, role: u.role, reason: 'اجازهٔ ویژهٔ مدیر', classLabel: u.studentProfile?.class?.name || null });
    return [...map.values()];
  }

  if (me.role === 'GUARDIAN') {
    const childClassIds = await guardianChildClassIds(me);
    const collect = async (): Promise<Contact[]> => {
      if (!childClassIds.length) return [];
      const [classes, cs] = await Promise.all([
        db.class.findMany({
          where: { id: { in: childClassIds } },
          select: { id: true, name: true, supervisor: { select: { user: { select: { id: true, name: true, role: true } } } }, actingSupervisor: { select: { user: { select: { id: true, name: true, role: true } } } } },
        }),
        db.classSubject.findMany({
          where: { classId: { in: childClassIds }, teacherId: { not: null } },
          select: { classId: true, subject: { select: { name: true } }, teacher: { select: { user: { select: { id: true, name: true, role: true } } } } },
        }),
      ]);
      const out = new Map<string, Contact>();
      for (const c of classes) {
        const sup = c.supervisor?.user || c.actingSupervisor?.user;
        if (sup && sup.id !== me.id) {
          out.set(sup.id, { id: sup.id, name: sup.name, role: sup.role, reason: `نگران صنف فرزند شما (${c.name})`, classLabel: c.name });
        }
      }
      for (const x of cs) {
        const t = x.teacher?.user;
        if (t && t.id !== me.id && !out.has(t.id)) {
          const cls = classes.find((c) => c.id === x.classId);
          out.set(t.id, { id: t.id, name: t.name, role: t.role, reason: `معلم ${x.subject.name} فرزند شما`, classLabel: cls?.name || null, subjectName: x.subject.name });
        }
      }
      return [...out.values()];
    };
    const [mgmt, related, relaxed] = await Promise.all([
      db.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'HEADTEACHER'] } }, select: CONTACT_SELECT }),
      collect(),
      perms.relaxTeacherScope
        ? db.user.findMany({ where: { active: true, role: 'TEACHER' }, select: CONTACT_SELECT, orderBy: { name: 'asc' } })
        : Promise.resolve([] as Contact[]),
    ]);
    const extra = perms.extraPeers.length
      ? await db.user.findMany({ where: { id: { in: perms.extraPeers }, active: true }, select: CONTACT_SELECT })
      : [];
    const map = new Map<string, Contact>();
    for (const u of mgmt) map.set(u.id, { ...u, reason: 'مدیریت مکتب' });
    for (const u of related) map.set(u.id, u);
    for (const u of relaxed) map.set(u.id, { ...u, reason: 'مجاز شده توسط مدیر' });
    for (const u of extra) map.set(u.id, { ...u, reason: 'اجازهٔ ویژهٔ مدیر' });
    return [...map.values()];
  }

  // STUDENT
  const myClass = me.studentId
    ? (await db.student.findUnique({ where: { id: me.studentId }, select: { classId: true } }))?.classId
    : null;
  const [mgmt, related] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'HEADTEACHER'] } }, select: CONTACT_SELECT }),
    myClass ? (async (): Promise<Contact[]> => {
      const tIds = await teacherUserIdsOfClassIds([myClass]);
      if (!tIds.length) return [];
      const users = await db.user.findMany({ where: { id: { in: tIds }, active: true }, select: CONTACT_SELECT, orderBy: { name: 'asc' } });
      return users.map((u) => ({ ...u, reason: 'معلمان صنف من' }));
    })() : Promise.resolve([] as Contact[]),
  ]);
  const map = new Map<string, Contact>();
  for (const u of mgmt) map.set(u.id, { ...u, reason: 'مدیریت مکتب' });
  for (const u of related) map.set(u.id, u);
  if (perms.extraPeers.length) {
    const extra = await db.user.findMany({ where: { id: { in: perms.extraPeers }, active: true }, select: CONTACT_SELECT });
    for (const u of extra) map.set(u.id, { ...u, reason: 'اجازهٔ ویژهٔ مدیر' });
  }
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!sectionAllowed(me, 'messages')) throw new ApiError('دسترسی پیام‌ها برای شما توسط مدیر غیرفعال شده است', 403);
    await ensureMessagesMigrated();

    // ── یک پیام مشخص (برای مشاهدهٔ کامل و دانلود پیوست) ──
    const singleId = new NextRequest(req.url).nextUrl.searchParams.get('id');
    if (singleId) {
      const msg = await db.message.findUnique({
        where: { id: singleId },
        include: {
          fromUser: { select: { id: true, name: true, role: true } },
          recipients: { include: { user: { select: { id: true, name: true, role: true } } } },
        },
      });
      if (!msg) throw new ApiError('پیام یافت نشد');
      const isSender = msg.fromUserId === me.id;
      const myRow = msg.recipients.find((r) => r.userId === me.id);
      const myStudentClass = me.studentId
        ? (await db.student.findUnique({ where: { id: me.studentId }, select: { classId: true } }))?.classId
        : null;
      const legacyVisible = msg.toUserId === me.id || msg.toRole === 'ALL' || (msg.toRole || '').split(',').includes(me.role) ||
        Boolean(msg.toClassId && myStudentClass && msg.toClassId === myStudentClass);
      if (!isSender && !myRow && !legacyVisible) throw new ApiError('این پیام در صندوق شما نیست', 403);
      let attachment: AttachJson | null = null;
      if (msg.attachment) {
        try { attachment = JSON.parse(msg.attachment) as AttachJson; } catch { attachment = null; }
      }
      return NextResponse.json({
        id: msg.id,
        subject: msg.subject,
        body: msg.body,
        category: msg.category,
        kind: msg.kind,
        priority: msg.priority,
        createdAt: msg.createdAt,
        editedAt: msg.editedAt,
        from: { id: msg.fromUser.id, name: msg.fromUser.name, role: msg.fromUser.role },
        attachment,
        recipients: isSender ? msg.recipients.map((r) => ({ id: r.userId, name: r.user.name, role: r.user.role, read: r.read, readAt: r.readAt })) : undefined,
      });
    }

    const perms = await permsFor(me);

    const [inboxRows, sentRows, contacts, classList] = await Promise.all([
      db.messageRecipient.findMany({
        where: { userId: me.id, deleted: false },
        include: { message: { include: { fromUser: { select: { id: true, name: true, role: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      db.message.findMany({
        where: { fromUserId: me.id },
        include: { recipients: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      listContacts(me),
      ['ADMIN', 'HEADTEACHER'].includes(me.role)
        ? db.class.findMany({ orderBy: { grade: 'asc' }, select: { id: true, name: true } })
        : me.role === 'TEACHER'
          ? teacherClassIds(me.teacherId || '').then((ids) =>
              ids.length ? db.class.findMany({ where: { id: { in: ids } }, orderBy: { grade: 'asc' }, select: { id: true, name: true } }) : [],
            )
          : me.role === 'GUARDIAN'
            ? guardianChildClassIds(me).then((ids) =>
                ids.length ? db.class.findMany({ where: { id: { in: ids } }, orderBy: { grade: 'asc' }, select: { id: true, name: true } }) : [],
              )
            : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    // پیام‌هایی که خودم (به‌عنوان فرستنده) حذف کرده‌ام از «ارسال‌شده» پنهان می‌شود
    const hiddenBy = (m: { deletedFor: string | null }): boolean => {
      if (!m.deletedFor) return false;
      try { return (JSON.parse(m.deletedFor) as string[]).includes(me.id); } catch { return false; }
    };

    const inbox = inboxRows.map((r) => ({
      id: r.message.id,
      subject: r.message.subject,
      body: r.message.body,
      category: r.message.category,
      kind: r.message.kind,
      priority: r.message.priority,
      attachmentName: r.message.attachment ? ((JSON.parse(r.message.attachment) as AttachJson).name ?? null) : null,
      read: r.read,
      readAt: r.readAt,
      editedAt: r.message.editedAt,
      createdAt: r.message.createdAt,
      fromId: r.message.fromUser.id,
      fromName: r.message.fromUser.name,
      fromRole: r.message.fromUser.role,
      toRole: r.message.toRole,
      toClassId: r.message.toClassId,
    }));

    const classMap = new Map(classList.map((c) => [c.id, c.name]));
    for (const m of inbox) {
      (m as Record<string, unknown>).toClassLabel = m.toClassId ? classMap.get(m.toClassId) || null : null;
      // برچسب سازگار با نسخه‌های قبل — برای پیام‌های همگانی صندوق ورودی
      (m as Record<string, unknown>).toLabel = m.toClassId
        ? `والدین صنف ${classMap.get(m.toClassId) || ''}`.trim()
        : m.toRole === 'ALL' ? 'همگانی — همه'
        : m.toRole ? `همگانی — ${m.toRole}`
        : '';
    }

    const sent = sentRows.filter((m) => !hiddenBy(m)).map((m) => {
      let toLabel = '';
      if (m.toUserId) toLabel = m.recipients.find((r) => r.userId === m.toUserId)?.user.name || 'کاربر';
      else if (m.toClassId) toLabel = recipientsLabel(m.recipients.map((r) => ({ id: r.userId, name: r.user.name, role: '' })));
      else if (m.toRole === 'ALL') toLabel = 'همگانی — همه';
      else if (m.toRole) toLabel = `همگانی — ${m.toRole}`;
      else toLabel = recipientsLabel(m.recipients.map((r) => ({ id: r.userId, name: r.user.name, role: '' })));
      const readCount = m.recipients.filter((r) => r.read).length;
      return {
        id: m.id,
        subject: m.subject,
        body: m.body,
        category: m.category,
        kind: m.kind,
        priority: m.priority,
        attachmentName: m.attachment ? ((JSON.parse(m.attachment) as AttachJson).name ?? null) : null,
        readCount,
        totalCount: m.recipients.length,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        toLabel,
        recipientIds: m.recipients.map((r) => r.userId),
      };
    });

    const unread = inbox.filter((m) => !m.read).length;

    return NextResponse.json({
      inbox,
      sent,
      unread,
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, reason: c.reason, classLabel: c.classLabel ?? null, subjectName: c.subjectName ?? null })),
      classes: classList,
      myPerms: perms,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** ساخت اعلان برای همهٔ گیرندگان — زنگ بالای صفحه و اعلان کوتاه */
async function notifyRecipients(fromName: string, recipients: ResolvedRecipient[], kind: string, priority: string, category: string, subject: string | null, text: string) {
  if (!recipients.length) return;
  try {
    await db.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: notifyTitle(kind, priority, category, fromName),
        body: notifyBody(subject, text),
        type: priority === 'URGENT' ? 'WARNING' : 'INFO',
      })),
    });
  } catch {
    /* اعلان حتماً نباید ارسال پیام را بشکند */
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!sectionAllowed(me, 'messages')) throw new ApiError('دسترسی پیام‌ها برای شما توسط مدیر غیرفعال شده است', 403);
    const body = await req.json();
    const text = str(body.body);
    if (!text) throw new ApiError('متن پیام لازم است');
    if (text.length > 8000) throw new ApiError('متن پیام بیش از حد طولانی است');
    const subject = str(body.subject).slice(0, 160) || null;
    const category = (CATEGORIES_SAFE as readonly string[]).includes(str(body.category)) ? str(body.category) : 'GENERAL';
    const perms = await permsFor(me);

    // ── پیوست (در صورت فعال بودن از پنل مدیر) ──
    const attach = parseAttachment(body.attachment ?? body.attach);
    if (attach && !perms.attach) throw new ApiError('ارسال فایل و تصویر برای شما غیرفعال است', 403);
    const urgent = body.urgent === true;
    if (urgent && !perms.urgent) throw new ApiError('قابلیت پیام فوری برای شما غیرفعال است', 403);

    // ── حل گیرندگان — پشتیبانی از فرمت قدیمی (سازگاری صف آفلاین) و فرمت جدید ──
    let targets: MsgTarget[] = [];
    if (Array.isArray(body.targets) && body.targets.length) {
      targets = (body.targets as unknown[]).slice(0, 8).map(assertTargetShape);
    } else {
      const toUserId = str(body.toUserId);
      const toRole = str(body.toRole);
      const toClassId = str(body.toClassId);
      if (toUserId) targets = [{ kind: 'users', userIds: [toUserId] }];
      else if (toClassId) targets = [{ kind: 'classes', classIds: [toClassId], audience: toRole === 'STUDENT' ? 'students' : 'guardians' }];
      else if (toRole) targets = [{ kind: 'roles', roles: [toRole] }];
    }
    if (!targets.length) throw new ApiError('گیرندهٔ پیام لازم است');

    assertKindAllowed(perms, targets, category === 'ANNOUNCEMENT');
    await assertClassScope(meCtx(me), perms, targets);

    const { recipients, breakdown } = await resolveRecipients(meCtx(me), targets);
    if (!recipients.length) throw new ApiError('هیچ گیرنده‌ای یافت نشد — گیرندگان را بررسی کنید');

    // پیام به اشخاص مشخص: برای هر نفر رابطه و صلاحیت بررسی می‌شود (امنیت واقعی)
    if (targets.some((t) => t.kind === 'users')) {
      for (const r of recipients) {
        const verdict = await canMessageUser(me, perms, r.id);
        if (!verdict.ok) throw new ApiError(`ارسال به ${r.name}: ${verdict.reason || 'مجاز نیست'}`, 403);
      }
    }

    const isDirect = targets.every((t) => t.kind === 'users') && targets.length === 1 && (targets[0].userIds?.length || 0) === 1;
    const kind = isDirect ? 'DIRECT' : targets.every((t) => t.kind !== 'users') ? 'BROADCAST' : 'GROUP';

    const created = await db.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          fromUserId: me.id,
          toUserId: isDirect ? recipients[0].id : null,
          toRole: kind === 'BROADCAST' && targets[0].kind === 'roles' ? (targets[0].roles || []).join(',') || 'ALL' : null,
          toClassId: kind === 'BROADCAST' && targets[0].kind === 'classes' && (targets[0].classIds || []).length === 1 ? targets[0].classIds![0] : null,
          subject, body: text, category,
          kind, priority: urgent ? 'URGENT' : 'NORMAL',
          attachment: attach ? JSON.stringify(attach) : null,
        },
      });
      await tx.messageRecipient.createMany({
        data: recipients.map((r) => ({ messageId: msg.id, userId: r.id })),
      });
      return msg;
    });

    await notifyRecipients(me.name, recipients, kind, urgent ? 'URGENT' : 'NORMAL', category, subject, text);

    return NextResponse.json({
      id: created.id,
      recipientCount: recipients.length,
      breakdown,
      kindLabel: kind === 'DIRECT' ? 'خصوصی' : kind === 'GROUP' ? 'گروهی' : 'همگانی',
    });
  } catch (e) {
    return handleApiError(e);
  }
}

function meCtx(me: AuthUser) {
  return { id: me.id, name: me.name, role: me.role, teacherId: me.teacherId, studentId: me.studentId };
}

/**
 * علامت‌گذاری «خوانده‌شده» (تکی/همه) و ویرایش پیام خود
 */
export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!sectionAllowed(me, 'messages')) throw new ApiError('دسترسی پیام‌ها برای شما توسط مدیر غیرفعال شده است', 403);
    const body = await req.json();

    if (body.all === true) {
      await db.messageRecipient.updateMany({
        where: { userId: me.id, deleted: false, read: false },
        data: { read: true, readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ پیام لازم است');
    const msg = await db.message.findUnique({ where: { id }, include: { recipients: true } });
    if (!msg) throw new ApiError('پیام یافت نشد');

    // ── ویرایش پیام خود — فقط فرستنده، در پنجرهٔ زمانی، تا وقتی خوانده نشده ──
    if (body.edit === true) {
      const perms = await permsFor(me);
      if (msg.fromUserId !== me.id) throw new ApiError('فقط پیام خود قابل ویرایش است', 403);
      if (!perms.editOwn) throw new ApiError('ویرایش پیام برای شما غیرفعال است', 403);
      if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) {
        throw new ApiError('مهلت ویرایش (۳۰ دقیقه) گذشته است');
      }
      if (msg.recipients.some((r) => r.read)) throw new ApiError('پیام خوانده شده و دیگر قابل ویرایش نیست');
      const newText = str(body.body);
      if (!newText) throw new ApiError('متن پیام لازم است');
      await db.message.update({
        where: { id },
        data: {
          body: newText,
          subject: str(body.subject).slice(0, 160) || null,
          category: (CATEGORIES_SAFE as readonly string[]).includes(str(body.category)) ? str(body.category) : msg.category,
          editedAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ── علامت‌گذاری خوانده‌شده ──
    const row = msg.recipients.find((r) => r.userId === me.id);
    if (row) {
      if (!row.read) {
        await db.messageRecipient.update({ where: { id: row.id }, data: { read: true, readAt: new Date() } });
      }
      return NextResponse.json({ ok: true });
    }
    // سازگاری با پیام‌های مستقیم بسیار قدیمی بدون ردیف گیرنده
    if (msg.toUserId === me.id) {
      await db.message.update({ where: { id }, data: { read: true } });
      return NextResponse.json({ ok: true });
    }
    throw new ApiError('این پیام در صندوق شما نیست', 403);
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * حذف پیام:
 *  • گیرنده → حذف برای خودم (deleted)
 *  • فرستنده (با صلاحیت deleteOwn) → حذف کامل برای همه (فراخوانی)
 *  • مدیر با صلاحیت moderate → حذف کامل پیام نامناسب دیگران (ثبت در گزارش فعالیت)
 */
export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!sectionAllowed(me, 'messages')) throw new ApiError('دسترسی پیام‌ها برای شما توسط مدیر غیرفعال شده است', 403);
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ پیام لازم است');
    const msg = await db.message.findUnique({ where: { id }, include: { recipients: true } });
    if (!msg) throw new ApiError('پیام یافت نشد');

    const perms = await permsFor(me);
    const myRow = msg.recipients.find((r) => r.userId === me.id);

    // مدیر — مودریشن پیام نامناسب دیگران
    if (msg.fromUserId !== me.id && perms.moderate) {
      await db.message.delete({ where: { id } });
      await logAudit(me, 'MSG_MODERATE_DELETE', { messageId: id, fromUserId: msg.fromUserId, subject: msg.subject });
      return NextResponse.json({ ok: true, hard: true, moderated: true });
    }

    // فرستنده — حذف کامل پیام خود (فراخوانی برای همهٔ گیرندگان)
    if (msg.fromUserId === me.id) {
      if (!perms.deleteOwn) throw new ApiError('حذف پیام برای شما غیرفعال است', 403);
      await db.message.delete({ where: { id } });
      return NextResponse.json({ ok: true, hard: true });
    }

    // گیرنده — حذف فقط برای من
    if (myRow) {
      await db.messageRecipient.update({ where: { id: myRow.id }, data: { deleted: true } });
      return NextResponse.json({ ok: true, hard: false });
    }

    // سازگاری پیام‌های قدیمی همگانی بدون ردیف گیرنده
    let myChildClassIds: string[] = [];
    if (me.studentId) {
      const s = await db.student.findUnique({ where: { id: me.studentId }, select: { classId: true } });
      if (s?.classId) myChildClassIds = [s.classId];
    }
    const legacyInbox = msg.toUserId === me.id || msg.toRole === 'ALL' || (msg.toRole || '').split(',').includes(me.role) ||
      Boolean(msg.toClassId && myChildClassIds.includes(msg.toClassId));
    if (legacyInbox) {
      let list: string[] = [];
      try { list = msg.deletedFor ? (JSON.parse(msg.deletedFor) as string[]) : []; } catch { list = []; }
      if (!list.includes(me.id)) list.push(me.id);
      await db.message.update({ where: { id }, data: { deletedFor: JSON.stringify(list) } });
      return NextResponse.json({ ok: true, hard: false });
    }

    throw new ApiError('این پیام در صندوق شما نیست', 403);
  } catch (e) {
    return handleApiError(e);
  }
}
