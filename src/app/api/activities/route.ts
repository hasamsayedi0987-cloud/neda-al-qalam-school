import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';
import { studentInTeacherScope, teacherClassIds } from '@/lib/teacher-scope';

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sp = req.nextUrl.searchParams;

    // شاگرد/سرپرست: فعالیت‌های خود شاگرد
    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (!me.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
      const activities = await db.studentActivity.findMany({
        where: { studentId: me.studentId },
        orderBy: { date: 'desc' },
        take: 100,
      });
      return NextResponse.json({ activities, students: [] });
    }

    const studentId = sp.get('studentId');
    const classId = sp.get('classId');
    if (!classId && !studentId) throw new ApiError('صنف یا شاگرد را انتخاب کنید');
    // معلم: فقط فعالیت شاگردان صنف‌های خودش
    if (me.role === 'TEACHER') {
      const scope = await teacherClassIds(me.teacherId || '');
      if (classId && !scope.includes(classId)) {
        throw new ApiError('این صنف از صنف‌های تحت تدریس شما نیست', 403);
      }
      if (studentId && !(await studentInTeacherScope(me.teacherId || '', studentId))) {
        throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
      }
    }
    const where: Record<string, unknown> = studentId ? { studentId } : {};
    if (classId && !studentId) {
      const students = await db.student.findMany({
        where: { classId, status: 'ACTIVE' },
        orderBy: { rollNo: 'asc' },
        select: { id: true, firstName: true, lastName: true, rollNo: true },
      });
      const activities = await db.studentActivity.findMany({
        where: { student: { classId } },
        orderBy: { date: 'desc' },
        take: 500,
      });
      return NextResponse.json({ students, activities });
    }
    const activities = await db.studentActivity.findMany({
      where, orderBy: { date: 'desc' }, take: 200,
    });
    return NextResponse.json({ activities, students: [] });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const studentId = str(body.studentId);
    const note = str(body.note);
    const type = str(body.type);
    if (!studentId || !note || !type) throw new ApiError('شاگرد، نوع فعالیت و ملاحظات لازم است');
    if (!['HOMEWORK', 'BEHAVIOR', 'PARTICIPATION', 'OTHER'].includes(type)) {
      throw new ApiError('نوع فعالیت نامعتبر است');
    }
    // معلم: فقط فعالیت شاگردان صنف‌های تحت تدریس خود
    if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', studentId))) {
      throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
    }
    const activity = await db.studentActivity.create({
      data: {
        studentId, type, note,
        score: optNum(body.score),
        date: str(body.date) || new Date().toISOString().slice(0, 10),
        recordedBy: me.id,
      },
    });
    return NextResponse.json({ id: activity.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسه لازم است');
    const existing = await db.studentActivity.findUnique({ where: { id } });
    if (!existing) throw new ApiError('فعالیت یافت نشد', 404);
    // معلم: فقط فعالیت شاگردان صنف‌های تحت تدریس خود
    if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', existing.studentId))) {
      throw new ApiError('این فعالیت از شاگردان صنف‌های شما نیست', 403);
    }
    const data: Record<string, unknown> = {};
    if (body.note !== undefined) {
      const note = str(body.note);
      if (!note) throw new ApiError('ملاحظات نمی‌تواند خالی باشد');
      data.note = note;
    }
    if (body.type !== undefined) {
      const type = str(body.type);
      if (!['HOMEWORK', 'BEHAVIOR', 'PARTICIPATION', 'OTHER'].includes(type)) {
        throw new ApiError('نوع فعالیت نامعتبر است');
      }
      data.type = type;
    }
    if (body.score !== undefined) data.score = optNum(body.score);
    if (body.date !== undefined) data.date = str(body.date) || existing.date;
    await db.studentActivity.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسه لازم است');
    const existing = await db.studentActivity.findUnique({ where: { id } });
    if (!existing) throw new ApiError('فعالیت یافت نشد', 404);
    // معلم: فقط فعالیت شاگردان صنف‌های تحت تدریس خود
    if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', existing.studentId))) {
      throw new ApiError('این فعالیت از شاگردان صنف‌های شما نیست', 403);
    }
    await db.studentActivity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
