'use client';

/**
 * هندلرهای هسته — auth، users، students، teachers، classes، subjects، settings
 * رفتار ۱:۱ با نسخهٔ سرور (Next.js API) — مکتب خصوصی نداالقلم
 */

import {
  ApiError, str, num, optNum, genId, nowIso, hashPassword, verifyPassword,
  load, mutate, loadSettingsMap, mutateSettingsMap,
  getSession, setSession, clearSession, requireUser, requireRole,
  type AuthUser, type Rec,
} from './backend-common';

const VALID_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'];
const POSITIONS = ['معلم', 'سرمعلم', 'مدیر', 'ملازم', 'کارمند', 'کتابخانه‌دار'];

interface UserRec extends Rec {
  username: string;
  password: string;
  name: string;
  role: string;
  active: boolean;
  phone: string | null;
  teacherId: string | null;
  studentId: string | null;
  createdAt: string;
}

function toSessionUser(u: UserRec) {
  return {
    id: u.id, username: u.username, name: u.name, role: u.role,
    phone: u.phone ?? null, teacherId: u.teacherId ?? null, studentId: u.studentId ?? null,
  };
}

/** کاربر جاری از نشست — با بررسی فعال بودن حساب */
export async function currentAuthUser(): Promise<AuthUser | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const users = await load<UserRec[]>('users');
    const u = users.find((x) => x.id === session.uid);
    if (!u || !u.active) return null;
    return {
      id: u.id, username: u.username, name: u.name, role: u.role, active: u.active,
      phone: u.phone ?? null, teacherId: u.teacherId ?? null, studentId: u.studentId ?? null,
    };
  } catch {
    return null;
  }
}

/* ───────────────────────  auth  ─────────────────────── */

export async function authGet() {
  const me = await currentAuthUser();
  return { user: me ? toSessionUser(me as unknown as UserRec) : null };
}

export async function authPost(body: Record<string, unknown>) {
  const action = str(body.action);

  if (action === 'login') {
    const username = str(body.username).toLowerCase();
    const password = str(body.password);
    if (!username || !password) throw new ApiError('نام کاربری و رمز عبور را وارد کنید');
    const users = await load<UserRec[]>('users', { maxAgeMs: 120_000 });
    const user = users.find((u) => (u.username || '').toLowerCase() === username);
    if (!user || !(await verifyPassword(password, user.password || ''))) {
      throw new ApiError('نام کاربری یا رمز عبور نادرست است', 401);
    }
    if (!user.active) {
      throw new ApiError('حساب کاربری شما توسط مدیر غیرفعال شده است. لطفاً با مدیر مکتب تماس بگیرید.', 403);
    }
    setSession(user.id);
    return { user: toSessionUser(user) };
  }

  if (action === 'logout') {
    clearSession();
    return { ok: true };
  }

  if (action === 'change-password') {
    const me = requireUser(await currentAuthUser());
    const current = str(body.currentPassword);
    const next = str(body.newPassword);
    if (next.length < 6) throw new ApiError('رمز عبور جدید باید حداقل ۶ حرف باشد');
    await mutate('users', async (users) => {
      const u = users.find((x) => x.id === me.id) as UserRec | undefined;
      if (!u || !(await verifyPassword(current, u.password || ''))) {
        throw new ApiError('رمز عبور فعلی نادرست است');
      }
      u.password = await hashPassword(next);
      return { ok: true };
    }, `users: تغییر رمز عبور ${me.username}`);
    return { ok: true };
  }

  throw new ApiError('عملیات نامعلوم');
}

/* ───────────────────────  users  ─────────────────────── */

export async function usersGet(me: AuthUser | null) {
  requireRole(me, 'ADMIN');
  const [users, students] = await Promise.all([
    load<UserRec[]>('users'),
    load<Rec[]>('students', { maxAgeMs: 120_000 }),
  ]);
  const sorted = [...users].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return {
    users: sorted.map((u) => ({
      id: u.id, username: u.username, name: u.name, role: u.role,
      active: u.active, phone: u.phone ?? null, teacherId: u.teacherId ?? null, studentId: u.studentId ?? null,
      studentName: (() => {
        const s = students.find((x) => x.id === u.studentId);
        return s ? `${s.firstName} ${s.lastName}` : null;
      })(),
    })),
  };
}

export async function usersPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN');
  const username = str(body.username).toLowerCase();
  const password = str(body.password);
  const name = str(body.name);
  const role = str(body.role);
  if (!username || !password || !name) throw new ApiError('همهٔ فیلدهای ضروری را پر کنید');
  if (password.length < 6) throw new ApiError('رمز عبور باید حداقل ۶ حرف باشد');
  if (!VALID_ROLES.includes(role)) throw new ApiError('نقش نامعتبر است');
  return mutate('users', async (users) => {
    if (users.some((u) => (u.username || '').toLowerCase() === username)) {
      throw new ApiError('این نام کاربری قبلاً ثبت شده است');
    }
    const id = genId();
    users.push({
      id, username, name, role,
      password: await hashPassword(password),
      phone: str(body.phone) || null,
      teacherId: str(body.teacherId) || null,
      studentId: str(body.studentId) || null,
      active: true, createdAt: nowIso(),
    });
    return { id };
  }, `users: ثبت کاربر ${username}`);
}

export async function usersPatch(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN');
  const id = str(body.id);
  if (!id) throw new ApiError('شناسهٔ کاربر لازم است');
  await mutate('users', async (users) => {
    const u = users.find((x) => x.id === id) as UserRec | undefined;
    if (!u) throw new ApiError('کاربر یافت نشد', 404);
    if (body.name !== undefined) u.name = str(body.name);
    if (body.role !== undefined && VALID_ROLES.includes(str(body.role))) u.role = str(body.role);
    if (body.phone !== undefined) u.phone = str(body.phone) || null;
    if (body.teacherId !== undefined) u.teacherId = str(body.teacherId) || null;
    if (body.studentId !== undefined) u.studentId = str(body.studentId) || null;
    if (body.active !== undefined) u.active = Boolean(body.active);
    if (body.newPassword) {
      const pw = str(body.newPassword);
      if (pw.length < 6) throw new ApiError('رمز عبور باید حداقل ۶ حرف باشد');
      u.password = await hashPassword(pw);
    }
    return { ok: true };
  }, `users: ویرایش کاربر ${id}`);
  return { ok: true };
}

export async function usersDelete(me: AuthUser | null, id: string) {
  const admin = requireRole(me, 'ADMIN');
  if (!id) throw new ApiError('شناسهٔ کاربر لازم است');
  if (id === admin.id) throw new ApiError('نمی‌توانید حساب خودتان را حذف کنید');
  await mutate('users', (users) => {
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new ApiError('کاربر یافت نشد', 404);
    users.splice(idx, 1);
    return { ok: true };
  }, `users: حذف کاربر ${id}`);
  try {
    await mutate('notifications', (notifs) => {
      return { ok: true, removed: notifs.filter((n) => n.userId === id).length, keep: notifs.filter((n) => n.userId !== id) };
    }, `users: حذف اعلان‌های کاربر ${id}`).catch(() => null);
  } catch { /* جانبی — اهمیتی ندارد */ }
  return { ok: true };
}

/* ───────────────────────  students  ─────────────────────── */

interface StudentRec extends Rec {
  firstName: string; lastName: string; fatherName: string; grandFather: string | null;
  gender: string; birthDate: string | null; idNumber: string | null;
  guardianName: string | null; guardianPhone: string | null; address: string | null;
  classId: string | null; rollNo: number | null; enrolledYear: string | null;
  status: string; createdAt: string;
}

export async function studentsGet(me: AuthUser | null, sp: URLSearchParams) {
  const user = requireUser(me);
  const classId = sp.get('classId');
  const search = sp.get('q');

  if (user.role === 'STUDENT' || user.role === 'GUARDIAN') {
    if (!user.studentId) throw new ApiError('حساب شما به هیچ شاگردی پیوند ندارد', 403);
    const [students, classes] = await Promise.all([load<StudentRec[]>('students'), load<Rec[]>('classes', { maxAgeMs: 300_000 })]);
    const s = students.find((x) => x.id === user.studentId);
    const rows = s ? [{ ...s, className: classes.find((c) => c.id === s.classId)?.name || null }] : [];
    return { students: rows };
  }

  const [students, classes] = await Promise.all([
    load<StudentRec[]>('students'),
    load<Rec[]>('classes', { maxAgeMs: 300_000 }),
  ]);
  let rows = students;
  if (classId) rows = rows.filter((s) => s.classId === classId);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((s) =>
      [s.firstName, s.lastName, s.fatherName].some((f) => (f || '').toLowerCase().includes(q)));
  }
  rows = [...rows].sort((a, b) =>
    (a.classId || '').localeCompare(b.classId || '') ||
    ((a.rollNo ?? 1e9) - (b.rollNo ?? 1e9)) ||
    (a.createdAt || '').localeCompare(b.createdAt || ''));
  return {
    students: rows.map((s) => ({ ...s, className: classes.find((c) => c.id === s.classId)?.name || null })),
  };
}

export async function studentsPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  const fatherName = str(body.fatherName);
  if (!firstName || !lastName || !fatherName) throw new ApiError('اسم، شهرت و نام پدر ضروری است');
  const classId = str(body.classId) || null;
  let rollNo = optNum(body.rollNo);
  return mutate('students', (students) => {
    if (classId && rollNo == null) {
      rollNo = students.filter((s) => s.classId === classId).length + 1;
    }
    const id = genId();
    students.push({
      id, firstName, lastName, fatherName,
      grandFather: str(body.grandFather) || null,
      gender: str(body.gender) === 'F' ? 'F' : 'M',
      birthDate: str(body.birthDate) || null,
      idNumber: str(body.idNumber) || null,
      guardianName: str(body.guardianName) || null,
      guardianPhone: str(body.guardianPhone) || null,
      address: str(body.address) || null,
      classId, rollNo,
      enrolledYear: str(body.enrolledYear) || null,
      status: 'ACTIVE', createdAt: nowIso(),
    });
    return { id };
  }, `students: ثبت شاگرد ${firstName} ${lastName}`);
}

export async function studentsPatch(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER', 'TEACHER');
  const id = str(body.id);
  if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
  await mutate('students', (students) => {
    const s = students.find((x) => x.id === id);
    if (!s) throw new ApiError('شاگرد یافت نشد', 404);
    for (const key of ['firstName', 'lastName', 'fatherName', 'grandFather', 'birthDate', 'idNumber', 'guardianName', 'guardianPhone', 'address', 'enrolledYear']) {
      if (body[key] !== undefined) (s as Rec)[key] = str(body[key]) || null;
    }
    if (body.gender !== undefined) s.gender = str(body.gender) === 'F' ? 'F' : 'M';
    if (body.classId !== undefined) s.classId = str(body.classId) || null;
    if (body.rollNo !== undefined) s.rollNo = optNum(body.rollNo);
    if (body.status !== undefined && ['ACTIVE', 'LEFT', 'GRADUATED'].includes(str(body.status))) {
      s.status = str(body.status);
    }
    return { ok: true };
  }, `students: ویرایش شاگرد ${id}`);
  return { ok: true };
}

export async function studentsDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
  await mutate('students', (students) => {
    const idx = students.findIndex((s) => s.id === id);
    if (idx === -1) throw new ApiError('شاگرد یافت نشد', 404);
    students.splice(idx, 1);
    return { ok: true };
  }, `students: حذف شاگرد ${id}`);
  // پیوند حساب‌های مرتبط قطع و سوابق شاگرد حذف می‌شود
  try {
    await mutate('users', (users) => {
      for (const u of users) if (u.studentId === id) u.studentId = null;
      return { ok: true };
    }, `students: قطع پیوند حساب‌های شاگرد ${id}`);
  } catch { /* جانبی */ }
  for (const [key, label] of [
    ['grades', 'نمرات'], ['attendance', 'حاضری'], ['activities', 'فعالیت‌ها'],
  ] as const) {
    try {
      await mutate(key, (rows) => {
        const before = rows.length;
        const kept = rows.filter((r) => r.studentId !== id);
        kept.forEach((r, i) => { rows[i] = r; });
        rows.length = kept.length;
        return { ok: true, removed: before - rows.length };
      }, `students: حذف ${label} شاگرد ${id}`);
    } catch { /* جانبی */ }
  }
  return { ok: true };
}

/* ───────────────────────  teachers  ─────────────────────── */

interface TeacherRec extends Rec {
  name: string; fatherName: string | null; position: string; phone: string | null;
  education: string | null; hireDate: string | null; active: boolean; createdAt: string;
}

export async function teachersGet(me: AuthUser | null) {
  requireUser(me);
  const [teachers, users] = await Promise.all([
    load<TeacherRec[]>('teachers'),
    load<UserRec[]>('users', { maxAgeMs: 120_000 }),
  ]);
  const sorted = [...teachers].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return {
    teachers: sorted.map((t) => {
      const linked = users.find((u) => u.teacherId === t.id);
      return {
        id: t.id, name: t.name, fatherName: t.fatherName ?? null, position: t.position,
        phone: t.phone ?? null, education: t.education ?? null, hireDate: t.hireDate ?? null,
        active: t.active,
        username: linked?.username || null,
        userActive: linked ? linked.active : null,
      };
    }),
  };
}

export async function teachersPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const name = str(body.name);
  if (!name) throw new ApiError('نام لازم است');
  const position = POSITIONS.includes(str(body.position)) ? str(body.position) : 'معلم';
  return mutate('teachers', (teachers) => {
    const id = genId();
    teachers.push({
      id, name,
      fatherName: str(body.fatherName) || null,
      position,
      phone: str(body.phone) || null,
      education: str(body.education) || null,
      hireDate: str(body.hireDate) || null,
      active: true, createdAt: nowIso(),
    });
    return { id };
  }, `teachers: ثبت ${name}`);
}

export async function teachersPatch(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const id = str(body.id);
  if (!id) throw new ApiError('شناسه لازم است');
  await mutate('teachers', (teachers) => {
    const t = teachers.find((x) => x.id === id);
    if (!t) throw new ApiError('یافت نشد', 404);
    if (body.name !== undefined) t.name = str(body.name);
    if (body.fatherName !== undefined) t.fatherName = str(body.fatherName) || null;
    if (body.position !== undefined && POSITIONS.includes(str(body.position))) t.position = str(body.position);
    if (body.phone !== undefined) t.phone = str(body.phone) || null;
    if (body.education !== undefined) t.education = str(body.education) || null;
    if (body.hireDate !== undefined) t.hireDate = str(body.hireDate) || null;
    if (body.active !== undefined) t.active = Boolean(body.active);
    return { ok: true };
  }, `teachers: ویرایش ${id}`);
  return { ok: true };
}

export async function teachersDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN');
  if (!id) throw new ApiError('شناسه لازم است');
  await mutate('teachers', (teachers) => {
    const idx = teachers.findIndex((t) => t.id === id);
    if (idx === -1) throw new ApiError('یافت نشد', 404);
    teachers.splice(idx, 1);
    return { ok: true };
  }, `teachers: حذف ${id}`);
  try {
    await mutate('users', (users) => {
      for (const u of users) if (u.teacherId === id) u.teacherId = null;
      return { ok: true };
    }, `teachers: قطع پیوند حساب ${id}`);
  } catch { /* جانبی */ }
  try {
    await mutate('classes', (classes) => {
      for (const c of classes) if (c.supervisorId === id) c.supervisorId = null;
      return { ok: true };
    }, `teachers: قطع نگرانی صنف ${id}`);
  } catch { /* جانبی */ }
  try {
    await mutate('classSubjects', (cs) => {
      for (const c of cs) if (c.teacherId === id) c.teacherId = null;
      return { ok: true };
    }, `teachers: قطع سپردگی مضامین ${id}`);
  } catch { /* جانبی */ }
  return { ok: true };
}

/* ───────────────────────  classes  ─────────────────────── */

interface ClassRec extends Rec {
  grade: number; name: string; supervisorId: string | null; createdAt: string;
}
interface ClassSubjectRec extends Rec {
  classId: string; subjectId: string; teacherId: string | null; createdAt: string;
}

export async function classesGet(me: AuthUser | null) {
  requireUser(me);
  const [classes, classSubjects, subjects, teachers, students] = await Promise.all([
    load<ClassRec[]>('classes'),
    load<ClassSubjectRec[]>('classSubjects'),
    load<Rec[]>('subjects', { maxAgeMs: 300_000 }),
    load<TeacherRec[]>('teachers', { maxAgeMs: 120_000 }),
    load<StudentRec[]>('students', { maxAgeMs: 120_000 }),
  ]);
  const sorted = [...classes].sort((a, b) => a.grade - b.grade);
  return {
    classes: sorted.map((c) => {
      const supervisor = teachers.find((t) => t.id === c.supervisorId);
      const csList = classSubjects
        .filter((cs) => cs.classId === c.id)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        .map((cs) => {
          const subject = subjects.find((s) => s.id === cs.subjectId);
          const teacher = teachers.find((t) => t.id === cs.teacherId);
          return {
            id: cs.id, classId: cs.classId, subjectId: cs.subjectId, teacherId: cs.teacherId ?? null,
            subject: subject ? { id: subject.id, name: subject.name } : { id: cs.subjectId, name: '—' },
            teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          };
        });
      return {
        id: c.id, grade: c.grade, name: c.name, supervisorId: c.supervisorId ?? null,
        supervisorName: supervisor?.name || null,
        studentCount: students.filter((s) => s.classId === c.id && s.status === 'ACTIVE').length,
        classSubjects: csList,
      };
    }),
  };
}

export async function classesPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const grade = num(body.grade);
  const name = str(body.name);
  if (grade < 1 || grade > 12) throw new ApiError('صنف باید بین ۱ تا ۱۲ باشد');
  if (!name) throw new ApiError('نام صنف لازم است');
  return mutate('classes', (classes) => {
    if (classes.some((c) => c.name === name)) throw new ApiError('صنفی با این نام قبلاً ثبت شده است');
    const id = genId();
    classes.push({ id, grade, name, supervisorId: str(body.supervisorId) || null, createdAt: nowIso() });
    return { id };
  }, `classes: ثبت صنف ${name}`);
}

export async function classesPatch(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const id = str(body.id);
  if (!id) throw new ApiError('شناسهٔ صنف لازم است');
  await mutate('classes', (classes) => {
    const c = classes.find((x) => x.id === id);
    if (!c) throw new ApiError('صنف یافت نشد', 404);
    if (body.name !== undefined) c.name = str(body.name);
    if (body.grade !== undefined) c.grade = num(body.grade);
    if (body.supervisorId !== undefined) c.supervisorId = str(body.supervisorId) || null;
    return { ok: true };
  }, `classes: ویرایش صنف ${id}`);
  return { ok: true };
}

export async function classesDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN');
  if (!id) throw new ApiError('شناسهٔ صنف لازم است');
  await mutate('classes', (classes) => {
    const cls = classes.find((c) => c.id === id);
    if (!cls) throw new ApiError('صنف یافت نشد', 404);
    return { ok: true, name: cls.name };
  }, `classes: بررسی صنف ${id}`);
  const students = await load<StudentRec[]>('students');
  if (students.some((s) => s.classId === id)) throw new ApiError('ابتدا شاگردان این صنف را منتقل کنید');
  await mutate('classes', (classes) => {
    const idx = classes.findIndex((c) => c.id === id);
    if (idx !== -1) classes.splice(idx, 1);
    return { ok: true };
  }, `classes: حذف صنف ${id}`);
  return { ok: true };
}

/* ───────────────────────  classes/assign  ─────────────────────── */

export async function assignPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const classId = str(body.classId);
  const subjectId = str(body.subjectId);
  const teacherId = str(body.teacherId) || null;
  if (!classId || !subjectId) throw new ApiError('صنف و مضمون لازم است');
  const [classes, subjects] = await Promise.all([
    load<ClassRec[]>('classes'), load<Rec[]>('subjects', { maxAgeMs: 300_000 }),
  ]);
  if (!classes.find((c) => c.id === classId) || !subjects.find((s) => s.id === subjectId)) {
    throw new ApiError('صنف یا مضمون یافت نشد');
  }
  await mutate('classSubjects', (cs) => {
    const existing = cs.find((x) => x.classId === classId && x.subjectId === subjectId);
    if (existing) {
      existing.teacherId = teacherId;
      return { ok: true, id: existing.id };
    }
    const id = genId();
    cs.push({ id, classId, subjectId, teacherId, createdAt: nowIso() });
    return { ok: true, id };
  }, `assign: سپردن مضمون در صنف (${classId.slice(0, 10)})`);
  return { ok: true };
}

export async function assignDelete(me: AuthUser | null, csId: string) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  if (!csId) throw new ApiError('شناسه لازم است');
  await mutate('classSubjects', (cs) => {
    const idx = cs.findIndex((x) => x.id === csId);
    if (idx === -1) throw new ApiError('سپردگی یافت نشد', 404);
    cs.splice(idx, 1);
    return { ok: true };
  }, `assign: حذف سپردگی ${csId.slice(0, 10)}`);
  try {
    await mutate('grades', (grades) => {
      const kept = grades.filter((g) => g.classSubjectId !== csId);
      const removed = grades.length - kept.length;
      kept.forEach((g, i) => { grades[i] = g; });
      grades.length = kept.length;
      return { ok: true, removed };
    }, `assign: حذف نمرات سپردگی ${csId.slice(0, 10)}`);
  } catch { /* جانبی */ }
  return { ok: true };
}

/* ───────────────────────  subjects  ─────────────────────── */

export async function subjectsGet(me: AuthUser | null) {
  requireUser(me);
  const subjects = await load<Rec[]>('subjects');
  return { subjects: [...subjects].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa')) };
}

export async function subjectsPost(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const name = str(body.name);
  if (!name) throw new ApiError('نام مضمون لازم است');
  return mutate('subjects', (subjects) => {
    if (subjects.some((s) => s.name === name)) throw new ApiError('این مضمون قبلاً ثبت شده است');
    const id = genId();
    subjects.push({ id, name });
    return { id };
  }, `subjects: ثبت مضمون ${name}`);
}

export async function subjectsPatch(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN', 'HEADTEACHER');
  const id = str(body.id);
  if (!id) throw new ApiError('شناسهٔ مضمون لازم است');
  await mutate('subjects', (subjects) => {
    const s = subjects.find((x) => x.id === id);
    if (!s) throw new ApiError('مضمون یافت نشد', 404);
    s.name = str(body.name);
    return { ok: true };
  }, `subjects: ویرایش مضمون ${id}`);
  return { ok: true };
}

export async function subjectsDelete(me: AuthUser | null, id: string) {
  requireRole(me, 'ADMIN');
  if (!id) throw new ApiError('شناسهٔ مضمون لازم است');
  const csList = await load<ClassSubjectRec[]>('classSubjects');
  const csIds = csList.filter((cs) => cs.subjectId === id).map((cs) => cs.id);
  await mutate('subjects', (subjects) => {
    const idx = subjects.findIndex((s) => s.id === id);
    if (idx === -1) throw new ApiError('مضمون یافت نشد', 404);
    subjects.splice(idx, 1);
    return { ok: true };
  }, `subjects: حذف مضمون ${id}`);
  try {
    await mutate('classSubjects', (cs) => {
      const kept = cs.filter((x) => x.subjectId !== id);
      kept.forEach((x, i) => { cs[i] = x; });
      cs.length = kept.length;
      return { ok: true };
    }, `subjects: حذف سپردگی‌های مضمون ${id}`);
  } catch { /* جانبی */ }
  if (csIds.length > 0) {
    try {
      await mutate('grades', (grades) => {
        const kept = grades.filter((g) => !csIds.includes(String(g.classSubjectId)));
        kept.forEach((g, i) => { grades[i] = g; });
        grades.length = kept.length;
        return { ok: true };
      }, `subjects: حذف نمرات مضمون ${id}`);
    } catch { /* جانبی */ }
  }
  return { ok: true };
}

/* ───────────────────────  settings  ─────────────────────── */

const EDITABLE_KEYS = [
  'schoolName', 'province', 'district', 'authority', 'academicYear',
  'directorName', 'directorPhone', 'directorEmail',
  'maxWritten', 'maxOral', 'maxHomework', 'maxActivity', 'resultNote',
];

export async function settingsGet(me: AuthUser | null) {
  requireUser(me);
  const map = await loadSettingsMap();
  return { settings: map };
}

export async function settingsPut(me: AuthUser | null, body: Record<string, unknown>) {
  requireRole(me, 'ADMIN');
  const incoming = (body.settings || {}) as Record<string, unknown>;
  await mutateSettingsMap((map) => {
    for (const key of EDITABLE_KEYS) {
      if (incoming[key] !== undefined) map[key] = str(incoming[key]);
    }
  }, 'settings: به‌روزرسانی تنظیمات مکتب');
  return { ok: true };
}
