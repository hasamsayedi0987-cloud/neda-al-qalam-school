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

const staticDir = path.join(root, '.next', 'static');
if (existsSync(staticDir)) walk(staticDir, '');

// فایل‌های عمومی (فونت، آیکون، لوگو) — خود sw.js و manifest حذف می‌شوند
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
      if (st.isDirectory()) addPublic(rel);
      else if (!['sw.js', 'sw-manifest.json', 'robots.txt'].includes(rel)) {
        urls.push(`/${rel}`);
      }
    }
  };
  addPublic('');
}

writeFileSync(path.join(root, 'public', 'sw-manifest.json'), JSON.stringify(urls, null, 0));
console.log(`sw-manifest.json: ${urls.length} فایل برای precache ثبت شد`);
