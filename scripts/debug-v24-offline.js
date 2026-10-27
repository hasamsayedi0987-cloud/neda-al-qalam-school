/** دیباگ فاز آفلاین چت‌خانه — ساعتِ پیام در انتظار */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');

function killPort3000() {
  try {
    const out = execSync("ss -tlnp | grep ':3000 ' || true").toString();
    const m = out.match(/pid=(\d+)/);
    if (m) { try { execSync(`kill ${m[1]}`); } catch { /* already dead */ } }
  } catch { /* ignore */ }
}

(async () => {
  // آماده‌سازی: پیام مستقیم مدیر → معلم تا گفتگو وجود داشته باشد
  const login = await fetch('http://localhost:3000/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', username: 'admin', password: 'admin123' }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const users = await (await fetch('http://localhost:3000/api/users', { headers: { cookie } })).json();
  const tUser = (users.users || []).find((u) => u.username === 'tv21840481');
  await fetch('http://localhost:3000/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ targets: [{ kind: 'users', userIds: [tUser.id] }], body: 'بذر دیباگ ساعت ' + Date.now() }) });

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 150)));
  await p.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#username', { timeout: 15000 });
  await p.fill('#username', 'tv21840481');
  await p.fill('input[type="password"]', '12345678');
  await p.getByRole('button', { name: 'ورود به سیستم' }).click();
  await p.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });
  await p.locator('button[aria-label="بازکردن منو"]').click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await p.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await p.waitForTimeout(1200);

  killPort3000();
  await p.waitForTimeout(1200);
  console.log('server killed');

  await p.locator('button[aria-label="بازکردن منو"]').click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'خانه / داشبورد', exact: true }).last().click();
  await p.waitForTimeout(1200);
  await p.locator('button[aria-label="بازکردن منو"]').click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await p.waitForTimeout(2000);

  const rows = await p.locator('button.w-full').allTextContents();
  console.log('rows with مدیر:', rows.filter((r) => r.includes('مدیر مکتب')).map((r) => r.replace(/\s+/g, ' ').slice(0, 70)));
  const row = p.locator('button:has-text("مدیر مکتب")').first();
  await row.click();
  await p.waitForTimeout(800);
  console.log('composer count:', await p.locator('textarea[aria-label="متن پیام"]').count());

  await p.fill('textarea[aria-label="متن پیام"]', 'دیباگ ساعت آفلاین X1');
  await p.click('button[aria-label="ارسال پیام"]');
  await p.waitForTimeout(1200);

  const metaHtml = await p.evaluate(() => {
    const els = [...document.querySelectorAll('p')].filter((el) => el.textContent.includes('دیباگ ساعت آفلاین X1'));
    if (!els.length) return 'BUBBLE NOT FOUND';
    const bubble = els[0].closest('div');
    return bubble ? bubble.innerHTML.slice(-700) : 'NO BUBBLE DIV';
  });
  console.log('META:', metaHtml);
  console.log('---clock count:', await p.locator('svg.lucide-clock').count());

  await b.close();
  spawn('node', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project', detached: true, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db', PORT: '3000', HOSTNAME: '127.0.0.1' },
  }).unref();
  await new Promise((r) => setTimeout(r, 3500));
  process.exit(0);
})();
