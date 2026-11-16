import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/** تقسیم مضامین به صنف و معلم + کپی تقسیم از صنف دیگر (انتقال به سال تحصیلی جدید) */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();

    // ─── کپی تقسیم مضامین از یک صنف به صنف دیگر ───
    if (str(body.action) === 'copy-division') {
      const fromClassId = str(body.fromClassId);
      const toClassId = str(body.toClassId);
      if (!fromClassId || !toClassId) throw new ApiError('صنف مبدأ و مقصد لازم است');
      if (fromClassId === toClassId) throw new ApiError('صنف مبدأ و مقصد نباید یکی باشد');
      const [from, to] = await Promise.all([
        db.class.findUnique({ where: { id: fromClassId }, include: { classSubjects: true } }),
        db.class.findUnique({ where: { id: toClassId }, include: { classSubjects: true } }),
      ]);
      if (!from || !to) throw new ApiError('صنف یافت نشد');
      let copied = 0;
      for (const cs of from.classSubjects) {
        const exists = to.classSubjects.some((x) => x.subjectId === cs.subjectId);
        if (exists) continue; // مضامین موجود دست نمی‌خورند
        await db.classSubject.create({
          data: { classId: toClassId, subjectId: cs.subjectId, teacherId: cs.teacherId },
        });
        copied += 1;
      }
      return NextResponse.json({ ok: true, copied });
    }

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
