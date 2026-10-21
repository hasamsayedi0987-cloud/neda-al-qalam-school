/**
 * بازتولید باگ گزارش کاربر: «کاربرانِ ثبت‌شدهٔ آفلاین بعد از آنلاین شدن ناپدید می‌شوند،
 * هنگام افزودن مجدد پیام «قبلاً ثبت شده» می‌آید و ورود با آن نام‌ها ممکن نیست»
 *
 * سه سناریو:
 *  A) ورود مجدد «آنلاین» — انتظار: صف تخلیه و کاربران به سرور می‌رسند و در جدول دیده می‌شوند
 *  B) ورود مجدد «آفلاین» (وای‌فای وصل، انترنت مرده) → برگشت انترنت → انتظار: ۴۰۱ و گیر کردن صف
 *  C) کاربر آفلاین با رمز کوتاه (<۶) — انتظار: ۴۰۰ و «حذف بی‌صدا» داده (نابودی داده)
 */
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const { spawn, execSync } = require('child_process');

const BASE = 'http://localhost:3100';
const ok = (m) => console.log('  ✓', m);
const bad = (m) => console.log('  ✗', m);
const info = (m) => console.log('  ·', m);

async function serverCookie() {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: 'admin123' }),
  });
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function serverUsers(cookie) {
  const res = await fetch(`${BASE}/api/users`, { headers: { cookie } });
  const j = await res.json();
  return (j.users || []).map((u) => u.username);
}

async function ls(page) {
  return page.evaluate(() => ({
    queue: JSON.parse(localStorage.getItem('noq_offline_queue_v1') || '[]'),
    overlay: JSON.parse(localStorage.getItem('noq_overlay_v1') || '[]'),
  }));
}

async function waitSW(page) {
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.active || !navigator.serviceWorker.controller) return 'wait';
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) { const c = await caches.open(k); n += (await c.keys()).length; }
      return n > 20 ? 'ready' : 'wait';
    }).catch(() => 'wait');
    if (st === 'ready') return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

/** صبر تا ورود یا داشبورد — سپس در صورت نیاز ورود آفلاین/آنلاین */
async function ensureLoggedIn(page, offlineExpected) {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#username').count()) break;
    if (await page.locator('text=داشبورد').count()) return 'session';
    await page.waitForTimeout(500);
  }
  if (!(await page.locator('#username').count())) {
    await page.screenshot({ path: '/tmp/dbg-stuck.png' });
    throw new Error('نه صفحهٔ ورود نه داشبورد!');
  }
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=داشبورد', { timeout: 20000 });
  return offlineExpected ? 'offline-login' : 'online-login';
}

async function gotoUsers(page) {
  await page.locator('aside button:has-text("کاربران و دسترسی‌ها")').click();
  await page.waitForSelector('table tbody tr', { timeout: 15000 });
}

async function addUserViaUI(page, username, password, name) {
  await page.locator('button:has-text("کاربر جدید")').first().click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 5000 });
  const inputs = dialog.locator('input');
  await inputs.nth(0).fill(username);
  await inputs.nth(1).fill(password);
  await inputs.nth(2).fill(name);
  await dialog.getByRole('button', { name: 'ایجاد حساب' }).click();
  await page.waitForTimeout(700);
  // بستن دیالوگ — اگر باز ماند (خطای اعتبارسنجی) با دکمهٔ انصراف
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'انصراف' }).click().catch(async () => {
      await page.keyboard.press('Escape');
    });
  }
  await page.waitForTimeout(400);
}

(async () => {
  execSync('lsof -ti:3100 | xargs -r kill -9');
  await new Promise((r) => setTimeout(r, 500));
  const srv = spawn('bun', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, PORT: '3100', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    detached: true, stdio: 'ignore',
  });
  srv.unref();
  await new Promise((r) => setTimeout(r, 3500));

  const browser = await chromium.launch();
  const cookie = await serverCookie();
  const stamp = Date.now().toString(36).slice(-5);

  // ═══════════ سناریوی A: ورود مجدد آنلاین ═══════════
  console.log('\n═══ سناریوی A: افزودن آفلاین + ورود مجدد آنلاین ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=داشبورد', { timeout: 20000 });
    (await waitSW(page)) ? info('SW آماده شد') : info('SW آماده نشد (مکث کوتاه)');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await ensureLoggedIn(page, true);
    await gotoUsers(page);
    await addUserViaUI(page, `ustad.a${stamp}`, 'ramz123456', 'استاد آفلاین الف');
    await addUserViaUI(page, `ustad.b${stamp}`, 'ramz123456', 'استاد آفلاین ب');
    const s1 = await ls(page);
    info(`آفلاین: صف=${s1.queue.length} رونویسی=${s1.overlay.length}`);
    const shown = await page.locator(`td:has-text("ustad.a${stamp}")`).count();
    shown > 0 ? ok('کاربران آفلاین در جدول دیده می‌شوند (رونویسی)') : bad('کاربران آفلاین در جدول نیستند!');

    // شبیه‌سازی بستن اپ: پاک‌کردن کوکی + صفحهٔ جدید (sessionStorage می‌میرد، localStorage می‌ماند)
    await ctx.clearCookies();
    const page2 = await ctx.newPage();
    await page.close();
    await ctx.setOffline(false);
    await page2.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await ensureLoggedIn(page2, false);
    await page2.waitForTimeout(3500); // فرصت تخلیهٔ صف
    await gotoUsers(page2);
    await page2.waitForTimeout(1500);

    const s2 = await ls(page2);
    const serverList = await serverUsers(cookie);
    const a = serverList.includes(`ustad.a${stamp}`);
    const b = serverList.includes(`ustad.b${stamp}`);
    info(`پس از ورود مجدد: صف=${s2.queue.length} رونویسی=${s2.overlay.length}`);
    a && b ? ok('هر دو کاربر به سرور رسیدند') : bad(`سرور: الف=${a} ب=${b}`);
    const shown2 = await page2.locator(`td:has-text("ustad.a${stamp}")`).count();
    shown2 > 0 ? ok('کاربران در جدول اپ هم نمایش داده می‌شوند') : bad('کاربران در جدول اپ نمایش داده نمی‌شوند!');
    // ورود با کاربر جدید
    await page2.locator('header button').filter({ hasText: 'مدیر مکتب' }).click();
    await page2.getByRole('menuitem', { name: 'خروج از حساب' }).click();
    await page2.waitForSelector('#username', { timeout: 10000 });
    await page2.fill('#username', `ustad.a${stamp}`);
    await page2.fill('#password', 'ramz123456');
    await page2.getByRole('button', { name: 'ورود به سیستم' }).click();
    const loginOk = await page2.waitForSelector('text=داشبورد', { timeout: 15000 }).then(() => true).catch(() => false);
    loginOk ? ok('ورود با کاربر جدیدِ همگام‌شده موفق') : bad('ورود با کاربر جدید ناموفق!');
    await ctx.close();
  }

  // ═══════════ سناریوی B: ورود آفلاین بعد از بستن اپ ═══════════
  console.log('\n═══ سناریوی B: ورود آفلاین → برگشت انترنت → وضعیت صف؟ ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=داشبورد', { timeout: 20000 });
    (await waitSW(page)) ? info('SW آماده شد') : info('SW آماده نشد (مکث کوتاه)');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await ensureLoggedIn(page, true);
    await gotoUsers(page);
    await addUserViaUI(page, `ustad.c${stamp}`, 'ramz123456', 'استاد آفلاین ج');
    ok('کاربر آفلاین ثبت شد');

    // بستن اپ + بازکردن با «وای‌فای وصل ولی انترنت مرده» — APIها abort می‌شوند (onLine=true)
    await ctx.clearCookies();
    await ctx.setOffline(false);
    await ctx.route('**/api/**', (route) => route.abort('connectionrefused'));
    const page2 = await ctx.newPage();
    await page.close();
    await page2.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await ensureLoggedIn(page2, true);
    ok('ورود آفلاین (fallback) موفق — بدون کوکی سرور');

    // انترنت برمی‌گردد — پروب ۱۵ ثانیه‌ای + ورود مجدد خودکار + تخلیهٔ صف
    await ctx.unroute('**/api/**');
    await page2.waitForTimeout(26000);
    const s = await ls(page2);
    const serverList = await serverUsers(cookie);
    const synced = serverList.includes(`ustad.c${stamp}`);
    info(`پس از برگشت انترنت (بدون ورود مجدد): صف=${s.queue.length}`);
    synced ? ok('کاربر به سرور رسید — با ورود مجدد خودکار (بدون دخالت کاربر)') : bad(`کاربر به سرور نرسید — صف=${s.queue.length}`);
    // جدول اپ هم باید کاربر را نشان دهد (تازه‌سازی خودکار پس از همگام‌سازی)
    await gotoUsers(page2);
    const shownB = await page2.locator(`td:has-text("ustad.c${stamp}")`).count();
    shownB > 0 ? ok('کاربر در جدول اپ هم نمایش داده می‌شود') : bad('کاربر در جدول اپ دیده نمی‌شود!');
    await ctx.close();
  }

  // ═══════════ سناریوی C: رمز کوتاه — نابودی بی‌صدای داده؟ ═══════════
  console.log('\n═══ سناریوی C: کاربر آفلاین با رمز کمتر از ۶ حرف ═══');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=داشبورد', { timeout: 20000 });
    (await waitSW(page)) ? info('SW آماده شد') : info('SW آماده نشد (مکث کوتاه)');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await ensureLoggedIn(page, true);
    await gotoUsers(page);
    await addUserViaUI(page, `ustad.d${stamp}`, 'abc', 'استاد رمز کوتاه');
    // انتظار: UI اجازه نمی‌دهد — پیام خطا و هیچ رکوردی در صف
    const errShown = await page.waitForSelector('text=رمز عبور باید حداقل ۶ حرف باشد', { timeout: 4000 }).then(() => true).catch(() => false);
    const s0 = await ls(page);
    errShown ? ok('UI رمز کوتاه را رد کرد (پیام خطا نمایش داده شد)') : bad('UI رمز کوتاه را رد نکرد!');
    s0.queue.length === 0 ? ok('هیچ رکورد خرابی در صف نیست — دادهٔ معیوب اصلاً ساخته نشد') : bad(`صف باید خالی باشد ولی ${s0.queue.length} آیتم دارد!`);
    // حالا با رمز درست — باید صف شود و بعد از اتصال به سرور برسد
    await page.waitForTimeout(800);
    await addUserViaUI(page, `ustad.d${stamp}`, 'ramz123456', 'استاد رمز کوتاه');
    const s0b = await ls(page);
    s0b.queue.length === 1 ? ok('با رمز درست، کاربر در صف ثبت شد') : bad(`صف انتظار=1 دارد=${s0b.queue.length}`);

    await ctx.clearCookies();
    const page2 = await ctx.newPage();
    await page.close();
    await ctx.setOffline(false);
    await page2.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await ensureLoggedIn(page2, false);
    await page2.waitForTimeout(4000);

    const s = await ls(page2);
    const serverList = await serverUsers(cookie);
    const synced = serverList.includes(`ustad.d${stamp}`);
    info(`صف=${s.queue.length} رونویسی=${s.overlay.length} سرور=${synced ? 'دارد' : 'ندارد'}`);
    if (!synced && s.queue.length === 0) bad('داده برای همیشه نابود شد (۴۰۰ → حذف بی‌صدا از صف و رونویسی)!');
    else if (synced) ok('به سرور رسید');
    else info('در صف ماند — قابل بازیابی');
    await ctx.close();
  }

  await browser.close();
  console.log('\n═══ پایان بازتولید ═══');
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
