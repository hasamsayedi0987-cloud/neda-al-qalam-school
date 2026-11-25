#!/usr/bin/env python3
# مرحلهٔ ۳ امنیت/دقت حاضری — تفکیک صلاحیت، ضدتکرار، ثبت‌کننده و زمان، SMS غیبت یک‌بار
import sys

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            print(f'✗ NOT FOUND in {path}: {old[:80]!r}'); sys.exit(1)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path}')

def add_to_model(path, model, pairs, label):
    """ویرایش درون بلوک یک مدل خاص پرisma — بی‌خطر نسبت به مدل‌های مشابه"""
    s = open(path, encoding='utf-8').read()
    tag = f'model {model} '
    start = s.index(tag)
    end = s.index('\n}', start)
    block = s[start:end]
    for old, new in pairs:
        if new in block:
            print(f'• {model}/{label} قبلاً در {path}'); continue
        assert old in block, f'anchor missing in {model} ({path}): {old[:60]!r}'
        block = block.replace(old, new, 1)
    s = s[:start] + block + s[end:]
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path} → {model} ({label})')

# ─── ۱) اسکیما: recordedBy پرسنل + refDate پیام‌کوتاه (هر دو اسکیما هم‌زمان) ───
for schema in ['prisma/schema.postgres.prisma', 'prisma/schema.prisma']:
    add_to_model(schema, 'EmployeeAttendance', [
        ('  status    String // PRESENT | ABSENT | SICK | LEAVE\n',
         '  status    String // PRESENT | ABSENT | SICK | LEAVE\n  recordedBy String? // کاربر ثبت‌کنندهٔ حاضری (نسخهٔ ۳.۸.۲)\n'),
    ], 'recordedBy')
    add_to_model(schema, 'SmsOutbox', [
        ('  studentId String?\n',
         '  studentId String?\n  refDate   String? // تاریخ مرجع پیام (مثلاً تاریخ غیبت) — مبنای جلوگیری از پیام تکراری (نسخهٔ ۳.۸.۲)\n'),
        ('  @@index([category])', '  @@index([category])\n  @@index([category, refDate])'),
    ], 'refDate')

# ─── ۲) API حاضری ───
edit('src/app/api/attendance/route.ts', [
    # ثبت‌کنندهٔ حاضری پرسنل
    ("""        staffOps.push(db.employeeAttendance.upsert({
          where: { userId_date: { userId, date } },
          update: { status },
          create: { userId, date, status },
        }));""",
     """        staffOps.push(db.employeeAttendance.upsert({
          where: { userId_date: { userId, date } },
          update: { status, recordedBy: me.id },
          create: { userId, date, status, recordedBy: me.id },
        }));"""),
    # حاضری آینده ثبت نمی‌شود
    ("""    // معلم: فقط حاضری صنف‌های تحت تدریس خود
    await assertClassScope(me, classId);""",
     """    // معلم: فقط حاضری صنف‌های تحت تدریس خود
    await assertClassScope(me, classId);
    // ثبت دقیق — حاضری برای تاریخ آینده معنا ندارد و رد می‌شود
    if (date > isoToday()) throw new ApiError('ثبت حاضری برای تاریخ آینده مجاز نیست');"""),
    # وضعیت قبلی — اعلان فقط برای غیبت تازه
    ("""    let saved = 0;
    const absentStudents: string[] = [];""",
     """    let saved = 0;
    const absentStudents: string[] = [];
    // وضعیت قبلی هر شاگرد در این تاریخ — اعلان غیبت فقط برای «غیبت تازه» است؛
    // ذخیرهٔ مجدد همان روز (بدون تغییر وضعیت) پیام/اعلان تکراری نمی‌سازد
    const priorRecs = reqIds.length
      ? await db.attendanceRecord.findMany({
          where: { studentId: { in: reqIds }, date },
          select: { studentId: true, status: true },
        })
      : [];
    const priorStatus = new Map(priorRecs.map((r) => [r.studentId, r.status] as const));"""),
    ("      if (status === 'ABSENT') absentStudents.push(studentId);",
     "      if (status === 'ABSENT' && priorStatus.get(studentId) !== 'ABSENT') absentStudents.push(studentId);"),
    # GET daily — نام ثبت‌کننده‌ها
    ("""      const records = await db.attendanceRecord.findMany({
        where: { classId, ...(date ? { date } : {}) },
        orderBy: { date: 'desc' },
      });
      return NextResponse.json({ students, records, classInfo: { id: cls.id, name: cls.name } });""",
     """      const records = await db.attendanceRecord.findMany({
        where: { classId, ...(date ? { date } : {}) },
        orderBy: { date: 'desc' },
      });
      // نام کاربران ثبت‌کنندهٔ حاضری — برای نمایش «ثبت‌کننده و زمان» در رابط
      const recIds = [...new Set(records.slice(0, 200).map((r) => r.recordedBy).filter((v): v is string => Boolean(v)))];
      const recorderUsers = recIds.length
        ? await db.user.findMany({ where: { id: { in: recIds } }, select: { id: true, name: true } })
        : [];
      const recorderNames = Object.fromEntries(recorderUsers.map((u) => [u.id, u.name]));
      return NextResponse.json({ students, records, classInfo: { id: cls.id, name: cls.name }, recorderNames });"""),
    # GET staff — نام ثبت‌کننده‌ها
    ("""      return NextResponse.json({ records, staff });""",
     """      // نام ثبت‌کنندهٔ حاضری پرسنل (مدیر/سرمعلم می‌بینند چه کسی ثبت کرده)
      const staffRecIds = [...new Set(records.slice(0, 200).map((r) => r.recordedBy).filter((v): v is string => Boolean(v)))];
      const staffRecUsers = staffRecIds.length
        ? await db.user.findMany({ where: { id: { in: staffRecIds } }, select: { id: true, name: true } })
        : [];
      return NextResponse.json({ records, staff, recorderNames: Object.fromEntries(staffRecUsers.map((u) => [u.id, u.name])) });"""),
    # import isoToday
    ("import { jalaliMonthRange, jalaliToGregorian } from '@/lib/jalali';",
     "import { jalaliMonthRange, jalaliToGregorian, isoToday } from '@/lib/jalali';"),
])

# ─── ۳) SMS غیبت — یک‌بار برای هر شاگرد در هر تاریخ ───
edit('src/app/api/sms/route.ts', [
    ("""      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      let queued = 0;
      for (const rec of absents) {
        const phone = rec.student.guardianPhone;
        if (!phone) continue;
        await db.smsOutbox.create({
          data: {
            to: phone,
            studentId: rec.studentId,
            category: 'ATTENDANCE',
            body: fill(templates.ATTENDANCE, {""",
     """      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      // جلوگیری از پیام تکراری — شاگردانی که برای همین تاریخ قبلاً پیام غیبت در صف یا ارسال‌شده دارند
      const already = await db.smsOutbox.findMany({
        where: { category: 'ATTENDANCE', refDate: date, status: { in: ['PENDING', 'SENT'] } },
        select: { studentId: true },
      });
      const alreadySent = new Set(already.map((m) => m.studentId).filter(Boolean) as string[]);
      let queued = 0;
      let skipped = 0;
      for (const rec of absents) {
        if (alreadySent.has(rec.studentId)) { skipped += 1; continue; }
        const phone = rec.student.guardianPhone;
        if (!phone) continue;
        await db.smsOutbox.create({
          data: {
            to: phone,
            studentId: rec.studentId,
            category: 'ATTENDANCE',
            refDate: date,
            body: fill(templates.ATTENDANCE, {"""),
    ("      return NextResponse.json({ queued, note: queued === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined });",
     "      return NextResponse.json({ queued, skipped, note: queued === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined });"),
])

# ─── ۴) نمای حاضری — نمایش ثبت‌کننده و زمان ───
edit('src/components/app/attendance-view.tsx', [
    ("interface DailyRecord { studentId: string; date: string; status: string }",
     "interface DailyRecord { studentId: string; date: string; status: string; recordedBy?: string | null; updatedAt?: string }"),
    ("      const data = await apiGet<{ students: StudentInfo[]; records: DailyRecord[] }>(",
     "      const data = await apiGet<{ students: StudentInfo[]; records: DailyRecord[]; recorderNames?: Record<string, string> }>("),
    ("""      const todayRecs = data.records.filter((r) => r.date === date);
      const m: Record<string, Status> = {};""",
     """      const todayRecs = data.records.filter((r) => r.date === date);
      // ثبت‌کننده و زمان آخرین ثبت حاضری این روز — برای نمایش شفافیت
      const withMeta = todayRecs.filter((r) => r.recordedBy);
      if (withMeta.length && data.recorderNames) {
        const latest = withMeta.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
        const at = latest.updatedAt
          ? `${isoToJalaliDisplay(latest.updatedAt.slice(0, 10))} ساعت ${toPersianDigits(latest.updatedAt.slice(11, 16))}`
          : '';
        setRecorderInfo({ name: data.recorderNames[latest.recordedBy as string] || '—', at });
      } else {
        setRecorderInfo(null);
      }
      const m: Record<string, Status> = {};"""),
    ("  const [myStaffRecords, setMyStaffRecords] = useState<Array<{ id: string; date: string; status: string }>>([]);",
     "  const [myStaffRecords, setMyStaffRecords] = useState<Array<{ id: string; date: string; status: string }>>([]);\n  // ثبت‌کننده و زمان آخرین ثبت حاضری روز انتخاب‌شده\n  const [recorderInfo, setRecorderInfo] = useState<{ name: string; at: string } | null>(null);"),
    ("""                <div className="flex justify-end">
                  <Button onClick={() => setConfirmOpen(true)} disabled={saving} className="gap-1.5">
                    <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ حاضری'}
                  </Button>
                </div>""",
     """                <div className="flex justify-end">
                  <Button onClick={() => setConfirmOpen(true)} disabled={saving} className="gap-1.5">
                    <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ حاضری'}
                  </Button>
                </div>
                {recorderInfo && (
                  <p className="text-[11px] text-muted-foreground">
                    آخرین ثبت حاضری این روز: <b>{recorderInfo.name}</b> — {recorderInfo.at}
                  </p>
                )}"""),
])

# ─── ۵) نسخهٔ ۳.۸.۲ + SW v19 ───
edit('src/lib/version.ts', [
    ("export const APP_VERSION = '3.8.1';", "export const APP_VERSION = '3.8.2';"),
    ("export const APP_VERSION_FA = '۳.۸.۱';", "export const APP_VERSION_FA = '۳.۸.۲';"),
])
edit('public/sw.js', [("const VERSION = 'v18';", "const VERSION = 'v19';")])
print('✓ همهٔ تغییرات مرحلهٔ ۳ اعمال شد')
