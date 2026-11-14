/** عیب‌یابی: آیا رویداد online پس از setOffline(false) می‌آید و prefetch اجرا می‌شود؟ */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:3100';
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000); // پیش‌بارگیری اول کامل
  const cache1 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).length);
  console.log('cache after first prefetch:', cache1);

  // شنونده‌ها قبل از قطع/وصل — ثبت همهٔ رویدادها
  await page.evaluate(() => {
    window.__diag = [];
    window.addEventListener('online', () => window.__diag.push('online-event@' + Date.now()));
    window.addEventListener('offline', () => window.__diag.push('offline-event@' + Date.now()));
    window.addEventListener('noq:prefetched', (e) => window.__diag.push('prefetched(ok=' + e.detail?.ok + ')@' + Date.now()));
  });

  await context.setOffline(true);
  await page.waitForTimeout(2000);
  await context.setOffline(false);
  await page.waitForTimeout(12000);
  const diag = await page.evaluate(() => ({
    diag: window.__diag,
    onLine: navigator.onLine,
    cache2: Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).length,
  }));
  console.log(JSON.stringify(diag, null, 1));
  await browser.close();
})();
