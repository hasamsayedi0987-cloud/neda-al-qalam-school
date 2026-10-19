import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

const POSITIONS = ['معلم', 'سرمعلم', 'مدیر', 'ملازم', 'کارمند', 'کتابخانه‌دار'];

export async function GET() {
  try {
    await requireUser();
    const teachers = await db.teacher.findMany({
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { username: true, active: true } } },
    });
    return NextResponse.json({
      teachers: teachers.map((t) => ({
        id: t.id, name: t.name, fatherName: t.fatherName, position: t.position,
        phone: t.phone, education: t.education, hireDate: t.hireDate, active: t.active,
        username: t.user?.username || null,
        userActive: t.user?.active ?? null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const name = str(body.name);
    if (!name) throw new ApiError('نام لازم است');
    const position = POSITIONS.includes(str(body.position)) ? str(body.position) : 'معلم';
    const teacher = await db.teacher.create({
      data: {
        name,
        fatherName: str(body.fatherName) || null,
        position,
        phone: str(body.phone) || null,
        education: str(body.education) || null,
        hireDate: str(body.hireDate) || null,
        active: true,
      },
    });
    return NextResponse.json({ id: teacher.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسه لازم است');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = str(body.name);
    if (body.fatherName !== undefined) data.fatherName = str(body.fatherName) || null;
    if (body.position !== undefined && POSITIONS.includes(str(body.position))) data.position = str(body.position);
    if (body.phone !== undefined) data.phone = str(body.phone) || null;
    if (body.education !== undefined) data.education = str(body.education) || null;
    if (body.hireDate !== undefined) data.hireDate = str(body.hireDate) || null;
    if (body.active !== undefined) data.active = Boolean(body.active);
    await db.teacher.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسه لازم است');
    await db.user.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
    await db.class.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
    await db.classSubject.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
    await db.teacher.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
