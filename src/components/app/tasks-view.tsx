'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field, JalaliDatePicker } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Plus, BookMarked, CheckCircle2, Trash2, Clock, Loader } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status: string;
  staff?: { id: string; name: string; position: string } | null;
  assigner?: { name: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'در انتظار', cls: 'bg-amber-500' },
  IN_PROGRESS: { label: 'در حال انجام', cls: 'bg-sky-600' },
  DONE: { label: 'انجام شد', cls: 'bg-emerald-600' },
};

export function TasksView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canAssign = ['ADMIN', 'HEADTEACHER'].includes(user.role);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string; position: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', staffId: '', dueDate: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ tasks: Task[]; staff: Array<{ id: string; name: string; position: string }> }>('/api/tasks');
      setTasks(data.tasks);
      setStaff(data.staff);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const save = async () => {
    if (!form.title.trim() || !form.staffId) {
      toast({ title: 'خطا', description: 'عنوان و مسوول وظیفه لازم است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/tasks', 'POST', form);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'وظیفه ثبت شد' });
    setDialogOpen(false);
    setForm({ title: '', description: '', staffId: '', dueDate: '' });
    load();
  };

  const setStatus = async (t: Task, status: string) => {
    const res = await apiSend('/api/tasks', 'PATCH', { id: t.id, status });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  const remove = async (t: Task) => {
    if (!confirm(`حذف وظیفهٔ «${t.title}»؟`)) return;
    const res = await apiSend(`/api/tasks?id=${t.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  if (loading) return <LoadingBlock rows={4} />;

  const pending = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');

  return (
    <div>
      <PageHeader
        title="وظایف کارمندان"
        subtitle={canAssign ? 'محول کردن وظیفه به ملازم، کارمندان و معلمان' : 'وظایف محول‌شده به شما'}
        icon={BookMarked}
        actions={canAssign && (
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> وظیفهٔ جدید
          </Button>
        )}
      />

      {tasks.length === 0 ? (
        <EmptyState message="وظیفه‌ای ثبت نشده است." icon={BookMarked} />
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-emerald-900">در جریان ({toPersianDigits(pending.length)})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pending.map((t) => (
                  <Card key={t.id} className="border-emerald-100">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-emerald-900">{t.title}</p>
                          {t.description && <p className="text-xs text-muted-foreground mt-1 leading-5">{t.description}</p>}
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                            {t.staff && <Badge variant="outline" className="text-[10px]">{t.staff.name} ({t.staff.position})</Badge>}
                            {t.dueDate && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" /> مهلت: {isoToJalaliDisplay(t.dueDate)}
                              </span>
                            )}
                            {t.assigner && <span>محول‌کننده: {t.assigner.name}</span>}
                          </div>
                        </div>
                        <Badge className={STATUS_META[t.status].cls}>{STATUS_META[t.status].label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {t.status !== 'IN_PROGRESS' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus(t, 'IN_PROGRESS')}>
                            <Loader className="h-3 w-3" /> شروع
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-emerald-300 text-emerald-800" onClick={() => setStatus(t, 'DONE')}>
                          <CheckCircle2 className="h-3 w-3" /> انجام شد
                        </Button>
                        {canAssign && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 gap-1" onClick={() => remove(t)}>
                            <Trash2 className="h-3 w-3" /> حذف
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {done.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-emerald-900 mt-6">انجام‌شده ({toPersianDigits(done.length)})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {done.map((t) => (
                  <div key={t.id} className={cn('rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm flex items-center justify-between gap-2')}>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.staff?.name}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>وظیفهٔ جدید</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="عنوان وظیفه *">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: نظم‌دهی اسناد صنف دهم" />
            </Field>
            <Field label="مسوول انجام *">
              <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب کارمند/معلم" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="مهلت انجام (شمسی)">
              <JalaliDatePicker value={form.dueDate} onChange={(iso) => setForm({ ...form, dueDate: iso })} />
            </Field>
            <Field label="توضیحات">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>ثبت وظیفه</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
