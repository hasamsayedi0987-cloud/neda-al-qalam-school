/**
 * مهاجرت داده‌ها از مخزن ابری گیت‌هاب → دیتابیس SQLite سرور
 * همهٔ ۱۵ کالکشن یک‌به‌یک با مدل‌های Prisma مطابقت دارند
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const TOKEN = readFileSync('/tmp/gh_token.txt', 'utf8').trim();
const OWNER = 'hasamsayedi0987-cloud';
const REPO = 'nedaalqalam-school-data';
const BRANCH = 'main';

const prisma = new PrismaClient();

async function fetchFile(name) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/db/${name}.json?ref=${BRANCH}`,
    { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' } },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  const content = Buffer.from(json.content || '', 'base64').toString('utf8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : [];
}

async function upsertMany(model, rows, map) {
  let ok = 0, skip = 0;
  for (const raw of rows) {
    try {
      const data = map(raw);
      if (!data) { skip++; continue; }
      await model.upsert({ where: { id: data.id }, update: data, create: data });
      ok++;
    } catch (e) {
      skip++;
      if (skip <= 3) console.log(`  ⚠ ${raw?.id?.slice(0, 10)}: ${e.message.slice(0, 120)}`);
    }
  }
  return { ok, skip };
}

const d = (v) => (v ? new Date(v) : new Date());
const nOrNull = (v) => (v == null || v === '' ? null : Number(v));

async function main() {
  console.log('⏳ در حال دریافت داده‌ها از گیت‌هاب...');
  const names = ['users','classes','subjects','classSubjects','teachers','students',
    'attendance','staffAttendance','activities','grades','books','loans',
    'notifications','tasks','settings'];
  const raw = {};
  for (const f of names) {
    raw[f] = await fetchFile(f);
    console.log(`  ${f}: ${raw[f].length}`);
  }

  // ─── ۱. معلمان ───
  let r = await upsertMany(prisma.teacher, raw.teachers, (t) => ({
    id: t.id, name: t.name, fatherName: t.fatherName ?? null, position: t.position ?? 'معلم',
    phone: t.phone ?? null, education: t.education ?? null, hireDate: t.hireDate ?? null,
    active: t.active ?? true, createdAt: d(t.createdAt), updatedAt: d(t.updatedAt),
  }));
  console.log(`teachers: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۲. صنف‌ها ───
  r = await upsertMany(prisma.class, raw.classes, (c) => ({
    id: c.id, grade: Number(c.grade), name: c.name,
    supervisorId: raw.teachers.some((t) => t.id === c.supervisorId) ? c.supervisorId : null,
    createdAt: d(c.createdAt), updatedAt: d(c.updatedAt),
  }));
  console.log(`classes: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۳. مضامین ───
  r = await upsertMany(prisma.subject, raw.subjects, (s) => ({
    id: s.id, name: s.name, createdAt: d(s.createdAt), updatedAt: d(s.updatedAt),
  }));
  console.log(`subjects: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۴. شاگردان ───
  r = await upsertMany(prisma.student, raw.students, (s) => ({
    id: s.id, firstName: s.firstName, lastName: s.lastName, fatherName: s.fatherName ?? '',
    grandFather: s.grandFather ?? null, gender: s.gender ?? 'M', birthDate: s.birthDate ?? null,
    idNumber: s.idNumber ?? null, guardianName: s.guardianName ?? null, guardianPhone: s.guardianPhone ?? null,
    address: s.address ?? null,
    classId: raw.classes.some((c) => c.id === s.classId) ? s.classId : null,
    rollNo: nOrNull(s.rollNo), status: s.status ?? 'ACTIVE', enrolledYear: s.enrolledYear ?? null,
    createdAt: d(s.createdAt), updatedAt: d(s.updatedAt),
  }));
  console.log(`students: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۵. کاربران ───
  r = await upsertMany(prisma.user, raw.users, (u) => ({
    id: u.id, username: u.username, password: u.password, name: u.name, role: u.role,
    active: u.active ?? true, phone: u.phone ?? null,
    teacherId: raw.teachers.some((t) => t.id === u.teacherId) ? u.teacherId : null,
    studentId: raw.students.some((s) => s.id === u.studentId) ? u.studentId : null,
    createdAt: d(u.createdAt), updatedAt: d(u.updatedAt),
  }));
  console.log(`users: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۶. تقسیم مضامین ───
  r = await upsertMany(prisma.classSubject, raw.classSubjects, (cs) => ({
    id: cs.id,
    classId: cs.classId, subjectId: cs.subjectId,
    teacherId: raw.teachers.some((t) => t.id === cs.teacherId) ? cs.teacherId : null,
    createdAt: d(cs.createdAt), updatedAt: d(cs.updatedAt),
  }));
  console.log(`classSubjects: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۷. حاضری شاگردان ───
  r = await upsertMany(prisma.attendanceRecord, raw.attendance, (a) => ({
    id: a.id, studentId: a.studentId, classId: a.classId, date: a.date,
    status: a.status, recordedBy: a.recordedBy ?? null,
    createdAt: d(a.createdAt), updatedAt: d(a.updatedAt),
  }));
  console.log(`attendance: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۸. حاضری کارمندان ───
  r = await upsertMany(prisma.staffAttendance, raw.staffAttendance, (a) => ({
    id: a.id, teacherId: a.teacherId, date: a.date, status: a.status,
    createdAt: d(a.createdAt), updatedAt: d(a.updatedAt),
  }));
  console.log(`staffAttendance: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۹. فعالیت‌ها ───
  r = await upsertMany(prisma.studentActivity, raw.activities, (a) => ({
    id: a.id, studentId: a.studentId, date: a.date, type: a.type,
    score: nOrNull(a.score), note: a.note ?? '', recordedBy: a.recordedBy ?? null,
    createdAt: d(a.createdAt), updatedAt: d(a.updatedAt),
  }));
  console.log(`activities: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۰. نمرات ───
  r = await upsertMany(prisma.grade, raw.grades, (g) => ({
    id: g.id, studentId: g.studentId, classSubjectId: g.classSubjectId, period: g.period,
    written: nOrNull(g.written), oral: nOrNull(g.oral),
    homework: nOrNull(g.homework), activity: nOrNull(g.activity),
    total: Number(g.total ?? 0), approved: Boolean(g.approved), notes: g.notes ?? null,
    createdAt: d(g.createdAt), updatedAt: d(g.updatedAt),
  }));
  console.log(`grades: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۱. کتاب‌ها ───
  r = await upsertMany(prisma.book, raw.books, (b) => ({
    id: b.id, title: b.title, author: b.author ?? null, category: b.category ?? null,
    copies: Number(b.copies ?? 1), available: Number(b.available ?? 1), shelfNo: b.shelfNo ?? null,
    createdAt: d(b.createdAt), updatedAt: d(b.updatedAt),
  }));
  console.log(`books: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۲. امانات ───
  r = await upsertMany(prisma.bookLoan, raw.loans, (l) => ({
    id: l.id, bookId: l.bookId, borrowerName: l.borrowerName, borrowerType: l.borrowerType ?? 'STUDENT',
    studentId: raw.students.some((s) => s.id === l.studentId) ? l.studentId : null,
    loanDate: l.loanDate, dueDate: l.dueDate, returnDate: l.returnDate ?? null,
    status: l.status ?? 'LENT', notes: l.notes ?? null,
    createdAt: d(l.createdAt), updatedAt: d(l.updatedAt),
  }));
  console.log(`loans: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۳. اعلان‌ها ───
  r = await upsertMany(prisma.notification, raw.notifications, (n) => ({
    id: n.id, userId: n.userId, title: n.title, body: n.body, type: n.type ?? 'INFO',
    read: Boolean(n.read), createdAt: d(n.createdAt),
  }));
  console.log(`notifications: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۴. وظایف ───
  r = await upsertMany(prisma.staffTask, raw.tasks, (t) => ({
    id: t.id, staffId: t.staffId, title: t.title, description: t.description ?? null,
    dueDate: t.dueDate ?? null, status: t.status ?? 'PENDING', assignedBy: t.assignedBy ?? null,
    createdAt: d(t.createdAt), updatedAt: d(t.updatedAt),
  }));
  console.log(`tasks: ${r.ok} OK, ${r.skip} skipped`);

  // ─── ۱۵. تنظیمات ───
  let sOk = 0;
  for (const s of raw.settings) {
    if (!s?.key) continue;
    await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
    sOk++;
  }
  console.log(`settings: ${sOk} OK`);

  console.log('✅ مهاجرت کامل شد');
}

main()
  .catch((e) => { console.error('❌ خطا:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
