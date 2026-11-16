'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { gradeName } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ClassInfo, TeacherInfo, SubjectInfo } from '@/lib/types';
import { Plus, Pencil, Trash2, School, BookOpen, UserLock, CalendarDays, Copy, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_FORM = { id: '', grade: '1', name: '', supervisorId: '', actingSupervisorId: '', capacity: '', monthlyFee: '' };

const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

interface ScheduleSlotInfo {
  id: string; classId: string; className: string;
  subjectId: string; subjectName: string;
  teacherId: string | null; teacherName: string | null;
  day: number; period: number;
}

export function ClassesView({ user }: { user: SessionUser }) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [assignClass, setAssignClass] = useState<ClassInfo | null>(null);
  const [assignSubject, setAssignSubject] = useState('');
  const [assignTeacher, setAssignTeacher] = useState('');
  // برنامهٔ هفتگی + دیالوگ ویرایش یک اسلات
  const [schedClass, setSchedClass] = useState<ClassInfo | null>(null);
  const [slots, setSlots] = useState<ScheduleSlotInfo[]>([]);
  const [slotEdit, setSlotEdit] = useState<{ day: number; period: number; existing?: ScheduleSlotInfo } | null>(null);
  const [slotSubject, setSlotSubject] = useState('');
  const [slotTeacher, setSlotTeacher] = useState('');
  // کپی تقسیم مضامین از صنف دیگر
  const [copyFrom, setCopyFrom] = useState('');
  const { toast } = useToast();

  const canEdit = ['ADMIN', 'HEADTEACHER'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t, s] = await Promise.all([
        apiGet<{ classes: ClassInfo[] }>('/api/classes'),
        apiGet<{ teachers: TeacherInfo[] }>('/api/teachers'),
        apiGet<{ subjects: SubjectInfo[] }>('/api/subjects'),
      ]);
      setClasses(c.classes);
      setTeachers(t.teachers);
      setSubjects(s.subjects);
      try {
        const sch = await apiGet<{ slots: ScheduleSlotInfo[] }>('/api/schedule');
        setSlots(sch.slots || []);
      } catch { /* برنامهٔ هفتگی هنوز خالی است */ }
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const save = async () => {
    const res = await apiSend('/api/classes', form.id ? 'PATCH' : 'POST', {
      ...form, grade: Number(form.grade),
      supervisorId: form.supervisorId || null,
      actingSupervisorId: form.actingSupervisorId || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
    });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : 'ذخیره شد' });
    setDialogOpen(false);
    load();
  };

  const remove = async (c: ClassInfo) => {
    if (!confirm(`آیا از حذف «${c.name}» مطمئن هستید؟`)) return;
    const res = await apiSend(`/api/classes?id=${c.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  const addAssignment = async () => {
    if (!assignClass || !assignSubject) {
      toast({ title: 'خطا', description: 'مضمون را انتخاب کنید', variant: 'destructive' });
      return;
    }
    // تقسیم مضمون از طریق endpoint جداگانه انجام می‌شود
    const res2 = await apiSend('/api/classes/assign', 'POST', {
      classId: assignClass.id, subjectId: assignSubject, teacherId: assignTeacher || null,
    });
    if (res2.error) {
      toast({ title: 'خطا', description: res2.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'مضمون به صنف سپرده شد' });
    setAssignSubject('');
    setAssignTeacher('');
    load();
  };

  const removeAssignment = async (cs: { id: string }) => {
    const res = await apiSend(`/api/classes/assign?csId=${cs.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  // ─── برنامهٔ هفتگی ───
  const openSchedule = (c: ClassInfo) => {
    setSchedClass(c);
    void apiGet<{ slots: ScheduleSlotInfo[] }>('/api/schedule').then((d) => setSlots(d.slots || [])).catch(() => {});
  };

  const openSlot = (day: number, period: number) => {
    if (!schedClass) return;
    const existing = slots.find((s) => s.classId === schedClass.id && s.day === day && s.period === period);
    setSlotEdit({ day, period, existing });
    setSlotSubject(existing?.subjectId || '');
    setSlotTeacher(existing?.teacherId || '');
  };

  /** پیش‌هشدار تداخل معلم — سرور هم با ۴۰۹ گارد می‌کند */
  const clashInfo = (teacherId: string, day: number, period: number, exceptClassId?: string) => {
    if (!teacherId) return null;
    const hit = slots.find((s) => s.teacherId === teacherId && s.day === day && s.period === period && s.classId !== exceptClassId);
    return hit ? `${hit.className} (${hit.subjectName})` : null;
  };

  const saveSlot = async () => {
    if (!schedClass || !slotEdit) return;
    if (!slotSubject) {
      toast({ title: 'مضمون را انتخاب کنید', variant: 'destructive' });
      return;
    }
    const clash = clashInfo(slotTeacher, slotEdit.day, slotEdit.period, schedClass.id);
    if (clash && !window.confirm(`تداخل زمانی: این معلم در همین وقت در صنف ${clash} است. آیا باز هم ذخیره شود؟\n(تداخل روی سرور رد می‌شود — ابتدا برنامهٔ آن صنف را اصلاح کنید)`)) return;
    const res = await apiSend('/api/schedule', 'POST', {
      classId: schedClass.id, subjectId: slotSubject, teacherId: slotTeacher || null,
      day: slotEdit.day, period: slotEdit.period,
    }, { queueLabel: `برنامهٔ هفتگی ${schedClass.name}` });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : 'برنامهٔ هفتگی ذخیره شد' });
    setSlotEdit(null);
    void load();
    void apiGet<{ slots: ScheduleSlotInfo[] }>('/api/schedule').then((d) => setSlots(d.slots || [])).catch(() => {});
  };

  const clearSlot = async () => {
    if (!schedClass || !slotEdit?.existing) return;
    const res = await apiSend(`/api/schedule?id=${slotEdit.existing.id}`, 'DELETE');
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    setSlotEdit(null);
    void load();
    void apiGet<{ slots: ScheduleSlotInfo[] }>('/api/schedule').then((d) => setSlots(d.slots || [])).catch(() => {});
  };

  // ─── کپی تقسیم مضامین از صنف دیگر ───
  const copyDivision = async () => {
    if (!assignClass || !copyFrom) return;
    if (!window.confirm(`تقسیم مضامین از صنف انتخابی به «${assignClass.name}» کپی شود؟ مضامین موجود دست نمی‌خورند.`)) return;
    const res = await apiSend<{ copied?: number }>('/api/classes/assign', 'POST', {
      action: 'copy-division', fromClassId: copyFrom, toClassId: assignClass.id,
    });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : `${toPersianDigits(res.data?.copied ?? 0)} مضمون کپی شد` });
    setCopyFrom('');
    load();
  };

  if (loading) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="صنف‌ها و تقسیم مضامین"
        subtitle="مدیریت صنف اول تا دوازدهم، نگران صنف و سپردن مضامین به معلمان"
        icon={School}
        actions={canEdit && (
          <Button onClick={() => { setForm({ ...EMPTY_FORM, name: gradeName(Number(EMPTY_FORM.grade)) }); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> صنف جدید
          </Button>
        )}
      />

      {classes.length === 0 ? (
        <EmptyState message="هیچ صنفی ثبت نشده است." icon={School} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map((c) => (
            <Card key={c.id} className="border-emerald-100 dark:border-emerald-500/25">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-emerald-900 dark:text-emerald-200">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      شاگردان: {toPersianDigits(c.studentCount || 0)}
                      {c.capacity ? ` از ${toPersianDigits(c.capacity)}` : ''}
                      {' | '}نگران صنف: {c.supervisorName || 'تعیین نشده'}
                    </p>
                    {c.capacity != null && c.studentCount != null && c.studentCount >= c.capacity && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        ظرفیت تکمیل است ({toPersianDigits(c.studentCount)}/{toPersianDigits(c.capacity)})
                      </p>
                    )}
                    {c.actingSupervisorName && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 flex items-center gap-1">
                        <UserLock className="h-3 w-3" /> نگران موقت: {c.actingSupervisorName}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => {
                          setForm({
                            id: c.id, grade: String(c.grade), name: c.name, supervisorId: c.supervisorId || '',
                            actingSupervisorId: c.actingSupervisorId || '',
                            capacity: c.capacity != null ? String(c.capacity) : '',
                            monthlyFee: c.monthlyFee != null ? String(c.monthlyFee) : '',
                          });
                          setDialogOpen(true);
                        }}
                        aria-label="ویرایش صنف"
                      >
                        <Pencil className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      </Button>
                      {user.role === 'ADMIN' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(c)} aria-label="حذف صنف">
                          <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <Separator className="my-3" />

                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> مضامین سپرده‌شده ({toPersianDigits(c.classSubjects?.length || 0)})
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto nice-scroll">
                  {(c.classSubjects || []).map((cs) => (
                    <div key={cs.id} className="flex items-center justify-between rounded-md bg-emerald-50 dark:bg-emerald-500/10/70 border border-emerald-50 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{cs.subject.name}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {cs.teacher ? cs.teacher.name : <span className="text-amber-600 dark:text-amber-400">بدون معلم</span>}
                        {canEdit && (
                          <button onClick={() => removeAssignment(cs)} className="text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:text-rose-300" aria-label="حذف مضمون">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {(c.classSubjects || []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-2">هیچ مضمونی سپرده نشده است.</p>
                  )}
                </div>

                {canEdit && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button variant="outline" size="sm" className="gap-1 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40"
                      onClick={() => { setAssignClass(c); setAssignSubject(''); setAssignTeacher(''); setCopyFrom(''); }}>
                      <Plus className="h-3.5 w-3.5" /> سپردن مضمون
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-500/40"
                      onClick={() => openSchedule(c)}>
                      <CalendarDays className="h-3.5 w-3.5" /> برنامهٔ هفتگی
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* دیالوگ صنف */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? 'ویرایش صنف' : 'صنف جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="شمارهٔ صنف">
              <Select
                value={form.grade}
                onValueChange={(v) => setForm({ ...form, grade: v, name: form.id ? form.name : gradeName(Number(v)) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <SelectItem key={g} value={String(g)}>{toPersianDigits(g)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="نام صنف">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="نگران صنف">
              <Select value={form.supervisorId || 'none'} onValueChange={(v) => setForm({ ...form, supervisorId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب معلم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">تعیین نشده</SelectItem>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.position})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="نگران موقت (در غیاب نگران اصلی)"
              hint="تا زمان تغییر، همین شخص حاضری صنف و دسترسی‌های نگران را دارد — مثلاً وقتی نگران مریض است"
            >
              <Select value={form.actingSupervisorId || 'none'} onValueChange={(v) => setForm({ ...form, actingSupervisorId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="بدون نگران موقت" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون نگران موقت</SelectItem>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.position})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ظرفیت صنف" hint="خالی = بدون حد — در صورت تکمیل هشدار می‌دهد">
                <Input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="مثال: ۴۰" />
              </Field>
              <Field label="فیس ماهانه (افغانی)" hint="پیش‌فرض بخش مالی">
                <Input type="number" min="0" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} placeholder="مثال: ۳۰۰" />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>{form.id ? 'ذخیره' : 'ایجاد صنف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ تقسیم مضمون */}
      <Dialog open={!!assignClass} onOpenChange={(v) => !v && setAssignClass(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>سپردن مضمون — {assignClass?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="مضمون *">
              <Select value={assignSubject} onValueChange={setAssignSubject}>
                <SelectTrigger><SelectValue placeholder="انتخاب مضمون" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="معلم مضمون">
              <Select value={assignTeacher || 'none'} onValueChange={setAssignTeacher}>
                <SelectTrigger><SelectValue placeholder="انتخاب معلم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون معلم</SelectItem>
                  {teachers.filter((t) => t.active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Separator />
            <Field
              label="کپی تقسیم مضامین از صنف دیگر"
              hint="برای سال تحصیلی جدید: همهٔ مضامین و معلمان صنف مبدأ به این صنف کپی می‌شود (مضامین موجود دست نمی‌خورند)"
            >
              <div className="flex gap-2">
                <Select value={copyFrom} onValueChange={setCopyFrom}>
                  <SelectTrigger><SelectValue placeholder="انتخاب صنف مبدأ…" /></SelectTrigger>
                  <SelectContent>
                    {classes.filter((x) => x.id !== assignClass?.id).map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.name} ({toPersianDigits(x.classSubjects?.length || 0)} مضمون)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-1 shrink-0" disabled={!copyFrom} onClick={copyDivision}>
                  <Copy className="h-4 w-4" /> کپی
                </Button>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignClass(null)}>انصراف</Button>
            <Button onClick={addAssignment}>سپردن مضمون</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* دیالوگ برنامهٔ هفتگی */}
      <Dialog open={!!schedClass} onOpenChange={(v) => !v && setSchedClass(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>برنامهٔ هفتگی — {schedClass?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            روی هر خانه بزنید تا مضمون و معلم آن وقت ثبت شود؛ اگر همان معلم در همین وقت در صنف دیگر باشد، هشدار تداخل زمانی می‌بینید.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border p-1.5 bg-muted">پریود</th>
                  {DAYS.map((d) => <th key={d} className="border p-1.5 bg-muted min-w-[90px]">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p}>
                    <td className="border p-1.5 text-center font-semibold bg-muted/50">{toPersianDigits(p)}</td>
                    {DAYS.map((_, di) => {
                      const slot = schedClass ? slots.find((s) => s.classId === schedClass.id && s.day === di && s.period === p) : undefined;
                      return (
                        <td key={di} className="border p-0">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => openSlot(di, p)}
                              className={cn('w-full min-h-[44px] p-1 text-center hover:bg-accent/60 transition-colors',
                                slot ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'text-muted-foreground/50')}
                            >
                              {slot ? (
                                <>
                                  <span className="block font-medium text-[11px] leading-4">{slot.subjectName}</span>
                                  <span className="block text-[10px] text-muted-foreground leading-4">{slot.teacherName || 'بدون معلم'}</span>
                                </>
                              ) : '+'}
                            </button>
                          ) : (
                            <div className={cn('w-full min-h-[44px] p-1 text-center', slot && 'bg-emerald-50 dark:bg-emerald-950/40')}>
                              {slot ? (
                                <>
                                  <span className="block font-medium text-[11px] leading-4">{slot.subjectName}</span>
                                  <span className="block text-[10px] text-muted-foreground leading-4">{slot.teacherName || ''}</span>
                                </>
                              ) : <span className="text-muted-foreground/30">—</span>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ویرایش یک اسلات */}
      <Dialog open={!!slotEdit} onOpenChange={(v) => !v && setSlotEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {slotEdit ? `${DAYS[slotEdit.day]} — پریود ${toPersianDigits(slotEdit.period)}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Field label="مضمون *">
              <Select value={slotSubject} onValueChange={setSlotSubject}>
                <SelectTrigger><SelectValue placeholder="انتخاب مضمون" /></SelectTrigger>
                <SelectContent>
                  {(schedClass?.classSubjects || []).map((cs) => (
                    <SelectItem key={cs.subjectId} value={cs.subjectId}>{cs.subject.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(schedClass?.classSubjects || []).length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">اول برای این صنف مضمون سپرده شود (دکمهٔ «سپردن مضمون»)</p>
              )}
            </Field>
            <Field label="معلم">
              <Select value={slotTeacher || 'none'} onValueChange={setSlotTeacher}>
                <SelectTrigger><SelectValue placeholder="انتخاب معلم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون معلم</SelectItem>
                  {teachers.filter((t) => t.active).map((t) => {
                    const clash = slotEdit && slotTeacher === t.id ? clashInfo(t.id, slotEdit.day, slotEdit.period, schedClass?.id) : null;
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{clash ? ` — تداخل با ${clash}` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {slotEdit && slotTeacher && clashInfo(slotTeacher, slotEdit.day, slotEdit.period, schedClass?.id) && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  این معلم در همین وقت در صنف {clashInfo(slotTeacher, slotEdit.day, slotEdit.period, schedClass?.id)} است
                </p>
              )}
            </Field>
          </div>
          <DialogFooter>
            {slotEdit?.existing && (
              <Button variant="ghost" className="text-rose-600 dark:text-rose-400 ms-auto" onClick={clearSlot}>خالی کردن این وقت</Button>
            )}
            <Button variant="outline" onClick={() => setSlotEdit(null)}>انصراف</Button>
            <Button onClick={saveSlot}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
