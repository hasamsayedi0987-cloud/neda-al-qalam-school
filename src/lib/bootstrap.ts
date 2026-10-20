/**
 * راه‌اندازی خودکار پایگاه داده — برای استقرار ابری
 *
 * در اولین درخواست، اگر پایگاه داده خالی باشد، حساب‌های پیش‌فرض ساخته می‌شوند؛
 * بنابراین یک نصب تازه روی Vercel (یا هر هاست دیگر) بلافاصله قابل ورود است.
 *
 * اگر اتصال به پایگاه داده برقرار نباشد، پیام روشن فارسی نمایش داده می‌شود
 * تا مدیر بداند باید در تنظیمات هاست، دیتابیس را متصل کند.
 */
import { db } from './db';
import { ApiError, hashPassword } from './auth';

let checked = false;

const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123', name: 'مدیر مکتب', role: 'ADMIN', phone: null as string | null },
  { username: 'sarallam', password: '12345678', name: 'سرمعلم', role: 'HEADTEACHER', phone: null },
  { username: 'teacher', password: '12345678', name: 'معلم نمونه', role: 'TEACHER', phone: null },
  { username: 'staff', password: '12345678', name: 'کارمند', role: 'STAFF', phone: null },
  { username: 'library', password: '12345678', name: 'کتابخانه‌دار', role: 'LIBRARIAN', phone: null },
  { username: 'student', password: '12345678', name: 'شاگرد نمونه', role: 'STUDENT', phone: null },
  { username: 'parent', password: '12345678', name: 'سرپرست شاگرد', role: 'GUARDIAN', phone: null },
];

export async function ensureBootstrap(): Promise<void> {
  if (checked) return;

  let count: number;
  try {
    count = await db.user.count();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('DB connection failed:', detail.split('\n')[0]);
    throw new ApiError(
      'اتصال به پایگاه داده برقرار نیست. اگر روی هاست ابری هستید، از بخش Storage یک دیتابیس (PostgreSQL) بسازید و برنامه را دوباره منتشر کنید.',
      503,
    );
  }

  if (count > 0) {
    checked = true;
    return;
  }

  // پایگاه دادهٔ خالی — ساخت حساب‌های پیش‌فرض (همزمانی امن با upsert است)
  for (const u of DEFAULT_USERS) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        password: hashPassword(u.password),
        name: u.name,
        role: u.role,
        phone: u.phone,
        active: true,
      },
    });
  }
  console.log('bootstrap: حساب‌های پیش‌فرض ساخته شدند (۷ حساب)');
  checked = true;
}
