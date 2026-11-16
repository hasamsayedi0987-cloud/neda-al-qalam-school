/**
 * پاک‌سازی کامل جدول‌ها به ترتیب وابستگی — قبل از مهاجرت مجدد
 * نسخهٔ ۳.۳.۰ — همهٔ جدول‌ها شامل ترانسپورت، فروشات، خزانه، مصارفات، معاشات و SMS
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // جدول‌های نسخهٔ ۳.۳.۰
  await prisma.smsOutbox.deleteMany({});
  await prisma.transportPayment.deleteMany({});
  await prisma.transportEnrollment.deleteMany({});
  await prisma.transportExpense.deleteMany({});
  await prisma.storeSale.deleteMany({});
  await prisma.storePurchase.deleteMany({});
  await prisma.storeItem.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.salaryPayment.deleteMany({});
  await prisma.moneyHandover.deleteMany({});
  await prisma.treasuryTransaction.deleteMany({});
  // جدول‌های قدیمی — به ترتیب وابستگی
  await prisma.messageRecipient.deleteMany({});
  await prisma.guardianLink.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.feePayment.deleteMany({});
  await prisma.scheduleSlot.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.grade.deleteMany({});
  await prisma.studentActivity.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.staffAttendance.deleteMany({});
  await prisma.employeeAttendance.deleteMany({});
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
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
