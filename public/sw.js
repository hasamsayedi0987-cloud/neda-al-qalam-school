/**
 * Service Worker — مکتب خصوصی نداالقلم (نسخهٔ ۵ — آفلاین سریع)
 *
 * قابلیت‌ها:
 *  - پوستهٔ کامل اپ (HTML + همهٔ فایل‌های JS/CSS از manifest تولیدی Build) در Install ذخیره می‌شود
 *    → اپ بدون انترنت هم باز می‌شود
 *  - صفحات (navigation): شبکه‌اول با سقف زمانی → در قطعی، از کش
 *  - /_next/static: کش‌اول (فایل‌های hash شده تغییرناپذیر)
 *  - API GET: شبکه‌اول → در قطعی آخرین داده از کش (با نشانگر x-noq-cache تا اپ حالت آفلاین را بداند)
 *  - نوشتن‌ها (POST/PATCH/DELETE) دست‌نخورده — صف آفلاین در api.ts مدیریت می‌شود
 */

const VERSION = 'v5-1';
const SHELL_CACHE = 'noq-shell-' + VERSION;
const RUNTIME_CACHE = 'noq-runtime-' + VERSION;
const API_CACHE = 'noq-api-' + VERSION;
const NAV_TIMEOUT = 4000;

/* فایل‌های پایه — اگر manifest تولیدی در دسترس نبود */
const CORE_ASSETS = [
  './logo.png',
  './manifest.json',
  './fonts/Vazirmatn-Regular.woff2',
  './fonts/Vazirmatn-Medium.woff2',
  './fonts/Vazirmatn-Bold.woff2',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        // فهرست کامل فایل‌های Build (تولید scripts/sw-manifest.mjs پس از next build)
        const res = await fetch('./sw-manifest.json', { cache: 'no-store' });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            await Promise.allSettled(list.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
          }
        }
      } catch (e) {
        /* manifest نبود — فقط فایل‌های پایه */
      }
      // سند اصلی + فایل‌های پایه همیشه
      await Promise.allSettled([
        cache.add(new Request('./', { cache: 'reload' })),
        ...CORE_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})),
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
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

/* شبکه‌اول با سقف زمانی + برگشت به کش */
async function networkFirst(request, cacheName) {
  const cached = await caches.match(request);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NAV_TIMEOUT)),
    ]);
    if (isCacheable(res)) {
      const clone = res.clone();
      caches.open(cacheName).then((c) => c.put(request, clone)).catch(() => {});
    }
    return res;
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

/* کش‌اول — برای فایل‌های تغییرناپذیر */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) {
    const clone = res.clone();
    caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone)).catch(() => {});
  }
  return res;
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API GET — شبکه‌اول، برگشت به کش
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE).catch(() => offlineApiRes()));
    return;
  }

  // فایل‌های Build تغییرناپذیر — کش‌اول
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(request)));
    return;
  }

  // سند صفحه — شبکه‌اول با برگشت سریع به کش
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, RUNTIME_CACHE).catch(async () => {
        const shell = (await caches.match('./')) || (await caches.match('/'));
        if (shell) return shell;
        return new Response(
          '<!doctype html><html dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px;background:#ecfdf5"><h2 style="color:#064e3b">اتصال برقرار نیست</h2><p style="color:#4b5563">یک بار با انترنت اپ را باز کنید تا برای حالت آفلاین آماده شود.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }),
    );
    return;
  }

  // بقیه (RSC، فونت، عکس‌ها، manifest) — کهنه‌اول
  event.respondWith(staleWhileRevalidate(request).catch(() => caches.match(request)));
});

/* به‌روزرسانی فوری + اعلام صف آفلاین پس از برگشت اتصال */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
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
