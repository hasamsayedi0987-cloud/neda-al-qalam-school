/**
 * ارسال اعلان‌های Push مرورگر (Web Push + VAPID) — نسخهٔ ۳.۰.۰
 *
 * هدف: اعلان‌های حاضری، نمرات و پیام‌ها مثل «پیام گوشی» حتی وقتی اپ بسته است بیایند.
 *
 * معماری:
 *  - کلیدهای VAPID در جدول Setting ذخیره می‌شوند (همان الگوی امن authSecret)
 *    → بدون نیاز به تنظیم متغیر محیطی در هاست؛ با استقرار مجدد هم ثابت می‌ماند
 *  - اشتراک‌ها در جدول PushSubscription — به‌ازای هر کاربر چند دستگاه مجاز است
 *  - ارسال «آتش‌وفراموش» با حفاظ کامل خطا: هیچ‌وقت جریان اصلی (ثبت حاضری/نمره/پیام) نمی‌شکند
 *  - اشتراک‌های منقضی (404/410) خودکار پاک می‌شوند — پایگاه داده با گذشت زمان سبک می‌ماند
 */
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import { db } from '@/lib/db';

export interface PushPayload {
  title: string;
  body: string;
  type?: string; // INFO | WARNING | GRADE | ATTENDANCE
  url?: string; // مسیر داخل اپ پس از لمس اعلان (مثل /?view=messages)
  tag?: string; // گروه‌بندی اعلان‌ها در شِید اندروید
}

const VAPID_MAILTO = 'mailto:hasamsayedi0987@gmail.com';

/** خواندن/ساخت کلیدهای VAPID (یک‌بار در عمر پایگاه داده) */
export async function ensureVapid(): Promise<{ publicKey: string; privateKey: string } | null> {
  try {
    let publicKey = (await db.setting.findUnique({ where: { key: 'vapidPublicKey' } }))?.value;
    let privateKey = (await db.setting.findUnique({ where: { key: 'vapidPrivateKey' } }))?.value;
    if (!publicKey || !privateKey) {
      const keys = generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await db.setting.upsert({
        where: { key: 'vapidPublicKey' },
        update: { value: publicKey },
        create: { key: 'vapidPublicKey', value: publicKey },
      });
      await db.setting.upsert({
        where: { key: 'vapidPrivateKey' },
        update: { value: privateKey },
        create: { key: 'vapidPrivateKey', value: privateKey },
      });
    }
    setVapidDetails(VAPID_MAILTO, publicKey, privateKey);
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  const k = await ensureVapid();
  return k?.publicKey ?? null;
}

/** ارسال پوش به چند کاربر — هرگز خطا بیرون نمی‌دهد */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  try {
    const subs = await db.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return;
    await ensureVapid();
    const json = JSON.stringify(payload);
    const dead: string[] = [];
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            json,
            { TTL: 24 * 3600 },
          );
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
        }
      }),
    );
    // اشتراک‌های مُرده یک‌جا پاک می‌شوند — با گذشت زمان جدول سبک می‌ماند (بدون کندشدن)
    if (dead.length > 0) {
      await db.pushSubscription
        .deleteMany({ where: { endpoint: { in: dead } } })
        .catch(() => undefined);
    }
  } catch {
    /* پوش حتماً نباید هیچ جریانی را بشکند */
  }
}
