/**
 * آماده‌سازی خروجی standalone برای اجرای محلی (package.json → build)
 *
 * در Next 16 (turbopack) پوشهٔ distDir داخل standalone ساخته نمی‌شود و
 * سرور standalone آن را در زمان اجرا می‌خواهد — این اسکریپت کامل mirror می‌کند:
 *   .next/standalone/.next/  ←  محتوای کامل .next (جز خود standalone)
 */
import { cpSync, existsSync, rmSync, renameSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || '.next';
const src = path.join(root, distDir);
const dest = path.join(root, distDir, 'standalone', distDir);

if (!existsSync(path.join(src, 'BUILD_ID'))) {
  console.error('✗ بیلد یافت نشد — ابتدا next build اجرا کنید');
  process.exit(1);
}

// چون dest داخل src است، cpSync مستقیم خطای self-copy می‌دهد —
// ابتدا به پوشهٔ موقت خارج از src کپی، سپس جابه‌جایی
rmSync(dest, { recursive: true, force: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'noq-standalone-'));
cpSync(src, path.join(tmp, 'dist'), {
  recursive: true,
  filter: (from) => !from.startsWith(path.join(src, 'standalone')),
});
renameSync(path.join(tmp, 'dist'), dest);
rmSync(tmp, { recursive: true, force: true });
// فایل‌های عمومی هم داخل standalone لازم هستند
cpSync(path.join(root, 'public'), path.join(root, distDir, 'standalone', 'public'), { recursive: true });
console.log(`✓ standalone آماده شد: ${path.relative(root, dest)} + public/`);
