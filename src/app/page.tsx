'use client';

import { useEffect, useState } from 'react';
import { LoginView } from '@/components/app/login-view';
import { AppShell } from '@/components/app/app-shell';
import { apiGet } from '@/lib/client/api';
import type { SessionUser } from '@/lib/types';
import { Loader2 } from 'lucide-react';

export default function Page() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = async () => {
    try {
      const data = await apiGet<{ user: SessionUser | null }>('/api/auth');
      setUser(data.user);
    } catch {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(loadSession);
    // ثبت Service Worker برای حالت آفلاین — فقط در نسخهٔ production
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-emerald-50/40">
        <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
        <p className="text-sm text-emerald-800 font-medium">در حال بارگذاری سیستم مکتب...</p>
      </div>
    );
  }

  if (!user) return <LoginView onLoggedIn={loadSession} />;

  return <AppShell user={user} onLogout={loadSession} />;
}
