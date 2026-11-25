'use client';

/* ─────────────── کارت هویت آویزان شاگردان و معلمین — با QR کد ───────────────
 * عین طرح رسمی نمونه: کارت عمودی ۵×۹ سانتی‌متر (۵۰×۹۰mm)، لوگو و نام دو‌زبانهٔ مکتب،
 * روبان طلایی «کارت هویت»، عکس وسط با قاب آبی، فهرست نقطه‌دار مشخصات، امضای اداره،
 * QR «کد حاضری» و نوار آدرس و تلفن در پایین.
 * چاپ: کاغذ A4 عمودی (پیش‌فرض همهٔ چاپگرها) با شبکهٔ ۱۰ کارتی چرخیده ۹۰° — ۲×۵ — با خطوط برش. */

import QRCode from 'qrcode';
import { jalaliNowDisplay, toPersianDigits } from '@/lib/jalali';
import { printRawHtml } from './exports';
import { apiSend } from '@/lib/client/api';
import { SIGN_STAMP_DATA_URL } from './sign-stamp-data';

/* ─── انواع ورودی ─── */

export interface IdCardSchoolInfo {
  name: string;
  /** نام انگلیسی مکتب — زیر نام فارسی چاپ می‌شود */
  nameEn: string;
  logo: string; // dataURL یا مسیر لوگو
  /** آدرس فارسی — مثال: کابل، افغانستان */
  address: string;
  /** آدرس انگلیسی — مثال: Kabul, Afghanistan */
  addressEn: string;
  /** تلفن مکتب — انگلیسی/ساده */
  phone: string;
  academicYear: string;
  /** تاریخ صدور کارت‌ها — جلالی؛ در زمان چاپ یکسان */
  issueDate?: string;
}

export interface IdCardStudent {
  id: string;
  name: string;
  father: string;
  className: string;
  rollNo?: number | null;
  baseNumber?: string | null;
  photo?: string | null;
}

export interface IdCardStaff {
  id: string;
  name: string;
  father?: string | null;
  position: string;
  photo?: string | null;
}

/** کارت آمادهٔ چاپ — یکپارچهٔ شاگرد/کارمند */
export interface IdCardData {
  kind: 'student' | 'staff';
  id: string;
  name: string;
  father: string;
  /** سطر مشخصهٔ اصلی — صنف یا سمت */
  line1: string;
  /** شمارهٔ کارت — مثال 1405-012 */
  cardNo: string;
  photo?: string | null;
}

/** تبدیل ارقام فارسی/عربی به لاتین — برای ساخت شمارهٔ کارت از سال تعلیمی */
function faDigitsToLatin(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

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

/** شمارهٔ کارت شاگرد — نمبر اساس، یا سال-شمارهٔ حاضری، یا شناسهٔ کوتاه */
function studentCardNo(s: IdCardStudent, academicYear: string): string {
  if (s.baseNumber && s.baseNumber.trim()) return s.baseNumber.trim();
  const y = (faDigitsToLatin(academicYear).match(/\d{4}/) || [''])[0];
  if (s.rollNo != null && y) return `${y}-${String(s.rollNo).padStart(3, '0')}`;
  if (y) return `${y}-${faDigitsToLatin(String(s.id).slice(-4)).replace(/\D/g, '') || '000'}`;
  return faDigitsToLatin(String(s.id).slice(-8));
}

function staffCardNo(t: IdCardStaff): string {
  return `T-${String(t.id).slice(-4).toUpperCase()}`;
}

/* ─── شکل شاگرد/کارمند به کارت یکپارچه ─── */

export function studentToCard(s: IdCardStudent, academicYear = ''): IdCardData {
  return {
    kind: 'student',
    id: s.id,
    name: s.name,
    father: s.father,
    line1: s.className || '',
    cardNo: studentCardNo(s, academicYear),
    photo: s.photo,
  };
}

export function staffToCard(t: IdCardStaff): IdCardData {
  return {
    kind: 'staff',
    id: t.id,
    name: t.name,
    father: t.father || '',
    line1: t.position || '',
    cardNo: staffCardNo(t),
    photo: t.photo,
  };
}

/* ─── محتوای QR — امنیت مرحلهٔ ۲ ───
 * QR هرگز اطلاعات شخصی (نام/ولد/صنف) حمل نمی‌کند؛ توکن امضاشدهٔ سرور است که فقط
 * از طریق /api/qr پس از اعتبارسنجی سمت سرور به اطلاعات محدود می‌رسد.
 * در نبود توکن (آفلاین) فقط شمارهٔ سریال کارت — که روی خود کارت چاپ شده — قرار می‌گیرد. */
export function idCardQrPayload(c: IdCardData): string {
  return `NOQ-CARD:${c.cardNo}`;
}

/** گرفتن توکن‌های امن QR از سرور — ناکامی (آفلاین) → undefined و fallback به شمارهٔ کارت */
export async function fetchIdCardTokens(cards: IdCardData[]): Promise<Map<string, string> | undefined> {
  try {
    const items = cards.slice(0, 500).map((c) => ({ kind: c.kind, id: c.id }));
    const res = await apiSend<{ tokens: Record<string, string> }>('/api/qr', 'POST', { action: 'issue', items });
    const tokens = res.data?.tokens || {};
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(tokens)) if (typeof v === 'string' && v) map.set(k, v);
    return map.size ? map : undefined;
  } catch {
    return undefined;
  }
}

/** امنیت — فقط dataURL تصویر معتبر وارد قالب چاپ می‌شود (ضد تزریق در src) */
const IMG_DATA_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function safeImg(v: string | null | undefined, max = 600_000): string {
  if (!v) return '';
  const s = v.trim();
  return s.length <= max && IMG_DATA_RE.test(s) ? s : '';
}

/** QR به‌صورت dataURL PNG — کیفیت بالا برای چاپ */
export async function idCardQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 420,
    errorCorrectionLevel: 'L',
    color: { dark: '#10131a', light: '#ffffff' },
  });
}

/* ─── استایل مشترک سند کارت‌ها ─── */

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

const FONT_FACE = `
  @font-face { font-family: 'Vazirmatn'; src: url('${ORIGIN}/fonts/Vazirmatn-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Vazirmatn'; src: url('${ORIGIN}/fonts/Vazirmatn-Medium.woff2') format('woff2'); font-weight: 500; }
  @font-face { font-family: 'Vazirmatn'; src: url('${ORIGIN}/fonts/Vazirmatn-Bold.woff2') format('woff2'); font-weight: 700; }
`;

/* طرح کارت ۵۰×۹۰mm — عین نمونهٔ رسمی */
const CARDS_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; background: #eef1f6; }
  .sheet-note { max-width: 262mm; margin: 0 auto 1.6mm; display: flex; justify-content: space-between; align-items: center;
    font-size: 6.4pt; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; }
  .sheet-note b { color: #10214f; }
  .grid { display: grid; grid-template-columns: repeat(5, 50mm); grid-auto-rows: 90mm; gap: 2mm 3mm; justify-content: center; }
  .cellwrap { position: relative; }
  @media print { .sheet-note { display: none; } }
  /* خط برش دور هر کارت */
  .cut { position: absolute; inset: -.9mm; border: 1px dashed #94a3b8; pointer-events: none; }

  /* ─── خود کارت (۵۰×۹۰ میلی‌متر — عمودی) ─── */
  .card { width: 50mm; height: 90mm; position: relative; overflow: hidden; border-radius: 2.6mm;
    background: linear-gradient(165deg, #f9fbff 0%, #f1f5fc 55%, #e9eefa 100%);
    border: 1px solid #c3cbda; display: flex; flex-direction: column; }
  /* تزئینات مورب گوشه‌ها — عین نمونه */
  .deco { position: absolute; z-index: 0; }
  .deco-tl1 { top: -9mm; left: -7mm; width: 26mm; height: 5.2mm; background: #f39c2d; transform: rotate(-45deg); border-radius: 1mm; }
  .deco-tl2 { top: -4mm; left: -12mm; width: 30mm; height: 1.6mm; background: #3aa655; transform: rotate(-45deg); }
  .deco-tl3 { top: -14mm; left: -4mm; width: 34mm; height: 4.6mm; background: #1d3f8f; transform: rotate(-45deg); border-radius: 1mm; }
  .deco-tr1 { top: -5mm; right: -11mm; width: 24mm; height: 4mm; background: #f39c2d; transform: rotate(45deg); border-radius: 1mm; }
  .deco-tr2 { top: 1mm; right: -6mm; width: 18mm; height: 1.3mm; background: #1d3f8f; transform: rotate(45deg); }
  .deco-bl1 { bottom: 8mm; left: -12mm; width: 30mm; height: 3.6mm; background: #1d3f8f; transform: rotate(-45deg); border-radius: 1mm; }
  .deco-bl2 { bottom: 10.5mm; left: -9mm; width: 22mm; height: 1.3mm; background: #f39c2d; transform: rotate(-45deg); }
  .dots { position: absolute; z-index: 0; top: 6mm; left: 2.5mm; width: 13mm; height: 20mm; opacity: .5;
    background-image: radial-gradient(#b9cbe6 .38mm, transparent .38mm); background-size: 2.2mm 2.2mm; }
  .dots2 { position: absolute; z-index: 0; bottom: 22mm; right: 2mm; width: 12mm; height: 14mm; opacity: .45;
    background-image: radial-gradient(#b9cbe6 .34mm, transparent .34mm); background-size: 2.1mm 2.1mm; }

  .inner { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; align-items: center; padding: 1mm 3mm 0; }

  /* سربرگ */
  .logo { width: 10mm; height: 10mm; border-radius: 50%; background: #fff; object-fit: cover;
    border: .55mm solid #1d3f8f; box-shadow: 0 .4mm 1.2mm rgba(16,33,79,.22); margin-top: .8mm; }
  .sname { font-size: 8.6pt; font-weight: 700; color: #10214f; line-height: 1.15; margin-top: .5mm; white-space: nowrap; }
  .sname-en { font-size: 5pt; font-weight: 700; color: #1d3f8f; letter-spacing: .45px; margin-top: .2mm; direction: ltr; white-space: nowrap; }
  /* روبان با بال‌های طلایی */
  .ribbon { position: relative; margin-top: .9mm; background: linear-gradient(180deg, #2a55b1 0%, #16306f 100%);
    border: .42mm solid #d8b13c; color: #fff; font-size: 6.4pt; font-weight: 700; padding: .7mm 4.5mm; border-radius: 1.1mm; white-space: nowrap; }
  .ribbon::before, .ribbon::after { content: ''; position: absolute; top: 1.3mm; width: 5mm; height: 3.4mm;
    background: linear-gradient(180deg, #e2c14f, #c9a227); z-index: -1; }
  .ribbon::before { left: -3.6mm; transform: skewY(-14deg); border-radius: .6mm 0 0 .6mm; }
  .ribbon::after { right: -3.6mm; transform: skewY(14deg); border-radius: 0 .6mm .6mm 0; }
  .year-l { font-size: 5.2pt; color: #334155; margin-top: .5mm; font-weight: 500; white-space: nowrap; }

  /* عکس وسط با قاب آبی */
  .photo { width: 17mm; height: 20mm; background: #fff; border: .5mm solid #1d3f8f; border-radius: 1.8mm;
    overflow: hidden; margin-top: 1mm; box-shadow: 0 .4mm 1mm rgba(16,33,79,.18); display: flex; align-items: center; justify-content: center; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .photo .initial { font-size: 11pt; font-weight: 700; color: #1d3f8f; }

  /* فهرست مشخصات نقطه‌دار */
  .rows { width: 100%; margin-top: 1mm; }
  .irow { display: flex; align-items: center; gap: 1.1mm; padding: .25mm 0; font-size: 6pt; color: #1e293b; }
  .irow .dot { width: 1.5mm; height: 1.5mm; border-radius: 50%; flex-shrink: 0; }
  .irow .dot.o { background: #f39c2d; }
  .irow .dot.b { background: #2a55b1; }
  .irow .k { font-weight: 700; color: #10214f; white-space: nowrap; }
  .irow .v { font-weight: 500; white-space: nowrap; }
  .irow .v.num { direction: ltr; unicode-bidi: embed; }

  /* امضای اداره + QR کد حاضری */
  .botrow { width: 100%; display: flex; align-items: flex-end; justify-content: space-between; margin-top: auto; padding-bottom: 2mm; gap: 2mm; }
  .sig { flex: 1; text-align: center; padding-left: 1.5mm; }
  .sig-l { font-size: 5.4pt; font-weight: 700; color: #10214f; margin-bottom: .6mm; }
  .signstamp { width: 16mm; display: block; margin: 0 auto; }
  .qrside { text-align: center; flex-shrink: 0; }
  .qrside img { width: 13.5mm; height: 13.5mm; display: block; background: #fff; padding: .5mm; border: .3mm solid #dbe2ee; border-radius: .9mm; }
  .qr-l { font-size: 5pt; font-weight: 700; color: #10214f; margin-top: .5mm; }

  /* نوار آدرس و تلفن — پایین کارت */
  .foot { position: relative; z-index: 1; background: linear-gradient(90deg, #16306f 0%, #1d3f8f 50%, #16306f 100%);
    border: .42mm solid #d8b13c; border-radius: 1.6mm; text-align: center; padding: .55mm 1mm .65mm;
    margin: 0 4.2mm 4.2mm; }
  .foot .f1 { font-size: 5.4pt; font-weight: 700; color: #f7df8e; white-space: nowrap; }
  .foot .f2 { font-size: 4.7pt; font-weight: 500; color: #f39c2d; direction: ltr; white-space: nowrap; margin-top: .25mm; }

  @page { size: A4 portrait; margin: 2mm 3mm; }
  @media screen { body { padding: 12px; } }
`;

/* ─── رندر یک کارت ─── */

function cardHtml(c: IdCardData, school: IdCardSchoolInfo, qr: string, issueDate: string): string {
  const kindLabel = c.kind === 'student' ? 'کارت هویت شاگرد' : 'کارت هویت کارمند';
  const photoSrc = safeImg(c.photo);
  const photo = photoSrc
    ? `<img src="${photoSrc}" alt=""/>`
    : `<div class="initial">${esc(c.name.trim().charAt(0) || '؟')}</div>`;
  const logoSrc = safeImg(school.logo);
  const rows: Array<[string, string, boolean]> = [
    ['نام', c.name, false],
    ['ولد', c.father, false],
    [c.kind === 'student' ? 'صنف' : 'وظیفه', c.line1, false],
    ['شمارهٔ کارت', c.cardNo, true],
    ['تاریخ صدور', issueDate, false],
  ];
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(([k, v, num], i) =>
      `<div class="irow"><span class="dot ${i % 2 === 0 ? 'o' : 'b'}"></span><span class="k">${k}:</span><span class="v${num ? ' num' : ''}">${esc(v)}</span></div>`)
    .join('');
  const phoneFa = school.phone ? ` | تلفن: ${fa(school.phone)}` : '';
  const phoneEn = school.phone ? ` | Tel: ${school.phone}` : '';
  return `<div class="card">
  <div class="deco deco-tl1"></div><div class="deco deco-tl2"></div><div class="deco deco-tl3"></div>
  <div class="deco deco-tr1"></div><div class="deco deco-tr2"></div>
  <div class="deco deco-bl1"></div><div class="deco deco-bl2"></div>
  <div class="dots"></div><div class="dots2"></div>
  <div class="inner">
    ${logoSrc ? `<img class="logo" src="${logoSrc}" alt=""/>` : '<div class="logo"></div>'}
    <div class="sname">${esc(school.name)}</div>
    <div class="sname-en">${esc(school.nameEn)}</div>
    <div class="ribbon">${kindLabel}</div>
    <div class="year-l">سال تعلیمی: ${esc(school.academicYear)}</div>
    <div class="photo">${photo}</div>
    <div class="rows">${rowsHtml}</div>
    <div class="botrow">
      <div class="qrside"><img src="${qr}" alt="QR"/><div class="qr-l">کد حاضری</div></div>
      <div class="sig"><div class="sig-l">امضای اداره</div><img class="signstamp" src="${SIGN_STAMP_DATA_URL}" alt=""/></div>
    </div>
  </div>
  <div class="foot">
    <div class="f1">${esc(school.address)}${phoneFa}</div>
    <div class="f2">${esc(school.addressEn)}${phoneEn}</div>
  </div>
</div>`;
}

/* ─── ساخت ورق کامل A4 افقی — ۱۰ کارت در هر صفحه ─── */

export async function buildIdCardsSheet(
  cards: IdCardData[],
  school: IdCardSchoolInfo,
  qrTokens?: Map<string, string>,
): Promise<string> {
  if (!qrTokens) qrTokens = await fetchIdCardTokens(cards);
  const issueDate = school.issueDate || jalaliNowDisplay();
  const pages: string[] = [];
  const perPage = 10;
  const totalPages = Math.ceil(cards.length / perPage);
  for (let p = 0; p < totalPages; p++) {
    const slice = cards.slice(p * perPage, (p + 1) * perPage);
    const cells: string[] = [];
    for (const c of slice) {
      const qr = await idCardQrDataUrl(qrTokens?.get(`${c.kind}:${c.id}`) || idCardQrPayload(c));
      cells.push(`<div class="cellwrap"><div class="cut"></div>${cardHtml(c, school, qr, issueDate)}</div>`);
    }
    pages.push(`<section class="page">
      <div class="sheet-note"><b>کارت‌های هویت — ${esc(school.name)}</b>
        <span>سال تعلیمی ${esc(school.academicYear)} • تاریخ صدور: ${esc(issueDate)} • صفحهٔ ${fa(p + 1)} از ${fa(totalPages)} • خط‌چین = محل قیچی</span></div>
      <div class="grid-rot"><div class="grid">${cells.join('')}</div></div>
    </section>`);
  }
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>کارت‌های هویت</title><style>${FONT_FACE}${CARDS_CSS}
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
@media print {
  .sheet-note { display: none; }
  html, body { overflow: hidden; }
  .page { position: relative; width: 198mm; height: 277mm; overflow: hidden; margin: 0 auto; }
  /* چینش چاپ: کاغذ عمودی (پیش‌فرض اندروید که @page landscape را نادیده می‌گیرد) با
     خانه‌های افقی ۹۰×۵۰ و چرخش ۹۰° هر کارت — ۲ ستون × ۵ ردیف = ۱۰ کارت در هر ورق.
     هیچ سرریز چیدمانی وجود ندارد تا چاپگر مقیاس را تغییر ندهد (۱:۱ واقعی) */
  .grid { display: grid; grid-template-columns: 90mm 90mm; grid-auto-rows: 50mm; gap: 2mm; justify-content: center; margin-top: 8mm; }
  .cellwrap { width: 90mm; height: 50mm; position: relative; }
  .card { position: absolute; top: -20mm; left: 20mm; transform: rotate(90deg); transform-origin: 25mm 45mm; }
}
</style></head><body>${pages.join('')}</body></html>`;
}

/* ─── چاپ مستقیم ─── */

export async function printIdCards(cards: IdCardData[], school: IdCardSchoolInfo): Promise<void> {
  const html = await buildIdCardsSheet(cards, school);
  printRawHtml('کارت‌های هویت', html);
}
