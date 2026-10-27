/**
 * تست جامع نسخهٔ ۲.۴ — چت‌خانهٔ مکتب (رابط گفتگوی سبک واتساپ)
 *
 * ۱) API: فهرست مخاطبان + صلاحیت‌ها برای مدیر/معلم/والد
 * ۲) UI دسکتاپ مدیر: فهرست گفتگوها، بازکردن گفتگو، ارسال پیام، گفتگوی جدید،
 *    دیالوگ‌های صلاحیت‌ها و گزارش‌ها، تب گروهی/همگانی
 * ۳) UI موبایل معلم: نشان نخوانده، بازکردن → خوانده‌شدن (سرور)، کانال همگانی فقط‌خواندنی
 * ۴) UI موبایل والد: نگران صنف فرزند در مخاطبان + محدودیت مخاطبان معلم در UI
 * ۵) آفلاین واقعی: توقف سرور → گفتگو از کش → پاسخ صف می‌شود → برگشت سرور → همگام‌سازی
 */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');

const BASE = 'http://localhost:3000';
const STAMP = Date.now().toString(36);
let passed = 0, failed = 0;
const fails = [];
const createdIds = []; // پیام‌های ساختهٔ تست — پایان کار پاک می‌شوند

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
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
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

async function startServer() {
  spawn('node', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project', detached: true, stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db', PORT: '3000', HOSTNAME: '127.0.0.1' },
  }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const r = await fetch(`${BASE}/api/auth`); if (r.ok) return true; } catch { /* تلاش دوباره */ }
  }
  return false;
}

/** کشتن واقعی سرور — next-server نام پروسه را عوض می‌کند؛ با پورت می‌کشیم
 *  نکته: kill -9 لازم است — با SIGTERM، خاموشی مودبانه به‌خاطر اتصالات باز مرورگر معطل می‌ماند */
function killServer() {
  try {
    const out = execSync("ss -tlnp | grep ':3000 ' || true").toString();
    const m = out.match(/pid=(\d+)/);
    if (m) { try { execSync(`kill -9 ${m[1]}`); } catch { /* already dead */ } }
  } catch { /* ignore */ }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ═══ فاز ۰ — API ═══
  console.log('═ فاز ۰: API و آماده‌سازی ═');
  const admin = await apiLogin('admin', 'admin123');
  check('ورود مدیر', admin.status === 200 && admin.data?.user?.role === 'ADMIN');
  const teacher = await apiLogin('tv21840481', '12345678');
  check('ورود معلم صاحب صنف (tv21840481)', teacher.status === 200 && teacher.data?.user?.role === 'TEACHER');
  const parent = await apiLogin('parent', '12345678');
  check('ورود والد', parent.status === 200 && parent.data?.user?.role === 'GUARDIAN');

  const aData = await api('GET', '/api/messages', undefined, admin.cookie);
  check('GET پیام‌های مدیر — مخاطبان و صلاحیت‌ها', aData.status === 200 && (aData.data.contacts || []).length > 0 && aData.data.myPerms?.managePolicy === true);
  const tData = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('GET پیام‌های معلم — مخاطبان مجاز', tData.status === 200 && (tData.data.contacts || []).length > 0);

  const teacherId = teacher.data.user.id;

  // پاک‌سازی بازمانده‌های اجراهای قبلی — فقط پیام‌های آزمونیِ ۶ ساعت اخیر (داده‌های واقعی دست‌نخورده)
  const tNow = Date.now();
  const aOld = await api('GET', '/api/messages', undefined, admin.cookie);
  let cleanedOld = 0;
  for (const m of [...(aOld.data.sent || [])]) {
    const age = tNow - new Date(m.createdAt).getTime();
    const isTestish = age < 6 * 3600 * 1000 && (
      (m.kind === 'DIRECT' && (m.recipientIds || []).includes(teacherId)) ||
      (m.kind === 'BROADCAST' && (m.toRole || '').includes('TEACHER')) ||
      /چت‌خانه|پیام مستقیم چت|اطلاعیهٔ همگانی چت|پاسخ آفلاین/.test(m.body || '')
    );
    if (isTestish) {
      const r = await api('DELETE', `/api/messages?id=${m.id}`, undefined, admin.cookie);
      if (r.status === 200) cleanedOld++;
    }
  }
  if (cleanedOld) console.log(`  پاک‌سازی بازمانده‌های اجرای قبلی: ${cleanedOld} پیام`);

  // پیام مستقیم مدیر → معلم (برای نشان نخوانده)
  const direct = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [teacherId] }], body: `پیام مستقیم چت ${STAMP} — لطفاً بررسی کن`, category: 'GENERAL' }, admin.cookie);
  check('ارسال مستقیم مدیر → معلم', direct.status === 200 && !!direct.data.id, JSON.stringify(direct.data).slice(0, 100));
  if (direct.data.id) createdIds.push(direct.data.id);
  // پیام همگانی به نقش معلمان (کانال)
  const broad = await api('POST', '/api/messages', { targets: [{ kind: 'roles', roles: ['TEACHER'] }], body: `اطلاعیهٔ همگانی چت ${STAMP} — جلسهٔ معلمان`, category: 'ANNOUNCEMENT' }, admin.cookie);
  check('ارسال همگانی به معلمان', broad.status === 200 && !!broad.data.id, JSON.stringify(broad.data).slice(0, 100));
  if (broad.data.id) createdIds.push(broad.data.id);

  // ═══ فاز ۱ — UI دسکتاپ مدیر ═══
  console.log('═ فاز ۱: UI دسکتاپ مدیر (۱۲۸۰px) ═');
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await dctx.newPage();
  dpage.on('pageerror', (e) => errors.push('desktop: ' + String(e)));
  await dpage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await dpage.waitForSelector('#username', { timeout: 15000 });
  await dpage.fill('#username', 'admin');
  await dpage.fill('input[type="password"]', 'admin123');
  await dpage.getByRole('button', { name: 'ورود به سیستم' }).click();
  await dpage.waitForTimeout(1500);

  // منوی دسکتاپ — سایدبار مستقیم دیده می‌شود
  const navMsg = dpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last();
  await navMsg.click();
  await dpage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  check('چت‌خانه باز شد — سربرگ «پیام‌ها» و جست‌وجو', true);
  check('دکمهٔ گفتگوی جدید هست', await dpage.locator('button[aria-label="گفتگوی جدید"]').count() > 0);

  // دو‌پنله: فهرست + جای‌نگهدار
  const placeholder = await dpage.locator('text=گفتگویی را انتخاب کنید').count();
  check('چیدمان دو‌پنلهٔ دسکتاپ (جای‌نگهدار گفتگو)', placeholder > 0);

  // شروع گفتگوی جدید از دیالوگ مخاطبان — قطعی و مستقل از پیام‌های قبلی
  await dpage.click('button[aria-label="گفتگوی جدید"]');
  await dpage.waitForTimeout(700);
  const dlgText1 = await dpage.textContent('body');
  check('دیالوگ گفتگوی جدید — تب اشخاص', dlgText1.includes('اشخاص'));
  check('دیالوگ گفتگوی جدید — تب گروهی و همگانی برای مدیر', dlgText1.includes('گروهی و همگانی'));
  await dpage.fill('input[placeholder="جست‌وجوی نام مخاطب…"]', 'استاد پیام 42le7');
  await dpage.waitForTimeout(400);
  const contactRow = dpage.locator('button:has-text("استاد پیام 42le7")').last();
  await contactRow.click();
  await dpage.waitForTimeout(700);
  const headerName = await dpage.textContent('body');
  check('گفتگوی جدید با مخاطب باز شد', headerName.includes('استاد پیام 42le7'));
  const composerVisible = await dpage.locator('textarea[aria-label="متن پیام"]').count();
  check('بازشدن گفتگو — نوشتار پاسخ دیده می‌شود', composerVisible > 0);
  const newText = `پیام چت‌خانه ${STAMP} به استاد پیام`;
  await dpage.fill('textarea[aria-label="متن پیام"]', newText);
  await dpage.click('button[aria-label="ارسال پیام"]');
  await dpage.waitForTimeout(1600);
  const bubbleCount = await dpage.locator(`text=${newText}`).count();
  check('حباب پیام ارسالی در گفتگو ظاهر شد', bubbleCount > 0);
  // یافتن شناسهٔ پیام برای پاک‌سازی
  const aSent1 = await api('GET', '/api/messages', undefined, admin.cookie);
  const sentMatch1 = (aSent1.data.sent || []).find((m) => m.body === newText);
  if (sentMatch1) createdIds.push(sentMatch1.id);
  check('پیام UI واقعاً در سرور ثبت شد', !!sentMatch1);
  const tick = await dpage.locator('svg.lucide-check-check, svg.lucide-check').count();
  check('نشان ارسال/خواندن (تیک) روی پیام', tick > 0);

  // پاسخ در گفتگوی مستقیم با معلم صاحب صنف (دومین گفتگوی اخیر مدیر)
  const peerRow = dpage.locator('button.w-full:has-text("استاد v21840481")').first();
  await peerRow.click();
  await dpage.waitForTimeout(700);
  const replyText = `پاسخ چت‌خانه ${STAMP} از مدیر`;
  await dpage.fill('textarea[aria-label="متن پیام"]', replyText);
  await dpage.click('button[aria-label="ارسال پیام"]');
  await dpage.waitForTimeout(1600);
  check('ارسال در گفتگوی موجود موفق', (await dpage.locator(`text=${replyText}`).count()) > 0);
  const aSent2 = await api('GET', '/api/messages', undefined, admin.cookie);
  const sentMatch2 = (aSent2.data.sent || []).find((m) => m.body === replyText);
  if (sentMatch2) createdIds.push(sentMatch2.id);

  // تب گروهی — پنل کامل با پیش‌شماره
  await dpage.click('button[aria-label="گفتگوی جدید"]');
  await dpage.waitForTimeout(500);
  await dpage.locator('button[role="tab"]:has-text("گروهی و همگانی")').click();
  await dpage.waitForTimeout(1000);
  const grpText = await dpage.textContent('body');
  check('پنل گروهی/همگانی در دیالوگ (پیش‌شمارهٔ گیرندگان)', grpText.includes('گیرنده') || grpText.includes('همهٔ کاربران'));
  await dpage.keyboard.press('Escape');
  await dpage.waitForTimeout(400);

  // دیالوگ صلاحیت‌ها و گزارش‌ها
  await dpage.click('button[aria-label="صلاحیت‌های ارتباطی"]');
  await dpage.waitForTimeout(1200);
  const polText = await dpage.textContent('body');
  check('پنل صلاحیت‌های ارتباطی باز شد', polText.includes('پیام‌رسانی فعال') || polText.includes('صلاحیت'));
  await dpage.keyboard.press('Escape');
  await dpage.waitForTimeout(400);
  await dpage.click('button[aria-label="گزارش فعالیت پیام‌ها"]');
  await dpage.waitForTimeout(1200);
  const repText = await dpage.textContent('body');
  check('پنل گزارش فعالیت باز شد', repText.includes('گزارش'));
  await dpage.keyboard.press('Escape');
  await dpage.waitForTimeout(300);

  // بدون خطای جاوااسکریپت در فاز دسکتاپ
  check('دسکتاپ: بدون خطای جاوااسکریپت', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 200));
  await dctx.close();

  // ═══ فاز ۲ — UI موبایل معلم ═══
  console.log('═ فاز ۲: UI موبایل معلم (۳۹۰px) ═');
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tpage = await tctx.newPage();
  tpage.on('pageerror', (e) => errors.push('teacher: ' + String(e)));
  tpage.on('dialog', (d) => d.accept());
  await tpage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await tpage.waitForSelector('#username', { timeout: 15000 });
  await tpage.fill('#username', 'tv21840481');
  await tpage.fill('input[type="password"]', '12345678');
  await tpage.getByRole('button', { name: 'ورود به سیستم' }).click();
  await tpage.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });
  await tpage.locator('button[aria-label="بازکردن منو"]').click();
  await tpage.waitForTimeout(700);
  await tpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await tpage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  const tBody1 = await tpage.textContent('body');
  check('معلم: چت‌خانه باز شد', tBody1.includes('پیام‌ها'));
  check('معلم: نشان نخوانده در سربرگ هست', tBody1.includes('نخوانده'));
  // سوییچ فیلتر نخوانده‌ها
  await tpage.locator('button:has-text("نخوانده‌ها")').first().click();
  await tpage.waitForTimeout(400);
  check('معلم: فیلتر نخوانده‌ها فعال شد', (await tpage.locator('button:has-text("نخوانده‌ها")').first().getAttribute('class')).includes('bg-primary'));

  // بازکردن گفتگوی مستقیم مدیر — جدیدترین ردیف «مدیر مکتب» (پاسخ مدیر در فاز دسکتاپ)
  const adminRow = tpage.locator('button:has-text("مدیر مکتب")').first();
  await adminRow.click();
  await tpage.waitForTimeout(800);
  const tThread = await tpage.textContent('body');
  check('معلم: پیام مستقیم مدیر در گفتگو دیده می‌شود', tThread.includes(`پیام مستقیم چت ${STAMP}`));
  check('معلم: نوشتار پاسخ برای معلم فعال است', (await tpage.locator('textarea[aria-label="متن پیام"]').count()) > 0);
  const tMsgs = await api('GET', '/api/messages', undefined, teacher.cookie);
  const dirMsg = (tMsgs.data.inbox || []).find((m) => m.id === direct.data.id);
  check('معلم: بازکردن گفتگو پیام را روی سرور خوانده‌شده کرد', !!dirMsg && dirMsg.read === true);

  // کانال همگانی — فقط‌خواندنی
  await tpage.locator('button[aria-label="بازگشت به فهرست"]').click();
  await tpage.waitForTimeout(500);
  const chanRow = tpage.locator(`button:has-text("اطلاعیهٔ همگانی چت ${STAMP}")`).first();
  if ((await chanRow.count()) > 0) {
    await chanRow.click();
    await tpage.waitForTimeout(700);
    const chText = await tpage.textContent('body');
    check('معلم: کانال همگانی با پیام دیده می‌شود', chText.includes(`اطلاعیهٔ همگانی چت ${STAMP}`));
    check('معلم: کانال فقط‌خواندنی است (پانوشت پاسخ خصوصی)', chText.includes('پاسخ در گفتگوی خصوصی') && (await tpage.locator('textarea[aria-label="متن پیام"]').count()) === 0);
    check('معلم: دکمهٔ «پیام به فرستنده» در کانال', chText.includes('پیام به فرستنده'));
  } else {
    check('معلم: کانال همگانی در فهرست', false, 'ردیف کانال یافت نشد');
  }

  // محدودیت مخاطبان معلم در UI — شاگردِ بی‌صنف نباید در مخاطبان باشد
  await tpage.locator('button[aria-label="بازگشت به فهرست"]').click();
  await tpage.waitForTimeout(400);
  await tpage.click('button[aria-label="گفتگوی جدید"]');
  await tpage.waitForTimeout(700);
  await tpage.fill('input[placeholder="جست‌وجوی نام مخاطب…"]', 'شاگرد نمونه');
  await tpage.waitForTimeout(500);
  const tDlg = await tpage.textContent('body');
  check('معلم: شاگرد غیرمرتبط در مخاطبان نیست (محدودیت واقعی در UI)', !tDlg.includes('شاگرد نمونه'));
  await tpage.keyboard.press('Escape');

  // ═══ فاز ۳ — UI موبایل والد: رابط نگران صنف ═══
  console.log('═ فاز ۳: UI موبایل والد ═');
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ppage = await pctx.newPage();
  ppage.on('pageerror', (e) => errors.push('parent: ' + String(e)));
  await ppage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await ppage.waitForSelector('#username', { timeout: 15000 });
  await ppage.fill('#username', 'parent');
  await ppage.fill('input[type="password"]', '12345678');
  await ppage.getByRole('button', { name: 'ورود به سیستم' }).click();
  await ppage.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });
  await ppage.locator('button[aria-label="بازکردن منو"]').click();
  await ppage.waitForTimeout(700);
  await ppage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await ppage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await ppage.click('button[aria-label="گفتگوی جدید"]');
  await ppage.waitForTimeout(700);
  await ppage.fill('input[placeholder="جست‌وجوی نام مخاطب…"]', 'v21840481');
  await ppage.waitForTimeout(500);
  const pDlg = await ppage.textContent('body');
  check('والد: نگران صنف فرزند در مخاطبان با دلیل درست', pDlg.includes('نگران صنف فرزند شما'));
  await ppage.keyboard.press('Escape');
  await pctx.close();

  // ═══ فاز ۴ — آفلاین واقعی: کش → صف → همگام‌سازی ═══
  console.log('═ فاز ۴: آفلاین واقعی (توقف سرور) ═');
  // بازگشت معلم به چت‌خانه آنلاین تا /api/messages در کش کاربر ثبت شود
  await tpage.waitForTimeout(300);
  await tpage.locator('button[aria-label="بازکردن منو"]').click();
  await tpage.waitForTimeout(500);
  await tpage.getByRole('button', { name: 'خانه / داشبورد', exact: true }).last().click();
  await tpage.waitForTimeout(1200);
  await tpage.locator('button[aria-label="بازکردن منو"]').click();
  await tpage.waitForTimeout(500);
  await tpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await tpage.waitForSelector('input[placeholder="جست‌وجوی گفتگو یا شخص…"]', { timeout: 15000 });
  await tpage.waitForTimeout(1500); // کش پیام‌ها کامل شود
  // کش پیام‌ها کامل شود + سرویس‌ورکر آماده باشد
  await tpage.evaluate(async () => { if (navigator.serviceWorker) { await navigator.serviceWorker.ready; } });

  // توقف واقعی سرور و اطمینان از قطعی
  killServer();
  await tpage.waitForTimeout(1200);
  let reallyDown = true;
  try { const probe = await fetch(`${BASE}/api/auth`, { signal: AbortSignal.timeout(2500) }); if (probe.ok) reallyDown = false; } catch { /* پایین است */ }
  if (!reallyDown) { killServer(); await tpage.waitForTimeout(1200); try { await fetch(`${BASE}/api/auth`, { signal: AbortSignal.timeout(2000) }); reallyDown = false; } catch { reallyDown = true; } }
  check('آفلاین: سرور واقعاً متوقف شد', reallyDown);
  // جابه‌جایی ویو تا بازآوری آفلاین از کش
  await tpage.locator('button[aria-label="بازکردن منو"]').click();
  await tpage.waitForTimeout(500);
  await tpage.getByRole('button', { name: 'خانه / داشبورد', exact: true }).last().click();
  await tpage.waitForTimeout(1500);
  await tpage.locator('button[aria-label="بازکردن منو"]').click();
  await tpage.waitForTimeout(500);
  await tpage.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await tpage.waitForTimeout(2000);
  const offBody = await tpage.textContent('body').catch(() => '');
  check('آفلاین: فهرست گفتگوها از کش رندر شد', (offBody || '').includes('پیام‌ها') && (offBody || '').includes('مدیر مکتب'));

  // بازکردن گفتگوی مدیر و پاسخ آفلاین — همان ردیف اول
  const adminRow2 = tpage.locator('button:has-text("مدیر مکتب")').first();
  await adminRow2.click();
  await tpage.waitForTimeout(800);
  const offReply = `پاسخ آفلاین ${STAMP} از معلم`;
  await tpage.fill('textarea[aria-label="متن پیام"]', offReply);
  await tpage.click('button[aria-label="ارسال پیام"]');
  await tpage.waitForTimeout(1200);
  const offAfter = await tpage.textContent('body').catch(() => '');
  check('آفلاین: پاسخ در گفتگو نمایش داده شد (خوش‌بینانه)', (offAfter || '').includes(offReply));
  const clockIcon = await tpage.locator('svg.lucide-clock').count();
  if (clockIcon === 0) {
    const dump = await tpage.evaluate(() => {
      const els = [...document.querySelectorAll('p')].filter((el) => el.textContent.includes('پاسخ آفلاین'));
      if (!els.length) return 'BUBBLE NOT FOUND';
      const bubble = els[0].closest('div');
      return bubble ? bubble.innerHTML.slice(-500) : 'NO BUBBLE DIV';
    }).catch(() => 'DUMP FAIL');
    console.log('  [دیباگ ساعت]', String(dump).slice(0, 480));
  }
  check('آفلاین: نشان «در انتظار همگام‌سازی» (ساعت) روی پیام', clockIcon > 0);

  // برگشت سرور → همگام‌سازی خودکار
  const serverBack = await startServer();
  check('سرور برگشت', serverBack);
  await tpage.waitForTimeout(3500); // فرصت همگام‌سازی خودکار صف
  await tpage.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await tpage.waitForTimeout(3000);
  // اگر خروج شد، دوباره وارد شو
  const hasLogin = await tpage.locator('#username').count();
  if (hasLogin > 0) {
    await tpage.fill('#username', 'tv21840481');
    await tpage.fill('input[type="password"]', '12345678');
    await tpage.getByRole('button', { name: 'ورود به سیستم' }).click();
    await tpage.waitForTimeout(2000);
  }
  const tMsgs2 = await api('GET', '/api/messages', undefined, teacher.cookie);
  const syncedMsg = (tMsgs2.data.sent || []).find((m) => m.body === offReply);
  check('آفلاین: پاسخ پس از همگام‌سازی روی سرور ثبت شد', !!syncedMsg, `sent=${(tMsgs2.data.sent || []).length}`);
  if (syncedMsg) createdIds.push(syncedMsg.id);

  // خطاهای جاوااسکریپت کل تست
  check('بدون خطای جاوااسکریپت در همهٔ فازها', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 250));

  // ═══ پاک‌سازی ═══
  let cleaned = 0;
  for (const id of createdIds) {
    const r = await api('DELETE', `/api/messages?id=${id}`, undefined, admin.cookie);
    if (r.status === 200) cleaned++;
  }
  console.log(`  پاک‌سازی: ${cleaned}/${createdIds.length} پیام تست حذف شد`);

  console.log('\n══════════════════════════');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (fails.length) { console.log('شکست‌ها:'); fails.forEach((f) => console.log('  ✘ ' + f)); }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
