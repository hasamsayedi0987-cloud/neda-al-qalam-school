# ساخت Release v2.0.0 در گیت‌هاب با APK — همراه با حفظ همهٔ نسخه‌های قبلی
import json, urllib.request

TOKEN = open('/tmp/gh_token.txt').read().strip()
REPO = 'hasamsayedi0987-cloud/neda-al-qalam-school'
TAG = 'v2.0.0'

BODY = """# 🎓 نسخهٔ ۲.۰.۰ — ارتقای حرفه‌ای جامع

سایت: **https://neda-al-qalam-school.vercel.app**

## ✨ تازه‌ها

### طراحی مدرن و تم تاریک
- 🌙 **تم تاریک/روشن/سیستم** با دکمهٔ تغییر در هدر — انتخاب حفظ می‌شود
- بازطراحی کامل صفحهٔ ورود، هدر، منو و جدول‌ها + انیمیشن‌های ظریف
- فونت وازیرمتن با بارگذاری بهینه (بدون پرش متن)

### ویژگی‌های جدید
- 📊 **داشبورد نموداری**: روند حاضری ۷ روز اخیر + توزیع رتبهٔ نمرات سالانه
- 👤 **پروفایل شاگرد**: با یک لمس روی نام شاگرد — حاضری، نمرات نهایی با اوسط کل، فعالیت‌ها
- 📥 **ورود گروهی شاگردان (CSV)**: پیش‌نمایش هوشمند پیش از ثبت
- 📷 **عکس شاگرد** با فشرده‌سازی خودکار + آواتار در جدول
- ⬆️ **ارتقای دسته‌جمعی صنف** برای پایان سال تعلیمی
- ✅ دکمهٔ **«همه حاضر»** در حاضری + ویرایش فعالیت‌ها + جستجوی کتابخانه
- 🖨 چاپ اسناد با نام مدرسه و مقیاس از تنظیمات

### امنیت (تقویت اساسی)
- 🔐 کلید امضای نشست از کد حذف شد (تصادفی، ذخیره در دیتابیس)
- 🛡 محدودیت تلاش ورود (۵ تلاش در ۱۰ دقیقه) — ضد جستجوی رمز
- 🍪 کوکی Secure + گارد «آخرین مدیر فعال»
- 💾 **بازیابی پشتیبان اتمیک** — خطای وسط راه دیگر دیتابیس را خالی نمی‌کند + بخش‌های دلخواه و تقدیرنامه‌ها هم پشتیبان می‌شوند
- ⚡ ثبت دسته‌ای نمرات و حاضری (چند برابر سریع‌تر) + اعتبارسنجی عضویت شاگرد در صنف

### آیفون (iOS)
- 🍎 نصب از سافاری: **اشتراک‌گذاری ← Add to Home Screen** — اپ کامل با آیکون، اسپلش رسمی و حالت آفلاین
- پشتیبانی کامل ناچ و ناحیهٔ امن نمایشگر

---

## 📥 نصب APK اندروید

1. فایل `nedaalqalam-school.apk` را از پایین دانلود کنید
2. روی نسخهٔ قبلی مستقیم نصب می‌شود (امضای یکسان — بدون نیاز به حذف)
3. آدرس سرور جاسازی‌شده است — بدون هیچ تنظیمی مستقیم صفحهٔ ورود

**یادداشت**: رفع‌های اصلی همیشه از طریق وب هم اعمال می‌شوند؛ با یک بار باز کردن اپ با انترنت، نسخهٔ جدید فعال می‌شود.

## 📜 نسخه‌های قبلی

همهٔ لینک‌های دانلود نسخه‌های قبل فعال هستند:
[v1.5.1](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.5.1/nedaalqalam-school.apk) ·
[v1.5.0](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.5.0/nedaalqalam-school.apk) ·
[v1.4.1](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.4.1/nedaalqalam-school.apk) ·
[v1.4.0](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.4.0/nedaalqalam-school.apk) ·
[v1.3.0](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.3.0/nedaalqalam-school.apk) ·
[v1.0.0](https://github.com/hasamsayedi0987-cloud/neda-al-qalam-school/releases/download/v1.0.0/nedaalqalam-school.apk)

---
توسعه‌دهنده: **حسام الدین سیدی** — 0791680632 🇦🇫
"""

def api(url, data=None, headers=None, method=None, raw=None):
    h = {'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json'}
    if headers: h.update(headers)
    body = raw if raw is not None else (json.dumps(data).encode() if data else None)
    req = urllib.request.Request(url, data=body, headers=h, method=method or ('POST' if body else 'GET'))
    return urllib.request.urlopen(req)

# ۱) ساخت Release
r = api(f'https://api.github.com/repos/{REPO}/releases', {
    'tag_name': TAG,
    'name': 'v2.0.0 — ارتقای حرفه‌ای جامع (تم تاریک، داشبورد نموداری، امنیت تقویت‌شده، iOS)',
    'body': BODY,
    'draft': False,
    'prerelease': False,
}).read()
release = json.loads(r)
print('Release ساخته شد:', release['html_url'])

# ۲) آپلود APK
apk = open('/home/z/my-project/download/nedaalqalam-school.apk', 'rb').read()
r2 = api(
    f"https://uploads.github.com/repos/{REPO}/releases/{release['id']}/assets?name=nedaalqalam-school.apk",
    headers={'Content-Type': 'application/vnd.android.package-archive'},
    raw=apk,
).read()
asset = json.loads(r2)
print('APK آپلود شد:', asset['browser_download_url'], f"({asset['size']//1024}KB)")
