#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ساخت APK اپلیکیشن مکتب خصوصی نداالقلم — نسخهٔ ۱.۴ (آفلاین کامل)
# بدون Gradle | پیش‌نیازها: JDK 17+ و Android SDK:
#   $ANDROID_SDK_HOME/build-tools/34.0.0  (aapt2, d8, zipalign, apksigner)
#   $ANDROID_SDK_HOME/platforms/android-34/android.jar
#
# آدرس سرور: در فایل server-url.txt قرار دهید (خالی = صفحهٔ خوش‌آمد یک‌باره)
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_SDK_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="build"
KEYSTORE="$OUT/noq.keystore"
PKG="af/nedaalqalam/school"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/apk" "$OUT/gen" assets

echo "0/5 تزریق آدرس سرور از server-url.txt…"
SERVER_URL=$(tr -d '[:space:]' < server-url.txt 2>/dev/null || echo "")
sed "s|__DEFAULT_SERVER_URL__|${SERVER_URL}|" java/$PKG/MainActivity.java > "$OUT/MainActivity.java"

echo "1/5 کامپایل منابع (aapt2)…"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/apk/base.apk" -I "$PLATFORM" -A assets \
  --manifest AndroidManifest.xml --java "$OUT/gen" "$OUT/res.zip"

echo "2/5 کامپایل جاوا…"
if command -v javac >/dev/null 2>&1; then
  javac -source 11 -target 11 -classpath "$PLATFORM" \
    -d "$OUT/classes" "$OUT/MainActivity.java" "$OUT/gen/$PKG/R.java"
else
  # جایگزین: کامپایلر Eclipse (در صورت نبود دانلود می‌شود)
  if [ ! -f ecj.jar ]; then curl -sL -o ecj.jar "https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.33.0/ecj-3.33.0.jar"; fi
  java -jar ecj.jar -source 1.8 -target 1.8 -encoding UTF-8 \
    -cp "$PLATFORM" -d "$OUT/classes" \
    "$OUT/MainActivity.java" "$OUT/gen/$PKG/R.java"
fi

echo "3/5 تبدیل به DEX (d8)…"
"$BT/d8" --release --lib "$PLATFORM" --min-api 24 \
  --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "4/5 بسته‌بندی APK…"
cp "$OUT/dex/classes.dex" "$OUT/apk/classes.dex"
(cd "$OUT/apk" && zip -qu base.apk classes.dex)

echo "5/5 امضای APK…"
if [ ! -f "$KEYSTORE" ]; then
  # کلید پایدار از مخزن (apk-build/noq.keystore) — تا امضا در همهٔ Buildها یکسان بماند
  if [ -f noq.keystore ]; then
    cp noq.keystore "$KEYSTORE"
  else
    keytool -genkeypair -keystore "$KEYSTORE" -alias noq -keyalg RSA -keysize 2048 \
      -validity 10000 -storepass nedaalqalam1405 -keypass nedaalqalam1405 \
      -dname "CN=Neda al-Qalam School, OU=IT, O=Neda al-Qalam, L=Baharak, ST=Badakhshan, C=AF"
  fi
fi
"$BT/zipalign" -f 4 "$OUT/apk/base.apk" "$OUT/nedaalqalam-unsigned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:nedaalqalam1405 \
  --key-pass pass:nedaalqalam1405 \
  --out "$OUT/nedaalqalam-school.apk" "$OUT/nedaalqalam-unsigned.apk"

"$BT/apksigner" verify "$OUT/nedaalqalam-school.apk" && echo "✓ امضا معتبر است"
mkdir -p ../download
cp "$OUT/nedaalqalam-school.apk" ../download/nedaalqalam-school.apk
echo "✓ APK ساخته شد: download/nedaalqalam-school.apk"
