'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend, onSyncStateChange, pendingSyncCount, failedSyncItems, isOnline, isAuthRequired, flushQueue, tryAutoRelogin, discardQueueItem, discardAllFailedItems } from '@/lib/client/api';
import { configureExports } from '@/lib/client/exports';
import { SECTIONS, sectionAllowed } from '@/lib/access';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { cn } from '@/lib/utils';
import type { SessionUser, NotificationInfo } from '@/lib/types';
import type { CustomSectionData } from './custom-view';
import {
  Bell, BellOff, BookOpen, CalendarCheck, CloudOff, ClipboardList, GraduationCap,
  Home, Library, LogOut, Menu, RefreshCw, School, Settings,
  ShieldCheck, UserCog, Users, ClipboardCheck, BookMarked, Wifi, KeyRound,
  FileSpreadsheet, UserCheck, Award, LayoutGrid, AlertTriangle, Loader2,
  Sun, Moon, Monitor, Wallet, MessageSquare, X,
} from 'lucide-react';

/* ─── بارگذاری تنبل ویوها: هر بخش فقط هنگام باز شدن دانلود می‌شود (بستهٔ اولیه سبک‌تر) ─── */
const ViewSkeleton = () => (
  <div className="space-y-4 animate-fade-up" aria-busy="true" aria-label="در حال بارگذاری">
    <div className="h-9 w-48 rounded-lg bg-muted animate-pulse" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
    <div className="h-72 rounded-xl bg-muted animate-pulse" />
  </div>
);

const DashboardView = dynamic(() => import('./dashboard-view').then((m) => m.DashboardView), { loading: () => <ViewSkeleton /> });
const StudentsView = dynamic(() => import('./students-view').then((m) => m.StudentsView), { loading: () => <ViewSkeleton /> });
const TeachersView = dynamic(() => import('./teachers-view').then((m) => m.TeachersView), { loading: () => <ViewSkeleton /> });
const ClassesView = dynamic(() => import('./classes-view').then((m) => m.ClassesView), { loading: () => <ViewSkeleton /> });
const SubjectsView = dynamic(() => import('./subjects-view').then((m) => m.SubjectsView), { loading: () => <ViewSkeleton /> });
const AttendanceView = dynamic(() => import('./attendance-view').then((m) => m.AttendanceView), { loading: () => <ViewSkeleton /> });
const ActivitiesView = dynamic(() => import('./activities-view').then((m) => m.ActivitiesView), { loading: () => <ViewSkeleton /> });
const GradesView = dynamic(() => import('./grades-view').then((m) => m.GradesView), { loading: () => <ViewSkeleton /> });
const ResultsView = dynamic(() => import('./results-view').then((m) => m.ResultsView), { loading: () => <ViewSkeleton /> });
const LibraryView = dynamic(() => import('./library-view').then((m) => m.LibraryView), { loading: () => <ViewSkeleton /> });
const UsersView = dynamic(() => import('./users-view').then((m) => m.UsersView), { loading: () => <ViewSkeleton /> });
const TasksView = dynamic(() => import('./tasks-view').then((m) => m.TasksView), { loading: () => <ViewSkeleton /> });
const SettingsView = dynamic(() => import('./settings-view').then((m) => m.SettingsView), { loading: () => <ViewSkeleton /> });
const AboutView = dynamic(() => import('./about-view').then((m) => m.AboutView), { loading: () => <ViewSkeleton /> });
const CustomSectionsView = dynamic(() => import('./custom-view').then((m) => m.CustomSectionsView), { loading: () => <ViewSkeleton /> });
const CertificatesView = dynamic(() => import('./certificate-view').then((m) => m.CertificatesView), { loading: () => <ViewSkeleton /> });
const FeesView = dynamic(() => import('./fees-view').then((m) => m.FeesView), { loading: () => <ViewSkeleton /> });
const MessagesView = dynamic(() => import('./messages-view').then((m) => m.MessagesView), { loading: () => <ViewSkeleton /> });

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

/** آیکون هر بخش — برچسب و دسترسی از SECTIONS خوانده می‌شود */
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: Home,
  students: Users,
  teachers: UserCog,
  classes: School,
  subjects: BookOpen,
  attendance: CalendarCheck,
  activities: ClipboardCheck,
  grades: ClipboardList,
  finance: Wallet,
  messages: MessageSquare,
  results: FileSpreadsheet,
  certificates: Award,
  customs: LayoutGrid,
  library: Library,
  users: ShieldCheck,
  tasks: BookMarked,
  settings: Settings,
  about: GraduationCap,
};

export const NAV_ITEMS: NavItem[] = Object.entries(SECTIONS).map(([key, def]) => ({
  key,
  label: def.label,
  icon: SECTION_ICONS[key] || LayoutGrid,
  roles: [...def.roles],
}));

/** اشتراک بی‌عمل — برای useSyncExternalStore در تشخیص hydration */
const subscribeNoop = () => () => {};

/** دکمهٔ تغییر تم روشن/تاریک — با محافظت از رندر سرور */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // تشخیص آب‌شدن (hydration) بدون setState در useEffect
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  if (!hydrated) {
    return <Button variant="outline" size="icon" aria-label="تغییر تم" className="opacity-0 pointer-events-none" />;
  }
  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const label = theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم';
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`تم فعلی: ${label} — تغییر به ${next === 'dark' ? 'تاریک' : next === 'light' ? 'روشن' : 'هم‌گامی با سیستم'}`}
      title={`تم: ${label}`}
      className="shrink-0"
    >
      {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
    </Button>
  );
}

export function AppShell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  // لینک‌پذیری عمیق: بازشدن مستقیم یک بخش با پارامتر آدرس (?view=grades)
  const [view, setViewRaw] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const v = new URLSearchParams(window.location.search).get('view');
    if (!v) return 'dashboard';
    if (v.startsWith('custom:')) return v;
    return NAV_ITEMS.some((n) => n.key === v && sectionAllowed(user, v)) ? v : 'dashboard';
  });
  const setView = (v: string) => {
    setViewRaw(v);
    // پاک‌کردن پارامترهای لینک هنگام جابه‌جایی منو
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/');
    }
  };
  const [navOpen, setNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [failedItems, setFailedItems] = useState<{ id: string; label: string; error: string }[]>([]);
  const [failedOpen, setFailedOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // پس از تخلیهٔ موفق صف، ویوهای باز دوباره بارگذاری می‌شوند (دادهٔ واقعی سرور)
  const [syncTick, setSyncTick] = useState(0);
  const prevPendingRef = useRef(0);
  const [customSections, setCustomSections] = useState<CustomSectionData[]>([]);
  // نام مدرسه، شعار و برچسب‌های قابل‌تغییر عناوین — از تنظیمات مدیر
  const [titles, setTitles] = useState({
    schoolName: 'مکتب خصوصی نداالقلم',
    tagline: 'سیستم مدیریت تعلیمی',
    nav: {} as Record<string, string>,
  });
  const { toast } = useToast();

  // فیلتر منو: دسترسی مؤثر کاربر (نقش پیش‌فرض + رونویسی مدیر) + برچسب‌های قابل‌تغییر
  // sectionAllowed خودش نقش پیش‌فرض را چک می‌کند — رونویسی مدیر می‌تواند بخشی را به نقشی بدهد که پیش‌فرض نداشت
  const visibleNav = NAV_ITEMS
    .filter((n) => sectionAllowed(user, n.key))
    .map((n) => ({ ...n, label: titles.nav[n.key] || n.label }));

  // بخش‌های دلخواهِ مجاز برای این نقش — به منوی اصلی افزوده می‌شوند
  useEffect(() => {
    apiGet<{ sections: CustomSectionData[] }>('/api/custom-sections')
      .then((d) => setCustomSections(d.sections))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>('/api/settings')
      .then((d) => {
        configureExports({ schoolName: d.settings.schoolName || undefined });
        let nav: Record<string, string> = {};
        try { nav = JSON.parse(d.settings.navLabels || '{}') as Record<string, string>; } catch { /* پیش‌فرض */ }
        setTitles({
          schoolName: d.settings.schoolName || 'مکتب خصوصی نداالقلم',
          tagline: d.settings.tagline || 'سیستم مدیریت تعلیمی',
          nav,
        });
        if (d.settings.schoolName) {
          document.title = `${d.settings.schoolName} | سیستم مدیریت مکتب`;
        }
      })
      .catch(() => {});
  }, []);

  // ردیابی اعلان‌های قبلی — برای تشخیص «پیام تازه» و نمایش اعلان کوتاه رسیدن پیام
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const firstNotifLoadRef = useRef(true);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: NotificationInfo[]; unread: number }>('/api/notifications');
      setNotifications(data.notifications);
      setUnread(data.unread);
      // اعلان کوتاه هنگام رسیدن پیام/اعلان تازه — فقط از دومین بارگیری به بعد (بار اول شلوغ نشود)
      const fresh = data.notifications.filter((n) => !n.read && !seenNotifIdsRef.current.has(n.id));
      seenNotifIdsRef.current = new Set(data.notifications.map((n) => n.id));
      if (!firstNotifLoadRef.current && fresh.length > 0) {
        const n = fresh[0];
        toast({
          title: n.title,
          description: n.body.length > 90 ? n.body.slice(0, 87) + '…' : n.body,
          duration: 2500,
        });
      }
      firstNotifLoadRef.current = false;
    } catch {
      /* آفلاین */
    }
  }, [toast]);

  useEffect(() => {
    queueMicrotask(loadNotifications);
    const t = setInterval(loadNotifications, 45_000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  useEffect(() => {
    const update = () => {
      setOnline(isOnline());
      const p = pendingSyncCount();
      setPending(p);
      setAuthNeeded(isAuthRequired());
      setFailedItems(failedSyncItems());
      // صف از «پر» به «خالی» رسید = همگام‌سازی موفق — رندر مجدد ویو فعال با دادهٔ سرور
      if (p === 0 && prevPendingRef.current > 0) setSyncTick((t) => t + 1);
      prevPendingRef.current = p;
    };
    update();
    const un = onSyncStateChange(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // پس از هر همگام‌سازی/تازه‌سازی (تخلیهٔ صف یا برگشت اتصال) ویوی باز با دادهٔ تازه رندر می‌شود
    const onSynced = () => setSyncTick((t) => t + 1);
    window.addEventListener('noq:synced', onSynced);
    return () => {
      un();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('noq:synced', onSynced);
    };
  }, []);

  /** دکمهٔ «همگام‌سازی الان» — ابتدا ورود مجدد خودکار (اگر نشست مرده)، بعد تخلیهٔ صف */
  const manualSync = async () => {
    setSyncing(true);
    try {
      if (authNeeded) {
        const relog = await tryAutoRelogin();
        if (!relog) {
          toast({
            title: 'ورود مجدد لازم است',
            description: 'از منو «خروج از حساب» را بزنید و یک بار با انترنت وارد شوید — ثبت‌های آفلاین همان لحظه به سرور می‌رود',
            duration: 6000,
          });
          setSyncing(false);
          return;
        }
      }
      await flushQueue();
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      setSyncing(false);
    }
  };

  const logout = async () => {
    // خروج هرگز صف نمی‌شود — صف‌شدنش بعد از ورود مجدد نشست را می‌شکند
    await apiSend('/api/auth', 'POST', { action: 'logout' }, { allowQueue: false });
    onLogout();
  };

  /** حذف دستی یک ثبت گیرکرده از صف — با تأیید مدیر؛ دادهٔ سرور دست‌نخورده می‌ماند */
  const discardItem = (id: string, label: string) => {
    if (!window.confirm(`«${label}» از صف همگام‌سازی حذف شود؟\nاین ثبت دیگر به سرور ارسال نمی‌شود و نمایش محلی آن هم پاک می‌گردد. داده‌های موجود روی سرور دست‌نخورده می‌ماند.`)) return;
    discardQueueItem(id);
    toast({ title: 'از صف حذف شد', description: 'اگر این ثبت روی سرور لازم است، دوباره وارد کنید' });
  };

  /** حذف همهٔ ثبت‌های خطاخورده — فقط با تأیید */
  const discardAllFailed = () => {
    if (!window.confirm(`${toPersianDigits(failedItems.length)} ثبت خطاخورده از صف حذف شود؟\nاین ثبت‌ها دیگر به سرور ارسال نمی‌شوند و نمایش محلی‌شان پاک می‌گردد.`)) return;
    const n = discardAllFailedItems();
    toast({ title: `${toPersianDigits(n)} ثبت از صف حذف شد`, description: 'صف همگام‌سازی پاک شد' });
  };

  const markAllRead = async () => {
    await apiSend('/api/notifications', 'PATCH', { all: true });
    loadNotifications();
  };

  /** حذف یک اعلان (دستی) */
  const removeNotification = async (id: string) => {
    setNotifications((list) => list.filter((n) => n.id !== id));
    setUnread((u) => Math.max(0, u - 1));
    await apiSend(`/api/notifications?id=${id}`, 'DELETE').catch(() => {});
  };

  /** پاک‌کردن همهٔ اعلان‌ها */
  const clearAllNotifications = async () => {
    setNotifications([]);
    setUnread(0);
    await apiSend('/api/notifications', 'DELETE').catch(() => {});
  };

  // پس از خواندن/حذف پیام در چت‌خانه، زنگ بدون انتظار برای پول ۴۵ ثانیه‌ای تازه می‌شود
  useEffect(() => {
    const onRefresh = () => { void loadNotifications(); };
    window.addEventListener('noq:notif-refresh', onRefresh);
    return () => window.removeEventListener('noq:notif-refresh', onRefresh);
  }, [loadNotifications]);

  const navButtonClass = (active: boolean) =>
    cn(
      'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-right transition-all min-h-[44px] group',
      active
        ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25'
        : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
    );

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Image src="/logo.png" alt="لوگو" width={36} height={36} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-primary text-sm leading-tight">{titles.schoolName}</p>
          <p className="text-[11px] text-muted-foreground">{titles.tagline}</p>
        </div>
      </div>
      {/* فهرست بخش‌ها — اسکرول بومی لمسی (ScrollArea در اندروید-وب‌ویو لمس را نمی‌گیرد و تب‌های پایین دست‌نیافتنی می‌شدند) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-3">
        <nav className="space-y-1">
          {visibleNav.map((item) => (
            <button
              key={item.key}
              onClick={() => { setView(item.key); setNavOpen(false); }}
              className={navButtonClass(view === item.key)}
            >
              <item.icon className={cn('h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110', view === item.key && 'drop-shadow-sm')} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {customSections.length > 0 && (
            <div className="pt-2 mt-2 border-t">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground">بخش‌های دلخواه</p>
              {customSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setView(`custom:${s.id}`); setNavOpen(false); }}
                  className={navButtonClass(view === `custom:${s.id}`)}
                >
                  <LayoutGrid className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110" />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </div>
      <div className="px-4 py-3 border-t text-[11px] text-muted-foreground">
        نسخهٔ ۲.۴.۱ — حسام الدین سیدی
      </div>
    </div>
  );

  const current = visibleNav.find((n) => n.key === view)
    || (view.startsWith('custom:') ? { label: customSections.find((s) => `custom:${s.id}` === view)?.title || 'بخش دلخواه' } as unknown as NavItem : undefined)
    || visibleNav[0];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* هدر */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-md border-b shadow-[0_1px_12px_-6px_rgb(0_0_0/0.15)] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-3 md:px-5 h-16">
          {/* منوی موبایل */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="outline" size="icon" aria-label="بازکردن منو" className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-[290px]">
              <SheetTitle className="sr-only">منوی اصلی</SheetTitle>
              {navContent}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 hidden sm:flex items-center justify-center shrink-0">
              <Image src="/logo.png" alt="لوگو" width={32} height={32} />
            </div>
            <div className="min-w-0">
              <p className="font-bold leading-tight truncate bg-gradient-to-l from-emerald-700 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
                {titles.schoolName}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{current?.label}</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* وضعیت اتصال — در موبایل هم دیده می‌شود (پیشتر مخفی بود و کاربر از گیرکردن صف بی‌خبر می‌ماند!) */}
          <Badge
            variant="outline"
            className={cn(
              'gap-1 shrink-0',
              online ? 'text-primary border-primary/40 bg-primary/5' : 'text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-500/40 bg-rose-500/5',
            )}
            title={
              online
                ? pending > 0 && authNeeded
                  ? 'نشست منقضی شده — برای ارسال ثبت‌ها دوباره وارد شوید'
                  : 'متصل به سرور'
                : 'حالت آفلاین — داده‌ها در صف ذخیره می‌شوند'
            }
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {online
                ? pending > 0
                  ? authNeeded
                    ? `برای ارسال ثبت‌ها وارد شوید (${toPersianDigits(pending)})`
                    : `در انتظار همگام‌سازی: ${toPersianDigits(pending)}`
                  : 'آنلاین'
                : 'آفلاین'}
            </span>
            <span className="sm:hidden">{!online ? 'آفلاین' : pending > 0 ? toPersianDigits(pending) : ''}</span>
          </Badge>

          {/* تغییر تم روشن/تاریک */}
          <ThemeToggle />

          {/* اعلان‌ها */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative" aria-label={`اعلان‌ها${unread > 0 ? ` — ${toPersianDigits(unread)} نخوانده` : ''}`}>
                {unread > 0 ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
                {unread > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 h-5 min-w-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-background">
                    {toPersianDigits(unread > 99 ? 99 : unread)}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <p className="font-semibold text-sm">اعلان‌ها {unread > 0 && <span className="text-xs text-rose-600 dark:text-rose-400">({toPersianDigits(unread)} نخوانده)</span>}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                    خواندن همه
                  </Button>
                  {notifications.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:text-rose-300 hover:bg-rose-500/10" onClick={clearAllNotifications}>
                      پاک‌کردن
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto overscroll-contain">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">اعلانی موجود نیست</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn('group relative px-3 py-2.5 border-b text-sm', !n.read && 'bg-accent/60')}
                    >
                      <button
                        type="button"
                        className="w-full text-right"
                        title={n.messageId ? 'رفتن به پیام‌ها' : undefined}
                        onClick={async () => {
                          // خواندن این اعلان + اگر پیام است، بازشدن بخش پیام‌ها
                          if (!n.read) {
                            setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                            setUnread((u) => Math.max(0, u - 1));
                            void apiSend('/api/notifications', 'PATCH', { id: n.id }).catch(() => {});
                          }
                          if (n.messageId) {
                            setView('messages');
                          }
                        }}
                      >
                        <span className="flex items-start gap-2">
                          {n.messageId && <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-[13px] block pr-0">{n.title}</span>
                            <span className="text-xs text-muted-foreground mt-0.5 leading-5 block">{n.body}</span>
                            <span className="text-[10px] text-muted-foreground mt-1 block">
                              {isoToJalaliDisplay(new Date(n.createdAt).toISOString().slice(0, 10))}
                            </span>
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="حذف این اعلان"
                        title="حذف اعلان"
                        className="absolute top-1.5 left-1.5 rounded-md p-1 text-muted-foreground/60 hover:text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        onClick={() => void removeNotification(n.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* منوی کاربر */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-9 max-w-[190px]">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {user.name.slice(0, 1)}
                </div>
                <div className="hidden md:flex flex-col items-start min-w-0">
                  <span className="text-xs font-semibold truncate">{user.name}</span>
                  <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p>{user.name}</p>
                <p className="text-xs text-muted-foreground font-normal">{ROLE_LABELS[user.role]} — @{user.username}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView('settings')}>
                <KeyRound className="h-4 w-4 ml-2" /> تغییر رمز عبور
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const res = await apiSend('/api/notifications', 'PATCH', { all: true });
                  if (res.error) toast({ title: 'خطا', description: res.error, variant: 'destructive' });
                  loadNotifications();
                }}
              >
                <RefreshCw className="h-4 w-4 ml-2" /> همگام‌سازی اعلان‌ها
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-rose-600 dark:text-rose-400 focus:text-rose-600 dark:text-rose-400">
                <LogOut className="h-4 w-4 ml-2" /> خروج از حساب
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* نوار وضعیت همگام‌سازی — در همهٔ صفحه‌ها (مخصوصاً موبایل) تغییرات معطل را نشان می‌دهد */}
      {(!online || pending > 0) && (
        <div
          id="noq-syncbar"
          className={cn(
            'px-3 md:px-6 py-2 flex flex-wrap items-center gap-2 text-xs border-b',
            failedItems.length > 0
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
              : authNeeded
                ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                : 'bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-300',
          )}
        >
          {failedItems.length > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" /> : online ? <RefreshCw className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
          {failedItems.length > 0 ? (
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setFailedOpen((v) => !v)}
                className="font-semibold text-right hover:underline underline-offset-2"
                aria-expanded={failedOpen}
              >
                {toPersianDigits(failedItems.length)} ثبت توسط سرور پذیرفته نشد — داده حذف نشده است {failedOpen ? '▲' : '▼'}
              </button>
              <p className="truncate text-[11px] opacity-80">
                {failedItems.slice(0, 2).map((f) => `${f.label}: ${f.error}`).join(' | ')}
              </p>
              {failedOpen && (
                <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                  {failedItems.map((f) => (
                    <div key={f.id} className="rounded-lg border border-rose-500/25 bg-background/60 px-2.5 py-1.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate flex-1" dir="auto">{f.label}</span>
                        <button
                          type="button"
                          onClick={() => discardItem(f.id, f.label)}
                          className="shrink-0 rounded-md border border-rose-400/40 px-2 py-0.5 hover:bg-rose-500/10"
                        >
                          حذف از صف
                        </button>
                      </div>
                      <p className="opacity-75 mt-0.5 break-words" dir="auto">{f.error}</p>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={discardAllFailed}
                    className="w-full rounded-lg border border-rose-400/40 px-2 py-1 text-[11px] hover:bg-rose-500/10"
                  >
                    حذف همهٔ ثبت‌های خطاخورده از صف
                  </button>
                  <p className="text-[10px] opacity-70 leading-4">
                    «حذف از صف» یعنی این ثبت دیگر ارسال نمی‌شود و نمایش محلی‌اش پاک می‌شود — داده‌های موجود روی سرور دست‌نخورده می‌ماند.
                    اگر خطا مربوط به دادهٔ ناقص است، آن را از منبع اصلی اصلاح و دوباره ثبت کنید.
                  </p>
                </div>
              )}
            </div>
          ) : !online ? (
            <p className="flex-1 font-medium">
              حالت آفلاین — تغییرات در حافظهٔ گوشی ذخیره می‌شود
              {pending > 0 && ` (${toPersianDigits(pending)} ثبت منتظر ارسال)`}؛ با وصل شدن انترنت خودکار به سرور می‌رود
            </p>
          ) : authNeeded ? (
            <p className="flex-1 font-medium">
              نشست سرور منقضی شده — {toPersianDigits(pending)} ثبت منتظر ارسال است؛ با یک لمس وارد و ارسال می‌شود
            </p>
          ) : (
            <p className="flex-1 font-medium">{toPersianDigits(pending)} ثبت در انتظار همگام‌سازی…</p>
          )}
          {online && (
            <Button
              size="sm"
              variant="outline"
              onClick={manualSync}
              disabled={syncing}
              className={cn(
                'h-7 text-xs gap-1 shrink-0',
                failedItems.length > 0 ? 'border-rose-400/40' : 'border-sky-400/40',
              )}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncing ? 'در حال همگام‌سازی…' : authNeeded ? 'ورود و ارسال الآن' : 'همگام‌سازی الآن'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-1">
        {/* سایدبار دسکتاپ — ارتفاع = ناحیهٔ قابل‌مشاهده منهای هدر و پانویس تا صفحه اسکرول اضافی نگیرد */}
        <aside className="hidden lg:block w-[270px] shrink-0 border-l bg-sidebar sticky top-16 h-[calc(100vh-7rem)]">
          {navContent}
        </aside>

        {/* محتوا — syncTick پس از هر همگام‌سازی موفق، ویو را با دادهٔ تازهٔ سرور بازسازی می‌کند */}
        <main key={syncTick} className="flex-1 min-w-0 p-3 md:p-6 max-w-[1400px] w-full mx-auto animate-fade-up">
          {view === 'dashboard' && <DashboardView user={user} onNavigate={setView} />}
          {view === 'students' && <StudentsView user={user} />}
          {view === 'teachers' && <TeachersView user={user} />}
          {view === 'classes' && <ClassesView user={user} />}
          {view === 'subjects' && <SubjectsView user={user} />}
          {view === 'attendance' && <AttendanceView user={user} />}
          {view === 'activities' && <ActivitiesView user={user} />}
          {view === 'grades' && <GradesView user={user} />}
          {view === 'finance' && <FeesView user={user} />}
          {view === 'messages' && <MessagesView user={user} />}
          {view === 'results' && <ResultsView user={user} />}
          {view === 'certificates' && <CertificatesView user={user} />}
          {view === 'customs' && <CustomSectionsView user={user} />}
          {view === 'library' && <LibraryView user={user} />}
          {view === 'users' && <UsersView user={user} />}
          {view === 'tasks' && <TasksView user={user} />}
          {view === 'settings' && <SettingsView user={user} />}
          {view === 'about' && <AboutView user={user} />}
          {view.startsWith('custom:') && (
            <CustomSectionsView user={user} initialSectionId={view.slice(7)} />
          )}
        </main>
      </div>

      <footer className="mt-auto border-t bg-card py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center text-[11px] text-muted-foreground">
        {titles.schoolName} — {titles.tagline} | توسعه‌دهنده: حسام الدین سیدی | 0791680632
      </footer>
    </div>
  );
}
