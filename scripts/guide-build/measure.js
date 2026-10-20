// اندازه‌گیری تشخیصی ارتفاع بخش‌ها (فقط اندازه‌گیری — نه تولید PDF)
const path = require('path');
try { require.resolve('playwright'); } catch (e) {
  console.error('playwright not found from cwd');
  process.exit(2);
}
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.emulateMedia({ media: 'print' });
  await page.goto('file:///home/z/my-project/scripts/guide-build/nedaalqalam-guide-print.html');
  await page.waitForTimeout(1000);
  const data = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.page').forEach((p, i) => {
      const parts = [];
      p.querySelectorAll('.head, .head2, .inner, .inner > *, .foot').forEach(el => {
        const r = el.getBoundingClientRect();
        parts.push({ el: (el.className || el.tagName).toString().slice(0, 28), h: Math.round(r.height) });
      });
      out.push({ page: i + 1, scrollH: p.scrollHeight, clientH: p.clientHeight, parts });
    });
    return out;
  });
  console.log(JSON.stringify(data, null, 1));
  await browser.close();
})();
