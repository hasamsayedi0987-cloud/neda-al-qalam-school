import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/auth';

export function handleApiError(e: unknown) {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error('API error:', e);
  const message = e instanceof Error ? e.message : 'خطای غیرمنتظرهٔ سرور';
  return NextResponse.json({ error: message }, { status: 500 });
}

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data);
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
