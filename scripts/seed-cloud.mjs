/**
 * ثبت حساب‌های پیش‌فرض در پایگاه دادهٔ ابری (idempotent — فقط اگر وجود نداشته باشند)
 * در زمان Build روی Vercel اجرا می‌شود؛ اگر اتصال نبود، ساخت را متوقف نمی‌کند.
 *
 * حساب‌های پیش‌فرض:
 *   admin/admin123 — بقیه: 12345678
 */
import { scryptSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', name: 'حسام الدین سیدی', role: 'ADMIN', teacherId: null, studentId: null, phone: '0791680632' },
  { username: 'sarallam', password: '12345678', name: 'عبدالبصیر نظری', role: 'HEADTEACHER', teacherId: null, studentId: null, phone: null },
  { username: 'teacher', password: '12345678', name: 'فاطمه احمدی', role: 'TEACHER', teacherId: null, studentId: null, phone: null },
  { username: 'staff', password: '12345678', name: 'علی جان نظربیک', role: 'STAFF', teacherId: null, studentId: null, phone: null },
  { username: 'library', password: '12345678', name: 'خدیجه صادقی', role: 'LIBRARIAN', teacherId: null, studentId: null, phone: null },
  { username: 'student', password: '12345678', name: 'شاگرد نمونه', role: 'STUDENT', teacherId: null, studentId: null, phone: null },
  { username: 'parent', password: '12345678', name: 'سرپرست شاگرد', role: 'GUARDIAN', teacherId: null, studentId: null, phone: null },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    let n = 0;
    for (const u of DEFAULT_USERS) {
      const exists = await prisma.user.findUnique({ where: { username: u.username } });
      if (exists) continue;
      await prisma.user.create({
        data: {
          username: u.username,
          password: hashPassword(u.password),
          name: u.name,
          role: u.role,
          phone: u.phone,
          teacherId: u.teacherId,
          studentId: u.studentId,
          active: true,
        },
      });
      n++;
      console.log(`✓ حساب ساخته شد: ${u.username}`);
    }
    console.log(`▸ seed کامل — ${n} حساب جدید (مجموع: ${await prisma.user.count()})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.warn('⚠ seed-cloud:', e instanceof Error ? e.message.split('\n')[0] : e);
  process.exit(0); // ساخت را متوقف نکن — bootstrap داخل برنامه جبران می‌کند
});
