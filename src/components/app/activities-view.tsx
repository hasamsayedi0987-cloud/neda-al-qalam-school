'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ACTIVITY_TYPE_LABELS } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ActivityInfo, StudentInfo, ClassInfo } from '@/lib/types';
import { Plus, Trash2, ClipboardCheck, CalendarDays } from 'lucide-react';

export function ActivitiesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canEdit = ['ADMIN', 'HEADTEACHER', 'TEACHER'].includes(user.role);
  const isSelf = user.role === 'STUDENT' || user.role === 'GUARDIAN';

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [activities, setActivities] = useState<ActivityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ studentId: '', type: 'HOMEWORK', score: '', note: '', date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    if (!canEdit) return;
    apiGet<{ classes: ClassInfo[] }>('/api/classes').then((d) => setClasses(d.classes)).catch(() => {});
  }, [canEdit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = canEdit && classId ? `/api/activities?classId=${classId}` : '/api/activities';
      const data = await apiGet<{ activities: ActivityInfo[]; students: StudentInfo[] }>(url);
      setActivities(data.activities);
      setStudents(data.students);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [canEdit, classId, toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.firstName} ${s.lastName}` : 'شاگرد';
  };

  const save = async () => {
    if (!form.studentId || !form.note.trim()) {
      toast({ title: 'خطا', description: 'شاگرد و ملاحظات لازم است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/activities', 'POST', {
      ...form, score: form.score ? Number(form.score) : null,
    }, { queueLabel: 'ثبت فعالیت' });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در صف آفلاین ذخیره شد' : 'فعالیت ثبت شد' });
    setDialogOpen(false);
    setForm({ studentId: '', type: 'HOMEWORK', score: '', note: '', date: new Date().toISOString().slice(0, 10) });
    if (!res.queued) load();
  };

  const remove = async (a: ActivityInfo) => {
    if (!confirm('حذف این فعالیت؟')) return;
    const res = await apiSend(`/api/activities?id=${a.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  if (loading) return <LoadingBlock rows={4} />;

  return (
    <div>
      <PageHeader
        title="فعالیت شاگردان"
        subtitle={isSelf ? 'کارخانگی، رفتار و شرکت در درس شما' : 'کارخانگی، رفتار، شرکت در درس و ملاحظات روزانه'}
        icon={ClipboardCheck}
        actions={canEdit && (
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5" disabled={!classId && canEdit}>
            <Plus className="h-4 w-4" /> ثبت فعالیت
          </Button>
        )}
      />

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <Field label="صنف">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {!canEdit || classId || isSelf ? (
        <Card className="border-emerald-100">
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <EmptyState message={canEdit ? 'صنف را انتخاب و اولین فعالیت را ثبت کنید.' : 'فعالیتی ثبت نشده است.'} icon={ClipboardCheck} />
            ) : (
              <div className="overflow-x-auto nice-scroll max-h-[62vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-emerald-50">
                    <TableRow>
                      {!isSelf && <TableHead>شاگرد</TableHead>}
                      <TableHead>تاریخ</TableHead>
                      <TableHead>نوع فعالیت</TableHead>
                      <TableHead>امتیاز</TableHead>
                      <TableHead className="min-w-[220px]">ملاحظات</TableHead>
                      {canEdit && <TableHead className="text-left">عملیات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((a) => (
                      <TableRow key={a.id}>
                        {!isSelf && <TableCell className="font-medium">{studentName(a.studentId)}</TableCell>}
                        <TableCell className="text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 text-emerald-600" />
                            {isoToJalaliDisplay(a.date)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                            {ACTIVITY_TYPE_LABELS[a.type] || a.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{a.score != null ? toPersianDigits(a.score) : '—'}</TableCell>
                        <TableCell className="text-xs leading-5">{a.note}</TableCell>
                        {canEdit && (
                          <TableCell className="text-left">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(a)} aria-label="حذف">
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyState message="برای مشاهدهٔ فعالیت‌ها، صنف را انتخاب کنید." icon={ClipboardCheck} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ثبت فعالیت جدید</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="شاگرد *">
              <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب شاگرد" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="نوع فعالیت">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="امتیاز (اختیاری — از ۱۰۰)">
              <Input type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
            </Field>
            <Field label="تاریخ">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="ملاحظات *">
              <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: کارخانگی خویش را به‌وقت تکمیل کرد" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>ثبت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
