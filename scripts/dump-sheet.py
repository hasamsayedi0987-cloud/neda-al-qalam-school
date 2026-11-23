#!/usr/bin/env python3
# استخراج کامل ساختار یک شیت: مقادیر، ادغام‌ها، عرض ستون‌ها، بلندی سطرها، استایل کلیدی
import sys, re
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

path = sys.argv[1]
sheet = sys.argv[2]
c1, c2 = sys.argv[3], sys.argv[4]   # بازهٔ ستون‌ها مثل B AA
r1, r2 = int(sys.argv[5]), int(sys.argv[6])

wb = load_workbook(path)
ws = wb[sheet]
ci1, ci2 = ws[c1 + '1'].column, ws[c2 + '1'].column

print(f'════ شیت [{sheet}] ستون‌های {c1}..{c2} سطرهای {r1}..{r2}')
print('── ادغام‌ها:')
for m in ws.merged_cells.ranges:
    if m.min_col >= ci1 - 1 and m.max_col <= ci2 + 1 and m.min_row >= r1 - 1 and m.max_row <= r2 + 1:
        print(f'   {m.coord}', end='')
print()
print('── عرض ستون‌ها:')
for c in range(ci1, ci2 + 1):
    L = get_column_letter(c)
    d = ws.column_dimensions.get(L)
    if d and d.width:
        print(f'   {L}={round(d.width,1)}', end='')
print()
print('── بلندی سطرها:')
for r in range(r1, r2 + 1):
    d = ws.row_dimensions.get(r)
    if d and d.height:
        print(f'   r{r}={round(d.height,1)}', end='')
print()
print('── حجره‌ها (مقدار | استایل):')
for r in range(r1, r2 + 1):
    cells = []
    for c in range(ci1, ci2 + 1):
        cell = ws.cell(row=r, column=c)
        v = cell.value
        if v is None:
            continue
        flags = []
        if cell.font and cell.font.bold: flags.append('B')
        if cell.font and cell.font.size and cell.font.size != 11: flags.append(f'sz{cell.font.size}')
        if cell.fill and cell.fill.fgColor and cell.fill.patternType: flags.append(f'fill{cell.fill.fgColor.rgb}')
        al = cell.alignment
        if al and al.horizontal: flags.append(al.horizontal[:4])
        if al and al.wrap_text: flags.append('wrap')
        b = cell.border
        sides = ''.join(nm for s, nm in ((getattr(b, 'left', None), 'L'), (getattr(b, 'right', None), 'R'), (getattr(b, 'top', None), 'T'), (getattr(b, 'bottom', None), 'B')) if s and s.style) if b else ''
        if sides: flags.append('bd' + sides)
        sf = f'[{",".join(flags)}]' if flags else ''
        cells.append(f'{get_column_letter(c)}{r}={repr(v)[:70]}{sf}')
    if cells:
        print(f'  ر{r}: ' + ' | '.join(cells))
