'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, LoadingBlock, EmptyState, Field, JalaliDatePicker } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { gregorianToJalali, isoToday, isoToJalaliDisplay, isoToWeekday, toPersianDigits, afghanMonths } from '@/lib/jalali';
import { ATTENDANCE_LABELS, ATTENDANCE_COLORS } from '@/lib/grading';
import { printDocument, exportExcel, fileStamp } from '@/lib/client/exports';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ClassInfo, StudentInfo } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import { CalendarCheck, CalendarDays, Save, Printer, FileSpreadsheet, Users, UserCheck, BarChart3, MessageSquare, AlertTriangle } from 'lucide-react';

const STATUSES = ['PRESENT', 'ABSENT', 'SICK', 'LEAVE'] as const;
type Status = (typeof STATUSES)[number];

interface DailyRecord { studentId: string; date: string; status: string }

export function AttendanceView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canMark = ['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(user.role);
  const isSelf = ['STUDENT', 'GUARDIAN', 'STAFF'].includes(user.role);

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(isoToday());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // خلاصهٔ پیش از ذخیره — تأیید با آمار کلی و پیام به والدین غایب
  const [confirmOpen, setConfirmOpen] = useState(false);

  // گزارش ماهانه
  const [nowJ] = useState(() => {
    const n = new Date();
    return gregorianToJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
  });
  const [repClass, setRepClass] = useState('');
  const [repYear, setRepYear] = useState(nowJ.jy || 1404);
  const [repMonth, setRepMonth] = useState(nowJ.jm || 1);
  const [repStudents, setRepStudents] = useState<StudentInfo[]>([]);
  const [repRecords, setRepRecords] = useState<DailyRecord[]>([]);
  const [repLoading, setRepLoading] = useState(false);

  // حاضری کارمندان
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; position: string }>>([]);
  const [staffMarks, setStaffMarks] = useState<Record<string, Status>>({});
  const [staffLoading, setStaffLoading] = useState(false);

  // حاضری خود کارمند (ملازم)
  const [myStaffRecords, setMyStaffRecords] = useState<Array<{ id: string; date: string; status: string }>>([]);
  const isStaffSelf = user.role === 'STAFF';

  // آمار سالانه
  const [annualYear, setAnnualYear] = useState(nowJ.jy || 1405);
  const [annualClass, setAnnualClass] = useState('');
  const [annualStudents, setAnnualStudents] = useState<StudentInfo[]>([]);
  const [annualRecords, setAnnualRecords] = useState<DailyRecord[]>([]);
  const [annualLoading, setAnnualLoading] = useState(false);

  useEffect(() => {
    if (!isStaffSelf) return;
    apiGet<{ records: Array<{ id: string; date: string; status: string }> }>('/api/attendance?mode=staff&mine=1')
      .then((d) => setMyStaffRecords(d.records))
      .catch(() => {});
  }, [isStaffSelf]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (canMark) {
          const c = await apiGet<{ classes: ClassInfo[] }>('/api/classes');
          setClasses(c.classes);
        } else if (isSelf && (user.role === 'STUDENT' || user.role === 'GUARDIAN')) {
          const c = await apiGet<{ classes: ClassInfo[] }>('/api/classes');
          setClasses(c.classes);
        }
      } catch { /* آفلاین */ }
      setLoading(false);
    })();
  }, [canMark, isSelf, user.role]);

  const loadDaily = useCallback(async () => {
    if (!canMark || !classId) return;
    try {
      const data = await apiGet<{ students: StudentInfo[]; records: DailyRecord[] }>(
        `/api/attendance?mode=daily&classId=${classId}&date=${date}`,
      );
      setStudents(data.students);
      setRecords(data.records);
      const todayRecs = data.records.filter((r) => r.date === date);
      const m: Record<string, Status> = {};
      for (const s of data.students) {
        const rec = todayRecs.find((r) => r.studentId === s.id);
        m[s.id] = (rec?.status as Status) || 'PRESENT';
      }
      setMarks(m);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
  }, [canMark, classId, date, toast]);

  useEffect(() => { queueMicrotask(loadDaily); }, [loadDaily]);

  const loadAnnual = useCallback(async () => {
    if (!annualClass) return;
    setAnnualLoading(true);
    try {
      const data = await apiGet<{ students: StudentInfo[]; records: DailyRecord[] }>(
        `/api/attendance?mode=annual&classId=${annualClass}&jy=${annualYear}`,
      );
      setAnnualStudents(data.students);
      setAnnualRecords(data.records);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setAnnualLoading(false);
  }, [annualClass, annualYear, toast]);

  useEffect(() => {
    if (annualClass) queueMicrotask(loadAnnual);
  }, [annualClass, loadAnnual]);

  const loadMonthly = useCallback(async () => {
    if (!repClass && !isSelf) return;
    setRepLoading(true);
    try {
      const clsParam = repClass ? `&classId=${repClass}` : '';
      const data = await apiGet<{ students: StudentInfo[]; records: DailyRecord[] }>(
        `/api/attendance?mode=monthly${clsParam}&jy=${repYear}&jm=${repMonth}`,
      );
      setRepStudents(data.students);
      setRepRecords(data.records);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setRepLoading(false);
  }, [repClass, repYear, repMonth, isSelf, toast]);

  useEffect(() => {
    if (isSelf || repClass) queueMicrotask(loadMonthly);
  }, [isSelf, repClass, repYear, repMonth, loadMonthly]);

  /** خلاصهٔ آمار قبل از ذخیره */
  const marksSummary = useMemo(() => {
    const count = (st: Status) => Object.values(marks).filter((v) => v === st).length;
    return {
      total: Object.keys(marks).length,
      present: count('PRESENT'),
      absent: count('ABSENT'),
      sick: count('SICK'),
      leave: count('LEAVE'),
      absentees: students.filter((s) => marks[s.id] === 'ABSENT'),
    };
  }, [marks, students]);

  const saveDaily = async () => {
    if (!classId) return;
    setSaving(true);
    const items = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
    const res = await apiSend('/api/attendance', 'POST', {
      classId, date, items,
    }, { queueLabel: 'ثبت حاضری یومیه' });
    setSaving(false);
    setConfirmOpen(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'ذخیره شد',
      description: res.queued
        ? 'در حافظهٔ گوشی ذخیره شد — پس از اتصال به سرور منتقل می‌شود'
        : `حاضری ${toPersianDigits(items.length)} شاگرد ثبت گردید${marksSummary.absent > 0 ? ` — ${toPersianDigits(marksSummary.absent)} غایب` : ''}`,
    });
    loadDaily();
  };

  /** پیام آماده به والد غایب */
  const absentSmsLink = (s: StudentInfo) => {
    if (!s.guardianPhone) return null;
    const text = `والد محترم ${s.guardianName || ''} — شاگرد شما ${fullName(s)} امروز (${isoToJalaliDisplay(date)}) در مکتب خصوصی نداالقلم حاضر نبود. لطفاً علت غیبت را به مکتب اطلاع دهید.`;
    return `sms:${s.guardianPhone.replace(/\s+/g, '')}?body=${encodeURIComponent(text)}`;
  };

  const saveStaff = async () => {
    setSaving(true);
    const items = Object.entries(staffMarks).map(([userId, status]) => ({ userId, status }));
    const res = await apiSend('/api/attendance', 'POST', { action: 'staff', date, items });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'ذخیره شد', description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : 'حاضری پرسنل ثبت گردید' });
    loadStaff();
  };

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const data = await apiGet<{ records: Array<{ userId: string; date: string; status: string }>; staff: Array<{ id: string; name: string; position: string; role?: string }> }>(
        `/api/attendance?mode=staff&date=${date}`,
      );
      setStaffList(data.staff);
      const m: Record<string, Status> = {};
      for (const s of data.staff) {
        const rec = data.records.find((r) => r.userId === s.id);
        m[s.id] = (rec?.status as Status) || 'PRESENT';
      }
      setStaffMarks(m);
    } catch { /* دسترسی */ }
    setStaffLoading(false);
  }, [date]);

  // بارگیری حاضری پرسنل هنگام باز شدن بخش (برای مدیر/سرمعلم) و با تغییر تاریخ
  useEffect(() => {
    if (['ADMIN', 'HEADTEACHER'].includes(user.role)) queueMicrotask(loadStaff);
  }, [user.role, loadStaff]);

  // ─── گزارش ماهانه: محاسبه ───
  const monthlySummary = useMemo(() => {
    return repStudents.map((s) => {
      const recs = repRecords.filter((r) => r.studentId === s.id);
      const count = (st: string) => recs.filter((r) => r.status === st).length;
      return {
        student: s,
        present: count('PRESENT'),
        absent: count('ABSENT'),
        sick: count('SICK'),
        leave: count('LEAVE'),
        total: recs.length,
      };
    });
  }, [repStudents, repRecords]);

  const printMonthly = () => {
    const monthName = `${afghanMonths[repMonth - 1]} ${toPersianDigits(repYear)}`;
    const rows = monthlySummary.map((r, i) => `
      <tr>
        <td>${toPersianDigits(i + 1)}</td>
        <td>${fullName(r.student)} ولد ${r.student.fatherName}</td>
        <td>${toPersianDigits(r.present)}</td>
        <td>${toPersianDigits(r.absent)}</td>
        <td>${toPersianDigits(r.sick)}</td>
        <td>${toPersianDigits(r.leave)}</td>
        <td>${toPersianDigits(r.total)}</td>
      </tr>`).join('');
    printDocument('گزارش حاضری ماهانه', `
      <div style="text-align:center"><span class="doc-title">گزارش حاضری ماهانه — ${monthName}</span></div>
      <div class="doc-meta"><span>تاریخ گزارش: ${isoToJalaliDisplay(isoToday())}</span></div>
      <table>
        <thead><tr><th>شماره</th><th>شهرت شاگرد</th><th>حاضر</th><th>غایب</th><th>مریض</th><th>رخصت</th><th>مجموع روزها</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="doc-footer">
        <div class="sign-box"><div class="sign-line">امضاء نگران صنف</div></div>
        <div class="sign-box"><div class="sign-line">امضاء مدیر مکتب</div></div>
      </div>
    `);
  };

  const exportMonthlyExcel = () => {
    const monthName = `${afghanMonths[repMonth - 1]} ${toPersianDigits(repYear)}`;
    const rows = monthlySummary.map((r, i) =>
      `<tr><td>${i + 1}</td><td>${fullName(r.student)}</td><td>${r.student.fatherName}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.sick}</td><td>${r.leave}</td><td>${r.total}</td></tr>`,
    ).join('');
    exportExcel(
      `گزارش حاضری ${monthName}`,
      `<table><thead><tr><th>شماره</th><th>اسم</th><th>شهرت</th><th>حاضر</th><th>غایب</th><th>مریض</th><th>رخصت</th><th>مجموع</th></tr></thead><tbody>${rows}</tbody></table>`,
      `حاضری-${repYear}-${repMonth}-${fileStamp()}`,
    );
  };

  // ─── آمار سالانه: محاسبه و خروجی ───
  const annualSummary = useMemo(() => {
    return annualStudents.map((s) => {
      const recs = annualRecords.filter((r) => r.studentId === s.id);
      const count = (st: string) => recs.filter((r) => r.status === st).length;
      return {
        student: s,
        present: count('PRESENT'),
        absent: count('ABSENT'),
        sick: count('SICK'),
        leave: count('LEAVE'),
        total: recs.length,
      };
    });
  }, [annualStudents, annualRecords]);

  const exportAnnualExcel = () => {
    const rows = annualSummary.map((r, i) =>
      `<tr><td>${i + 1}</td><td>${fullName(r.student)}</td><td>${r.student.fatherName}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.sick}</td><td>${r.leave}</td><td>${r.total}</td></tr>`,
    ).join('');
    exportExcel(
      `آمار سالانهٔ حاضری ${toPersianDigits(annualYear)}`,
      `<table><thead><tr><th>شماره</th><th>اسم</th><th>شهرت</th><th>حاضر</th><th>غایب</th><th>مریض</th><th>رخصت</th><th>مجموع</th></tr></thead><tbody>${rows}</tbody></table>`,
      `حاضری-سالانه-${annualYear}-${fileStamp()}`,
    );
  };

  if (loading) return <LoadingBlock rows={4} />;

  const todayJ = isoToJalaliDisplay(date);

  return (
    <div>
      <PageHeader
        title="حاضری"
        subtitle={isSelf ? 'حاضری و رخصتی شما' : 'ثبت حاضر/غایب/مریض/رخصت و گزارش ماهانه'}
        icon={CalendarCheck}
      />

      <Tabs defaultValue={canMark ? 'daily' : (isStaffSelf ? 'daily' : 'report')}>
        {canMark && (
          <TabsList className="mb-4 flex w-full flex-wrap h-auto min-h-10 gap-0.5">
            <TabsTrigger value="daily">حاضری یومیه</TabsTrigger>
            <TabsTrigger value="report">گزارش ماهانه</TabsTrigger>
            <TabsTrigger value="annual" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> آمار سالانه</TabsTrigger>
            {['ADMIN', 'HEADTEACHER'].includes(user.role) && <TabsTrigger value="staff">حاضری پرسنل</TabsTrigger>}
          </TabsList>
        )}

        {/* ─── ثبت یومیه ─── */}
        {canMark && (
          <TabsContent value="daily" className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="صنف">
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="تاریخ (شمسی)">
                <JalaliDatePicker value={date} onChange={setDate} />
              </Field>
              <p className="text-xs text-muted-foreground pb-2">{todayJ} — {isoToWeekday(date)}</p>
            </div>

            {!classId ? (
              <EmptyState message="برای ثبت حاضری، ابتدا صنف را انتخاب کنید." icon={Users} />
            ) : students.length === 0 ? (
              <EmptyState message="این صنف شاگرد فعال ندارد." icon={Users} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 no-print">
                  <p className="text-xs text-muted-foreground">
                    {toPersianDigits(students.length)} شاگرد — وضعیت پیش‌فرض «حاضر» است؛ فقط غایب‌ها را تغییر دهید
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const all: Record<string, Status> = {};
                      for (const s of students) all[s.id] = 'PRESENT';
                      setMarks(all);
                    }}
                  >
                    <UserCheck className="h-4 w-4" /> همه حاضر
                  </Button>
                </div>
                <Card className="border-emerald-100 dark:border-emerald-500/25">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">شماره</TableHead>
                          <TableHead>شهرت شاگرد</TableHead>
                          <TableHead className="text-center">وضعیت امروز</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((s, i) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-muted-foreground">{toPersianDigits(s.rollNo ?? i + 1)}</TableCell>
                            <TableCell className="font-medium">
                              {fullName(s)}
                              <span className="text-xs text-muted-foreground mr-1.5">ولد {s.fatherName}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 justify-center">
                                {STATUSES.map((st) => (
                                  <button
                                    key={st}
                                    onClick={() => setMarks({ ...marks, [s.id]: st })}
                                    className={cn(
                                      'rounded-full px-3 py-1.5 text-xs font-medium transition-all min-h-[32px]',
                                      marks[s.id] === st ? ATTENDANCE_COLORS[st] : 'bg-muted text-muted-foreground hover:bg-emerald-50 dark:bg-emerald-500/10',
                                    )}
                                  >
                                    {ATTENDANCE_LABELS[st]}
                                  </button>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <div className="flex justify-end">
                  <Button onClick={() => setConfirmOpen(true)} disabled={saving} className="gap-1.5">
                    <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ حاضری'}
                  </Button>
                </div>

                {/* خلاصهٔ آمار پیش از ذخیره + پیام به والدین غایب */}
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>خلاصهٔ حاضری — تأیید و ذخیره</DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-muted-foreground">{todayJ} — {isoToWeekday(date)}</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{toPersianDigits(marksSummary.present)}</p><p className="text-[10px] text-muted-foreground">حاضر</p></div>
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold text-rose-600 dark:text-rose-400">{toPersianDigits(marksSummary.absent)}</p><p className="text-[10px] text-muted-foreground">غایب</p></div>
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold text-amber-600 dark:text-amber-400">{toPersianDigits(marksSummary.sick)}</p><p className="text-[10px] text-muted-foreground">مریض</p></div>
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold text-sky-700 dark:text-sky-300">{toPersianDigits(marksSummary.leave)}</p><p className="text-[10px] text-muted-foreground">رخصت</p></div>
                    </div>
                    {marksSummary.absent > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> پیام به والدین غایب‌ها (پیام‌رسان تلفن):</p>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {marksSummary.absentees.map((s) => {
                            const link = absentSmsLink(s);
                            return link ? (
                              <a key={s.id} href={link} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent">
                                <span>{fullName(s)}</span>
                                <span className="text-[10px] text-muted-foreground" dir="ltr">{s.guardianPhone}</span>
                              </a>
                            ) : (
                              <div key={s.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs opacity-60">
                                <span>{fullName(s)}</span>
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">شمارهٔ والد ثبت نشده</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> غایبی نیست — آمار کامل است</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setConfirmOpen(false)}>بازگشت</Button>
                      <Button onClick={saveDaily} disabled={saving} className="gap-1.5">
                        <Save className="h-4 w-4" /> تأیید و ذخیره
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </TabsContent>
        )}

        {/* ─── حاضری خود کارمند (ملازم) ─── */}
        {isStaffSelf && (
          <TabsContent value="daily" className="space-y-4">
            <Card className="border-emerald-100 dark:border-emerald-500/25">
              <CardContent className="p-0">
                {myStaffRecords.length === 0 ? (
                  <EmptyState message="هنوز حاضری برای شما ثبت نشده است." icon={CalendarDays} />
                ) : (
                  <div className="overflow-x-auto nice-scroll max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-emerald-50 dark:bg-emerald-500/10">
                        <TableRow>
                          <TableHead>تاریخ</TableHead>
                          <TableHead>وضعیت</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myStaffRecords.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{isoToJalaliDisplay(r.date)} ({isoToWeekday(r.date)})</TableCell>
                            <TableCell>
                              <span className={cn('rounded-full px-3 py-1 text-xs font-medium', ATTENDANCE_COLORS[r.status])}>
                                {ATTENDANCE_LABELS[r.status]}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ─── گزارش ماهانه ─── */}
        <TabsContent value="report" className="space-y-4">
          {!isSelf && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="صنف">
                <Select value={repClass || 'none'} onValueChange={(v) => v !== 'none' && setRepClass(v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سال شمسی">
                <Input
                  type="number" className="w-[110px]" value={repYear}
                  onChange={(e) => setRepYear(Number(e.target.value))}
                />
              </Field>
              <Field label="ماه">
                <Select value={String(repMonth)} onValueChange={(v) => setRepMonth(Number(v))}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {afghanMonths.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{toPersianDigits(i + 1)} — {m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          {isSelf && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="سال شمسی">
                <Input type="number" className="w-[110px]" value={repYear} onChange={(e) => setRepYear(Number(e.target.value))} />
              </Field>
              <Field label="ماه">
                <Select value={String(repMonth)} onValueChange={(v) => setRepMonth(Number(v))}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {afghanMonths.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{toPersianDigits(i + 1)} — {m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {repLoading ? (
            <LoadingBlock rows={4} />
          ) : monthlySummary.length === 0 ? (
            <EmptyState message="برای این دوره دادهٔ حاضری موجود نیست." icon={CalendarDays} />
          ) : (
            <Card className="border-emerald-100 dark:border-emerald-500/25 print-area">
              <CardContent className="p-0">
                <div className="flex justify-end gap-2 p-3 no-print">
                  <Button variant="outline" size="sm" onClick={printMonthly} className="gap-1">
                    <Printer className="h-4 w-4" /> چاپ / PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportMonthlyExcel} className="gap-1">
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                  </Button>
                </div>
                <div className="overflow-x-auto nice-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>شماره</TableHead>
                        <TableHead>شهرت شاگرد</TableHead>
                        <TableHead>حاضر</TableHead>
                        <TableHead>غایب</TableHead>
                        <TableHead>مریض</TableHead>
                        <TableHead>رخصت</TableHead>
                        <TableHead>مجموع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlySummary.map((r, i) => (
                        <TableRow key={r.student.id}>
                          <TableCell>{toPersianDigits(i + 1)}</TableCell>
                          <TableCell className="font-medium">{fullName(r.student)}</TableCell>
                          <TableCell className="text-emerald-700 dark:text-emerald-300 font-semibold">{toPersianDigits(r.present)}</TableCell>
                          <TableCell className="text-rose-600 dark:text-rose-400 font-semibold">{toPersianDigits(r.absent)}</TableCell>
                          <TableCell className="text-amber-600 dark:text-amber-400">{toPersianDigits(r.sick)}</TableCell>
                          <TableCell className="text-sky-700 dark:text-sky-300">{toPersianDigits(r.leave)}</TableCell>
                          <TableCell>{toPersianDigits(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── آمار سالانه ─── */}
        {canMark && (
          <TabsContent value="annual" className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="صنف">
                <Select value={annualClass} onValueChange={setAnnualClass}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سال شمسی">
                <Input type="number" className="w-[110px]" value={annualYear} onChange={(e) => setAnnualYear(Number(e.target.value))} />
              </Field>
            </div>
            {annualLoading ? (
              <LoadingBlock rows={4} />
            ) : !annualClass ? (
              <EmptyState message="برای آمار سالانه، صنف را انتخاب کنید." icon={BarChart3} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">مجموع روزهای ثبت‌شده در سال {toPersianDigits(annualYear)}: {toPersianDigits(new Set(annualRecords.map((r) => r.date)).size)} روز</p>
                  <Button variant="outline" size="sm" onClick={exportAnnualExcel} className="gap-1 no-print">
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                  </Button>
                </div>
                <Card className="border-emerald-100 dark:border-emerald-500/25">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto nice-scroll max-h-[60vh] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-emerald-50 dark:bg-emerald-500/10">
                          <TableRow>
                            <TableHead>شماره</TableHead>
                            <TableHead>شهرت شاگرد</TableHead>
                            <TableHead>حاضر</TableHead>
                            <TableHead>غایب</TableHead>
                            <TableHead>مریض</TableHead>
                            <TableHead>رخصت</TableHead>
                            <TableHead>نسبت حاضری</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {annualSummary.map((r, i) => {
                            const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
                            return (
                              <TableRow key={r.student.id}>
                                <TableCell>{toPersianDigits(i + 1)}</TableCell>
                                <TableCell className="font-medium">{fullName(r.student)}</TableCell>
                                <TableCell className="text-emerald-700 dark:text-emerald-300 font-semibold">{toPersianDigits(r.present)}</TableCell>
                                <TableCell className="text-rose-600 dark:text-rose-400 font-semibold">{toPersianDigits(r.absent)}</TableCell>
                                <TableCell className="text-amber-600 dark:text-amber-400">{toPersianDigits(r.sick)}</TableCell>
                                <TableCell className="text-sky-700 dark:text-sky-300">{toPersianDigits(r.leave)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                      <div className={cn('h-full', pct >= 80 ? 'bg-emerald-600' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs">{toPersianDigits(pct)}٪</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {annualSummary.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="p-6 text-center text-sm text-muted-foreground">دادهٔ حاضری برای این سال موجود نیست</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        )}

        {/* ─── حاضری پرسنل: معلمان، کارمندان و مدیریت ─── */}
        {['ADMIN', 'HEADTEACHER'].includes(user.role) && (
          <TabsContent value="staff" className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="تاریخ (شمسی)">
                <JalaliDatePicker value={date} onChange={setDate} />
              </Field>
              <p className="text-xs text-muted-foreground pb-2">{todayJ} — حاضری معلمان، کارمندان و مدیریت</p>
            </div>
            {staffLoading ? (
              <LoadingBlock rows={3} />
            ) : staffList.length === 0 ? (
              <EmptyState message="پرسنلی ثبت نشده است." icon={Users} />
            ) : (
              <Card className="border-emerald-100 dark:border-emerald-500/20">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>نام</TableHead>
                        <TableHead>وظیفه</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffList.map((t, i) => (
                        <TableRow key={t.id}>
                          <TableCell>{toPersianDigits(i + 1)}</TableCell>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell>{t.position}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 justify-center">
                              {STATUSES.map((st) => (
                                <button
                                  key={st}
                                  onClick={() => setStaffMarks({ ...staffMarks, [t.id]: st })}
                                  className={cn(
                                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all min-h-[32px]',
                                    staffMarks[t.id] === st ? ATTENDANCE_COLORS[st] : 'bg-muted text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
                                  )}
                                >
                                  {ATTENDANCE_LABELS[st]}
                                </button>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end">
              <Button onClick={saveStaff} disabled={saving} className="gap-1.5">
                <Save className="h-4 w-4" /> ذخیرهٔ حاضری پرسنل
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* رکورد قبلی برای معلم: خلاصهٔ اخیر */}
      {canMark && records.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3">
          آخرین ثبت‌ها: {records.slice(0, 5).map((r) => `${isoToJalaliDisplay(r.date, false)}`).join('، ')}
        </p>
      )}
    </div>
  );
}
