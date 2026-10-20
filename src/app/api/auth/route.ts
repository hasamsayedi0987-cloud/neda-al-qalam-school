import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createToken, getSessionUser, hashPassword, verifyPassword,
  SESSION_COOKIE, requireUser, ApiError,
} from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { ensureBootstrap } from '@/lib/bootstrap';

export async function GET() {
  try {
    await ensureBootstrap();
    const user = await getSessionUser();
    if (!user) {
      // آیا راه‌اندازی اولیه انجام شده؟ (نمایش حساب‌های ابتدایی فقط قبل از اولین ورود)
      const setup = await db.setting.findUnique({ where: { key: 'setup_done' } });
      return NextResponse.json({ user: null, setupDone: setup?.value === '1' }, { status: 200 });
    }
    return NextResponse.json({ user, setupDone: true });
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
      await ensureBootstrap();
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
      // بعد از اولین ورود مدیر، حساب‌های ابتدایی دیگر به هیچ‌کس نمایش داده نمی‌شود
      if (user.role === 'ADMIN') {
        await db.setting.upsert({
          where: { key: 'setup_done' },
          update: { value: '1' },
          create: { key: 'setup_done', value: '1' },
        });
      }
      const res = NextResponse.json({
        user: {
          id: user.id, username: user.username, name: user.name,
          role: user.role, phone: user.phone, teacherId: user.teacherId, studentId: user.studentId,
        },
        setupDone: true,
      });
      // کوکی نشست: بدون maxAge — با بستن مرورگر/اپ، نشست خاتمه می‌یابد و ورود مجدد لازم است
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true, sameSite: 'lax', path: '/',
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
