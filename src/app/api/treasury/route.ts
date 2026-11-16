import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * خزانه — دخل، تجری، بیلانس و تسلیمی پول فیس به صاحب مکتب با رسید — نسخهٔ ۳.۳.۰
 * دخل = وصولی فیس + عواید فروشات + عواید ترانسپورت + دخل دستوی
 * تجری = مصارفات + معاشات + مصارف ترانسپورت + تجری دستوی
 * تسلیمی = بردگی پول از خزانه به صاحب مکتب با رسید (از بیلانس کم می‌شود)
 */

export async function GET(req: NextRequest) {
  try {
    await requireSection('treasury');

    const [feePayments, storeSales, transportPayments, expenses, salaries, transportExpenses, storePurchases, handovers, manual] =
      await Promise.all([
        db.feePayment.findMany({ select: { amount: true, paidAt: true, method: true } }),
        db.storeSale.findMany({ select: { qty: true, unitPrice: true, discount: true, date: true } }),
        db.transportPayment.findMany({ select: { amount: true, paidAt: true } }),
        db.expense.findMany({ include: { category: { select: { name: true } } } }),
        db.salaryPayment.findMany({ include: { teacher: { select: { name: true } } } }),
        db.transportExpense.findMany(),
        db.storePurchase.findMany({ include: { item: { select: { name: true, kind: true } } } }),
        db.moneyHandover.findMany({ orderBy: { date: 'desc' } }),
        db.treasuryTransaction.findMany({ orderBy: { date: 'desc' }, take: 300 }),
      ]);

    const income = {
      fees: feePayments.reduce((a, p) => a + p.amount, 0),
      store: storeSales.reduce((a, s) => a + s.qty * s.unitPrice - (s.discount || 0), 0),
      transport: transportPayments.reduce((a, p) => a + p.amount, 0),
      manualIn: manual.filter((t) => t.type === 'DAKHIL').reduce((a, t) => a + t.amount, 0),
    };
    const outcome = {
      expenses: expenses.reduce((a, e) => a + e.amount, 0),
      salaries: salaries.reduce((a, s) => a + s.amount, 0),
      transportExpenses: transportExpenses.reduce((a, e) => a + e.amount, 0),
      purchases: storePurchases.reduce((a, p) => a + p.qty * p.unitCost, 0),
      manualOut: manual.filter((t) => t.type === 'TAKHRIJ').reduce((a, t) => a + t.amount, 0),
    };
    const handoverTotal = handovers.reduce((a, h) => a + h.amount, 0);
    const totalIn = Object.values(income).reduce((a, b) => a + b, 0);
    const totalOut = Object.values(outcome).reduce((a, b) => a + b, 0);

    // مصارفات به اساس کتگوری
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      const k = e.category?.name || 'دیگر';
      byCategory.set(k, (byCategory.get(k) || 0) + e.amount);
    }

    return NextResponse.json({
      income: { ...income, total: Math.round(totalIn * 100) / 100 },
      outcome: { ...outcome, total: Math.round(totalOut * 100) / 100 },
      handovers,
      handoverTotal,
      balance: Math.round((totalIn - totalOut - handoverTotal) * 100) / 100, // ماندهٔ خزانه پس از تسلیمی‌ها
      profit: Math.round((totalIn - totalOut) * 100) / 100, // مفاد صافی قبل از تسلیمی
      expensesByCategory: Array.from(byCategory.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
      manual,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('treasury');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'save-handover') {
      // تسلیمی پول از خزانه به صاحب مکتب — با نمبر رسید
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!amount) throw new ApiError('مبلغ تسلیمی را بنویسید');
      const created = await db.moneyHandover.create({
        data: {
          amount,
          date: str(body.date) || new Date().toISOString().slice(0, 10),
          receiptNo: str(body.receiptNo) || null,
          note: str(body.note) || null,
          clientToken: str(body.clientToken).slice(0, 64) || null,
        },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-transaction') {
      // دخل/تجری دستوی (سایر منابع)
      const type = str(body.type) === 'DAKHIL' ? 'DAKHIL' : 'TAKHRIJ';
      const amount = Math.max(0, Number(body.amount) || 0);
      if (!amount) throw new ApiError('مبلغ را بنویسید');
      const created = await db.treasuryTransaction.create({
        data: {
          type,
          source: 'OTHER',
          amount,
          date: str(body.date) || new Date().toISOString().slice(0, 10),
          note: str(body.note) || null,
        },
      });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'delete-handover') {
      await db.moneyHandover.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete-transaction') {
      await db.treasuryTransaction.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
