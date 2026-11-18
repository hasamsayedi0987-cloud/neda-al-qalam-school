#!/usr/bin/env python3
# راستی‌آزمایی محتوای فایل پرشده — مقادیر نوشته‌شده + پاک‌سازی کهنه‌ها + فرمول‌ها
from openpyxl import load_workbook

F = "/tmp/moe-filled.xlsx"
wb = load_workbook(F)
li = wb["لیست "]
j = wb["جدول نتایج "]

print("── لیست ردیف ۱:", [li[c].value for c in ["C1", "D1", "I1", "T1", "V1"]])
print("── لیست شاگردان ۱–۱۴ (B=اسم، C=ولد، D=ولدیت):")
for r in range(4, 18):
    print(f"  ردیف {r}: {[li[f'{c}{r}'].value for c in ['B', 'C', 'D', 'F']]}")

print("\n── جدول: سربرگ D13:", j["D13"].value, "| I13:", j["I13"].value)
print("── نام شاگردان در جدول (سطر ۵، بلوک‌های M/Q/U/Z/AD/AH):")
for col in ["M", "Q", "U", "Z", "AD", "AH", "AM", "AQ", "AU", "AZ", "BD", "BH", "BL", "BP"]:
    print(f"  {col}4/5/6: شماره={j[col+'4'].value} اسم={j[col+'5'].value} ولد={j[col+'6'].value}")

print("\n── نمرات شاگرد ۱ (M13..M22) و شاگرد ۱۲ (AZ13..AZ18):")
print("  M:", [j[f"M{r}"].value for r in range(13, 23)])
print("  AZ:", [j[f"AZ{r}"].value for r in range(13, 19)])
print("\n── فرمول‌های دست‌نخورده: O13:", j["O13"].value, "| M34:", j["M34"].value[:45])
print("── پاک‌سازی کهنه‌ها؟ لیست B16/D12/E12:", li["B16"].value, li["D12"].value, li["E12"].value)

# ═══ بعد از recalc ═══
import sys
if "--recalc" in sys.argv:
    wv = load_workbook(F, data_only=True)
    jv = wv["جدول نتایج "]
    print("\n════ مقادیر محاسبه‌شده (بعد از recalc لایبره‌آفیس) ════")
    print("شاگرد ۱ (M/Q/U): نهائی=", jv["O13"].value, jv["S13"].value, jv["W13"].value, "| مجموع=", jv["O34"].value, "| نتیجه=", jv["O36"].value, "| درجه=", jv["O37"].value)
    print("شاگرد ۱۲ نسیمه (AZ): نهائی=", jv["BB13"].value, "| نتیجه=", jv["BB36"].value, "| درجه=", jv["BB37"].value)
    print("شاگرد ۱۳ آزمایشی (BD): نهائی=", jv["BF13"].value, "| نتیجه=", jv["BF36"].value, "(باید خالی باشد — فقط ۳ مضمون)")
    print("خلص: داخله=", jv["C35"].value, "| موفق=", jv["E35"].value, "| تلاش بیشتر=", jv["F35"].value, "| غایب=", jv["H35"].value)
    print("خلص سالانه (سطر ۳۸):", [jv[f"{c}38"].value for c in "CDEFGHI"])
    lv = wv["لیست "]
    print("لیست ردیف ۱ بعد recalc:", [lv[c].value for c in ["C1", "I1"]])
    print("اطلاع نامه D1:", str(wv["اطلاع نامه"]["D1"].value)[:40])
    kh = wv["خلص جدول نتایج "]
    print("خلص جدول نتایج F2:", kh["F2"].value, "| A2:", kh["A2"].value)
