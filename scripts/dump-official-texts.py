#!/usr/bin/env python3
# استخراج کامل متن‌های شیت جدول نتایج + اطلاع نامه از فایل رسمی ۱۴۰۵ صنف دوم
import re
from openpyxl import load_workbook

PATH = '/home/z/my-project/upload/1جدول نتایج سالانه1405جدید صنف دوم.xlsx'
wb = load_workbook(PATH, data_only=False)

def dump(sheet_name, max_row=None):
    ws = wb[sheet_name]
    print(f'══════════════ شیت [{sheet_name}] dims={ws.dimensions} max_row={ws.max_row} max_col={ws.max_column}')
    print('── ادغام‌ها:')
    print('   ' + ' '.join(m.coord for m in ws.merged_cells.ranges))
    print('── عرض ستون‌ها:')
    for L, d in sorted(ws.column_dimensions.items()):
        if d.width:
            print(f'   {L}={round(d.width, 1)}', end='')
    print()
    print('── سلول‌های متنی (همه):')
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if v is None:
                continue
            s = str(v).strip()
            if not s:
                continue
            # فرمول‌ها را هم نشان بده
            print(f'   {c.coordinate}: {s!r}')

dump('جدول نتایج ')
dump('اطلاع نامه')
