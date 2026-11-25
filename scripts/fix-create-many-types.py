#!/usr/bin/env python3
# رفع TS2322 — آرایه‌های createMany با نوع رسمی Prisma (نسخهٔ دوم — تحمل اجرای مجدد)
import sys

p = 'src/app/api/sms/route.ts'
s = open(p, encoding='utf-8').read()
changed = False

# import Prisma
if 'Prisma } from' not in s:
    old_imp = "import { randomUUID, createHash } from 'crypto';"
    assert old_imp in s, 'import anchor missing'
    s = s.replace(old_imp, old_imp + "\nimport { Prisma } from '@prisma/client';", 1)
    changed = True

ANN = 'Array<{ to: string; studentId: string; category: string; refDate: string; clientToken: string; body: string }>'
FIXED = 'Prisma.SmsOutboxCreateManyInput[]'
for name in ['rows', 'feeRows', 'examRows']:
    old = f'const {name}: {ANN} = [];'
    new = f'const {name}: {FIXED} = [];'
    if old in s:
        s = s.replace(old, new, 1); changed = True
    elif new not in s:
        print(f'✗ {name}: هیچ‌یک از دو فرم یافت نشد'); sys.exit(1)

# noticeRows — فرم map (بدون حاشیهٔ نوع)
old_map = '      const noticeRows = students\n        .filter((s) => s.guardianPhone)\n        .map((s) => ({'
new_map = f'      const noticeRows: {FIXED} = students\n        .filter((s) => s.guardianPhone)\n        .map((s) => ({{'
if old_map in s:
    s = s.replace(old_map, new_map, 1); changed = True
elif 'const noticeRows: Prisma.SmsOutboxCreateManyInput[]' not in s:
    print('✗ noticeRows یافت نشد'); sys.exit(1)

open(p, 'w', encoding='utf-8').write(s)
print('✓ انواع createMany اصلاح شد' + ('' if changed else ' (از قبل)'))
