# Worklog — پروژهٔ مکتب خصوصی نداالقلم

---
Task ID: 1
Agent: main (Z.ai)
Task: ساخت اپلیکیشن وب جامع مدیریت مکتب خصوصی نداالقلم (Next.js 16 + Prisma + PWA فارسی RTL)

Work Log:
- بارگذاری مهارت fullstack-dev و راه‌اندازی محیط (init script)
- ساخت دارایی‌ها: لوگوی SVG مکتب (قلم+کتاب+ستاره)، آیکون‌های PNG (192/512/apple-touch/favicon)، کپی عکس سازنده به public/dev-photo.png، دانلود فونت Vazirmatn به‌صورت لوکال
- طراحی اسکیمای Prisma شامل ۱۵ مدل: User, Class, Subject, ClassSubject, Teacher, Student, AttendanceRecord, StaffAttendance, StudentActivity, Grade, Book, BookLoan, Notification, StaffTask, Setting
- Seed: صنف ۱-۱۲، مضامین نصاب افغانی، ۷ معلم/کارمند، ۵ شاگرد نمونه، تقسیم مضامین صنف هفتم، ۵ کتاب، حساب‌های کاربری همهٔ نقش‌ها
- کتابخانه‌های پایه: jalali.ts (تبدیل شمسی با نام ماه‌های افغانی)، grading.ts (مکتسبه الف تا تکرار، نتیجهٔ کل، رتبه‌بندی)، auth.ts (scrypt + کوکی HMAC، بررسی active در هر درخواست)، client/api.ts (صف آفلاین localStorage + flush خودکار)، client/exports.ts (چاپ/PDF iframe، Word blob، Excel HTML)
- ۱۷ API endpoint: auth، users، classes (+assign)، subjects، teachers، students، attendance (یومیه/ماهانه/کارمندان)، activities، grades (ثبت گروهی + approve)، results (جدول صنف + کارنامه)، library، notifications، tasks، settings، backup، dashboard
- رابط SPA تک‌صفحه‌ای RTL با ۱۴ ویو: ورود، داشبورد، شاگردان، معلمان، صنف‌ها، مضامین، حاضری (۳ تب)، فعالیت، نمرات، نتایج/کارنامه، کتابخانه (۳ تب)، کاربران، وظایف، تنظیمات، دربارهٔ سازنده
- PWA: manifest.json + sw.js (network-first برای API، cache-first برای استاتیک) — ثبت SW فقط در production
- اصلاحات حین تست مرورگری: gradeName import، قانون lint set-state-in-effect (queueMicrotask)، نتایج شاگرد/سرپرست (redirect قبل از بررسی classId + بازسازی UI کارنامهٔ من)، ماه جاری شمسی (nowJ object)، دسترسی ماهانهٔ شاگرد بدون classId، غیرفعال‌سازی SW در dev برای جلوگیری از باندل قدیمی
- تست کامل با agent-browser: ورود/خروج، مسدود شدن حساب غیرفعال، ثبت نمرات ۵ شاگرد (۹۱/الف … ۴۲/تکرار)، تایید نمرات + اعلان والدین، جدول نتایج با رتبه و نتیجه، کارنامه، حاضری یومیه و ماهانه، امانت/برگشت کتاب، غیرفعال‌سازی کاربر، نمای معلم (فقط مضامین خودش)، نمای سرپرست، موبایل ۳۹۰px
- بسته‌بندی: README.md فارسی، .gitignore، .env.example، git init + ۲ commit، ZIP در download/

Stage Summary:
- اپ کامل و روی سرور dev پورت ۳۰۰۰ در حال اجراست (HTTP 200)
- حساب‌ها: admin/admin123 (مدیر)، sarallam، teacher، student، parent، library، staff با رمز 12345678
- خروجی گیت‌هاب: /home/z/my-project/download/neda-ol-qalam-school-app-source.zip (۱۲۹ فایل، ۲.۱MB)
- نکتهٔ APK: اپ PWA است؛ نصب از مرورگر یا ساخت APK از طریق PWABuilder (در README توضیح داده شده)
- محدودیت: push به گیت‌هاب کاربر نیاز به credential خود او دارد — ZIP آمادهٔ آپلود است
