import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { permsFor } from '@/lib/comm-server';

/**
 * گزارش فعالیت بخش پیام‌ها — تنها برای دارندگان صلاحیت «گزارش» (مدیر).
 * شامل: مجموع‌ها، وضعیت خوانده‌شدن، انواع پیام، فرستندگان پرکار،
 * روند ۳۰ روز، پیام‌های اخیر برای مودریشن و گزارش فعالیت‌های مدیریتی.
 */
export async function GET() {
  try {
    const me = await requireUser();
    const perms = await permsFor(me);
    if (!perms.reports) throw new ApiError('دسترسی به گزارش پیام‌ها ندارید', 403);

    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [totalMessages, totalRecipients, readRecipients, kindRows, recent, audits, roleRows, senderRows] = await Promise.all([
      db.message.count(),
      db.messageRecipient.count(),
      db.messageRecipient.count({ where: { read: true } }),
      db.message.groupBy({ by: ['kind'], _count: { id: true } }),
      db.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: 120,
        select: {
          id: true, subject: true, body: true, category: true, kind: true, priority: true,
          createdAt: true, editedAt: true, fromUserId: true,
          fromUser: { select: { name: true, role: true } },
          _count: { select: { recipients: true } },
        },
      }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
      db.message.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true, fromUserId: true, fromUser: { select: { role: true } } } }),
      db.message.groupBy({ by: ['fromUserId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
    ]);

    const senderIds = senderRows.map((s) => s.fromUserId);
    const senders = senderIds.length
      ? await db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, role: true } })
      : [];
    const senderMap = new Map(senders.map((u) => [u.id, u]));

    // روند روزانهٔ ۳۰ روز اخیر
    const daily: Record<string, number> = {};
    for (const m of roleRows) {
      const key = m.createdAt.toISOString().slice(0, 10);
      daily[key] = (daily[key] || 0) + 1;
    }

    const byRole: Record<string, number> = {};
    for (const m of roleRows) byRole[m.fromUser.role] = (byRole[m.fromUser.role] || 0) + 1;

    const byKind: Record<string, number> = {};
    for (const k of kindRows) byKind[k.kind] = k._count.id;

    return NextResponse.json({
      totals: {
        messages: totalMessages,
        deliveries: totalRecipients,
        read: readRecipients,
        unread: totalRecipients - readRecipients,
        last30: roleRows.length,
      },
      byKind,
      byRole,
      topSenders: senderRows.map((s) => ({
        name: senderMap.get(s.fromUserId)?.name || 'کاربر حذف‌شده',
        role: senderMap.get(s.fromUserId)?.role || '',
        count: s._count.id,
      })),
      daily,
      recent: recent.map((m) => ({
        id: m.id,
        subject: m.subject,
        bodyPreview: m.body.slice(0, 140),
        category: m.category,
        kind: m.kind,
        priority: m.priority,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        fromName: m.fromUser.name,
        fromRole: m.fromUser.role,
        fromId: m.fromUserId,
        recipients: m._count.recipients,
      })),
      audits: audits.map((a) => ({
        id: a.id,
        actorName: a.actorName,
        action: a.action,
        detail: a.detail,
        createdAt: a.createdAt,
      })),
      canModerate: perms.moderate,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
