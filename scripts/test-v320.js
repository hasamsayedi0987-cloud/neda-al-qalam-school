/**
 * تست‌های نسخهٔ ۳.۲.۰ — مورد ۹ کاربر: «اپ را وقتی باز می‌کنم تمام مواردش بروز شود؛
 * در حالت آفلاین وقتی وارد بخشی می‌شوم که آنلاین واردش نشده بودم، می‌گوید بارگیری نشده»
 *
 * ۱) پیش‌بارگیری همهٔ بخش‌ها هنگام بازشدن اپ (کش محلی پس از ورود پر می‌شود)
 * ۲) آفلاین → ورود به بخشی که هرگز آنلاین باز نشده → با داده کار می‌کند (نه پیام خطا)
 * ۳) پیام دوستانه برای داده‌های عمیق بدون کش (به‌جای خطای خام)
 * ۴) برگشت اتصال → ویو خودکار دوباره بارگیری می‌شود
 *
 * اجرا: node scripts/test-v320.js  (BASE یا http://127.0.0.1:3100)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  ✔ ${n}`); } else { fail++; failures.push(n); console.log(`  ✘ ${n}${d ? ' — ' + String(d).slice(0, 200) : ''}`); } };

(async () => {
  /* ═══ فاز ۱ — فایل‌ها ═══ */
  console.log('═ فاز ۱: زیرساخت ═');
  const api = fs.readFileSync(path.join(ROOT, 'src/lib/client/api.ts'), 'utf8');
  check('prefetchSections در api.ts پیاده شده', api.includes('export async function prefetchSections'));
  check('۱۸ بخش در فهرست پیش‌بارگیری', (api.match(/'\/api\/[a-z?=&-]+'/g) || []).length >= 18);
  check('پیش‌بارگیری هرگز در صف قرار نمی‌گیرد (GET خالص با fetchTimeout)', api.includes('PREFETCH_URLS') && api.includes('noq:prefetched'));
  check('پیام دوستانهٔ آفلاین جایگزین خطای خام شد', api.includes('هنوز برای استفادهٔ آفلاین بارگیری نشده') && !api.includes('داده‌ای برای این بخش ذخیره نشده'));
  const shell = fs.readFileSync(path.join(ROOT, 'src/components/app/app-shell.tsx'), 'utf8');
  check('app-shell پس از ورود/اتصال/همگام‌سازی پیش‌بارگیری می‌کند', shell.includes('prefetchSections') && shell.includes("window.addEventListener('online', onOnline)"));
  check('برگشت اتصال → ویوی فعال خودکار دوباره بارگیری می‌شود', shell.includes('prevOnlineRef') && shell.includes('setSyncTick((t) => t + 1);') && shell.includes('prefetchSections(60_000)'));
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  check('سرویس‌ورکر v14', sw.includes("const VERSION = 'v14'"));
  const ver = fs.readFileSync(path.join(ROOT, 'src/lib/version.ts'), 'utf8');
  check('نسخهٔ ۳.۲.۰', ver.includes("'3.2.0'"));
  const manifest = fs.readFileSync(path.join(ROOT, 'apk-build/AndroidManifest.xml'), 'utf8');
  check('مانیفست versionCode 18 / versionName 3.2.0', manifest.includes('android:versionCode="18"') && manifest.includes('android:versionName="3.2.0"'));

  /* ═══ فاز ۲ — سناریوی واقعی مرورگر ═══ */
  console.log('═ فاز ۲: آنلاین → پیش‌بارگیری → آفلاین → بخش بازدیدنشده ═');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('ورود آنلاین مدیر', await page.getByText('مکتب خصوصی نداالقلم').first().isVisible().catch(() => false));

  // انتظار برای پیش‌بارگیری (~۱.۵s تأخیر + ۱۸ درخواست دوبه‌دو)
  let cacheKeys = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    cacheKeys = await page.evaluate(() => {
      try { return Object.keys(JSON.parse(localStorage.getItem('noq_get_cache_v1') || '{}')); } catch { return []; }
    });
    if (cacheKeys.length >= 12) break;
  }
  check('پیش‌بارگیری: دست‌کم ۱۲ بخش در کش محلی ذخیره شد', cacheKeys.length >= 12, `کش‌ها: ${cacheKeys.length}`);
  check('کتابخانه در کش هست (بخشی که باز نشده)', cacheKeys.some((k) => k.startsWith('/api/library')));
  check('شاگردان/صنف‌ها/پیام‌ها/اعلان‌ها در کش هستند',
    ['classes', 'students', 'messages', 'notifications'].every((k) => cacheKeys.some((c) => c.includes('/api/' + k))),
    cacheKeys.join(','));

  // ── آفلاین — بخشی که در نشست آنلاین هرگز باز نشده ──
  await context.setOffline(true);
  await page.waitForTimeout(600);
  // به کتابخانه می‌رویم — در این نشست هرگز آنلاین باز نشده
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'library'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2500);
  const libVisible = await page.getByText('کتابخانه', { exact: false }).first().isVisible().catch(() => false);
  check('آفلاین: بخش کتابخانه (بازدیدنشده) باز می‌شود', libVisible);
  const noErrorToast = !(await page.getByText(/بارگیری نشده|آفلاین — اتصال/).first().isVisible().catch(() => false));
  check('آفلاین: بدون پیام خطای «بارگیری نشده»', noErrorToast);
  // جدول کتاب‌ها با دادهٔ پیش‌بارگیری‌شده رندر شود (سرستون «عنوان»)
  const tableOk = await page.locator('table').first().isVisible().catch(() => false);
  check('آفلاین: جدول کتاب‌ها از کش محلی رندر شد', tableOk);

  // ── آفلاین — دادهٔ عمیق بدون کش: پیام دوستانه (نه خطای خام) ──
  await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'grades'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(1800);
  const gradesShell = await page.getByText('ثبت نمرات').first().isVisible().catch(() => false);
  check('آفلاین: بخش نمرات با فهرست صنف‌های کش‌شده باز می‌شود', gradesShell);

  // ── برگشت اتصال — پیش‌بارگیری دوباره + ویو خودکار تازه می‌شود ──
  await context.setOffline(false);
  const prefetchedAgain = await page.evaluate(() => new Promise((resolve) => {
    const to = setTimeout(() => resolve(false), 25000);
    window.addEventListener('noq:prefetched', () => { clearTimeout(to); resolve(true); }, { once: true });
  }));
  check('برگشت اتصال: پیش‌بارگیری دوباره اجرا شد', prefetchedAgain === true);
  check('کل سناریو بدون خطای جاوااسکریپت', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  await browser.close();

  /* ═══ نتیجه ═══ */
  console.log('═══════════════════════════');
  console.log(`نتیجهٔ نهایی: ${pass} موفق، ${fail} ناموفق`);
  if (failures.length) for (const f of failures) console.log(`  ✘ ${f}`);
  process.exit(fail > 0 ? 1 : 0);
})();
