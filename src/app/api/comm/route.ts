import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { sectionAllowed } from '@/lib/access';
import { permsFor, getCommPolicy, logAudit, COMM_POLICY_KEY } from '@/lib/comm-server';
import {
  COMM_ROLES, effectivePerms, parseCommPolicy,
  type CommPolicy,
} from '@/lib/comm';

/**
 * سیاست ارتباطی — تنها راه کنترل صلاحیت‌های پیام‌رسانی بدون تغییر کد.
 *  GET: صلاحیت مؤثر خودم (+ کل سیاست اگر اجازهٔ مدیریت داشته باشد)
 *  PUT: ذخیرهٔ سیاست توسط مدیر — بلافاصله روی همهٔ درخواست‌ها اثر می‌گذارد
 */

const BOOL_KEYS = [
  'enabled', 'direct', 'group', 'allUsers', 'announce', 'urgent', 'reply', 'attach',
  'seeReadStatus', 'deleteOwn', 'editOwn', 'moderate', 'reports', 'managePolicy',
  'relaxParentScope', 'relaxTeacherScope',
] as const;

function sanitizeOverride(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  const o = raw as Record<string, unknown>;
  for (const k of BOOL_KEYS) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }
  if (Array.isArray(o.toRoles)) {
    const roles = (o.toRoles as unknown[]).map(String).filter((r) => r === '*' || COMM_ROLES.includes(r as (typeof COMM_ROLES)[number]));
    out.toRoles = [...new Set(roles)];
  }
  for (const arrKey of ['extraPeers', 'blockedPeers'] as const) {
    if (Array.isArray(o[arrKey])) {
      out[arrKey] = [...new Set((o[arrKey] as unknown[]).map(String).filter(Boolean))].slice(0, 100);
    }
  }
  return out;
}

async function sanitizePolicy(input: unknown): Promise<CommPolicy> {
  if (!input || typeof input !== 'object') throw new ApiError('ساختار سیاست نامعتبر است');
  const o = input as Record<string, unknown>;
  const clean: CommPolicy = { roles: {}, users: {} };
  if (o.roles && typeof o.roles === 'object' && !Array.isArray(o.roles)) {
    for (const [role, v] of Object.entries(o.roles as Record<string, unknown>)) {
      if (!COMM_ROLES.includes(role as (typeof COMM_ROLES)[number])) continue;
      clean.roles[role] = sanitizeOverride(v);
    }
  }
  if (o.users && typeof o.users === 'object' && !Array.isArray(o.users)) {
    const ids = Object.keys(o.users as Record<string, unknown>);
    if (ids.length > 200) throw new ApiError('رونویسی فردی بیش از حد مجاز است');
    const valid = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const validSet = new Set(valid.map((u) => u.id));
    for (const [uid, v] of Object.entries(o.users as Record<string, unknown>)) {
      if (!validSet.has(uid)) continue;
      const s = sanitizeOverride(v);
      const note = str((v as Record<string, unknown>)?.note).slice(0, 200);
      clean.users[uid] = note ? { ...s, note } : s;
    }
  }
  return clean;
}

export async function GET() {
  try {
    const me = await requireUser();
    const myPerms = await permsFor(me);
    const wantsPolicy = me.role === 'ADMIN' || myPerms.managePolicy;
    const policy = wantsPolicy ? await getCommPolicy() : null;
    return NextResponse.json({
      myPerms,
      role: me.role,
      policy,
      effectiveForMe: effectivePerms(me.role, me.id, policy || parseCommPolicy(null)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const me = await requireUser();
    if (me.role !== 'ADMIN') throw new ApiError('تنظیم صلاحیت‌های ارتباطی تنها توسط مدیر سیستم ممکن است', 403);
    const body = await req.json();
    const clean = await sanitizePolicy(body.policy);
    const value = JSON.stringify(clean);
    await db.setting.upsert({
      where: { key: COMM_POLICY_KEY },
      update: { value },
      create: { key: COMM_POLICY_KEY, value },
    });
    const roleCount = Object.keys(clean.roles).length;
    const userCount = Object.keys(clean.users).length;
    await logAudit(me, 'COMM_POLICY_UPDATE', { roleCount, userCount });
    return NextResponse.json({ ok: true, roleCount, userCount });
  } catch (e) {
    return handleApiError(e);
  }
}
