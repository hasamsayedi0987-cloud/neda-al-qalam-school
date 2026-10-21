'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, StudentInfo, ClassInfo } from '@/lib/types';
import { Plus, Pencil, Search, Trash2, Users, Phone, FilterX, BookOpen } from 'lucide-react';

const EMPTY_FORM = {
  id: '', firstName: '', lastName: '', fatherName: '', grandFather: '',
  gender: 'M', birthDate: '', idNumber: '', guardianName: '', guardianPhone: '',
  address: '', classId: '', rollNo: '', enrolledYear: '', status: 'ACTIVE',
};

export function StudentsView({ user }: { user: SessionUser }) {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [permStudents, setPermStudents] = useState(true); // مجوز ثبت/ویرایش شاگردان برای معلم
  const { toast } = useToast();

  const isTeacher = user.role === 'TEACHER';
  const canEdit = ['ADMIN', 'HEADTEACHER'].includes(user.role) || (isTeacher && permStudents);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        apiGet<{ students: StudentInfo[] }>('/api/students'),
        apiGet<{ classes: ClassInfo[] }>('/api/classes'),
      ]);
      setStudents(s.students);
      setClasses(c.classes);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  // مجوزهای معلمان از تنظیمات — کلیدهایی که مدیر کنترل می‌کند
  useEffect(() => {
    if (user.role !== 'TEACHER') return;
    apiGet<{ settings: Record<string, string> }>('/api/settings')
      .then((d) => setPermStudents(d.settings.permTeacherStudents !== '0'))
      .catch(() => {});
  }, [user.role]);

  const filtered = useMemo(() => {
    let list = students;
    if (classFilter !== 'all') list = list.filter((s) => s.classId === classFilter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((s) =>
        [s.firstName, s.lastName, s.fatherName].some((f) => f?.includes(q)),
      );
    }
    return list;
  }, [students, classFilter, search]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (s: StudentInfo) => {
    setForm({
      id: s.id, firstName: s.firstName, lastName: s.lastName || '', fatherName: s.fatherName,
      grandFather: s.grandFather || '', gender: s.gender, birthDate: s.birthDate || '',
      idNumber: s.idNumber || '', guardianName: s.guardianName || '', guardianPhone: s.guardianPhone || '',
      address: s.address || '', classId: s.classId || '', rollNo: s.rollNo != null ? String(s.rollNo) : '',
      enrolledYear: s.enrolledYear || '', status: s.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    // شهرت/تخلص اختیاری است — فقط اسم و نام پدر ضروری
    if (!form.firstName.trim() || !form.fatherName.trim()) {
      toast({ title: 'خطا', description: 'اسم و نام پدر ضروری است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/students', form.id ? 'PATCH' : 'POST', {
      ...form,
      rollNo: form.rollNo ? Number(form.rollNo) : undefined,
    }, { queueLabel: 'ثبت شاگرد' });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'ذخیره شد',
      description: res.queued ? 'در حافظهٔ گوشی ذخیره شد — پس از اتصال به سرور منتقل می‌شود' : 'اطلاعات شاگرد ثبت گردید',
    });
    setDialogOpen(false);
    // آفلاین هم بارگذاری می‌شود — تغییر از کش محلی (با رونویسی) فوراً نمایش داده می‌شود
    load();
  };

  const remove = async (s: StudentInfo) => {
    if (!confirm(`آیا از حذف «${fullName(s)}» مطمئن هستید؟ تمام نمرات و حاضری او نیز حذف می‌شود.`)) return;
    const res = await apiSend(`/api/students?id=${s.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'حذف شد', description: res.queued ? 'در حافظهٔ گوشی حذف شد — پس از اتصال همگام می‌شود' : undefined });
    load();
  };

  if (loading) return <LoadingBlock rows={6} />;

  return (
    <div>
      <PageHeader
        title="شاگردان"
        subtitle={isTeacher ? 'شاگردان صنف‌های تحت تدریس شما' : 'ثبت‌نام، ویرایش و مدیریت شاگردان صنف‌ها'}
        icon={Users}
        actions={canEdit && (
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> ثبت شاگرد جدید
          </Button>
        )}
      />

      {/* بنر محدودهٔ معلم */}
      {isTeacher && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-3 mb-4">
          <p className="text-sm font-semibold text-sky-900 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> صنف‌های شما
          </p>
          <p className="text-xs text-sky-800 leading-5 mt-1">
            شما فقط شاگردان صنف‌هایی را می‌بینید که در آنها مضمون تدریس می‌کنید یا نگران آن صنف هستید.
            {!permStudents && ' در حال حاضر مدیر اجازهٔ ثبت و ویرایش شاگردان را به معلمان نداده است — دسترسی شما فقط مشاهده است.'}
          </p>
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {classes.map((c) => (
                <Badge key={c.id} variant="outline" className="border-sky-300 text-sky-800">
                  {c.name}
                  {c.classSubjects?.some((cs) => cs.teacherId === user.teacherId) && (
                    <span className="text-[10px] text-sky-600">
                      {' '}({c.classSubjects.filter((cs) => cs.teacherId === user.teacherId).map((cs) => cs.subject.name).join('، ')})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="جستجو بر اساس اسم، شهرت، ولد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="همهٔ صنف‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ صنف‌ها</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(classFilter !== 'all' || search) && (
          <Button variant="ghost" onClick={() => { setClassFilter('all'); setSearch(''); }} className="gap-1">
            <FilterX className="h-4 w-4" /> پاک کردن
          </Button>
        )}
      </div>

      <Card className="border-emerald-100">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState message="هیچ شاگردی یافت نشد. با دکمهٔ «ثبت شاگرد جدید» اولین شاگرد را اضافه کنید." icon={Users} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-emerald-50 z-10">
                  <TableRow>
                    <TableHead className="w-10">شماره</TableHead>
                    <TableHead>اسم</TableHead>
                    <TableHead>شهرت</TableHead>
                    <TableHead>ولد</TableHead>
                    <TableHead className="hidden md:table-cell">صنف</TableHead>
                    <TableHead className="hidden md:table-cell">تذکره</TableHead>
                    <TableHead className="hidden lg:table-cell">سرپرست</TableHead>
                    <TableHead className="hidden lg:table-cell">تماس</TableHead>
                    <TableHead>حالت</TableHead>
                    {canEdit && <TableHead className="text-left">عملیات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s, i) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground">{toPersianDigits(s.rollNo ?? i + 1)}</TableCell>
                      <TableCell className="font-medium">{s.firstName}</TableCell>
                      <TableCell>{s.lastName || '—'}</TableCell>
                      <TableCell>{s.fatherName}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">{s.className || '—'}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{s.idNumber ? toPersianDigits(s.idNumber) : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{s.guardianName || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs" dir="ltr">
                        {s.guardianPhone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{toPersianDigits(s.guardianPhone)}</span> : '—'}
                      </TableCell>
                      <TableCell>
                        {s.status === 'ACTIVE' ? (
                          <span className="text-emerald-700 text-xs font-medium">فعال</span>
                        ) : s.status === 'GRADUATED' ? (
                          <span className="text-teal-600 text-xs">فراغت</span>
                        ) : (
                          <span className="text-rose-600 text-xs">ترک تحصیل</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-left">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="ویرایش">
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ثبت/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>{form.id ? 'ویرایش معلومات شاگرد' : 'ثبت شاگرد جدید'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <Field label="اسم *">
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="شهرت / تخلص" hint="اختیاری — در صورت نداشتن، خالی بگذارید">
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
            <Field label="ولد (نام پدر) *">
              <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
            </Field>
            <Field label="ولدیت (نام پدر کلان)">
              <Input value={form.grandFather} onChange={(e) => setForm({ ...form, grandFather: e.target.value })} />
            </Field>
            <Field label="جنسیت">
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">ذکور</SelectItem>
                  <SelectItem value="F">اناث</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="صنف">
              <Select value={form.classId || 'none'} onValueChange={(v) => setForm({ ...form, classId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون صنف</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="شماره در جدول" hint="خالی بگذارید تا خودکار تعیین شود">
              <Input type="number" min={1} value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
            </Field>
            <Field label="نمبر تذکره">
              <Input value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </Field>
            <Field label="تاریخ تولد (شمسی)" hint="مثال: 1392/4/16">
              <Input dir="ltr" className="text-left" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </Field>
            <Field label="سال شمولیت (شمسی)">
              <Input dir="ltr" className="text-left" value={form.enrolledYear} onChange={(e) => setForm({ ...form, enrolledYear: e.target.value })} />
            </Field>
            <Field label="نام سرپرست">
              <Input value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
            </Field>
            <Field label="شماره تماس سرپرست">
              <Input dir="ltr" className="text-left" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
            </Field>
            <Field label="آدرس">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="حالت شاگرد">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">فعال</SelectItem>
                  <SelectItem value="GRADUATED">فراغت</SelectItem>
                  <SelectItem value="LEFT">ترک تحصیل</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>انصراف</Button>
            <Button onClick={save}>{form.id ? 'ذخیرهٔ تغییرات' : 'ثبت شاگرد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
