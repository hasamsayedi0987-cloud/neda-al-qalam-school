'use client';

/**
 * ابزارهای مشترک بک‌اند سمت کلاینت — مکتب خصوصی نداالقلم
 * احراز هویت با scrypt (سازگار با نسخهٔ سرور) + نشست محلی + خواندن/نوشتن کالکشن‌ها
 */

import { ghReadFile, ghWriteFile, GhError } from './gh';

/* ───────────────  خطاها و کمک‌کننده‌ها  ─────────────── */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

export function num(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) throw new ApiError('عدد نامعتبر است');
  return n;
}

export function optNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function genId(): string {
  const rnd = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(rnd);
  else for (let i = 0; i < 8; i++) rnd[i] = Math.floor(Math.random() * 256);
  return Date.now().toString(36) + Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* ───────────────  رمز عبور — scrypt سازگار با سرور  ─────────────── */

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_LEN = 64;

const te = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function scryptDerive(password: string, salt: string): Promise<Uint8Array> {
  // scrypt-js را به‌صورت پویا وارد می‌کنیم تا در باندل اولیه نیاید
  const mod = (await import('scrypt-js')) as { scrypt: typeof import('scrypt-js').scrypt };
  return mod.scrypt(te.encode(password), te.encode(salt), SCRYPT_N, SCRYPT_r, SCRYPT_p, SCRYPT_LEN);
}

/** ساخت هش رمز — قالب salt:hash (hex) مانند نسخهٔ سرور */
export async function hashPassword(password: string): Promise<string> {
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  const salt = toHex(rnd);
  const hash = await scryptDerive(password, salt);
  return `${salt}:${toHex(hash)}`;
}

/** بررسی رمز در برابر هش ذخیره‌شده */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = await scryptDerive(password, salt);
    const expected = new Uint8Array(hash.length / 2);
    for (let i = 0; i < expected.length; i++) expected[i] = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    if (candidate.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/* ───────────────  کالکشن‌ها — خواندن و نوشتن  ─────────────── */

export const FILES = {
  users: 'db/users.json',
  classes: 'db/classes.json',
  subjects: 'db/subjects.json',
  classSubjects: 'db/classSubjects.json',
  teachers: 'db/teachers.json',
  students: 'db/students.json',
  attendance: 'db/attendance.json',
  staffAttendance: 'db/staffAttendance.json',
  activities: 'db/activities.json',
  grades: 'db/grades.json',
  books: 'db/books.json',
  loans: 'db/loans.json',
  notifications: 'db/notifications.json',
  tasks: 'db/tasks.json',
  settings: 'db/settings.json',
} as const;

export type FileKey = keyof typeof FILES;

export type Rec = Record<string, unknown> & { id: string };

export async function load<T = Rec[]>(key: FileKey, opts?: { maxAgeMs?: number }): Promise<T> {
  const entry = await ghReadFile(FILES[key], opts);
  return entry.data as T;
}

/** تغییر یک کالکشن — در تضاد همزمانی، تغییر روی دادهٔ تازه دوباره اعمال می‌شود */
export async function mutate<T = unknown>(
  key: FileKey,
  fn: (data: Rec[]) => T | Promise<T>,
  message: string,
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const entry = await ghReadFile(FILES[key], { fresh: true });
      const data = (Array.isArray(entry.data) ? entry.data : []) as Rec[];
      const clone = JSON.parse(JSON.stringify(data)) as Rec[];
      const result = await fn(clone);
      await ghWriteFile(FILES[key], clone, { sha: entry.sha, message, retries: 0 });
      return result;
    } catch (e) {
      if (e instanceof GhError && e.status === 409) {
        lastErr = e;
        continue;
      }
      if (e instanceof ApiError) throw e;
      throw e;
    }
  }
  throw lastErr || new ApiError('تضاد همزمانی چند کاربر — دوباره تلاش کنید', 409);
}

/** به‌روزرسانی تنظیمات (شیء key/value) */
export async function loadSettingsMap(): Promise<Record<string, string>> {
  const entry = await ghReadFile(FILES.settings, { maxAgeMs: 300_000 });
  const rows = (Array.isArray(entry.data) ? entry.data : []) as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function mutateSettingsMap(
  fn: (map: Record<string, string>) => void,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const entry = await ghReadFile(FILES.settings, { fresh: true });
      const rows = (Array.isArray(entry.data) ? entry.data : []) as Array<{ key: string; value: string }>;
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      fn(map);
      const next = Object.entries(map).map(([key, value]) => ({ key, value }));
      await ghWriteFile(FILES.settings, next, { sha: entry.sha, message, retries: 0 });
      return;
    } catch (e) {
      if (e instanceof GhError && e.status === 409) continue;
      throw e;
    }
  }
  throw new ApiError('تضاد همزمانی — دوباره تلاش کنید', 409);
}

/* ───────────────  نشست کاربر  ─────────────── */

const SESSION_KEY = 'noq_session_v2';
const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // ۷ روز

export interface SessionData {
  uid: string;
  iat: number;
}

export function getSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionData;
    if (!s?.uid || Date.now() - s.iat > SESSION_MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(uid: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, iat: Date.now() }));
  } catch { /* ignore */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/* ───────────────  دسترسی‌ها  ─────────────── */

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

export function requireUser(me: AuthUser | null): AuthUser {
  if (!me) throw new ApiError('لطفاً وارد سیستم شوید', 401);
  return me;
}

export function requireRole(me: AuthUser | null, ...roles: string[]): AuthUser {
  const u = requireUser(me);
  if (!roles.includes(u.role)) throw new ApiError('شما اجازهٔ این عملیات را ندارید', 403);
  return u;
}
