/**
 * آزمایش سندهای رسمی وزارت معارف (نسخهٔ ۳.۴.۰) — رندر سه سند با دادهٔ واقعی‌نما
 * خروجی: /tmp/doc-test/{grade-sheet,results,notice}.html برای بازبینی بصری
 * اجرا: bun scripts/test-v340-docs.ts
 */
import { mkdirSync, writeFileSync } from 'fs';
import {
  buildGradeSheetHtml, buildOfficialResultsHtml, buildOfficialNoticeHtml,
  gradeSheetExcel, resultsTableExcel, noticesExcel,
  type OfficialClassInput,
} from '../src/lib/client/official-docs';

const OUT = '/tmp/doc-test';
mkdirSync(OUT, { recursive: true });

/* دادهٔ آزمایشی — صنف نهم با مضامین ملی نصاب (مطابق لیسهٔ نسوان مبرهٔ اسکرین‌شات مرجع) */
const subjects = [
  { id: 's1', name: 'قرآن‌کریم شریف' },
  { id: 's2', name: 'علوم دینی (ح)' },
  { id: 's3', name: 'علوم دینی (ج)' },
  { id: 's4', name: 'دری' },
  { id: 's5', name: 'پشتو' },
  { id: 's6', name: 'ریاضی' },
  { id: 's7', name: 'انگلیسی' },
  { id: 's8', name: 'عربی' },
  { id: 's9', name: 'فزیک' },
  { id: 's10', name: 'کیمیا' },
  { id: 's11', name: 'بیولوژی' },
  { id: 's12', name: 'تاریخ' },
  { id: 's13', name: 'جغرافیه' },
  { id: 's14', name: 'تعلیمات مدنی' },
  { id: 's15', name: 'حصن خط' },
  { id: 's16', name: 'حرفه' },
];

const studentDefs = [
  ['marzia', 'مرضیه نظری', 'عبدالغنی', 'محمداشرف', '1403-001', '1203-0456'],
  ['freshta', 'فرشته احمدی', 'میراجان', 'غلام‌حیدر', '1403-002', '1203-0789'],
  ['nazira', 'نذیره سیدی', 'حسام‌الدین', 'عبدالودود', '1403-003', '1203-0123'],
  ['zahra', 'زهرا کریمی', 'نصیراحمد', 'حبیب‌الله', '1403-004', '1203-0321'],
  ['sadaf', 'صدف رحیمی', 'بازمحمد', 'شیرمحمد', '1403-005', '1203-0654'],
  ['hafsa', 'حفظه نظری', 'عبدالبصیر', 'محمدنبی', '1403-006', '1203-0987'],
  ['laila', 'لیلا یوسفی', 'عبدالهادی', 'گل‌محمد', '1403-007', '1203-0147'],
] as const;

// نمرات واقعی‌نما — بعضی کامل، بعضی ناقص (مشروط‌وار)، بعضی بدون نمره
const scoreProfile: Record<string, (i: number) => { mid: number | null; ann: number | null }> = {
  full: (i) => ({ mid: 32 + ((i * 7) % 8), ann: 48 + ((i * 11) % 12) }),
  partial: (i) => ({ mid: 28 + ((i * 5) % 6), ann: i % 3 === 0 ? 22 : 44 + ((i * 3) % 10) }), // بعضی سالانه زیر حد نصاب
  empty: () => ({ mid: null, ann: null }),
};
const profiles: Record<string, (i: number) => { mid: number | null; ann: number | null }> = {
  marzia: scoreProfile.full, freshta: scoreProfile.full, nazira: scoreProfile.partial,
  zahra: scoreProfile.full, sadaf: scoreProfile.partial, hafsa: scoreProfile.empty, laila: scoreProfile.full,
};

const marks: OfficialClassInput['marks'] = {};
studentDefs.forEach(([id], si) => {
  marks[id] = {};
  subjects.forEach((sub, i) => {
    const p = profiles[id](i + si);
    const fin = p.mid == null && p.ann == null ? null : (p.mid ?? 0) + (p.ann ?? 0);
    marks[id][sub.id] = {
      midterm: p.mid, annual: p.ann, final: fin,
      letter: fin == null ? '—' : fin >= 90 ? 'الف' : fin >= 75 ? 'ب' : fin >= 60 ? 'ج' : fin >= 50 ? 'د' : 'هـ',
      result: fin == null ? null : fin >= 40 ? 'کامیاب' : 'ناکام',
    };
  });
});

const input: OfficialClassInput = {
  school: {
    name: 'لیسهٔ نسوان مبره',
    govHeader: 'اسلامی امارت افغانستان',
    directorateLine: 'ریاست معارف شهر کابل',
    adminOffice: 'امریت حوزه (پانزدهم تعلیمی)',
    licenseNo: '۱۴۰۳',
    province: 'کابل',
  },
  className: 'صنف نهم — شعبهٔ (الف)',
  academicYear: '۱۴۰۳',
  subjects,
  students: studentDefs.map(([id, name, father, grand, roll, idn]) => ({
    id, name, father, grandFather: grand, rollNo: Number(roll.split('-')[1]), idNumber: idn,
  })),
  marks,
  passMark: 40,
  passLabel: 'کامیاب',
  failLabel: 'ناکام',
  periodMax: { MIDTERM: 40, ANNUAL: 60 },
  supervisor: 'فاطمه احمدی',
  nubt: 'نوبت اول',
  branch: 'شعبهٔ (الف)',
};

const origin = 'http://localhost:3000';
writeFileSync(`${OUT}/grade-sheet.html`, buildGradeSheetHtml(input, origin));
writeFileSync(`${OUT}/results.html`, buildOfficialResultsHtml(input, origin));
writeFileSync(`${OUT}/notice.html`, buildOfficialNoticeHtml(input, origin));
writeFileSync(`${OUT}/grade-sheet-excel.html`, gradeSheetExcel(input));
writeFileSync(`${OUT}/results-excel.html`, resultsTableExcel(input));
writeFileSync(`${OUT}/notices-excel.html`, noticesExcel(input));

// صحت‌سنجی‌های ساختاری
const gs = buildGradeSheetHtml(input, origin);
const rs = buildOfficialResultsHtml(input, origin);
const nt = buildOfficialNoticeHtml(input, origin);
const checks: Array<[string, boolean, string]> = [
  ['ورق نشریه: سربرگ رسمی سه‌مرکبی', gs.includes('mo-head-center') && gs.includes('وزارت معارف'), ''],
  ['ورق نشریه: نام مکتب از تنظیمات', gs.includes('لیسهٔ نسوان مبره'), ''],
  ['ورق نشریه: همهٔ ۷ شاگرد در صفحات', (gs.match(/نمبر تذکره/g) || []).length >= 3 && gs.includes('۱۲۰۳-۰۱۴۷'.replace(/-/g, '-')) || gs.includes('1403-007') || gs.includes('1203-0147'), ''],
  ['خلیجدول: ستون‌های رسمی ده‌گانه', rs.includes('نمبر اساسی') && rs.includes('مجموعه نمرات') && rs.includes('وسط'), ''],
  ['خلیجدول: جدول خلاصهٔ هر دو دوره', rs.includes('جدول نتایج جوارثی ماهی') && rs.includes('جدول نتایج سالانه'), ''],
  ['اطلاع‌نامه: پنل درجه‌بندی الف-هـ', nt.includes('هـ') && nt.includes('مشروط') && nt.includes('محروم'), ''],
  ['اطلاع‌نامه: ملاحظهٔ پانزده‌روزه', nt.includes('پانزده روز'), ''],
  ['اطلاع‌نامه: امضای چهارگانه', nt.includes('امضای والد شاگرد'), ''],
];
let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (pass) ok++;
}
console.log(`\n${ok}/${checks.length} بررسی ساختاری سبز — فایل‌ها در ${OUT}`);
console.log('حجم سندها: ورق نشریه', Math.round(gs.length / 1024), 'KB | خلیجدول', Math.round(rs.length / 1024), 'KB | اطلاع‌نامه', Math.round(nt.length / 1024), 'KB');
