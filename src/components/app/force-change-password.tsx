'use client';

/**
 * تغییر رمز اجباری — امنیت حساب‌های پیش‌فرض
 *
 * هر حسابی که هنوز با رمز اولیه (admin123 / 12345678 و…) وارد می‌شود، پیش از
 * دسترسی به سیستم باید رمز خود را عوض کند. این پرده تمام‌صفحه تا تغییر موفق
 * رمز برداشته نمی‌شود و خروجی آن هیچ راهی به بخش‌های اپ ندارد.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiSend, saveOfflineCred } from '@/lib/client/api';
import { KeyRound, ShieldAlert, Eye, EyeOff, LogOut } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/grading';
import type { SessionUser } from '@/lib/types';

export function ForceChangePassword({
  user,
  onDone,
  onLogout,
}: {
  user: SessionUser;
  onDone: () => void;
  onLogout: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) {
      setError('رمز عبور جدید باید حداقل ۶ حرف باشد');
      return;
    }
    if (next !== confirm) {
      setError('تکرار رمز عبور مطابقت ندارد');
      return;
    }
    setBusy(true);
    const res = await apiSend('/api/auth', 'POST', {
      action: 'change-password',
      currentPassword: current,
      newPassword: next,
    }, { allowQueue: false });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // ورود آفلاین این دستگاه هم با رمز جدید به‌روز می‌شود (فقط تأییدکنندهٔ PBKDF2)
    void saveOfflineCred(user, next);
    onDone();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 ambient-bg" dir="rtl">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-card shadow-xl p-6 animate-scale-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">تغییر رمز اولیه الزامی است</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user.name} — {ROLE_LABELS[user.role]} (@{user.username})
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-6 mb-4">
            این حساب هنوز با رمز اولیه/پیش‌فرض سیستم کار می‌کند و برای جلوگیری از دسترسی غیرمجاز،
            باید همین حالا یک رمز تازه و خصوصی تعیین کنید. تا تغییر رمز، به بخش‌های سیستم دسترسی ندارید.
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-current">رمز فعلی (همان رمز اولیه)</Label>
              <Input
                id="fc-current" dir="ltr" className="text-left h-10" type={show ? 'text' : 'password'}
                value={current} onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password" required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-next">رمز جدید (حداقل ۶ حرف)</Label>
              <div className="relative">
                <Input
                  id="fc-next" dir="ltr" className="text-left pl-10 h-10" type={show ? 'text' : 'password'}
                  value={next} onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password" required
                />
                <button
                  type="button" aria-label="نمایش رمز"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-confirm">تکرار رمز جدید</Label>
              <Input
                id="fc-confirm" dir="ltr" className="text-left h-10" type={show ? 'text' : 'password'}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" required
              />
            </div>
            {error && (
              <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm px-3 py-2.5">
                {error}
              </div>
            )}
            <Button type="submit" className="btn-hero w-full h-11 text-white gap-1.5" disabled={busy}>
              <KeyRound className="h-4 w-4" />
              {busy ? 'در حال ثبت...' : 'ثبت رمز جدید'}
            </Button>
            <Button
              type="button" variant="ghost"
              className="w-full text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1.5"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" /> خروج از حساب
            </Button>
          </form>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          پس از تغییر رمز، همهٔ نشست‌های قبلی این حساب در همهٔ دستگاه‌ها خودکار باطل می‌شود.
        </p>
      </div>
    </div>
  );
}
