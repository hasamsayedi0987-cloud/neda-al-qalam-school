/**
 * محدودهٔ اختیار معلم — صنف‌هایی که معلم در آنها تدریس می‌کند یا نگران آن صنف است
 * و مجوزهایی که مدیر برای معلمان تعیین کرده است
 */
import { db } from '@/lib/db';

/** همهٔ صنف‌هایی که این معلم در آنها مضمون تدریس می‌کند یا نگران صنف است */
export async function teacherClassIds(teacherId: string): Promise<string[]> {
  if (!teacherId) return [];
  const [taught, supervised] = await Promise.all([
    db.classSubject.findMany({ where: { teacherId }, select: { classId: true } }),
    db.class.findMany({ where: { supervisorId: teacherId }, select: { id: true } }),
  ]);
  return Array.from(new Set([...taught.map((t) => t.classId), ...supervised.map((s) => s.id)]));
}

/** آیا این «مضمون صنف» به این معلم سپرده شده است؟ */
export async function ownsClassSubject(teacherId: string, classSubjectId: string): Promise<boolean> {
  if (!teacherId || !classSubjectId) return false;
  const cs = await db.classSubject.findUnique({
    where: { id: classSubjectId },
    select: { teacherId: true },
  });
  return !!cs && cs.teacherId === teacherId;
}

/** آیا این شاگرد در یکی از صنف‌های تحت اختیار معلم است؟ */
export async function studentInTeacherScope(
  teacherId: string,
  studentId: string,
): Promise<boolean> {
  const ids = await teacherClassIds(teacherId);
  if (ids.length === 0) return false;
  const count = await db.student.count({ where: { id: studentId, classId: { in: ids } } });
  return count > 0;
}

export interface TeacherPerms {
  grades: boolean; // ثبت/ویرایش نمرات مضامین خود
  gradeDelete: boolean; // حذف نمرات ثبت‌شده
  students: boolean; // ثبت/ویرایش شاگردان صنف‌های خود
}

const PERM_KEYS = ['permTeacherGrades', 'permTeacherGradeDelete', 'permTeacherStudents'] as const;

/** مجوزهای معلمان از تنظیمات — پیش‌فرض: همه مجاز (مدیر می‌تواند محدود کند) */
export async function getTeacherPerms(): Promise<TeacherPerms> {
  const settings = await db.setting.findMany({ where: { key: { in: [...PERM_KEYS] } } });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  return {
    grades: (map.get('permTeacherGrades') ?? '1') === '1',
    gradeDelete: (map.get('permTeacherGradeDelete') ?? '1') === '1',
    students: (map.get('permTeacherStudents') ?? '1') === '1',
  };
}
