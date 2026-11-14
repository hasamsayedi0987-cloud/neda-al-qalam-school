/**
 * تست‌های نسخهٔ ۳.۰.۰ — اعلان‌های بیرون از اپ + سرعت + امنیت + ظاهر مدرن
 *
 * ۱) API نظرسنجی اعلان‌ها: ۴۰۱ بدون نشست، ۲۰۰ با نشست، فیلتر since
 * ۲) API پوش: کلید VAPID عمومی، اعتبارسنجی اشتراک
 * ۳) سرویس‌ورکر v12: هندلر push + notificationclick
 * ۴) نشان نسخهٔ ۳.۰.۰ + کارت «اعلان‌های بیرون از اپ» در تنظیمات
 * ۵) هدرهای امنیتی (CSP، nosniff، HSTS، Referrer-Policy)
 * ۶) زیرساخت اندروید: NotifyService/BootReceiver/PollReceiver + مانیفست versionCode 16
 * ۷) اسکیما: PushSubscription + ایندکس‌های سرعت در هر دو اسکیما
 * ۸) رگرسیون آفلاین: بعد از قطع انترنت اپ همچنان باز می‌شود (بدون شکستن v2.5.0)
 *
 * اجرا: node scripts/test-v300.js  (سرور پروداکشن — BASE یا localhost:3000)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✘ ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`); }
}

(async () => {
  /* ═══ فاز ۱ — زیرساخت فایل‌ها (بدون سرور) ═══ */
  console.log('═ فاز ۱: زیرساخت فایل‌ها ═');

  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  check('سرویس‌ورکر نسخهٔ v12 است', sw.includes("const VERSION = 'v12'"));
  check('سرویس‌ورکر هندلر push دارد', sw.includes("addEventListener('push'"));
  check('سرویس‌ورکر هندلر notificationclick دارد', sw.includes("addEventListener('notificationclick'"));

  const manifest = fs.readFileSync(path.join(ROOT, 'apk-build/AndroidManifest.xml'), 'utf8');
  check('مانیفست اندروید versionCode 16 است', manifest.includes('android:versionCode="16"'));
  check('مانیفست اندروید versionName 3.0.0 است', manifest.includes('android:versionName="3.0.0"'));
  check('مجوز POST_NOTIFICATIONS ثبت شده', manifest.includes('android.permission.POST_NOTIFICATIONS'));
  check('مجوز FOREGROUND_SERVICE_DATA_SYNC ثبت شده', manifest.includes('android.permission.FOREGROUND_SERVICE_DATA_SYNC'));
  check('سرویس NotifyService در مانیفست است', manifest.includes('android:name=".NotifyService"'));
  check('BootReceiver برای بازگردانی پس از ری‌استارت است', manifest.includes('.BootReceiver'));

  const svc = fs.readFileSync(path.join(ROOT, 'apk-build/java/af/nedaalqalam/school/NotifyService.java'), 'utf8');
  check('NotifyService با کوکی نشست پول می‌کند', svc.includes('CookieManager') && svc.includes('/api/notifications/poll'));
  check('NotifyService اعلان واقعی اندروید می‌سازد', svc.includes('NotificationManager') || svc.includes('Notification.Builder'));
  check('NotifyService ضدتکرار اعلان دارد', svc.includes('notif_shown_ids'));
  check('NotifyService پول اول خط پایه است (بدون اسپم اعلان قدیمی)', svc.includes('KEY_LAST_SHOWN'));

  const mainAct = fs.readFileSync(path.join(ROOT, 'apk-build/java/af/nedaalqalam/school/MainActivity.java'), 'utf8');
  check('MainActivity سرویس اعلان را راه می‌اندازد', mainAct.includes('startNotifyService'));
  check('MainActivity اجازهٔ اعلان ۱۳+ می‌خواهد', mainAct.includes('POST_NOTIFICATIONS'));
  check('لمس اعلان → باز شدن همان بخش', mainAct.includes('open_url'));

  const buildSh = fs.readFileSync(path.join(ROOT, 'apk-build/build.sh'), 'utf8');
  check('build.sh هر ۴ فایل جاوا را کامپایل می‌کند',
    ['MainActivity.java', 'NotifyService.java', 'PollReceiver.java', 'BootReceiver.java'].every((f) => buildSh.includes(f)));

  const schemaSq = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const schemaPg = fs.readFileSync(path.join(ROOT, 'prisma/schema.postgres.prisma'), 'utf8');
  for (const [name, s] of [['SQLite', schemaSq], ['PostgreSQL', schemaPg]]) {
    check(`اسکیمای ${name}: مدل PushSubscription دارد`, s.includes('model PushSubscription'));
    check(`اسکیمای ${name}: ایندکس [userId, read] اعلان‌ها`, s.includes('@@index([userId, read])'));
    check(`اسکیمای ${name}: ایندکس صنف شاگردان`, /@@index\(\[classId\]\)/.test(s));
  }

  const pollApi = fs.readFileSync(path.join(ROOT, 'src/app/api/notifications/poll/route.ts'), 'utf8');
  check('API پول: پاک‌سازی خودکار اعلان‌های قدیمی دارد', pollApi.includes('notifCleanupLast'));

  /* ═══ فاز ۲ — سرور و مرورگر ═══ */
  console.log('═ فاز ۲: سرور و مرورگر ═');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));

  // هدرهای امنیتی
  const res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const headers = res.headers();
  check('هدر X-Content-Type-Options: nosniff', headers['x-content-type-options'] === 'nosniff');
  check('هدر CSP تنظیم شده', Boolean(headers['content-security-policy']));
  check('هدر Referrer-Policy تنظیم شده', headers['referrer-policy'] === 'strict-origin-when-cross-origin');
  check('هدر HSTS تنظیم شده', Boolean(headers['strict-transport-security']));

  const versionShown = await (async () => {
    // پس از hydrate، اپ یک لحظه لودر نشان می‌دهد — صبر تا فرم ورود + یک نفس
    await page.waitForSelector('#username', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(900);
    return page.locator('text=نسخهٔ ۳.۰.۰').first().isVisible().catch(() => false);
  })();
  check('نشان نسخهٔ ۳.۰.۰ در صفحهٔ ورود هست', versionShown);

  // ورود
  await page.fill('#username', 'admin');
  await page.fill('#password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const inApp = await page.locator('button:has-text("خانه / داشبورد")').first().isVisible().catch(() => false);
  check('ورود موفق — داشبورد باز شد', inApp);

  // API پول — با نشست
  const pollRes = await page.request.get(BASE + '/api/notifications/poll');
  check('API پول با نشست: ۲۰۰', pollRes.status() === 200);
  const pollData = await pollRes.json().catch(() => ({}));
  check('API پول: serverTime و notifications برمی‌گرداند',
    typeof pollData.serverTime === 'string' && Array.isArray(pollData.notifications));
  const t0 = pollData.serverTime;
  const pollSince = await page.request.get(BASE + '/api/notifications/poll?since=' + encodeURIComponent(t0));
  const sinceData = await pollSince.json().catch(() => ({}));
  check('API پول با since: اعلان تازه‌ای برنمی‌گرداند',
    sinceData.notifications && sinceData.notifications.length === 0);

  // API پوش
  const keyRes = await page.request.get(BASE + '/api/push');
  check('کلید عمومی VAPID ساخته و برگردانده شد', keyRes.status() === 200);
  const keyData = await keyRes.json().catch(() => ({}));
  check('کلید VAPID فرمت base64url معتبر دارد',
    typeof keyData.publicKey === 'string' && keyData.publicKey.length >= 80);

  const badSub = await page.request.post(BASE + '/api/push', { data: { endpoint: 'not-https', keys: {} } });
  check('اشتراک نامعتبر رد می‌شود (۴۰۰)', badSub.status() === 400);

  // کارت اعلان‌ها در تنظیمات
  const settingsBtn = page.locator('button:has-text("تنظیمات"), [role="menuitem"]:has-text("تنظیمات"), a:has-text("تنظیمات")').first();
  await settingsBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  const pushCard = await page.locator('text=اعلان‌های بیرون از اپ').first().isVisible().catch(() => false);
  check('کارت «اعلان‌های بیرون از اپ» در تنظیمات هست', pushCard);

  // سرویس‌ورکر v12 فعال
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { has: Boolean(reg), controlling: Boolean(navigator.serviceWorker.controller) };
  });
  check('سرویس‌ورکر v12 ثبت و کنترل‌کنندهٔ صفحه است', swState.has && swState.controlling);

  // رگرسیون آفلاین — اپ بدون انترنت باز می‌شود (ارث v2.5.0)
  await ctx.setOffline(true);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const offlineOk = await page.locator('button:has-text("خانه / داشبورد")').first().isVisible().catch(() => false);
  check('رگرسیون آفلاین: اپ بدون انترنت باز و داخل می‌شود', offlineOk);
  await ctx.setOffline(false);

  check('صفر خطای جاوااسکریپت در کل تست', jsErrors.length === 0, jsErrors.join(' | '));

  await browser.close();

  console.log('');
  console.log(`════════ نتیجه: ${pass} PASS / ${fail} FAIL ════════`);
  if (failures.length) { console.log('شکست‌ها:', failures.join(' — ')); process.exit(1); }
})().catch((e) => { console.error('خطای اجرای تست:', e); process.exit(1); });
