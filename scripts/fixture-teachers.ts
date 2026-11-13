/**
 * فیکسچر تست — حساب معلم صاحب صنف tv21840481 (محمد یوسف رحیمی، tch-4)
 * معلم دومی برای تست «همکاران» و «صاحب صنف» — فقط برای پایگاه دادهٔ محلی تست
 */
import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'crypto';

const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

const users = [
  { username: 'tv21840481', password: '12345678', name: 'استاد v21840481', role: 'TEACHER', teacherId: 'tch-4', studentId: null, phone: '0770987654' },
  { username: '42le7', password: '12345678', name: 'استاد پیام 42le7', role: 'TEACHER', teacherId: 'tch-5', studentId: null, phone: null },
];

async function main() {
  for (const u of users) {
    await db.user.upsert({
      where: { username: u.username },
      update: { active: true, role: u.role, teacherId: u.teacherId, name: u.name },
      create: {
        username: u.username,
        password: hashPassword(u.password),
        name: u.name,
        role: u.role,
        teacherId: u.teacherId,
        studentId: u.studentId,
        phone: u.phone,
        active: true,
      },
    });
    console.log(`✔ ${u.username} (${u.name}) آماده شد`);
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
