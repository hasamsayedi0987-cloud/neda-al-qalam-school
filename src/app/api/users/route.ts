import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, hashPassword, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

const VALID_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];

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
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = str(body.name);
    if (body.role !== undefined && VALID_ROLES.includes(str(body.role))) data.role = str(body.role);
    if (body.phone !== undefined) data.phone = str(body.phone) || null;
    if (body.teacherId !== undefined) data.teacherId = str(body.teacherId) || null;
    if (body.studentId !== undefined) data.studentId = str(body.studentId) || null;
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
    await db.notification.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
