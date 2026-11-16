import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { logAudit } from '@/lib/comm-server';

/**
 * پیوند والد ↔ فرزند — یک سرپرست می‌تواند چند شاگرد در صنف‌های مختلف داشته باشد؛
 * دسترسی ارتباطی والد به‌صورت خودکار بر اساس همهٔ فرزندان ثبت‌شده گسترش می‌یابد.
 * فقط مدیر سیستم.
 */
export async function GET() {
  try {
    const me = await requireUser();
    if (me.role !== 'ADMIN') throw new ApiError('تنها مدیر سیستم به این بخش دسترسی دارد', 403);
    const [guardians, links, students] = await Promise.all([
      db.user.findMany({
        where: { role: 'GUARDIAN', active: true },
        select: { id: true, name: true, username: true, studentId: true, studentProfile: { select: { firstName: true, lastName: true, class: { select: { name: true } } } } },
        orderBy: { name: 'asc' },
      }),
      db.guardianLink.findMany({
        include: {
          student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.student.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, fatherName: true, class: { select: { name: true } } },
        orderBy: [{ firstName: 'asc' }],
        take: 1000,
      }),
    ]);
    return NextResponse.json({
      guardians: guardians.map((g) => ({
        id: g.id, name: g.name, username: g.username,
        primaryChild: g.studentId
          ? { id: g.studentId, name: [g.studentProfile?.firstName, g.studentProfile?.lastName].filter(Boolean).join(' '), className: g.studentProfile?.class?.name || null }
          : null,
      })),
      links: links.map((l) => ({
        id: l.id, userId: l.userId, userName: l.user.name,
        studentId: l.student.id,
        studentName: [l.student.firstName, l.student.lastName].filter(Boolean).join(' '),
        className: l.student.class?.name || null,
      })),
      students: students.map((s) => ({
        id: s.id,
        name: [s.firstName, s.lastName].filter(Boolean).join(' '),
        fatherName: s.fatherName,
        className: s.class?.name || null,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (me.role !== 'ADMIN') throw new ApiError('تنها مدیر سیستم به این بخش دسترسی دارد', 403);
    const body = await req.json();
    const userId = str(body.userId);
    const studentId = str(body.studentId);
    if (!userId || !studentId) throw new ApiError('والد و شاگرد هر دو لازم است');
    const [guardian, student] = await Promise.all([
      db.user.findFirst({ where: { id: userId, role: 'GUARDIAN' }, select: { id: true, name: true } }),
      db.student.findUnique({ where: { id: studentId }, select: { id: true, firstName: true } }),
    ]);
    if (!guardian) throw new ApiError('کاربر والد یافت نشد');
    if (!student) throw new ApiError('شاگرد یافت نشد');
    await db.guardianLink.upsert({
      where: { userId_studentId: { userId, studentId } },
      update: {},
      create: { userId, studentId },
    });
    await logAudit(me, 'GUARDIAN_LINK_ADD', { userId, studentId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser();
    if (me.role !== 'ADMIN') throw new ApiError('تنها مدیر سیستم به این بخش دسترسی دارد', 403);
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ پیوند لازم است');
    const link = await db.guardianLink.findUnique({ where: { id }, include: { user: { select: { name: true } }, student: { select: { firstName: true } } } });
    if (!link) throw new ApiError('پیوند یافت نشد');
    await db.guardianLink.delete({ where: { id } });
    await logAudit(me, 'GUARDIAN_LINK_REMOVE', { userId: link.userId, studentId: link.studentId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
