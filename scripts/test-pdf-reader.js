/**
 * آزمون تصویری خوانندهٔ PDF — نسخهٔ ۳.۱.۰
 * کتاب آزمونی را می‌سازد، در مرورگر باز می‌کند، بوم را رندر و اسکرین‌شات می‌گیرد.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const PDF_B64 = fs.readFileSync('/tmp/test-book.pdf').toString('base64');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✔ ' + n); } else { fail++; console.log('  ✘ ' + n + (d ? ' — ' + String(d).slice(0, 150) : '')); } };

(async () => {
  // ۱) ورود با API و ساخت کتاب
  const login = await fetch(BASE + '/api/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: 'admin123' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const H = { 'Content-Type': 'application/json', Cookie: cookie };
  const book = await (await fetch(BASE + '/api/library', {
    method: 'POST', headers: H,
    body: JSON.stringify({ action: 'save-book', title: 'کتاب آزمون خواننده', copies: 1, pdfFile: { name: 'reader-test.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,' + PDF_B64 } }),
  })).json();
  check('کتاب آزمونی ساخته شد', !!book.id, JSON.stringify(book));

  // ۲) مرورگر: ورود → کتابخانه → مطالعه → بوم رندر شده؟
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'library'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2500);
  const readBtn = page.getByRole('button', { name: 'مطالعه' }).first();
  check('دکمهٔ مطالعه برای کتاب PDF دیده می‌شود', await readBtn.isVisible().catch(() => false));
  await readBtn.click();
  await page.waitForTimeout(5000); // pdf.js + worker + رندر
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, Math.min(200, c.width), Math.min(100, c.height)).data;
    let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) nonWhite++;
    return { w: c.width, h: c.height, nonWhiteRatio: nonWhite / (d.length / 4) };
  });
  check('بوم PDF رندر شد (بوم موجود و غیرخالی)', !!canvasInfo && canvasInfo.w > 0 && canvasInfo.nonWhiteRatio > 0.01, JSON.stringify(canvasInfo));
  const pager = await page.getByText('از ۲').first().isVisible().catch(() => false);
  check('شمار صفحه‌های کتاب: ۲', pager);
  // صفحهٔ بعد
  await page.locator('button[aria-label="صفحهٔ بعد"]').click().catch(() => {});
  await page.waitForTimeout(1500);
  check('صفحه‌گردانی کار می‌کند (خطا نبود)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: '/tmp/render/pdf-reader.png', clip: { x: 180, y: 60, width: 1000, height: 780 } }).catch(() => {});

  // ۳) پاک‌سازی
  await fetch(BASE + '/api/library?id=' + book.id, { method: 'DELETE', headers: H });
  await browser.close();
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail ? 1 : 0);
})();
