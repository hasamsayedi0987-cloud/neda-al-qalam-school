#!/usr/bin/env python3
# کاوش نهایی: سطرهای ۲۷–۴۴ جدول + مضامین کامل + خلص + شقهٔ سالانه
import json, re
from collections import defaultdict

D = json.load(open("/tmp/moe-table-analysis.json"))
S = {s["title"]: s for s in D["sheets"]}

def coln(L):
    n = 0
    for ch in L: n = n*26 + ord(ch)-64
    return n

j = S["جدول نتایج "]
print("── همهٔ مضامین ستون K (سطرهای ۱۳–۴۴):")
for r in range(13, 45):
    c = f"K{r}"
    if c in j["cells"]:
        v = str(j["cells"][c].get("f", "")).strip()
        if v: print(f"  K{r}: «{v[:50]}»")

print("\n── سطرهای ۲۷–۴۴: هر چه در ستون‌های B..Y است:")
for coord_s, rec in sorted(j["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    if 27 <= r <= 44 and coln(L) <= 25:
        v = str(rec.get("f", "")).strip()
        if v: print(f"  {coord_s}: «{v[:65]}»")

print("\n── ادغام‌های سطرهای ۲۷–۴۴ (ستون‌های B..Y):")
for m in j["merged"]:
    a, b = m.split(":")
    ra = int(re.match(r"[A-Z]+(\d+)", a).group(1))
    ca = coln(re.match(r"([A-Z]+)", a).group(1)); cb = coln(re.match(r"([A-Z]+)", b).group(1))
    if 27 <= ra <= 44 and ca <= 25:
        print(f"  {m}", end="  ")
print()

kh = S["خلص جدول نتایج"]
print("\n── شیت «خلص جدول نتایج» (همهٔ متن‌ها/فرمول‌های سطرهای ۱–۳۰، ستون‌های A..J):")
cnt = 0
for coord_s, rec in sorted(kh["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and r <= 30 and cnt < 45:
        print(f"  {coord_s}: «{v[:75]}»"); cnt += 1

sa = S["شقه سالانه"]
print("\n── شیت «شقه سالانه»: سربرگ‌ها + فرمول‌های نمونه")
cnt = 0
for coord_s, rec in sorted(sa["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and (r <= 12 or (r in (13, 14) and coln(L) <= 20)) and cnt < 40:
        print(f"  {coord_s}: «{v[:60]}»"); cnt += 1

va = S["ورق اخیر جدول"]
print("\n── شیت «ورق اخیر جدول»: متن‌ها")
cnt = 0
for coord_s, rec in sorted(va["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    v = str(rec.get("f", "")).strip()
    if v and not v.startswith("=") and cnt < 20:
        print(f"  {coord_s}: «{v[:60]}»"); cnt += 1

po = S["پوش جدول"]
print("\n── شیت «پوش جدول»: متن‌ها")
for coord_s, rec in sorted(po["cells"].items()):
    v = str(rec.get("f", "")).strip()
    if v: print(f"  {coord_s}: «{v[:70]}»")
