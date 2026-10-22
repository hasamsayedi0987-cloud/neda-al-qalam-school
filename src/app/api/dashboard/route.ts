import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { isoToday } from '@/lib/jalali';
import { letterGrade } from '@/lib/grading';
import { teacherClassIds } from '@/lib/teacher-scope';

export async function GET() {
  try {
    const me = await requireUser();
    const today = isoToday();

    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (!me.studentId) throw new ApiError('حساب شما به هیچ شاگردی پیوند ندارد', 403);
      const student = await db.student.findUnique({
        where: { id: me.studentId },
        include: { class: true },
      });
      const grades = await db.grade.findMany({ where: { studentId: me.studentId } });
      const attendance = await db.attendanceRecord.findMany({ where: { studentId: me.studentId } });
      const unread = await db.notification.count({ where: { userId: me.id, read: false } });
      return NextResponse.json({
        role: me.role,
        student,
        unread,
        totalGrades: grades.length,
        approvedGrades: grades.filter((g) => g.approved).length,
        attendanceToday: attendance.find((a) => a.date === today)?.status || null,
        attendanceTotal: attendance.length,
        absences: attendance.filter((a) => a.status === 'ABSENT').length,
      });
    }

    const [studentCount, teacherCount, staffCount, classCount, subjectCount, bookCount, unread] =
      await Promise.all([
        db.student.count({ where: { status: 'ACTIVE' } }),
        db.teacher.count({ where: { active: true, position: { in: ['معلم', 'سرمعلم', 'مدیر'] } } }),
        db.teacher.count({ where: { active: true, position: { in: ['ملازم', 'کارمند', 'کتابخانه‌دار'] } } }),
        db.class.count(),
        db.subject.count(),
        db.book.count(),
        db.notification.count({ where: { userId: me.id, read: false } }),
      ]);

    // روند ۷ روز اخیر حاضری (یک کوئری برای همهٔ روزها)
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const trendRaw = await db.attendanceRecord.findMany({
      where: { date: { in: days } },
      select: { date: true, status: true },
    });
    const trendByDate = new Map<string, { present: number; absent: number }>();
    for (const d of days) trendByDate.set(d, { present: 0, absent: 0 });
    for (const r of trendRaw) {
      const t = trendByDate.get(r.date);
      if (!t) continue;
      if (r.status === 'PRESENT') t.present += 1;
      else if (r.status === 'ABSENT') t.absent += 1;
    }
    const attendanceTrend = days.map((d) => ({ date: d, ...(trendByDate.get(d) || { present: 0, absent: 0 }) }));

    const todayAttendance = await db.attendanceRecord.findMany({ where: { date: today } });
    const present = todayAttendance.filter((a) => a.status === 'PRESENT').length;
    const absent = todayAttendance.filter((a) => a.status === 'ABSENT').length;
    const sick = todayAttendance.filter((a) => a.status === 'SICK').length;
    const leave = todayAttendance.filter((a) => a.status === 'LEAVE').length;

    const lentBooks = await db.bookLoan.count({ where: { status: 'LENT' } });
    const pendingTasks = me.teacherId
      ? await db.staffTask.count({ where: { staffId: me.teacherId, status: { not: 'DONE' } } })
      : 0;

    // نمرات اخیر — معلم فقط نمرات صنف‌های خودش را می‌بیند
    const teacherScope = me.role === 'TEACHER' ? await teacherClassIds(me.teacherId || '') : null;
    const recentGrades = await db.grade.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        student: { select: { firstName: true, lastName: true, classId: true } },
        classSubject: { include: { subject: { select: { name: true } } } },
      },
    });
    const visibleGrades = teacherScope
      ? recentGrades.filter((g) => g.student.classId && teacherScope.includes(g.student.classId))
      : recentGrades;

    // توزیع نمرات بر اساس رتبهٔ حرفی — از نمرات سالانه
    const gradeCounts: Record<string, number> = {};
    for (const g of visibleGrades) {
      if (g.period !== 'ANNUAL') continue;
      const l = letterGrade(g.total);
      gradeCounts[l] = (gradeCounts[l] || 0) + 1;
    }

    return NextResponse.json({
      role: me.role,
      unread,
      studentCount, teacherCount, staffCount, classCount, subjectCount, bookCount,
      attendanceToday: { present, absent, sick, leave, recorded: todayAttendance.length },
      attendanceTrend,
      gradeDistribution: gradeCounts,
      lentBooks,
      pendingTasks,
      recentGrades: visibleGrades.slice(0, 5).map((g) => ({
        id: g.id,
        studentName: `${g.student.firstName} ${g.student.lastName}`,
        subjectName: g.classSubject.subject.name,
        total: g.total,
        period: g.period,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
