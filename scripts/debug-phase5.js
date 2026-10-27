/** دیباگ فاز ۵ — چرا پیام «بازسازی آمار» دیده نمی‌شود */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=دسترسی سریع', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const keysBefore = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).filter((k) => !k.startsWith('/_')));
  console.log('کلیدهای کش localStorage پس از ورود آنلاین:', keysBefore);

  // پاک‌سازی کامل کش داشبورد (localStorage + SW)
  await page.evaluate(async () => {
    const cache = JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}');
    for (const k of Object.keys(cache)) if (k.startsWith('/api/dashboard@')) delete cache[k];
    localStorage.setItem('noq_get_cache_v1', JSON.stringify(cache));
    const ckeys = await caches.keys();
    for (const ck of ckeys) {
      const c = await caches.open(ck);
      for (const r of await c.keys()) if (r.url.includes('/api/dashboard')) await c.delete(r);
    }
  });
  const keysAfter = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).filter((k) => k.startsWith('/api/')));
  console.log('کلیدهای /api/ پس از پاک‌سازی داشبورد:', keysAfter);

  await ctx.setOffline(true);
  await page.evaluate(() => { window.__noqMarker = 'OLD'; });
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch((e) => console.log('reload خطا:', String(e).slice(0, 100)));
  await page.waitForTimeout(3000);
  const marker = await page.evaluate(() => window.__noqMarker ?? 'NEW-DOC');
  console.log('reload واقعاً انجام شد؟', marker === 'NEW-DOC' ? 'بله (سند تازه)' : `نه — مارکر: ${marker}`);
  const hasLogin = await page.locator('#username').count();
  console.log('صفحهٔ ورود؟', hasLogin > 0);
  if (hasLogin > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForTimeout(3500);
  }
  await page.waitForTimeout(1500);
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('---');
  console.log('دارد «شاگردان فعال»؟', txt.includes('شاگردان فعال'));
  console.log('دارد «آمار از آخرین داده‌های ذخیره‌شده»؟', txt.includes('آمار از آخرین داده‌های ذخیره‌شده'));
  console.log('دارد «برای حالت آفلاین ذخیره نشده»؟', txt.includes('برای حالت آفلاین ذخیره نشده'));
  console.log('دارد «دسترسی سریع»؟', txt.includes('دسترسی سریع'));
  const hasLoginEnd = await page.locator('#username').count();
  console.log('پایان: صفحهٔ ورود؟', hasLoginEnd > 0);
  console.log('snippet:', txt.slice(0, 500).replace(/\n+/g, ' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });

// --- بخش دوم: پس از آفلاین-ریلود، وضعیت کش چیست؟ ---
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR:', m.text().slice(0, 120)); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=دسترسی سریع', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const cache = JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}');
    for (const k of Object.keys(cache)) if (k.startsWith('/api/dashboard')) delete cache[k];
    localStorage.setItem('noq_get_cache_v1', JSON.stringify(cache));
    for (const ck of await caches.keys()) {
      const c = await caches.open(ck);
      for (const r of await c.keys()) if (r.url.includes('/api/dashboard')) await c.delete(r);
    }
  });
  const check1 = await page.evaluate(() => ({
    dash: Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).filter((k) => k.includes('dashboard')),
  }));
  console.log('پس از حذف، کلید dashboard در localStorage:', JSON.stringify(check1.dash));
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch((e) => console.log('reload err:', String(e).slice(0, 80)));
  await page.waitForTimeout(3500);
  const st = await page.evaluate(async () => ({
    dashKeys: Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).filter((k) => k.includes('dashboard')),
    allApi: Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')).filter((k) => k.startsWith('/api/')),
    swCaches: await (async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); out.push([k, (await c.keys()).filter((r) => r.url.includes('dashboard')).length]); } return out; })(),
    full: document.body.innerText.includes('روند حاضری'),
  }));
  console.log('پس از آفلاین-ریلود:', JSON.stringify(st, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
