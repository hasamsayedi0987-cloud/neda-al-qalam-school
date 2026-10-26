/**
 * ماتریس دسترسی بخش‌ها — مشترک بین سرور و کلاینت
 *
 * مدیر می‌تواند برای هر کاربر دسترسی هر بخش را محدود، فعال یا غیرفعال کند (رونویسی نقش).
 * پیش‌فرض هر بخش بر اساس نقش کاربر تعیین می‌شود؛ JSON perms کاربر روی آن رونویسی می‌گذارد.
 * این فایل نباید وابستگی سروری داشته باشد — در API و رابط کاربری هر دو استفاده می‌شود.
 */

export const ALL_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] as const;

export interface SectionDef {
  label: string;
  roles: readonly string[];
  /** آیا مدیر می‌تواند این بخش را برای کاربران فعال/غیرفعال کند؟ */
  manageable: boolean;
  /** توضیح کوتاه برای نمایش در دیالوگ دسترسی‌ها */
  hint?: string;
}

export const SECTIONS: Record<string, SectionDef> = {
  dashboard: {
    label: 'خانه / داشبورد',
    roles: ALL_ROLES,
    manageable: false,
  },
  students: {
    label: 'شاگردان',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'],
    manageable: true,
    hint: 'ثبت، ویرایش و مشاهدهٔ شاگردان (معلم فقط شاگردان صنف‌های خود را می‌بیند)',
  },
  teachers: {
    label: 'معلمان و کارمندان',
    roles: ['ADMIN', 'HEADTEACHER'],
    manageable: true,
  },
  classes: {
    label: 'صنف‌ها و تقسیم مضامین',
    roles: ['ADMIN', 'HEADTEACHER'],
    manageable: true,
  },
  subjects: {
    label: 'مضامین',
    roles: ['ADMIN', 'HEADTEACHER'],
    manageable: true,
  },
  attendance: {
    label: 'حاضری یومیه',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF'],
    manageable: true,
  },
  activities: {
    label: 'فعالیت شاگردان',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN'],
    manageable: true,
  },
  grades: {
    label: 'ثبت نمرات',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'],
    manageable: true,
    hint: 'ثبت و ویرایش نمرات (معلم فقط مضامین سپرده‌شده به خود)',
  },
  finance: {
    label: 'مالی و فیس',
    roles: ['ADMIN', 'HEADTEACHER'],
    manageable: true,
    hint: 'ثبت پرداخت‌های فیس، مجموع‌ها و هشدار تأخیر — دسترسی اصلی با مدیر',
  },
  messages: {
    label: 'ارتباطات و پیام‌ها',
    roles: ALL_ROLES,
    manageable: true,
    hint: 'پیام مستقیم و اعلان همگانی بین مدیر، معلم، شاگرد و والد',
  },
  results: {
    label: 'جدول نتایج و کارنامه',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN'],
    manageable: true,
  },
  certificates: {
    label: 'تقدیرنامه‌ساز',
    roles: ['ADMIN', 'HEADTEACHER', 'TEACHER'],
    manageable: true,
  },
  customs: {
    label: 'بخش‌های دلخواه',
    roles: ['ADMIN'],
    manageable: true,
  },
  library: {
    label: 'کتابخانه',
    roles: ['ADMIN', 'LIBRARIAN', 'HEADTEACHER'],
    manageable: true,
  },
  users: {
    label: 'کاربران و دسترسی‌ها',
    roles: ['ADMIN'],
    manageable: false, // همیشه انحصار مدیر
  },
  tasks: {
    label: 'وظایف کارمندان',
    roles: ['ADMIN', 'HEADTEACHER', 'STAFF', 'TEACHER'],
    manageable: true,
  },
  settings: {
    label: 'تنظیمات و پشتیبان‌گیری',
    roles: ALL_ROLES,
    manageable: false, // شامل تغییر رمز عبور خود کاربر — همیشه باز
  },
  about: {
    label: 'دربارهٔ اپ و سازنده',
    roles: ALL_ROLES,
    manageable: false,
  },
};

/** کلیدهای قابل کنترل توسط مدیر برای هر کاربر */
export const MANAGEABLE_SECTIONS = Object.keys(SECTIONS).filter((k) => SECTIONS[k].manageable);

export interface PermsUser {
  role: string;
  perms?: string | null; // JSON ذخیره‌شده در User.perms
}

/** خواندن و اعتبارسنجی JSON دسترسی‌های کاربر */
export function parsePerms(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SECTIONS[k] && typeof v === 'boolean') clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

/**
 * آیا این کاربر به این بخش دسترسی دارد؟
 * ۱) مدیر همیشه همه را دارد  ۲) رونویسی perms  ۳) پیش‌فرض نقش
 */
export function sectionAllowed(user: PermsUser, key: string): boolean {
  if (user.role === 'ADMIN') return true;
  const def = SECTIONS[key];
  if (!def) return false;
  const overrides = parsePerms(user.perms);
  const override = overrides[key];
  if (typeof override === 'boolean') return override;
  return def.roles.includes(user.role);
}

/** فهرست بخش‌های قابل‌مشاهدهٔ کاربر (برای منوی اصلی) */
export function visibleSections(user: PermsUser): string[] {
  return Object.keys(SECTIONS).filter((k) => sectionAllowed(user, k));
}
