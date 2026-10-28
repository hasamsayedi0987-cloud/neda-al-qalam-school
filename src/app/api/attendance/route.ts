import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { jalaliMonthRange, jalaliToGregorian } from '@/lib/jalali';
import { teacherClassIds } from '@/lib/teacher-scope';
import { ROLE_LABELS } from '@/lib/grading';

/** بررسی دسترسی معلم به صنف — مدیر و سرمعلم همه صنف‌ها */
async function assertClassScope(me: { role: string; teacherId: string | null }, classId: string) {
  if (me.role !== 'TEACHER') return;
  const scope = await teacherClassIds(me.teacherId || '');
  if (!scope.includes(classId)) {
    throw new ApiError('این صنف از صنف‌های تحت تدریس شما نیست', 403);
  }
}

/** نقش‌های پرسنل — همهٔ کارمندان مکتب (معلم، کارمند، کتابخانه و مدیریت) */
const EMPLOYEE_ROLES: string[] = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'];

/**
 * انتقال خودکار حاضری قدیمی (StaffAttendance بر پایهٔ معلم) به EmployeeAttendance بر پایهٔ حساب کاربری.
 * یک‌بار‌کننده و بی‌خطر: ردیف موجود دست نمی‌خورد.
 */
async function ensureEmployeeAttendanceMigrated() {
  try {
    const rows = await db.staffAttendance.findMany({
      include: { teacher: { select: { user: { select: { id: true } } } } },
    });
    if (!rows.length) return;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const r of rows) {
      const uid = r.teacher?.user?.id;
      if (!uid) continue;
      ops.push(db.employeeAttendance.upsert({
        where: { userId_date: { userId: uid, date: r.date } },
        update: {},
        create: { userId: uid, date: r.date, status: r.status },
      }));
    }
    if (ops.length) await db.$transaction(ops);
  } catch {
    /* مهاجرت هرگز نمایش حاضری را نمی‌شکند */
  }
}

/** حاضری شاگردان — یومیه و گزارش ماهانه؛ و حاضری معلمان/کارمندان */
export async function GET(req: NextRequest) {
  try {
    const me = await requireSection('attendance');
    const sp = req.nextUrl.searchParams;
    const mode = sp.get('mode') || 'daily';

    // ─── حاضری پرسنل (معلمان، کارمندان و مدیریت) ───
    if (mode === 'staff') {
      if (sp.get('mine') === '1') {
        // حاضری خودم — بر پایهٔ حساب کاربری، برای هر نقش پرسنلی
        const records = await db.employeeAttendance.findMany({
          where: { userId: me.id },
          orderBy: { date: 'desc' },
          take: 90,
        });
        return NextResponse.json({ records });
      }
      await requireRole('ADMIN', 'HEADTEACHER');
      const date = sp.get('date') || '';
      await ensureEmployeeAttendanceMigrated();
      const [records, staffUsers] = await Promise.all([
        db.employeeAttendance.findMany({
          where: date ? { date } : {},
          orderBy: { date: 'desc' },
        }),
        db.user.findMany({
          where: { active: true, role: { in: EMPLOYEE_ROLES } },
          include: { teacherProfile: { select: { position: true } } },
          orderBy: { name: 'asc' },
        }),
      ]);
      const staff = staffUsers.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        position: u.teacherProfile?.position || ROLE_LABELS[u.role] || 'کارمند',
      }));
      return NextResponse.json({ records, staff });
    }

    // ─── حاضری یومیه صنف ───
    if (mode === 'daily') {
      const classId = sp.get('classId') || '';
      const date = sp.get('date');
      if (!classId) throw new ApiError('صنف را انتخاب کنید');
      await assertClassScope(me, classId);
      const cls = await db.class.findUnique({ where: { id: classId } });
      if (!cls) throw new ApiError('صنف یافت نشد');

      // شاگرد: فقط حاضری خودش
      if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
        if (!me.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
        const records = await db.attendanceRecord.findMany({
          where: { studentId: me.studentId },
          orderBy: { date: 'desc' },
          take: 120,
        });
        return NextResponse.json({ students: [], records, classInfo: null });
      }

      const students = await db.student.findMany({
        where: { classId, status: 'ACTIVE' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, firstName: true, lastName: true, fatherName: true, rollNo: true, guardianName: true, guardianPhone: true },
      });
      const records = await db.attendanceRecord.findMany({
        where: { classId, ...(date ? { date } : {}) },
        orderBy: { date: 'desc' },
      });
      return NextResponse.json({ students, records, classInfo: { id: cls.id, name: cls.name } });
    }

    // ─── گزارش ماهانه ───
    if (mode === 'monthly') {
      const jy = Number(sp.get('jy'));
      const jm = Number(sp.get('jm'));
      if (!jy || !jm) throw new ApiError('سال و ماه شمسی را انتخاب کنید');
      const { startIso, endIso } = jalaliMonthRange(jy, jm);

      // شاگرد/سرپرست: حاضری خود شاگرد
      if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
        if (!me.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
        const student = await db.student.findUnique({ where: { id: me.studentId } });
        const records = await db.attendanceRecord.findMany({
          where: { studentId: me.studentId, date: { gte: startIso, lte: endIso } },
          orderBy: { date: 'asc' },
        });
        return NextResponse.json({ students: student ? [student] : [], records });
      }

      const classId = sp.get('classId') || '';
      if (!classId) throw new ApiError('صنف را انتخاب کنید');
      await assertClassScope(me, classId);

      const students = await db.student.findMany({
        where: { classId, status: 'ACTIVE' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, firstName: true, lastName: true, fatherName: true, rollNo: true },
      });
      const records = await db.attendanceRecord.findMany({
        where: { classId, date: { gte: startIso, lte: endIso } },
      });
      return NextResponse.json({ students, records });
    }

    // ─── آمار سالانه ───
    if (mode === 'annual') {
      const jy = Number(sp.get('jy'));
      if (!jy) throw new ApiError('سال شمسی را انتخاب کنید');
      const classId = sp.get('classId') || '';
      if (!classId) throw new ApiError('صنف را انتخاب کنید');
      await assertClassScope(me, classId);
      // مرز سال شمسی: از ۱/۱ تا ۱۲/آخر (مبدل به ISO)
      const startG = jalaliToGregorian(jy, 1, 1);
      const endG = jalaliToGregorian(jy + 1, 1, 1);
      const fmt = (g: { gy: number; gm: number; gd: number }) =>
        `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
      const startIso = fmt(startG);
      const endIso = fmt(endG); // بعد از پایان سال — مرز باز
      const students = await db.student.findMany({
        where: { classId, status: 'ACTIVE' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, firstName: true, lastName: true, fatherName: true, rollNo: true },
      });
      const records = await db.attendanceRecord.findMany({
        where: { classId, date: { gte: startIso, lt: endIso } },
      });
      return NextResponse.json({ students, records });
    }

    throw new ApiError('حالت نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const action = str(body.action);

    // ─── ثبت حاضری پرسنل (معلمان، کارمندان و مدیریت) ───
    if (action === 'staff') {
      await requireRole('ADMIN', 'HEADTEACHER');
      const date = str(body.date);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!date) throw new ApiError('تاریخ لازم است');
      const staffOps: Prisma.PrismaPromise<unknown>[] = [];
      for (const item of items) {
        const status = str(item.status);
        if (!['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
        // فرمت جدید: userId — فرمت قدیمی: teacherId (سازگاری صف آفلاین)
        let userId = str(item.userId);
        const legacyTeacherId = str(item.teacherId);
        if (!userId && legacyTeacherId) {
          const t = await db.teacher.findUnique({ where: { id: legacyTeacherId }, select: { user: { select: { id: true } } } });
          userId = t?.user?.id || '';
        }
        if (!userId) continue;
        const u = await db.user.findFirst({ where: { id: userId, active: true, role: { in: EMPLOYEE_ROLES } }, select: { id: true } });
        if (!u) continue;
        staffOps.push(db.employeeAttendance.upsert({
          where: { userId_date: { userId, date } },
          update: { status },
          create: { userId, date, status },
        }));
      }
      if (staffOps.length) await db.$transaction(staffOps);
      return NextResponse.json({ ok: true, saved: staffOps.length });
    }

    // ─── ثبت حاضری شاگردان ───
    await requireSection('attendance');
    const date = str(body.date);
    const classId = str(body.classId);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!date || !classId) throw new ApiError('صنف و تاریخ لازم است');
    // معلم: فقط حاضری صنف‌های تحت تدریس خود
    await assertClassScope(me, classId);

    let saved = 0;
    const absentStudents: string[] = [];
    // اعتبارسنجی: هر شاگرد باید عضو همین صنف باشد (جلوگیری از ثبت ناهم‌خوان)
    const reqIds = items.map((item: { studentId?: unknown }) => str(item.studentId)).filter(Boolean);
    const classStudents = reqIds.length
      ? await db.student.findMany({ where: { id: { in: reqIds }, classId }, select: { id: true } })
      : [];
    const validIds = new Set(classStudents.map((s) => s.id));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const item of items) {
      const studentId = str(item.studentId);
      const status = str(item.status);
      if (!studentId || !validIds.has(studentId) || !['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
      ops.push(db.attendanceRecord.upsert({
        where: { studentId_date: { studentId, date } },
        update: { status, recordedBy: me.id, classId },
        create: { studentId, classId, date, status, recordedBy: me.id },
      }));
      if (status === 'ABSENT') absentStudents.push(studentId);
      saved += 1;
    }
    if (ops.length) await db.$transaction(ops);

    // اعلان به سرپرست/والدین شاگردان غایب
    if (absentStudents.length > 0) {
      const users = await db.user.findMany({
        where: { studentId: { in: absentStudents }, active: true, role: { in: ['GUARDIAN', 'STUDENT'] } },
      });
      if (users.length > 0) {
        await db.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            title: 'غیبت شاگرد',
            body: 'شاگرد شما امروز در مکتب حاضر نبود. لطفاً رهنمایی لازم را مبذول دارید.',
            type: 'ATTENDANCE',
          })),
        });
      }
    }
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    return handleApiError(e);
  }
}
