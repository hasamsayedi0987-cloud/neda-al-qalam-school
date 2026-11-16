import { PrismaClient } from '@prisma/client'

/**
 * آدرس پایگاه داده — با پشتیبانی از هاست ابری (Vercel/Neon)
 * برخی یکپارچه‌ها به‌جای DATABASE_URL مقدار POSTGRES_URL می‌دهند؛ اینجا یکسان‌سازی می‌شود.
 */
function resolveDatabaseUrl(): string {
  let url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    'file:./db/custom.db';

  if (url.startsWith('postgres')) {
    if (!/sslmode=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
    // اتصال از طریق PgBouncer (Neon pooler) — لازم برای محیط serverless
    if (/pooler\./.test(url) && !/pgbouncer=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1';
    }
  }
  return url;
}

// کلاینت Prisma این متغیر را در زمان اجرا می‌خواند — نسخهٔ یکسان‌شده را برمی‌گردانیم
process.env.DATABASE_URL = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
