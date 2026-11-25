#!/usr/bin/env python3
# انتقال بلوک priorStatus به بعد از تعریف reqIds (رفع TS2448)
import sys

p = 'src/app/api/attendance/route.ts'
s = open(p, encoding='utf-8').read()

block = """    // وضعیت قبلی هر شاگرد در این تاریخ — اعلان غیبت فقط برای «غیبت تازه» است؛
    // ذخیرهٔ مجدد همان روز (بدون تغییر وضعیت) پیام/اعلان تکراری نمی‌سازد
    const priorRecs = reqIds.length
      ? await db.attendanceRecord.findMany({
          where: { studentId: { in: reqIds }, date },
          select: { studentId: true, status: true },
        })
      : [];
    const priorStatus = new Map(priorRecs.map((r) => [r.studentId, r.status] as const));
"""
if block not in s:
    print('✗ بلوک یافت نشد'); sys.exit(1)
s = s.replace(block, '', 1)

anchor = "    const validIds = new Set(classStudents.map((s) => s.id));\n"
assert anchor in s, 'validIds anchor missing'
s = s.replace(anchor, anchor + block, 1)

open(p, 'w', encoding='utf-8').write(s)
print('✓ بلوک منتقل شد')
