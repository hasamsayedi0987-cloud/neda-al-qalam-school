'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend, onSyncStateChange, pendingSyncCount, isOnline } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { cn } from '@/lib/utils';
import type { SessionUser, NotificationInfo } from '@/lib/types';
import {
  Bell, BellOff, BookOpen, CalendarCheck, CloudOff, ClipboardList, GraduationCap,
  Home, LayoutDashboard, Library, LogOut, Menu, RefreshCw, School, Settings,
  ShieldCheck, Upload, UserCog, Users, ClipboardCheck, BookMarked, Wifi, KeyRound,
  FileSpreadsheet, UserCheck,
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
  { key: 'library', label: 'کتابخانه', icon: Library, roles: ['ADMIN', 'LIBRARIAN', 'HEADTEACHER'] },
  { key: 'users', label: 'کاربران و دسترسی‌ها', icon: ShieldCheck, roles: ['ADMIN'] },
  { key: 'tasks', label: 'وظایف کارمندان', icon: BookMarked, roles: ['ADMIN', 'HEADTEACHER', 'STAFF', 'TEACHER'] },
  { key: 'settings', label: 'تنظیمات و پشتیبان‌گیری', icon: Settings, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] },
  { key: 'about', label: 'دربارهٔ اپ و سازنده', icon: GraduationCap, roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] },
];

export function AppShell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [view, setView] = useState('dashboard');
  const [navOpen, setNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const { toast } = useToast();

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(user.role));

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
      setPending(pendingSyncCount());
    };
    update();
    const un = onSyncStateChange(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      un();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const logout = async () => {
    await apiSend('/api/auth', 'POST', { action: 'logout' });
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
        </nav>
      </ScrollArea>
      <div className="px-4 py-3 border-t text-[11px] text-muted-foreground">
        نسخهٔ ۱.۰ — حسام الدین سیدی
      </div>
    </div>
  );

  const current = visibleNav.find((n) => n.key === view) || visibleNav[0];

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

          {/* وضعیت اتصال */}
          <Badge
            variant="outline"
            className={cn(
              'gap-1 hidden sm:flex',
              online ? 'text-emerald-700 border-emerald-300' : 'text-rose-600 border-rose-300',
            )}
            title={online ? 'متصل به سرور' : 'حالت آفلاین — داده‌ها در صف ذخیره می‌شوند'}
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
            {online ? (pending > 0 ? `در انتظار همگام‌سازی: ${toPersianDigits(pending)}` : 'آنلاین') : 'آفلاین'}
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

      <div className="flex flex-1">
        {/* سایدبار دسکتاپ */}
        <aside className="hidden lg:block w-[270px] shrink-0 border-l border-emerald-100 bg-white sticky top-16 h-[calc(100vh-4rem)]">
          {navContent}
        </aside>

        {/* محتوا */}
        <main className="flex-1 min-w-0 p-3 md:p-6 max-w-[1400px]">
          {view === 'dashboard' && <DashboardView user={user} onNavigate={setView} />}
          {view === 'students' && <StudentsView user={user} />}
          {view === 'teachers' && <TeachersView user={user} />}
          {view === 'classes' && <ClassesView user={user} />}
          {view === 'subjects' && <SubjectsView user={user} />}
          {view === 'attendance' && <AttendanceView user={user} />}
          {view === 'activities' && <ActivitiesView user={user} />}
          {view === 'grades' && <GradesView user={user} />}
          {view === 'results' && <ResultsView user={user} />}
          {view === 'library' && <LibraryView user={user} />}
          {view === 'users' && <UsersView user={user} />}
          {view === 'tasks' && <TasksView user={user} />}
          {view === 'settings' && <SettingsView user={user} />}
          {view === 'about' && <AboutView />}
        </main>
      </div>

      <footer className="mt-auto border-t border-emerald-100 bg-white py-3 text-center text-[11px] text-muted-foreground">
        مکتب خصوصی نداالقلم — سیستم مدیریت تعلیمی | توسعه‌دهنده: حسام الدین سیدی | 0791680632
      </footer>
    </div>
  );
}
