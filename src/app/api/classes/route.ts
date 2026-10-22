import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, num, str } from '@/lib/api-helpers';
import { teacherClassIds } from '@/lib/teacher-scope';

export async function GET() {
  try {
    const me = await requireUser();
    // معلم فقط صنف‌های تحت اختیار خود را می‌بیند (صنف‌هایی که در آنها تدریس می‌کند یا نگران آن است)
    const scoped = me.role === 'TEACHER' ? await teacherClassIds(me.teacherId || '') : null;
    const classes = await db.class.findMany({
      where: scoped ? { id: { in: scoped } } : undefined,
      orderBy: { grade: 'asc' },
      include: {
        supervisor: { select: { id: true, name: true } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        classSubjects: {
          include: { subject: true, teacher: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return NextResponse.json({
      classes: classes.map((c) => ({
        id: c.id, grade: c.grade, name: c.name, supervisorId: c.supervisorId,
        supervisorName: c.supervisor?.name || null,
        studentCount: c._count.students,
        classSubjects: c.classSubjects.map((cs) => ({
          id: cs.id, classId: cs.classId, subjectId: cs.subjectId, teacherId: cs.teacherId,
          subject: { id: cs.subject.id, name: cs.subject.name },
          teacher: cs.teacher ? { id: cs.teacher.id, name: cs.teacher.name } : null,
        })),
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
    const grade = num(body.grade);
    const name = str(body.name);
    if (grade < 1 || grade > 12) throw new ApiError('صنف باید بین ۱ تا ۱۲ باشد');
    if (!name) throw new ApiError('نام صنف لازم است');
    const exists = await db.class.findFirst({ where: { name } });
    if (exists) throw new ApiError('صنفی با این نام قبلاً ثبت شده است');
    const cls = await db.class.create({
      data: { grade, name, supervisorId: str(body.supervisorId) || null },
    });
    return NextResponse.json({ id: cls.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ صنف لازم است');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = str(body.name);
    if (body.grade !== undefined) {
      const grade = num(body.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
        throw new ApiError('صنف باید عددی بین ۱ تا ۱۲ باشد');
      }
      data.grade = grade;
    }
    if (body.supervisorId !== undefined) data.supervisorId = str(body.supervisorId) || null;
    await db.class.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN');
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ صنف لازم است');
    const cls = await db.class.findUnique({
      where: { id }, include: { _count: { select: { students: true } } },
    });
    if (!cls) throw new ApiError('صنف یافت نشد');
    if (cls._count.students > 0) throw new ApiError('ابتدا شاگردان این صنف را منتقل کنید');
    await db.class.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
