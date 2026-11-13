/**
 * نظرسنجی سبک اعلان‌ها — برای سرویس اعلان اپ اندروید (نسخهٔ ۳.۰.۰)
 *
 * سرویس بومی هر ~۹۰ ثانیه با کوکی نشست اینجا را صدا می‌زند و
 * اعلان‌های خوانده‌نشدهٔ جدید را به‌شکل «اعلان واقعی گوشی» نشان می‌دهد
 * — حتی وقتی اپ کاملاً بسته است.
 *
 * همچنین نگه‌داری پایگاه داده (سرعت پایدار در گذر زمان):
 * اعلان‌های خوانده‌شدهٔ قدیمی‌تر از ۱۲۰ روز، روزی یک‌بار پاک می‌شوند.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

/** نقشهٔ مسیر داخل اپ بر اساس نوع اعلان — لمس اعلان، کاربر را به همان بخش می‌برد */
function urlFor(type: string, messageId: string | null): string {
  if (type === 'GRADE') return '/?view=grades';
  if (type === 'ATTENDANCE') return '/?view=attendance';
  if (messageId) return '/?view=messages';
  return '/?view=dashboard';
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sinceParam = req.nextUrl.searchParams.get('since');
    const where: { userId: string; read: boolean; createdAt?: { gt: Date } } = {
      userId: me.id,
      read: false,
    };
    if (sinceParam) {
      const d = new Date(sinceParam);
      if (!Number.isNaN(d.getTime())) where.createdAt = { gt: d };
    }
    const rows = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true, body: true, type: true, messageId: true, createdAt: true },
    });
    const unread = await db.notification.count({ where: { userId: me.id, read: false } });
    maybeCleanup();
    return NextResponse.json({
      notifications: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        url: urlFor(n.type, n.messageId),
        createdAt: n.createdAt,
      })),
      unread,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** پاک‌سازی روزانهٔ اعلان‌های خوانده‌شدهٔ قدیمی — جدول کوچک = همیشه سریع */
async function maybeCleanup(): Promise<void> {
  try {
    const key = 'notifCleanupLast';
    const last = await db.setting.findUnique({ where: { key } });
    const lastMs = last ? new Date(last.value).getTime() : 0;
    if (Date.now() - lastMs < 24 * 3600 * 1000) return;
    await db.setting.upsert({
      where: { key },
      update: { value: new Date().toISOString() },
      create: { key, value: new Date().toISOString() },
    });
    const cutoff = new Date(Date.now() - 120 * 24 * 3600 * 1000);
    await db.notification.deleteMany({ where: { read: true, createdAt: { lt: cutoff } } });
  } catch {
    /* پاک‌سازی حتماً نباید پاسخ را بشکند */
  }
}
