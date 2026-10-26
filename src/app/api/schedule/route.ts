import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str, optNum } from '@/lib/api-helpers';

/**
 * برنامهٔ هفتگی صنف‌ها — جدول زمانی با هشدار تداخل زمانی معلم
 * GET: همهٔ اسلات‌ها با نام صنف/مضمون/معلم (+ فیلتر classId اختیاری)
 * POST: ثبت/جابه‌جایی اسلات (classId+day+period یکتاست) — تداخل معلم همان روز/پریود در صنف دیگر → خطا با نام صنف
 * DELETE: ?id=
 * تدریس برنامه: فقط مدیر و سرمعلم؛ مشاهده: همهٔ کاربران واردشده (معلم برنامهٔ خود را می‌بیند)
 */

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const classId = new NextRequest(req.url).nextUrl.searchParams.get('classId') || '';
    const slots = await db.scheduleSlot.findMany({
      where: classId ? { classId } : undefined,
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
      include: {
        class: { select: { id: true, name: true, grade: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({
      slots: slots.map((s) => ({
        id: s.id, classId: s.classId, className: s.class.name,
        subjectId: s.subjectId, subjectName: s.subject.name, subjectCode: s.subject.code,
        teacherId: s.teacherId, teacherName: s.teacher?.name || null,
        day: s.day, period: s.period,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireSection('classes');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) {
      throw new ApiError('فقط مدیر و سرمعلم می‌توانند برنامهٔ هفتگی را تنظیم کنند', 403);
    }
    const body = await req.json();
    const classId = str(body.classId);
    const subjectId = str(body.subjectId);
    const teacherId = str(body.teacherId) || null;
    const day = optNum(body.day);
    const period = optNum(body.period);
    if (!classId || !subjectId) throw new ApiError('صنف و مضمون لازم است');
    if (day == null || day < 0 || day > 6) throw new ApiError('روز باید بین ۰ (شنبه) تا ۶ باشد');
    if (period == null || period < 1 || period > 12) throw new ApiError('پریود باید بین ۱ تا ۱۲ باشد');

    const cls = await db.class.findUnique({ where: { id: classId } });
    if (!cls) throw new ApiError('صنف یافت نشد');
    const subject = await db.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new ApiError('مضمون یافت نشد');
    let teacherName = '';
    if (teacherId) {
      const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher) throw new ApiError('معلم یافت نشد');
      teacherName = teacher.name;
    }

    // تداخل زمانی: همین معلم، همین روز، همین پریود — در صنف دیگر
    if (teacherId) {
      const clash = await db.scheduleSlot.findFirst({
        where: { teacherId, day, period, classId: { not: classId } },
        include: { class: { select: { name: true } }, subject: { select: { name: true } } },
      });
      if (clash) {
        throw new ApiError(
          `تداخل زمانی: ${teacherName} در این وقت، در صنف ${clash.class.name} مضمون ${clash.subject.name} دارد`,
          409,
        );
      }
    }

    const slot = await db.scheduleSlot.upsert({
      where: { classId_day_period: { classId, day, period } },
      update: { subjectId, teacherId },
      create: { classId, subjectId, teacherId, day, period },
    });
    return NextResponse.json({ id: slot.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireSection('classes');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) {
      throw new ApiError('فقط مدیر و سرمعلم می‌توانند برنامهٔ هفتگی را تغییر دهند', 403);
    }
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ اسلات لازم است');
    const slot = await db.scheduleSlot.findUnique({ where: { id } });
    if (!slot) throw new ApiError('اسلات یافت نشد');
    await db.scheduleSlot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
