#!/usr/bin/env bash
# GitHub Release v2.2.1 — سه اصلاح گزارش کاربر
set -e
cd "$(dirname "$0")/.."
TOKEN="${GITHUB_TOKEN:?توکن گیت‌هاب لازم است}"
REPO="hasamsayedi0987-cloud/neda-al-qalam-school"
API="https://api.github.com/repos/$REPO"

cat > /tmp/release-v221-body.md << 'BODY'
# نسخهٔ ۲.۲.۱ — داشبورد آفلاین درست، اعلان پیام و حذف پیام، اسکرول منو

## ۱) اصلاح داشبورد در حالت آفلاین
- تعداد شاگردان، معلمان، کارمندان و صنف‌ها حالا در حالت آفلاین به‌درستی نمایش داده می‌شود
- ریشهٔ مشکل: کش داشبورد بین کاربران مشترک بود — روی گوشی مشترک، دادهٔ حساب قبلی (مثلاً شاگرد) به مدیر نمایش داده می‌شد (صفر و undefined)
- اکنون کش داشبورد/اعلان‌ها/پیام‌ها به‌ازای هر کاربر جدا می‌شود
- اگر کش داشبورد نبود: آمار از آخرین داده‌های ذخیره‌شدهٔ بخش شاگردان/معلمان/صنف‌ها ساخته می‌شود (با یادداشت شفاف)
- «undefined» حاضری امروز ریشه‌کن شد — فقط دادهٔ واقعی روز جاری رندر می‌شود

## ۲) اصلاح اعلان‌ها و پیام‌ها
- با رسیدن پیام جدید، اعلان کوتاه بالای صفحه نشان داده می‌شود
- تعداد اعلان‌های خوانده‌نشده کنار زنگ اعلان بالای صفحه دیده می‌شود (پیام‌ها هم اعلان می‌سازند)
- پیام‌ها حالا قابل حذف‌اند: حذفِ پیام دریافتی فقط برای شماست؛ حذف پیام مستقیمِ خودتان کامل است

## ۳) اصلاح تب‌های منو
- فهرست بخش‌ها با اسکرول لمسی بومی کار می‌کند — همهٔ تب‌ها تا پایین (کتابخانه و…) در دسترس‌اند
- (مشکل: ScrollArea در اندروید-وب‌ویو لمس را نمی‌گرفت)

**APK**: نسخهٔ ۲.۲.۱ (versionCode 11) — امضای یکسان با همهٔ نسخه‌های قبلی، نصب مستقیم روی نسخهٔ قدیمی
BODY

curl -sf -X POST "$API/releases" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -d "{\"tag_name\":\"v2.2.1\",\"name\":\"v2.2.1 — داشبورد آفلاین + اعلان و حذف پیام + اسکرول منو\",\"body\":$(python3 -c 'import json; print(json.dumps(open("/tmp/release-v221-body.md").read()))'),\"draft\":false,\"prerelease\":false}" > /tmp/rel221.json
REL_ID=$(python3 -c 'import json; print(json.load(open("/tmp/rel221.json"))["id"])')
echo "Release id: $REL_ID"

curl -sf -X POST "https://uploads.github.com/repos/$REPO/releases/$REL_ID/assets?name=nedaalqalam-school.apk" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @download/nedaalqalam-school.apk > /tmp/asset221.json
echo "آپلود شد: $(python3 -c 'import json; d=json.load(open("/tmp/asset221.json")); print(d.get("browser_download_url","?"))')"
echo "✓ انتشار کامل شد — لینک‌های قدیمی همهٔ نسخه‌ها دست‌نخورده ماندند"
