'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, StatCard, PageHeader, LoadingBlock, JalaliDate } from './ui-bits';
import { apiGet } from '@/lib/client/api';
import { isoToday, isoToJalaliDisplay, toPersianDigits, isoToWeekday } from '@/lib/jalali';
import { ATTENDANCE_LABELS, letterGrade } from '@/lib/grading';
import type { SessionUser } from '@/lib/types';
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
  lentBooks?: number;
  pendingTasks?: number;
  recentGrades?: Array<{ id: string; studentName: string; subjectName: string; total: number; period: string }>;
  student?: {
    id: string; firstName: string; lastName: string; className: string | null; rollNo: number | null;
  } | null;
  totalGrades?: number;
  approvedGrades?: number;
  absences?: number;
  attendanceTotal?: number;
}

export function DashboardView({ user, onNavigate }: { user: SessionUser; onNavigate: (v: string) => void }) {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="مضمون دارای نمره" value={data.totalGrades || 0} icon={ClipboardList} tone="emerald" />
          <StatCard title="نمرات تایید‌شده" value={data.approvedGrades || 0} icon={GraduationCap} tone="teal" />
          <StatCard title="کل روزهای حاضری" value={data.attendanceTotal || 0} icon={CalendarDays} tone="sky" />
          <StatCard title="تعداد غیبت" value={data.absences || 0} icon={CalendarCheck} tone="rose" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="شاگردان فعال" value={data.studentCount || 0} icon={Users} tone="emerald" />
          <StatCard title="معلمان" value={data.teacherCount || 0} icon={GraduationCap} tone="teal" />
          <StatCard title="کارمندان" value={data.staffCount || 0} icon={UserCog} tone="sky" />
          <StatCard title="صنف‌ها" value={data.classCount || 0} icon={School} tone="amber" />
        </div>
      )}

      {/* حاضری امروز (برای مسئولان) */}
      {!isStudentSide && data.attendanceToday && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-900">
              <CalendarCheck className="h-5 w-5" /> حاضری امروز — {isoToJalaliDisplay(today)} ({isoToWeekday(today)})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {(['present', 'absent', 'sick', 'leave', 'recorded'] as const).map((k) => (
              <div key={k} className="rounded-lg bg-emerald-50 border border-emerald-100 py-2.5">
                <p className="text-lg font-bold text-emerald-800">{toPersianDigits(data.attendanceToday![k])}</p>
                <p className="text-[11px] text-muted-foreground">
                  {k === 'recorded' ? 'ثبت‌شده' : ATTENDANCE_LABELS[k === 'present' ? 'PRESENT' : k === 'absent' ? 'ABSENT' : k === 'sick' ? 'SICK' : 'LEAVE']}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* کارمند: وظایف معوق */}
      {user.role === 'STAFF' && typeof data.pendingTasks === 'number' && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-800">وظایف در انتظار شما</p>
              <p className="text-sm text-amber-700">{toPersianDigits(data.pendingTasks)} وظیفه انجام‌نشده دارد</p>
            </div>
            <button onClick={() => onNavigate('tasks')} className="text-sm font-medium text-amber-900 underline underline-offset-4">
              مشاهده وظایف
            </button>
          </CardContent>
        </Card>
      )}

      {/* آخرین نمرات ثبت‌شده */}
      {!isStudentSide && data.recentGrades && data.recentGrades.length > 0 && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-900">
              <TrendingUp className="h-5 w-5" /> آخرین نمرات ثبت‌شده
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentGrades.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border border-emerald-50 px-3 py-2 text-sm">
                <span className="font-medium">{g.studentName}</span>
                <span className="text-muted-foreground">{g.subjectName}</span>
                <span className="flex items-center gap-2">
                  <span className="font-bold text-emerald-700">{toPersianDigits(g.total)}</span>
                  <span className="text-xs bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
                    {letterGrade(g.total)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* دسترسی سریع */}
      <div>
        <h2 className="text-sm font-semibold text-emerald-900 mb-2">دسترسی سریع</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {quickLinks.map((q) => (
            <button
              key={q.label + q.view}
              onClick={() => onNavigate(q.view)}
              className="group rounded-xl border border-emerald-100 bg-white p-4 text-right shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
            >
              <q.icon className="h-6 w-6 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold text-emerald-900">{q.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{q.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* معلومات مکتب */}
      <Card className="border-emerald-100">
        <CardContent className="p-4 text-xs text-muted-foreground leading-6">
          <p className="font-semibold text-emerald-800 text-sm mb-1">مکتب خصوصی نداالقلم</p>
          <p>استفاده از این سیستم در حالت آنلاین و آفلاین ممکن است؛ داده‌های ثبت‌شده در حالت آفلاین پس از وصل شدن به شبکه خودکار همگام می‌گردد.</p>
          <p className="mt-1">تاریخ امروز: {isoToJalaliDisplay(today)} | سال تعلیمی جاری را مدیر از بخش تنظیمات تعیین می‌کند.</p>
        </CardContent>
      </Card>
    </div>
  );
}
