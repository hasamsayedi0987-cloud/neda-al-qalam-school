'use client';

/**
 * ترانسپورت متعلمین — نسخهٔ ۳.۳.۰
 * ثبت فیس ماهانهٔ ترانسپورت، وصولی‌ها، مصارف و گذارش مفاد/نقص با فلتر صنف و ماه
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { exportExcel, printDocument } from '@/lib/client/exports';
import { afghanMonths, gregorianToJalali, isoToday, toPersianDigits } from '@/lib/jalali';
import { Bus, Plus, Receipt, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

interface TransportStudent { id: string; firstName: string; lastName: string | null; className: string | null; }
interface TransportEnrollment {
  id: string; studentId: string; route: string | null; vehicleNo: string | null;
  monthlyFee: number; active: boolean;
  student: TransportStudent & { class?: { id: string; name: string; grade: number } };
  payments: Array<{ id: string; month: string; amount: number; paidAt: string; note: string | null }>;
}
interface TransportExpenseRow { id: string; month: string; amount: number; note: string | null; }
interface TransportData {
  enrollments: TransportEnrollment[];
  expenses: TransportExpenseRow[];
  monthReport: { month: string; income: number; expense: number; profit: number } | null;
  months: string[];
  totals: { income: number; expense: number };
}

const afn = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US'));

export function TransportView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<TransportData | null>(null);
  const [students, setStudents] = useState<TransportStudent[]>([]);
  const [classFilter, setClassFilter] = useState('all');
  const nowJ = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const [month, setMonth] = useState(`${nowJ.jy}-${String(nowJ.jm).padStart(2, '0')}`);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollStudent, setEnrollStudent] = useState('');
  const [route, setRoute] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [payFor, setPayFor] = useState<TransportEnrollment | null>(null);
  const [payMonth, setPayMonth] = useState(month);
  const [payAmount, setPayAmount] = useState('');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expMonth, setExpMonth] = useState(month);
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER';

  const load = useCallback(() => {
    apiGet<TransportData>(`/api/transport?month=${encodeURIComponent(month)}`)
      .then(setData)
      .catch(() => {});
    apiGet<{ students: TransportStudent[] }>('/api/students')
      .then((d) => setStudents(d.students))
      .catch(() => {});
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const enrollments = useMemo(() => {
    const list = data?.enrollments || [];
    if (classFilter === 'all') return list;
    return list.filter((e) => e.student.class?.id === classFilter || e.student.class?.name === classFilter);
  }, [data, classFilter]);

  const paidInMonth = (e: TransportEnrollment) => e.payments.some((p) => p.month === month);

  const send = async (payload: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string }>('/api/transport', 'POST', payload);
      if (res.error) {
        toast({ title: 'خطا', description: res.error.slice(0, 120), variant: 'destructive' });
        return;
      }
      toast({ title: okMsg, description: res.data?.note });
      load();
    } catch (err) {
      toast({ title: 'خطا', description: String(err).slice(0, 120), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const printMonthly = () => {
    if (!data) return;
    const rep = data.monthReport;
    const rows = enrollments.map((e, i) => `<tr><td>${toPersianDigits(i + 1)}</td><td>${e.student.firstName} ${e.student.lastName || ''}</td><td>${e.student.class?.name || '—'}</td><td>${e.route || '—'}</td><td>${afn(e.monthlyFee)}</td><td>${paidInMonth(e) ? 'پرداخت شد' : 'باقی'}</td></tr>`).join('');
    printDocument(`گزارش ترانسپورت — ماه ${month}`, `
      <h2 style="text-align:center">گذارش ماهانهٔ ترانسپورت — ماه ${month}</h2>
      <p>عواید: ${afn(rep?.income || 0)} افغانی | مصارف: ${afn(rep?.expense || 0)} افغانی | <b>مفاد صافی: ${afn(rep?.profit || 0)} افغانی</b></p>
      <table border="1" style="width:100%;border-collapse:collapse"><tr><th>شماره</th><th>متعلم</th><th>صنف</th><th>مسیر</th><th>فیس ماهانه</th><th>وضعیت ماه</th></tr>${rows}</table>
    `);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Bus className="h-6 w-6 text-emerald-600" />
        <h1 className="text-xl font-bold">ترانسپورت متعلمین</h1>
        <Badge variant="outline">{afn(enrollments.length)} متعلم</Badge>
        {canWrite && (
          <Button onClick={() => setEnrollOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> ثبت ترانسپورت</Button>
        )}
        <div className="ms-auto flex gap-2">
          <Button variant="outline" onClick={printMonthly} className="gap-1"><Receipt className="h-4 w-4" /> چاپ گزارش</Button>
          <Button variant="outline" onClick={() => exportExcel('گزارش ترانسپورت', document.querySelector('[data-transport-table]')?.outerHTML || '', `ترانسپورت-${month}`)} className="gap-1 hidden sm:inline-flex"><TrendingUp className="h-4 w-4" /> اکسل</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">عواید ماه {month}</p><p className="text-2xl font-bold text-emerald-700">{afn(data?.monthReport?.income || 0)} افغانی</p></CardContent></Card>
        <Card className="border-amber-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">مصارف ماه</p><p className="text-2xl font-bold text-amber-700">{afn(data?.monthReport?.expense || 0)} افغانی</p></CardContent></Card>
        <Card className="border-sky-100"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">مفاد صافی ماه</p><p className="text-2xl font-bold text-sky-700">{afn(data?.monthReport?.profit || 0)} افغانی</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <Label>ماه</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => `${nowJ.jy}-${String(i + 1).padStart(2, '0')}`).map((m, i) => (
                <SelectItem key={m} value={m}>{afghanMonths[i]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label>فلتر صنف</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ صنف‌ها</SelectItem>
              {Array.from(new Map(enrollments.map((e) => [e.student.class?.name || '—', e.student.class?.name || '—'])).keys()).map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canWrite && (
          <Button variant="outline" onClick={() => setExpenseOpen(true)} className="gap-1"><TrendingDown className="h-4 w-4" /> ثبت مصرف ترانسپورت</Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>متعلمین ترانسپورت — وضعیت ماه {month}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto" data-transport-table>
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b"><th className="p-2 text-start">متعلم</th><th className="p-2 text-start">صنف</th><th className="p-2 text-start">مسیر</th><th className="p-2 text-start">موتر</th><th className="p-2 text-start">فیس ماهانه</th><th className="p-2 text-start">وصولی‌ها</th><th className="p-2 text-start">وضعیت</th><th className="p-2"></th></tr></thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-2">{e.student.firstName} {e.student.lastName || ''}</td>
                  <td className="p-2">{e.student.class?.name || '—'}</td>
                  <td className="p-2">{e.route || '—'}</td>
                  <td className="p-2">{e.vehicleNo || '—'}</td>
                  <td className="p-2">{afn(e.monthlyFee)}</td>
                  <td className="p-2">{toPersianDigits(e.payments.length)} قسط</td>
                  <td className="p-2">
                    {paidInMonth(e)
                      ? <Badge className="bg-emerald-600 text-white">پرداخت شد</Badge>
                      : <Badge className="bg-red-600 text-white">باقی</Badge>}
                  </td>
                  <td className="p-2">
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setPayFor(e); setPayAmount(String(e.monthlyFee)); setPayMonth(month); }}>وصول فیس</Button>
                        <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete-enrollment', id: e.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {enrollments.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">هنوز متعلمی در ترانسپورت ثبت نشده است</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ثبت ترانسپورت */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ثبت متعلم ترانسپورت</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>متعلم</Label>
              <Select value={enrollStudent} onValueChange={setEnrollStudent}>
                <SelectTrigger><SelectValue placeholder="انتخاب متعلم" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName || ''} — {s.className || 'بی‌صنف'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>مسیر / ناحیه</Label><Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="مثال: کارته‌نو — پل‌سنگی" /></div>
            <div><Label>نمبر موتر</Label><Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
            <div><Label>فیس ماهانه (افغانی)</Label><Input dir="ltr" type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} /></div>
            <Button disabled={saving || !enrollStudent} onClick={async () => { await send({ action: 'save-enrollment', studentId: enrollStudent, route, vehicleNo, monthlyFee: Number(monthlyFee) }, 'ثبت شد'); setEnrollOpen(false); setEnrollStudent(''); setRoute(''); setVehicleNo(''); setMonthlyFee(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* وصول فیس */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>وصول فیس ترانسپورت — {payFor?.student.firstName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ماه</Label>
              <Select value={payMonth} onValueChange={setPayMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => `${nowJ.jy}-${String(i + 1).padStart(2, '0')}`).map((m, i) => <SelectItem key={m} value={m}>{afghanMonths[i]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>مبلغ (افغانی)</Label><Input dir="ltr" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
            <Button disabled={saving} onClick={async () => { await send({ action: 'save-payment', enrollmentId: payFor?.id, month: payMonth, amount: Number(payAmount), paidAt: isoToday() }, 'فیس ترانسپورت ثبت شد'); setPayFor(null); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مصرف ترانسپورت */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ثبت مصرف ترانسپورت</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ماه</Label>
              <Select value={expMonth} onValueChange={setExpMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => `${nowJ.jy}-${String(i + 1).padStart(2, '0')}`).map((m, i) => <SelectItem key={m} value={m}>{afghanMonths[i]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>مبلغ (افغانی)</Label><Input dir="ltr" type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} /></div>
            <div><Label>توضیح (تیل، تعمیر، اجارهٔ موتر…)</Label><Input value={expNote} onChange={(e) => setExpNote(e.target.value)} /></div>
            <Button disabled={saving} onClick={async () => { await send({ action: 'save-expense', month: expMonth, amount: Number(expAmount), note: expNote }, 'مصرف ثبت شد'); setExpenseOpen(false); setExpAmount(''); setExpNote(''); }}>ذخیره</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
