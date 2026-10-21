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
import { fullName } from '@/lib/utils';
import { apiGet, apiSend, saveOfflineCred } from '@/lib/client/api';
import { ROLE_LABELS } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, UserInfo, TeacherInfo, StudentInfo } from '@/lib/types';
import { Plus, Pencil, KeyRound, ShieldCheck, ShieldOff, Trash2, Ban, CheckCircle2 } from 'lucide-react';

const ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];

const EMPTY_FORM = {
  id: '', username: '', password: '', name: '', role: 'TEACHER',
  phone: '', teacherId: '', studentId: '',
};

export function UsersView({ user: me }: { user: SessionUser }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [pwDialog, setPwDialog] = useState<UserInfo | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, t, s] = await Promise.all([
        apiGet<{ users: UserInfo[] }>('/api/users'),
        apiGet<{ teachers: TeacherInfo[] }>('/api/teachers'),
        apiGet<{ students: StudentInfo[] }>('/api/students'),
      ]);
      setUsers(u.users);
      setTeachers(t.teachers);
      setStudents(s.students);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const save = async () => {
    const uname = form.username.trim();
    if (!uname || !form.name.trim() || (!form.id && !form.password)) {
      toast({ title: 'خطا', description: 'نام کاربری، نام و رمز عبور ضروری است', variant: 'destructive' });
      return;
    }
    if (!form.id && !/^[a-z0-9._\-@]+$/i.test(uname)) {
      toast({ title: 'خطا', description: 'نام کاربری فقط حروف انگلیسی، عدد و . _ - @ می‌تواند داشته باشد', variant: 'destructive' });
      return;
    }
    // مانند سرور: رمز حداقل ۶ حرف — پیش از صف‌شدن چک می‌شود تا داده هرگز رد نشده نابود نشود
    if (!form.id && form.password.length < 6) {
      toast({ title: 'خطا', description: 'رمز عبور باید حداقل ۶ حرف باشد', variant: 'destructive' });
      return;
    }
    // بررسی تکراری‌بودن در همین دستگاه (شامل ثبت‌های آفلاین هنوز همگام‌نشده) — پیام فوری
    if (!form.id && users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
      toast({ title: 'خطا', description: 'این نام کاربری قبلاً ثبت شده است', variant: 'destructive' });
      return;
    }
    const res = await apiSend<{ id?: string }>('/api/users', form.id ? 'PATCH' : 'POST', form);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    // کاربر تازه‌ساختهٔ آفلاین — همان لحظه برای ورود آفلاین روی همین دستگاه آماده می‌شود
    if (res.queued && res.tempId && form.password) {
      void saveOfflineCred(
        {
          id: res.tempId,
          username: uname.toLowerCase(),
          name: form.name.trim(),
          role: form.role,
          phone: form.phone || null,
          teacherId: form.teacherId || null,
          studentId: form.studentId || null,
        },
        form.password,
        false, // کاربر جاری (مدیر) تغییر نمی‌کند — ورود مجدد خودکار همچنان با حساب مدیر است
      );
    }
    toast({
      title: 'ذخیره شد',
      description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال خودکار به سرور می‌رود' : 'حساب کاربری ثبت گردید',
    });
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (u: UserInfo) => {
    if (u.id === me.id) {
      toast({ title: 'خطا', description: 'نمی‌توانید حساب خودتان را غیرفعال کنید', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/users', 'PATCH', { id: u.id, active: !u.active });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: u.active ? 'کاربر غیرفعال شد' : 'کاربر فعال شد',
      description: u.active ? 'این کاربر دیگر نمی‌تواند وارد سیستم شود' : 'دسترسی ورود بازگردانده شد',
    });
    load();
  };

  const remove = async (u: UserInfo) => {
    if (!confirm(`آیا از حذف کامل حساب «${u.name}» مطمئن هستید؟`)) return;
    const res = await apiSend(`/api/users?id=${u.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'حساب حذف شد', description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : undefined });
    load();
  };

  const resetPassword = async () => {
    if (!pwDialog || newPw.length < 6) {
      toast({ title: 'خطا', description: 'رمز باید حداقل ۶ حرف باشد', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/users', 'PATCH', { id: pwDialog.id, newPassword: newPw });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'رمز عبور بازنشانی شد' });
    setPwDialog(null);
    setNewPw('');
  };

  if (loading) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="کاربران و دسترسی‌ها"
        subtitle="مدیریت حساب‌ها، بازنشانی رمز، غیرفعال‌سازی و حذف — کاربر غیرفعال نمی‌تواند وارد شود"
        icon={ShieldCheck}
        actions={
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> کاربر جدید
          </Button>
        }
      />

      <Card className="border-emerald-100">
        <CardContent className="p-0">
          {users.length === 0 ? (
            <EmptyState message="هیچ کاربری ثبت نشده است." icon={ShieldCheck} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[62vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-emerald-50 z-10">
                  <TableRow>
                    <TableHead>نام کاربری</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead className="hidden md:table-cell">پیوند</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell dir="ltr" className="text-left font-mono text-xs">@{u.username}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={u.role === 'ADMIN' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-emerald-200 text-emerald-700'}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {u.studentName ? `شاگرد: ${u.studentName}` : u.teacherId ? `کارمند: ${teachers.find((t) => t.id === u.teacherId)?.name || '—'}` : '—'}
                      </TableCell>
                      <TableCell>
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> فعال
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-medium">
                            <Ban className="h-3.5 w-3.5" /> غیرفعال
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex gap-1 justify-end items-center">
                          <Switch
                            checked={u.active}
                            onCheckedChange={() => toggleActive(u)}
                            disabled={u.id === me.id}
                            aria-label="فعال/غیرفعال"
                          />
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => {
                              setForm({
                                id: u.id, username: u.username, password: '', name: u.name, role: u.role,
                                phone: u.phone || '', teacherId: u.teacherId || '', studentId: u.studentId || '',
                              });
                              setDialogOpen(true);
                            }}
                            aria-label="ویرایش"
                          >
                            <Pencil className="h-4 w-4 text-emerald-700" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPwDialog(u); setNewPw(''); }} aria-label="بازنشانی رمز">
                            <KeyRound className="h-4 w-4 text-amber-600" />
                          </Button>
                          {u.id !== me.id && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(u)} aria-label="حذف">
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 leading-6">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldOff className="h-4 w-4" /> راهنمای دسترسی
        </p>
        <p>با غیرفعال کردن یا حذف یک کاربر، او بلافاصله دیگر نمی‌تواند به سیستم وارد شود؛ نشست فعال او نیز به‌صورت خودکار باطل می‌گردد.</p>
      </div>

      {/* دیالوگ کاربر */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader><DialogTitle>{form.id ? 'ویرایش کاربر' : 'کاربر جدید'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Field
              label="نام کاربری *"
              hint={form.id ? 'قابل تغییر — دفعهٔ بعد با همین نام جدید وارد شوید' : undefined}
            >
              <Input dir="ltr" className="text-left" value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label={form.id ? 'رمز (تغییر نکردن = خالی)' : 'رمز عبور *'}>
              <Input dir="ltr" className="text-left" type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="نام کامل *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="نقش">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="شماره تماس">
              <Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            {(form.role === 'TEACHER' || form.role === 'HEADTEACHER' || form.role === 'STAFF' || form.role === 'LIBRARIAN') && (
              <Field label="پیوند با معلم/کارمند">
                <Select value={form.teacherId || 'none'} onValueChange={(v) => setForm({ ...form, teacherId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون پیوند</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.position})</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {(form.role === 'STUDENT' || form.role === 'GUARDIAN') && (
              <Field label="پیوند با شاگرد">
                <Select value={form.studentId || 'none'} onValueChange={(v) => setForm({ ...form, studentId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="انتخاب شاگرد" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون پیوند</SelectItem>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{fullName(s)} — {s.className || 'بدون صنف'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>{form.id ? 'ذخیرهٔ تغییرات' : 'ایجاد حساب'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ بازنشانی رمز */}
      <Dialog open={!!pwDialog} onOpenChange={(v) => !v && setPwDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>بازنشانی رمز — {pwDialog?.name}</DialogTitle>
          </DialogHeader>
          <Field label="رمز عبور جدید (حداقل ۶ حرف)">
            <Input dir="ltr" className="text-left" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(null)}>انصراف</Button>
            <Button onClick={resetPassword}>بازنشانی</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
