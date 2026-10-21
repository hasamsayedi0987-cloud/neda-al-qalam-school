'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend, onSyncStateChange, pendingSyncCount, failedSyncItems, isOnline, isAuthRequired, flushQueue, tryAutoRelogin } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { cn } from '@/lib/utils';
import type { SessionUser, NotificationInfo } from '@/lib/types';
import type { CustomSectionData } from './custom-view';
import {
  Bell, BellOff, BookOpen, CalendarCheck, CloudOff, ClipboardList, GraduationCap,
  Home, LayoutDashboard, Library, LogOut, Menu, RefreshCw, School, Settings,
  ShieldCheck, Upload, UserCog, Users, ClipboardCheck, BookMarked, Wifi, KeyRound,
  FileSpreadsheet, UserCheck, Award, LayoutGrid, AlertTriangle, Loader2,
} from 'lucide-react';
import { DashboardView } from './dashboard-view';
import { StudentsView } from './students-view';
import { TeachersView } from './teachers-view';
import { ClassesView } from './classes-view';
import { SubjectsView } from './subjects-view';
import { AttendanceView } from './attendance-view';
import { ActivitiesView } from './activities-view';
import { GradesView } from './grades-view';
import { ResultsView } from './results-view';
import { LibraryView } from './library-view';
import { UsersView } from './users-view';
import { TasksView } from './tasks-view';
import { SettingsView } from './settings-view';
import { AboutView } from './about-view';
import { CustomSectionsView } from './custom-view';
import { CertificatesView } from './certificate-view';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'خانه / داشبورد', icon: Home, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] },
  { key: 'students', label: 'شاگردان', icon: Users, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'] },
  { key: 'teachers', label: 'معلمان و کارمندان', icon: UserCog, roles: ['ADMIN', 'HEADTEACHER'] },
  { key: 'classes', label: 'صنف‌ها و تقسیم مضامین', icon: School, roles: ['ADMIN', 'HEADTEACHER'] },
  { key: 'subjects', label: 'مضامین', icon: BookOpen, roles: ['ADMIN', 'HEADTEACHER'] },
  { key: 'attendance', label: 'حاضری یومیه', icon: CalendarCheck, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF'] },
  { key: 'activities', label: 'فعالیت شاگردان', icon: ClipboardCheck, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
  { key: 'grades', label: 'ثبت نمرات', icon: ClipboardList, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'] },
  { key: 'results', label: 'جدول نتایج و کارنامه', icon: FileSpreadsheet, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN'] },
  { key: 'certificates', label: 'تقدیرنامه‌ساز', icon: Award, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'] },
  { key: 'customs', label: 'بخش‌های دلخواه', icon: LayoutGrid, roles: ['ADMIN'] },
  { key: 'library', label: 'کتابخانه', icon: Library, roles: ['ADMIN', 'LIBRARIAN', 'HEADTEACHER'] },
  { key: 'users', label: 'کاربران و دسترسی‌ها', icon: ShieldCheck, roles: ['ADMIN'] },
  { key: 'tasks', label: 'وظایف کارمندان', icon: BookMarked, roles: ['ADMIN', 'HEADTEACHER', 'STAFF', 'TEACHER'] },
  { key: 'settings', label: 'تنظیمات و پشتیبان‌گیری', icon: Settings, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] },
  { key: 'about', label: 'دربارهٔ اپ و سازنده', icon: GraduationCap, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] },
];

export function AppShell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  // لینک‌پذیری عمیق: بازشدن مستقیم یک بخش با پارامتر آدرس (?view=grades)
  const [view, setViewRaw] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const v = new URLSearchParams(window.location.search).get('view');
    if (!v) return 'dashboard';
    if (v.startsWith('custom:')) return v;
    return NAV_ITEMS.some((n) => n.key === v && n.roles.includes(user.role)) ? v : 'dashboard';
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
  const [syncing, setSyncing] = useState(false);
  // پس از تخلیهٔ موفق صف، ویوهای باز دوباره بارگذاری می‌شوند (دادهٔ واقعی سرور)
  const [syncTick, setSyncTick] = useState(0);
  const prevPendingRef = useRef(0);
  const [customSections, setCustomSections] = useState<CustomSectionData[]>([]);
  const { toast } = useToast();

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(user.role));

  // بخش‌های دلخواهِ مجاز برای این نقش — به منوی اصلی افزوده می‌شوند
  useEffect(() => {
    apiGet<{ sections: CustomSectionData[] }>('/api/custom-sections')
      .then((d) => setCustomSections(d.sections))
      .catch(() => {});
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: NotificationInfo[]; unread: number }>('/api/notifications');
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      /* آفلاین */
    }
  }, []);

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

  const markAllRead = async () => {
    await apiSend('/api/notifications', 'PATCH', { all: true });
    loadNotifications();
  };

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b">
        <Image src="/logo.png" alt="لوگو" width={42} height={42} />
        <div className="min-w-0">
          <p className="font-bold text-emerald-800 text-sm leading-tight">مکتب خصوصی نداالقلم</p>
          <p className="text-[11px] text-muted-foreground">سیستم مدیریت تعلیمی</p>
        </div>
      </div>
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-1">
          {visibleNav.map((item) => (
            <button
              key={item.key}
              onClick={() => { setView(item.key); setNavOpen(false); }}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-right transition-colors min-h-[44px]',
                view === item.key
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-emerald-950 hover:bg-emerald-50',
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
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
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-right transition-colors min-h-[44px]',
                    view === `custom:${s.id}`
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                      : 'text-emerald-950 hover:bg-emerald-50',
                  )}
                >
                  <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </ScrollArea>
      <div className="px-4 py-3 border-t text-[11px] text-muted-foreground">
        نسخهٔ ۱.۵.۱ — حسام الدین سیدی
      </div>
    </div>
  );

  const current = visibleNav.find((n) => n.key === view)
    || (view.startsWith('custom:') ? { label: customSections.find((s) => `custom:${s.id}` === view)?.title || 'بخش دلخواه' } as unknown as NavItem : undefined)
    || visibleNav[0];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/50 to-white">
      {/* هدر */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-emerald-100 shadow-sm">
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
            <Image src="/logo.png" alt="لوگو" width={40} height={40} className="hidden sm:block" />
            <div className="min-w-0">
              <p className="font-bold text-emerald-800 leading-tight truncate">مکتب خصوصی نداالقلم</p>
              <p className="text-[11px] text-muted-foreground truncate">{current?.label}</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* وضعیت اتصال — در موبایل هم دیده می‌شود (پیشتر مخفی بود و کاربر از گیرکردن صف بی‌خبر می‌ماند!) */}
          <Badge
            variant="outline"
            className={cn(
              'gap-1 shrink-0',
              online ? 'text-emerald-700 border-emerald-300' : 'text-rose-600 border-rose-300',
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

          {/* اعلان‌ها */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative" aria-label="اعلان‌ها">
                {unread > 0 ? <Bell className="h-5 w-5 text-emerald-700" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
                {unread > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 h-5 min-w-5 px-1 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
                    {toPersianDigits(unread)}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <p className="font-semibold text-sm text-emerald-900">اعلان‌ها</p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                  خواندن همه
                </Button>
              </div>
              <ScrollArea className="max-h-80">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">اعلانی موجود نیست</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn('px-3 py-2.5 border-b text-sm', !n.read && 'bg-emerald-50/60')}
                    >
                      <p className="font-medium text-emerald-900 text-[13px]">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {isoToJalaliDisplay(new Date(n.createdAt).toISOString().slice(0, 10))}
                      </p>
                    </div>
                  ))
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* منوی کاربر */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-9 max-w-[190px]">
                <div className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
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
              <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600">
                <LogOut className="h-4 w-4 ml-2" /> خروج از حساب
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* نوار وضعیت همگام‌سازی — در همهٔ صفحه‌ها (مخصوصاً موبایل) تغییرات معطل را نشان می‌دهد */}
      {(!online || pending > 0) && (
        <div
          className={cn(
            'px-3 md:px-6 py-2 flex flex-wrap items-center gap-2 text-xs border-b',
            failedItems.length > 0
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : authNeeded
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-sky-50 border-sky-200 text-sky-800',
          )}
        >
          {failedItems.length > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" /> : online ? <RefreshCw className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
          {failedItems.length > 0 ? (
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{toPersianDigits(failedItems.length)} ثبت توسط سرور پذیرفته نشد — داده حذف نشده است:</p>
              <p className="truncate text-[11px] opacity-80">
                {failedItems.slice(0, 2).map((f) => `${f.label}: ${f.error}`).join(' | ')}
              </p>
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
                failedItems.length > 0 ? 'border-rose-300 text-rose-800' : 'border-sky-300 text-sky-800',
              )}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncing ? 'در حال همگام‌سازی…' : authNeeded ? 'ورود و ارسال الآن' : 'همگام‌سازی الآن'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-1">
        {/* سایدبار دسکتاپ */}
        <aside className="hidden lg:block w-[270px] shrink-0 border-l border-emerald-100 bg-white sticky top-16 h-[calc(100vh-4rem)]">
          {navContent}
        </aside>

        {/* محتوا — syncTick پس از هر همگام‌سازی موفق، ویو را با دادهٔ تازهٔ سرور بازسازی می‌کند */}
        <main key={syncTick} className="flex-1 min-w-0 p-3 md:p-6 max-w-[1400px]">
          {view === 'dashboard' && <DashboardView user={user} onNavigate={setView} />}
          {view === 'students' && <StudentsView user={user} />}
          {view === 'teachers' && <TeachersView user={user} />}
          {view === 'classes' && <ClassesView user={user} />}
          {view === 'subjects' && <SubjectsView user={user} />}
          {view === 'attendance' && <AttendanceView user={user} />}
          {view === 'activities' && <ActivitiesView user={user} />}
          {view === 'grades' && <GradesView user={user} />}
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

      <footer className="mt-auto border-t border-emerald-100 bg-white py-3 text-center text-[11px] text-muted-foreground">
        مکتب خصوصی نداالقلم — سیستم مدیریت تعلیمی | توسعه‌دهنده: حسام الدین سیدی | 0791680632
      </footer>
    </div>
  );
}
