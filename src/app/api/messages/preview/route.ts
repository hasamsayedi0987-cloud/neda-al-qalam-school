import { NextRequest, NextResponse } from 'next/server';
import { requireUser, ApiError, type AuthUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { sectionAllowed } from '@/lib/access';
import {
  assertClassScope, assertKindAllowed, permsFor, resolveRecipients, type MsgTarget,
} from '@/lib/comm-server';

/**
 * پیش‌شمارهٔ گیرندگان — پیش از ارسال واقعی، مدیر می‌بیند پیام به چند نفر
 * و در کدام گروه‌ها می‌رسد. هیچ پیامی ثبت نمی‌شود (فقط خواندنی).
 */
function meCtx(me: AuthUser) {
  return { id: me.id, name: me.name, role: me.role, teacherId: me.teacherId, studentId: me.studentId };
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!sectionAllowed(me, 'messages')) throw new ApiError('دسترسی پیام‌ها برای شما غیرفعال است', 403);
    const body = await req.json().catch(() => ({}));
    const targets: MsgTarget[] = Array.isArray(body.targets)
      ? (body.targets as unknown[]).slice(0, 8).map((t) => {
          if (!t || typeof t !== 'object') throw new ApiError('گیرنده نامعتبر است');
          return t as MsgTarget;
        })
      : [];
    if (!targets.length) throw new ApiError('گیرنده انتخاب نشده است');
    const perms = await permsFor(me);
    assertKindAllowed(perms, targets, false);
    await assertClassScope(meCtx(me), perms, targets);
    const { recipients, breakdown } = await resolveRecipients(meCtx(me), targets);
    // نمایش بهتر — شمارش بر اساس نقش
    const byRole: Record<string, number> = {};
    for (const r of recipients) byRole[r.role] = (byRole[r.role] || 0) + 1;
    const names = recipients.slice(0, 12).map((r) => r.name);
    return NextResponse.json({
      total: recipients.length,
      breakdown,
      byRole,
      names,
      truncated: recipients.length > 12,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
