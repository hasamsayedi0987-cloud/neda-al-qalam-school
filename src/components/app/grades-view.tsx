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
import { cn } from '@/lib/utils';
import { ClipboardList, Save, BadgeCheck, RotateCcw } from 'lucide-react';

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
  rollNo: number | null;
}

export function GradesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canApprove = ['ADMIN', 'HEADTEACHER'].includes(user.role);

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [csId, setCsId] = useState('');
  const [period, setPeriod] = useState<'MIDTERM' | 'ANNUAL'>('MIDTERM');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [cells, setCells] = useState<Record<string, GradeCell>>({});
  const [weights, setWeights] = useState({ maxWritten: 40, maxOral: 20, maxHomework: 20, maxActivity: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allApproved, setAllApproved] = useState(false);

  useEffect(() => {
    apiGet<{ classes: ClassInfo[] }>('/api/classes')
      .then((d) => setClasses(d.classes))
      .catch(() => {});
  }, []);

  const currentClass = classes.find((c) => c.id === classId);
  // معلم فقط مضامین سپرده‌شده به خودش را می‌بیند
  const classSubjects: CSItem[] = (currentClass?.classSubjects || []).filter(
    (cs) => user.role !== 'TEACHER' || cs.teacherId === user.teacherId,
  );

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
    const clamped = clampComponent(Number(value), max);
    setCells({ ...cells, [studentId]: { ...prev, [key]: clamped, total: componentTotal({ ...prev, [key]: clamped }) } });
  };

  const save = async () => {
    if (!csId) return;
    setSaving(true);
    const items = students.map((s) => ({
      studentId: s.id,
      ...(cells[s.id] || { written: null, oral: null, homework: null, activity: null }),
    }));
    const res = await apiSend('/api/grades', 'POST', {
      classSubjectId: csId, period, items,
    }, { queueLabel: 'ثبت نمرات' });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: res.queued ? 'در صف آفلاین ذخیره شد' : 'نمرات ثبت شد',
      description: res.queued
        ? 'پس از اتصال به شبکه به‌صورت خودکار همگام می‌شود'
        : `نمرات ${toPersianDigits(items.length)} شاگرد در جدول نتایج صنف منعکس گردید`,
    });
    if (!res.queued) loadGrades();
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

  const teacherEditable = !allApproved || canApprove;

  if (loading && csId) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="ثبت نمرات"
        subtitle="تحریری، تقریری/عملی، کارخانگی و فعالیت صنفی — مجموع به‌صورت خودکار محاسبه می‌شود"
        icon={ClipboardList}
      />

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
          <Card className="border-emerald-100">
            <CardContent className="p-0">
              <div className="overflow-x-auto nice-scroll max-h-[62vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-emerald-50 z-10">
                    <TableRow>
                      <TableHead className="w-10">شماره</TableHead>
                      <TableHead className="min-w-[170px]">شهرت شاگرد</TableHead>
                      <TableHead className="min-w-[90px]">تحریری <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxWritten)})</span></TableHead>
                      <TableHead className="min-w-[90px]">تقریری/عملی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxOral)})</span></TableHead>
                      <TableHead className="min-w-[90px]">کارخانگی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxHomework)})</span></TableHead>
                      <TableHead className="min-w-[90px]">فعالیت صنفی <span className="text-[10px] text-muted-foreground">(از {toPersianDigits(weights.maxActivity)})</span></TableHead>
                      <TableHead className="min-w-[80px]">مجموع</TableHead>
                      <TableHead className="min-w-[70px]">مکتسبه</TableHead>
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
                            {s.firstName} {s.lastName}
                            {approved && <BadgeCheck className="inline h-4 w-4 text-emerald-600 mr-1" />}
                          </TableCell>
                          {(['written', 'oral', 'homework', 'activity'] as const).map((k) => (
                            <TableCell key={k}>
                              <Input
                                type="number" min={0} inputMode="decimal"
                                className="h-9 w-20 text-center"
                                disabled={!teacherEditable || user.role === 'TEACHER' && approved}
                                value={cells[s.id]?.[k] ?? ''}
                                onChange={(e) => setCell(s.id, k, e.target.value)}
                                aria-label={`${PERIOD_LABELS[k] || k} — ${s.firstName} ${s.lastName}`}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="font-bold text-emerald-800">{total != null ? toPersianDigits(total) : '—'}</TableCell>
                          <TableCell>
                            <span className={cn('text-sm', letterColor(total))}>{letterGrade(total)}</span>
                          </TableCell>
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
                  اوسط صنف در این مضمون: <b className="text-emerald-800">{toPersianDigits(stats.avg)}</b>
                  {' | '}قبول: <b className="text-emerald-700">{toPersianDigits(stats.pass)}</b>
                  {' | '}تکرار: <b className="text-rose-600">{toPersianDigits(stats.fail)}</b>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && (
                <>
                  <Button variant="outline" onClick={() => toggleApprove(true)} className="gap-1.5 border-emerald-300 text-emerald-800">
                    <BadgeCheck className="h-4 w-4" /> تایید نمرات
                  </Button>
                  {allApproved && (
                    <Button variant="ghost" onClick={() => toggleApprove(false)} className="gap-1.5 text-amber-700">
                      <RotateCcw className="h-4 w-4" /> لغو تایید
                    </Button>
                  )}
                </>
              )}
              {teacherEditable && (
                <Button onClick={save} disabled={saving} className="gap-1.5">
                  <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ نمرات'}
                </Button>
              )}
            </div>
          </div>
          {allApproved && !canApprove && (
            <p className="text-xs text-amber-700 mt-2">
              نمرات این مضمون توسط سرمعلم تایید شده و برای معلم قابل ویرایش نیست.
            </p>
          )}
        </>
      )}
    </div>
  );
}
