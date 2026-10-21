/**
 * پاک‌سازی کامل جدول‌ها به ترتیب وابستگی — قبل از مهاجرت مجدد
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.studentActivity.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.staffAttendance.deleteMany({});
  await prisma.bookLoan.deleteMany({});
  await prisma.staffTask.deleteMany({});
  await prisma.classSubject.deleteMany({});
  await prisma.customEntry.deleteMany({});
  await prisma.customSection.deleteMany({});
  await prisma.certificateTemplate.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.teacher.deleteMany({});
  await prisma.book.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.class.deleteMany({});
  await prisma.setting.deleteMany({});
  console.log('✓ همهٔ جدول‌ها پاک شدند');
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
