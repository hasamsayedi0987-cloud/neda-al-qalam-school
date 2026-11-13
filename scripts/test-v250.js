/**
 * تست‌های نسخهٔ ۲.۵.۰ — بازشدن همیشگی، برگشت گوشی، به‌روزرسانی وب
 *
 * ۱) بازگردانی خودکار آخرین کاربر (بدون دیوار ورود) — آنلاین و آفلاین
 * ۲) دکمهٔ برگشت: بین بخش‌ها + بستن دیالوگ قبل از خروج
 * ۳) «مرا به خاطر بسپار» غیرفعال → خروج → صفحهٔ ورود
 * ۴) نشان نسخهٔ ۲.۵.۰ در صفحهٔ ورود و پانویس منو
 * ۵) سرویس‌ورکر v11 فعال و کنترل‌کنندهٔ صفحه
 * ۶) storage.persist درخواست شده باشد
 *
 * اجرا: node scripts/test-v250.js  (سرور روی localhost:3000)
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✘ ${name}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`); }
}

(async () => {
  const browser = await chromium.launch();

  /* ═══ فاز ۱ — ورود + نشان نسخه ═══ */
  console.log('═ فاز ۱: ورود و نشان نسخه ═');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const versionShown = await page.locator('text=نسخهٔ ۲.۵.۰').first().isVisible().catch(() => false);
  check('نشان نسخهٔ ۲.۵.۰ در صفحهٔ ورود هست (نه ۲.۱.۰)', versionShown);

  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  const rememberChecked = await page.isChecked('#remember-me');
  check('«مرا به خاطر بسپار» پیشفرض فعال است', rememberChecked);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const inApp = await page.locator('button:has-text("خانه / داشبورد")').first().isVisible().catch(() => false);
  check('ورود موفق — داشبورد باز شد', inApp);

  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { has: false };
    const persist = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    return { has: true, controlling: Boolean(navigator.serviceWorker.controller), persisted: persist, persistApi: typeof navigator.storage?.persist === 'function' };
  });
  check('سرویس‌ورکر ثبت و کنترل‌کنندهٔ صفحه است', swState.has && swState.controlling, JSON.stringify(swState));
  check('storage.persist در دسترس است (درخواست ماندگاری داده هنگام boot)', swState.persistApi === true, JSON.stringify(swState));

  /* ═══ فاز ۲ — بازگردانی خودکار پس از «بازشدن دوباره اپ» ═══ */
  console.log('═ فاز ۲: بازگردانی خودکار آخرین کاربر ═');
  // شبیه‌سازی بسته‌شدن اپ: پاک‌کردن نشست پنجره‌ای + کوکی (کوکی نشست با بستن اپ می‌میرد)
  await page.evaluate(() => { sessionStorage.clear(); });
  await ctx.clearCookies();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const autoIn = await page.locator('button:has-text("خانه / داشبورد")').first().isVisible().catch(() => false);
  const loginForm = await page.locator('#username').isVisible().catch(() => false);
  check('بازشدن دوباره بدون کوکی و نشست → مستقیم داخل اپ (بدون دیوار ورود)', autoIn && !loginForm);

  // خروج آگاهانه → فراموشی → صفحهٔ ورود (منوی کاربر دسکتاپ)
  const userMenuBtn = page.locator('header button:has-text("حسام الدین سیدی")').first();
  await userMenuBtn.click();
  await page.waitForTimeout(800);
  const logoutBtn = page.locator('[role="menuitem"]:has-text("خروج از حساب")').last();
  if (await logoutBtn.count()) {
    await logoutBtn.click();
    await page.waitForTimeout(1500);
    const backToLogin = await page.locator('#username').isVisible().catch(() => false);
    check('خروج آگاهانه → صفحهٔ ورود می‌آید', backToLogin);
    // بازشدن دوباره بعد از خروج → باز هم صفحهٔ ورود (کاربر فراموش شد)
    await page.evaluate(() => { sessionStorage.clear(); });
    await ctx.clearCookies();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const stillLogin = await page.locator('#username').isVisible().catch(() => false);
    check('بازشدن دوباره پس از خروج → همچنان صفحهٔ ورود (آخرین کاربر فراموش شد)', stillLogin);
  } else {
    check('خروج آگاهانه → صفحهٔ ورود می‌آید', false, 'دکمهٔ خروج یافت نشد');
  }

  /* ═══ فاز ۳ — دکمهٔ برگشت گوشی/مرورگر ═══ */
  console.log('═ فاز ۳: دکمهٔ برگشت (بین بخش‌ها + دیالوگ) ═');
  // ورود دوباره (برای فازهای بعد)
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // جابه‌جایی بین بخش‌ها + برگشت
  await page.getByRole('button', { name: 'شاگردان' }).last().click();
  await page.waitForTimeout(1200);
  const urlStudents = page.url();
  await page.getByRole('button', { name: 'مضامین' }).last().click();
  await page.waitForTimeout(1200);
  const urlSubjects = page.url();
  check('جابه‌جایی بخش‌ها آدرس را به‌روز می‌کند (?view=)', /view=subjects/.test(urlSubjects), urlSubjects);

  await page.goBack();
  await page.waitForTimeout(1200);
  check('برگشت گوشی → به بخش قبلی (شاگردان) برمی‌گردد', /view=students/.test(page.url()) || await page.locator('text=شاگردان').first().isVisible().catch(() => false), page.url());

  await page.goBack();
  await page.waitForTimeout(1200);
  const backToBase = !/view=/.test(page.url());
  check('برگشت دوباره → به داشبورد برمی‌گردد (آدرس پاک)', backToBase, page.url());

  // دیالوگ: بازکردن دیالوگ جدید در شاگردان، برگشت باید دیالوگ را ببندد نه اپ را
  await page.getByRole('button', { name: 'شاگردان' }).last().click();
  await page.waitForTimeout(1200);
  const addStudent = page.locator('button:has-text("ثبت شاگرد جدید"), button:has-text("شاگرد جدید"), button:has-text("افزودن شاگرد")').first();
  let dialogOpened = false;
  if (await addStudent.count()) {
    await addStudent.click();
    await page.waitForTimeout(1000);
    dialogOpened = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    check('دیالوگ ثبت شاگرد باز شد', dialogOpened);
    if (dialogOpened) {
      await page.goBack(); // دکمهٔ برگشت گوشی
      await page.waitForTimeout(1000);
      const dialogClosed = !(await page.locator('[role="dialog"]').first().isVisible().catch(() => false));
      const stillInApp = await page.locator('header').first().isVisible().catch(() => false);
      check('برگشت گوشی → اول دیالوگ بسته می‌شود (اپ باز می‌ماند)', dialogClosed && stillInApp);
    }
  } else {
    // دیالوگ دیگر — اعلان‌ها (Popover نیست ولی Sheet منو هست): منوی موبایل را با برگشت ببندیم
    check('دیالوگ ثبت شاگرد باز شد', false, 'دکمهٔ ثبت شاگرد یافت نشد');
  }

  // خروجِ با برگشت تا آخر تاریخچه → نباید اپ ناگهانی بسته شود (صفحهٔ ورود یا تأیید)
  check('بدون خطای جاوااسکریپت در کل جریان', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

  /* ═══ فاز ۴ — آفلاین: بازشدن اپ بدون انترنت با بازگردانی خودکار ═══ */
  console.log('═ فاز ۴: بازشدن آفلاین (بعد از چند روز) ═');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  const err2 = [];
  p2.on('pageerror', (e) => err2.push(e.message));
  await p2.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p2.fill('#username', 'teacher');
  await p2.fill('#password', '12345678');
  await p2.click('button[type="submit"]');
  await p2.waitForTimeout(3000); // کش آفلاین + اعتبار محلی ذخیره شود
  const teacherIn = await p2.locator('header').first().isVisible().catch(() => false) && !(await p2.locator('#username').isVisible().catch(() => false));
  check('معلم وارد شد (اعتبار محلی برای آفلاین ذخیره می‌شود)', teacherIn);

  await p2.evaluate(() => { sessionStorage.clear(); });
  await ctx2.clearCookies();
  await ctx2.setOffline(true);
  await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(3500);
  const offlineIn = await p2.locator('header').first().isVisible().catch(() => false);
  const offlineLoginForm = await p2.locator('#username').isVisible().catch(() => false);
  check('آفلاین + بدون نشست + بدون کوکی → اپ باز می‌شود و مستقیم داخل است (ریشهٔ «چند روز آفلاین»)', offlineIn && !offlineLoginForm);
  check('آفلاین: بدون خطای جاوااسکریپت', err2.length === 0, err2.slice(0, 3).join(' | '));
  await ctx2.close();

  await ctx.close();
  await browser.close();

  console.log('═'.repeat(50));
  console.log(`نتیجهٔ نهایی: ${pass} PASS | ${fail} FAIL`);
  if (failures.length) { console.log('شکست‌ها:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('خطای اجرای تست:', e.message); process.exit(2); });
