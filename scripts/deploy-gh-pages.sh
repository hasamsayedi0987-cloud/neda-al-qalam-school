#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# انتشار سایت مکتب خصوصی نداالقلم روی GitHub Pages (شاخهٔ gh-pages)
# استفاده:
#   GH_TOKEN=توکن bash scripts/deploy-gh-pages.sh
# متغیرهای اختیاری:
#   REPO      (پیش‌فرض neda-al-qalam-school)
#   OWNER     (پیش‌فرض hasamsayedi0987-cloud)
#   BASE_PATH (پیش‌فرض /neda-al-qalam-school)
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

TOKEN="${GH_TOKEN:?GH_TOKEN تنظیم نشده}"
OWNER="${OWNER:-hasamsayedi0987-cloud}"
REPO="${REPO:-neda-al-qalam-school}"
BASE="${BASE_PATH:-/neda-al-qalam-school}"
DIST="${DIST:-.nextprod}"
WORK="$(mktemp -d)"

echo "1/4 ساخت نسخهٔ استاتیک (basePath=$BASE)…"
rm -rf "$DIST"
NEXT_OUTPUT=export NEXT_DIST_DIR="$DIST" NEXT_PUBLIC_BASE_PATH="$BASE" bun run build:static

# اطمینان: توکن در بیلد عمومی نباشد
if grep -rl "ghp_[A-Za-z0-9]\{30,\}\|github_pat_[A-Za-z0-9_]\{30,\}" "$DIST" >/dev/null 2>&1; then
  echo "❌ توکن در بیلد یافت شد! انتشار متوقف شد (NEXT_PUBLIC_GH_TOKEN را خالی بسازید)."
  exit 1
fi

echo "2/4 آماده‌سازی شاخهٔ gh-pages…"
git clone -q --no-checkout "https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git" "$WORK"
cd "$WORK"
git checkout -q --orphan gh-pages-new
git rm -rf -q . 2>/dev/null || true
git clean -fdq

echo "3/4 کپی فایل‌های سایت…"
cp -r "${OLDPWD}/${DIST}"/* .
touch .nojekyll

echo "4/4 انتشار…"
git add -A
git commit -q -m "انتشار سایت — $(date '+%Y-%m-%d %H:%M') ($(git -C "$OLDPWD" rev-parse --short HEAD))"
git push -q origin "gh-pages-new:gh-pages"
echo "✅ سایت منتشر شد: https://${OWNER}.github.io/${REPO}/"
