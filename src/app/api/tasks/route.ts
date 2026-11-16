import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';

export async function GET() {
  try {
    const me = await requireUser();
    if (me.role === 'STAFF' || me.role === 'TEACHER') {
      // کارمند/ملازم وظایف خودش را می‌بیند
      if (!me.teacherId) return NextResponse.json({ tasks: [], staff: [] });
      const tasks = await db.staffTask.findMany({
        where: { staffId: me.teacherId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: { assigner: { select: { name: true } } },
      });
      return NextResponse.json({ tasks, staff: [] });
    }
    await requireSection('tasks');
    const tasks = await db.staffTask.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        staff: { select: { id: true, name: true, position: true } },
        assigner: { select: { name: true } },
      },
    });
    const staff = await db.teacher.findMany({
      where: { active: true, position: { in: ['ملازم', 'کارمند', 'معلم', 'کتابخانه‌دار'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, position: true },
    });
    return NextResponse.json({ tasks, staff });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireRole('ADMIN', 'HEADTEACHER');
    const body = await req.json();
    const title = str(body.title);
    const staffId = str(body.staffId);
    if (!title || !staffId) throw new ApiError('عنوان وظیفه و کارمند لازم است');
    const task = await db.staffTask.create({
      data: {
        title,
        description: str(body.description) || null,
        dueDate: str(body.dueDate) || null,
        staffId,
        assignedBy: me.teacherId || null,
      },
    });
    return NextResponse.json({ id: task.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const id = str(body.id);
    const status = str(body.status);
    if (!id || !['PENDING', 'IN_PROGRESS', 'DONE'].includes(status)) {
      throw new ApiError('پارامترهای ناقص');
    }
    const task = await db.staffTask.findUnique({ where: { id } });
    if (!task) throw new ApiError('وظیفه یافت نشد');
    // کارمند فقط وظیفهٔ خودش را به‌روزرسانی می‌کند
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role) && task.staffId !== me.teacherId) {
      throw new ApiError('دسترسی مجاز نیست', 403);
    }
    await db.staffTask.update({ where: { id }, data: { status } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireSection('tasks');
    if (!['ADMIN', 'HEADTEACHER'].includes(me.role)) throw new ApiError('فقط مدیر و سرمعلم می‌توانند وظیفه تعیین کنند', 403);
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسه لازم است');
    await db.staffTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
