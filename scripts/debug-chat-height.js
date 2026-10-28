/** دیباگ ارتفاع چت‌خانه — اندازه‌گیری اجزای سربرگ/پانویس/چت */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await page.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const hdr = document.querySelector('header')?.getBoundingClientRect().height ?? -1;
    const sync = document.getElementById('noq-syncbar')?.getBoundingClientRect().height ?? 0;
    const ftr = document.querySelector('footer')?.getBoundingClientRect().height ?? -1;
    const main = document.querySelector('main');
    const cs = main ? getComputedStyle(main) : null;
    const chat = document.querySelector('main > div');
    const chatStyle = chat ? { h: chat.getBoundingClientRect().height, style: chat.style.height, cls: chat.className } : null;
    return {
      hdr, sync, ftr,
      pad: cs ? cs.paddingTop + '/' + cs.paddingBottom : null,
      mainH: main?.getBoundingClientRect().height,
      chat: chatStyle,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  process.exit(0);
})();
