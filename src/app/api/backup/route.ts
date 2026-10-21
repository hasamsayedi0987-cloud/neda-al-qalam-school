import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ApiError, hashPassword } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

/**
 * پشتیبان‌گیری و بازیابی — بازیابی عمومی تنها برای مدیر مکتب
 */
export async function GET() {
  try {
    await requireRole('ADMIN');
    const [
      users, classes, subjects, classSubjects, teachers, students,
      attendance, staffAttendance, activities, grades, books, loans,
      notifications, tasks, settings,
    ] = await Promise.all([
      db.user.findMany(),
      db.class.findMany(),
      db.subject.findMany(),
      db.classSubject.findMany(),
      db.teacher.findMany(),
      db.student.findMany(),
      db.attendanceRecord.findMany(),
      db.staffAttendance.findMany(),
      db.studentActivity.findMany(),
      db.grade.findMany(),
      db.book.findMany(),
      db.bookLoan.findMany(),
      db.notification.findMany(),
      db.staffTask.findMany(),
      db.setting.findMany(),
    ]);
    const backup = {
      version: 1,
      app: 'مکتب خصوصی نداالقلم',
      createdAt: new Date().toISOString(),
      data: {
        users: users.map((u) => ({ ...u, _backupPassword: true })),
        classes, subjects, classSubjects, teachers, students,
        attendance, staffAttendance, activities, grades,
        books, loans, notifications, tasks, settings,
      },
    };
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="neda-ol-qalam-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN'); // بازیابی فقط برای مدیر
    const body = await req.json().catch(() => {
      throw new ApiError('فایل پشتیبان نامعتبر است');
    });
    const data = body?.data;
    if (!data || !body.version) throw new ApiError('ساختار فایل پشتیبان صحیح نیست');

    // پاک‌سازی جدول‌ها (به ترتیب وابستگی)
    await db.notification.deleteMany({});
    await db.grade.deleteMany({});
    await db.studentActivity.deleteMany({});
    await db.attendanceRecord.deleteMany({});
    await db.staffAttendance.deleteMany({});
    await db.bookLoan.deleteMany({});
    await db.staffTask.deleteMany({});
    await db.classSubject.deleteMany({});
    await db.user.deleteMany({});
    await db.student.deleteMany({});
    await db.teacher.deleteMany({});
    await db.book.deleteMany({});
    await db.subject.deleteMany({});
    await db.class.deleteMany({});
    await db.setting.deleteMany({});

    // بازگردانی تنظیمات
    if (Array.isArray(data.settings)) {
      for (const s of data.settings) {
        if (s?.key && typeof s.value === 'string') {
          await db.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
        }
      }
    }
    // بازگردانی صنف‌ها
    if (Array.isArray(data.classes)) {
      for (const c of data.classes) {
        await db.class.create({ data: { id: c.id, grade: c.grade, name: c.name, supervisorId: c.supervisorId ?? null } });
      }
    }
    if (Array.isArray(data.subjects)) {
      for (const s of data.subjects) {
        await db.subject.create({ data: { id: s.id, name: s.name } });
      }
    }
    if (Array.isArray(data.teachers)) {
      for (const t of data.teachers) {
        await db.teacher.create({
          data: {
            id: t.id, name: t.name, fatherName: t.fatherName ?? null, position: t.position,
            phone: t.phone ?? null, education: t.education ?? null,
            hireDate: t.hireDate ?? null, active: t.active ?? true,
          },
        });
      }
    }
    if (Array.isArray(data.students)) {
      for (const s of data.students) {
        await db.student.create({ data: { ...s } });
      }
    }
    if (Array.isArray(data.classSubjects)) {
      for (const cs of data.classSubjects) {
        await db.classSubject.create({ data: { id: cs.id, classId: cs.classId, subjectId: cs.subjectId, teacherId: cs.teacherId ?? null } });
      }
    }
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        if (!u.password) continue;
        await db.user.create({
          data: {
            id: u.id, username: u.username, password: u.password, name: u.name,
            role: u.role, active: u.active ?? true, phone: u.phone ?? null,
            teacherId: u.teacherId ?? null, studentId: u.studentId ?? null,
          },
        });
      }
    }
    if (Array.isArray(data.attendance)) {
      for (const r of data.attendance) {
        await db.attendanceRecord.create({ data: { id: r.id, studentId: r.studentId, classId: r.classId, date: r.date, status: r.status, recordedBy: r.recordedBy ?? null } });
      }
    }
    if (Array.isArray(data.staffAttendance)) {
      for (const r of data.staffAttendance) {
        await db.staffAttendance.create({ data: { id: r.id, teacherId: r.teacherId, date: r.date, status: r.status } });
      }
    }
    if (Array.isArray(data.activities)) {
      for (const a of data.activities) {
        await db.studentActivity.create({ data: { id: a.id, studentId: a.studentId, date: a.date, type: a.type, score: a.score ?? null, note: a.note, recordedBy: a.recordedBy ?? null } });
      }
    }
    if (Array.isArray(data.grades)) {
      for (const g of data.grades) {
        await db.grade.create({
          data: {
            id: g.id, studentId: g.studentId, classSubjectId: g.classSubjectId, period: g.period,
            written: g.written ?? null, oral: g.oral ?? null, homework: g.homework ?? null,
            activity: g.activity ?? null, total: g.total ?? 0, approved: g.approved ?? false,
            notes: g.notes ?? null,
          },
        });
      }
    }
    if (Array.isArray(data.books)) {
      for (const b of data.books) {
        await db.book.create({ data: { id: b.id, title: b.title, author: b.author ?? null, category: b.category ?? null, copies: b.copies ?? 1, available: b.available ?? 1, shelfNo: b.shelfNo ?? null } });
      }
    }
    if (Array.isArray(data.loans)) {
      for (const l of data.loans) {
        await db.bookLoan.create({ data: { id: l.id, bookId: l.bookId, borrowerName: l.borrowerName, borrowerType: l.borrowerType ?? 'STUDENT', studentId: l.studentId ?? null, loanDate: l.loanDate, dueDate: l.dueDate, returnDate: l.returnDate ?? null, status: l.status ?? 'LENT', notes: l.notes ?? null } });
      }
    }
    if (Array.isArray(data.tasks)) {
      for (const t of data.tasks) {
        await db.staffTask.create({ data: { id: t.id, staffId: t.staffId, title: t.title, description: t.description ?? null, dueDate: t.dueDate ?? null, status: t.status ?? 'PENDING', assignedBy: t.assignedBy ?? null } });
      }
    }
    if (Array.isArray(data.notifications)) {
      for (const n of data.notifications) {
        await db.notification.create({ data: { id: n.id, userId: n.userId, title: n.title, body: n.body, type: n.type ?? 'INFO', read: n.read ?? false } });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
