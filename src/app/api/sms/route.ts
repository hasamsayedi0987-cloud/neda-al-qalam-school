import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { round2 } from '@/lib/grading';
import { randomUUID, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { isoToday } from '@/lib/jalali';

/** آدرس HTTP ساده فقط برای آزمایش روی همین دستگاه پذیرفته است */
function isLocalHttpUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}

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
    if (!obj?.url || typeof obj.url !== 'string' || !/^https?:\/\//.test(obj.url)) return null;
    // امنیت — شمارهٔ والدین و کلید دروازه فقط روی HTTPS؛ استثنا: localhost برای آزمایش
    if (!obj.url.startsWith('https://') && !isLocalHttpUrl(obj.url)) return null;
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
  // امنیت — ارتباط HTTP ناامن هرگز برای ارسال پیام والدین استفاده نمی‌شود
  if (!cfg.url.startsWith('https://') && !isLocalHttpUrl(cfg.url)) {
    return { ok: false, error: 'آدرس دروازه امن نیست — فقط https:// پذیرفته است' };
  }
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
      const rows: Prisma.SmsOutboxCreateManyInput[] = [];
      for (const rec of absents) {
        const phone = rec.student.guardianPhone;
        if (!phone) continue;
        rows.push({
          to: phone,
          studentId: rec.studentId,
          category: 'ATTENDANCE',
          refDate: date,
          // شناسهٔ یکتای هر پیام — هر شاگرد در هر تاریخ فقط یک پیام، حتی با درخواست هم‌زمان
          clientToken: `ATT:${date}:${rec.studentId}`,
          body: fill(templates.ATTENDANCE, {
            school, name: rec.student.firstName + (rec.student.lastName ? ' ' + rec.student.lastName : ''),
            class: rec.student.class?.name || '—', date,
          }),
        });
      }
      // پیام‌های ناموفق همان تاریخ پاک می‌شوند تا صف‌کردن مجدد (تلاش دوباره) ممکن باشد
      await db.smsOutbox.deleteMany({ where: { category: 'ATTENDANCE', refDate: date, status: 'FAILED' } });
      // clientToken یکتا = ضدتکرار اتمی؛ درخواست هم‌زمان یا کلیک دوباره با P2002 مردود می‌شود
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
      });
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
      const feeRows: Prisma.SmsOutboxCreateManyInput[] = [];
      for (const s of students) {
        const remaining = round2((s.class?.monthlyFee || 0) - (paidBy.get(s.id) || 0));
        if (remaining <= 0 || !s.guardianPhone) continue;
        feeRows.push({
          to: s.guardianPhone,
          studentId: s.id,
          category: 'FEE',
          refDate: month,
          clientToken: `FEE:${month}:${s.id}`,
          body: fill(templates.FEE, {
            school, name: s.firstName + (s.lastName ? ' ' + s.lastName : ''),
            class: s.class?.name || '—', month, amount: String(remaining),
          }),
        });
      }
      await db.smsOutbox.deleteMany({ where: { category: 'FEE', status: 'FAILED', clientToken: { startsWith: `FEE:${month}:` } } });
      let feeQueued = 0;
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
      });
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
      const today = isoToday();
      const examRows: Prisma.SmsOutboxCreateManyInput[] = [];
      for (const s of students) {
        if (!s.guardianPhone) continue;
        examRows.push({
          to: s.guardianPhone,
          studentId: s.id,
          category: 'EXAM',
          refDate: today,
          clientToken: `EXAM:${today}:${s.id}`,
          body: fill(templates.EXAM, {
            school, name: s.firstName + (s.lastName ? ' ' + s.lastName : ''), class: s.class?.name || '—',
          }),
        });
      }
      await db.smsOutbox.deleteMany({ where: { category: 'EXAM', status: 'FAILED', clientToken: { startsWith: `EXAM:${today}:` } } });
      let examQueued = 0;
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
      });
    }

    // ─── اطلاعیه عمومی به والدین ───
    if (action === 'queue-notice') {
      const text = str(body.body);
      if (!text) throw new ApiError('متن اطلاعیه را بنویسید');
      const school = await getSchoolName();
      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      const students = await db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, guardianPhone: true } });
      const todayN = isoToday();
      // شناسهٔ دسته از متن اطلاعیه — کلیک دوبارهٔ همان متن در همان روز تکراری نمی‌سازد
      const batch = createHash('sha256').update(text).digest('hex').slice(0, 10);
      const noticeRows: Prisma.SmsOutboxCreateManyInput[] = students
        .filter((s) => s.guardianPhone)
        .map((s) => ({
          to: s.guardianPhone as string,
          studentId: s.id,
          category: 'NOTICE',
          refDate: todayN,
          clientToken: `NTC:${todayN}:${batch}:${s.id}`,
          body: fill(templates.NOTICE, { school, body: text }),
        }));
      await db.smsOutbox.deleteMany({ where: { category: 'NOTICE', status: 'FAILED', clientToken: { startsWith: `NTC:${todayN}:${batch}:` } } });
      let noticeQueued = 0;
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
      });
    }

    // ─── پیام واحد دستوی ───
    if (action === 'queue-single') {
      const to = str(body.to).replace(/\s+/g, '');
      const text = str(body.body);
      if (!to || !text) throw new ApiError('شماره و متن پیام را بنویسید');
      // توکن ایدمپوتنسی از کلاینت (api.ts) — تلاش مجدد پس از قطعی پیام تکراری نمی‌سازد
      const clientToken = str(body.clientToken) || null;
      try {
        const created = await db.smsOutbox.create({ data: { to, studentId: str(body.studentId) || null, category: 'CUSTOM', body: text, clientToken } });
        return NextResponse.json({ id: created.id });
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002' && clientToken) {
          const existing = await db.smsOutbox.findFirst({ where: { clientToken }, select: { id: true } });
          return NextResponse.json({ id: existing?.id || null, duplicate: true });
        }
        throw err;
      }
    }

    // ─── ارسال صف انتظار از طریق دروازهٔ تنظیم‌شده ───
    if (action === 'send-pending') {
      const providerRow = await db.setting.findUnique({ where: { key: 'smsProvider' } });
      const cfg = parseProvider(providerRow?.value);
      if (!cfg) {
        throw new ApiError('دروازهٔ SMS تنظیم نشده است — در تنظیمات آدرس دروازه را وارد کنید', 400);
      }
      // بازیابی پیام‌های گیرکرده در «در حال ارسال» (قطعی سرور بیش از ۵ دقیقه پیش)
      await db.smsOutbox.updateMany({
        where: { status: 'SENDING', lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        data: { status: 'PENDING', lockedAt: null, lockedBy: null },
      });
      // قفل اتمی — دو درخواست هم‌زمان هرگز یک پیام را دوباره نمی‌فرستند:
      // فقط پیام‌هایی که هنوز PENDING هستند به این دسته قفل می‌شوند
      const candidates = await db.smsOutbox.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true } });
      const batchId = randomUUID();
      let pending: Array<{ id: string; to: string; body: string }> = [];
      if (candidates.length) {
        const claimed = await db.smsOutbox.updateMany({
          where: { id: { in: candidates.map((c) => c.id) }, status: 'PENDING' },
          data: { status: 'SENDING', lockedAt: new Date(), lockedBy: batchId },
        });
        if (claimed.count) {
          pending = await db.smsOutbox.findMany({ where: { lockedBy: batchId }, select: { id: true, to: true, body: true } });
        }
      }
      let sent = 0;
      let failed = 0;
      for (const msg of pending) {
        const r = await sendViaProvider(cfg, msg.to, msg.body);
        await db.smsOutbox.update({
          where: { id: msg.id },
          data: r.ok
            ? { status: 'SENT', sentAt: new Date().toISOString(), error: null, lockedAt: null, lockedBy: null }
            : { status: 'FAILED', attempts: { increment: 1 }, error: r.error || 'نامعلوم', lockedAt: null, lockedBy: null },
        });
        if (r.ok) sent += 1;
        else failed += 1;
      }
      return NextResponse.json({ attempted: pending.length, sent, failed });
    }

    if (action === 'retry-failed') {
      // تلاش مجدد فقط تا سقف ۵ بار — پیام‌های رسوا شده دیگر در صف برنمی‌گردند
      const res = await db.smsOutbox.updateMany({ where: { status: 'FAILED', attempts: { lt: 5 } }, data: { status: 'PENDING', error: null } });
      return NextResponse.json({
        ok: true,
        requeued: res.count,
        note: res.count === 0 ? 'پیام ناموفقی برای تلاش مجدد نیست (یا سقف ۵ تلاش پر شده است)' : undefined,
      });
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
        throw new ApiError('قالب دروازه نامعتبر است — آدرس باید با https:// شروع شود');
      }
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      return NextResponse.json({ ok: true });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
