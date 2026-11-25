/**
 * احراز هویت با کوکی امضاشده (HMAC) — بدون وابستگی خارجی
 *
 * امنیت کلید امضا:
 *  ۱) اگر متغیر محیطی AUTH_SECRET تنظیم شده باشد از همان استفاده می‌شود
 *  ۲) در غیر این صورت کلید تصادفی قوی ساخته و در جدول Setting (کلید authSecret)
 *     ذخیره می‌شود — کلید دیگر در کد عمومی نیست و با استقرار مجدد هم ثابت می‌ماند
 */
import { createHmac, timingSafeEqual, randomBytes, scryptSync, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { sectionAllowed } from '@/lib/access';

export const SESSION_COOKIE = 'noq_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // ۷ روز

export interface SessionPayload {
  uid: string;
  role: string;
  iat: number;
  /** نسخهٔ رمز عبور — پس از تغییر رمز، نشست‌های قدیمی با نسخهٔ کهنه نامعتبر می‌شوند */
  pwv?: string;
}

/**
 * نسخهٔ رمز عبور (pwv) — اثر انگشت کوتاه از هش ذخیره‌شدهٔ رمز.
 * چون salt هر بار hashPassword تصادفی است، با «هر» تغییر رمز این مقدار عوض می‌شود
 * حتی اگر متن رمز همان باشد. توکن‌های قدیمی با pwv ناهم‌خوان دیگر پذیرفته نمی‌شوند
 * → تغییر رمز = باطل‌شدن خودکار همهٔ نشست‌های قبلی (همین دستگاه و دستگاه‌های دیگر).
 */
export function pwTag(storedPassword: string): string {
  return createHash('sha256').update(storedPassword).digest('hex').slice(0, 12);
}

// ─── کلید امضای نشست (پویا) ───
let cachedSecret: string | null = null;

async function getAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  try {
    const row = await db.setting.findUnique({ where: { key: 'authSecret' } });
    if (row?.value && row.value.length >= 32) {
      cachedSecret = row.value;
      return cachedSecret;
    }
    // نسخهٔ ۳.۸.۴ — ضد ناسازگاری کلید بین نمونه‌های سرور:
    // اگر کلید از قبل در دیتابیس هست، هرگز بازنویسی نمی‌شود (update خالی — بدون رقابت)؛
    // و مقدار نهایی همیشه از خود دیتابیس خوانده می‌شود تا دو نمونهٔ هم‌زمان که
    // هر دو کلید تازه ساخته‌اند، در نهایت به «یک» کلید مشترک برسند.
    const generated = randomBytes(32).toString('hex');
    await db.setting.upsert({
      where: { key: 'authSecret' },
      update: {},
      create: { key: 'authSecret', value: generated },
    });
    const finalRow = await db.setting.findUnique({ where: { key: 'authSecret' } });
    cachedSecret = finalRow?.value && finalRow.value.length >= 32 ? finalRow.value : generated;
    return cachedSecret;
  } catch {
    // پایگاه داده در دسترس نیست — کلید موقت برای همین نمونه (نشست‌ها پس از بازگشت دیتابیس معتبر می‌مانند)
    return process.env.AUTH_SECRET || 'noq-fallback-ephemeral-' + (process.env.VERCEL_DEPLOYMENT_ID || 'local');
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

async function sign(data: string): Promise<string> {
  const secret = await getAuthSecret();
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export async function createToken(payload: SessionPayload): Promise<string> {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${await sign(body)}`;
}

export async function parseToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await sign(body);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (Date.now() / 1000 - payload.iat > SESSION_MAX_AGE) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  phone: string | null;
  teacherId: string | null;
  studentId: string | null;
  perms: string | null; // JSON دسترسی بخش‌ها (رونویسی نقش)
  /** درست = رمز این حساب هنوز رمز اولیه/پیش‌فرض است — کاربر باید تغییرش دهد */
  mustChangePassword?: boolean;
}

/** کاربر جاری از کوکی — با بررسی فعال بودن حساب و نسخهٔ رمز عبور */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await parseToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true, username: true, name: true, role: true,
      active: true, phone: true, teacherId: true, studentId: true, perms: true,
      password: true,
    },
  });
  if (!user || !user.active) return null; // کاربر غیرفعال یا حذف‌شده نمی‌تواند وارد شود
  // ── امنیت: پس از تغییر رمز، توکن‌های قدیمی (با نسخهٔ رمز کهنه) باطل می‌شوند ──
  // توکن بدون pwv (نسخه‌های قبل از این اصلاح) هم پذیرفته نمی‌شود تا نشست‌های
  // مانده از قبلِ تغییر رمز هرگز معتبر نمانند.
  if (!payload.pwv || payload.pwv !== pwTag(user.password)) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError('لطفاً وارد سیستم شوید', 401);
  return user;
}

const ROLE_RANK: Record<string, number> = {
  ADMIN: 100,
  HEADTEACHER: 80,
  TEACHER: 60,
  LIBRARIAN: 50,
  STAFF: 40,
  GUARDIAN: 30,
  STUDENT: 20,
};

export async function requireRole(...roles: string[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ApiError('شما به این بخش دسترسی ندارید', 403);
  }
  return user;
}

/**
 * دسترسی بر اساس بخش — نقش پیش‌فرض + رونویسی perms توسط مدیر
 * مدیر می‌تواند برای هر کاربر هر بخش را محدود یا فعال کرده باشد
 */
export async function requireSection(section: string, extraRoles: string[] = []): Promise<AuthUser> {
  const user = await requireUser();
  const allowed = sectionAllowed(user, section) || extraRoles.includes(user.role);
  if (!allowed) {
    throw new ApiError('شما به این بخش دسترسی ندارید — دسترسی شما توسط مدیر مکتب تنظیم شده است', 403);
  }
  return user;
}

export function isAdmin(user: AuthUser) {
  return user.role === 'ADMIN';
}

export function canManageAcademic(user: AuthUser) {
  return ['ADMIN', 'HEADTEACHER'].includes(user.role);
}

export function roleRank(role: string) {
  return ROLE_RANK[role] || 0;
}

export const SESSION_MAX_AGE_S = SESSION_MAX_AGE;


/* ═══════════ امنیت QR کارت‌ها — توکن امضاشده و قابل لغو (مرحلهٔ ۲) ═══════════
 * QR کارت هرگز اطلاعات شخصی (نام/ولد/صنف) حمل نمی‌کند؛ فقط یک توکن تصادفیِ
 * امضاشده با کلید نشست است که تنها سرور می‌تواند آن را بازکند. لغو با ثبت
 * زمان لغو به‌ازای هر شخص در Setting(qrRevocations) انجام می‌شود: هر توکنی که
 * پیش از زمان لغو صادر شده باشد دیگر پذیرفته نمی‌شود؛ چاپ مجدد، توکن تازه می‌سازد. */
export interface QrTokenData {
  kind: 'student' | 'staff';
  id: string;
  iat: number; // ثانیهٔ یونیکس — مبنای مقایسه با زمان لغو
}

const QR_SIGN_CONTEXT = '|noq-qr-v1';

export async function issueQrToken(kind: 'student' | 'staff', id: string): Promise<string> {
  if (!id) throw new ApiError('شناسه شخص لازم است');
  const secret = await getAuthSecret();
  const iat = Math.floor(Date.now() / 1000);
  const jti = randomBytes(6).toString('hex');
  const body = Buffer.from(JSON.stringify({ k: kind === 'staff' ? 's' : 't', id, iat, jti }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret + QR_SIGN_CONTEXT).update(body).digest('base64url').slice(0, 24);
  return `NOQ1.${body}.${sig}`;
}

export async function verifyQrToken(token: string): Promise<QrTokenData | null> {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'NOQ1' || !parts[1] || !parts[2]) return null;
    const secret = await getAuthSecret();
    const expected = createHmac('sha256', secret + QR_SIGN_CONTEXT).update(parts[1]).digest('base64url').slice(0, 24);
    const a = Buffer.from(parts[2], 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { k?: string; id?: string; iat?: number };
    if (typeof p.id !== 'string' || !p.id || typeof p.iat !== 'number' || !Number.isFinite(p.iat)) return null;
    return { kind: p.k === 's' ? 'staff' : 'student', id: p.id, iat: p.iat };
  } catch {
    return null;
  }
}
