import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sp = req.nextUrl.searchParams;
    const classId = sp.get('classId');
    const search = sp.get('q');

    // شاگرد/سرپرست فقط اطلاعات خودش را می‌بیند
    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (!me.studentId) throw new ApiError('حساب شما به هیچ شاگردی پیوند ندارد', 403);
      const s = await db.student.findUnique({
        where: { id: me.studentId },
        include: { class: { select: { name: true } } },
      });
      return NextResponse.json({
        students: s ? [{ ...s, className: s.class?.name || null }] : [],
      });
    }

    const where: Record<string, unknown> = {};
    if (classId) where.classId = classId;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { fatherName: { contains: search } },
      ];
    }
    const students = await db.student.findMany({
      where,
      orderBy: [{ classId: 'asc' }, { rollNo: 'asc' }, { createdAt: 'asc' }],
      include: { class: { select: { name: true } } },
    });
    return NextResponse.json({
      students: students.map((s) => ({ ...s, className: s.class?.name || null })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const firstName = str(body.firstName);
    const lastName = str(body.lastName);
    const fatherName = str(body.fatherName);
    if (!firstName || !lastName || !fatherName) {
      throw new ApiError('اسم، شهرت و نام پدر ضروری است');
    }
    const classId = str(body.classId) || null;
    let rollNo: number | null = optNum(body.rollNo);
    if (classId && rollNo == null) {
      const count = await db.student.count({ where: { classId } });
      rollNo = count + 1;
    }
    const student = await db.student.create({
      data: {
        firstName, lastName, fatherName,
        grandFather: str(body.grandFather) || null,
        gender: str(body.gender) === 'F' ? 'F' : 'M',
        birthDate: str(body.birthDate) || null,
        idNumber: str(body.idNumber) || null,
        guardianName: str(body.guardianName) || null,
        guardianPhone: str(body.guardianPhone) || null,
        address: str(body.address) || null,
        classId,
        rollNo,
        enrolledYear: str(body.enrolledYear) || null,
        status: 'ACTIVE',
      },
    });
    return NextResponse.json({ id: student.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
    const data: Record<string, unknown> = {};
    for (const key of ['firstName', 'lastName', 'fatherName', 'grandFather', 'birthDate', 'idNumber', 'guardianName', 'guardianPhone', 'address', 'enrolledYear']) {
      if (body[key] !== undefined) data[key] = str(body[key]) || null;
    }
    if (body.gender !== undefined) data.gender = str(body.gender) === 'F' ? 'F' : 'M';
    if (body.classId !== undefined) data.classId = str(body.classId) || null;
    if (body.rollNo !== undefined) data.rollNo = optNum(body.rollNo);
    if (body.status !== undefined && ['ACTIVE', 'LEFT', 'GRADUATED'].includes(str(body.status))) {
      data.status = str(body.status);
    }
    await db.student.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'HEADTEACHER');
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
    await db.user.updateMany({ where: { studentId: id }, data: { studentId: null } });
    await db.student.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
