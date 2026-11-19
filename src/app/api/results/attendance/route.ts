/**
 * تجمیع حاضری یومیه یک صنف برای «ضوابط حاضری» جدول نتایج وزارت معارف — نسخهٔ ۳.۵.۱
 *
 * دو پنجرهٔ زمانی بر پایهٔ سال تعلیمی شمسی (تنظیمات مکتب):
 *  - چهارونیم‌ماهه: از حمل ۱ تا اسد ۱۵ (۴.۵ ماه نخست سال تعلیمی)
 *  - سالانه: از حمل ۱ تا پایان سال (حوت)
 * خروجی: برای هر شاگرد — ایام سال تعلیمی (روزهای ثبت‌حاضری صنف) + شمار حاضر/غیرحاضر/مریض/رخصت
 * اگر «سال تعلیمی» در تنظیمات ثبت نشده باشد، پاسخ بدون پنجره برمی‌گردد و ستون‌های حاضری در
 * خروجی Excel خالی می‌مانند (رفتار قالب اصلی).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { teacherClassIds } from '@/lib/teacher-scope';
import { jalaliToGregorian, toLatinDigits } from '@/lib/jalali';

const STATUS_KEYS: Record<string, 'present' | 'absent' | 'sick' | 'leave'> = {
  PRESENT: 'present',
  ABSENT: 'absent',
  SICK: 'sick',
  LEAVE: 'leave',
};

const ZERO = { days: 0, present: 0, absent: 0, sick: 0, leave: 0 };

export async function GET(req: NextRequest) {
  try {
    const me = await requireSection('results');
    const classId = req.nextUrl.searchParams.get('classId') || '';
    if (!classId) throw new ApiError('صنف را انتخاب کنید');
    // معلم: فقط صنف‌های تحت تدریس/نگرانی خودش
    if (me.role === 'TEACHER') {
      const scope = await teacherClassIds(me.teacherId || '');
      if (!scope.includes(classId)) throw new ApiError('دسترسی مجاز نیست', 403);
    }

    // سال تعلیمی از تنظیمات — «۱۴۰۴» یا «1404» یا «سال 1404»
    const yearRaw = (await db.setting.findUnique({ where: { key: 'academicYear' } }))?.value || '';
    const m = toLatinDigits(String(yearRaw)).match(/(\d{4})/);
    const Y = m ? parseInt(m[1], 10) : 0;
    if (!Y) {
      return NextResponse.json({ academicYear: null, students: {} });
    }

    const iso = (gy: number, gm: number, gd: number) =>
      `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;

    const s = jalaliToGregorian(Y, 1, 1); // حمل ۱
    const e = jalaliToGregorian(Y + 1, 1, 1); // حمل ۱ سال بعد
    const mid = jalaliToGregorian(Y, 5, 15); // اسد ۱۵ — پایان چهارونیم‌ماهه
    const yearStart = iso(s.gy, s.gm, s.gd);
    const yearEnd = iso(e.gy, e.gm, e.gd);
    const midEnd = iso(mid.gy, mid.gm, mid.gd);

    const records = await db.attendanceRecord.findMany({
      where: { classId, date: { gte: yearStart, lt: yearEnd } },
      select: { studentId: true, date: true, status: true },
    });

    const annualDays = new Set<string>();
    const midDays = new Set<string>();
    const agg: Record<string, { mid: typeof ZERO; annual: typeof ZERO }> = {};
    for (const r of records) {
      const key = STATUS_KEYS[r.status];
      if (!key) continue;
      const isMid = r.date <= midEnd;
      annualDays.add(r.date);
      if (isMid) midDays.add(r.date);
      const a = (agg[r.studentId] ||= { mid: { ...ZERO }, annual: { ...ZERO } });
      a.annual[key] += 1;
      if (isMid) a.mid[key] += 1;
    }

    const students: Record<string, { mid: typeof ZERO; annual: typeof ZERO }> = {};
    for (const [studentId, a] of Object.entries(agg)) {
      students[studentId] = {
        mid: { ...a.mid, days: midDays.size },
        annual: { ...a.annual, days: annualDays.size },
      };
    }

    return NextResponse.json({
      academicYear: Y,
      yearStart,
      midEnd,
      yearEnd,
      recordedDays: { mid: midDays.size, annual: annualDays.size },
      students,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
