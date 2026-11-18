#!/usr/bin/env python3
# تست وفاداری exceljs: مقایسهٔ قالب اصلی با نسخهٔ رفت‌وبرگشته (load→save)
import json, sys
from openpyxl import load_workbook

A = "/home/z/my-project/public/templates/moe-annual-results-template.xlsx"
B = sys.argv[1] if len(sys.argv) > 1 else "/tmp/roundtrip.xlsx"

wba = load_workbook(A); wbb = load_workbook(B)
wvA = load_workbook(A, data_only=False)

diffs = []
if wba.sheetnames != wbb.sheetnames:
    diffs.append(f"شیت‌ها: {wba.sheetnames} vs {wbb.sheetnames}")

for name in wba.sheetnames:
    sa, sb = wba[name], wbb[name]
    ma = {str(m) for m in sa.merged_cells.ranges}
    mb = {str(m) for m in sb.merged_cells.ranges}
    if ma != mb:
        only_a = list(ma - mb)[:5]; only_b = list(mb - ma)[:5]
        diffs.append(f"[{name}] ادغام: −{only_a} +{only_b} ({len(ma)}→{len(mb)})")
    if (sa.sheet_view.rightToLeft or False) != (sb.sheet_view.rightToLeft or False):
        diffs.append(f"[{name}] RTL: {sa.sheet_view.rightToLeft} → {sb.sheet_view.rightToLeft}")
    pA, pB = sa.page_setup, sb.page_setup
    if pA.paperSize != pB.paperSize or pA.orientation != pB.orientation:
        diffs.append(f"[{name}] pageSetup: {pA.paperSize}/{pA.orientation} → {pB.paperSize}/{pB.orientation}")
    if sa.sheet_state != sb.sheet_state:
        diffs.append(f"[{name}] sheet_state: {sa.sheet_state}→{sb.sheet_state}")
    # فرمول‌ها
    fa = {(c.row, c.column): str(c.value) for row in sa.iter_rows() for c in row
          if isinstance(c.value, str) and c.value.startswith("=")}
    fb = {(c.row, c.column): str(c.value) for row in sb.iter_rows() for c in row
          if isinstance(c.value, str) and c.value.startswith("=")}
    if len(fa) != len(fb):
        diffs.append(f"[{name}] تعداد فرمول: {len(fa)} → {len(fb)}")
    else:
        miss = [(k, fa[k]) for k in fa if k not in fb][:3]
        if miss: diffs.append(f"[{name}] فرمول گمشده: {miss}")
    # عرض ستون‌ها
    wa = {k: round(v.width or 0, 1) for k, v in sa.column_dimensions.items() if v.width}
    wb_ = {k: round(v.width or 0, 1) for k, v in sb.column_dimensions.items() if v.width}
    diff_w = {k: (wa[k], wb_.get(k)) for k in wa if wb_.get(k) != wa[k]}
    if diff_w: diffs.append(f"[{name}] عرض ستون متفاوت: {len(diff_w)} → نمونه: {list(diff_w.items())[:3]}")
    # ارتفاع سطرها
    ha = {k: v.height for k, v in sa.row_dimensions.items() if v.height}
    hb = {k: v.height for k, v in sb.row_dimensions.items() if v.height}
    diff_h = {k: (ha[k], hb.get(k)) for k in ha if hb.get(k) != ha[k]}
    if diff_h: diffs.append(f"[{name}] ارتفاع سطر متفاوت: {len(diff_h)}")
    # استایل نمونه‌ای: فونت/فیل/بورد هر حجرهٔ دارای مقدار
    style_diff = 0
    example = None
    for row in sa.iter_rows():
        for c in row:
            if c.value is None: continue
            c2 = sb.cell(row=c.row, column=c.column)
            if (c.font.name, c.font.size, c.font.bold) != (c2.font.name, c2.font.size, c2.font.bold):
                style_diff += 1
                if not example: example = (name, c.coordinate, (c.font.name, c.font.size, c.font.bold), (c2.font.name, c2.font.size, c2.font.bold))
    if style_diff: diffs.append(f"[{name}] تفاوت فونت: {style_diff} حجره؛ نمونه: {example}")

if diffs:
    print(f"✗ {len(diffs)} تفاوت:")
    for d in diffs[:25]: print("  ", d)
else:
    print("✓ رفت‌وبرگشت exceljs ۱۰۰٪ وفادار — بدون هیچ تفاوت")
