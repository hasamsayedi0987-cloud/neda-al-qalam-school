import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';
import { teacherClassIds, getTeacherPerms, studentInTeacherScope } from '@/lib/teacher-scope';

/* ─── مرحلهٔ ۶ — سرعت برای ۱۰۰۰+ شاگرد ───
 * ۱) عکس شاگرد هرگز در فهرست ارسال نمی‌شود (dataURL چند ده کیلوبایتی بزرگ‌ترین
 *    عامل کندی بود) — فقط با /api/students/photo?id=… به‌صورت تنبل بارگیری می‌شود.
 * ۲) فهرست صفحه‌بندی‌شده است (page/pageSize) و بر اساس صنف/وضعیت/جنسیت/جستجو
 *    در همان سمت سرور فیلتر می‌شود — موبایل دیگر ۱۰۰۰ پرونده را یک‌جا نمی‌گیرد.
 * ۳) شمارهٔ تکراری در یک صنف (شماره در جدول) در ثبت، ویرایش و ارتقا رد می‌شود. */

// فهرست سبک — همهٔ ستون‌ها به‌جز عکس (عکس فقط با endpoint اختصاصی)
const LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fatherName: true,
  grandFather: true,
  gender: true,
  birthDate: true,
  idNumber: true,
  baseNumber: true,
  idPlace: true,
  fatherTongue: true,
  motherTongue: true,
  guardianName: true,
  guardianPhone: true,
  address: true,
  classId: true,
  rollNo: true,
  status: true,
  enrolledYear: true,
  class: { select: { name: true } },
};

/** جلوگیری از شمارهٔ دانش‌آموزی تکراری در یک صنف */
async function assertRollNoFree(classId: string | null, rollNo: number | null, excludeId?: string) {
  if (!classId || rollNo == null) return;
  const dup = await db.student.findFirst({
    where: { classId, rollNo, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, firstName: true, lastName: true },
  });
  if (dup) {
    const nm = `${dup.firstName}${dup.lastName ? ' ' + dup.lastName : ''}`;
    throw new ApiError(
      `شمارهٔ «${rollNo}» در این صنف قبلاً برای «${nm}» ثبت شده است — شمارهٔ دیگری وارد کنید یا خالی بگذارید تا خودکار تعیین شود`,
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireSection('students', ['LIBRARIAN', 'STUDENT', 'GUARDIAN']);
    const sp = req.nextUrl.searchParams;
    const classId = sp.get('classId') || '';
    const search = (sp.get('q') || '').trim();
    const status = sp.get('status') || '';
    const gender = sp.get('gender') || '';
    const singleId = sp.get('id') || '';

    // شاگرد/سرپرست فقط اطلاعات خودش را می‌بیند (با عکس — یک رکورد است)
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

    // دریافت یک شاگردِ کامل (با عکس) — برای ویرایش و چاپ اسناد
    if (singleId) {
      if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', singleId))) {
        throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
      }
      const s = await db.student.findUnique({
        where: { id: singleId },
        include: { class: { select: { name: true } } },
      });
      if (!s) throw new ApiError('شاگرد یافت نشد', 404);
      return NextResponse.json({ student: { ...s, className: s.class?.name || null } });
    }

    const where: Record<string, unknown> = {};
    // معلم فقط شاگردان صنف‌های تحت اختیار خود (تدریس یا نگرانی) را می‌بیند
    if (me.role === 'TEACHER') {
      const scope = await teacherClassIds(me.teacherId || '');
      where.classId = scope.length > 0 ? { in: scope } : '__none__';
    } else if (classId) {
      // بارگذاری بر اساس صنف — به‌جای گرفتن همهٔ مکتب یک‌جا
      where.classId = classId;
    }
    if (status && ['ACTIVE', 'LEFT', 'GRADUATED'].includes(status)) where.status = status;
    if (gender === 'M' || gender === 'F') where.gender = gender;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { fatherName: { contains: search } },
        { idNumber: { contains: search } },
      ];
    }

    const orderBy = [{ classId: 'asc' as const }, { rollNo: 'asc' as const }, { createdAt: 'asc' as const }];

    // صفحه‌بندی — پیش‌فرض ۵۰ رکورد، سقف ۱۰۰؛ با all=1 همهٔ نتیجهٔ فیلترشده (بدون عکس) برای خروجی اکسل/PDF
    let skip: number | undefined;
    let take: number | undefined;
    let page = 1;
    let pageSize = 50;
    const wantsAll = sp.get('all') === '1';
    if (!wantsAll) {
      const pRaw = parseInt(sp.get('page') || '1', 10);
      const sRaw = parseInt(sp.get('pageSize') || '50', 10);
      page = Number.isFinite(pRaw) && pRaw > 0 ? pRaw : 1;
      pageSize = Number.isFinite(sRaw) ? Math.min(100, Math.max(10, sRaw)) : 50;
      skip = (page - 1) * pageSize;
      take = pageSize;
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy,
        select: LIST_SELECT,
        skip,
        take,
      }),
      db.student.count({ where }),
    ]);

    return NextResponse.json({
      students: students.map((s) => ({ ...s, className: s.class?.name || null })),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** زنجیرهٔ ثبت شاگرد — بررسی شمارهٔ تکراری و ساخت در ترتیب (ضد مسابقهٔ ثبت موازی — مرحلهٔ ۸) */
let createChain: Promise<unknown> = Promise.resolve();

export async function POST(req: NextRequest) {
  try {
    const me = await requireSection('students');
    const body = await req.json();
    // ایدمپوتنسی صف آفلاین — replay ثبت شاگرد پس از قطعی، پروندهٔ تکراری نمی‌سازد (نسخهٔ ۳.۱.۰)
    const clientToken = str(body.clientToken).slice(0, 64);
    if (clientToken) {
      const dup = await db.student.findUnique({ where: { clientToken }, select: { id: true } });
      if (dup) return NextResponse.json({ id: dup.id, duplicate: true });
    }
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
    // مرحلهٔ ۶ — شمارهٔ دانش‌آموزی تکراری در یک صنف رد می‌شود
    // مرحلهٔ ۸ — بررسی و ساخت در زنجیرهٔ موازی؛ دو ثبت هم‌زمان شمارهٔ تکراری نمی‌سازند
    const run = createChain.then(async () => {
      await assertRollNoFree(classId, rollNo);
      return db.student.create({
        data: {
          firstName, lastName: lastName || null, fatherName,
          grandFather: str(body.grandFather) || null,
          gender: str(body.gender) === 'F' ? 'F' : 'M',
          birthDate: str(body.birthDate) || null,
          idNumber: str(body.idNumber) || null,
          baseNumber: str(body.baseNumber) || null, // نمبر اساس وزارت معارف — اختیاری
          guardianName: str(body.guardianName) || null,
          guardianPhone: str(body.guardianPhone) || null,
          address: str(body.address) || null,
          photo: str(body.photo) || null,
          idPlace: str(body.idPlace) || null,
          fatherTongue: str(body.fatherTongue) || null,
          motherTongue: str(body.motherTongue) || null,
          classId,
          rollNo,
          enrolledYear: str(body.enrolledYear) || null,
          status: 'ACTIVE',
          clientToken: clientToken || null,
        },
      });
    });
    createChain = run.catch(() => { /* زنجیره با خطای یک ثبت نمی‌شکند */ });
    const student = await run;
    return NextResponse.json({ id: student.id });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireSection('students');
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
    for (const key of ['firstName', 'lastName', 'fatherName', 'grandFather', 'birthDate', 'idNumber', 'baseNumber', 'guardianName', 'guardianPhone', 'address', 'enrolledYear', 'idPlace', 'fatherTongue', 'motherTongue']) {
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
    // مرحلهٔ ۶ — عکس فقط با مقدار واقعی به‌روزرسانی می‌شود؛ حذف عکس تنها با پرچم
    // صریح photoClear انجام می‌شود تا ویرایش بدون عکس (فهرست سبک/آفلاین) عکس را پاک نکند
    if (body.photo !== undefined && str(body.photo)) data.photo = str(body.photo);
    if (body.photoClear === true) data.photo = null;
    if (body.status !== undefined && ['ACTIVE', 'LEFT', 'GRADUATED'].includes(str(body.status))) {
      data.status = str(body.status);
    }
    // مرحلهٔ ۶ — با تغییر صنف یا شماره، تکراری‌بودن شماره در صنفِ نهایی بررسی می‌شود
    if (data.classId !== undefined || data.rollNo !== undefined) {
      const existing = await db.student.findUnique({
        where: { id },
        select: { classId: true, rollNo: true },
      });
      if (!existing) throw new ApiError('شاگرد یافت نشد', 404);
      const effClass = data.classId !== undefined ? (data.classId as string | null) : existing.classId;
      const effRoll = data.rollNo !== undefined ? (data.rollNo as number | null) : existing.rollNo;
      await assertRollNoFree(effClass, effRoll, id);
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
