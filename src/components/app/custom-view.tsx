'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, LoadingBlock, EmptyState, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, LayoutGrid, Sparkles } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  options?: string;
  required?: boolean;
}

export interface CustomSectionData {
  id: string;
  title: string;
  icon: string;
  color: string;
  fields: CustomField[];
  viewRoles: string[];
  writeRoles: string[];
  canWrite: boolean;
  entries: Array<{ id: string; data: Record<string, unknown>; entryDate: string | null; createdBy: string | null; createdAt: string }>;
}

const COLOR_OPTIONS = ['emerald', 'teal', 'sky', 'amber', 'rose', 'violet', 'slate'];
const ICON_OPTIONS = ['Sparkles', 'ClipboardList', 'Award', 'CalendarDays', 'BookMarked', 'Flag', 'Star', 'Heart', 'Trophy', 'Bell', 'FileText', 'Users'];

const COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-600', teal: 'bg-teal-600', sky: 'bg-sky-600', amber: 'bg-amber-500',
  rose: 'bg-rose-600', violet: 'bg-violet-600', slate: 'bg-slate-600',
};

const ROLE_LABELS_SHORT: Record<string, string> = {
  ADMIN: 'مدیر', HEADTEACHER: 'سرمعلم', TEACHER: 'معلم', STUDENT: 'شاگرد',
  GUARDIAN: 'سرپرست', STAFF: 'کارمند', LIBRARIAN: 'کتابخانه',
};

function IconFor({ name, className }: { name: string; className?: string }) {
  // آیکون‌ها به‌صورت ساده — از مجموعهٔ ایمپورت‌شده
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    Sparkles, ClipboardList: ClipboardListIc, Award: AwardIc, CalendarDays: CalendarDaysIc,
    BookMarked: BookMarkedIc, Flag: FlagIc, Star: StarIc, Heart: HeartIc, Trophy: TrophyIc,
    Bell: BellIc, FileText: FileTextIc, Users: UsersIc,
  };
  const Ic = icons[name] || Sparkles;
  return <Ic className={className} />;
}
import { ClipboardList as ClipboardListIc, Award as AwardIc, CalendarDays as CalendarDaysIc, BookMarked as BookMarkedIc, Flag as FlagIc, Star as StarIc, Heart as HeartIc, Trophy as TrophyIc, Bell as BellIc, FileText as FileTextIc, Users as UsersIc } from 'lucide-react';

interface FieldRow extends Partial<CustomField> { key: string; label: string; type: CustomField['type']; }

export function CustomSectionsView({ user, initialSectionId }: { user: SessionUser; initialSectionId?: string }) {
  const { toast } = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [sections, setSections] = useState<CustomSectionData[]>([]);
  const [activeId, setActiveId] = useState<string>(initialSectionId || '');
  const [loading, setLoading] = useState(true);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editSection, setEditSection] = useState<CustomSectionData | null>(null);
  const [bTitle, setBTitle] = useState('');
  const [bIcon, setBIcon] = useState('Sparkles');
  const [bColor, setBColor] = useState('emerald');
  const [bFields, setBFields] = useState<FieldRow[]>([{ key: 'title', label: 'عنوان', type: 'text' }]);
  const [bViewRoles, setBViewRoles] = useState<string[]>(['ADMIN', 'HEADTEACHER', 'TEACHER']);
  const [bWriteRoles, setBWriteRoles] = useState<string[]>(['ADMIN', 'HEADTEACHER', 'TEACHER']);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryEditId, setEntryEditId] = useState<string | null>(null);
  const [entryData, setEntryData] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ sections: CustomSectionData[] }>('/api/custom-sections');
      setSections(d.sections);
      setActiveId((cur) => cur || (initialSectionId && d.sections.some((s) => s.id === initialSectionId) ? initialSectionId : d.sections[0]?.id) || '');
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [initialSectionId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const active = useMemo(() => sections.find((s) => s.id === activeId) || null, [sections, activeId]);

  const openBuilder = (s: CustomSectionData | null) => {
    setEditSection(s);
    setBTitle(s?.title || '');
    setBIcon(s?.icon || 'Sparkles');
    setBColor(s?.color || 'emerald');
    setBFields(s ? s.fields.map((f) => ({ ...f })) : [{ key: 'title', label: 'عنوان', type: 'text' }]);
    setBViewRoles(s?.viewRoles || ['ADMIN', 'HEADTEACHER', 'TEACHER']);
    setBWriteRoles(s?.writeRoles || ['ADMIN', 'HEADTEACHER', 'TEACHER']);
    setBuilderOpen(true);
  };

  const saveSection = async () => {
    if (!bTitle.trim()) {
      toast({ title: 'خطا', description: 'عنوان بخش را وارد کنید', variant: 'destructive' });
      return;
    }
    const fields = bFields.filter((f) => f.key?.trim() && f.label?.trim());
    if (fields.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک فیلد لازم است', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      id: editSection?.id, title: bTitle.trim(), icon: bIcon, color: bColor,
      fields, viewRoles: bViewRoles, writeRoles: bWriteRoles,
    };
    const res = await apiSend('/api/custom-sections', editSection ? 'PATCH' : 'POST', payload);
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setBuilderOpen(false);
    toast({ title: editSection ? 'بخش ویرایش شد' : 'بخش جدید ساخته شد' });
    load();
  };

  const deleteSection = async (s: CustomSectionData) => {
    if (!confirm(`بخش «${s.title}» و همهٔ ثبت‌های آن حذف شود؟`)) return;
    const res = await apiSend(`/api/custom-sections?id=${s.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setActiveId('');
    toast({ title: 'بخش حذف شد' });
    load();
  };

  const openEntry = (section: CustomSectionData, entryId: string | null) => {
    setEntryEditId(entryId);
    const existing = entryId ? section.entries.find((e) => e.id === entryId) : null;
    const init: Record<string, string> = {};
    for (const f of section.fields) {
      init[f.key] = existing ? String(existing.data[f.key] ?? '') : '';
    }
    setEntryData(init);
    setEntryDate(existing?.entryDate || '');
    setEntryOpen(true);
  };

  const saveEntry = async () => {
    if (!active) return;
    for (const f of active.fields) {
      if (f.required && !String(entryData[f.key] || '').trim()) {
        toast({ title: 'خطا', description: `فیلد «${f.label}» الزامی است`, variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    const payload = {
      sectionId: active.id, id: entryEditId, data: entryData, entryDate,
    };
    const res = await apiSend('/api/custom-entries', entryEditId ? 'PATCH' : 'POST', payload);
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setEntryOpen(false);
    toast({ title: entryEditId ? 'ثبت ویرایش شد' : 'ثبت جدید ذخیره شد' });
    load();
  };

  const deleteEntry = async (entryId: string) => {
    if (!confirm('این ثبت حذف شود؟')) return;
    const res = await apiSend(`/api/custom-entries?id=${entryId}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'ثبت حذف شد' });
    load();
  };

  if (loading) return <LoadingBlock label="در حال بارگذاری بخش‌های دلخواه..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="بخش‌های دلخواه" subtitle="بخش‌هایی که مدیر با فیلدهای سفارشی ساخته است" icon={LayoutGrid} />

      {isAdmin && (
        <Button onClick={() => openBuilder(null)} className="gap-1.5">
          <Plus className="h-4 w-4" /> ساخت بخش جدید
        </Button>
      )}

      {sections.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="هنوز بخشی ساخته نشده"
          description={isAdmin ? 'با دکمهٔ «ساخت بخش جدید» می‌توانید برای امتحانات ماهانه، تقدیرها، وقایع مکتب یا هر نیاز دیگر یک بخش با فیلدهای دلخواه بسازید.' : 'مدیر مکتب هنوز بخشی برای شما نساخته است.'}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                s.id === activeId ? 'text-white shadow-sm' : 'bg-white border text-emerald-900 hover:bg-emerald-50'
              } ${s.id === activeId ? COLOR_MAP[s.color] || 'bg-emerald-600' : ''}`}
            >
              <IconFor name={s.icon} className="h-4 w-4" />
              {s.title}
              <span className="text-[10px] opacity-80">({toPersianDigits(s.entries.length)})</span>
            </button>
          ))}
        </div>
      )}

      {active && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <IconFor name={active.icon} className="h-5 w-5" /> {active.title}
            </CardTitle>
            <div className="flex gap-1.5">
              {active.canWrite && (
                <Button size="sm" onClick={() => openEntry(active, null)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> ثبت جدید
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button size="sm" variant="outline" onClick={() => openBuilder(active)} className="gap-1 border-emerald-300">
                    <Pencil className="h-3.5 w-3.5" /> ویرایش بخش
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteSection(active)} className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {active.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">هنوز ثبتی موجود نیست</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-emerald-50/60">
                      <TableHead className="w-12 text-center">شماره</TableHead>
                      {active.fields.map((f) => (
                        <TableHead key={f.key}>{f.label}</TableHead>
                      ))}
                      <TableHead>تاریخ ثبت</TableHead>
                      {active.canWrite && <TableHead className="w-24 text-center">عملیات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {active.entries.map((e, i) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-center text-muted-foreground">{toPersianDigits(i + 1)}</TableCell>
                        {active.fields.map((f) => (
                          <TableCell key={f.key} className="max-w-[220px] truncate">
                            {String(e.data[f.key] ?? '—')}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs text-muted-foreground">
                          {isoToJalaliDisplay(e.entryDate || e.createdAt.slice(0, 10))}
                        </TableCell>
                        {active.canWrite && (
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEntry(active, e.id)} aria-label="ویرایش">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => deleteEntry(e.id)} aria-label="حذف">
                                <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* بخش‌ساز */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSection ? `ویرایش بخش «${editSection.title}»` : 'ساخت بخش جدید'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="عنوان بخش (مثال: امتحان ماهانه)"><Input value={bTitle} onChange={(e) => setBTitle(e.target.value)} /></Field>
              <Field label="آیکون">
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={bIcon} onChange={(e) => setBIcon(e.target.value)}
                >
                  {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </Field>
              <Field label="رنگ">
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={bColor} onChange={(e) => setBColor(e.target.value)}
                >
                  {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">فیلدهای بخش</p>
              {bFields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-[130px]" placeholder="کلید (لاتین)" dir="ltr" value={f.key || ''}
                    onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, key: e.target.value } : x))} />
                  <Input className="max-w-[150px]" placeholder="برچسب" value={f.label || ''}
                    onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={f.type} onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, type: e.target.value as CustomField['type'] } : x))}
                  >
                    <option value="text">متن</option>
                    <option value="number">عدد</option>
                    <option value="date">تاریخ</option>
                    <option value="textarea">متن بلند</option>
                    <option value="select">انتخابی</option>
                  </select>
                  {f.type === 'select' && (
                    <Input className="max-w-[180px]" placeholder="گزینه‌ها با کاما" value={f.options || ''}
                      onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, options: e.target.value } : x))} />
                  )}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={!!f.required}
                      onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, required: e.target.checked } : x))} />
                    الزامی
                  </label>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" onClick={() => setBFields((fs) => fs.filter((_, ix) => ix !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1 border-emerald-300"
                onClick={() => setBFields((fs) => [...fs, { key: `field${fs.length + 1}`, label: '', type: 'text' }])}>
                <Plus className="h-3.5 w-3.5" /> افزودن فیلد
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium mb-1.5">چه کسی این بخش را می‌بیند؟</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROLE_LABELS_SHORT).map(([r, lbl]) => (
                    <label key={r} className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1">
                      <input type="checkbox" checked={bViewRoles.includes(r)}
                        onChange={(e) => setBViewRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1.5">چه کسی می‌تواند ثبت کند؟</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROLE_LABELS_SHORT).map(([r, lbl]) => (
                    <label key={r} className="flex items-center gap-1 text-xs border rounded-full px-2.5 py-1">
                      <input type="checkbox" checked={bWriteRoles.includes(r)}
                        onChange={(e) => setBWriteRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                      {lbl}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>انصراف</Button>
            <Button onClick={saveSection} disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیرهٔ بخش'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ثبت */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{entryEditId ? 'ویرایش ثبت' : 'ثبت جدید'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {active?.fields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? ' *' : '')}>
                {f.type === 'textarea' ? (
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData({ ...entryData, [f.key]: e.target.value })}
                  />
                ) : f.type === 'select' ? (
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData({ ...entryData, [f.key]: e.target.value })}
                  >
                    <option value="">— انتخاب کنید —</option>
                    {(f.options || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    dir={f.type === 'number' ? 'ltr' : undefined}
                    className={f.type === 'number' ? 'text-left' : ''}
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData({ ...entryData, [f.key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            <Field label="تاریخ ثبت (شمسی — اختیاری)">
              <Input placeholder="۱۴۰۵/۰۷/۲۸" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryOpen(false)}>انصراف</Button>
            <Button onClick={saveEntry} disabled={saving}>{saving ? 'در حال ذخیره...' : 'ذخیره'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
