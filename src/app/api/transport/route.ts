import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str, optNum } from '@/lib/api-helpers';

/**
 * ترانسپورت متعلمین — نسخهٔ ۳.۳.۰
 * ثبت فیس ماهانه، وصولی‌ها، مصارف و گذارش مفاد/نقص با فلتر صنف و ماه
 */

export async function GET(req: NextRequest) {
  try {
    await requireSection('transport');
    const sp = req.nextUrl.searchParams;
    const month = sp.get('month') || '';

    const enrollments = await db.transportEnrollment.findMany({
      where: { active: true },
      include: {
        student: {
          include: { class: { select: { id: true, name: true, grade: true } } },
        },
        payments: { orderBy: { month: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const expenses = await db.transportExpense.findMany({ orderBy: [{ month: 'desc' }, { createdAt: 'desc' }] });

    // گذارش ماهانه — فلتر به صنف در کلاینت انجام می‌شود؛ اینجا جمع کل
    const paymentsByMonth = new Map<string, number>();
    const allPayments = await db.transportPayment.findMany();
    for (const p of allPayments) paymentsByMonth.set(p.month, (paymentsByMonth.get(p.month) || 0) + p.amount);
    const expensesByMonth = new Map<string, number>();
    for (const e of expenses) expensesByMonth.set(e.month, (expensesByMonth.get(e.month) || 0) + e.amount);

    let monthReport: { month: string; income: number; expense: number; profit: number } | null = null;
    if (month) {
      const income = paymentsByMonth.get(month) || 0;
      const expense = expensesByMonth.get(month) || 0;
      monthReport = { month, income, expense, profit: income - expense };
    }

    return NextResponse.json({
      enrollments,
      expenses,
      monthReport,
      months: Array.from(new Set([...paymentsByMonth.keys(), ...expensesByMonth.keys()])).sort().reverse(),
      totals: {
        income: allPayments.reduce((a, p) => a + p.amount, 0),
        expense: expenses.reduce((a, e) => a + e.amount, 0),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('transport');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'save-enrollment') {
      const studentId = str(body.studentId);
      if (!studentId) throw new ApiError('شاگرد را انتخاب کنید');
      const data = {
        studentId,
        route: str(body.route) || null,
        vehicleNo: str(body.vehicleNo) || null,
        monthlyFee: Math.max(0, Number(body.monthlyFee) || 0),
        active: body.active !== false,
      };
      if (body.id) {
        await db.transportEnrollment.update({ where: { id: str(body.id) }, data });
        return NextResponse.json({ ok: true });
      }
      const created = await db.transportEnrollment.create({ data });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-payment') {
      const enrollmentId = str(body.enrollmentId);
      const month = str(body.month);
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!enrollmentId || !month || !amount) throw new ApiError('قسط، ماه و مبلغ را کامل کنید');
      const clientToken = str(body.clientToken).slice(0, 64) || null;
      const created = await db.transportPayment.create({
        data: { enrollmentId, month, amount, paidAt: str(body.paidAt) || new Date().toISOString().slice(0, 10), note: str(body.note) || null, clientToken },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-expense') {
      const month = str(body.month);
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!month || !amount) throw new ApiError('ماه و مبلغ مصرف را کامل کنید');
      const created = await db.transportExpense.create({
        data: { month, amount, note: str(body.note) || null, clientToken: str(body.clientToken).slice(0, 64) || null },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'delete-enrollment') {
      await db.transportEnrollment.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete-expense') {
      await db.transportExpense.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
