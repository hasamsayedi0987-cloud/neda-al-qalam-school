'use client';

/**
 * هندلرهای داده — attendance، activities، grades، results، library،
 * notifications، tasks، dashboard، backup — مکتب خصوصی نداالقلم
 */

import { ApiError, str, optNum, genId, nowIso, load, mutate, loadSettingsMap, requireUser, requireRole, type AuthUser, type Rec } from './backend-common';
import { jalaliMonthRange, isoToday } from '@/lib/jalali';
import {
  finalScore, letterGrade, overallResult, computeRanks, round2, componentTotal, clampComponent,
  DEFAULT_WEIGHTS, type GradeWeights,
} from '@/lib/grading';
import type { ResultsRow } from '@/lib/types';

interface StudentRec extends Rec {
  firstName: string; lastName: string; fatherName: string; classId: string | null;
  rollNo: number | null; status: string; createdAt: string; [k: string]: unknown;
}
interface ClassRec extends Rec { grade: number; name: string; supervisorId: string | null; createdAt: string; }
interface ClassSubjectRec extends Rec { classId: string; subjectId: string; teacherId: string | null; createdAt: string; }
interface SubjectRec extends Rec { name: string; }
interface TeacherRec extends Rec { name: string; position: string; active: boolean; [k: string]: unknown; }
interface GradeRec extends Rec {
  studentId: string; classSubjectId: string; period: string;
  written: number | null; oral: number | null; homework: number | null; activity: number | null;
  total: number; approved: boolean; notes: string | null; updatedAt: string;
}
interface UserRec extends Rec {
  username: string; name: string; role: string; active: boolean;
  phone: string | null; teacherId: string | null; studentId: string | null;
}

async function activeStudentsOfClass(classId: string): Promise<StudentRec[]> {
  const students = await load<StudentRec[]>('students', { maxAgeMs: 60_000 });
  return students
    .filter((s) => s.classId === classId && s.status === 'ACTIVE')
    .sort((a, b) => (a.rollNo ?? 1e9) - (b.rollNo ?? 1e9));
}

async function getWeights(): Promise<GradeWeights> {
  try {
    const map = await loadSettingsMap();
    return {
      maxWritten: Number(map.maxWritten ?? DEFAULT_WEIGHTS.maxWritten) || DEFAULT_WEIGHTS.maxWritten,
      maxOral: Number(map.maxOral ?? DEFAULT_WEIGHTS.maxOral) || DEFAULT_WEIGHTS.maxOral,
      maxHomework: Number(map.maxHomework ?? DEFAULT_WEIGHTS.maxHomework) || DEFAULT_WEIGHTS.maxHomework,
      maxActivity: Number(map.maxActivity ?? DEFAULT_WEIGHTS.maxActivity) || DEFAULT_WEIGHTS.maxActivity,
    };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

/* ───────────────────────  attendance  ─────────────────────── */

export async function attendanceGet(me: AuthUser | null, sp: URLSearchParams) {
  const user = requireUser(me);
  const mode = sp.get('mode') || 'daily';

  if (mode === 'staff') {
    if (sp.get('mine') === '1') {
      if (!user.teacherId) throw new ApiError('حساب شما به هیچ کارمندی پیوند ندارد', 403);
      const all = await load<Rec[]>('staffAttendance');
      const records = all
        .filter((r) => r.teacherId === user.teacherId)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 90);
      return { records };
    }
    requireRole(user, 'ADMIN', 'HEADTEACHER');
    const date = sp.get('date') || '';
    const [all, teachers] = await Promise.all([
      load<Rec[]>('staffAttendance'),
      load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
    ]);
    const records = all
      .filter((r) => !date || r.date === date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((r) => {
        const t = teachers.find((x) => x.id === r.teacherId);
        return { ...r, teacher: t ? { id: t.id, name: t.name, position: t.position } : null };
      });
    const staff = teachers.filter((t) => t.active).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    return { records, staff };
  }

  if (mode === 'daily') {
    const classId = sp.get('classId') || '';
    const date = sp.get('date');
    if (!classId) throw new ApiError('صنف را انتخاب کنید');
    const classes = await load<ClassRec[]>('classes', { maxAgeMs: 300_000 });
    const cls = classes.find((c) => c.id === classId);
    if (!cls) throw new ApiError('صنف یافت نشد', 404);

    if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
      if (!user.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
      const all = await load<Rec[]>('attendance');
      const records = all
        .filter((r) => r.studentId === user.studentId)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 120);
      return { students: [], records, classInfo: null };
    }

    const [students, all] = await Promise.all([activeStudentsOfClass(classId), load<Rec[]>('attendance')]);
    const records = all
      .filter((r) => r.classId === classId && (!date || r.date === date))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { students, records, classInfo: { id: cls.id, name: cls.name } };
  }

  if (mode === 'monthly') {
    const jy = Number(sp.get('jy'));
    const jm = Number(sp.get('jm'));
    if (!jy || !jm) throw new ApiError('سال و ماه شمسی را انتخاب کنید');
    const { startIso, endIso } = jalaliMonthRange(jy, jm);

    if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
      if (!user.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
      const [students, all] = await Promise.all([load<StudentRec[]>('students'), load<Rec[]>('attendance')]);
      const student = students.find((s) => s.id === user.studentId) || null;
      const records = all
        .filter((r) => r.studentId === user.studentId && String(r.date) >= startIso && String(r.date) <= endIso)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return { students: student ? [student] : [], records };
    }

    const classId = sp.get('classId') || '';
    if (!classId) throw new ApiError('صنف را انتخاب کنید');
    const [students, all] = await Promise.all([activeStudentsOfClass(classId), load<Rec[]>('attendance')]);
    const records = all.filter((r) => r.classId === classId && String(r.date) >= startIso && String(r.date) <= endIso);
    return { students, records };
  }

  throw new ApiError('حالت نامعلوم');
}

export async function attendancePost(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireUser(me);
  const action = str(body.action);

  if (action === 'staff') {
    requireRole(user, 'ADMIN', 'HEADTEACHER');
    const date = str(body.date);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!date) throw new ApiError('تاریخ لازم است');
    await mutate('staffAttendance', (rows) => {
      for (const item of items as Array<Record<string, unknown>>) {
        const teacherId = str(item.teacherId);
        const status = str(item.status);
        if (!teacherId || !['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
        const existing = rows.find((r) => r.teacherId === teacherId && r.date === date);
        if (existing) existing.status = status;
        else rows.push({ id: genId(), teacherId, date, status });
      }
      return { ok: true, saved: items.length };
    }, `attendance: ثبت حاضری کارمندان ${date}`);
    return { ok: true, saved: items.length };
  }

  requireRole(user, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  const date = str(body.date);
  const classId = str(body.classId);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!date || !classId) throw new ApiError('صنف و تاریخ لازم است');

  const absentStudents: string[] = [];
  await mutate('attendance', (rows) => {
    let saved = 0;
    for (const item of items as Array<Record<string, unknown>>) {
      const studentId = str(item.studentId);
      const status = str(item.status);
      if (!studentId || !['PRESENT', 'ABSENT', 'SICK', 'LEAVE'].includes(status)) continue;
      const existing = rows.find((r) => r.studentId === studentId && r.date === date);
      if (existing) {
        existing.status = status;
        existing.recordedBy = user.id;
        existing.classId = classId;
        existing.updatedAt = nowIso();
      } else {
        rows.push({ id: genId(), studentId, classId, date, status, recordedBy: user.id, createdAt: nowIso() });
      }
      if (status === 'ABSENT') absentStudents.push(studentId);
      saved += 1;
    }
    return { ok: true, saved };
  }, `attendance: ثبت حاضری صنف ${date}`);

  if (absentStudents.length > 0) {
    // اعلان به سرپرست/والدین شاگردان غایب
    try {
      const users = await load<UserRec[]>('users', { maxAgeMs: 120_000 });
      const targets = users.filter(
        (u) => u.active && u.studentId && absentStudents.includes(u.studentId) && ['GUARDIAN', 'STUDENT'].includes(u.role),
      );
      if (targets.length > 0) {
        await mutate('notifications', (notifs) => {
          for (const u of targets) {
            notifs.push({
              id: genId(), userId: u.id, title: 'غیبت شاگرد',
              body: 'شاگرد شما امروز در مکتب حاضر نبود. لطفاً رهنمایی لازم را مبذول دارید.',
              type: 'ATTENDANCE', read: false, createdAt: nowIso(),
            });
          }
          return { ok: true, sent: targets.length };
        }, `attendance: اعلان غیبت ${absentStudents.length} شاگرد`);
      }
    } catch { /* جانبی */ }
  }
  return { ok: true, saved: items.length };
}

/* ───────────────────────  activities  ─────────────────────── */

export async function activitiesGet(me: AuthUser | null, sp: URLSearchParams) {
  const user = requireUser(me);
  if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
    if (!user.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
    const all = await load<Rec[]>('activities');
    const activities = all
      .filter((a) => a.studentId === user.studentId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 100);
    return { activities, students: [] };
  }

  const studentId = sp.get('studentId');
  const classId = sp.get('classId');
  if (!classId && !studentId) throw new ApiError('صنف یا شاگرد را انتخاب کنید');
  const all = await load<Rec[]>('activities');

  if (classId && !studentId) {
    const students = await activeStudentsOfClass(classId);
    const ids = new Set(students.map((s) => s.id));
    const activities = all
      .filter((a) => ids.has(String(a.studentId)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 500);
    return { students, activities };
  }
  const activities = all
    .filter((a) => !studentId || a.studentId === studentId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 200);
  return { activities, students: [] };
}

export async function activitiesPost(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireRole(me, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  const studentId = str(body.studentId);
  const note = str(body.note);
  const type = str(body.type);
  if (!studentId || !note || !type) throw new ApiError('شاگرد، نوع فعالیت و ملاحظات لازم است');
  if (!['HOMEWORK', 'BEHAVIOR', 'PARTICIPATION', 'OTHER'].includes(type)) {
    throw new ApiError('نوع فعالیت نامعتبر است');
  }
  return mutate('activities', (rows) => {
    const id = genId();
    rows.push({
      id, studentId, type, note,
      score: optNum(body.score),
      date: str(body.date) || nowIso().slice(0, 10),
      recordedBy: user.id, createdAt: nowIso(),
    });
    return { id };
  }, `activities: ثبت فعالیت (${type})`);
}

export async function activitiesDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  if (!id) throw new ApiError('شناسه لازم است');
  await mutate('activities', (rows) => {
    const idx = rows.findIndex((a) => a.id === id);
    if (idx === -1) throw new ApiError('یافت نشد', 404);
    rows.splice(idx, 1);
    return { ok: true };
  }, `activities: حذف فعالیت`);
  return { ok: true };
}

/* ───────────────────────  grades  ─────────────────────── */

export async function gradesGet(me: AuthUser | null, sp: URLSearchParams) {
  const user = requireUser(me);

  if (sp.get('mode') === 'student') {
    const studentId = user.role === 'STUDENT' || user.role === 'GUARDIAN'
      ? user.studentId
      : sp.get('studentId');
    if (!studentId) throw new ApiError('شناسهٔ شاگرد لازم است', 403);
    const [students, grades, classSubjects, subjects, teachers] = await Promise.all([
      load<StudentRec[]>('students'),
      load<GradeRec[]>('grades'),
      load<ClassSubjectRec[]>('classSubjects'),
      load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
      load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
    ]);
    const student = students.find((s) => s.id === studentId);
    if (!student) throw new ApiError('شاگرد یافت نشد', 404);
    const enriched = grades
      .filter((g) => g.studentId === studentId)
      .map((g) => {
        const cs = classSubjects.find((x) => x.id === g.classSubjectId);
        const subject = cs ? subjects.find((s) => s.id === cs.subjectId) : null;
        const teacher = cs?.teacherId ? teachers.find((t) => t.id === cs.teacherId) : null;
        return {
          ...g,
          classSubject: cs ? {
            id: cs.id, classId: cs.classId, subjectId: cs.subjectId,
            subject: subject ? { id: subject.id, name: subject.name } : { id: cs.subjectId, name: '—' },
            teacher: teacher ? { name: teacher.name } : null,
          } : null,
        };
      });
    return { student, grades: enriched };
  }

  const classSubjectId = sp.get('classSubjectId') || '';
  if (!classSubjectId) throw new ApiError('مضمون صنف را انتخاب کنید');
  const [classSubjects, classes, subjects, teachers] = await Promise.all([
    load<ClassSubjectRec[]>('classSubjects'),
    load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
    load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
    load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
  ]);
  const cs = classSubjects.find((x) => x.id === classSubjectId);
  if (!cs) throw new ApiError('مضمون یافت نشد', 404);
  const subject = subjects.find((s) => s.id === cs.subjectId);
  const cls = classes.find((c) => c.id === cs.classId);
  const teacher = cs.teacherId ? teachers.find((t) => t.id === cs.teacherId) : null;

  if (user.role === 'TEACHER') {
    if (!user.teacherId || cs.teacherId !== user.teacherId) {
      throw new ApiError('این مضمون به شما سپرده نشده است', 403);
    }
  }

  const [students, grades] = await Promise.all([
    activeStudentsOfClass(cs.classId),
    load<GradeRec[]>('grades'),
  ]);
  return {
    classSubject: {
      id: cs.id, classId: cs.classId,
      subject: subject ? { id: subject.id, name: subject.name } : { id: cs.subjectId, name: '—' },
      className: cls?.name || '—',
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
    },
    students,
    grades: grades.filter((g) => g.classSubjectId === classSubjectId),
    weights: await getWeights(),
  };
}

async function notifyUsers(
  predicate: (u: UserRec) => boolean,
  title: string, bodyText: string, type: string, commit: string,
) {
  try {
    const users = await load<UserRec[]>('users', { maxAgeMs: 120_000 });
    const targets = users.filter((u) => u.active && predicate(u));
    if (targets.length === 0) return;
    await mutate('notifications', (notifs) => {
      for (const u of targets) {
        notifs.push({ id: genId(), userId: u.id, title, body: bodyText, type, read: false, createdAt: nowIso() });
      }
      return { ok: true, sent: targets.length };
    }, commit);
  } catch { /* جانبی */ }
}

export async function gradesPost(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireUser(me);
  const action = str(body.action);

  if (action === 'approve') {
    requireRole(user, 'ADMIN', 'HEADTEACHER');
    const classSubjectId = str(body.classSubjectId);
    const period = str(body.period);
    const approved = Boolean(body.approved);
    if (!classSubjectId || !['MIDTERM', 'ANNUAL'].includes(period)) {
      throw new ApiError('پارامترهای ناقص');
    }
    const [classSubjects, subjects, classes, teachers] = await Promise.all([
      load<ClassSubjectRec[]>('classSubjects'),
      load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
      load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
      load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
    ]);
    const cs = classSubjects.find((x) => x.id === classSubjectId);
    if (!cs) throw new ApiError('مضمون یافت نشد', 404);
    const subject = subjects.find((s) => s.id === cs.subjectId);
    const cls = classes.find((c) => c.id === cs.classId);
    const periodLabel = period === 'MIDTERM' ? 'چهارو‌نیم‌ماهه' : 'سالانه';

    await mutate('grades', (grades) => {
      for (const g of grades) {
        if (g.classSubjectId === classSubjectId && g.period === period) g.approved = approved;
      }
      return { ok: true };
    }, `grades: ${approved ? 'تایید' : 'لغو تایید'} نمرات ${periodLabel} (${subject?.name || '—'})`);

    if (cs.teacherId) {
      await notifyUsers(
        (u) => u.teacherId === cs.teacherId,
        approved ? 'تایید نمرات' : 'لغو تایید نمرات',
        `نمرات ${periodLabel} مضمون ${subject?.name || '—'} صنف ${cls?.name || '—'} ${approved ? 'تایید' : 'به حالت عدم تایید'} گردید.`,
        'GRADE', 'grades: اعلان تایید به معلم',
      );
    }
    if (approved) {
      await notifyUsers(
        (u) => u.role === 'GUARDIAN' && u.studentId != null,
        'نمرات جدید',
        `نمرات ${periodLabel} مضمون ${subject?.name || '—'} صنف ${cls?.name || '—'} در سیستم ثبت و تایید گردید.`,
        'GRADE', 'grades: اعلان نمرات به سرپرستان',
      );
    }
    return { ok: true };
  }

  // ثبت/به‌روزرسانی گروهی نمرات
  requireRole(user, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  const classSubjectId = str(body.classSubjectId);
  const period = str(body.period);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!classSubjectId || !['MIDTERM', 'ANNUAL'].includes(period)) {
    throw new ApiError('مضمون و دورهٔ امتحان را مشخص کنید');
  }
  const classSubjects = await load<ClassSubjectRec[]>('classSubjects');
  const cs = classSubjects.find((x) => x.id === classSubjectId);
  if (!cs) throw new ApiError('مضمون یافت نشد', 404);
  if (user.role === 'TEACHER' && cs.teacherId !== user.teacherId) {
    throw new ApiError('این مضمون به شما سپرده نشده است', 403);
  }
  const w = await getWeights();

  return mutate('grades', (grades) => {
    let saved = 0;
    for (const item of items as Array<Record<string, unknown>>) {
      const studentId = str(item.studentId);
      if (!studentId) continue;
      const existing = grades.find(
        (g) => g.studentId === studentId && g.classSubjectId === classSubjectId && g.period === period,
      );
      if (existing?.approved && user.role === 'TEACHER') continue;
      const written = clampComponent(item.written as number | null, w.maxWritten);
      const oral = clampComponent(item.oral as number | null, w.maxOral);
      const homework = clampComponent(item.homework as number | null, w.maxHomework);
      const activity = clampComponent(item.activity as number | null, w.maxActivity);
      const total = componentTotal({ written, oral, homework, activity });
      const hasAny = written != null || oral != null || homework != null || activity != null;
      if (!hasAny && !existing) continue;
      if (!hasAny && existing) {
        const idx = grades.findIndex((g) => g.id === existing.id);
        if (idx !== -1) grades.splice(idx, 1);
        saved += 1;
        continue;
      }
      const approved =
        user.role === 'TEACHER' ? existing?.approved ?? false : body.approved != null ? Boolean(body.approved) : existing?.approved ?? false;
      if (existing) {
        existing.written = written;
        existing.oral = oral;
        existing.homework = homework;
        existing.activity = activity;
        existing.total = total;
        existing.approved = approved;
        existing.notes = str(item.notes) || existing.notes || null;
        existing.updatedAt = nowIso();
      } else {
        grades.push({
          id: genId(), studentId, classSubjectId, period,
          written, oral, homework, activity, total,
          approved,
          notes: str(item.notes) || null,
          createdAt: nowIso(), updatedAt: nowIso(),
        });
      }
      saved += 1;
    }
    return { ok: true, saved };
  }, `grades: ثبت نمرات ${period === 'MIDTERM' ? 'چهارو‌نیم‌ماهه' : 'سالانه'}`);
}

/* ───────────────────────  results  ─────────────────────── */

export async function resultsGet(me: AuthUser | null, sp: URLSearchParams) {
  const user = requireUser(me);
  const mode = sp.get('mode') || 'class';

  if (mode === 'class') {
    if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
      if (!user.studentId) throw new ApiError('دسترسی مجاز نیست', 403);
      const inner = new URLSearchParams({ mode: 'student', studentId: user.studentId });
      return resultsGet(me, inner);
    }
    const classId = sp.get('classId') || '';
    if (!classId) throw new ApiError('صنف را انتخاب کنید');

    const [classes, students, classSubjects, subjects, grades] = await Promise.all([
      load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
      load<StudentRec[]>('students', { maxAgeMs: 60_000 }),
      load<ClassSubjectRec[]>('classSubjects'),
      load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
      load<GradeRec[]>('grades'),
    ]);
    const cls = classes.find((c) => c.id === classId);
    if (!cls) throw new ApiError('صنف یافت نشد', 404);
    const classStudents = students
      .filter((s) => s.classId === classId && s.status === 'ACTIVE')
      .sort((a, b) => (a.rollNo ?? 1e9) - (b.rollNo ?? 1e9));
    const csList = classSubjects
      .filter((cs) => cs.classId === classId)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const rows: ResultsRow[] = classStudents.map((s) => {
      const sg = grades.filter((g) => g.studentId === s.id);
      const perSubject: ResultsRow['perSubject'] = {};
      for (const cs of csList) {
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
      const finals = csList.map((cs) => perSubject[cs.subjectId]?.final ?? null);
      const valid = finals.filter((f) => f != null) as number[];
      const total = valid.length ? round2(valid.reduce((a, b) => a + b, 0)) : null;
      const average = valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
      const { result, failed } = overallResult(finals);
      return { student: s, perSubject, total, average, rank: null, result, failed };
    });

    const ranks = computeRanks(rows.map((r) => ({ studentId: r.student.id, average: r.average })));
    for (const r of rows) r.rank = ranks.get(r.student.id) || null;

    return {
      classInfo: cls,
      subjects: csList.map((cs) => {
        const subject = subjects.find((s) => s.id === cs.subjectId);
        return { id: cs.subjectId, name: subject?.name || '—' };
      }),
      rows,
    };
  }

  // کارنامهٔ شاگرد
  const studentId = user.role === 'STUDENT' || user.role === 'GUARDIAN' ? user.studentId : sp.get('studentId');
  if (!studentId) throw new ApiError('شناسهٔ شاگرد لازم است', 403);
  const [students, classes, grades, classSubjects, subjects, teachers] = await Promise.all([
    load<StudentRec[]>('students'),
    load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
    load<GradeRec[]>('grades'),
    load<ClassSubjectRec[]>('classSubjects'),
    load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
    load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
  ]);
  const student = students.find((s) => s.id === studentId);
  if (!student) throw new ApiError('شاگرد یافت نشد', 404);
  const cls = student.classId ? classes.find((c) => c.id === student.classId) : null;

  const myGrades = grades.filter((g) => g.studentId === studentId);
  const byCs = new Map<string, GradeRec[]>();
  for (const g of myGrades) {
    const list = byCs.get(g.classSubjectId) || [];
    list.push(g);
    byCs.set(g.classSubjectId, list);
  }
  const subjectRows = Array.from(byCs.entries()).map(([csId, list]) => {
    const cs = classSubjects.find((x) => x.id === csId);
    const subject = cs ? subjects.find((s) => s.id === cs.subjectId) : null;
    const teacher = cs?.teacherId ? teachers.find((t) => t.id === cs.teacherId) : null;
    const mid = list.find((g) => g.period === 'MIDTERM');
    const ann = list.find((g) => g.period === 'ANNUAL');
    const fin = finalScore(mid ? mid.total : null, ann ? ann.total : null);
    return {
      subjectName: subject?.name || '—',
      teacherName: teacher?.name || null,
      midterm: mid ? {
        written: mid.written, oral: mid.oral, homework: mid.homework, activity: mid.activity,
        total: round2(mid.total), approved: mid.approved,
        components: { written: componentTotal({ written: mid.written }) },
      } : null,
      annual: ann ? {
        written: ann.written, oral: ann.oral, homework: ann.homework, activity: ann.activity,
        total: round2(ann.total), approved: ann.approved,
      } : null,
      final: fin,
      letter: letterGrade(fin),
    };
  });

  const finals = subjectRows.map((s) => s.final);
  const { result, failed } = overallResult(finals);
  const valid = finals.filter((f) => f != null) as number[];
  const average = valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
  const total = valid.length ? round2(valid.reduce((a, b) => a + b, 0)) : null;

  return {
    student,
    className: cls?.name || null,
    subjects: subjectRows,
    total,
    average,
    result,
    failed,
  };
}

/* ───────────────────────  library  ─────────────────────── */

export async function libraryGet(me: AuthUser | null) {
  requireUser(me);
  const [books, loans] = await Promise.all([
    load<Rec[]>('books', { maxAgeMs: 120_000 }),
    load<Rec[]>('loans'),
  ]);
  const today = nowIso().slice(0, 10);
  const sortedLoans = [...loans].sort((a, b) => String(b.loanDate || '').localeCompare(String(a.loanDate || '')));
  return {
    books: [...books]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((b) => {
        const lent = sortedLoans.filter((l) => l.bookId === b.id && l.status === 'LENT');
        return { ...b, lentCount: lent.length, loans: lent };
      }),
    loans: sortedLoans.slice(0, 300).map((l) => {
      const book = books.find((b) => b.id === l.bookId);
      return {
        ...l,
        bookTitle: book?.title || '—',
        overdue: l.status === 'LENT' && String(l.dueDate) < today,
      };
    }),
  };
}

export async function libraryPost(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireRole(me, 'ADMIN', 'LIBRARIAN');
  const action = str(body.action);

  if (action === 'save-book') {
    const title = str(body.title);
    if (!title) throw new ApiError('عنوان کتاب لازم است');
    const copies = Math.max(1, optNum(body.copies) ?? 1);
    const data = {
      title,
      author: str(body.author) || null,
      category: str(body.category) || null,
      shelfNo: str(body.shelfNo) || null,
      copies,
    };
    const bookId = str(body.id);
    return mutate('books', (books) => {
      if (bookId) {
        const book = books.find((b) => b.id === bookId);
        if (!book) throw new ApiError('کتاب یافت نشد', 404);
        book.title = data.title;
        book.author = data.author;
        book.category = data.category;
        book.shelfNo = data.shelfNo;
        book.copies = copies;
        return { id: book.id };
      }
      const id = genId();
      books.push({ id, ...data, available: copies, createdAt: nowIso() });
      return { id };
    }, `library: ثبت کتاب «${title}»`);
  }

  if (action === 'lend') {
    const bookId = str(body.bookId);
    const borrowerName = str(body.borrowerName);
    const loanDate = str(body.loanDate);
    const dueDate = str(body.dueDate);
    if (!bookId || !borrowerName || !loanDate || !dueDate) {
      throw new ApiError('کتاب، امانت‌گیرنده و تاریخ‌ها لازم است');
    }
    await mutate('books', (books) => {
      const book = books.find((b) => b.id === bookId);
      if (!book) throw new ApiError('کتاب یافت نشد', 404);
      if (Number(book.available) < 1) throw new ApiError('نسخهٔ موجود این کتاب تمام شده است');
      book.available = Number(book.available) - 1;
      return { ok: true };
    }, `library: امانت کتاب ${bookId.slice(0, 10)}`);
    await mutate('loans', (loans) => {
      loans.push({
        id: genId(), bookId, borrowerName,
        borrowerType: str(body.borrowerType) || 'STUDENT',
        studentId: str(body.studentId) || null,
        loanDate, dueDate, status: 'LENT',
        notes: str(body.notes) || null,
        recordedBy: user.id, createdAt: nowIso(),
      });
      return { ok: true };
    }, `library: ثبت امانت برای ${borrowerName}`);
    return { ok: true };
  }

  if (action === 'return') {
    const loanId = str(body.loanId);
    if (!loanId) throw new ApiError('شناسهٔ امانت لازم است');
    const loans = await load<Rec[]>('loans');
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new ApiError('امانت یافت نشد', 404);
    if (loan.status === 'RETURNED') throw new ApiError('این کتاب قبلاً پس داده شده است');
    const today = nowIso().slice(0, 10);
    await mutate('loans', (rows) => {
      const l = rows.find((x) => x.id === loanId);
      if (!l) throw new ApiError('امانت یافت نشد', 404);
      l.status = 'RETURNED';
      l.returnDate = today;
      return { ok: true };
    }, 'library: پس گرفتن کتاب');
    try {
      await mutate('books', (books) => {
        const book = books.find((b) => b.id === loan.bookId);
        if (book) book.available = Number(book.available || 0) + 1;
        return { ok: true };
      }, 'library: بازگشت نسخهٔ کتاب');
    } catch { /* جانبی */ }
    return { ok: true };
  }

  throw new ApiError('عملیات نامعلوم');
}

export async function libraryDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN', 'LIBRARIAN');
  if (!id) throw new ApiError('شناسه لازم است');
  const loans = await load<Rec[]>('loans');
  if (loans.some((l) => l.bookId === id && l.status === 'LENT')) {
    throw new ApiError('این کتاب در امانت است؛ ابتدا پس گرفته شود');
  }
  await mutate('books', (books) => {
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) throw new ApiError('یافت نشد', 404);
    books.splice(idx, 1);
    return { ok: true };
  }, 'library: حذف کتاب');
  return { ok: true };
}

/* ───────────────────────  notifications  ─────────────────────── */

export async function notificationsGet(me: AuthUser | null) {
  const user = requireUser(me);
  const all = await load<Rec[]>('notifications');
  const mine = all
    .filter((n) => n.userId === user.id)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50);
  return { notifications: mine, unread: mine.filter((n) => !n.read).length };
}

export async function notificationsPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const title = str(body.title);
  const msg = str(body.body);
  const target = str(body.target);
  if (!title || !msg) throw new ApiError('عنوان و متن اعلان لازم است');
  if (!target) throw new ApiError('گیرندهٔ اعلان را مشخص کنید');

  const users = await load<UserRec[]>('users', { maxAgeMs: 120_000 });
  let targets: UserRec[] = [];
  if (target === 'ALL') {
    targets = users.filter((u) => u.active);
  } else if (['TEACHER', 'GUARDIAN', 'STUDENT', 'STAFF', 'LIBRARIAN', 'HEADTEACHER'].includes(target)) {
    targets = users.filter((u) => u.active && u.role === target);
  } else {
    const u = users.find((x) => x.username?.toLowerCase() === target.toLowerCase() && x.active);
    if (!u) throw new ApiError('کاربر یافت نشد');
    targets = [u];
  }
  if (targets.length === 0) throw new ApiError('هیچ گیرنده‌ای یافت نشد');
  await mutate('notifications', (notifs) => {
    for (const u of targets) {
      notifs.push({ id: genId(), userId: u.id, title, body: msg, type: 'INFO', read: false, createdAt: nowIso() });
    }
    return { ok: true, sent: targets.length };
  }, `notifications: ارسال اعلان «${title}»`);
  return { ok: true, sent: targets.length };
}

export async function notificationsPatch(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireUser(me);
  const allFlag = Boolean(body.all);
  const id = str(body.id);
  await mutate('notifications', (notifs) => {
    for (const n of notifs) {
      if (n.userId !== user.id) continue;
      if (allFlag || n.id === id) n.read = true;
    }
    return { ok: true };
  }, 'notifications: علامت‌گذاری اعلان‌ها');
  return { ok: true };
}

export async function notificationsDelete(me: AuthUser | null, id: string) {
  const user = requireUser(me);
  await mutate('notifications', (notifs) => {
    const kept = notifs.filter((n) => (id ? !(n.id === id && n.userId === user.id) : n.userId !== user.id));
    const removed = notifs.length - kept.length;
    kept.forEach((n, i) => { notifs[i] = n; });
    notifs.length = kept.length;
    return { ok: true, removed };
  }, id ? 'notifications: حذف اعلان' : 'notifications: حذف همهٔ اعلان‌ها');
  return { ok: true };
}

/* ───────────────────────  tasks  ─────────────────────── */

export async function tasksGet(me: AuthUser | null) {
  const user = requireUser(me);
  if (user.role === 'STAFF' || user.role === 'TEACHER') {
    if (!user.teacherId) return { tasks: [], staff: [] };
    const [tasks, teachers] = await Promise.all([
      load<Rec[]>('tasks'),
      load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
    ]);
    const mine = tasks
      .filter((t) => t.staffId === user.teacherId)
      .sort((a, b) => String(a.status).localeCompare(String(b.status)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((t) => {
        const assigner = teachers.find((x) => x.id === t.assignedBy);
        return { ...t, assigner: assigner ? { name: assigner.name } : null };
      });
    return { tasks: mine, staff: [] };
  }
  requireRole(user, 'ADMIN', 'HEADTEACHER');
  const [tasks, teachers] = await Promise.all([
    load<Rec[]>('tasks'),
    load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
  ]);
  const nameOf = (id: unknown) => teachers.find((x) => x.id === id)?.name || null;
  const sorted = [...tasks].sort((a, b) =>
    String(a.status).localeCompare(String(b.status)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    tasks: sorted.map((t) => ({
      ...t,
      staff: (() => {
        const s = teachers.find((x) => x.id === t.staffId);
        return s ? { id: s.id, name: s.name, position: s.position } : null;
      })(),
      assigner: t.assignedBy ? { name: nameOf(t.assignedBy) } : null,
    })),
    staff: teachers
      .filter((t) => t.active && ['ملازم', 'کارمند', 'معلم', 'کتابخانه‌دار'].includes(t.position))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'))
      .map((t) => ({ id: t.id, name: t.name, position: t.position })),
  };
}

export async function tasksPost(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireRole(me, 'ADMIN', 'HEADTEACHER');
  const title = str(body.title);
  const staffId = str(body.staffId);
  if (!title || !staffId) throw new ApiError('عنوان وظیفه و کارمند لازم است');
  return mutate('tasks', (tasks) => {
    const id = genId();
    tasks.push({
      id, title,
      description: str(body.description) || null,
      dueDate: str(body.dueDate) || null,
      staffId,
      status: 'PENDING',
      assignedBy: user.teacherId || null,
      createdAt: nowIso(),
    });
    return { id };
  }, `tasks: تعیین وظیفه «${title}»`);
}

export async function tasksPatch(me: AuthUser | null, body: Record<string, unknown>) {
  const user = requireUser(me);
  const id = str(body.id);
  const status = str(body.status);
  if (!id || !['PENDING', 'IN_PROGRESS', 'DONE'].includes(status)) {
    throw new ApiError('پارامترهای ناقص');
  }
  await mutate('tasks', (tasks) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new ApiError('وظیفه یافت نشد', 404);
    if (!['ADMIN', 'HEADTEACHER'].includes(user.role) && t.staffId !== user.teacherId) {
      throw new ApiError('دسترسی مجاز نیست', 403);
    }
    t.status = status;
    return { ok: true };
  }, 'tasks: تغییر وضعیت وظیفه');
  return { ok: true };
}

export async function tasksDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  if (!id) throw new ApiError('شناسه لازم است');
  await mutate('tasks', (tasks) => {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new ApiError('یافت نشد', 404);
    tasks.splice(idx, 1);
    return { ok: true };
  }, 'tasks: حذف وظیفه');
  return { ok: true };
}

/* ───────────────────────  dashboard  ─────────────────────── */

export async function dashboardGet(me: AuthUser | null) {
  const user = requireUser(me);
  const today = isoToday();

  if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
    if (!user.studentId) throw new ApiError('حساب شما به هیچ شاگردی پیوند ندارد', 403);
    const [students, grades, attendance, notifications, classes] = await Promise.all([
      load<StudentRec[]>('students'),
      load<GradeRec[]>('grades'),
      load<Rec[]>('attendance'),
      load<Rec[]>('notifications', { maxAgeMs: 60_000 }),
      load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
    ]);
    const student = students.find((s) => s.id === user.studentId) || null;
    const myGrades = grades.filter((g) => g.studentId === user.studentId);
    const myAtt = attendance.filter((a) => a.studentId === user.studentId);
    const unread = notifications.filter((n) => n.userId === user.id && !n.read).length;
    return {
      role: user.role,
      student: student ? { ...student, class: classes.find((c) => c.id === student.classId) || null } : null,
      unread,
      totalGrades: myGrades.length,
      approvedGrades: myGrades.filter((g) => g.approved).length,
      attendanceToday: myAtt.find((a) => a.date === today)?.status || null,
      attendanceTotal: myAtt.length,
      absences: myAtt.filter((a) => a.status === 'ABSENT').length,
    };
  }

  const [students, teachers, classes, subjects, books, notifications, attendance, loans, tasks, grades, classSubjects] =
    await Promise.all([
      load<StudentRec[]>('students', { maxAgeMs: 120_000 }),
      load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
      load<ClassRec[]>('classes', { maxAgeMs: 300_000 }),
      load<SubjectRec[]>('subjects', { maxAgeMs: 300_000 }),
      load<Rec[]>('books', { maxAgeMs: 120_000 }),
      load<Rec[]>('notifications', { maxAgeMs: 60_000 }),
      load<Rec[]>('attendance'),
      load<Rec[]>('loans'),
      load<Rec[]>('tasks'),
      load<GradeRec[]>('grades'),
      load<ClassSubjectRec[]>('classSubjects'),
    ]);

  const todayAtt = attendance.filter((a) => a.date === today);
  const recentGrades = [...grades]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 5)
    .map((g) => {
      const student = students.find((s) => s.id === g.studentId);
      const cs = classSubjects.find((x) => x.id === g.classSubjectId);
      const subject = cs ? subjects.find((s) => s.id === cs.subjectId) : null;
      return {
        id: g.id,
        studentName: student ? `${student.firstName} ${student.lastName}` : '—',
        subjectName: subject?.name || '—',
        total: g.total,
        period: g.period,
      };
    });

  return {
    role: user.role,
    unread: notifications.filter((n) => n.userId === user.id && !n.read).length,
    studentCount: students.filter((s) => s.status === 'ACTIVE').length,
    teacherCount: teachers.filter((t) => t.active && ['معلم', 'سرمعلم', 'مدیر'].includes(t.position)).length,
    staffCount: teachers.filter((t) => t.active && ['ملازم', 'کارمند', 'کتابخانه‌دار'].includes(t.position)).length,
    classCount: classes.length,
    subjectCount: subjects.length,
    bookCount: books.length,
    attendanceToday: {
      present: todayAtt.filter((a) => a.status === 'PRESENT').length,
      absent: todayAtt.filter((a) => a.status === 'ABSENT').length,
      sick: todayAtt.filter((a) => a.status === 'SICK').length,
      leave: todayAtt.filter((a) => a.status === 'LEAVE').length,
      recorded: todayAtt.length,
    },
    lentBooks: loans.filter((l) => l.status === 'LENT').length,
    pendingTasks: user.teacherId
      ? tasks.filter((t) => t.staffId === user.teacherId && t.status !== 'DONE').length
      : 0,
    recentGrades,
  };
}

/* ───────────────────────  backup  ─────────────────────── */

export async function backupGet(me: AuthUser | null) {
  requireRole(me, 'ADMIN');
  const [users, classes, subjects, classSubjects, teachers, students, attendance, staffAttendance, activities, grades, books, loans, notifications, tasks, settings] =
    await Promise.all([
      load<Rec[]>('users'), load<Rec[]>('classes'), load<Rec[]>('subjects'),
      load<Rec[]>('classSubjects'), load<Rec[]>('teachers'), load<Rec[]>('students'),
      load<Rec[]>('attendance'), load<Rec[]>('staffAttendance'), load<Rec[]>('activities'),
      load<Rec[]>('grades'), load<Rec[]>('books'), load<Rec[]>('loans'),
      load<Rec[]>('notifications'), load<Rec[]>('tasks'), load<Rec[]>('settings'),
    ]);
  return {
    version: 1,
    app: 'مکتب خصوصی نداالقلم',
    createdAt: nowIso(),
    data: {
      users: users.map((u) => ({ ...u, _backupPassword: true })),
      classes, subjects, classSubjects, teachers, students,
      attendance, staffAttendance, activities, grades,
      books, loans, notifications, tasks, settings,
    },
  };
}

export async function backupPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN');
  const data = body?.data as Record<string, unknown> | undefined;
  if (!data || !body.version) throw new ApiError('ساختار فایل پشتیبان صحیح نیست');

  const collections: Array<[string, string]> = [
    ['classes', 'db/classes.json'], ['subjects', 'db/subjects.json'],
    ['classSubjects', 'db/classSubjects.json'], ['teachers', 'db/teachers.json'],
    ['students', 'db/students.json'], ['users', 'db/users.json'],
    ['attendance', 'db/attendance.json'], ['staffAttendance', 'db/staffAttendance.json'],
    ['activities', 'db/activities.json'], ['grades', 'db/grades.json'],
    ['books', 'db/books.json'], ['loans', 'db/loans.json'],
    ['notifications', 'db/notifications.json'], ['tasks', 'db/tasks.json'],
    ['settings', 'db/settings.json'],
  ];
  for (const [key, path] of collections) {
    const rows = Array.isArray(data[key]) ? data[key] : [];
    if (key === 'users') {
      const filtered = (rows as Array<Record<string, unknown>>).filter((u) => u.password);
      await writeRestore(path, filtered, `backup: بازیابی users (${filtered.length})`);
      continue;
    }
    await writeRestore(path, rows, `backup: بازیابی ${key} (${(rows as unknown[]).length})`);
  }
  return { ok: true };
}

async function writeRestore(path: string, data: unknown, message: string) {
  const { ghWriteFile } = await import('./gh');
  await ghWriteFile(path, data, { message, retries: 1 });
}
