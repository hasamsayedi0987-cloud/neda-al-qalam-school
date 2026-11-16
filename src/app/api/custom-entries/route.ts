import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/** ثبت‌های بخش دلخواه — فقط نقش‌های مجاز همان بخش */
async function sectionFor(me: { role: string }, sectionId: string) {
  const section = await db.customSection.findUnique({ where: { id: sectionId } });
  if (!section) throw new ApiError('بخش یافت نشد');
  const viewRoles: string[] = JSON.parse(section.viewRoles || '[]');
  const writeRoles: string[] = JSON.parse(section.writeRoles || '[]');
  if (me.role !== 'ADMIN' && !viewRoles.includes(me.role)) {
    throw new ApiError('شما به این بخش دسترسی ندارید', 403);
  }
  const canWrite = me.role === 'ADMIN' || writeRoles.includes(me.role);
  return { section, canWrite };
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const sectionId = str(body.sectionId);
    const { canWrite } = await sectionFor(me, sectionId);
    if (!canWrite) throw new ApiError('شما اجازهٔ ثبت در این بخش را ندارید', 403);
    const entry = await db.customEntry.create({
      data: {
        sectionId,
        data: JSON.stringify(body.data ?? {}),
        entryDate: str(body.entryDate) || null,
        createdBy: me.name,
      },
    });
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const id = str(body.id);
    const existing = await db.customEntry.findUnique({ where: { id } });
    if (!existing) throw new ApiError('ثبت یافت نشد');
    const { canWrite } = await sectionFor(me, existing.sectionId);
    if (!canWrite) throw new ApiError('شما اجازهٔ ویرایش این ثبت را ندارید', 403);
    await db.customEntry.update({
      where: { id },
      data: {
        data: JSON.stringify(body.data ?? {}),
        ...(body.entryDate !== undefined ? { entryDate: str(body.entryDate) || null } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser();
    const id = req.nextUrl.searchParams.get('id') || '';
    const existing = await db.customEntry.findUnique({ where: { id } });
    if (!existing) throw new ApiError('ثبت یافت نشد');
    const { canWrite } = await sectionFor(me, existing.sectionId);
    if (!canWrite) throw new ApiError('شما اجازهٔ حذف این ثبت را ندارید', 403);
    await db.customEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
