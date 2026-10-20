'use client';

import { useEffect, useState } from 'react';
import { LoginView } from '@/components/app/login-view';
import { AppShell } from '@/components/app/app-shell';
import { apiGet } from '@/lib/client/api';
import type { SessionUser } from '@/lib/types';
import { Loader2 } from 'lucide-react';

/**
 * نشست فقط برای باز بودن همین پنجره/اپ معتبر است:
 * هر بار که اپ یا سایت بسته و دوباره باز شود، ورود با نام کاربری و رمز الزامی است
 * (چه آنلاین چه آفلاین) — علامت نشست در sessionStorage نگهداری می‌شود که
 * با بستن اپ/تب به‌صورت خودکار پاک می‌گردد.
 */
const ALIVE_KEY = 'noq_alive_v1';

export default function Page() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(true);

  const loadSession = async () => {
    try {
      const data = await apiGet<{ user: SessionUser | null; setupDone?: boolean }>('/api/auth');
      setUser(data.user);
      if (data.setupDone !== undefined) setSetupDone(data.setupDone);
      if (data.user) sessionStorage.setItem(ALIVE_KEY, '1');
      else sessionStorage.removeItem(ALIVE_KEY);
    } catch {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    // فقط وقتی علامت نشست موجود است نشست بازیابی می‌شود — وگرنه صفحهٔ ورود
    let alive = false;
    try { alive = sessionStorage.getItem(ALIVE_KEY) === '1'; } catch { alive = false; }
    if (alive) {
      queueMicrotask(loadSession);
      // ثبت Service Worker برای حالت آفلاین — فقط در نسخهٔ production
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    } else {
      const t = setTimeout(() => setLoading(false), 0);
      // وضعیت راه‌اندازی اولیه (نمایش حساب‌های ابتدایی) بدون بازیابی نشست
      fetch('/api/auth', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { setupDone?: boolean }) => setSetupDone(Boolean(d.setupDone)))
        .catch(() => {});
      return () => clearTimeout(t);
    }
  }, []);

  const handleLoggedIn = () => {
    try { sessionStorage.setItem(ALIVE_KEY, '1'); } catch { /* ignore */ }
    queueMicrotask(loadSession);
  };

  const handleLogout = () => {
    try { sessionStorage.removeItem(ALIVE_KEY); } catch { /* ignore */ }
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-emerald-50/40">
        <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
        <p className="text-sm text-emerald-800 font-medium">در حال بارگذاری سیستم مکتب...</p>
      </div>
    );
  }

  if (!user) return <LoginView onLoggedIn={handleLoggedIn} setupDone={setupDone} />;

  return <AppShell user={user} onLogout={handleLogout} />;
}
