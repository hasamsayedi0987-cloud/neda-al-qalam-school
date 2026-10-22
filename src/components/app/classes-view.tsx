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
import { Plus, Pencil, Trash2, School, BookOpen, UserLock } from 'lucide-react';

const EMPTY_FORM = { id: '', grade: '1', name: '', supervisorId: '', actingSupervisorId: '' };

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
    });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'ذخیره شد' });
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
            <Card key={c.id} className="border-emerald-100">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-emerald-900">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      شاگردان: {toPersianDigits(c.studentCount || 0)} | نگران صنف: {c.supervisorName || 'تعیین نشده'}
                    </p>
                    {c.actingSupervisorName && (
                      <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
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
                          });
                          setDialogOpen(true);
                        }}
                        aria-label="ویرایش صنف"
                      >
                        <Pencil className="h-4 w-4 text-emerald-700" />
                      </Button>
                      {user.role === 'ADMIN' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(c)} aria-label="حذف صنف">
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <Separator className="my-3" />

                <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" /> مضامین سپرده‌شده ({toPersianDigits(c.classSubjects?.length || 0)})
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto nice-scroll">
                  {(c.classSubjects || []).map((cs) => (
                    <div key={cs.id} className="flex items-center justify-between rounded-md bg-emerald-50/70 border border-emerald-50 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{cs.subject.name}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {cs.teacher ? cs.teacher.name : <span className="text-amber-600">بدون معلم</span>}
                        {canEdit && (
                          <button onClick={() => removeAssignment(cs)} className="text-rose-500 hover:text-rose-700" aria-label="حذف مضمون">
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
                  <Button variant="outline" size="sm" className="w-full mt-3 gap-1 text-emerald-800 border-emerald-300"
                    onClick={() => { setAssignClass(c); setAssignSubject(''); setAssignTeacher(''); }}>
                    <Plus className="h-3.5 w-3.5" /> سپردن مضمون به این صنف
                  </Button>
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
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignClass(null)}>انصراف</Button>
            <Button onClick={addAssignment}>سپردن مضمون</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
