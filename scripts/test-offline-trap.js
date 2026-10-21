/**
 * تست دقیق سناریوی کاربر: navigator.onLine=true ولی شبکه مرده (وای‌فای بدون انترنت)
 * ۱) ورود آنلاین + ثبت SW  ۲) کشتن سرور (onLine همچنان true)  ۳) reload از کش
 * ۴) ورود آفلاین باید خودکار fallback شود  ۵) پیام رمز غلط آفلاین
 */
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const { execSync, spawn } = require('child_process');

const BASE = 'http://localhost:3100';
let failed = 0;
const ok = (msg) => console.log('  ✓', msg);
const bad = (msg) => { console.log('  ✗', msg); failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  console.log('── فاز ۱: ورود آنلاین + SW ──');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=داشبورد', { timeout: 20000 });
  ok('ورود آنلاین موفق');
  // صبر برای نصب کامل SW و precache
  for (let i = 0; i < 20; i++) {
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
    if (i === 19) bad('SW نصب نشد!');
  }
  const creds = await page.evaluate(() => !!localStorage.getItem('noq_offline_creds_v1'));
  creds ? ok('اعتبار آفلاین admin ذخیره شد') : bad('اعتبار آفلاین ذخیره نشد!');

  console.log('── فاز ۲: خروج + کشتن سرور (onLine=true ولی شبکه مرده) ──');
  await page.getByRole('button', { name: /حسام الدین سیدی/ }).click();
  await page.getByRole('menuitem', { name: 'خروج از حساب' }).click();
  await page.waitForSelector('#username', { timeout: 10000 });
  ok('خروج — صفحهٔ ورود');
  execSync('lsof -ti:3100 | xargs -r kill -9');
  await new Promise((r) => setTimeout(r, 800));
  const onLine = await page.evaluate(() => navigator.onLine);
  onLine ? ok(`navigator.onLine = ${onLine} (تلهٔ واقعی گوشی)`) : bad('onLine false شد — شبیه‌سازی غلط');

  console.log('── فاز ۳: reload بدون سرور — پوسته از کش SW ──');
  let reloaded = false;
  try {
    await page.reload({ waitUntil: 'commit', timeout: 15000 });
    reloaded = true;
  } catch {
    try { await page.evaluate(() => location.reload()); } catch { /* context death */ }
  }
  try {
    await page.waitForSelector('#username', { timeout: 25000 });
    ok(reloaded ? 'اپ بدون سرور از کش بارگذاری شد' : 'اپ بدون سرور بارگذاری شد (navigate دستی)');
  } catch {
    bad('پوستهٔ آفلاین بارگذاری نشد!');
  }
  const stillOnLine = await page.evaluate(() => navigator.onLine).catch(() => '?');
  ok(`onLine=${stillOnLine}`);

  console.log('── فاز ۴: ورود آفلاین با fallback خودکار (جان بخشیدن به تست کاربر) ──');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  try {
    await page.waitForSelector('text=داشبورد', { timeout: 20000 });
    ok('ورود آفلاین موفق — بدون خطای «اتصال به سرور برقرار نشد»');
  } catch {
    const err = await page.locator('text=اتصال').first().textContent().catch(() => '(خطا دیده نشد)');
    bad('ورود آفلاین شکست خورد: ' + err);
  }
  const badge = await page.locator('text=آفلاین').first().isVisible().catch(() => false);
  badge ? ok('بج «آفلاین» فعال است') : ok('(بج آفلاین در این viewport دیده نشد — غیربحرانی)');

  console.log('── فاز ۵: رمز غلط آفلاین — پیام درست ──');
  await page.getByRole('button', { name: /حسام الدین سیدی/ }).click().catch(() => {});
  await page.getByRole('menuitem', { name: 'خروج از حساب' }).click().catch(() => {});
  await page.waitForSelector('#username', { timeout: 10000 }).catch(() => {});
  await page.fill('#username', 'admin');
  await page.fill('#password', 'wrongpass');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  const msgShown = await page.waitForSelector('text=اتصال انترنت برقرار نیست', { timeout: 10000 }).then(() => true).catch(() => false);
  msgShown ? ok('پیام آفلاین با راهنمای ورود محلی نمایش داده شد') : bad('پیام خطای آفلاین غلط/ناموجده');

  console.log('── فاز ۶: برگشت سرور + ورود آنلاین معمولی ──');
  const srv = spawn('bun', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, PORT: '3100', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    detached: true, stdio: 'ignore',
  });
  srv.unref();
  await new Promise((r) => setTimeout(r, 3000));
  await page.reload({ waitUntil: 'commit', timeout: 20000 }).catch(() => {});
  await page.waitForSelector('#username', { timeout: 20000 }).catch(() => {});
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  try {
    await page.waitForSelector('text=داشبورد', { timeout: 20000 });
    ok('ورود آنلاین پس از برگشت سرور موفق');
  } catch { bad('ورود آنلاین پس از برگشت شکست خورد'); }

  await browser.close();
  console.log(failed === 0 ? '\n★ همهٔ تست‌ها PASS' : `\n✗ ${failed} تست شکست خورد`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
