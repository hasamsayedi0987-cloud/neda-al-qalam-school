'use client';

/**
 * تقدیرنامه‌ساز و مکاتبات اداری — ابزار طراحی آزاد و پیشرفته
 *
 * قابلیت‌ها:
 *  - کاغذ: A4 / A5 / Letter / سفارشی (میلی‌متر) — پیش‌نمایش و چاپ دقیقاً هم‌اندازه (@page size)
 *  - بلوک‌های متنی آزاد: چندمتن با اندازه، بولد، چینش، رنگ و جای عمودی (۰ تا ۱۰۰٪)
 *  - بلوک جدول: سطر/ستون دلخواه با ویرایش سلولی — برای مکتوب، استعلام و جدول نمرات
 *  - لوگو: پیش‌فرض /logo.png یا آپلود دلخواه (فشرده تا ۳۰۰px) با اندازه و موقعیت
 *  - رنگ‌ها و قاب: پس‌زمینه، متن، تزئینات، قاب (رنگ/استایل/ضخامت)
 *  - امضاها: حداکثر ۲ خط امضا با عنوان دلخواه
 *  - قالب‌ها: ذخیره/بارگیری از /api/certificates — سازگار با قالب‌های قدیمی (فیلدهای جدید = پیش‌فرض)
 *  - آفلاین: همهٔ ذخیره‌ها با apiSend (صف همگام‌سازی خودکار)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, Field } from './ui-bits';
import { fullName } from '@/lib/utils';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits, isoToJalaliDisplay, isoToday } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import {
  Award, Columns3, FileText, Image as ImageIcon, MoveDown, MoveUp, Palette, PenLine,
  Plus, Printer, RotateCcw, Rows3, Save, Table2, Trash2, Type, Upload, Wand2,
} from 'lucide-react';
import type { SessionUser, StudentInfo, TeacherInfo } from '@/lib/types';

// ═══════════ انواع ═══════════

export type PaperSize = 'A4' | 'A5' | 'LETTER' | 'CUSTOM';
export type TextAlign = 'right' | 'center' | 'left';
export type LogoPos = 'top-right' | 'top-center' | 'top-left';

export interface CertTextBlock {
  id: string;
  content: string;
  size: number; // pt
  bold: boolean;
  align: TextAlign;
  color: string;
  vpos: number; // ۰ تا ۱۰۰ — درصد ارتفاع ورق
}

export interface CertTableConfig {
  enabled: boolean;
  rows: string[][];
  fontSize: number; // pt
  headerBold: boolean;
  vpos: number; // ۰ تا ۱۰۰
}

export interface CertSignature {
  id: string;
  title: string;
}

export interface CertConfig {
  // فیلدهای قدیمی — برای سازگاری با قالب‌های ذخیره‌شدهٔ قبلی حفظ شده‌اند
  title: string;
  subtitle: string;
  body: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  borderStyle: string;
  borderWidth: number;
  borderColor: string;
  fontFamily: string;
  titleSize: number;
  bodySize: number;
  showLogo: boolean;
  logoSize: number;
  showDate: boolean;
  showSignature: boolean;
  signatureName: string;
  dateText: string;
  // فیلدهای جدید ابزار طراحی آزاد
  paper: PaperSize;
  paperWidth: number; // میلی‌متر — برای کاغذ سفارشی
  paperHeight: number;
  logoPos: LogoPos;
  logoSrc: string; // dataURL یا '' (یعنی /logo.png پیش‌فرض)
  textBlocks: CertTextBlock[];
  table: CertTableConfig;
  signatures: CertSignature[];
}

export interface CertTemplate {
  id: string;
  name: string;
  config: CertConfig;
}

// ═══════════ ثابت‌ها ═══════════

const PAPERS: { value: PaperSize; label: string; w: number; h: number }[] = [
  { value: 'A4', label: `A4 استاندارد (${toPersianDigits(210)}×${toPersianDigits(297)})`, w: 210, h: 297 },
  { value: 'A5', label: `A5 نیم‌ورقی (${toPersianDigits(148)}×${toPersianDigits(210)})`, w: 148, h: 210 },
  { value: 'LETTER', label: `Letter امریکایی (${toPersianDigits(216)}×${toPersianDigits(279)})`, w: 216, h: 279 },
  { value: 'CUSTOM', label: 'سفارشی', w: 0, h: 0 },
];

const BORDER_STYLES = [
  { value: 'solid', label: 'خط ساده' },
  { value: 'double', label: 'خط دوگانه' },
  { value: 'dashed', label: 'خط چین' },
  { value: 'dotted', label: 'نقطه‌چین' },
  { value: 'none', label: 'بدون خط' },
];

const FONT_OPTIONS = [
  { value: 'Vazirmatn', label: 'وزیرمتن' },
  { value: 'serif', label: 'نستعلیق‌گونه (سریف)' },
  { value: 'sans-serif', label: 'ساده (سنس)' },
];

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'right', label: 'راست‌چین' },
  { value: 'center', label: 'وسط‌چین' },
  { value: 'left', label: 'چپ‌چین' },
];

const LOGO_POS_OPTIONS: { value: LogoPos; label: string }[] = [
  { value: 'top-right', label: 'بالا — راست' },
  { value: 'top-center', label: 'بالا — وسط' },
  { value: 'top-left', label: 'بالا — چپ' },
];

const makeRows = (r: number, c: number): string[][] =>
  Array.from({ length: Math.max(1, Math.min(12, Math.round(r))) }, () =>
    Array.from({ length: Math.max(1, Math.min(8, Math.round(c))) }, () => ''));

const DEFAULT_TABLE: CertTableConfig = {
  enabled: false,
  rows: makeRows(3, 4),
  fontSize: 11,
  headerBold: true,
  vpos: 55,
};

const DEFAULT_CONFIG: CertConfig = {
  // قدیمی
  title: 'تقدیرنامه',
  subtitle: 'مکتب خصوصی نداالقلم',
  body: 'بدین‌وسیله از شاگرد محترم {نام} صنف {صنف} به سبب {علت} قدردانی و تقدیر می‌گردد. امید است با تلاش بیشتر، موفقیت‌های بعدی را رقم بزند.',
  bgColor: '#f0fdf4',
  textColor: '#064e3b',
  accentColor: '#047857',
  borderStyle: 'double',
  borderWidth: 6,
  borderColor: '#047857',
  fontFamily: 'Vazirmatn',
  titleSize: 34,
  bodySize: 17,
  showLogo: true,
  logoSize: 84,
  showDate: true,
  showSignature: true,
  signatureName: 'مدیر مکتب',
  dateText: '',
  // جدید
  paper: 'A4',
  paperWidth: 210,
  paperHeight: 297,
  logoPos: 'top-center',
  logoSrc: '',
  textBlocks: [],
  table: { ...DEFAULT_TABLE, rows: makeRows(3, 4) },
  signatures: [{ id: 'sig1', title: 'مدیر مکتب' }],
};

// ═══════════ کمک‌ها ═══════════

const uid = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const clampN = (v: unknown, min: number, max: number, d: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

const asStr = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const asBool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

function normalizeTextBlocks(v: unknown): CertTextBlock[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((raw) => {
    const b = (raw ?? {}) as Record<string, unknown>;
    const align = b.align === 'left' || b.align === 'center' || b.align === 'right' ? b.align : 'center';
    return {
      id: asStr(b.id, uid()),
      content: asStr(b.content, ''),
      size: clampN(b.size, 6, 96, 14),
      bold: asBool(b.bold, false),
      align: align as TextAlign,
      color: asStr(b.color, '#064e3b'),
      vpos: clampN(b.vpos, 0, 100, 40),
    };
  });
}

function normalizeTable(v: unknown): CertTableConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const rawRows = Array.isArray(o.rows) ? o.rows : [];
  const rows = rawRows
    .slice(0, 12)
    .map((r) => {
      const cells = Array.isArray(r) ? r.slice(0, 8).map((c) => asStr(c, '')) : [];
      return cells.length ? cells : [''];
    });
  return {
    enabled: asBool(o.enabled, false),
    rows: rows.length ? rows : makeRows(3, 4),
    fontSize: clampN(o.fontSize, 6, 24, 11),
    headerBold: asBool(o.headerBold, true),
    vpos: clampN(o.vpos, 0, 100, 55),
  };
}

function normalizeSignatures(v: unknown, legacyShow: boolean, legacyName: string): CertSignature[] {
  if (Array.isArray(v)) {
    const list = v
      .slice(0, 2)
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return { id: asStr(o.id, uid()), title: asStr(o.title, '') };
      })
      .filter((s) => s.title.trim());
    if (list.length) return list;
  }
  // سازگاری با قالب‌های قدیمی: showSignature + signatureName → یک خط امضا
  return legacyShow && legacyName.trim() ? [{ id: uid(), title: legacyName.trim() }] : [];
}

/** پیکربندی ناقص/قدیمی را با پیش‌فرض‌ها کامل می‌کند — قالب‌های قبلی بدون مشکل بار می‌شوند */
export function normalizeConfig(raw: unknown): CertConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const paper: PaperSize = o.paper === 'A5' || o.paper === 'LETTER' || o.paper === 'CUSTOM' ? o.paper : 'A4';
  const legacyShow = asBool(o.showSignature, true);
  const legacyName = asStr(o.signatureName, DEFAULT_CONFIG.signatureName);
  return {
    title: asStr(o.title, DEFAULT_CONFIG.title),
    subtitle: asStr(o.subtitle, DEFAULT_CONFIG.subtitle),
    body: asStr(o.body, DEFAULT_CONFIG.body),
    bgColor: asStr(o.bgColor, DEFAULT_CONFIG.bgColor),
    textColor: asStr(o.textColor, DEFAULT_CONFIG.textColor),
    accentColor: asStr(o.accentColor, DEFAULT_CONFIG.accentColor),
    borderStyle: asStr(o.borderStyle, DEFAULT_CONFIG.borderStyle),
    borderWidth: clampN(o.borderWidth, 0, 24, DEFAULT_CONFIG.borderWidth),
    borderColor: asStr(o.borderColor, DEFAULT_CONFIG.borderColor),
    fontFamily: asStr(o.fontFamily, DEFAULT_CONFIG.fontFamily),
    titleSize: clampN(o.titleSize, 12, 72, DEFAULT_CONFIG.titleSize),
    bodySize: clampN(o.bodySize, 8, 32, DEFAULT_CONFIG.bodySize),
    showLogo: asBool(o.showLogo, true),
    logoSize: clampN(o.logoSize, 40, 200, DEFAULT_CONFIG.logoSize),
    showDate: asBool(o.showDate, true),
    showSignature: legacyShow,
    signatureName: legacyName,
    dateText: asStr(o.dateText, ''),
    paper,
    paperWidth: clampN(o.paperWidth, 60, 500, 210),
    paperHeight: clampN(o.paperHeight, 60, 500, 297),
    logoPos: o.logoPos === 'top-right' || o.logoPos === 'top-left' ? o.logoPos : 'top-center',
    logoSrc: asStr(o.logoSrc, ''),
    textBlocks: normalizeTextBlocks(o.textBlocks),
    table: normalizeTable(o.table),
    signatures: normalizeSignatures(o.signatures, legacyShow, legacyName),
  };
}

/** ابعاد نهایی ورق به میلی‌متر */
export function resolvePaper(cfg: CertConfig): { w: number; h: number } {
  const preset = PAPERS.find((p) => p.value === cfg.paper);
  if (preset && preset.w > 0) return { w: preset.w, h: preset.h };
  return { w: clampN(cfg.paperWidth, 60, 500, 210), h: clampN(cfg.paperHeight, 60, 500, 297) };
}

const effectiveSignatures = (cfg: CertConfig): CertSignature[] =>
  (Array.isArray(cfg.signatures) ? cfg.signatures : []).slice(0, 2);

// ═══════════ ورق مشترک پیش‌نمایش و چاپ (WYSIWYG) ═══════════

function CertSheet({ cfg, mode, fill, dateStr }: {
  cfg: CertConfig;
  mode: 'screen' | 'print';
  fill: (text: string) => string;
  dateStr: string;
}) {
  const paper = resolvePaper(cfg);
  const isPrint = mode === 'print';
  // مقیاس نمایش: حداکثر ۲.۲ پیکسل بر میلی‌متر تا ورق‌های بزرگ هم در صفحه جا شوند
  const scale = isPrint ? 1 : Math.min(2.2, 540 / paper.w);
  const uMm = (v: number): string => (isPrint ? `${v}mm` : `${Math.round(v * scale * 10) / 10}px`);
  // ۱pt = ۰.۳۵۲۸mm — اندازه‌های pt و px در پیش‌نمایش متناسب با چاپ کوچک می‌شوند
  const uPt = (v: number): string => (isPrint ? `${v}pt` : `${Math.round(v * 0.3528 * scale * 10) / 10}px`);
  const uPx = (v: number): string => (isPrint ? `${v}px` : `${Math.round(v * 0.3528 * scale * 10) / 10}px`);
  const family = cfg.fontFamily === 'serif'
    ? 'Georgia, "Times New Roman", serif'
    : cfg.fontFamily === 'sans-serif'
      ? 'Tahoma, Arial, sans-serif'
      : `'${cfg.fontFamily}', Tahoma, sans-serif`;

  const signatures = effectiveSignatures(cfg);

  const titleBlock: ReactNode = (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: uPt(cfg.titleSize), fontWeight: 700, lineHeight: 1.45, margin: 0 }}>{cfg.title}</p>
      {cfg.subtitle.trim() && (
        <p style={{ fontSize: uPt(13), opacity: 0.85, margin: 0, marginTop: uMm(1.5) }}>{cfg.subtitle}</p>
      )}
    </div>
  );

  const logoImg: ReactNode = (
    <img
      src={cfg.logoSrc || '/logo.png'}
      alt="لوگو"
      style={{ width: uPx(cfg.logoSize), height: uPx(cfg.logoSize), objectFit: 'contain', flexShrink: 0 }}
    />
  );

  let header: ReactNode;
  if (cfg.showLogo && cfg.logoPos === 'top-center') {
    header = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: uMm(2) }}>
        {logoImg}
        <div style={{ textAlign: 'center' }}>{titleBlock}</div>
      </div>
    );
  } else if (cfg.showLogo && cfg.logoPos === 'top-left') {
    // در RTL آخرین فرزند در سمت چپ می‌نشیند
    header = (
      <div style={{ display: 'flex', alignItems: 'center', gap: uMm(4) }}>
        <div style={{ flex: 1, textAlign: 'left' }}>{titleBlock}</div>
        {logoImg}
      </div>
    );
  } else if (cfg.showLogo) {
    header = (
      <div style={{ display: 'flex', alignItems: 'center', gap: uMm(4) }}>
        {logoImg}
        <div style={{ flex: 1, textAlign: 'right' }}>{titleBlock}</div>
      </div>
    );
  } else {
    header = <div style={{ textAlign: 'center' }}>{titleBlock}</div>;
  }

  return (
    <div
      style={{
        width: uMm(paper.w),
        height: uMm(paper.h),
        background: cfg.bgColor,
        color: cfg.textColor,
        fontFamily: family,
        border: `${uPx(cfg.borderWidth)} ${cfg.borderStyle} ${cfg.borderColor}`,
        padding: uMm(12),
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        direction: 'rtl',
        ...(isPrint
          ? { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }
          : { boxShadow: '0 12px 40px rgba(6, 78, 59, 0.18)', borderRadius: 2 }),
      }}
    >
      {/* سربرگ: لوگو + عنوان */}
      <div style={{ borderBottom: `${uPx(2)} solid ${cfg.accentColor}`, paddingBottom: uMm(3), marginBottom: uMm(3) }}>
        {header}
      </div>

      {/* متن اصلی (جای‌گذاری {نام} {صنف} {علت}) */}
      {fill(cfg.body).trim() && (
        <div style={{ padding: `0 ${uMm(6)}`, fontSize: uPt(cfg.bodySize), lineHeight: 2.05, whiteSpace: 'pre-wrap', textAlign: 'center' }}>
          {fill(cfg.body)}
        </div>
      )}

      {/* بلوک‌های متنی آزاد — جای عمودی درصدی */}
      {cfg.textBlocks.map((b) => {
        const pos: CSSProperties = b.align === 'center'
          ? { left: uMm(10), right: uMm(10), textAlign: 'center' }
          : b.align === 'right'
            ? { right: uMm(10), maxWidth: `calc(100% - ${uMm(20)})`, textAlign: 'right' }
            : { left: uMm(10), maxWidth: `calc(100% - ${uMm(20)})`, textAlign: 'left' };
        return (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              top: `${b.vpos}%`,
              color: b.color,
              fontSize: uPt(b.size),
              fontWeight: b.bold ? 700 : 400,
              lineHeight: 1.9,
              whiteSpace: 'pre-wrap',
              ...pos,
            }}
          >
            {fill(b.content)}
          </div>
        );
      })}

      {/* بلوک جدول — ستون‌های هم‌عرض */}
      {cfg.table.enabled && (
        <div style={{ position: 'absolute', top: `${cfg.table.vpos}%`, left: uMm(10), right: uMm(10) }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: uPt(cfg.table.fontSize) }}>
            <tbody>
              {cfg.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: `${uPx(1)} solid ${cfg.borderColor}`,
                        padding: `${uMm(1)} ${uMm(1.5)}`,
                        textAlign: 'center',
                        fontWeight: ri === 0 && cfg.table.headerBold ? 700 : 400,
                        background: ri === 0 && cfg.table.headerBold ? `${cfg.accentColor}14` : 'transparent',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {fill(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* پاورقی: تاریخ + خط‌های امضا */}
      {(cfg.showDate || signatures.length > 0) && (
        <div
          style={{
            position: 'absolute',
            bottom: uMm(9),
            left: uMm(12),
            right: uMm(12),
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: uMm(4),
          }}
        >
          <div style={{ fontSize: uPt(10.5), opacity: 0.8, whiteSpace: 'nowrap', minWidth: uMm(24) }}>
            {cfg.showDate ? dateStr : ''}
          </div>
          {signatures.map((s) => (
            <div key={s.id} style={{ textAlign: 'center' }}>
              <div style={{ width: uMm(38), borderTop: `${uPx(1.5)} solid ${cfg.accentColor}`, marginBottom: uMm(1.5) }} />
              <div style={{ fontSize: uPt(10.5) }}>{s.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** ورودی رنگ + کد رنگ */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 rounded border cursor-pointer bg-transparent"
          aria-label={label}
        />
        <Input dir="ltr" className="text-left text-xs h-8" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

// ═══════════ ویو اصلی ═══════════

export function CertificatesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canEdit = user.role === 'ADMIN' || user.role === 'HEADTEACHER';
  const [templates, setTemplates] = useState<CertTemplate[]>([]);
  const [active, setActive] = useState<CertTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // گیرنده و جای‌گذاری متن
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [receiverType, setReceiverType] = useState<'student' | 'teacher' | 'manual'>('student');
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [manualName, setManualName] = useState('');
  const [reason, setReason] = useState('موفقیت‌های برجستهٔ تعلیمی');

  const [nameOpen, setNameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const logoFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ templates: CertTemplate[] }>('/api/certificates');
      const list = (d.templates || []).map((t) => ({ ...t, config: normalizeConfig(t.config) }));
      setTemplates(list);
      setActive((cur) => cur || list[0] || { id: '', name: 'پیش‌نویس', config: normalizeConfig(null) });
    } catch {
      setActive((cur) => cur || { id: '', name: 'پیش‌نویس', config: normalizeConfig(null) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    apiGet<{ students: StudentInfo[] }>('/api/students')
      .then((d) => setStudents(d.students || []))
      .catch(() => {});
    apiGet<{ teachers: TeacherInfo[] }>('/api/teachers')
      .then((d) => setTeachers(d.teachers || []))
      .catch(() => {});
  }, [load]);

  const setCfg = (patch: Partial<CertConfig>) => {
    setActive((t) => (t ? { ...t, config: { ...t.config, ...patch } } : t));
  };

  const receiverName = (): string => {
    if (receiverType === 'student') {
      const s = students.find((x) => x.id === studentId);
      return s ? fullName(s) : '{نام}';
    }
    if (receiverType === 'teacher') {
      const t = teachers.find((x) => x.id === teacherId);
      return t ? t.name : '{نام}';
    }
    return manualName.trim() || '{نام}';
  };

  const receiverClass = (): string => {
    if (receiverType === 'student') {
      const s = students.find((x) => x.id === studentId);
      return (s as { className?: string | null })?.className || '';
    }
    return '';
  };

  const fillTemplate = (text: string): string =>
    (text || '')
      .replaceAll('{نام}', receiverName())
      .replaceAll('{صنف}', receiverClass())
      .replaceAll('{علت}', reason.trim() || 'تلاش و موفقیت');

  // ─── بلوک‌های متنی آزاد ───
  const addTextBlock = () => {
    setActive((t) => {
      if (!t) return t;
      const n = t.config.textBlocks.length;
      const block: CertTextBlock = {
        id: uid(),
        content: 'متن دلخواه — از {نام} و {علت} هم می‌توانید استفاده کنید',
        size: 14,
        bold: false,
        align: 'center',
        color: t.config.textColor,
        vpos: Math.min(90, 38 + n * 9),
      };
      return { ...t, config: { ...t.config, textBlocks: [...t.config.textBlocks, block] } };
    });
  };

  const updateTextBlock = (id: string, patch: Partial<CertTextBlock>) => {
    setActive((t) => (t
      ? { ...t, config: { ...t.config, textBlocks: t.config.textBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) } }
      : t));
  };

  const removeTextBlock = (id: string) => {
    setActive((t) => (t ? { ...t, config: { ...t.config, textBlocks: t.config.textBlocks.filter((b) => b.id !== id) } } : t));
  };

  const moveTextBlock = (id: string, dir: -1 | 1) => {
    setActive((t) => {
      if (!t) return t;
      const list = [...t.config.textBlocks];
      const i = list.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return t;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...t, config: { ...t.config, textBlocks: list } };
    });
  };

  // ─── بلوک جدول ───
  const setTable = (patch: Partial<CertTableConfig>) => {
    setActive((t) => (t ? { ...t, config: { ...t.config, table: { ...t.config.table, ...patch } } } : t));
  };

  const resizeTable = (rows: number, cols: number) => {
    setActive((t) => {
      if (!t) return t;
      const cur = t.config.table.rows;
      const nr = Math.max(1, Math.min(12, rows));
      const nc = Math.max(1, Math.min(8, cols));
      const next: string[][] = Array.from({ length: nr }, (_, ri) =>
        Array.from({ length: nc }, (_, ci) => cur[ri]?.[ci] ?? ''));
      return { ...t, config: { ...t.config, table: { ...t.config.table, rows: next } } };
    });
  };

  const setCell = (ri: number, ci: number, v: string) => {
    setActive((t) => {
      if (!t) return t;
      const rows = t.config.table.rows.map((row, y) => row.map((cell, x) => (y === ri && x === ci ? v : cell)));
      return { ...t, config: { ...t.config, table: { ...t.config.table, rows } } };
    });
  };

  // ─── امضاها ───
  const addSignature = () => {
    setActive((t) => {
      if (!t || t.config.signatures.length >= 2) return t;
      return { ...t, config: { ...t.config, signatures: [...t.config.signatures, { id: uid(), title: 'مدیر مکتب' }] } };
    });
  };

  const updateSignature = (id: string, title: string) => {
    setActive((t) => (t
      ? { ...t, config: { ...t.config, signatures: t.config.signatures.map((s) => (s.id === id ? { ...s, title } : s)) } }
      : t));
  };

  const removeSignature = (id: string) => {
    setActive((t) => (t ? { ...t, config: { ...t.config, signatures: t.config.signatures.filter((s) => s.id !== id) } } : t));
  };

  // ─── لوگوی دلخواه (فشرده تا ۳۰۰ پیکسل) ───
  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'خطا', description: 'لطفاً فایل تصویر انتخاب کنید', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 300;
        const ratio = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || max) * ratio));
        const h = Math.max(1, Math.round((img.height || max) * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        try {
          setCfg({ logoSrc: canvas.toDataURL('image/png') });
          toast({ title: 'لوگو به‌روزرسانی شد', description: 'تصویر تا ۳۰۰ پیکسل فشرده و در قالب ذخیره می‌شود' });
        } catch {
          toast({ title: 'خطا', description: 'پردازش تصویر ناموفق بود', variant: 'destructive' });
        }
      };
      img.onerror = () => toast({ title: 'خطا', description: 'تصویر خوانده نشد', variant: 'destructive' });
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  // ─── قالب‌ها (ذخیره‌سازی با apiSend — آفلاین صف می‌شود) ───
  const saveTemplate = async () => {
    if (!active) return;
    setSaving(true);
    const res = await apiSend<{ id?: string }>(
      '/api/certificates',
      active.id ? 'PATCH' : 'POST',
      active.id
        ? { id: active.id, name: active.name, config: active.config }
        : { name: active.name, config: active.config },
      { queueLabel: active.id ? 'به‌روزرسانی قالب تقدیرنامه' : 'ذخیرهٔ قالب تقدیرنامه' },
    );
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: res.queued ? 'ذخیره شد' : 'قالب ذخیره شد',
      description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : undefined,
    });
    if (!active.id && res.data?.id) setActive((t) => (t ? { ...t, id: res.data?.id ?? t.id } : t));
    load();
  };

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await apiSend<{ id?: string }>(
      '/api/certificates',
      'POST',
      { name: newName.trim(), config: active?.config },
      { queueLabel: 'ساخت قالب تقدیرنامه' },
    );
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setNameOpen(false);
    setNewName('');
    // پس از ساخت، پیش‌نویس فعلی به قالب تازه پیوند می‌خورد تا «ذخیرهٔ دوباره» نسخهٔ تکراری نسازد
    if (res.data?.id) {
      const createdId = res.data.id;
      const createdName = newName.trim();
      setActive((t) => (t ? { ...t, id: createdId, name: createdName } : t));
    }
    toast({
      title: res.queued ? 'ذخیره شد' : 'قالب جدید ساخته شد',
      description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : undefined,
    });
    load();
  };

  const deleteTemplate = async (t: CertTemplate) => {
    if (!confirm(`قالب «${t.name}» حذف شود؟`)) return;
    const res = await apiSend(`/api/certificates?id=${t.id}`, 'DELETE', undefined, { queueLabel: 'حذف قالب تقدیرنامه' });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setActive(null);
    toast({
      title: 'قالب حذف شد',
      description: res.queued ? 'در حافظهٔ گوشی — پس از اتصال همگام می‌شود' : undefined,
    });
    load();
  };

  const printCertificate = () => {
    window.print();
  };

  if (loading) return <LoadingBlock label="در حال بارگذاری تقدیرنامه‌ها..." />;
  if (!active) return null;

  const cfg = active.config;
  const paper = resolvePaper(cfg);
  const today = isoToJalaliDisplay(isoToday());
  const paperLabel = cfg.paper === 'CUSTOM'
    ? `سفارشی — ${toPersianDigits(paper.w)} × ${toPersianDigits(paper.h)}`
    : (PAPERS.find((p) => p.value === cfg.paper)?.label ?? 'A4');

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقدیرنامه‌ساز و مکاتبات اداری"
        subtitle="ابزار طراحی آزاد — کاغذ، متن، جدول، لوگو، رنگ و امضا؛ چاپ دقیقاً هم‌اندازهٔ کاغذ"
        icon={Award}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5 items-start">
        {/* ═══════ پنل طراحی ═══════ */}
        <div className="space-y-4 print:hidden">
          {/* قالب‌ها */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900">قالب‌ها</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActive(t)}
                    className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                      t.id === active.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50 dark:bg-card dark:text-foreground dark:border-border dark:hover:bg-accent'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={() => setNameOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> قالب جدید
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={saveTemplate} disabled={saving}>
                      <Save className="h-3.5 w-3.5" /> {active.id ? 'به‌روزرسانی قالب' : 'ذخیرهٔ قالب'}
                    </Button>
                    {active.id && (
                      <Button size="sm" variant="outline" className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => deleteTemplate(active)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ابزار طراحی آزاد */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> ابزار طراحی آزاد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="text">
                <TabsList className="w-full mb-3 grid grid-cols-5 h-auto p-1">
                  <TabsTrigger value="text" className="flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px]">
                    <Type className="h-4 w-4" /> متن آزاد
                  </TabsTrigger>
                  <TabsTrigger value="table" className="flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px]">
                    <Table2 className="h-4 w-4" /> جدول
                  </TabsTrigger>
                  <TabsTrigger value="style" className="flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px]">
                    <Palette className="h-4 w-4" /> لوگو و رنگ
                  </TabsTrigger>
                  <TabsTrigger value="sign" className="flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px]">
                    <PenLine className="h-4 w-4" /> امضاها
                  </TabsTrigger>
                  <TabsTrigger value="paper" className="flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px]">
                    <FileText className="h-4 w-4" /> کاغذ
                  </TabsTrigger>
                </TabsList>

                {/* ─── متن آزاد ─── */}
                <TabsContent value="text" className="space-y-3 mt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="عنوان بالای ورق">
                      <Input value={cfg.title} onChange={(e) => setCfg({ title: e.target.value })} />
                    </Field>
                    <Field label="زیرعنوان (نام مکتب)">
                      <Input value={cfg.subtitle} onChange={(e) => setCfg({ subtitle: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="متن اصلی ورق" hint="از {نام} {صنف} {علت} استفاده کنید تا با انتخاب گیرنده پر شوند">
                    <Textarea className="min-h-[96px] text-sm leading-7" value={cfg.body} onChange={(e) => setCfg({ body: e.target.value })} />
                  </Field>

                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-900">بلوک‌های متنی آزاد</p>
                      <Button size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={addTextBlock}>
                        <Plus className="h-3.5 w-3.5" /> افزودن بلوک
                      </Button>
                    </div>
                    {cfg.textBlocks.length === 0 && (
                      <p className="text-xs text-muted-foreground leading-5">
                        هر بلوک متن دلخواه با اندازه، رنگ، چینش و جای عمودی مستقل (۰ تا ۱۰۰٪ ارتفاع ورق) — برای هر چند متن که بخواهید.
                      </p>
                    )}
                    {cfg.textBlocks.map((b, i) => (
                      <div key={b.id} className="rounded-lg border bg-muted/40 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="border-emerald-300 text-emerald-800">
                            بلوک {toPersianDigits(i + 1)}
                          </Badge>
                          <div className="flex items-center gap-0.5">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveTextBlock(b.id, -1)} aria-label="انتقال به بالا">
                              <MoveUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === cfg.textBlocks.length - 1} onClick={() => moveTextBlock(b.id, 1)} aria-label="انتقال به پایین">
                              <MoveDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => removeTextBlock(b.id)} aria-label="حذف بلوک">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          className="min-h-[52px] text-xs leading-6"
                          value={b.content}
                          onChange={(e) => updateTextBlock(b.id, { content: e.target.value })}
                          placeholder="متن بلوک..."
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="اندازه (pt)">
                            <Input
                              dir="ltr" type="number" min={6} max={96} className="text-left h-8"
                              value={b.size}
                              onChange={(e) => updateTextBlock(b.id, { size: Number(e.target.value) || 14 })}
                            />
                          </Field>
                          <Field label="رنگ متن">
                            <input
                              type="color" value={b.color}
                              onChange={(e) => updateTextBlock(b.id, { color: e.target.value })}
                              className="h-8 w-full rounded border cursor-pointer bg-transparent"
                              aria-label="رنگ متن بلوک"
                            />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-end">
                          <Field label="چینش">
                            <Select value={b.align} onValueChange={(v) => updateTextBlock(b.id, { align: v as TextAlign })}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ALIGN_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label={`جای عمودی — ${toPersianDigits(b.vpos)}٪`}>
                            <input
                              type="range" min={0} max={100} value={b.vpos}
                              onChange={(e) => updateTextBlock(b.id, { vpos: Number(e.target.value) })}
                              className="w-full accent-emerald-600 cursor-pointer"
                              aria-label="جای عمودی بلوک"
                            />
                          </Field>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={b.bold} onCheckedChange={(v) => updateTextBlock(b.id, { bold: v })} />
                          متن بولد (درشت)
                        </label>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* ─── جدول ─── */}
                <TabsContent value="table" className="space-y-3 mt-0">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={cfg.table.enabled} onCheckedChange={(v) => setTable({ enabled: v })} />
                    نمایش جدول روی ورق (مکتوب، استعلام، جدول نمرات...)
                  </label>
                  {cfg.table.enabled && (
                    <>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Rows3 className="h-4 w-4 text-emerald-700" />
                          <span className="text-xs text-muted-foreground">سطر</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="کاهش سطر" onClick={() => resizeTable(cfg.table.rows.length - 1, cfg.table.rows[0]?.length ?? 1)}>−</Button>
                          <span className="text-sm font-semibold w-6 text-center">{toPersianDigits(cfg.table.rows.length)}</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="افزایش سطر" onClick={() => resizeTable(cfg.table.rows.length + 1, cfg.table.rows[0]?.length ?? 1)}>+</Button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Columns3 className="h-4 w-4 text-emerald-700" />
                          <span className="text-xs text-muted-foreground">ستون</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="کاهش ستون" onClick={() => resizeTable(cfg.table.rows.length, (cfg.table.rows[0]?.length ?? 1) - 1)}>−</Button>
                          <span className="text-sm font-semibold w-6 text-center">{toPersianDigits(cfg.table.rows[0]?.length ?? 0)}</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="افزایش ستون" onClick={() => resizeTable(cfg.table.rows.length, (cfg.table.rows[0]?.length ?? 1) + 1)}>+</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-end">
                        <Field label="اندازهٔ متن جدول (pt)">
                          <Input
                            dir="ltr" type="number" min={6} max={24} className="text-left h-8"
                            value={cfg.table.fontSize}
                            onChange={(e) => setTable({ fontSize: Number(e.target.value) || 11 })}
                          />
                        </Field>
                        <Field label={`جای عمودی — ${toPersianDigits(cfg.table.vpos)}٪`}>
                          <input
                            type="range" min={0} max={100} value={cfg.table.vpos}
                            onChange={(e) => setTable({ vpos: Number(e.target.value) })}
                            className="w-full accent-emerald-600 cursor-pointer"
                            aria-label="جای عمودی جدول"
                          />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={cfg.table.headerBold} onCheckedChange={(v) => setTable({ headerBold: v })} />
                        سطر اول = سرستون (بولد با پس‌زمینهٔ روشن)
                      </label>
                      <div className="space-y-1">
                        {cfg.table.rows.map((row, ri) => (
                          <div key={ri} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length || 1}, minmax(0, 1fr))` }}>
                            {row.map((cell, ci) => (
                              <Input
                                key={ci}
                                className="h-8 px-1.5 text-[11px] text-center"
                                value={cell}
                                onChange={(e) => setCell(ri, ci, e.target.value)}
                                placeholder={ri === 0 ? 'سرستون' : ''}
                                aria-label={`سلول سطر ${ri + 1} ستون ${ci + 1}`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ─── لوگو و رنگ ─── */}
                <TabsContent value="style" className="space-y-3 mt-0">
                  <div className="rounded-lg border bg-muted/40 p-2.5 space-y-2.5">
                    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4" /> لوگو
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={cfg.showLogo} onCheckedChange={(v) => setCfg({ showLogo: v })} />
                      نمایش لوگو
                    </label>
                    {cfg.showLogo && (
                      <>
                        <Field label={`اندازهٔ لوگو — ${toPersianDigits(cfg.logoSize)} پیکسل`}>
                          <input
                            type="range" min={40} max={200} value={cfg.logoSize}
                            onChange={(e) => setCfg({ logoSize: Number(e.target.value) })}
                            className="w-full accent-emerald-600 cursor-pointer"
                            aria-label="اندازهٔ لوگو"
                          />
                        </Field>
                        <Field label="موقعیت لوگو">
                          <Select value={cfg.logoPos} onValueChange={(v) => setCfg({ logoPos: v as LogoPos })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LOGO_POS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={logoFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleLogoFile(f);
                              e.target.value = '';
                            }}
                          />
                          <Button type="button" size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={() => logoFileRef.current?.click()}>
                            <Upload className="h-3.5 w-3.5" /> لوگوی دلخواه
                          </Button>
                          {cfg.logoSrc && (
                            <Button type="button" size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-700" onClick={() => setCfg({ logoSrc: '' })}>
                              <RotateCcw className="h-3.5 w-3.5" /> بازگشت به لوگوی مکتب
                            </Button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">تصویر آپلودی تا ۳۰۰ پیکسل فشرده و داخل قالب ذخیره می‌شود.</p>
                      </>
                    )}
                  </div>

                  <div className="rounded-lg border bg-muted/40 p-2.5 space-y-2.5">
                    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                      <Palette className="h-4 w-4" /> رنگ‌ها و قاب
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <ColorField label="پس‌زمینه" value={cfg.bgColor} onChange={(v) => setCfg({ bgColor: v })} />
                      <ColorField label="متن" value={cfg.textColor} onChange={(v) => setCfg({ textColor: v })} />
                      <ColorField label="خط و تزئینات" value={cfg.accentColor} onChange={(v) => setCfg({ accentColor: v })} />
                      <ColorField label="قاب" value={cfg.borderColor} onChange={(v) => setCfg({ borderColor: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="استایل قاب">
                        <Select value={cfg.borderStyle} onValueChange={(v) => setCfg({ borderStyle: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BORDER_STYLES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="ضخامت قاب (px)">
                        <Input
                          dir="ltr" type="number" min={0} max={24} className="text-left h-8"
                          value={cfg.borderWidth}
                          onChange={(e) => setCfg({ borderWidth: Number(e.target.value) || 0 })}
                        />
                      </Field>
                    </div>
                    <Field label="نوع خط کل ورق">
                      <Select value={cfg.fontFamily} onValueChange={(v) => setCfg({ fontFamily: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </TabsContent>

                {/* ─── امضاها و تاریخ ─── */}
                <TabsContent value="sign" className="space-y-3 mt-0">
                  <div className="rounded-lg border bg-muted/40 p-2.5 space-y-2.5">
                    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                      <PenLine className="h-4 w-4" /> خط‌های امضا (حداکثر ۲)
                    </p>
                    {cfg.signatures.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-1.5">
                        <Input
                          value={s.title}
                          onChange={(e) => updateSignature(s.id, e.target.value)}
                          placeholder={`عنوان امضاکنندهٔ ${toPersianDigits(i + 1)}`}
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-rose-600 hover:bg-rose-50" onClick={() => removeSignature(s.id)} aria-label="حذف امضا">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {cfg.signatures.length < 2 && (
                      <Button type="button" size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={addSignature}>
                        <Plus className="h-3.5 w-3.5" /> افزودن خط امضا
                      </Button>
                    )}
                    <p className="text-[11px] text-muted-foreground">مثال: «مدیر مکتب»، «معاون تعلیمی» — خط‌ها پایین ورق کنار تاریخ چاپ می‌شوند.</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-2.5 space-y-2.5">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={cfg.showDate} onCheckedChange={(v) => setCfg({ showDate: v })} />
                      نمایش تاریخ در پایین ورق
                    </label>
                    {cfg.showDate && (
                      <Field label="تاریخ (خالی = امروز)">
                        <Input placeholder={today} value={cfg.dateText} onChange={(e) => setCfg({ dateText: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </TabsContent>

                {/* ─── کاغذ ─── */}
                <TabsContent value="paper" className="space-y-3 mt-0">
                  <Field label="اندازهٔ کاغذ">
                    <Select
                      value={cfg.paper}
                      onValueChange={(v) => {
                        const p = PAPERS.find((x) => x.value === v);
                        setCfg({ paper: v as PaperSize, ...(p && p.w ? { paperWidth: p.w, paperHeight: p.h } : {}) });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAPERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {cfg.paper === 'CUSTOM' && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="عرض (میلی‌متر)">
                        <Input
                          dir="ltr" type="number" min={60} max={500} className="text-left"
                          value={cfg.paperWidth}
                          onChange={(e) => setCfg({ paperWidth: Number(e.target.value) || 210 })}
                        />
                      </Field>
                      <Field label="ارتفاع (میلی‌متر)">
                        <Input
                          dir="ltr" type="number" min={60} max={500} className="text-left"
                          value={cfg.paperHeight}
                          onChange={(e) => setCfg({ paperHeight: Number(e.target.value) || 297 })}
                        />
                      </Field>
                    </div>
                  )}
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                    <p>اندازهٔ نهایی ورق: <span className="font-bold">{toPersianDigits(paper.w)} × {toPersianDigits(paper.h)} میلی‌متر</span></p>
                    <p className="opacity-80">خروجی چاپ دقیقاً با همین ابعاد تنظیم می‌شود (قاعدهٔ @page) و همیشه با رنگ‌های روشن چاپ می‌شود.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* گیرنده و چاپ */}
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900">گیرنده و چاپ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={receiverType} onValueChange={(v) => setReceiverType(v as 'student' | 'teacher' | 'manual')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">شاگرد</SelectItem>
                  <SelectItem value="teacher">معلم / کارمند</SelectItem>
                  <SelectItem value="manual">نام دستی</SelectItem>
                </SelectContent>
              </Select>
              {receiverType === 'student' && (
                <Select value={studentId || undefined} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="شاگرد را انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {fullName(s)} {s.className ? `— ${s.className}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {receiverType === 'teacher' && (
                <Select value={teacherId || undefined} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="معلم/کارمند را انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} — {t.position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {receiverType === 'manual' && (
                <Field label="نام گیرنده"><Input value={manualName} onChange={(e) => setManualName(e.target.value)} /></Field>
              )}
              <Field label="علت تقدیر ({علت})">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button onClick={printCertificate} className="w-full gap-1.5 h-11">
                <Printer className="h-5 w-5" /> چاپ / ذخیره PDF ({paperLabel})
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ═══════ پیش‌نمایش زنده ═══════ */}
        <div className="print:hidden space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>پیش‌نمایش زنده — همان چیزی که چاپ می‌شود</span>
              <Badge variant="outline" className="border-emerald-300 text-emerald-800">{paperLabel}</Badge>
            </div>
            <Button size="sm" onClick={printCertificate} className="gap-1">
              <Printer className="h-4 w-4" /> چاپ / ذخیره PDF
            </Button>
          </div>
          <div className="rounded-xl border bg-slate-200/70 dark:bg-slate-900/60 p-4 md:p-6 overflow-auto nice-scroll">
            <div className="w-fit mx-auto">
              <CertSheet cfg={cfg} mode="screen" fill={fillTemplate} dateStr={cfg.dateText || today} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            چاپ دقیقاً با ابعاد {toPersianDigits(paper.w)} × {toPersianDigits(paper.h)} میلی‌متر انجام می‌شود.
          </p>
        </div>
      </div>

      {/* ورق چاپ — فقط هنگام چاپ دیده می‌شود؛ @page هم‌اندازهٔ کاغذ انتخابی */}
      <div id="cert-print-root" className="hidden print:block">
        <style>{`@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }`}</style>
        <CertSheet cfg={cfg} mode="print" fill={fillTemplate} dateStr={cfg.dateText || today} />
      </div>

      {/* دیالوگ نام قالب */}
      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>قالب جدید</DialogTitle></DialogHeader>
          <Field label="نام قالب (مثال: تقدیر معلمان، استعلام غیبت)">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameOpen(false)}>انصراف</Button>
            <Button onClick={createTemplate} disabled={saving}>ساخت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
