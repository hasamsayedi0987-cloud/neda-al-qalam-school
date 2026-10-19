#!/bin/bash
# ساخت ZIP سورس‌کد برای گیت‌هاب
set -e
cd /home/z/my-project
OUT="/home/z/my-project/download/neda-ol-qalam-school-app-source.zip"
mkdir -p /home/z/my-project/download
rm -f "$OUT"
git ls-files -z | xargs -0 zip -q "$OUT"
# افزودن پوشهٔ خالی db با gitkeep (در ls-files هست)
zipinfo -1 "$OUT" | wc -l
echo "OK -> $OUT"
du -h "$OUT"
