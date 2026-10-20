'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { apiSend } from '@/lib/client/api';
import { ghConfigured, setGhToken } from '@/lib/client/gh';
import { todayJalali, toPersianDigits } from '@/lib/jalali';
import { BookOpenCheck, CloudCog, Eye, EyeOff, Lock, User, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const [tokenInput, setTokenInput] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (!ghConfigured()) {
      setLoading(false);
      setError('اتصال ابری پیکربندی نشده است — توکن مخزن داده را در بخش زیر وارد کنید');
      return;
    }
    const res = await apiSend('/api/auth', 'POST', { action: 'login', username, password }, { allowQueue: false });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.queued) {
      setError('اتصال به سرور برقرار نیست. پس از وصل شدن دوباره تلاش کنید.');
      return;
    }
    toast({ title: 'خوش آمدید', description: 'ورود با موفقیت انجام شد' });
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
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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

        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <BookOpenCheck className="h-4 w-4" /> حساب‌های ابتدایی سیستم
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
            پس از اولین ورود، رمز عبور مدیر را از بخش تنظیمات تغییر دهید.
          </p>
        </div>

        <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 text-slate-600 select-none">
            <CloudCog className="h-3.5 w-3.5" /> اتصال ابری گیت‌هاب {ghConfigured() ? '(برقرار)' : '(پیکربندی نشده)'}
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] leading-5 text-muted-foreground">
              این اپ داده‌ها را در مخزن خصوصی <span dir="ltr" className="font-mono">nedaalqalam-school-data</span> ذخیره می‌کند.
              اگر توکن در این دستگاه تنظیم نشده، آن را اینجا وارد کنید (فقط یک بار).
            </p>
            <div className="flex gap-2">
              <input
                dir="ltr" type="password" className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-left"
                placeholder="github token..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                disabled={tokenInput.trim().length < 20}
                onClick={() => {
                  setGhToken(tokenInput);
                  setTokenInput('');
                  toast({ title: 'اتصال ابری ذخیره شد', description: 'حالا می‌توانید وارد شوید' });
                }}
              >
                ذخیره
              </button>
            </div>
          </div>
        </details>

        <p className="text-center text-[11px] text-muted-foreground mt-4">
          توسعه‌دهنده: حسام الدین سیدی — 0791680632
        </p>
      </div>
    </div>
  );
}
