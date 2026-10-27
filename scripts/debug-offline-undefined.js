/** دیباگ: یافتن منبع «undefined» در صفحهٔ آفلاین */
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

  // داشبورد آنلاین — undefined هست؟
  let t = await page.locator('body').textContent();
  console.log('آنلاین دارای undefined؟', t.includes('undefined'));

  // آفلاین
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const hasLogin = await page.locator('#username').count();
  if (hasLogin > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=دسترسی سریع', { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(2000);
  t = await page.locator('body').textContent();
  console.log('آفلاین دارای undefined؟', t.includes('undefined'));
  if (t.includes('undefined')) {
    // کوچک‌ترین عنصر دارای undefined
    const src = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      let best = null, bestLen = 1e9;
      for (const el of all) {
        if (el.children.length === 0 && (el.textContent || '').includes('undefined')) {
          const len = (el.textContent || '').length;
          if (len < bestLen) { bestLen = len; best = { tag: el.tagName, cls: el.className?.toString?.().slice(0, 80), text: el.textContent.slice(0, 160) }; }
        }
      }
      return best;
    });
    console.log('منبع undefined:', JSON.stringify(src, null, 1));
  }

  // حالت بازسازی: حذف کش داشبورد و آفلاین دوباره
  await ctx.setOffline(false);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}');
    for (const k of Object.keys(cache)) if (k.startsWith('/api/dashboard@')) delete cache[k];
    localStorage.setItem('noq_get_cache_v1', JSON.stringify(cache));
  });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const hasLogin2 = await page.locator('#username').count();
  if (hasLogin2 > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1500);
  const partialCount = await page.locator('text=حالت آفلاین — این آمار از آخرین داده‌های ذخیره‌شده').count();
  console.log('پیام بازسازی آمار دیده شد؟', partialCount > 0);
  t = await page.locator('body').textContent();
  console.log('بازسازی دارای undefined؟', t.includes('undefined'));
  if (t.includes('undefined')) {
    const src = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      let best = null, bestLen = 1e9;
      for (const el of all) {
        if (el.children.length === 0 && (el.textContent || '').includes('undefined')) {
          const len = (el.textContent || '').length;
          if (len < bestLen) { bestLen = len; best = { tag: el.tagName, cls: el.className?.toString?.().slice(0, 80), text: el.textContent.slice(0, 160) }; }
        }
      }
      return best;
    });
    console.log('منبع undefined (بازسازی):', JSON.stringify(src, null, 1));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
