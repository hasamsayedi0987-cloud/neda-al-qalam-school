import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

const EDITABLE_KEYS = [
  'schoolName', 'province', 'district', 'authority', 'academicYear',
  'directorName', 'directorPhone', 'directorEmail',
  'maxWritten', 'maxOral', 'maxHomework', 'maxActivity', 'resultNote',
  'gradeScale', 'aboutApp', 'aboutDev',
  // مالی — ضرب‌الاجل فیس و جریمهٔ کتابخانه
  'feeDeadlineDay', 'finePerDay',
  // پشتیبان‌گیری — یادآوری خودکار
  'backupReminderDays',
  // عناوین قابل‌تغییر — شعار اپ و برچسب منوها
  'tagline', 'navLabels',
  // مجوزهای معلمان — قابل کنترل توسط مدیر
  'permTeacherGrades', 'permTeacherGradeDelete', 'permTeacherStudents',
];

export async function GET() {
  try {
    await requireUser();
    const settings = await db.setting.findMany({
      where: { key: { in: EDITABLE_KEYS } },
    });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return NextResponse.json({ settings: map });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const incoming = body.settings || {};
    for (const key of EDITABLE_KEYS) {
      if (incoming[key] === undefined) continue;
      let value = str(incoming[key]);
      // اعتبارسنجی کلیدهای JSON و سقف حجم عکس‌ها (dataURL)
      if (key === 'gradeScale') {
        JSON.parse(value); // اگر نامعتبر باشد خطا می‌دهد
      }
      if (key === 'navLabels') {
        const parsed = JSON.parse(value) as Record<string, unknown>; // اگر نامعتبر باشد خطا می‌دهد
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) clean[k] = v.trim().slice(0, 60);
        }
        value = JSON.stringify(clean);
      }
      if (key === 'aboutApp' || key === 'aboutDev') {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.startsWith('data:image') && v.length > 400_000) {
            parsed[k] = null; // عکس خیلی بزرگ — رد می‌شود
          }
        }
        value = JSON.stringify(parsed);
      }
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    throw new ApiError('مقدار تنظیمات نامعتبر است');
  }
}
