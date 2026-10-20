import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { isoToday } from '@/lib/jalali';

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

    const todayAttendance = await db.attendanceRecord.findMany({ where: { date: today } });
    const present = todayAttendance.filter((a) => a.status === 'PRESENT').length;
    const absent = todayAttendance.filter((a) => a.status === 'ABSENT').length;
    const sick = todayAttendance.filter((a) => a.status === 'SICK').length;
    const leave = todayAttendance.filter((a) => a.status === 'LEAVE').length;

    const lentBooks = await db.bookLoan.count({ where: { status: 'LENT' } });
    const pendingTasks = me.teacherId
      ? await db.staffTask.count({ where: { staffId: me.teacherId, status: { not: 'DONE' } } })
      : 0;

    const recentGrades = await db.grade.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        student: { select: { firstName: true, lastName: true } },
        classSubject: { include: { subject: { select: { name: true } } } },
      },
    });

    return NextResponse.json({
      role: me.role,
      unread,
      studentCount, teacherCount, staffCount, classCount, subjectCount, bookCount,
      attendanceToday: { present, absent, sick, leave, recorded: todayAttendance.length },
      lentBooks,
      pendingTasks,
      recentGrades: recentGrades.map((g) => ({
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
