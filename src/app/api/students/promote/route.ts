import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * ارتقای دسته‌جمعی شاگردان در پایان سال تعلیمی — فقط مدیر
 * action 'move': انتقال همهٔ شاگردان فعال از صنفی به صنف دیگر
 * action 'graduate': فراغت دادن همهٔ شاگردان فعال یک صنف
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'move') {
      const fromClassId = str(body.fromClassId);
      const toClassId = str(body.toClassId);
      if (!fromClassId || !toClassId) throw new ApiError('صنف مبدأ و مقصد را انتخاب کنید');
      if (fromClassId === toClassId) throw new ApiError('صنف مبدأ و مقصد یکسان است');
      const [from, to] = await Promise.all([
        db.class.findUnique({ where: { id: fromClassId } }),
        db.class.findUnique({ where: { id: toClassId } }),
      ]);
      if (!from || !to) throw new ApiError('صنف یافت نشد', 404);
      const moved = await db.student.updateMany({
        where: { classId: fromClassId, status: 'ACTIVE' },
        data: { classId: toClassId },
      });
      return NextResponse.json({ ok: true, moved: moved.count, from: from.name, to: to.name });
    }

    if (action === 'graduate') {
      const fromClassId = str(body.fromClassId);
      if (!fromClassId) throw new ApiError('صنف را انتخاب کنید');
      const cls = await db.class.findUnique({ where: { id: fromClassId } });
      if (!cls) throw new ApiError('صنف یافت نشد', 404);
      const grad = await db.student.updateMany({
        where: { classId: fromClassId, status: 'ACTIVE' },
        data: { status: 'GRADUATED' },
      });
      return NextResponse.json({ ok: true, graduated: grad.count, from: cls.name });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
