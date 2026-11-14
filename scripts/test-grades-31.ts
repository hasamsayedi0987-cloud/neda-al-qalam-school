/**
 * یونیت‌تست منطق نمرات افغانستان — نسخهٔ ۳.۱.۰
 * اجرا: bun scripts/test-grades-31.ts
 */
import {
  finalScore, componentCapsFor, subjectResult, overallResult,
  normalizePeriodScore, DEFAULT_PERIOD_MAX, DEFAULT_RESULT_LABELS, DEFAULT_SCALE,
} from '../src/lib/grading';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('═ یونیت‌تست نمرات ۳.۱ ═');

// ۱) مجموع نهائی = چهارو‌نیم‌ماهه + سالانه (۴۰+۶۰=۱۰۰)
check('نهائی ۳۰+۵۰ = ۸۰', finalScore(30, 50) === 80, String(finalScore(30, 50)));
check('نهائی ۴۰+۶۰ = ۱۰۰', finalScore(40, 60) === 100, String(finalScore(40, 60)));
check('فقط چهارو‌نیم‌ماهه ۳۵ → ۳۵', finalScore(35, null) === 35, String(finalScore(35, null)));
check('هر دو null → null', finalScore(null, null) === null, 'x');

// ۲) نرمال‌سازی دادهٔ قدیمی (از ۱۰۰) به سقف دوره
check('۸۵ در سقف ۴۰ → ۳۴', normalizePeriodScore(85, 40) === 34, String(normalizePeriodScore(85, 40)));
check('۹۰ در سقف ۶۰ → ۵۴', normalizePeriodScore(90, 60) === 54, String(normalizePeriodScore(90, 60)));
check('۳۰ در سقف ۴۰ دست‌نخورده', normalizePeriodScore(30, 40) === 30, String(normalizePeriodScore(30, 40)));
check('نهائی دادهٔ قدیمی ۸۵+۹۰ → ۸۸', finalScore(85, 90) === 88, String(finalScore(85, 90)));

// ۳) سقف اجزای هر دوره
const w = { maxWritten: 40, maxOral: 20, maxHomework: 20, maxActivity: 20 };
const midCaps = componentCapsFor(40, w);
check('سقف اجزای چهارو‌نیم‌ماهه: ۱۶/۸/۸/۸',
  midCaps.maxWritten === 16 && midCaps.maxOral === 8 && midCaps.maxHomework === 8 && midCaps.maxActivity === 8,
  JSON.stringify(midCaps));
const annCaps = componentCapsFor(60, w);
check('سقف اجزای سالانه: ۲۴/۱۲/۱۲/۱۲',
  annCaps.maxWritten === 24 && annCaps.maxOral === 12 && annCaps.maxHomework === 12 && annCaps.maxActivity === 12,
  JSON.stringify(annCaps));
check('جمع سقف چهارو‌نیم‌ماهه = ۴۰',
  midCaps.maxWritten + midCaps.maxOral + midCaps.maxHomework + midCaps.maxActivity === 40);
check('جمع سقف سالانه = ۶۰',
  annCaps.maxWritten + annCaps.maxOral + annCaps.maxHomework + annCaps.maxActivity === 60);

// ۴) کامیاب/ناکام — حد نصاب ۴۰ (لایحهٔ مکاتب ثانوی مادهٔ ۲۷)
check('نهائی ۴۰ → کامیاب', subjectResult(40) === 'کامیاب', String(subjectResult(40)));
check('نهائی ۳۹.۵ → ناکام', subjectResult(39.5) === 'ناکام', String(subjectResult(39.5)));
check('نهائی null → null', subjectResult(null) === null, 'x');

// ۵) نتیجهٔ کل شاگرد
check('همهٔ مضامین بالای نصاب → کامیاب',
  overallResult([80, 45, 90], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).result === 'کامیاب');
check('ناکامی در بیش از نصف مضامین → ناکام',
  overallResult([30, 20, 80], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).result === 'ناکام');
check('ناکامی در نصف یا کمتر → کامیاب مشروط (لیاقت)',
  overallResult([30, 80, 90], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).result === 'کامیاب مشروط (لیاقت)',
  overallResult([30, 80, 90], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).result);
check('بدون نمره → ناقص',
  overallResult([null, null], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).result === 'ناقص');
check('شمار مضامین ناکام درست است',
  overallResult([30, 20, 80], DEFAULT_SCALE, DEFAULT_RESULT_LABELS).failed === 2);

// ۶) سقف قابل تغییر (تنظیمات: ۵۰+۵۰) — بدون تغییر کد
const custom = finalScore(45, 50, { MIDTERM: 50, ANNUAL: 50 });
check('سقف سفارشی ۵۰+۵۰: نهائی ۴۵+۵۰ = ۹۵', custom === 95, String(custom));
check('سقف سفارشی: ورودی بالاتر از سقف به‌طور متناسب نرمال می‌شود',
  finalScore(45, 100, { MIDTERM: 50, ANNUAL: 50 }) === 95,
  String(finalScore(45, 100, { MIDTERM: 50, ANNUAL: 50 })));

console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail > 0 ? 1 : 0);
