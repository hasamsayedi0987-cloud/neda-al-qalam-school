/**
 * اسناد رسمی وزارت معارف افغانستان — نسخهٔ ۳.۶.۰
 *
 * هر سه سند «عین» جدول‌های فایل رسمی اکسل وزارت معارف (نسخهٔ ۱۴۰۵) ساخته می‌شوند —
 * همان سرستون‌ها، همان ادغام حجره‌ها، همان جدول‌های درجه‌بندی، همان فرمول‌های
 * نتیجه/درجه و همان جهت ورق A4:
 *  ۱) فهرست نتایج مضمونوار (ورق نشریه) — A4 افقی؛ سطرها شاگردان، ستون‌ها مضامین
 *  ۲) جدول نتایج (خلیجدول) — A4 عمودی؛ قطعهٔ هویتی + بلوک ۳ شاگرد + ستون تائید در هر
 *     صفحه (مطابق چاپ واقعی فایل رسمی: تکرار ستون‌های B–L در هر صفحه)
 *  ۳) اطلاع‌نامهٔ رسمی هر شاگرد — A4 عمودی؛ یک اطلاع‌نامه در هر صفحه با درجه‌بندی
 *     چهارونیم‌ماهه/سالانه و چهار محل امضاء (نگران، سرمعلم، مدیر، ولی شاگرد)
 *
 * منطق نتیجه و درجه = عین فرمول‌های فایل رسمی (M36/N36/M37/N37):
 *   نتیجهٔ چهارونیم: حداقل ۵ مضمون؛ اوسط<۲۰ یا یک مضمون<۱۶ → «تلاش بیشتر»؛ وگرنه «موفق»
 *   نتیجهٔ سالانه: اوسط<۵۰ → «تکرار صنف»؛ همهٔ مضامین ≥۴۰ → «ارتقا صنف»؛ ۴+ مضمون <۴۰ →
 *   «تکرار صنف»؛ ۱–۳ مضمون <۴۰ → «مشروط»؛ شاگرد محروم → «محروم»؛ بدون نمره → «غایب»
 *   درجهٔ چهارونیم: الف ۳۶–۴۰ | ب ۳۰–۳۵.۹۹ | ج ۲۴–۲۹.۹۹ | د ۲۰–۲۳.۹۹ | هـ اوسط<۲۰ یا مضمون<۱۶
 *   درجهٔ سالانه: الف ۹۰–۱۰۰ | ب ۷۵–۸۹.۹۹ | ج ۶۰–۷۴.۹۹ | د ۵۰–۵۹.۹۹ | هـ مضمون<۴۰ یا اوسط<۵۰
 */

import { toPersianDigits } from '@/lib/jalali';
import { OFFICIAL_CSS, printRawHtml, exportExcel, fileStamp } from './exports';
import { MINISTRY_JADWAL, SCHOOL_SEAL_JADWAL, MINISTRY_NOTICE, SCHOOL_LOGO_NOTICE, NOTICE_TITLE_IMG } from './official-logos';

/* ─────────────── انواع دادهٔ ورودی ─────────────── */

export interface OfficialSchool {
  name: string;
  logo?: string;
  emblem?: string;
  govHeader?: string;
  directorateLine?: string;
  adminOffice?: string;
  licenseNo?: string;
  province?: string;
}

export interface OfficialStudent {
  id: string;
  name: string;
  father: string;
  grandFather?: string | null;
  rollNo?: number | null;
  idNumber?: string | null;
  baseNumber?: string | null; // نمبر اساس وزارت معارف — ستون رسمی «نمبر اساس»
  /** محرومیت از امتحان (حاضری زیر حد نصاب) — مطابق مقررهٔ رسمی وزارت معارف */
  eligible?: string | null;
}

/** نمرهٔ یک مضمون برای یک شاگرد — همان ساختار perSubject نتایج */
export interface OfficialMark {
  midterm?: number | null;
  annual?: number | null;
  final?: number | null;
  letter?: string;
  result?: string | null;
}

/** حاضری یک شاگرد در یک پنجرهٔ زمانی (چهارونیم‌ماهه یا سالانه) */
export interface OfficialAttendance {
  days: number;
  present: number;
  absent: number;
  sick: number;
  leave: number;
}

export interface OfficialClassInput {
  school: OfficialSchool;
  className: string;
  academicYear?: string;
  subjects: Array<{ id: string; name: string }>; // به ترتیب رسمی نصاب
  students: OfficialStudent[];
  /** کلید: studentId → subjectId → نمره */
  marks: Record<string, Record<string, OfficialMark>>;
  /** حاضری یومیه از سیستم — کلید: studentId → {mid, annual} (نسخهٔ ۳.۶.۰) */
  attendance?: Record<string, { mid?: OfficialAttendance | null; annual?: OfficialAttendance | null }> | null;
  passMark?: number; // حد نصاب کامیابی (پیش‌فرض ۴۰)
  passLabel?: string;
  failLabel?: string;
  periodMax?: { MIDTERM: number; ANNUAL: number };
  /** نام نگران صنف — خط «مربوط» فهرست مضمونوار و فرم اطلاع‌نامه */
  supervisor?: string;
  nubt?: string;
  branch?: string;
  date?: string;
}

/* ─────────────── کمک‌سازها ─────────────── */

function fa(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return toPersianDigits(v);
}
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
/** عدد با حداکثر یک رقم اعشار — مطابق نمایش اکسل */
function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const r = Math.round(v * 100) / 100;
  return fa(Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, ''));
}
function sum(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0);
}
function avgOf(vs: number[]): number {
  return vs.length ? sum(vs) / vs.length : 0;
}

/* فرمول‌های رسمی نتیجه و درجه — عین فرمول‌های M36/N36/M37/N37 فایل وزارت */

/** نتیجهٔ چهارونیم‌ماهه (M36) */
function midNatiye(midMarks: number[], hasMid: boolean): string {
  if (!hasMid) return 'غایب'; // بدون نمرهٔ چهارونیم — مطابق استفادهٔ رسمی از فرم
  if (midMarks.length < 5) return '';
  const a = avgOf(midMarks);
  if (a < 20 || Math.min(...midMarks) < 16) return 'تلاش بیشتر';
  return 'موفق';
}

/** نتیجهٔ سالانه (N36) — بر اساس نمرات نهائی + حالت‌های رسمی (محروم/غایب) */
function annNatiye(finMarks: number[], hasAny: boolean, eligible: string | null | undefined): string {
  if (eligible && eligible.includes('محروم')) return 'محروم';
  if (!hasAny) return 'غایب';
  if (finMarks.length < 5) return '';
  const a = avgOf(finMarks);
  if (a < 50) return 'تکرار صنف';
  const below40 = finMarks.filter((v) => v < 40).length;
  if (below40 === 0) return 'ارتقا صنف';
  if (below40 >= 4) return 'تکرار صنف';
  return 'مشروط';
}

/** درجهٔ چهارونیم‌ماهه (M37) */
function midDaraje(midMarks: number[]): string {
  if (midMarks.length < 5) return '';
  if (midMarks.filter((v) => v < 16).length > 0) return 'هـ';
  const a = avgOf(midMarks);
  if (a < 20) return 'هـ';
  if (a < 24) return 'د';
  if (a < 30) return 'ج';
  if (a < 36) return 'ب';
  if (a <= 40) return 'الف';
  return '';
}

/** درجهٔ سالانه (N37) */
function annDaraje(finMarks: number[], natiye: string): string {
  if (finMarks.length < 5) return '';
  if (finMarks.filter((v) => v < 40).length > 0) return 'هـ';
  if (natiye === 'محروم') return 'هـ';
  const a = avgOf(finMarks);
  if (a < 50) return 'هـ';
  if (a < 60) return 'د';
  if (a < 75) return 'ج';
  if (a < 90) return 'ب';
  if (a <= 100) return 'الف';
  return '';
}

/** حاضری یک شاگرد — از دادهٔ یومیهٔ سیستم؛ بدون داده = حجره‌های خالی فرم رسمی */
function attOf(d: OfficialClassInput, id: string) {
  return d.attendance?.[id] || null;
}

/** نمرات و نتایج یک شاگرد — برای هر سه سند */
function studentAgg(d: OfficialClassInput, s: OfficialStudent | undefined, subjects: Array<{ id: string }>) {
  const ms = s ? d.marks[s.id] || {} : {};
  const mids: number[] = [], anns: number[] = [], fins: number[] = [];
  let hasMid = false, hasAny = false;
  for (const sub of subjects) {
    const m = ms[sub.id] || {};
    if (m.midterm != null) { mids.push(m.midterm); hasMid = true; }
    if (m.annual != null) anns.push(m.annual);
    if (m.final != null) { fins.push(m.final); hasAny = true; }
  }
  const natiyeMid = midNatiye(mids, hasMid);
  const natiyeAnn = annNatiye(fins, hasAny, s?.eligible);
  const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    mids, anns, fins, hasMid, hasAny,
    totMid: mids.length ? sum(mids) : null,
    totAnn: anns.length ? sum(anns) : null,
    totFin: fins.length ? sum(fins) : null,
    avgMid: r2(mids.length ? avgOf(mids) : null),
    avgAnn: r2(anns.length ? avgOf(anns) : null),
    avgFin: r2(fins.length ? avgOf(fins) : null),
    natiyeMid, natiyeAnn,
    darajeMid: midDaraje(mids),
    darajeAnn: annDaraje(fins, natiyeAnn),
  };
}

/** خلص نتایج کلاس — جدول‌های «خلص نتایج چهارونیم ماه» و «خلص نتایج سالانه» فرم رسمی */
function classSummary(d: OfficialClassInput, subjects: Array<{ id: string }>) {
  const midRes: string[] = [], annRes: string[] = [];
  let deprived = 0, absentMid = 0;
  for (const s of d.students) {
    const a = studentAgg(d, s, subjects);
    midRes.push(a.natiyeMid);
    annRes.push(a.natiyeAnn);
    if (s.eligible && s.eligible.includes('محروم')) deprived++;
    if (!a.hasMid && !(s.eligible && s.eligible.includes('محروم'))) absentMid++;
  }
  const cnt = (arr: string[], v: string) => arr.filter((x) => x === v).length;
  return {
    dakhila: d.students.length,
    midAbsent: absentMid,
    deprived,
    midPass: cnt(midRes, 'موفق'),
    midTry: cnt(midRes, 'تلاش بیشتر'),
    annPromote: cnt(annRes, 'ارتقا صنف'),
    annRepeat: cnt(annRes, 'تکرار صنف'),
    annCond: cnt(annRes, 'مشروط'),
  };
}

function docShell(title: string, orientation: 'portrait' | 'landscape', body: string, pageCss = ''): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>${esc(title)}</title><style>${OFFICIAL_CSS}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
table { border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #000; text-align: center; padding: 0 1px; overflow: hidden; vertical-align: middle; font-weight: 400; }
td, th, span, div { line-height: 1.12; }
td.nb, tr.nb td { border: none !important; }
.vtx { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; display: inline-block; }
@page { size: A4 ${orientation}; margin: ${orientation === 'portrait' ? '9mm 4mm 4mm 5mm' : '4mm 4mm 8mm 4mm'}; }
${pageCss}
</style></head><body>${body}</body></html>`;
}

/* ─────────────── رندر شبکهٔ حجره‌ها — عین ادغام‌های فایل رسمی ─────────────── */

interface GCell { t?: string; rs?: number; cs?: number; cls?: string; nb?: boolean; }
type Grid = Map<string, GCell>; // کلید «سطر,ستون» — صفر مبنا

/** جدول با شبکهٔ ثابت — هر حجره با rowspan/colspan دقیق خودش رندر می‌شود */
function renderGrid(nRows: number, widths: number[], heights: number[], cells: Grid, tblCls = '', dir = ''): string {
  const covered: boolean[][] = Array.from({ length: nRows }, () => []);
  const colgroup = widths.map((w) => `<col style="width:${w}px"/>`).join('');
  let body = '';
  for (let r = 0; r < nRows; r++) {
    let row = '';
    for (let c = 0; c < widths.length; c++) {
      if (covered[r][c]) continue;
      const cell = cells.get(`${r},${c}`);
      if (!cell) { row += '<td></td>'; continue; }
      const rs = cell.rs || 1, cs = cell.cs || 1;
      for (let i = 0; i < rs; i++) {
        for (let j = 0; j < cs; j++) {
          if (i || j) {
            if (!covered[r + i]) covered[r + i] = [];
            covered[r + i][c + j] = true;
          }
        }
      }
      const attrs = `${rs > 1 ? ` rowspan="${rs}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''}`;
      const cls = [cell.cls || '', cell.nb ? 'nb' : ''].filter(Boolean).join(' ');
      row += `<td${attrs}${cls ? ` class="${cls}"` : ''}>${cell.t ?? ''}</td>`;
    }
    body += `<tr style="height:${heights[r] || 19.5}pt">${row}</tr>`;
  }
  return `<table class="${tblCls}"${dir ? ` dir="${dir}"` : ''}><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`;
}

/* ─────────────── ۲) جدول نتایج رسمی (خلیجدول) — A4 عمودی، عین فایل رسمی ۱۴۰۵ ─────────────── */

/** ظرفیت رسمی قالب: ۲۱ مضمون (سطرهای ۱۳–۳۳ فایل رسمی) — مضامین کمتر = سطرهای خالی فرم */
const CAP_SUBJECTS = 21;
const JADWAL_GROUP = 3; // سه شاگرد در هر صفحهٔ عمودی + نوار تائید

const JADWAL_CSS = `
  .jpage { page-break-after: always; position: relative; }
  .jpage:last-child { page-break-after: auto; }
  .jlogo { position: absolute; left: 1mm; }
  .jt { font-size: 6.2pt; }
  .jt .b { font-weight: 700; }
  .jt .subj { font-size: 6.2pt; }
  .jt .mark { font-size: 7.5pt; }
  .jt .res { font-size: 6.8pt; }
  .jt .grade { font-size: 8pt; font-weight: 700; }
  .jt .lbl { font-size: 5.6pt; }
  .jt .vtxt { font-size: 7.5pt; font-weight: 700; }
  .jt .vbig { font-size: 10.5pt; font-weight: 700; }
  .jt .vtxt2 { font-size: 6.5pt; font-weight: 700; }
  .jt .vplain { font-size: 6pt; }
  .jt .diag { position: relative; background-image: linear-gradient(to top right, transparent calc(50% - 0.5px), #000 calc(50% - 0.5px), #000 calc(50% + 0.5px), transparent calc(50% + 0.5px)); }
  .jt .diag span { position: absolute; font-size: 5.4pt; }
  .jt .diag .d1 { top: 1px; right: 2px; }
  .jt .diag .d2 { bottom: 1px; left: 2px; }
`;

/* عرض ستون‌های B..Y — متناسب با فایل رسمی (جمع ≈ ۷۳۵ پیکسل ≈ ۱۹۴ میلی‌متر) */
const JW = [24, 30, 30, 30, 30, 30, 30, 22, 5, 30, 78,
  40, 36, 40, 18, 40, 36, 40, 18, 40, 36, 40, 18, 24];
/* بلندی سطرهای ۴..۴۲ (pt) — عین فایل رسمی فشرده‌شده برای یک صفحهٔ A4 عمودی */
const JH = [20, 20, 20, 20, 20, 20, 18, 18, 18,
  ...Array.from({ length: 21 }, () => 18.5),
  19, 19, 19, 19,
  17.5, 17.5, 17.5, 17.5, 17.5];

export function buildOfficialResultsHtml(d: OfficialClassInput, origin = ''): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const secondLine = d.school.govHeader?.trim() || d.school.adminOffice?.trim() || '';
  const supervisor = d.supervisor?.trim();
  const sm = classSummary(d, subjects);
  const pages: string[] = [];

  const groupCount = Math.max(1, Math.ceil(d.students.length / JADWAL_GROUP));
  for (let g = 0; g < groupCount; g++) {
    const studs = [0, 1, 2].map((k) => d.students[g * JADWAL_GROUP + k]);
    const aggs = studs.map((s) => studentAgg(d, s, subjects));
    const cells: Grid = new Map();
    const set = (r: number, c: number, cell: GCell) => cells.set(`${r},${c}`, cell);
    const vtx = (t: string, cls = 'vtxt') => `<span class="vtx ${cls}">${t}</span>`;

    /* ═══ قطعهٔ هویتی مشترک (B–L — عین Print_Titles فایل رسمی) ═══ */
    // سطر ۰ (اکسل ۴): شماره
    set(0, 9, { t: 'شماره', cs: 2, cls: 'b' });
    // سطرهای ۱–۳ (اکسل ۵–۷): برچسب بلند «شهرت» + نام/نام پدر/نام پدر کلان
    set(1, 9, { t: vtx('شهرت', 'vtxt2'), rs: 3 });
    set(1, 10, { t: 'نام', cls: 'b' });
    set(2, 10, { t: 'نام پدر', cls: 'b' });
    set(3, 10, { t: 'نام پدر کلان', cls: 'b' });
    // سطرهای ۴–۵ (اکسل ۸–۹): نمبر اساس / نمبر تذکره
    set(4, 9, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(5, 9, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    // سرستون مورب مضامین/سال‌نامه + سرستون‌های نمره (اکسل ۱۰–۱۲)
    set(6, 9, { t: '<span class="d1">مضامین</span><span class="d2">سال‌نامه</span>', rs: 3, cs: 2, cls: 'diag' });
    // legend نتیجه‌ها و درجه‌ها (اکسل ۶–۸ — گوشهٔ ستون‌های B–G)
    set(2, 1, { t: 'موفق', cls: 'lbl' }); set(2, 2, { t: 'تلاش بیشتر', cls: 'lbl' });
    set(2, 3, { t: 'معذ ر تی', cls: 'lbl' }); set(2, 4, { t: 'غایب', cls: 'lbl' });
    set(3, 0, { t: 'ارتقا صنف', cls: 'lbl' }); set(3, 1, { t: 'تکرار صنف', cls: 'lbl' });
    set(3, 2, { t: 'مشروط', cls: 'lbl' }); set(3, 3, { t: 'معذرتی', cls: 'lbl' });
    set(3, 4, { t: 'محروم', cls: 'lbl' }); set(3, 5, { t: 'سه پارچه', cls: 'lbl' });
    set(4, 1, { t: 'الف', cls: 'lbl' }); set(4, 2, { t: 'ب', cls: 'lbl' });
    set(4, 3, { t: 'ج', cls: 'lbl' }); set(4, 4, { t: 'د', cls: 'lbl' }); set(4, 5, { t: 'هـ', cls: 'lbl' });
    // فضای خالی بالای فرم — بدون کادر (B4:H5)
    for (const r of [0, 1]) for (let c = 0; c <= 6; c++) if (!(r === 0 && c === 7)) set(r, c, { nb: true });
    // سطرهای ۵ و حاشیه‌های legend — ستون H خالی بدون کادر در سطرهای ۲–۴ (مثل فایل)
    for (let c = 0; c <= 6; c++) for (const r of [5]) if (!cells.get(`${r},${c}`)) set(r, c, { nb: true });
    // نوار عمودی I — عین فایل رسمی
    set(0, 7, { t: vtx('جدول نتایج'), rs: 4 });
    set(4, 7, { t: vtx(`صنف ${esc(d.className)}`), rs: 5 });
    set(9, 7, { t: vtx(`بابت سال تعلیمی ${esc(year)}`), rs: 7 });
    set(16, 7, { t: vtx(supervisor ? `نگران صنف : (${esc(supervisor)})` : 'نگران صنف'), rs: 9 });
    // سربرگ چرخیدهٔ ستون‌های B–H (اکسل ۱۳–۲۶) — عین فایل رسمی
    set(9, 0, { t: vtx('وزارت معارف', 'vbig'), rs: 14, cs: 2 });
    set(9, 2, { t: vtx(esc(dirLine), 'vbig'), rs: 14, cs: 2 });
    set(9, 4, { t: vtx(esc(secondLine), 'vbig'), rs: 14, cs: 2 });
    set(9, 6, { t: vtx(esc(d.school.name), 'vbig'), rs: 14 });
    // خلص نتایج چهارونیم ماه (اکسل ۳۱–۳۶ — ستون‌های B–H)
    set(27, 0, { t: vtx('خلص نتایج چهارونیم ماه'), rs: 6 });
    const midHead = ['تعداد داخله', 'شامل امتحان', 'موفق', 'تلاش بیشتر', 'معذ ر تی', 'غایب'];
    midHead.forEach((h, i) => set(27, 1 + i, { t: vtx(h, 'vplain'), rs: 4 }));
    const midVals = [fa(sm.dakhila), fa(sm.dakhila - sm.midAbsent), fa(sm.midPass), fa(sm.midTry), '', fa(sm.midAbsent)];
    midVals.forEach((v, i) => set(31, 1 + i, { t: v, rs: 2 }));
    // خلص نتایج سالانه (اکسل ۳۷–۴۲ — ستون‌های B–I)
    set(33, 0, { t: vtx('خلص نتایج سالانه'), rs: 6 });
    const annHead = ['تعداد داخله', 'شامل امتحان', 'ارتقا صنف', 'تکرار صنف', 'مشروط', 'معذرتی', 'محروم'];
    annHead.forEach((h, i) => set(33, 1 + i, { t: vtx(h, 'vplain'), rs: 4 }));
    const annVals = [fa(sm.dakhila), fa(sm.dakhila - sm.deprived), fa(sm.annPromote), fa(sm.annRepeat), fa(sm.annCond), '', fa(sm.deprived)];
    annVals.forEach((v, i) => set(37, 1 + i, { t: v, rs: 2 }));

    /* ═══ بلوک سه شاگرد (M..X) + نوار تائید (Y) — عین فایل رسمی ═══ */
    const bases = [11, 15, 19]; // M، Q، U
    studs.forEach((s, i) => {
      const b = bases[i];
      const a = aggs[i];
      const att = attOf(d, s?.id || '');
      const mid = att?.mid, ann = att?.annual;
      const nm = (v: number | null | undefined) => (v == null ? '' : fa(v));
      set(0, b, { t: s ? fa(s.rollNo ?? g * JADWAL_GROUP + i + 1) : '', cs: 3, cls: 'mark' });
      set(1, b, { t: s ? esc(s.name) : '', cs: 3 });
      set(2, b, { t: s ? esc(s.father) : '', cs: 3 });
      set(3, b, { t: s ? esc(s.grandFather || '') : '', cs: 3 });
      set(4, b, { t: s ? esc(s.baseNumber || '') : '', cs: 3 });
      set(5, b, { t: s ? esc(s.idNumber || '') : '', cs: 3 });
      // سرستون‌های نمره — چرخیده عین فایل رسمی
      set(6, b, { t: vtx('چهارو نیم ماهه', 'vplain'), rs: 3 });
      set(6, b + 1, { t: vtx('سالانه', 'vplain'), rs: 3 });
      set(6, b + 2, { t: vtx('نمرات نهائی', 'vplain'), rs: 3 });
      // ستون «مربوط» جداکنندهٔ بلوک‌ها — تمام طول جدول (عین ستون P/T/X فایل رسمی)
      set(0, b + 3, { t: '', rs: 39 });
      // نمرات مضامین — سطرهای ۹–۲۹ (اکسل ۱۳–۳۳)
      for (let r = 0; r < CAP_SUBJECTS; r++) {
        const m = s && subjects[r] ? d.marks[s.id]?.[subjects[r].id] || {} : {};
        set(9 + r, b, { t: fmtScore(m.midterm ?? null), cls: 'mark' });
        set(9 + r, b + 1, { t: fmtScore(m.annual ?? null), cls: 'mark' });
        set(9 + r, b + 2, { t: fmtScore(m.final ?? null), cls: 'mark' });
      }
      set(30, b, { t: fmtScore(a.totMid), cls: 'mark' });
      set(30, b + 1, { t: fmtScore(a.totAnn), cls: 'mark' });
      set(30, b + 2, { t: fmtScore(a.totFin), cls: 'mark' });
      set(31, b, { t: fmtScore(a.avgMid), cls: 'mark' });
      set(31, b + 1, { t: fmtScore(a.avgAnn), cls: 'mark' });
      set(31, b + 2, { t: fmtScore(a.avgFin), cls: 'mark' });
      set(32, b, { t: esc(a.natiyeMid), cls: 'res' });
      set(32, b + 1, { t: esc(a.natiyeAnn), cls: 'res' });
      set(33, b, { t: esc(a.darajeMid), cls: 'grade' });
      set(33, b + 1, { t: esc(a.darajeAnn), cls: 'grade' });
      // ضوابط حاضری — چه | از میان | سالانه (سطرهای ۳۴–۳۸ — عین فرمول‌های M38..O42)
      const has = ann && ann.days > 0;
      const rows: Array<[(number | undefined), (number | undefined)]> = [
        [mid?.days, ann?.days], [mid?.present, ann?.present], [mid?.absent, ann?.absent],
        [mid?.sick, ann?.sick], [mid?.leave, ann?.leave],
      ];
      rows.forEach(([mv, av], k) => {
        set(34 + k, b, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'mark' });
        set(34 + k, b + 1, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'mark' });
        set(34 + k, b + 2, { t: has ? nm(av) : '', cls: 'mark' });
      });
    });

    // نوار تائید عمودی (Y) — چهار بخش عین فایل رسمی
    set(0, 23, { t: vtx('تائید اداره مکتب', 'vplain'), rs: 6 });
    set(8, 23, { t: vtx('تائید آمریت حوزه تعلیمی/ولسوالی', 'vplain'), rs: 8 });
    set(21, 23, { t: vtx('تائید مدیریت نتایج', 'vplain'), rs: 6 });
    set(33, 23, { t: vtx('تائید و مهر ریاست معارف', 'vplain'), rs: 6 });
    [6, 7, 16, 17, 18, 19, 20, 27, 28, 29, 30, 31, 32, 36, 37, 38].forEach((r) => set(r, 23, { t: '' }));

    const page = `${renderGrid(39, JW, JH, cells, 'jt', 'ltr')}
<div class="jlogo" style="top:1.5mm"><img src="${MINISTRY_JADWAL}" style="width:23mm;height:auto"/></div>
<div class="jlogo" style="top:112mm"><img src="${SCHOOL_SEAL_JADWAL}" style="width:30mm;height:auto"/></div>`;
    pages.push(`<div class="jpage">${page}</div>`);
  }

  return docShell(`جدول نتایج — ${d.className}`, 'portrait', pages.join(''), JADWAL_CSS);
}

/* ─────────────── ۳) اطلاع‌نامهٔ رسمی هر شاگرد — A4 عمودی، عین فایل رسمی ۱۴۰۵ ─────────────── */

const NOTICE_CSS = `
  .npage { page-break-after: always; position: relative; }
  .npage:last-child { page-break-after: auto; }
  .nlogo { position: absolute; top: 1.5mm; }
  .nt { font-size: 6.4pt; }
  .nt .b { font-weight: 700; }
  .nt .big { font-size: 11pt; font-weight: 700; }
  .nt .ttl { font-size: 13pt; font-weight: 700; white-space: nowrap; }
  .nt .subj { font-size: 6.4pt; }
  .nt .mark { font-size: 8pt; }
  .nt .res { font-size: 7pt; }
  .nt .grade { font-size: 8pt; font-weight: 700; }
  .nt .lbl { font-size: 5.8pt; }
  .nt .vtxt { font-size: 6.2pt; font-weight: 700; }
  .nt .vplain { font-size: 5.8pt; }
  .nt .tiny { font-size: 5.2pt; line-height: 1.5; }
  .nt .gh { font-size: 6.6pt; font-weight: 700; }
`;

/* عرض ستون‌های A..M — RTL؛ جمع ≈ ۷۴۲ پیکسل ≈ ۱۹۶ میلی‌متر */
const NW = [28, 114, 66, 62, 66, 62, 62, 62, 62, 62, 35, 35, 26];
/* بلندی سطرهای ۱..۴۶ (pt) — عین فایل رسمی فشرده‌شده برای یک صفحهٔ A4 عمودی */
const NH = [16, 16, 16, 16, 12, 22, 18, 18, 18, 18, 18, 18,
  22, 22, 22, 22,
  ...Array.from({ length: 21 }, () => 16),
  18, 18, 18, 18,
  17, 17, 17, 17, 17];

export function buildOfficialNoticeHtml(d: OfficialClassInput, origin = '', onlyStudentId?: string): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const secondLine = d.school.govHeader?.trim() || d.school.adminOffice?.trim() || '';
  const supervisor = d.supervisor?.trim();
  const students = onlyStudentId ? d.students.filter((s) => s.id === onlyStudentId) : d.students;
  const list = students.length ? students : d.students.slice(0, 1);

  const pages = list.map((s) => {
    const a = studentAgg(d, s, subjects);
    const att = attOf(d, s.id);
    const mid = att?.mid, ann = att?.annual;
    const has = ann && ann.days > 0;
    const nm = (v: number | null | undefined) => (v == null ? '' : fa(v));
    const cells: Grid = new Map();
    const set = (r: number, c: number, cell: GCell) => cells.set(`${r},${c}`, cell);
    const vtx = (t: string, cls = 'vtxt') => `<span class="vtx ${cls}">${t}</span>`;

    /* ═══ سربرگ (سطرهای ۱–۴) — عین فایل رسمی ═══ */
    set(0, 3, { t: 'وزارت معارف', cs: 6, cls: 'big' });
    set(1, 3, { t: esc(dirLine), cs: 6, cls: 'big' });
    set(2, 3, { t: esc(secondLine), cs: 6, cls: 'big' });
    set(3, 3, { t: `(${esc(d.school.name.replace(/^\(+|\)+$/g, '').trim())})`, cs: 6, cls: 'big' });
    // سطر ۵ — خالی ادغام‌شدهٔ D5:I5
    set(4, 3, { t: '', cs: 6 });
    /* ═══ سطر ۶: اطلاع‌نامه + صنف + نگران صنف + بابت سال تعلیمی ═══ */
    set(5, 1, { t: 'اطــــلاع نامـــــه', cls: 'ttl' });
    set(5, 2, { t: `صنف ${esc(d.className)}`, cs: 3, cls: 'b' });
    set(5, 5, { t: supervisor ? `نگران صنف : (${esc(supervisor)})` : '', cs: 3, cls: 'b' });
    set(5, 8, { t: `بابت سال تعلیمی ${esc(year)}`, cs: 4, cls: 'b' });
    /* ═══ بلوک هویتی (سطرهای ۷–۱۲) — عین فایل رسمی ═══ */
    set(6, 0, { t: 'شماره حاضری', cs: 2, cls: 'b' });
    set(6, 2, { t: s ? fa(s.rollNo) : '', cs: 3, cls: 'mark' });
    set(7, 0, { t: vtx('شهرت', 'vplain'), rs: 3 });
    set(7, 1, { t: 'نام', cls: 'b' });
    set(8, 1, { t: 'نام پدر', cls: 'b' });
    set(9, 1, { t: 'نام پدرکلان', cls: 'b' });
    set(7, 2, { t: s ? esc(s.name) : '', cs: 3 });
    set(8, 2, { t: s ? esc(s.father) : '', cs: 3 });
    set(9, 2, { t: s ? esc(s.grandFather || '') : '', cs: 3 });
    set(10, 0, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(10, 2, { t: s ? esc(s.baseNumber || '') : '', cs: 3 });
    set(11, 0, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    set(11, 2, { t: s ? esc(s.idNumber || '') : '', cs: 3 });
    /* ═══ سرستون امتحانات + نمره‌ها (سطرهای ۱۳–۱۶) ═══ */
    set(12, 0, { t: 'امتحانات', rs: 4, cs: 2, cls: 'gh' });
    set(12, 2, { t: vtx('چهارو نیم ماهه', 'vplain'), rs: 4 });
    set(12, 3, { t: vtx('سالانه', 'vplain'), rs: 4 });
    set(12, 4, { t: vtx('نمرات نهائی', 'vplain'), rs: 4 });
    /* ═══ عنوان «اطلای نامه» — تصویر رسمی فایل (F7:K11) ═══ */
    set(6, 5, { t: `<img src="${NOTICE_TITLE_IMG}" style="width:100%;height:auto;display:block"/>`, rs: 5, cs: 6 });
    /* ═══ مضامین (سطرهای ۱۷–۳۷) ═══ */
    for (let i = 0; i < CAP_SUBJECTS; i++) {
      const sub = subjects[i];
      const m = s && subjects[i] ? d.marks[s.id]?.[subjects[i].id] || {} : {};
      set(16 + i, 0, { t: sub ? esc(sub.name) : '', cs: 2, cls: 'subj' });
      set(16 + i, 2, { t: fmtScore(m.midterm ?? null), cls: 'mark' });
      set(16 + i, 3, { t: fmtScore(m.annual ?? null), cls: 'mark' });
      set(16 + i, 4, { t: fmtScore(m.final ?? null), cls: 'mark' });
    }
    /* ═══ مجموعه / اوسط / نتیجه / درجه (سطرهای ۳۸–۴۱) ═══ */
    set(37, 0, { t: 'مجموعه نمرات', cs: 2, cls: 'subj' });
    set(38, 0, { t: 'اوسط نمرات', cs: 2, cls: 'subj' });
    set(39, 0, { t: 'نتیجه', cs: 2, cls: 'subj b' });
    set(40, 0, { t: 'درجه', cs: 2, cls: 'subj b' });
    set(37, 2, { t: fmtScore(a.totMid), cls: 'mark' });
    set(37, 3, { t: fmtScore(a.totAnn), cls: 'mark' });
    set(37, 4, { t: fmtScore(a.totFin), cls: 'mark' });
    set(38, 2, { t: fmtScore(a.avgMid), cls: 'mark' });
    set(38, 3, { t: fmtScore(a.avgAnn), cls: 'mark' });
    set(38, 4, { t: fmtScore(a.avgFin), cls: 'mark' });
    set(39, 2, { t: esc(a.natiyeMid), cls: 'res' });
    set(39, 3, { t: esc(a.natiyeAnn), cls: 'res' });
    set(40, 2, { t: esc(a.darajeMid), cls: 'grade' });
    set(40, 3, { t: esc(a.darajeAnn), cls: 'grade' });
    /* ═══ ضوابط حاضری (سطرهای ۴۲–۴۶) — عین فایل رسمی ═══ */
    set(41, 0, { t: vtx('ضوابط حاضری', 'vplain'), rs: 5 });
    const attRows = ['ایام سال تعلیمی', 'حاضر', 'غیر حاضر', 'مریض', 'رخصت'];
    const attVals: Array<[(number | undefined), (number | undefined)]> = [
      [mid?.days, ann?.days], [mid?.present, ann?.present], [mid?.absent, ann?.absent],
      [mid?.sick, ann?.sick], [mid?.leave, ann?.leave],
    ];
    attRows.forEach((h, k) => {
      const [mv, av] = attVals[k];
      set(41 + k, 1, { t: h, cls: 'lbl' });
      set(41 + k, 2, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'mark' });
      set(41 + k, 3, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'mark' });
      set(41 + k, 4, { t: has ? nm(av) : '', cls: 'mark' });
    });
    /* ═══ درجه‌بندی چهارونیم‌ماهه (سطرهای ۲۰–۲۶) — عین متن‌های فایل رسمی ═══ */
    set(19, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان چهارونیم ماه', cs: 5, cls: 'gh' });
    set(19, 10, { t: 'نتیجه', cls: 'gh' });
    set(19, 11, { t: 'درجه', cls: 'gh' });
    set(20, 5, { t: 'از  36  الی  40', cs: 5, cls: 'subj' });
    set(21, 5, { t: 'از  30  الی  35.99', cs: 5, cls: 'subj' });
    set(22, 5, { t: 'از  24  الی  29.99', cs: 5, cls: 'subj' });
    set(23, 5, { t: 'از  20  الی 23.99', cs: 5, cls: 'subj' });
    set(24, 5, { t: 'شاگردی که اوسط نمرات آن از 0  تا 19.99 باشد و یا حد اقل در یک مضون کمتر از 16 نمره اخذ نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(20, 10, { t: 'موفق', cls: 'subj' }); set(20, 11, { t: 'الف', cls: 'grade' });
    set(21, 11, { t: 'ب', cls: 'grade' });
    set(22, 11, { t: 'ج', cls: 'grade' });
    set(23, 11, { t: 'د', cls: 'grade' });
    set(24, 10, { t: 'تلاش بیشتر', cls: 'subj' }); set(24, 11, { t: 'هـ', cls: 'grade' });
    /* ═══ درجه‌بندی سالانه (سطرهای ۲۷–۳۵) ═══ */
    set(26, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان سالانه', cs: 5, cls: 'gh' });
    set(27, 5, { t: 'از  90  الی  100', cs: 5, cls: 'subj' });
    set(28, 5, { t: 'از  75  الی  89.99', cs: 5, cls: 'subj' });
    set(29, 5, { t: 'از  60  الی  74.99', cs: 5, cls: 'subj' });
    set(30, 5, { t: 'از  50  الی  59.99', cs: 5, cls: 'subj' });
    set(31, 5, { t: 'شاگردی که اوسط نمرات آن از 50 بالاتر باشد و در 1 الی 3 مضمون کمتر از 40 نمره اخد نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(33, 5, { t: 'شاگردی که اوسط مجموع نمرات آن از 0 تا 49.99 باشد و یا در بیشتر از 3 مضمون، کمتر از 40 نمره اخذ نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(27, 10, { t: 'ارتقا صنف', cls: 'subj' }); set(27, 11, { t: 'الف', cls: 'grade' });
    set(28, 11, { t: 'ب', cls: 'grade' });
    set(29, 11, { t: 'ج', cls: 'grade' });
    set(30, 11, { t: 'د', cls: 'grade' });
    set(31, 10, { t: 'مشروط', cls: 'subj' }); set(31, 11, { t: 'هـ', cls: 'grade' });
    set(33, 10, { t: 'تکرار صنف', cls: 'subj' });
    /* ═══ محل امضاء (سطرهای ۳۶–۴۴) — عین فایل رسمی ═══ */
    set(35, 5, { t: 'محل امضاء', cs: 2, cls: 'gh' });
    set(35, 7, { t: 'امتحان چهارونیم ماه', cs: 2, cls: 'gh' });
    set(35, 9, { t: 'امتحان سالانه', cs: 3, cls: 'gh' });
    const sigs = ['امضاء نگران صنف', 'امضاء سر معلم', 'امضاء مدیر مکتب', 'امضاء ولی شاگرد'];
    sigs.forEach((t, i) => {
      set(36 + i * 2, 5, { t, cs: 2, rs: 2, cls: 'gh' });
      set(36 + i * 2, 7, { t: '', cs: 2, rs: 2 });
      set(36 + i * 2, 9, { t: '', cs: 3, rs: 2 });
    });
    /* ═══ یادداشت (سطرهای ۴۵–۴۶) ═══ */
    set(44, 5, { t: 'یادداشت: در صورت که شهرت،نمبر اساس، نمبر تذکره و یا سایر مشخصات مربوط به شاگرد مغایرت داشته باشد، الی مدت سه روز بعد از ابلاغ نتایج جهت اصلاح آن به اداره مکتب مراجعه نمایند.', cs: 7, rs: 2, cls: 'tiny' });
    /* ═══ ستون فقرات M — برچسب‌های چرخیدهٔ لبهٔ فرم (عین فایل رسمی) ═══ */
    set(6, 12, { t: vtx('شماره حاضری', 'vplain') });
    set(7, 12, { t: vtx('شهرت', 'vplain'), rs: 3 });
    set(10, 12, { t: vtx('نمبر اساس', 'vplain') });
    set(11, 12, { t: vtx('نمبر تذکره', 'vplain') });
    set(12, 12, { t: vtx('امتحانات', 'vplain'), rs: 4 });
    for (let i = 0; i < CAP_SUBJECTS; i++) set(16 + i, 12, { t: subjects[i] ? vtx(esc(subjects[i].name), 'vplain') : '' });
    set(37, 12, { t: vtx('مجموعه نمرات', 'vplain') });
    set(38, 12, { t: vtx('اوسط نمرات', 'vplain') });
    set(39, 12, { t: vtx('نتیجه', 'vplain') });
    set(40, 12, { t: vtx('درجه', 'vplain') });
    set(41, 12, { t: vtx('ضوابط حاضری', 'vplain'), rs: 5 });

    return `<div class="npage">${renderGrid(46, NW, NH, cells, 'nt', 'rtl')}
<div class="nlogo" style="left:2mm"><img src="${SCHOOL_LOGO_NOTICE}" style="width:17mm;height:auto"/></div>
<div class="nlogo" style="right:2mm"><img src="${MINISTRY_NOTICE}" style="width:18mm;height:auto"/></div></div>`;
  });

  return docShell(`اطلاع‌نامه‌ها — ${d.className}`, 'portrait', pages.join(''), NOTICE_CSS);
}
const GRADE_SHEET_CSS = `
  .fs { margin: 0 auto; font-size: 8.5pt; }
  .fs th, .fs td { padding: 1px 1px; }
  .fs .b { font-weight: 700; }
  .fs .sub { font-size: 7pt; }
  .fs .mark { font-size: 9.5pt; }
  .fs .h1 { font-size: 12pt; }
  .fs .strip { font-size: 8.5pt; }
  .fs .lbl8 { font-size: 7.5pt; }
  .fpage { page-break-after: always; }
  .fpage:last-child { page-break-after: auto; }
`;

const FS_PER_PAGE = 34; // شاگرد در هر صفحه A4 افقی

export function buildGradeSheetHtml(d: OfficialClassInput, origin = ''): string {
  void origin;
  const subjects = d.subjects;
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const sm = classSummary(d, subjects);

  // سرستون رسمی (سطرهای ۱–۴) — در هر صفحه تکرار می‌شود (Print_Titles رسمی)
  const headHtml = () => {
    const subjHeads = subjects.map((s) => `<td rowspan="2" class="sub">${esc(s.name)}</td>`).join('');
    const strip = `
      <tr style="height:15.5pt">
        <td colspan="2" class="strip b">خلص نتایج سالانه</td>
        <td class="strip">تعداد داخله</td><td class="strip">${fa(sm.dakhila)}</td>
        <td colspan="2" class="strip">شامل امتحان</td><td colspan="2" class="strip">${fa(sm.dakhila - sm.deprived)}</td>
        <td colspan="4" class="strip">ارتقا صنف</td><td colspan="2" class="strip">${fa(sm.annPromote)}</td>
        <td colspan="4" class="strip">تکرار صنف</td><td colspan="2" class="strip">${fa(sm.annRepeat)}</td>
        <td colspan="2" class="strip">مشروط</td><td colspan="2" class="strip">${fa(sm.annCond)}</td>
        <td colspan="2" class="strip">معذرتی</td><td class="strip"></td>
        <td colspan="3" class="strip">محروم</td><td colspan="2" class="strip">${fa(sm.deprived)}</td>
        <td class="strip"></td>
      </tr>`;
    return `
    <tr style="height:16.5pt">
      <td colspan="3" class="h1 b">فهرست نتایج مضمونوار</td>
      <td class="b">صنف (${esc(d.className)})</td>
      <td class="b">مربوط</td>
      <td colspan="6" class="b">${esc(d.supervisor || '')}</td>
      <td colspan="2" class="b">مکتب</td>
      <td colspan="7" class="b">${esc(d.school.name)}</td>
      <td colspan="4" class="b">${esc(dirLine)}</td>
      <td colspan="5" class="b">سال ${esc(year)}</td>
    </tr>${strip}
    <tr style="height:23.2pt">
      <td rowspan="2" class="b">شماره</td>
      <td class="b">شهرت</td>
      <td></td><td></td>
      <td rowspan="2" class="b">نمبر اساس</td>
      ${subjHeads}
      <td rowspan="2" class="b">مجموعه نمرات</td>
      <td rowspan="2" class="b">اوسط نمرات</td>
      <td rowspan="2" class="b">نتیجه</td>
      <td rowspan="2" class="b">درجه</td>
      <td colspan="5" class="b">ضوابط حاضری</td>
    </tr>
    <tr style="height:45.8pt">
      <td class="b">نام</td>
      <td class="b">نام پدر</td><td class="b">نام پدر کلان</td>
      ${subjects.map(() => '').join('')}
      <td class="lbl8">ایام تعلیمی</td><td class="lbl8">حاضر</td><td class="lbl8">غیر حاضر</td><td class="lbl8">مریض</td><td class="lbl8">رخصت</td>
    </tr>`;
  };

  const pages: string[] = [];
  const pageCount = Math.max(1, Math.ceil(d.students.length / FS_PER_PAGE));
  for (let p = 0; p < pageCount; p++) {
    const studs = d.students.slice(p * FS_PER_PAGE, (p + 1) * FS_PER_PAGE);
    const rows = studs.map((s, i) => {
      const a = studentAgg(d, s, subjects);
      const att = attOf(d, s.id);
      const ann = att?.annual;
      const marks = subjects.map((sub) => {
        const m = d.marks[s.id]?.[sub.id] || {};
        return `<td class="mark">${fmtScore(m.final ?? null)}</td>`;
      }).join('');
      return `<tr style="height:12.8pt">
        <td class="mark">${fa(p * FS_PER_PAGE + i + 1)}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.father)}</td>
        <td>${esc(s.grandFather || '')}</td>
        <td>${esc(s.baseNumber || '')}</td>
        ${marks}
        <td class="mark">${fmtScore(a.totFin)}</td>
        <td class="mark">${fmtScore(a.avgFin)}</td>
        <td>${esc(a.natiyeAnn)}</td>
        <td class="mark">${esc(a.darajeAnn)}</td>
        <td>${ann ? fa(ann.days) : ''}</td><td>${ann ? fa(ann.present) : ''}</td>
        <td>${ann ? fa(ann.absent) : ''}</td><td>${ann ? fa(ann.sick) : ''}</td><td>${ann ? fa(ann.leave) : ''}</td>
      </tr>`;
    }).join('');
    const emptyRows = studs.length === 0
      ? Array.from({ length: 10 }, () => `<tr style="height:12.8pt">${subjects.map(() => '<td></td>').join('')}<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')
      : '';
    pages.push(`<div class="fpage"><table class="fs">
      <colgroup>${[
        24, 61, 61, 61, 48,
        ...subjects.map(() => 24),
        40, 33, 40, 26,
        24, 24, 24, 24, 24,
      ].map((w) => `<col style="width:${w}px"/>`).join('')}</colgroup>
      ${headHtml()}${rows}${emptyRows}
    </table></div>`);
  }

  return docShell(`فهرست نتایج مضمونوار — ${d.className}`, 'landscape', pages.join(''), GRADE_SHEET_CSS);
}

/* ─────────────── ۴) نسخه‌های Excel (ستون‌بندی رسمی) ─────────────── */

/** فهرست مضمونوار به اکسل — همان ستون‌های سند رسمی */
export function gradeSheetExcel(d: OfficialClassInput): string {
  const head = `<tr><th colspan="3">فهرست نتایج مضمونوار</th><th>صنف (${esc(d.className)})</th><th>مربوط</th><th>${esc(d.supervisor || '')}</th><th>مکتب</th><th>${esc(d.school.name)}</th><th>سال ${esc(d.academicYear || '')}</th></tr>
  <tr><th>شماره</th><th>شهرت و نام</th><th>نام پدر</th><th>نام پدر کلان</th><th>نمبر اساس</th>${d.subjects.map((s) => `<th>${esc(s.name)}</th>`).join('')}<th>مجموعه نمرات</th><th>اوسط نمرات</th><th>نتیجه</th><th>درجه</th><th>ایام تعلیمی</th><th>حاضر</th><th>غیر حاضر</th><th>مریض</th><th>رخصت</th></tr>`;
  const rows = d.students.map((s, i) => {
    const a = studentAgg(d, s, d.subjects);
    const att = attOf(d, s.id)?.annual;
    const marks = d.subjects.map((sub) => `<td>${d.marks[s.id]?.[sub.id]?.final ?? ''}</td>`).join('');
    return `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>${esc(s.grandFather || '')}</td><td>${esc(s.baseNumber || '')}</td>${marks}<td>${a.totFin ?? ''}</td><td>${a.avgFin ?? ''}</td><td>${esc(a.natiyeAnn)}</td><td>${esc(a.darajeAnn)}</td><td>${att?.days ?? ''}</td><td>${att?.present ?? ''}</td><td>${att?.absent ?? ''}</td><td>${att?.sick ?? ''}</td><td>${att?.leave ?? ''}</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`;
}

/** جدول نتایج به اکسل — مشخصات کامل + سه نمرهٔ هر مضمون + نتیجه‌ها */
export function resultsTableExcel(d: OfficialClassInput): string {
  const head = `<tr><th>شماره</th><th>شهرت و نام</th><th>نام پدر</th><th>نام پدر کلان</th><th>نمبر اساس</th><th>نمبر تذکره</th>${d.subjects.map((s) => `<th colspan="3">${esc(s.name)}</th>`).join('')}<th colspan="3">مجموعه نمرات</th><th colspan="3">اوسط نمرات</th><th>نتیجهٔ چهارونیم</th><th>نتیجهٔ سالانه</th><th>درجهٔ چهارونیم</th><th>درجهٔ سالانه</th></tr>
  <tr><th colspan="6">—</th>${d.subjects.map(() => '<th>چهارونیم‌ماهه</th><th>سالانه</th><th>نمرات نهائی</th>').join('')}<th>چهارونیم‌ماهه</th><th>سالانه</th><th>نمرات نهائی</th><th colspan="3">از ۴۰/۶۰/۱۰۰</th><th colspan="2">—</th><th colspan="2">—</th></tr>`;
  const rows = d.students.map((s, i) => {
    const a = studentAgg(d, s, d.subjects);
    const marks = d.subjects.map((sub) => {
      const m = d.marks[s.id]?.[sub.id] || {};
      return `<td>${m.midterm ?? ''}</td><td>${m.annual ?? ''}</td><td>${m.final ?? ''}</td>`;
    }).join('');
    return `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>${esc(s.grandFather || '')}</td><td>${esc(s.baseNumber || '')}</td><td>${esc(s.idNumber || '')}</td>${marks}<td>${a.totMid ?? ''}</td><td>${a.totAnn ?? ''}</td><td>${a.totFin ?? ''}</td><td>${a.avgMid ?? ''}</td><td>${a.avgAnn ?? ''}</td><td>${a.avgFin ?? ''}</td><td>${esc(a.natiyeMid)}</td><td>${esc(a.natiyeAnn)}</td><td>${esc(a.darajeMid)}</td><td>${esc(a.darajeAnn)}</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`;
}

/** اطلاع‌نامه‌های صنف به اکسل — یک سطر برای هر شاگرد + ضوابط حاضری */
export function noticesExcel(d: OfficialClassInput): string {
  const head = `<tr><th>شماره حاضری</th><th>شهرت و نام</th><th>نام پدر</th><th>نام پدر کلان</th><th>نمبر اساس</th><th>نمبر تذکره</th>${d.subjects.map((s) => `<th colspan="3">${esc(s.name)}</th>`).join('')}<th colspan="3">مجموعه و اوسط</th><th>نتیجهٔ چهارونیم</th><th>نتیجهٔ سالانه</th><th>درجهٔ چهارونیم</th><th>درجهٔ سالانه</th><th>ایام سال تعلیمی</th><th>حاضر</th><th>غیر حاضر</th><th>مریض</th><th>رخصت</th></tr>
  <tr><th colspan="6">—</th>${d.subjects.map(() => '<th>چهارونیم‌ماهه</th><th>سالانه</th><th>نمرات نهائی</th>').join('')}<th>مجموع نهائی</th><th>اوسط نهائی</th><th colspan="2">—</th><th colspan="4">ضوابط حاضری سالانه</th></tr>`;
  const rows = d.students.map((s) => {
    const a = studentAgg(d, s, d.subjects);
    const att = attOf(d, s.id);
    const mid = att?.mid, ann = att?.annual;
    const marks = d.subjects.map((sub) => {
      const m = d.marks[s.id]?.[sub.id] || {};
      return `<td>${m.midterm ?? ''}</td><td>${m.annual ?? ''}</td><td>${m.final ?? ''}</td>`;
    }).join('');
    return `<tr><td>${s.rollNo ?? ''}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>${esc(s.grandFather || '')}</td><td>${esc(s.baseNumber || '')}</td><td>${esc(s.idNumber || '')}</td>${marks}<td>${a.totFin ?? ''}</td><td>${a.avgFin ?? ''}</td><td>${esc(a.natiyeMid)}</td><td>${esc(a.natiyeAnn)}</td><td>${esc(a.darajeMid)}</td><td>${esc(a.darajeAnn)}</td><td>${ann?.days ?? ''}</td><td>${ann?.present ?? ''}</td><td>${ann?.absent ?? ''}</td><td>${ann?.sick ?? ''}</td><td>${ann?.leave ?? ''}</td></tr>`;
  }).join('');
  return `<table>${head}${rows}</table>`;
}

/* ─────────────── ۵) چاپ و خروجی مرورگر ─────────────── */

export function printGradeSheet(d: OfficialClassInput) {
  printRawHtml(`فهرست نتایج مضمونوار — ${d.className}`, buildGradeSheetHtml(d));
}
export function printOfficialResults(d: OfficialClassInput) {
  printRawHtml(`جدول نتایج — ${d.className}`, buildOfficialResultsHtml(d));
}
export function printOfficialNotices(d: OfficialClassInput, onlyStudentId?: string) {
  printRawHtml(`اطلاع‌نامهٔ نمرات — ${d.className}`, buildOfficialNoticeHtml(d, '', onlyStudentId));
}
export function excelGradeSheet(d: OfficialClassInput) {
  exportExcel(`فهرست نتایج مضمونوار — ${d.className}`, gradeSheetExcel(d), `فهرست-مضمونوار-${d.className}-${fileStamp()}`, { plain: true });
}
export function excelOfficialResults(d: OfficialClassInput) {
  exportExcel(`جدول نتایج — ${d.className}`, resultsTableExcel(d), `جدول-نتایج-${d.className}-${fileStamp()}`, { plain: true });
}
export function excelOfficialNotices(d: OfficialClassInput) {
  exportExcel(`اطلاع‌نامه‌ها — ${d.className}`, noticesExcel(d), `اطلاعنامه-${d.className}-${fileStamp()}`, { plain: true });
}
