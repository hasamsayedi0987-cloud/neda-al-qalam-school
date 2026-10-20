/**
 * Service Worker — مکتب خصوصی نداالقلم
 * پشتیبانی آفلاین: کش کردن پوستهٔ اپ (مسیرهای نسبی — سازگار با زیرمسیر GitHub Pages)
 */
const CACHE_NAME = 'noq-cache-v3';
const APP_SHELL = [
  './',
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // داده‌ها با لایهٔ کلاینت مدیریت می‌شوند

  // منابع ثابت: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    }),
  );
});

/* نسخهٔ ۱.۲ — پاک‌سازی کش‌های قدیمی معماری گیت‌هاب */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
