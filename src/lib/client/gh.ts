'use client';

/**
 * لایهٔ ارتباط با گیت‌هاب — «گیت‌هاب به‌عنوان دیتابیس ابری»
 * مکتب خصوصی نداالقلم
 *
 * داده‌های مکتب در یک مخزن خصوصی گیت‌هاب (JSON) نگهداری می‌شود:
 *  - خواندن: GitHub Contents API با کش محلی (IndexedDB) و If-None-Match
 *  - نوشتن: PUT با SHA — در صورت تضاد همزمانی، دوباره دریافت و اعمال می‌شود
 *  - آفلاین: آخرین دادهٔ کش‌شده در دسترس است؛ ثبت‌ها در صف می‌مانند
 */

export const GH_OWNER = 'hasamsayedi0987-cloud';
export const GH_REPO = 'nedaalqalam-school-data';
export const GH_BRANCH = 'main';
const API_BASE = 'https://api.github.com';

const TOKEN_LS_KEY = 'noq_gh_token';

export function ghToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const local = window.localStorage.getItem(TOKEN_LS_KEY);
    if (local) return local.trim();
  } catch { /* ignore */ }
  return (process.env.NEXT_PUBLIC_GH_TOKEN || '').trim();
}

export function setGhToken(token: string) {
  try {
    if (token.trim()) window.localStorage.setItem(TOKEN_LS_KEY, token.trim());
    else window.localStorage.removeItem(TOKEN_LS_KEY);
  } catch { /* ignore */ }
}

export function ghConfigured(): boolean {
  return ghToken().length > 20;
}

/* ───────────────  کش محلی (IndexedDB با سقوط به حافظه)  ─────────────── */

interface CacheEntry {
  data: unknown;
  sha: string;
  etag: string;
  fetchedAt: number;
}

const memCache = new Map<string, CacheEntry>();

const DB_NAME = 'noq-cache';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          try { req.result.createObjectStore(STORE); } catch { /* ignore */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<CacheEntry | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: CacheEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
  } catch { /* ignore */ }
}

/* ───────────────  وضعیت شبکه و محدودیت نرخ  ─────────────── */

let remainingRate = Infinity;
export function rateLow(): boolean {
  return remainingRate < 150;
}

export class GhError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
  const token = ghToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function rateFrom(res: Response) {
  const lim = res.headers.get('x-ratelimit-remaining');
  if (lim != null && !Number.isNaN(Number(lim))) remainingRate = Number(lim);
}

function b64decode(content: string): string {
  const bin = atob(content.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** خواندن یک فایل JSON از مخزن داده (با کش و 304) */
export async function ghReadFile(
  path: string,
  opts: { maxAgeMs?: number; fresh?: boolean } = {},
): Promise<CacheEntry> {
  const maxAgeMs = opts.maxAgeMs ?? (rateLow() ? 240_000 : 30_000);

  let entry = memCache.get(path) || null;
  if (!entry) {
    entry = await idbGet(path);
    if (entry) memCache.set(path, entry);
  }

  if (!opts.fresh && entry && Date.now() - entry.fetchedAt < maxAgeMs) {
    return entry;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (entry) return entry;
    throw new GhError('آفلاین هستید و دادهٔ ذخیره‌شده‌ای موجود نیست', 0);
  }

  const h = headers();
  if (entry?.etag) h['If-None-Match'] = entry.etag;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`, {
      headers: h,
      cache: 'no-store',
    });
  } catch {
    if (entry) return entry;
    throw new GhError('اتصال به گیت‌هاب برقرار نشد', 0);
  }
  rateFrom(res);

  if (res.status === 304 && entry) {
    entry.fetchedAt = Date.now();
    memCache.set(path, entry);
    void idbSet(path, entry);
    return entry;
  }

  if (res.status === 404) {
    const empty: CacheEntry = { data: [], sha: '', etag: '', fetchedAt: Date.now() };
    memCache.set(path, empty);
    void idbSet(path, empty);
    return empty;
  }

  if (res.status === 401 || res.status === 403) {
    const rl = res.headers.get('x-ratelimit-remaining');
    if (rl === '0') throw new GhError('محدودیت درخواست گیت‌هاب — کمی بعد دوباره تلاش کنید', 429);
    throw new GhError('دسترسی به مخزن داده ممکن نیست — توکن را بررسی کنید', res.status);
  }

  if (!res.ok) throw new GhError(`خطای گیت‌هاب (${res.status})`, res.status);

  const json = (await res.json()) as { sha: string; content?: string; encoding?: string };
  const data = json.content ? JSON.parse(b64decode(json.content)) : [];
  const fresh: CacheEntry = {
    data,
    sha: json.sha || '',
    etag: res.headers.get('etag') || '',
    fetchedAt: Date.now(),
  };
  memCache.set(path, fresh);
  void idbSet(path, fresh);
  return fresh;
}

/** نوشتن یک فایل JSON در مخزن داده — با تلاش مجدد در تضاد همزمانی */
export async function ghWriteFile(
  path: string,
  data: unknown,
  opts: { sha?: string; message?: string; retries?: number } = {},
): Promise<CacheEntry> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new GhError('آفلاین هستید — ثبت شما در صف همگام‌سازی قرار گرفت', 0);
  }
  const retries = opts.retries ?? 3;
  let sha = opts.sha;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
        method: 'PUT',
        headers: headers({ 'Content-Type': 'application/json' }),
        cache: 'no-store',
        body: JSON.stringify({
          message: opts.message || `به‌روزرسانی ${path}`,
          content: b64encode(JSON.stringify(data, null, 1)),
          branch: GH_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });
    } catch {
      throw new GhError('اتصال به گیت‌هاب برقرار نشد — ثبت در صف قرار گرفت', 0);
    }
    rateFrom(res);
    if (res.ok) {
      const json = (await res.json()) as { content?: { sha?: string } };
      const fresh: CacheEntry = {
        data,
        sha: json.content?.sha || sha || '',
        etag: '',
        fetchedAt: Date.now(),
      };
      memCache.set(path, fresh);
      void idbSet(path, fresh);
      return fresh;
    }
    if (res.status === 409 || res.status === 422) {
      // تضاد همزمانی — فایل را دوباره بگیر (اگر SHA نداریم، فایل جدید است)
      try {
        const latest = await ghReadFile(path, { fresh: true });
        sha = latest.sha;
        if (attempt === retries) return latest;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      const rl = res.headers.get('x-ratelimit-remaining');
      if (rl === '0') throw new GhError('محدودیت درخواست گیت‌هاب — کمی بعد دوباره تلاش کنید', 429);
      throw new GhError('اجازهٔ نوشتن در مخزن داده نیست — توکن را بررسی کنید', res.status);
    }
    throw new GhError(`ثبت در مخزن داده ناموفق بود (${res.status})`, res.status);
  }
  throw new GhError('تضاد همزمانی چند کاربر — دوباره تلاش کنید', 409);
}

/** پیش‌بارگذاری همهٔ فایل‌های داده برای استفادهٔ آفلاین */
export async function ghWarmup() {
  const files = [
    'db/users.json', 'db/classes.json', 'db/subjects.json', 'db/classSubjects.json',
    'db/teachers.json', 'db/students.json', 'db/attendance.json', 'db/staffAttendance.json',
    'db/activities.json', 'db/grades.json', 'db/books.json', 'db/loans.json',
    'db/notifications.json', 'db/tasks.json', 'db/settings.json',
  ];
  await Promise.allSettled(files.map((f) => ghReadFile(f, { maxAgeMs: 120_000 })));
}
