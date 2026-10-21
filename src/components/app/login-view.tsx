'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { apiSend, offlineLogin, saveOfflineCred, isOnline } from '@/lib/client/api';
import { todayJalali, toPersianDigits } from '@/lib/jalali';
import { BookOpenCheck, Eye, EyeOff, Lock, User, LogIn, CloudOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser } from '@/lib/types';

export function LoginView({
  onLoggedIn,
  setupDone,
}: {
  onLoggedIn: () => void;
  setupDone: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const uname = username.trim();
    const pass = password;

    if (navigator.onLine) {
      const res = await apiSend<{ user: SessionUser }>('/api/auth', 'POST', { action: 'login', username: uname, password: pass }, { allowQueue: false });
      if (res.error) {
        setLoading(false);
        setError(res.error);
        return;
      }
      if (res.queued || !res.data?.user) {
        setLoading(false);
        setError('اتصال به سرور برقرار نیست. پس از وصل شدن دوباره تلاش کنید.');
        return;
      }
      // ذخیرهٔ مشخصات ورود برای امکان ورود در حالت آفلاین (روی همین دستگاه)
      void saveOfflineCred(res.data.user, pass);
      setLoading(false);
      toast({ title: 'خوش آمدید', description: 'ورود با موفقیت انجام شد' });
      onLoggedIn();
      return;
    }

    // ─── حالت آفلاین: بررسی محلی نام کاربری و رمز ───
    const user = await offlineLogin(uname, pass);
    setLoading(false);
    if (!user) {
      setError('در حالت آفلاین، ورود با حسابی که قبلاً روی همین دستگاه وارد شده امکان‌پذیر است.');
      return;
    }
    setOfflineMode(true);
    toast({ title: 'ورود آفلاین موفق', description: 'داده‌ها پس از وصل شدن همگام می‌شوند' });
    onLoggedIn();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="relative h-24 w-24 mb-3 drop-shadow-md">
            <Image src="/logo.png" alt="لوگوی مکتب خصوصی نداالقلم" fill priority className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-800">مکتب خصوصی نداالقلم</h1>
          <p className="text-sm text-muted-foreground mt-1">سیستم مدیریت تعلیمی — نمرات، حاضری، کتابخانه</p>
          <p className="text-xs text-emerald-700 mt-1">{toPersianDigits(todayJalali())}</p>
          {!isOnline() && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              <CloudOff className="h-3.5 w-3.5" /> حالت آفلاین — با حساب قبلی همین دستگاه وارد شوید
            </p>
          )}
        </div>

        <Card className="border-emerald-100 shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-emerald-600" /> نام کاربری
                </Label>
                <Input
                  id="username"
                  dir="ltr"
                  className="text-left"
                  placeholder="نام کاربری"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-emerald-600" /> رمز عبور
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    dir="ltr"
                    className="text-left pl-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label="نمایش رمز"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-emerald-700"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                {loading ? (
                  'در حال ورود...'
                ) : (
                  <>
                    <LogIn className="h-5 w-5 ml-1" /> ورود به سیستم
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* حساب‌های ابتدایی فقط قبل از اولین ورود مدیر نمایش داده می‌شود */}
        {!setupDone && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-semibold mb-2">
              <BookOpenCheck className="h-4 w-4" /> حساب‌های ابتدایی سیستم — فقط برای اولین ورود
            </div>
            <div className="grid grid-cols-2 gap-1.5 leading-6" dir="ltr">
              <span className="font-mono">admin / admin123</span>
              <span className="font-mono">sarallam / 12345678</span>
              <span className="font-mono">teacher / 12345678</span>
              <span className="font-mono">student / 12345678</span>
              <span className="font-mono">parent / 12345678</span>
              <span className="font-mono">library / 12345678</span>
              <span className="font-mono">staff / 12345678</span>
            </div>
            <p className="mt-2 text-emerald-700">
              ⚠ پس از اولین ورود مدیر، این فهرست برای همیشه مخفی می‌شود و دیگر به هیچ‌کس نمایش داده نمی‌شود.
              می‌توانید حساب‌ها را از بخش «کاربران و دسترسی‌ها» تغییر یا حذف کنید.
            </p>
          </div>
        )}

        {offlineMode && (
          <p className="mt-3 text-center text-xs text-amber-700">شما در حالت آفلاین وارد شده‌اید</p>
        )}

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          توسعه‌دهنده: حسام الدین سیدی — {toPersianDigits('0791680632')}
        </p>
      </div>
    </div>
  );
}
