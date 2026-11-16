'use client';

/**
 * اشتراک Push مرورگر — نسخهٔ ۳.۰.۰
 *
 * اعلان‌های «مثل پیام گوشی» حتی وقتی اپ/تب بسته است:
 *  - مرورگر: Web Push با VAPID — سرویس‌ورکر اعلان را نشان می‌دهد (حتی وقتی تب بسته است)
 *  - اپ اندروید: لازم نیست — سرویس بومی خودش اعلان گوشی می‌دهد (NotifyService)
 *
 * اصول:
 *  - هیچ‌وقت ورود یا کار اپ را نمی‌شکند (همه‌چیز در حفاظ try/catch)
 *  - اجازه فقط با کلیک کاربر خواسته می‌شود (بدون پاپ‌آپ مزاحم)
 *  - اشتراک تکراری دوباره ساخته نمی‌شود؛ اگر اجازه از قبل هست، ساکت ثبت می‌شود
 */

const PUSH_SUB_KEY = 'noq_push_sub_v1';

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && 'AndroidBridge' in window;
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** فعال‌سازی اعلان‌ها — از کلیک کاربر (تنظیمات) یا ساکت پس از اجازهٔ قبلی */
export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (isNativeApp()) return { ok: true, reason: 'native' };
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // نسخهٔ ۳.۱.۰ — ریشهٔ «اعلان وب کار نمی‌کرد»: مسیر درست GET /api/push است
      // (پیشتر /api/push/key خوانده می‌شد که وجود نداشت و ۴۰۴ می‌داد)
      const keyRes = await fetch('/api/push', { cache: 'no-store' });
      if (!keyRes.ok) return { ok: false, reason: 'nokey' };
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (!publicKey) return { ok: false, reason: 'nokey' };
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'invalid' };
    }
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (res.ok) {
      try { localStorage.setItem(PUSH_SUB_KEY, '1'); } catch { /* ignore */ }
      return { ok: true };
    }
    return { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** غیرفعال‌سازی — حذف اشتراک از سرور و مرورگر */
export async function disablePushNotifications(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const json = sub.toJSON() as { endpoint?: string };
      if (json.endpoint) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: json.endpoint }),
        }).catch(() => undefined);
      }
      await sub.unsubscribe().catch(() => undefined);
    }
    try { localStorage.removeItem(PUSH_SUB_KEY); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

/**
 * پس از ورود موفق — فقط اگر اجازه از قبل داده شده، ساکت ثبت می‌کند.
 * اگر نه، چیزی نمی‌پرسد (پرسیدن فقط از دکمهٔ تنظیمات — بدون مزاحمت)
 */
export async function ensurePushAfterLogin(): Promise<void> {
  try {
    if (isNativeApp() || !pushSupported()) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return; // از قبل ثبت است
    await enablePushNotifications();
  } catch { /* ignore */ }
}
