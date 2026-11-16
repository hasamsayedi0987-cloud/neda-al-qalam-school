'use client';

/**
 * مصارفات با کتگوری + معاشات کارمندان — نسخهٔ ۳.۳.۰
 * ثبت کتگوری و مصارفات، راپور به اساس کتگوری، فلتر تاریخ، معاشات ماهانه
 */

import { useCallback, useEffect, useState } from 'react';
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
import { afghanMonths, gregorianToJalali, isoToday, toPersianDigits } from '@/lib/jalali';
import { ReceiptText, Plus, Trash2, Printer } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

interface CategoryRow { id: string; name: string; _count: { expenses: number }; }
interface ExpenseRow { id: string; categoryId: string; amount: number; date: string; note: string | null; category?: { name: string }; }
interface SalaryRow { id: string; teacherId: string; month: string; amount: number; status: string; paidAt: string | null; teacher?: { name: string; position: string }; }
interface TeacherRow { id: string; name: string; position: string; }
interface ExpensesData {
  categories: CategoryRow[];
  expenses: ExpenseRow[];
  salaries: SalaryRow[];
  teachers: TeacherRow[];
  totals: { expenses: number; salaries: number };
  byCategory: Array<{ name: string; total: number }>;
}

const afn = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US'));

export function ExpensesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [tab, setTab] = useState('expenses');
  const [data, setData] = useState<ExpensesData | null>(null);
  const nowJ = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [expOpen, setExpOpen] = useState(false);
  const [expCat, setExpCat] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(isoToday());
  const [expNote, setExpNote] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(`${nowJ.jy}-${String(nowJ.jm).padStart(2, '0')}`);
  const [salOpen, setSalOpen] = useState(false);
  const [salTeacher, setSalTeacher] = useState('');
  const [salAmount, setSalAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER';

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (tab === 'expenses') {
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      if (catFilter !== 'all') q.set('categoryId', catFilter);
    } else {
      q.set('month', salaryMonth);
    }
    apiGet<ExpensesData>(`/api/expenses?${q.toString()}`).then(setData).catch(() => {});
  }, [tab, from, to, catFilter, salaryMonth]);

  useEffect(() => { load(); }, [load]);

  const send = async (payload: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string }>('/api/expenses', 'POST', payload);
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

  const printExpenses = () => {
    const rows = (data?.expenses || []).map((e, i) => `<tr><td>${toPersianDigits(i + 1)}</td><td>${e.date}</td><td>${e.category?.name || '—'}</td><td>${afn(e.amount)}</td><td>${e.note || '—'}</td></tr>`).join('');
    printDocument('راپور مصارفات', `
      <h2 style="text-align:center">راپور مصارفات${from || to ? ` (${from || '…'} الی ${to || '…'})` : ''}</h2>
      <p><b>جملهٔ مصارفات: ${afn(data?.totals.expenses || 0)} افغانی</b></p>
      <table border="1" style="width:100%;border-collapse:collapse"><tr><th>شماره</th><th>تاریخ</th><th>کتگوری</th><th>مبلغ</th><th>توضیح</th></tr>${rows}</table>
    `);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ReceiptText className="h-6 w-6 text-emerald-600" />
        <h1 className="text-xl font-bold">مصارفات و معاشات</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="expenses">مصارفات</TabsTrigger>
            <TabsTrigger value="salaries">معاشات</TabsTrigger>
          </TabsList>
        </Tabs>
        {canWrite && (
          <Button onClick={tab === 'expenses' ? () => setExpOpen(true) : () => setSalOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> {tab === 'expenses' ? 'ثبت مصرف' : 'ثبت معاش'}</Button>
        )}
        {tab === 'expenses' && (
          <div className="ms-auto flex gap-2">
            <Button variant="outline" onClick={printExpenses} className="gap-1"><Printer className="h-4 w-4" /> چاپ</Button>
            <Button variant="outline" onClick={() => exportExcel('مصارفات', document.querySelector('[data-expenses-table]')?.outerHTML || '', `مصارفات-${from || ''}`)} className="hidden sm:inline-flex">اکسل</Button>
            {canWrite && <Button variant="outline" onClick={() => setCatOpen(true)}>کتگوری جدید</Button>}
          </div>
        )}
      </div>

      {tab === 'expenses' && (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label>از تاریخ</Label><Input dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>الی تاریخ</Label><Input dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="w-48"><Label>کتگوری</Label>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ کتگوری‌ها</SelectItem>
                  {(data?.categories || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>مصارفات — جمله: {afn(data?.totals.expenses || 0)} افغانی</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto" data-expenses-table>
                <table className="w-full text-sm">
                  <thead><tr className="text-muted-foreground border-b"><th className="p-2 text-start">تاریخ</th><th className="p-2 text-start">کتگوری</th><th className="p-2 text-start">مبلغ</th><th className="p-2 text-start">توضیح</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {(data?.expenses || []).map((e) => (
                      <tr key={e.id} className="border-b">
                        <td className="p-2">{e.date}</td>
                        <td className="p-2"><Badge variant="outline">{e.category?.name || '—'}</Badge></td>
                        <td className="p-2 font-bold">{afn(e.amount)}</td>
                        <td className="p-2">{e.note || '—'}</td>
                        <td className="p-2">{canWrite && <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete-expense', id: e.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</td>
                      </tr>
                    ))}
                    {(data?.expenses.length || 0) === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">مصرفی در این فلتر یافت نشد</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>به اساس کتگوری</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(data?.byCategory || []).map((c) => (
                  <div key={c.name} className="flex justify-between border-b pb-1"><span>{c.name}</span><span className="font-bold">{afn(c.total)}</span></div>
                ))}
                {(data?.byCategory.length || 0) === 0 && <p className="text-muted-foreground">داده نیست</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {tab === 'salaries' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>معاشات ماهانه — جملهٔ ماه: {afn(data?.totals.salaries || 0)} افغانی</CardTitle>
            <div className="w-40">
              <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => `${nowJ.jy}-${String(i + 1).padStart(2, '0')}`).map((m, i) => <SelectItem key={m} value={m}>{afghanMonths[i]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground border-b"><th className="p-2 text-start">کارمند</th><th className="p-2 text-start">وظیفه</th><th className="p-2 text-start">ماه</th><th className="p-2 text-start">مبلغ</th><th className="p-2 text-start">وضعیت</th><th className="p-2"></th></tr></thead>
              <tbody>
                {(data?.salaries || []).map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="p-2">{s.teacher?.name || '—'}</td>
                    <td className="p-2">{s.teacher?.position || '—'}</td>
                    <td className="p-2">{s.month}</td>
                    <td className="p-2 font-bold">{afn(s.amount)}</td>
                    <td className="p-2">{s.status === 'PAID' ? <Badge className="bg-emerald-600 text-white">پرداخت شد</Badge> : <Badge variant="outline">انتظار</Badge>}</td>
                    <td className="p-2">{canWrite && <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete-salary', id: s.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</td>
                  </tr>
                ))}
                {(data?.salaries.length || 0) === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">معاشی برای این ماه ثبت نشده است</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* کتگوری */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>کتگوری مصارفات جدید</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>نام کتگوری</Label><Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="مثال: تیل و برق، تجهیزات، تعمیر…" /></div>
            <Button disabled={saving || !catName} onClick={async () => { await send({ action: 'save-category', name: catName }, 'کتگوری ثبت شد'); setCatOpen(false); setCatName(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مصرف */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ثبت مصرف</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>کتگوری</Label>
              <Select value={expCat} onValueChange={setExpCat}>
                <SelectTrigger><SelectValue placeholder="انتخاب کتگوری" /></SelectTrigger>
                <SelectContent>{(data?.categories || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>مبلغ (افغانی)</Label><Input dir="ltr" type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} /></div>
              <div><Label>تاریخ</Label><Input dir="ltr" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></div>
            </div>
            <div><Label>توضیح</Label><Input value={expNote} onChange={(e) => setExpNote(e.target.value)} /></div>
            <Button disabled={saving || !expCat || !expAmount} onClick={async () => { await send({ action: 'save-expense', categoryId: expCat, amount: Number(expAmount), date: expDate, note: expNote }, 'مصرف ثبت شد'); setExpOpen(false); setExpAmount(''); setExpNote(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* معاش */}
      <Dialog open={salOpen} onOpenChange={setSalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ثبت معاش کارمند — ماه {salaryMonth}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>کارمند</Label>
              <Select value={salTeacher} onValueChange={setSalTeacher}>
                <SelectTrigger><SelectValue placeholder="انتخاب کارمند" /></SelectTrigger>
                <SelectContent className="max-h-56">{(data?.teachers || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {t.position}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>مبلغ معاش (افغانی)</Label><Input dir="ltr" type="number" value={salAmount} onChange={(e) => setSalAmount(e.target.value)} /></div>
            <Button disabled={saving || !salTeacher || !salAmount} onClick={async () => { await send({ action: 'save-salary', teacherId: salTeacher, month: salaryMonth, amount: Number(salAmount), status: 'PAID' }, 'معاش ثبت شد'); setSalOpen(false); setSalTeacher(''); setSalAmount(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
