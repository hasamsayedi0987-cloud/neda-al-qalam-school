/**
 * تست جامع نسخهٔ ۲.۲.۱ — سه اصلاح گزارش کاربر
 *
 * ۱) داشبورد آفلاین: تعداد شاگردان/معلمان/کارمندان/صنف‌ها در آفلاین درست نمایش داده شود
 *    - کش داشبورد به‌ازای هر کاربر جدا می‌شود (دیگر دادهٔ کاربر قبلی روی گوشی مشترک دیده نمی‌شود)
 *    - «undefined» حاضری امروز ریشه‌کن شد (فقط دادهٔ واقعی روز جاری رندر می‌شود)
 *    - اگر کش داشبورد نبود: آمار از آخرین دادهٔ بخش‌ها ساخته می‌شود (پیام «حالت آفلاین»)
 * ۲) اعلان‌ها و پیام‌ها:
 *    - ارسال پیام → اعلان برای گیرنده (زنگ بالای صفحه + شمار نخوانده)
 *    - پیام‌ها قابل حذف‌اند (دریافتی: برای من؛ مستقیمِ خودم: کامل برای دو طرف)
 * ۳) منوی کناری: اسکرول بومی لمسی (بدون ScrollArea) — همهٔ تب‌ها دسترس‌پذیر
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
const fails = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✘ ${name} ${extra}`); }
}

async function apiLogin(u, p) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: u, password: p }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return { cookie: setCookie.split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
}

async function api(method, url, body, cookie) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // گوشی واقعی — منوی کشویی و تب‌های پایین
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (t.includes('401') || t.includes('403') || t.includes('400 (Bad Request)') || t.includes('404')) return;
      errors.push(t);
    }
  });

  const stamp = Date.now().toString(36).slice(-5);

  // ═══ فاز ۱: پیام → اعلان → حذف (API) ═══
  console.log('═ فاز ۱: پیام‌رسانی، اعلان و حذف پیام ═');
  const admin = await apiLogin('admin', 'admin123');
  check('ورود مدیر', admin.status === 200 && admin.data?.user?.role === 'ADMIN');

  const teacher = await apiLogin('teacher', '12345678');
  check('ورود معلم', teacher.status === 200 && teacher.data?.user?.role === 'TEACHER');
  const teacherId = teacher.data?.user?.id;

  // شمار اعلان پیش از ارسال پیام
  const notif0 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  const unread0 = notif0.data?.unread ?? -1;
  check('GET /api/notifications کار می‌کند', notif0.status === 200 && Array.isArray(notif0.data.notifications), `unread=${unread0}`);

  // پیام مستقیم مدیر → معلم
  const subj = `تست اعلان ${stamp}`;
  const send1 = await api('POST', '/api/messages', { toUserId: teacherId, subject: subj, body: 'سلام، این پیام آزمایشی است.', category: 'GENERAL' }, admin.cookie);
  check('ارسال پیام مستقیم', send1.status === 200 && !!send1.data.id, JSON.stringify(send1.data).slice(0, 80));
  const msgId1 = send1.data.id;

  // اعلان ساخته شد؟ (زنگ بالای صفحه باید روشن شود)
  const notif1 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  const topNotif = (notif1.data.notifications || [])[0] || {};
  check(
    'ارسال پیام اعلان ساخت (عنوان + شمار نخوانده)',
    notif1.status === 200 &&
      notif1.data.unread === unread0 + 1 &&
      String(topNotif.title).includes('پیام جدید') &&
      String(topNotif.title).includes('مدیر مکتب') &&
      String(topNotif.body).includes(subj),
    `unread ${unread0}→${notif1.data.unread} | title=${topNotif.title}`,
  );

  // صندوق معلم — پیام رسیده و نخوانده است
  const inbox1 = await api('GET', '/api/messages', undefined, teacher.cookie);
  const got = (inbox1.data.inbox || []).find((m) => m.id === msgId1);
  check('پیام در صندوق ورودی معلم است (نخوانده)', !!got && got.read === false && inbox1.data.unread >= 1);

  // ═══ فاز ۲: حذف پیام ═══
  console.log('═ فاز ۲: حذف پیام ═');
  // حذف پیام دریافتی توسط گیرنده (نرم — فقط برای من)
  const del1 = await api('DELETE', `/api/messages?id=${msgId1}`, undefined, teacher.cookie);
  check('حذف پیام دریافتی توسط گیرنده', del1.status === 200 && del1.data.ok === true && del1.data.hard === false, JSON.stringify(del1.data));
  const inbox2 = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('پیام حذف‌شده از صندوق گیرنده پنهان شد', !(inbox2.data.inbox || []).some((m) => m.id === msgId1));
  // فرستنده هنوز آن را در «ارسال‌شده» می‌بیند (حذف نرم)
  const sentAdmin = await api('GET', '/api/messages', undefined, admin.cookie);
  check('پیام در «ارسال‌شدهٔ» فرستنده هنوز هست (حذف نرم)', (sentAdmin.data.sent || []).some((m) => m.id === msgId1));

  // حذف کامل: پیام مستقیم خود فرستنده
  const send2 = await api('POST', '/api/messages', { toUserId: teacherId, body: `پیام دوم ${stamp}`, category: 'ACADEMIC' }, admin.cookie);
  const msgId2 = send2.data.id;
  const del2 = await api('DELETE', `/api/messages?id=${msgId2}`, undefined, admin.cookie);
  check('حذف پیام مستقیم توسط فرستنده — حذف کامل', del2.status === 200 && del2.data.hard === true);
  const inbox3 = await api('GET', '/api/messages', undefined, teacher.cookie);
  const sent2 = await api('GET', '/api/messages', undefined, admin.cookie);
  check('پیام مستقیم حذف‌شده برای دو طرف پاک شد', !(inbox3.data.inbox || []).some((m) => m.id === msgId2) && !(sent2.data.sent || []).some((m) => m.id === msgId2));

  // پیام همگانی به نقش معلم → اعلان + حذف نرم
  const notifB0 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  const bcast = await api('POST', '/api/messages', { toRole: 'TEACHER', body: `اطلاعیهٔ همگانی ${stamp}`, category: 'ANNOUNCEMENT' }, admin.cookie);
  check('ارسال پیام همگانی به نقش', bcast.status === 200 && !!bcast.data.id);
  const notifB1 = await api('GET', '/api/notifications', undefined, teacher.cookie);
  check('پیام همگانی هم اعلان ساخت', notifB1.data.unread === notifB0.data.unread + 1, `${notifB0.data.unread}→${notifB1.data.unread}`);
  const bId = bcast.data.id;
  await api('DELETE', `/api/messages?id=${bId}`, undefined, teacher.cookie);
  const inbox4 = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('پیام همگانی حذف‌شده فقط برای معلم پنهان شد', !(inbox4.data.inbox || []).some((m) => m.id === bId));

  // گارد: حذف پیام ناموجود (۴۰۰ پیش‌فرض ApiError یا ۴۰۴)
  const delBad = await api('DELETE', '/api/messages?id=nonexistent-xyz', undefined, teacher.cookie);
  check('حذف پیام ناموجود — خطای منطقی', delBad.status === 404 || delBad.status === 400, `status=${delBad.status}`);

  // پیام از معلم به مدیر (برای تست رابط حذف در فاز ۴)
  await api('POST', '/api/messages', { toUserId: admin.data.user.id, subject: `از معلم ${stamp}`, body: 'پیام معلم به مدیر برای آزمایش حذف از رابط.', category: 'GENERAL' }, teacher.cookie);

  // ═══ فاز ۳: رابط کاربری — داشبورد و کش کاربر-مخصوص ═══
  console.log('═ فاز ۳: داشبورد آنلاین + دامنهٔ کش ═');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('text=دسترسی سریع', { timeout: 20000 });
  check('ورود رابط کاربری مدیر — داشبورد بار شد', true);

  // کارت آمار: نه صفرِ اشتباه و نه undefined — مقدار عددی فارسی
  await page.waitForSelector('text=شاگردان فعال', { timeout: 10000 });
  const activeCard = await page.locator('div:has(> p:text-is("شاگردان فعال"))').last().locator('p').nth(1).textContent().catch(() => '');
  check('کارت «شاگردان فعال» عدد واقعی دارد', /[۰-۹]/.test(activeCard || '') && !(activeCard || '').includes('undefined'), `value=${activeCard}`);

  // کش داشبورد با دامنهٔ کاربر ذخیره شده؟
  const scoped = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}');
    const keys = Object.keys(cache);
    return {
      dashScoped: keys.filter((k) => k.startsWith('/api/dashboard@u:')),
      notifScoped: keys.filter((k) => k.startsWith('/api/notifications@u:')),
      msgScoped: keys.filter((k) => k.startsWith('/api/messages@u:')),
      scope: localStorage.getItem('noq_cache_scope_v1'),
    };
  });
  check('کش داشبورد با دامنهٔ کاربر ذخیره شد', scoped.dashScoped.length > 0, JSON.stringify(scoped.dashScoped));
  check('کش اعلان‌ها با دامنهٔ کاربر ذخیره شد', scoped.notifScoped.length > 0);
  check('دامنهٔ فعال = شناسهٔ مدیر', scoped.scope && scoped.scope.startsWith('u:'), `scope=${scoped.scope}`);

  // ═══ فاز ۴: آفلاین — داشبورد درست + بدون undefined ═══
  console.log('═ فاز ۴: داشبورد آفلاین ═');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'commit', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // نشست از کش بازسازی می‌شود؛ اگر صفحهٔ ورود آمد، ورود آفلاین
  const hasLogin = await page.locator('#username').count();
  if (hasLogin > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=دسترسی سریع', { timeout: 15000 });
  }
  await page.waitForSelector('text=شاگردان فعال', { timeout: 15000 });
  const visibleText1 = await page.evaluate(() => document.body.innerText);
  check('آفلاین: داشبورد بدون «undefined» رندر شد', !visibleText1.includes('undefined'));

  const activeOffline = await page.locator('div:has(> p:text-is("شاگردان فعال"))').last().locator('p').nth(1).textContent().catch(() => '');
  check('آفلاین: تعداد شاگردان فعال درست نمایش داده شد', activeOffline === activeCard, `آفلاین=${activeOffline} آنلاین=${activeCard}`);

  // کارت حاضری امروز — یا با عددهای درست یا اصلاً رندر نشده (هرگز undefined)
  const attCard = await page.locator('text=حاضری امروز').count();
  if (attCard > 0) {
    const attText = await page.locator('text=حاضری امروز').locator('xpath=ancestor::div[@data-slot="card" or contains(@class,"card")]').first().textContent().catch(() => '');
    check('آفلاین: کارت حاضری امروز بدون undefined', !(attText || '').includes('undefined'));
  } else {
    check('آفلاین: کارت حاضری امروز بدون داده رندر نشد (رفتار درست)', true);
  }

  // ═══ فاز ۵: بازسازی آمار از کش بخش‌ها (بدون کش داشبورد) ═══
  // نکته: setOffline در Playwright روی واکشی سرویس‌ورکر اعمال نمی‌شود؛ پس سرور را واقعاً می‌بندیم
  // (معادل دقیق قطعی اینترنت) — مسیر بازسازی آمار از کش بخش‌ها باید فعال شود
  console.log('═ فاز ۵: بازسازی آمار آفلاین از دادهٔ بخش‌ها (توقف واقعی سرور) ═');
  const { execSync, spawn } = require('child_process');
  await page.evaluate(async () => {
    // کش شاگردان/معلمان/صنف‌ها از دادهٔ واقعی سرور پر می‌شود (همان قالب cacheGet)
    const [st, te, cl] = await Promise.all([
      fetch('/api/students', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/teachers', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/classes', { credentials: 'include' }).then((r) => r.json()),
    ]);
    const cache = JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}');
    cache['/api/students'] = { t: Date.now(), data: st };
    cache['/api/teachers'] = { t: Date.now(), data: te };
    cache['/api/classes'] = { t: Date.now(), data: cl };
    for (const k of Object.keys(cache)) if (k.startsWith('/api/dashboard')) delete cache[k];
    localStorage.setItem('noq_get_cache_v1', JSON.stringify(cache));
    // کش داشبورد از سرویس‌ورکر هم پاک می‌شود
    for (const ck of await caches.keys()) {
      const c = await caches.open(ck);
      for (const r of await c.keys()) if (r.url.includes('/api/dashboard')) await c.delete(r);
    }
  });
  execSync("pkill -f 'standalone/server[.]js' || true");
  await page.waitForTimeout(1200);
  // جابه‌جایی ویو → داشبورد دوباره بار می‌شود → واکشی واقعاً شکست می‌خورد → مسیر بازسازی
  await page.locator('button[aria-label="بازکردن منو"]').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'معلمان و کارمندان' }).last().click();
  await page.waitForTimeout(1000);
  await page.locator('button[aria-label="بازکردن منو"]').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'خانه / داشبورد', exact: true }).last().click();
  await page.waitForTimeout(2500);
  const partialNote = await page.locator('text=حالت آفلاین — این آمار از آخرین داده‌های ذخیره‌شده').count();
  check('حالت بازسازی: پیام «آمار از آخرین داده‌های ذخیره‌شده» دیده شد', partialNote > 0);
  const activeFallback = await page.locator('div:has(> p:text-is("شاگردان فعال"))').last().locator('p').nth(1).textContent().catch(() => '');
  check('بازسازی: تعداد شاگردان از کش بخش شاگردان درست محاسبه شد', activeFallback === activeCard, `fallback=${activeFallback} واقعی=${activeCard}`);
  const visibleText2 = await page.evaluate(() => document.body.innerText);
  check('بازسازی: هیچ «undefined» در صفحه نیست', !visibleText2.includes('undefined'));
  // راه‌اندازی دوبارهٔ سرور برای فازهای بعدی
  spawn('bun', ['.next/standalone/server.js'], { cwd: '/home/z/my-project', detached: true, stdio: 'ignore' }).unref();
  let serverBack = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    try { const r = await fetch(`${BASE}/api/auth`); if (r.ok) { serverBack = true; break; } } catch { /* تلاش دوباره */ }
  }
  check('سرور برای فازهای بعدی برگشت', serverBack);

  // ═══ فاز ۶: حذف پیام از رابط کاربری + منوی قابل اسکرول ═══
  console.log('═ فاز ۶: رابط — حذف پیام و اسکرول منو ═');
  await ctx.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const hasLogin3 = await page.locator('#username').count();
  if (hasLogin3 > 0) {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.getByRole('button', { name: 'ورود به سیستم' }).click();
    await page.waitForSelector('text=دسترسی سریع', { timeout: 20000 });
  }
  page.on('dialog', (d) => d.accept());
  // منوی کشویی موبایل — فهرست بخش‌ها با اسکرول بومی و همهٔ تب‌ها در دسترس
  const menuBtn = page.locator('button[aria-label="بازکردن منو"]');
  await menuBtn.click();
  await page.waitForTimeout(700);
  const scrollInfo = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div'));
    const scrollable = els.filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return r.width > 0 && (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.querySelector('nav');
    });
    if (scrollable.length === 0) return { ok: false };
    return { ok: true, native: true };
  });
  check('فهرست منو با اسکرول بومی (overflow-y:auto) است', scrollInfo.ok === true, JSON.stringify(scrollInfo));
  // آخرین تب‌های منو (کتابخانه) باید در دسترس و بازشدنی باشند
  const libBtn = page.getByRole('button', { name: 'کتابخانه' }).last();
  await libBtn.scrollIntoViewIfNeeded();
  await libBtn.click();
  await page.waitForTimeout(900);
  const libLoaded = await page.locator('text=کتابخانه').first().isVisible();
  check('تب‌های انتهای منو با اسکرول در دسترس و باز شدند (کتابخانه)', libLoaded);

  // بخش پیام‌ها — از منو باز می‌شود
  await page.locator('button[aria-label="بازکردن منو"]').click();
  await page.waitForTimeout(600);
  const msgNav = page.getByRole('button', { name: 'ارتباطات' }).last();
  await msgNav.scrollIntoViewIfNeeded();
  await msgNav.click();
  await page.waitForTimeout(400);
  await page.waitForSelector('text=ارتباطات و پیام‌ها', { timeout: 15000 });
  check('بخش پیام‌ها باز شد', true);
  await page.waitForTimeout(1200);
  // اولین ردیف صندوق ورودی — دکمهٔ حذف
  const trashBtns = page.locator('button[aria-label="حذف پیام"]');
  const trashCount = await trashBtns.count();
  check('دکمهٔ حذف پیام در صندوق موجود است', trashCount > 0, `count=${trashCount}`);
  if (trashCount > 0) {
    const rowsBefore = await page.locator('button[aria-label="حذف پیام"]').count();
    await trashBtns.first().click();
    await page.waitForTimeout(1500);
    const toastGone = await page.locator('text=پیام حذف شد').first().isVisible().catch(() => false);
    const rowsAfter = await page.locator('button[aria-label="حذف پیام"]').count();
    check('حذف پیام از رابط انجام شد (پیام تأیید + ردیف کم شد)', toastGone || rowsAfter < rowsBefore, `before=${rowsBefore} after=${rowsAfter} toast=${toastGone}`);
  }

  // ═══ فاز ۷: خطاهای کنسول ═══
  const realErrors = errors.filter((e) => !e.includes('Failed to load resource') && !e.includes('ERR_INTERNET_DISCONNECTED') && !e.includes('ERR_ABORTED'));
  check('صفر خطای کنسول در کل تست', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

  await browser.close();
  console.log('═'.repeat(50));
  console.log(`نتیجهٔ نهایی: ${passed} PASS | ${failed} FAIL`);
  if (fails.length) console.log('شکست‌ها:\n- ' + fails.join('\n- '));
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('خطای اجرای تست:', e); process.exit(2); });
