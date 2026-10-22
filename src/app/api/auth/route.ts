import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createToken, getSessionUser, hashPassword, verifyPassword,
  SESSION_COOKIE, requireUser, ApiError,
} from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { ensureBootstrap } from '@/lib/bootstrap';
import {
  checkRateLimit, recordFailure, clearFailures, clientIp,
  LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS,
} from '@/lib/rate-limit';

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
      // ── محدودیت تلاش ورود (ضد جستجوی رمز) ──
      const rlKey = `login:${username}:${clientIp(req)}`;
      const rl = checkRateLimit(rlKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
      if (!rl.allowed) {
        const mins = Math.ceil(rl.retryAfterSec / 60);
        throw new ApiError(
          `به دلیل تلاش‌های ناموفق مکرر، ورود برای ${mins} دقیقه موقتاً مسدود شد. لطفاً کمی بعد دوباره تلاش کنید.`,
          429,
        );
      }
      const user = await db.user.findUnique({ where: { username } });
      if (!user || !verifyPassword(password, user.password)) {
        recordFailure(rlKey, LOGIN_WINDOW_MS);
        const left = checkRateLimit(rlKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS).remaining;
        throw new ApiError(
          left <= 2
            ? `نام کاربری یا رمز عبور نادرست است (تلاش باقی‌مانده: ${left})`
            : 'نام کاربری یا رمز عبور نادرست است',
          401,
        );
      }
      clearFailures(rlKey);
      if (!user.active) {
        throw new ApiError('حساب کاربری شما توسط مدیر غیرفعال شده است. لطفاً با مدیر مکتب تماس بگیرید.', 403);
      }
      // ── ترمیم خودکار پیوند حساب با پروندهٔ معلم/شاگرد ──
      // اگر حساب معلم به «پروندهٔ معلم» پیوند نداشته باشد، مضامین و صنف‌هایش دیده نمی‌شود.
      // در ورود، اگر نام حساب با دقیقاً یک معلمِ بدون حسابِ پیوسته مطابقت کند، پیوند خودکار برقرار می‌شود.
      let teacherId = user.teacherId;
      let studentId = user.studentId;
      try {
        if (!teacherId && ['TEACHER', 'HEADTEACHER', 'STAFF', 'LIBRARIAN'].includes(user.role)) {
          const matches = await db.teacher.findMany({ where: { name: user.name.trim(), active: true } });
          if (matches.length === 1) {
            const linked = await db.user.findFirst({ where: { teacherId: matches[0].id, NOT: { id: user.id } } });
            if (!linked) {
              await db.user.update({ where: { id: user.id }, data: { teacherId: matches[0].id } });
              teacherId = matches[0].id;
            }
          }
        }
        if (!studentId && ['STUDENT', 'GUARDIAN'].includes(user.role)) {
          const matches = await db.student.findMany({ where: { firstName: user.name.trim().split(/\s+/)[0] } });
          const full = user.name.trim();
          const exact = matches.filter((s) => `${s.firstName} ${s.lastName || ''}`.trim() === full);
          if (exact.length === 1) {
            const linked = await db.user.findFirst({ where: { studentId: exact[0].id, NOT: { id: user.id } } });
            if (!linked) {
              await db.user.update({ where: { id: user.id }, data: { studentId: exact[0].id } });
              studentId = exact[0].id;
            }
          }
        }
      } catch { /* ترمیم پیوند حیاتی نیست — ورود ادامه می‌یابد */ }
      const token = await createToken({ uid: user.id, role: user.role, iat: Math.floor(Date.now() / 1000) });
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
          role: user.role, phone: user.phone, teacherId, studentId, perms: user.perms,
        },
        setupDone: true,
      });
      // کوکی نشست: بدون maxAge — با بستن مرورگر/اپ، نشست خاتمه می‌یابد و ورود مجدد لازم است
      // پرچم secure فقط وقتی درخواست از HTTPS آمده باشد (Vercel/پراکسی)
      const isHttps =
        req.nextUrl.protocol === 'https:' ||
        (req.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true, sameSite: 'lax', path: '/', secure: isHttps,
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
