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
      // شناسهٔ شاگردانِ قبلاً موجودِ صنف مقصد — پیش از انتقال ثبت می‌شود
      const preExisting = await db.student.findMany({
        where: { classId: toClassId, status: 'ACTIVE' },
        select: { id: true },
      });
      const preIds = new Set(preExisting.map((r) => r.id));
      const preAgg = await db.student.aggregate({
        where: { classId: toClassId, status: 'ACTIVE' },
        _max: { rollNo: true },
      });
      const moved = await db.student.updateMany({
        where: { classId: fromClassId, status: 'ACTIVE' },
        data: { classId: toClassId },
      });
      // مرحلهٔ ۶ — جلوگیری از شمارهٔ دانش‌آموزی تکراری در صنف مقصد:
      // شاگردان منتقله پس از بزرگ‌ترین شمارهٔ موجود صنف مقصد، به ترتیب شمارهٔ
      // قبلی شان از نو شماره‌گذاری می‌شوند (اگر صنف مقصد خالی باشد، شماره‌ها ۱ تا N می‌ماند).
      if (moved.count > 0) {
        const movedStudents = await db.student.findMany({
          where: { classId: toClassId, status: 'ACTIVE', id: { notIn: [...preIds] } },
          orderBy: [{ rollNo: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        let next = (preAgg._max.rollNo ?? 0);
        for (const s of movedStudents) {
          next += 1;
          await db.student.update({ where: { id: s.id }, data: { rollNo: next } });
        }
      }
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
