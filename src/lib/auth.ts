/**
 * احراز هویت با کوکی امضاشده (HMAC) — بدون وابستگی خارجی
 */
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

const SECRET = process.env.AUTH_SECRET || 'neda-ol-qalam-school-secret-1405';
export const SESSION_COOKIE = 'noq_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // ۷ روز

export interface SessionPayload {
  uid: string;
  role: string;
  iat: number;
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

function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url');
}

export function createToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function parseToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
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
}

/** کاربر جاری از کوکی — با بررسی فعال بودن حساب */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = parseToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true, username: true, name: true, role: true,
      active: true, phone: true, teacherId: true, studentId: true,
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
