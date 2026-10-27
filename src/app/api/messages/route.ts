import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { teacherClassIds } from '@/lib/teacher-scope';

/**
 * پلتفرم یکپارچهٔ ارتباطات — پیام مستقیم و اعلان همگانی
 *  • همهٔ کاربران واردشده صندوق خود را دارند
 *  • مدیر/سرمعلم: همگانی به نقش‌ها و والدین صنف‌ها
 *  • معلم: مدیران، همکاران و والد/شاگردِ صنف‌های تحت اختیار خود
 *  • شاگرد/والد: مدیر، سرمعلم و معلمان
 * دسته‌ها: GENERAL | ACADEMIC | DISCIPLINARY | ANNOUNCEMENT
 */

const CATEGORIES = ['GENERAL', 'ACADEMIC', 'DISCIPLINARY', 'ANNOUNCEMENT'];
const CONTACT_SELECT = { id: true, name: true, role: true };

/** متن اعلان پیام — کوتاه‌شده تا در پوپآپ و زنگ اعلان جا شود */
function notifyBody(subject: string | null, text: string): string {
  const raw = subject ? `${subject} — ${text}` : text;
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

/**
 * پس از ثبت پیام، اعلان برای گیرنده‌ها ساخته می‌شود تا:
 *  ۱) زنگ اعلان بالای صفحه با تعداد نخوانده روشن شود
 *  ۲) اپ هنگام رسیدن پیام اعلان کوتاه نشان دهد
 */
async function createMessageNotifications(
  fromName: string,
  toUserId: string | null,
  toRole: string | null,
  toClassId: string | null,
  subject: string | null,
  text: string,
) {
  const title = `پیام جدید از ${fromName}`;
  const body = notifyBody(subject, text);
  try {
    if (toUserId) {
      await db.notification.createMany({ data: [{ userId: toUserId, title, body, type: 'INFO' }] });
      return;
    }
    if (toClassId) {
      // والدین (و شاگردان) آن صنف — مطابق گیرندگان واقعی پیام در GET
      const users = await db.user.findMany({
        where: { active: true, role: 'GUARDIAN', studentProfile: { classId: toClassId } },
        select: { id: true },
      });
      if (users.length) {
        await db.notification.createMany({
          data: users.map((u) => ({ userId: u.id, title, body, type: 'INFO' })),
        });
      }
      return;
    }
    if (toRole) {
      const users = await db.user.findMany({
        where: toRole === 'ALL' ? { active: true } : { active: true, role: toRole },
        select: { id: true },
      });
      if (users.length) {
        await db.notification.createMany({
          data: users.map((u) => ({ userId: u.id, title, body, type: 'INFO' })),
        });
      }
    }
  } catch {
    // اعلان حتماً نباید ارسال پیام را بشکند
  }
}

async function listContacts(me: { id: string; role: string; teacherId: string | null }) {
  if (me.role === 'ADMIN') {
    return db.user.findMany({
      where: { active: true, id: { not: me.id } },
      select: { ...CONTACT_SELECT, studentId: true, studentProfile: { select: { classId: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }
  if (['HEADTEACHER', 'STAFF', 'LIBRARIAN'].includes(me.role)) {
    return db.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'HEADTEACHER', 'TEACHER'] }, id: { not: me.id } },
      select: { ...CONTACT_SELECT, studentId: true, studentProfile: { select: { classId: true } } },
      orderBy: { name: 'asc' },
    });
  }
  if (me.role === 'TEACHER') {
    const scope = await teacherClassIds(me.teacherId || '');
    return db.user.findMany({
      where: {
        active: true,
        id: { not: me.id },
        OR: [
          { role: { in: ['ADMIN', 'HEADTEACHER', 'TEACHER'] } },
          { studentId: { not: null }, studentProfile: { classId: { in: scope.length ? scope : ['__none__'] } } },
        ],
      },
      select: { ...CONTACT_SELECT, studentId: true, studentProfile: { select: { classId: true } } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }
  // STUDENT / GUARDIAN
  return db.user.findMany({
    where: { active: true, role: { in: ['ADMIN', 'HEADTEACHER', 'TEACHER'] } },
    select: { ...CONTACT_SELECT, studentId: true, studentProfile: { select: { classId: true } } },
    orderBy: { name: 'asc' },
  });
}

/** آیا فرستنده اجازهٔ پیام مستقیم به این کاربر را دارد؟ */
async function canMessage(me: { id: string; role: string; teacherId: string | null }, targetId: string): Promise<boolean> {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, active: true, role: true, studentProfile: { select: { classId: true } } },
  });
  if (!target || !target.active) return false;
  if (me.role === 'ADMIN') return true;
  if (me.role === 'HEADTEACHER') return ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'].includes(target.role);
  if (me.role === 'TEACHER') {
    if (['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(target.role)) return true;
    if (['STUDENT', 'GUARDIAN'].includes(target.role) && target.studentProfile?.classId) {
      const scope = await teacherClassIds(me.teacherId || '');
      return scope.includes(target.studentProfile.classId);
    }
    return false;
  }
  // STUDENT / GUARDIAN / STAFF / LIBRARIAN
  return ['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(target.role);
}

export async function GET() {
  try {
    const me = await requireUser();
    const myStudent = me.studentId
      ? await db.student.findUnique({ where: { id: me.studentId }, select: { classId: true } })
      : null;

    const ors: Prisma.MessageWhereInput[] = [
      { toUserId: me.id },
      { toRole: { in: [me.role, 'ALL'] } },
    ];
    if (myStudent?.classId) {
      ors.push({ toClassId: myStudent.classId, toRole: { in: [me.role] } });
      ors.push({ toClassId: myStudent.classId, toRole: null });
    }
    const inboxWhere: Prisma.MessageWhereInput = { OR: ors };

    const [inboxRaw, sentRaw, contacts, classes] = await Promise.all([
      db.message.findMany({
        where: inboxWhere,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { fromUser: { select: { name: true, role: true } } },
      }),
      db.message.findMany({
        where: { fromUserId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      listContacts(me),
      ['ADMIN', 'HEADTEACHER'].includes(me.role)
        ? db.class.findMany({ orderBy: { grade: 'asc' }, select: { id: true, name: true } })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);

    // پیام‌هایی که خود کاربر حذف کرده از صندوق‌ها کنار می‌روند (حذف برای من — نه برای دیگران)
    const hiddenBy = (m: { deletedFor: string | null }): boolean => {
      if (!m.deletedFor) return false;
      try { return (JSON.parse(m.deletedFor) as string[]).includes(me.id); } catch { return false; }
    };
    const inboxList = inboxRaw.filter((m) => !hiddenBy(m));
    const sentList = sentRaw.filter((m) => !hiddenBy(m));

    // برچسب گیرنده برای پیام‌های ارسال‌شده
    const toUserIds = [...new Set(sentRaw.map((m) => m.toUserId).filter(Boolean))] as string[];
    const classIds = [...new Set(sentRaw.map((m) => m.toClassId).filter(Boolean))] as string[];
    const [toUsers, toClasses] = await Promise.all([
      toUserIds.length
        ? db.user.findMany({ where: { id: { in: toUserIds } }, select: { id: true, name: true, role: true } })
        : Promise.resolve([] as Array<{ id: string; name: string; role: string }>),
      classIds.length
        ? db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);
    const userMap = new Map<string, { name: string; role: string }>(toUsers.map((u) => [u.id, { name: u.name, role: u.role }]));
    const classMap = new Map<string, string>(toClasses.map((c) => [c.id, c.name]));

    const decorate = (m: (typeof sentRaw)[number] & { fromUser?: { name: string; role: string } | null }) => {
      let toLabel = '';
      if (m.toUserId) toLabel = userMap.get(m.toUserId)?.name || 'کاربر';
      else if (m.toClassId) toLabel = `والدین صنف ${classMap.get(m.toClassId) || ''}`.trim();
      else if (m.toRole === 'ALL') toLabel = 'همگانی — همه';
      else if (m.toRole) toLabel = `همگانی — ${m.toRole}`;
      return {
        id: m.id, subject: m.subject, body: m.body, category: m.category,
        read: m.read, createdAt: m.createdAt, toLabel,
        fromName: m.fromUser?.name || '', fromRole: m.fromUser?.role || '',
      };
    };

    const unread = inboxList.filter((m) => m.toUserId === me.id && !m.read).length;
    return NextResponse.json({
      inbox: inboxList.map(decorate),
      sent: sentList.map(decorate),
      unread,
      contacts: contacts.map((c) => ({ id: c.id, name: c.name, role: c.role })),
      classes,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const text = str(body.body);
    if (!text) throw new ApiError('متن پیام لازم است');
    const toUserId = str(body.toUserId);
    const toRole = str(body.toRole);
    const toClassId = str(body.toClassId);
    if (!toUserId && !toRole && !toClassId) throw new ApiError('گیرندهٔ پیام لازم است');
    const category = CATEGORIES.includes(str(body.category)) ? str(body.category) : 'GENERAL';

    if (toUserId) {
      if (toUserId === me.id) throw new ApiError('نمی‌توانید به خودتان پیام بدهید');
      const allowed = await canMessage(me, toUserId);
      if (!allowed) throw new ApiError('اجازهٔ ارسال پیام به این کاربر را ندارید', 403);
      const msg = await db.message.create({
        data: { fromUserId: me.id, toUserId, subject: str(body.subject) || null, body: text, category },
      });
      await createMessageNotifications(me.name, toUserId, null, null, msg.subject, text);
      return NextResponse.json({ id: msg.id });
    }

    // همگانی — فقط مدیر و سرمعلم
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) {
      throw new ApiError('پیام همگانی فقط توسط مدیر و سرمعلم امکان دارد', 403);
    }
    if (toClassId) {
      const cls = await db.class.findUnique({ where: { id: toClassId } });
      if (!cls) throw new ApiError('صنف یافت نشد');
      const role = toRole === 'STUDENT' ? 'STUDENT' : 'GUARDIAN';
      const msg = await db.message.create({
        data: { fromUserId: me.id, toClassId, toRole: role, subject: str(body.subject) || null, body: text, category: 'ANNOUNCEMENT' },
      });
      await createMessageNotifications(me.name, null, null, toClassId, msg.subject, text);
      return NextResponse.json({ id: msg.id });
    }
    if (toRole && !['ALL', 'ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'].includes(toRole)) {
      throw new ApiError('نقش گیرنده نامعتبر است');
    }
    const msg = await db.message.create({
      data: { fromUserId: me.id, toRole: toRole || 'ALL', subject: str(body.subject) || null, body: text, category },
    });
    await createMessageNotifications(me.name, null, toRole || 'ALL', null, msg.subject, text);
    return NextResponse.json({ id: msg.id });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * حذف پیام — هر کاربر پیام‌های صندوق خودش را می‌تواند حذف کند:
 *  • پیام مستقیمِ فرستاده‌شده توسط خودم → حذف کامل برای هر دو طرف
 *  • بقیه (دریافتی/همگانی) → حذف فقط برای من (deletedFor)
 */
export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser();
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ پیام لازم است');
    const msg = await db.message.findUnique({ where: { id } });
    if (!msg) throw new ApiError('پیام یافت نشد');

    const myStudent = me.studentId
      ? await db.student.findUnique({ where: { id: me.studentId }, select: { classId: true } })
      : null;
    const inMyInbox =
      msg.toUserId === me.id ||
      msg.toRole === 'ALL' ||
      msg.toRole === me.role ||
      Boolean(myStudent?.classId && msg.toClassId === myStudent.classId);
    if (msg.fromUserId !== me.id && !inMyInbox) {
      throw new ApiError('این پیام در صندوق شما نیست', 403);
    }

    if (msg.fromUserId === me.id && msg.toUserId) {
      // پیام مستقیم خودم — حذف کامل برای هر دو طرف
      await db.message.delete({ where: { id } });
      return NextResponse.json({ ok: true, hard: true });
    }

    // حذف فقط برای من
    let list: string[] = [];
    try { list = msg.deletedFor ? (JSON.parse(msg.deletedFor) as string[]) : []; } catch { list = []; }
    if (!list.includes(me.id)) list.push(me.id);
    await db.message.update({ where: { id }, data: { deletedFor: JSON.stringify(list) } });
    return NextResponse.json({ ok: true, hard: false });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    if (body.all === true) {
      // همهٔ صندوق ورودی من خوانده شد — فقط پیام‌هایی که مخاطبشان من هستم
      await db.message.updateMany({
        where: { toUserId: me.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true });
    }
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ پیام لازم است');
    const msg = await db.message.findUnique({ where: { id } });
    if (!msg) throw new ApiError('پیام یافت نشد');
    // فقط پیام مستقیم به من قابل خوانده‌شدن است — پیام همگانی علم «اعلان» دارد و برای همهٔ گیرندگان مشترک است
    if (msg.toUserId !== me.id) {
      throw new ApiError('فقط پیام‌های مستقیم قابل علامت‌گذاری «خوانده‌شده» هستند', 403);
    }
    await db.message.update({ where: { id }, data: { read: true } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
