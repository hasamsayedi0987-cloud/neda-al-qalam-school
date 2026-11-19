#!/usr/bin/env python3
# کاوش شیت‌های لیست، شقه، فهرست، خلص + مقایسهٔ الگوی بلوک‌های شاگرد
import json, re
from collections import defaultdict

D = json.load(open("/tmp/moe-table-analysis.json"))
S = {s["title"]: s for s in D["sheets"]}

def coln(L):
    n = 0
    for ch in L: n = n*26 + ord(ch)-64
    return n

li = S["لیست "]
print("── شیت «لیست»: سربرگ‌ها و نمونهٔ داده")
for coord_s, rec in sorted(li["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and (r <= 4 or coln(L) <= 3):
        print(f"  {coord_s}: «{v[:50]}»")
print("  merged (اولین ۱۲):", li["merged"][:12])

sh = S["شقه 4.5"]
print("\n── شیت «شقه 4.5»: سربرگ‌ها")
cnt = 0
for coord_s, rec in sorted(sh["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and not v.startswith("=") and cnt < 28:
        print(f"  {coord_s}: «{v[:40]}»"); cnt += 1

fe = S["فهرست مضمونوار"]
print("\n── شیت «فهرست مضمونوار»: سربرگ‌ها")
cnt = 0
for coord_s, rec in sorted(fe["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and not v.startswith("=") and cnt < 30:
        print(f"  {coord_s}: «{v[:40]}»"); cnt += 1

kh = S["خلص جدول نتایج"]
print("\n── شیت «خلص جدول نتایج»: سربرگ‌ها + فرمول‌ها")
cnt = 0
for coord_s, rec in sorted(kh["cells"].items(), key=lambda kv: (int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)), coln(re.match(r'([A-Z]+)', kv[0]).group(1)))):
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    v = str(rec.get("f", "")).strip()
    if v and cnt < 30:
        print(f"  {coord_s}: «{v[:70]}»"); cnt += 1

# بلوک‌های شاگرد در جدول نتایج — شمارش ارجاعات لیست!A{n}
j = S["جدول نتایج "]
refs = defaultdict(list)
for coord_s, rec in j["cells"].items():
    L, r = re.match(r"([A-Z]+)(\d+)", coord_s).group(1), int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    f = str(rec.get("f", ""))
    if r == 4:
        m = re.search(r"لیست '!([A-Z]+)(\d+)", f)
        if m and m.group(1) == "A":
            refs[int(m.group(2))].append(L)
print("\n── بلوک‌های شاگرد در جدول (ارجاع لیست!A{سطر} در سطر ۴):")
rows_ref = sorted(refs)
print(f"  تعداد بلوک: {len(rows_ref)} | سطرهای لیست ارجاع‌شده: {rows_ref[:8]}…{rows_ref[-3:] if len(rows_ref)>8 else ''}")
print(f"  ستون‌های نام بلوک‌ها: {[refs[r][0] for r in rows_ref[:10]]} … {[refs[r][0] for r in rows_ref[-5:]]}")

# مضامین سطرها در جدول (ستون K)
subs = []
for r in range(13, 45):
    c = f"K{r}"
    if c in j["cells"]:
        v = str(j["cells"][c].get("f","")).strip()
        if v and not v.startswith("="): subs.append((r, v))
print("\n── مضامین سطرها (ستون K، سطرهای ۱۳–۴۴):", subs)
