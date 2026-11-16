'use client';

/**
 * خزانه — دخل، تجری، بیلانس و تسلیمی پول فیس به صاحب مکتب با رسید — نسخهٔ ۳.۳.۰
 * عواید (فیس + فروشات + ترانسپورت) در یک طرف، مصارف و معاشات در طرف دیگر،
 * مفاد صافی ماهانه به‌صورت اتوماتیک جور می‌شود.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { printDocument, exportExcel } from '@/lib/client/exports';
import { isoToday, toPersianDigits } from '@/lib/jalali';
import { Landmark, ArrowDownToLine, ArrowUpFromLine, HandCoins, Plus, Trash2, Printer, Scale } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

interface HandoverRow { id: string; amount: number; date: string; receiptNo: string | null; note: string | null; }
interface TreasuryRow { id: string; type: string; source: string | null; amount: number; date: string; note: string | null; }
interface TreasuryData {
  income: { fees: number; store: number; transport: number; manualIn: number; total: number };
  outcome: { expenses: number; salaries: number; transportExpenses: number; purchases: number; manualOut: number; total: number };
  handovers: HandoverRow[];
  handoverTotal: number;
  balance: number;
  profit: number;
  expensesByCategory: Array<{ name: string; total: number }>;
  manual: TreasuryRow[];
}

const afn = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US'));

export function TreasuryView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<TreasuryData | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [hAmount, setHAmount] = useState('');
  const [hReceipt, setHReceipt] = useState('');
  const [hNote, setHNote] = useState('');
  const [txOpen, setTxOpen] = useState(false);
  const [txType, setTxType] = useState('DAKHIL');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER';

  const load = useCallback(() => {
    apiGet<TreasuryData>('/api/treasury').then(setData).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (payload: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string }>('/api/treasury', 'POST', payload);
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

  const printHandoverReceipt = (h: HandoverRow) => {
    printDocument(`رسید تسلیمی پول ${h.receiptNo || ''}`, `
      <div style="text-align:center;border:2px solid #333;padding:14px;max-width:520px;margin:0 auto">
        <h2>رسید تسلیمی پول به صاحب مکتب</h2>
        <p style="font-size:18px">نمبر رسید: <b>${h.receiptNo || toPersianDigits(h.id.slice(-6))}</b></p>
        <p style="font-size:20px;margin:18px 0">مبلغ: <b>${afn(h.amount)} افغانی</b></p>
        <p>تاریخ: ${h.date}${h.note ? ` — ${h.note}` : ''}</p>
        <div style="display:flex;justify-content:space-between;margin-top:44px;font-size:14px">
          <span>امضای تحویل‌دهندهٔ خزانه: ………………</span>
          <span>امضای صاحب مکتب: ………………</span>
        </div>
      </div>
    `);
  };

  const printSummary = () => {
    if (!data) return;
    printDocument('بیلانس خزانه', `
      <h2 style="text-align:center">گذارش مفاد و نقص — بیلانس خزانه</h2>
      <h3>عواید کلی</h3>
      <ul>
        <li>فیس متعلمین: ${afn(data.income.fees)} افغانی</li>
        <li>فروشات کتاب و یونیفورم: ${afn(data.income.store)} افغانی</li>
        <li>ترانسپورت: ${afn(data.income.transport)} افغانی</li>
        <li>سایر دخل: ${afn(data.income.manualIn)} افغانی</li>
        <li><b>جملهٔ عواید: ${afn(data.income.total)} افغانی</b></li>
      </ul>
      <h3>مصارف کلی</h3>
      <ul>
        <li>مصارفات: ${afn(data.outcome.expenses)} افغانی</li>
        <li>معاشات: ${afn(data.outcome.salaries)} افغانی</li>
        <li>مصارف ترانسپورت: ${afn(data.outcome.transportExpenses)} افغانی</li>
        <li>خریداری جنس: ${afn(data.outcome.purchases)} افغانی</li>
        <li>سایر تجری: ${afn(data.outcome.manualOut)} افغانی</li>
        <li><b>جملهٔ مصارف: ${afn(data.outcome.total)} افغانی</b></li>
      </ul>
      <p style="font-size:18px"><b>مفاد صافی (عواید − مصارف): ${afn(data.profit)} افغانی</b></p>
      <p><b>تسلیمی‌شده به صاحب مکتب: ${afn(data.handoverTotal)} افغانی | ماندهٔ خزانه: ${afn(data.balance)} افغانی</b></p>
      <h3>مصارف به اساس کتگوری</h3>
      <table border="1" style="width:60%;border-collapse:collapse">${data.expensesByCategory.map((c) => `<tr><td>${c.name}</td><td>${afn(c.total)}</td></tr>`).join('')}</table>
    `);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Landmark className="h-6 w-6 text-emerald-600" />
        <h1 className="text-xl font-bold">خزانه — دخل، تجری و تسلیمی پول</h1>
        {canWrite && (
          <>
            <Button onClick={() => setHandoverOpen(true)} className="gap-1"><HandCoins className="h-4 w-4" /> تسلیمی به صاحب مکتب</Button>
            <Button variant="outline" onClick={() => setTxOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> دخل/تجری دستوی</Button>
          </>
        )}
        <Button variant="outline" onClick={printSummary} className="ms-auto gap-1"><Printer className="h-4 w-4" /> چاپ بیلانس</Button>
        <Button variant="outline" onClick={() => exportExcel('بیلانس خزانه', document.querySelector('[data-treasury-table]')?.outerHTML || '', 'بیلانس-خزانه')} className="hidden sm:inline-flex"><Scale className="h-4 w-4" /> اکسل</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-emerald-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground flex items-center gap-1"><ArrowDownToLine className="h-4 w-4" /> جملهٔ عواید (دخل)</p><p className="text-2xl font-bold text-emerald-700">{afn(data?.income.total || 0)}</p><p className="text-xs text-muted-foreground mt-1">فیس {afn(data?.income.fees || 0)} | فروشات {afn(data?.income.store || 0)} | ترانسپورت {afn(data?.income.transport || 0)}</p></CardContent></Card>
        <Card className="border-red-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground flex items-center gap-1"><ArrowUpFromLine className="h-4 w-4" /> جملهٔ مصارف (تجری)</p><p className="text-2xl font-bold text-red-700">{afn(data?.outcome.total || 0)}</p><p className="text-xs text-muted-foreground mt-1">مصارفات {afn(data?.outcome.expenses || 0)} | معاشات {afn(data?.outcome.salaries || 0)} | ترانسپورت {afn(data?.outcome.transportExpenses || 0)}</p></CardContent></Card>
        <Card className="border-sky-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">مفاد صافی (اتوماتیک)</p><p className="text-2xl font-bold text-sky-700">{afn(data?.profit || 0)} افغانی</p></CardContent></Card>
        <Card className="border-violet-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">ماندهٔ خزانه پس از تسلیمی</p><p className="text-2xl font-bold text-violet-700">{afn(data?.balance || 0)}</p><p className="text-xs text-muted-foreground mt-1">تسلیمی‌شده: {afn(data?.handoverTotal || 0)}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>تسلیمی پول به صاحب مکتب — با رسید</CardTitle></CardHeader>
          <CardContent className="space-y-2" data-treasury-table>
            {data?.handovers.map((h) => (
              <div key={h.id} className="flex items-center gap-2 border-b pb-2">
                <Badge variant="outline">{h.receiptNo || 'بدون نمبر'}</Badge>
                <span className="font-bold">{afn(h.amount)} افغانی</span>
                <span className="text-muted-foreground text-sm">{h.date} {h.note ? `— ${h.note}` : ''}</span>
                <div className="ms-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => printHandoverReceipt(h)}>چاپ رسید</Button>
                  {canWrite && <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete-handover', id: h.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                </div>
              </div>
            ))}
            {(data?.handovers.length || 0) === 0 && <p className="text-muted-foreground p-3">هنوز پولی تسلیم نشده است</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>مصارف به اساس کتگوری + دخل/تجری دستوی</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data?.expensesByCategory.map((c) => (
              <div key={c.name} className="flex justify-between border-b pb-1">
                <span>{c.name}</span><span className="font-bold">{afn(c.total)} افغانی</span>
              </div>
            ))}
            {(data?.expensesByCategory.length || 0) === 0 && <p className="text-muted-foreground">مصرفی ثبت نشده است</p>}
            {data?.manual.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm border-t pt-1">
                <Badge className={t.type === 'DAKHIL' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>{t.type === 'DAKHIL' ? 'دخل دستوی' : 'تجری دستوی'}</Badge>
                <span>{afn(t.amount)} افغانی</span>
                <span className="text-muted-foreground">{t.date} {t.note ? `— ${t.note}` : ''}</span>
                {canWrite && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => send({ action: 'delete-transaction', id: t.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* تسلیمی */}
      <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسلیمی پول فیس به صاحب مکتب</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>مبلغ (افغانی)</Label><Input dir="ltr" type="number" value={hAmount} onChange={(e) => setHAmount(e.target.value)} /></div>
              <div><Label>نمبر رسید</Label><Input value={hReceipt} onChange={(e) => setHReceipt(e.target.value)} /></div>
            </div>
            <div><Label>توضیح</Label><Input value={hNote} onChange={(e) => setHNote(e.target.value)} /></div>
            <Button disabled={saving || !hAmount} onClick={async () => { await send({ action: 'save-handover', amount: Number(hAmount), date: isoToday(), receiptNo: hReceipt, note: hNote }, 'تسلیمی ثبت شد — رسید قابل چاپ است'); setHandoverOpen(false); setHAmount(''); setHReceipt(''); setHNote(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* دخل/تجری دستوی */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>دخل یا تجری دستوی</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>نوع</Label>
              <div className="flex gap-2">
                <Button variant={txType === 'DAKHIL' ? 'default' : 'outline'} onClick={() => setTxType('DAKHIL')}>دخل</Button>
                <Button variant={txType === 'TAKHRIJ' ? 'destructive' : 'outline'} onClick={() => setTxType('TAKHRIJ')}>تجری</Button>
              </div>
            </div>
            <div><Label>مبلغ (افغانی)</Label><Input dir="ltr" type="number" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} /></div>
            <div><Label>توضیح</Label><Input value={txNote} onChange={(e) => setTxNote(e.target.value)} /></div>
            <Button disabled={saving || !txAmount} onClick={async () => { await send({ action: 'save-transaction', type: txType, amount: Number(txAmount), note: txNote, date: isoToday() }, 'ثبت شد'); setTxOpen(false); setTxAmount(''); setTxNote(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
