// رندر سه سند رسمی با دادهٔ آزمایشی → فایل‌های HTML برای مقایسهٔ بصری با فایل رسمی
import { buildOfficialResultsHtml, buildOfficialNoticeHtml, buildGradeSheetHtml, type OfficialClassInput } from '../src/lib/client/official-docs';
import { writeFileSync, readFileSync } from 'fs';

const subjectNames = [
  'قرآنکریم', 'دینیات', 'دری', 'پشتو', 'تجوید', 'عربی', 'انگلیسی', 'ریاضی',
  'فزیک', 'کیمیا', 'بیولوژی', 'ساینس', 'دروس اجتماعی/تاریخ', 'جغرافیه',
  'تعلیمات مدنی', 'حسن خط', 'حرفه', 'مهارت زندگی', 'هنر/رسم', 'تربیت بدنی', 'تهذیب',
];

const names: Array<[string, string, string]> = [
  ['صبغت الله میرزا', 'میرزا', 'غلام دستگیر'], ['محمد صالح', 'خواجه میر', 'محمد رحیم'],
  ['رفیع الله', 'نجیب الله', 'عتیق الله'], ['عایشه', 'اختر محمد', ''],
  ['ریحانه', 'گل محمد', ''], ['بی بی گوهر', 'صنعت الله', ''],
  ['آرمان', 'ساربان', ''], ['فرخنده', 'پیمان', ''],
  ['عمیرجان', 'فیض الرحمن', 'غلام دستگیر'], ['خدیجه', 'عبدالولی', ''],
  ['مجوگان', 'عبدالبصیر', ''], ['نسیمه', 'محمد رسول', ''],
];

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const students = names.map(([n, f, g], i) => ({
  id: `stu-${i + 1}`,
  name: n, father: f, grandFather: g || null,
  rollNo: i + 1, idNumber: i < 3 ? String(4100 + i * 13) : null,
  baseNumber: i < 3 ? String(1000 + (i + 1) * 7) : null,
  eligible: i === 11 ? 'محروم' : null,
}));

const marks: OfficialClassInput['marks'] = {};
students.forEach((s, i) => {
  marks[s.id] = {};
  subjectNames.forEach((sub, j) => {
    const mid = i === 10 ? rnd(10, 18) : rnd(24, 40);
    const ann = i === 10 ? rnd(20, 35) : rnd(38, 60);
    marks[s.id][`sub-${j}`] = { midterm: mid, annual: ann, final: mid + ann };
  });
});

// حاضری: ۴ روز چهارونیم + ۱۲ روز سالانه — شاگرد ۳ بدون حاضری
const attendance: NonNullable<OfficialClassInput['attendance']> = {};
students.forEach((s, i) => {
  if (i === 2) return;
  const present = 10 - Math.min(i, 4);
  const absent = Math.min(i + 1, 2);
  attendance[s.id] = {
    mid: { days: 4, present: Math.min(present, 3), absent: Math.min(absent, 1), sick: 0, leave: 0 },
    annual: { days: 12, present, absent, sick: 1, leave: i === 5 ? 2 : 0 },
  };
});

const d: OfficialClassInput = {
  school: {
    name: 'مکتب خصوصی نداالقلم',
    directorateLine: 'ریاست معارف ولایت کابل',
    province: 'کابل',
  },
  className: 'دوم',
  academicYear: '1405',
  subjects: subjectNames.map((n, i) => ({ id: `sub-${i}`, name: n })),
  students,
  marks,
  attendance,
  supervisor: 'مژگان',
  passMark: 40,
};

writeFileSync('/tmp/doc-results.html', buildOfficialResultsHtml(d));
writeFileSync('/tmp/doc-notice.html', buildOfficialNoticeHtml(d));
writeFileSync('/tmp/doc-gradesheet.html', buildGradeSheetHtml(d));
console.log('✓ سه سند ساخته شد:',
  readFileSync('/tmp/doc-results.html').length,
  readFileSync('/tmp/doc-notice.html').length,
  readFileSync('/tmp/doc-gradesheet.html').length, 'بایت');
