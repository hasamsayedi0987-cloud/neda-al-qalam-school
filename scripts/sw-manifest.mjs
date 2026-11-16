/**
 * تولید فهرست فایل‌های Build برای precache سرویس‌ورکر — پس از next build اجرا می‌شود
 * خروجی: public/sw-manifest.json (مسیرهای /_next/static/... + فایل‌های عمومی)
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const root = process.cwd();
const urls = [];

function walk(dir, prefix) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, rel);
    else urls.push(`/_next/static/${rel}`);
  }
}

const distDir = process.env.NEXT_DIST_DIR || '.next';
const staticDir = path.join(root, distDir, 'static');
if (existsSync(staticDir)) walk(staticDir, '');

// فایل‌های عمومی (فونت، آیکون، لوگو) — خود sw.js و manifest حذف می‌شوند
// پوشهٔ splash: اسپلش‌اسکرین مخصوص آیفون است (فقط هنگام نصب PWA استفاده می‌شود) — precache نمی‌شود
// نسخهٔ ۳.۴.۰ — pdfjs/، pdf.worker و developer.png هم precache نمی‌شوند:
//   این‌ها سنگین‌اند (pdf.worker ۱.۳MB + ۱۶۸ فایل bcmap + عکس ۱.۶MB) و نصب پوسته را
//   روی شبکهٔ کند نیمه‌کاره می‌کردند — ریشهٔ «اپ آفلاین سفید باز می‌شود». این فایل‌ها
//   در اولین استفاده با استراتژی runtime سرویس‌ورکر کش می‌شوند.
const PUBLIC_EXCLUDE_DIRS = new Set(['splash', 'pdfjs']);
const PUBLIC_EXCLUDE_FILES = new Set(['sw.js', 'sw-manifest.json', 'robots.txt', 'pdf.worker.min.mjs', 'developer.png', 'dev-photo.png', 'dev-thumb.png']);
/** سقف حجم هر فایل برای precache — فایل‌های سنگین‌تر در اولین استفاده runtime کش می‌شوند */
const MAX_PRECACHE_BYTES = 450 * 1024;

const pubDir = path.join(root, 'public');
if (existsSync(pubDir)) {
  const addPublic = (prefix) => {
    const dir = path.join(root, 'public', prefix);
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (PUBLIC_EXCLUDE_DIRS.has(rel)) continue;
        addPublic(rel);
      }
      else if (!PUBLIC_EXCLUDE_FILES.has(rel) && st.size <= MAX_PRECACHE_BYTES) {
        urls.push(`/${rel}`);
      }
    }
  };
  addPublic('');
}

writeFileSync(path.join(root, 'public', 'sw-manifest.json'), JSON.stringify(urls, null, 0));
console.log(`sw-manifest.json: ${urls.length} فایل برای precache ثبت شد (فایل‌های سنگین pdfjs/developer در اولین استفاده کش می‌شوند)`);
