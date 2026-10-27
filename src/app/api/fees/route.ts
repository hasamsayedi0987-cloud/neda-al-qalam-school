import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str, optNum } from '@/lib/api-helpers';

/**
 * مدیریت مالی و فیس — ثبت پرداخت‌های ماهانهٔ شاگردان
 * GET: شاگردان (با صنف، فیس پیش‌فرض صنف، تلفن والد) + همهٔ پرداخت‌ها + روز ضرب‌الاجل
 * POST: ثبت پرداخت جدید | DELETE: حذف پرداخت (فقط مدیر)
 * محاسبهٔ مجموع‌ها (شاگرد/صنف/کل مکتب) و هشدار تأخیر در رابط کاربری انجام می‌شود.
 */
export async function GET() {
  try {
    await requireSection('finance');
    const [students, payments, deadline] = await Promise.all([
      db.student.findMany({
        orderBy: [{ classId: 'asc' }, { rollNo: 'asc' }],
        select: {
          id: true, firstName: true, lastName: true, fatherName: true,
          classId: true, status: true, guardianPhone: true, guardianName: true,
          class: { select: { id: true, name: true, monthlyFee: true } },
        },
      }),
      db.feePayment.findMany({ orderBy: { paidAt: 'desc' } }),
      db.setting.findUnique({ where: { key: 'feeDeadlineDay' } }),
    ]);
    return NextResponse.json({
      students: students.map((s) => ({
        id: s.id,
        name: [s.firstName, s.lastName].filter(Boolean).join(' '),
        fatherName: s.fatherName,
        classId: s.classId,
        className: s.class?.name || null,
        monthlyFee: s.class?.monthlyFee ?? null,
        status: s.status,
        guardianName: s.guardianName,
        guardianPhone: s.guardianPhone,
      })),
      payments,
      feeDeadlineDay: deadline?.value ? Number(deadline.value) : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireSection('finance');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) {
      throw new ApiError('فقط مدیر و سرمعلم می‌توانند پرداخت ثبت کنند', 403);
    }
    const body = await req.json();
    const studentId = str(body.studentId);
    const month = str(body.month); // 1405-10
    const amount = optNum(body.amount);
    if (!studentId) throw new ApiError('شاگرد لازم است');
    if (!/^\d{4}-(0?[1-9]|1[0-2])$/.test(month)) throw new ApiError('ماه باید به شکل 1405-10 باشد');
    if (amount == null || amount <= 0) throw new ApiError('مبلغ باید بزرگ‌تر از صفر باشد');
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) throw new ApiError('شاگرد یافت نشد');
    const pay = await db.feePayment.create({
      data: {
        studentId,
        month,
        amount,
        paidAt: str(body.paidAt) || new Date().toISOString().slice(0, 10),
        method: ['CASH', 'BANK'].includes(str(body.method)) ? str(body.method) : 'CASH',
        note: str(body.note) || null,
        recordedBy: me.name,
      },
    });
    return NextResponse.json({ id: pay.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireSection('finance');
    if (me.role !== 'ADMIN') throw new ApiError('فقط مدیر می‌تواند پرداخت را حذف کند', 403);
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ پرداخت لازم است');
    const pay = await db.feePayment.findUnique({ where: { id } });
    if (!pay) throw new ApiError('پرداخت یافت نشد');
    await db.feePayment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
