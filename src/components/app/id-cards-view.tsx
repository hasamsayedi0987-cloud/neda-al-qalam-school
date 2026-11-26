'use client';

/* ─────────────── کارت هویت — تب ساخت کارت آویزان شاگردان و معلمین با QR کد ───────────────
 * انتخاب صنف یا کارمندان → انتخاب افراد → پیش‌نمایش ورق A4 (۱۰ کارت در هر صفحه، ۲×۵ افقی)
 * با خطوط برش و سوراخ بند → چاپ PDF. کارت: سربرگ سرمه‌ای، لوگو، عکس، مشخصات، امضاء، QR. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits, jalaliNowDisplay } from '@/lib/jalali';
import {
  buildIdCardsSheet, printIdCards, studentToCard, staffToCard,
  type IdCardSchoolInfo, type IdCardData,
} from '@/lib/client/id-cards';
import { useToast } from '@/hooks/use-toast';
import { cn, fullName } from '@/lib/utils';
import type { ClassInfo, StudentInfo, TeacherInfo } from '@/lib/types';
import {  IdCard, Printer, Eye, Users, UserCog, CheckSquare, Square, QrCode, ShieldOff, ShieldCheck } from 'lucide-react';

export function IdCardsView() {
  const { toast } = useToast();
  const [kind, setKind] = useState<'students' | 'staff'>('students');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [school, setSchool] = useState<IdCardSchoolInfo>({ name: '', nameEn: '', logo: '', address: '', addressEn: '', phone: '', academicYear: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // مرحلهٔ ۶ — عکس فقط صنف انتخاب‌شده و فقط برای ساخت کارت بارگیری می‌شود، نه همهٔ مکتب
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({});

  /* بارگذاری تنظیمات، صنف‌ها، شاگردان و کارمندان */
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiGet<{ settings: Record<string, string> }>('/api/settings').catch(() => ({ settings: {} as Record<string, string> })),
      apiGet<{ classes: ClassInfo[] }>('/api/classes').catch(() => ({ classes: [] as ClassInfo[] })),
      apiGet<{ students: StudentInfo[] }>('/api/students').catch(() => ({ students: [] as StudentInfo[] })),
      apiGet<{ teachers: TeacherInfo[] }>('/api/teachers').catch(() => ({ teachers: [] as TeacherInfo[] })),
    ]).then(([st, cl, sd, tc]) => {
      if (!alive) return;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      /* آدرس فارسی: ولسوالی، ولایت، افغانستان — و نام انگلیسی مکتب */
      const cityFa = [st.settings.district, st.settings.province].filter(Boolean).join('، ') || 'کابل';
      const cityEn = st.settings.province === 'کابل' || !st.settings.province ? 'Kabul' : st.settings.province;
      setSchool({
        name: st.settings.schoolName || 'مکتب خصوصی نداالقلم',
        nameEn: 'NEDA-UL-QALAM PRIVATE SCHOOL',
        logo: st.settings.schoolLogo || `${origin}/logo.png`,
        address: `${cityFa}، افغانستان`,
        addressEn: `${cityEn}, Afghanistan`,
        phone: st.settings.schoolPhone || '',
        academicYear: st.settings.academicYear || '۱۴۰۵',
        issueDate: jalaliNowDisplay(),
      });
      setClasses(cl.classes || []);
      setStudents(sd.students || []);
      setTeachers(tc.teachers || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  /* شاگردان صنف انتخاب‌شده (فقط فعال) */
  const classStudents = useMemo(
    () => students.filter((s) => s.classId === classId && s.status === 'ACTIVE'),
    [students, classId],
  );

  /* مرحلهٔ ۶ — عکس‌های شاگردانِ «فقط صنف انتخاب‌شده» تنبل بارگیری می‌شود */
  useEffect(() => {
    if (kind !== 'students' || !classId) {
      setPhotoMap({});
      return;
    }
    let alive = true;
    const targets = students.filter((s) => s.classId === classId && s.status === 'ACTIVE');
    Promise.all(
      targets.map(async (s): Promise<readonly [string, string]> => {
        try {
          const d = await apiGet<{ photo: string | null }>(`/api/students/photo?id=${s.id}`);
          return [s.id, d.photo || ''] as const;
        } catch {
          return [s.id, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (!alive) return;
      const m: Record<string, string> = {};
      for (const [k, v] of pairs) if (v) m[k] = v;
      setPhotoMap(m);
    });
    return () => {
      alive = false;
    };
  }, [kind, classId, students]);

  /* کارمندان فعال */
  const activeTeachers = useMemo(() => teachers.filter((t) => t.active), [teachers]);

  /* لیست کارت‌های در دسترس بر اساس حالت */
  const available = useMemo(() => {
    if (kind === 'students') return classStudents.map((s) => ({ id: s.id, label: fullName(s), sub: s.rollNo != null ? `حاضری ${toPersianDigits(s.rollNo)}` : '' }));
    return activeTeachers.map((t) => ({ id: t.id, label: t.name, sub: t.position }));
  }, [kind, classStudents, activeTeachers]);

  /* انتخاب همه هنگام تغییر لیست */
  useEffect(() => {
    setSelected(new Set(available.map((a) => a.id)));
  }, [available]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ساخت کارت‌های انتخاب‌شده */
  const cards = useMemo((): IdCardData[] => {
    if (kind === 'students') {
      return classStudents
        .filter((s) => selected.has(s.id))
        .map((s) => studentToCard({
          id: s.id,
          name: fullName(s),
          father: s.fatherName,
          className: s.className || classes.find((c) => c.id === classId)?.name || '',
          rollNo: s.rollNo,
          baseNumber: s.baseNumber,
          photo: photoMap[s.id] || null,
        }, school.academicYear));
    }
    return activeTeachers
      .filter((t) => selected.has(t.id))
      .map((t) => staffToCard({ id: t.id, name: t.name, father: t.fatherName, position: t.position }));
  }, [kind, classStudents, activeTeachers, selected, classes, classId, photoMap]);

  /** لغو/بازگردانی توکن QR کارت‌های انتخاب‌شده — کدهای چاپ‌شدهٔ قبلی بی‌اعتبار می‌شوند */
  const revokeQr = async (restore: boolean) => {
    if (!cards.length) return;
    const what = restore ? 'بازگردانی' : 'لغو';
    if (!window.confirm(`${what} کد QR کارت‌های انتخاب‌شده (${toPersianDigits(cards.length)} کارت) — تأیید می‌کنید؟\nپس از لغو، کدهای چاپ‌شدهٔ قبلی دیگر معتبر نیستند؛ برای کارت جدید دوباره چاپ کنید.`)) return;
    setBusy(true);
    try {
      for (const c of cards) {
        const r = await apiSend('/api/qr', 'POST', { action: restore ? 'restore' : 'revoke', kind: c.kind, id: c.id });
        if (r.error) throw new Error(r.error);
      }
      toast({ title: `${what} کد QR برای ${toPersianDigits(cards.length)} کارت انجام شد` });
    } catch {
      toast({ title: 'عملیات ناکام شد — با انترنت دوباره کوشش کنید', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const makePreview = useCallback(async () => {
    if (!cards.length) return;
    setBusy(true);
    try {
      const html = await buildIdCardsSheet(cards, school);
      setPreview(html);
    } catch {
      toast({ title: 'ساخت کارت‌ها ناکام شد', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [cards, school, toast]);

  const doPrint = useCallback(async () => {
    if (!cards.length) return;
    setBusy(true);
    try {
      await printIdCards(cards, school);
    } finally {
      setBusy(false);
    }
  }, [cards, school]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="کارت هویت" icon={IdCard} />
        <p className="text-sm text-muted-foreground">در حال بارگذاری شاگردان و کارمندان…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="کارت هویت" icon={IdCard} />

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* حالت: شاگردان / کارمندان */}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="نوع کارت">
              <div className="flex gap-2">
                <Button
                  variant={kind === 'students' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setKind('students'); setPreview(null); }}
                >
                  <Users className="h-4 w-4 ms-1" /> شاگردان
                </Button>
                <Button
                  variant={kind === 'staff' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setKind('staff'); setPreview(null); }}
                >
                  <UserCog className="h-4 w-4 ms-1" /> معلمان و کارمندان
                </Button>
              </div>
            </Field>
            {kind === 'students' && (
              <Field label="صنف">
                <Select value={classId} onValueChange={(v) => { setClassId(v); setPreview(null); }}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="انتخاب صنف" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <div className="flex flex-wrap gap-2 ms-auto">
              <Badge variant="secondary" className="gap-1">
                <QrCode className="h-3.5 w-3.5" /> {toPersianDigits(cards.length)} کارت انتخاب‌شده
              </Badge>
              <Button size="sm" disabled={!cards.length || busy} onClick={makePreview}>
                <Eye className="h-4 w-4 ms-1" /> پیش‌نمایش ورق کارت
              </Button>
              <Button size="sm" variant="outline" disabled={!cards.length || busy} onClick={doPrint}>
                <Printer className="h-4 w-4 ms-1" /> چاپ (PDF)
              </Button>
              <Button size="sm" variant="ghost" disabled={!cards.length || busy} onClick={() => revokeQr(false)}>
                <ShieldOff className="h-4 w-4 ms-1" /> لغو QR
              </Button>
              <Button size="sm" variant="ghost" disabled={!cards.length || busy} onClick={() => revokeQr(true)}>
                <ShieldCheck className="h-4 w-4 ms-1" /> بازگردانی QR
              </Button>
            </div>
          </div>

          {kind === 'students' && !classId && (
            <EmptyState title="صنف را انتخاب کنید" message="برای ساخت کارت شاگردان، اول صنف مورد نظر را از فهرست بالا انتخاب نمایید." icon={IdCard} />
          )}

          {available.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-bold">انتخاب افراد — {toPersianDigits(available.length)} نفر</p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set(available.map((a) => a.id)))}>
                  <CheckSquare className="h-3.5 w-3.5 ms-1" /> انتخاب همه
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
                  <Square className="h-3.5 w-3.5 ms-1" /> هیچ‌کدام
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-[240px] overflow-y-auto p-1">
                {available.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-right text-xs transition-colors',
                      selected.has(a.id)
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'border-border bg-muted/30 opacity-70',
                    )}
                  >
                    {selected.has(a.id)
                      ? <CheckSquare className="h-4 w-4 shrink-0 text-emerald-600" />
                      : <Square className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{a.label}</span>
                      {a.sub && <span className="block truncate text-[10px] text-muted-foreground">{a.sub}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="text-xs font-bold">پیش‌نمایش ورق چاپ — A4 افقی، ۱۰ کارت در هر صفحه با خطوط برش</p>
              <Button size="sm" variant="outline" className="ms-auto" disabled={busy} onClick={doPrint}>
                <Printer className="h-4 w-4 ms-1" /> چاپ ورق‌ها
              </Button>
            </div>
            <iframe
              title="پیش‌نمایش کارت‌های هویت"
              srcDoc={preview}
              className="w-full h-[70vh] min-h-[420px] rounded-lg border bg-white"
            />
            <p className="text-[11px] text-muted-foreground mt-2 leading-5">
              برای بند آویز: کادر سفید بالای هر کارت = محل سوراخ پونچ • خط‌چین = محل قیچی کردن. اندازهٔ هر کارت ۵۴×۸۶ میلی‌متر (سایز استندرد کارت آویزان) است.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
