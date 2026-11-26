/**
 * آزمون جامع مرحلهٔ ۸ — همهٔ نقش‌ها، حاضری، QR دروازه، اعلان/پیامک، بکاپ، هم‌زمانی، امنیت، عملکرد
 * اجرا: DATABASE_URL="file:/home/z/my-project/db/test-stage8.db" BASE=http://127.0.0.1:3111 node scripts/stage8-tests.mjs
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const db = new PrismaClient();
const KABUL = 4.5 * 3600 * 1000;
const kabulDate = (d) => new Date(d.getTime() + KABUL).toISOString().slice(0, 10);
const today = kabulDate(new Date());
const results = [];
let pass = 0;
let fail = 0;

const log = (ok, suite, name, detail = '') => {
  results.push({ ok, suite, name, detail });
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${suite}] ${name}${detail ? ' — ' + detail : ''}`);
};

/* ─── HTTP helpers ─── */
const login = async (username, password) => {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username, password }),
  });
  const setCookie = res.headers.getSetCookie?.()[0] || '';
  const cookie = setCookie.split(';')[0] || '';
  let j = {};
  try { j = await res.json(); } catch { /* ignore */ }
  return { status: res.status, cookie, body: j };
};

const req = async (cookie, method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = {};
  try { j = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: j };
};

const arr = (j) => (Array.isArray(j) ? j : j?.notifications || j?.items || j?.students || j?.classes || []);

/* ═════════ T2 — لاگین همهٔ نقش‌ها + محدودیت + دسترسی‌ها ═════════ */
const C = {}; // کوکی هر نقش
const t2 = async () => {
  const roles = [
    ['admin', 'admin123', 'ADMIN'], ['sarallam', '12345678', 'HEADTEACHER'],
    ['teacher', '12345678', 'TEACHER'], ['staff', '12345678', 'STAFF'],
    ['library', '12345678', 'LIBRARIAN'], ['student', '12345678', 'STUDENT'],
    ['parent', '12345678', 'GUARDIAN'],
  ];
  for (const [u, p, role] of roles) {
    const r = await login(u, p);
    C[role] = r.cookie;
    log(r.status === 200 && r.body?.user?.role === role, 'T2-لاگین', `ورود ${role} (${u})`, r.status === 200 ? '' : `status=${r.status}`);
  }
  const bad = await login('admin', 'wrongpass');
  log(bad.status === 401 || bad.status === 400, 'T2-لاگین', 'رمز غلط رد می‌شود', `status=${bad.status}`);

  // محدودیت تلاش ورود — ۵ تلاش ناموفق، تلاش ششم باید 429 شود
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await login('nosuchuser-probe', 'x')).status;
  log(last === 429, 'T2-لاگین', 'محدودیت تلاش ورود (تلاش ششم → 429)', `status=${last}`);

  // ماتریس دسترسی — هر نقش نباید به بخش‌های غیرمجاز برسد
  const matrix = [
    ['STUDENT', C.STUDENT, '/api/students?pageSize=5', 403],
    ['GUARDIAN', C.GUARDIAN, '/api/fees?month=1404-01', 403],
    ['TEACHER', C.TEACHER, '/api/expenses', 403],
    ['TEACHER', C.TEACHER, '/api/backup', 403],
    ['HEADTEACHER', C.HEADTEACHER, '/api/backup', 403],
    ['STAFF', C.STAFF, '/api/gate?date=' + today, 200],
    ['STUDENT', C.STUDENT, '/api/attendance?date=' + today, 400], // مجاز ولی بدون صنف متصل → درخواست نامعتبر (نه 403)
  ];
  for (const [role, cookie, path, want] of matrix) {
    const r = await req(cookie, 'GET', path);
    log(r.status === want, 'T2-دسترسی', `${role} → ${path.split('?')[0]} = ${want}`, `status=${r.status}`);
  }

  // سرپرست فهرست عمومی نمی‌گیرد — فقط پروندهٔ فرزند خودش (حداکثر یک رکورد)
  const gStu = await req(C.GUARDIAN, 'GET', '/api/students?pageSize=5');
  log(gStu.status === 200 && arr(gStu.body).length <= 1, 'T2-دسترسی', 'سرپرست فقط پروندهٔ فرزند خودش را می‌بیند', `status=${gStu.status} count=${arr(gStu.body).length}`);
  // کتابخانه‌دار برای امانت کتاب به فهرست نام‌ها دسترسی دارد (طراحی نسخه‌های قبل)
  const lStu = await req(C.LIBRARIAN, 'GET', '/api/students?pageSize=5');
  log(lStu.status === 200, 'T2-دسترسی', 'کتابخانه‌دار → فهرست نام‌ها برای امانت کتاب', `status=${lStu.status}`);
  // معلم مجاز به حاضری است؛ در محیط آزمون صنف سپرده‌شده ندارد → درخواست نامعتبر (نه 403)
  const tAtt = await req(C.TEACHER, 'GET', '/api/attendance?classId=&date=' + today);
  log(tAtt.status === 200 || tAtt.status === 400, 'T2-دسترسی', 'معلم → حاضری مجاز (بدون صنف سپرده‌شده → 400)', `status=${tAtt.status}`);
};

/* ═════════ T3 — حاضری + QR دروازه ═════════ */
let TOKENS = {};
const t3 = async () => {
  const classes = arr((await req(C.ADMIN, 'GET', '/api/classes')).body);
  const classId = classes[0]?.id;
  const st = (await req(C.ADMIN, 'GET', `/api/students?classId=${classId}&pageSize=100`)).body;
  const students = arr(st).slice(0, 25);
  log(students.length === 25, 'T3-حاضری', 'دریافت ۲۵ شاگرد صنف اول', `${students.length}`);

  // ثبت حاضری — همه حاضر
  const r1 = await req(C.HEADTEACHER, 'POST', '/api/attendance', {
    date: today, classId, items: students.map((s) => ({ studentId: s.id, status: 'PRESENT' })),
  });
  log(r1.status === 200 && (r1.body?.saved ?? 0) >= 25, 'T3-حاضری', 'ثبت ۲۵ حاضری حاضر', `saved=${r1.body?.saved} status=${r1.status}`);

  // حاضری آینده رد می‌شود
  const future = kabulDate(new Date(Date.now() + 3 * 86400_000));
  const r2 = await req(C.HEADTEACHER, 'POST', '/api/attendance', {
    date: future, classId, items: students.slice(0, 3).map((s) => ({ studentId: s.id, status: 'ABSENT' })),
  });
  log(r2.status === 400 || r2.status === 403, 'T3-حاضری', 'رد حاضری برای تاریخ آینده', `status=${r2.status}`);

  // صدور توکن کارت برای شاگردان آزمون دروازه
  const gateIds = JSON.parse(process.env.GATE_IDS || '[]');
  const issue = await req(C.ADMIN, 'POST', '/api/qr', { action: 'issue', items: gateIds.map((id) => ({ kind: 'student', id })) });
  TOKENS = issue.body?.tokens || {};
  const issued = Object.keys(TOKENS).length;
  log(issue.status === 200 && issued >= 4, 'T3-QR', `صدور توکن امضاشده برای ${gateIds.length} کارت`, `issued=${issued}`);

  const tok = (i) => TOKENS[`student:${gateIds[i]}`] || '';
  const scan = (token, clientToken, clientAt) =>
    req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token, clientToken: clientToken || `t-${Math.random().toString(36).slice(2)}`, clientAt: clientAt || new Date().toISOString() });

  // ورود → خروج → ورود (رفت‌وآمد چندباره) با ساعت دستگاه
  const now = Date.now();
  const s1 = await scan(tok(0), 'a-in', new Date(now).toISOString());
  log(s1.status === 200 && s1.body?.kind === 'IN', 'T3-QR', 'اسکن اول = ورود', `clock=${s1.body?.clock}`);
  const s2 = await scan(tok(0), 'a-out', new Date(now + 60_000).toISOString());
  log(s2.status === 200 && s2.body?.kind === 'OUT', 'T3-QR', 'اسکن دوم = خروج', `clock=${s2.body?.clock}`);
  const s3 = await scan(tok(0), 'a-in2', new Date(now + 120_000).toISOString());
  log(s3.status === 200 && s3.body?.kind === 'IN', 'T3-QR', 'اسکن سوم = ورود دوباره (چرخهٔ جدید)', `clock=${s3.body?.clock}`);

  // اسکن تکراری فوری رد می‌شود
  const s4 = await scan(tok(0), 'a-dup', new Date(now + 120_000).toISOString());
  log(s4.status === 409, 'T3-QR', 'اسکن تکراری (کمتر از ۴۵ ثانیه) → 409', `status=${s4.status}`);

  // توکن دستکاری‌شده و آشغال
  const tampered = tok(3).slice(0, -6) + 'XXXXXX';
  const s5 = await scan(tampered, 'a-tamper');
  log(s5.status === 400, 'T3-QR', 'توکن دستکاری‌شده → 400', `status=${s5.status}`);
  const s6 = await scan('garbage-not-a-token', 'a-garbage');
  log(s6.status === 400, 'T3-QR', 'کد آشغال → 400', `status=${s6.status}`);

  // لغو کارت گم‌شده → اسکن رد؛ بازگردانی → کار می‌کند
  const rv = await req(C.ADMIN, 'POST', '/api/qr', { action: 'revoke', id: gateIds[1] });
  const s7 = await scan(tok(1), 'a-revoked');
  log(rv.status === 200 && s7.status === 410, 'T3-QR', 'کارت لغوشده → 410', `status=${s7.status}`);
  await req(C.ADMIN, 'POST', '/api/qr', { action: 'restore', id: gateIds[1] });
  const s8 = await scan(tok(1), 'a-restored', new Date(now + 180_000).toISOString());
  log(s8.status === 200 && s8.body?.kind === 'IN', 'T3-QR', 'بازگردانی کارت → دوباره کار می‌کند', `clock=${s8.body?.clock}`);

  // سرپرست فقط کد کارت خودش را می‌تواند باز کند (GET /api/qr)
  const own = await req(C.ADMIN, 'POST', '/api/qr', { action: 'issue', items: [{ kind: 'student', id: process.env.OWN_STUDENT_ID }] });
  const ownTok = own.body?.tokens?.[`student:${process.env.OWN_STUDENT_ID}`] || '';
  const gOwn = await req(C.GUARDIAN, 'GET', `/api/qr?t=${encodeURIComponent(ownTok)}`);
  log(gOwn.status === 200 && gOwn.body?.kind === 'student', 'T3-QR', 'سرپرست کارت شاگرد خودش', `status=${gOwn.status}`);
  const gOther = await req(C.GUARDIAN, 'GET', `/api/qr?t=${encodeURIComponent(tok(2))}`);
  log(gOther.status === 403, 'T3-QR', 'سرپرست کارت شاگرد دیگر → 403', `status=${gOther.status}`);
  const gGate = await req(C.GUARDIAN, 'POST', '/api/gate', { action: 'scan', token: tok(2), clientAt: new Date().toISOString() });
  log(gGate.status === 403, 'T3-QR', 'سرپرست حق اسکن دروازه ندارد → 403', `status=${gGate.status}`);

  // تاریخچهٔ دروازه
  const hist = await req(C.STAFF, 'GET', `/api/gate?date=${today}`);
  log(hist.status === 200 && hist.body?.ins > 0 && hist.body?.logs?.length > 0, 'T3-QR', 'تاریخچهٔ دروازهٔ امروز (ورود/خروج/داخل مکتب)', `ins=${hist.body?.ins} outs=${hist.body?.outs} inside=${hist.body?.inside} logs=${hist.body?.logs?.length}`);
  TOKENS = { ...TOKENS, ownTok };
};

/* ═════════ T4 — اعلان و پیامک والدین ═════════ */
const notifCount = async (needle) => {
  const r = await req(C.GUARDIAN, 'GET', '/api/notifications');
  const list = arr(r.body);
  return needle ? list.filter((n) => (n.title || '') + (n.body || '')).filter((n) => ((n.title || '') + (n.body || '')).includes(needle)).length : list.length;
};

const t4 = async () => {
  const beforeAbsent = await notifCount('غیبت');
  const classes = arr((await req(C.ADMIN, 'GET', '/api/classes')).body);
  const classId = classes[0]?.id;
  const students = arr((await req(C.ADMIN, 'GET', `/api/students?classId=${classId}&pageSize=100`)).body).slice(0, 3);
  await req(C.HEADTEACHER, 'POST', '/api/attendance', { date: today, classId, items: students.map((s) => ({ studentId: s.id, status: 'ABSENT' })) });
  const afterAbsent = await notifCount('غیبت');
  log(afterAbsent > beforeAbsent, 'T4-اعلان', 'اعلان غیبت برای سرپرست رسید', `${beforeAbsent}→${afterAbsent}`);

  // ثبت دوبارهٔ همان غیبت — اعلان تکراری ساخته نمی‌شود
  await req(C.HEADTEACHER, 'POST', '/api/attendance', { date: today, classId, items: students.map((s) => ({ studentId: s.id, status: 'ABSENT' })) });
  const afterRepeat = await notifCount('غیبت');
  log(afterRepeat === afterAbsent, 'T4-اعلان', 'ثبت دوبارهٔ غیبت → اعلان تکراری ندارد', `${afterAbsent}→${afterRepeat}`);

  // اعلان ورود/خروج — شاگردِ پیوند‌شده با سرپرست
  const ownId = process.env.OWN_STUDENT_ID;
  const beforeIn = await notifCount('ورود شاگرد');
  const gin = await req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token: TOKENS.ownTok, clientToken: 'n-in', clientAt: new Date().toISOString() });
  const afterIn = await notifCount('ورود شاگرد');
  log(gin.status === 200 && afterIn > beforeIn, 'T4-اعلان', 'اعلان «ورود شاگرد» برای سرپرست', `${beforeIn}→${afterIn} kind=${gin.body?.kind}`);

  // پیامک والدین — فعال‌سازی مدیر + بررسی صف
  await req(C.ADMIN, 'POST', '/api/gate', { action: 'config', smsOn: true });
  const beforeSms = await db.smsOutbox.count({ where: { category: 'GATE' } });
  const gout = await req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token: TOKENS.ownTok, clientToken: 'n-out', clientAt: new Date(Date.now() + 60_000).toISOString() });
  const sms = await db.smsOutbox.findMany({ where: { category: 'GATE' }, orderBy: { createdAt: 'desc' } });
  log(gout.status === 200 && sms.length > beforeSms, 'T4-پیامک', 'صف پیامک خروج ساخته شد (وضعیت PENDING تا ارسال دروازه)', `rows=${sms.length} clientToken=${sms[0]?.clientToken?.startsWith('GATE:') ? 'یکتا' : '؟'}`);

  // لغو ثبت → پیامک در صف هم لغو می‌شود (ثبت با clientToken مستقیم پیدا می‌شود)
  const undone = await db.gateLog.findUnique({ where: { clientToken: 'n-out' }, select: { id: true } });
  const beforePending = await db.smsOutbox.count({ where: { category: 'GATE', status: 'PENDING' } });
  const undo = await req(C.ADMIN, 'POST', '/api/gate', { action: 'undo', logId: undone?.id });
  const afterPending = await db.smsOutbox.count({ where: { category: 'GATE', status: 'PENDING' } });
  log(undo.status === 200 && !!undone && afterPending < beforePending, 'T4-پیامک', 'لغو ثبت خروج → پیامک در صف هم لغو شد', `${beforePending}→${afterPending}`);
  await req(C.ADMIN, 'POST', '/api/gate', { action: 'config', smsOn: false });
};

/* ═════════ T5 — پشتیبان‌گیری و بازیابی ═════════ */
const t5 = async () => {
  const bk = await fetch(`${BASE}/api/backup`, { headers: { Cookie: C.ADMIN } });
  const backup = await bk.json();
  const snap = {
    students: await db.student.count(),
    gateLogs: await db.gateLog.count(),
    classes: await db.class.count(),
    attendance: await db.attendanceRecord.count(),
    sms: await db.smsOutbox.count(),
  };
  log(bk.status === 200 && backup?.version === 6 && backup?.data?.gateLogs?.length === snap.gateLogs, 'T5-بکاپ', 'خروجی پشتیبان نسخهٔ ۶ شامل تاریخچهٔ دروازه', `gateLogs=${backup?.data?.gateLogs?.length}/${snap.gateLogs}`);

  // شاگرد نشان‌دار — پس از بازیابی باید نباشد
  const classes = arr((await req(C.ADMIN, 'GET', '/api/classes')).body);
  const mk = await req(C.ADMIN, 'POST', '/api/students', { firstName: 'MARKER_TEST', fatherName: 'آزمون بازیابی', classId: classes[0]?.id, rollNo: 990, clientToken: 'marker-1' });
  log(mk.status === 200, 'T5-بکاپ', 'ساخت شاگرد نشان‌دار پیش از بازیابی', `status=${mk.status}`);

  const restore = await req(C.ADMIN, 'POST', '/api/backup', { version: backup.version, data: backup.data });
  log(restore.status === 200 && restore.body?.ok === true, 'T5-بکاپ', 'بازیابی کامل پشتیبان', `status=${restore.status}`);

  const after = {
    students: await db.student.count(),
    gateLogs: await db.gateLog.count(),
    classes: await db.class.count(),
    attendance: await db.attendanceRecord.count(),
    sms: await db.smsOutbox.count(),
  };
  const same = Object.keys(snap).every((k) => snap[k] === after[k]);
  log(same, 'T5-بکاپ', 'شمارش‌ها پس از بازیابی دقیقاً برابر snapshot', JSON.stringify(after));
  const marker = await req(C.ADMIN, 'GET', '/api/students?q=MARKER_TEST&pageSize=10');
  log(arr(marker.body).length === 0, 'T5-بکاپ', 'شاگرد نشان‌دار پس از بازیابی حذف شده (بازگشت به لحظهٔ پشتیبان)', `found=${arr(marker.body).length}`);

  // پس از بازیابی، سامانه کار می‌کند (نشست‌ها باطل شده‌اند — لاگین تازهٔ همهٔ نقش‌های مورد نیاز)
  for (const [u, p, role] of [['admin', 'admin123', 'ADMIN'], ['sarallam', '12345678', 'HEADTEACHER'], ['staff', '12345678', 'STAFF']]) {
    const r = await login(u, p);
    C[role] = r.cookie;
    if (r.status !== 200) console.log(`relogin ${role} status=${r.status}`);
  }
  const gateAfter = await req(C.ADMIN, 'GET', `/api/gate?date=${today}`);
  log(gateAfter.status === 200 && gateAfter.body?.logs?.length > 0, 'T5-بکاپ', 'پس از بازیابی: لاگین تازه و تاریخچهٔ دروازه سالم', `logs=${gateAfter.body?.logs?.length}`);
};

/* ═════════ T6 — هم‌زمانی ═════════ */
const t6 = async () => {
  const tok = TOKENS[`student:${(JSON.parse(process.env.GATE_IDS || '[]'))[3]}`] || '';
  // ۲۰ اسکن موازی با clientTokenهای متفاوت
  const scans = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token: tok, clientToken: `race-${i}`, clientAt: new Date().toISOString() }),
    ),
  );
  const ok20 = scans.filter((r) => r.status === 200).length;
  const dup20 = scans.filter((r) => r.status === 409).length;
  const raceId = (JSON.parse(process.env.GATE_IDS || '[]'))[3];
  const raceLogs = await db.gateLog.count({ where: { studentId: raceId, date: today } });
  log(ok20 === 1 && dup20 === 19 && ok20 + dup20 === 20, 'T6-هم‌زمانی', '۲۰ اسکن هم‌زمان → دقیقاً یک ثبت، ۱۹ تکراری', `ok=${ok20} dup=${dup20}`);
  log(raceLogs === 1, 'T6-هم‌زمانی', 'در پایگاه داده فقط یک ثبت برای ۲۰ اسکن موازی', `logs=${raceLogs}`);

  // replay صف آفلاین — همان clientToken ده بار
  const tokR = TOKENS[`student:${(JSON.parse(process.env.GATE_IDS || '[]'))[4]}`] || '';
  const at = new Date(Date.now() - 3600_000).toISOString(); // یک ساعت پیش — شبیه‌سازی اسکن آفلاین
  const replays = await Promise.all(
    Array.from({ length: 10 }, () =>
      req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token: tokR, clientToken: 'replay-fixed-1', clientAt: at }),
    ),
  );
  const replayOk = replays.filter((r) => r.status === 200).length;
  const replayLogs = await db.gateLog.count({ where: { clientToken: 'replay-fixed-1' } });
  log(replayOk === 10 && replayLogs === 1, 'T6-هم‌زمانی', 'replay ۱۰گانهٔ یک اسکن آفلاین → دقیقاً یک ثبت، ساعتِ اسکن حفظ شد', `ok=${replayOk} logs=${replayLogs}`);
  const saved = await db.gateLog.findFirst({ where: { clientToken: 'replay-fixed-1' } });
  const drift = Math.abs(new Date(saved.at).getTime() - new Date(at).getTime());
  log(drift < 5000, 'T6-هم‌زمانی', 'ساعت ثبت = ساعت اسکن آفلاین (نه ساعت وصل شدن)', `اختلاف=${Math.round(drift)}ms`);

  // ثبت موازی ۱۰ شاگرد با شمارهٔ تکراری در یک صنف
  const classes = arr((await req(C.ADMIN, 'GET', '/api/classes')).body);
  const created = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      req(C.ADMIN, 'POST', '/api/students', {
        firstName: `RACE_${i}`, fatherName: 'هم‌زمانی', classId: classes[0]?.id, rollNo: 777,
        clientToken: `race-stu-${i}`,
      }),
    ),
  );
  const okCreate = created.filter((r) => r.status === 200).length;
  const dupInDb = await db.student.count({ where: { firstName: { startsWith: 'RACE_' }, classId: classes[0]?.id } });
  log(okCreate === 1 && dupInDb === 1, 'T6-هم‌زمانی', 'ثبت موازی با شمارهٔ تکراری → دقیقاً یک ثبت واقعی', `ok=${okCreate} inDb=${dupInDb}`);
  // پاک‌سازی شاگردان آزمون هم‌زمانی
  await db.student.deleteMany({ where: { firstName: { startsWith: 'RACE_' } } });

  // ۱۰ لاگین هم‌زمان یک کاربر — قفل اشتباهی ندارد
  const logins = await Promise.all(Array.from({ length: 10 }, () => login('staff', '12345678')));
  const okLogins = logins.filter((r) => r.status === 200).length;
  log(okLogins === 10, 'T6-هم‌زمانی', '۱۰ لاگین هم‌زمان موفق — قفس اشتباهی ندارد', `ok=${okLogins}`);
};

/* ═════════ T7 — امنیت ═════════ */
const t7 = async () => {
  // دسترسی بدون نشست
  const paths = ['/api/students?pageSize=5', '/api/attendance?date=' + today, '/api/gate?date=' + today, '/api/qr', '/api/backup', '/api/fees?month=x', '/api/sms', '/api/users', '/api/backup'];
  for (const p of paths) {
    const r = await req('', 'GET', p);
    log(r.status === 401 || r.status === 403, 'T7-امنیت', `بدون نشست → ${p.split('?')[0]} رد می‌شود`, `status=${r.status}`);
  }

  // توکن جعل‌شده — payload درست، امضای غلط
  const forged = Buffer.from(JSON.stringify({ kind: 'student', id: 'x', iat: 9999999999, jti: 'y' })).toString('base64url') + '.forged-signature';
  const f1 = await req(C.STAFF, 'POST', '/api/gate', { action: 'scan', token: forged, clientAt: new Date().toISOString() });
  log(f1.status === 400, 'T7-امنیت', 'توکن QR جعلی (امضای غلط) → 400', `status=${f1.status}`);

  // تزریق SQL در جستجو — نباید ۵۰۰ بدهد و نباید همه را برگرداند
  const sqli = await req(C.ADMIN, 'GET', `/api/students?q=${encodeURIComponent("' OR 1=1 --")}&pageSize=5`);
  log(sqli.status === 200 && arr(sqli.body).length <= 5, 'T7-امنیت', 'تزریق SQL در جستجو → پاسخ امن', `status=${sqli.status} results=${arr(sqli.body).length}`);

  // XSS — ذخیره می‌شود ولی در JSON خروجی محتوای خام است (رندر UI escape می‌کند)
  const classes = arr((await req(C.ADMIN, 'GET', '/api/classes')).body);
  const xss = await req(C.ADMIN, 'POST', '/api/students', { firstName: '<img src=x onerror=alert(1)>', fatherName: 'x', classId: classes[0]?.id, rollNo: 998, clientToken: 'xss-1' });
  log(xss.status === 200, 'T7-امنیت', 'رشتهٔ XSS به‌عنوان داده ذخیره می‌شود (UI با escape رندر می‌کند)', `status=${xss.status}`);
  const xssId = xss.body?.student?.id || xss.body?.id;
  if (xssId) await req(C.ADMIN, 'DELETE', `/api/students?id=${xssId}`);

  // کوکی دستکاری‌شده
  const badCookie = await req('noq_session=eyJ1aWQiOiJoYWNrIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxfQ.bad', 'GET', '/api/students?pageSize=5');
  log(badCookie.status === 401 || badCookie.status === 403, 'T7-امنیت', 'کوکی جعلی/امضای غلط → رد می‌شود', `status=${badCookie.status}`);

  // نشست نقش پایین‌تر نمی‌تواند خودش را مدیر کند
  const promote = await req(C.TEACHER, 'POST', '/api/users', { action: 'promote', username: 'teacher' });
  log(promote.status === 401 || promote.status === 403, 'T7-امنیت', 'معلم نمی‌تواند صلاحیت خودش را تغییر دهد', `status=${promote.status}`);
};

/* ═════════ T8 — عملکرد با ۱۰۵۰ شاگرد ═════════ */
const t8 = async () => {
  const time = async (fn, n = 15) => {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      const r = await fn();
      if (r?.status && r.status >= 400 && r.status !== 401 && r.status !== 403) throw new Error(`status ${r.status}`);
      xs.push(performance.now() - t0);
    }
    xs.sort((a, b) => a - b);
    return { p50: Math.round(xs[Math.floor(n / 2)]), p95: Math.round(xs[Math.floor(n * 0.95)]), max: Math.round(xs[n - 1]) };
  };
  const G = async (path) => req(C.ADMIN, 'GET', path);
  const classes = arr((await G('/api/classes')).body);
  const classId = classes[0]?.id;
  const students = arr((await G(`/api/students?classId=${classId}&pageSize=100`)).body);

  const tests = [
    ['GET /api/classes', () => G('/api/classes')],
    ['GET /api/students (صفحهٔ ۵۰)', () => G('/api/students?pageSize=50&page=1')],
    ['GET /api/students (جستجو «احمد»)', () => G(`/api/students?q=${encodeURIComponent('احمد')}&pageSize=50`)],
    ['GET /api/students (صنف ۱۰۰تایی)', () => G(`/api/students?classId=${classId}&pageSize=100`)],
    ['GET /api/dashboard', () => G('/api/dashboard')],
    ['GET /api/gate (تاریخ امروز)', () => G(`/api/gate?date=${today}`)],
    ['GET /api/attendance', () => G(`/api/attendance?classId=${classId}&date=${today}`)],
    ['GET /api/students?all=1 (سنگین)', () => G('/api/students?all=1')],
    ['POST /api/attendance (۵۰ رکورد)', async () => req(C.HEADTEACHER, 'POST', '/api/attendance', { date: today, classId, items: students.slice(0, 50).map((s) => ({ studentId: s.id, status: 'PRESENT' })) })],
  ];
  for (const [name, fn] of tests) {
    try {
      const t = await time(fn, name.includes('سنگین') ? 5 : 15);
      log(t.p95 < (name.includes('سنگین') ? 8000 : 2500), 'T8-عملکرد', name, `p50=${t.p50}ms p95=${t.p95}ms max=${t.max}ms`);
    } catch (e) {
      log(false, 'T8-عملکرد', name, String(e.message).slice(0, 60));
    }
  }
  const bk0 = performance.now();
  const bk = await fetch(`${BASE}/api/backup`, { headers: { Cookie: C.ADMIN } });
  const bkBytes = (await bk.arrayBuffer()).byteLength;
  log(performance.now() - bk0 < 15000, 'T8-عملکرد', 'GET /api/backup (کل دیتابیس)', `${Math.round(performance.now() - bk0)}ms حجم=${Math.round(bkBytes / 1024)}KB`);
};

/* ═════════ اجرا ═════════ */
const main = async () => {
  const t0 = performance.now();
  await t2();
  await t3();
  await t4();
  await t5();
  await t6();
  await t7();
  await t8();
  const secs = Math.round((performance.now() - t0) / 1000);
  writeFileSync('/home/z/my-project/scripts/stage8-results.json', JSON.stringify({ pass, fail, secs, results }, null, 2));
  console.log(`\n===== ${pass} PASS / ${fail} FAIL — ${secs}s =====`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
