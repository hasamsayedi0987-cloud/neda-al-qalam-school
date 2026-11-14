import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import {
  finalScore, letterGrade, overallResult, subjectResult, computeRanks, round2, componentTotal,
  parseScale, normalizePeriodScore, DEFAULT_PERIOD_MAX, DEFAULT_RESULT_LABELS,
} from '@/lib/grading';
import { teacherClassIds, studentInTeacherScope } from '@/lib/teacher-scope';
import type { ResultsRow } from '@/lib/types';

/** تنظیمات نمره‌دهی — سقف دوره‌ها و حد نصاب کامیابی، همه از تنظیمات مدیر (بدون تغییر کد) */
async function getGradeConfig() {
  const [scaleSetting, rows] = await Promise.all([
    db.setting.findUnique({ where: { key: 'gradeScale' } }),
    db.setting.findMany({
      where: { key: { in: ['midtermMax', 'annualMax', 'passMark', 'passLabel', 'failLabel'] } },
    }),
  ]);
  const map = new Map(rows.map((s) => [s.key, s.value]));
  const pos = (k: string, d: number) => {
    const v = Number(map.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    scale: parseScale(scaleSetting?.value),
    periodMax: {
      MIDTERM: pos('midtermMax', DEFAULT_PERIOD_MAX.MIDTERM),
      ANNUAL: pos('annualMax', DEFAULT_PERIOD_MAX.ANNUAL),
    } as { MIDTERM: number; ANNUAL: number },
    labels: {
      passMark: pos('passMark', DEFAULT_RESULT_LABELS.passMark),
      passLabel: map.get('passLabel') || DEFAULT_RESULT_LABELS.passLabel,
      failLabel: map.get('failLabel') || DEFAULT_RESULT_LABELS.failLabel,
    },
  };
}

/** جدول نتایج صنف و کارنامهٔ شاگرد — نمرات به‌صورت خودکار در جدول‌ها منعکس می‌شود */
export async function GET(req: NextRequest) {
  try {
    const me = await requireSection('results');
    const sp = req.nextUrl.searchParams;
    const mode = sp.get('mode') || 'class';

    // مقیاس نمرات + سقف دوره‌ها + حد نصاب — همه از تنظیمات
    const cfg = await getGradeConfig();
    const scale = cfg.scale;
    const { periodMax, labels } = cfg;

    // ─── جدول نتایج صنف ───
    if (mode === 'class') {
      // شاگرد/سرپرست: فقط کارنامهٔ خودش
      if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
        if (!me.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
        const url = new URL(req.url);
        url.searchParams.set('mode', 'student');
        url.searchParams.set('studentId', me.studentId);
        const inner = new NextRequest(url, { headers: req.headers });
        return GET(inner);
      }

      const classId = sp.get('classId') || '';
      if (!classId) throw new ApiError('صنف را انتخاب کنید');

      // معلم: فقط جدول نتایج صنف‌های تحت اختیار خود
      if (me.role === 'TEACHER') {
        const scope = await teacherClassIds(me.teacherId || '');
        if (!scope.includes(classId)) {
          throw new ApiError('این صنف از صنف‌های تحت تدریس شما نیست', 403);
        }
      }

      const cls = await db.class.findUnique({ where: { id: classId } });
      if (!cls) throw new ApiError('صنف یافت نشد');
      const students = await db.student.findMany({
        where: { classId, status: 'ACTIVE' },
        orderBy: { rollNo: 'asc' },
      });
      const classSubjects = await db.classSubject.findMany({
        where: { classId },
        include: { subject: true },
        orderBy: { createdAt: 'asc' },
      });
      const grades = await db.grade.findMany({
        where: { classSubject: { classId } },
      });

      const gradesByStudent = new Map<string, typeof grades>();
      for (const g of grades) {
        const list = gradesByStudent.get(g.studentId) || [];
        list.push(g);
        gradesByStudent.set(g.studentId, list);
      }

      const rows: ResultsRow[] = students.map((s) => {
        const sg = gradesByStudent.get(s.id) || [];
        const perSubject: ResultsRow['perSubject'] = {};
        for (const cs of classSubjects) {
          const mid = sg.find((g) => g.classSubjectId === cs.id && g.period === 'MIDTERM');
          const ann = sg.find((g) => g.classSubjectId === cs.id && g.period === 'ANNUAL');
          const midTotal = mid ? round2(mid.total) : null;
          const annTotal = ann ? round2(ann.total) : null;
          const fin = finalScore(midTotal, annTotal, periodMax);
          perSubject[cs.subjectId] = {
            midterm: midTotal == null ? null : normalizePeriodScore(midTotal, periodMax.MIDTERM),
            annual: annTotal == null ? null : normalizePeriodScore(annTotal, periodMax.ANNUAL),
            final: fin,
            letter: letterGrade(fin, scale),
            approved: mid?.approved ?? ann?.approved ?? false,
            result: subjectResult(fin, labels),
          };
        }
        const finals = classSubjects.map((cs) => perSubject[cs.subjectId]?.final ?? null);
        const valid = finals.filter((f) => f != null) as number[];
        const total = valid.length ? round2(valid.reduce((a, b) => a + b, 0)) : null;
        const average = valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
        const { result, failed } = overallResult(finals, scale, labels);
        return {
          student: s,
          perSubject,
          total,
          average,
          rank: null,
          result,
          failed,
        };
      });

      const ranks = computeRanks(rows.map((r) => ({ studentId: r.student.id, average: r.average })));
      for (const r of rows) r.rank = ranks.get(r.student.id) || null;

      return NextResponse.json({
        classInfo: cls,
        subjects: classSubjects.map((cs) => ({ id: cs.subjectId, name: cs.subject.name })),
        rows,
        scale,
        periodMax,
        labels,
      });
    }

    // ─── کارنامهٔ شاگرد ───
    // دسترسی کارنامه: مدیر/سرمعلم همه، معلم صنف‌های خود، شاگرد/سرپرست فقط خودشان
    // (کارمند و کتابخانه‌دار به کارنامهٔ شاگردان دسترسی ندارند)
    if (me.role === 'STAFF' || me.role === 'LIBRARIAN') {
      throw new ApiError('شما به کارنامهٔ شاگردان دسترسی ندارید', 403);
    }
    const studentId = me.role === 'STUDENT' || me.role === 'GUARDIAN' ? me.studentId : sp.get('studentId');
    if (!studentId) throw new ApiError('شناسهٔ شاگرد لازم است', 403);
    // معلم: کارنامهٔ شاگردان صنف‌های خودش
    if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', studentId))) {
      throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
    }
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student) throw new ApiError('شاگرد یافت نشد');
    const grades = await db.grade.findMany({
      where: { studentId },
      include: {
        classSubject: {
          include: {
            subject: true,
            teacher: { select: { name: true } },
          },
        },
      },
    });
    const bySubject = new Map<string, typeof grades>();
    for (const g of grades) {
      const list = bySubject.get(g.classSubjectId) || [];
      list.push(g);
      bySubject.set(g.classSubjectId, list);
    }
    const subjects = Array.from(bySubject.entries()).map(([csId, list]) => {
      const cs = list[0].classSubject;
      const mid = list.find((g) => g.period === 'MIDTERM');
      const ann = list.find((g) => g.period === 'ANNUAL');
      const midTotal = mid ? round2(mid.total) : null;
      const annTotal = ann ? round2(ann.total) : null;
      const fin = finalScore(midTotal, annTotal, periodMax);
      return {
        subjectName: cs.subject.name,
        teacherName: cs.teacher?.name || null,
        midterm: mid ? {
          written: mid.written, oral: mid.oral, homework: mid.homework, activity: mid.activity,
          total: normalizePeriodScore(midTotal, periodMax.MIDTERM), approved: mid.approved,
          components: { written: componentTotal({ written: mid.written }), },
        } : null,
        annual: ann ? {
          written: ann.written, oral: ann.oral, homework: ann.homework, activity: ann.activity,
          total: normalizePeriodScore(annTotal, periodMax.ANNUAL), approved: ann.approved,
        } : null,
        final: fin,
        letter: letterGrade(fin, scale),
        result: subjectResult(fin, labels),
      };
    });
    const finals = subjects.map((s) => s.final);
    const { result, failed } = overallResult(finals, scale, labels);
    const valid = finals.filter((f) => f != null) as number[];
    const average = valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    const total = valid.length ? round2(valid.reduce((a, b) => a + b, 0)) : null;

    return NextResponse.json({
      student,
      className: student.class?.name || null,
      subjects,
      total,
      average,
      result,
      failed,
      scale,
      periodMax,
      labels,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
