/**
 * منطق نمرات و نتایج — مکتب خصوصی نداالقلم
 * مقیاس: ۹۰-۱۰۰ = الف | ۸۰-۹۰ = ب | ۷۰-۸۰ = ج | ۶۰-۷۰ = د | ۵۰-۶۰ = هـ | زیر ۵۰ = تکرار صنف
 */

export interface GradeWeights {
  maxWritten: number;
  maxOral: number;
  maxHomework: number;
  maxActivity: number;
}

export const DEFAULT_WEIGHTS: GradeWeights = {
  maxWritten: 40,
  maxOral: 20,
  maxHomework: 20,
  maxActivity: 20,
};

export const PERIODS = { MIDTERM: 'MIDTERM', ANNUAL: 'ANNUAL' } as const;
export type Period = (typeof PERIODS)[keyof typeof PERIODS];

export const PERIOD_LABELS: Record<string, string> = {
  MIDTERM: 'چهارو‌نیم‌ماهه',
  ANNUAL: 'سالانه',
  FINAL: 'نمرهٔ نهائی',
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function componentTotal(g: {
  written?: number | null;
  oral?: number | null;
  homework?: number | null;
  activity?: number | null;
}): number {
  return round2(
    (g.written || 0) + (g.oral || 0) + (g.homework || 0) + (g.activity || 0),
  );
}

/** نمرهٔ نهائی مضمون = میانگین چهارو‌نیم‌ماهه و سالانه */
export function finalScore(midterm: number | null, annual: number | null): number | null {
  if (midterm == null && annual == null) return null;
  const values = [midterm, annual].filter((v): v is number => v != null);
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** مکتسبه (حرف) بر اساس نمرهٔ نهائی */
export function letterGrade(score: number | null): string {
  if (score == null) return '—';
  if (score >= 90) return 'الف';
  if (score >= 80) return 'ب';
  if (score >= 70) return 'ج';
  if (score >= 60) return 'د';
  if (score >= 50) return 'هـ';
  return 'تکرار';
}

/** رنگ پیشنهادی برای مکتسبه */
export function letterColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 90) return 'text-emerald-700 font-bold';
  if (score >= 80) return 'text-green-700 font-bold';
  if (score >= 70) return 'text-teal-700 font-bold';
  if (score >= 60) return 'text-amber-700 font-bold';
  if (score >= 50) return 'text-orange-700 font-bold';
  return 'text-red-700 font-bold';
}

export const RESULT_PROMOTED = 'ارتقا صنف';
export const RESULT_REPEAT = 'تکرار صنف';
export const RESULT_INCOMPLETE = 'ناقص';

/** نتیجهٔ کل شاگرد بر اساس نمرات نهائی همهٔ مضامین */
export function overallResult(finals: Array<number | null>): {
  result: string;
  failed: number;
} {
  const valid = finals.filter((f) => f != null) as number[];
  if (valid.length === 0) return { result: RESULT_INCOMPLETE, failed: 0 };
  const failed = valid.filter((f) => f < 50).length;
  if (failed === 0) return { result: RESULT_PROMOTED, failed: 0 };
  return { result: RESULT_REPEAT, failed };
}

/** رتبه‌بندی شاگردان صنف بر اساس اوسط */
export function computeRanks(
  rows: Array<{ studentId: string; average: number | null }>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const sorted = rows
    .filter((r) => r.average != null)
    .sort((a, b) => (b.average as number) - (a.average as number));
  let lastAvg: number | null = null;
  let lastRank = 0;
  sorted.forEach((row, i) => {
    const avg = round2(row.average as number);
    const rank = avg === lastAvg ? lastRank : i + 1;
    ranks.set(row.studentId, rank);
    lastAvg = avg;
    lastRank = rank;
  });
  return ranks;
}

/** اعتبارسنجی نمرهٔ هر جزء در برابر سقف مجاز */
export function clampComponent(
  value: number | null | undefined,
  max: number,
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const v = Math.max(0, Math.min(max, Number(value)));
  return round2(v);
}

export const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غایب',
  SICK: 'مریض',
  LEAVE: 'رخصت',
};

export const ATTENDANCE_COLORS: Record<string, string> = {
  PRESENT: 'bg-emerald-600 text-white',
  ABSENT: 'bg-red-600 text-white',
  SICK: 'bg-amber-500 text-white',
  LEAVE: 'bg-sky-600 text-white',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  HOMEWORK: 'کارخانگی',
  BEHAVIOR: 'رفتار',
  PARTICIPATION: 'شرکت در درس',
  OTHER: 'دیگر',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدیر',
  HEADTEACHER: 'سرمعلم',
  TEACHER: 'معلم',
  STUDENT: 'شاگرد',
  GUARDIAN: 'سرپرست/والد',
  STAFF: 'ملازم/کارمند',
  LIBRARIAN: 'کتابخانه',
};

export function gradeName(grade: number): string {
  const names = [
    'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم',
    'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم',
  ];
  return `صنف ${names[grade - 1] || grade}`;
}
