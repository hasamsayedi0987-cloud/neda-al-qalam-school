# ساخت Release v2.1.0 در گیت‌هاب با APK — حفظ همهٔ نسخه‌های قبلی
import json, urllib.request, os

TOKEN = open('/tmp/gh_token.txt').read().strip()
REPO = 'hasamsayedi0987-cloud/neda-al-qalam-school'
TAG = 'v2.1.0'
APK = '/home/z/my-project/download/nedaalqalam-school-v2.1.0.apk'

BODY = """# 🎓 نسخهٔ ۲.۱.۰ — دسترسی‌ها، عناوین قابل‌تغییر و رفع کامل دسترسی معلم

سایت: **https://neda-al-qalam-school.vercel.app**

## ✨ تازه‌ها

### 🔧 رفع کامل مشکل «مضمون به شما داده نشده است»
- ریشهٔ مشکل پیدا و ریشه‌کنی شد: حساب معلم به پروندهٔ او پیوند نداشت
- **ترمیم خودکار پیوند در اولین ورود** — معلم بدون هیچ کاری مضامین و صنف نگرانی‌اش را می‌بیند
- دکمهٔ «ساخت حساب» در بخش معلمان + هشدار «بدون پیوند!» در کاربران
- معلم: نمره‌دهی مضامین خود + حاضری صنف نگرانی + جدول نتایج صنف‌های خود

### 🛡 کنترل دسترسی توسط مدیر (جدید)
- **محدود / فعال / غیرفعال کردن هر بخش برای هر کاربر** — هم در منو و هم روی سرور
- **کپی دسترسی‌ها** از یک کاربر به کاربر دیگر با یک انتخاب
- **تغییر سریع نقش**: تعیین چند مدیر هم‌زمان، سرمعلم و... از ستون نقش
- **نگران موقت صنف**: در غیاب نگران اصلی، وظیفه به معلم/کارمند دیگر سپرده می‌شود (حاضری و دسترسی نگران)
- کارت «نمرات در انتظار بررسی و تایید» در داشبورد مدیر و سرمعلم برای نظارت لحظه‌ای

### ✏️ عناوین قابل‌تغییر توسط مدیر
- **نام مکتب، شعار و عنوان همهٔ بخش‌های منو** از تنظیمات ← «عناوین و نام‌ها» — برای همهٔ کاربران اعمال می‌شود

### 👨‍🎓 ولد و ولدیت (پدر کلان) در نمرات
- در جدول نمرات، جدول نتایج سالانه و چهارو‌نیم‌ماهه، کارنامهٔ چاپی و خروجی Excel نمایش داده می‌شود (اختیاری — اگر در ثبت شاگرد ذکر شده باشد)

## 📲 نصب

### اندروید
فایل `nedaalqalam-school.apk` را دانلود و نصب کنید (اگر نسخهٔ قبلی را دارید، همان بالای نصب‌شده نصب می‌شود؛ در صورت مشکل اول حذف سپس نصب کنید). بار اول با انترنت باز کنید.

### آیفون (iOS)
سایت را با **Safari** باز کنید ← دکمهٔ **اشتراک‌گذاری (مربع با فلش)** ← **Add to Home Screen** — اپ با آیکون و اسپلش رسمی، تمام‌صفحه و آفلاین نصب می‌شود.

---
**توسعه‌دهنده:** حسام الدین سیدی — 0791680632
**نسخه‌های قبلی (v1.0.0 تا v2.0.0) و لینک‌های دانلود آن‌ها همگی فعال می‌مانند.**
"""

def api(url, data=None, headers=None, method=None, raw=False):
    h = {'Authorization': f'token {TOKEN}', 'User-Agent': 'release-script'}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req) as r:
        body = r.read()
        return body if raw else json.loads(body or b'{}')

# ۱) ایجاد Release
data = json.dumps({
    'tag_name': TAG,
    'target_commitish': 'main',
    'name': 'نسخهٔ ۲.۱.۰ — دسترسی‌ها، عناوین قابل‌تغییر و رفع دسترسی معلم',
    'body': BODY,
    'draft': False,
    'prerelease': False,
}).encode()

rel = api(f'https://api.github.com/repos/{REPO}/releases', data)
print('release created:', rel.get('id'), rel.get('html_url'))

# ۲) آپلود APK
upload_url = rel['upload_url'].split('{')[0]
apk_name = 'nedaalqalam-school.apk'
apk_bytes = open(APK, 'rb').read()
up = api(
    f'{upload_url}?name={apk_name}',
    data=apk_bytes,
    headers={'Content-Type': 'application/vnd.android.package-archive'},
    method='POST',
)
print('APK uploaded:', up.get('browser_download_url'))

# ۳) فهرست Releaseهای فعلی — اثبات حفظ نسخه‌های قبلی
rels = api(f'https://api.github.com/repos/{REPO}/releases?per_page=20')
print('\\nهمهٔ Releaseها (لینک‌های دانلود قدیمی فعال):')
for r in rels:
    assets = ', '.join(a['name'] for a in r.get('assets', []))
    print(f"  {r['tag_name']:10} — {assets}")
