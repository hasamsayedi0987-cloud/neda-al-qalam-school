/**
 * API دروازهٔ ورود و خروج با اسکن QR کارت هویت — نسخهٔ ۳.۱۰.۰ (مرحلهٔ ۷)
 *
 *  GET  ?date=YYYY-MM-DD&classId=… → وضعیت روز + تاریخچهٔ رفت‌وآمد (پنل مدیر/نگهبان)
 *  POST action=scan    { token, clientAt?, clientToken? } → اسکن کارت در دروازه
 *  POST action=manual  { studentId, kind, clientAt? }      → ثبت دستی (مدیر/سرمعلم)
 *  POST action=undo    { logId }                            → لغو یک ثبت اشتباه (مدیر/سرمعلم)
 *  POST action=config  { smsOn }                             → پیامک والدین روشن/خاموش (مدیر)
 *
 * منطق اسکن — ضدتکرار و ساعت دقیق:
 *  • توکن همان توکن امضاشدهٔ کارت هویت است (نسخهٔ ۳.۸.۱) — اعتبارسنجی سمت سرور + بررسی لغو
 *  • اولین اسکنِ روز = «ورود»؛ اسکن بعدی = «خروج»؛ پس از خروج، اسکن بعدی دوباره «ورود»
 *    می‌شود — رفت‌وآمد چندبارهٔ یک روز (مرخصی زودهنگام و بازگشت) کامل ثبت می‌شود
 *  • دو اسکن پشت‌سرهم کمتر از ۴۵ ثانیه = اسکن تکراری و رد می‌شود
 *  • clientToken یکتا برای هر اسکن: اسکنِ آفلاین که بعداً ارسال می‌شود هرگز دوباره ثبت نمی‌شود
 *  • ساعت ثبت = ساعت دستگاهِ اسکن‌کننده در لحظهٔ اسکن (نه لحظهٔ وصل شدن)؛ اگر ساعت دستگاه
 *    خراب باشد (اختلاف زیاد) ساعت سرور به‌کار می‌رود
 *  • والدین: اعلان درون‌برنامه‌ای + Push برای حساب سرپرست؛ پیامک فقط با فعال‌سازی مدیر
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, requireRole, verifyQrToken, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { pushToUsers } from '@/lib/push';
import { isRevoked } from '@/lib/qr-revoke';
import { toPersianDigits } from '@/lib/jalali';

/** وقت کابل = UTC+4:30 — تاریخ و ساعت دروازه همیشه به وقت افغانستان */
const KABUL_OFFSET_MS = 4 * 60 * 60 * 1000 + 30 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 45_000; // دو اسکن پشت‌سرهم کمتر از ۴۵ ثانیه = تکراری
const MAX_LOGS = 300; // سقف نمایش تاریخچهٔ هر روز در پنل

/** زنجیرهٔ ثبت دروازه — اسکن‌های موازی یک نمونه به‌ترتیب اجرا می‌شوند (ضد مسابقهٔ check-then-create) */
let gateChain: Promise<unknown> = Promise.resolve();

function kabulDateOf(d: Date): string {
  return new Date(d.getTime() + KABUL_OFFSET_MS).toISOString().slice(0, 10);
}

function clockFa(d: Date): string {
  const hhmm = new Date(d.getTime() + KABUL_OFFSET_MS).toISOString().slice(11, 16);
  const [h, m] = hhmm.split(':');
  return `${toPersianDigits(h)}:${toPersianDigits(m)}`;
}

/**
 * ساعت دستگاه اسکن‌کننده اگر معتبر باشد؛ در غیر آن ساعت سرور.
 * بازهٔ مجاز: از ۱۲ ساعت پیش تا ۵ دقیقه آینده — خارج از این یعنی ساعت دستگاه خراب است.
 */
function resolveAt(clientAt: string): Date {
  if (!clientAt) return new Date();
  const t = new Date(clientAt).getTime();
  if (!Number.isFinite(t)) return new Date();
  const now = Date.now();
  if (t < now - 12 * 60 * 60 * 1000 || t > now + 5 * 60 * 1000) return new Date();
  return new Date(t);
}

interface GateStudent {
  id: string;
  firstName: string;
  lastName: string | null;
  fatherName: string;
  rollNo: number | null;
  status: string;
  guardianPhone: string | null;
  class: { id: string; name: string } | null;
}

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fatherName: true,
  rollNo: true,
  status: true,
  guardianPhone: true,
  class: { select: { id: true, name: true } },
} as const;

function studentName(st: { firstName: string; lastName: string | null }): string {
  return `${st.firstName} ${st.lastName || ''}`.trim();
}

/** تداخل نوشتن هم‌زمان در پایگاه داده — ثبت انجام نشده، به‌عنوان تکراری گزارش می‌شود */
function isWriteConflict(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: string }).code;
  const msg = String((e as { message?: string }).message || '');
  return code === 'P2034' || /SQLITE_BUSY|database is locked|database table is locked/i.test(msg);
}

interface LogLike {
  id: string;
  kind: string;
  at: Date;
  date: string;
}

function gateResult(log: LogLike, duplicate: boolean, st?: GateStudent) {
  const kindFa = log.kind === 'IN' ? 'ورود' : 'خروج';
  return {
    ok: true,
    duplicate,
    kind: log.kind,
    kindFa,
    date: log.date,
    clock: clockFa(log.at),
    studentName: st ? studentName(st) : undefined,
    className: st?.class?.name ?? undefined,
    message: `${kindFa} ساعت ${clockFa(log.at)} ثبت شد`,
  };
}

/** اعلان + Push + پیامک اختیاری به والدین — برای ورود و خروج */
async function notifyGuardians(st: GateStudent, log: LogLike) {
  const kindFa = log.kind === 'IN' ? 'ورود' : 'خروج';
  const title = log.kind === 'IN' ? 'ورود شاگرد به مکتب' : 'خروج شاگرد از مکتب';
  const body = `${studentName(st)} (${st.class?.name || 'بدون صنف'}) ساعت ${clockFa(log.at)} «${kindFa}» ثبت شد.`;

  const guardians = await db.user.findMany({
    where: {
      active: true,
      role: 'GUARDIAN',
      OR: [{ studentId: st.id }, { guardianLinks: { some: { studentId: st.id } } }],
    },
    select: { id: true },
  });
  if (guardians.length > 0) {
    await db.notification.createMany({
      data: guardians.map((u) => ({ userId: u.id, title, body, type: 'ATTENDANCE' })),
    });
    void pushToUsers(guardians.map((u) => u.id), {
      title,
      body,
      type: 'ATTENDANCE',
      url: '/?view=gate',
      tag: 'gate',
    });
  }

  // پیامک والدین — فقط با فعال‌سازی مدیر (هزینهٔ پیامک)؛ clientToken یکتای هر ثبت = ضدتکرار
  const smsSetting = await db.setting.findUnique({ where: { key: 'gateSms' } });
  if (smsSetting?.value === '1' && st.guardianPhone) {
    await db.smsOutbox
      .create({
        data: {
          to: st.guardianPhone,
          studentId: st.id,
          refDate: `${log.date}:${log.kind}`,
          clientToken: `GATE:${log.id}`,
          category: 'GATE',
          body,
        },
      })
      .catch(() => {
        /* clientToken تکراری — پیام همین ثبت قبلاً ساخته شده */
      });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireSection('gate');
    const sp = req.nextUrl.searchParams;
    const date = str(sp.get('date')) || kabulDateOf(new Date());
    const classId = str(sp.get('classId'));
    const where: { date: string; student?: { classId: string } } = { date };
    if (classId) where.student = { classId };

    const [ins, outs, logs, smsRow] = await Promise.all([
      db.gateLog.count({ where: { ...where, kind: 'IN' } }),
      db.gateLog.count({ where: { ...where, kind: 'OUT' } }),
      db.gateLog.findMany({
        where,
        orderBy: { at: 'desc' },
        take: MAX_LOGS,
        select: {
          id: true,
          kind: true,
          at: true,
          method: true,
          byName: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              fatherName: true,
              rollNo: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
      }),
      db.setting.findUnique({ where: { key: 'gateSms' } }),
    ]);

    return NextResponse.json({
      date,
      ins,
      outs,
      inside: Math.max(0, ins - outs), // اسکن‌ها یک‌درمیان‌اند → داخل مکتب = ورود − خروج
      logs,
      smsOn: smsRow?.value === '1',
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    // ─── اسکن نگهبان ───
    if (action === 'scan') {
      const me = await requireSection('gate');
      const token = str(body.token);
      const clientToken = str(body.clientToken) || null;
      if (!token) throw new ApiError('کد QR خوانده نشد — کارت را نزدیک دوربین بگیرید');

      // ایدمپوتنسی — همان اسکنِ آفلاین که دوباره ارسال شود، همان نتیجهٔ قبلی برمی‌گردد
      if (clientToken) {
        const dup = await db.gateLog.findUnique({ where: { clientToken } });
        if (dup) return NextResponse.json(gateResult(dup, true));
      }

      const data = await verifyQrToken(token);
      if (!data) throw new ApiError('کد QR نامعتبر است — این کارت مکتب نیست', 400);
      if (data.kind !== 'student') throw new ApiError('در دروازه فقط کارت شاگردان ثبت می‌شود', 400);
      if (await isRevoked(data.id, data.iat)) {
        throw new ApiError('این کارت لغو شده است (گم‌شده) — با ادارهٔ مکتب تماس بگیرید', 410);
      }

      const st = await db.student.findUnique({ where: { id: data.id }, select: STUDENT_SELECT });
      if (!st) throw new ApiError('شاگرد یافت نشد', 404);
      if (st.status !== 'ACTIVE') throw new ApiError('این شاگرد فعال نیست (فراغت یا منفصل)', 400);

      const at = resolveAt(str(body.clientAt));
      const date = kabulDateOf(at);
      try {
        // خواندن آخرین ثبت + ساخت ثبت جدید در یک تراکنشِ زنجیره‌ای — دو اسکن هم‌زمان
        // هرگز هر دو «آخرین ثبت = خالی» را نمی‌بینند (ضدتکرار واقعی، نه فقط منطقی)
        const run = gateChain.then(() =>
          db.$transaction(async (tx) => {
            const last = await tx.gateLog.findFirst({
              where: { studentId: st.id, date },
              orderBy: { at: 'desc' },
              select: { id: true, kind: true, at: true },
            });
            if (last && Math.abs(at.getTime() - last.at.getTime()) < DUPLICATE_WINDOW_MS) {
              throw new ApiError('اسکن تکراری — همین چند لحظه پیش برای این شاگرد ثبت شد', 409);
            }
            const kind = !last || last.kind === 'OUT' ? 'IN' : 'OUT';
            return tx.gateLog.create({
              data: { studentId: st.id, date, kind, at, byUserId: me.id, byName: me.name, method: 'QR', clientToken },
            });
          }),
        );
        gateChain = run.catch(() => { /* زنجیره با خطای یک اسکن نمی‌شکند */ });
        const log = await run;
        await notifyGuardians(st, log);
        return NextResponse.json(gateResult(log, false, st));
      } catch (e) {
        // ایدمپوتنسی کامل: اگر ثبت با همین clientToken قبلاً ساخته شده (اسکن موازیِ
        // همان دستگاه یا replay صف)، همان نتیجهٔ اصلی برگردانده می‌شود — نه خطا
        if (clientToken) {
          const dup = await db.gateLog.findUnique({ where: { clientToken } });
          if (dup) return NextResponse.json(gateResult(dup, true));
        }
        // قفل هم‌زمانی پایگاه داده (SQLite BUSY / Prisma P2034) — ثبت دوباره انجام نشده
        if (isWriteConflict(e)) throw new ApiError('اسکن هم‌زمان — چند لحظه بعد کارت را دوباره بگیرید', 409);
        throw e;
      }
    }

    // ─── ثبت دستی (کارت گم‌شده/خراب) ───
    if (action === 'manual') {
      const me = await requireRole('ADMIN', 'HEADTEACHER');
      const studentId = str(body.studentId);
      const kind = str(body.kind) === 'OUT' ? 'OUT' : 'IN';
      if (!studentId) throw new ApiError('شاگرد را انتخاب کنید');

      const st = await db.student.findUnique({ where: { id: studentId }, select: STUDENT_SELECT });
      if (!st) throw new ApiError('شاگرد یافت نشد', 404);

      const at = resolveAt(str(body.clientAt));
      const date = kabulDateOf(at);
      const run = gateChain.then(() =>
        db.$transaction(async (tx) => {
          const last = await tx.gateLog.findFirst({
            where: { studentId: st.id, date },
            orderBy: { at: 'desc' },
            select: { id: true, kind: true, at: true },
          });
          if (last && Math.abs(at.getTime() - last.at.getTime()) < DUPLICATE_WINDOW_MS) {
            throw new ApiError('ثبت تکراری — همین چند لحظه پیش برای این شاگرد ثبت شد', 409);
          }
          return tx.gateLog.create({
            data: { studentId: st.id, date, kind, at, byUserId: me.id, byName: me.name, method: 'MANUAL' },
          });
        }),
      );
      gateChain = run.catch(() => {});
      const log = await run;
      await notifyGuardians(st, log);
      return NextResponse.json(gateResult(log, false, st));
    }

    // ─── لغو یک ثبت اشتباه ───
    if (action === 'undo') {
      await requireRole('ADMIN', 'HEADTEACHER');
      const logId = str(body.logId);
      if (!logId) throw new ApiError('شناسهٔ ثبت لازم است');
      const log = await db.gateLog.findUnique({ where: { id: logId } });
      if (!log) throw new ApiError('ثبت یافت نشد', 404);
      await db.gateLog.delete({ where: { id: logId } });
      // پیامک هنوز ارسال‌نشدهٔ همان ثبت هم لغو می‌شود
      await db.smsOutbox.deleteMany({ where: { clientToken: `GATE:${logId}`, status: 'PENDING' } });
      return NextResponse.json({ ok: true });
    }

    // ─── تنظیم پیامک والدین ───
    if (action === 'config') {
      await requireRole('ADMIN');
      const smsOn = body.smsOn === true || body.smsOn === '1';
      await db.setting.upsert({
        where: { key: 'gateSms' },
        update: { value: smsOn ? '1' : '0' },
        create: { key: 'gateSms', value: smsOn ? '1' : '0' },
      });
      return NextResponse.json({ ok: true, smsOn });
    }

    throw new ApiError('عملیات نامعلوم است');
  } catch (e) {
    return handleApiError(e);
  }
}
