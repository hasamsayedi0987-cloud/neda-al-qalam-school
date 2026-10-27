/** دیباگ UI — باز کردن بخش پیام‌ها و ثبت خطاها */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });
  console.log('login OK — dashboard loaded');
  await page.locator('button[aria-label="بازکردن منو"]').click();
  await page.waitForTimeout(800);
  const navButtons = await page.locator('nav button, [data-slot="sheet-content"] button').allTextContents();
  console.log('nav buttons:', navButtons.join(' | ').slice(0, 400));
  const msgBtn = page.getByRole('button', { name: /ارتباطات/ }).last();
  console.log('msg btn count:', await page.getByRole('button', { name: /ارتباطات/ }).count());
  await msgBtn.click();
  await page.waitForTimeout(2500);
  const body = await page.textContent('body');
  console.log('has عنوان پیام‌ها:', body.includes('ارتباطات و پیام‌ها'));
  console.log('has نوشتن:', body.includes('نوشتن'));
  console.log('has صلاحیت‌ها:', body.includes('صلاحیت‌ها'));
  console.log('body snapshot:', body.slice(0, 400).replace(/\s+/g, ' '));
  await page.screenshot({ path: '/home/z/my-project/scripts/ui-debug.png', fullPage: false });
  await browser.close();
})();
