/** عیب‌یابی ۲ — همان سناریوی test-v320 با ثبت کنسول و رویدادها */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:3100';
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (t.includes('PREFETCH') || t.includes('ONLINE')) logs.push(t); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  const c1 = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).length);
  console.log('cache1:', c1);
  await page.evaluate(() => {
    window.__diag = [];
    window.addEventListener('online', () => window.__diag.push('online-event'));
    window.addEventListener('noq:prefetched', (e) => window.__diag.push('prefetched(ok=' + e.detail?.ok + ')'));
  });
  // قطع — همان test-v320: رفتن به کتابخانه و نمرات (apiGet آفلاین → setOnlineState(false))
  await context.setOffline(true);
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'library'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'grades'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(1800);
  const offState = await page.evaluate(() => window.__diag.slice());
  console.log('during offline diag:', JSON.stringify(offState));
  await context.setOffline(false);
  await page.waitForTimeout(12000);
  const res = await page.evaluate(() => ({
    diag: window.__diag,
    cache2: Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).length,
  }));
  console.log('after reconnect:', JSON.stringify(res));
  console.log('console logs:', JSON.stringify(logs.slice(0, 10)));
  await browser.close();
})();
