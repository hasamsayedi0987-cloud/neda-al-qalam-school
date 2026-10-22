import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

/**
 * پشتیبان‌گیری و بازیابی — بازیابی عمومی تنها برای مدیر مکتب
 *
 * امنیت:
 *  - کلید امضای نشست (authSecret) هرگز در فایل پشتیبان قرار نمی‌گیرد
 *  - بازیابی در یک تراکنش اتمیک انجام می‌شود: یا همه‌چیز برمی‌گردد یا هیچ‌چیز
 *    (قبلاً اگر وسط راه خطا می‌داد، کل دیتابیس خالی می‌ماند!)
 *  - بخش‌های دلخواه، ثبت‌های دلخواه و قالب‌های تقدیرنامه هم شامل پشتیبان است
 */

export async function GET() {
  try {
    await requireRole('ADMIN');
    const [
      users, classes, subjects, classSubjects, teachers, students,
      attendance, staffAttendance, activities, grades, books, loans,
      notifications, tasks, settings, customSections, customEntries, certificates,
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
      db.customSection.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.customEntry.findMany(),
      db.certificateTemplate.findMany(),
    ]);
    const backup = {
      version: 2,
      app: 'مکتب خصوصی نداالقلم',
      createdAt: new Date().toISOString(),
      data: {
        users: users.map((u) => ({ ...u, _backupPassword: true })),
        classes, subjects, classSubjects, teachers, students,
        attendance, staffAttendance, activities, grades,
        books, loans, notifications, tasks,
        // کلید امنیتی نشست هرگز پشتیبان نمی‌شود
        settings: settings.filter((s) => s.key !== 'authSecret'),
        customSections, customEntries, certificates,
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

/** بازیابی کامل در یک تراکنش — fn کل عملیات را در tx انجام می‌دهد */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN'); // بازیابی فقط برای مدیر
    const body = await req.json().catch(() => {
      throw new ApiError('فایل پشتیبان نامعتبر است');
    });
    const data = body?.data;
    if (!data || !body.version) throw new ApiError('ساختار فایل پشتیبان صحیح نیست');
    // اعتبارسنجی مختصر ساختار
    if (data.users && !Array.isArray(data.users)) throw new ApiError('فهرست کاربران نامعتبر است');
    if (data.students && !Array.isArray(data.students)) throw new ApiError('فهرست شاگردان نامعتبر است');

    await db.$transaction(async (tx) => {
      // پاک‌سازی جدول‌ها (به ترتیب وابستگی)
      await tx.notification.deleteMany({});
      await tx.grade.deleteMany({});
      await tx.studentActivity.deleteMany({});
      await tx.attendanceRecord.deleteMany({});
      await tx.staffAttendance.deleteMany({});
      await tx.bookLoan.deleteMany({});
      await tx.staffTask.deleteMany({});
      await tx.customEntry.deleteMany({});
      await tx.customSection.deleteMany({});
      await tx.certificateTemplate.deleteMany({});
      await tx.classSubject.deleteMany({});
      await tx.user.deleteMany({});
      await tx.student.deleteMany({});
      await tx.class.deleteMany({});
      await tx.teacher.deleteMany({});
      await tx.book.deleteMany({});
      await tx.subject.deleteMany({});
      await tx.setting.deleteMany({});

      // تنظیمات (کلید امنیتی نشست را از پشتیبان می‌پذیریم نیست)
      if (Array.isArray(data.settings)) {
        for (const s of data.settings) {
          if (s?.key && s.key !== 'authSecret' && typeof s.value === 'string') {
            await tx.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
          }
        }
      }
      // ترتیب کلیدهای خارجی: مضامین و معلمان قبل از صنف‌ها (سازگار با PostgreSQL)
      if (Array.isArray(data.subjects)) {
        for (const s of data.subjects) {
          await tx.subject.create({ data: { id: s.id, name: s.name } });
        }
      }
      if (Array.isArray(data.teachers)) {
        for (const t of data.teachers) {
          await tx.teacher.create({
            data: {
              id: t.id, name: t.name, fatherName: t.fatherName ?? null, position: t.position,
              phone: t.phone ?? null, education: t.education ?? null,
              hireDate: t.hireDate ?? null, active: t.active ?? true,
            },
          });
        }
      }
      if (Array.isArray(data.classes)) {
        for (const c of data.classes) {
          await tx.class.create({ data: { id: c.id, grade: c.grade, name: c.name, supervisorId: c.supervisorId ?? null } });
        }
      }
      if (Array.isArray(data.students)) {
        for (const s of data.students) {
          await tx.student.create({
            data: {
              id: s.id, firstName: s.firstName, lastName: s.lastName ?? null, fatherName: s.fatherName,
              grandFather: s.grandFather ?? null, gender: s.gender ?? 'M', birthDate: s.birthDate ?? null,
              idNumber: s.idNumber ?? null, guardianName: s.guardianName ?? null, guardianPhone: s.guardianPhone ?? null,
              address: s.address ?? null, photo: s.photo ?? null, classId: s.classId ?? null,
              rollNo: s.rollNo ?? null, status: s.status ?? 'ACTIVE', enrolledYear: s.enrolledYear ?? null,
            },
          });
        }
      }
      if (Array.isArray(data.classSubjects)) {
        for (const cs of data.classSubjects) {
          await tx.classSubject.create({ data: { id: cs.id, classId: cs.classId, subjectId: cs.subjectId, teacherId: cs.teacherId ?? null } });
        }
      }
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          if (!u.password) continue;
          await tx.user.create({
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
          await tx.attendanceRecord.create({ data: { id: r.id, studentId: r.studentId, classId: r.classId, date: r.date, status: r.status, recordedBy: r.recordedBy ?? null } });
        }
      }
      if (Array.isArray(data.staffAttendance)) {
        for (const r of data.staffAttendance) {
          await tx.staffAttendance.create({ data: { id: r.id, teacherId: r.teacherId, date: r.date, status: r.status } });
        }
      }
      if (Array.isArray(data.activities)) {
        for (const a of data.activities) {
          await tx.studentActivity.create({ data: { id: a.id, studentId: a.studentId, date: a.date, type: a.type, score: a.score ?? null, note: a.note, recordedBy: a.recordedBy ?? null } });
        }
      }
      if (Array.isArray(data.grades)) {
        for (const g of data.grades) {
          await tx.grade.create({
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
          await tx.book.create({ data: { id: b.id, title: b.title, author: b.author ?? null, category: b.category ?? null, copies: b.copies ?? 1, available: b.available ?? 1, shelfNo: b.shelfNo ?? null } });
        }
      }
      if (Array.isArray(data.loans)) {
        for (const l of data.loans) {
          await tx.bookLoan.create({ data: { id: l.id, bookId: l.bookId, borrowerName: l.borrowerName, borrowerType: l.borrowerType ?? 'STUDENT', studentId: l.studentId ?? null, loanDate: l.loanDate, dueDate: l.dueDate, returnDate: l.returnDate ?? null, status: l.status ?? 'LENT', notes: l.notes ?? null } });
        }
      }
      if (Array.isArray(data.tasks)) {
        for (const t of data.tasks) {
          await tx.staffTask.create({ data: { id: t.id, staffId: t.staffId, title: t.title, description: t.description ?? null, dueDate: t.dueDate ?? null, status: t.status ?? 'PENDING', assignedBy: t.assignedBy ?? null } });
        }
      }
      if (Array.isArray(data.notifications)) {
        for (const n of data.notifications) {
          await tx.notification.create({ data: { id: n.id, userId: n.userId, title: n.title, body: n.body, type: n.type ?? 'INFO', read: n.read ?? false } });
        }
      }
      // بخش‌های دلخواه + ثبت‌ها (قبلاً در پشتیبان نبودند = گم می‌شدند!)
      if (Array.isArray(data.customSections)) {
        for (const c of data.customSections) {
          await tx.customSection.create({
            data: {
              id: c.id, title: c.title, icon: c.icon ?? 'Sparkles', color: c.color ?? 'emerald',
              fields: c.fields ?? '[]', viewRoles: c.viewRoles ?? '["ADMIN"]',
              writeRoles: c.writeRoles ?? '["ADMIN"]', sortOrder: c.sortOrder ?? 0,
            },
          });
        }
      }
      if (Array.isArray(data.customEntries)) {
        for (const c of data.customEntries) {
          await tx.customEntry.create({
            data: { id: c.id, sectionId: c.sectionId, data: c.data ?? '{}', entryDate: c.entryDate ?? null, createdBy: c.createdBy ?? null },
          });
        }
      }
      if (Array.isArray(data.certificates)) {
        for (const c of data.certificates) {
          await tx.certificateTemplate.create({
            data: { id: c.id, name: c.name, config: c.config ?? '{}' },
          });
        }
      }
    }, { timeout: 90_000, maxWait: 15_000 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
