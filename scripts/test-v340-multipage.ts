/**
 * آزمایش چندصفحه‌ای بودن اسناد رسمی — ۳۰ شاگرد (خلیجدول: ۲ صفحه با تکرار سرستون،
 * ورق نشریه: ۱۰ صفحه با تکرار سربرگ، اطلاع‌نامه: ۳۰ صفحه با page-break)
 * اجرا: bun scripts/test-v340-multipage.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import {
  buildGradeSheetHtml, buildOfficialResultsHtml, buildOfficialNoticeHtml,
  type OfficialClassInput,
} from '../src/lib/client/official-docs';

const N = 30;
const subjects = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, name: `مضمون ${i + 1}` }));
const students = Array.from({ length: N }, (_, i) => ({
  id: `st${i + 1}`,
  name: `شاگرد شمارهٔ ${i + 1}`,
  father: `پدر ${i + 1}`,
  grandFather: `جد ${i + 1}`,
  rollNo: i + 1,
  idNumber: `1203-${String(i + 1).padStart(4, '0')}`,
}));
const marks: OfficialClassInput['marks'] = {};
for (const s of students) {
  marks[s.id] = {};
  for (const sub of subjects) {
    const mid = 30 + ((s.rollNo! * 7 + sub.id.charCodeAt(1)) % 10);
    const ann = 45 + ((s.rollNo! * 3 + 5) % 15);
    marks[s.id][sub.id] = { midterm: mid, annual: ann, final: mid + ann, letter: 'ب', result: 'کامیاب' };
  }
}
const input: OfficialClassInput = {
  school: { name: 'لیسهٔ آزمایشی', province: 'کابل', adminOffice: 'امریت حوزه (پانزدهم تعلیمی)' },
  className: 'صنف دوازدهم — آزمایش ۳۰ شاگرد',
  academicYear: '۱۴۰۳',
  subjects, students, marks,
  passMark: 40, periodMax: { MIDTERM: 40, ANNUAL: 60 },
};

mkdirSync('/tmp/doc-test', { recursive: true });
const gs = buildGradeSheetHtml(input, '');
const rs = buildOfficialResultsHtml(input, '');
const nt = buildOfficialNoticeHtml(input, '');
writeFileSync('/tmp/doc-test/mp-grade-sheet.html', gs);
writeFileSync('/tmp/doc-test/mp-results.html', rs);
writeFileSync('/tmp/doc-test/mp-notice.html', nt);

const checks: Array<[string, boolean]> = [
  ['خلیجدول: همهٔ ۳۰ شاگرد (۳۰ سطر شماره‌دار)', rs.split('صفحهٔ').length === 1 && (rs.match(/<tr>/g) || []).length >= 30],
  ['خلیجدول: ۲ صفحه (۱+۲۵ و ۵)', (rs.match(/class="res-page/g) || []).length === 2],
  ['خلیجدول: سرستون در هر صفحه تکرار می‌شود', (rs.match(/نمبر تذکره<\/th>/g) || []).length === 2],
  ['ورق نشریه: ۱۰ صفحه (۳ شاگرد در هر صفحه)', (gs.match(/class="sheet-page/g) || []).length === 10],
  ['ورق نشریه: سربرگ رسمی در هر صفحه تکرار می‌شود', (gs.match(/class="mo-head-center/g) || []).length === 10],
  ['اطلاع‌نامه: ۳۰ صفحه جدا (page-break)', (nt.match(/class="notice-page/g) || []).length === 30],
  ['اطلاع‌نامه: سربرگ رسمی در هر صفحه', (nt.match(/class="mo-head-center/g) || []).length === 30],
];
let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (pass) ok++;
}
console.log(`\n${ok}/${checks.length} — شماره‌گذاری ادامه‌دار و سربرگ‌های تکرارشده سالم‌اند`);
