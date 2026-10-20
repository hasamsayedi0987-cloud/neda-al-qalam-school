/**
 * بازنشانی رمز حساب‌های پیش‌فرض به مقادیر مستند شده در صفحهٔ ورود
 * admin/admin123 — بقیه 12345678
 */
import { scryptSync, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const DEFAULTS = {
  admin: 'admin123',
  sarallam: '12345678',
  teacher: '12345678',
  student: '12345678',
  parent: '12345678',
  library: '12345678',
  staff: '12345678',
};

async function main() {
  let n = 0;
  for (const [username, password] of Object.entries(DEFAULTS)) {
    const u = await prisma.user.findUnique({ where: { username } });
    if (!u) continue;
    await prisma.user.update({ where: { id: u.id }, data: { password: hashPassword(password) } });
    n++;
    console.log(`✓ ${username} → ${password}`);
  }
  console.log(`تعداد: ${n}`);
}

main().finally(() => prisma.$disconnect());
