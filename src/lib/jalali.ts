/**
 * تبدیل تاریخ میلادی ↔ شمسی (جلالی)
 * الگوریتم استاندارد jalaali-js
 */

const afghanMonths = [
  'حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله',
  'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت',
];

export const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let jump = 0;
  let leapJ = -14;
  let jp = breaks[0];
  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(jy + 621, 4) - div(div(jy + 621, 100) + 1, 4) * 3 - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy: jy + 621, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * ((gm + 9) % 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div((j % 1461) / 4, 1) * 5 + 308;
  const gd = div((i % 153) / 5, 1) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = (k % 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  const jm = 7 + div(k, 30);
  const jd = (k % 30) + 1;
  return { jy, jm, jd };
}

export function gregorianToJalali(gy: number, gm: number, gd: number) {
  return d2j(g2d(gy, gm, gd));
}

export function jalaliToGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

/** تاریخ ISO میلادی (yyyy-mm-dd) → رشتهٔ شمسی افغانی مثل «۲۸ میزان ۱۴۰۵» */
export function isoToJalaliDisplay(iso: string, withMonthName = true): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  if (withMonthName) {
    return `${toPersianDigits(jd)} ${afghanMonths[jm - 1]} ${toPersianDigits(jy)}`;
  }
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** تاریخ امروز به شمسی (رشتهٔ عددی مثل 1405/07/28) */
export function todayJalali(): string {
  const now = new Date();
  const { jy, jm, jd } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function isoToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** رشتهٔ شمسی مثل 1405/07/28 → ISO میلادی */
export function jalaliStringToIso(j: string): string {
  const [jy, jm, jd] = toLatinDigits(j).split(/[\/\-]/).map((x) => parseInt(x.trim(), 10));
  if (!jy || !jm || !jd) return '';
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/** ISO میلادی → رشتهٔ شمسی عددی 1405/07/28 */
export function isoToJalaliString(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/** شروع و پایان ماه شمسی به‌صورت ISO میلادی */
export function jalaliMonthRange(jy: number, jm: number): { startIso: string; endIso: string } {
  const g1 = jalaliToGregorian(jy, jm, 1);
  const g2 = jm <= 6 ? jalaliToGregorian(jy, jm, 31) : jalaliToGregorian(jy, jm, 30);
  const fmt = (g: { gy: number; gm: number; gd: number }) =>
    `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  return { startIso: fmt(g1), endIso: fmt(g2) };
}

/** تعداد روزهای ماه شمسی (کبیسه لحاظ می‌شود) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

export { afghanMonths };

export function jalaliNowDisplay(): string {
  return isoToJalaliDisplay(isoToday());
}

/** روز هفته به فارسی */
const weekdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

export function isoToWeekday(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return weekdays[d.getDay()];
}
