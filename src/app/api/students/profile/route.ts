import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { letterGrade, round2 } from '@/lib/grading';
import { studentInTeacherScope } from '@/lib/teacher-scope';

/**
 * پروفایل کامل شاگرد — خلاصهٔ حاضری، فعالیت‌ها و نمرات در یک جا
 * دسترسی: مدیر/سرمعلم همه؛ معلم فقط شاگردان صنف‌های خود؛ شاگرد/سرپرست فقط خودشان
 */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const studentId = req.nextUrl.searchParams.get('studentId') || '';

    if (me.role === 'STAFF' || me.role === 'LIBRARIAN') {
      throw new ApiError('شما به پروفایل شاگردان دسترسی ندارید', 403);
    }
    if (!studentId) throw new ApiError('شناسهٔ شاگرد لازم است', 403);
    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (me.studentId !== studentId) throw new ApiError('دسترسی مجاز نیست', 403);
    }
    if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', studentId))) {
      throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: { select: { id: true, name: true, grade: true } } },
    });
    if (!student) throw new ApiError('شاگرد یافت نشد', 404);

    const [attendance, activities, grades] = await Promise.all([
      db.attendanceRecord.findMany({
        where: { studentId },
        orderBy: { date: 'desc' },
        take: 200,
        select: { id: true, date: true, status: true },
      }),
      db.studentActivity.findMany({
        where: { studentId },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      db.grade.findMany({
        where: { studentId },
        include: { classSubject: { include: { subject: { select: { name: true } } } } },
      }),
    ]);

    // خلاصهٔ نمرات: نهایی = میانگین (نیمسال، سالانه) — مطابق منطق جدول نتایج
    const bySubject = new Map<string, { name: string; midterm: number | null; annual: number | null }>();
    for (const g of grades) {
      const key = g.classSubjectId;
      const entry = bySubject.get(key) || { name: g.classSubject.subject.name, midterm: null, annual: null };
      if (g.period === 'MIDTERM') entry.midterm = g.total;
      if (g.period === 'ANNUAL') entry.annual = g.total;
      bySubject.set(key, entry);
    }
    const subjects = Array.from(bySubject.values()).map((s) => {
      const final = s.midterm != null && s.annual != null ? round2((s.midterm + s.annual) / 2) : (s.annual ?? s.midterm ?? null);
      return { name: s.name, final, letter: final != null ? letterGrade(final) : null };
    });
    const scored = subjects.filter((s) => s.final != null) as Array<{ name: string; final: number; letter: string }>;
    const overallAvg = scored.length ? round2(scored.reduce((sum, s) => sum + s.final, 0) / scored.length) : null;

    return NextResponse.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        fatherName: student.fatherName,
        photo: student.photo,
        gender: student.gender,
        status: student.status,
        rollNo: student.rollNo,
        className: student.class?.name || null,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },
      attendance: {
        total: attendance.length,
        PRESENT: attendance.filter((a) => a.status === 'PRESENT').length,
        ABSENT: attendance.filter((a) => a.status === 'ABSENT').length,
        SICK: attendance.filter((a) => a.status === 'SICK').length,
        LEAVE: attendance.filter((a) => a.status === 'LEAVE').length,
        recent: attendance.slice(0, 8),
      },
      activities,
      subjects: scored,
      overallAvg,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
