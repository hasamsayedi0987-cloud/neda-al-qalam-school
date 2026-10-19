import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

const EDITABLE_KEYS = [
  'schoolName', 'province', 'district', 'authority', 'academicYear',
  'directorName', 'directorPhone', 'directorEmail',
  'maxWritten', 'maxOral', 'maxHomework', 'maxActivity', 'resultNote',
];

export async function GET() {
  try {
    await requireUser();
    const settings = await db.setting.findMany({
      where: { key: { in: EDITABLE_KEYS } },
    });
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return NextResponse.json({ settings: map });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const body = await req.json();
    const incoming = body.settings || {};
    for (const key of EDITABLE_KEYS) {
      if (incoming[key] !== undefined) {
        await db.setting.upsert({
          where: { key },
          update: { value: str(incoming[key]) },
          create: { key, value: str(incoming[key]) },
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
