import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { jalaliMonthRange } from '@/lib/jalali';
import { teacherClassIds } from '@/lib/teacher-scope';

/** بررسی دسترسی معلم به صنف — مدیر و سرمعلم همه صنف‌ها */
async function assertClassScope(me: { role: string; teacherId: string | null }, classId: string) {
  if (me.role !== 'TEACHER') return;
  const scope = await teacherClassIds(me.teacherId || '');
  if (!scope.includes(classId)) {
    throw new ApiError('این صنف از صنف‌های تحت تدریس شما نیست', 403);
  }
}

/** حاضری شاگردان — یومیه و گزارش ماهانه؛ و حاضری معلمان/کارمندان */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sp = req.nextUrl.searchParams;
    const mode = sp.get('mode') || 'daily';

    // ─── حاضری معلمان/کارمندان ───
    if (mode === 'staff') {
      if (sp.get('mine') === '1') {
        if (!me.teacherId) throw new ApiError('حساب شما به هیچ کارمندی پیوند ندارد', 403);
        const records = await db.staffAttendance.findMany({
          where: { teacherId: me.teacherId },
          orderBy: { date: 'desc' },
          take: 90,
        });
        return NextResponse.json({ records });
      }
      await requireRole('ADMIN', 'HEADTEACHER');
      const date = sp.get('date') || '';
      const records = await db.staffAttendance.findMany({
        where: date ? { date } : {},
        include: { teacher: { select: { id: true, name: true, position: true } } },
        orderBy: { date: 'desc' },
      });
      const staff = await db.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
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
        select: { id: true, firstName: true, lastName: true, fatherName: true, rollNo: true },
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

    // ─── ثبت حاضری معلمان/کارمندان ───
    if (action === 'staff') {
      await requireRole('ADMIN', 'HEADTEACHER');
      const date = str(body.date);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!date) throw new ApiError('تاریخ لازم است');
      for (const item of items) {
        const teacherId = str(item.teacherId);
        const status = str(item.status);
        if (!teacherId || !['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
        await db.staffAttendance.upsert({
          where: { teacherId_date: { teacherId, date } },
          update: { status },
          create: { teacherId, date, status },
        });
      }
      return NextResponse.json({ ok: true, saved: items.length });
    }

    // ─── ثبت حاضری شاگردان ───
    await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const date = str(body.date);
    const classId = str(body.classId);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!date || !classId) throw new ApiError('صنف و تاریخ لازم است');
    // معلم: فقط حاضری صنف‌های تحت تدریس خود
    await assertClassScope(me, classId);

    let saved = 0;
    const absentStudents: string[] = [];
    for (const item of items) {
      const studentId = str(item.studentId);
      const status = str(item.status);
      if (!studentId || !['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
      await db.attendanceRecord.upsert({
        where: { studentId_date: { studentId, date } },
        update: { status, recordedBy: me.id, classId },
        create: { studentId, classId, date, status, recordedBy: me.id },
      });
      if (status === 'ABSENT') absentStudents.push(studentId);
      saved += 1;
    }

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
