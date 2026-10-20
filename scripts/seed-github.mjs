/**
 * ساخت و پر کردن مخزن دادهٔ خصوصی گیت‌هاب — مکتب خصوصی نداالقلم
 * استفاده:
 *   GH_TOKEN=ghp_xxx node scripts/seed-github.mjs        (یا bun scripts/seed-github.mjs)
 *   متغیرهای اختیاری: DATA_REPO (پیش‌فرض nedaalqalam-school-data)، OWNER
 */
import { randomBytes, scryptSync } from 'node:crypto';

const TOKEN = process.env.GH_TOKEN || process.env.NEXT_PUBLIC_GH_TOKEN || '';
if (!TOKEN) {
  console.error('GH_TOKEN تنظیم نشده است');
  process.exit(1);
}
const OWNER = process.env.OWNER || 'hasamsayedi0987-cloud';
const REPO = process.env.DATA_REPO || 'nedaalqalam-school-data';
const API = 'https://api.github.com';

async function api(path, method = 'GET', body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/* ───────────── داده‌های اولیه (مانند seed سرور) ───────────── */

const gradeNames = ['صنف اول', 'صنف دوم', 'صنف سوم', 'صنف چهارم', 'صنف پنجم', 'صنف ششم', 'صنف هفتم', 'صنف هشتم', 'صنف نهم', 'صنف دهم', 'صنف یازدهم', 'صنف دوازدهم'];
const subjectsByBand = {
  '1-3': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'رسم‌الخط'],
  '4-6': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'جغرافیه', 'تاریخ', 'رسم‌الخط'],
  '7-9': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'جغرافیه', 'تاریخ', 'زیست‌شناسی', 'فزیک', 'کیمیا'],
  '10-12': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'فزیک', 'کیمیا', 'بیولوژی', 'انگلیسی', 'جغرافیه', 'تاریخ', 'معلومات کمپیوتر'],
};
const now = new Date().toISOString();

const settings = [
  { key: 'schoolName', value: 'مکتب خصوصی نداالقلم' },
  { key: 'province', value: 'بدخشان' },
  { key: 'district', value: 'بهارک' },
  { key: 'authority', value: 'آمریت معارف بهارک' },
  { key: 'academicYear', value: '1404' },
  { key: 'directorName', value: 'حسام الدین سیدی' },
  { key: 'directorPhone', value: '0791680632' },
  { key: 'directorEmail', value: 'hasamsayedi0987@gmail.com' },
  { key: 'maxWritten', value: '40' },
  { key: 'maxOral', value: '20' },
  { key: 'maxHomework', value: '20' },
  { key: 'maxActivity', value: '20' },
  { key: 'resultNote', value: 'هر شاگرد که در یک یا چند مضمون نمرهٔ کمتر از ۵۰ بگیرد، تکرار صنف می‌گردد.' },
];

const classes = Array.from({ length: 12 }, (_, i) => ({
  id: `class-${i + 1}`, grade: i + 1, name: gradeNames[i], supervisorId: i + 1 === 7 ? 'tch-2' : null, createdAt: now,
}));

const allSubjects = Array.from(new Set(Object.values(subjectsByBand).flat()));
const subjects = allSubjects.map((name) => ({ id: `subj-${name}`, name }));

const teachers = [
  { id: 'tch-1', name: 'حسام الدین سیدی', fatherName: 'عبدالرحمن', position: 'مدیر', phone: '0791680632', education: 'لیسانس کمپیوتر ساینس' },
  { id: 'tch-2', name: 'عبدالبصیر نظری', fatherName: 'محمدنظیر', position: 'سرمعلم', phone: '0790123456', education: 'لیسانس تعلیم و تربیت' },
  { id: 'tch-3', name: 'فاطمه احمدی', fatherName: 'محمد', position: 'معلم', phone: '0770123456', education: 'لیسانس ادبیات دری' },
  { id: 'tch-4', name: 'محمد یوسف رحیمی', fatherName: 'احمد', position: 'معلم', phone: '0770987654', education: 'لیسانس ریاضیات' },
  { id: 'tch-5', name: 'زینب کریمی', fatherName: 'نورمحمد', position: 'معلم', phone: '0770555666', education: 'لیسانس علوم' },
  { id: 'tch-6', name: 'علی جان نظربیک', fatherName: 'قادر', position: 'ملازم', phone: '0770333444', education: 'دیپلم' },
  { id: 'tch-7', name: 'خدیجه صادقی', fatherName: 'کریم', position: 'کتابخانه‌دار', phone: '0770222333', education: 'دیپلم' },
].map((t) => ({ ...t, hireDate: '1402/1/1', active: true, createdAt: now }));

const students = [
  { id: 'std-1', firstName: 'احمد', lastName: 'سیدی', fatherName: 'محمدنور', gender: 'M', rollNo: 1 },
  { id: 'std-2', firstName: 'مریم', lastName: 'احمدی', fatherName: 'عبدالله', gender: 'F', rollNo: 2 },
  { id: 'std-3', firstName: 'عبدالرحمن', lastName: 'کریمی', fatherName: 'جلیل', gender: 'M', rollNo: 3 },
  { id: 'std-4', firstName: 'فاطمه', lastName: 'نوری', fatherName: 'حبیب', gender: 'F', rollNo: 4 },
  { id: 'std-5', firstName: 'یوسف', lastName: 'رحیمی', fatherName: 'باقر', gender: 'M', rollNo: 5 },
].map((s) => ({
  ...s, grandFather: 'محمد', classId: 'class-7', status: 'ACTIVE',
  birthDate: null, idNumber: null, guardianName: `سرپرست ${s.firstName}`, guardianPhone: '0790111222',
  address: null, enrolledYear: '1404', createdAt: now,
}));

const users = [
  { username: 'admin', password: 'admin123', name: 'حسام الدین سیدی', role: 'ADMIN', teacherId: 'tch-1', studentId: null, phone: '0791680632' },
  { username: 'sarallam', password: '12345678', name: 'عبدالبصیر نظری', role: 'HEADTEACHER', teacherId: 'tch-2', studentId: null, phone: null },
  { username: 'teacher', password: '12345678', name: 'فاطمه احمدی', role: 'TEACHER', teacherId: 'tch-3', studentId: null, phone: null },
  { username: 'staff', password: '12345678', name: 'علی جان نظربیک', role: 'STAFF', teacherId: 'tch-6', studentId: null, phone: null },
  { username: 'library', password: '12345678', name: 'خدیجه صادقی', role: 'LIBRARIAN', teacherId: 'tch-7', studentId: null, phone: null },
  { username: 'student', password: '12345678', name: 'احمد سیدی (شاگرد نمونه)', role: 'STUDENT', teacherId: null, studentId: 'std-1', phone: null },
  { username: 'parent', password: '12345678', name: 'سرپرست احمد سیدی', role: 'GUARDIAN', teacherId: null, studentId: 'std-1', phone: null },
].map((u) => ({ id: `u-${u.username}`, ...u, password: hashPassword(u.password), active: true, createdAt: now }));

const assign = [
  ['قرآن کریم', 'tch-2'], ['دینیات', 'tch-2'], ['دری', 'tch-3'], ['پشتو', 'tch-3'],
  ['ریاضیات', 'tch-4'], ['علوم', 'tch-5'], ['انگلیسی', 'tch-4'], ['جغرافیه', 'tch-3'],
  ['تاریخ', 'tch-3'], ['زیست‌شناسی', 'tch-5'], ['فزیک', 'tch-5'], ['کیمیا', 'tch-5'],
];
const classSubjects = assign.map(([subjName, teacherId]) => ({
  id: `cs-class-7-${subjName}`, classId: 'class-7', subjectId: `subj-${subjName}`, teacherId, createdAt: now,
}));

const books = [
  { id: 'bk-1', title: 'رسالهٔ تعلیم و تربیت', author: 'جان دیوی', category: 'تعلیم و تربیت', copies: 3, available: 3, shelfNo: 'A-1' },
  { id: 'bk-2', title: 'ریاضیات صنف هفتم', author: 'وزارت معارف', category: 'کتاب درسی', copies: 10, available: 8, shelfNo: 'B-2' },
  { id: 'bk-3', title: 'دری صنف ششم', author: 'وزارت معارف', category: 'کتاب درسی', copies: 10, available: 10, shelfNo: 'B-3' },
  { id: 'bk-4', title: 'تاریخ بدخشان', author: 'میرزا سنگ محمد', category: 'تاریخ', copies: 2, available: 2, shelfNo: 'C-1' },
  { id: 'bk-5', title: 'انگلیسی برای مبتدیان', author: 'Longman', category: 'زبان', copies: 5, available: 4, shelfNo: 'D-1' },
].map((b) => ({ ...b, createdAt: now }));

const loans = [
  { id: 'loan-1', bookId: 'bk-2', borrowerName: 'احمد سیدی', borrowerType: 'STUDENT', studentId: 'std-1', loanDate: '1404/7/1', dueDate: '1404/7/21', returnDate: null, status: 'LENT', notes: null, createdAt: now },
  { id: 'loan-2', bookId: 'bk-2', borrowerName: 'مریم احمدی', borrowerType: 'STUDENT', studentId: 'std-2', loanDate: '1404/7/2', dueDate: '1404/7/22', returnDate: null, status: 'LENT', notes: null, createdAt: now },
  { id: 'loan-3', bookId: 'bk-5', borrowerName: 'عبدالبصیر نظری', borrowerType: 'TEACHER', studentId: null, loanDate: '1404/7/5', dueDate: '1404/8/5', returnDate: null, status: 'LENT', notes: null, createdAt: now },
];

// حاضری امروز — نمونه
const todayIso = now.slice(0, 10);
const attendance = students.map((s) => ({
  id: `att-${s.id}`, studentId: s.id, classId: 'class-7', date: todayIso,
  status: 'PRESENT', recordedBy: 'u-admin', createdAt: now, updatedAt: now,
}));

// نمرات نمونهٔ چهارونیم‌ماهه — دری (پوشش همهٔ مکتسبه‌ها)
const gradeSamples = [
  { studentId: 'std-1', written: 38, oral: 18, homework: 18, activity: 17, total: 91 },
  { studentId: 'std-2', written: 35, oral: 16, homework: 17, activity: 15, total: 83 },
  { studentId: 'std-3', written: 30, oral: 15, homework: 14, activity: 13, total: 72 },
  { id: null, studentId: 'std-4', written: 25, oral: 12, homework: 12, activity: 10, total: 59 },
  { studentId: 'std-5', written: 10, oral: 5, homework: 4, activity: 3, total: 22 },
];
const grades = gradeSamples.map((g, i) => ({
  id: `gr-demo-${i + 1}`, studentId: g.studentId, classSubjectId: 'cs-class-7-دری', period: 'MIDTERM',
  written: g.written, oral: g.oral, homework: g.homework, activity: g.activity,
  total: g.total, approved: false, notes: null, createdAt: now, updatedAt: now,
}));

const notifications = [
  { id: 'ntf-1', userId: 'u-admin', title: 'به سیستم مکتب خوش آمدید', body: 'داده‌های مکتب اکنون در مخزن ابری گیت‌هاب ذخیره می‌شود و بین همهٔ دستگاه‌ها همگام است.', type: 'INFO', read: false, createdAt: now },
];

const tasks = [
  { id: 'task-1', staffId: 'tch-6', title: 'ترتیب کتاب‌های کتابخانه', description: 'کتاب‌های رسیدهٔ جدید طبق قفسه‌بندی مرتب شود', dueDate: '1404/7/20', status: 'PENDING', assignedBy: 'tch-1', createdAt: now },
  { id: 'task-2', staffId: 'tch-6', title: 'تمیزی تالار محاضرات', description: null, dueDate: '1404/7/10', status: 'DONE', assignedBy: 'tch-1', createdAt: now },
];

const files = {
  'db/settings.json': settings,
  'db/classes.json': classes,
  'db/subjects.json': subjects,
  'db/classSubjects.json': classSubjects,
  'db/teachers.json': teachers,
  'db/students.json': students,
  'db/users.json': users,
  'db/books.json': books,
  'db/loans.json': loans,
  'db/attendance.json': attendance,
  'db/staffAttendance.json': [],
  'db/activities.json': [],
  'db/grades.json': grades,
  'db/notifications.json': notifications,
  'db/tasks.json': tasks,
};

/* ───────────── اجرا ───────────── */

async function main() {
  console.log(`📦 مخزن داده: ${OWNER}/${REPO}`);

  // بررسی/ساخت مخزن خصوصی
  const check = await api(`/repos/${OWNER}/${REPO}`);
  if (check.status === 404) {
    console.log('➕ ساخت مخزن خصوصی...');
    const created = await api('/user/repos', 'POST', {
      name: REPO, private: true, auto_init: false,
      description: 'مخزن دادهٔ ابری مکتب خصوصی نداالقلم — توسط اپ مدیریت مکتب استفاده می‌شود',
    });
    if (created.status >= 300) {
      console.error('ساخت مخزن ناموفق:', created.json);
      process.exit(1);
    }
  } else {
    console.log(`✓ مخزن موجود است (private=${check.json.private})`);
  }

  // ثبت فایل‌ها
  for (const [path, data] of Object.entries(files)) {
    // اگر فایل موجود است، بازنویسی نشود (دادهٔ زبان حفظ می‌شود)
    const existing = await api(`/repos/${OWNER}/${REPO}/contents/${path}`);
    if (existing.status === 200) {
      console.log(`⏭  ${path} از قبل موجود است — دست نخورد`);
      continue;
    }
    const put = await api(`/repos/${OWNER}/${REPO}/contents/${path}`, 'PUT', {
      message: `seed: ${path}`,
      content: Buffer.from(JSON.stringify(data, null, 1), 'utf8').toString('base64'),
      branch: 'main',
    });
    if (put.status >= 300) {
      console.error(`❌ ${path}:`, put.status, put.json.message);
      process.exit(1);
    }
    console.log(`✓ ${path} (${Array.isArray(data) ? data.length : '—'} ردیف)`);
  }

  console.log('🎉 مخزن داده آماده شد');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
