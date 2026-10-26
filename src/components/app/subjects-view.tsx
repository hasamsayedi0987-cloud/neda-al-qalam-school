'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, SubjectInfo } from '@/lib/types';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';
import { toPersianDigits } from '@/lib/jalali';

export function SubjectsView({ user }: { user: SessionUser }) {
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('');
  const [editId, setEditId] = useState('');
  const { toast } = useToast();

  const canEdit = ['ADMIN', 'HEADTEACHER'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ subjects: SubjectInfo[] }>('/api/subjects');
      setSubjects(data.subjects);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const save = async () => {
    if (!name.trim()) {
      toast({ title: 'خطا', description: 'نام مضمون ضروری است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/subjects', editId ? 'PATCH' : 'POST', {
      id: editId, name,
      code: code.trim() || null,
      credits: credits.trim() ? Number(credits) : null,
    });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : 'ذخیره شد' });
    setDialogOpen(false);
    setName('');
    setCode('');
    setCredits('');
    setEditId('');
    load();
  };

  const remove = async (s: SubjectInfo) => {
    if (!confirm(`آیا از حذف مضمون «${s.name}» مطمئن هستید؟ نمرات این مضمون در همهٔ صنف‌ها حذف می‌شود.`)) return;
    let res = await apiSend(`/api/subjects?id=${s.id}`, 'DELETE');
    // ۴۰۹ = مضمون نمرات ثبت‌شده دارد — با تایید صریح دوم حذف قطعی انجام می‌شود
    if (res.error && res.status === 409) {
      if (!confirm(res.error + '\n\nآیا مطمئن به حذف قطعی هستید؟ این عملیات بازگشت‌پذیر نیست.')) return;
      res = await apiSend(`/api/subjects?id=${s.id}&force=1`, 'DELETE');
    }
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
        title="مضامین درسی"
        subtitle="مدیریت مضامین مطابق نصاب تعلیمی"
        icon={BookOpen}
        actions={canEdit && (
          <Button onClick={() => { setName(''); setCode(''); setCredits(''); setEditId(''); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> مضمون جدید
          </Button>
        )}
      />

      <Card className="border-emerald-100">
        <CardContent className="p-0">
          {subjects.length === 0 ? (
            <EmptyState message="هیچ مضمونی ثبت نشده است." icon={BookOpen} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>کد</TableHead>
                  <TableHead>نام مضمون</TableHead>
                  <TableHead>واحد</TableHead>
                  {canEdit && <TableHead className="text-left">عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{toPersianDigits(i + 1)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{s.code || '—'}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-center text-xs">{s.credits ? toPersianDigits(s.credits) : '—'}</TableCell>
                    {canEdit && (
                      <TableCell className="text-left">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => { setName(s.name); setCode(s.code || ''); setCredits(s.credits ? String(s.credits) : ''); setEditId(s.id); setDialogOpen(true); }} aria-label="ویرایش">
                            <Pencil className="h-4 w-4 text-emerald-700" />
                          </Button>
                          {user.role === 'ADMIN' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(s)} aria-label="حذف">
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
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'ویرایش مضمون' : 'مضمون جدید'}</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <Field label="نام مضمون *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: ریاضیات" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="کد اختصاصی" hint="برای کارنامه و اسناد">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: MATH-07" />
              </Field>
              <Field label="تعداد واحد درسی">
                <Input type="number" min="0" max="12" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="مثال: ۴" />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
