'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
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

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-400 flex items-center justify-center mb-3">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
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

export { Card, CardContent, CardHeader, CardTitle };
