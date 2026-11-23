'use client';

/* ─────────────── کارت هویت آویزان شاگردان و معلمین — با QR کد ───────────────
 * طراحی حرفه‌ای کارت آویزان (لانیارد): سوراخ بند در بالا، سربرگ سرمه‌ای با لوگو،
 * عکس، مشخصات، امضاء مدیر مکتب و QR قابل اسکن.
 * چاپ: ورق A4 افقی — ۱۰ کارت در هر صفحه (۲×۵) با خطوط برش. */

import QRCode from 'qrcode';
import { toPersianDigits } from '@/lib/jalali';
import { printRawHtml } from './exports';

/* ─── انواع ورودی ─── */

export interface IdCardSchoolInfo {
  name: string;
  logo: string; // dataURL یا مسیر لوگو
  phone: string;
  academicYear: string;
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
  education?: string | null;
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
  /** سطر دوم — شمارهٔ حاضری یا واخد تعلیمی */
  line2: string;
  baseNumber?: string | null;
  photo?: string | null;
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

/** محتوای QR — متن ساخت‌یافتهٔ قابل خواندن پس از اسکن */
export function idCardQrPayload(c: IdCardData, school: IdCardSchoolInfo): string {
  const base = `مکتب: ${school.name}`;
  if (c.kind === 'student') {
    return `${base} | شاگرد: ${c.name} | پدر: ${c.father} | صنف: ${c.line1} | حاضری: ${c.line2}${c.baseNumber ? ` | اساس: ${c.baseNumber}` : ''} | شناسه: ${c.id}`;
  }
  return `${base} | کارمند: ${c.name} | سمت: ${c.line1} | شناسه: ${c.id}`;
}

/** QR به‌صورت dataURL PNG — کیفیت بالا برای چاپ */
export async function idCardQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 420,
    errorCorrectionLevel: 'L',
    color: { dark: '#10214f', light: '#ffffff' },
  });
}

/* ─── شکل شاگرد/کارمند به کارت یکپارچه ─── */

export function studentToCard(s: IdCardStudent): IdCardData {
  return {
    kind: 'student',
    id: s.id,
    name: s.name,
    father: s.father,
    line1: s.className || '',
    line2: s.rollNo != null ? fa(s.rollNo) : '',
    baseNumber: s.baseNumber,
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
    line2: t.education || '',
    photo: t.photo,
  };
}

/* ─── استایل مشترک سند کارت‌ها ─── */

const FONT_FACE = `
  @font-face { font-family: 'Vazirmatn'; src: url('${typeof window !== 'undefined' ? window.location.origin : ''}/fonts/Vazirmatn-Regular.woff2') format('woff2'); font-weight: 400; }
  @font-face { font-family: 'Vazirmatn'; src: url('${typeof window !== 'undefined' ? window.location.origin : ''}/fonts/Vazirmatn-Medium.woff2') format('woff2'); font-weight: 500; }
  @font-face { font-family: 'Vazirmatn'; src: url('${typeof window !== 'undefined' ? window.location.origin : ''}/fonts/Vazirmatn-Bold.woff2') format('woff2'); font-weight: 700; }
`;

const CARDS_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; background: #eef1f6; }
  .sheet-note { max-width: 288mm; margin: 0 auto 2.5mm; display: flex; justify-content: space-between; align-items: center;
    font-size: 6.6pt; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 1.4mm; }
  .sheet-note b { color: #10214f; }
  .grid { display: grid; grid-template-columns: repeat(5, 54mm); grid-auto-rows: 86mm; gap: 4mm 4.2mm; justify-content: center; }
  .cellwrap { position: relative; }
  /* خط برش دور هر کارت */
  .cut { position: absolute; inset: -1.2mm; border: 1px dashed #94a3b8; pointer-events: none; }
  .cut::before { content: ''; position: absolute; top: -1.2mm; right: -1.2mm; width: 3mm; height: 3mm; border-top: 1.5px solid #64748b; border-right: 1.5px solid #64748b; }
  .cut::after  { content: ''; position: absolute; bottom: -1.2mm; left: -1.2mm; width: 3mm; height: 3mm; border-bottom: 1.5px solid #64748b; border-left: 1.5px solid #64748b; }
  /* ─── خود کارت (۵۴×۸۶ میلی‌متر) ─── */
  .card { width: 54mm; height: 86mm; background: #fff; border-radius: 3.2mm; overflow: hidden;
    border: 1px solid #c3cbda; box-shadow: 0 1px 2px rgba(15,33,79,.14); display: flex; flex-direction: column; position: relative; }
  .band { background: linear-gradient(135deg, #0e1f4d 0%, #1d3f8f 62%, #2a55b1 100%); padding: 1.6mm 2.2mm 2mm; text-align: center; position: relative; }
  .slot { width: 15mm; height: 3.4mm; background: #fff; border: 1px solid #b9c2d8; border-radius: 1.7mm; margin: 0 auto 1.2mm; }
  .bandrow { display: flex; align-items: center; justify-content: center; gap: 1.6mm; }
  .bandrow img { width: 8.4mm; height: 8.4mm; border-radius: 50%; background: #fff; object-fit: cover; border: .7mm solid rgba(255,255,255,.85); }
  .school-nm { color: #fff; font-size: 7.6pt; font-weight: 700; line-height: 1.25; }
  .chip { margin: 1mm auto 0; display: inline-block; background: #c9a227; color: #0e1f4d; font-size: 5.6pt; font-weight: 700;
    padding: .5mm 3mm; border-radius: 2mm; letter-spacing: .2px; }
  .cbody { flex: 1; display: flex; gap: 2.2mm; padding: 2mm 2.4mm 0; }
  .photo { width: 19mm; height: 23.5mm; border-radius: 1.8mm; overflow: hidden; flex-shrink: 0;
    border: .55mm solid #1d3f8f; background: #f1f5f9; display: flex; align-items: center; justify-content: center; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .photo .initial { font-size: 13pt; font-weight: 700; color: #1d3f8f; }
  .info { flex: 1; padding-top: .6mm; }
  .nm { font-size: 8.6pt; font-weight: 700; color: #0e1f4d; margin-bottom: 1.3mm; line-height: 1.2; }
  .irow { font-size: 6.1pt; color: #1e293b; border-bottom: .5px dotted #cbd5e1; padding: .55mm 0; display: flex; gap: 1mm; }
  .irow .k { color: #64748b; white-space: nowrap; }
  .irow .v { font-weight: 700; }
  .cfoot { display: flex; align-items: flex-end; justify-content: space-between; padding: 1.2mm 2.4mm 1.6mm; gap: 2mm; }
  .sigside { flex: 1; }
  .year-t { font-size: 5.4pt; color: #475569; margin-bottom: .8mm; }
  .sig-line { border-top: 1px dashed #64748b; padding-top: .8mm; font-size: 5.4pt; color: #334155; text-align: center; width: 24mm; }
  .qrside { text-align: center; flex-shrink: 0; }
  .qrside img { width: 20mm; height: 20mm; display: block; }
  .scan-t { font-size: 4.8pt; color: #64748b; margin-top: .4mm; }
  .goldline { height: 2.2mm; background: linear-gradient(90deg, #c9a227 0%, #e2c14f 45%, #c9a227 100%); }
  @page { size: A4 landscape; margin: 5mm 4mm 4mm; }
  @media screen { body { padding: 12px; } }
`;

/* ─── رندر یک کارت ─── */

function cardHtml(c: IdCardData, school: IdCardSchoolInfo, qr: string): string {
  const kindLabel = c.kind === 'student' ? 'کارت هویت شاگرد' : 'کارت هویت کارمند';
  const photo = c.photo
    ? `<img src="${c.photo}" alt=""/>`
    : `<div class="initial">${esc(c.name.trim().charAt(0) || '؟')}</div>`;
  const rows = c.kind === 'student'
    ? [
        ['نام پدر', c.father],
        ['صنف', c.line1],
        ['شمارهٔ حاضری', c.line2],
        ['نمبر اساس', c.baseNumber || ''],
      ]
    : [
        ['نام پدر', c.father],
        ['سمت', c.line1],
        ['واخد تعلیمی', c.line2],
      ];
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="irow"><span class="k">${k}:</span><span class="v">${esc(v)}</span></div>`)
    .join('');
  return `<div class="card">
  <div class="band">
    <div class="slot"></div>
    <div class="bandrow"><img src="${school.logo}" alt=""/><div class="school-nm">${esc(school.name)}</div></div>
    <div class="chip">${kindLabel}</div>
  </div>
  <div class="cbody">
    <div class="photo">${photo}</div>
    <div class="info">
      <div class="nm">${esc(c.name)}</div>
      ${rowsHtml}
    </div>
  </div>
  <div class="cfoot">
    <div class="sigside">
      <div class="year-t">سال تعلیمی ${esc(school.academicYear)}</div>
      <div class="sig-line">امضاء مدیر مکتب</div>
    </div>
    <div class="qrside"><img src="${qr}" alt="QR"/><div class="scan-t">اسکن برای تأیید کارت</div></div>
  </div>
  <div class="goldline"></div>
</div>`;
}

/* ─── ساخت ورق کامل A4 افقی — ۱۰ کارت در هر صفحه ─── */

export async function buildIdCardsSheet(
  cards: IdCardData[],
  school: IdCardSchoolInfo,
): Promise<string> {
  const pages: string[] = [];
  const perPage = 10;
  for (let p = 0; p < Math.ceil(cards.length / perPage); p++) {
    const slice = cards.slice(p * perPage, (p + 1) * perPage);
    const cells: string[] = [];
    for (const c of slice) {
      const qr = await idCardQrDataUrl(idCardQrPayload(c, school));
      cells.push(`<div class="cellwrap"><div class="cut"></div>${cardHtml(c, school, qr)}</div>`);
    }
    pages.push(`<section class="page">
      <div class="sheet-note"><b>کارت‌های هویت — ${esc(school.name)}</b>
        <span>سال تعلیمی ${esc(school.academicYear)} • صفحهٔ ${fa(p + 1)} از ${fa(Math.ceil(cards.length / perPage))} • خط‌چین = محل قیچی • کادر سفید بالای کارت = محل سوراخ بند</span></div>
      <div class="grid">${cells.join('')}</div>
    </section>`);
  }
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>کارت‌های هویت</title><style>${FONT_FACE}${CARDS_CSS}
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
</style></head><body>${pages.join('')}</body></html>`;
}

/* ─── چاپ مستقیم ─── */

export async function printIdCards(cards: IdCardData[], school: IdCardSchoolInfo): Promise<void> {
  const html = await buildIdCardsSheet(cards, school);
  printRawHtml('کارت‌های هویت', html);
}
