/**
 * داده‌های اولیه مکتب خصوصی نداالقلم
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const db = new PrismaClient();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const gradeNames = [
  'صنف اول', 'صنف دوم', 'صنف سوم', 'صنف چهارم', 'صنف پنجم', 'صنف ششم',
  'صنف هفتم', 'صنف هشتم', 'صنف نهم', 'صنف دهم', 'صنف یازدهم', 'صنف دوازدهم',
];

const subjectsByBand: Record<string, string[]> = {
  '1-3': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'رسم‌الخط'],
  '4-6': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'جغرافیه', 'تاریخ', 'رسم‌الخط'],
  '7-9': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'علوم', 'انگلیسی', 'جغرافیه', 'تاریخ', 'زیست‌شناسی', 'فزیک', 'کیمیا'],
  '10-12': ['قرآن کریم', 'دینیات', 'دری', 'پشتو', 'ریاضیات', 'فزیک', 'کیمیا', 'بیولوژی', 'انگلیسی', 'جغرافیه', 'تاریخ', 'معلومات کمپیوتر'],
};

function band(grade: number): string {
  if (grade <= 3) return '1-3';
  if (grade <= 6) return '4-6';
  if (grade <= 9) return '7-9';
  return '10-12';
}

async function main() {
  console.log('🌱 شروع تهیه داده‌های اولیه...');

  // ─── تنظیمات ───
  const settings: Record<string, string> = {
    schoolName: 'مکتب خصوصی نداالقلم',
    province: 'بدخشان',
    district: 'بهارک',
    authority: 'آمریت معارف بهارک',
    academicYear: '1404',
    directorName: 'حسام الدین سیدی',
    directorPhone: '0791680632',
    directorEmail: 'hasamsayedi0987@gmail.com',
    maxWritten: '40',
    maxOral: '20',
    maxHomework: '20',
    maxActivity: '20',
    resultNote: 'هر شاگرد که در یک یا چند مضمون نمرهٔ کمتر از ۵۰ بگیرد، تکرار صنف می‌گردد.',
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  // ─── صنف‌ها ───
  for (let g = 1; g <= 12; g++) {
    await db.class.upsert({
      where: { id: `class-${g}` },
      update: {},
      create: { id: `class-${g}`, grade: g, name: gradeNames[g - 1] },
    });
  }

  // ─── مضامین ───
  const allSubjects = Array.from(new Set(Object.values(subjectsByBand).flat()));
  const subjectMap = new Map<string, string>();
  for (const name of allSubjects) {
    const s = await db.subject.upsert({ where: { id: `subj-${name}` }, update: {}, create: { id: `subj-${name}`, name } });
    subjectMap.set(name, s.id);
  }

  // ─── معلمان نمونه ───
  const teachers = [
    { id: 'tch-1', name: 'حسام الدین سیدی', fatherName: 'عبدالرحمن', position: 'مدیر', phone: '0791680632', education: 'لیسانس کمپیوتر ساینس' },
    { id: 'tch-2', name: 'عبدالبصیر نظری', fatherName: 'محمدنظیر', position: 'سرمعلم', phone: '0790123456', education: 'لیسانس تعلیم و تربیت' },
    { id: 'tch-3', name: 'فاطمه احمدی', fatherName: 'محمد', position: 'معلم', phone: '0770123456', education: 'لیسانس ادبیات دری' },
    { id: 'tch-4', name: 'محمد یوسف رحیمی', fatherName: 'احمد', position: 'معلم', phone: '0770987654', education: 'لیسانس ریاضیات' },
    { id: 'tch-5', name: 'زینب کریمی', fatherName: 'نورمحمد', position: 'معلم', phone: '0770555666', education: 'لیسانس علوم' },
    { id: 'tch-6', name: 'علی جان نظربیک', fatherName: 'قادر', position: 'ملازم', phone: '0770333444', education: 'دیپلم' },
    { id: 'tch-7', name: 'خدیجه صادقی', fatherName: 'کریم', position: 'کتابخانه‌دار', phone: '0770222333', education: 'دیپلم' },
  ];
  for (const t of teachers) {
    await db.teacher.upsert({ where: { id: t.id }, update: {}, create: { ...t, hireDate: '1402/1/1', active: true } });
  }

  // ─── شاگردان نمونه (صنف هفتم) ───
  const demoStudents = [
    { id: 'std-1', firstName: 'احمد', lastName: 'سیدی', fatherName: 'محمدنور', gender: 'M', rollNo: 1 },
    { id: 'std-2', firstName: 'مریم', lastName: 'احمدی', fatherName: 'عبدالله', gender: 'F', rollNo: 2 },
    { id: 'std-3', firstName: 'عبدالرحمن', lastName: 'کریمی', fatherName: 'جلیل', gender: 'M', rollNo: 3 },
    { id: 'std-4', firstName: 'فاطمه', lastName: 'نوری', fatherName: 'حبیب', gender: 'F', rollNo: 4 },
    { id: 'std-5', firstName: 'یوسف', lastName: 'رحیمی', fatherName: 'باقر', gender: 'M', rollNo: 5 },
  ];
  for (const s of demoStudents) {
    await db.student.upsert({
      where: { id: s.id },
      update: {},
      create: {
        ...s, grandFather: 'محمد', classId: 'class-7', status: 'ACTIVE',
        enrolledYear: '1404', guardianName: `سرپرست ${s.firstName}`, guardianPhone: '0790111222',
      },
    });
  }

  // ─── کاربران ───
  const users = [
    { username: 'admin', password: 'admin123', name: 'حسام الدین سیدی', role: 'ADMIN', teacherId: 'tch-1', studentId: null as string | null },
    { username: 'sarallam', password: '12345678', name: 'عبدالبصیر نظری', role: 'HEADTEACHER', teacherId: 'tch-2', studentId: null as string | null },
    { username: 'teacher', password: '12345678', name: 'فاطمه احمدی', role: 'TEACHER', teacherId: 'tch-3', studentId: null as string | null },
    { username: 'staff', password: '12345678', name: 'علی جان نظربیک', role: 'STAFF', teacherId: 'tch-6', studentId: null as string | null },
    { username: 'library', password: '12345678', name: 'خدیجه صادقی', role: 'LIBRARIAN', teacherId: 'tch-7', studentId: null as string | null },
    { username: 'student', password: '12345678', name: 'احمد سیدی (شاگرد نمونه)', role: 'STUDENT', teacherId: null as string | null, studentId: 'std-1' },
    { username: 'parent', password: '12345678', name: 'سرپرست احمد سیدی', role: 'GUARDIAN', teacherId: null as string | null, studentId: 'std-1' },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, password: hashPassword(u.password), active: true },
    });
  }

  // ─── تقسیم مضامین برای صنف هفتم ───
  const band79 = subjectsByBand['7-9'];
  const assign: Array<[string, string | null]> = [
    ['قرآن کریم', 'tch-2'], ['دینیات', 'tch-2'], ['دری', 'tch-3'], ['پشتو', 'tch-3'],
    ['ریاضیات', 'tch-4'], ['علوم', 'tch-5'], ['انگلیسی', 'tch-4'], ['جغرافیه', 'tch-3'],
    ['تاریخ', 'tch-3'], ['زیست‌شناسی', 'tch-5'], ['فزیک', 'tch-5'], ['کیمیا', 'tch-5'],
  ];
  for (const [subjName, teacherId] of assign) {
    const subjectId = subjectMap.get(subjName)!;
    await db.classSubject.upsert({
      where: { classId_subjectId: { classId: 'class-7', subjectId } },
      update: { teacherId },
      create: { classId: 'class-7', subjectId, teacherId },
    });
  }
  // نگران صنف هفتم
  await db.class.update({ where: { id: 'class-7' }, data: { supervisorId: 'tch-2' } });

  // ─── کتاب‌های نمونه ───
  const books = [
    { id: 'bk-1', title: 'رسالهٔ تعلیم و تربیت', author: 'جان دیوی', category: 'تعلیم و تربیت', copies: 3, available: 3, shelfNo: 'A-1' },
    { id: 'bk-2', title: 'ریاضیات صنف هفتم', author: 'وزارت معارف', category: 'کتاب درسی', copies: 10, available: 8, shelfNo: 'B-2' },
    { id: 'bk-3', title: 'دری صنف ششم', author: 'وزارت معارف', category: 'کتاب درسی', copies: 10, available: 10, shelfNo: 'B-3' },
    { id: 'bk-4', title: 'تاریخ بدخشان', author: 'میرزا سنگ محمد', category: 'تاریخ', copies: 2, available: 2, shelfNo: 'C-1' },
    { id: 'bk-5', title: 'انگلیسی برای مبتدیان', author: 'Longman', category: 'زبان', copies: 5, available: 4, shelfNo: 'D-1' },
  ];
  for (const b of books) {
    await db.book.upsert({ where: { id: b.id }, update: {}, create: b });
  }

  console.log('✅ داده‌های اولیه ثبت شد');
  console.log('👤 مدیر: admin / admin123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
