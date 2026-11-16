/**
 * اسناد رسمی وزارت معارف افغانستان — نسخهٔ ۳.۴.۰
 *
 * سه سند دقیقاً مطابق فرم‌های کاغذی رسمی وزارت معارف (اسکرین‌شات‌های مرجع):
 *  ۱) ورق نشریهٔ نمرات امتحان — landscape؛ مضامین به‌صورت سطر، شاگردان به‌صورت ستون
 *     (۳ شاگرد در هر صفحه) با سه نوبت امتحان و اجزای تحریری/تقریری/جمع
 *  ۲) جدول نتایج (خلیجدول) — landscape؛ ستون‌ها: شماره، نام، نام پدر، نام پدر کلان،
 *     نمبر اساسی، نمبر تذکره، مجموعه نمرات، وسط، نتیجه، درجه + جدول‌های خلاصه + امضاها
 *  ۳) اطلاع‌نامهٔ رسمی نمرات هر شاگرد — portrait؛ جدول مضامین با جوارثی ماهی/سالانه/جمع،
 *     پنل درجه‌بندی باندهای الف-هـ، امضاها و ملاحظهٔ پانزده‌روزهٔ اعتراض
 *
 * همهٔ سندها نام مکتب، لوگوی مکتب و نشان وزارت را از تنظیمات می‌گیرند و
 * چندصفحه‌ای بودن با تکرار سربرگ/سرستون‌ها مدیریت می‌شود. توابع خالص‌اند —
 * از Node هم قابل استفاده (آزمایش) و در مرورگر چاپ/Excel می‌شوند.
 */

import { toPersianDigits, isoToday, isoToJalaliDisplay } from '@/lib/jalali';
import { OFFICIAL_CSS, officialHeaderHtml, printRawHtml, exportExcel, fileStamp, type ExportBrand } from './exports';

/* ─────────────── انواع دادهٔ ورودی ─────────────── */

export interface OfficialSchool {
  name: string;
  logo?: string; // dataURL لوگوی مکتب
  emblem?: string; // dataURL نشان وزارت معارف
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

export interface OfficialClassInput {
  school: OfficialSchool;
  className: string;
  academicYear?: string;
  subjects: Array<{ id: string; name: string }>; // به ترتیب رسمی نصاب
  students: OfficialStudent[];
  /** کلید: studentId → subjectId → نمره */
  marks: Record<string, Record<string, OfficialMark>>;
  passMark?: number; // حد نصاب کامیابی (پیش‌فرض ۴۰)
  passLabel?: string;
  failLabel?: string;
  periodMax?: { MIDTERM: number; ANNUAL: number };
  /** نام نگران صنف برای ورق نشریه (اختیاری) */
  supervisor?: string;
  /** نوبت/شعبه برای ورق نشریه */
  nubt?: string;
  branch?: string;
  /** تاریخ سند (شمسی) — خالی = امروز */
  date?: string;
}

/* ─────────────── کمک‌سازها ─────────────── */

function fa(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return toPersianDigits(v);
}
function faOrDash(v: number | string | null | undefined): string {
  const s = fa(v);
  return s === '' ? '—' : s;
}
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function fmtScore(v: number | null | undefined, max?: number): string {
  if (v === null || v === undefined) return '';
  return max ? `${fa(Math.round(v * 10) / 10)}` : fa(Math.round(v * 10) / 10);
}

/** برندینگ هر سند مستقیم از تنظیمات پاس‌شده به خود سند — نام مکتب و لوگو همیشه از تنظیمات */
function schoolOverrides(d: OfficialClassInput): Partial<ExportBrand> {
  return {
    schoolName: d.school.name,
    schoolLogo: d.school.logo,
    emblemLogo: d.school.emblem,
    govHeader: d.school.govHeader,
    directorateLine: d.school.directorateLine,
    adminOffice: d.school.adminOffice,
    licenseNo: d.school.licenseNo,
    province: d.school.province,
  };
}

function docShell(title: string, orientation: 'portrait' | 'landscape', body: string, pageCss = ''): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>${esc(title)}</title><style>${OFFICIAL_CSS}
@page { size: A4 ${orientation}; margin: ${orientation === 'portrait' ? '10mm' : '8mm'}; }
${pageCss}
</style></head><body>${body}</body></html>`;
}

/* ─────────────── ۱) ورق نشریهٔ نمرات امتحان ─────────────── */

/** شاگردان به گروه‌های ۳تایی — مطابق فرم رسمی (سه ستون شاگرد در هر ورق) */
const SHEET_STUDENTS_PER_PAGE = 3;

export function buildGradeSheetHtml(d: OfficialClassInput, origin = ''): string {
  const subjects = d.subjects;
  const pageCss = `
    .sheet-info { display: flex; gap: 6px; margin: 6px 0; font-size: 11px; }
    .sheet-info span { border: 1.2px solid #000; padding: 2px 8px; font-weight: 700; }
    .sheet-page { page-break-after: always; }
    .sheet-page:last-child { page-break-after: auto; }
    .gs-table th, .gs-table td { padding: 1px 2px; font-size: 10.5px; }
    .gs-table .lbl { width: 82px; font-weight: 700; }
    .gs-table th.info, .gs-table td.info { width: 92px; }
    .gs-student-col { min-width: 74px; }
  `;
  const pm = d.periodMax || { MIDTERM: 40, ANNUAL: 60 };
  const chunks: OfficialStudent[][] = [];
  for (let i = 0; i < d.students.length; i += SHEET_STUDENTS_PER_PAGE) {
    chunks.push(d.students.slice(i, i + SHEET_STUDENTS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const pages = chunks.map((studs, pi) => {
    // سرستون شاگردان: شماره، نام، نام پدر، نام پدر کلان، نمبر اساسی، نمبر تذکره
    const headRows = `
      <tr><th class="lbl">شماره</th>${studs.map((s, i) => `<th class="gs-student-col">${fa(pi * SHEET_STUDENTS_PER_PAGE + i + 1)}</th>`).join('')}</tr>
      <tr><th class="lbl">نام</th>${studs.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr>
      <tr><th class="lbl">نام پدر</th>${studs.map((s) => `<th>${esc(s.father)}</th>`).join('')}</tr>
      <tr><th class="lbl">نام پدر کلان</th>${studs.map((s) => `<th>${esc(s.grandFather || '')}</th>`).join('')}</tr>
      <tr><th class="lbl">نمبر اساسی</th>${studs.map((s) => `<th>${fa(s.rollNo ?? '')}</th>`).join('')}</tr>
      <tr><th class="lbl">نمبر تذکره</th>${studs.map((s) => `<th>${fa(s.idNumber ?? '')}</th>`).join('')}</tr>
      <tr><th class="lbl" rowspan="1">نوبت امتحان</th>${studs.map(() => `<th colspan="3">نوبت اول</th><th colspan="3">نوبت دوم</th><th colspan="3">نوبت سوم</th>`).join('')}</tr>
      <tr><th class="lbl">اجزا</th>${studs.map(() => `<th>تحریری</th><th>تقریری</th><th>جمع</th><th>تحریری</th><th>تقریری</th><th>جمع</th><th>تحریری</th><th>تقریری</th><th>جمع</th>`).join('')}</tr>`;

    // سطرهای مضامین — نوبت اول: جمع = چهارونیم‌ماهه؛ نوبت دوم: جمع = سالانه؛ نوبت سوم: خالی
    const subjectRows = subjects.map((sub) => `
      <tr><td class="lbl">${esc(sub.name)}</td>${studs.map((s) => {
        const m = d.marks[s.id]?.[sub.id];
        const mid = m?.midterm ?? null;
        const ann = m?.annual ?? null;
        return `<td></td><td></td><td style="font-weight:700">${fmtScore(mid, pm.MIDTERM)}</td><td></td><td></td><td style="font-weight:700">${fmtScore(ann, pm.ANNUAL)}</td><td></td><td></td><td></td>`;
      }).join('')}</tr>`).join('');

    // سطرهای خلاصه: مجموعه نمرات، اوصاف نمرات، نتیجه، درجه
    const summaryRows = `
      <tr><td class="lbl"><b>مجموعه نمرات</b></td>${studs.map((s) => {
        const ms = d.marks[s.id] || {};
        const tot = subjects.reduce((acc, sub) => acc + (ms[sub.id]?.final ?? 0), 0);
        const has = subjects.some((sub) => ms[sub.id]?.final != null);
        return `<td></td><td></td><td></td><td></td><td></td><td style="font-weight:700">${has ? fmtScore(tot) : ''}</td><td></td><td></td><td></td>`;
      }).join('')}</tr>
      <tr><td class="lbl"><b>اوصاف نمرات</b></td>${studs.map((s) => {
        const ms = d.marks[s.id] || {};
        const tot = subjects.reduce((acc, sub) => acc + (ms[sub.id]?.final ?? 0), 0);
        const has = subjects.some((sub) => ms[sub.id]?.final != null);
        const maxTot = subjects.length * (pm.MIDTERM + pm.ANNUAL);
        const letter = has && maxTot > 0 ? letterOf((tot / maxTot) * 100, d.passMark ?? 40) : '';
        return `<td></td><td></td><td></td><td></td><td></td><td style="font-weight:700">${letter}</td><td></td><td></td><td></td>`;
      }).join('')}</tr>
      <tr><td class="lbl"><b>نتیجه</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>
      <tr><td class="lbl"><b>درجه</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>
      <tr><td class="lbl"><b>حاضر</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>
      <tr><td class="lbl"><b>غیر حاضر</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>
      <tr><td class="lbl"><b>مریض</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>
      <tr><td class="lbl"><b>رخصت</b></td>${studs.map(() => `<td class="gs-student-col" colspan="9"></td>`).join('')}</tr>`;

    return `<div class="sheet-page">
      ${officialHeaderHtml(origin, schoolOverrides(d))}
      <div class="sheet-info">
        <span>صنف: ${esc(d.className)}</span>
        <span>شعبه: ${esc(d.branch || '—')}</span>
        <span>نوبت: ${esc(d.nubt || '—')}</span>
        <span>سال تعلیمی: ${esc(d.academicYear || '—')}</span>
        <span>نگران صنف: ${esc(d.supervisor || '—')}</span>
        <span>تعداد شاگردان: ${fa(d.students.length)}</span>
      </div>
      <table class="gs-table">${headRows}${subjectRows}${summaryRows}</table>
      <div class="sheet-foot">
        <table class="att-legend"><tbody>
          <tr><th colspan="4">کد حاضری</th></tr>
          <tr><td>حاضره</td><td>غیرحاضره</td><td>مریض</td><td>رخصت</td></tr>
          <tr><td><b>۱</b></td><td><b>۲</b></td><td><b>۳</b></td><td><b>۴</b></td></tr>
        </tbody></table>
        <p class="sheet-note">مقررات: نمرهٔ نهائی هر مضمون از ۱۰۰ — جوارثی ماهی از ${fa(pm.MIDTERM)} (تحریری + تقریری) و سالانه از ${fa(pm.ANNUAL)} (تحریری + تقریری)؛ حد نصاب کامیابی هر مضمون ${fa(d.passMark ?? 40)} و اوسط ارتقا ${fa(50)}٪ به‌علاوهٔ حاضری حداقل ${fa(75)}٪ به‌اساس مقررهٔ وزارت معارف.</p>
      </div>
      <div class="mo-sign-row">
        <div class="mo-sign"><div class="line">امتحان‌نگران صنف</div></div>
        <div class="mo-sign"><div class="line">سرمعلم</div></div>
        <div class="mo-sign"><div class="line">مدیر مکتب</div></div>
        <div class="mo-sign"><div class="line">ناظر معارف مربوطه</div></div>
      </div>
    </div>`;
  }).join('');

  return docShell(`ورق نشریهٔ نمرات — ${d.className}`, 'landscape', pages, pageCss + `
    .sheet-foot { display: flex; gap: 10px; align-items: flex-start; margin-top: 6px; }
    .att-legend { width: 34%; font-size: 10px; }
    .att-legend td, .att-legend th { padding: 1px 4px; }
    .sheet-note { flex: 1; font-size: 9.5px; line-height: 1.8; text-align: justify; border: 1.2px solid #000; padding: 4px 8px; }`);
}

/** مکتسبهٔ ساده برای خلاصهٔ ورق نشریه (اوسط درصد کل) */
function letterOf(percent: number, passMark: number): string {
  if (percent >= 90) return 'الف';
  if (percent >= 75) return 'ب';
  if (percent >= 60) return 'ج';
  if (percent >= 50) return 'د';
  if (percent >= passMark) return 'هـ';
  return 'هـ';
}

/* ─────────────── ۲) جدول نتایج رسمی (خلیجدول) ─────────────── */

const RESULTS_ROWS_PER_PAGE = 25;

export function buildOfficialResultsHtml(d: OfficialClassInput, origin = ''): string {
  const pm = d.periodMax || { MIDTERM: 40, ANNUAL: 60 };
  const maxTot = d.subjects.length * (pm.MIDTERM + pm.ANNUAL);

  // خلاصهٔ آماری هر دوره (جوارثی ماهی و سالانه) — هشت سطر رسمی جدول‌های بالای فرم
  const stats = (period: 'MIDTERM' | 'ANNUAL') => {
    let count = 0, pass = 0, fail = 0, cond = 0, depr = 0;
    const percents: number[] = [];
    for (const s of d.students) {
      const ms = d.marks[s.id] || {};
      let tot = 0, has = false;
      for (const sub of d.subjects) {
        const v = ms[sub.id]?.[period === 'MIDTERM' ? 'midterm' : 'annual'];
        if (v != null) { tot += v; has = true; }
      }
      if (!has) continue;
      count++;
      const pct = maxTot > 0 ? Math.round((tot / maxTot) * 10000) / 100 : 0;
      percents.push(pct);
      // کامیاب دوره: اوسط نمرات دوره در سقف دوره ≥ حد نصاب
      const avgScore = pct / 100 * (period === 'MIDTERM' ? pm.MIDTERM : pm.ANNUAL);
      if (avgScore >= (d.passMark ?? 40)) pass++; else fail++;
      // وضعیت نهایی شاگرد (مشروط/محروم) فقط در جدول سالانه
      if (period === 'ANNUAL') {
        if (resultOfStudent(d, s.id, pct) === 'مشروط') cond++;
        if (s.eligible && s.eligible.includes('محروم')) depr++;
      }
    }
    return {
      count, pass, fail, cond, depr,
      avg: percents.length ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 100) / 100 : null,
      max: percents.length ? Math.max(...percents) : null,
      min: percents.length ? Math.min(...percents) : null,
    };
  };
  const mid = stats('MIDTERM');
  const ann = stats('ANNUAL');

  const statBox = (
    title: string,
    st: { count: number; pass: number; fail: number; cond: number; depr: number; avg: number | null; max: number | null; min: number | null },
    annual: boolean,
  ) => `
    <table class="stat-box"><thead><tr><th colspan="2">${esc(title)}</th></tr></thead><tbody>
      <tr><td class="lbl">تعداد داخله</td><td class="val">${fa(st.count)}</td></tr>
      <tr><td class="lbl">کامیاب</td><td class="val">${fa(st.pass)}</td></tr>
      <tr><td class="lbl">ناکام</td><td class="val">${fa(st.fail)}</td></tr>
      ${annual ? `<tr><td class="lbl">مشروط</td><td class="val">${fa(st.cond)}</td></tr>
      <tr><td class="lbl">محروم</td><td class="val">${fa(st.depr)}</td></tr>` : ''}
      <tr><td class="lbl">متوسط درصد</td><td class="val">${st.avg != null ? fa(st.avg) : '—'}</td></tr>
      <tr><td class="lbl">بالاترین درصد</td><td class="val">${st.max != null ? fa(st.max) : '—'}</td></tr>
      <tr><td class="lbl">پایین‌ترین درصد</td><td class="val">${st.min != null ? fa(st.min) : '—'}</td></tr>
    </tbody></table>`;

  // سطرهای جدول اصلی با تقسیم ۲۵ سطر در هر صفحه و تکرار سرستون
  const chunks: OfficialStudent[][] = [];
  for (let i = 0; i < d.students.length; i += RESULTS_ROWS_PER_PAGE) {
    chunks.push(d.students.slice(i, i + RESULTS_ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const colgroup = `<colgroup>
    <col style="width:6%"><col style="width:14%"><col style="width:12%"><col style="width:12%">
    <col style="width:9%"><col style="width:11%"><col style="width:11%"><col style="width:8%">
    <col style="width:11%"><col style="width:6%">
  </colgroup>`;
  const thead = `<thead><tr>
    <th>شماره</th><th>نام</th><th>نام پدر</th><th>نام پدر کلان</th>
    <th>نمبر اساسی</th><th>نمبر تذکره</th><th>مجموعه نمرات</th><th>وسط</th><th>نتیجه</th><th>درجه</th>
  </tr></thead>`;

  const pages = chunks.map((studs, pi) => `
    <div class="res-page${pi > 0 ? ' page-break' : ''}">
      <table class="res-table">${colgroup}${thead}<tbody>${studs.map((s, i) => {
        const ms = d.marks[s.id] || {};
        const tot = d.subjects.reduce((acc, sub) => acc + (ms[sub.id]?.final ?? 0), 0);
        const has = d.subjects.some((sub) => ms[sub.id]?.final != null);
        const avgPct = has && maxTot > 0 ? Math.round((tot / maxTot) * 10000) / 100 : null;
        const row = d.students.find((x) => x.id === s.id);
        const resultText = has ? resultOfStudent(d, s.id, avgPct) : '';
        return `<tr>
          <td>${fa(pi * RESULTS_ROWS_PER_PAGE + i + 1)}</td>
          <td style="text-align:right;font-weight:700">${esc(row?.name || '')}</td>
          <td style="text-align:right">${esc(row?.father || '')}</td>
          <td style="text-align:right">${esc(row?.grandFather || '')}</td>
          <td>${fa(row?.rollNo ?? '')}</td>
          <td>${fa(row?.idNumber ?? '')}</td>
          <td style="font-weight:700">${has ? fmtScore(tot) : ''}</td>
          <td>${avgPct != null ? fa(avgPct) : ''}</td>
          <td style="font-weight:700">${esc(resultText)}</td>
          <td>${has ? letterOf(avgPct ?? 0, d.passMark ?? 40) : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>
    </div>`).join('');

  const body = `
    <div class="res-top">
      ${officialHeaderHtml(origin, schoolOverrides(d))}
    </div>
    <div class="res-info-row">
      <span>صنف: ${esc(d.className)}</span>
      <span>نوبت امتحان: ${esc(d.nubt || 'نوبت اول')}</span>
      <span>سال تعلیمی: ${esc(d.academicYear || '—')}</span>
      <span>تعداد شاگردان: ${fa(d.students.length)}</span>
      <span>تاریخ: ${esc(d.date || isoToJalaliDisplay(isoToday()) || '—')}</span>
    </div>
    <div class="res-stat-row">
      ${statBox('جدول نتایج جوارثی ماهی', mid, false)}
      ${statBox('جدول نتایج سالانه', ann, true)}
    </div>
    ${pages}
    <div class="mo-sign-row">
      <div class="mo-sign"><div class="line">امتحان‌نگران صنف</div></div>
      <div class="mo-sign"><div class="line">سرمعلم</div></div>
      <div class="mo-sign"><div class="line">مدیر مکتب</div></div>
    </div>
    <div class="mo-sign-row">
      <div class="mo-sign"><div class="line">ناظر معارف مربوطه</div></div>
      <div class="mo-sign"><div class="line">تأیید آمریت حوزه تعلیمی</div></div>
      <div class="mo-sign"><div class="line">تأیید ریاست معارف ولایت</div></div>
    </div>
    <p class="res-note">نتیجهٔ نهائی هر شاگرد به‌اساس اوسط مجموع نمرات و مقررات وزارت معارف تعیین گردیده — مشروط: ناکامی در ۱ الی ۳ مضمون با اوسط کافی؛ محروم: حاضری کمتر از ${fa(75)}٪.</p>`;

  const pageCss = `
    .res-info-row { display: flex; gap: 6px; margin: 6px 0; font-size: 11px; }
    .res-info-row span { border: 1.2px solid #000; padding: 2px 8px; font-weight: 700; }
    .res-stat-row { display: flex; gap: 10px; justify-content: flex-start; margin: 6px 0 8px; }
    .stat-box { width: 38%; font-size: 11px; }
    .stat-box .lbl { width: 55%; text-align: right; padding-inline-start: 6px; }
    .stat-box .val { width: 45%; }
    .res-page { page-break-after: always; }
    .res-page:last-child { page-break-after: auto; }
    .res-note { font-size: 9.5px; margin-top: 6px; color: #111; }
  `;
  return docShell(`جدول نتایج — ${d.className}`, 'landscape', body, pageCss);
}

/** نتیجهٔ کل شاگرد — مطابق مقررات: مشروط ۱-۳ مضمون ناکام با اوسط کافی */
function resultOfStudent(d: OfficialClassInput, studentId: string, avgPct: number | null): string {
  const passMark = d.passMark ?? 40;
  const minAvg = 50;
  let failed = 0;
  const ms = d.marks[studentId] || {};
  for (const sub of d.subjects) {
    const fin = ms[sub.id]?.final;
    // حد نصاب هر مضمون از ۱۰۰ — نمرهٔ نهائی کمتر از حد نصاب = ناکام در آن مضمون
    if (fin != null && fin < passMark) failed++;
  }
  if (avgPct == null) return '';
  if (avgPct < minAvg) return d.failLabel || 'ناکام';
  if (failed > 3) return d.failLabel || 'ناکام';
  if (failed >= 1) return 'مشروط';
  return d.passLabel || 'کامیاب';
}

/* ─────────────── ۳) اطلاع‌نامهٔ رسمی نمرات شاگرد ─────────────── */

export function buildOfficialNoticeHtml(d: OfficialClassInput, origin = '', onlyStudentId?: string): string {
  const pm = d.periodMax || { MIDTERM: 40, ANNUAL: 60 };
  const students = onlyStudentId ? d.students.filter((s) => s.id === onlyStudentId) : d.students;

  const bandRows = `
    <table class="band-table"><thead><tr><th>درجه</th><th>نتیجه</th><th>توضیحات</th></tr></thead><tbody>
      <tr><td>الف</td><td>کامیاب</td><td style="text-align:right">اوسط مجموع نمرات از ۹۰ الی ۱۰۰ — ارتقا به صنف بالاتر</td></tr>
      <tr><td>ب</td><td>کامیاب</td><td style="text-align:right">اوسط مجموع نمرات از ۷۵ الی ۸۹.۹۹</td></tr>
      <tr><td>ج</td><td>کامیاب</td><td style="text-align:right">اوسط مجموع نمرات از ۶۰ الی ۷۴.۹۹</td></tr>
      <tr><td>د</td><td>کامیاب</td><td style="text-align:right">اوسط مجموع نمرات از ۵۰ الی ۵۹.۹۹</td></tr>
      <tr><td>هـ</td><td>ناکام</td><td style="text-align:right">اوسط مجموع نمرات کمتر از ۵۰ — تکرار صنف</td></tr>
      <tr><td>—</td><td>مشروط</td><td style="text-align:right">ناکامی در ۱ تا ۳ مضمون با اوسط کافی — حد نصاب هر مضمون ${fa(d.passMark ?? 40)}</td></tr>
      <tr><td>—</td><td>محروم</td><td style="text-align:right">حاضری کمتر از ۷۵٪ — بدون حق امتحان</td></tr>
    </tbody></table>`;

  const pages = students.map((s, idx) => {
    const ms = d.marks[s.id] || {};
    let totMid = 0, totAnn = 0, totFin = 0, hasAny = false;
    const subjectRows = d.subjects.map((sub, i) => {
      const m = ms[sub.id] || {};
      const mid = m.midterm ?? null;
      const an = m.annual ?? null;
      const fin = m.final ?? null;
      if (fin != null) hasAny = true;
      if (mid != null) totMid += mid;
      if (an != null) totAnn += an;
      if (fin != null) totFin += fin;
      return `<tr>
        <td>${fa(i + 1)}</td>
        <td style="text-align:right;font-weight:700">${esc(sub.name)}</td>
        <td style="width:18%">${fmtScore(mid, pm.MIDTERM)}</td>
        <td style="width:18%">${fmtScore(an, pm.ANNUAL)}</td>
        <td style="width:18%;font-weight:700">${fmtScore(fin)}</td>
      </tr>`;
    }).join('');
    const maxTot = d.subjects.length * (pm.MIDTERM + pm.ANNUAL);
    const avgPct = hasAny && maxTot > 0 ? Math.round((totFin / maxTot) * 10000) / 100 : null;
    const resultText = hasAny ? resultOfStudent(d, s.id, avgPct) : '';
    const letter = hasAny ? letterOf(avgPct ?? 0, d.passMark ?? 40) : '';

    return `<div class="notice-page${idx < students.length - 1 ? ' page-break' : ''}">
      ${officialHeaderHtml(origin, schoolOverrides(d))}
      <div class="notice-grid">
        <div class="notice-main">
          <div class="notice-info-row">
            <table class="info-table"><tbody>
              <tr><td class="lbl">شعبه</td><td>${esc(d.branch || '')}</td><td class="lbl">نمبر صنف</td><td>${esc(d.className)}</td></tr>
              <tr><td class="lbl">شمارهٔ فلی</td><td></td><td class="lbl">نمبر اساسی</td><td>${fa(s.rollNo ?? '')}</td></tr>
              <tr><td class="lbl">نام</td><td colspan="3" style="font-weight:700">${esc(s.name)}</td></tr>
              <tr><td class="lbl">نام پدر</td><td colspan="3">${esc(s.father)}</td></tr>
              <tr><td class="lbl">نام پدر کلان</td><td colspan="3">${esc(s.grandFather || '')}</td></tr>
              <tr><td class="lbl">نمبر تذکره</td><td colspan="3">${fa(s.idNumber ?? '')}</td></tr>
            </tbody></table>
            <table class="reply-table"><thead><tr><th>جوارثی ماهی</th><th>سالانه</th><th>جمع نمره‌ها</th></tr></thead><tbody>
              <tr><td>${hasAny ? fmtScore(totMid) : ''}</td><td>${hasAny ? fmtScore(totAnn) : ''}</td><td style="font-weight:700">${hasAny ? fmtScore(totFin) : ''}</td></tr>
              <tr><td colspan="3" class="moy">اوسط: ${avgPct != null ? fa(avgPct) + '٪' : '—'}</td></tr>
            </tbody></table>
          </div>
          <div class="notice-title">اطلاع‌نامه</div>
          <table class="sub-table"><thead><tr><th style="width:8%">شماره</th><th>مضمون</th><th style="width:18%">جوارثی ماهی</th><th style="width:18%">سالانه</th><th style="width:18%">جمع نمره‌ها</th></tr></thead><tbody>${subjectRows}</tbody>
            <tfoot><tr>
              <td colspan="2" style="text-align:right;font-weight:700">مجموع نمرات</td>
              <td>${hasAny ? fmtScore(totMid) : ''}</td><td>${hasAny ? fmtScore(totAnn) : ''}</td>
              <td style="font-weight:700">${hasAny ? fmtScore(totFin) : ''}</td>
            </tr>
            <tr><td colspan="2" style="text-align:right;font-weight:700">نتیجه و درجه</td>
              <td colspan="2" style="font-weight:700">${esc(resultText)} ${letter ? `— ${esc(letter)}` : ''}</td>
              <td>${avgPct != null ? fa(avgPct) + '٪' : ''}</td>
            </tr></tfoot>
          </table>
        </div>
        <div class="notice-side">
          ${bandRows}
          <table class="mashy"><tbody>
            <tr><td style="text-align:right;font-weight:700">مشی سالانه</td><td>${esc(d.academicYear || '')}</td></tr>
            <tr><td style="text-align:right;font-weight:700">مشی جوارثی ماهی</td><td>${esc(d.nubt || '')}</td></tr>
          </tbody></table>
          <div class="rules-note">
            <b>مقررات نمره‌دهی وزارت معارف:</b>
            نمرهٔ نهائی هر مضمون از ۱۰۰ — جوارثی ماهی از ${fa(d.periodMax?.MIDTERM ?? 40)} (تحریری + تقریری) و سالانه از ${fa(d.periodMax?.ANNUAL ?? 60)} (تحریری + تقریری)؛
            حد نصاب کامیابی هر مضمون ${fa(d.passMark ?? 40)}؛ اوسط ارتقا به صنف بالاتر ${fa(50)}٪؛
            ناکامی در ۱ الی ۳ مضمون با اوسط کافی = مشروط؛ حاضری کمتر از ${fa(75)}٪ = محروم از امتحان.
          </div>
        </div>
      </div>
      <div class="mo-sign-row">
        <div class="mo-sign"><div class="line">امضای نگران صنف</div></div>
        <div class="mo-sign"><div class="line">امضای سرمعلم</div></div>
        <div class="mo-sign"><div class="line">امضای مدیر مکتب</div></div>
        <div class="mo-sign"><div class="line">امضای والد شاگرد</div></div>
      </div>
      <p class="notice-note">نتایج این اطلاع‌نامه به مدت پانزده روز از تاریخ نشر، به منظور اعتراض والدین و رفع اشتباه احتمالی، نگاه‌داری می‌شود.</p>
    </div>`;
  }).join('');

  const pageCss = `
    .page-break { page-break-after: always; }
    .notice-page:last-child { page-break-after: auto; }
    .notice-grid { display: flex; gap: 8px; margin-top: 6px; }
    .notice-main { flex: 1.35; }
    .notice-side { flex: 1; }
    .notice-info-row { display: flex; gap: 6px; }
    .info-table { flex: 1.3; font-size: 10.5px; }
    .info-table .lbl { width: 26%; font-weight: 700; text-align: right; padding-inline-start: 4px; }
    .reply-table { flex: 1; font-size: 10.5px; }
    .reply-table .moy { font-weight: 700; }
    .notice-title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 2px; margin: 8px 0 6px; }
    .band-table { font-size: 10px; width: 100%; }
    .band-table th, .band-table td { padding: 2px 4px; }
    .mashy { font-size: 10.5px; margin-top: 8px; }
    .rules-note { border: 1.2px solid #000; padding: 5px 7px; font-size: 9.5px; line-height: 1.85; text-align: justify; margin-top: 8px; }
    .notice-note { font-size: 9.5px; margin-top: 8px; text-align: center; color: #111; }
    .sub-table tfoot td { font-size: 11px; }
  `;
  return docShell(`اطلاع‌نامهٔ نمرات — ${d.className}`, 'portrait', pages, pageCss);
}

/* ─────────────── ۴) نسخه‌های Excel ─────────────── */

/** ورق نشریه به اکسل — ساختار سند: سطرها مضامین، ستون‌ها شاگردان (همهٔ شاگردان در یک جدول) */
export function gradeSheetExcel(d: OfficialClassInput): string {
  const studs = d.students;
  const head = `
    <tr><th>مضمون / معلومات</th>${studs.map((s) => `<th colspan="3">${esc(s.name)} — فرزند ${esc(s.father)}${s.grandFather ? ` — ${esc(s.grandFather)}` : ''}</th>`).join('')}</tr>
    <tr><th>نوبت امتحان</th>${studs.map(() => `<th>نوبت اول — جمع</th><th>نوبت دوم — جمع</th><th>نوبت سوم — جمع</th>`).join('')}</tr>`;
  const subjectRows = d.subjects.map((sub) => `<tr><th style="text-align:right">${esc(sub.name)}</th>${studs.map((s) => {
    const m = d.marks[s.id]?.[sub.id];
    return `<td>${m?.midterm ?? ''}</td><td>${m?.annual ?? ''}</td><td>${m?.final ?? ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<table>${head}${subjectRows}</table>`;
}

/** خلیجدول به اکسل — همان ستون‌های سند */
export function resultsTableExcel(d: OfficialClassInput): string {
  const pm = d.periodMax || { MIDTERM: 40, ANNUAL: 60 };
  const maxTot = d.subjects.length * (pm.MIDTERM + pm.ANNUAL);
  const rows = d.students.map((s, i) => {
    const ms = d.marks[s.id] || {};
    const tot = d.subjects.reduce((acc, sub) => acc + (ms[sub.id]?.final ?? 0), 0);
    const has = d.subjects.some((sub) => ms[sub.id]?.final != null);
    const avgPct = has && maxTot > 0 ? Math.round((tot / maxTot) * 10000) / 100 : null;
    return `<tr>
      <td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>${esc(s.grandFather || '')}</td>
      <td>${s.rollNo ?? ''}</td><td>${esc(s.idNumber || '')}</td>
      <td>${has ? tot : ''}</td><td>${avgPct ?? ''}</td><td>${esc(resultOfStudent(d, s.id, avgPct))}</td>
      <td>${has ? letterOf(avgPct ?? 0, d.passMark ?? 40) : ''}</td>
    </tr>`;
  }).join('');
  return `<table><thead><tr>
    <th>شماره</th><th>نام</th><th>نام پدر</th><th>نام پدر کلان</th><th>نمبر اساسی</th>
    <th>نمبر تذکره</th><th>مجموعه نمرات</th><th>وسط</th><th>نتیجه</th><th>درجه</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

/** اطلاع‌نامه‌های صنف به اکسل — یک سطر برای هر شاگرد با سه ستون برای هر مضمون */
export function noticesExcel(d: OfficialClassInput): string {
  const pm = d.periodMax || { MIDTERM: 40, ANNUAL: 60 };
  const head1 = `<tr><th rowspan="2">شماره</th><th rowspan="2">نام</th><th rowspan="2">نام پدر</th><th rowspan="2">نام پدر کلان</th><th rowspan="2">نمبر تذکره</th>${d.subjects.map((s) => `<th colspan="3">${esc(s.name)}</th>`).join('')}<th rowspan="2">مجموع نمرات</th><th rowspan="2">اوسط</th><th rowspan="2">نتیجه</th><th rowspan="2">درجه</th></tr>
  <tr>${d.subjects.map(() => `<th>جوارثی ماهی (${pm.MIDTERM})</th><th>سالانه (${pm.ANNUAL})</th><th>جمع</th>`).join('')}</tr>`;
  const maxTot = d.subjects.length * (pm.MIDTERM + pm.ANNUAL);
  const rows = d.students.map((s, i) => {
    const ms = d.marks[s.id] || {};
    const tot = d.subjects.reduce((acc, sub) => acc + (ms[sub.id]?.final ?? 0), 0);
    const has = d.subjects.some((sub) => ms[sub.id]?.final != null);
    const avgPct = has && maxTot > 0 ? Math.round((tot / maxTot) * 10000) / 100 : null;
    const cells = d.subjects.map((sub) => {
      const m = ms[sub.id] || {};
      return `<td>${m.midterm ?? ''}</td><td>${m.annual ?? ''}</td><td>${m.final ?? ''}</td>`;
    }).join('');
    return `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.father)}</td><td>${esc(s.grandFather || '')}</td><td>${esc(s.idNumber || '')}</td>${cells}<td>${has ? tot : ''}</td><td>${avgPct ?? ''}</td><td>${esc(resultOfStudent(d, s.id, avgPct))}</td><td>${has ? letterOf(avgPct ?? 0, d.passMark ?? 40) : ''}</td></tr>`;
  }).join('');
  return `<table>${head1}${rows}</table>`;
}

/* ─────────────── ۵) چاپ و خروجی مرورگر ─────────────── */

export function printGradeSheet(d: OfficialClassInput) {
  printRawHtml(`ورق نشریهٔ نمرات — ${d.className}`, buildGradeSheetHtml(d));
}
export function printOfficialResults(d: OfficialClassInput) {
  printRawHtml(`جدول نتایج — ${d.className}`, buildOfficialResultsHtml(d));
}
export function printOfficialNotices(d: OfficialClassInput, onlyStudentId?: string) {
  printRawHtml(`اطلاع‌نامهٔ نمرات — ${d.className}`, buildOfficialNoticeHtml(d, '', onlyStudentId));
}
export function excelGradeSheet(d: OfficialClassInput) {
  exportExcel(`ورق نشریهٔ نمرات — ${d.className}`, gradeSheetExcel(d), `ورق-نشریه-${d.className}-${fileStamp()}`, { plain: true });
}
export function excelOfficialResults(d: OfficialClassInput) {
  exportExcel(`جدول نتایج — ${d.className}`, resultsTableExcel(d), `جدول-نتایج-${d.className}-${fileStamp()}`, { plain: true });
}
export function excelOfficialNotices(d: OfficialClassInput) {
  exportExcel(`اطلاع‌نامه‌ها — ${d.className}`, noticesExcel(d), `اطلاعنامه-${d.className}-${fileStamp()}`, { plain: true });
}
