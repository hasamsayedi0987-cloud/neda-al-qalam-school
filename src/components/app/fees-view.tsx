'use client';

/**
 * بخش مالی و فیس — ثبت پرداخت‌های ماهانه، مجموع‌ها و هشدار تأخیر
 * دسترسی اصلی: مدیر و سرمعلم (ثبت) — دیدن: طبق دسترسی بخش finance
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { exportExcel, fileStamp } from '@/lib/client/exports';
import { afghanMonths, gregorianToJalali, isoToday, toPersianDigits } from '@/lib/jalali';
import { Wallet, Phone, History, Download, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';

interface FeeStudent {
  id: string; name: string; fatherName: string; classId: string | null;
  className: string | null; monthlyFee: number | null; status: string;
  guardianName: string | null; guardianPhone: string | null;
}
interface FeePayment {
  id: string; studentId: string; month: string; amount: number;
  paidAt: string; method: string; note: string | null; recordedBy: string | null;
}
interface FeesData {
  students: FeeStudent[];
  payments: FeePayment[];
  feeDeadlineDay: number | null;
}

const methodLabel = (m: string) => (m === 'BANK' ? 'بانکی' : 'نقدی');

export function FeesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<FeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState('all');
  const [search, setSearch] = useState('');
  const nowJ = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const [month, setMonth] = useState(`${nowJ.jy}-${String(nowJ.jm).padStart(2, '0')}`);
  // دیالوگ ثبت پرداخت
  const [payFor, setPayFor] = useState<FeeStudent | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNote, setPayNote] = useState('');
  const [payMonth, setPayMonth] = useState('');
  // دیالوگ تاریخچه
  const [histFor, setHistFor] = useState<FeeStudent | null>(null);
  const [saving, setSaving] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER';
  const isAdmin = user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<FeesData>('/api/fees');
      setData(d);
    } catch (e) {
      toast({ title: 'خطا در دریافت اطلاعات مالی', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const [jy, jm] = month.split('-').map(Number);
  const monthDisplay = `${afghanMonths[(jm || 1) - 1]} ${toPersianDigits(jy || 0)}`;

  /** پرداخت‌شدهٔ هر شاگرد برای ماه انتخابی */
  const paidByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of data?.payments || []) {
      if (p.month === month) map.set(p.studentId, (map.get(p.studentId) || 0) + p.amount);
    }
    return map;
  }, [data, month]);

  /** آیا ضرب‌الاجل گذشته؟ (روز جلالی امروز > روز مهلت) */
  const deadlinePassed = useMemo(() => {
    if (!data?.feeDeadlineDay) return false;
    return nowJ.jd > data.feeDeadlineDay;
  }, [data, nowJ.jd]);

  const filtered = useMemo(() => {
    const list = (data?.students || []).filter((s) => s.status === 'ACTIVE');
    const q = search.trim();
    return list.filter((s) => {
      if (classId !== 'all' && s.classId !== classId) return false;
      if (!q) return true;
      return s.name.includes(q) || s.fatherName.includes(q) || (s.className || '').includes(q);
    });
  }, [data, classId, search]);

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of data?.students || []) {
      if (s.classId && s.className) seen.set(s.classId, s.className);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [data]);

  const monthKey = month;
  const stats = useMemo(() => {
    const active = filtered;
    const collected = [...paidByStudent.entries()]
      .filter(([sid]) => active.some((s) => s.id === sid))
      .reduce((a, [, v]) => a + v, 0);
    const expected = active.reduce((a, s) => a + (s.monthlyFee || 0), 0);
    const delayed = active.filter((s) => {
      const fee = s.monthlyFee || 0;
      if (fee <= 0) return false;
      return (paidByStudent.get(s.id) || 0) < fee;
    }).length;
    const allTime = (data?.payments || []).reduce((a, p) => a + p.amount, 0);
    return { collected, expected, delayed, allTime };
  }, [filtered, paidByStudent, data]);

  const statusOf = (s: FeeStudent): { label: string; tone: 'paid' | 'partial' | 'unpaid' } => {
    const fee = s.monthlyFee || 0;
    const paid = paidByStudent.get(s.id) || 0;
    if (fee <= 0) return paid > 0 ? { label: 'پرداخت‌شده', tone: 'paid' } : { label: 'فیس تعیین نشده', tone: 'unpaid' };
    if (paid >= fee) return { label: 'پرداخت‌شده', tone: 'paid' };
    if (paid > 0) return { label: 'ناقص', tone: 'partial' };
    return { label: 'پرداخت‌نشد', tone: 'unpaid' };
  };

  const openPay = (s: FeeStudent) => {
    setPayFor(s);
    setPayAmount(String(s.monthlyFee || ''));
    setPayMonth(monthKey);
    setPayMethod('CASH');
    setPayNote('');
  };

  const savePayment = async () => {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!payMonth || !/^\d{4}-(0?[1-9]|1[0-2])$/.test(payMonth)) {
      toast({ title: 'ماه نامعتبر است — شکل صحیح 1405-10', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'مبلغ باید بزرگ‌تر از صفر باشد', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await apiSend('/api/fees', 'POST', {
      studentId: payFor.id, month: payMonth, amount, method: payMethod, note: payNote, paidAt: isoToday(),
    }, { queueLabel: `پرداخت فیس ${payFor.name}` });
    setSaving(false);
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در حافظهٔ گوشی ذخیره شد — پس از اتصال همگام می‌شود' : 'پرداخت ثبت شد' });
    setPayFor(null);
    if (!res.queued) void load();
    else void load();
  };

  const deletePayment = async (p: FeePayment) => {
    if (!window.confirm(`پرداخت ${toPersianDigits(p.amount)} افغانیِ ماه ${p.month} حذف شود؟`)) return;
    const res = await apiSend(`/api/fees?id=${p.id}`, 'DELETE', undefined, { allowQueue: false });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'پرداخت حذف شد' });
    void load();
  };

  /** پیام کوتاه به والد — با پیوند sms: روی تلفن همراه مستقیماً باز می‌شود */
  const smsLink = (s: FeeStudent) => {
    const paid = paidByStudent.get(s.id) || 0;
    const fee = s.monthlyFee || 0;
    const remain = Math.max(0, fee - paid);
    const text = `والد محترم ${s.guardianName || s.name} — فیس ماه ${monthDisplay} شاگرد ${s.name} به مبلغ ${toPersianDigits(remain)} افغانی باقی است. لطفاً به مکتب خصوصی نداالقلم پرداخت نمایید. با احترام`;
    const phone = (s.guardianPhone || '').replace(/\s+/g, '');
    if (!phone) return null;
    return `sms:${phone}?body=${encodeURIComponent(text)}`;
  };

  const exportMonthly = () => {
    if (!data) return;
    const rows = filtered.map((s, i) => {
      const paid = paidByStudent.get(s.id) || 0;
      const st = statusOf(s);
      return `<tr><td>${toPersianDigits(i + 1)}</td><td>${s.name}</td><td>${s.fatherName}</td><td>${s.className || '—'}</td><td>${toPersianDigits(s.monthlyFee || 0)}</td><td>${toPersianDigits(paid)}</td><td>${st.label}</td></tr>`;
    });
    const table = `<table><thead><tr><th>شماره</th><th>شاگرد</th><th>ولد</th><th>صنف</th><th>فیس ماهانه</th><th>پرداختی ${monthDisplay}</th><th>وضعیت</th></tr></thead><tbody>${rows.join('')}</tbody>
    <tfoot><tr><td colspan="5">مجموع ماه</td><td>${toPersianDigits(stats.collected)}</td><td>از ${toPersianDigits(stats.expected)}</td></tr></tfoot></table>`;
    exportExcel(`فیس ${monthDisplay} — مکتب خصوصی نداالقلم`, table, `فیس-${monthKey}-${fileStamp()}`);
  };

  const histPayments = useMemo(() => {
    if (!histFor) return [];
    return (data?.payments || []).filter((p) => p.studentId === histFor.id).sort((a, b) => b.month.localeCompare(a.month));
  }, [histFor, data]);

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری اطلاعات مالی…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> مالی و فیس</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={(v) => setMonth(v)}>
            <SelectTrigger className="w-[170px]" aria-label="ماه فیس"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1403, 1404, 1405, 1406, 1407].flatMap((y) =>
                afghanMonths.map((mName, i) => {
                  const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                  return <SelectItem key={key} value={key}>{`${mName} ${toPersianDigits(y)}`}</SelectItem>;
                }),
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportMonthly} className="gap-1">
            <Download className="h-4 w-4" /> خروجی اکسل
          </Button>
        </div>
      </div>

      {/* کارت‌های خلاصه */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">وصول‌شدهٔ {monthDisplay}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">{toPersianDigits(stats.collected)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">فیس قابل وصول این ماه</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{toPersianDigits(stats.expected)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">شاگردان دارای تأخیر</CardTitle></CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold flex items-center gap-1.5', stats.delayed > 0 && deadlinePassed ? 'text-rose-600 dark:text-rose-400' : '')}>
              {stats.delayed > 0 && deadlinePassed ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-4 w-4 opacity-50" />}
              {toPersianDigits(stats.delayed)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data?.feeDeadlineDay ? `مهلت: روز ${toPersianDigits(data.feeDeadlineDay)} هر ماه${deadlinePassed ? ' — گذشته است' : ''}` : 'روز مهلت در تنظیمات تعیین نشده'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">مجموع کل پرداخت‌ها (همهٔ زمان‌ها)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{toPersianDigits(stats.allTime)}</p></CardContent>
        </Card>
      </div>

      {/* فیلترها */}
      <div className="flex flex-wrap gap-2">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-[170px]" aria-label="صنف"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ صنف‌ها</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="جستجوی شاگرد…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
      </div>

      {/* جدول شاگردان */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-2.5 text-right">شاگرد</th>
                  <th className="p-2.5 text-right">صنف</th>
                  <th className="p-2.5">فیس ماهانه</th>
                  <th className="p-2.5">پرداختی این ماه</th>
                  <th className="p-2.5">وضعیت</th>
                  <th className="p-2.5">اقدامات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const paid = paidByStudent.get(s.id) || 0;
                  const st = statusOf(s);
                  const sms = smsLink(s);
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2.5">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">ولد: {s.fatherName}</p>
                      </td>
                      <td className="p-2.5 text-xs">{s.className || '—'}</td>
                      <td className="p-2.5 text-center">{s.monthlyFee ? toPersianDigits(s.monthlyFee) : '—'}</td>
                      <td className="p-2.5 text-center font-medium text-primary">{toPersianDigits(paid)}</td>
                      <td className="p-2.5 text-center">
                        <Badge variant={st.tone === 'paid' ? 'default' : st.tone === 'partial' ? 'secondary' : 'outline'}
                          className={cn(st.tone === 'paid' && 'bg-primary', st.tone === 'unpaid' && deadlinePassed && 'border-rose-400 text-rose-600 dark:text-rose-400')}>
                          {st.tone === 'paid' && <CheckCircle2 className="h-3 w-3 ml-1" />}
                          {st.label}
                        </Badge>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {canWrite && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openPay(s)}>
                              ثبت پرداخت
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setHistFor(s)}>
                            <History className="h-3.5 w-3.5" /> تاریخچه
                          </Button>
                          {sms && (
                            <a href={sms} aria-label={`پیام به والد ${s.name}`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent">
                              <Phone className="h-3.5 w-3.5" /> پیام به والد
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">شاگردی یافت نشد</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        ارقام به افغانی است. هشدار تأخیر پس از گذشت روز مهلت (تنظیمات) برای شاگردانی که فیس کامل ماه را نپرداخته‌اند فعال می‌شود؛
        دکمهٔ «پیام به والد» پیام آماده را در پیام‌رسان تلفن باز می‌کند.
      </p>

      {/* دیالوگ ثبت پرداخت */}
      <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت — {payFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ماه فیس</Label>
              <Select value={payMonth} onValueChange={setPayMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1403, 1404, 1405, 1406, 1407].flatMap((y) =>
                    afghanMonths.map((mName, i) => {
                      const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                      return <SelectItem key={key} value={key}>{`${mName} ${toPersianDigits(y)}`}</SelectItem>;
                    }),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>مبلغ (افغانی)</Label>
              <Input type="number" min="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>طریقهٔ پرداخت</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">نقدی</SelectItem>
                  <SelectItem value="BANK">بانکی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات (اختیاری)</Label>
              <Textarea rows={2} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPayFor(null)}>انصراف</Button>
              <Button onClick={savePayment} disabled={saving}>{saving ? 'در حال ثبت…' : 'ثبت پرداخت'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* دیالوگ تاریخچه */}
      <Dialog open={!!histFor} onOpenChange={(v) => !v && setHistFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تاریخچهٔ پرداخت‌ها — {histFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[350px] overflow-y-auto space-y-2">
            {histPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{toPersianDigits(p.amount)} افغانی — ماه {p.month}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {methodLabel(p.method)} • {toPersianDigits(p.paidAt)}{p.note ? ` • ${p.note}` : ''}
                  </p>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 dark:text-rose-400" onClick={() => deletePayment(p)}>
                    حذف
                  </Button>
                )}
              </div>
            ))}
            {histPayments.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">پرداختی ثبت نشده است</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
