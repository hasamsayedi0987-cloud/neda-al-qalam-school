/**
 * محدودکنندهٔ نرخ در حافظهٔ نمونه — جلوگیری از حملات جستجوی رمز عبور
 *
 * پنجرهٔ لغزان: هر کلید (نام کاربری + IP) حداکثر N تلاش ناموفق در هر بازهٔ زمانی.
 * پس از اتمام بازه، شمارنده پاک می‌شود. موفقیت ورود، سابقهٔ ناموفق همان کلید را پاک می‌کند.
 *
 * نکته: در Vercel هر نمونهٔ توابع حافظهٔ جداگانه دارد؛ این محدودیت در هر نمونه اعمال می‌شود
 * که برای یک مکتب (تعداد کاربر محدود) کاملاً کافی و مؤثر است.
 */

interface Attempt {
  timestamps: number[];
}

const store = new Map<string, Attempt>();

/** دوره‌ای: پاک‌سازی کلیدهای منقضی برای جلوگیری از رشد حافظه */
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, attempt] of store) {
    const alive = attempt.timestamps.filter((t) => now - t < windowMs);
    if (alive.length === 0) store.delete(key);
    else attempt.timestamps = alive;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** ثانیه تا اجازهٔ تلاش بعدی */
  retryAfterSec: number;
  /** تعداد تلاش باقی‌مانده در بازه */
  remaining: number;
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);
  const attempt = store.get(key) || { timestamps: [] };
  const alive = attempt.timestamps.filter((t) => now - t < windowMs);
  if (alive.length >= maxAttempts) {
    const oldest = Math.min(...alive);
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  return { allowed: true, retryAfterSec: 0, remaining: maxAttempts - alive.length };
}

/** ثبت یک تلاش ناموفق */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const attempt = store.get(key) || { timestamps: [] };
  attempt.timestamps = [...attempt.timestamps.filter((t) => now - t < windowMs), now];
  store.set(key, attempt);
}

/** پاک‌سازی سابقهٔ ناموفق پس از ورود موفق */
export function clearFailures(key: string): void {
  store.delete(key);
}

/** استخراج IP کاربر از هدرهای پروکسی (Vercel) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000; // ۱۰ دقیقه
