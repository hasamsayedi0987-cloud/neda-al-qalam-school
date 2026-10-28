'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend } from '@/lib/client/api';
import { exportExcel, printDocument, fileStamp } from '@/lib/client/exports';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, StudentInfo, ClassInfo } from '@/lib/types';
import {
  Plus, Pencil, Search, Trash2, Users, Phone, FilterX, BookOpen, UserRound,
  Upload, ArrowLeftRight, GraduationCap, IdCard, CalendarCheck, ClipboardCheck, FileUp,
  FileDown, Printer,
} from 'lucide-react';

const EMPTY_FORM = {
  id: '', firstName: '', lastName: '', fatherName: '', grandFather: '',
  gender: 'M', birthDate: '', idNumber: '', guardianName: '', guardianPhone: '',
  address: '', classId: '', rollNo: '', enrolledYear: '', status: 'ACTIVE', photo: '',
};

interface ProfileData {
  student: {
    id: string; firstName: string; lastName: string | null; fatherName: string;
    photo: string | null; gender: string; status: string; rollNo: number | null;
    className: string | null; guardianName: string | null; guardianPhone: string | null;
  };
  attendance: { total: number; PRESENT: number; ABSENT: number; SICK: number; LEAVE: number; recent: Array<{ id: string; date: string; status: string }> };
  activities: Array<{ id: string; date: string; type: string; note: string; score: number | null }>;
  subjects: Array<{ name: string; final: number; letter: string }>;
  overallAvg: number | null;
}

const ACTIVITY_LABELS: Record<string, string> = { HOMEWORK: 'کارخانگی', BEHAVIOR: 'رفتار', PARTICIPATION: 'مشارکت', OTHER: 'سایر' };
const ATT_LABELS: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غایب', SICK: 'مریض', LEAVE: 'رخصتی' };

/** فشرده‌سازی عکس انتخاب‌شده به dataURL کوچک (حداکثر ۳۰۰ پیکسل، JPEG) */
async function fileToCompactDataUrl(file: File, max = 300): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('بوم نقاشی در دسترس نیست');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function StudentsView({ user }: { user: SessionUser }) {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [genderFilter, setGenderFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [permStudents, setPermStudents] = useState(true); // مجوز ثبت/ویرایش شاگردان برای معلم
  // پروفایل شاگرد
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  // ورود گروهی CSV
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  // ارتقای دسته‌جمعی
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteFrom, setPromoteFrom] = useState('');
  const [promoteTo, setPromoteTo] = useState('');
  const [promoting, setPromoting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isTeacher = user.role === 'TEACHER';
  const isAdmin = user.role === 'ADMIN';
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
    if (statusFilter !== 'all') list = list.filter((s) => (s.status || 'ACTIVE') === statusFilter);
    if (genderFilter !== 'all') list = list.filter((s) => s.gender === genderFilter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((s) =>
        [s.firstName, s.lastName, s.fatherName, s.idNumber].some((f) => f?.includes(q)),
      );
    }
    return list;
  }, [students, classFilter, statusFilter, genderFilter, search]);

  /** فیلتر پیشرفته: وضعیت تحصیلی و جنسیت + خروجی اکسل/PDF از لیست فیلترشده */
  const exportStudents = (mode: 'excel' | 'pdf') => {
    const rows = filtered.map((s, i) => {
      const cls = classes.find((c) => c.id === s.classId)?.name || '—';
      const status = s.status === 'GRADUATED' ? 'فراغت' : s.status === 'LEFT' ? 'ترک تحصیل' : 'فعال';
      const gender = s.gender === 'F' ? 'اناث' : 'ذکور';
      return `<tr><td>${toPersianDigits(i + 1)}</td><td>${fullName(s)}</td><td>${s.fatherName}</td><td>${s.grandFather || '—'}</td><td>${cls}</td><td>${gender}</td><td>${status}</td><td>${s.guardianPhone || '—'}</td></tr>`;
    });
    const title = `فهرست شاگردان (${toPersianDigits(filtered.length)} نفر)`;
    const table = `<table><thead><tr><th>شماره</th><th>اسم</th><th>ولد</th><th>ولدیت</th><th>صنف</th><th>جنسیت</th><th>وضعیت</th><th>تماس سرپرست</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    if (mode === 'excel') exportExcel(title, table, `شاگردان-${fileStamp()}`);
    else printDocument(title, `<div class="doc-title">${title}</div>${table}`);
  };

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
      enrolledYear: s.enrolledYear || '', status: s.status, photo: s.photo || '',
    });
    setDialogOpen(true);
  };

  const openProfile = async (s: StudentInfo) => {
    setProfileOpen(true);
    setProfileLoading(true);
    setProfile(null);
    try {
      const d = await apiGet<ProfileData>(`/api/students/profile?studentId=${s.id}`);
      setProfile(d);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری پروفایل ناموفق', variant: 'destructive' });
      setProfileOpen(false);
    }
    setProfileLoading(false);
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

  const onPickPhoto = async (file: File) => {
    try {
      const dataUrl = await fileToCompactDataUrl(file);
      setForm((f) => ({ ...f, photo: dataUrl }));
    } catch {
      toast({ title: 'خطا', description: 'خواندن عکس ناموفق بود', variant: 'destructive' });
    }
  };

  // ─── ورود گروهی CSV ───
  const parsedRows = useMemo(() => {
    // قالب هر خط: اسم، شهرت، ولد، صنف، جنسیت (M/F یا ذکور/اناث)، تذکره، تماس سرپرست
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: Array<{ firstName: string; lastName: string; fatherName: string; className: string; gender: string; idNumber: string; guardianPhone: string; ok: boolean; problem?: string }> = [];
    for (const line of lines) {
      const cells = line.replace(/^\uFEFF/, '').split(/[,;\t]/).map((c) => c.trim());
      if (cells.every((c) => !c)) continue;
      // ردیف سرستون احتمالی
      if (/اسم|نام/.test(cells[0] || '') && /ولد|پدر/.test(cells[2] || '')) continue;
      const [firstName = '', lastName = '', fatherName = '', className = '', gender = '', idNumber = '', guardianPhone = ''] = cells;
      let problem: string | undefined;
      if (!firstName) problem = 'اسم خالی است';
      else if (!fatherName) problem = 'ولد خالی است';
      else if (className && !classes.some((c) => c.name === className)) problem = 'صنف با این نام یافت نشد';
      const g = /^(f|اناث|دختر)$/i.test(gender) ? 'F' : 'M';
      rows.push({ firstName, lastName, fatherName, className, gender: g, idNumber, guardianPhone, ok: !problem, problem });
    }
    return rows;
  }, [csvText, classes]);

  const runImport = async () => {
    const valid = parsedRows.filter((r) => r.ok);
    if (valid.length === 0) {
      toast({ title: 'خطا', description: 'هیچ ردیف قابل ثبتی وجود ندارد', variant: 'destructive' });
      return;
    }
    if (!confirm(`${toPersianDigits(valid.length)} شاگرد ثبت می‌شود. ادامه می‌دهید؟`)) return;
    setImporting(true);
    let saved = 0;
    let failed = 0;
    for (const r of valid) {
      const cls = classes.find((c) => c.name === r.className);
      const res = await apiSend('/api/students', 'POST', {
        firstName: r.firstName, lastName: r.lastName, fatherName: r.fatherName,
        gender: r.gender, idNumber: r.idNumber, guardianPhone: r.guardianPhone,
        classId: cls?.id || '', status: 'ACTIVE',
      }, { queueLabel: `ثبت گروهی: ${r.firstName}` });
      if (res.error) failed += 1; else saved += 1;
    }
    setImporting(false);
    setImportOpen(false);
    setCsvText('');
    toast({
      title: 'ورود گروهی کامل شد',
      description: `${toPersianDigits(saved)} شاگرد ثبت شد${failed ? ` — ${toPersianDigits(failed)} ناموفق` : ''}${apiQueuedHint()}`,
      duration: failed ? 6000 : 2500,
    });
    load();
  };

  const apiQueuedHint = () => '';

  // ─── ارتقای دسته‌جمعی ───
  const runPromote = async () => {
    if (!promoteFrom || !promoteTo) {
      toast({ title: 'خطا', description: 'صنف مبدأ و مقصد را انتخاب کنید', variant: 'destructive' });
      return;
    }
    const from = classes.find((c) => c.id === promoteFrom);
    const to = classes.find((c) => c.id === promoteTo);
    const count = students.filter((s) => s.classId === promoteFrom && s.status === 'ACTIVE').length;
    if (!confirm(`انتقال ${toPersianDigits(count)} شاگرد فعال از «${from?.name}» به «${to?.name}» — مطمئن هستید؟`)) return;
    setPromoting(true);
    const res = await apiSend<{ moved: number }>('/api/students/promote', 'POST', { action: 'move', fromClassId: promoteFrom, toClassId: promoteTo });
    setPromoting(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'انتقال انجام شد', description: `${toPersianDigits(res.data?.moved ?? 0)} شاگرد منتقل شد` });
    setPromoteOpen(false);
    load();
  };

  if (loading) return <LoadingBlock rows={6} />;

  return (
    <div>
      <PageHeader
        title="شاگردان"
        subtitle={isTeacher ? 'شاگردان صنف‌های تحت تدریس شما' : 'ثبت‌نام، ویرایش و مدیریت شاگردان صنف‌ها'}
        icon={Users}
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setPromoteOpen(true)} className="gap-1.5">
                <ArrowLeftRight className="h-4 w-4" /> ارتقای صنف
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                <FileUp className="h-4 w-4" /> ورود گروهی
              </Button>
            )}
            {canEdit && (
              <Button onClick={openNew} className="gap-1.5">
                <Plus className="h-4 w-4" /> ثبت شاگرد جدید
              </Button>
            )}
          </div>
        }
      />

      {/* بنر محدودهٔ معلم */}
      {isTeacher && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-3 mb-4">
          <p className="text-sm font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> صنف‌های شما
          </p>
          <p className="text-xs text-sky-700 dark:text-sky-400 leading-5 mt-1">
            شما فقط شاگردان صنف‌هایی را می‌بینید که در آنها مضمون تدریس می‌کنید یا نگران آن صنف هستید.
            {!permStudents && ' در حال حاضر مدیر اجازهٔ ثبت و ویرایش شاگردان را به معلمان نداده است — دسترسی شما فقط مشاهده است.'}
          </p>
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {classes.map((c) => (
                <Badge key={c.id} variant="outline" className="border-sky-400/40 text-sky-800 dark:text-sky-300">
                  {c.name}
                  {c.classSubjects?.some((cs) => cs.teacherId === user.teacherId) && (
                    <span className="text-[10px] text-sky-600 dark:text-sky-400">
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
            placeholder="جستجو بر اساس اسم، شهرت، ولد، تذکره..."
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" aria-label="وضعیت تحصیلی">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">شاگردان فعال</SelectItem>
            <SelectItem value="GRADUATED">فراغت‌یافته</SelectItem>
            <SelectItem value="LEFT">ترک تحصیل</SelectItem>
            <SelectItem value="all">همهٔ حالت‌ها</SelectItem>
          </SelectContent>
        </Select>
        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="w-[120px]" aria-label="جنسیت">
            <SelectValue placeholder="جنسیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">پسر و دختر</SelectItem>
            <SelectItem value="M">ذکور</SelectItem>
            <SelectItem value="F">اناث</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => exportStudents('excel')} disabled={filtered.length === 0}>
          <FileDown className="h-4 w-4" /> اکسل
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => exportStudents('pdf')} disabled={filtered.length === 0}>
          <Printer className="h-4 w-4" /> PDF
        </Button>
        {(classFilter !== 'all' || search || statusFilter !== 'ACTIVE' || genderFilter !== 'all') && (
          <Button variant="ghost" onClick={() => { setClassFilter('all'); setSearch(''); setStatusFilter('ACTIVE'); setGenderFilter('all'); }} className="gap-1">
            <FilterX className="h-4 w-4" /> پاک کردن
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState message="هیچ شاگردی یافت نشد. با دکمهٔ «ثبت شاگرد جدید» اولین شاگرد را اضافه کنید." icon={Users} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-accent z-10">
                  <TableRow>
                    <TableHead className="w-10">شماره</TableHead>
                    <TableHead>شاگرد</TableHead>
                    <TableHead>ولد</TableHead>
                    <TableHead className="hidden md:table-cell">صنف</TableHead>
                    <TableHead className="hidden md:table-cell">تذکره</TableHead>
                    <TableHead className="hidden lg:table-cell">سرپرست</TableHead>
                    <TableHead className="hidden lg:table-cell">تماس</TableHead>
                    <TableHead>حالت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s, i) => (
                    <TableRow key={s.id} className="hover:bg-accent/40 transition-colors">
                      <TableCell className="text-muted-foreground">{toPersianDigits(s.rollNo ?? i + 1)}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => openProfile(s)}
                          className="flex items-center gap-2.5 font-medium hover:text-primary transition-colors text-right"
                          title="مشاهدهٔ پروفایل شاگرد"
                        >
                          {s.photo ? (
                             
                            <img src={s.photo} alt="" className="h-8 w-8 rounded-full object-cover border shrink-0" />
                          ) : (
                            <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                              {s.firstName.slice(0, 1)}
                            </span>
                          )}
                          <span className="underline-offset-4 hover:underline">{s.firstName} {s.lastName || ''}</span>
                        </button>
                      </TableCell>
                      <TableCell>{s.fatherName}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="border-primary/30 text-primary">{s.className || '—'}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{s.idNumber ? toPersianDigits(s.idNumber) : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{s.guardianName || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs" dir="ltr">
                        {s.guardianPhone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{toPersianDigits(s.guardianPhone)}</span> : '—'}
                      </TableCell>
                      <TableCell>
                        {s.status === 'ACTIVE' ? (
                          <span className="text-primary text-xs font-medium">فعال</span>
                        ) : s.status === 'GRADUATED' ? (
                          <span className="text-teal-600 dark:text-teal-400 text-xs">فراغت</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 text-xs">ترک تحصیل</span>
                        )}
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProfile(s)} aria-label="پروفایل" title="پروفایل">
                            <UserRound className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="ویرایش" title="ویرایش">
                              <Pencil className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(s)} aria-label="حذف" title="حذف">
                              <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
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

      {/* دیالوگ ثبت/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>{form.id ? 'ویرایش معلومات شاگرد' : 'ثبت شاگرد جدید'}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4 py-2">
            {form.photo ? (
               
              <img src={form.photo} alt="عکس شاگرد" className="h-20 w-20 rounded-2xl object-cover border-2 border-primary/30" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                {form.firstName.slice(0, 1) || <IdCard className="h-8 w-8" />}
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickPhoto(f); e.target.value = ''; }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} className="gap-1.5">
                <Upload className="h-4 w-4" /> {form.photo ? 'تغییر عکس' : 'انتخاب عکس'}
              </Button>
              {form.photo && (
                <Button type="button" variant="ghost" size="sm" className="text-rose-600 dark:text-rose-400" onClick={() => setForm({ ...form, photo: '' })}>
                  حذف عکس
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">عکس خودکار فشرده می‌شود (۳۰۰ پیکسل)</p>
            </div>
          </div>
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

      {/* دیالوگ پروفایل شاگرد */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>پروفایل شاگرد</DialogTitle>
            <DialogDescription>خلاصهٔ حاضری، فعالیت‌ها و نمرات</DialogDescription>
          </DialogHeader>
          {profileLoading || !profile ? (
            <LoadingBlock rows={5} label="در حال بارگذاری پروفایل..." />
          ) : (
            <div className="space-y-4">
              {/* هدر پروفایل */}
              <div className="flex items-center gap-4 rounded-2xl border bg-accent/40 p-4">
                {profile.student.photo ? (
                   
                  <img src={profile.student.photo} alt="" className="h-16 w-16 rounded-2xl object-cover border-2 border-primary/30" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                    {profile.student.firstName.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-lg leading-tight">
                    {profile.student.firstName} {profile.student.lastName || ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ولد: {profile.student.fatherName}
                    {profile.student.className && ` — صنف ${profile.student.className}`}
                    {profile.student.rollNo != null && ` — شمارهٔ ${toPersianDigits(profile.student.rollNo)}`}
                  </p>
                  {profile.student.guardianPhone && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1" dir="ltr">
                      <Phone className="h-3 w-3" /> {toPersianDigits(profile.student.guardianPhone)}
                      {profile.student.guardianName && <span dir="rtl">({profile.student.guardianName})</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* خلاصهٔ حاضری */}
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <CalendarCheck className="h-4 w-4 text-primary" /> حاضری
                  <span className="text-xs font-normal text-muted-foreground">({toPersianDigits(profile.attendance.total)} روز ثبت‌شده)</span>
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(['PRESENT', 'ABSENT', 'SICK', 'LEAVE'] as const).map((k) => (
                    <div key={k} className={`rounded-xl border py-2 ${k === 'ABSENT' ? 'bg-rose-500/10 border-rose-500/25' : 'bg-accent/60'}`}>
                      <p className={`text-base font-bold ${k === 'ABSENT' ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                        {toPersianDigits(profile.attendance[k])}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{ATT_LABELS[k]}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* نمرات */}
              <div>
                <p className="text-sm font-semibold mb-2">
                  نمرات نهایی مضامین
                  {profile.overallAvg != null && (
                    <Badge className="bg-primary/10 text-primary border-0 mr-2">
                      اوسط کل: {toPersianDigits(profile.overallAvg)}
                    </Badge>
                  )}
                </p>
                {profile.subjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-xl border p-3 text-center">هنوز نمره‌ای ثبت نشده است</p>
                ) : (
                  <div className="rounded-xl border divide-y">
                    {profile.subjects.map((s) => (
                      <div key={s.name} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{s.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-primary">{toPersianDigits(s.final)}</span>
                          <Badge variant="outline" className="text-[10px]">{s.letter}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* فعالیت‌های اخیر */}
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> فعالیت‌های اخیر
                </p>
                {profile.activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-xl border p-3 text-center">فعالیتی ثبت نشده است</p>
                ) : (
                  <div className="rounded-xl border divide-y">
                    {profile.activities.map((a) => (
                      <div key={a.id} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[13px]">{ACTIVITY_LABELS[a.type] || a.type}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {isoToJalaliDisplay(a.date)}
                            {a.score != null && ` — امتیاز: ${toPersianDigits(a.score)}`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* دیالوگ ورود گروهی CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>ورود گروهی شاگردان</DialogTitle>
            <DialogDescription>
              فهرست شاگردان را از فایل CSV/Excel کپی و اینجا بچسبانید — هر خط یک شاگرد
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-accent/50 border p-3 text-xs leading-6">
            <p className="font-semibold mb-1">قالب هر خط (با کاما جدا شود):</p>
            <code dir="ltr" className="block text-left bg-card rounded-lg px-2 py-1.5 font-mono text-[11px]">
              اسم, شهرت, ولد, صنف, جنسیت(M/F), نمبر تذکره, تماس سرپرست
            </code>
            <p className="text-muted-foreground mt-1">مثال: احمد,کریمی,محمد,صنف هفتم,M,۱۲۳۴,0790123456 — فقط اسم و ولد ضروری است.</p>
          </div>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsvText(await f.text());
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} className="gap-1.5 w-fit">
            <FileUp className="h-4 w-4" /> انتخاب فایل CSV
          </Button>
          <textarea
            dir="rtl"
            className="min-h-[120px] w-full rounded-xl border bg-card p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={'احمد,کریمی,محمد,صنف هفتم,M,1234,0790000000\nمریم,احمدی,علی,صنف ششم,F,5678,0791111111'}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          {csvText.trim() && (
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto nice-scroll">
              <p className="font-semibold">
                پیش‌نمایش: {toPersianDigits(parsedRows.filter((r) => r.ok).length)} سالم، {toPersianDigits(parsedRows.filter((r) => !r.ok).length)} دارای مشکل
              </p>
              {parsedRows.filter((r) => !r.ok).map((r, i) => (
                <p key={i} className="text-rose-600 dark:text-rose-400">
                  «{r.firstName || '(خالی)'}» — {r.problem}
                </p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>انصراف</Button>
            <Button onClick={runImport} disabled={importing || parsedRows.filter((r) => r.ok).length === 0}>
              {importing ? 'در حال ثبت...' : `ثبت ${toPersianDigits(parsedRows.filter((r) => r.ok).length)} شاگرد`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ارتقای دسته‌جمعی صنف */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ارتقای دسته‌جمعی صنف (پایان سال)</DialogTitle>
            <DialogDescription>
              همهٔ شاگردان فعال صنف مبدأ یک‌جا به صنف مقصد منتقل می‌شوند — برای شروع سال تعلیمی جدید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="از صنف">
              <Select value={promoteFrom || 'none'} onValueChange={setPromoteFrom}>
                <SelectTrigger><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">انتخاب کنید</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="به صنف">
              <Select value={promoteTo || 'none'} onValueChange={setPromoteTo}>
                <SelectTrigger><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">انتخاب کنید</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Separator />
            <p className="text-xs text-muted-foreground leading-5">
              نکته: شاگردان صنف پایانی را می‌توانید قبل از انتقال، از همان بخش فرم ویرایش با حالت «فراغت» جدا کنید.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)}>انصراف</Button>
            <Button onClick={runPromote} disabled={promoting} className="gap-1.5">
              <GraduationCap className="h-4 w-4" /> {promoting ? 'در حال انتقال...' : 'انتقال شاگردان'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
