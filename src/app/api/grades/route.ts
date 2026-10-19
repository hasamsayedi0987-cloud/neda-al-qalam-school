import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { clampComponent, componentTotal } from '@/lib/grading';

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
    if (me.role === 'TEACHER' && cs.teacherId !== me.teacherId) {
      throw new ApiError('این مضمون به شما سپرده نشده است', 403);
    }
    const w = await getWeights();

    let saved = 0;
    for (const item of items) {
      const studentId = str(item.studentId);
      if (!studentId) continue;
      const existing = await db.grade.findUnique({
        where: {
          studentId_classSubjectId_period: { studentId, classSubjectId, period },
        },
      });
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
        await db.grade.delete({ where: { id: existing.id } });
        saved += 1;
        continue;
      }
      await db.grade.upsert({
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
      });
      saved += 1;
    }
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    return handleApiError(e);
  }
}
