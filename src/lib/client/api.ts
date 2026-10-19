'use client';

/**
 * لایهٔ ارتباط با سرور با پشتیبانی آفلاین
 * اگر شبکه قطع باشد، درخواست‌های ثبت‌کننده در صف ذخیره شده و پس از وصل شدن مجدد ارسال می‌شوند.
 */

const QUEUE_KEY = 'noq_offline_queue_v1';

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

export async function flushQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedRequest[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
        cache: 'no-store',
      });
      if (res.ok) sent += 1;
      else if (res.status < 500) sent += 0; // خطای منطقی: حذف از صف
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
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
}

export interface ApiResult<T> {
  data?: T;
  error?: string;
  queued?: boolean;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'خطا در دریافت اطلاعات');
  return json as T;
}

/** درخواست ثبت‌کننده: در حالت آفلاین در صف قرار می‌گیرد */
export async function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  opts: { queueLabel?: string; allowQueue?: boolean } = {},
): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      return { queued: true };
    }
    return { error: 'در حالت آفلاین این عملیات در دسترس نیست' };
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error || 'عملیات ناموفق بود' };
    return { data: json as T };
  } catch {
    if (opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      return { queued: true };
    }
    return { error: 'اتصال به سرور برقرار نشد' };
  }
}
