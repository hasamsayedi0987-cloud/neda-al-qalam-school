/**
 * منطق نمرات و نتایج — مکتب خصوصی نداالقلم
 * نظام رسمی وزارت معارف افغانستان:
 *  • چهارو‌نیم‌ماهه از ۴۰ (تحریری ۲۵ + تقریری ۱۵) + سالانه از ۶۰ (تحریری ۴۰ + تقریری ۲۰) = ۱۰۰
 *  • حد نصاب کامیابی هر مضمون: ۴۰ از ۱۰۰ — مادهٔ ۵۳ لایحهٔ مکاتب ثانوی
 *  • ارتقا: اوسط مجموع نمرات ≥ ۵۰٪ + همهٔ مضامین ≥ ۴۰ — مشروط: اوسط ≥ ۵۰٪ اما ۱ تا ۳ مضمون کمتر از ۴۰
 *  • محروم از امتحان: حاضری سالانه کمتر از ۷۵٪
 *  • مکتسبه‌ها به اساس اوسط مجموع نمرات: الف ≥۹۰٪ | ب ≥۷۵٪ | ج ≥۶۰٪ | د ≥۵۰٪ | هـ <۵۰٪
 *    (لایحهٔ درجه‌بندی شاگردان ۱۳۹۸ + جداول نتایج معتبر مکاتب افغانستان)
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

/* ───────── نسخهٔ ۳.۱.۰ — ساختار نمره‌دهی مکاتب افغانستان ─────────
 * نمرهٔ چهارو‌نیم‌ماهه: حداکثر ۴۰ | نمرهٔ سالانه: حداکثر ۶۰ | مجموع: ۱۰۰
 * حد نصاب کامیابی: ۴۰ از ۱۰۰ (لایحهٔ مکاتب ثانوی، مادهٔ ۲۷)
 * همهٔ این سقف‌ها از تنظیمات قابل تغییر است (midtermMax / annualMax / passMark). */

export interface PeriodMax {
  MIDTERM: number;
  ANNUAL: number;
}

export const DEFAULT_PERIOD_MAX: PeriodMax = { MIDTERM: 40, ANNUAL: 60 };
export const DEFAULT_PASS_MARK = 40;

/** ترکیب رسمی اجزای هر دوره — لایحهٔ مکاتب ثانوی (مواضع ۱۹-۳۰):
 *  چهارو‌نیم‌ماهه: تحریری ۲۵ + تقریری ۱۵ | سالانه: تحریری ۴۰ + تقریری ۲۰ */
export const DEFAULT_PERIOD_COMPONENTS: Record<'MIDTERM' | 'ANNUAL', GradeWeights> = {
  MIDTERM: { maxWritten: 25, maxOral: 15, maxHomework: 0, maxActivity: 0 },
  ANNUAL: { maxWritten: 40, maxOral: 20, maxHomework: 0, maxActivity: 0 },
};

export type PeriodComponentsMap = Record<'MIDTERM' | 'ANNUAL', GradeWeights>;

/** خواندن ترکیب اجزا از تنظیمات (periodComponents JSON) — با سقف دوره متناسب می‌شود
 *  وقتی مدیر سقف دوره را عوض کند، اجزا با نسبت سقف رسمی مقیاس می‌شوند */
export function parsePeriodComponents(json: string | null | undefined, periodMax: PeriodMax): PeriodComponentsMap {
  const base: PeriodComponentsMap = {
    MIDTERM: { ...DEFAULT_PERIOD_COMPONENTS.MIDTERM },
    ANNUAL: { ...DEFAULT_PERIOD_COMPONENTS.ANNUAL },
  };
  if (json) {
    try {
      const obj = JSON.parse(json) as Partial<PeriodComponentsMap>;
      for (const p of ['MIDTERM', 'ANNUAL'] as const) {
        const v = obj[p];
        if (v && Number.isFinite(Number(v.maxWritten))) {
          const oralRaw = Number((v as { oral?: number }).oral ?? 0);
          base[p] = {
            maxWritten: Math.max(0, Number(v.maxWritten)),
            maxOral: Math.max(0, Number.isFinite(oralRaw) && oralRaw > 0 ? oralRaw : Number(v.maxOral ?? 0)),
            maxHomework: Math.max(0, Number(v.maxHomework ?? (v as { homework?: number }).homework ?? 0)),
            maxActivity: Math.max(0, Number(v.maxActivity ?? (v as { activity?: number }).activity ?? 0)),
          };
        }
      }
    } catch {
      /* تنظیمات نامعتبر — پیش‌فرض رسمی */
    }
  }
  // متناسب‌سازی با سقف دوره (اگر مدیر سقف را از ۴۰/۶۰ تغییر داده باشد)
  const scaleMid = periodMax.MIDTERM !== 40 ? periodMax.MIDTERM / 40 : 1;
  const scaleAnn = periodMax.ANNUAL !== 60 ? periodMax.ANNUAL / 60 : 1;
  const scaleMap = { MIDTERM: scaleMid, ANNUAL: scaleAnn } as const;
  for (const p of ['MIDTERM', 'ANNUAL'] as const) {
    if (scaleMap[p] !== 1) {
      const s = round2(scaleMap[p]);
      base[p] = {
        maxWritten: round2(base[p].maxWritten * s),
        maxOral: round2(base[p].maxOral * s),
        maxHomework: round2(base[p].maxHomework * s),
        maxActivity: round2(base[p].maxActivity * s),
      };
    }
  }
  return base;
}

/** سقف اجزای یک دوره — نسبت هر جزء (از تنظیمات، جمعاً از ۱۰۰) × سقف دورهٔ همان امتحان
 *  مثال پیش‌فرض: چهارو‌نیم‌ماهه ۴۰ → تحریری ۱۶، تقریری ۸، کارخانگی ۸، فعالیت ۸ */
export function componentCapsFor(periodMax: number, weights: GradeWeights): GradeWeights {
  const sum = Math.max(
    1,
    (weights.maxWritten || 0) + (weights.maxOral || 0) + (weights.maxHomework || 0) + (weights.maxActivity || 0),
  );
  const scale = (v: number) => Math.round(((periodMax * v) / sum) * 100) / 100;
  return {
    maxWritten: scale(weights.maxWritten || 0),
    maxOral: scale(weights.maxOral || 0),
    maxHomework: scale(weights.maxHomework || 0),
    maxActivity: scale(weights.maxActivity || 0),
  };
}

/** هم‌ترازسازی نمرهٔ یک دوره با سقف آن — داده‌های قدیمی (از ۱۰۰) به‌صورت متناسب تبدیل می‌شوند */
export function normalizePeriodScore(total: number | null | undefined, periodMax: number): number | null {
  if (total == null || !Number.isFinite(Number(total))) return null;
  const t = Number(total);
  if (t <= periodMax) return round2(t);
  return round2((t * periodMax) / 100);
}

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

/** نمرهٔ نهائی مضمون = نمرهٔ چهارو‌نیم‌ماهه + نمرهٔ سالانه (از ۱۰۰) — ساختار مکاتب افغانستان
 *  (پیشتر میانگین سادهٔ دو دوره بود که با نظام ۴۰+۶۰ نمی‌خواند) */
export function finalScore(
  midterm: number | null,
  annual: number | null,
  periodMax: PeriodMax = DEFAULT_PERIOD_MAX,
): number | null {
  if (midterm == null && annual == null) return null;
  const mid = normalizePeriodScore(midterm, periodMax.MIDTERM);
  const ann = normalizePeriodScore(annual, periodMax.ANNUAL);
  const values = [mid, ann].filter((v): v is number => v != null);
  return round2(values.reduce((a, b) => a + b, 0));
}

/** مکتسبه (حرف) بر اساس نمرهٔ نهائی — باندهای رسمی وزارت معارف
 *  الف ≥۹۰٪ | ب ≥۷۵٪ | ج ≥۶۰٪ | د ≥۵۰٪ | هـ <۵۰٪ — قابل تنظیم توسط مدیر */
export interface GradeScaleEntry {
  label: string;
  min: number; // حداقل درصد برای این مکتسبه (نزولی مرتب می‌شود)
}

export const DEFAULT_SCALE: GradeScaleEntry[] = [
  { label: 'الف', min: 90 },
  { label: 'ب', min: 75 },
  { label: 'ج', min: 60 },
  { label: 'د', min: 50 },
  { label: 'هـ', min: 0 },
];

/** خواندن و اعتبارسنجی مقیاس از تنظیمات */
export function parseScale(json: string | null | undefined): GradeScaleEntry[] {
  if (!json) return DEFAULT_SCALE;
  try {
    const arr = JSON.parse(json) as GradeScaleEntry[];
    if (!Array.isArray(arr) || arr.length < 2) return DEFAULT_SCALE;
    const clean = arr
      .filter((e) => e && typeof e.label === 'string' && Number.isFinite(Number(e.min)))
      .map((e) => ({ label: e.label, min: Math.max(0, Math.min(100, Number(e.min))) }))
      .sort((a, b) => b.min - a.min);
    return clean.length >= 2 ? clean : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

export function letterGrade(score: number | null, scale: GradeScaleEntry[] = DEFAULT_SCALE): string {
  if (score == null) return '—';
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const e of sorted) {
    if (score >= e.min) return e.label;
  }
  return sorted[sorted.length - 1]?.label || 'تکرار';
}

/** برچسب بازهٔ مقیاس برای نمایش (مثال: الف ۸۵-۱۰۰) */
export function scaleRangesText(scale: GradeScaleEntry[] = DEFAULT_SCALE): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.map((e, i) => {
    const top = i === 0 ? 100 : sorted[i - 1].min - 1;
    return `${e.label}: ${toPersianDigitsSafe(e.min)}-${toPersianDigitsSafe(top)}`;
  }).join(' | ');
}

function toPersianDigitsSafe(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** رنگ پیشنهادی برای مکتسبه — باندهای رسمی ۹۰/۷۵/۶۰/۵۰ */
export function letterColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 90) return 'text-emerald-700 dark:text-emerald-300 font-bold';
  if (score >= 75) return 'text-green-700 dark:text-green-300 font-bold';
  if (score >= 60) return 'text-teal-700 dark:text-teal-300 font-bold';
  if (score >= 50) return 'text-amber-700 dark:text-amber-300 font-bold';
  return 'text-red-700 dark:text-red-300 font-bold';
}

export const RESULT_PROMOTED = 'ارتقا صنف';
export const RESULT_REPEAT = 'تکرار صنف';
export const RESULT_INCOMPLETE = 'ناقص';

export interface ResultLabels {
  passMark: number; // حد نصاب کامیابی هر مضمون (پیش‌فرض ۴۰ از ۱۰۰ — مادهٔ ۵۳)
  minAverage: number; // حداقل اوسط مجموع نمرات برای ارتقا (پیش‌فرض ۵۰٪ — مادهٔ ۵۹)
  passLabel: string; // کامیاب
  failLabel: string; // ناکام
}

export const DEFAULT_RESULT_LABELS: ResultLabels = {
  passMark: DEFAULT_PASS_MARK,
  minAverage: 50,
  passLabel: 'کامیاب',
  failLabel: 'ناکام',
};

export const RESULT_CONDITIONAL = 'مشروط';
export const RESULT_DEPRIVED = 'محروم'; // حاضری سالانه کمتر از حد نصاب
export const DEFAULT_ATTENDANCE_MIN = 75; // ۷۵٪ حاضری سالانه — لایحهٔ مکاتب ثانوی

/** نتیجهٔ یک مضمون — کامیاب یا ناکام بر اساس حد نصاب قابل‌تغییر از تنظیمات */
export function subjectResult(
  final: number | null,
  labels: ResultLabels = DEFAULT_RESULT_LABELS,
): string | null {
  if (final == null) return null;
  return final >= labels.passMark ? labels.passLabel : labels.failLabel;
}

/** واجدیت امتحان بر اساس حاضری سالانه — کمتر از ۷۵٪ (قابل‌تغییر) → محروم */
export function examEligibility(
  attendanceRate: number | null,
  attendanceMin: number = DEFAULT_ATTENDANCE_MIN,
): string | null {
  if (attendanceRate == null) return null;
  return attendanceRate < attendanceMin ? RESULT_DEPRIVED : null;
}

/** نتیجهٔ کل شاگرد — قوانین رسمی وزارت معارف (لایحهٔ مکاتب ثانوی، مواد ۵۳ و ۵۹):
 *  • اوسط مجموع نمرات ≥ حد نصاب اوسط (۵۰٪) و بدون مضمون ناکام → کامیاب
 *  • اوسط ≥ حد نصاب اما ناکامی در ۱ تا ۳ مضمون → مشروط (امتحان مشروطی — چانس دوم از ۱۰۰)
 *  • اوسط < حد نصاب یا ناکامی در بیش از ۳ مضمون → ناکام (تکرار صنف) */
export function overallResult(
  finals: Array<number | null>,
  scale: GradeScaleEntry[] = DEFAULT_SCALE,
  labels: ResultLabels = DEFAULT_RESULT_LABELS,
): {
  result: string;
  failed: number;
} {
  const valid = finals.filter((f) => f != null) as number[];
  if (valid.length === 0) return { result: RESULT_INCOMPLETE, failed: 0 };
  const failed = valid.filter((f) => f < labels.passMark).length;
  const average = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (average < labels.minAverage) return { result: labels.failLabel, failed };
  if (failed === 0) return { result: labels.passLabel, failed: 0 };
  if (failed <= 3) return { result: RESULT_CONDITIONAL, failed };
  return { result: labels.failLabel, failed };
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
