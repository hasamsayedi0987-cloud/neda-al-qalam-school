'use client';

/**
 * ابزارهای خروجی: چاپ/PDF، Word و Excel — همه به‌صورت محلی و آفلاین کار می‌کنند.
 *
 * نسخهٔ ۳.۴.۰:
 *  - فونت واقعی Vazirmatn با @font-face داخل سند تزریق می‌شود تا PDF با حروف فارسی/دری
 *    یکسان با اپ چاپ شود (قبلاً fallback به Tahoma می‌رفت)
 *  - لوگوها و خطوط سربرگ رسمی از تنظیمات مکتب می‌آیند (schoolLogo / emblemLogo / govHeader…)
 *  - جهت کاغذ (portrait / landscape) برای هر سند قابل انتخاب است
 *  - اسناد رسمی وزارت معارف (ورق نشریه، خلیجدول، اطلاع‌نامه) در official-docs.ts
 */

const FONT_CSS = `
  @font-face { font-family: 'Vazirmatn'; src: url('$ORIGIN/fonts/Vazirmatn-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Vazirmatn'; src: url('$ORIGIN/fonts/Vazirmatn-Medium.woff2') format('woff2'); font-weight: 500; }
  @font-face { font-family: 'Vazirmatn'; src: url('$ORIGIN/fonts/Vazirmatn-Bold.woff2') format('woff2'); font-weight: 700; }
`;

const BASE_CSS = `
  ${FONT_CSS.replace(/\$ORIGIN/g, typeof window !== 'undefined' ? window.location.origin : '')}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif; direction: rtl; color: #1a2e22; padding: 24px; }
  .doc-header { text-align: center; margin-bottom: 18px; border-bottom: 3px double #047857; padding-bottom: 12px; }
  .doc-header .logo-row { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .doc-header img { width: 72px; height: 72px; }
  .doc-header h1 { font-size: 20px; color: #047857; }
  .doc-header h2 { font-size: 15px; color: #374151; font-weight: 500; margin-top: 4px; }
  .doc-title { text-align: center; font-size: 17px; font-weight: 700; margin: 14px 0; color: #065f46;
    border: 1.5px solid #047857; border-radius: 8px; padding: 8px 16px; display: inline-block; }
  .doc-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: #374151; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #6b7280; padding: 5px 6px; text-align: center; }
  th { background: #d1fae5; color: #064e3b; font-weight: 700; }
  tr:nth-child(even) td { background: #f0fdf4; }
  .pass { color: #047857; font-weight: 700; }
  .fail { color: #b91c1c; font-weight: 700; }
  .doc-footer { margin-top: 22px; display: flex; justify-content: space-between; font-size: 12.5px; color: #374151; }
  .sign-box { text-align: center; min-width: 130px; }
  .sign-line { margin-top: 34px; border-top: 1.5px dashed #6b7280; padding-top: 4px; }
  .note { font-size: 11.5px; color: #4b5563; margin-top: 10px; }
  @page { size: A4 landscape; margin: 12mm; }
`;

/** اطلاعات سربرگ اسناد — همه از تنظیمات مکتب (configureExports/app-shell تغذیه می‌شود) */
export interface ExportBrand {
  schoolName: string;
  schoolLogo?: string; // dataURL لوگوی مکتب — خالی = پیش‌فرض /logo.png
  emblemLogo?: string; // نشان وزارت معارف (dataURL) — خالی = بدون نشان
  govHeader?: string; // خط اول سربرگ (اسلامی امارت افغانستان)
  directorateLine?: string; // ریاست معارف …
  adminOffice?: string; // امریت حوزه تعلیمی …
  licenseNo?: string;
  province?: string;
  authority?: string;
  academicYear?: string;
  directorName?: string;
}

let brand: ExportBrand = { schoolName: 'مکتب خصوصی نداالقلم' };

/** تعیین برندینگ اسناد از تنظیمات — app-shell و نتایج صدا می‌زنند (سازگار با فراخوانی قبلی) */
export function configureExports(opts: Partial<ExportBrand> & { schoolName?: string; academicYear?: string }) {
  if (opts.schoolName && opts.schoolName.trim()) brand = { ...brand, ...opts, schoolName: opts.schoolName.trim() };
  else brand = { ...brand, ...opts, schoolName: brand.schoolName };
}

/** برندینگ جاری — برای اسناد رسمی و رفع نام هاردکد در سایر بخش‌ها */
export function exportBrand(): ExportBrand {
  return brand;
}

/** مسیر/منبع لوگوی مکتب برای سندها — تنظیمی یا پیش‌فرض */
export function schoolLogoSrc(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return brand.schoolLogo || `${origin}/logo.png`;
}

/** سربرگ رسمی سه‌مرکبی وزارت معارف — نشان دولت راست، لوگوی مکتب چپ، خطوط رسمی وسط
 *  (ترتیب و متن دقیقاً مطابق اسناد رسمی: خطوط از راست به چپ مرکزچین)
 *  overrides: سندهای رسمی نام/لوگوها را مستقیم از تنظیمات خود سند پاس می‌دهند —
 *  اگر پاس نشود از برندینگ ماژول (configureExports از app-shell) خوانده می‌شود */
export function officialHeaderHtml(origin = typeof window !== 'undefined' ? window.location.origin : '', overrides?: Partial<ExportBrand>): string {
  const brand = overrides ? { ...exportBrand(), ...overrides } : exportBrand();
  const gov = brand.govHeader?.trim() || 'اسلامی امارت افغانستان';
  const directorate = brand.directorateLine?.trim() || `ریاست معارف${brand.province ? ' ' + brand.province.trim() : ''}`;
  const office = brand.adminOffice?.trim() || '';
  const emblem = `<img src="${brand.emblemLogo || `${origin}/moe-emblem.png`}" alt="نشان وزارت معارف" style="height:86px" />`;
  const schoolLogo = `<img src="${brand.schoolLogo || `${origin}/logo.png`}" alt="لوگو" style="height:86px;max-width:110px" />`;
  return `<div class="mo-head">
    <div class="mo-head-emblem">${emblem}</div>
    <div class="mo-head-center">
      <p>${gov}</p>
      <p>وزارت معارف</p>
      <p>${directorate}</p>
      ${office ? `<p>${office}</p>` : ''}
      <p class="mo-head-school">${brand.schoolName}</p>
      ${brand.licenseNo ? `<p class="mo-head-license">جواز فعالیت: ${brand.licenseNo}</p>` : ''}
    </div>
    <div class="mo-head-logo">${schoolLogo}</div>
  </div>
  <style>
    .mo-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .mo-head-emblem, .mo-head-logo { width: 120px; text-align: center; flex-shrink: 0; }
    .mo-head-emblem img, .mo-head-logo img { object-fit: contain; }
    .mo-head-center { flex: 1; text-align: center; font-size: 13.5px; line-height: 1.7; font-weight: 700; color: #111827; }
    .mo-head-center p { margin: 0; }
    .mo-head-school { font-size: 17px !important; }
    .mo-head-license { font-size: 10.5px !important; font-weight: 400 !important; color: #374151 !important; }
  </style>`;
}

/** CSS مشترک اسناد رسمی وزارت معارف — قاب‌های سیاه، بدون رنگ‌بندی تزئینی، مطابق فرم کاغذی */
export const OFFICIAL_CSS = `
  ${FONT_CSS.replace(/\$ORIGIN/g, typeof window !== 'undefined' ? window.location.origin : '')}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; color: #000; padding: 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1.5px solid #000; text-align: center; padding: 2px 3px; font-size: 11.5px; }
  th { font-weight: 700; }
  .doc-title { text-align: center; font-size: 15px; font-weight: 700; }
  .mo-sign-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
  .mo-sign { flex: 1; text-align: center; font-size: 11px; }
  .mo-sign .line { margin-top: 26px; border-top: 1.2px solid #000; padding-top: 3px; font-weight: 700; }
`;

function buildDocument(title: string, bodyHtml: string, withLogo = true): string {
  const schoolName = brand.schoolName;
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS}</style></head>
<body>
  <div class="doc-header">
    <div class="logo-row">
      ${withLogo ? `<img src="${schoolLogoSrc()}" alt="لوگو" />` : ''}
      <div>
        <h1>${schoolName}</h1>
        <h2>سیستم مدیریت مکتب — نسخهٔ دیجیتال</h2>
      </div>
    </div>
  </div>
  ${bodyHtml}
</body></html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  // نام فایل برای WebView اندروید (DownloadListener) — فایل واقعی در Downloads ذخیره می‌شود
  (window as unknown as { __noqDownloadName?: string }).__noqDownloadName = filename;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/** چاپ / ذخیره به‌صورت PDF — orientation پویا (نسخهٔ ۳.۴.۰)؛ پیش‌فرض مطابق قبل landscape */
export function printDocument(title: string, bodyHtml: string, opts?: { orientation?: 'portrait' | 'landscape' }) {
  const orientation = opts?.orientation || 'landscape';
  const html = buildDocument(title, bodyHtml).replace(
    '@page { size: A4 landscape; margin: 12mm; }',
    `@page { size: A4 ${orientation}; margin: ${orientation === 'portrait' ? '10mm' : '12mm'}; }`,
  );
  printRawHtml(title, html);
}

/** چاپ HTML خام (سندهای رسمی که سربرگ و استایل خودشان را دارند) */
export function printRawHtml(title: string, html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '-10000px';
  iframe.style.width = '1100px';
  iframe.style.height = '800px';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => document.body.removeChild(iframe), 1500);
    }
  };
  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(doPrint, 350);
  } else {
    iframe.onload = () => setTimeout(doPrint, 350);
  }
}

/** خروجی Word (.doc) */
export function exportWord(title: string, bodyHtml: string, filename: string) {
  const html = buildDocument(title, bodyHtml, false);
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.doc') ? filename : `${filename}.doc`);
}

/** خروجی Excel (.xls — قابل بازکردن در اکسل و LibreOffice)
 *  opts.plain: استایل سیاه رسمی (اسناد وزارت معارف) به‌جای سبز اپ
 *  opts.orientation: معلومات صفحه در متادیتای HTML (برای باز شدن صحیح در اکسل) */
export function exportExcel(
  title: string,
  tableHtml: string,
  filename: string,
  opts?: { plain?: boolean },
) {
  const css = opts?.plain
    ? `table { border-collapse: collapse; font-family: Vazirmatn, Tahoma; direction: rtl; }
th, td { border: 1px solid #000; padding: 3px 5px; text-align: center; font-size: 12px; }
th { font-weight: bold; }`
    : `table { border-collapse: collapse; font-family: Vazirmatn, Tahoma; direction: rtl; }
th, td { border: 1px solid #666; padding: 4px 8px; text-align: center; font-size: 12px; }
th { background: #d1fae5; }`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" dir="rtl">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${title.slice(0, 28).replace(/[\\\/\?\*\[\]:]/g, '')}</x:Name>
<x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>${css}</style></head><body><h3>${title}</h3>${tableHtml}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

export function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
