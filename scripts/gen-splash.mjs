/**
 * تولید اسپلش‌اسکرین اپل (apple-touch-startup-image) از لوگوی رسمی
 * پسزمینهٔ گرادیان سبز + لوگو وسط — برای حالت PWA نصب‌شده روی آیفون/آیپد
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';

const SIZES = [
  { w: 1290, h: 2796, name: 'iphone-1290x2796' }, // iPhone 14/15 Pro Max
  { w: 1284, h: 2778, name: 'iphone-1284x2778' }, // iPhone 13/14 Plus
  { w: 1179, h: 2556, name: 'iphone-1179x2556' }, // iPhone 14/15 Pro
  { w: 1170, h: 2532, name: 'iphone-1170x2532' }, // iPhone 13/14
  { w: 828,  h: 1792, name: 'iphone-828x1792' },  // iPhone 11/XR
  { w: 750,  h: 1334, name: 'iphone-750x1334' },  // iPhone SE/8
  { w: 2048, h: 2732, name: 'ipad-2048x2732' },   // iPad Pro 12.9
  { w: 1668, h: 2388, name: 'ipad-1668x2388' },   // iPad Pro 11
];

await mkdir('public/splash', { recursive: true });

const logoBuffer = await sharp('public/logo.png').resize(360, 360, { fit: 'inside' }).png().toBuffer();

for (const s of SIZES) {
  const logoMeta = await sharp(logoBuffer).metadata();
  const lw = logoMeta.width || 360;
  const lh = logoMeta.height || 360;
  const svg = `<svg width="${s.w}" height="${s.h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#065f46"/>
        <stop offset="50%" stop-color="#047857"/>
        <stop offset="100%" stop-color="#064e3b"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="40%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${s.w}" height="${s.h}" fill="url(#bg)"/>
    <rect width="${s.w}" height="${s.h}" fill="url(#glow)"/>
    <circle cx="${s.w / 2}" cy="${s.h / 2}" r="${Math.max(lw, lh) * 0.72}" fill="#ffffff" fill-opacity="0.12"/>
  </svg>`;
  const png = await sharp(Buffer.from(svg))
    .composite([{ input: logoBuffer, left: Math.round((s.w - lw) / 2), top: Math.round((s.h - lh) / 2) }])
    .png({ compressionLevel: 9, palette: true, quality: 80 })
    .toBuffer();
  await sharp(png).toFile(`public/splash/${s.name}.png`);
  console.log(`${s.name}.png — ${(png.length / 1024).toFixed(0)}KB`);
}
console.log('splash done');
