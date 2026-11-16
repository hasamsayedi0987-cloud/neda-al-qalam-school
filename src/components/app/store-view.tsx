'use client';

/**
 * فروشات کتاب‌ها و یونیفورم به متعلمین — نسخهٔ ۳.۳.۰
 * خریداری از بازار، فروش به شاگرد، انبار و گذارش عواید/مفاد-نقص
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { exportExcel, printDocument } from '@/lib/client/exports';
import { isoToday, toPersianDigits } from '@/lib/jalali';
import { ShoppingCart, PackagePlus, PackageMinus, Trash2, BookOpen, Shirt } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

interface StoreItemRow {
  id: string; name: string; kind: string; size: string | null;
  buyPrice: number; sellPrice: number; stock: number;
  purchases: Array<{ qty: number; unitCost: number }>;
  sales: Array<{ qty: number; unitPrice: number; discount: number }>;
}
interface StoreReport {
  revenue: number; cost: number; profit: number; soldQty: number;
  purchasedQty: number; purchasedCost: number;
  perItem: Array<{ id: string; name: string; kind: string; soldQty: number; revenue: number; cost: number; profit: number; stock: number }>;
}
interface StoreStudent { id: string; firstName: string; lastName: string | null; className: string | null; }

const afn = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US'));

export function StoreView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<'BOOK' | 'UNIFORM'>('BOOK');
  const [items, setItems] = useState<StoreItemRow[]>([]);
  const [report, setReport] = useState<StoreReport | null>(null);
  const [students, setStudents] = useState<StoreStudent[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemSize, setItemSize] = useState('');
  const [itemBuy, setItemBuy] = useState('');
  const [itemSell, setItemSell] = useState('');
  const [itemStock, setItemStock] = useState('');
  const [purchaseFor, setPurchaseFor] = useState<StoreItemRow | null>(null);
  const [pQty, setPQty] = useState('');
  const [pCost, setPCost] = useState('');
  const [saleFor, setSaleFor] = useState<StoreItemRow | null>(null);
  const [sQty, setSQty] = useState('1');
  const [sPrice, setSPrice] = useState('');
  const [sStudent, setSStudent] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER' || user.role === 'LIBRARIAN';

  const load = useCallback(() => {
    apiGet<{ items: StoreItemRow[]; report: StoreReport }>(`/api/store?kind=${kind}`)
      .then((d) => { setItems(d.items); setReport(d.report); })
      .catch(() => {});
    apiGet<{ students: StoreStudent[] }>('/api/students').then((d) => setStudents(d.students)).catch(() => {});
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => items, [items]);

  const send = async (payload: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string }>('/api/store', 'POST', payload);
      if (res.error) {
        toast({ title: 'خطا', description: res.error.slice(0, 140), variant: 'destructive' });
        return;
      }
      toast({ title: okMsg, description: res.data?.note });
      load();
    } catch (err) {
      toast({ title: 'خطا', description: String(err).slice(0, 140), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const printReport = () => {
    if (!report) return;
    const rows = report.perItem.map((r, i) => `<tr><td>${toPersianDigits(i + 1)}</td><td>${r.name}</td><td>${r.kind === 'BOOK' ? 'کتاب' : 'یونیفورم'}</td><td>${toPersianDigits(r.soldQty)}</td><td>${afn(r.revenue)}</td><td>${afn(r.cost)}</td><td>${afn(r.profit)}</td><td>${toPersianDigits(r.stock)}</td></tr>`).join('');
    printDocument('گذارش فروشات', `
      <h2 style="text-align:center">گذارش ${kind === 'BOOK' ? 'فروشات کتاب‌های درسی' : 'فروشات یونیفورم'}</h2>
      <p>عواید فروشات: ${afn(report.revenue)} افغانی | بهای تمام‌شدهٔ فروخته‌شده: ${afn(report.cost)} | <b>مفاد صافی: ${afn(report.profit)} افغانی</b></p>
      <p>خریداری از بازار: ${toPersianDigits(report.purchasedQty)} عدد به ارزش ${afn(report.purchasedCost)} افغانی | فروش: ${toPersianDigits(report.soldQty)} عدد</p>
      <table border="1" style="width:100%;border-collapse:collapse"><tr><th>شماره</th><th>جنس</th><th>نوع</th><th>فروش</th><th>عواید</th><th>بهای تمام‌شده</th><th>مفاد</th><th>انبار</th></tr>${rows}</table>
    `);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-emerald-600" />
        <h1 className="text-xl font-bold">فروشات کتاب‌ها و یونیفورم</h1>
        {canWrite && (
          <Button onClick={() => { setItemName(''); setItemSize(''); setItemBuy(''); setItemSell(''); setItemStock(''); setItemOpen(true); }} className="gap-1">
            {kind === 'BOOK' ? <BookOpen className="h-4 w-4" /> : <Shirt className="h-4 w-4" />} جنس جدید
          </Button>
        )}
        <Button variant="outline" onClick={printReport} className="ms-auto">چاپ گذارش</Button>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as 'BOOK' | 'UNIFORM')}>
        <TabsList>
          <TabsTrigger value="BOOK" className="gap-1"><BookOpen className="h-4 w-4" /> کتاب‌های درسی</TabsTrigger>
          <TabsTrigger value="UNIFORM" className="gap-1"><Shirt className="h-4 w-4" /> یونیفورم</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-emerald-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">عواید فروشات</p><p className="text-2xl font-bold text-emerald-700">{afn(report?.revenue || 0)}</p></CardContent></Card>
        <Card className="border-amber-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">بهای تمام‌شدهٔ فروش</p><p className="text-2xl font-bold text-amber-700">{afn(report?.cost || 0)}</p></CardContent></Card>
        <Card className="border-sky-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">مفاد صافی</p><p className="text-2xl font-bold text-sky-700">{afn(report?.profit || 0)}</p></CardContent></Card>
        <Card className="border-violet-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">خریداری از بازار</p><p className="text-2xl font-bold text-violet-700">{afn(report?.purchasedCost || 0)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>جنس‌ها — انبار و فروش</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b"><th className="p-2 text-start">جنس</th><th className="p-2 text-start">سایز</th><th className="p-2 text-start">خریداری</th><th className="p-2 text-start">فروش</th><th className="p-2 text-start">انبار</th><th className="p-2 text-start">فروش کل</th><th className="p-2"></th></tr></thead>
            <tbody>
              {shown.map((it) => {
                const sold = it.sales.reduce((a, s) => a + s.qty, 0);
                return (
                  <tr key={it.id} className="border-b">
                    <td className="p-2 font-medium">{it.name}</td>
                    <td className="p-2">{it.size || '—'}</td>
                    <td className="p-2">{afn(it.buyPrice)}</td>
                    <td className="p-2">{afn(it.sellPrice)}</td>
                    <td className="p-2">{it.stock === 0 ? <Badge variant="destructive">تمام شد</Badge> : <Badge variant="outline">{toPersianDigits(it.stock)}</Badge>}</td>
                    <td className="p-2">{toPersianDigits(sold)} عدد</td>
                    <td className="p-2">
                      {canWrite && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPurchaseFor(it); setPQty('10'); setPCost(String(it.buyPrice || '')); }}><PackagePlus className="h-3 w-3" /> خریداری</Button>
                          <Button size="sm" variant="outline" className="gap-1" disabled={it.stock === 0} onClick={() => { setSaleFor(it); setSQty('1'); setSPrice(String(it.sellPrice || '')); setSStudent(''); }}><PackageMinus className="h-3 w-3" /> فروش</Button>
                          <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete-item', id: it.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">هنوز جنسی ثبت نشده است</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* جنس جدید */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{kind === 'BOOK' ? 'کتاب درسی جدید' : 'یونیفورم جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>نام {kind === 'BOOK' ? 'کتاب' : 'یونیفورم'}</Label><Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={kind === 'BOOK' ? 'مثال: ریاضی صنف هفتم' : 'مثال: پیراهن‌وتنبان — سایز ۳۰'} /></div>
            {kind === 'UNIFORM' && <div><Label>سایز</Label><Input value={itemSize} onChange={(e) => setItemSize(e.target.value)} /></div>}
            <div className="grid grid-cols-3 gap-2">
              <div><Label>قیمت خریداری</Label><Input dir="ltr" type="number" value={itemBuy} onChange={(e) => setItemBuy(e.target.value)} /></div>
              <div><Label>قیمت فروش</Label><Input dir="ltr" type="number" value={itemSell} onChange={(e) => setItemSell(e.target.value)} /></div>
              <div><Label>موجودی اولیه</Label><Input dir="ltr" type="number" value={itemStock} onChange={(e) => setItemStock(e.target.value)} /></div>
            </div>
            <Button disabled={saving || !itemName} onClick={async () => { await send({ action: 'save-item', name: itemName, kind, size: itemSize, buyPrice: Number(itemBuy), sellPrice: Number(itemSell), stock: Number(itemStock) }, 'جنس ثبت شد'); setItemOpen(false); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* خریداری از بازار */}
      <Dialog open={!!purchaseFor} onOpenChange={(o) => !o && setPurchaseFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>خریداری از بازار — {purchaseFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>تعداد</Label><Input dir="ltr" type="number" value={pQty} onChange={(e) => setPQty(e.target.value)} /></div>
              <div><Label>قیمت واحد (افغانی)</Label><Input dir="ltr" type="number" value={pCost} onChange={(e) => setPCost(e.target.value)} /></div>
            </div>
            <Button disabled={saving} onClick={async () => { await send({ action: 'save-purchase', itemId: purchaseFor?.id, qty: Number(pQty), unitCost: Number(pCost), date: isoToday() }, 'خریداری ثبت شد و انبار پر شد'); setPurchaseFor(null); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* فروش به متعلم */}
      <Dialog open={!!saleFor} onOpenChange={(o) => !o && setSaleFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>فروش به متعلم — {saleFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>تعداد</Label><Input dir="ltr" type="number" value={sQty} onChange={(e) => setSQty(e.target.value)} /></div>
              <div><Label>قیمت واحد (افغانی)</Label><Input dir="ltr" type="number" value={sPrice} onChange={(e) => setSPrice(e.target.value)} /></div>
            </div>
            <div><Label>متعلم (اختیاری)</Label>
              <Select value={sStudent} onValueChange={setSStudent}>
                <SelectTrigger><SelectValue placeholder="بدون نام" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none">بدون نام</SelectItem>
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName || ''} — {s.className || 'بی‌صنف'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={saving} onClick={async () => { await send({ action: 'save-sale', itemId: saleFor?.id, studentId: sStudent === '__none' ? '' : sStudent, qty: Number(sQty), unitPrice: Number(sPrice), date: isoToday() }, 'فروش ثبت شد'); setSaleFor(null); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
