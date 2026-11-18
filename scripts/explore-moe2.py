#!/usr/bin/env python3
# کاوش عمیق: بلوک مضامین + سطرهای شاگرد + فرمول‌ها در جدول نتایج
import json, re
from collections import defaultdict

D = json.load(open("/tmp/moe-table-analysis.json"))
S = {s["title"]: s for s in D["sheets"]}

def coln(L):
    n = 0
    for ch in L: n = n*26 + ord(ch)-64
    return n

def coord(c, r):
    s = ""
    while c: c, m = divmod(c-1, 26); s = chr(65+m)+s
    return s + str(r)

j = S["جدول نتایج "]
cells = j["cells"]

# ۱) نام مضامین: حجره‌های متنی سطرهای ۴–۹ در محدوده ستون‌های بالا (قبل از بخش تکراری)
print("── مضامین (متن‌های سطرهای ۴–۹، ستون‌های AD تا BJ):")
seen = {}
for coord_s, rec in cells.items():
    L = re.match(r"([A-Z]+)(\d+)", coord_s).group(1); r = int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    if 4 <= r <= 9 and 30 <= coln(L) <= 100 and "f" in rec:
        v = str(rec["f"]).strip()
        if v and not v.startswith("="):
            seen.setdefault(v, []).append(coord_s)
for v, cs in seen.items():
    print(f"  «{v[:28]}» → {cs[:4]}")

# ۲) سطرهای ۱۰–۱۲: عنوان ستون‌های بخش معلومات + شروع داده
print("\n── سربرگ ستون‌های معلومات (B تا AC، سطرهای ۴–۱۲):")
for coord_s, rec in sorted(cells.items(), key=lambda kv: (coln(re.match(r'([A-Z]+)', kv[0]).group(1)), int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)))):
    L = re.match(r"([A-Z]+)(\d+)", coord_s).group(1); r = int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    if 4 <= r <= 12 and 2 <= coln(L) <= 29 and "f" in rec:
        v = str(rec["f"]).strip()
        if v: print(f"  {coord_s}: «{v[:40]}»")

# ۳) سطرهای شاگرد ۱۳–۲۶: فرمول‌ها در محدوده B..AC
print("\n── سطرهای شاگرد ۱۳–۲۶ (فرمول/مقدار، ستون B..AC):")
rows_map = defaultdict(list)
for coord_s, rec in cells.items():
    L = re.match(r"([A-Z]+)(\d+)", coord_s).group(1); r = int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    if 13 <= r <= 26 and 2 <= coln(L) <= 29 and "f" in rec:
        rows_map[r].append((coord_s, str(rec["f"])[:70], rec.get("numfmt", "")))
for r in range(13, 27):
    items = sorted(rows_map.get(r, []))
    if items:
        print(f" سطر {r}:")
        for c, v, nf in items[:12]:
            print(f"   {c}: {v}" + (f" [nf:{nf[:20]}]" if nf else ""))

# ۴) سطرهای ۲۷–۴۴ چه دارند؟
print("\n── سطرهای ۲۷–۴۴ (متن‌ها و فرمول‌ها، ستون‌های B..AC):")
for coord_s, rec in sorted(cells.items(), key=lambda kv: (coln(re.match(r'([A-Z]+)', kv[0]).group(1)), int(re.match(r'([A-Z]+)(\d+)', kv[0]).group(2)))):
    L = re.match(r"([A-Z]+)(\d+)", coord_s).group(1); r = int(re.match(r"([A-Z]+)(\d+)", coord_s).group(2))
    if 27 <= r <= 44 and 2 <= coln(L) <= 29 and "f" in rec:
        v = str(rec["f"])
        if v.strip(): print(f"  {coord_s}: «{v[:60]}»")
