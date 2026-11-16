import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str, optNum } from '@/lib/api-helpers';

export async function GET() {
  try {
    await requireUser();
    const subjects = await db.subject.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json({ subjects });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireSection('subjects');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) throw new ApiError('فقط مدیر و سرمعلم می‌توانند مضمون ثبت کنند', 403);
    const body = await req.json();
    const name = str(body.name);
    if (!name) throw new ApiError('نام مضمون لازم است');
    const exists = await db.subject.findFirst({ where: { name } });
    if (exists) throw new ApiError('این مضمون قبلاً ثبت شده است');
    const subject = await db.subject.create({
      data: {
        name,
        code: str(body.code) || null,
        credits: optNum(body.credits),
      },
    });
    return NextResponse.json({ id: subject.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireSection('subjects');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) throw new ApiError('فقط مدیر و سرمعلم می‌توانند مضمون را ویرایش کنند', 403);
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ مضمون لازم است');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = str(body.name);
    if (body.code !== undefined) data.code = str(body.code) || null;
    if (body.credits !== undefined) data.credits = optNum(body.credits);
    await db.subject.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const url = new NextRequest(req.url);
    const id = url.nextUrl.searchParams.get('id') || '';
    const force = url.nextUrl.searchParams.get('force') === '1';
    if (!id) throw new ApiError('شناسهٔ مضمون لازم است');
    const existing = await db.subject.findUnique({
      where: { id },
      include: { classSubjects: { include: { _count: { select: { grades: true } } } } },
    });
    if (!existing) throw new ApiError('مضمون یافت نشد', 404);
    // نمرات ثبت‌شدهٔ این مضمون با حذف، برای همیشه پاک می‌شوند — تایید صریح لازم است
    const gradesCount = existing.classSubjects.reduce((sum, cs) => sum + cs._count.grades, 0);
    if (gradesCount > 0 && !force) {
      throw new ApiError(`این مضمون ${gradesCount} نمرهٔ ثبت‌شده دارد. برای حذف تایید صریح لازم است.`, 409);
    }
    await db.subject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
