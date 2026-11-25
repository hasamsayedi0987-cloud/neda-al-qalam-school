import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { round2 } from '@/lib/grading';

/**
 * پیام‌های SMS به شماره‌های والدین — نسخهٔ ۳.۳.۰
 * اطلاع حاضری، فیس باقی، امتحانات و اطلاعیه — به‌صورت خودکار از جدول‌ها جور می‌شود
 * و از یک دروازهٔ SMS قابل تنظیم (تنظیمات → smsProvider) ارسال می‌گردد.
 *
 * قالب پیش‌فرض دروازه: GET/POST با جای‌نگه‌دارهای {phone} و {body}
 * — هر سیستم پیام‌کوتاه افغانستان/بین‌المللی با این قالب هم‌خوان می‌شود.
 */

interface SmsProviderConfig {
  url: string;
  method?: 'GET' | 'POST';
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

interface SmsTemplates {
  ATTENDANCE: string;
  FEE: string;
  EXAM: string;
  NOTICE: string;
}

const DEFAULT_TEMPLATES: SmsTemplates = {
  ATTENDANCE: '{school}: والدین محترم! فرزند شما {name} صنف {class} در تاریخ {date} در مکتب حاضر نشده است. لطفاً پیگیری نمایید.',
  FEE: '{school}: والدین محترم! فیس ماه {month} فرزند شما {name} صنف {class} مبلغ {amount} افغانی باقی مانده است. لطفاً به ادارهٔ مکتب مراجعه نمایید.',
  EXAM: '{school}: والدین محترم! امتحانات صنف {class} آغاز گردید. از فرزند خود {name} همداری نمایید و در وقت مقرر به مکتب حاضر سازید.',
  NOTICE: '{school}: {body}',
};

async function getSchoolName(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: 'schoolName' } });
  return row?.value || 'مکتب خصوصی نداالقلم';
}

function parseTemplates(json: string | null | undefined): SmsTemplates {
  if (!json) return { ...DEFAULT_TEMPLATES };
  try {
    const obj = JSON.parse(json) as Partial<SmsTemplates>;
    return {
      ATTENDANCE: obj.ATTENDANCE || DEFAULT_TEMPLATES.ATTENDANCE,
      FEE: obj.FEE || DEFAULT_TEMPLATES.FEE,
      EXAM: obj.EXAM || DEFAULT_TEMPLATES.EXAM,
      NOTICE: obj.NOTICE || DEFAULT_TEMPLATES.NOTICE,
    };
  } catch {
    return { ...DEFAULT_TEMPLATES };
  }
}

function parseProvider(json: string | null | undefined): SmsProviderConfig | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as SmsProviderConfig;
    if (!obj?.url || typeof obj.url !== 'string' || !obj.url.startsWith('http')) return null;
    return obj;
  } catch {
    return null;
  }
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

async function sendViaProvider(
  cfg: SmsProviderConfig,
  phone: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const method = (cfg.method || 'GET').toUpperCase();
  const fillStr = (s: string) => s.split('{phone}').join(phone).split('{body}').join(body);
  try {
    if (method === 'GET') {
      const u = new URL(cfg.url);
      for (const [k, v] of Object.entries(cfg.params || {})) {
        u.searchParams.set(k, fillStr(v).replace('{phone}', encodeURIComponent(phone)).replace('{body}', encodeURIComponent(body)));
      }
      const res = await fetch(u.toString(), { method: 'GET', headers: cfg.headers });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg.params || {})) payload[k] = fillStr(v);
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
      body: JSON.stringify(payload),
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 180) };
  }
}

export async function GET() {
  try {
    await requireSection('sms');
    const [outbox, providerRow, templatesRow] = await Promise.all([
      db.smsOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } } } }),
      db.setting.findUnique({ where: { key: 'smsProvider' } }),
      db.setting.findUnique({ where: { key: 'smsTemplates' } }),
    ]);
    return NextResponse.json({
      outbox,
      templates: parseTemplates(templatesRow?.value),
      providerConfigured: !!parseProvider(providerRow?.value),
      counts: {
        pending: await db.smsOutbox.count({ where: { status: 'PENDING' } }),
        sent: await db.smsOutbox.count({ where: { status: 'SENT' } }),
        failed: await db.smsOutbox.count({ where: { status: 'FAILED' } }),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('sms');
    const body = await req.json();
    const action = str(body.action);

    // ─── صف‌کردن پیام‌های حاضری: والدین غایبین روز انتخاب‌شده ───
    if (action === 'queue-attendance') {
      const date = str(body.date) || new Date().toISOString().slice(0, 10);
      const school = await getSchoolName();
      const absents = await db.attendanceRecord.findMany({
        where: { date, status: 'ABSENT' },
        include: { student: { include: { class: { select: { name: true } } } } },
      });
      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
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
            body: fill(templates.ATTENDANCE, {
              school, name: rec.student.firstName + (rec.student.lastName ? ' ' + rec.student.lastName : ''),
              class: rec.student.class?.name || '—', date,
            }),
          },
        });
        queued += 1;
      }
      return NextResponse.json({ queued, skipped, note: queued === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined });
    }

    // ─── صف‌کردن پیام‌های فیس باقی: به اساس فیس ماهانهٔ صنف − وصولی‌های ماه ───
    if (action === 'queue-fee') {
      const month = str(body.month);
      if (!month) throw new ApiError('ماه را انتخاب کنید');
      const school = await getSchoolName();
      const students = await db.student.findMany({
        where: { status: 'ACTIVE', class: { monthlyFee: { gt: 0 } } },
        include: { class: { select: { name: true, monthlyFee: true } } },
      });
      const payments = await db.feePayment.findMany({ where: { month } });
      const paidBy = new Map<string, number>();
      for (const p of payments) paidBy.set(p.studentId, (paidBy.get(p.studentId) || 0) + p.amount);
      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      let queued = 0;
      for (const s of students) {
        const remaining = round2((s.class?.monthlyFee || 0) - (paidBy.get(s.id) || 0));
        if (remaining <= 0 || !s.guardianPhone) continue;
        await db.smsOutbox.create({
          data: {
            to: s.guardianPhone,
            studentId: s.id,
            category: 'FEE',
            body: fill(templates.FEE, {
              school, name: s.firstName + (s.lastName ? ' ' + s.lastName : ''),
              class: s.class?.name || '—', month, amount: String(remaining),
            }),
          },
        });
        queued += 1;
      }
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم باقی‌مانده با شمارهٔ والدین یافت نشد' : undefined });
    }

    // ─── صف‌کردن اطلاع امتحانات: یک صنف یا همه ───
    if (action === 'queue-exam') {
      const school = await getSchoolName();
      const classId = str(body.classId) || null;
      const students = await db.student.findMany({
        where: { status: 'ACTIVE', ...(classId ? { classId } : {}) },
        include: { class: { select: { name: true } } },
      });
      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      let queued = 0;
      for (const s of students) {
        if (!s.guardianPhone) continue;
        await db.smsOutbox.create({
          data: {
            to: s.guardianPhone,
            studentId: s.id,
            category: 'EXAM',
            body: fill(templates.EXAM, {
              school, name: s.firstName + (s.lastName ? ' ' + s.lastName : ''), class: s.class?.name || '—',
            }),
          },
        });
        queued += 1;
      }
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined });
    }

    // ─── اطلاعیه عمومی به والدین ───
    if (action === 'queue-notice') {
      const text = str(body.body);
      if (!text) throw new ApiError('متن اطلاعیه را بنویسید');
      const school = await getSchoolName();
      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      const students = await db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, guardianPhone: true } });
      let queued = 0;
      for (const s of students) {
        if (!s.guardianPhone) continue;
        await db.smsOutbox.create({ data: { to: s.guardianPhone, studentId: s.id, category: 'NOTICE', body: fill(templates.NOTICE, { school, body: text }) } });
        queued += 1;
      }
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined });
    }

    // ─── پیام واحد دستوی ───
    if (action === 'queue-single') {
      const to = str(body.to).replace(/\s+/g, '');
      const text = str(body.body);
      if (!to || !text) throw new ApiError('شماره و متن پیام را بنویسید');
      const created = await db.smsOutbox.create({ data: { to, studentId: str(body.studentId) || null, category: 'CUSTOM', body: text } });
      return NextResponse.json({ id: created.id });
    }

    // ─── ارسال صف انتظار از طریق دروازهٔ تنظیم‌شده ───
    if (action === 'send-pending') {
      const providerRow = await db.setting.findUnique({ where: { key: 'smsProvider' } });
      const cfg = parseProvider(providerRow?.value);
      if (!cfg) {
        throw new ApiError('دروازهٔ SMS تنظیم نشده است — در تنظیمات آدرس دروازه را وارد کنید', 400);
      }
      const pending = await db.smsOutbox.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
      let sent = 0;
      let failed = 0;
      for (const msg of pending) {
        const r = await sendViaProvider(cfg, msg.to, msg.body);
        await db.smsOutbox.update({
          where: { id: msg.id },
          data: r.ok ? { status: 'SENT', sentAt: new Date().toISOString(), error: null } : { status: 'FAILED', error: r.error || 'نامعلوم' },
        });
        if (r.ok) sent += 1;
        else failed += 1;
      }
      return NextResponse.json({ attempted: pending.length, sent, failed });
    }

    if (action === 'retry-failed') {
      await db.smsOutbox.updateMany({ where: { status: 'FAILED' }, data: { status: 'PENDING', error: null } });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      await db.smsOutbox.delete({ where: { id: str(body.id) } });
      return NextResponse.json({ ok: true });
    }

    // ─── ذخیرهٔ قالب‌ها و دروازه (تنها مدیر) ───
    if (action === 'save-templates' || action === 'save-provider') {
      const me = await requireSection('sms');
      if (me.role !== 'ADMIN') throw new ApiError('تنها مدیر می‌تواند تنظیمات را تغییر دهد', 403);
      const key = action === 'save-templates' ? 'smsTemplates' : 'smsProvider';
      const value = str(body.value);
      if (!value) throw new ApiError('مقدار تنظیم خالی است');
      if (key === 'smsProvider' && !parseProvider(value)) {
        throw new ApiError('قالب دروازه نامعتبر است — آدرس باید با http شروع شود');
      }
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
