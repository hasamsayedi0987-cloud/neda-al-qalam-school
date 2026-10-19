#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ساخت APK اپلیکیشن مکتب خصوصی نداالقلم — بدون Gradle
# پیش‌نیازها: JDK 17+ و Android SDK (platform android-34 + build-tools 34)
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_SDK_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="build"
KEYSTORE="$OUT/noq.keystore"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/apk"

echo "1/5 کامپایل منابع (aapt2)…"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/apk/base.apk" -I "$PLATFORM" --manifest AndroidManifest.xml \
  --java "$OUT/gen" -A assets 2>/dev/null || \
"$BT/aapt2" link -o "$OUT/apk/base.apk" -I "$PLATFORM" --manifest AndroidManifest.xml --java "$OUT/gen" "$OUT/res.zip"

echo "2/5 کامپایل جاوا (javac)…"
javac -source 11 -target 11 -classpath "$PLATFORM" \
  -d "$OUT/classes" java/af/nedaalqalam/school/MainActivity.java "$OUT/gen/af/nedaalqalam/school/R.java"

echo "3/5 تبدیل به DEX (d8)…"
"$BT/d8" --release --lib "$PLATFORM" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "4/5 بسته‌بندی APK…"
cp "$OUT/dex/classes.dex" "$OUT/apk/" && zip -jqu "$OUT/apk/base.apk" "$OUT/apk/classes.dex"
zip -qu "$OUT/apk/base.apk" resources.arsc 2>/dev/null || true
# افزودن فایل‌های res بسته‌بندی‌شده
cd "$OUT/apk" && unzip -oq "$OUT/res.zip" -d extracted 2>/dev/null || true
cd - >/dev/null

echo "5/5 امضای APK…"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias noq -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass nedaalqalam1405 -keypass nedaalqalam1405 \
    -dname "CN=Neda al-Qalam School, OU=IT, O=Neda al-Qalam, L=Baharak, ST=Badakhshan, C=AF"
fi
"$BT/zipalign" -f 4 "$OUT/apk/base.apk" "$OUT/nedaalqalam-school-unsigned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:nedaalqalam1405 \
  --key-pass pass:nedaalqalam1405 --out "../download/nedaalqalam-school.apk" "$OUT/nedaalqalam-school-unsigned.apk"

echo "✓ APK ساخته شد: download/nedaalqalam-school.apk"
