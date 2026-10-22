'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, StatCard, PageHeader, LoadingBlock } from './ui-bits';
import { apiGet } from '@/lib/client/api';
import { isoToday, isoToJalaliDisplay, toPersianDigits, isoToWeekday } from '@/lib/jalali';
import { ATTENDANCE_LABELS, letterGrade } from '@/lib/grading';
import type { SessionUser } from '@/lib/types';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen, CalendarCheck, ClipboardCheck, ClipboardList, GraduationCap, Library,
  School, TrendingUp, UserCog, Users, CalendarDays, FileSpreadsheet, BookMarked, Sparkles,
} from 'lucide-react';

interface DashData {
  role: string;
  unread?: number;
  studentCount?: number;
  teacherCount?: number;
  staffCount?: number;
  classCount?: number;
  subjectCount?: number;
  bookCount?: number;
  attendanceToday?: { present: number; absent: number; sick: number; leave: number; recorded: number };
  attendanceTrend?: Array<{ date: string; present: number; absent: number }>;
  gradeDistribution?: Record<string, number>;
  lentBooks?: number;
  pendingTasks?: number;
  recentGrades?: Array<{ id: string; studentName: string; subjectName: string; total: number; period: string }>;
  pendingApprovals?: Array<{
    classSubjectId: string; subjectName: string; className: string;
    period: string; count: number;
  }>;
  student?: {
    id: string; firstName: string; lastName: string; className: string | null; rollNo: number | null;
  } | null;
  totalGrades?: number;
  approvedGrades?: number;
  absences?: number;
  attendanceTotal?: number;
}

const LETTER_ORDER = ['الف', 'ب', 'ج', 'د', 'هـ', 'تکرار'];

export function DashboardView({ user, onNavigate }: { user: SessionUser; onNavigate: (v: string) => void }) {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<DashData>('/api/dashboard')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock rows={5} />;
  if (!data) return <p className="text-sm text-muted-foreground p-4">اطلاعات داشبورد بارگذاری نشد.</p>;

  const today = isoToday();
  const isStudentSide = user.role === 'STUDENT' || user.role === 'GUARDIAN';

  const trend = data.attendanceTrend || [];
  // توزیع به ترتیب مقیاس — فقط رتبه‌های دارای نمره
  const letterIndex = new Map(LETTER_ORDER.map((l, i) => [l, i]));
  const dist = Object.entries(data.gradeDistribution || {})
    .map(([letter, count]) => ({ letter, count }))
    .sort((a, b) => (letterIndex.get(a.letter) ?? 99) - (letterIndex.get(b.letter) ?? 99));

  const quickLinks: Array<{ label: string; icon: React.ComponentType<{ className?: string }>; view: string; desc: string }> =
    user.role === 'ADMIN'
      ? [
          { label: 'شاگردان', icon: Users, view: 'students', desc: 'ثبت و ویرایش شاگردان' },
          { label: 'ثبت نمرات', icon: ClipboardList, view: 'grades', desc: 'نمره‌دهی مضامین' },
          { label: 'حاضری', icon: CalendarCheck, view: 'attendance', desc: 'یومیه و ماهانه' },
          { label: 'جدول نتایج', icon: FileSpreadsheet, view: 'results', desc: 'اوسط، رتبه، کارنامه' },
          { label: 'کتابخانه', icon: Library, view: 'library', desc: 'امانت و برگشت کتاب' },
          { label: 'کاربران', icon: UserCog, view: 'users', desc: 'دسترسی‌ها و غیرفعال‌سازی' },
        ]
      : user.role === 'TEACHER'
      ? [
          { label: 'ثبت نمرات', icon: ClipboardList, view: 'grades', desc: 'مضامین شما' },
          { label: 'حاضری صنف', icon: CalendarCheck, view: 'attendance', desc: 'ثبت یومیه' },
          { label: 'فعالیت‌ها', icon: ClipboardCheck, view: 'activities', desc: 'کارخانگی، رفتار' },
          { label: 'جدول نتایج', icon: FileSpreadsheet, view: 'results', desc: 'نتایج صنف' },
        ]
      : user.role === 'HEADTEACHER'
      ? [
          { label: 'تایید نمرات', icon: ClipboardList, view: 'grades', desc: 'نظارت و تایید' },
          { label: 'حاضری', icon: CalendarCheck, view: 'attendance', desc: 'نظارت و معلمان' },
          { label: 'جدول نتایج', icon: FileSpreadsheet, view: 'results', desc: 'نتایج صنف‌ها' },
          { label: 'تقسیم مضامین', icon: School, view: 'classes', desc: 'صنف‌ها و مضامین' },
        ]
      : user.role === 'LIBRARIAN'
      ? [
          { label: 'کتاب‌ها', icon: Library, view: 'library', desc: 'ثبت کتاب' },
          { label: 'امانت', icon: BookOpen, view: 'library', desc: 'دادن و پس گرفتن' },
        ]
      : user.role === 'STAFF'
      ? [
          { label: 'وظایف من', icon: BookMarked, view: 'tasks', desc: 'وظایف محول‌شده' },
          { label: 'حاضری من', icon: CalendarCheck, view: 'attendance', desc: 'حاضری ماهانه' },
        ]
      : [
          { label: 'کارنامهٔ من', icon: FileSpreadsheet, view: 'results', desc: 'نمرات همهٔ مضامین' },
          { label: 'حاضری من', icon: CalendarCheck, view: 'attendance', desc: 'گزارش ماهانه' },
          { label: 'فعالیت‌ها', icon: ClipboardCheck, view: 'activities', desc: 'کارخانگی و رفتار' },
        ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`سلام، ${user.name}`}
        subtitle={`${isoToWeekday(today)} — ${isoToJalaliDisplay(today)}`}
        icon={Sparkles}
      />

      {/* آمار بر اساس نقش */}
      {isStudentSide ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard title="مضمون دارای نمره" value={data.totalGrades || 0} icon={ClipboardList} tone="emerald" />
          <StatCard title="نمرات تایید‌شده" value={data.approvedGrades || 0} icon={GraduationCap} tone="teal" />
          <StatCard title="کل روزهای حاضری" value={data.attendanceTotal || 0} icon={CalendarDays} tone="sky" />
          <StatCard title="تعداد غیبت" value={data.absences || 0} icon={CalendarCheck} tone="rose" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <StatCard title="شاگردان فعال" value={data.studentCount || 0} icon={Users} tone="emerald" />
          <StatCard title="معلمان" value={data.teacherCount || 0} icon={GraduationCap} tone="teal" />
          <StatCard title="کارمندان" value={data.staffCount || 0} icon={UserCog} tone="sky" />
          <StatCard title="صنف‌ها" value={data.classCount || 0} icon={School} tone="amber" />
        </div>
      )}

      {/* حاضری امروز (برای مسئولان) */}
      {!isStudentSide && data.attendanceToday && (
        <Card className="animate-fade-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" /> حاضری امروز — {isoToJalaliDisplay(today)} ({isoToWeekday(today)})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {(['present', 'absent', 'sick', 'leave', 'recorded'] as const).map((k) => (
              <div key={k} className="rounded-xl bg-accent/60 border py-2.5">
                <p className="text-lg font-bold">{toPersianDigits(data.attendanceToday![k])}</p>
                <p className="text-[11px] text-muted-foreground">
                  {k === 'recorded' ? 'ثبت‌شده' : ATTENDANCE_LABELS[k === 'present' ? 'PRESENT' : k === 'absent' ? 'ABSENT' : k === 'sick' ? 'SICK' : 'LEAVE']}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* نمودارها — روند حاضری و توزیع نمرات */}
      {!isStudentSide && (
        <div className="grid lg:grid-cols-2 gap-4 stagger">
          {trend.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" /> روند حاضری ۷ روز اخیر
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div dir="ltr" className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="gAbsent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => isoToWeekday(d)}
                        tick={{ fontSize: 11 }}
                        stroke="currentColor"
                        className="text-muted-foreground"
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(d) => `${isoToWeekday(String(d))} — ${isoToJalaliDisplay(String(d))}`}
                        formatter={(value, name) => [toPersianDigits(Number(value)), name === 'present' ? 'حاضر' : 'غایب']}
                        contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontFamily: 'inherit' }}
                      />
                      <Area type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2.5} fill="url(#gPresent)" />
                      <Area type="monotone" dataKey="absent" stroke="#f43f5e" strokeWidth={2} fill="url(#gAbsent)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {dist.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> توزیع رتبهٔ نمرات سالانه
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div dir="ltr" className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dist} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                      <XAxis
                        dataKey="letter"
                        tick={{ fontSize: 11 }}
                        stroke="currentColor"
                        className="text-muted-foreground"
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(16,185,129,0.08)' }}
                        formatter={(value) => [`${toPersianDigits(Number(value))} نمره`, 'تعداد']}
                        contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontFamily: 'inherit' }}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#10b981" maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* کارمند: وظایف معوق */}
      {user.role === 'STAFF' && typeof data.pendingTasks === 'number' && data.pendingTasks > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/10 animate-fade-up">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">وظایف در انتظار شما</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">{toPersianDigits(data.pendingTasks)} وظیفه انجام‌نشده دارد</p>
            </div>
            <button onClick={() => onNavigate('tasks')} className="text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-4">
              مشاهده وظایف
            </button>
          </CardContent>
        </Card>
      )}

      {/* آخرین نمرات ثبت‌شده */}
      {!isStudentSide && data.recentGrades && data.recentGrades.length > 0 && (
        <Card className="animate-fade-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> آخرین نمرات ثبت‌شده
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentGrades.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm hover:bg-accent/40 transition-colors">
                <span className="font-medium">{g.studentName}</span>
                <span className="text-muted-foreground">{g.subjectName}</span>
                <span className="flex items-center gap-2">
                  <span className="font-bold text-primary">{toPersianDigits(g.total)}</span>
                  <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {letterGrade(g.total)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* نظارت مدیر/سرمعلم: نمرات در انتظار تایید */}
      {!isStudentSide && data.pendingApprovals && data.pendingApprovals.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 animate-fade-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" /> نمرات در انتظار بررسی و تایید
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.pendingApprovals.map((p) => (
              <button
                key={p.classSubjectId + p.period}
                onClick={() => onNavigate('grades')}
                className="w-full flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
              >
                <span className="font-medium">{p.subjectName} — {p.className}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{p.period === 'MIDTERM' ? 'چهارو‌نیم‌ماهه' : 'سالانه'}</span>
                  <Badge variant="outline" className="border-amber-400 text-amber-700">{toPersianDigits(p.count)} شاگرد</Badge>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* دسترسی سریع */}
      <div className="animate-fade-up">
        <h2 className="text-sm font-semibold mb-2">دسترسی سریع</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 stagger">
          {quickLinks.map((q) => (
            <button
              key={q.label + q.view}
              onClick={() => onNavigate(q.view)}
              className="group rounded-2xl border bg-card p-4 text-right shadow-sm hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 transition-all"
            >
              <q.icon className="h-6 w-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold">{q.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{q.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* معلومات مکتب */}
      <Card className="animate-fade-up">
        <CardContent className="p-4 text-xs text-muted-foreground leading-6">
          <p className="font-semibold text-primary text-sm mb-1">سیستم مدیریت مکتب</p>
          <p>استفاده از این سیستم در حالت آنلاین و آفلاین ممکن است؛ داده‌های ثبت‌شده در حالت آفلاین پس از وصل شدن به شبکه خودکار همگام می‌گردد.</p>
          <p className="mt-1">تاریخ امروز: {isoToJalaliDisplay(today)} | سال تعلیمی جاری را مدیر از بخش تنظیمات تعیین می‌کند.</p>
        </CardContent>
      </Card>
    </div>
  );
}
