/**
 * تست جامع نسخهٔ ۲.۴.۱ — اعلان‌ها + پیام‌ها (tombstone/ویرایش) + حاضری پرسنل + حالت تاریک
 *
 * ۰) API: پیوند اعلان↔پیام (ساخت، پاک‌شدن پس از خواندن، پاک‌شدن پس از فراخوانی)
 * ۱) API: حذف برای هر دو طرف — گیرنده «این پیام حذف شد» می‌بیند
 * ۲) API: حاضری پرسنل بر پایهٔ حساب کاربری (معلم/کارمند/مدیر/کتابخانه) + مهاجرت StaffAttendance + گاردها
 * ۳) UI دسکتاپ: کادر پیام همیشه در پایین، حاضری پرسنل، اعلان‌ها (حذف تک‌تک)، حالت تاریک
 * ۴) UI موبایل: فشردن طولانی → ویرایش (۵ ثانیه غیرفعال سپس فعال) + حذف برای هر دو طرف + تب‌های حاضری بدون بیرون‌زدگی
 */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const STAMP = Date.now().toString(36);
const db = new PrismaClient();
let passed = 0, failed = 0;
const fails = [];
const createdMsgIds = [];
const createdAttendKeys = []; // [userId, date]

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✘ ${name} ${extra}`); }
}

async function apiLogin(u, p) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: u, password: p }),
  });
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
}

async function api(method, url, body, cookie) {
  const res = await fetch(`${BASE}${url}`, {
    method, headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

function isoDaysAgo(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function killServer() {
  try {
    const out = execSync("ss -tlnp | grep ':3000 ' || true").toString();
    const m = out.match(/pid=(\d+)/);
    if (m) { try { execSync(`kill -9 ${m[1]}`); } catch { /* already dead */ } }
  } catch { /* ignore */ }
}

async function startServer() {
  spawn('node', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project', detached: true, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db', PORT: '3000', HOSTNAME: '127.0.0.1' },
  }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const r = await fetch(`${BASE}/api/auth`); if (r.ok) return true; } catch { /* retry */ }
  }
  return false;
}

(async () => {
  killServer();
  await new Promise((r) => setTimeout(r, 800));
  if (!(await startServer())) { console.error('سرور بالا نیامد'); process.exit(2); }
  const browser = await chromium.launch();
  const errors = [];
  const T = isoDaysAgo(0);

  // ═══ فاز ۰ — اعلان ↔ پیام ═══
  console.log('═ فاز ۰: پیوند اعلان با پیام ═');
  const admin = await apiLogin('admin', 'admin123');
  check('ورود مدیر', admin.status === 200 && admin.data?.user?.role === 'ADMIN');
  const teacher = await apiLogin('teacher', '12345678');
  check('ورود معلم', teacher.status === 200 && teacher.data?.user?.role === 'TEACHER');
  const staff = await apiLogin('staff', '12345678');
  check('ورود کارمند', staff.status === 200 && staff.data?.user?.role === 'STAFF');
  const parent = await apiLogin('parent', '12345678');
  check('ورود والد', parent.status === 200 && parent.data?.user?.role === 'GUARDIAN');

  const adminId = admin.data.user.id;
  const teacherId = teacher.data.user.id;

  // پاک‌سازی بازمانده‌های اجرای قبلی (پیام‌های آزمونی ۶ ساعت اخیر + حاضری امروز/۳ روز پیش)
  try {
    const tNow0 = Date.now();
    const aOld0 = await api('GET', '/api/messages', undefined, admin.cookie);
    for (const m of [...(aOld0.data.sent || [])]) {
      const age = tNow0 - new Date(m.createdAt).getTime();
      if (age < 6 * 3600 * 1000 && /پیام آزمون اعلان|پیام فراخوانی|پیام لمس طولانی|پیام چت‌خانه|پاسخ چت‌خانه/.test(m.body || '')) {
        await api('DELETE', `/api/messages?id=${m.id}`, undefined, admin.cookie).catch(() => {});
        await api('DELETE', `/api/messages?id=${m.id}`, undefined, teacher.cookie).catch(() => {});
      }
    }
    const tu0 = await db.user.findUnique({ where: { username: 'teacher' } });
    await db.employeeAttendance.deleteMany({ where: { date: { in: [isoDaysAgo(0), isoDaysAgo(3)] } } });
    await db.staffAttendance.deleteMany({ where: { date: isoDaysAgo(3) } });
    console.log('  پاک‌سازی بازمانده‌ها انجام شد');
  } catch (e) { console.log('  پاک‌سازی اولیه با خطای جزئی:', e.message); }

  const direct = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [teacherId] }], body: `پیام آزمون اعلان ${STAMP}`, category: 'GENERAL' }, admin.cookie);
  check('ارسال پیام آزمونی مدیر → معلم', direct.status === 200 && !!direct.data.id);
  if (direct.data.id) createdMsgIds.push(direct.data.id);

  const notif1 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  const linked = (notif1.data.notifications || []).find((n) => n.messageId === direct.data.id);
  check('اعلان با messageId پیوند خورد (ساخت اعلان جدید)', !!linked, JSON.stringify(notif1.data.notifications || []).slice(0, 150));

  const readRes = await api('PATCH', '/api/messages', { id: direct.data.id }, teacher.cookie);
  check('خواندن پیام توسط گیرنده', readRes.status === 200);
  const notif2 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  check('پس از خواندن پیام، اعلان مرتبط حذف شد', !(notif2.data.notifications || []).some((n) => n.messageId === direct.data.id));

  // ═══ فاز ۱ — حذف برای هر دو طرف (tombstone) ═══
  console.log('═ فاز ۱: حذف برای هر دو طرف ═');
  const direct2 = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [teacherId] }], body: `پیام فراخوانی ${STAMP}`, category: 'GENERAL' }, admin.cookie);
  check('ارسال پیام دوم', direct2.status === 200 && !!direct2.data.id);
  const delRes = await api('DELETE', `/api/messages?id=${direct2.data.id}`, undefined, admin.cookie);
  check('فرستنده: حذف برای هر دو طرف — recalled', delRes.status === 200 && delRes.data.ok === true && delRes.data.recalled === true && delRes.data.hard === false, JSON.stringify(delRes.data));
  if (direct2.data.id) createdMsgIds.push(direct2.data.id);

  const tInbox = await api('GET', '/api/messages', undefined, teacher.cookie);
  const tomb = (tInbox.data.inbox || []).find((m) => m.id === direct2.data.id);
  check('گیرنده: «این پیام حذف شد» به‌جای متن', !!tomb && tomb.deleted === true && tomb.body === 'این پیام حذف شد', JSON.stringify(tomb || {}).slice(0, 140));
  check('پیوست پیام فراخوانی‌شده پنهان است', !!tomb && tomb.attachmentName == null);

  const aSent = await api('GET', '/api/messages', undefined, admin.cookie);
  const tombMine = (aSent.data.sent || []).find((m) => m.id === direct2.data.id);
  check('فرستنده: پیام فراخوانی‌شده با نشان deleted می‌ماند', !!tombMine && tombMine.deleted === true);

  const notif3 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  check('اعلان پیام فراخوانی‌شده از صندوق گیرنده پاک شد', !(notif3.data.notifications || []).some((n) => n.messageId === direct2.data.id));

  // گیرنده می‌تواند تومب‌استون را برای خودش حذف کند
  const delSoft = await api('DELETE', `/api/messages?id=${direct2.data.id}`, undefined, teacher.cookie);
  check('گیرنده: حذف تومب‌استون برای خود', delSoft.status === 200 && delSoft.data.ok === true);

  // ═══ فاز ۲ — حاضری پرسنل ═══
  console.log('═ فاز ۲: حاضری پرسنل (معلم/کارمند/مدیر) ═');
  // دادهٔ قدیمی StaffAttendance برای مهاجرت خودکار — پیوند با معلمِ حساب teacher
  const teacherUser = await db.user.findUnique({ where: { username: 'teacher' } });
  const legacyTeacher = teacherUser?.teacherId ? await db.teacher.findUnique({ where: { id: teacherUser.teacherId } }) : null;
  if (legacyTeacher) {
    await db.staffAttendance.upsert({
      where: { teacherId_date: { teacherId: legacyTeacher.id, date: isoDaysAgo(3) } },
      update: { status: 'LEAVE' },
      create: { teacherId: legacyTeacher.id, date: isoDaysAgo(3), status: 'LEAVE' },
    });
  }
  const staffList = await api('GET', '/api/attendance?mode=staff', undefined, admin.cookie);
  check('فهرست پرسنل برای مدیر', staffList.status === 200 && (staffList.data.staff || []).length >= 4);
  const rolesIn = new Set((staffList.data.staff || []).map((s) => s.role));
  check('پرسنل شامل مدیر + معلم + کارمند + کتابخانه است', ['ADMIN', 'TEACHER', 'STAFF', 'LIBRARIAN'].every((r) => rolesIn.has(r)), [...rolesIn].join(','));
  check('هر ردیف پرسنل position دارد', (staffList.data.staff || []).every((s) => s.id && s.name && s.position));
  const staffById = new Map((staffList.data.staff || []).map((s) => [s.id, s]));

  const ids = {
    admin: (staffList.data.staff || []).find((s) => s.role === 'ADMIN')?.id,
    teacher: (staffList.data.staff || []).find((s) => s.role === 'TEACHER')?.id,
    staff: (staffList.data.staff || []).find((s) => s.role === 'STAFF')?.id,
    lib: (staffList.data.staff || []).find((s) => s.role === 'LIBRARIAN')?.id,
  };
  const save = await api('POST', '/api/attendance', {
    action: 'staff', date: T,
    items: [
      { userId: ids.admin, status: 'PRESENT' },
      { userId: ids.teacher, status: 'ABSENT' },
      { userId: ids.staff, status: 'SICK' },
      { userId: ids.lib, status: 'LEAVE' },
    ],
  }, admin.cookie);
  check('ثبت حاضری ۴ نوع پرسنل (مدیر/معلم/کارمند/کتابخانه)', save.status === 200 && save.data.saved === 4, JSON.stringify(save.data));
  for (const k of Object.keys(ids)) if (ids[k]) createdAttendKeys.push([ids[k], T]);

  const list2 = await api('GET', `/api/attendance?mode=staff&date=${T}`, undefined, admin.cookie);
  const recById = new Map((list2.data.records || []).filter((r) => r.date === T).map((r) => [r.userId, r.status]));
  check('ثبت‌ها ذخیره شدند — معلم غایب، کارمند مریض', recById.get(ids.teacher) === 'ABSENT' && recById.get(ids.staff) === 'SICK' && recById.get(ids.admin) === 'PRESENT' && recById.get(ids.lib) === 'LEAVE',
    JSON.stringify([...recById]));

  // مهاجرت خودکار ردیف قدیمی StaffAttendance (۳ روز پیش، رخصت)
  if (legacyTeacher && ids.teacher) {
    const list3 = await api('GET', `/api/attendance?mode=staff&date=${isoDaysAgo(3)}`, undefined, admin.cookie);
    const migrated = (list3.data.records || []).find((r) => r.userId === ids.teacher && r.status === 'LEAVE');
    check('مهاجرت خودکار StaffAttendance → EmployeeAttendance', !!migrated);
  }

  // حاضری خودِ کاربران
  const mineT = await api('GET', '/api/attendance?mode=staff&mine=1', undefined, teacher.cookie);
  check('معلم: حاضری خودش (غایب امروز)', mineT.status === 200 && (mineT.data.records || []).some((r) => r.date === T && r.status === 'ABSENT'));
  const mineS = await api('GET', '/api/attendance?mode=staff&mine=1', undefined, staff.cookie);
  check('کارمند: حاضری خودش بدون نیاز به teacherId (مریض امروز)', mineS.status === 200 && (mineS.data.records || []).some((r) => r.date === T && r.status === 'SICK'));

  // گاردهای امنیتی
  const guard1 = await api('GET', '/api/attendance?mode=staff', undefined, parent.cookie);
  check('والد: فهرست پرسنل ممنوع', guard1.status === 403);
  const guard2 = await api('POST', '/api/attendance', { action: 'staff', date: T, items: [{ userId: ids.admin, status: 'PRESENT' }] }, teacher.cookie);
  check('معلم: ثبت حاضری پرسنل ممنوع (فقط مدیر/سرمعلم)', guard2.status === 403);
  const guard3 = await api('POST', '/api/attendance', { action: 'staff', date: T, items: [{ userId: ids.admin, status: 'PRESENT' }] }, parent.cookie);
  check('والد: ثبت حاضری پرسنل ممنوع', guard3.status === 403);
  const guard4 = await api('POST', '/api/attendance', { action: 'staff', date: T, items: [{ userId: parent.data.user.id, status: 'PRESENT' }] }, admin.cookie);
  check('ثبت برای والد/شاگرد پذیرفته نمی‌شود (فقط پرسنل)', guard4.status === 200 && guard4.data.saved === 0, JSON.stringify(guard4.data));

  // ═══ فاز ۳ — UI دسکتاپ مدیر ═══
  console.log('═ فاز ۳: UI دسکتاپ مدیر (۱۲۸۰px) ═');
  // یک پیام تازه از معلم → اعلان نخوانده برای مدیر (برای آزمون زنگ)
  const notifSeed = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [adminId] }], body: `پیام برای زنگ مدیر ${STAMP}`, category: 'GENERAL' }, teacher.cookie);
  check('معلم به مدیر پیام داد (برای اعلان)', notifSeed.status === 200 && !!notifSeed.data.id);
  if (notifSeed.data?.id) createdMsgIds.push(notifSeed.data.id);
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await dctx.newPage();
  dpage.on('pageerror', (e) => errors.push('desktop: ' + String(e)));
  await dpage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await dpage.waitForSelector('#username', { timeout: 15000 });
  await dpage.fill('#username', 'admin');
  await dpage.fill('input[type="password"]', 'admin123');
  await dpage.getByRole('button', { name: 'ورود به سیستم' }).click();
  await dpage.waitForTimeout(1800);

  // حالت تاریک — کل صفحه
  await dpage.evaluate(() => localStorage.setItem('theme', 'dark'));
  await dpage.reload({ waitUntil: 'domcontentloaded' });
  await dpage.waitForTimeout(1800);
  const isDark = await dpage.evaluate(() => document.documentElement.classList.contains('dark'));
  check('حالت تاریک فعال شد (html.dark)', isDark);
  // خوانایی: نمونه‌گیری رنگ متن کارت‌های داشبورد — نباید تیرهٔ کامل روی پس‌زمینهٔ تیره باشد
  const contrast = await dpage.evaluate(() => {
    const els = Array.from(document.querySelectorAll('main p, main span, main h1, main h2, main h3, main td, main th'));
    let dark = 0, total = 0;
    for (const el of els.slice(0, 400)) {
      const cs = getComputedStyle(el);
      const m = cs.color.match(/rgba?\((\d+), (\d+), (\d+)/);
      if (!m) continue;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      total++;
      if (lum < 0.18) dark++;
    }
    return { dark, total };
  });
  check('حالت تاریک: عناصر تیرهٔ ناخوانا در داشبورد تقریباً صفر است', contrast.total === 0 || contrast.dark / contrast.total < 0.02, JSON.stringify(contrast));
  await dpage.screenshot({ path: 'download/screenshots/v241-dark-dashboard.png', fullPage: false });

  // اعلان‌ها — زنگ و حذف تک‌تک (پیش از بازکردن گفتگو — خواندن پیام اعلان را پاک می‌کند!)
  const bellBadge = await dpage.locator('button[aria-label*="اعلان‌ها"] span').first().textContent().catch(() => '');
  check('نشان تعداد نخوانده روی آیکن اعلان هست', !!bellBadge && bellBadge.trim().length > 0, bellBadge);
  await dpage.locator('button[aria-label*="اعلان‌ها"]').first().click();
  await dpage.waitForTimeout(700);
  const popText = await dpage.textContent('body');
  check('فهرست اعلان‌ها باز شد', popText.includes('اعلان‌ها'));
  const delNotifBtns = await dpage.locator('button[aria-label="حذف این اعلان"]').count();
  if (delNotifBtns > 0) {
    const rowsBefore = await dpage.locator('button[aria-label="حذف این اعلان"]').count();
    await dpage.locator('button[aria-label="حذف این اعلان"]').first().click();
    await dpage.waitForTimeout(900);
    const rowsAfter = await dpage.locator('button[aria-label="حذف این اعلان"]').count();
    check('حذف تک‌تک اعلان کار می‌کند', rowsAfter < rowsBefore, `before=${rowsBefore} after=${rowsAfter}`);
  } else {
    check('اعلانی برای حذف تک‌تک هست', false, 'هیچ اعلانی نیست');
  }
  await dpage.keyboard.press('Escape');
  await dpage.waitForTimeout(300);

  // حاضری — تب‌ها و حاضری پرسنل
  await dpage.getByRole('button', { name: 'حاضری' }).last().click();
  await dpage.waitForTimeout(1200);
  const tabsInfo = await dpage.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll('[role="tab"]'));
    return triggers.map((t) => { const r = t.getBoundingClientRect(); return { text: t.textContent, left: r.left, right: r.right }; });
  });
  check('هر ۴ تب حاضری نمایان است', tabsInfo.length === 4, JSON.stringify(tabsInfo.map((t) => t.text)));
  check('تب‌ها بیرون از صفحه نزده‌اند', tabsInfo.every((t) => t.right <= 1281 && t.left >= 0));
  await dpage.locator('[role="tab"]:has-text("حاضری پرسنل")').click();
  await dpage.waitForTimeout(1300);
  const staffUi = await dpage.textContent('body');
  check('جدول حاضری پرسنل باز شد (نام + وظیفه + وضعیت)', staffUi.includes('وظیفه') && (staffUi.includes('معلم') || staffUi.includes('کارمند')));
  const absBtn = dpage.locator('[role="tabpanel"]:visible button:has-text("غایب")').first();
  if (await absBtn.count()) {
    await absBtn.click();
    await dpage.waitForTimeout(300);
    await dpage.locator('button:has-text("ذخیرهٔ حاضری پرسنل")').click();
    await dpage.waitForTimeout(600); // توست این اپ کوتاه‌عمر است (~۱ ثانیه)
    const savedUi = (await dpage.locator('text=حاضری پرسنل ثبت گردید').count()) > 0 || (await dpage.locator('text=ذخیره شد').count()) > 0;
    if (!savedUi) {
      const bodyNow = await dpage.evaluate(() => document.body.innerText.slice(0, 600));
      console.log('  [debug] متن صفحه پس از ذخیره:', bodyNow.replace(/\n/g, ' | ').slice(0, 300));
    }
    check('ذخیرهٔ حاضری پرسنل از رابط انجام شد', savedUi);
  } else {
    check('دکمهٔ وضعیت غایب در جدول پرسنل هست', false);
  }

  // چت‌خانه — کادر پیام در پایینِ دید
  await dpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await dpage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await dpage.waitForTimeout(1200);
  const convRow = dpage.locator('button.w-full:has-text("فاطمه احمدی")').first();
  if (await convRow.count()) {
    await convRow.click();
    await dpage.waitForTimeout(1000);
  }
  const taBox = await dpage.locator('textarea[aria-label="متن پیام"]').boundingBox();
  check('کادر نوشتن پیام داخل دیدِ صفحه است (بدون اسکرول)', !!taBox && taBox.y + taBox.height <= 801 && taBox.y > 400, JSON.stringify(taBox));
  // اسکرول صفحه‌ای نباید وجود داشته باشد
  const pageScroll = await dpage.evaluate(() => ({ y: window.scrollY, sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
  check('صفحهٔ چت‌خانه اسکرول عمودی اضافی ندارد', pageScroll.sh <= pageScroll.ih + 4, JSON.stringify(pageScroll));

  check('دسکتاپ: بدون خطای جاوااسکریپت', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 180));
  await dctx.close();

  // ═══ فاز ۴ — UI موبایل معلم (۳۹۰px) ═══
  console.log('═ فاز ۴: UI موبایل معلم (۳۹۰px) ═');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mpage = await mctx.newPage();
  mpage.on('pageerror', (e) => errors.push('mobile: ' + String(e)));
  mpage.on('dialog', (d) => d.accept());
  await mpage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await mpage.waitForSelector('#username', { timeout: 15000 });
  await mpage.evaluate(() => localStorage.setItem('theme', 'dark'));
  await mpage.reload({ waitUntil: 'domcontentloaded' });
  await mpage.waitForSelector('#username', { timeout: 15000 });
  await mpage.fill('#username', 'teacher');
  await mpage.fill('input[type="password"]', '12345678');
  await mpage.getByRole('button', { name: 'ورود به سیستم' }).click();
  await mpage.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });

  // تب‌های حاضری در موبایل (معلم = ۳ تب؛ تب پرسنل فقط مدیر/سرمعلم) — بدون بیرون‌زدگی
  await mpage.locator('button[aria-label="بازکردن منو"]').click();
  await mpage.waitForTimeout(600);
  await mpage.getByRole('button', { name: 'حاضری' }).last().click();
  await mpage.waitForTimeout(1300);
  const mobTabs = await mpage.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll('[role="tab"]'));
    return triggers.map((t) => { const r = t.getBoundingClientRect(); return { right: r.right, left: r.left, bottom: r.bottom, text: t.textContent }; });
  });
  check('موبایل معلم: ۳ تب حاضری دارد (تب پرسنل فقط مدیر)', mobTabs.length === 3, JSON.stringify(mobTabs.map((t) => t.text)));
  check('موبایل: همهٔ تب‌های حاضری داخل عرض ۳۹۰ است (بدون بیرون‌زدگی)', mobTabs.every((t) => t.right <= 391 && t.left >= 0), JSON.stringify(mobTabs));
  const mobStaff = await mpage.textContent('body');
  check('موبایل معلم: تب حاضری پرسنل دیده نمی‌شود', !mobStaff.includes('ذخیرهٔ حاضری پرسنل'));

  // چت‌خانهٔ موبایل — ارسال + فشردن طولانی
  await mpage.locator('button[aria-label="بازکردن منو"]').click();
  await mpage.waitForTimeout(600);
  await mpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await mpage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await mpage.waitForTimeout(1200);
  const adminRowM = mpage.locator('button.w-full:has-text("حسام الدین سیدی")').first();
  if (!(await adminRowM.count())) {
    // گفتگوی جدید از مخاطبان
    await mpage.locator('button[aria-label="گفتگوی جدید"]').click();
    await mpage.waitForTimeout(800);
    await mpage.locator('button:has-text("حسام الدین سیدی")').last().click();
    await mpage.waitForTimeout(800);
  } else {
    await adminRowM.click();
    await mpage.waitForTimeout(900);
  }
  const mobMsg = `پیام لمس طولانی ${STAMP}`;
  await mpage.fill('textarea[aria-label="متن پیام"]', mobMsg);
  await mpage.click('button[aria-label="ارسال پیام"]');
  await mpage.waitForTimeout(1800);
  check('موبایل: پیام ارسال شد', (await mpage.locator(`p:text("${mobMsg}")`).count()) > 0);
  // شناسهٔ پیام برای بررسی تومب‌استون سرور — پیش از حذف
  const tSent0 = await api('GET', '/api/messages', undefined, teacher.cookie);
  const sentMsg0 = (tSent0.data.sent || []).find((m) => m.body === mobMsg);
  check('پیام موبایل در سرور ثبت شد', !!sentMsg0);

  // فشردن طولانی — بلافاصله: ویرایش غیرفعال (چند ثانیهٔ اول)
  const bubble = mpage.locator(`p:text("${mobMsg}")`).first().locator('xpath=..');
  const longPress = async () => {
    await bubble.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 100, clientY: 300 }));
    });
    await mpage.waitForTimeout(750);
    await bubble.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 7 }));
    });
    await mpage.waitForTimeout(500);
  };
  await longPress();
  const menuVisible = await mpage.locator('button:has-text("کپی متن")').count();
  check('موبایل: فشردن طولانی منوی پیام را باز کرد (کپی/ویرایش/حذف)', menuVisible > 0);
  const editBtn = mpage.locator('button:has-text("ویرایش پیام")');
  const editDisabledNow = (await editBtn.count()) > 0 ? await editBtn.isDisabled() : false;
  check('موبایل: ویرایش در ثانیه‌های اول غیرفعال است', editDisabledNow, `count=${await editBtn.count()}`);
  await mpage.locator('button:has-text("انصراف")').click();
  await mpage.waitForTimeout(500);

  // پس از ۶ ثانیه — ویرایش فعال
  await mpage.waitForTimeout(6200);
  await longPress();
  const editEnabled = (await editBtn.count()) > 0 && !(await editBtn.isDisabled());
  check('موبایل: ویرایش پس از چند ثانیه فعال شد', editEnabled);

  // حذف برای هر دو طرف از منوی لمس
  await mpage.locator('button:has-text("حذف برای هر دو طرف")').click();
  await mpage.waitForTimeout(2000);
  check('موبایل: تومب‌استون «شما این پیام را حذف کردید»', (await mpage.locator('text=شما این پیام را حذف کردید').count()) > 0);
  const aInbox2 = await api('GET', '/api/messages', undefined, admin.cookie);
  const tombA = (aInbox2.data.inbox || []).find((m) => m.id === sentMsg0?.id);
  check('سرور: مدیر هم «این پیام حذف شد» می‌بیند', !!tombA && tombA.deleted === true && tombA.body === 'این پیام حذف شد', JSON.stringify(tombA || {}).slice(0, 120));

  // کادر پیام در پایین دید موبایل
  const taBoxM = await mpage.locator('textarea[aria-label="متن پیام"]').boundingBox();
  check('موبایل: کادر نوشتن پیام در پایینِ دید است', !!taBoxM && taBoxM.y + taBoxM.height <= 845 && taBoxM.y > 500, JSON.stringify(taBoxM));
  await mpage.screenshot({ path: 'download/screenshots/v241-dark-mobile-chat.png', fullPage: false });

  const realErrors = errors.filter((e) => !e.includes('Failed to load resource') && !e.includes('ERR_INTERNET_DISCONNECTED') && !e.includes('ERR_ABORTED'));
  check('صفر خطای جاوااسکریپت در موبایل', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 180));
  await mctx.close();

  // ═══ پاک‌سازی دادهٔ آزمون ═══
  console.log('═ پاک‌سازی ═');
  for (const id of createdMsgIds) {
    await api('DELETE', `/api/messages?id=${id}`, undefined, admin.cookie).catch(() => {});
    await api('DELETE', `/api/messages?id=${id}`, undefined, teacher.cookie).catch(() => {});
  }
  try {
    for (const [uid, d] of createdAttendKeys) {
      await db.employeeAttendance.deleteMany({ where: { userId: uid, date: d } });
    }
    if (legacyTeacher) {
      await db.staffAttendance.deleteMany({ where: { teacherId: legacyTeacher.id, date: isoDaysAgo(3) } });
      await db.employeeAttendance.deleteMany({ where: { userId: teacherUser?.id || '', date: isoDaysAgo(3) } });
    }
    // اعلان‌های آزمون باقی‌ماندهٔ معلم/مدیر (پیونددار با پیام‌های پاک‌شده هم اکنون خودکار حذف شدند)
    console.log('پاک‌سازی انجام شد');
  } catch (e) { console.log('پاک‌سازی با خطای جزئی:', e.message); }

  await browser.close();
  await db.$disconnect();
  console.log('═'.repeat(50));
  console.log(`نتیجهٔ نهایی: ${passed} PASS | ${failed} FAIL`);
  if (fails.length) console.log('شکست‌ها:\n- ' + fails.join('\n- '));
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error('خطای اجرای تست:', e);
  try { await db.$disconnect(); } catch { /* ignore */ }
  process.exit(2);
});
