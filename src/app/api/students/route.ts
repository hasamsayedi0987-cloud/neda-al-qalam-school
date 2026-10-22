import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';
import { teacherClassIds, getTeacherPerms, studentInTeacherScope } from '@/lib/teacher-scope';

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
    // معلم فقط شاگردان صنف‌های تحت اختیار خود (تدریس یا نگرانی) را می‌بیند
    if (me.role === 'TEACHER') {
      const scope = await teacherClassIds(me.teacherId || '');
      where.classId = scope.length > 0 ? { in: scope } : '__none__';
    } else if (classId) {
      where.classId = classId;
    }
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
    const me = await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const firstName = str(body.firstName);
    const lastName = str(body.lastName);
    const fatherName = str(body.fatherName);
    // شهرت/تخلص اختیاری است — فقط اسم و نام پدر ضروری
    if (!firstName || !fatherName) {
      throw new ApiError('اسم و نام پدر ضروری است');
    }
    const classId = str(body.classId) || null;
    // معلم باید مجوز مدیر داشته باشد و فقط در صنف‌های خودش شاگرد ثبت کند
    if (me.role === 'TEACHER') {
      const perms = await getTeacherPerms();
      if (!perms.students) {
        throw new ApiError('مدیر اجازهٔ ثبت و ویرایش شاگردان را به معلمان نداده است', 403);
      }
      const scope = await teacherClassIds(me.teacherId || '');
      if (!classId || !scope.includes(classId)) {
        throw new ApiError('شما فقط می‌توانید در صنف‌های تحت تدریس خود شاگرد ثبت کنید', 403);
      }
    }
    let rollNo: number | null = optNum(body.rollNo);
    if (classId && rollNo == null) {
      // بزرگ‌ترین شمارهٔ فعلی + ۱ — پس از حذف شاگردان، شماره تکراری نمی‌شود
      const agg = await db.student.aggregate({ where: { classId }, _max: { rollNo: true } });
      rollNo = (agg._max.rollNo ?? 0) + 1;
    }
    const student = await db.student.create({
      data: {
        firstName, lastName: lastName || null, fatherName,
        grandFather: str(body.grandFather) || null,
        gender: str(body.gender) === 'F' ? 'F' : 'M',
        birthDate: str(body.birthDate) || null,
        idNumber: str(body.idNumber) || null,
        guardianName: str(body.guardianName) || null,
        guardianPhone: str(body.guardianPhone) || null,
        address: str(body.address) || null,
        photo: str(body.photo) || null,
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
    const me = await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const body = await req.json();
    const id = str(body.id);
    if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
    // معلم: مجوز مدیر + شاگرد باید در صنف‌های خودش باشد
    if (me.role === 'TEACHER') {
      const perms = await getTeacherPerms();
      if (!perms.students) {
        throw new ApiError('مدیر اجازهٔ ثبت و ویرایش شاگردان را به معلمان نداده است', 403);
      }
      if (!(await studentInTeacherScope(me.teacherId || '', id))) {
        throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
      }
    }
    const data: Record<string, unknown> = {};
    for (const key of ['firstName', 'lastName', 'fatherName', 'grandFather', 'birthDate', 'idNumber', 'guardianName', 'guardianPhone', 'address', 'enrolledYear']) {
      if (body[key] !== undefined) data[key] = str(body[key]) || null;
    }
    if (body.gender !== undefined) data.gender = str(body.gender) === 'F' ? 'F' : 'M';
    if (body.classId !== undefined) {
      const newClassId = str(body.classId) || null;
      if (me.role === 'TEACHER') {
        const scope = await teacherClassIds(me.teacherId || '');
        if (newClassId && !scope.includes(newClassId)) {
          throw new ApiError('شما فقط به صنف‌های تحت تدریس خود دسترسی دارید', 403);
        }
      }
      data.classId = newClassId;
    }
    if (body.rollNo !== undefined) data.rollNo = optNum(body.rollNo);
    if (body.photo !== undefined) data.photo = str(body.photo) || null;
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
