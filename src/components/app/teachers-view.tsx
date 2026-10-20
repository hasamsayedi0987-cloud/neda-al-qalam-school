'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, TeacherInfo } from '@/lib/types';
import { Plus, Pencil, Trash2, UserCog, BookOpen } from 'lucide-react';

const POSITIONS = ['معلم', 'سرمعلم', 'مدیر', 'ملازم', 'کارمند', 'کتابخانه‌دار'];

const EMPTY_FORM = {
  id: '', name: '', fatherName: '', position: 'معلم', phone: '',
  education: '', hireDate: '', active: true,
};

export function TeachersView({ user }: { user: SessionUser }) {
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const { toast } = useToast();

  const canEdit = ['ADMIN', 'HEADTEACHER'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ teachers: TeacherInfo[] }>('/api/teachers');
      setTeachers(data.teachers);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'خطا', description: 'نام ضروری است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/teachers', form.id ? 'PATCH' : 'POST', form);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'ذخیره شد', description: 'معلومات با موفقیت ثبت گردید' });
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (t: TeacherInfo) => {
    const res = await apiSend('/api/teachers', 'PATCH', { id: t.id, active: !t.active });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  const remove = async (t: TeacherInfo) => {
    if (!confirm(`آیا از حذف «${t.name}» مطمئن هستید؟`)) return;
    const res = await apiSend(`/api/teachers?id=${t.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'حذف شد' });
    load();
  };

  if (loading) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="معلمان و کارمندان"
        subtitle="معلمان، سرمعلم، ملازم، کارمندان و کتابخانه‌دار"
        icon={UserCog}
        actions={canEdit && (
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> افزودن جدید
          </Button>
        )}
      />

      <Card className="border-emerald-100">
        <CardContent className="p-0">
          {teachers.length === 0 ? (
            <EmptyState message="هیچ معلم یا کارمندی ثبت نشده است." icon={UserCog} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-emerald-50 z-10">
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>ولد</TableHead>
                    <TableHead>وظیفه</TableHead>
                    <TableHead className="hidden md:table-cell">تحصیلات</TableHead>
                    <TableHead className="hidden md:table-cell">تماس</TableHead>
                    <TableHead className="hidden lg:table-cell">حساب کاربری</TableHead>
                    <TableHead>مضامین سپرده‌شده</TableHead>
                    <TableHead>فعال</TableHead>
                    {canEdit && <TableHead className="text-left">عملیات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((t, i) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.fatherName || '—'}</TableCell>
                      <TableCell>
                        <Badge className={t.position === 'مدیر' ? 'bg-emerald-700' : t.position === 'سرمعلم' ? 'bg-teal-600' : 'bg-emerald-600'}>
                          {t.position}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{t.education || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs" dir="ltr">{t.phone ? t.phone : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs" dir="ltr">
                        {t.username ? (
                          <span className={t.userActive ? 'text-emerald-700' : 'text-rose-600'}>
                            @{t.username}{t.userActive ? '' : ' (غیرفعال)'}
                          </span>
                        ) : 'بدون حساب'}
                      </TableCell>
                      <TableCell>
                        {(t.assignments?.length || 0) === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {t.assignments!.map((a, j) => (
                              <Badge
                                key={j}
                                variant="outline"
                                className="border-emerald-200 text-emerald-700 text-[10px] gap-0.5"
                                title={`${a.subjectName} در ${a.className}`}
                              >
                                <BookOpen className="h-2.5 w-2.5" />
                                {a.subjectName} — {a.className}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} aria-label="فعال/غیرفعال" />
                        ) : (
                          <span className={t.active ? 'text-emerald-700 text-xs' : 'text-rose-600 text-xs'}>
                            {t.active ? 'فعال' : 'غیرفعال'}
                          </span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-left">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => {
                                setForm({
                                  id: t.id, name: t.name, fatherName: t.fatherName || '', position: t.position,
                                  phone: t.phone || '', education: t.education || '', hireDate: t.hireDate || '',
                                  active: t.active,
                                });
                                setDialogOpen(true);
                              }}
                              aria-label="ویرایش"
                            >
                              <Pencil className="h-4 w-4 text-emerald-700" />
                            </Button>
                            {user.role === 'ADMIN' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(t)} aria-label="حذف">
                                <Trash2 className="h-4 w-4 text-rose-600" />
                              </Button>
                            )}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'ویرایش معلومات' : 'افزودن معلم/کارمند جدید'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <Field label="نام و تخلص *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="ولد">
              <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
            </Field>
            <Field label="وظیفه">
              <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="شماره تماس">
              <Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="مستولیت تحصیلی">
              <Input value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} placeholder="لیسانس، ماستر..." />
            </Field>
            <Field label="تاریخ استخدام (شمسی)">
              <Input dir="ltr" className="text-left" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} placeholder="1402/1/1" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>{form.id ? 'ذخیرهٔ تغییرات' : 'افزودن'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
