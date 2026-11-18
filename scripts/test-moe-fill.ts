// تست تولید جدول نتایج وزارت معارف — پرکردن قالب با دادهٔ آزمایشی
import { fillMoeTemplate } from '../src/lib/client/moe-workbook';
import { readFileSync, writeFileSync } from 'fs';

const tpl = readFileSync('public/templates/moe-annual-results-template.xlsx');

const subjectNames = [
  'قرآنکریم', 'دینیات', 'دری', 'پشتو', 'تجوید', 'عربی', 'انگلیسی', 'ریاضی',
  'فزیک', 'کیمیا', 'بیولوژی', 'ساینس', 'دروس اجتماعی/تاریخ', 'جغرافیه',
  'تعلیمات مدنی', 'حسن خط', 'حرفه', 'مهارت زندگی', 'هنر/رسم', 'تربیت بدنی', 'تهذیب',
];

const names: Array<[string, string, string, string]> = [
  ['صبغت الله', 'میرزا', '', ''], ['محمد صالح', 'خواجه میر', 'محمد رحیم', ''],
  ['رفیع الله', 'نجیب الله', 'عتیق الله', ''], ['عایشه', 'اختر محمد', '', ''],
  ['ریحانه', 'گل محمد', '', ''], ['بی بی گوهر', 'صنعت الله', '', ''],
  ['آرمان', 'ساربان', '', ''], ['فرخنده', 'پیمان', '', ''],
  ['عمیرجان', 'فیض الرحمن', 'غلام دستگیر', '3'], ['خدیجه', 'عبدالولی', '', ''],
  ['مجوگان', 'عبدالبصیر', '', ''], ['نسیمه', 'محمد رسول', '', ''],
];

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const students = names.map(([n, f, g, t], i) => ({
  firstName: n, lastName: '', fatherName: f, grandFather: g || null,
  idNumber: t || null,
  marks: subjectNames.map((s) => {
    // شاگرد ۱۱ (نسیمه) نمرهٔ پایین — برای دیدن «تلاش بیشتر»/«تکرار صنف»
    const mid = i === 11 ? rnd(10, 18) : rnd(24, 40);
    const ann = i === 11 ? rnd(20, 35) : rnd(38, 60);
    return { subject: s, midterm: mid, annual: ann };
  }),
}));

// شاگرد ۱۳ فقط ۳ مضمون — برای دیدن نتیجهٔ خالی (COUNT<5)
students.push({
  firstName: 'شاگرد', lastName: 'آزمایشی', fatherName: 'تستی', grandFather: null, idNumber: null,
  marks: subjectNames.slice(0, 3).map((s) => ({ subject: s, midterm: 35, annual: 50 })),
});

const out = fillMoeTemplate(tpl, {
  className: 'صنف دوم',
  teacherName: 'مژگان',
  schoolName: 'مکتب خصوصی نداالقلم',
  directorateLine: 'ریاست معارف ولایت کابل',
  academicYear: '1405',
  students,
  subjects: subjectNames,
});

writeFileSync('/tmp/moe-filled.xlsx', out);
console.log('✓ تولید شد:', out.length, 'بایت — /tmp/moe-filled.xlsx');
