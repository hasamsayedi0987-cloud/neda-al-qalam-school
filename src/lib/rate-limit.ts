/**
 * محدودکنندهٔ تلاش ورود — نسخهٔ ۳.۸.۴: روش مشترک و پایدار
 *
 * پیشتر سوابق در حافظهٔ هر نمونه نگه داشته می‌شد؛ در Vercel هر نمونهٔ سرد حافظهٔ تازه
 * می‌گیرد و محدودیت یا دور زده می‌شد (توزیع درخواست بین نمونه‌ها) یا با ری‌استارت می‌پرید.
 *
 * اکنون سوابق در جدول Setting (کلید loginThrottle) ذخیره می‌شود:
 *  - بین همهٔ نمونه‌های سرور مشترک است (روش مشترک)
 *  - با ری‌استارت/شروع سرد نمونه از بین نمی‌رود (پایدار)
 *  - پاک‌سازی دوره‌ای رکوردهای منقضی + سقف تعداد کلیدها (رشد نکردن JSON)
 *
 * اگر دیتابیس موقتاً در دسترس نباشد ورود «باز» می‌شود (fail-open) —
 * قفل‌کردن همهٔ کاربران به‌خاطر یک خطای گذرا، پایداری روزمره را نمی‌شکند.
 */
import { db } from '@/lib/db';

interface Attempt {
  timestamps: number[];
}

type ThrottleMap = Record<string, Attempt>;

const THROTTLE_KEY = 'loginThrottle';
const MAX_KEYS = 500; // سقف کلیدها — کهنه‌ترین‌ها حذف می‌شوند تا رکورد Setting رشد نکند

async function readMap(): Promise<ThrottleMap> {
  try {
    const row = await db.setting.findUnique({ where: { key: THROTTLE_KEY } });
    if (!row?.value) return {};
    const obj = JSON.parse(row.value) as ThrottleMap;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {}; // fail-open — دسترس‌پذیری ورود مهم‌تر از محدودیت گذرا است
  }
}

async function writeMap(map: ThrottleMap): Promise<void> {
  try {
    const value = JSON.stringify(map);
    await db.setting.upsert({
      where: { key: THROTTLE_KEY },
      update: { value },
      create: { key: THROTTLE_KEY, value },
    });
  } catch {
    /* fail-open */
  }
}

/** حذف تلاش‌های خارج از پنجره + کلیدهای خالی + اعمال سقف کلیدها */
function prune(map: ThrottleMap, windowMs: number, now: number): ThrottleMap {
  const out: ThrottleMap = {};
  for (const [k, a] of Object.entries(map)) {
    const alive = (a?.timestamps || []).filter((t) => now - t < windowMs);
    if (alive.length) out[k] = { timestamps: alive };
  }
  const keys = Object.keys(out);
  if (keys.length > MAX_KEYS) {
    keys.sort((x, y) => Math.max(...out[x].timestamps) - Math.max(...out[y].timestamps));
    for (const k of keys.slice(0, keys.length - MAX_KEYS)) delete out[k];
  }
  return out;
}

export interface RateLimitResult {
  allowed: boolean;
  /** ثانیه تا اجازهٔ تلاش بعدی */
  retryAfterSec: number;
  /** تعداد تلاش باقی‌مانده در بازه */
  remaining: number;
}

export async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const map = prune(await readMap(), windowMs, now);
  const alive = map[key]?.timestamps || [];
  if (alive.length >= maxAttempts) {
    const oldest = Math.min(...alive);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)), remaining: 0 };
  }
  return { allowed: true, retryAfterSec: 0, remaining: maxAttempts - alive.length };
}

/** ثبت یک تلاش ناموفق */
export async function recordFailure(key: string, windowMs: number): Promise<void> {
  const now = Date.now();
  const map = prune(await readMap(), windowMs, now);
  map[key] = { timestamps: [...(map[key]?.timestamps || []), now] };
  await writeMap(map);
}

/** پاک‌سازی سابقهٔ ناموفق پس از ورود موفق */
export async function clearFailures(key: string): Promise<void> {
  const map = await readMap();
  if (map[key]) {
    delete map[key];
    await writeMap(map);
  }
}

/** استخراج IP کاربر از هدرهای پروکسی (Vercel) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000; // ۱۰ دقیقه
