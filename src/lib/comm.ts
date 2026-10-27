/**
 * صلاحیت‌های ارتباطی — مشترک بین سرور و رابط کاربری (بدون وابستگی سروری)
 *
 * مدیر از پنل «صلاحیت‌های ارتباطی» برای هر نقش و هر کاربر تعیین می‌کند که:
 *  • اصلاً بتواند پیام ردوبدل کند (enabled)
 *  • پیام خصوصی/گروهی/همگانی بفرستد
 *  • به کدام نقش‌ها پیام بدهد (toRoles)
 *  • اطلاعیهٔ عمومی، پیام فوری، پیوست، ویرایش، گزارش و مودریشن داشته باشد یا نه
 *
 * روابط آموزشی (کدام معلم با کدام والد) همیشه از دیتابیس واقعی (صنف‌ها، مضامین،
 * فرزندان ثبت‌شده) تعیین می‌شود — این فایل فقط پرچم‌های تسهیل را تعریف می‌کند:
 *  • relaxParentScope: معلم بتواند به والدین خارج از صنف‌های خود پیام بدهد
 *  • relaxTeacherScope: والد بتواند به معلمان غیرمرتبط با فرزندش پیام بدهد
 *  • extraPeers: اجازهٔ ویژهٔ فردی (شناسهٔ کاربران مجاز اضافه)
 *  • blockedPeers: مسدودسازی فردی (کاربر X نتواند به کاربر Y پیام بدهد)
 */

export const COMM_ROLES = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STUDENT', 'GUARDIAN', 'STAFF', 'LIBRARIAN'] as const;

export interface CommPerms {
  enabled: boolean; // پیام‌رسانی کلاً فعال
  direct: boolean; // پیام خصوصی به افراد
  group: boolean; // پیام گروهی (چند شخص یا گروه)
  allUsers: boolean; // پیام به تمام کاربران سیستم
  toRoles: string[]; // نقش‌های مجاز هدف — ['*'] یعنی همهٔ نقش‌ها
  announce: boolean; // ایجاد اطلاعیهٔ عمومی
  urgent: boolean; // علامت‌گذاری «فوری»
  reply: boolean; // پاسخ به پیام‌ها
  attach: boolean; // ارسال فایل/عکس/سند
  seeReadStatus: boolean; // مشاهدهٔ وضعیت خوانده‌شدن پیام‌های ارسالی
  deleteOwn: boolean; // حذف پیام‌های خود
  editOwn: boolean; // ویرایش پیام‌های خود (داخل پنجرهٔ زمانی)
  moderate: boolean; // بررسی و حذف پیام‌های نامناسب دیگران
  reports: boolean; // گزارش فعالیت‌های بخش پیام‌ها
  managePolicy: boolean; // تنظیم صلاحیت‌های ارتباطی دیگران (بخش مدیریت)
  // تسهیل روابط — محدودیت اصلی همیشه از روابط واقعی دیتابیس می‌آید
  relaxParentScope: boolean; // معلم: ارتباط با والدین صنف‌های دیگر
  relaxTeacherScope: boolean; // والد: ارتباط با معلمان غیرمرتبط با فرزند
  extraPeers: string[]; // اجازهٔ ویژهٔ فردی — شناسهٔ کاربران
  blockedPeers: string[]; // مسدودسازی فردی — شناسهٔ کاربران
}

export interface CommPolicy {
  roles: Record<string, Partial<CommPerms>>;
  users: Record<string, Partial<CommPerms> & { note?: string }>;
}

/** همهٔ قابلیت‌ها با برچسب فارسی — برای پنل مدیر */
export const COMM_CAPABILITIES: Array<{ key: keyof CommPerms; label: string; hint?: string }> = [
  { key: 'enabled', label: 'پیام‌رسانی فعال', hint: 'کل قابلیت ارسال و دریافت پیام برای این نقش/کاربر' },
  { key: 'direct', label: 'پیام خصوصی', hint: 'ارسال پیام به یک یا چند شخص مشخص' },
  { key: 'group', label: 'پیام گروهی', hint: 'ارسال به چند شخص یا گروه انتخاب‌شده' },
  { key: 'allUsers', label: 'پیام به تمام کاربران', hint: 'همگانی به همهٔ کاربران سیستم' },
  { key: 'announce', label: 'اطلاعیهٔ عمومی', hint: 'ایجاد اطلاعیه و اعلان رسمی' },
  { key: 'urgent', label: 'پیام فوری', hint: 'علامت‌گذاری پیام به‌عنوان فوری' },
  { key: 'reply', label: 'پاسخ به پیام‌ها' },
  { key: 'attach', label: 'ارسال فایل و تصویر', hint: 'پیوست عکس/سند تا ۳۵۰ کیلوبایت' },
  { key: 'seeReadStatus', label: 'مشاهدهٔ وضعیت خوانده‌شدن', hint: 'رسید خواندن پیام‌های ارسالی خود' },
  { key: 'deleteOwn', label: 'حذف پیام‌های خود' },
  { key: 'editOwn', label: 'ویرایش پیام‌های خود', hint: 'تا ۳۰ دقیقه پس از ارسال و تا زمانی که خوانده نشده' },
  { key: 'moderate', label: 'مدیریت پیام‌های نامناسب', hint: 'مشاهده و حذف پیام‌های دیگران (ثبت در گزارش فعالیت)' },
  { key: 'reports', label: 'گزارش فعالیت پیام‌ها' },
  { key: 'managePolicy', label: 'تنظیم صلاحیت‌های ارتباطی', hint: 'دسترسی به پنل مدیریت ارتباطات' },
  { key: 'relaxParentScope', label: 'معلم: رفع محدودیت والدین', hint: 'ارتباط با والدین صنف‌های دیگر نیز مجاز شود' },
  { key: 'relaxTeacherScope', label: 'والد: رفع محدودیت معلمان', hint: 'ارتباط با معلمان خارج از صنف فرزند نیز مجاز شود' },
];

/** کلیدهای آرایه‌ای — جدا از سوییچ‌های بولی */
export const LIST_CAPABILITIES: Array<{ key: 'extraPeers' | 'blockedPeers'; label: string; hint: string }> = [
  { key: 'extraPeers', label: 'اجازه‌های ویژهٔ فردی', hint: 'این کاربر/نقش بتواند علاوه بر محدودیت‌های عادی به این اشخاص هم پیام بدهد' },
  { key: 'blockedPeers', label: 'اشخاص مسدودشده', hint: 'ارسال پیام به این اشخاص حتی با وجود سایر اجازه‌ها ممنوع می‌شود' },
];

const FULL: CommPerms = {
  enabled: true, direct: true, group: true, allUsers: true,
  toRoles: ['*'], announce: true, urgent: true, reply: true, attach: true,
  seeReadStatus: true, deleteOwn: true, editOwn: true, moderate: true, reports: true,
  managePolicy: true, relaxParentScope: true, relaxTeacherScope: true,
  extraPeers: [], blockedPeers: [],
};

/** پیش‌فرض هر نقش — مدیر می‌تواند هر کدام را از پنل رونویسی کند */
export const DEFAULT_ROLE_PERMS: Record<string, CommPerms> = {
  ADMIN: { ...FULL },
  HEADTEACHER: {
    ...FULL,
    allUsers: true, moderate: false, reports: true, managePolicy: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'],
  },
  TEACHER: {
    ...FULL,
    allUsers: false, announce: false, urgent: false, attach: false,
    moderate: false, reports: false, managePolicy: false,
    relaxParentScope: false, relaxTeacherScope: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'GUARDIAN', 'STUDENT'],
  },
  GUARDIAN: {
    ...FULL,
    group: false, allUsers: false, announce: false, urgent: false, attach: false,
    seeReadStatus: true, moderate: false, reports: false, managePolicy: false,
    relaxParentScope: false, relaxTeacherScope: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER'],
  },
  STUDENT: {
    ...FULL,
    group: false, allUsers: false, announce: false, urgent: false, attach: false,
    seeReadStatus: false, moderate: false, reports: false, managePolicy: false,
    relaxParentScope: false, relaxTeacherScope: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER'],
  },
  STAFF: {
    ...FULL,
    group: false, allUsers: false, announce: false, urgent: false, attach: false,
    seeReadStatus: true, moderate: false, reports: false, managePolicy: false,
    relaxParentScope: false, relaxTeacherScope: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'],
  },
  LIBRARIAN: {
    ...FULL,
    group: false, allUsers: false, announce: false, urgent: false, attach: false,
    seeReadStatus: true, moderate: false, reports: false, managePolicy: false,
    relaxParentScope: false, relaxTeacherScope: false,
    toRoles: ['ADMIN', 'HEADTEACHER', 'TEACHER', 'STAFF', 'LIBRARIAN'],
  },
};

/** سقف حجم پیوست (dataURL پس از base64) */
export const MAX_ATTACH_DATAURL = 500_000;

/** خواندن امن JSON سیاست از رشتهٔ ذخیره‌شده */
export function parseCommPolicy(json: string | null | undefined): CommPolicy {
  const empty: CommPolicy = { roles: {}, users: {} };
  if (!json) return empty;
  try {
    const obj = JSON.parse(json) as Partial<CommPolicy>;
    if (!obj || typeof obj !== 'object') return empty;
    const roles: CommPolicy['roles'] = {};
    const users: CommPolicy['users'] = {};
    if (obj.roles && typeof obj.roles === 'object') {
      for (const [role, v] of Object.entries(obj.roles)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) roles[role] = v as Partial<CommPerms>;
      }
    }
    if (obj.users && typeof obj.users === 'object') {
      for (const [uid, v] of Object.entries(obj.users)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) users[uid] = v as Partial<CommPerms> & { note?: string };
      }
    }
    return { roles, users };
  } catch {
    return empty;
  }
}

/** اعمال رونویسی نقش + رونویسی فردی کاربر روی پیش‌فرض */
export function effectivePerms(
  role: string,
  userId: string,
  policy: CommPolicy,
): CommPerms {
  const base = DEFAULT_ROLE_PERMS[role] || DEFAULT_ROLE_PERMS.STAFF;
  const roleOverride = policy.roles[role] || {};
  const userOverride = policy.users[userId] || {};
  const merged: CommPerms = { ...base, ...roleOverride, ...userOverride };
  // آرایه‌ها همیشه جایگزین کامل می‌شوند — ادغام نکنیم تا «حذف» ممکن باشد
  if (Array.isArray(roleOverride.toRoles)) merged.toRoles = roleOverride.toRoles;
  if (Array.isArray(userOverride.toRoles)) merged.toRoles = userOverride.toRoles;
  if (Array.isArray(roleOverride.extraPeers)) merged.extraPeers = roleOverride.extraPeers.filter(Boolean);
  if (Array.isArray(userOverride.extraPeers)) merged.extraPeers = userOverride.extraPeers.filter(Boolean);
  if (Array.isArray(roleOverride.blockedPeers)) merged.blockedPeers = roleOverride.blockedPeers.filter(Boolean);
  if (Array.isArray(userOverride.blockedPeers)) merged.blockedPeers = userOverride.blockedPeers.filter(Boolean);
  if (role === 'ADMIN') {
    // مدیر سیستم همیشه کنترل کامل دارد — صلاحیت‌های مدیریتی هرگز از او گرفته نمی‌شود
    merged.enabled = true;
    merged.managePolicy = true;
    merged.moderate = true;
    merged.reports = true;
    merged.direct = true;
    merged.group = true;
    merged.allUsers = true;
  }
  return merged;
}

/** آیا نقش هدف در فهرست نقش‌های مجاز است؟ */
export function roleAllowed(perms: CommPerms, targetRole: string): boolean {
  if (perms.toRoles.includes('*')) return true;
  return perms.toRoles.includes(targetRole);
}

/** برچسب فارسی انواع پیام */
export const KIND_LABELS: Record<string, string> = {
  DIRECT: 'خصوصی',
  GROUP: 'گروهی',
  BROADCAST: 'همگانی',
};

/** دسته‌های مجاز پیام */
export const CATEGORIES_SAFE = ['GENERAL', 'ACADEMIC', 'DISCIPLINARY', 'ANNOUNCEMENT'] as const;

export const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: 'عادی',
  URGENT: 'فوری',
};

/** پنجرهٔ ویرایش پیام — ۳۰ دقیقه */
export const EDIT_WINDOW_MS = 30 * 60 * 1000;
