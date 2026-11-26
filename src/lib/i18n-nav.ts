/**
 * ترجمهٔ عنوان بخش‌های اصلی — نسخهٔ ۳.۳.۰ (دری پیش‌فرض، پشتو و انگلیسی)
 * در تنظیمات، زبان رابط انتخاب می‌شود؛ برچسب‌های منو بر اساس این جدول ترجمه می‌شوند.
 */

export type AppLocale = 'dr' | 'ps' | 'en';

export const APP_LOCALES: { code: AppLocale; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'dr', label: 'دری', dir: 'rtl' },
  { code: 'ps', label: 'پشتو', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
];

export function localeOf(lang: string | null | undefined): AppLocale {
  return lang === 'ps' || lang === 'en' ? lang : 'dr';
}

export function dirOfLocale(lang: AppLocale): 'rtl' | 'ltr' {
  return lang === 'en' ? 'ltr' : 'rtl';
}

/** برچسب بخش‌ها به پشتو و انگلیسی — کلیدها همان SECTIONS اند */
const NAV_PS: Record<string, string> = {
  dashboard: 'کور / ډاشبورډ',
  students: 'زده‌کوونکي',
  teachers: 'ښوونکي او کارکوونکي',
  classes: 'ټولګي او مضامین',
  subjects: 'مضامین',
  attendance: 'ورځنی حاضري',
  gate: 'د دروازې ننوتل/وتل (QR)',
  activities: 'د زده‌کوونکو فعاليتونه',
  grades: 'نمرې ثبتول',
  finance: 'مالي او فیس',
  transport: 'ترانسپورټ',
  store: 'کتابونه او يونيفورم',
  treasury: 'خزانه او پيسې سپارل',
  expenses: 'لګښتونه او معاشونه',
  sms: 'د مور او پلار پېغامونه (SMS)',
  messages: 'اړیکي او پېغامونه',
  results: 'د نتیجو جدول',
  certificates: 'د تعریف لیک',
  customs: 'اختياري برخې',
  library: 'کتابتون',
  users: 'کاروونکي او لارښودنه',
  tasks: 'د کارکوونکو دندې',
  settings: 'امنیتي تنظیمات',
  about: 'د اپ پېژندنه',
};

const NAV_EN: Record<string, string> = {
  dashboard: 'Home / Dashboard',
  students: 'Students',
  teachers: 'Teachers & Staff',
  classes: 'Classes & Subjects',
  subjects: 'Subjects',
  attendance: 'Daily Attendance',
  gate: 'Gate Entry/Exit (QR)',
  activities: 'Student Activities',
  grades: 'Grade Entry',
  finance: 'Finance & Fees',
  transport: 'Transport',
  store: 'Books & Uniform Store',
  treasury: 'Treasury & Handover',
  expenses: 'Expenses & Salaries',
  sms: 'Parent SMS',
  messages: 'Messages',
  results: 'Results & Report Cards',
  certificates: 'Certificates',
  customs: 'Custom Sections',
  library: 'Library',
  users: 'Users & Access',
  tasks: 'Staff Tasks',
  settings: 'Settings & Backup',
  about: 'About',
};

const COMMON_PS: Record<string, string> = {
  save: 'ساتل', cancel: 'لغوه کول', delete: 'ښکته کول', edit: 'سمول',
  add: 'زیاتول', search: 'لټول', filter: 'فلټر', logout: 'وتل', language: 'ژبه',
};

const COMMON_EN: Record<string, string> = {
  save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
  add: 'Add', search: 'Search', filter: 'Filter', logout: 'Logout', language: 'Language',
};

export const NAV_I18N: Record<Exclude<AppLocale, 'dr'>, Record<string, string>> = { ps: NAV_PS, en: NAV_EN };
export const COMMON_I18N: Record<Exclude<AppLocale, 'dr'>, Record<string, string>> = { ps: COMMON_PS, en: COMMON_EN };

/** برچسب بخش — برای دری برچسب اصلی برمی‌گردد، برای پشتو/انگلیسی ترجمه (با fallback دری) */
export function navLabel(key: string, lang: AppLocale, fallback: string): string {
  if (lang === 'dr') return fallback;
  return NAV_I18N[lang]?.[key] || fallback;
}

export function commonText(key: string, lang: AppLocale, fallback: string): string {
  if (lang === 'dr') return fallback;
  return COMMON_I18N[lang]?.[key] || fallback;
}
