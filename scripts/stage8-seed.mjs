/**
 * دادهٔ آزمون مرحلهٔ ۸ — ۸ صنف، ۱۰۵۰ شاگرد، پیوند سرپرست، ~۲۰۰۰ ثبت دروازه
 * اجرا: DATABASE_URL="file:/home/z/my-project/db/test-stage8.db" node scripts/stage8-seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const db = new PrismaClient();
const hash = (p) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(p, salt, 64).toString('hex')}`;
};

const KABUL = 4.5 * 3600 * 1000;
const kabulDate = (d) => new Date(d.getTime() + KABUL).toISOString().slice(0, 10);

const FIRST_M = ['احمد', 'محمود', 'مصطفی', 'ابوبکر', 'عثمان', 'علی', 'حسین', 'ابراهیم', 'یوسف', 'اسماعیل', 'زکریا', 'یحیی', 'شمس‌الله', 'نورالله', 'عبدالرحمن', 'عبدالواسع', 'حمیدالله', 'مرادالله', 'بسم‌الله', 'لطف‌الله'];
const FIRST_F = ['مریم', 'زهرا', 'فاطمه', 'خدیجه', 'آیشه', 'نرگس', 'گلبهار', 'شکیبا', 'فرشته', 'نغمه', 'ملالی', 'ژاک', 'حبیبه', 'ذکیه', 'نازبهار', 'طاهره', 'سلطان‌بگم', 'گلنار', 'شبنم', 'ثریا'];
const LAST = ['احمدی', 'کریمی', 'رحیمی', 'نوری', 'ساداتی', 'هاشمی', 'قادری', 'یوسفی', 'موسوی', 'عزیزی', 'نجفی', 'حسینی', 'بهرامی', 'عثمانی'];
const FATHER = ['محمد', 'عبدالله', 'غلام', 'کریم', 'رحیم', 'حمید', 'نور', 'شیر', 'بچگل', 'دستگیر'];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

const CLASSES = [
  { name: 'نهم الف', grade: 9 }, { name: 'نهم ب', grade: 9 },
  { name: 'دهم الف', grade: 10 }, { name: 'دهم ب', grade: 10 },
  { name: 'یازدهم الف', grade: 11 }, { name: 'یازدهم ب', grade: 11 },
  { name: 'دوازدهم الف', grade: 12 }, { name: 'دوازدهم ب', grade: 12 },
];

const main = async () => {
  // ─── حساب‌های پیش‌فرض (مشابه bootstrap) — تا bootstrap بعداً از آن‌ها می‌پرد ───
  const DEFAULT_USERS = [
    { username: 'admin', password: 'admin123', name: 'مدیر مکتب', role: 'ADMIN' },
    { username: 'sarallam', password: '12345678', name: 'سرمعلم', role: 'HEADTEACHER' },
    { username: 'teacher', password: '12345678', name: 'معلم نمونه', role: 'TEACHER' },
    { username: 'staff', password: '12345678', name: 'کارمند', role: 'STAFF' },
    { username: 'library', password: '12345678', name: 'کتابخانه‌دار', role: 'LIBRARIAN' },
    { username: 'student', password: '12345678', name: 'شاگرد نمونه', role: 'STUDENT' },
    { username: 'parent', password: '12345678', name: 'سرپرست شاگرد', role: 'GUARDIAN' },
  ];
  for (const u of DEFAULT_USERS) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, password: hash(u.password), phone: null, active: true },
    });
  }

  // ─── صنف‌ها ───
  const classIds = [];
  for (const { name, grade } of CLASSES) {
    let c = await db.class.findFirst({ where: { name } });
    if (!c) c = await db.class.create({ data: { name, grade } });
    classIds.push(c.id);
  }

  // ─── شاگردان: ۱۰۵۰ ───
  const existing = await db.student.count();
  if (existing < 1000) {
    const rows = [];
    let idx = 0;
    for (let ci = 0; ci < CLASSES.length; ci++) {
      const count = ci === 0 ? 140 : 130;
      for (let r = 1; r <= count; r++) {
        const male = idx % 2 === 0;
        rows.push({
          firstName: male ? pick(FIRST_M) : pick(FIRST_F),
          lastName: pick(LAST),
          fatherName: pick(FATHER),
          grandFather: pick(FATHER),
          gender: male ? 'M' : 'F',
          classId: classIds[ci],
          rollNo: r,
          guardianName: pick(FATHER) + ' ' + pick(LAST),
          guardianPhone: idx === 0 ? '07000000001' : (rnd(10) < 6 ? '07' + String(10000000 + rnd(89999999)) : null),
          status: idx >= 1045 ? 'LEFT' : 'ACTIVE',
          enrolledYear: '1404',
        });
        idx++;
      }
    }
    await db.student.createMany({ data: rows });
  }

  // ─── سرپرست: پیوند مستقیم + GuardianLink ───
  const firstTwo = await db.student.findMany({ orderBy: { createdAt: 'asc' }, take: 3, select: { id: true } });
  const parent = await db.user.upsert({
    where: { username: 'parent' },
    update: { studentId: firstTwo[0].id, active: true },
    create: { username: 'parent', password: hash('12345678'), name: 'سرپرست آزمون', role: 'GUARDIAN', studentId: firstTwo[0].id, active: true },
  });
  for (const st of [firstTwo[1], firstTwo[2]]) {
    await db.guardianLink.upsert({
      where: { userId_studentId: { userId: parent.id, studentId: st.id } },
      update: {},
      create: { userId: parent.id, studentId: st.id },
    });
  }

  // ─── شاگردانِ آزمون‌های عملی دروازه — از صنف آخر؛ بدون هم‌پوشانی با ۱۰۰ شاگردِ دادهٔ ثبت‌ها ───
  const gateStudents = await db.student.findMany({
    where: { classId: classIds[7], status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    take: 10,
    select: { id: true },
  });

  // ─── ثبت‌های دروازه: امروز ~۱۸۰ + ده روز گذشته ~۱۸۰۰ (در اجرای دوباره رد می‌شود) ───
  if ((await db.gateLog.count()) < 500) {
    const logs = [];
    const activeSample = await db.student.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true } });
    const day = 24 * 3600 * 1000;
    const now = new Date();
    for (let d = 0; d <= 10; d++) {
      const base = new Date(now.getTime() - d * day);
      for (const [i, st] of activeSample.entries()) {
        const inAt = new Date(base);
        inAt.setUTCHours(2 + rnd(2), rnd(60), rnd(60), 0); // ~۶:۳۰–۸:۳۰ کابل
        logs.push({ studentId: st.id, date: kabulDate(inAt), kind: 'IN', at: inAt, byName: 'نگهبان آزمون', method: 'QR' });
        if (i < 80) {
          const outAt = new Date(base);
          outAt.setUTCHours(9 + rnd(3), rnd(60), rnd(60), 0); // ~۱۲:۳۰–۱۵:۳۰ کابل
          logs.push({ studentId: st.id, date: kabulDate(outAt), kind: 'OUT', at: outAt, byName: 'نگهبان آزمون', method: 'QR' });
        }
        if (logs.length > 800) {
          await db.gateLog.createMany({ data: logs.splice(0) });
        }
      }
    }
    if (logs.length) await db.gateLog.createMany({ data: logs });
  }

  const counts = {
    classes: await db.class.count(),
    students: await db.student.count(),
    gateLogs: await db.gateLog.count(),
    gateLogsToday: await db.gateLog.count({ where: { date: kabulDate(new Date()) } }),
    guardianLinks: await db.guardianLink.count(),
  };
  console.log('SEED_DONE', JSON.stringify(counts));
  console.log('GATE_TEST_STUDENTS', JSON.stringify(gateStudents.map((s) => s.id)));
  await db.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
