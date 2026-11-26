/**
 * API امن QR کارت هویت — نسخهٔ ۳.۸.۱ (مرحلهٔ ۲ امنیت)
 *
 *  POST action=issue   → صدور توکن تصادفیِ امضاشده برای هر کارت (بخش idcards)
 *  POST action=revoke  → لغو همهٔ توکن‌های صادرشدهٔ یک شخص (مدیر/سرمعلم)
 *  POST action=restore → بازگردانی لغو (مدیر/سرمعلم)
 *  GET  ?t=<توکن>      → اعتبارسنجی سمت سرور و بازگشت «حداقل اطلاعات»
 *
 * امنیت:
 *  • توکن = base64url({kind,id,iat,jti}) + امضای HMAC با کلید نشست — شامل هیچ
 *    اطلاعات شخصی نیست؛ نام/صنف فقط پس از اعتبارسنجی سمت سرور و بررسی نقش
 *    درخواست‌کننده برگردانده می‌شود.
 *  • لغو با ثبت زمان به‌ازای هر شخص در Setting(qrRevocations): هر توکنی که
 *    پیش از زمان لغو صادر شده باشد دیگر پذیرفته نیست — چاپ مجدد توکن تازه می‌سازد.
 *  • شاگرد/سرپرست فقط می‌توانند کد کارت خودشان را بازکنند؛ سایر نقش‌های پرسنل
 *    برای ثبت حاضری حق بازکردن کد هر شاگرد را دارند.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, issueQrToken, verifyQrToken, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { isRevoked, readRevocations, writeRevocations } from '@/lib/qr-revoke';

const MAX_ITEMS = 500;

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const token = str(req.nextUrl.searchParams.get('t'));
    if (!token) throw new ApiError('توکن QR ارسال نشده است');
    const data = await verifyQrToken(token);
    if (!data) throw new ApiError('کد QR نامعتبر است', 400);

    // لغو — توکن‌های صادرشده پیش از زمان لغو پذیرفته نمی‌شوند (منبع مشترک با /api/gate)
    if (await isRevoked(data.id, data.iat)) {
      throw new ApiError('این کد QR توسط ادارهٔ مکتب لغو شده است', 410);
    }

    // شاگرد/سرپرست فقط کد کارت خودشان
    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (data.kind !== 'student' || me.studentId !== data.id) {
        throw new ApiError('دسترسی مجاز نیست', 403);
      }
    }

    // حداقل اطلاعات — از سرور، نه از داخل QR
    if (data.kind === 'student') {
      const s = await db.student.findUnique({
        where: { id: data.id },
        select: { id: true, firstName: true, lastName: true, fatherName: true, class: { select: { name: true } } },
      });
      if (!s) throw new ApiError('شاگرد یافت نشد', 404);
      return NextResponse.json({
        kind: 'student', id: s.id,
        name: `${s.firstName} ${s.lastName || ''}`.trim(),
        father: s.fatherName, className: s.class?.name || null,
      });
    }
    const t = await db.teacher.findUnique({
      where: { id: data.id },
      select: { id: true, name: true, position: true },
    });
    if (!t) throw new ApiError('کارمند یافت نشد', 404);
    return NextResponse.json({ kind: 'staff', id: t.id, name: t.name, position: t.position });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      items?: Array<{ kind?: string; id?: string }>;
      kind?: string;
      id?: string;
    };
    const action = str(body.action);

    // ─── صدور توکن برای کارت‌های چاپی ───
    if (action === 'issue') {
      await requireSection('idcards');
      const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
      if (!items.length) throw new ApiError('فهرست کارت‌ها خالی است');
      const tokens: Record<string, string> = {};
      for (const it of items) {
        const kind = it?.kind === 'staff' ? 'staff' : 'student';
        const id = str(it?.id);
        if (!id) continue;
        tokens[`${kind}:${id}`] = await issueQrToken(kind, id);
      }
      return NextResponse.json({ tokens });
    }

    // ─── لغو / بازگردانی ───
    if (action === 'revoke' || action === 'restore') {
      await requireRole('ADMIN', 'HEADTEACHER');
      const id = str(body.id);
      if (!id) throw new ApiError('شناسه شخص لازم است');
      const revs = await readRevocations();
      if (action === 'revoke') revs[id] = new Date().toISOString();
      else delete revs[id];
      await writeRevocations(revs);
      return NextResponse.json({ ok: true, revoked: action === 'revoke' });
    }

    throw new ApiError('عملیات نامعلوم است');
  } catch (e) {
    return handleApiError(e);
  }
}
