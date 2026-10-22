/** انواع مشترک سمت کلاینت */

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: string;
  phone: string | null;
  teacherId: string | null;
  studentId: string | null;
  perms?: string | null; // JSON دسترسی بخش‌ها (رونویسی نقش)
}

export interface ClassInfo {
  id: string;
  grade: number;
  name: string;
  supervisorId: string | null;
  supervisorName?: string | null;
  actingSupervisorId?: string | null;
  actingSupervisorName?: string | null;
  studentCount?: number;
  classSubjects?: ClassSubjectInfo[]; // مضامین سپرده‌شدهٔ صنف
}

export interface SubjectInfo {
  id: string;
  name: string;
}

export interface ClassSubjectInfo {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  subject: SubjectInfo;
  teacher?: { id: string; name: string } | null;
}

export interface StudentInfo {
  id: string;
  firstName: string;
  lastName: string | null;
  fatherName: string;
  grandFather?: string | null;
  gender: string;
  birthDate?: string | null;
  idNumber?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  address?: string | null;
  photo?: string | null;
  classId?: string | null;
  rollNo?: number | null;
  status: string;
  enrolledYear?: string | null;
  className?: string | null;
}

export interface TeacherInfo {
  id: string;
  name: string;
  fatherName?: string | null;
  position: string;
  phone?: string | null;
  education?: string | null;
  hireDate?: string | null;
  active: boolean;
  username?: string | null;
  userActive?: boolean | null;
  assignments?: Array<{ className: string; subjectName: string }>; // مضامین سپرده‌شده
}

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  phone?: string | null;
  teacherId?: string | null;
  studentId?: string | null;
  perms?: string | null; // JSON دسترسی بخش‌ها
  studentName?: string | null;
}

export interface AttendanceRow {
  id?: string;
  studentId: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'SICK' | 'LEAVE';
}

export interface GradeCell {
  written?: number | null;
  oral?: number | null;
  homework?: number | null;
  activity?: number | null;
  total?: number | null;
  approved?: boolean;
  notes?: string | null;
}

export interface ActivityInfo {
  id: string;
  studentId: string;
  date: string;
  type: string;
  score?: number | null;
  note: string;
}

export interface BookInfo {
  id: string;
  title: string;
  author?: string | null;
  category?: string | null;
  copies: number;
  available: number;
  shelfNo?: string | null;
  loans?: LoanInfo[];
}

export interface LoanInfo {
  id: string;
  bookId: string;
  bookTitle?: string;
  borrowerName: string;
  borrowerType: string;
  studentId?: string | null;
  loanDate: string;
  dueDate: string;
  returnDate?: string | null;
  status: string;
}

export interface NotificationInfo {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export interface AppSettings {
  schoolName: string;
  province: string;
  district: string;
  authority: string;
  academicYear: string;
  directorName: string;
  directorPhone: string;
  directorEmail: string;
  maxWritten: string;
  maxOral: string;
  maxHomework: string;
  maxActivity: string;
  resultNote?: string;
  gradeScale?: string; // JSON: [{label,min}] — مکتسبه‌های قابل تنظیم
  aboutApp?: string; // JSON: متن دربارهٔ اپ + عکس
  aboutDev?: string; // JSON: معلومات سازنده + عکس
  permTeacherGrades?: string; // '1' | '0' — مجوز ثبت/ویرایش نمرات مضامین خود
  permTeacherGradeDelete?: string; // '1' | '0' — مجوز حذف نمرات
  permTeacherStudents?: string; // '1' | '0' — مجوز ثبت/ویرایش شاگردان صنف خود
  tagline?: string; // شعار زیر نام مکتب
  navLabels?: string; // JSON: برچسب‌های قابل‌تغییر منو {dashboard: 'خانه', ...}
}

export interface ResultsRow {
  student: StudentInfo;
  perSubject: Record<
    string,
    { midterm: number | null; annual: number | null; final: number | null; letter: string; approved: boolean }
  >;
  total: number | null;
  average: number | null;
  rank: number | null;
  result: string;
  failed: number;
}
