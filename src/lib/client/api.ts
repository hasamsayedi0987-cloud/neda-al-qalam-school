'use client';

/**
 * لایهٔ دادهٔ محلی‌اول (Local-First) — مکتب خصوصی نداالقلم
 *
 * اصول:
 *  ۱) خواندن: آنلاین از سرور؛ آفلاین فوراً از کش محلی (بدون تلاش شبکه — سرعت برابر آنلاین)
 *  ۲) نوشتن: آنلاین مستقیم به سرور؛ آفلاین فوراً روی کش محلی «رونویسی» می‌شود (Overlay)
 *     تا تغییر همان لحظه در جدول‌ها دیده شود و در صف همگام‌سازی هم قرار می‌گیرد
 *  ۳) با اولین اتصال، صف خودکار تخلیه و دادهٔ واقعی سرور جایگزین می‌شود
 *  ۴) ورود آفلاین: بررسی محلی نام کاربری و رمز (پس از اولین ورود موفق روی همین دستگاه)
 */

import { gregorianToJalali, isoToday } from '@/lib/jalali';

const QUEUE_KEY = 'noq_offline_queue_v1';
const GET_CACHE_KEY = 'noq_get_cache_v1';
const CREDS_KEY = 'noq_offline_creds_v1';
const IDMAP_KEY = 'noq_idmap_v1';
const LAST_USER_KEY = 'noq_last_user_v1';
type Row = Record<string, unknown>;

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  createdAt: number;
  label: string;
  /** شناسهٔ موقت محلی برای رکورد POST (تا زمان همگام‌سازی) */
  tempId?: string;
  /** شمار شکست‌ها (۴xx منطقی) — داده هرگز بی‌صدا حذف نمی‌شود */
  failCount?: number;
  lastError?: string;
}

interface OverlayEntry {
  /** همان id آیتم صف — پس از ارسال موفق حذف می‌شود */
  qid: string;
  collection: string;
  method: string;
  body: unknown;
  url: string;
  tempId?: string;
}

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pendingCount = 0;
let authRequired = false;
let probing = false;
/** قفل تخلیهٔ صف — دو flush هم‌زمان هرگز (رقابت و ازدست‌رفتن داده ممنوع) */
let flushing = false;
let flushAgain = false;
const listeners = new Set<() => void>();

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

/** وضعیت اتصال بر اساس نتیجهٔ واقعی fetch — نه فقط navigator.onLine (وای‌فای بدون انترنت دروغ می‌گوید) */
function setOnlineState(v: boolean) {
  if (online !== v) {
    online = v;
    notify();
  }
}

export function onSyncStateChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isOnline() {
  return online;
}

export function pendingSyncCount() {
  return pendingCount;
}

/** ثبت‌هایی که سرور آن‌ها را رد کرده (۴xx منطقی) — برای نمایش به مدیر، هرگز حذف بی‌صدا نمی‌شوند */
export function failedSyncItems(): { id: string; label: string; error: string }[] {
  return readQueue()
    .filter((q) => q.failCount && q.lastError)
    .map((q) => ({ id: q.id, label: q.label, error: q.lastError || '' }));
}

/** آیا صف به‌دلیل نبود نشست معتبر ارسال نشد؟ (نیاز به ورود مجدد) */
export function isAuthRequired() {
  return authRequired;
}

/** پس از ورود موفق آنلاین — صف دوباره تلاش می‌کند */
export function markAuthRestored() {
  authRequired = false;
  flushQueue();
}

/* ───────────────  صف آفلاین + رونویسی محلی (Overlay)  ─────────────── */

function readQueue(): QueuedRequest[] {
  return readLS<QueuedRequest[]>(QUEUE_KEY, []);
}

function writeQueue(q: QueuedRequest[]) {
  writeLS(QUEUE_KEY, q.slice(-300));
  pendingCount = q.length;
  notify();
}

/**
 * رونویسی محلی (Overlay) دیگر حافظهٔ جداگانه ندارد — همیشه از خود صف «مشتق» می‌شود.
 * یعنی رونوشت و صف هرگز از هم جدا نمی‌افتند و تغییر آفلاین تا لحظهٔ همگام‌سازی همیشه دیده می‌شود.
 */
function readOverlay(): OverlayEntry[] {
  return readQueue().map((item) => ({
    qid: item.id,
    collection: collectionOf(item.url),
    method: item.method,
    body: item.body,
    url: item.url,
    tempId: item.tempId,
  }));
}

function collectionOf(url: string): string {
  const m = url.match(/\/api\/([a-z\-/]+)/i);
  const path = m ? m[1].replace(/\/+$/, '') : '';
  return path.toLowerCase();
}

/** نگاشت شناسهٔ موقت → شناسهٔ واقعی سرور (پس از تخلیهٔ صف) */
function readIdMap(): Record<string, string> {
  return readLS<Record<string, string>>(IDMAP_KEY, {});
}

function rememberId(tempId: string, realId: string) {
  if (!tempId || !realId || tempId === realId) return;
  const map = readIdMap();
  map[tempId] = realId;
  const keys = Object.keys(map);
  if (keys.length > 300) {
    for (const k of keys.slice(0, keys.length - 300)) delete map[k];
  }
  writeLS(IDMAP_KEY, map);
  // ترمیم اعتبار آفلاین کاربرانی که آفلاین ساخته شدند (شناسهٔ موقت → واقعی)
  try {
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    let changed = false;
    for (const c of Object.values(all)) {
      if (c.user?.id === tempId) { c.user.id = realId; changed = true; }
    }
    if (changed) localStorage.setItem(CREDS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** جایگزینی بازگشتی هر مقدار رشته‌ای برابر با شناسهٔ موقت، با شناسهٔ واقعی سرور */
function rewriteIds<T>(value: T, map: Record<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => rewriteIds(v, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Row = {};
    for (const [k, v] of Object.entries(value as Row)) out[k] = rewriteIds(v, map);
    return out as unknown as T;
  }
  if (typeof value === 'string' && map[value]) return map[value] as unknown as T;
  return value;
}

/**
 * بازنویسی شناسه‌های موقت داخل پارامترهای آدرس (؟id=tmp-... و classId و …)
 * پیشتر فقط بدنهٔ درخواست بازنویسی می‌شد و DELETE/PATCH با شناسهٔ موقت در آدرس
 * برای همیشه ۴۰۴ می‌خورد و در صف گیر می‌کرد — ریشهٔ هشدار قرمز همگام‌سازی.
 */
function rewriteUrl(url: string, map: Record<string, string>): string {
  if (!url.includes('?') || Object.keys(map).length === 0) return url;
  try {
    const u = new URL(url, 'http://local');
    let changed = false;
    for (const [k, v] of [...u.searchParams.entries()]) {
      if (map[v]) {
        u.searchParams.set(k, map[v]);
        changed = true;
      }
    }
    if (!changed) return url;
    const qs = u.searchParams.toString();
    const base = url.split('?')[0];
    return qs ? `${base}?${qs}` : base;
  } catch {
    return url;
  }
}

function newTempId(): string {
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ───────────────  مشخصات هر بخش برای رونویسی محلی  ─────────────── */

function num(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function idFromUrl(url: string): string {
  try {
    return new URL(url, 'http://local').searchParams.get('id') || '';
  } catch {
    return '';
  }
}

/**
 * کالکشن‌های نوشتنی که روی کالکشن‌های خواندنی «دیگر» اثر می‌گذارند
 * (بقیه به‌صورت پیش‌فرض روی هم‌نام خودشان اعمال می‌شوند)
 */
const AFFECTS: Record<string, string[]> = {
  'custom-entries': ['custom-sections'],
};

const SPECS: Record<string, { apply: (data: Row, e: OverlayEntry, url: string) => Row }> = {
  students: {
    apply(data, e) {
      if (!Array.isArray(data.students)) return data;
      const list = data.students as Row[];
      if (e.method === 'POST') {
        const b = e.body as Row;
        list.unshift({
          ...b, id: e.tempId, className: null,
          rollNo: num(b.rollNo), status: b.status || 'ACTIVE',
        });
      } else if (e.method === 'PATCH') {
        const b = e.body as Row;
        const i = list.findIndex((s) => s.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
        else list.unshift({ ...b, className: null });
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.students = list.filter((s) => s.id !== id);
      }
      return data;
    },
  },

  classes: {
    apply(data, e) {
      if (!Array.isArray(data.classes)) return data;
      const list = data.classes as Row[];
      if (e.method === 'POST') list.unshift({ ...(e.body as Row), id: e.tempId, classSubjects: [] });
      else if (e.method === 'PATCH') {
        const b = e.body as Row;
        const i = list.findIndex((c) => c.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.classes = list.filter((c) => c.id !== id);
      }
      return data;
    },
  },

  subjects: {
    apply(data, e) {
      if (!Array.isArray(data.subjects)) return data;
      const list = data.subjects as Row[];
      if (e.method === 'POST') list.unshift({ ...(e.body as Row), id: e.tempId });
      else if (e.method === 'PATCH') {
        const b = e.body as Row;
        const i = list.findIndex((s) => s.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.subjects = list.filter((s) => s.id !== id);
      }
      return data;
    },
  },

  teachers: {
    apply(data, e) {
      if (!Array.isArray(data.teachers)) return data;
      const list = data.teachers as Row[];
      if (e.method === 'POST') list.unshift({ ...(e.body as Row), id: e.tempId, assignments: [] });
      else if (e.method === 'PATCH') {
        const b = e.body as Row;
        const i = list.findIndex((t) => t.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.teachers = list.filter((t) => t.id !== id);
      }
      return data;
    },
  },

  users: {
    apply(data, e) {
      if (!Array.isArray(data.users)) return data;
      const list = data.users as Row[];
      if (e.method === 'POST') {
        const { password, ...rest } = (e.body as Row) || {};
        list.unshift({ ...rest, id: e.tempId, active: true, studentName: null });
      } else if (e.method === 'PATCH') {
        const b = { ...((e.body as Row) || {}) };
        delete b.newPassword;
        const i = list.findIndex((u) => u.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.users = list.filter((u) => u.id !== id);
      }
      return data;
    },
  },

  activities: {
    apply(data, e) {
      if (!Array.isArray(data.activities)) return data;
      const list = data.activities as Row[];
      if (e.method === 'POST') {
        const b = (e.body as Row) || {};
        list.unshift({
          ...b, id: e.tempId, recordedBy: null, score: num(b.score),
          date: b.date || isoToday(), createdAt: new Date().toISOString(),
        });
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.activities = list.filter((a) => a.id !== id);
      }
      return data;
    },
  },

  tasks: {
    apply(data, e) {
      if (!Array.isArray(data.tasks)) return data;
      const list = data.tasks as Row[];
      if (e.method === 'POST') {
        const b = (e.body as Row) || {};
        const staffArr = Array.isArray(data.staff) ? (data.staff as Row[]) : [];
        list.unshift({
          ...b, id: e.tempId, status: 'PENDING', assigner: null,
          staff: staffArr.find((s) => s.id === b.staffId) || null,
          createdAt: new Date().toISOString(),
        });
      } else if (e.method === 'PATCH') {
        const b = (e.body as Row) || {};
        const i = list.findIndex((t) => t.id === b.id);
        if (i >= 0) list[i] = { ...list[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.tasks = list.filter((t) => t.id !== id);
      }
      return data;
    },
  },

  library: {
    apply(data, e) {
      if (!Array.isArray(data.books)) return data;
      const books = data.books as Row[];
      const loans = Array.isArray(data.loans) ? (data.loans as Row[]) : [];
      const b = (e.body as Row) || {};
      const action = String(b.action || '');
      if (action === 'save-book') {
        const copies = Math.max(1, num(b.copies) ?? 1);
        if (b.id) {
          const i = books.findIndex((x) => x.id === b.id);
          if (i >= 0) {
            const lentCount = num(books[i].lentCount) ?? 0;
            books[i] = { ...books[i], title: b.title, author: b.author ?? null, category: b.category ?? null, shelfNo: b.shelfNo ?? null, copies, available: Math.max(0, copies - lentCount) };
          }
        } else {
          books.unshift({ id: e.tempId, title: b.title, author: b.author ?? null, category: b.category ?? null, shelfNo: b.shelfNo ?? null, copies, available: copies, lentCount: 0, loans: [] });
        }
      } else if (action === 'lend') {
        const book = books.find((x) => x.id === b.bookId);
        const loan: Row = {
          id: `${e.tempId}-l`, bookId: b.bookId, borrowerName: b.borrowerName,
          borrowerType: b.borrowerType || 'STUDENT', studentId: b.studentId ?? null,
          loanDate: b.loanDate, dueDate: b.dueDate, status: 'LENT', returnDate: null,
          notes: b.notes ?? null, bookTitle: book?.title || '',
          overdue: String(b.dueDate || '') < isoToday(),
        };
        loans.unshift(loan);
        if (book) {
          book.available = Math.max(0, (num(book.available) ?? 0) - 1);
          book.lentCount = (num(book.lentCount) ?? 0) + 1;
          if (Array.isArray(book.loans)) (book.loans as Row[]).unshift(loan);
        }
      } else if (action === 'return') {
        const loan = loans.find((l) => l.id === b.loanId);
        if (loan) {
          loan.status = 'RETURNED';
          loan.returnDate = isoToday();
          const book = books.find((x) => x.id === loan.bookId);
          if (book) {
            book.available = (num(book.available) ?? 0) + 1;
            book.lentCount = Math.max(0, (num(book.lentCount) ?? 0) - 1);
            if (Array.isArray(book.loans)) book.loans = (book.loans as Row[]).filter((l) => l.id !== b.loanId);
          }
        }
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.books = books.filter((x) => x.id !== id);
      }
      return data;
    },
  },

  grades: {
    apply(data, e, url) {
      if (!Array.isArray(data.grades)) return data;
      const grades = data.grades as Row[];
      const b = (e.body as Row) || {};
      let cs = String(b.classSubjectId || '');
      if (!cs) {
        try {
          const sp = new URL(url, 'http://local').searchParams;
          if (sp.get('classSubjectId')) cs = String(sp.get('classSubjectId'));
        } catch { /* ignore */ }
      }
      if (b.action === 'delete') {
        const ids: string[] = Array.isArray(b.studentIds) ? (b.studentIds as string[]) : [];
        data.grades = grades.filter((g) => !(g.classSubjectId === cs && g.period === b.period && ids.includes(String(g.studentId))));
        return data;
      }
      if (b.action === 'approve') {
        for (const g of grades) {
          if (g.classSubjectId === cs && g.period === b.period) g.approved = Boolean(b.approved);
        }
        return data;
      }
      const period = String(b.period || '');
      const items: Row[] = Array.isArray(b.items) ? (b.items as Row[]) : [];
      for (const it of items) {
        const studentId = String(it.studentId || '');
        if (!studentId) continue;
        const written = num(it.written), oral = num(it.oral), homework = num(it.homework), activity = num(it.activity);
        const hasAny = written != null || oral != null || homework != null || activity != null;
        const i = grades.findIndex((g) => g.studentId === studentId && g.classSubjectId === cs && g.period === period);
        if (!hasAny) {
          if (i >= 0) grades.splice(i, 1);
          continue;
        }
        const total = [written, oral, homework, activity].reduce<number>((a, x) => a + (x || 0), 0);
        const base: Row = i >= 0 ? grades[i] : { id: `${e.tempId}-${studentId}`, studentId, classSubjectId: cs, period, approved: false };
        const merged: Row = { ...base, written, oral, homework, activity, total, notes: it.notes ?? base.notes ?? null };
        if (i >= 0) grades[i] = merged;
        else grades.push(merged);
      }
      return data;
    },
  },

  attendance: {
    apply(data, e, url) {
      if (!Array.isArray(data.records)) return data;
      const records = data.records as Row[];
      const b = (e.body as Row) || {};
      let sp: URLSearchParams;
      try {
        sp = new URL(url, 'http://local').searchParams;
      } catch {
        return data;
      }
      const mode = sp.get('mode') || 'daily';

      if (b.action === 'staff') {
        const items: Row[] = Array.isArray(b.items) ? (b.items as Row[]) : [];
        for (const it of items) {
          const tid = String(it.teacherId || '');
          if (!tid) continue;
          const i = records.findIndex((r) => r.teacherId === tid && r.date === b.date);
          const rec: Row = { ...(i >= 0 ? records[i] : { id: `${e.tempId}-${tid}` }), teacherId: tid, date: b.date, status: it.status };
          if (i >= 0) records[i] = rec;
          else records.unshift(rec);
        }
        return data;
      }

      const date = String(b.date || '');
      if (!date) return data;
      let applies = false;
      if (mode === 'daily') {
        applies = sp.get('date') === date && (!sp.get('classId') || sp.get('classId') === String(b.classId || ''));
      } else if (mode === 'monthly') {
        const jy = Number(sp.get('jy'));
        const jm = Number(sp.get('jm'));
        const [gy, gm, gd] = date.split('-').map(Number);
        if (gy && gm && gd) {
          const j = gregorianToJalali(gy, gm, gd);
          applies = j.jy === jy && j.jm === jm && (!sp.get('classId') || sp.get('classId') === String(b.classId || ''));
        }
      }
      if (!applies) return data;
      const items: Row[] = Array.isArray(b.items) ? (b.items as Row[]) : [];
      for (const it of items) {
        const sid = String(it.studentId || '');
        if (!sid) continue;
        const i = records.findIndex((r) => r.studentId === sid && r.date === date);
        const rec: Row = { ...(i >= 0 ? records[i] : { id: `${e.tempId}-${sid}` }), studentId: sid, date, status: it.status };
        if (b.classId) rec.classId = b.classId;
        if (i >= 0) records[i] = rec;
        else records.unshift(rec);
      }
      return data;
    },
  },

  'custom-sections': {
    apply(data, e) {
      if (!Array.isArray(data.sections)) return data;
      const sections = data.sections as Row[];
      if (e.collection === 'custom-entries') {
        const b = (e.body as Row) || {};
        if (e.method === 'POST') {
          const sec = sections.find((s) => s.id === b.sectionId);
          if (sec && Array.isArray(sec.entries)) {
            (sec.entries as Row[]).unshift({
              id: e.tempId, data: (b.data as Row) || {}, entryDate: b.entryDate ?? null,
              createdBy: null, createdAt: new Date().toISOString(),
            });
          }
        } else if (e.method === 'PATCH') {
          for (const sec of sections) {
            if (!Array.isArray(sec.entries)) continue;
            const i = (sec.entries as Row[]).findIndex((x) => x.id === b.id);
            if (i >= 0) {
              const list = sec.entries as Row[];
              list[i] = { ...list[i], data: (b.data as Row) || list[i].data };
              if (b.entryDate !== undefined) list[i].entryDate = b.entryDate;
              break;
            }
          }
        } else if (e.method === 'DELETE') {
          const id = idFromUrl(e.url);
          for (const sec of sections) {
            if (Array.isArray(sec.entries)) sec.entries = (sec.entries as Row[]).filter((x) => x.id !== id);
          }
        }
        return data;
      }
      // خود بخش‌ها
      if (e.method === 'POST') {
        const b = (e.body as Row) || {};
        sections.unshift({
          ...b, id: e.tempId, canWrite: true,
          fields: typeof b.fields === 'string' ? safeJson(b.fields) : (b.fields ?? []),
          viewRoles: typeof b.viewRoles === 'string' ? safeJson(b.viewRoles) : (b.viewRoles ?? []),
          writeRoles: typeof b.writeRoles === 'string' ? safeJson(b.writeRoles) : (b.writeRoles ?? []),
          entries: [],
        });
      } else if (e.method === 'PATCH') {
        const b = (e.body as Row) || {};
        const i = sections.findIndex((s) => s.id === b.id);
        if (i >= 0) sections[i] = { ...sections[i], ...b };
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.sections = sections.filter((s) => s.id !== id);
      }
      return data;
    },
  },

  certificates: {
    apply(data, e) {
      if (!Array.isArray(data.templates)) return data;
      const list = data.templates as Row[];
      const b = (e.body as Row) || {};
      if (e.method === 'POST') list.push({ id: e.tempId, name: b.name, config: b.config || {} });
      else if (e.method === 'PATCH') {
        const i = list.findIndex((t) => t.id === b.id);
        if (i >= 0) {
          list[i] = { ...list[i], ...(b.name !== undefined ? { name: b.name } : {}), ...(b.config ? { config: { ...(list[i].config as Row), ...(b.config as Row) } } : {}) };
        }
      } else if (e.method === 'DELETE') {
        const id = idFromUrl(e.url);
        data.templates = list.filter((t) => t.id !== id);
      }
      return data;
    },
  },

  settings: {
    apply(data, e) {
      const b = (e.body as Row) || {};
      if (e.method === 'PUT' && b.settings && typeof b.settings === 'object') {
        data.settings = { ...((data.settings as Row) || {}), ...(b.settings as Row) };
      }
      return data;
    },
  },

  notifications: {
    apply(data, e) {
      const b = (e.body as Row) || {};
      if (e.method === 'PATCH' && b.all === true) {
        if (Array.isArray(data.notifications)) {
          for (const n of data.notifications as Row[]) n.read = true;
        }
        data.unread = 0;
      }
      return data;
    },
  },

  fees: {
    apply(data, e) {
      if (e.method === 'POST') {
        const b = (e.body as Row) || {};
        if (!Array.isArray(data.payments)) data.payments = [];
        const sid = String(b.studentId || '');
        const stu = Array.isArray(data.students) ? (data.students as Row[]).find((s) => s.id === sid) : null;
        (data.payments as Row[]).unshift({
          id: e.tempId, studentId: sid, month: b.month, amount: num(b.amount) ?? 0,
          paidAt: b.paidAt || isoToday(), method: b.method || 'CASH',
          note: b.note ?? null, recordedBy: null, createdAt: new Date().toISOString(),
          studentName: stu?.name || '', className: stu?.className || null,
        });
      }
      return data;
    },
  },

  messages: {
    apply(data, e) {
      const b = (e.body as Row) || {};
      if (e.method === 'POST') {
        if (!Array.isArray(data.sent)) data.sent = [];
        let toLabel = '';
        if (b.toUserId) {
          const c = Array.isArray(data.contacts) ? (data.contacts as Row[]).find((x) => x.id === b.toUserId) : null;
          toLabel = c ? String(c.name) : 'کاربر';
        } else if (b.toClassId) {
          const c = Array.isArray(data.classes) ? (data.classes as Row[]).find((x) => x.id === b.toClassId) : null;
          toLabel = `والدین صنف ${c ? String(c.name) : ''}`.trim();
        } else if (b.toRole === 'ALL') toLabel = 'همگانی — همه';
        else if (b.toRole) toLabel = `همگانی — ${String(b.toRole)}`;
        (data.sent as Row[]).unshift({
          id: e.tempId, subject: b.subject ?? null, body: b.body,
          category: b.category || 'GENERAL', read: false,
          createdAt: new Date().toISOString(), toLabel, fromName: '', fromRole: '',
        });
      }
      return data;
    },
  },

  schedule: {
    apply(data, e) {
      if (!Array.isArray(data.slots)) return data;
      const slots = data.slots as Row[];
      const b = (e.body as Row) || {};
      if (e.method === 'POST') {
        const i = slots.findIndex((s) => s.classId === b.classId && s.day === b.day && s.period === b.period);
        const classes = Array.isArray(data.classes) ? (data.classes as Row[]) : [];
        const cls = classes.find((c) => c.id === b.classId);
        const cs = cls && Array.isArray(cls.classSubjects) ? (cls.classSubjects as Row[]).find((x) => x.subjectId === b.subjectId) : null;
        const teachers = Array.isArray(data.teachers) ? (data.teachers as Row[]) : [];
        const t = b.teacherId ? teachers.find((x) => x.id === b.teacherId) : null;
        const row: Row = {
          id: i >= 0 ? String(slots[i].id) : e.tempId,
          classId: b.classId, className: cls ? String(cls.name) : '',
          subjectId: b.subjectId, subjectName: cs ? String((cs.subject as Row)?.name || '') : '',
          teacherId: b.teacherId ?? null, teacherName: t ? String(t.name) : null,
          day: b.day, period: b.period,
        };
        if (i >= 0) slots[i] = row;
        else slots.push(row);
      }
      return data;
    },
  },
};

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/** اعمال رونویسی‌های محلی روی دادهٔ خوانده‌شده — تغییرات آفلاین بلافاصله دیده می‌شوند */
function applyOverlay(url: string, data: unknown): unknown {
  const entries = readOverlay();
  if (entries.length === 0 || !data || typeof data !== 'object') return data;
  const readCol = collectionOf(url);
  if (!readCol) return data;
  const spec = SPECS[readCol];
  if (!spec) return data;
  const affects = AFFECTS[readCol] || [readCol];
  let result: Row = JSON.parse(JSON.stringify(data)) as Row;
  for (const e of entries) {
    if (!affects.includes(e.collection)) continue;
    try {
      result = spec.apply(result, e, url) || result;
    } catch {
      /* خطای رونویسی — دادهٔ خام نمایش داده می‌شود */
    }
  }
  return result;
}

/* ───────────────  کش خواندن برای حالت آفلاین  ─────────────── */

interface CacheItem {
  t: number;
  data: unknown;
}

function readGetCache(): Record<string, CacheItem> {
  return readLS<Record<string, CacheItem>>(GET_CACHE_KEY, {});
}

function writeGetCache(cache: Record<string, CacheItem>) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > 500) {
      keys.sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0));
      for (const k of keys.slice(0, keys.length - 500)) delete cache[k];
    }
    localStorage.setItem(GET_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
}

function cacheGet(url: string, data: unknown) {
  const cache = readGetCache();
  cache[url] = { t: Date.now(), data };
  writeGetCache(cache);
}

function cachePeek(url: string): unknown | undefined {
  const item = readGetCache()[url];
  return item ? item.data : undefined;
}

/** پس از تخلیهٔ موفق صف، دادهٔ سرور برای بخش‌های تغییرکرده تازه‌سازی می‌شود */
async function refreshCollections(cols: Set<string>) {
  if (cols.size === 0 || !navigator.onLine) return;
  const cache = readGetCache();
  const keys = Object.keys(cache).filter((k) => cols.has(collectionOf(k)));
  await Promise.allSettled(
    keys.map(async (k) => {
      try {
        const res = await fetchTimeout(k, { cache: 'no-store' }, 6000);
        if (res.ok && res.headers.get('x-noq-cache') !== '1') {
          cacheGet(k, await res.json());
        }
      } catch {
        /* کش قبلی می‌ماند */
      }
    }),
  );
}

function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

export async function apiGet<T>(url: string): Promise<T> {
  // آفلاین (یا وای‌فای بی‌انترنت): خواندن فوری از حافظهٔ گوشی — بدون تلاش شبکه
  if (typeof navigator !== 'undefined' && (!navigator.onLine || !online)) {
    setOnlineState(false);
    const cached = cachePeek(url);
    if (cached !== undefined) return applyOverlay(url, cached) as T;
    // کش محلی خالی — آخرین شانس: کش سرویس‌ورکر
    try {
      const res = await fetchTimeout(url, { cache: 'no-store' }, 4000);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        cacheGet(url, json);
        return applyOverlay(url, json) as T;
      }
    } catch {
      /* هیچ */
    }
    throw new Error('آفلاین — داده‌ای برای این بخش ذخیره نشده است');
  }

  try {
    const res = await fetchTimeout(url, { cache: 'no-store' }, 6000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 503 || res.status === 502) setOnlineState(false);
      const cached = cachePeek(url);
      if (cached !== undefined) return applyOverlay(url, cached) as T;
      throw new Error((json as Row).error ? String((json as Row).error) : 'خطا در دریافت اطلاعات');
    }
    if (res.headers.get('x-noq-cache') === '1') {
      // پاسخ از کش سرویس‌ورکر آمده (شبکه واقعاً در دسترس نیست)
      setOnlineState(false);
    } else {
      setOnlineState(true);
      cacheGet(url, json);
    }
    return applyOverlay(url, json) as T;
  } catch (e) {
    setOnlineState(false);
    const cached = cachePeek(url);
    if (cached !== undefined) return applyOverlay(url, cached) as T;
    throw e instanceof Error && e.message ? e : new Error('خطا در دریافت اطلاعات');
  }
}

function enqueue<T>(url: string, method: string, body: unknown, opts: { queueLabel?: string; allowQueue?: boolean }): ApiResult<T> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const isPost = method === 'POST';
  const tempId = isPost ? newTempId() : undefined;
  const queue = readQueue();
  queue.push({ id, url, method, body: body ?? {}, createdAt: Date.now(), label: opts.queueLabel || url, tempId });
  writeQueue(queue);
  requestBackgroundSync();
  return { queued: true, tempId };
}

/** درخواست ثبت‌کننده: در حالت آفلاین فوراً روی کش محلی اعمال و در صف قرار می‌گیرد */
export async function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  opts: { queueLabel?: string; allowQueue?: boolean } = {},
): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setOnlineState(false);
    if (opts.allowQueue !== false) return enqueue<T>(url, method, body, opts);
    return { error: 'در حالت آفلاین این عملیات در دسترس نیست', network: true };
  }
  try {
    const res = await fetchTimeout(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    }, 8000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // سرور/شبکه در دسترس نیست — ثبت در صف آفلاین (داده گم نمی‌شود)
      if (res.status === 502 || res.status === 503 || res.status === 504 || res.status >= 500) {
        setOnlineState(false);
        if (opts.allowQueue !== false) return enqueue<T>(url, method, body, opts);
        return { error: (json as Row).error ? String((json as Row).error) : 'سرور در دسترس نیست', network: true };
      }
      return { error: (json as Row).error ? String((json as Row).error) : 'عملیات ناموفق بود', status: res.status };
    }
    setOnlineState(true);
    return { data: json as T };
  } catch {
    // navigator.onLine ممکن است دروغ گفته باشد (وای‌فای بدون انترنت)
    setOnlineState(false);
    if (opts.allowQueue !== false) return enqueue<T>(url, method, body, opts);
    return { error: 'اتصال به سرور برقرار نشد', network: true };
  }
}

export async function flushQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  if (flushing) {
    // تخلیه در جریان است — به‌جای اجرای موازی، نشانه می‌گذاریم تا بلافاصله دوباره تلاش شود
    flushAgain = true;
    return 0;
  }
  flushing = true;
  try {
    return await flushQueueInner();
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      void flushQueue();
    }
  }
}

/** پیام خطای تکراری‌بودن — داده روی سرور موجود است، حذف از صف بی‌خطر است */
function isDuplicateError(msg: string): boolean {
  return msg.includes('قبلاً ثبت شده') || msg.includes('قبلاً گرفته شده');
}

/**
 * یافتن شناسهٔ واقعی یک رکوردِ ثبت‌شده با شناسهٔ موقت — با تطبیق مشخصات روی دادهٔ فعلی سرور.
 * کاربرد: وقتی POST آفلاین «تکراری» تشخیص داده شد (رکورد از قبل روی سرور هست) یا
 * PATCH/DELETE با شناسهٔ موقت ۴۰۴ خورد — تا پیوندهای بعدی صف (childId و …) سالم بمانند.
 * فعلاً کاربران (با نام کاربری یکتا) و شاگردان (اسم + ولد + صنف) پشتیبانی می‌شوند.
 */
async function resolveTempRecord(item: QueuedRequest, postBodies: Record<string, Row>): Promise<string | null> {
  try {
    const col = collectionOf(item.url);
    const src = postBodies[item.tempId || ''] || (item.body as Row) || {};
    if (col === 'users') {
      const uname = String(src.username || '').trim().toLowerCase();
      if (!uname) return null;
      const res = await fetchTimeout('/api/users', { cache: 'no-store' }, 8000);
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as { users?: Row[] };
      const hit = (json.users || []).find((u) => String(u.username || '').trim().toLowerCase() === uname);
      return hit ? String(hit.id) : null;
    }
    if (col === 'students') {
      const fn = String(src.firstName || '').trim();
      const fa = String(src.fatherName || '').trim();
      if (!fn || !fa) return null;
      const res = await fetchTimeout('/api/students', { cache: 'no-store' }, 8000);
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as { students?: Row[] };
      const hit = (json.students || []).find((s) =>
        String(s.firstName || '').trim() === fn &&
        String(s.fatherName || '').trim() === fa &&
        String(s.lastName || '').trim() === String(src.lastName || '').trim(),
      );
      return hit ? String(hit.id) : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * حذف دستی یک آیتم گیرکرده از صف — فقط با تصمیم و تأیید مدیر (هیچ‌گاه خودکار نیست).
 * با حذف، رونویسی محلی همان ثبت هم از جدول‌ها پاک می‌شود؛ داده روی سرور دست‌نخورده می‌ماند.
 */
export function discardQueueItem(id: string) {
  const queue = readQueue();
  writeQueue(queue.filter((q) => q.id !== id));
  notify();
}

/** پاک‌کردن همهٔ ثبت‌های خطاخوردهٔ صف (با تأیید مدیر) — دادهٔ سرور دست‌نخورده می‌ماند */
export function discardAllFailedItems(): number {
  const queue = readQueue();
  const keep = queue.filter((q) => !(q.failCount && q.lastError));
  const removed = queue.length - keep.length;
  if (removed > 0) writeQueue(keep);
  return removed;
}

async function flushQueueInner(attempt = 0): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const idMap = readIdMap();
  const remaining: QueuedRequest[] = [];
  const affected = new Set<string>();
  let sent = 0;
  let authFailed = false;
  // بدنهٔ POSTهای صف — برای یافتن رکورد واقعی وقتی شناسهٔ موقت در آدرس است (حذف/ویرایش پس از ثبت آفلاین)
  const postBodies: Record<string, Row> = {};
  for (const q of queue) {
    if (q.method === 'POST' && q.tempId && q.body && typeof q.body === 'object') {
      postBodies[q.tempId] = q.body as Row;
    }
  }

  for (const item of queue) {
    try {
      const sendUrl = rewriteUrl(rewriteIds(item.url, idMap), idMap);
      const sendBody = rewriteIds(item.body, idMap);
      const res = await fetchTimeout(sendUrl, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.method === 'DELETE' ? undefined : JSON.stringify(sendBody),
        cache: 'no-store',
      }, 15000);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        sent += 1;
        if (item.method === 'POST' && (json as Row)?.id && item.tempId) {
          rememberId(item.tempId, String((json as Row).id));
        }
        affected.add(collectionOf(item.url));
      } else if (res.status === 401 || res.status === 403) {
        // نشست معتبر نیست — داده حذف نمی‌شود؛ با ورود خودکار/دوباره ارسال می‌شود
        remaining.push(item);
        authFailed = true;
      } else if (res.status === 404 && item.method === 'DELETE') {
        // حذف رکوردی که روی سرور وجود ندارد = بی‌خطر و بی‌اثر — از صف حذف می‌شود
        // (مثلاً ثبت آفلاین که قبلاً به‌عنوان تکراری حذف شده یا هرگز ثبت نشده)
        affected.add(collectionOf(item.url));
      } else if (res.status === 404 && item.tempId) {
        // PATCH با شناسهٔ موقتِ آدرسی که هنوز به شناسهٔ واقعی نگاشت نشده —
        // تلاش برای یافتن شناسهٔ واقعی از روی بدنهٔ POST اصلی همان رکورد
        const resolved = await resolveTempRecord(item, postBodies);
        if (resolved) {
          rememberId(item.tempId, resolved);
          idMap[item.tempId] = resolved;
          flushAgain = true; // با نگاشت تازه، دوباره تلاش می‌شود
        } else {
          const failCount = (item.failCount || 0) + 1;
          remaining.push({ ...item, failCount, lastError: 'رکورد موردنظر روی سرور یافت نشد' });
        }
      } else if (res.status >= 500) {
        remaining.push(item);
      } else {
        // خطای منطقی سرور — داده هرگز بی‌صدا نابود نمی‌شود:
        //  • تکراری (روی سرور هست) → حذف از صف بی‌خطر است (+ نگاشت شناسهٔ واقعی برای پیوندها)
        //  • سایر ۴xx → با شمار شکست در صف می‌ماند تا مدیر ببیند و اصلاح کند
        const msg = (json as Row).error ? String((json as Row).error) : `خطای ${res.status}`;
        if (isDuplicateError(msg)) {
          affected.add(collectionOf(item.url));
          if (item.method === 'POST' && item.tempId) {
            const resolved = await resolveTempRecord(item, postBodies);
            if (resolved) {
              rememberId(item.tempId, resolved);
              idMap[item.tempId] = resolved;
            }
          }
        } else {
          const failCount = (item.failCount || 0) + 1;
          remaining.push({ ...item, failCount, lastError: msg });
        }
      }
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  authRequired = authFailed && remaining.length > 0;
  if (authFailed && attempt < 2) {
    // ورود مجدد خودکار با اعتبار ذخیره‌شدهٔ همین دستگاه — اگر موفق شود صف بلافاصله تخلیه می‌شود
    const relog = await tryAutoRelogin();
    if (relog) {
      authRequired = false;
      return sent + (await flushQueueInner(attempt + 1));
    }
  }
  if (affected.size > 0) {
    void refreshCollections(affected);
    try {
      window.dispatchEvent(new CustomEvent('noq:synced', { detail: { collections: [...affected] } }));
    } catch { /* ignore */ }
  }
  notify();
  return sent;
}

/* ───────────────  تشخیص برگشت اتصال (پروب)  ─────────────── */

/** وقتی navigator.onLine درست است ولی درخواست‌ها شکست خورده — هر ۱۵ ثانیه دوباره بررسی می‌شود */
async function probeConnectivity() {
  if (probing || online || typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  probing = true;
  try {
    // HEAD از مسیر استاتیک — سرویس‌ورکر فقط GET را رهگیری می‌کند؛ HEAD واقعاً به شبکه می‌رود
    await fetchTimeout(`/manifest.json?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store' }, 4000);
    setOnlineState(true);
    void flushQueue();
    // اگر داده‌ها قبلاً از کش کهنه (شبکهٔ کند) نمایش داده شده بود، همین حالا از سرور تازه می‌شود
    void refreshRecentCache();
  } catch {
    /* هنوز آفلاین */
  }
  probing = false;
}

/** ۲۵ کلید اخیر کش خواندن را از سرور تازه می‌کند — پس از برگشت اتصال */
async function refreshRecentCache() {
  const cache = readGetCache();
  const keys = Object.keys(cache)
    .sort((a, b) => (cache[b].t || 0) - (cache[a].t || 0))
    .slice(0, 25);
  await Promise.allSettled(
    keys.map(async (k) => {
      try {
        const res = await fetchTimeout(k, { cache: 'no-store' }, 8000);
        if (res.ok && res.headers.get('x-noq-cache') !== '1') cacheGet(k, await res.json());
      } catch { /* کش قبلی می‌ماند */ }
    }),
  );
  if (keys.length > 0) {
    try {
      window.dispatchEvent(new CustomEvent('noq:synced', { detail: { collections: [] } }));
    } catch { /* ignore */ }
  }
}

if (typeof window !== 'undefined') {
  pendingCount = readQueue().length;
  window.addEventListener('online', () => {
    online = true;
    notify();
    flushQueue();
  });
  window.addEventListener('offline', () => {
    online = false;
    notify();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void probeConnectivity();
  });
  // هنگام باز شدن اپ با انترنت — صف معطل نمی‌ماند (تا پیش از این فقط هر ۳۰ ثانیه!)
  if (navigator.onLine && pendingCount > 0) void flushQueue();
  setInterval(() => {
    if (navigator.onLine && readQueue().length > 0) flushQueue();
  }, 30_000);
  setInterval(() => {
    void probeConnectivity();
  }, 15_000);
  online = navigator.onLine;
  // پیام سرویس‌ورکر پس از برگشت اتصال (Background Sync) — تخلیهٔ صف
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data === 'flush-queue') flushQueue();
    });
  }
}

/** ثبت Background Sync — پس از وصل شدن، سرویس‌ورکر به اپ خبر می‌دهد */
function requestBackgroundSync() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          const syncMgr = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
          return syncMgr ? syncMgr.register('noq-flush') : Promise.resolve();
        })
        .catch(() => {});
    }
  } catch {
    /* مرورگر پشتیبانی نمی‌کند */
  }
}

export interface ApiResult<T> {
  data?: T;
  error?: string;
  queued?: boolean;
  /** درست بودن یعنی مشکل از شبکه بود (نه رد شدن منطقی سرور) */
  network?: boolean;
  /** کد وضعیت HTTP پاسخ سرور (برای منطق UI مثل تایید دوبارهٔ ۴۰۹) */
  status?: number;
  /** برای ثبت‌های صف‌شدهٔ POST — شناسهٔ موقت محلی (برای ذخیرهٔ اعتبار آفلاین کاربر جدید) */
  tempId?: string;
}

/* ───────────────  ورود آفلاین — بررسی محلی رمز  ─────────────── */

export interface OfflineCred {
  user: {
    id: string; username: string; name: string; role: string;
    phone: string | null; teacherId: string | null; studentId: string | null;
  };
  salt: string;
  hash: string;
  /** رمز رمزنگاری‌شدهٔ ساده (base64) — فقط برای ورود مجدد خودکار پس از برگشت انترنت */
  pw?: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derive(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' },
    key, 256,
  );
  return toHex(bits);
}

/** پس از ورود موفق آنلاین، مشخصات برای ورود آفلاین بعدی ذخیره می‌شود (asLastUser=false برای ذخیرهٔ کاربر تازه‌ساخته بدون تغییر کاربر جاری) */
export async function saveOfflineCred(user: OfflineCred['user'], password: string, asLastUser = true) {
  if (typeof window === 'undefined' || !password) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = toHex(salt.buffer as ArrayBuffer);
    const hash = await derive(password, saltHex);
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    all[user.username.toLowerCase()] = {
      user, salt: saltHex, hash,
      // برای ورود مجدد خودکار پس از برگشت انترنت (وقتی نشست کوکی مرده) —
      // تا صف آفلاین هرگز به‌خاطر نشست مرده گیر نکند
      pw: typeof password === 'string' ? btoa(unescape(encodeURIComponent(password))) : undefined,
    };
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
    if (asLastUser) localStorage.setItem(LAST_USER_KEY, user.username.toLowerCase());
  } catch { /* ignore */ }
}

/** آخرین کاربری که روی همین دستگاه وارد شده (برای ورود مجدد خودکار) */
export function lastUsername(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LAST_USER_KEY) || '';
}

/**
 * ورود مجدد خودکار بدون دخالت کاربر:
 * وقتی صف هنگام تخلیه با ۴۰۱ روبه‌رو می‌شود (نشست کوکی با بستن اپ مرده)،
 * با اعتبار ذخیره‌شدهٔ همان کاربر یک بار وارد می‌شود و صف بلافاصله تخلیه می‌شود.
 * این همان جایی است که پیشتر ثبت‌های آفلاین برای همیشه معطل می‌ماندند.
 */
export async function tryAutoRelogin(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const uname = lastUsername();
    if (!uname) return false;
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    const cred = all[uname];
    if (!cred?.pw) return false;
    const password = decodeURIComponent(escape(atob(cred.pw)));
    const res = await fetchTimeout('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: cred.user.username, password }),
      cache: 'no-store',
    }, 10000);
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    if (!(json as Row).user) return false;
    // نشست تازه — شاید نقش/شناسه تغییر کرده باشد، اعتبار محلی هم به‌روز می‌شود
    await saveOfflineCred((json as Row).user as OfflineCred['user'], password);
    return true;
  } catch {
    return false;
  }
}

/** ورود بدون اینترنت — رمز در برابر هش ذخیره‌شدهٔ همین دستگاه بررسی می‌شود */
export async function offlineLogin(username: string, password: string): Promise<OfflineCred['user'] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const all = JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') as Record<string, OfflineCred>;
    const cred = all[username.trim().toLowerCase()];
    if (!cred) return null;
    const hash = await derive(password, cred.salt);
    if (hash !== cred.hash) return null;
    localStorage.setItem(LAST_USER_KEY, username.trim().toLowerCase());
    return cred.user;
  } catch {
    return null;
  }
}

export function clearOfflineCreds() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch { /* ignore */ }
}
