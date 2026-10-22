/**
 * آماده‌سازی خروجی standalone برای اجرای محلی (package.json → build)
 *
 * در Next 16 (turbopack) پوشهٔ distDir داخل standalone ساخته نمی‌شود و
 * سرور standalone آن را در زمان اجرا می‌خواهد — این اسکریپت کامل mirror می‌کند:
 *   .next/standalone/.next/  ←  محتوای کامل .next (جز خود standalone)
 */
import { cpSync, existsSync, rmSync } from 'fs';
import path from 'path';

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || '.next';
const src = path.join(root, distDir);
const dest = path.join(root, distDir, 'standalone', distDir);

if (!existsSync(path.join(src, 'BUILD_ID'))) {
  console.error('✗ بیلد یافت نشد — ابتدا next build اجرا کنید');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (from) => !from.startsWith(path.join(src, 'standalone')),
});
console.log(`✓ standalone آماده شد: ${path.relative(root, dest)}`);
