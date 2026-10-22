/**
 * دادهٔ آزمایشی محلی برای تست ویژگی‌های نسخهٔ ۲.۰
 * فقط db/custom.db محلی — هرگز روی تولید اجرا نمی‌شود
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function iso(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const count = await db.student.count();
  if (count > 0) {
    console.log('داده موجود است — seed رد شد');
    return;
  }

  // معلمان
  const t1 = await db.teacher.create({ data: { name: 'احمد شریفی', fatherName: 'محمد', position: 'معلم', education: 'لیسانس' } });
  const t2 = await db.teacher.create({ data: { name: 'حسام الدین سیدی', fatherName: 'عبدالرحمن', position: 'مدیر' } });
  const t3 = await db.teacher.create({ data: { name: 'زهرا کریمی', fatherName: 'علی', position: 'سرمعلم' } });

  // مضامین
  const subjects = [];
  for (const name of ['دینی', 'ریاضی', 'دری', 'انگلیسی', 'علمی']) {
    subjects.push(await db.subject.create({ data: { name } }));
  }

  // صنف‌ها
  const c7 = await db.class.create({ data: { grade: 7, name: 'صنف هفتم', supervisorId: t3.id } });
  const c8 = await db.class.create({ data: { grade: 8, name: 'صنف هشتم', supervisorId: t1.id } });

  // تقسیم مضامین
  for (const s of subjects) {
    await db.classSubject.create({ data: { classId: c7.id, subjectId: s.id, teacherId: t1.id } });
    await db.classSubject.create({ data: { classId: c8.id, subjectId: s.id, teacherId: t3.id } });
  }

  // شاگردان
  const names7 = [['احمد', 'کریمی'], ['مریم', 'احمدی'], ['عبدالرحمن', 'نوری'], ['فاطمه', 'حسینی'], ['محمد', 'راحمی'], ['نرگس', 'یوسفی'], ['علی', 'جلالی'], ['سارا', 'فتحی']];
  const c7Students = [];
  let roll = 1;
  for (const [f, l] of names7) {
    c7Students.push(await db.student.create({
      data: { firstName: f, lastName: l, fatherName: 'محمدنظر', gender: ['مریم', 'فاطمه', 'نرگس', 'سارا'].includes(f) ? 'F' : 'M', classId: c7.id, rollNo: roll++, guardianName: 'محمدنظر ' + l, guardianPhone: '07900000' + (10 + roll), status: 'ACTIVE', enrolledYear: '۱۴۰۲' },
    }));
  }
  const names8 = [['رحیم', 'سعیدی'], ['زینب', 'کریمی'], ['یوسف', 'درانی']];
  let roll8 = 1;
  for (const [f, l] of names8) {
    await db.student.create({
      data: { firstName: f, lastName: l, fatherName: 'عبدالوالی', gender: ['زینب'].includes(f) ? 'F' : 'M', classId: c8.id, rollNo: roll8++, status: 'ACTIVE' },
    });
  }

  // نمرات (نیمسال + سالانه) صنف هفتم
  const cs7 = await db.classSubject.findMany({ where: { classId: c7.id } });
  const letters = [92, 84, 76, 65, 55, 95, 88, 71, 63, 47, 82, 90];
  let li = 0;
  for (const cs of cs7) {
    for (const st of c7Students) {
      const total = letters[li++ % letters.length];
      await db.grade.create({ data: { studentId: st.id, classSubjectId: cs.id, period: 'MIDTERM', written: Math.round(total * 0.4), oral: 18, homework: 20, activity: 15, total, approved: true } });
      await db.grade.create({ data: { studentId: st.id, classSubjectId: cs.id, period: 'ANNUAL', written: Math.round(total * 0.45), oral: 17, homework: 18, activity: 14, total: Math.min(100, total + 3), approved: true } });
    }
  }

  // حاضری ۷ روز اخیر
  for (let d = 0; d < 7; d++) {
    const date = iso(d);
    for (let i = 0; i < c7Students.length; i++) {
      const status = (i + d) % 9 === 0 ? 'ABSENT' : (i + d) % 13 === 0 ? 'SICK' : 'PRESENT';
      if ((i + d) % 11 === 0) continue; // بعضی روزها ثبت ناقص
      await db.attendanceRecord.create({ data: { studentId: c7Students[i].id, classId: c7.id, date, status, recordedBy: t2.id } }).catch(() => {});
    }
  }

  // فعالیت
  await db.studentActivity.create({ data: { studentId: c7Students[0].id, type: 'HOMEWORK', note: 'کارخانگی خود را به‌وقت تکمیل کرد', score: 90, date: iso(1), recordedBy: t2.id } });
  await db.studentActivity.create({ data: { studentId: c7Students[1].id, type: 'BEHAVIOR', note: 'در صنف بسیار منظم است', score: 95, date: iso(2), recordedBy: t2.id } });

  // کتاب
  const b1 = await db.book.create({ data: { title: 'ریاضیات هفتم', author: 'وزارت معارف', category: 'درسی', copies: 30, available: 28 } });
  await db.book.create({ data: { title: 'تاریخ افغانستان', author: 'میر غلام محمد غبار', category: 'تاریخی', copies: 5, available: 4, shelfNo: 'A-2' } });
  await db.bookLoan.create({ data: { bookId: b1.id, borrowerName: 'احمد کریمی', borrowerType: 'STUDENT', studentId: c7Students[0].id, loanDate: iso(5), dueDate: iso(-5), status: 'LENT' } });

  // کاربران پیوند داده‌شده
  await db.user.update({ where: { username: 'admin' }, data: { teacherId: t2.id } }).catch(() => {});

  console.log('seed کامل شد: ۱۱ شاگرد، ۲ صنف، ۵ مضمون، ۸۰ نمره، ۷ روز حاضری');
}

main().finally(() => db.$disconnect());
