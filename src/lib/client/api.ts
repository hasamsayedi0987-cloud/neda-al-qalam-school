'use client';

/**
 * لایهٔ ارتباط با سرور با پشتیبانی آفلاین — مکتب خصوصی نداالقلم
 * - آنلاین: درخواست مستقیم به سرور (سریع — دیتابیس SQLite سرور)
 * - آفلاین: خواندن از آخرین کش، ثبت‌ها در صف و همگام‌سازی خودکار پس از اتصال
 * - ورود آفلاین: بررسی محلی نام کاربری و رمز (پس از اولین ورود موفق روی همین دستگاه)
 */

const QUEUE_KEY = 'noq_offline_queue_v1';
const GET_CACHE_KEY = 'noq_get_cache_v1';
const CREDS_KEY = 'noq_offline_creds_v1';

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  createdAt: number;
  label: string;
}

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pendingCount = 0;
let authRequired = false;
const listeners = new Set<() => void>();

function readQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedRequest[];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedRequest[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200)));
  } catch {
    /* quota */
  }
  pendingCount = q.length;
  notify();
}

function notify() {
  listeners.forEach((l) => l());
}

/** وضعیت اتصال بر اساس نتیجهٔ واقعی fetch — نه فقط navigator.onLine (وای‌فای بدون انترنت دروغ می‌گوید) */
function setOnlineState(v: boolean) {
  if (online !== v) {
    online = v;
    notify();
  }
}

export function onSyncStateChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isOnline() {
  return online;
}

export function pendingSyncCount() {
  return pendingCount;
}

/** آیا صف به‌دلیل نبود نشست معتبر ارسال نشد؟ (نیاز به ورود مجدد) */
export function isAuthRequired() {
  return authRequired;
}

/** پس از ورود موفق آنلاین — صف دوباره تلاش می‌کند */
export function markAuthRestored() {
  authRequired = false;
  flushQueue();
}

export async function flushQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedRequest[] = [];
  let sent = 0;
  let authFailed = false;
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
        cache: 'no-store',
      });
      if (res.ok) sent += 1;
      else if (res.status === 401 || res.status === 403) {
        // نشست معتبر نیست — داده حذف نمی‌شود؛ پس از ورود مجدد دوباره تلاش می‌شود
        remaining.push(item);
        authFailed = true;
      } else if (res.status < 500) sent += 0; // خطای منطقی: حذف از صف
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  authRequired = authFailed && remaining.length > 0;
  notify();
  return sent;
}

if (typeof window !== 'undefined') {
  pendingCount = readQueue().length;
  window.addEventListener('online', () => {
    online = true;
    notify();
    flushQueue();
  });
  window.addEventListener('offline', () => {
    online = false;
    notify();
  });
  setInterval(() => {
    if (navigator.onLine && readQueue().length > 0) flushQueue();
  }, 30_000);
  online = navigator.onLine;
  // پیام سرویس‌ورکر پس از برگشت اتصال (Background Sync) — تخلیهٔ صف
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data === 'flush-queue') flushQueue();
    });
  }
}

/** ثبت Background Sync — پس از وصل شدن، سرویس‌ورکر به اپ خبر می‌دهد */
function requestBackgroundSync() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.sync.register('noq-flush'))
        .catch(() => {});
    }
  } catch {
    /* مرورگر پشتیبانی نمی‌کند */
  }
}

export interface ApiResult<T> {
  data?: T;
  error?: string;
  queued?: boolean;
  /** درست بودن یعنی مشکل از شبکه بود (نه رد شدن منطقی سرور) */
  network?: boolean;
}

/* ───────────────  کش خواندن برای حالت آفلاین  ─────────────── */

interface CacheItem {
  t: number;
  data: unknown;
}

function readGetCache(): Record<string, CacheItem> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(GET_CACHE_KEY) || '{}') as Record<string, CacheItem>;
  } catch {
    return {};
  }
}

function writeGetCache(cache: Record<string, CacheItem>) {
  try {
    // سقف ۵۰۰ کلید — قدیمی‌ترین‌ها حذف می‌شوند
    const keys = Object.keys(cache);
    if (keys.length > 500) {
      keys.sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0));
      for (const k of keys.slice(0, keys.length - 500)) delete cache[k];
    }
    localStorage.setItem(GET_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
}

function cacheGet(url: string, data: unknown) {
  const cache = readGetCache();
  cache[url] = { t: Date.now(), data };
  writeGetCache(cache);
}

function cachePeek(url: string): unknown | undefined {
  const item = readGetCache()[url];
  return item ? item.data : undefined;
}

export async function apiGet<T>(url: string): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // خطای سرور — اگر کش داریم همان را برمی‌گردانیم (حالت آفلاین/خطا)
      const cached = cachePeek(url);
      if (cached !== undefined) return cached as T;
      throw new Error(json.error || 'خطا در دریافت اطلاعات');
    }
    setOnlineState(true);
    cacheGet(url, json);
    return json as T;
  } catch (e) {
    // شبکه قطع — از آخرین دادهٔ ذخیره‌شده استفاده می‌کنیم
    setOnlineState(false);
    const cached = cachePeek(url);
    if (cached !== undefined) return cached as T;
    throw e instanceof Error && e.message ? e : new Error('خطا در دریافت اطلاعات');
  }
}

/** درخواست ثبت‌کننده: در حالت آفلاین در صف قرار می‌گیرد */
export async function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  opts: { queueLabel?: string; allowQueue?: boolean } = {},
): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setOnlineState(false);
    if (opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      requestBackgroundSync();
      return { queued: true };
    }
    return { error: 'در حالت آفلاین این عملیات در دسترس نیست', network: true };
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // خطای ۵xx یعنی سرور/شبکه در دسترس نیست — برای ورود، fallback آفلاین معنا دارد
      if (res.status >= 500) return { error: json.error || 'سرور در دسترس نیست', network: true };
      return { error: json.error || 'عملیات ناموفق بود' };
    }
    setOnlineState(true);
    return { data: json as T };
  } catch {
    // navigator.onLine ممکن است دروغ گفته باشد (وای‌فای بدون انترنت)
    setOnlineState(false);
    if (opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      requestBackgroundSync();
      return { queued: true };
    }
    return { error: 'اتصال به سرور برقرار نشد', network: true };
  }
}

/* ───────────────  ورود آفلاین — بررسی محلی رمز  ─────────────── */

export interface OfflineCred {
  user: {
    id: string; username: string; name: string; role: string;
    phone: string | null; teacherId: string | null; studentId: string | null;
  };
  salt: string;
  hash: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derive(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' },
    key, 256,
  );
  return toHex(bits);
}

/** پس از ورود موفق آنلاین، مشخصات برای ورود آفلاین بعدی ذخیره می‌شود */
export async function saveOfflineCred(user: OfflineCred['user'], password: string) {
  if (typeof window === 'undefined' || !password) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = toHex(salt.buffer as ArrayBuffer);
    const hash = await derive(password, saltHex);
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    all[user.username.toLowerCase()] = { user, salt: saltHex, hash };
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** ورود بدون اینترنت — رمز در برابر هش ذخیره‌شدهٔ همین دستگاه بررسی می‌شود */
export async function offlineLogin(username: string, password: string): Promise<OfflineCred['user'] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    const cred = all[username.trim().toLowerCase()];
    if (!cred) return null;
    const hash = await derive(password, cred.salt);
    if (hash !== cred.hash) return null;
    return cred.user;
  } catch {
    return null;
  }
}

export function clearOfflineCreds() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch { /* ignore */ }
}
