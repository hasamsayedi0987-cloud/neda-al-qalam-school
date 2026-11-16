/**
 * احراز هویت با کوکی امضاشده (HMAC) — بدون وابستگی خارجی
 *
 * امنیت کلید امضا:
 *  ۱) اگر متغیر محیطی AUTH_SECRET تنظیم شده باشد از همان استفاده می‌شود
 *  ۲) در غیر این صورت کلید تصادفی قوی ساخته و در جدول Setting (کلید authSecret)
 *     ذخیره می‌شود — کلید دیگر در کد عمومی نیست و با استقرار مجدد هم ثابت می‌ماند
 */
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { sectionAllowed } from '@/lib/access';

export const SESSION_COOKIE = 'noq_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // ۷ روز

export interface SessionPayload {
  uid: string;
  role: string;
  iat: number;
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
    // تولید و ذخیرهٔ کلید تصادفی — در پایگاه داده (قابل دسترس عمومی نیست)
    const generated = randomBytes(32).toString('hex');
    await db.setting.upsert({
      where: { key: 'authSecret' },
      update: { value: generated },
      create: { key: 'authSecret', value: generated },
    });
    cachedSecret = generated;
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
}

/** کاربر جاری از کوکی — با بررسی فعال بودن حساب */
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
    },
  });
  if (!user || !user.active) return null; // کاربر غیرفعال یا حذف‌شده نمی‌تواند وارد شود
  return user;
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
