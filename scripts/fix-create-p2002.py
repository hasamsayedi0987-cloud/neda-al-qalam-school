#!/usr/bin/env python3
# جایگزینی skipDuplicates (پشتیبانی‌نشده در تایپ کلاینت) با create تکی + گرفتن P2002
import sys

p = 'src/app/api/sms/route.ts'
s = open(p, encoding='utf-8').read()

def swap(old, new, tag):
    global s
    if old not in s:
        if new in s:
            print(f'• {tag}: قبلاً اعمال شده'); return
        print(f'✗ NOT FOUND ({tag}): {old[:70]!r}'); sys.exit(1)
    s = s.replace(old, new, 1)
    print(f'✓ {tag}')

P2002 = """        } catch (err) {
          // شناسهٔ یکتای پیام قبلاً ثبت شده (درخواست هم‌زمان یا کلیک دوباره) — تکرار نمی‌سازیم
          if ((err as { code?: string })?.code === 'P2002') { skipped += 1; continue; }
          throw err;
        }
      }
      return NextResponse.json({
        queued,
        skipped,
        note: queued === 0 ?"""

swap("""      // skipDuplicates + clientToken یکتا = ضدتکرار اتمی؛ دو درخواست هم‌زمان پیام دوباره نمی‌سازند
      const res = rows.length ? await db.smsOutbox.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: res.count,
        skipped: rows.length - res.count,
        note: res.count === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     """      // clientToken یکتا = ضدتکرار اتمی؛ درخواست هم‌زمان یا کلیک دوباره با P2002 مردود می‌شود
      let queued = 0;
      let skipped = 0;
      for (const row of rows) {
        try {
          await db.smsOutbox.create({ data: row });
          queued += 1;
        } catch (err) {
          // شناسهٔ یکتای پیام قبلاً ثبت شده — تکرار نمی‌سازیم
          if ((err as { code?: string })?.code === 'P2002') { skipped += 1; continue; }
          throw err;
        }
      }
      return NextResponse.json({
        queued,
        skipped,
        note: queued === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     'queue-attendance')

swap("""      const feeRes = feeRows.length ? await db.smsOutbox.createMany({ data: feeRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: feeRes.count,
        skipped: feeRows.length - feeRes.count,
        note: feeRes.count === 0 ? 'متعلم باقی‌مانده با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     """      let feeQueued = 0;
      let feeSkipped = 0;
      for (const row of feeRows) {
        try {
          await db.smsOutbox.create({ data: row });
          feeQueued += 1;
        } catch (err) {
          if ((err as { code?: string })?.code === 'P2002') { feeSkipped += 1; continue; }
          throw err;
        }
      }
      return NextResponse.json({
        queued: feeQueued,
        skipped: feeSkipped,
        note: feeQueued === 0 ? 'متعلم باقی‌مانده با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     'queue-fee')

swap("""      const examRes = examRows.length ? await db.smsOutbox.createMany({ data: examRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: examRes.count,
        skipped: examRows.length - examRes.count,
        note: examRes.count === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     """      let examQueued = 0;
      let examSkipped = 0;
      for (const row of examRows) {
        try {
          await db.smsOutbox.create({ data: row });
          examQueued += 1;
        } catch (err) {
          if ((err as { code?: string })?.code === 'P2002') { examSkipped += 1; continue; }
          throw err;
        }
      }
      return NextResponse.json({
        queued: examQueued,
        skipped: examSkipped,
        note: examQueued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     'queue-exam')

swap("""      const noticeRes = noticeRows.length ? await db.smsOutbox.createMany({ data: noticeRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: noticeRes.count,
        skipped: noticeRows.length - noticeRes.count,
        note: noticeRes.count === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     """      let noticeQueued = 0;
      let noticeSkipped = 0;
      for (const row of noticeRows) {
        try {
          await db.smsOutbox.create({ data: row });
          noticeQueued += 1;
        } catch (err) {
          if ((err as { code?: string })?.code === 'P2002') { noticeSkipped += 1; continue; }
          throw err;
        }
      }
      return NextResponse.json({
        queued: noticeQueued,
        skipped: noticeSkipped,
        note: noticeQueued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });""",
     'queue-notice')

# noticeRows دیگر نیازی به نوع رسمی Prisma ندارد ولی بی‌ضرر است — بماند
open(p, 'w', encoding='utf-8').write(s)
print('✓ همهٔ createManyها به create+P2002 تبدیل شد')
