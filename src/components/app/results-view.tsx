'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet } from '@/lib/client/api';
import { toPersianDigits, isoToJalaliDisplay, isoToday } from '@/lib/jalali';
import { letterGrade, letterColor, PERIOD_LABELS, RESULT_PROMOTED, RESULT_REPEAT } from '@/lib/grading';
import { printDocument, exportWord, exportExcel, fileStamp } from '@/lib/client/exports';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, ClassInfo, ResultsRow } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';
import { FileSpreadsheet, Printer, FileText, Award, Table2 } from 'lucide-react';

interface ClassResultData {
  classInfo: { id: string; name: string; grade: number };
  subjects: Array<{ id: string; name: string }>;
  rows: ResultsRow[];
}

interface ReportCardData {
  student: {
    firstName: string; lastName: string; fatherName: string; grandFather?: string | null;
    idNumber?: string | null; rollNo?: number | null; gender: string;
  };
  className: string | null;
  subjects: Array<{
    subjectName: string; teacherName: string | null;
    midterm: { total: number; approved: boolean } | null;
    annual: { total: number; approved: boolean } | null;
    final: number | null; letter: string;
  }>;
  total: number | null;
  average: number | null;
  result: string;
  failed: number;
}

export function ResultsView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const isStudentSide = user.role === 'STUDENT' || user.role === 'GUARDIAN';
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<ClassResultData | null>(null);
  const [loading, setLoading] = useState(isStudentSide);
  const [reportCard, setReportCard] = useState<ReportCardData | null>(null);
  const [rcOpen, setRcOpen] = useState(false);

  // مقیاس نمرات و یادداشت مقررات از تنظیمات مدیر — به‌جای متن ثابت
  const [scaleNote, setScaleNote] = useState('مقیاس نمرات: الف ۹۰-۱۰۰ | ب ۸۰-۹۰ | ج ۷۰-۸۰ | د ۶۰-۷۰ | هـ ۵۰-۶۰ | زیر ۵۰ تکرار صنف');
  const [resultNote, setResultNote] = useState('مقررات: هر شاگرد که در یک مضمون نمرهٔ کمتر از ۵۰ بگیرد، تکرار صنف می‌گردد. مکتسبه: الف ۹۰-۱۰۰ | ب ۸۰-۹۰ | ج ۷۰-۸۰ | د ۶۰-۷۰ | هـ ۵۰-۶۰.');
  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>('/api/settings')
      .then((d) => {
        if (d.settings.gradeScale) setScaleNote(`مقیاس نمرات: ${d.settings.gradeScale}`);
        if (d.settings.resultNote) setResultNote(d.settings.resultNote);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isStudentSide) return;
    apiGet<{ classes: ClassInfo[] }>('/api/classes')
      .then((d) => setClasses(d.classes))
      .catch(() => {});
  }, [isStudentSide]);

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoading(true);
    try {
      const d = await apiGet<ClassResultData>(`/api/results?mode=class&classId=${cid}`);
      setData(d);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isStudentSide) {
      apiGet<ReportCardData>('/api/results?mode=student')
        .then((d) => { setReportCard(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [isStudentSide]);

  useEffect(() => {
    if (!isStudentSide && classId) queueMicrotask(() => load(classId));
  }, [classId, isStudentSide, load]);

  const openReportCard = async (studentId: string) => {
    try {
      const d = await apiGet<ReportCardData>(`/api/results?mode=student&studentId=${studentId}`);
      setReportCard(d);
      setRcOpen(true);
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'بارگذاری ناموفق', variant: 'destructive' });
    }
  };

  // ─── HTML ساخت جدول نتایج برای چاپ/ورد ───
  const buildResultsHtml = (d: ClassResultData) => {
    const head = d.subjects.map((s) => `<th>${s.name}</th>`).join('');
    const body = d.rows.map((r, i) => {
      const cells = d.subjects.map((s) => {
        const v = r.perSubject[s.id];
        return `<td>${v?.final != null ? toPersianDigits(v.final) : '—'} <small>(${v?.letter || '—'})</small></td>`;
      }).join('');
      const lineage = `ولد ${r.student.fatherName}${r.student.grandFather ? ` — ولدیت ${r.student.grandFather}` : ''}`;
      return `<tr>
        <td>${toPersianDigits(r.student.rollNo ?? i + 1)}</td>
        <td style="text-align:right">${fullName(r.student)} <small>(${lineage})</small></td>
        ${cells}
        <td>${r.total != null ? toPersianDigits(r.total) : '—'}</td>
        <td><b>${r.average != null ? toPersianDigits(r.average) : '—'}</b></td>
        <td>${r.rank != null ? toPersianDigits(r.rank) : '—'}</td>
        <td class="${r.result === RESULT_PROMOTED ? 'pass' : r.result === RESULT_REPEAT ? 'fail' : ''}">${r.result}</td>
      </tr>`;
    }).join('');
    return `
      <div style="text-align:center"><span class="doc-title">جدول نتایج سالانه — ${d.classInfo.name}</span></div>
      <div class="doc-meta"><span>تاریخ: ${isoToJalaliDisplay(isoToday())}</span><span>تعداد شاگرد: ${toPersianDigits(d.rows.length)}</span></div>
      <table>
        <thead><tr><th>شماره</th><th>شهرت شاگرد</th>${head}<th>مجموع</th><th>اوسط</th><th>رتبه</th><th>نتیجه</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <p class="note">${scaleNote} — نمرهٔ نهائی هر مضمون = میانگین چهارو‌نیم‌ماهه و سالانه</p>
      <div class="doc-footer">
        <div class="sign-box"><div class="sign-line">امضاء معلم</div></div>
        <div class="sign-box"><div class="sign-line">امضاء سرمعلم</div></div>
        <div class="sign-box"><div class="sign-line">امضاء و مهر مدیر مکتب</div></div>
      </div>`;
  };

  const printResults = () => data && printDocument('جدول نتایج', buildResultsHtml(data));
  const wordResults = () => data && exportWord('جدول نتایج', buildResultsHtml(data), `جدول-نتایج-${data.classInfo.name}-${fileStamp()}`);

  const excelResults = () => {
    if (!data) return;
    const head = data.subjects.map((s) => `<th>${s.name}</th>`).join('');
    const body = data.rows.map((r, i) => {
      const cells = data.subjects.map((s) => {
        const v = r.perSubject[s.id];
        return `<td>${v?.final ?? ''}</td>`;
      }).join('');
      return `<tr><td>${i + 1}</td><td>${fullName(r.student)}</td><td>${r.student.fatherName || ''}</td><td>${r.student.grandFather || ''}</td>${cells}<td>${r.total ?? ''}</td><td>${r.average ?? ''}</td><td>${r.rank ?? ''}</td><td>${r.result}</td></tr>`;
    }).join('');
    exportExcel(
      `جدول نتایج ${data.classInfo.name}`,
      `<table><thead><tr><th>شماره</th><th>اسم</th><th>شهرت</th><th>ولد</th><th>ولدیت</th>${head}<th>مجموع</th><th>اوسط</th><th>رتبه</th><th>نتیجه</th></tr></thead><tbody>${body}</tbody></table>`,
      `جدول-نتایج-${data.classInfo.name}-${fileStamp()}`,
    );
  };

  // ─── کارنامهٔ شاگرد برای چاپ ───
  const buildReportCardHtml = (rc: ReportCardData) => {
    const rows = rc.subjects.map((s, i) => `
      <tr>
        <td>${toPersianDigits(i + 1)}</td>
        <td style="text-align:right">${s.subjectName}</td>
        <td>${s.teacherName || '—'}</td>
        <td>${s.midterm ? toPersianDigits(s.midterm.total) : '—'}</td>
        <td>${s.annual ? toPersianDigits(s.annual.total) : '—'}</td>
        <td><b>${s.final != null ? toPersianDigits(s.final) : '—'}</b></td>
        <td>${s.letter}</td>
      </tr>`).join('');
    return `
      <div style="text-align:center"><span class="doc-title">کارنامهٔ نتایج تعلیمی</span></div>
      <div class="doc-meta" style="justify-content:center; gap:24px">
        <span>شاگرد: <b>${rc.student.firstName} ${rc.student.lastName}</b></span>
        <span>ولد: ${rc.student.fatherName}</span>
        ${rc.student.grandFather ? `<span>ولدیت: ${rc.student.grandFather}</span>` : ''}
        <span>صنف: ${rc.className || '—'}</span>
        <span>شماره: ${toPersianDigits(rc.student.rollNo ?? '—')}</span>
        <span>تاریخ: ${isoToJalaliDisplay(isoToday())}</span>
      </div>
      <table>
        <thead><tr><th>شماره</th><th>مضمون</th><th>معلم</th><th>چهارو‌نیم‌ماهه</th><th>سالانه</th><th>نمرهٔ نهائی</th><th>مکتسبه</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="doc-meta" style="margin-top:12px">
        <span>مجموع نمرات: <b>${rc.total != null ? toPersianDigits(rc.total) : '—'}</b></span>
        <span>اوسط: <b>${rc.average != null ? toPersianDigits(rc.average) : '—'}</b></span>
        <span>نتیجه: <b class="${rc.result === RESULT_PROMOTED ? 'pass' : 'fail'}">${rc.result}</b></span>
      </div>
      <p class="note">${resultNote}</p>
      <div class="doc-footer">
        <div class="sign-box"><div class="sign-line">امضاء نگران صنف</div></div>
        <div class="sign-box"><div class="sign-line">امضاء سرمعلم</div></div>
        <div class="sign-box"><div class="sign-line">امضاء و مهر مدیر مکتب</div></div>
      </div>`;
  };

  const printReportCard = () => reportCard && printDocument('کارنامهٔ شاگرد', buildReportCardHtml(reportCard));
  const wordReportCard = () => reportCard && exportWord('کارنامهٔ شاگرد', buildReportCardHtml(reportCard), `کارنامه-${reportCard.student.firstName}-${fileStamp()}`);

  if (loading) return <LoadingBlock rows={5} />;

  // ─── حالت شاگرد/سرپرست: فقط کارنامهٔ خود ───
  if (isStudentSide) {
    if (!reportCard || reportCard.subjects.length === 0) {
      return (
        <div>
          <PageHeader title="کارنامهٔ من" icon={Award} />
          <EmptyState message="هنوز نمره‌ای برای شما ثبت نشده است." icon={Award} />
        </div>
      );
    }
    const rc = reportCard;
    return (
      <div>
        <PageHeader
          title="کارنامهٔ من"
          subtitle={`${rc.student.firstName} ${rc.student.lastName} — ${rc.className || 'بدون صنف'}`}
          icon={Award}
          actions={
            <Button variant="outline" onClick={printReportCard} className="gap-1">
              <Printer className="h-4 w-4" /> چاپ / PDF
            </Button>
          }
        />
        <Card className="border-emerald-100 dark:border-emerald-500/25 print-area">
          <CardContent className="p-0 overflow-x-auto nice-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مضمون</TableHead>
                  <TableHead>معلم</TableHead>
                  <TableHead>چهارو‌نیم‌ماهه</TableHead>
                  <TableHead>سالانه</TableHead>
                  <TableHead>نمرهٔ نهائی</TableHead>
                  <TableHead>مکتسبه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rc.subjects.map((s, i) => (
                  <TableRow key={`${s.subjectName}-${i}`}>
                    <TableCell className="font-medium">{s.subjectName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.teacherName || '—'}</TableCell>
                    <TableCell>{s.midterm ? toPersianDigits(s.midterm.total) : '—'}</TableCell>
                    <TableCell>{s.annual ? toPersianDigits(s.annual.total) : '—'}</TableCell>
                    <TableCell className="font-bold">{s.final != null ? toPersianDigits(s.final) : '—'}</TableCell>
                    <TableCell><span className={letterColor(s.final)}>{s.letter}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          <Card className="border-emerald-100 dark:border-emerald-500/25"><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">مجموع نمرات</p>
            <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200">{rc.total != null ? toPersianDigits(rc.total) : '—'}</p>
          </CardContent></Card>
          <Card className="border-emerald-100 dark:border-emerald-500/25"><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">اوسط</p>
            <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200">{rc.average != null ? toPersianDigits(rc.average) : '—'}</p>
          </CardContent></Card>
          <Card className={cn('border', rc.result === RESULT_PROMOTED ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10' : rc.result === RESULT_REPEAT ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10' : '')}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">نتیجهٔ نهایی</p>
              <p className={cn('text-lg font-bold', rc.result === RESULT_PROMOTED ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>{rc.result}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── حالت مسئولان ───
  return (
    <div>
      <PageHeader
        title="جدول نتایج و کارنامه"
        subtitle="نمرات نهائی به‌صورت خودکار از ثبت نمرات در جدول هر صنف منعکس می‌شود"
        icon={FileSpreadsheet}
        actions={data && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={printResults} className="gap-1">
              <Printer className="h-4 w-4" /> چاپ / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={wordResults} className="gap-1">
              <FileText className="h-4 w-4" /> Word
            </Button>
            <Button variant="outline" size="sm" onClick={excelResults} className="gap-1">
              <Table2 className="h-4 w-4" /> Excel
            </Button>
          </div>
        )}
      />

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

      {!classId || !data ? (
        <EmptyState message="برای مشاهدهٔ جدول نتایج، صنف را انتخاب کنید. جدول شامل همهٔ مضامین، مجموع، اوسط، رتبه و نتیجهٔ هر شاگرد است." icon={FileSpreadsheet} />
      ) : data.rows.length === 0 ? (
        <EmptyState message="این صنف شاگرد فعال ندارد." icon={FileSpreadsheet} />
      ) : (
        <Card className="border-emerald-100 dark:border-emerald-500/25 print-area">
          <CardContent className="p-0">
            <div className="overflow-x-auto nice-scroll max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-emerald-50 dark:bg-emerald-500/10 z-10">
                  <TableRow>
                    <TableHead className="sticky right-0 bg-emerald-50 dark:bg-emerald-500/10 z-20 min-w-[180px]">شاگرد</TableHead>
                    {data.subjects.map((s) => (
                      <TableHead key={s.id} className="min-w-[90px] text-center">{s.name}</TableHead>
                    ))}
                    <TableHead className="text-center">مجموع</TableHead>
                    <TableHead className="text-center">اوسط</TableHead>
                    <TableHead className="text-center">رتبه</TableHead>
                    <TableHead className="text-center">نتیجه</TableHead>
                    <TableHead className="text-center no-print">کارنامه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r, i) => (
                    <TableRow key={r.student.id}>
                      <TableCell className="sticky right-0 bg-background z-10">
                        <span className="font-medium">{toPersianDigits(r.student.rollNo ?? i + 1)}. {fullName(r.student)}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          ولد {r.student.fatherName}{r.student.grandFather ? ` — ولدیت ${r.student.grandFather}` : ''}
                        </span>
                      </TableCell>
                      {data.subjects.map((s) => {
                        const v = r.perSubject[s.id];
                        return (
                          <TableCell key={s.id} className="text-center">
                            <span>{v?.final != null ? toPersianDigits(v.final) : '—'}</span>
                            <span className={cn('block text-[10px]', letterColor(v?.final ?? null))}>{v?.letter || ''}</span>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-semibold">{r.total != null ? toPersianDigits(r.total) : '—'}</TableCell>
                      <TableCell className="text-center font-bold text-emerald-800 dark:text-emerald-300">{r.average != null ? toPersianDigits(r.average) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {r.rank != null && (
                          <Badge variant="outline" className={cn(r.rank === 1 ? 'border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10' : 'border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300')}>
                            {toPersianDigits(r.rank)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn('text-xs font-bold', r.result === RESULT_PROMOTED ? 'text-emerald-700 dark:text-emerald-300' : r.result === RESULT_REPEAT ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground')}>
                          {r.result}
                        </span>
                      </TableCell>
                      <TableCell className="text-center no-print">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700 dark:text-emerald-300" onClick={() => openReportCard(r.student.id)}>
                          مشاهده
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-5">
        مقیاس نمرات: الف ۹۰-۱۰۰ | ب ۸۰-۹۰ | ج ۷۰-۸۰ | د ۶۰-۷۰ | هـ ۵۰-۶۰ | زیر ۵۰ = تکرار صنف.
        نمرهٔ نهائی هر مضمون = میانگین نمرهٔ چهارو‌نیم‌ماهه و سالانه. اوسط و رتبه به‌صورت خودکار محاسبه می‌گردد.
      </p>

      {/* دیالوگ کارنامه */}
      <Dialog open={rcOpen} onOpenChange={setRcOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader><DialogTitle>کارنامهٔ شاگرد</DialogTitle></DialogHeader>
          {reportCard && (
            <div className="space-y-3">
              <div className="overflow-x-auto nice-scroll">
                <div className="min-w-[640px] text-[11px]" dangerouslySetInnerHTML={{ __html: buildReportCardHtml(reportCard) }} />
              </div>
              <div className="flex gap-2 justify-end no-print">
                <Button onClick={printReportCard} className="gap-1"><Printer className="h-4 w-4" /> چاپ / PDF</Button>
                <Button variant="outline" onClick={wordReportCard} className="gap-1"><FileText className="h-4 w-4" /> Word</Button>
                <Button
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    if (!reportCard) return;
                    const rows = reportCard.subjects.map((s, i) =>
                      `<tr><td>${i + 1}</td><td>${s.subjectName}</td><td>${s.midterm?.total ?? ''}</td><td>${s.annual?.total ?? ''}</td><td>${s.final ?? ''}</td><td>${s.letter}</td></tr>`,
                    ).join('');
                    exportExcel(
                      `کارنامهٔ ${reportCard.student.firstName} ${reportCard.student.lastName}`,
                      `<table><thead><tr><th>شماره</th><th>مضمون</th><th>چهارو‌نیم‌ماهه</th><th>سالانه</th><th>نهائی</th><th>مکتسبه</th></tr></thead><tbody>${rows}</tbody></table>`,
                      `کارنامه-${reportCard.student.firstName}-${fileStamp()}`,
                    );
                  }}
                >
                  <Table2 className="h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
