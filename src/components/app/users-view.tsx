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
import { Separator } from '@/components/ui/separator';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend, saveOfflineCred } from '@/lib/client/api';
import { ROLE_LABELS } from '@/lib/grading';
import { SECTIONS, MANAGEABLE_SECTIONS, parsePerms, sectionAllowed } from '@/lib/access';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, UserInfo, TeacherInfo, StudentInfo } from '@/lib/types';
import {
  Plus, Pencil, KeyRound, ShieldCheck, ShieldOff, Trash2, Ban, CheckCircle2,
  Copy, Lock, LinkIcon,
} from 'lucide-react';

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
  // دیالوگ دسترسی بخش‌ها (مسئولیت ۵ و ۶ — محدود/فعال/غیرفعال و کپی دسترسی)
  const [permsUser, setPermsUser] = useState<UserInfo | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [copyFromId, setCopyFromId] = useState('');
  const [savingPerms, setSavingPerms] = useState(false);

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

  // ─── دیالوگ دسترسی بخش‌ها ───
  const openPerms = (u: UserInfo) => {
    setPermsUser(u);
    setPermDraft(parsePerms(u.perms));
    setCopyFromId('');
  };

  const savePerms = async (perms?: Record<string, boolean>) => {
    if (!permsUser) return;
    setSavingPerms(true);
    const payload = perms ?? permDraft;
    const res = await apiSend('/api/users', 'PATCH', { id: permsUser.id, perms: payload });
    setSavingPerms(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'دسترسی‌ها ذخیره شد',
      description: res.queued
        ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود'
        : 'تغییرات از همین حالا برای این کاربر اعمال می‌شود',
    });
    setPermsUser(null);
    load();
  };

  const copyPerms = async () => {
    if (!permsUser || !copyFromId) return;
    const src = users.find((u) => u.id === copyFromId);
    if (!src) return;
    const copied = parsePerms(src.perms);
    const res = await apiSend('/api/users', 'PATCH', { id: permsUser.id, perms: copied });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'دسترسی‌ها کپی شد',
      description: `دسترسی‌های «${src.name}» به «${permsUser.name}» منتقل گردید — این کاربر از این به بعد مثل ${src.name} می‌بیند`,
    });
    setPermsUser(null);
    load();
  };

  /** تغییر سریع نقش — تعیین مدیر جدید، سرمعلم و غیره (مسئولیت ۷ و ۸) */
  const quickRole = async (u: UserInfo, role: string) => {
    if (u.role === role) return;
    const res = await apiSend('/api/users', 'PATCH', { id: u.id, role });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'نقش تغییر کرد',
      description: `${u.name} اکنون ${ROLE_LABELS[role]} است — دسترسی‌های نقش جدید بلافاصله اعمال می‌شود`,
    });
    load();
  };

  if (loading) return <LoadingBlock rows={5} />;

  return (
    <div>
      <PageHeader
        title="کاربران و دسترسی‌ها"
        subtitle="مدیریت حساب‌ها، نقش‌ها، دسترسی هر بخش، بازنشانی رمز و غیرفعال‌سازی"
        icon={ShieldCheck}
        actions={
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> کاربر جدید
          </Button>
        }
      />

      <Card className="border-emerald-100 dark:border-emerald-500/25">
        <CardContent className="p-0">
          {users.length === 0 ? (
            <EmptyState message="هیچ کاربری ثبت نشده است." icon={ShieldCheck} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[62vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-emerald-50 dark:bg-emerald-500/10 z-10">
                  <TableRow>
                    <TableHead>نام کاربری</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead className="hidden md:table-cell">پیوند</TableHead>
                    <TableHead>دسترسی</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const overrides = Object.keys(parsePerms(u.perms)).length;
                    const needsLink = ['TEACHER', 'HEADTEACHER', 'STAFF', 'LIBRARIAN'].includes(u.role) && !u.teacherId;
                    return (
                      <TableRow key={u.id}>
                        <TableCell dir="ltr" className="text-left font-mono text-xs">@{u.username}</TableCell>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>
                          {u.id === me.id || u.role === 'ADMIN' ? (
                            <Badge variant="outline" className={u.role === 'ADMIN' ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}>
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          ) : (
                            <Select value={u.role} onValueChange={(v) => quickRole(u, v)}>
                              <SelectTrigger className="h-8 w-[130px] text-xs border-emerald-200 dark:border-emerald-500/30" aria-label={`تغییر نقش ${u.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {u.studentName ? `شاگرد: ${u.studentName}` : u.teacherId ? `کارمند: ${teachers.find((t) => t.id === u.teacherId)?.name || '—'}` : needsLink ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium" title="بدون پیوند، معلم مضامین خود را نمی‌بیند">
                              <LinkIcon className="h-3 w-3 text-amber-600 dark:text-amber-400" /> بدون پیوند!
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {u.role === 'ADMIN' ? (
                            <span className="text-xs text-muted-foreground">همهٔ بخش‌ها</span>
                          ) : (
                            <Button
                              variant="outline" size="sm" className="h-8 text-xs gap-1 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                              onClick={() => openPerms(u)}
                            >
                              <Lock className="h-3 w-3" />
                              {overrides > 0 ? `${overrides} تنظیم خاص` : 'پیش‌فرض نقش'}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> فعال
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs font-medium">
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
                              <Pencil className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPwDialog(u); setNewPw(''); }} aria-label="بازنشانی رمز">
                              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </Button>
                            {u.id !== me.id && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(u)} aria-label="حذف">
                                <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10/70 p-3 text-xs text-amber-800 dark:text-amber-300 leading-6">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldOff className="h-4 w-4" /> کنترل دسترسی
          </p>
          <p>
            با «دسترسی» می‌توانید برای هر کاربر هر بخش را محدود، فعال یا غیرفعال کنید؛ با «کپی از کاربر دیگر» دسترسی‌های یک نفر را به نفر دیگر بدهید.
            برای تعیین مدیر جدید یا سرمعلم، نقش او را از ستون نقش تغییر دهید — چندین مدیر هم‌زمان مجاز است (حداقل یک مدیر فعال باید بماند).
          </p>
        </div>
        <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10/70 p-3 text-xs text-sky-800 dark:text-sky-300 leading-6">
          <p className="flex items-center gap-1.5 font-semibold">
            <LinkIcon className="h-4 w-4" /> پیوند حساب با پرونده
          </p>
          <p>
            حساب کاربران معلم/کارمند باید با پروندهٔ آنها پیوند باشد تا مضامین، صنف نگرانی و وظایفشان نمایش داده شود.
            «بدون پیوند!» را با ویرایش کاربر و انتخاب «پیوند با معلم/کارمند» اصلاح کنید — یا کاربر یک بار خارج و دوباره وارد شود تا پیوند خودکار برقرار گردد.
          </p>
        </div>
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
              <Field
                label="پیوند با معلم/کارمند"
                hint="ضروری — بدون پیوند، مضامین و صنف نگرانی نمایش داده نمی‌شود"
              >
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

      {/* دیالوگ دسترسی بخش‌ها */}
      <Dialog open={!!permsUser} onOpenChange={(v) => !v && setPermsUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>دسترسی بخش‌ها — {permsUser?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-5">
            برای هر بخش، کلید را روشن یا خاموش کنید. حالت پیش‌فرض نقش با علامت «پیش‌فرض» مشخص است؛
            تغییر کلید، پیش‌فرض را رونویسی می‌کند. این تغییرات هم در منو و هم در سرور اعمال می‌شود.
          </p>
          <div className="space-y-2 py-1">
            {MANAGEABLE_SECTIONS.map((key) => {
              const def = SECTIONS[key];
              const isDefault = def.roles.includes(permsUser?.role || '') && permDraft[key] === undefined;
              const value = sectionAllowed({ role: permsUser?.role || '', perms: JSON.stringify(permDraft) }, key);
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                      {def.label}
                      {isDefault && <span className="text-[10px] text-muted-foreground mr-1.5">(پیش‌فرض نقش)</span>}
                      {permDraft[key] !== undefined && (
                        <span className={`text-[10px] mr-1.5 ${permDraft[key] ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          ({permDraft[key] ? 'فعال‌شده توسط مدیر' : 'محدودشده توسط مدیر'})
                        </span>
                      )}
                    </p>
                    {def.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{def.hint}</p>}
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => setPermDraft({ ...permDraft, [key]: v })}
                    aria-label={def.label}
                  />
                </div>
              );
            })}
          </div>
          <Separator className="my-2" />
          <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" /> کپی دسترسی از کاربر دیگر
            </p>
            <p className="text-[11px] text-muted-foreground leading-5">
              اگر می‌خواهید این کاربر دقیقاً مثل یک کاربر دیگر ببیند، او را انتخاب کنید — همهٔ تنظیمات دسترسی او عیناً منتقل می‌شود.
            </p>
            <div className="flex gap-2">
              <Select value={copyFromId || 'none'} onValueChange={(v) => setCopyFromId(v === 'none' ? '' : v)}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="انتخاب کاربر نمونه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">انتخاب کنید…</SelectItem>
                  {users.filter((u) => u.id !== permsUser?.id && u.id !== me.id).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] || u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={copyPerms} disabled={!copyFromId} className="gap-1.5 shrink-0">
                <Copy className="h-4 w-4" /> کپی
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost" onClick={() => { setPermDraft({}); savePerms({}); }}
              disabled={savingPerms}
            >
              بازگشت به پیش‌فرض نقش
            </Button>
            <Button variant="outline" onClick={() => setPermsUser(null)}>انصراف</Button>
            <Button onClick={() => savePerms()} disabled={savingPerms}>
              ذخیرهٔ دسترسی‌ها
            </Button>
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
            <Input dir="ltr" className="text-left" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
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
