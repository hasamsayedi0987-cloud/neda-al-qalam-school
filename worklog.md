---
Task ID: final-1
Agent: main (Z.ai)
Task: اپلیکیشن مکتب خصوصی نداالقلم — لوگوی رسمی، انتشار گیت‌هاب، ساخت و تحویل APK

Work Log:
- کشف اینکه جلسهٔ قبلی کل اپ را ساخته و در git کامیت کرده بود (worklog قبلی موجود)
- بازیابی prisma/schema.prisma از git پس از بازنویسی اشتباه؛ دیتابیس db/custom.db سالم ماند؛ prisma generate مجدد
- جایگزینی لوگوی موقت با لوگوی رسمی آپلودشدهٔ کاربر (public/logo.png) در: login-view، app-shell، about-view، exports (چاپ)، manifest.json، layout.tsx، sw.js
- بازتولید همهٔ آیکون‌ها از لوگوی رسمی: favicon-32، icon-192/512، apple-touch، mipmap های APK (mdpi تا xxxhdpi)
- ساخت زیرساخت APK در apk-build/: AndroidManifest.xml (minSdk 24/target 34)، MainActivity.java (WebView فارسی RTL، صفحهٔ ورود آدرس سرور با ذخیره در SharedPreferences، فایل‌چوینر، دیالوگ خروج)، res (strings/styles)، build.sh بدون Gradle
- نصب Android SDK: build-tools 34.0.0 + platform android-34 (دانلود مستقیم از dl.google.com)
- رفع خطای کامپایل: نبود javac (JRE-only) → ecj.jar از Maven؛ عدم پشتیبانی lambda با bootclasspath اندروید → تبدیل به کلاس ناشناس
- APK ساخته و امضا شد (keystore: CN=Neda al-Qalam School) و با apksigner verify تأیید شد — 226KB
- تست مرورگری مجدد: ورود admin، داشبورد، جدول نتایج خودکار (صنف هفتم — نمرات دری با مکتسبه الف/ب/ج/هـ/تکرار)، ثبت نمرات، کتابخانه، دربارهٔ سازنده با عکس — همه سالم
- رفع lint: ignores برای scripts/ و apk-build/ در eslint.config.mjs
- گیت‌هاب: ایجاد repo neda-al-qalam-school با توکن کاربر، push کامل (5 کامیت)، حذف اسکرین‌شات‌های موقت از مخزن
- Release v1.0.0 با اعلان فارسی + آپلود nedaalqalam-school.apk
- اسکرین‌شات‌های نهایی در download/screenshots/

Stage Summary:
- مخزن: https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school
- APK: https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.0.0/nedaalqalam-school.apk
- کپی محلی APK: /home/z/my-project/download/nedaalqalam-school.apk
- حساب‌ها: admin/admin123، sarallam، teacher، student، parent، library، staff (12345678)
- یادآوری امنیتی: کاربر باید توکن گیت‌هاب را پس از پایان کار regenerate کند (توکن در چت و تاریخچهٔ bash باقی مانده)
- apk-build/build.sh قابل اجرا مجدد؛ ecj.jar اگر نبود خودکار دانلود می‌شود

---
Task ID: final-2
Agent: main (Z.ai)
Task: بررسی نهایی و تحویل محصول پس از درخواست «بیار» کاربر

Work Log:
- بررسی وضعیت: سرور dev فعال (HTTP 200)، git پاک و push شده (کامیت f00277d)
- تأیید مخزن گیت‌هاب: hasamsayedi0987-cloud/neda-al-qalam-school (public) + Release v1.0.0 با nedaalqalam-school.apk
- تأیید APK محلی: /home/z/my-project/download/nedaalqalam-school.apk (226KB)
- تست مرورگری مجدد با agent-browser: ورود admin/admin123 → داشبورد (آمار، حاضری امروز، تقویم میزان ۱۴۰۵) → جدول نتایج صنف هفتم (مکتسبه الف/ب/ج/هـ/تکرار، مجموع، اوسط، رتبه، نتیجه، دکمه‌های Excel/Word/چاپ) → دربارهٔ سازنده (عکس، تلفن، ایمیل)
- خطاهای کنسول: صفر (فقط ۳ هشدار جزئی Next/Image — غیرمسدودکننده)
- اسکرین‌شات‌های نهایی: download/screenshots/final-01..05

Stage Summary:
- محصول کامل: وب‌اپ + مخزن گیت‌هاب + APK اندروید — همه تأیید و آمادهٔ تحویل
- بدون تغییر کد در این مرحله؛ فقط صحت‌سنجی و تحویل
