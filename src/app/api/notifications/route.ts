import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

export async function GET() {
  try {
    const me = await requireUser();
    const notifications = await db.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unread = notifications.filter((n) => !n.read).length;
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const title = str(body.title);
    const msg = str(body.body);
    const target = str(body.target); // role: TEACHER | GUARDIAN | ALL | username
    if (!title || !msg) throw new ApiError('عنوان و متن اعلان لازم است');
    if (!target) throw new ApiError('گیرندهٔ اعلان را مشخص کنید');

    let users: Array<{ id: string }> = [];
    if (target === 'ALL') {
      users = await db.user.findMany({ where: { active: true }, select: { id: true } });
    } else if (['TEACHER', 'GUARDIAN', 'STUDENT', 'STAFF', 'LIBRARIAN', 'HEADTEACHER'].includes(target)) {
      users = await db.user.findMany({ where: { active: true, role: target }, select: { id: true } });
    } else {
      const u = await db.user.findFirst({ where: { username: target, active: true }, select: { id: true } });
      if (!u) throw new ApiError('کاربر یافت نشد');
      users = [u];
    }
    if (users.length === 0) throw new ApiError('هیچ گیرنده‌ای یافت نشد');
    await db.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title, body: msg, type: 'INFO' })),
    });
    return NextResponse.json({ ok: true, sent: users.length });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json().catch(() => ({}));
    if (body.all) {
      await db.notification.updateMany({ where: { userId: me.id }, data: { read: true } });
    } else {
      const id = str(body.id);
      if (!id) throw new ApiError('شناسه لازم است');
      await db.notification.updateMany({ where: { id, userId: me.id }, data: { read: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser();
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (id) {
      await db.notification.deleteMany({ where: { id, userId: me.id } });
    } else {
      await db.notification.deleteMany({ where: { userId: me.id } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
