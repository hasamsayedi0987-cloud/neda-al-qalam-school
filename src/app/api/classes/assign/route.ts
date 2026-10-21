import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/** تقسیم مضامین به صنف و معلم */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const classId = str(body.classId);
    const subjectId = str(body.subjectId);
    const teacherId = str(body.teacherId) || null;
    if (!classId || !subjectId) throw new ApiError('صنف و مضمون لازم است');
    const cls = await db.class.findUnique({ where: { id: classId } });
    const subj = await db.subject.findUnique({ where: { id: subjectId } });
    if (!cls || !subj) throw new ApiError('صنف یا مضمون یافت نشد');
    await db.classSubject.upsert({
      where: { classId_subjectId: { classId, subjectId } },
      update: { teacherId },
      create: { classId, subjectId, teacherId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const csId = new NextRequest(req.url).nextUrl.searchParams.get('csId') || '';
    if (!csId) throw new ApiError('شناسه لازم است');
    const cs = await db.classSubject.findUnique({
      where: { id: csId },
      include: { subject: true },
    });
    if (!cs) throw new ApiError('سپردگی یافت نشد');
    await db.grade.deleteMany({ where: { classSubjectId: csId } });
    await db.classSubject.delete({ where: { id: csId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
