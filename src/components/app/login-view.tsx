'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiSend, offlineLogin, saveOfflineCred, isOnline } from '@/lib/client/api';
import { todayJalali, toPersianDigits } from '@/lib/jalali';
import { BookOpenCheck, Eye, EyeOff, Lock, User, LogIn, CloudOff, ClipboardList, CalendarCheck, Library, ShieldCheck } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

const FEATURES = [
  { icon: ClipboardList, title: 'نمرات و کارنامه', desc: 'ثبت سریع و کارنامهٔ خودکار' },
  { icon: CalendarCheck, title: 'حاضری یومیه', desc: 'پیگیری حضور با گزارش ماهانه' },
  { icon: Library, title: 'کتابخانه', desc: 'مدیریت کتاب و امانت‌دهی' },
  { icon: ShieldCheck, title: 'کار بدون انترنت', desc: 'آفلاین ثبت کنید، آنلاین همگام شود' },
];

export function LoginView({
  onLoggedIn,
  setupDone,
}: {
  onLoggedIn: (user?: SessionUser) => void;
  setupDone: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);
  // نام مکتب و شعار قابل‌تغییر توسط مدیر — با مقدار پیش‌فرض شروع می‌شود
  const [titles, setTitles] = useState({
    schoolName: 'مکتب خصوصی نداالقلم',
    tagline: 'سیستم مدیریت تعلیمی — نمرات، حاضری، کتابخانه',
  });

  useEffect(() => {
    if (!navigator.onLine) return; // آفلاین: مقدار پیش‌فرض/کش قبلی
    apiGet<{ settings: Record<string, string> }>('/api/settings')
      .then((d) => {
        setTitles({
          schoolName: d.settings.schoolName || 'مکتب خصوصی نداالقلم',
          tagline: d.settings.tagline
            ? `${d.settings.tagline} — نمرات، حاضری، کتابخانه`
            : 'سیستم مدیریت تعلیمی — نمرات، حاضری، کتابخانه',
        });
        if (d.settings.schoolName) document.title = `${d.settings.schoolName} | سیستم مدیریت مکتب`;
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const uname = username.trim();
    const pass = password;

    let networkFailed = false;

    if (navigator.onLine) {
      const res = await apiSend<{ user: SessionUser }>('/api/auth', 'POST', { action: 'login', username: uname, password: pass }, { allowQueue: false });
      if (res.data?.user) {
        // ذخیرهٔ مشخصات ورود برای امکان ورود در حالت آفلاین (روی همین دستگاه)
        void saveOfflineCred(res.data.user, pass);
        setLoading(false);
        onLoggedIn();
        return;
      }
      if (res.error && !res.network) {
        // رد شدن منطقی سرور (رمز نادرست و غیره) — کاربر آنلاین است، دوباره تلاش کند
        setLoading(false);
        setError(res.error);
        return;
      }
      // navigator.onLine دروغ می‌گفت (وای‌فای/دیتا بدون انترنت) یا سرور در دسترس نیست
      networkFailed = true;
    }

    // ─── ورود آفلاین: بررسی محلی نام کاربری و رمز ───
    const user = await offlineLogin(uname, pass);
    setLoading(false);
    if (!user) {
      setError(
        networkFailed
          ? 'اتصال انترنت برقرار نیست و این حساب قبلاً روی همین دستگاه وارد نشده است. با حسابی که قبلاً روی همین گوشی وارد شدهاید آفلاین وارد شوید، یا وقتی انترنت وصل شد دوباره تلاش کنید.'
          : 'ورود آفلاین ممکن نیست: این حساب قبلاً روی همین دستگاه وارد نشده است. یک بار با انترنت وارد شوید تا حساب برای ورود آفلاین آماده شود.',
      );
      return;
    }
    setOfflineMode(true);
    // کاربر آفلاین مستقیم پاس داده می‌شود تا از کش احتمالاً کهنه خوانده نشود
    onLoggedIn(user as SessionUser);
  };

  const branding = (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-24 w-24 mb-3 drop-shadow-lg animate-scale-in">
        <Image src="/logo.png" alt={`لوگوی ${titles.schoolName}`} fill priority className="object-contain" />
      </div>
      <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-emerald-800 to-emerald-600 dark:from-emerald-300 dark:to-emerald-500 bg-clip-text text-transparent">
        {titles.schoolName}
      </h1>
      <p className="text-sm text-muted-foreground mt-1.5">{titles.tagline}</p>
      <p className="text-xs text-primary mt-1 font-medium">{toPersianDigits(todayJalali())}</p>
      {!isOnline() && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1.5">
          <CloudOff className="h-3.5 w-3.5" /> حالت آفلاین — با حساب قبلی همین دستگاه وارد شوید
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* پنل معرفی — فقط دسکتاپ */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[50%] relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-800 items-center justify-center p-10">
        <div className="absolute inset-0 opacity-[0.08]" aria-hidden>
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="15" cy="20" r="30" fill="white" />
            <circle cx="85" cy="75" r="40" fill="white" />
            <circle cx="70" cy="10" r="15" fill="white" />
          </svg>
        </div>
        <div className="relative z-10 max-w-md w-full text-white">
          <div className="flex items-center gap-3 mb-8 animate-fade-up">
            <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Image src="/logo.png" alt="لوگو" width={52} height={52} className="rounded-xl" />
            </div>
            <div>
              <p className="text-xl font-bold leading-tight">{titles.schoolName}</p>
              <p className="text-sm text-white/75">نسخهٔ ۲.۱.۰</p>
            </div>
          </div>
          <div className="space-y-4 stagger">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-4">
                <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-white/75 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/60 mt-8 text-center">توسعه‌دهنده: حسام الدین سیدی — {toPersianDigits('0791680632')}</p>
        </div>
      </div>

      {/* بخش فرم */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {/* لوگوی موبایل */}
        <div className="w-full max-w-md lg:hidden mb-6 animate-fade-up">{branding}</div>

        <div className="w-full max-w-md animate-fade-up">
          <div className="rounded-2xl border bg-card shadow-xl shadow-emerald-950/5 p-6 animate-scale-in">
            <div className="hidden lg:block mb-6">{branding}</div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-primary" /> نام کاربری
                </Label>
                <Input
                  id="username"
                  dir="ltr"
                  className="text-left h-11"
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
                  <Lock className="h-4 w-4 text-primary" /> رمز عبور
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    dir="ltr"
                    className="text-left pl-10 h-11"
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
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm px-3 py-2.5 animate-scale-in">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-base shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0" disabled={loading}>
                {loading ? (
                  'در حال ورود...'
                ) : (
                  <>
                    <LogIn className="h-5 w-5 ml-1" /> ورود به سیستم
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* حساب‌های ابتدایی فقط قبل از اولین ورود مدیر نمایش داده می‌شود */}
          {!setupDone && (
            <details className="mt-4 rounded-xl border bg-card p-4 text-xs animate-fade-up">
              <summary className="flex items-center gap-2 font-semibold cursor-pointer select-none text-primary">
                <BookOpenCheck className="h-4 w-4" /> حساب‌های ابتدایی سیستم — فقط برای اولین ورود
              </summary>
              <div className="grid grid-cols-2 gap-1.5 leading-6 mt-3 text-foreground/90" dir="ltr">
                <span className="font-mono">admin / admin123</span>
                <span className="font-mono">sarallam / 12345678</span>
                <span className="font-mono">teacher / 12345678</span>
                <span className="font-mono">student / 12345678</span>
                <span className="font-mono">parent / 12345678</span>
                <span className="font-mono">library / 12345678</span>
                <span className="font-mono">staff / 12345678</span>
              </div>
              <p className="mt-2 text-muted-foreground">
                پس از اولین ورود مدیر، این فهرست برای همیشه مخفی می‌شود و دیگر به هیچ‌کس نمایش داده نمی‌شود.
                می‌توانید حساب‌ها را از بخش «کاربران و دسترسی‌ها» تغییر یا حذف کنید.
              </p>
            </details>
          )}

          {offlineMode && (
            <p className="mt-3 text-center text-xs text-amber-700 dark:text-amber-400">شما در حالت آفلاین وارد شده‌اید</p>
          )}

          <p className="text-center text-[11px] text-muted-foreground mt-4">
            توسعه‌دهنده: حسام الدین سیدی — {toPersianDigits('0791680632')}
          </p>
        </div>
      </div>
    </div>
  );
}
