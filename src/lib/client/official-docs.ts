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
function renderGrid(nRows: number, widths: number[], heights: number[], cells: Grid, tblCls = ''): string {
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
  return `<table class="${tblCls}"><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`;
}

/* ─────────────── ۲) جدول نتایج رسمی (خلیجدول) — A4 عمودی ─────────────── */

/** ظرفیت رسمی قالب: ۲۱ مضمون (سطرهای ۱۳–۳۳) — مضامین کمتر = سطرهای خالی فرم */
const CAP_SUBJECTS = 21;
const JADWAL_GROUP = 3; // سه شاگرد در هر صفحه + ستون تائید

const JADWAL_CSS = `
  .jt { margin: 0 auto; font-size: 9.5pt; }
  .jt .b { font-weight: 700; }
  .jt .lg { font-size: 7pt; }
  .jt .subj { font-size: 9pt; }
  .jt .mark { font-size: 11pt; }
  .jt .big20 { font-size: 15pt; font-weight: 700; }
  .jt .big18 { font-size: 13.5pt; font-weight: 700; }
  .jt .big15 { font-size: 11pt; font-weight: 700; }
  .jt .lbl8 { font-size: 7.5pt; }
  .jt .sm8 { font-size: 8pt; }
  .jt .res { font-size: 10.5pt; }
  .jt .grade { font-size: 12.5pt; }
  .jt .sig { vertical-align: middle; }
  .jpage { page-break-after: always; }
  .jpage:last-child { page-break-after: auto; }
`;

// عرض ستون‌های B..Y (پیکسل — متناسب با فایل رسمی)
const JW = [15, 15, 15, 15, 15, 15, 18, 15, 3, 19, 70,
  39, 34, 39, 21, 39, 34, 39, 21, 39, 34, 39, 21, 19];
// بلندی سطرهای ۴..۴۲ (pt — متناسب با فایل رسمی، فشرده برای جا شدن در یک صفحهٔ A4)
const JH = [15.5, 15.5, 15.5, 15.5, 15.5, 15.5, 18, 18, 18,
  ...Array.from({ length: 30 }, () => 16)];

export function buildOfficialResultsHtml(d: OfficialClassInput, origin = ''): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const secondLine = d.school.govHeader?.trim() || d.school.adminOffice?.trim() || '';
  const sm = classSummary(d, subjects);
  const pages: string[] = [];

  const groupCount = Math.max(1, Math.ceil(d.students.length / JADWAL_GROUP));
  for (let g = 0; g < groupCount; g++) {
    const studs = [0, 1, 2].map((k) => d.students[g * JADWAL_GROUP + k]);
    const aggs = studs.map((s) => studentAgg(d, s, subjects));
    const atts = studs.map((s) => (s ? attOf(d, s.id) : null));
    const cells: Grid = new Map();
    const set = (r: number, c: number, cell: GCell) => cells.set(`${r},${c}`, cell);

    // ═══ قطعهٔ هویتی (ستون‌های B–L — در هر صفحه تکرار می‌شود، مطابق Print_Titles) ═══
    // سطرهای ۰–۵ (اکسل ۴–۹): سربرگ ستون‌ها + legend درجه‌ها
    set(0, 7, { t: '<span class="vtx">جدول نتایج</span>', rs: 4, cls: 'lbl8' });
    set(0, 9, { t: 'شماره', cs: 2, cls: 'b' });
    set(1, 9, { t: 'شهرت', rs: 3, cls: 'b' });
    set(1, 10, { t: 'نام', cls: 'b' });
    set(2, 10, { t: 'نام پدر', cls: 'b' });
    set(3, 10, { t: 'نام پدر کلان', cls: 'b' });
    set(4, 9, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(5, 9, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    // legend درجه‌ها (سطرهای ۶–۸ اکسل — گوشهٔ بالا-راست فرم)
    set(2, 1, { t: 'موفق', cls: 'lg' }); set(2, 2, { t: 'تلاش بیشتر', cls: 'lg' });
    set(2, 3, { t: 'معذ ر تی', cls: 'lg' }); set(2, 4, { t: 'غایب', cls: 'lg' });
    set(3, 0, { t: 'ارتقا صنف', cls: 'lg' }); set(3, 1, { t: 'تکرار صنف', cls: 'lg' });
    set(3, 2, { t: 'مشروط', cls: 'lg' }); set(3, 3, { t: 'معذرتی', cls: 'lg' });
    set(3, 4, { t: 'محروم', cls: 'lg' }); set(3, 5, { t: 'سه پارچه', cls: 'lg' });
    set(4, 1, { t: 'الف', cls: 'lg' }); set(4, 2, { t: 'ب', cls: 'lg' });
    set(4, 3, { t: 'ج', cls: 'lg' }); set(4, 4, { t: 'د', cls: 'lg' }); set(4, 5, { t: 'هـ', cls: 'lg' });
    // فضای خالی بالای فرم — بدون کادر (B4:H5 و B9:H12)
    for (const r of [0, 1]) for (let c = 0; c <= 6; c++) if (!(r === 0 && c === 7)) set(r, c, { nb: true });
    for (let c = 0; c <= 6; c++) set(4, c, cells.get(`4,${c}`) ? cells.get(`4,${c}`)! : { nb: true });
    for (let c = 0; c <= 6; c++) set(5, c, { nb: true });
    set(4, 6, { nb: true }); set(5, 6, { nb: true });
    set(4, 7, { t: '<span class="vtx">صنف</span>', rs: 5, cls: 'lbl8' });

    // سطرهای ۹–۲۲ (اکسل ۱۳–۲۶): سربرگ وزارت + شروع مضامین
    set(9, 0, { t: 'وزارت معارف', rs: 14, cs: 2, cls: 'big20' });
    set(9, 2, { t: esc(dirLine), rs: 14, cs: 2, cls: 'big18' });
    set(9, 4, { t: esc(secondLine), rs: 14, cs: 2, cls: 'big18' });
    set(9, 6, { t: esc(d.school.name), rs: 14, cls: 'big15' });
    set(9, 7, { t: `بابت سال<br/>تعلیمی ${esc(year)}`, rs: 7, cls: 'lbl8' });
    set(16, 7, { t: '<span class="vtx">نگران صنف</span>', rs: 9, cls: 'lbl8' });

    // مضامین (سطرهای ۹–۲۹ = اکسل ۱۳–۳۳) + مجموعه/اوسط/نتیجه/درجه (۳۰–۳۳) + حاضری (۳۴–۳۸)
    for (let i = 0; i < CAP_SUBJECTS; i++) {
      const sub = subjects[i];
      set(9 + i, 9, { t: sub ? esc(sub.name) : '', cs: 2, cls: 'subj' });
    }
    set(30, 9, { t: 'مجموعه نمرات', cs: 2, cls: 'subj' });
    set(31, 9, { t: 'اوسط نمرات', cs: 2, cls: 'subj' });
    set(32, 9, { t: 'نتیجه', cs: 2, cls: 'subj b' });
    set(33, 9, { t: 'درجه', cs: 2, cls: 'subj b' });
    set(34, 9, { t: 'ضوابط حاضری', rs: 5, cls: 'lbl8' });
    set(34, 10, { t: 'ایام سال تعلیمی', cls: 'lbl8' });
    set(35, 10, { t: 'حاضر', cls: 'lbl8' });
    set(36, 10, { t: 'غیر حاضر', cls: 'lbl8' });
    set(37, 10, { t: 'مریض', cls: 'lbl8' });
    set(38, 10, { t: 'رخصت', cls: 'lbl8' });

    // خلص نتایج چهارونیم ماه (سطرهای ۲۷–۳۲ در ستون‌های B–H)
    set(27, 0, { t: 'خلص نتایج<br/>چهارونیم ماه', rs: 6, cls: 'lbl8' });
    const midHead = ['تعداد داخله', 'شامل امتحان', 'موفق', 'تلاش بیشتر', 'معذرتی', 'غایب'];
    midHead.forEach((h, i) => set(27, 1 + i, { t: h, rs: 4, cls: 'lbl8' }));
    const midVals = [
      fa(sm.dakhila),
      fa(sm.dakhila - sm.midAbsent),
      fa(sm.midPass), fa(sm.midTry), '', fa(sm.midAbsent),
    ];
    midVals.forEach((v, i) => set(31, 1 + i, { t: v }));
    // خلص نتایج سالانه (سطرهای ۳۳–۳۸ در ستون‌های B–I)
    set(33, 0, { t: 'خلص نتایج<br/>سالانه', rs: 6, cls: 'lbl8' });
    const annHead = ['تعداد داخله', 'شامل امتحان', 'ارتقا صنف', 'تکرار صنف', 'مشروط', 'معذرتی', 'محروم'];
    annHead.forEach((h, i) => set(33, 1 + i, { t: h, rs: 4, cls: 'lbl8' }));
    const annVals = [
      fa(sm.dakhila),
      fa(sm.dakhila - sm.deprived),
      fa(sm.annPromote), fa(sm.annRepeat), fa(sm.annCond), '', fa(sm.deprived),
    ];
    annVals.forEach((v, i) => set(37, 1 + i, { t: v }));

    // ═══ بلوک سه شاگرد (ستون‌های M..X) + ستون تائید (Y) ═══
    const bases = [11, 15, 19]; // M، Q، U
    studs.forEach((s, i) => {
      const b = bases[i];
      const a = aggs[i];
      const att = atts[i];
      const mid = att?.mid, ann = att?.annual;
      const nm = (v: number | null | undefined) => (v == null ? '' : fa(v));
      set(0, b, { t: s ? fa(s.rollNo ?? g * JADWAL_GROUP + i + 1) : '', cs: 3, cls: 'mark' });
      set(1, b, { t: s ? esc(s.name) : '', cs: 3 });
      set(2, b, { t: s ? esc(s.father) : '', cs: 3 });
      set(3, b, { t: s ? esc(s.grandFather || '') : '', cs: 3 });
      set(4, b, { t: s ? esc(s.baseNumber || '') : '', cs: 3 });
      set(5, b, { t: s ? esc(s.idNumber || '') : '', cs: 3 });
      // سرستون چه/سال/نه — سطرهای ۶–۸ (اکسل ۱۰–۱۲)
      set(6, b, { t: 'چهارو<br/>نیم ماهه', rs: 3, cls: 'lbl8' });
      set(6, b + 1, { t: 'سالانه', rs: 3, cls: 'lbl8' });
      set(6, b + 2, { t: 'نمرات نهائی', rs: 3, cls: 'lbl8' });
      // ستون ملاحظات — تمام طول جدول (سطرهای ۰–۳۸)
      set(0, b + 3, { t: s && s.eligible ? `<span class="vtx">${esc(s.eligible)}</span>` : '', rs: 39, cls: 'lbl8' });
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
      set(31, b, { t: fmtScore(a.avgMid), cls: 'sm8' });
      set(31, b + 1, { t: fmtScore(a.avgAnn), cls: 'sm8' });
      set(31, b + 2, { t: fmtScore(a.avgFin), cls: 'sm8' });
      set(32, b, { t: esc(a.natiyeMid), cls: 'res' });
      set(32, b + 1, { t: esc(a.natiyeAnn), cls: 'res' });
      set(33, b, { t: esc(a.darajeMid), cls: 'grade' });
      set(33, b + 1, { t: esc(a.darajeAnn), cls: 'grade' });
      // ضوابط حاضری — چه | از میان | سالانه (سطرهای ۳۴–۳۸)
      const has = ann && ann.days > 0;
      const rows: Array<[(number | undefined), (number | undefined)]> = [
        [mid?.days, ann?.days], [mid?.present, ann?.present], [mid?.absent, ann?.absent],
        [mid?.sick, ann?.sick], [mid?.leave, ann?.leave],
      ];
      rows.forEach(([mv, av], k) => {
        set(34 + k, b, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'natt' });
        set(34 + k, b + 1, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'natt' });
        set(34 + k, b + 2, { t: has ? nm(av) : '', cls: 'natt' });
      });
    });

    // ستون تائید (Y) — چهار جعبهٔ امضاء بدون کادر
    set(0, 23, { t: 'تائید اداره مکتب', rs: 6, nb: true, cls: 'sig' });
    set(8, 23, { t: 'تائید آمریت حوزه تعلیمی/ولسوالی', rs: 8, nb: true, cls: 'sig' });
    set(21, 23, { t: 'تائید مدیریت نتایج', rs: 6, nb: true, cls: 'sig' });
    set(33, 23, { t: 'تائید و مهر ریاست معارف', rs: 6, nb: true, cls: 'sig' });
    // فضاهای خالی باقی ستون تائید
    [6, 7, 16, 17, 18, 19, 20, 27, 28, 29, 30, 31, 32, 36, 37, 38].forEach((r) => set(r, 23, { nb: true }));

    pages.push(`<div class="jpage">${renderGrid(39, JW, JH, cells, 'jt')}</div>`);
  }

  return docShell(`جدول نتایج — ${d.className}`, 'portrait', pages.join(''), JADWAL_CSS);
}

/* ─────────────── ۳) اطلاع‌نامهٔ رسمی هر شاگرد — A4 عمودی، یک فرم در هر صفحه ─────────────── */

const NOTICE_CSS = `
  .nt { margin: 0 auto; font-size: 9.5pt; }
  .nt .b { font-weight: 700; }
  .nt .t20 { font-size: 15pt; font-weight: 700; }
  .nt .t18 { font-size: 13.5pt; font-weight: 700; }
  .nt .t16 { font-size: 12.5pt; font-weight: 700; }
  .nt .ttl { font-size: 13pt; font-weight: 700; background: #eee; }
  .nt .subj { font-size: 9pt; }
  .nt .mark { font-size: 11pt; }
  .nt .sm7 { font-size: 7pt; line-height: 1.5; }
  .nt .sm8 { font-size: 8pt; }
  .nt .lbl8 { font-size: 8.5pt; }
  .nt .sig { font-size: 10pt; }
  .nt .grade { font-size: 12.5pt; }
  .npage { page-break-after: always; }
  .npage:last-child { page-break-after: auto; }
`;

// عرض ستون‌های A..L (پیکسل — متناسب با فایل رسمی)
const NW = [19, 87, 47, 47, 47, 59, 59, 59, 59, 59, 63, 39];
// بلندی سطرهای ۱..۴۶ (pt — متناسب با فایل رسمی، فشرده برای جا شدن در یک صفحهٔ A4)
const NH = [14, 14, 14, 14, 14, 15, 15, 15, 15, 15, 15, 15,
  13, 13, 13, 13,
  ...Array.from({ length: 30 }, () => 15)];

export function buildOfficialNoticeHtml(d: OfficialClassInput, origin = '', onlyStudentId?: string): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const yearLine = `بابت سال تعلیمی ${(d.academicYear || '۱۴۰۵').trim()}`;
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
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

    // سربرگ (سطرهای ۱–۴)
    set(0, 3, { t: 'وزارت معارف', cs: 6, cls: 't20' });
    set(1, 3, { t: esc(dirLine), cs: 6, cls: 't18' });
    set(2, 3, { t: esc(d.school.govHeader?.trim() || ''), cs: 6, cls: 't16' });
    set(3, 3, { t: esc(d.school.name), cs: 6, cls: 't16' });

    // سطر عنوان + صنف/نگران/سال (سطر ۶)
    set(5, 0, { nb: true });
    set(5, 1, { t: 'اطــــلاع نامـــــه', cls: 'ttl' });
    set(5, 2, { t: `صنف (${esc(d.className)})`, cs: 3, cls: 'b' });
    set(5, 5, { t: esc(d.supervisor || ''), cs: 3, cls: 'b' });
    set(5, 8, { t: esc(yearLine), cs: 4, cls: 'b' });

    // معلومات شاگرد (سطرهای ۷–۱۲)
    set(6, 0, { t: 'شماره حاضری', cs: 2, cls: 'b' });
    set(6, 2, { t: fa(s.rollNo ?? ''), cs: 3, cls: 'mark' });
    set(7, 0, { t: 'شهرت', rs: 3, cls: 'b' });
    set(7, 1, { t: 'نام', cls: 'b' });
    set(7, 2, { t: esc(s.name), cs: 3 });
    set(8, 1, { t: 'نام پدر', cls: 'b' });
    set(8, 2, { t: esc(s.father), cs: 3 });
    set(9, 1, { t: 'نام پدرکلان', cls: 'b' });
    set(9, 2, { t: esc(s.grandFather || ''), cs: 3 });
    set(10, 0, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(10, 2, { t: esc(s.baseNumber || ''), cs: 3 });
    set(11, 0, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    set(11, 2, { t: esc(s.idNumber || ''), cs: 3 });

    // جدول امتحانات (سطرهای ۱۳–۳۷: سربرگ ۴ سطری + ۲۱ مضمون)
    set(12, 0, { t: 'امتحانات', rs: 4, cs: 2, cls: 'b' });
    set(12, 2, { t: 'چهارو<br/>نیم ماهه', rs: 4, cls: 'lbl8' });
    set(12, 3, { t: 'سالانه', rs: 4, cls: 'lbl8' });
    set(12, 4, { t: 'نمرات نهائی', rs: 4, cls: 'lbl8' });
    for (let i = 0; i < CAP_SUBJECTS; i++) {
      const sub = subjects[i];
      const m = sub ? d.marks[s.id]?.[sub.id] || {} : {};
      set(16 + i, 0, { t: sub ? esc(sub.name) : '', cs: 2, cls: 'subj' });
      set(16 + i, 2, { t: fmtScore(m.midterm ?? null), cls: 'mark' });
      set(16 + i, 3, { t: fmtScore(m.annual ?? null), cls: 'mark' });
      set(16 + i, 4, { t: fmtScore(m.final ?? null), cls: 'mark' });
    }

    // مجموعه/اوسط/نتیجه/درجه (سطرهای ۳۸–۴۱)
    set(37, 0, { t: 'مجموعه نمرات', cs: 2, cls: 'b' });
    set(37, 2, { t: fmtScore(a.totMid), cls: 'mark' });
    set(37, 3, { t: fmtScore(a.totAnn), cls: 'mark' });
    set(37, 4, { t: fmtScore(a.totFin), cls: 'mark' });
    set(38, 0, { t: 'اوسط نمرات', cs: 2, cls: 'b' });
    set(38, 2, { t: fmtScore(a.avgMid), cls: 'sm8' });
    set(38, 3, { t: fmtScore(a.avgAnn), cls: 'sm8' });
    set(38, 4, { t: fmtScore(a.avgFin), cls: 'sm8' });
    set(39, 0, { t: 'نتیجه', cs: 2, cls: 'b' });
    set(39, 2, { t: esc(a.natiyeMid), cls: 'mark' });
    set(39, 3, { t: esc(a.natiyeAnn), cs: 2, cls: 'mark' });
    set(40, 0, { t: 'درجه', cs: 2, cls: 'b' });
    set(40, 2, { t: esc(a.darajeMid), cls: 'grade' });
    set(40, 3, { t: esc(a.darajeAnn), cls: 'grade' });

    // ضوابط حاضری (سطرهای ۴۲–۴۶)
    set(41, 0, { t: 'ضوابط<br/>حاضری', rs: 5, cls: 'lbl8' });
    const attRows = [
      ['ایام سال تعلیمی', mid?.days, ann?.days],
      ['حاضر', mid?.present, ann?.present],
      ['غیر حاضر', mid?.absent, ann?.absent],
      ['مریض', mid?.sick, ann?.sick],
      ['رخصت', mid?.leave, ann?.leave],
    ] as Array<[string, number | undefined, number | undefined]>;
    attRows.forEach(([label, mv, av], k) => {
      set(41 + k, 1, { t: label, cls: 'lbl8' });
      set(41 + k, 2, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'sm8' });
      set(41 + k, 3, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'sm8' });
      set(41 + k, 4, { t: has ? nm(av) : '', cls: 'sm8' });
    });

    // ─── بخش میانی: درجه‌بندی + امضاءها (ستون‌های F..L) ───
    set(19, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان چهارونیم ماه', cs: 5, cls: 'sm8 b' });
    set(19, 10, { t: 'نتیجه', cls: 'b' });
    set(19, 11, { t: 'درجه', cls: 'b' });
    const midBands: Array<[string, string, string, number]> = [
      ['از  36  الی  40', 'موفق', 'الف', 1],
      ['از  30  الی  35.99', '', 'ب', 1],
      ['از  24  الی  29.99', '', 'ج', 1],
      ['از  20  الی 23.99', '', 'د', 1],
    ];
    midBands.forEach(([rng, res, gr], k) => {
      set(20 + k, 5, { t: rng, cs: 5, cls: 'sm8' });
      if (res) set(20 + k, 10, { t: res, rs: 4, cls: 'sm8' });
      set(20 + k, 11, { t: gr, cls: 'sm8' });
    });
    set(24, 5, { t: 'شاگردی که اوسط نمرات آن از 0  تا 19.99 باشد و یا حد اقل در یک مضون کمتر از 16 نمره اخذ نموده باشد.', rs: 2, cs: 5, cls: 'sm7' });
    set(24, 10, { t: 'تلاش بیشتر', rs: 2, cls: 'sm8' });
    set(24, 11, { t: 'هـ', rs: 2, cls: 'sm8' });

    set(26, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان سالانه', cs: 5, cls: 'sm8 b' });
    set(26, 10, { t: 'نتیجه', cls: 'b' });
    set(26, 11, { t: 'درجه', cls: 'b' });
    const annBands: Array<[string, string, string]> = [
      ['از  90  الی  100', 'ارتقا صنف', 'الف'],
      ['از  75  الی  89.99', '', 'ب'],
      ['از  60  الی  74.99', '', 'ج'],
      ['از  50  الی  59.99', '', 'د'],
    ];
    annBands.forEach(([rng, res, gr], k) => {
      set(27 + k, 5, { t: rng, cs: 5, cls: 'sm8' });
      if (res) set(27 + k, 10, { t: res, rs: 4, cls: 'sm8' });
      set(27 + k, 11, { t: gr, cls: 'sm8' });
    });
    set(31, 5, { t: 'شاگردی که اوسط نمرات آن از 50 بالاتر باشد و در 1 الی 3 مضمون کمتر از 40 نمره اخد نموده باشد.', rs: 2, cs: 5, cls: 'sm7' });
    set(31, 10, { t: 'مشروط', rs: 2, cls: 'sm8' });
    set(31, 11, { t: 'هـ', rs: 2, cls: 'sm8' });
    set(33, 5, { t: 'شاگردی که اوسط مجموع نمرات آن از 0 تا 49.99 باشد و یا در بیشتر از 3 مضمون، کمتر از 40 نمره اخذ نموده باشد.', rs: 2, cs: 5, cls: 'sm7' });
    set(33, 10, { t: 'تکرار صنف', rs: 2, cls: 'sm8' });

    // محل امضاءها (سطرهای ۳۶–۴۴)
    set(35, 5, { t: 'محل امضاء', cs: 2, cls: 'b' });
    set(35, 7, { t: 'امتحان چهارونیم ماه', cs: 2, cls: 'sm8' });
    set(35, 9, { t: 'امتحان سالانه', cs: 3, cls: 'sm8' });
    const sigRows: Array<[string, number]> = [
      ['امضاء نگران صنف', 36], ['امضاء سر معلم', 38], ['امضاء مدیر مکتب', 40], ['امضاء ولی شاگرد', 42],
    ];
    sigRows.forEach(([label, r]) => {
      set(r, 5, { t: label, rs: 2, cs: 2, cls: 'sig b' });
      set(r, 7, { rs: 2, cs: 2 });
      set(r, 9, { rs: 2, cs: 3 });
    });
    set(44, 5, { t: '<b>یادداشت:</b> در صورت که شهرت،نمبر اساس، نمبر تذکره و یا سایر مشخصات مربوط به شاگرد مغایرت داشته باشد، الی مدت سه روز بعد از ابلاغ نتایج جهت اصلاح آن به اداره مکتب مراجعه نمایند.', rs: 2, cs: 7, cls: 'sm7' });

    return `<div class="npage">${renderGrid(46, NW, NH, cells, 'nt')}</div>`;
  });

  return docShell(`اطلاع‌نامهٔ نمرات — ${d.className}`, 'portrait', pages.join(''), NOTICE_CSS);
}

/* ─────────────── ۱) فهرست نتایج مضمونوار (ورق نشریه) — A4 افقی ─────────────── */

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
