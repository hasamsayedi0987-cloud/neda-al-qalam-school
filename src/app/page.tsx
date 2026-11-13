'use client';

import { useEffect, useState } from 'react';
import { LoginView } from '@/components/app/login-view';
import { AppShell } from '@/components/app/app-shell';
import { apiGet, markAuthRestored, setCacheScope, restoreLastUser, tryAutoRelogin } from '@/lib/client/api';
import { ensurePushAfterLogin } from '@/lib/client/push';
import type { SessionUser } from '@/lib/types';
import { Loader2 } from 'lucide-react';

/**
 * نشست و بازشدن اپ — راه‌حل بنیادین «اپ بعد از چند روز آفلاین باز نمی‌شود»:
 *
 * ۱) اگر نشست جاری زنده است (همین پنجره باز بوده) → بازیابی از سرور
 * ۲) وگرنه «آخرین کاربرِ همین دستگاه» مستقیم وارد اپ می‌شود — بدون دیوار ورود،
 *    چه آنلاین چه آفلاین (داده از کش محلی خوانده می‌شود). این همان چیزی است که
 *    کاربر می‌خواهد: اپ همیشه باز شود و کار کند؛ حتی بعد از روزها بی‌انتباهی.
 * ۳) در پس‌زمینه با اولین انترنت، نشست واقعی با اعتبار ذخیره‌شده تازه می‌شود
 *    (کوکی تازه + تخلیهٔ صف آفلاین) — بدون هیچ دخالت کاربر.
 * ۴) خروجِ آگاهانه (دکمهٔ خروج) «آخرین کاربر» را فراموش می‌کند تا بازشدن بعدی
 *    صفحهٔ ورود بیاید — کنترل امنیتی دست کاربر است.
 * ۵) storage.persist — جلوگیری از پاک‌شدن خودکار کش و داده توسط سیستم‌عامل
 *    پس از روزها استفاده‌نشدن (ریشهٔ دیگر «اپ باز نمی‌شد»).
 */
const ALIVE_KEY = 'noq_alive_v1';

/** درخواست ذخیرهٔ ماندگار — مرورگر دیگر کش/دادهٔ اپ را به‌سادگی پاک نمی‌کند */
function requestPersistentStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist();
    }
  } catch { /* ignore */ }
}

export default function Page() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(true);

  const loadSession = async () => {
    try {
      const data = await apiGet<{ user: SessionUser | null; setupDone?: boolean }>('/api/auth');
      setUser(data.user);
      if (data.setupDone !== undefined) setSetupDone(data.setupDone);
      if (data.user) {
        sessionStorage.setItem(ALIVE_KEY, '1');
        // کش بخش‌های کاربر-مخصوص (داشبورد/اعلان/پیام) به این کاربر پیوند خورد — ریشهٔ دادهٔ جابجا روی گوشی مشترک قطع شد
        setCacheScope(data.user.id);
        // ورود معتبر شد — ثبت‌های آفلاین مانده در صف ارسال می‌شوند
        markAuthRestored();
        // اگر اجازهٔ اعلان از قبل هست، اشتراک پوش ساکت تضمین می‌شود (نسخهٔ ۳.۰.۰)
        void ensurePushAfterLogin();
      } else sessionStorage.removeItem(ALIVE_KEY);
    } catch {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    // ثبت Service Worker برای حالت آفلاین — همیشه در production
    // (updateViaCache none — خود sw.js همیشه از شبکه چک می‌شود تا به‌روزرسانی هرگز گم نشود)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    }
    requestPersistentStorage();

    const boot = async () => {
      let alive = false;
      try { alive = sessionStorage.getItem(ALIVE_KEY) === '1'; } catch { alive = false; }

      if (alive) {
        await loadSession();
        // نشست کوکی مرده بود اما کاربر دستگاه داریم؟ — بازگردانی خودکار
        setUser((prev) => {
          if (!prev) {
            const last = restoreLastUser() as SessionUser | null;
            if (last) {
              setCacheScope(last.id);
              markAuthRestored();
              // تلاش برای تازه‌کردن نشست واقعی در پس‌زمینه (اگر آنلاین شود)
              void tryAutoRelogin().then((ok) => { if (ok) markAuthRestored(); });
              return last;
            }
          }
          return prev;
        });
        return;
      }

      // بدون نشست زنده — بازگردانی خودکار آخرین کاربر (ورود بدون دیوار)
      const last = restoreLastUser() as SessionUser | null;
      if (last) {
        setCacheScope(last.id);
        markAuthRestored();
        setUser(last);
        setLoading(false);
        // تازه‌سازی نشست واقعی در پس‌زمینه — کوکی تازه + صف آفلاین
        void tryAutoRelogin().then((ok) => { if (ok) markAuthRestored(); });
        return;
      }

      // هیچ اعتباری نیست — صفحهٔ ورود؛ وضعیت راه‌اندازی اولیه (حساب‌های ابتدایی)
      setLoading(false);
      fetch('/api/auth', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { setupDone?: boolean }) => setSetupDone(Boolean(d.setupDone)))
        .catch(() => {});
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoggedIn = (u?: SessionUser) => {
    try { sessionStorage.setItem(ALIVE_KEY, '1'); } catch { /* ignore */ }
    if (u) {
      // ورود آفلاین — کاربر از اعتبار محلی، بدون خواندن کش
      setCacheScope(u.id);
      setUser(u);
      void ensurePushAfterLogin();
      return;
    }
    queueMicrotask(loadSession);
  };

  const handleLogout = () => {
    try { sessionStorage.removeItem(ALIVE_KEY); } catch { /* ignore */ }
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-emerald-50 dark:bg-emerald-500/10">
        <Loader2 className="h-9 w-9 animate-spin text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">در حال بارگذاری سیستم مکتب...</p>
      </div>
    );
  }

  if (!user) return <LoginView onLoggedIn={handleLoggedIn} setupDone={setupDone} />;

  return <AppShell user={user} onLogout={handleLogout} />;
}
