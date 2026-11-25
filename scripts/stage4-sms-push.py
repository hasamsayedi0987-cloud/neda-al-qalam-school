#!/usr/bin/env python3
# مرحلهٔ ۴ — پیامک و اعلان والدین: ضدتکرار هم‌زمانی، شناسهٔ یکتا، تلاش مجدد با سقف،
# HTTPS اجباری دروازه، ترمیم اشتراک پوش پس از بازگردانی پشتیبان
import sys

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if new in s and old in s:
            # بخش قدیمی هنوز هست (اولین اجرا) — عادی
            pass
        if old not in s:
            if new in s:
                print(f'• {path}: قبلاً اعمال شده'); continue
            print(f'✗ NOT FOUND in {path}: {old[:70]!r}'); sys.exit(1)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path}')

def add_to_model(path, model, anchor, new_lines, label):
    s = open(path, encoding='utf-8').read()
    start = s.index(f'model {model} ')
    end = s.index('\n}', start)
    block = s[start:end]
    if new_lines[0].strip().split()[0] in block:
        print(f'• {model}/{label} قبلاً در {path}'); return
    assert anchor in block, f'anchor missing in {model} ({path})'
    block = block.replace(anchor, anchor + ''.join(new_lines), 1)
    s = s[:start] + block + s[end:]
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path} → {model} ({label})')

SMS_FIELDS = [
    '  clientToken String? @unique // شناسهٔ یکتای هر پیام — ایدمپوتنسی صف و ضدتکرار درخواست هم‌زمان (نسخهٔ ۳.۸.۳)\n',
    '  attempts    Int     @default(0) // شمار تلاش ارسال — تلاش مجدد تا سقف ۵ بار (نسخهٔ ۳.۸.۳)\n',
    '  lockedAt    DateTime? // زمان ادعای ارسال (SENDING) — بازیابی پیام‌های گیرکرده\n',
    '  lockedBy    String?   // شناسهٔ دستهٔ ارسال — قفل اتمی ضدتکرار هم‌زمانی\n',
]
SMS_ANCHOR = '  refDate   String? // تاریخ مرجع پیام (مثلاً تاریخ غیبت) — مبنای جلوگیری از پیام تکراری (نسخهٔ ۳.۸.۲)\n'

# ─── ۱) اسکیما (هر دو) ───
for schema in ['prisma/schema.postgres.prisma', 'prisma/schema.prisma']:
    add_to_model(schema, 'SmsOutbox', SMS_ANCHOR, SMS_FIELDS, 'clientToken/attempts/lock')

# ─── ۲) مسیر SMS ───
edit('src/app/api/sms/route.ts', [
    # imports
    ("""import { handleApiError, str } from '@/lib/api-helpers';
import { round2 } from '@/lib/grading';""",
     """import { handleApiError, str } from '@/lib/api-helpers';
import { round2 } from '@/lib/grading';
import { randomUUID, createHash } from 'crypto';
import { isoToday } from '@/lib/jalali';

/** آدرس HTTP ساده فقط برای آزمایش روی همین دستگاه پذیرفته است */
function isLocalHttpUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}"""),
    # parseProvider — اجبار HTTPS
    ("""    const obj = JSON.parse(json) as SmsProviderConfig;
    if (!obj?.url || typeof obj.url !== 'string' || !obj.url.startsWith('http')) return null;
    return obj;""",
     """    const obj = JSON.parse(json) as SmsProviderConfig;
    if (!obj?.url || typeof obj.url !== 'string' || !/^https?:\\/\\//.test(obj.url)) return null;
    // امنیت — شمارهٔ والدین و کلید دروازه فقط روی HTTPS؛ استثنا: localhost برای آزمایش
    if (!obj.url.startsWith('https://') && !isLocalHttpUrl(obj.url)) return null;
    return obj;"""),
    # sendViaProvider — حفاظ دوم در لحظهٔ ارسال
    ("""  const method = (cfg.method || 'GET').toUpperCase();
  const fillStr = (s: string) => s.split('{phone}').join(phone).split('{body}').join(body);""",
     """  const method = (cfg.method || 'GET').toUpperCase();
  // امنیت — ارتباط HTTP ناامن هرگز برای ارسال پیام والدین استفاده نمی‌شود
  if (!cfg.url.startsWith('https://') && !isLocalHttpUrl(cfg.url)) {
    return { ok: false, error: 'آدرس دروازه امن نیست — فقط https:// پذیرفته است' };
  }
  const fillStr = (s: string) => s.split('{phone}').join(phone).split('{body}').join(body);"""),
    # پیام خطای ذخیرهٔ دروازه
    ("throw new ApiError('قالب دروازه نامعتبر است — آدرس باید با http شروع شود');",
     "throw new ApiError('قالب دروازه نامعتبر است — آدرس باید با https:// شروع شود');"),
    # queue-attendance — createMany اتمی با شناسهٔ یکتا
    ("""      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
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
      return NextResponse.json({ queued, skipped, note: queued === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined });""",
     """      const templates = await parseTemplates((await db.setting.findUnique({ where: { key: 'smsTemplates' } }))?.value);
      const rows: Array<{ to: string; studentId: string; category: string; refDate: string; clientToken: string; body: string }> = [];
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
      // skipDuplicates + clientToken یکتا = ضدتکرار اتمی؛ دو درخواست هم‌زمان پیام دوباره نمی‌سازند
      const res = rows.length ? await db.smsOutbox.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: res.count,
        skipped: rows.length - res.count,
        note: res.count === 0 ? 'غایب حاضر با شمارهٔ والدین یافت نشد' : undefined,
      });"""),
    # queue-fee — همان الگو
    ("""      let queued = 0;
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
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم باقی‌مانده با شمارهٔ والدین یافت نشد' : undefined });""",
     """      const feeRows: Array<{ to: string; studentId: string; category: string; refDate: string; clientToken: string; body: string }> = [];
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
      const feeRes = feeRows.length ? await db.smsOutbox.createMany({ data: feeRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: feeRes.count,
        skipped: feeRows.length - feeRes.count,
        note: feeRes.count === 0 ? 'متعلم باقی‌مانده با شمارهٔ والدین یافت نشد' : undefined,
      });"""),
    # queue-exam — یک پیام در روز برای هر شاگرد
    ("""      let queued = 0;
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
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined });""",
     """      const today = isoToday();
      const examRows: Array<{ to: string; studentId: string; category: string; refDate: string; clientToken: string; body: string }> = [];
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
      const examRes = examRows.length ? await db.smsOutbox.createMany({ data: examRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: examRes.count,
        skipped: examRows.length - examRes.count,
        note: examRes.count === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });"""),
    # queue-notice — یک دسته در روز به ازای هر متن
    ("""      const students = await db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, guardianPhone: true } });
      let queued = 0;
      for (const s of students) {
        if (!s.guardianPhone) continue;
        await db.smsOutbox.create({ data: { to: s.guardianPhone, studentId: s.id, category: 'NOTICE', body: fill(templates.NOTICE, { school, body: text }) } });
        queued += 1;
      }
      return NextResponse.json({ queued, note: queued === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined });""",
     """      const students = await db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, guardianPhone: true } });
      const todayN = isoToday();
      // شناسهٔ دسته از متن اطلاعیه — کلیک دوبارهٔ همان متن در همان روز تکراری نمی‌سازد
      const batch = createHash('sha256').update(text).digest('hex').slice(0, 10);
      const noticeRows = students
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
      const noticeRes = noticeRows.length ? await db.smsOutbox.createMany({ data: noticeRows, skipDuplicates: true }) : { count: 0 };
      return NextResponse.json({
        queued: noticeRes.count,
        skipped: noticeRows.length - noticeRes.count,
        note: noticeRes.count === 0 ? 'متعلم با شمارهٔ والدین یافت نشد' : undefined,
      });"""),
    # queue-single — ایدمپوتنسی با توکن کلاینت
    ("""      const created = await db.smsOutbox.create({ data: { to, studentId: str(body.studentId) || null, category: 'CUSTOM', body: text } });
      return NextResponse.json({ id: created.id });""",
     """      // توکن ایدمپوتنسی از کلاینت (api.ts) — تلاش مجدد پس از قطعی پیام تکراری نمی‌سازد
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
      }"""),
    # send-pending — قفل اتمی + بازیابی گیرکرده‌ها + شمار تلاش
    ("""      const pending = await db.smsOutbox.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
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
      return NextResponse.json({ attempted: pending.length, sent, failed });""",
     """      // بازیابی پیام‌های گیرکرده در «در حال ارسال» (قطعی سرور بیش از ۵ دقیقه پیش)
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
      return NextResponse.json({ attempted: pending.length, sent, failed });"""),
    # retry-failed — سقف ۵ تلاش
    ("""    if (action === 'retry-failed') {
      await db.smsOutbox.updateMany({ where: { status: 'FAILED' }, data: { status: 'PENDING', error: null } });
      return NextResponse.json({ ok: true });
    }""",
     """    if (action === 'retry-failed') {
      // تلاش مجدد فقط تا سقف ۵ بار — پیام‌های رسوا شده دیگر در صف برنمی‌گردند
      const res = await db.smsOutbox.updateMany({ where: { status: 'FAILED', attempts: { lt: 5 } }, data: { status: 'PENDING', error: null } });
      return NextResponse.json({
        ok: true,
        requeued: res.count,
        note: res.count === 0 ? 'پیام ناموفقی برای تلاش مجدد نیست (یا سقف ۵ تلاش پر شده است)' : undefined,
      });
    }"""),
])

# ─── ۳) کلاینت — توکن ایدمپوتنسی برای /api/sms ───
edit('src/lib/client/api.ts', [
    ("const IDEMPOTENT_POSTS = ['/api/messages', '/api/fees', '/api/students', '/api/library'];",
     "const IDEMPOTENT_POSTS = ['/api/messages', '/api/fees', '/api/students', '/api/library', '/api/sms'];"),
])

# ─── ۴) کلاینت push — ترمیم اشتراک پس از بازگردانی پشتیبان ───
edit('src/lib/client/push.ts', [
    # helper جدید قبل از enablePushNotifications
    ("""/** فعال‌سازی اعلان‌ها — از کلیک کاربر (تنظیمات) یا ساکت پس از اجازهٔ قبلی */
export async function enablePushNotifications()""",
     """/** معرفی اشتراک جاری مرورگر به سرور (upsert بی‌ضرر — هر بار که لازم شد صدا زده می‌شود) */
async function resendSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (res.ok) {
    try { localStorage.setItem(PUSH_SUB_KEY, '1'); } catch { /* ignore */ }
    return true;
  }
  return false;
}

/** فعال‌سازی اعلان‌ها — از کلیک کاربر (تنظیمات) یا ساکت پس از اجازهٔ قبلی */
export async function enablePushNotifications()"""),
    # بدنهٔ enable — از helper استفاده کند
    ("""    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'invalid' };
    }
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (res.ok) {
      try { localStorage.setItem(PUSH_SUB_KEY, '1'); } catch { /* ignore */ }
      return { ok: true };
    }
    return { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}""",
     """    const sent = await resendSubscription(sub);
    return sent ? { ok: true } : { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}"""),
    # ensurePushAfterLogin — ثبت مجدد حتی وقتی مرورگر اشتراک دارد (ترمیم پس از بازیابی پشتیبان)
    ("""    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return; // از قبل ثبت است
    await enablePushNotifications();
  } catch { /* ignore */ }
}""",
     """    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // نسخهٔ ۳.۸.۳ — ترمیم پس از بازگردانی نسخهٔ پشتیبان: بازیابی، ردیف اشتراک سرور را
      // پاک می‌کند ولی مرورگر هنوز اشتراک دارد؛ ثبت مجدد بی‌صدا پیوند را برمی‌گرداند
      await resendSubscription(sub).catch(() => undefined);
      return;
    }
    await enablePushNotifications();
  } catch { /* ignore */ }
}"""),
])

# ─── ۵) نسخهٔ ۳.۸.۳ + SW v20 ───
edit('src/lib/version.ts', [
    ("export const APP_VERSION = '3.8.2';", "export const APP_VERSION = '3.8.3';"),
    ("export const APP_VERSION_FA = '۳.۸.۲';", "export const APP_VERSION_FA = '۳.۸.۳';"),
])
edit('public/sw.js', [("const VERSION = 'v19';", "const VERSION = 'v20';")])
print('✓ همهٔ تغییرات مرحلهٔ ۴ اعمال شد')
