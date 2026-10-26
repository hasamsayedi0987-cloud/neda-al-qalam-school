# GitHub Release v2.2.0 — آمادهٔ انتشار
# استفاده: GITHUB_TOKEN=<توکن_جدید> bash scripts/release-v22.sh
set -e
cd "$(dirname "$0")/.."
TOKEN="${GITHUB_TOKEN:?توکن گیت‌هاب لازم است — gh p_… با دسترسی repo}"
REPO="hasamsayedi0987-cloud/neda-al-qalam-school"
API="https://api.github.com/repos/$REPO"

git remote set-url origin "https://hasamsayedi0987-cloud:${TOKEN}@github.com/${REPO}.git"
git push origin main
git push origin v2.2.0 2>/dev/null || true

echo "── ساخت Release ──"
cat > /tmp/release-body.md << 'BODY'
# نسخهٔ ۲.۲.۰ — مالی، ارتباطات و ریشه‌کنی هشدار قرمز همگام‌سازی

## ۱) ریشه‌کنی هشدار قرمز «ثبت توسط سرور پذیرفته نشد» — پایدار
- ریشه: ثبت‌های آفلاین با شناسهٔ موقت/حذف‌شده در آدرس (`?id=…`) هرگز همگام نمی‌شدند و در صف گیر می‌کردند
- اکنون: بازنویسی شناسه‌ها در URL + حذفِ «یافت نشد» خودکار تخلیه می‌شود + یافتن شناسهٔ واقعی ثبت‌های تکراری
- هشدار قرمز قابل‌بازشدن است: فهرست کامل + دکمهٔ «حذف از صف» با تأیید مدیر (دادهٔ سرور دست‌نخورده)

## ۲) مالی و فیس (جدید — دسترسی اصلی با مدیر)
ثبت پرداخت ماهانه هر شاگرد، مجموع‌های خودکار (شاگرد/صنف/کل مکتب)، مهلت ماهانه از تنظیمات، هشدار تأخیر با پیام آماده به والد

## ۳) پلتفرم ارتباطات (جدید)
پیام مستقیم مدیر/معلم/شاگرد/والد + اطلاعیهٔ همگانی (همه/نقش/والدین صنف) با دسته‌های تحصیلی، انضباطی و اطلاعیه

## ۴ تا ۱۵
- شاگردان: فیلتر وضعیت/جنسیت + خروجی اکسل و PDF
- معلمان: حجم کاری و پریود هفتگی + هشدار تراکم + تماس سریع
- صنف‌ها: ظرفیت + برنامهٔ هفتگی با هشدار تداخل زمانی معلم + کپی تقسیم مضامین به سال جدید
- مضامین: کد اختصاصی + واحد درسی
- حاضری: آمار سالانه + خلاصهٔ پیش از ذخیره + پیام به والدین غایب‌ها
- فعالیت‌ها: عکس + دسته‌بندی + هشدار لحظه‌ای به والد
- نمرات: ذخیرهٔ پیش‌نویس جدا از تایید نهایی + اعتبارسنجی خودکار سقف + مجموع لحظه‌ای
- خروجی Word/Excel در اپ اندروید واقعاً در Downloads ذخیره می‌شود (رفع کامل)
- تقدیرنامه‌ساز: طراحی آزاد — سایز کاغذ، جدول، رنگ‌ها، لوگو، امضاها
- بخش‌های دلخواه: فیلد فایل/عکس/تاریخ + جستجو، CSV، حذف گروهی
- کتابخانه: هشدار سررسید + جریمهٔ دیرکرد + کارت شاگرد
- تنظیمات: یادآوری خودکار پشتیبان + جریمهٔ کتابخانه + پاک‌سازی حاضری سال‌های گذشته

**APK**: نسخهٔ ۲.۲.۰ (versionCode 10) — امضای یکسان با نسخه‌های قبلی، نصب مستقیم روی نسخهٔ قدیمی
**آیفون (iOS)**: نصب به‌صورت PWA از همین آدرس سایت (راهنما در README)
BODY

curl -sf -X POST "$API/releases" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d "{\"tag_name\":\"v2.2.0\",\"name\":\"v2.2.0 — مالی، ارتباطات و همگام‌سازی پایدار\",\"body\":$(python3 -c 'import json,sys; print(json.dumps(open("/tmp/release-body.md").read()))'),\"draft\":false,\"prerelease\":false}" > /tmp/rel.json
REL_ID=$(python3 -c 'import json; print(json.load(open("/tmp/rel.json"))["id"])')
echo "Release id: $REL_ID"

echo "── آپلود APK ──"
curl -sf -X POST "https://uploads.github.com/repos/$REPO/releases/$REL_ID/assets?name=nedaalqalam-school.apk" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @download/nedaalqalam-school.apk > /tmp/asset.json
echo "آپلود شد: $(python3 -c 'import json; d=json.load(open("/tmp/asset.json")); print(d.get("browser_download_url","?"))')"
echo "✓ انتشار کامل شد — لینک‌های قدیمی همهٔ نسخه‌ها دست‌نخورده ماندند"
