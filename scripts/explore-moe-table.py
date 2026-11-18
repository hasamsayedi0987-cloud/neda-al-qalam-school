#!/usr/bin/env python3
# کاوش ساختار شیت‌های کلیدی فایل اصلی — سربرگ‌ها، فرمول‌ها، الگوی ستون‌ها
import json, re
from collections import defaultdict

D = json.load(open("/tmp/moe-table-analysis.json"))
S = {s["title"]: s for s in D["sheets"]}

def ref_split(coord):
    m = re.match(r"([A-Z]+)(\d+)", coord)
    col = 0
    for ch in m.group(1): col = col*26 + ord(ch)-64
    return m.group(1), int(m.group(2))

# ── شیت «جدول نتایج» — ساختار عمودی
j = S["جدول نتایج "]
print("=" * 70)
print("شیت جدول نتایج — merged pattern (اولین ۴۰):")
# گروه‌بندی ادغام‌ها بر اساس سطر
by_row = defaultdict(list)
for m in j["merged"]:
    a, b = m.split(":")
    ca, ra = ref_split(a); cb, rb = ref_split(b)
    by_row[ra].append((ca, cb, ra, rb))
for r in sorted(by_row)[:14]:
    spans = sorted(by_row[r])[:8]
    print(f"  سطر {r}: {len(by_row[r])} ادغام → " + ", ".join(f"{a}{r}:{b}{rb}" for a,b,_,rb in spans))

print("\nسربرگ‌ها (حجره‌های متنی سطرهای ۴–۱۰):")
for coord, rec in sorted(j["cells"].items(), key=lambda kv: (ref_split(kv[0])[1], ref_split(kv[0])[0])):
    L, r = ref_split(coord)
    if r <= 10 and "f" in rec and not str(rec["f"]).startswith("="):
        v = rec["f"][:30]
        if v.strip(): print(f"  {coord}: «{v}» font={rec['font']['name']}/{rec['font']['size']}{'B' if rec['font']['bold'] else ''} fill={rec['fill']['fg']}")

print("\nنمونهٔ سطرهای شاگردان — حجره‌های دارای مقدار/فرمول (سطرهای ۱۱–۱۴، ستون‌های اول ۲۰):")
for coord, rec in sorted(j["cells"].items(), key=lambda kv: (ref_split(kv[0])[1], ref_split(kv[0])[0])):
    L, r = ref_split(coord)
    if 11 <= r <= 14:
        col = col_n = 0
        for ch in L: col_n = col_n*26 + ord(ch)-64
        if col_n <= 40 and "f" in rec:
            print(f"  {coord}: «{rec['f'][:60]}»")

# فرمول‌های منحصربه‌فرد (الگوها)
print("\nالگوهای فرمول منحصربه‌فرد (۲۵ نمونه):")
fpat = defaultdict(list)
for coord, rec in j["cells"].items():
    if "f" in rec and str(rec["f"]).startswith("="):
        L, r = ref_split(coord)
        # عمومیت‌سازی: ارجاع سطری/ستونی را جایگزین کن
        pat = re.sub(r"\d+", "n", re.sub(r"\$?\b[A-Z]{1,3}\$?\d+", "C", str(rec["f"])))
        fpat[pat].append(coord)
for pat, coords in sorted(fpat.items(), key=lambda kv: -len(kv[1]))[:25]:
    print(f"  ×{len(coords):4d} {pat[:70]} | نمونه: {coords[0]}")

# data validations
print("\nاعتبارسنجی‌ها:", json.dumps(j.get("dataValidations", []), ensure_ascii=False)[:300])
print("ارتفاع سطرها (اولین ۱۲):", dict(list(j["rowHeights"].items())[:12]))
print("عرض ستون‌ها (اولین ۱۵):", dict(list(j["colWidths"].items())[:15]))
