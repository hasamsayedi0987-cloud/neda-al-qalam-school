import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { clampComponent, componentTotal } from '@/lib/grading';
import { getTeacherPerms, ownsClassSubject } from '@/lib/teacher-scope';

async function getWeights() {
  const settings = await db.setting.findMany({
    where: { key: { in: ['maxWritten', 'maxOral', 'maxHomework', 'maxActivity'] } },
  });
  const map = new Map(settings.map((s) => [s.key, Number(s.value)]));
  return {
    maxWritten: map.get('maxWritten') ?? 40,
    maxOral: map.get('maxOral') ?? 20,
    maxHomework: map.get('maxHomework') ?? 20,
    maxActivity: map.get('maxActivity') ?? 20,
  };
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sp = req.nextUrl.searchParams;

    // کارنامهٔ شاگرد (شاگرد/سرپرست یا پارامتر studentId)
    if (sp.get('mode') === 'student') {
      const studentId = me.role === 'STUDENT' || me.role === 'GUARDIAN' ? me.studentId : sp.get('studentId');
      if (!studentId) throw new ApiError('شناسهٔ شاگرد لازم است', 403);
      const student = await db.student.findUnique({
        where: { id: studentId },
        include: { class: true },
      });
      if (!student) throw new ApiError('شاگرد یافت نشد');
      const grades = await db.grade.findMany({
        where: { studentId },
        include: {
          classSubject: {
            include: { subject: true, teacher: { select: { name: true } } },
          },
        },
      });
      return NextResponse.json({ student, grades });
    }

    const classSubjectId = sp.get('classSubjectId') || '';
    if (!classSubjectId) throw new ApiError('مضمون صنف را انتخاب کنید');
    const cs = await db.classSubject.findUnique({
      where: { id: classSubjectId },
      include: { subject: true, class: true, teacher: { select: { id: true, name: true } } },
    });
    if (!cs) throw new ApiError('مضمون یافت نشد');

    // معلم فقط مضمون خودش را می‌بیند (مدیر و سرمعلم همه)
    if (me.role === 'TEACHER') {
      const teacher = await db.teacher.findUnique({ where: { id: me.teacherId || '' } });
      if (!teacher || cs.teacherId !== teacher.id) {
        throw new ApiError('این مضمون به شما سپرده نشده است', 403);
      }
    }

    const students = await db.student.findMany({
      where: { classId: cs.classId, status: 'ACTIVE' },
      orderBy: { rollNo: 'asc' },
      select: { id: true, firstName: true, lastName: true, fatherName: true, rollNo: true },
    });
    const grades = await db.grade.findMany({
      where: { classSubjectId },
    });
    return NextResponse.json({
      classSubject: {
        id: cs.id, classId: cs.classId, subject: cs.subject,
        className: cs.class.name, teacher: cs.teacher,
      },
      students,
      grades,
      weights: await getWeights(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    const body = await req.json();
    const action = str(body.action);

    // ─── تایید نمرات توسط سرمعلم/مدیر ───
    if (action === 'approve') {
      await requireRole('ADMIN', 'HEADTEACHER');
      const classSubjectId = str(body.classSubjectId);
      const period = str(body.period);
      const approved = Boolean(body.approved);
      if (!classSubjectId || !['MIDTERM', 'ANNUAL'].includes(period)) {
        throw new ApiError('پارامترهای ناقص');
      }
      const cs = await db.classSubject.findUnique({
        where: { id: classSubjectId },
        include: { subject: true, class: true, teacher: true },
      });
      if (!cs) throw new ApiError('مضمون یافت نشد');
      await db.grade.updateMany({
        where: { classSubjectId, period },
        data: { approved },
      });
      // اعلان به معلم مضمون
      if (cs.teacher) {
        const tUsers = await db.user.findMany({
          where: { teacherId: cs.teacher.id, active: true },
        });
        if (tUsers.length > 0) {
          await db.notification.createMany({
            data: tUsers.map((u) => ({
              userId: u.id,
              title: approved ? 'تایید نمرات' : 'لغو تایید نمرات',
              body: `نمرات ${period === 'MIDTERM' ? 'چهارو‌نیم‌ماهه' : 'سالانه'} مضمون ${cs.subject.name} صنف ${cs.class.name} ${approved ? 'تایید' : 'به حالت عدم تایید'} گردید.`,
              type: 'GRADE',
            })),
          });
        }
      }
      // اعلان به والدین پس از تایید
      if (approved) {
        const guardianUsers = await db.user.findMany({
          where: { role: 'GUARDIAN', active: true, studentProfile: { classId: cs.classId } },
        });
        if (guardianUsers.length > 0) {
          await db.notification.createMany({
            data: guardianUsers.map((u) => ({
              userId: u.id,
              title: 'نمرات جدید',
              body: `نمرات ${period === 'MIDTERM' ? 'چهارو‌نیم‌ماهه' : 'سالانه'} مضمون ${cs.subject.name} صنف ${cs.class.name} در سیستم ثبت و تایید گردید.`,
              type: 'GRADE',
            })),
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ─── حذف نمرهٔ شاگرد/شاگردان از یک مضمون (با مجوز مدیر برای معلم) ───
    if (action === 'delete') {
      const classSubjectId = str(body.classSubjectId);
      const period = str(body.period);
      const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds.map((x: unknown) => str(x)).filter(Boolean) : [];
      if (!classSubjectId || !studentIds.length) throw new ApiError('مضمون و شاگرد را مشخص کنید');
      if (me.role === 'TEACHER') {
        const perms = await getTeacherPerms();
        if (!perms.gradeDelete) {
          throw new ApiError('مدیر اجازهٔ حذف نمرات را به معلمان نداده است', 403);
        }
        if (!(await ownsClassSubject(me.teacherId || '', classSubjectId))) {
          throw new ApiError('این مضمون به شما سپرده نشده است', 403);
        }
      } else {
        await requireRole('ADMIN', 'HEADTEACHER');
      }
      const del = await db.grade.deleteMany({
        where: { classSubjectId, period, studentId: { in: studentIds } },
      });
      return NextResponse.json({ ok: true, deleted: del.count });
    }

    // ─── ثبت/به‌روزرسانی نمرات (گروهی) ───
    await requireRole('ADMIN', 'HEADTEACHER', 'TEACHER');
    const classSubjectId = str(body.classSubjectId);
    const period = str(body.period);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!classSubjectId || !['MIDTERM', 'ANNUAL'].includes(period)) {
      throw new ApiError('مضمون و دورهٔ امتحان را مشخص کنید');
    }
    const cs = await db.classSubject.findUnique({
      where: { id: classSubjectId },
      include: { subject: true },
    });
    if (!cs) throw new ApiError('مضمون یافت نشد');
    const teacherPerms = me.role === 'TEACHER' ? await getTeacherPerms() : null;
    if (me.role === 'TEACHER') {
      if (!teacherPerms?.grades) {
        throw new ApiError('مدیر اجازهٔ ثبت و ویرایش نمرات را به معلمان نداده است', 403);
      }
      if (cs.teacherId !== me.teacherId) {
        throw new ApiError('این مضمون به شما سپرده نشده است', 403);
      }
    }
    const w = await getWeights();

    // پیش‌واکشی: یک کوئری برای همهٔ نمرات موجود (قبلاً N+1 کوئری بود)
    const reqStudentIds = items.map((item: { studentId?: unknown }) => str(item.studentId)).filter(Boolean);
    const existingList = await db.grade.findMany({
      where: { classSubjectId, period, studentId: { in: reqStudentIds } },
    });
    const existingMap = new Map(existingList.map((g) => [g.studentId, g]));
    // اعتبارسنجی: شاگرد باید عضو صنفِ مضمون باشد
    const classStudents = cs.classId
      ? await db.student.findMany({ where: { classId: cs.classId }, select: { id: true } })
      : [];
    const validStudentIds = new Set(classStudents.map((s) => s.id));

    let saved = 0;
    let skipped = 0; // شاگرد غیرعضو صنف
    let blockedDeletes = 0; // حذف‌های مسدودشده به‌خاطر نداشتن مجوز مدیر
    const upserts: Prisma.PrismaPromise<unknown>[] = [];
    const deletes: Prisma.PrismaPromise<unknown>[] = [];
    for (const item of items) {
      const studentId = str(item.studentId);
      if (!studentId) continue;
      if (validStudentIds.size > 0 && !validStudentIds.has(studentId)) { skipped += 1; continue; }
      const existing = existingMap.get(studentId);
      // پس از تایید، معلم اجازهٔ ویرایش ندارد (مدیر و سرمعلم دارند)
      if (existing?.approved && me.role === 'TEACHER') continue;
      const written = clampComponent(item.written, w.maxWritten);
      const oral = clampComponent(item.oral, w.maxOral);
      const homework = clampComponent(item.homework, w.maxHomework);
      const activity = clampComponent(item.activity, w.maxActivity);
      const total = componentTotal({ written, oral, homework, activity });
      const hasAny = written != null || oral != null || homework != null || activity != null;
      if (!hasAny && !existing) continue;
      if (!hasAny && existing) {
        // حذف نمره (پاک‌کردن همهٔ اجزا) — برای معلم نیازمند مجوز مدیر است
        if (me.role === 'TEACHER' && !teacherPerms?.gradeDelete) {
          blockedDeletes += 1;
          continue;
        }
        deletes.push(db.grade.delete({ where: { id: existing.id } }));
        saved += 1;
        continue;
      }
      upserts.push(db.grade.upsert({
        where: { studentId_classSubjectId_period: { studentId, classSubjectId, period } },
        update: {
          written, oral, homework, activity, total,
          approved: me.role === 'TEACHER' ? existing?.approved ?? false : body.approved ?? existing?.approved ?? false,
          notes: str(item.notes) || existing?.notes || null,
        },
        create: {
          studentId, classSubjectId, period,
          written, oral, homework, activity, total,
          approved: me.role === 'TEACHER' ? false : Boolean(body.approved),
          notes: str(item.notes) || null,
        },
      }));
      saved += 1;
    }
    if (deletes.length || upserts.length) {
      await db.$transaction([...deletes, ...upserts]);
    }
    return NextResponse.json({ ok: true, saved, blockedDeletes, skipped });
  } catch (e) {
    return handleApiError(e);
  }
}
