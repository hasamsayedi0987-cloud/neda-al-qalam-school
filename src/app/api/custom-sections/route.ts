import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * بخش‌های دلخواه — مدیر می‌تواند بخش‌های جدید با فیلدهای سفارشی بسازد
 * (مثال: امتحان هفتگی، تقدیر شاگردان، ثبت وقایع مکتب)
 */

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select';
  options?: string;
  required?: boolean;
}

export function parseFields(json: string): CustomField[] {
  try {
    const arr = JSON.parse(json) as CustomField[];
    return Array.isArray(arr) ? arr.filter((f) => f?.key && f?.label) : [];
  } catch {
    return [];
  }
}

function parseRoles(json: string): string[] {
  try {
    const arr = JSON.parse(json) as string[];
    return Array.isArray(arr) ? arr : ['ADMIN'];
  } catch {
    return ['ADMIN'];
  }
}

export async function GET() {
  try {
    const me = await requireUser();
    const sections = await db.customSection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { entries: { orderBy: { createdAt: 'desc' } } },
    });
    // فیلتر بر اساس نقش — هر بخش فقط برای نقش‌های مجاز دیده می‌شود
    const visible = sections
      .filter((s) => parseRoles(s.viewRoles).includes(me.role) || me.role === 'ADMIN')
      .map((s) => ({
        id: s.id, title: s.title, icon: s.icon, color: s.color,
        fields: parseFields(s.fields),
        viewRoles: parseRoles(s.viewRoles),
        writeRoles: parseRoles(s.writeRoles),
        canWrite: me.role === 'ADMIN' || parseRoles(s.writeRoles).includes(me.role),
        entries: s.entries.map((e) => ({
          id: e.id, data: JSON.parse(e.data || '{}') as Record<string, unknown>,
          entryDate: e.entryDate, createdBy: e.createdBy,
          createdAt: e.createdAt.toISOString(),
        })),
      }));
    return NextResponse.json({ sections: visible });
  } catch (e) {
    return handleApiError(e);
  }
}

function validateFieldList(fields: unknown): CustomField[] {
  if (!Array.isArray(fields)) throw new ApiError('فهرست فیلدها نامعتبر است');
  const clean: CustomField[] = [];
  for (const f of fields as Record<string, unknown>[]) {
    const key = str(f.key).replace(/[^a-zA-Z0-9_]/g, '');
    const label = str(f.label);
    if (!key || !label) continue;
    const type = ['text', 'number', 'date', 'textarea', 'select'].includes(str(f.type))
      ? (str(f.type) as CustomField['type']) : 'text';
    clean.push({
      key, label, type,
      options: type === 'select' ? str(f.options) : undefined,
      required: Boolean(f.required),
    });
  }
  if (clean.length === 0) throw new ApiError('حداقل یک فیلد برای بخش لازم است');
  return clean;
}

const ALL_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];

function validateRoles(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const clean = (v as unknown[]).map(String).filter((r) => ALL_ROLES.includes(r));
  return clean.length ? clean : fallback;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const title = str(body.title);
    if (!title) throw new ApiError('عنوان بخش را وارد کنید');
    const fields = validateFieldList(body.fields);
    const maxSort = await db.customSection.aggregate({ _max: { sortOrder: true } });
    const section = await db.customSection.create({
      data: {
        title,
        icon: str(body.icon) || 'Sparkles',
        color: str(body.color) || 'emerald',
        fields: JSON.stringify(fields),
        viewRoles: JSON.stringify(validateRoles(body.viewRoles, ['ADMIN', 'HEADTEACHER', 'TEACHER'])),
        writeRoles: JSON.stringify(validateRoles(body.writeRoles, ['ADMIN', 'HEADTEACHER', 'TEACHER'])),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ ok: true, id: section.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const id = str(body.id);
    const existing = await db.customSection.findUnique({ where: { id } });
    if (!existing) throw new ApiError('بخش یافت نشد');
    await db.customSection.update({
      where: { id },
      data: {
        title: str(body.title) || existing.title,
        icon: str(body.icon) || existing.icon,
        color: str(body.color) || existing.color,
        ...(body.fields !== undefined ? { fields: JSON.stringify(validateFieldList(body.fields)) } : {}),
        ...(body.viewRoles !== undefined ? { viewRoles: JSON.stringify(validateRoles(body.viewRoles, parseRoles(existing.viewRoles))) } : {}),
        ...(body.writeRoles !== undefined ? { writeRoles: JSON.stringify(validateRoles(body.writeRoles, parseRoles(existing.writeRoles))) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const id = req.nextUrl.searchParams.get('id') || '';
    const existing = await db.customSection.findUnique({ where: { id } });
    if (!existing) throw new ApiError('بخش دلخواه یافت نشد', 404);
    await db.customSection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
