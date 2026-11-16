/**
 * API پوش مرورگر — نسخهٔ ۳.۰.۰
 *  GET    → کلید عمومی VAPID (عمومی — برای subscribe مرورگر)
 *  POST   → ثبت اشتراک پوش کاربر جاری
 *  DELETE → حذف اشتراک (خروج از حساب یا لغو اجازه)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { getVapidPublicKey } from '@/lib/push';

export async function GET() {
  try {
    const publicKey = await getVapidPublicKey();
    if (!publicKey) return NextResponse.json({ error: 'کلید پوش آماده نیست' }, { status: 503 });
    return NextResponse.json({ publicKey });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = (await req.json().catch(() => null)) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    } | null;
    const endpoint = str(body?.endpoint || '');
    const p256dh = str(body?.keys?.p256dh || '');
    const auth = str(body?.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return NextResponse.json({ error: 'اشتراک نامعتبر است' }, { status: 400 });
    }
    const userAgent = req.headers.get('user-agent') || null;
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: me.id, p256dh, auth, userAgent },
      create: { userId: me.id, endpoint, p256dh, auth, userAgent },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUser();
    const body = (await req.json().catch(() => ({}))) as { endpoint?: string } | null;
    const endpoint = str(body?.endpoint || '');
    if (!endpoint) return NextResponse.json({ error: 'شناسه لازم است' }, { status: 400 });
    await db.pushSubscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
