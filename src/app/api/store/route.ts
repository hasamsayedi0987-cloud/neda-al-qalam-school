import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * فروشات کتاب‌ها و یونیفورم به متعلمین — نسخهٔ ۳.۳.۰
 * خریداری از بازار، فروش به شاگرد، انبار و گذارش عواید/مفاد-نقص
 */

export async function GET(req: NextRequest) {
  try {
    await requireSection('store');
    const kind = str(req.nextUrl.searchParams.get('kind')) || '';

    const where = kind === 'BOOK' || kind === 'UNIFORM' ? { kind } : {};
    const items = await db.storeItem.findMany({
      where,
      include: { purchases: true, sales: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });

    // گذارش مفاد و نقص: عواید فروش − قیمت خریداریِ جنسِ فروش‌شده − مصارف خریداریِ باقی‌ماندهٔ جنس فروخته‌شده
    const report = {
      revenue: 0, // عواید فروشات
      cost: 0, // بهای تمام‌شدهٔ جنس فروخته‌شده
      profit: 0, // مفاد صافی
      soldQty: 0,
      purchasedQty: 0,
      purchasedCost: 0, // کل خریداری از بازار
      perItem: [] as Array<{ id: string; name: string; kind: string; soldQty: number; revenue: number; cost: number; profit: number; stock: number }>,
    };
    for (const it of items) {
      const soldQty = it.sales.reduce((a, s) => a + s.qty, 0);
      const revenue = it.sales.reduce((a, s) => a + s.qty * s.unitPrice - (s.discount || 0), 0);
      const cost = soldQty * it.buyPrice;
      report.revenue += revenue;
      report.cost += cost;
      report.soldQty += soldQty;
      report.purchasedQty += it.purchases.reduce((a, p) => a + p.qty, 0);
      report.purchasedCost += it.purchases.reduce((a, p) => a + p.qty * p.unitCost, 0);
      report.perItem.push({
        id: it.id, name: it.name, kind: it.kind,
        soldQty, revenue: Math.round(revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        profit: Math.round((revenue - cost) * 100) / 100,
        stock: it.stock,
      });
    }
    report.profit = Math.round((report.revenue - report.cost) * 100) / 100;

    return NextResponse.json({ items, report });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('store');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'save-item') {
      const name = str(body.name);
      if (!name) throw new ApiError('نام جنس را بنویسید');
      const data = {
        name,
        kind: str(body.kind) === 'UNIFORM' ? 'UNIFORM' : 'BOOK',
        size: str(body.size) || null,
        buyPrice: Math.max(0, Number(body.buyPrice) || 0),
        sellPrice: Math.max(0, Number(body.sellPrice) || 0),
        stock: Math.max(0, Math.round(Number(body.stock) || 0)),
        clientToken: str(body.clientToken).slice(0, 64) || null,
      };
      if (body.id) {
        await db.storeItem.update({ where: { id: str(body.id) }, data });
        return NextResponse.json({ ok: true });
      }
      const created = await db.storeItem.create({ data });
      return NextResponse.json({ id: created.id });
    }

    if (action === 'save-purchase') {
      const itemId = str(body.itemId);
      const qty = Math.max(1, Math.round(Number(body.qty) || 0));
      const unitCost = Math.max(0, Number(body.unitCost) || 0);
      if (!itemId || !qty || !unitCost) throw new ApiError('جنس، تعداد و قیمت خریداری را کامل کنید');
      const item = await db.storeItem.findUnique({ where: { id: itemId } });
      if (!item) throw new ApiError('جنس یافت نشد');
      const [purchase] = await db.$transaction([
        db.storePurchase.create({
          data: { itemId, qty, unitCost, date: str(body.date) || new Date().toISOString().slice(0, 10), note: str(body.note) || null, clientToken: str(body.clientToken).slice(0, 64) || null },
        }),
        db.storeItem.update({ where: { id: itemId }, data: { stock: item.stock + qty, buyPrice: unitCost || item.buyPrice } }),
      ]);
      return NextResponse.json({ id: purchase.id });
    }

    if (action === 'save-sale') {
      const itemId = str(body.itemId);
      const qty = Math.max(1, Math.round(Number(body.qty) || 0));
      const unitPrice = Math.max(0, Number(body.unitPrice) || 0);
      if (!itemId || !qty || !unitPrice) throw new ApiError('جنس، تعداد و قیمت فروش را کامل کنید');
      const item = await db.storeItem.findUnique({ where: { id: itemId } });
      if (!item) throw new ApiError('جنس یافت نشد');
      if (item.stock < qty) throw new ApiError(`انبار کافی نیست — موجودی فعلی: ${item.stock}`);
      const studentId = str(body.studentId) || null;
      const [sale] = await db.$transaction([
        db.storeSale.create({
          data: { itemId, studentId, qty, unitPrice, discount: Math.max(0, Number(body.discount) || 0), date: str(body.date) || new Date().toISOString().slice(0, 10), clientToken: str(body.clientToken).slice(0, 64) || null },
        }),
        db.storeItem.update({ where: { id: itemId }, data: { stock: item.stock - qty } }),
      ]);
      return NextResponse.json({ id: sale.id });
    }

    if (action === 'delete-item') {
      await db.storeItem.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
