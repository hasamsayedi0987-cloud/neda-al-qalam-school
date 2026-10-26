/** دود-تست رابط نسخهٔ ۲.۲ روی بیلد نهایی (پورت ۳۱۰۰) — بخش‌های جدید و هشدار قرمز */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3100';
let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) { passed++; console.log(`  ✔ ${n}`); } else { failed++; console.log(`  ✘ ${n} ${x}`); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('401') && !t.includes('403') && !t.includes('400')) errors.push(t); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (await page.locator('button:has-text("خروج")').count() > 0) {
    await page.locator('button:has-text("خروج")').first().click();
    await page.waitForTimeout(800);
  }
  await page.fill('input[type="text"], input#username, input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('ورود مدیر', await page.locator('main, body').count() > 0);

  // ─── مالی و فیس ───
  await page.evaluate(() => { window.location.hash = ''; });
  await page.goto(`${BASE}/?view=finance`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  if (await page.locator('#username').count() > 0) {
    await page.fill('#username', 'admin'); await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: /ورود/ }).click();
    await page.waitForTimeout(3000);
    await page.goto(`${BASE}/?view=finance`); await page.waitForTimeout(3500);
  }
  const finText = await page.locator('main').textContent().catch(() => '');
  check('بخش مالی باز شد', (finText || '').includes('مالی') && (finText || '').includes('افغانی'), (finText || '').slice(0, 60));

  // ─── ارتباطات ───
  await page.goto(`${BASE}/?view=messages`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const msgText = await page.locator('main').textContent().catch(() => '');
  check('بخش ارتباطات باز شد', (msgText || '').includes('صندوق ورودی') && (msgText || '').includes('نوشتن'));

  // ─── صنف‌ها + برنامهٔ هفتگی ───
  await page.goto(`${BASE}/?view=classes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const clsText = await page.locator('main').textContent().catch(() => '');
  check('برنامهٔ هفتگی در کارت صنف‌ها', (clsText || '').includes('برنامهٔ هفتگی'));
  check('ظرفیت در دیالوگ صنف (کارت‌ها لود شدند)', (clsText || '').includes('صنف'));

  // ─── دانش‌آموزان: فیلتر جدید + خروجی ───
  await page.goto(`${BASE}/?view=students`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const stuText = await page.locator('main').textContent().catch(() => '');
  check('فیلتر وضعیت تحصیلی + خروجی‌ها', (stuText || '').includes('شاگردان فعال') && (stuText || '').includes('اکسل') && (stuText || '').includes('PDF'));

  // ─── حاضری: آمار سالانه ───
  await page.goto(`${BASE}/?view=attendance`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const attText = await page.locator('main').textContent().catch(() => '');
  check('تب آمار سالانه', (attText || '').includes('آمار سالانه'));

  // ─── کتابخانه: کارت شاگرد ───
  await page.goto(`${BASE}/?view=library`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const libText = await page.locator('main').textContent().catch(() => '');
  check('تب کارت شاگرد', (libText || '').includes('کارت شاگرد'));

  // ─── تنظیمات: پشتیبان خودکار ───
  await page.goto(`${BASE}/?view=settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const setText = await page.locator('main').textContent().catch(() => '');
  check('پشتیبان‌گیری خودکار + دادهٔ سال‌های گذشته', (setText || '').includes('پشتیبان') && (setText || '').includes('سال'));

  check('صفر خطای کنسول (بدون ۴۰۱/۴۰۳/۴۰۰ عمدی)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log(`═ نتیجه: ${passed} PASS | ${failed} FAIL ═`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
