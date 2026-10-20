'use client';

/**
 * لایهٔ دادهٔ کلاینت — مکتب خصوصی نداالقلم
 * معماری «گیت‌هاب به‌عنوان دیتابیس ابری»: همهٔ درخواست‌های /api/* به‌صورت محلی
 * به مخزن دادهٔ خصوصی گیت‌هاب ترجمه می‌شوند. آفلاین: خواندن از کش، نوشتن در صف.
 */

import { ApiError } from './backend-common';
import { ghWarmup, ghConfigured } from './gh';
import { authGet, authPost, currentAuthUser } from './handlers-core';
import {
  usersGet, usersPost, usersPatch, usersDelete,
  studentsGet, studentsPost, studentsPatch, studentsDelete,
  teachersGet, teachersPost, teachersPatch, teachersDelete,
  classesGet, classesPost, classesPatch, classesDelete,
  assignPost, assignDelete, subjectsGet, subjectsPost, subjectsPatch, subjectsDelete,
  settingsGet, settingsPut,
} from './handlers-core';
import {
  attendanceGet, attendancePost,
  activitiesGet, activitiesPost, activitiesDelete,
  gradesGet, gradesPost, resultsGet,
  libraryGet, libraryPost, libraryDelete,
  notificationsGet, notificationsPost, notificationsPatch, notificationsDelete,
  tasksGet, tasksPost, tasksPatch, tasksDelete,
  dashboardGet, backupGet, backupPost,
} from './handlers-data';

/* ───────────────  وضعیت همگام‌سازی  ─────────────── */

const QUEUE_KEY = 'noq_offline_queue_v1';

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  createdAt: number;
  label: string;
}

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let pendingCount = 0;
const listeners = new Set<() => void>();

function readQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedRequest[];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedRequest[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200)));
  } catch { /* quota */ }
  pendingCount = q.length;
  notify();
}

function notify() {
  listeners.forEach((l) => l());
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

export async function flushQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedRequest[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      const result = await dispatch(item.method, item.url, item.body, true);
      if (result && typeof result === 'object' && 'error' in result && (result as { error?: string }).error) {
        remaining.push(item); // خطای منطقی — بعداً دوباره
      } else {
        sent += 1;
      }
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return sent;
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
  setInterval(() => {
    if (navigator.onLine && readQueue().length > 0) flushQueue();
  }, 30_000);
  online = navigator.onLine;
}

export interface ApiResult<T> {
  data?: T;
  error?: string;
  queued?: boolean;
}

/* ───────────────  روتر  ─────────────── */

function parseUrl(raw: string): { path: string; sp: URLSearchParams } {
  const qIdx = raw.indexOf('?');
  const path = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const sp = new URLSearchParams(qIdx === -1 ? '' : raw.slice(qIdx + 1));
  return { path, sp };
}

let warmupDone = false;

async function dispatch(
  method: string,
  rawUrl: string,
  body: unknown,
  fromQueue = false,
): Promise<unknown> {
  const { path, sp } = parseUrl(rawUrl);
  const b = (body || {}) as Record<string, unknown>;
  void fromQueue;

  // ─── auth (قبل از requireUser) ───
  if (path === '/api/auth') {
    if (method === 'GET') {
      const result = await authGet();
      // پس از ورود موفق، داده‌ها برای کارکرد آفلاین پیش‌بارگذاری می‌شوند
      if ((result as { user?: unknown }).user && !warmupDone && ghConfigured()) {
        warmupDone = true;
        void ghWarmup();
      }
      return result;
    }
    if (method === 'POST') return authPost(b);
    throw new ApiError('متد نامعتبر', 405);
  }

  const me = await currentAuthUser();

  if (path === '/api/users') {
    if (method === 'GET') return usersGet(me);
    if (method === 'POST') return usersPost(me, b);
    if (method === 'PATCH') return usersPatch(me, b);
    if (method === 'DELETE') return usersDelete(me, sp.get('id') || '');
  }
  if (path === '/api/students') {
    if (method === 'GET') return studentsGet(me, sp);
    if (method === 'POST') return studentsPost(me, b);
    if (method === 'PATCH') return studentsPatch(me, b);
    if (method === 'DELETE') return studentsDelete(me, sp.get('id') || '');
  }
  if (path === '/api/teachers') {
    if (method === 'GET') return teachersGet(me);
    if (method === 'POST') return teachersPost(me, b);
    if (method === 'PATCH') return teachersPatch(me, b);
    if (method === 'DELETE') return teachersDelete(me, sp.get('id') || '');
  }
  if (path === '/api/classes') {
    if (method === 'GET') return classesGet(me);
    if (method === 'POST') return classesPost(me, b);
    if (method === 'PATCH') return classesPatch(me, b);
    if (method === 'DELETE') return classesDelete(me, sp.get('id') || '');
  }
  if (path === '/api/classes/assign') {
    if (method === 'POST') return assignPost(me, b);
    if (method === 'DELETE') return assignDelete(me, sp.get('csId') || '');
  }
  if (path === '/api/subjects') {
    if (method === 'GET') return subjectsGet(me);
    if (method === 'POST') return subjectsPost(me, b);
    if (method === 'PATCH') return subjectsPatch(me, b);
    if (method === 'DELETE') return subjectsDelete(me, sp.get('id') || '');
  }
  if (path === '/api/settings') {
    if (method === 'GET') return settingsGet(me);
    if (method === 'PUT') return settingsPut(me, b);
  }
  if (path === '/api/attendance') {
    if (method === 'GET') return attendanceGet(me, sp);
    if (method === 'POST') return attendancePost(me, b);
  }
  if (path === '/api/activities') {
    if (method === 'GET') return activitiesGet(me, sp);
    if (method === 'POST') return activitiesPost(me, b);
    if (method === 'DELETE') return activitiesDelete(me, sp.get('id') || '');
  }
  if (path === '/api/grades') {
    if (method === 'GET') return gradesGet(me, sp);
    if (method === 'POST') return gradesPost(me, b);
  }
  if (path === '/api/results') {
    if (method === 'GET') return resultsGet(me, sp);
  }
  if (path === '/api/library') {
    if (method === 'GET') return libraryGet(me);
    if (method === 'POST') return libraryPost(me, b);
    if (method === 'DELETE') return libraryDelete(me, sp.get('id') || '');
  }
  if (path === '/api/notifications') {
    if (method === 'GET') return notificationsGet(me);
    if (method === 'POST') return notificationsPost(me, b);
    if (method === 'PATCH') return notificationsPatch(me, b);
    if (method === 'DELETE') return notificationsDelete(me, sp.get('id') || '');
  }
  if (path === '/api/tasks') {
    if (method === 'GET') return tasksGet(me);
    if (method === 'POST') return tasksPost(me, b);
    if (method === 'PATCH') return tasksPatch(me, b);
    if (method === 'DELETE') return tasksDelete(me, sp.get('id') || '');
  }
  if (path === '/api/dashboard') {
    if (method === 'GET') return dashboardGet(me);
  }
  if (path === '/api/backup') {
    if (method === 'GET') return backupGet(me);
    if (method === 'POST') return backupPost(me, b);
  }

  throw new ApiError('مسیر یافت نشد', 404);
}

/* ───────────────  رابط عمومی  ─────────────── */

export async function apiGet<T>(url: string): Promise<T> {
  try {
    return (await dispatch('GET', url, undefined)) as T;
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    if (e instanceof Error && e.message) throw e;
    throw new Error('خطا در دریافت اطلاعات');
  }
}

/** درخواست ثبت‌کننده: در حالت آفلاین در صف قرار می‌گیرد */
export async function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  opts: { queueLabel?: string; allowQueue?: boolean } = {},
): Promise<ApiResult<T>> {
  // عملیات نوشتن به مخزن داده، اینترنت می‌خواهد — در آفلاین در صف می‌ماند
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      return { queued: true };
    }
    return { error: 'در حالت آفلاین این عملیات در دسترس نیست' };
  }

  try {
    const data = (await dispatch(method, url, body)) as T;
    // پس از اولین موفقیت، داده‌ها برای آفلاین پیش‌بارگذاری می‌شوند
    if (!warmupDone && ghConfigured()) {
      warmupDone = true;
      void ghWarmup();
    }
    return { data };
  } catch (e) {
    const msg = e instanceof ApiError || e instanceof Error
      ? e.message
      : 'عملیات ناموفق بود';
    // خطای شبکه — در صف قرار بگیرد
    if ((e instanceof TypeError || (e as { status?: number })?.status === 0) && opts.allowQueue !== false) {
      const queue = readQueue();
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url, method, body: body ?? {},
        createdAt: Date.now(),
        label: opts.queueLabel || url,
      });
      writeQueue(queue);
      return { queued: true };
    }
    return { error: msg || 'عملیات ناموفق بود' };
  }
}
