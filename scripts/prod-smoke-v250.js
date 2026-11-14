/* دودتست پروداکشن — نسخهٔ وب به‌روز است؟ */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('https://neda-al-qalam-school.vercel.app/', { waitUntil: 'networkidle', timeout: 60000 });
  const v = await page.locator('text=نسخهٔ ۲.۵.۰').first().isVisible().catch(() => false);
  console.log('login page shows 2.5.0:', v);
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  const inApp = await page.locator('header').first().isVisible().catch(() => false);
  console.log('login on production works:', inApp);
  // برگشت بین بخش‌ها
  await page.getByRole('button', { name: 'شاگردان' }).last().click();
  await page.waitForTimeout(1500);
  await page.goBack();
  await page.waitForTimeout(1200);
  console.log('back button navigates views:', !/view=students/.test(page.url()));
  const swV = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? 'registered' : 'none';
  });
  console.log('SW:', swV);
  console.log('JS errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
})();
