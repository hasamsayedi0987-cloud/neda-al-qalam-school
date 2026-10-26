'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field, JalaliDatePicker } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ACTIVITY_TYPE_LABELS } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ActivityInfo, StudentInfo, ClassInfo } from '@/lib/types';
import { Plus, Trash2, ClipboardCheck, CalendarDays, Pencil, ImagePlus, MessageSquare, X } from 'lucide-react';

/** فشرده‌سازی عکس فعالیت — حداکثر ۴۰۰ پیکسل، JPEG ۰.۷ */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject(new Error('image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

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
  const [form, setForm] = useState({ id: '', studentId: '', type: 'HOMEWORK', score: '', note: '', date: new Date().toISOString().slice(0, 10), image: '' });
  // دسته‌بندی موضوعی + عکس فعالیت
  const [typeFilter, setTypeFilter] = useState('all');
  const [imgBusy, setImgBusy] = useState(false);
  const [viewImage, setViewImage] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    return s ? `${fullName(s)}` : 'شاگرد';
  };

  const openNew = () => {
    setForm({ id: '', studentId: '', type: 'HOMEWORK', score: '', note: '', date: new Date().toISOString().slice(0, 10), image: '' });
    setDialogOpen(true);
  };

  const openEdit = (a: ActivityInfo) => {
    setForm({ id: a.id, studentId: a.studentId, type: a.type, score: a.score != null ? String(a.score) : '', note: a.note, date: a.date, image: a.image || '' });
    setDialogOpen(true);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, image: dataUrl }));
    } catch {
      toast({ title: 'خواندن عکس ناموفق بود', variant: 'destructive' });
    }
    setImgBusy(false);
  };

  /** پیام لحظه‌ای به والد در پیام‌رسان تلفن — رشتهٔ خالی یعنی شماره ثبت نشده */
  const guardianSms = (studentId: string): string => {
    const s = students.find((x) => x.id === studentId);
    if (!s?.guardianPhone) return '';
    return `sms:${s.guardianPhone.replace(/\s+/g, '')}`;
  };

  const shown = useMemo(() => {
    if (typeFilter === 'all') return activities;
    return activities.filter((a) => a.type === typeFilter);
  }, [activities, typeFilter]);

  const save = async () => {
    if (!form.studentId || !form.note.trim()) {
      toast({ title: 'خطا', description: 'شاگرد و ملاحظات لازم است', variant: 'destructive' });
      return;
    }
    const editing = Boolean(form.id);
    const res = await apiSend('/api/activities', editing ? 'PATCH' : 'POST', {
      ...form, score: form.score ? Number(form.score) : null,
    }, { queueLabel: editing ? 'ویرایش فعالیت' : 'ثبت فعالیت' });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'ذخیره شد',
      description: res.queued ? 'در حافظهٔ گوشی ذخیره شد — پس از اتصال به سرور منتقل می‌شود' : editing ? 'فعالیت ویرایش شد' : 'فعالیت ثبت گردید',
    });
    setDialogOpen(false);
    setForm({ id: '', studentId: '', type: 'HOMEWORK', score: '', note: '', date: new Date().toISOString().slice(0, 10), image: '' });
    load();
  };

  const remove = async (a: ActivityInfo) => {
    if (!confirm('حذف این فعالیت؟')) return;
    const res = await apiSend(`/api/activities?id=${a.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'حذف شد', description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : undefined });
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
          <Button onClick={openNew} className="gap-1.5" disabled={!classId && canEdit && !isSelf}>
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
          <Field label="دستهٔ فعالیت">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ دسته‌ها</SelectItem>
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
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
                    {shown.map((a) => (
                      <TableRow key={a.id}>
                        {!isSelf && (
                          <TableCell className="font-medium">
                            {studentName(a.studentId)}
                            {canEdit && guardianSms(a.studentId) && (
                              <a href={guardianSms(a.studentId)} className="inline-flex h-6 w-6 items-center justify-center rounded-md border mr-1.5 hover:bg-accent align-middle"
                                aria-label="پیام به والد" title="پیام به والد در پیام‌رسان تلفن">
                                <MessageSquare className="h-3 w-3 text-emerald-700" />
                              </a>
                            )}
                          </TableCell>
                        )}
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
                        <TableCell className="text-xs leading-5">
                          {a.image && (
                            <button type="button" onClick={() => setViewImage(a.image || '')} className="block mb-1" aria-label="دیدن عکس فعالیت">
                              <img src={a.image} alt="عکس فعالیت" className="h-14 w-14 rounded-md border object-cover" />
                            </button>
                          )}
                          {a.note}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-left">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)} aria-label="ویرایش" title="ویرایش">
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(a)} aria-label="حذف" title="حذف">
                                <Trash2 className="h-4 w-4 text-rose-600" />
                              </Button>
                            </div>
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
          <DialogHeader><DialogTitle>{form.id ? 'ویرایش فعالیت' : 'ثبت فعالیت جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="شاگرد *">
              <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })} disabled={Boolean(form.id)}>
                <SelectTrigger><SelectValue placeholder="انتخاب شاگرد" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{fullName(s)}</SelectItem>
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
            <Field label="تاریخ (شمسی)">
              <JalaliDatePicker value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} />
            </Field>
            <Field label="ملاحظات *">
              <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: کارخانگی خویش را به‌وقت تکمیل کرد" />
            </Field>
            <Field label="عکس فعالیت (اختیاری)" hint="عکس فشرده و در حافظهٔ مکتب ذخیره می‌شود — پس از ثبت، والد در اپ خبردار می‌شود">
              <div className="flex items-center gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void pickImage(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => imageInputRef.current?.click()} disabled={imgBusy}>
                  <ImagePlus className="h-4 w-4" /> {imgBusy ? 'در حال فشرده‌سازی…' : 'انتخاب عکس'}
                </Button>
                {form.image && (
                  <div className="relative">
                    <img src={form.image} alt="پیش‌نمایش" className="h-12 w-12 rounded-md border object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image: '' })}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 text-white h-5 w-5 flex items-center justify-center"
                      aria-label="حذف عکس"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>{form.id ? 'ذخیرهٔ تغییرات' : 'ثبت'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* دیالوگ دیدن عکس کامل */}
      <Dialog open={!!viewImage} onOpenChange={(v) => !v && setViewImage('')}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>عکس فعالیت</DialogTitle></DialogHeader>
          <img src={viewImage} alt="عکس فعالیت" className="w-full rounded-lg border" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
