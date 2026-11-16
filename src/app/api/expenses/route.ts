import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * مصارفات با کتگوری + معاشات کارمندان — نسخهٔ ۳.۳.۰
 * ثبت کتگوری و مصارفات، راپور به اساس کتگوری و تاریخ، معاشات ماهانه
 */

export async function GET(req: NextRequest) {
  try {
    await requireSection('expenses');
    const sp = req.nextUrl.searchParams;
    const from = str(sp.get('from'));
    const to = str(sp.get('to'));
    const categoryId = str(sp.get('categoryId'));
    const month = str(sp.get('month')); // برای معاشات

    const expenseWhere: Record<string, unknown> = {};
    if (from || to) {
      expenseWhere.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    if (categoryId) expenseWhere.categoryId = categoryId;

    const [categories, expenses, salaries, teachers] = await Promise.all([
      db.expenseCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { expenses: true } } } }),
      db.expense.findMany({ where: expenseWhere, include: { category: { select: { name: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 }),
      month
        ? db.salaryPayment.findMany({ where: { month }, include: { teacher: { select: { id: true, name: true, position: true } } }, orderBy: { createdAt: 'desc' } })
        : db.salaryPayment.findMany({ include: { teacher: { select: { id: true, name: true, position: true } } }, orderBy: [{ month: 'desc' }, { createdAt: 'desc' }], take: 300 }),
      db.teacher.findMany({ where: { active: true }, select: { id: true, name: true, position: true }, orderBy: { name: 'asc' } }),
    ]);

    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      const k = e.category?.name || 'دیگر';
      byCategory.set(k, (byCategory.get(k) || 0) + e.amount);
    }

    return NextResponse.json({
      categories,
      expenses,
      salaries,
      teachers,
      totals: {
        expenses: expenses.reduce((a, e) => a + e.amount, 0),
        salaries: salaries.reduce((a, s) => a + s.amount, 0),
      },
      byCategory: Array.from(byCategory.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('expenses');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'save-category') {
      const name = str(body.name);
      if (!name) throw new ApiError('نام کتگوری را بنویسید');
      const existing = await db.expenseCategory.findUnique({ where: { name } });
      if (existing) throw new ApiError('این کتگوری از قبل وجود دارد');
      const created = await db.expenseCategory.create({ data: { name } });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-expense') {
      const categoryId = str(body.categoryId);
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!categoryId || !amount) throw new ApiError('کتگوری و مبلغ مصرف را کامل کنید');
      const created = await db.expense.create({
        data: {
          categoryId,
          amount,
          date: str(body.date) || new Date().toISOString().slice(0, 10),
          note: str(body.note) || null,
          clientToken: str(body.clientToken).slice(0, 64) || null,
        },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-salary') {
      const teacherId = str(body.teacherId);
      const month = str(body.month);
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!teacherId || !month || !amount) throw new ApiError('کارمند، ماه و مبلغ معاش را کامل کنید');
      const existing = await db.salaryPayment.findFirst({ where: { teacherId, month } });
      if (existing) {
        await db.salaryPayment.update({
          where: { id: existing.id },
          data: { amount, status: str(body.status) === 'PENDING' ? 'PENDING' : 'PAID', paidAt: str(body.paidAt) || new Date().toISOString().slice(0, 10) },
        });
        return NextResponse.json({ id: existing.id });
      }
      const created = await db.salaryPayment.create({
        data: {
          teacherId,
          month,
          amount,
          status: str(body.status) === 'PENDING' ? 'PENDING' : 'PAID',
          paidAt: str(body.paidAt) || new Date().toISOString().slice(0, 10),
          clientToken: str(body.clientToken).slice(0, 64) || null,
        },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'delete-category') {
      await db.expenseCategory.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete-expense') {
      await db.expense.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete-salary') {
      await db.salaryPayment.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
