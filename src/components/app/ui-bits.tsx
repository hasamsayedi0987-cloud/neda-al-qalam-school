'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gregorianToJalali, jalaliToGregorian, jalaliMonthLength, isoToJalaliDisplay, toPersianDigits, afghanMonths } from '@/lib/jalali';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({
  title, subtitle, icon: Icon, actions,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4 no-print">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-emerald-900">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  title, value, icon: Icon, hint, tone = 'emerald',
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: 'emerald' | 'amber' | 'rose' | 'sky' | 'teal';
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    teal: 'bg-teal-100 text-teal-700',
  };
  return (
    <Card className="border-emerald-100">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', tones[tone])}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-bold text-emerald-900 leading-tight">
            {typeof value === 'number' ? toPersianDigits(value) : value}
          </p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function LoadingBlock({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 p-4">
      {label && <p className="text-sm text-muted-foreground text-center py-2">{label}</p>}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  message, title, description, icon: Icon,
}: { message?: string; title?: string; description?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-400 flex items-center justify-center mb-3">
          <Icon className="h-7 w-7" />
        </div>
      )}
      {title && <p className="text-base font-semibold text-emerald-900 mb-1">{title}</p>}
      <p className="text-sm text-muted-foreground max-w-sm">{message || description}</p>
    </div>
  );
}

export function JalaliDate({ iso, withName = true }: { iso: string; withName?: boolean }) {
  return <span>{isoToJalaliDisplay(iso, withName)}</span>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-emerald-900">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * انتخاب تاریخ شمسی (افغانی) — هرگز میلادی نشان نمی‌دهد
 * مقدار ISO میلادی ذخیره می‌شود ولی نمایش همیشه شمسی است
 */
export function JalaliDatePicker({
  value, onChange, className,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const now = new Date();
  const tJ = useMemo(
    () => gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    [],
  );
  const years = useMemo(() => {
    const a: number[] = [];
    for (let y = tJ.jy + 3; y >= tJ.jy - 30; y--) a.push(y);
    return a;
  }, [tJ.jy]);

  const j = useMemo(() => {
    if (!value) return null;
    const [gy, gm, gd] = value.split('-').map(Number);
    if (!gy || !gm || !gd) return null;
    return gregorianToJalali(gy, gm, gd);
  }, [value]);

  // انتخاب‌های ناقص کاربر (قبل از کامل شدن هر سه فیلد)
  const [pick, setPick] = useState({ y: 0, m: 0, d: 0 });

  const y = j?.jy ?? pick.y;
  const m = j?.jm ?? pick.m;
  const d = j?.jd ?? pick.d;

  const commit = (ny: number, nm: number, nd: number) => {
    if (!ny || !nm || !nd) return; // تا انتخاب هر سه مقدار کامل نشود
    const dim = jalaliMonthLength(ny, nm);
    const g = jalaliToGregorian(ny, nm, Math.min(nd, dim));
    const iso = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    onChange(iso);
  };

  const setPart = (part: 'y' | 'm' | 'd', v: number) => {
    const np = { y, m, d, [part]: v };
    setPick(np);
    commit(np.y, np.m, np.d);
  };

  const dim = jalaliMonthLength(y || tJ.jy, m || tJ.jm);
  const days = m ? Array.from({ length: dim }, (_, i) => i + 1) : [];

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Select value={d ? String(d) : '0'} onValueChange={(v) => setPart('d', Number(v))}>
        <SelectTrigger className="w-[76px] h-9">
          <SelectValue placeholder="روز" />
        </SelectTrigger>
        <SelectContent className="max-h-56">
          {!d && <SelectItem value="0" disabled>روز</SelectItem>}
          {days.map((x) => (
            <SelectItem key={x} value={String(x)}>{toPersianDigits(x)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={m ? String(m) : '0'} onValueChange={(v) => setPart('m', Number(v))}>
        <SelectTrigger className="w-[110px] h-9">
          <SelectValue placeholder="ماه" />
        </SelectTrigger>
        <SelectContent className="max-h-56">
          {!m && <SelectItem value="0" disabled>ماه</SelectItem>}
          {afghanMonths.map((mn, i) => (
            <SelectItem key={mn} value={String(i + 1)}>{toPersianDigits(i + 1)} — {mn}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={y ? String(y) : '0'} onValueChange={(v) => setPart('y', Number(v))}>
        <SelectTrigger className="w-[92px] h-9">
          <SelectValue placeholder="سال" />
        </SelectTrigger>
        <SelectContent className="max-h-56">
          {!y && <SelectItem value="0" disabled>سال</SelectItem>}
          {years.map((yy) => (
            <SelectItem key={yy} value={String(yy)}>{toPersianDigits(yy)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button" variant="ghost" size="sm"
        className="h-8 px-2 text-xs text-emerald-700"
        onClick={() => {
          setPick({ y: tJ.jy, m: tJ.jm, d: tJ.jd });
          commit(tJ.jy, tJ.jm, tJ.jd);
        }}
      >
        امروز
      </Button>
    </div>
  );
}

export { Card, CardContent, CardHeader, CardTitle };
