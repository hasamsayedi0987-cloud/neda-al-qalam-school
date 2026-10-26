'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, LoadingBlock, EmptyState, Field, JalaliDatePicker } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, isoToday, toPersianDigits } from '@/lib/jalali';
import { fileStamp } from '@/lib/client/exports';
import { ROLE_LABELS } from '@/lib/grading';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Pencil, Trash2, LayoutGrid, Sparkles, ClipboardList, Award, CalendarDays,
  BookMarked, Flag, Star, Heart, Trophy, Bell, FileText, Users,
  Search, Download, ArrowDownWideNarrow, ArrowUpNarrowWide, Eraser,
} from 'lucide-react';
import type { SessionUser } from '@/lib/types';

/* ─────────────────────────  انواع  ───────────────────────── */

export type CustomFieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'file';

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
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

type FieldRow = CustomField;

/* ─────────────────────────  ثابت‌ها  ───────────────────────── */

const COLOR_OPTIONS = ['emerald', 'teal', 'sky', 'amber', 'rose', 'violet', 'slate'];
const ICON_OPTIONS = ['Sparkles', 'ClipboardList', 'Award', 'CalendarDays', 'BookMarked', 'Flag', 'Star', 'Heart', 'Trophy', 'Bell', 'FileText', 'Users'];

const COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-600', teal: 'bg-teal-600', sky: 'bg-sky-600', amber: 'bg-amber-500',
  rose: 'bg-rose-600', violet: 'bg-violet-600', slate: 'bg-slate-600',
};

const ALL_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'متن',
  number: 'عدد',
  date: 'تاریخ',
  textarea: 'متن بلند',
  select: 'چندگزینه‌ای',
  checkbox: 'چک‌باکس',
  file: 'فایل/عکس',
};

/** محدودیت فایل: ۱۰۰ کیلوبایت (فایل‌های غیرعکس) */
const FILE_MAX_BYTES = 100 * 1024;
const FILE_LIMIT_LABEL = 'حداکثر ۱۰۰ کیلوبایت';
/** عکس‌ها پس از فشرده‌سازی: حداکثر ۴۰۰ پیکسل، JPEG با کیفیت ۰٫۷ */
const IMG_MAX_PX = 400;
const IMG_QUALITY = 0.7;

const QUEUED_MSG = 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود';

/* ─────────────────────────  آیکون بخش  ───────────────────────── */

function IconFor({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    Sparkles, ClipboardList, Award, CalendarDays, BookMarked, Flag, Star, Heart,
    Trophy, Bell, FileText, Users,
  };
  const Ic = icons[name] || Sparkles;
  return <Ic className={className} />;
}

/* ─────────────────────────  ابزارهای فایل  ───────────────────────── */

/** فشرده‌سازی عکس با بوم — حداکثر ۴۰۰ پیکسل، JPEG کیفیت ۰٫۷ */
async function imageToCompactDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMG_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', IMG_QUALITY);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

/** حجم تقریبی باینری یک dataURL (base64) به بایت */
function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor(b64.length * 0.75);
}

interface FileValue { name: string; url: string; isImage: boolean }

/** خواندن مقدار فیلد فایل — قالب JSON {name,url} یا dataURL خام */
function fileInfo(v: unknown): FileValue | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.startsWith('data:')) return { name: 'فایل', url: s, isImage: s.startsWith('data:image') };
  try {
    const o = JSON.parse(s) as { name?: string; url?: string };
    if (o.url && o.url.startsWith('data:')) {
      return { name: o.name || 'فایل', url: o.url, isImage: o.url.startsWith('data:image') };
    }
  } catch {
    /* دادهٔ نامعتبر — نادیده گرفته می‌شود */
  }
  return null;
}

function optionsOf(f: Pick<CustomField, 'options'>): string[] {
  return (f.options || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** تاریخ ملاک هر ثبت — تاریخ انتخابی یا تاریخ ایجاد */
function entryIso(e: CustomSectionData['entries'][number]): string {
  return e.entryDate || e.createdAt.slice(0, 10);
}

/* ─────────────────────────  ابزارهای CSV  ───────────────────────── */

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvCellText(f: CustomField, v: unknown): string {
  if (f.type === 'file') return fileInfo(v)?.name || '';
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (f.type === 'date') return isoToJalaliDisplay(s, false);
  return s;
}

/* ─────────────────────────  خانهٔ جدول  ───────────────────────── */

function EntryCell({ field, value }: { field: CustomField; value: unknown }) {
  if (field.type === 'file') {
    const fv = fileInfo(value);
    if (!fv) return <span className="text-muted-foreground">—</span>;
    if (fv.isImage) {
      return (
        <a href={fv.url} download={fv.name} title={`دانلود ${fv.name}`} className="inline-block align-middle">
          <img src={fv.url} alt={fv.name} className="h-12 w-12 rounded-md object-cover border border-emerald-200 dark:border-emerald-800" />
        </a>
      );
    }
    return (
      <a href={fv.url} download={fv.name} title={`دانلود ${fv.name}`}
        className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 underline underline-offset-4">
        <Download className="h-3 w-3 shrink-0" />
        <span className="max-w-[150px] truncate" dir="ltr">{fv.name}</span>
      </a>
    );
  }
  const s = String(value ?? '').trim();
  if (!s) return <span className="text-muted-foreground">—</span>;
  if (field.type === 'date') return <span className="text-xs">{isoToJalaliDisplay(s)}</span>;
  return <span className="block truncate">{s}</span>;
}

/* ─────────────────────────  ورودی فایل در فرم ثبت  ───────────────────────── */

function FileEntryInput({ value, onPick, onClear }: { value: string; onPick: (f: File) => void; onClear: () => void }) {
  const fv = fileInfo(value);
  return (
    <div className="space-y-2">
      <Input
        type="file"
        dir="ltr"
        className="text-xs"
        onChange={(e) => {
          const fl = e.target.files?.[0];
          if (fl) onPick(fl);
          e.target.value = '';
        }}
      />
      {fv && (
        <div className="flex items-center gap-2">
          {fv.isImage && (
            <img src={fv.url} alt={fv.name} className="h-14 w-14 rounded-md object-cover border border-emerald-200 dark:border-emerald-800" />
          )}
          <span className="text-xs text-muted-foreground truncate max-w-[180px]" dir="ltr">{fv.name}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-rose-600" onClick={onClear}>
            <Trash2 className="h-3 w-3" /> حذف فایل
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  ویو اصلی  ───────────────────────── */

export function CustomSectionsView({ user, initialSectionId }: { user: SessionUser; initialSectionId?: string }) {
  const { toast } = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [sections, setSections] = useState<CustomSectionData[]>([]);
  const [activeId, setActiveId] = useState<string>(initialSectionId || '');
  const [loading, setLoading] = useState(true);

  // بخش‌ساز
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editSection, setEditSection] = useState<CustomSectionData | null>(null);
  const [bTitle, setBTitle] = useState('');
  const [bIcon, setBIcon] = useState('Sparkles');
  const [bColor, setBColor] = useState('emerald');
  const [bFields, setBFields] = useState<FieldRow[]>([{ key: 'title', label: 'عنوان', type: 'text' }]);
  const [bViewRoles, setBViewRoles] = useState<string[]>(['ADMIN', 'HEADTEACHER', 'TEACHER']);
  const [bWriteRoles, setBWriteRoles] = useState<string[]>(['ADMIN', 'HEADTEACHER', 'TEACHER']);

  // فرم ثبت
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryEditId, setEntryEditId] = useState<string | null>(null);
  const [entryData, setEntryData] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState('');
  const [saving, setSaving] = useState(false);

  // ابزارهای مدیریت داده
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');
  const [deletingAll, setDeletingAll] = useState(false);
  // بازنشانی جستجو هنگام تغییر بخش — الگوی رسمی React: تنظیم state حین رندر بر اساس تغییر prop/state
  const [lastActiveId, setLastActiveId] = useState(activeId);
  if (activeId !== lastActiveId) {
    setLastActiveId(activeId);
    setSearch('');
  }

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

  /** ثبت‌های فیلترشده با جستجو + مرتب‌شده بر اساس تاریخ */
  const filteredEntries = useMemo(() => {
    if (!active) return [];
    let list = [...active.entries];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const hay = [
          ...active.fields.map((f) => {
            if (f.type === 'file') return fileInfo(e.data[f.key])?.name || '';
            const s = String(e.data[f.key] ?? '').trim();
            if (f.type === 'date' && s) return `${s} ${isoToJalaliDisplay(s)}`;
            return s;
          }),
          e.createdBy || '',
          entryIso(e),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    list.sort((a, b) => {
      const da = entryIso(a);
      const db = entryIso(b);
      const cmp = da < db ? -1 : da > db ? 1 : 0;
      return sortDir === 'newest' ? -cmp : cmp;
    });
    return list;
  }, [active, search, sortDir]);

  /* ─────── بخش‌ساز ─────── */

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
    const fields: CustomField[] = [];
    for (const f of bFields) {
      const key = f.key.trim().replace(/[^a-zA-Z0-9_]/g, '');
      const label = f.label.trim();
      if (!key && !label) continue;
      if (!key || !label) {
        toast({ title: 'خطا', description: 'هر فیلد باید هم کلید (لاتین) و هم برچسب داشته باشد', variant: 'destructive' });
        return;
      }
      fields.push({ ...f, key, label });
    }
    if (fields.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک فیلد لازم است', variant: 'destructive' });
      return;
    }
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) {
        toast({ title: 'خطا', description: `کلید فیلدها باید یکتا باشد — «${f.key}» تکرار شده است`, variant: 'destructive' });
        return;
      }
      keys.add(f.key);
      if (f.type === 'select' && optionsOf(f).length === 0) {
        toast({ title: 'خطا', description: `برای فیلد چندگزینه‌ای «${f.label}» حداقل یک گزینه وارد کنید`, variant: 'destructive' });
        return;
      }
    }
    if (bViewRoles.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک نقش برای نمایش بخش انتخاب کنید', variant: 'destructive' });
      return;
    }
    if (bWriteRoles.length === 0) {
      toast({ title: 'خطا', description: 'حداقل یک نقش برای ثبت در بخش انتخاب کنید', variant: 'destructive' });
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
    toast({
      title: editSection ? 'بخش ویرایش شد' : 'بخش جدید ساخته شد',
      description: res.queued ? QUEUED_MSG : undefined,
    });
    load();
  };

  const deleteSection = async (s: CustomSectionData) => {
    if (!window.confirm(`بخش «${s.title}» و همهٔ ثبت‌های آن حذف شود؟`)) return;
    const res = await apiSend(`/api/custom-sections?id=${s.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setActiveId('');
    toast({ title: 'بخش حذف شد', description: res.queued ? QUEUED_MSG : undefined });
    load();
  };

  /* ─────── فرم ثبت ─────── */

  const openEntry = (section: CustomSectionData, entryId: string | null) => {
    setEntryEditId(entryId);
    const existing = entryId ? section.entries.find((e) => e.id === entryId) : null;
    const init: Record<string, string> = {};
    for (const f of section.fields) {
      if (existing) {
        init[f.key] = f.type === 'checkbox'
          ? (existing.data[f.key] === 'بله' ? 'بله' : 'نخیر')
          : String(existing.data[f.key] ?? '');
      } else {
        init[f.key] = f.type === 'date' ? isoToday() : f.type === 'checkbox' ? 'نخیر' : '';
      }
    }
    setEntryData(init);
    setEntryDate(existing?.entryDate || '');
    setEntryOpen(true);
  };

  const handleFilePick = async (fieldKey: string, file: File) => {
    try {
      let url: string;
      if (file.type.startsWith('image/')) {
        url = await imageToCompactDataUrl(file);
        if (dataUrlBytes(url) > FILE_MAX_BYTES) {
          toast({ title: 'خطا', description: 'عکس پس از فشرده‌سازی هم بزرگ است — لطفاً عکس کوچک‌تری انتخاب کنید', variant: 'destructive' });
          return;
        }
      } else {
        if (file.size > FILE_MAX_BYTES) {
          toast({
            title: 'فایل بزرگ است',
            description: `حجم «${file.name}» ${toPersianDigits(Math.ceil(file.size / 1024))} کیلوبایت است — ${FILE_LIMIT_LABEL}`,
            variant: 'destructive',
          });
          return;
        }
        url = await readAsDataUrl(file);
        if (dataUrlBytes(url) > FILE_MAX_BYTES) {
          toast({ title: 'فایل بزرگ است', description: `${FILE_LIMIT_LABEL} — فایل کوچک‌تری انتخاب کنید`, variant: 'destructive' });
          return;
        }
      }
      setEntryData((d) => ({ ...d, [fieldKey]: JSON.stringify({ name: file.name, url }) }));
    } catch {
      toast({ title: 'خطا', description: 'خواندن فایل ناموفق بود', variant: 'destructive' });
    }
  };

  const saveEntry = async () => {
    if (!active) return;
    for (const f of active.fields) {
      const v = String(entryData[f.key] ?? '').trim();
      if (f.required && f.type === 'checkbox' && v !== 'بله') {
        toast({ title: 'خطا', description: `فیلد «${f.label}» الزامی است`, variant: 'destructive' });
        return;
      }
      if (f.required && f.type !== 'checkbox' && !v) {
        toast({ title: 'خطا', description: `فیلد «${f.label}» الزامی است`, variant: 'destructive' });
        return;
      }
      if (f.type === 'number' && v && Number.isNaN(Number(v))) {
        toast({ title: 'خطا', description: `فیلد «${f.label}» باید عدد باشد`, variant: 'destructive' });
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
    toast({
      title: entryEditId ? 'ثبت ویرایش شد' : 'ثبت جدید ذخیره شد',
      description: res.queued ? QUEUED_MSG : undefined,
    });
    load();
  };

  const deleteEntry = async (entryId: string) => {
    if (!window.confirm('این ثبت حذف شود؟')) return;
    const res = await apiSend(`/api/custom-entries?id=${entryId}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'ثبت حذف شد', description: res.queued ? QUEUED_MSG : undefined });
    load();
  };

  /* ─────── ابزارهای مدیریت داده ─────── */

  const exportCsv = (s: CustomSectionData) => {
    if (filteredEntries.length === 0) {
      toast({ title: 'خطا', description: 'ثبتی برای خروجی وجود ندارد', variant: 'destructive' });
      return;
    }
    const rows: string[][] = [];
    rows.push(['شماره', ...s.fields.map((f) => f.label), 'تاریخ ثبت', 'ثبت‌کننده']);
    filteredEntries.forEach((e, i) => {
      rows.push([
        String(i + 1),
        ...s.fields.map((f) => csvCellText(f, e.data[f.key])),
        isoToJalaliDisplay(entryIso(e), false),
        e.createdBy || '',
      ]);
    });
    const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (s.title || 'بخش').replace(/[\\/:*?"<>|]/g, '-').trim();
    a.href = url;
    a.download = `${safeTitle}-${fileStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    toast({ title: 'خروجی CSV دانلود شد', description: `${toPersianDigits(filteredEntries.length)} ثبت از بخش «${s.title}»` });
  };

  const deleteAllEntries = async (s: CustomSectionData) => {
    if (s.entries.length === 0) return;
    if (!window.confirm(`همهٔ ${toPersianDigits(s.entries.length)} ثبت بخش «${s.title}» حذف شود؟ این عمل بازگشت‌پذیر نیست.`)) return;
    if (!window.confirm('تایید نهایی: با حذف، همهٔ داده‌های این بخش برای همیشه از بین می‌رود. مطمئن هستید؟')) return;
    setDeletingAll(true);
    let queued = false;
    for (const e of s.entries) {
      const res = await apiSend(`/api/custom-entries?id=${e.id}`, 'DELETE');
      if (res.error) {
        setDeletingAll(false);
        toast({ title: 'خطا', description: res.error, variant: 'destructive' });
        return;
      }
      if (res.queued) queued = true;
    }
    setDeletingAll(false);
    setSearch('');
    toast({ title: 'همهٔ ثبت‌ها حذف شد', description: queued ? QUEUED_MSG : undefined });
    load();
  };

  /* ─────── نمایش ─────── */

  if (loading) return <LoadingBlock label="در حال بارگذاری بخش‌های دلخواه..." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="بخش‌های دلخواه"
        subtitle="بخش‌های سفارشی با فیلدهای متنوع، جستجو، خروجی CSV و تنظیم دقیق دسترسی"
        icon={LayoutGrid}
      />

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
                s.id === activeId ? 'text-white shadow-sm' : 'bg-card border text-foreground hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
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
        <Card className="border-emerald-100 dark:border-emerald-900">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
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
                  <Button size="sm" variant="outline" onClick={() => deleteSection(active)} className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* ابزارهای جستجو، مرتب‌سازی، خروجی و حذف گروهی */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجو در همهٔ فیلدها..."
                  className="pr-9 h-9 text-sm"
                />
              </div>
              <Button
                variant="outline" size="sm" className="gap-1.5 border-emerald-300"
                onClick={() => setSortDir((d) => (d === 'newest' ? 'oldest' : 'newest'))}
                title="مرتب‌سازی بر اساس تاریخ"
              >
                {sortDir === 'newest' ? <ArrowDownWideNarrow className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
                {sortDir === 'newest' ? 'جدیدترین' : 'قدیمی‌ترین'}
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1.5 border-emerald-300"
                onClick={() => exportCsv(active)}
                disabled={filteredEntries.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> خروجی CSV
              </Button>
              {active.canWrite && (
                <Button
                  variant="outline" size="sm"
                  className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => deleteAllEntries(active)}
                  disabled={active.entries.length === 0 || deletingAll}
                >
                  <Eraser className="h-3.5 w-3.5" /> {deletingAll ? 'در حال حذف...' : 'حذف همه'}
                </Button>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {search.trim()
                  ? `${toPersianDigits(filteredEntries.length)} از ${toPersianDigits(active.entries.length)} ثبت`
                  : `${toPersianDigits(active.entries.length)} ثبت`}
              </span>
            </div>

            {active.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">هنوز ثبتی موجود نیست</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-emerald-50/60 dark:bg-emerald-950/30">
                      <TableHead className="w-12 text-center">شماره</TableHead>
                      {active.fields.map((f) => (
                        <TableHead key={f.key}>{f.label}</TableHead>
                      ))}
                      <TableHead>تاریخ ثبت</TableHead>
                      <TableHead className="max-w-[140px]">ثبت‌کننده</TableHead>
                      {active.canWrite && <TableHead className="w-24 text-center">عملیات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={active.fields.length + 3 + (active.canWrite ? 1 : 0)} className="text-center text-sm text-muted-foreground py-8">
                          نتیجه‌ای برای جستجوی شما یافت نشد
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEntries.map((e, i) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-center text-muted-foreground">{toPersianDigits(i + 1)}</TableCell>
                          {active.fields.map((f) => (
                            <TableCell key={f.key} className="max-w-[220px]">
                              <EntryCell field={f} value={e.data[f.key]} />
                            </TableCell>
                          ))}
                          <TableCell className="text-xs text-muted-foreground">
                            {isoToJalaliDisplay(entryIso(e))}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                            {e.createdBy || '—'}
                          </TableCell>
                          {active.canWrite && (
                            <TableCell className="text-center">
                              <div className="flex justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEntry(active, e.id)} aria-label="ویرایش" title="ویرایش">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => deleteEntry(e.id)} aria-label="حذف" title="حذف">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
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
                  <Input className="max-w-[130px]" placeholder="کلید (لاتین)" dir="ltr" value={f.key}
                    onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, key: e.target.value } : x))} />
                  <Input className="max-w-[150px]" placeholder="برچسب" value={f.label}
                    onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={f.type}
                    onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, type: e.target.value as CustomFieldType } : x))}
                  >
                    {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                      <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  {f.type === 'select' && (
                    <div>
                      <Input className="max-w-[220px]" placeholder="گزینه‌ها با کاما: عالی, خوب, ضعیف"
                        value={f.options || ''}
                        onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, options: e.target.value } : x))} />
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{toPersianDigits(optionsOf(f).length)} گزینه</p>
                    </div>
                  )}
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="checkbox" className="accent-emerald-600" checked={!!f.required}
                      onChange={(e) => setBFields((fs) => fs.map((x, ix) => ix === i ? { ...x, required: e.target.checked } : x))} />
                    الزامی
                  </label>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label="حذف فیلد" title="حذف فیلد"
                    onClick={() => setBFields((fs) => fs.filter((_, ix) => ix !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1 border-emerald-300"
                onClick={() => setBFields((fs) => [...fs, { key: `field${fs.length + 1}`, label: '', type: 'text' }])}>
                <Plus className="h-3.5 w-3.5" /> افزودن فیلد
              </Button>
              <p className="text-[11px] text-muted-foreground leading-5">
                فیلد «فایل/عکس»: عکس‌ها خودکار فشرده می‌شوند (حداکثر {toPersianDigits(IMG_MAX_PX)} پیکسل)؛ سایر فایل‌ها {FILE_LIMIT_LABEL} مجازند.
                فایل‌ها در جدول به‌صورت عکس کوچک یا لینک دانلود نمایش می‌یابند.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">چه کسی این بخش را می‌بیند؟</p>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setBViewRoles([...ALL_ROLES])}>همه</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setBViewRoles(['ADMIN'])}>فقط مدیر</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className={`flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 cursor-pointer transition-colors ${
                      bViewRoles.includes(r) ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300' : ''
                    }`}>
                      <input type="checkbox" className="accent-emerald-600" checked={bViewRoles.includes(r)}
                        onChange={(e) => setBViewRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                      {ROLE_LABELS[r] || r}
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">چه کسی می‌تواند ثبت کند؟</p>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setBWriteRoles([...ALL_ROLES])}>همه</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setBWriteRoles(['ADMIN'])}>فقط مدیر</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className={`flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 cursor-pointer transition-colors ${
                      bWriteRoles.includes(r) ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300' : ''
                    }`}>
                      <input type="checkbox" className="accent-emerald-600" checked={bWriteRoles.includes(r)}
                        onChange={(e) => setBWriteRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                      {ROLE_LABELS[r] || r}
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
              <Field
                key={f.key}
                label={f.label + (f.required ? ' *' : '')}
                hint={f.type === 'file'
                  ? `عکس‌ها خودکار فشرده می‌شوند (حداکثر ${toPersianDigits(IMG_MAX_PX)} پیکسل)؛ سایر فایل‌ها ${FILE_LIMIT_LABEL}`
                  : f.type === 'select' ? 'یک گزینه انتخاب کنید' : undefined}
              >
                {f.type === 'textarea' ? (
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                ) : f.type === 'select' ? (
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData((d) => ({ ...d, [f.key]: e.target.value }))}
                  >
                    <option value="">— انتخاب کنید —</option>
                    {optionsOf(f).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === 'date' ? (
                  <JalaliDatePicker
                    value={entryData[f.key] || ''}
                    onChange={(iso) => setEntryData((d) => ({ ...d, [f.key]: iso }))}
                  />
                ) : f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={entryData[f.key] === 'بله'}
                      onChange={(e) => setEntryData((d) => ({ ...d, [f.key]: e.target.checked ? 'بله' : 'نخیر' }))}
                    />
                    <span className={entryData[f.key] === 'بله' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                      {entryData[f.key] === 'بله' ? 'بله' : 'نخیر'}
                    </span>
                  </label>
                ) : f.type === 'file' ? (
                  <FileEntryInput
                    value={entryData[f.key] || ''}
                    onPick={(fl) => void handleFilePick(f.key, fl)}
                    onClear={() => setEntryData((d) => ({ ...d, [f.key]: '' }))}
                  />
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    dir={f.type === 'number' ? 'ltr' : undefined}
                    className={f.type === 'number' ? 'text-left' : ''}
                    value={entryData[f.key] || ''}
                    onChange={(e) => setEntryData((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
            <Field label="تاریخ ثبت (شمسی — اختیاری)">
              <JalaliDatePicker value={entryDate} onChange={setEntryDate} />
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
