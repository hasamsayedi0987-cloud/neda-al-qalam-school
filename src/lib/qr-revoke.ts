/**
 * لغو توکن‌های QR کارت هویت — منبع مشترک /api/qr و /api/gate (نسخهٔ ۳.۱۰.۰)
 *
 * لغو با ثبت زمان به‌ازای هر شخص در Setting(qrRevocations):
 * هر توکنی که پیش از زمان لغو صادر شده باشد دیگر پذیرفته نیست —
 * چاپ مجدد کارت توکنِ تازه می‌سازد (iat جدید) و کارت قبلی باطل می‌ماند.
 */
import { db } from '@/lib/db';

export const QR_REVOCATION_KEY = 'qrRevocations';

export type QrRevocations = Record<string, string>; // personId → زمان لغو (ISO)

export async function readRevocations(): Promise<QrRevocations> {
  const row = await db.setting.findUnique({ where: { key: QR_REVOCATION_KEY } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as QrRevocations) : {};
  } catch {
    return {};
  }
}

export async function writeRevocations(map: QrRevocations): Promise<void> {
  await db.setting.upsert({
    where: { key: QR_REVOCATION_KEY },
    update: { value: JSON.stringify(map) },
    create: { key: QR_REVOCATION_KEY, value: JSON.stringify(map) },
  });
}

/** آیا توکنِ صادرشده در لحظهٔ iat لغو شده است؟ زمان لغو را برمی‌گرداند وگرنه null */
export async function isRevoked(personId: string, iat: number): Promise<string | null> {
  const revs = await readRevocations();
  const revokedAt = revs[personId];
  if (revokedAt && Math.floor(new Date(revokedAt).getTime() / 1000) >= iat) return revokedAt;
  return null;
}
