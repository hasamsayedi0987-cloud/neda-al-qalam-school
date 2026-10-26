'use client';

/**
 * ابزارهای خروجی: چاپ/PDF، Word و Excel
 * همه به‌صورت محلی و آفلاین کار می‌کنند.
 */

const BASE_CSS = `
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

/** نام مدرسه از تنظیمات — به‌صورت پیش‌فرض نام رسمی */
let configuredSchoolName = 'مکتب خصوصی نداالقلم';

/** نام مدرسهٔ چاپ‌شده در سربرگ اسناد را از تنظیمات تعیین می‌کند (app-shell صدا می‌زند) */
export function configureExports(opts: { schoolName?: string; academicYear?: string }) {
  if (opts.schoolName && opts.schoolName.trim()) configuredSchoolName = opts.schoolName.trim();
}

function buildDocument(title: string, bodyHtml: string, withLogo = true): string {
  const schoolName = configuredSchoolName;
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS}</style></head>
<body>
  <div class="doc-header">
    <div class="logo-row">
      ${withLogo ? `<img src="${typeof window !== 'undefined' ? window.location.origin : ''}/logo.png" alt="لوگو" />` : ''}
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

/** چاپ / ذخیره به‌صورت PDF */
export function printDocument(title: string, bodyHtml: string) {
  const html = buildDocument(title, bodyHtml);
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

/** خروجی Excel (.xls — قابل بازکردن در اکسل و LibreOffice) */
export function exportExcel(title: string, tableHtml: string, filename: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" dir="rtl">
<head><meta charset="utf-8">
<style>
table { border-collapse: collapse; font-family: Vazirmatn, Tahoma; direction: rtl; }
th, td { border: 1px solid #666; padding: 4px 8px; text-align: center; font-size: 12px; }
th { background: #d1fae5; }
</style></head><body><h3>${title}</h3>${tableHtml}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

export function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
