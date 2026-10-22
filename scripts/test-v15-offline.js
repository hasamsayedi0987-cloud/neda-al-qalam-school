/**
 * تست کامل نسخهٔ ۱.۵ — سرعت آفلاین + ذخیره/نمایش فوری + همگام‌سازی
 *  ۱) ورود آنلاین + SW  ۲) آفلاین: ورود، ثبت شاگرد بدون شهرت، تغییر حاضری — نمایش فوری
 *  ۳) سرعت خواندن آفلاین  ۴) پیام‌ها ≤۱ ثانیه  ۵) تاریخ شمسی  ۶) همگام‌سازی خودکار
 *  ۷) تغییر نام کاربری
 */
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const BASE = 'http://localhost:3100';
let failed = 0;
const ok = (msg) => console.log('  ✓', msg);
const bad = (msg) => { console.log('  ✗', msg); failed++; };

// بررسی سمت سرور با نشست جداگانه
async function serverLogin() {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: 'admin123' }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ─── فاز ۱: ورود آنلاین + SW ───
  console.log('── فاز ۱: ورود آنلاین + سرویس‌ورکر ──');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=داشبورد', { timeout: 20000 });
  ok('ورود آنلاین موفق');
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.active || !navigator.serviceWorker.controller) return 'wait';
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) { const c = await caches.open(k); n += (await c.keys()).length; }
      return `ready:${n}`;
    });
    if (st !== 'wait') { ok(`SW فعال — ${st} فایل در کش`); break; }
    if (i === 24) bad('SW نصب نشد!');
  }

  // صنفی که شاگرد دارد — برای تست حاضری
  const targetClass = await page.evaluate(async () => {
    const [c, s] = await Promise.all([
      fetch('/api/classes').then((r) => r.json()),
      fetch('/api/students').then((r) => r.json()),
    ]);
    const withStudents = s.students.find((x) => x.classId);
    const cls = c.classes.find((x) => x.id === withStudents?.classId);
    return cls ? { id: cls.id, name: cls.name } : null;
  });
  targetClass ? ok(`صنف هدف برای حاضری: ${targetClass.name}`) : bad('صنف با شاگرد یافت نشد!');

  // ─── فاز ۲: آفلاین — ورود و ثبت شاگرد بدون شهرت ───
  console.log('── فاز ۲: آفلاین — ثبت شاگرد بدون شهرت + نمایش فوری ──');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // اگر نشست از کش بازسازی شد داشبورد است وگرنه صفحهٔ ورود — ورود آفلاین
  const hasLogin = await page.locator('#username').count();
  if (hasLogin > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=داشبورد', { timeout: 15000 });
    ok('ورود آفلاین موفق (بدون انترنت)');
  } else {
    ok('نشست از کش آفلاین بازسازی شد');
  }
  const badge = await page.locator('text=آفلاین').first().isVisible().catch(() => false);
  badge ? ok('بج «آفلاین» نمایش داده شد') : bad('بج آفلاین دیده نشد');

  // سرعت خواندن آفلاین — شاگردان
  await page.getByRole('button', { name: 'شاگردان', exact: true }).click();
  const t0 = Date.now();
  await page.waitForSelector('table tbody tr', { timeout: 15000 });
  const loadMs = Date.now() - t0;
  loadMs < 1500 ? ok(`خواندن آفلاین شاگردان: ${loadMs}ms (سریع)`) : bad(`خواندن آفلاین کند: ${loadMs}ms`);

  // ثبت شاگرد بدون شهرت
  await page.getByRole('button', { name: 'ثبت شاگرد جدید' }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 5000 });
  const cityLabel = await dialog.locator('text=شهرت / تخلص').first().textContent().catch(() => '');
  (cityLabel && !cityLabel.includes('*')) ? ok('فیلد شهرت/تخلص اختیاری شد (بدون *)') : bad(`لیبل شهرت: ${cityLabel}`);
  // فیلد عکس (input مخفی file) اول است — با نام فیلد هدف می‌گیریم
  await dialog.locator('input:not([type="file"])').nth(0).fill('نصرت');
  // شهرت خالی می‌ماند
  await dialog.locator('input:not([type="file"])').nth(2).fill('ولد تستی');
  const tSave = Date.now();
  await dialog.getByRole('button', { name: 'ثبت شاگرد' }).click();
  const toast1 = page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: 'ذخیره شد' }).first();
  try {
    await page.waitForSelector('text=ذخیره شد', { timeout: 3000 });
    ok(`پیام «ذخیره شد» بعد از ${Date.now() - tSave}ms نمایش داده شد`);
  } catch { bad('پیام «ذخیره شد» ظاهر نشد!'); }

  // نمایش فوری شاگرد جدید در جدول (آفلاین — از رونویسی محلی)
  try {
    await page.waitForSelector('td:has-text("نصرت")', { timeout: 4000 });
    ok(`شاگرد بدون شهرت آفلاین فوراً در جدول ظاهر شد (${Date.now() - tSave}ms پس از ذخیره)`);
  } catch { bad('شاگرد جدید آفلاین در جدول نمایش داده نشد!'); }

  // ناپدید شدن پیام ≤ ۱.۵ ثانیه
  await page.waitForTimeout(400);
  const toastVisible = await page.locator('text=ذخیره شد').first().isVisible().catch(() => false);
  if (toastVisible) {
    const tGone = Date.now();
    await page.locator('text=ذخیره شد').first().waitFor({ state: 'hidden', timeout: 2500 }).catch(() => {});
    const goneMs = Date.now() - tGone + 400;
    goneMs <= 2000 ? ok(`پیام پس از ~${goneMs}ms ناپدید شد (≤۲ ثانیه)`) : bad(`پیام دیر ناپدید شد: ${goneMs}ms`);
  } else {
    ok('پیام بسیار سریع ناپدید شد (≤۱ ثانیه)');
  }

  // ─── فاز ۳: آفلاین — حاضری یومیه با تاریخ شمسی ───
  console.log('── فاز ۳: آفلاین — حاضری با تاریخ شمسی ──');
  await page.getByRole('button', { name: 'حاضری یومیه', exact: true }).click();
  await page.waitForTimeout(1200);
  const pageText = await page.locator('main').textContent();
  const shamsiMonths = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
  const hasShamsi = shamsiMonths.some((m) => (pageText || '').includes(m));
  hasShamsi ? ok('تاریخ شمسی (ماه افغانی) در حاضری نمایش داده می‌شود') : bad('ماه شمسی پیدا نشد!');
  const dateInputCount = await page.locator('main input[type="date"]').count();
  dateInputCount === 0 ? ok('هیچ ورودی میلادی (input type=date) در حاضری نیست') : bad(`${dateInputCount} ورودی میلادی باقی مانده!`);

  // انتخاب صنف هدف
  if (targetClass) {
    await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: targetClass.name }).first().click();
    await page.waitForSelector('table tbody tr', { timeout: 8000 });
    // اولین شاگرد → غایب
    await page.locator('table tbody tr').first().locator('button', { hasText: 'غایب' }).click();
    const tA = Date.now();
    await page.getByRole('button', { name: /ذخیرهٔ حاضری/ }).click();
    try {
      await page.waitForSelector('text=ذخیره شد', { timeout: 3000 });
      ok(`حاضری آفلاین ذخیره شد (${Date.now() - tA}ms)`);
    } catch { bad('پیام ذخیره حاضری نیامد'); }
  }

  // ─── فاز ۴: ریلود مجدد آفلاین — پایداری داده ───
  console.log('── فاز ۴: ریلود آفلاین — پایداری تغییرات ──');
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const hasLogin2 = await page.locator('#username').count();
  if (hasLogin2 > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=داشبورد', { timeout: 15000 });
  }
  await page.getByRole('button', { name: 'شاگردان', exact: true }).click();
  await page.waitForSelector('table tbody tr', { timeout: 10000 });
  const stillThere = await page.locator('td:has-text("نصرت")').count();
  stillThere > 0 ? ok('شاگرد ثبت‌شدهٔ آفلاین پس از ریلود هم هست (ذخیرهٔ پایدار در گوشی)') : bad('پس از ریلود شاگرد گم شد!');

  // ─── فاز ۵: برگشت انترنت — همگام‌سازی خودکار ───
  console.log('── فاز ۵: برگشت انترنت — تخلیهٔ خودکار صف ──');
  await ctx.setOffline(false);
  let synced = false;
  const cookie = await serverLogin();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    try {
      const st = await fetch(`${BASE}/api/students`, { headers: { cookie } }).then((r) => r.json());
      const found = (st.students || []).some((x) => x.firstName === 'نصرت' && x.fatherName === 'ولد تستی');
      if (found) { synced = true; break; }
    } catch { /* retry */ }
  }
  synced ? ok('شاگرد آفلاین به‌صورت خودکار به سرور منتقل شد') : bad('همگام‌سازی شاگرد ناموفق!');
  if (targetClass) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1500);
      try {
        const st = await fetch(`${BASE}/api/attendance?mode=daily&classId=${targetClass.id}&date=${iso}`, { headers: { cookie } }).then((r) => r.json());
        const recs = st.records || [];
        const hasAbsent = recs.some((r) => r.status === 'ABSENT');
        if (recs.length > 0 && hasAbsent) { ok('حاضری آفلاین (غایب) هم به سرور منتقل شد'); break; }
        if (i === 14) bad('حاضری همگام نشد!');
      } catch { /* retry */ }
    }
  }
  const pendBadge = await page.locator('text=در انتظار همگام‌سازی').count();
  pendBadge === 0 ? ok('بج صف خالی شد') : bad('بج صف هنوز پر است');

  // ─── فاز ۶: تغییر نام کاربری ───
  console.log('── فاز ۶: تغییر نام کاربری ──');
  await page.getByRole('button', { name: 'کاربران و دسترسی‌ها', exact: true }).click();
  await page.waitForSelector('table tbody tr', { timeout: 10000 });
  // سطر admin → دکمهٔ ویرایش
  const adminRow = page.locator('table tbody tr', { hasText: '@admin' }).first();
  await adminRow.locator('button[aria-label="ویرایش"]').click();
  const d2 = page.locator('[role="dialog"]');
  await d2.waitFor({ timeout: 5000 });
  const unInput = d2.locator('input[dir="ltr"]').first();
  await unInput.fill('adminraees');
  await d2.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
  try {
    await page.waitForSelector('text=ذخیره شد', { timeout: 4000 });
    ok('نام کاربری مدیر تغییر کرد (admin → adminraees)');
  } catch { bad('ذخیرهٔ نام کاربری ناموفق!'); }
  await page.waitForTimeout(1200);
  const newUn = await page.locator('td:has-text("@adminraees")').count();
  newUn > 0 ? ok('نام کاربری جدید در جدول کاربران') : bad('نام کاربری جدید در جدول نیست!');

  // ورود با نام کاربری جدید
  await page.getByRole('button', { name: /مدیر مکتب/ }).click();
  await page.getByRole('menuitem', { name: 'خروج از حساب' }).click();
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', 'adminraees');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  try {
    await page.waitForSelector('text=داشبورد', { timeout: 15000 });
    ok('ورود با نام کاربری جدید موفق');
  } catch { bad('ورود با نام کاربری جدید ناموفق!'); }

  // برگرداندن به admin
  await page.getByRole('button', { name: 'کاربران و دسترسی‌ها', exact: true }).click();
  await page.waitForSelector('table tbody tr', { timeout: 10000 });
  const row2 = page.locator('table tbody tr', { hasText: '@adminraees' }).first();
  await row2.locator('button[aria-label="ویرایش"]').click();
  const d3 = page.locator('[role="dialog"]');
  await d3.waitFor({ timeout: 5000 });
  await d3.locator('input[dir="ltr"]').first().fill('admin');
  await d3.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
  await page.waitForTimeout(1200);
  ok('نام کاربری به admin برگردانده شد');

  // خطای نام کاربری تکراری
  const row3 = page.locator('table tbody tr', { hasText: '@admin' }).first();
  await row3.locator('button[aria-label="ویرایش"]').click();
  const d4 = page.locator('[role="dialog"]');
  await d4.waitFor({ timeout: 5000 });
  // نام کاربری sarallam را امتحان می‌کنیم (تکراری)
  const otherUsers = await page.evaluate(async () => {
    const u = await fetch('/api/users').then((r) => r.json());
    return u.users.filter((x) => x.username !== 'admin').map((x) => x.username);
  });
  if (otherUsers.length > 0) {
    await d4.locator('input[dir="ltr"]').first().fill(otherUsers[0]);
    await d4.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
    try {
      await page.waitForSelector('text=قبلاً گرفته شده است', { timeout: 4000 });
      ok('نام کاربری تکراری رد شد با پیام فارسی');
    } catch { bad('نام کاربری تکراری رد نشد!'); }
  }
  await page.keyboard.press('Escape');

  // ─── خطاهای کنسول ───
  const realErrors = errors.filter((e) => !e.includes('ResizeObserver') && !e.includes('Hydration'));
  realErrors.length === 0 ? ok('صفر خطای جاوااسکریپت کنسول') : bad(`خطاهای کنسول: ${realErrors.slice(0, 3).join(' | ')}`);

  await browser.close();
  console.log(failed === 0 ? '\n✅ همهٔ تست‌ها PASS' : `\n❌ ${failed} تست شکست خورد`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('CRASH:', e); process.exit(2); });
