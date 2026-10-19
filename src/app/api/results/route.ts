import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import {
  finalScore, letterGrade, overallResult, computeRanks, round2, componentTotal,
} from '@/lib/grading';
import type { ResultsRow } from '@/lib/types';

/** جدول نتایج صنف و کارنامهٔ شاگرد — نمرات به‌صورت خودکار در جدول‌ها منعکس می‌شود */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser();
    const sp = req.nextUrl.searchParams;
    const mode = sp.get('mode') || 'class';

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
          const fin = finalScore(mid ? mid.total : null, ann ? ann.total : null);
          perSubject[cs.subjectId] = {
            midterm: mid ? round2(mid.total) : null,
            annual: ann ? round2(ann.total) : null,
            final: fin,
            letter: letterGrade(fin),
            approved: mid?.approved ?? ann?.approved ?? false,
          };
        }
        const finals = classSubjects.map((cs) => perSubject[cs.subjectId]?.final ?? null);
        const valid = finals.filter((f) => f != null) as number[];
        const total = valid.length ? round2(valid.reduce((a, b) => a + b, 0)) : null;
        const average = valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
        const { result, failed } = overallResult(finals);
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
      });
    }

    // ─── کارنامهٔ شاگرد ───
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
      const fin = finalScore(mid ? mid.total : null, ann ? ann.total : null);
      return {
        subjectName: cs.subject.name,
        teacherName: cs.teacher?.name || null,
        midterm: mid ? {
          written: mid.written, oral: mid.oral, homework: mid.homework, activity: mid.activity,
          total: round2(mid.total), approved: mid.approved,
          components: { written: componentTotal({ written: mid.written }), },
        } : null,
        annual: ann ? {
          written: ann.written, oral: ann.oral, homework: ann.homework, activity: ann.activity,
          total: round2(ann.total), approved: ann.approved,
        } : null,
        final: fin,
        letter: letterGrade(fin),
      };
    });
    const finals = subjects.map((s) => s.final);
    const { result, failed } = overallResult(finals);
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
    });
  } catch (e) {
    return handleApiError(e);
  }
}
