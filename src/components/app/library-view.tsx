'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, LoadingBlock, EmptyState, Field, JalaliDatePicker } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, isoToday, toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, BookInfo, LoanInfo, StudentInfo } from '@/lib/types';
import { Plus, BookOpen, BookMarked, Undo2, Trash2, AlertTriangle, Search, IdCard, MessageSquare } from 'lucide-react';

const EMPTY_BOOK = { id: '', title: '', author: '', category: '', copies: '1', shelfNo: '' };
const EMPTY_LEND = { bookId: '', borrowerName: '', borrowerType: 'STUDENT', studentId: '', loanDate: isoToday(), dueDate: '', notes: '' };

/** جریمهٔ پیش‌بینی‌شدهٔ یک امانت — روزهای تأخیر × نرخ روزانه */
function finePreview(dueDate: string, finePerDay: number): { days: number; amount: number } {
  const today = isoToday();
  if (dueDate >= today || finePerDay <= 0) return { days: 0, amount: 0 };
  const days = Math.ceil((new Date(today).getTime() - new Date(dueDate).getTime()) / 86_400_000);
  return { days, amount: days * finePerDay };
}

export function LibraryView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canManage = user.role === 'ADMIN' || user.role === 'LIBRARIAN';
  const [bookSearch, setBookSearch] = useState('');

  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loans, setLoans] = useState<LoanInfo[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [finePerDay, setFinePerDay] = useState(5);
  const [loading, setLoading] = useState(true);
  const [bookDialog, setBookDialog] = useState(false);
  const [lendDialog, setLendDialog] = useState(false);
  const [bookForm, setBookForm] = useState({ ...EMPTY_BOOK });
  const [lendForm, setLendForm] = useState({ ...EMPTY_LEND });
  // کارت شاگرد — امانت‌های یک شاگرد با یک انتخاب
  const [cardStudentId, setCardStudentId] = useState('');
  const cardStudent = students.find((s) => s.id === cardStudentId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, st] = await Promise.all([
        apiGet<{ books: BookInfo[]; loans: LoanInfo[] }>('/api/library'),
        apiGet<{ students: StudentInfo[] }>('/api/students'),
        apiGet<{ settings: Record<string, string> }>('/api/settings').catch(() => ({ settings: {} as Record<string, string> })),
      ]);
      setBooks(b.books);
      setLoans(b.loans);
      setStudents(s.students);
      const rate = Number(st.settings.finePerDay);
      if (Number.isFinite(rate) && rate >= 0) setFinePerDay(rate);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const saveBook = async () => {
    if (!bookForm.title.trim()) {
      toast({ title: 'خطا', description: 'عنوان کتاب ضروری است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/library', 'POST', { action: 'save-book', ...bookForm, copies: Number(bookForm.copies) });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'کتاب ذخیره شد' });
    setBookDialog(false);
    load();
  };

  const lend = async () => {
    if (!lendForm.bookId || !lendForm.borrowerName.trim() || !lendForm.dueDate) {
      toast({ title: 'خطا', description: 'کتاب، امانت‌گیرنده و تاریخ برگشت لازم است', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/library', 'POST', { action: 'lend', ...lendForm });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'کتاب امانت داده شد' });
    setLendDialog(false);
    setLendForm({ ...EMPTY_LEND });
    load();
  };

  const returnBook = async (l: LoanInfo) => {
    const fp = finePreview(l.dueDate, finePerDay);
    if (fp.amount > 0 && !window.confirm(`این کتاب ${toPersianDigits(fp.days)} روز تأخیر دارد — جریمهٔ ${toPersianDigits(fp.amount)} افغانی ثبت شود و کتاب پس گرفته شود؟`)) return;
    const res = await apiSend<{ fine?: number | null }>('/api/library', 'POST', { action: 'return', loanId: l.id }, { queueLabel: 'پس گرفتن کتاب' });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'کتاب پس گرفته شد',
      description: res.queued
        ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود'
        : res.data?.fine != null && res.data.fine > 0
          ? `جریمهٔ دیرکرد ثبت شد: ${toPersianDigits(res.data.fine)} افغانی`
          : undefined,
    });
    load();
  };

  const removeBook = async (b: BookInfo) => {
    if (!confirm(`حذف کتاب «${b.title}»؟`)) return;
    const res = await apiSend(`/api/library?id=${b.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    load();
  };

  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim();
    if (!q) return books;
    return books.filter((b) => [b.title, b.author, b.category, b.shelfNo].some((f) => f?.includes(q)));
  }, [books, bookSearch]);

  if (loading) return <LoadingBlock rows={5} />;

  const activeLoans = loans.filter((l) => l.status === 'LENT');
  const overdue = activeLoans.filter((l) => l.dueDate < isoToday());
  const totalFine = overdue.reduce((a, l) => a + finePreview(l.dueDate, finePerDay).amount, 0);
  const cardLoans = cardStudentId ? activeLoans.filter((l) => l.studentId === cardStudentId) : [];
  const cardHistory = cardStudentId ? loans.filter((l) => l.studentId === cardStudentId) : [];
  /** پیوند sms برای هشدار سررسید به امانت‌گیرندهٔ شاگرد */
  const borrowerSms = (l: LoanInfo) => {
    if (l.borrowerType !== 'STUDENT' || !l.studentId) return null;
    const s = students.find((x) => x.id === l.studentId);
    if (!s?.guardianPhone) return null;
    const text = `سلام — کتاب «${l.bookTitle || ''}» امانتی ${fullName(s)} تا ${isoToJalaliDisplay(l.dueDate)} باید به کتابخانهٔ مکتب خصوصی نداالقلم برگشت داده شود. با احترام`;
    return `sms:${s.guardianPhone.replace(/\s+/g, '')}?body=${encodeURIComponent(text)}`;
  };

  return (
    <div>
      <PageHeader
        title="کتابخانه"
        subtitle="ثبت کتاب، امانت دادن و پس گرفتن با تاریخ برگشت"
        icon={BookOpen}
        actions={canManage && (
          <div className="flex gap-2">
            <Button onClick={() => { setBookForm({ ...EMPTY_BOOK }); setBookDialog(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> کتاب جدید
            </Button>
            <Button variant="outline" onClick={() => { setLendForm({ ...EMPTY_LEND }); setLendDialog(true); }} className="gap-1.5 border-emerald-300 text-emerald-800">
              <BookMarked className="h-4 w-4" /> امانت دادن
            </Button>
          </div>
        )}
      />

      {/* هشدار خودکار سررسید برگشت + جریمه */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            {toPersianDigits(overdue.length)} کتاب از سررسید برگشت گذشته است — جریمهٔ برآوردی: {toPersianDigits(totalFine)} افغانی (نرخ: {toPersianDigits(finePerDay)} افغانی/روز)
          </p>
          <div className="mt-1.5 space-y-1 max-h-28 overflow-y-auto">
            {overdue.slice(0, 8).map((l) => {
              const fp = finePreview(l.dueDate, finePerDay);
              const sms = borrowerSms(l);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">{l.bookTitle}</span>
                  <span className="opacity-80">— {l.borrowerName} ({isoToJalaliDisplay(l.dueDate)}، {toPersianDigits(fp.days)} روز)</span>
                  {sms && (
                    <a href={sms} className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 px-1.5 py-0.5 hover:bg-rose-500/10" aria-label="هشدار به والد">
                      <MessageSquare className="h-3 w-3" /> هشدار به والد
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs defaultValue="books">
        <TabsList className="mb-4">
          <TabsTrigger value="books">کتاب‌ها ({toPersianDigits(books.length)})</TabsTrigger>
          <TabsTrigger value="loans">
            امانت‌های جاری ({toPersianDigits(activeLoans.length)})
            {overdue.length > 0 && <AlertTriangle className="inline h-3.5 w-3.5 text-amber-600 mr-1" />}
          </TabsTrigger>
          <TabsTrigger value="history">سابقهٔ امانت</TabsTrigger>
          <TabsTrigger value="card" className="gap-1"><IdCard className="h-3.5 w-3.5" /> کارت شاگرد</TabsTrigger>
        </TabsList>

        <TabsContent value="books">
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجوی کتاب: عنوان، مولف، دسته، قفسه..."
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Card className="border-emerald-100">
            <CardContent className="p-0">
              {filteredBooks.length === 0 ? (
                <EmptyState message="هیچ کتابی ثبت نشده است." icon={BookOpen} />
              ) : (
                <div className="overflow-x-auto nice-scroll max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-emerald-50">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>عنوان</TableHead>
                        <TableHead>مولف</TableHead>
                        <TableHead>دسته</TableHead>
                        <TableHead>قفسه</TableHead>
                        <TableHead>موجود / مجموع</TableHead>
                        {canManage && <TableHead className="text-left">عملیات</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBooks.map((b, i) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-muted-foreground">{toPersianDigits(i + 1)}</TableCell>
                          <TableCell className="font-medium">{b.title}</TableCell>
                          <TableCell className="text-xs">{b.author || '—'}</TableCell>
                          <TableCell className="text-xs">{b.category || '—'}</TableCell>
                          <TableCell className="text-xs" dir="ltr">{b.shelfNo || '—'}</TableCell>
                          <TableCell>
                            <Badge className={b.available > 0 ? 'bg-emerald-600' : 'bg-rose-600'}>
                              {toPersianDigits(b.available)} / {toPersianDigits(b.copies)}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-left">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost" size="sm" className="h-7 text-xs"
                                  onClick={() => {
                                    setLendForm({ ...EMPTY_LEND, bookId: b.id });
                                    setLendDialog(true);
                                  }}
                                >
                                  امانت
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={() => {
                                    setBookForm({
                                      id: b.id, title: b.title, author: b.author || '', category: b.category || '',
                                      copies: String(b.copies), shelfNo: b.shelfNo || '',
                                    });
                                    setBookDialog(true);
                                  }}
                                  aria-label="ویرایش کتاب"
                                >
                                  <BookOpen className="h-4 w-4 text-emerald-700" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBook(b)} aria-label="حذف کتاب">
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
        </TabsContent>

        <TabsContent value="loans">
          <Card className="border-emerald-100">
            <CardContent className="p-0">
              {activeLoans.length === 0 ? (
                <EmptyState message="امانتی جاری وجود ندارد." icon={BookMarked} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>کتاب</TableHead>
                      <TableHead>امانت‌گیرنده</TableHead>
                      <TableHead>تاریخ امانت</TableHead>
                      <TableHead>تاریخ برگشت</TableHead>
                      <TableHead className="text-left">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLoans.map((l) => {
                      const isOverdue = l.dueDate < isoToday();
                      return (
                        <TableRow key={l.id} className={isOverdue ? 'bg-rose-50/50' : ''}>
                          <TableCell className="font-medium">{l.bookTitle}</TableCell>
                          <TableCell>
                            {l.borrowerName}
                            <Badge variant="outline" className="mr-2 text-[10px]">
                              {l.borrowerType === 'STUDENT' ? 'شاگرد' : l.borrowerType === 'TEACHER' ? 'معلم' : 'کارمند'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{isoToJalaliDisplay(l.loanDate)}</TableCell>
                          <TableCell className="text-xs">
                            <span className={isOverdue ? 'text-rose-600 font-bold' : ''}>
                              {isoToJalaliDisplay(l.dueDate)}{isOverdue ? ' (گذشته)' : ''}
                            </span>
                          </TableCell>
                          <TableCell className="text-left">
                            {canManage && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => returnBook(l)}>
                                <Undo2 className="h-3.5 w-3.5" /> پس گرفتن
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-emerald-100">
            <CardContent className="p-0">
              {loans.length === 0 ? (
                <EmptyState message="سابقه‌ای موجود نیست." icon={BookMarked} />
              ) : (
                <div className="overflow-x-auto nice-scroll max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-emerald-50">
                      <TableRow>
                        <TableHead>کتاب</TableHead>
                        <TableHead>امانت‌گیرنده</TableHead>
                        <TableHead>امانت</TableHead>
                        <TableHead>برگشت</TableHead>
                        <TableHead>وضعیت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loans.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium text-xs">{l.bookTitle}</TableCell>
                          <TableCell className="text-xs">{l.borrowerName}</TableCell>
                          <TableCell className="text-xs">{isoToJalaliDisplay(l.loanDate)}</TableCell>
                          <TableCell className="text-xs">{l.returnDate ? isoToJalaliDisplay(l.returnDate) : '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge className={l.status === 'RETURNED' ? 'bg-emerald-600' : 'bg-amber-500'}>
                                {l.status === 'RETURNED' ? 'پس داده شد' : 'در امانت'}
                              </Badge>
                              {l.fineAmount != null && l.fineAmount > 0 && (
                                <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-600">
                                  جریمه: {toPersianDigits(l.fineAmount)} افغانی
                                </Badge>
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
        </TabsContent>

        {/* ─── کارت شاگرد — امانت‌های یک شاگرد ─── */}
        <TabsContent value="card">
          <Card className="border-emerald-100">
            <CardContent className="p-4 space-y-3">
              <Field label="انتخاب شاگرد (کارت شناسایی)" hint="همهٔ امانت‌های جاری و سابقهٔ این شاگرد یکجا نمایش داده می‌شود">
                <Select value={cardStudentId} onValueChange={setCardStudentId}>
                  <SelectTrigger><SelectValue placeholder="انتخاب شاگرد…" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{fullName(s)} — {s.className || 'بدون صنف'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {cardStudent && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                    {cardStudent.photo ? (
                      <img src={cardStudent.photo} alt={fullName(cardStudent)} className="h-14 w-14 rounded-lg border object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-emerald-100 flex items-center justify-center"><IdCard className="h-6 w-6 text-emerald-700" /></div>
                    )}
                    <div>
                      <p className="font-bold">{fullName(cardStudent)}</p>
                      <p className="text-xs text-muted-foreground">ولد: {cardStudent.fatherName} | صنف: {cardStudent.className || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1.5">امانت‌های جاری ({toPersianDigits(cardLoans.length)})</p>
                    {cardLoans.length === 0 ? <p className="text-xs text-muted-foreground">امانتی جاری ندارد</p> : (
                      <div className="space-y-1">
                        {cardLoans.map((l) => {
                          const fp = finePreview(l.dueDate, finePerDay);
                          return (
                            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                              <span className="font-medium">{l.bookTitle}</span>
                              <span className={l.dueDate < isoToday() ? 'text-rose-600' : 'text-muted-foreground'}>
                                تا {isoToJalaliDisplay(l.dueDate)}{fp.amount > 0 ? ` — جریمه: ${toPersianDigits(fp.amount)} افغانی` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {cardHistory.length > cardLoans.length && (
                    <div>
                      <p className="text-sm font-semibold mb-1.5">سابقهٔ برگشت‌شده</p>
                      <p className="text-xs text-muted-foreground">{toPersianDigits(cardHistory.filter((l) => l.status === 'RETURNED').length)} امانت پس داده شده است</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog open={bookDialog} onOpenChange={setBookDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{bookForm.id ? 'ویرایش کتاب' : 'کتاب جدید'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Field label="عنوان *"><Input value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} /></Field>
            <Field label="مولف"><Input value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} /></Field>
            <Field label="دسته"><Input value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} /></Field>
            <Field label="شمارهٔ قفسه"><Input value={bookForm.shelfNo} onChange={(e) => setBookForm({ ...bookForm, shelfNo: e.target.value })} /></Field>
            <Field label="تعداد نسخه"><Input type="number" min={1} value={bookForm.copies} onChange={(e) => setBookForm({ ...bookForm, copies: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookDialog(false)}>انصراف</Button>
            <Button onClick={saveBook}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ امانت */}
      <Dialog open={lendDialog} onOpenChange={setLendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>امانت دادن کتاب</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Field label="کتاب *">
              <Select value={lendForm.bookId} onValueChange={(v) => setLendForm({ ...lendForm, bookId: v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب کتاب" /></SelectTrigger>
                <SelectContent>
                  {books.filter((b) => b.available > 0).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.title} ({toPersianDigits(b.available)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="نوع امانت‌گیرنده">
              <Select value={lendForm.borrowerType} onValueChange={(v) => setLendForm({ ...lendForm, borrowerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">شاگرد</SelectItem>
                  <SelectItem value="TEACHER">معلم</SelectItem>
                  <SelectItem value="STAFF">کارمند</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="امانت‌گیرنده *">
              <Input value={lendForm.borrowerName} onChange={(e) => setLendForm({ ...lendForm, borrowerName: e.target.value })} />
            </Field>
            {lendForm.borrowerType === 'STUDENT' && (
              <Field label="انتخاب از لیست شاگردان">
                <Select value={lendForm.studentId} onValueChange={(v) => {
                  const s = students.find((x) => x.id === v);
                  setLendForm({ ...lendForm, studentId: v, borrowerName: s ? `${fullName(s)}` : lendForm.borrowerName });
                }}>
                  <SelectTrigger><SelectValue placeholder="انتخاب شاگرد" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{fullName(s)} — {s.className || 'بدون صنف'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="تاریخ امانت (شمسی)">
              <JalaliDatePicker value={lendForm.loanDate} onChange={(iso) => setLendForm({ ...lendForm, loanDate: iso })} />
            </Field>
            <Field label="تاریخ برگشت (شمسی) *">
              <JalaliDatePicker value={lendForm.dueDate} onChange={(iso) => setLendForm({ ...lendForm, dueDate: iso })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLendDialog(false)}>انصراف</Button>
            <Button onClick={lend}>امانت دادن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
