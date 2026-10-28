'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { letterGrade, letterColor, clampComponent, componentTotal, PERIOD_LABELS } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ClassInfo, GradeCell } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import { ClipboardList, Save, BadgeCheck, RotateCcw, Trash2, BookOpen } from 'lucide-react';

interface CSItem {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  subject: { id: string; name: string };
  teacher?: { id: string; name: string } | null;
}

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  grandFather?: string | null;
  rollNo: number | null;
}

export function GradesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canApprove = ['ADMIN', 'HEADTEACHER'].includes(user.role);
  const isTeacher = user.role === 'TEACHER';

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  // لینک‌پذیری: مقدار اولیه از آدرس (?view=grades&class=...&cs=...&period=...)
  const urlInit = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('view') !== 'grades') return null;
    return {
      classId: sp.get('class') || '',
      csId: sp.get('cs') || '',
      period: (sp.get('period') === 'ANNUAL' ? 'ANNUAL' : 'MIDTERM') as 'MIDTERM' | 'ANNUAL',
    };
  }, []);
  const [classId, setClassId] = useState(urlInit?.classId || '');
  const [csId, setCsId] = useState(urlInit?.csId || '');
  const [period, setPeriod] = useState<'MIDTERM' | 'ANNUAL'>(urlInit?.period || 'MIDTERM');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [cells, setCells] = useState<Record<string, GradeCell>>({});
  const [weights, setWeights] = useState({ maxWritten: 40, maxOral: 20, maxHomework: 20, maxActivity: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allApproved, setAllApproved] = useState(false);
  const [permGrades, setPermGrades] = useState(true); // مجوز ثبت/ویرایش نمرات برای معلم
  const [permDelete, setPermDelete] = useState(true); // مجوز حذف نمرات برای معلم

  useEffect(() => {
    apiGet<{ classes: ClassInfo[] }>('/api/classes')
      .then((d) => setClasses(d.classes))
      .catch(() => {});
    if (isTeacher) {
      apiGet<{ settings: Record<string, string> }>('/api/settings')
        .then((d) => {
          setPermGrades(d.settings.permTeacherGrades !== '0');
          setPermDelete(d.settings.permTeacherGradeDelete !== '0');
        })
        .catch(() => {});
    }
  }, [isTeacher]);

  const currentClass = classes.find((c) => c.id === classId);
  // معلم فقط مضامین سپرده‌شده به خودش را می‌بیند
  const classSubjects: CSItem[] = (currentClass?.classSubjects || []).filter(
    (cs) => user.role !== 'TEACHER' || cs.teacherId === user.teacherId,
  );

  // فهرست مضامین من برای بنر معلم — در همهٔ صنف‌هایی که تدریس می‌کند
  const myAssignments = useMemo(() => {
    if (!isTeacher) return [];
    const list: Array<{ className: string; subjectName: string }> = [];
    for (const c of classes) {
      for (const cs of c.classSubjects || []) {
        if (cs.teacherId === user.teacherId) {
          list.push({ className: c.name, subjectName: cs.subject.name });
        }
      }
    }
    return list;
  }, [classes, isTeacher, user.teacherId]);

  const loadGrades = useCallback(async () => {
    if (!csId) return;
    setLoading(true);
    try {
      const data = await apiGet<{
        students: StudentRow[];
        grades: Array<{ studentId: string; period: string; written: number | null; oral: number | null; homework: number | null; activity: number | null; total: number; approved: boolean }>;
        weights: typeof weights;
      }>(`/api/grades?classSubjectId=${csId}`);
      setStudents(data.students);
      setWeights(data.weights);
      const c: Record<string, GradeCell> = {};
      let approved = 0;
      for (const s of data.students) {
        const g = data.grades.find((x) => x.studentId === s.id && x.period === period);
        if (g) {
          c[s.id] = {
            written: g.written, oral: g.oral, homework: g.homework, activity: g.activity,
            total: g.total, approved: g.approved,
          };
          if (g.approved) approved += 1;
        }
      }
      setCells(c);
      setAllApproved(data.students.length > 0 && approved === data.students.length);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [csId, period, toast]);

  useEffect(() => { queueMicrotask(loadGrades); }, [loadGrades]);

  const setCell = (studentId: string, key: keyof GradeCell, value: string) => {
    const prev = cells[studentId] || {};
    if (value === '') {
      setCells({ ...cells, [studentId]: { ...prev, [key]: null, total: componentTotal({ ...prev, [key]: null }) } });
      return;
    }
    const max = key === 'written' ? weights.maxWritten : key === 'oral' ? weights.maxOral : key === 'homework' ? weights.maxHomework : weights.maxActivity;
    const raw = Number(value);
    // اعتبارسنجی خودکار — مقدار خارج از سقف با هشدار به سقف محدود می‌شود
    if (Number.isFinite(raw) && raw > max) {
      toast({
        title: 'نمره از سقف بیشتر بود',
        description: `${toPersianDigits(raw)} به سقف مجاز ${toPersianDigits(max)} محدود شد`,
        duration: 2500,
      });
    }
    const clamped = clampComponent(raw, max);
    setCells({ ...cells, [studentId]: { ...prev, [key]: clamped, total: componentTotal({ ...prev, [key]: clamped }) } });
  };

  const save = async () => {
    if (!csId) return;
    setSaving(true);
    const items = students.map((s) => ({
      studentId: s.id,
      ...(cells[s.id] || { written: null, oral: null, homework: null, activity: null }),
    }));
    const res = await apiSend<{ saved?: number; blockedDeletes?: number }>('/api/grades', 'POST', {
      classSubjectId: csId, period, items,
    }, { queueLabel: 'ثبت نمرات' });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    if (!res.queued && (res.data?.blockedDeletes || 0) > 0) {
      toast({
        title: 'حذف نمرات انجام نشد',
        description: 'مدیر اجازهٔ حذف نمرات را به معلمان نداده است — فقط ویرایش‌ها ذخیره شد.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: res.queued ? 'پیش‌نویس در حافظهٔ گوشی ذخیره شد' : 'پیش‌نویس ذخیره شد — نمرات هنوز تایید نهایی نشده‌اند',
        description: res.queued ? 'در حافظهٔ گوشی ذخیره شد — پس از اتصال به سرور منتقل می‌شود' : undefined,
      });
    }
    // آفلاین هم بارگذاری می‌شود — نمرات از کش محلی (با رونویسی) فوراً نمایش داده می‌شوند
    loadGrades();
  };

  /** ذخیره + تایید نهایی — با کنترل اعتبار: نمرهٔ ناقص مانع تایید نهایی است */
  const saveAndFinalize = async () => {
    if (!csId) return;
    const filled = students.filter((s) => (totalOf(s.id) ?? 0) > 0);
    const empty = students.length - filled.length;
    const msg = empty > 0
      ? `${toPersianDigits(empty)} شاگرد هنوز نمرهٔ کاملی ندارد. ذخیره و تایید نهایی انجام شود؟ شاگردان بدون نمره در کارنامه «غایب/بدون نمره» خواهند بود.`
      : 'نمرات همهٔ شاگردان ذخیره و تایید نهایی شود؟ پس از تایید، در جدول نتایج و کارنامه نهایی می‌گردد.';
    if (!window.confirm(msg)) return;
    setSaving(true);
    const items = students.map((s) => ({
      studentId: s.id,
      ...(cells[s.id] || { written: null, oral: null, homework: null, activity: null }),
    }));
    const res = await apiSend<{ saved?: number }>('/api/grades', 'POST', {
      classSubjectId: csId, period, items,
    }, { queueLabel: 'ثبت نمرات' });
    if (res.error) {
      setSaving(false);
      toast({ title: 'خطا در ذخیره', description: res.error, variant: 'destructive' });
      return;
    }
    const res2 = await apiSend('/api/grades', 'POST', { action: 'approve', classSubjectId: csId, period, approved: true });
    setSaving(false);
    if (res2.error) {
      toast({ title: 'ذخیره شد ولی تایید نهایی ناموفق بود', description: res2.error, variant: 'destructive' });
      loadGrades();
      return;
    }
    toast({
      title: res.queued || res2.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : 'نمرات ذخیره و نهایی شد',
      description: res.queued || res2.queued ? undefined : 'اعلان به معلم و والدین ارسال گردید — در جدول نتایج منعکس شد',
    });
    loadGrades();
  };

  const deleteRow = async (s: StudentRow) => {
    if (!csId) return;
    if (!confirm(`حذف نمرات «${fullName(s)}» در این دوره؟ این عمل قابل بازگشت نیست.`)) return;
    const res = await apiSend<{ deleted?: number }>('/api/grades', 'POST', {
      action: 'delete', classSubjectId: csId, period, studentIds: [s.id],
    }, { queueLabel: 'حذف نمره' });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'حذف شد',
      description: res.queued
        ? 'در حافظهٔ گوشی حذف شد — پس از اتصال همگام می‌شود'
        : `${toPersianDigits(res.data?.deleted || 0)} رکورد حذف گردید`,
    });
    loadGrades();
  };

  const toggleApprove = async (approved: boolean) => {
    const res = await apiSend('/api/grades', 'POST', { action: 'approve', classSubjectId: csId, period, approved });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: approved ? 'نمرات تایید شد' : 'تایید لغو شد', description: approved ? 'اعلان به معلم و والدین ارسال گردید' : undefined });
    loadGrades();
  };

  const totalOf = (sId: string) => {
    const c = cells[sId];
    if (!c) return null;
    const t = componentTotal(c);
    return t > 0 ? t : null;
  };

  const stats = (() => {
    const totals = students.map((s) => totalOf(s.id)).filter((t): t is number => t != null);
    if (totals.length === 0) return null;
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pass = totals.filter((t) => t >= 50).length;
    return { avg: Math.round(avg * 100) / 100, pass, fail: totals.length - pass, count: totals.length };
  })();

  const teacherEditable = canApprove || (!allApproved && (!isTeacher || permGrades));
  const canDelete = canApprove || (isTeacher && permDelete && !allApproved);

  if (loading && csId) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="ثبت نمرات"
        subtitle="تحریری، تقریری/عملی، کارخانگی و فعالیت صنفی — مجموع به‌صورت خودکار محاسبه می‌شود"
        icon={ClipboardList}
      />

      {/* بنر مضامین معلم — با تشخیص دقیق مشکل: بدون پیوند حساب ≠ بدون مضمون */}
      {isTeacher && (
        <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10/70 px-3.5 py-3 mb-4">
          <p className="text-sm font-semibold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> مضامین سپرده‌شده به شما
          </p>
          {!user.teacherId ? (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              حساب شما به پروندهٔ معلم پیوند ندارد؛ به همین سبب مضامین و صنف‌های شما نمایش داده نمی‌شود.
              از مدیر بخواهید در بخش «کاربران و دسترسی‌ها» حساب شما را با پروندهٔ معلم‌تان پیوند بزند.
              (نکته: با یک بار خروج و ورود مجدد، پیوند به‌صورت خودکار هم برقرار می‌شود.)
            </p>
          ) : myAssignments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {myAssignments.map((a, i) => (
                <Badge key={i} variant="outline" className="border-sky-300 dark:border-sky-500/40 text-sky-800 dark:text-sky-300">
                  {a.subjectName} — {a.className}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">هنوز مضمونی به شما سپرده نشده است — از مدیر مکتب بخواهید در بخش «صنف‌ها و تقسیم مضامین» مضامین شما را ثبت کند.</p>
          )}
          {!permGrades && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              در حال حاضر مدیر اجازهٔ ثبت و ویرایش نمرات را به معلمان نداده است — جدول فقط برای مشاهده است.
            </p>
          )}
          {permGrades && !permDelete && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5">
              حذف نمرات توسط مدیر غیرفعال شده است — فقط می‌توانید نمرات را ثبت و ویرایش کنید.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <Field label="صنف">
          <Select value={classId} onValueChange={(v) => { setClassId(v); setCsId(''); }}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="مضمون">
          <Select value={csId} onValueChange={setCsId} disabled={!classId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="انتخاب مضمون" /></SelectTrigger>
            <SelectContent>
              {classSubjects.map((cs) => (
                <SelectItem key={cs.id} value={cs.id}>
                  {cs.subject.name}{cs.teacher ? ` — ${cs.teacher.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="دورهٔ امتحان">
          <Select value={period} onValueChange={(v) => setPeriod(v as 'MIDTERM' | 'ANNUAL')}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MIDTERM">چهارو‌نیم‌ماهه</SelectItem>
              <SelectItem value="ANNUAL">سالانه</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        {allApproved && (
          <Badge className="bg-emerald-600 gap-1">
            <BadgeCheck className="h-3.5 w-3.5" /> نمرات این دوره تایید شده است
          </Badge>
        )}
      </div>

      {!classId || !csId ? (
        <EmptyState message="صنف، مضمون و دورهٔ امتحان را انتخاب کنید تا جدول نمره‌دهی نمایش داده شود." icon={ClipboardList} />
      ) : students.length === 0 ? (
        <EmptyState message="این صنف شاگرد فعال ندارد." icon={ClipboardList} />
      ) : (
        <>
          <Card className="border-emerald-100 dark:border-emerald-500/25">
            <CardContent className="p-0">
              <div className="overflow-x-auto nice-scroll max-h-[62vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-emerald-50 dark:bg-emerald-500/10 z-10">
                    <TableRow>
                      <TableHead className="w-10">شماره</TableHead>
                      <TableHead className="min-w-[170px]">شهرت شاگرد</TableHead>
                      <TableHead className="min-w-[90px]">تحریری <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxWritten)})</span></TableHead>
                      <TableHead className="min-w-[90px]">تقریری/عملی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxOral)})</span></TableHead>
                      <TableHead className="min-w-[90px]">کارخانگی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxHomework)})</span></TableHead>
                      <TableHead className="min-w-[90px]">فعالیت صنفی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxActivity)})</span></TableHead>
                      <TableHead className="min-w-[80px]">مجموع</TableHead>
                      <TableHead className="min-w-[70px]">مکتسبه</TableHead>
                      {canDelete && <TableHead className="min-w-[60px] text-center">حذف</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((s, i) => {
                      const total = totalOf(s.id);
                      const approved = cells[s.id]?.approved;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-muted-foreground">{toPersianDigits(s.rollNo ?? i + 1)}</TableCell>
                          <TableCell className="font-medium">
                            {fullName(s)}
                            {approved && <BadgeCheck className="inline h-4 w-4 text-emerald-600 dark:text-emerald-400 mr-1" />}
                            {(s.fatherName || s.grandFather) && (
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                {s.fatherName ? `ولد ${s.fatherName}` : ''}
                                {s.fatherName && s.grandFather ? ' — ' : ''}
                                {s.grandFather ? `ولدیت ${s.grandFather}` : ''}
                              </span>
                            )}
                          </TableCell>
                          {(['written', 'oral', 'homework', 'activity'] as const).map((k) => (
                            <TableCell key={k}>
                              <Input
                                type="number" min={0} inputMode="decimal"
                                className="h-9 w-20 text-center"
                                disabled={!teacherEditable || user.role === 'TEACHER' && approved}
                                value={cells[s.id]?.[k] ?? ''}
                                onChange={(e) => setCell(s.id, k, e.target.value)}
                                aria-label={`${PERIOD_LABELS[k] || k} — ${fullName(s)}`}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="font-bold text-emerald-800 dark:text-emerald-300">{total != null ? toPersianDigits(total) : '—'}</TableCell>
                          <TableCell>
                            <span className={cn('text-sm', letterColor(total))}>{letterGrade(total)}</span>
                          </TableCell>
                          {canDelete && (
                            <TableCell className="text-center">
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => deleteRow(s)}
                                aria-label={`حذف نمرات ${fullName(s)}`}
                              >
                                <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-xs text-muted-foreground">
              {stats && (
                <>
                  اوسط صنف در این مضمون: <b className="text-emerald-800 dark:text-emerald-300">{toPersianDigits(stats.avg)}</b>
                  {' | '}قبول: <b className="text-emerald-700 dark:text-emerald-300">{toPersianDigits(stats.pass)}</b>
                  {' | '}تکرار: <b className="text-rose-600 dark:text-rose-400">{toPersianDigits(stats.fail)}</b>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && !allApproved && (
                <Button onClick={saveAndFinalize} disabled={saving} className="gap-1.5" variant="outline">
                  <BadgeCheck className="h-4 w-4" /> ذخیره و تایید نهایی
                </Button>
              )}
              {canApprove && allApproved && (
                <Button variant="ghost" onClick={() => toggleApprove(false)} className="gap-1.5 text-amber-700 dark:text-amber-300">
                  <RotateCcw className="h-4 w-4" /> لغو تایید (بازگشت به پیش‌نویس)
                </Button>
              )}
              {teacherEditable && (
                <Button onClick={save} disabled={saving} className="gap-1.5">
                  <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ پیش‌نویس'}
                </Button>
              )}
            </div>
          </div>
          {allApproved && (
            <p className={cn('text-xs mt-2', canApprove ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
              {canApprove
                ? 'نمرات نهایی و تایید شده‌اند — برای ویرایش، تایید را لغو کنید.'
                : 'نمرات این مضمون تایید نهایی شده و برای معلم قابل ویرایش نیست.'}
            </p>
          )}
          {!allApproved && teacherEditable && (
            <p className="text-[11px] text-muted-foreground mt-2">
              نمرات فعلی «پیش‌نویس» است — تا تایید نهایی در کارنامهٔ والدین محسوب نمی‌شود؛ مقادیر بزرگ‌تر از سقف خودکار محدود می‌شوند و مجموع بلافاصله محاسبه می‌گردد.
            </p>
          )}
        </>
      )}
    </div>
  );
}
