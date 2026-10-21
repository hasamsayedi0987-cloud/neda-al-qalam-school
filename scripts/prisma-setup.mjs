/**
 * آماده‌سازی Prisma برای ساخت (Build) — سازگار با هاست محلی و Vercel
 *
 * منطق:
 *  - اگر DATABASE_URL (یا POSTGRES_URL) از نوع postgres باشد → اسکیمای PostgreSQL فعال می‌شود:
 *      ۱) ایجاد جدول‌ها (db push) با اتصال مستقیم (غیر-pooler)
 *      ۲) ساخت کلاینت Prisma از اسکیمای postgres
 *      ۳) ثبت حساب‌های پیش‌فرض (seed) — اگر خطا داد، ساخت را متوقف نمی‌کند
 *  - در غیر این صورت → همان اسکیمای SQLite محلی (فایل db/custom.db)
 *
 * استفاده:  node scripts/prisma-setup.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PG_SCHEMA = 'prisma/schema.postgres.prisma';
const SQLITE_SCHEMA = 'prisma/schema.prisma';

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  return r.status === 0;
}

function pgUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    '';
  return /^postgres(ql)?:\/\//.test(raw) ? raw : '';
}

/** افزودن پارامترهای لازم به اتصال PostgreSQL */
function normalizePgUrl(url, { forPush = false } = {}) {
  let u = url;
  // برای db push اتصال مستقیم (غیر pooler) بهتر است
  if (forPush) {
    const direct =
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DIRECT_DATABASE_URL ||
      '';
    if (direct && /^postgres(ql)?:\/\//.test(direct)) u = direct;
  }
  if (!/sslmode=/.test(u)) u += (u.includes('?') ? '&' : '?') + 'sslmode=require';
  // اتصال از طریق PgBouncer (Neon pooler) برای Prisma
  if (/pooler\./.test(u) && !/pgbouncer=/.test(u)) {
    u += (u.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1';
  }
  return u;
}

const url = pgUrl();

if (!url) {
  console.log('▸ prisma-setup: حالت SQLite محلی (DATABASE_URL یافت نشد)');
  if (!existsSync(SQLITE_SCHEMA)) {
    console.error('✗ اسکیمای SQLite یافت نشد: ' + SQLITE_SCHEMA);
    process.exit(1);
  }
  const ok = run('npx', ['prisma', 'generate', '--schema', SQLITE_SCHEMA]);
  process.exit(ok ? 0 : 1);
}

console.log('▸ prisma-setup: حالت PostgreSQL ابری شناسایی شد');

// ۱) ایجاد/به‌روزرسانی جدول‌ها با اتصال مستقیم
const pushUrl = normalizePgUrl(url, { forPush: true });
const pushed = run('npx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate', '--schema', PG_SCHEMA], {
  DATABASE_URL: pushUrl,
});
if (!pushed) {
  console.error('✗ اتصال به پایگاه داده برقرار نشد — جدول‌ها ساخته نشدند.');
  console.error('  لطفاً DATABASE_URL را در تنظیمات هاست بررسی کنید.');
  // ساخت را متوقف نمی‌کنیم؛ برنامه بالا می‌آید و در UI پیام روشن نمایش می‌دهد
}

// ۲) ساخت کلاینت Prisma برای PostgreSQL
const generated = run('npx', ['prisma', 'generate', '--schema', PG_SCHEMA], {
  DATABASE_URL: url,
});
if (!generated) {
  console.error('✗ ساخت کلاینت Prisma ناموفق بود');
  process.exit(1);
}

// ۳) ثبت حساب‌های پیش‌فرض (غیرمسدودکننده)
const seeded = run('node', ['scripts/seed-cloud.mjs'], { DATABASE_URL: url });
if (!seeded) {
  console.warn('⚠ seed انجام نشد — برنامه هنگام اولین ورود خودش حساب‌ها را می‌سازد (bootstrap)');
}

console.log('✓ prisma-setup کامل شد');
process.exit(0);
