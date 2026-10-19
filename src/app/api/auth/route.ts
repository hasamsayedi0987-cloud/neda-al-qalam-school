import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createToken, getSessionUser, hashPassword, verifyPassword,
  SESSION_COOKIE, SESSION_MAX_AGE_S, requireUser, ApiError,
} from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body.action);

    // ─── ورود ───
    if (action === 'login') {
      const username = str(body.username).toLowerCase();
      const password = str(body.password);
      if (!username || !password) throw new ApiError('نام کاربری و رمز عبور را وارد کنید');
      const user = await db.user.findUnique({ where: { username } });
      if (!user || !verifyPassword(password, user.password)) {
        throw new ApiError('نام کاربری یا رمز عبور نادرست است', 401);
      }
      if (!user.active) {
        throw new ApiError('حساب کاربری شما توسط مدیر غیرفعال شده است. لطفاً با مدیر مکتب تماس بگیرید.', 403);
      }
      const token = createToken({ uid: user.id, role: user.role, iat: Math.floor(Date.now() / 1000) });
      const res = NextResponse.json({
        user: {
          id: user.id, username: user.username, name: user.name,
          role: user.role, phone: user.phone, teacherId: user.teacherId, studentId: user.studentId,
        },
      });
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE_S,
      });
      return res;
    }

    // ─── خروج ───
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
      return res;
    }

    // ─── تغییر رمز عبور خود کاربر ───
    if (action === 'change-password') {
      const me = await requireUser();
      const current = str(body.currentPassword);
      const next = str(body.newPassword);
      if (next.length < 6) throw new ApiError('رمز عبور جدید باید حداقل ۶ حرف باشد');
      const dbUser = await db.user.findUnique({ where: { id: me.id } });
      if (!dbUser || !verifyPassword(current, dbUser.password)) {
        throw new ApiError('رمز عبور فعلی نادرست است');
      }
      await db.user.update({
        where: { id: me.id },
        data: { password: hashPassword(next) },
      });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
