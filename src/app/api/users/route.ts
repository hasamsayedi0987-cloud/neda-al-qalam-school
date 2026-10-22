import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, hashPassword, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { SECTIONS } from '@/lib/access';

const VALID_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];

/** اعتبارسنجی JSON دسترسی بخش‌ها — فقط کلیدهای شناخته‌شده با مقدار بولین */
function sanitizePerms(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'string') {
    if (input.trim() === '' || input.trim() === '{}' ) return null;
    try { input = JSON.parse(input); } catch { throw new ApiError('دسترسی‌های ارسالی نامعتبر است'); }
  }
  if (typeof input !== 'object' || Array.isArray(input)) throw new ApiError('دسترسی‌های ارسالی نامعتبر است');
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!SECTIONS[k] || !SECTIONS[k].manageable) continue; // بخش‌های انحصار مدیر قابل رونویسی نیستند
    if (typeof v === 'boolean') clean[k] = v;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export async function GET() {
  try {
    await requireRole('ADMIN');
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        studentProfile: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id, username: u.username, name: u.name, role: u.role,
        active: u.active, phone: u.phone, teacherId: u.teacherId, studentId: u.studentId,
        perms: u.perms,
        studentName: u.studentProfile ? `${u.studentProfile.firstName} ${u.studentProfile.lastName}` : null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const username = str(body.username).toLowerCase();
    const password = str(body.password);
    const name = str(body.name);
    const role = str(body.role);
    if (!username || !password || !name) throw new ApiError('همهٔ فیلدهای ضروری را پر کنید');
    if (password.length < 6) throw new ApiError('رمز عبور باید حداقل ۶ حرف باشد');
    if (!VALID_ROLES.includes(role)) throw new ApiError('نقش نامعتبر است');
    const exists = await db.user.findUnique({ where: { username } });
    if (exists) throw new ApiError('این نام کاربری قبلاً ثبت شده است');
    const user = await db.user.create({
      data: {
        username, name, role,
        password: hashPassword(password),
        phone: str(body.phone) || null,
        teacherId: str(body.teacherId) || null,
        studentId: str(body.studentId) || null,
        perms: sanitizePerms(body.perms),
        active: true,
      },
    });
    return NextResponse.json({ id: user.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ کاربر لازم است');
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError('کاربر یافت نشد', 404);
    // ── گارد آخرین مدیر فعال: نمی‌توان تنها مدیر را تنزل داد یا غیرفعال کرد ──
    if (target.role === 'ADMIN') {
      const demoting = body.role !== undefined && str(body.role) !== 'ADMIN';
      const deactivating = body.active !== undefined && !Boolean(body.active);
      if (demoting || deactivating) {
        const otherAdmins = await db.user.count({
          where: { role: 'ADMIN', active: true, NOT: { id } },
        });
        if (otherAdmins === 0) {
          throw new ApiError('حداقل یک مدیر فعال باید باقی بماند — ابتدا مدیر دیگری تعیین کنید');
        }
      }
    }
    const data: Record<string, unknown> = {};
    // تغییر نام کاربری — باید یکتا باشد
    if (body.username !== undefined) {
      const username = str(body.username).toLowerCase().trim();
      if (!username) throw new ApiError('نام کاربری نمی‌تواند خالی باشد');
      if (!/^[a-z0-9._\-@]+$/.test(username)) {
        throw new ApiError('نام کاربری فقط حروف انگلیسی، عدد و . _ - @ می‌تواند داشته باشد');
      }
      const taken = await db.user.findFirst({ where: { username, NOT: { id } } });
      if (taken) throw new ApiError('این نام کاربری قبلاً گرفته شده است');
      data.username = username;
    }
    if (body.name !== undefined) data.name = str(body.name);
    if (body.role !== undefined && VALID_ROLES.includes(str(body.role))) data.role = str(body.role);
    if (body.phone !== undefined) data.phone = str(body.phone) || null;
    if (body.teacherId !== undefined) data.teacherId = str(body.teacherId) || null;
    if (body.studentId !== undefined) data.studentId = str(body.studentId) || null;
    // دسترسی بخش‌ها (رونویسی نقش) — توسط مدیر
    if (body.perms !== undefined) data.perms = sanitizePerms(body.perms);
    // فعال/غیرفعال کردن — کاربر غیرفعال نمی‌تواند وارد شود
    if (body.active !== undefined) data.active = Boolean(body.active);
    // بازنشانی رمز توسط مدیر
    if (body.newPassword) {
      const pw = str(body.newPassword);
      if (pw.length < 6) throw new ApiError('رمز عبور باید حداقل ۶ حرف باشد');
      data.password = hashPassword(pw);
    }
    await db.user.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ کاربر لازم است');
    if (id === admin.id) throw new ApiError('نمی‌توانید حساب خودتان را حذف کنید');
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError('کاربر یافت نشد', 404);
    if (target.role === 'ADMIN') {
      const otherAdmins = await db.user.count({
        where: { role: 'ADMIN', active: true, NOT: { id } },
      });
      if (otherAdmins === 0) {
        throw new ApiError('حداقل یک مدیر فعال باید باقی بماند — ابتدا مدیر دیگری تعیین کنید');
      }
    }
    await db.notification.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
