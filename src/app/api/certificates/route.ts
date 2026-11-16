import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

/**
 * تقدیرنامه‌ساز — قالب‌های A4 با رنگ، خط، استایل و متن دلخواه
 * مدیر: ساخت/ویرایش/حذف قالب | سرمعلم و معلم: استفاده
 */

export const DEFAULT_CERT_CONFIG = {
  title: 'تقدیرنامه',
  subtitle: 'مکتب خصوصی نداالقلم',
  body: 'بدین‌وسیله از جنبه‌ها/شاگرد محترم {نام} به سبب {علت} قدردانی و تقدیر می‌گردد. امید است که با تلاش بیشتر، موفقیت‌های بعدی را رقم بزنند.',
  bgColor: '#f0fdf4',
  textColor: '#064e3b',
  accentColor: '#047857',
  borderStyle: 'double',
  borderWidth: 6,
  borderColor: '#047857',
  fontFamily: 'Vazirmatn',
  titleSize: 34,
  bodySize: 17,
  showLogo: true,
  logoSize: 84,
  showDate: true,
  showSignature: true,
  signatureName: 'مدیر مکتب',
  dateText: '',
};

export type CertConfig = typeof DEFAULT_CERT_CONFIG;

export function parseConfig(json: string): CertConfig {
  try {
    const obj = JSON.parse(json) as Partial<CertConfig>;
    return { ...DEFAULT_CERT_CONFIG, ...obj };
  } catch {
    return { ...DEFAULT_CERT_CONFIG };
  }
}

export async function GET() {
  try {
    await requireSection('certificates');
    const templates = await db.certificateTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id, name: t.name, config: parseConfig(t.config),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const name = str(body.name);
    if (!name) throw new ApiError('نام قالب را وارد کنید');
    const t = await db.certificateTemplate.create({
      data: { name, config: JSON.stringify({ ...DEFAULT_CERT_CONFIG, ...(body.config ?? {}) }) },
    });
    return NextResponse.json({ ok: true, id: t.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const id = str(body.id);
    const existing = await db.certificateTemplate.findUnique({ where: { id } });
    if (!existing) throw new ApiError('قالب یافت نشد');
    await db.certificateTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: str(body.name) || existing.name } : {}),
        ...(body.config !== undefined ? { config: JSON.stringify({ ...parseConfig(existing.config), ...body.config }) } : {}),
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
    const existing = await db.certificateTemplate.findUnique({ where: { id } });
    if (!existing) throw new ApiError('قالب تقدیرنامه یافت نشد', 404);
    await db.certificateTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
