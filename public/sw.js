/**
 * Service Worker — مکتب خصوصی نداالقلم (نسخهٔ ۶ — پوستهٔ تضمینی آفلاین)
 *
 * نسخهٔ ۳.۴.۰ — ریشهٔ «اپ آفلاین سفید باز می‌شود» اصلاح شد:
 *  - Install قبلاً خطاهای cache.add را بی‌صدا بلع می‌زد و همیشه skipWaiting می‌کرد؛
 *    روی شبکهٔ ناپایدار، SW ناقص فعال و کش‌های سالم قبلی پاک می‌شد → دستگاه هیچ
 *    پوسته‌ای نداشت → بازشدن آفلاین = صفحهٔ سفید.
 *  - اکنون: «گیت صحت نصب» — اگر حتی یک فایل precache نشود، نصب شکست می‌خورد و
 *    SW قدیمی با کش کاملش سرِ کارش می‌ماند؛ دفعهٔ بعد که آنلاین شد دوباره تلاش می‌شود.
 *  - precache سبک شد (pdfjs/developer از فهرست خارج — runtime کش می‌شوند).
 *  - cacheFirst دیگر هرگز respondWith(undefined) نمی‌دهد؛ fallback ناوبری صفحهٔ
 *    آفلاین کامل با تلاش مجدد خودکار است.
 */

const VERSION = 'v21';
const SHELL_CACHE = 'noq-shell-' + VERSION;
const RUNTIME_CACHE = 'noq-runtime-' + VERSION;
const API_CACHE = 'noq-api-' + VERSION;
const NAV_TIMEOUT = 4000;
/** API به شبکهٔ کند (۳G/۴G واقعی) فرصت کافی می‌دهد — پیشتر ۴ ثانیه بود و روی شبکهٔ کند دادهٔ کهنه برمی‌گشت */
const API_TIMEOUT = 8000;
/** سقف زمانی هر فایل precache — شبکهٔ معلق هرگز نصب را برای همیشه گروگان نمی‌گیرد */
const PRECACHE_TIMEOUT = 25000;

/* فایل‌های پایه — اگر manifest تولیدی در دسترس نبود */
const CORE_ASSETS = [
  './logo.png',
  './moe-emblem.png',
  './manifest.json',
  './fonts/Vazirmatn-Regular.woff2',
  './fonts/Vazirmatn-Medium.woff2',
  './fonts/Vazirmatn-Bold.woff2',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
];

/** دانلود یک فایل با سقف زمانی و ذخیره در کش — شکست = پرتاب خطا (گیت صحت)
 *  AbortController دستی (نه AbortSignal.timeout) — سازگار با WebViewهای قدیمی اندروید */
function fetchWithTimeout(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { cache: 'reload', signal: ctl.signal }).finally(() => clearTimeout(timer));
}

async function addStrict(cache, url, timeout = PRECACHE_TIMEOUT) {
  const res = await fetchWithTimeout(url, timeout);
  if (!res.ok) throw new Error(`precache ${res.status}: ${url}`);
  await cache.put(url, res);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const failed = [];
      // ۱) سند اصلی اپ — بدنهٔ پوسته؛ بدون آن آفلاین بی‌معناست
      try {
        await addStrict(cache, './');
      } catch (e) {
        failed.push('./');
      }
      // ۲) فهرست کامل فایل‌های Build (تولید scripts/sw-manifest.mjs پس از next build)
      let list = [];
      try {
        const res = await fetch('./sw-manifest.json', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) list = json;
        }
      } catch (e) {
        /* manifest نبود — فقط فایل‌های پایه */
      }
      // ۳) همهٔ فایل‌های پوسته باید کامل شوند — ناقص = شکست نصب (گیت صحت)
      const targets = [...list, ...CORE_ASSETS];
      const results = await Promise.allSettled(targets.map((u) => addStrict(cache, u)));
      results.forEach((r, i) => {
        if (r.status === 'rejected') failed.push(targets[i]);
      });
      if (failed.length > 0) {
        console.warn('[sw] نصب پوستهٔ آفلاین ناقص ماند — تا کامل‌شدن، نسخهٔ قبلی فعال می‌ماند:', failed.slice(0, 5));
        throw new Error(`incomplete-precache: ${failed.length} file(s)`);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // نصب جدید فقط پس از گیت صحت به activate می‌رسد — پس پاک‌سازی کش‌های کهنه امن است
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('noq-') && ![SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/* آیا پاسخ قابل کش است؟ */
function isCacheable(res) {
  return res && res.ok && res.type !== 'opaque' && res.type !== 'opaqueredirect';
}

/* پاسخ ۵۰۳ فارسی برای API وقتی نه شبکه نه کش */
function offlineApiRes() {
  return new Response(JSON.stringify({ error: 'آفلاین — اتصال به سرور برقرار نیست' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'x-noq-cache': '1' },
  });
}

/* افزودن نشانگر «از کش» به پاسخ — تا اپ بفهمد شبکه واقعاً در دسترس نبوده */
function withCacheHeader(res) {
  try {
    const h = new Headers(res.headers);
    h.set('x-noq-cache', '1');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) {
    return res;
  }
}

/* شبکه‌اول با سقف زمانی + برگشت به کش + به‌روزرسانی پس‌زمینه
 * پیشتر: روی شبکهٔ کند، پاسخِ شبکه بعد از سپری‌شدن سقف دور ریخته می‌شد →
 * کاربر برای همیشه روی پوستهٔ کهنه می‌ماند («نسخهٔ وب همیشه قدیمی»).
 * اکنون: پس از سقف از کش پاسخ می‌دهیم اما دریافت از شبکه در پس‌زمینه ادامه
 * می‌یابد و نتیجه در کش ذخیره می‌شود → بازشدن بعدی، نسخهٔ تازه است. */
async function networkFirst(request, cacheName, timeout) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (isCacheable(res)) {
        const clone = res.clone();
        caches.open(cacheName).then((c) => c.put(request, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => undefined);
  try {
    const res = await Promise.race([
      networkPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout || NAV_TIMEOUT)),
    ]);
    if (res) return res;
    throw new Error('empty');
  } catch (e) {
    if (cached) return withCacheHeader(cached);
    // تلاش برای نسخه‌های مشابه (مثلاً / با و بدون اسلش)
    if (request.mode === 'navigate') {
      const root = await caches.match('./');
      if (root) return root;
    }
    throw e;
  }
}

/* کش‌اول — برای فایل‌های تغییرناپذیر؛ شکست شبکه بدون کش = خطای صریح (هرگز undefined) */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) {
    const clone = res.clone();
    caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone)).catch(() => {});
    return res;
  }
  if (res && (res.type === 'opaque' || res.type === 'opaqueredirect')) return res;
  throw new Error(`uncacheable response for ${request.url}`);
}

/* کهنه‌اول با به‌روزرسانی پس‌زمینه */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request)
    .then((res) => {
      if (isCacheable(res)) {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => cached);
  return cached || update;
}

/* صفحهٔ آفلاین کامل — با تلاش مجدد خودکار پس از برگشت اتصال */
function offlineShellRes() {
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>آفلاین</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#ecfdf5; font-family:Tahoma, sans-serif; color:#064e3b; }
  .box { text-align:center; padding:32px 24px; max-width:420px; }
  .icon { font-size:44px; margin-bottom:12px; }
  h2 { margin:0 0 8px; font-size:19px; }
  p { margin:0 0 18px; font-size:13.5px; color:#4b5563; line-height:1.9; }
  button { border:0; background:#059669; color:#fff; padding:10px 26px; border-radius:10px;
           font-family:inherit; font-size:14px; cursor:pointer; }
  .hint { margin-top:14px; font-size:11.5px; color:#6b7280; }
</style></head><body><div class="box">
  <div class="icon">📡</div>
  <h2>اتصال انترنت برقرار نیست</h2>
  <p>اپلیکیشن در حالت آفلاین آماده است — به‌محض برگشت اتصال، خودکار دوباره باز می‌شود.<br>
  اگر این پیام تکرار شد، یک بار با انترنت اپ را باز کنید تا پوستهٔ آفلاین کامل شود.</p>
  <button onclick="location.reload()">تلاش مجدد</button>
  <div class="hint" id="st">در انتظار اتصال…</div>
</div>
<script>
  function retry(){ document.getElementById('st').textContent='اتصال برگشت — در حال باز کردن اپ…'; setTimeout(function(){ location.reload(); }, 600); }
  window.addEventListener('online', retry);
  setInterval(function(){ fetch('.', { cache:'no-store' }).then(function(r){ if(r.ok) retry(); }).catch(function(){}); }, 8000);
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API GET — شبکه‌اول با سقف ۸ ثانیه (شبکهٔ کند گوشی)، برگشت به کش
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, API_TIMEOUT).catch(() => offlineApiRes()));
    return;
  }

  // فایل‌های Build تغییرناپذیر — کش‌اول (خطای صریح به‌جای respondWith(undefined))
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request).catch(async () => {
      const again = await caches.match(request);
      if (again) return again;
      return new Response('offline', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
    return;
  }

  // سند صفحه — شبکه‌اول با برگشت سریع به کش، سپس صفحهٔ آفلاین کامل
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, RUNTIME_CACHE).catch(async () => {
        const shell = (await caches.match('./')) || (await caches.match('/'));
        if (shell) return shell;
        return offlineShellRes();
      }),
    );
    return;
  }

  // بقیه (RSC، فونت، عکس‌ها، manifest، pdfjs) — کهنه‌اول (بار اول دانلود و کش می‌شود)
  event.respondWith(staleWhileRevalidate(request).catch(() => caches.match(request)));
});

/* به‌روزرسانی فوری + اعلام صف آفلاین پس از برگشت اتصال */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/* ═══════ اعلان‌های Push — حتی وقتی اپ/تب باز نیست (نسخهٔ ۳.۰.۰) ═══════
 * مثل پیام گوشی: بنر بالای صفحه + صدا + لرزش؛ لمس → باز شدن همان بخش */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'مکتب خصوصی نداالقلم', body: event.data ? event.data.text() : 'اعلان جدید' };
  }
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    vibrate: [80, 40, 80],
    data: { url: data.url || '/' },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true; // اعلان جدید همان گروه، دوباره با صدا
  }
  event.waitUntil(self.registration.showNotification(data.title || 'مکتب خصوصی نداالقلم', options));
});

/* لمس اعلان: تمرکز روی پنجرهٔ باز + رفتن به بخش مربوط؛ وگرنه باز کردن اپ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) {
            try { await c.navigate(target); } catch (e) { /* همان صفحه کافی است */ }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'noq-flush') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage('flush-queue'));
      }),
    );
  }
});
