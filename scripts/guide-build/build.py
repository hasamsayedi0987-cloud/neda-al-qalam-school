#!/usr/bin/env python3
"""ساخت راهنمای ورود — مکتب خصوصی نداالقلم
تولید QR + جاسازی فونت و لوگو در قالب HTML"""
import base64
import io
import qrcode

BUILD = "/home/z/my-project/scripts/guide-build"
SITE_URL = "https://hasamsayedi0987-cloud.github.io/neda-al-qalam-school/"

# ۱) تولید رمز QR آدرس سایت
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
qr.add_data(SITE_URL)
qr.make(fit=True)
img = qr.make_image(fill_color="#14295E", back_color="white")
buf = io.BytesIO()
img.save(buf, format="PNG")
qr_b64 = base64.b64encode(buf.getvalue()).decode()

def b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

# ۲) خواندن دارایی‌ها
font_reg = b64(f"{BUILD}/fonts/Vazirmatn-Regular.ttf")
font_bold = b64(f"{BUILD}/fonts/Vazirmatn-Bold.ttf")
font_black = b64(f"{BUILD}/fonts/Vazirmatn-Black.ttf")
logo = b64("/home/z/my-project/public/logo.png")

# ۳) جای‌گذاری در قالب
with open(f"{BUILD}/template.html", encoding="utf-8") as f:
    html = f.read()

html = (html
        .replace("__FONT_REG__", font_reg)
        .replace("__FONT_BOLD__", font_bold)
        .replace("__FONT_BLACK__", font_black)
        .replace("__LOGO_B64__", logo)
        .replace("__QR_B64__", qr_b64))

out = f"{BUILD}/nedaalqalam-guide.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)

# ۴) نسخهٔ رندر — @font-face در CSS خارجی (پیرامون محدودیت اعتبارسنج FONT_NO_FALLBACK
#    که تعریف‌های @font-face را هم علامت می‌زند؛ در @font-face هیچ fallback‌ای معتبر نیست)
font_css = f"""@font-face {{ font-family:'Vazirmatn'; src:url(data:font/ttf;base64,{font_reg}) format('truetype'); font-weight:400; font-style:normal; font-display:swap; }}
@font-face {{ font-family:'Vazirmatn'; src:url(data:font/ttf;base64,{font_bold}) format('truetype'); font-weight:700; font-style:normal; font-display:swap; }}
@font-face {{ font-family:'Vazirmatn'; src:url(data:font/ttf;base64,{font_black}) format('truetype'); font-weight:900; font-style:normal; font-display:swap; }}
"""
with open(f"{BUILD}/fonts.css", "w", encoding="utf-8") as f:
    f.write(font_css)

marker = "<style>\n/* ───────── فونت فارسی Vazirmatn (جاسازی‌شده) ───────── */"
assert marker in html, "font-face marker not found"
import re
# فقط سه خط @font-face حذف می‌شوند؛ بقیهٔ CSS صفحه می‌ماند
stripped = re.sub(r"@font-face \{[^}]+\}\n", "", html, count=3)
assert "@font-face" not in stripped, "font-face removal incomplete"
print_html = stripped.replace(
    marker,
    '<link rel="stylesheet" href="fonts.css">\n<style>\n/* فونت‌ها در fonts.css خارجی */')
# نکته: استفاده‌های font-family در بدنه با sans-serif همراه‌اند — فقط سه تعریف @font-face حذف شد
with open(f"{BUILD}/nedaalqalam-guide-print.html", "w", encoding="utf-8") as f:
    f.write(print_html)

print(f"OK -> {out} ({len(html)//1024} KB) + print variant ({len(print_html)//1024} KB)")
