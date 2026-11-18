#!/bin/bash
# نصب Android SDK کامل داخل my-project — ماندگار در برابر بازیابی سندباکس
# JDK 17 (سازگار با d8 8.2) + build-tools 34 + platform android-34
set -e
SDK=/home/z/my-project/tools/android-sdk
mkdir -p "$SDK" /tmp/sdk-dl

if [ ! -f "$SDK/jdk17/bin/javac" ]; then
  echo "۱/۳ دانلود JDK 17…"
  curl -sL -o /tmp/sdk-dl/jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar xzf /tmp/sdk-dl/jdk17.tar.gz -C "$SDK" && mv "$SDK"/jdk-17* "$SDK/jdk17"
fi
echo "✓ javac: $("$SDK/jdk17/bin/javac" -version 2>&1)"

if [ ! -f "$SDK/android-14/aapt2" ]; then
  echo "۲/۳ دانلود build-tools 34…"
  curl -sL -o /tmp/sdk-dl/bt.zip "https://dl.google.com/android/repository/build-tools_r34-linux.zip"
  unzip -qo /tmp/sdk-dl/bt.zip -d "$SDK"
fi
echo "✓ aapt2: $(ls "$SDK/android-14/aapt2" 2>/dev/null || echo missing)"

if [ ! -f "$SDK/android-34/android.jar" ]; then
  echo "۳/۳ دانلود platform android-34…"
  curl -sL -o /tmp/sdk-dl/plat.zip "https://dl.google.com/android/repository/platform-34-ext7_r03.zip"
  unzip -qo /tmp/sdk-dl/plat.zip -d "$SDK"
fi
echo "✓ android.jar: $(du -h "$SDK/android-34/android.jar" | cut -f1)"
echo "SDK آماده در $SDK"
