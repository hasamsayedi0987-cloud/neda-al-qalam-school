/**
 * فشرده‌سازی تصاویر عمومی — کاهش حجم بارگذاری اولیه
 * logo.png: 528KB → ~۲۵ کیلوبایت (نمایش حداکثر ۵۱۲ پیکسل)
 * dev-photo.png: 1.6MB → ~۶۰ کیلوبایت (نمایش حداکثر ۴۰۰ پیکسل)
 */
import sharp from 'sharp';
import { stat, writeFile } from 'fs/promises';

const jobs = [
  { in: 'public/logo.png', out: 'public/logo.png', width: 512, quality: 88 },
  { in: 'public/dev-photo.png', out: 'public/dev-photo.png', width: 420, quality: 82 },
];

for (const j of jobs) {
  const before = (await stat(j.in)).size;
  const buf = await sharp(j.in)
    .resize({ width: j.width, height: j.width, fit: 'inside', withoutEnlargement: true })
    .png({ quality: j.quality, compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(j.out, buf);
  const after = buf.length;
  console.log(`${j.in}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
}
console.log('done');
