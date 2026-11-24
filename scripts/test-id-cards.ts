#!/usr/bin/env bun
/* تست بصری کارت‌های هویت — ساخت ورق A4 با دادهٔ نمونه و نوشتن در public برای سرو */
import { readFileSync, writeFileSync } from 'fs';
import { buildIdCardsSheet, studentToCard, staffToCard, type IdCardSchoolInfo } from '../src/lib/client/id-cards';

const logoB64 = readFileSync('public/logo.png').toString('base64');
const school: IdCardSchoolInfo = {
  name: 'مکتب خصوصی نداالقلم',
  nameEn: 'NEDA-UL-QALAM PRIVATE SCHOOL',
  logo: `data:image/png;base64,${logoB64}`,
  address: 'کابل، افغانستان',
  addressEn: 'Kabul, Afghanistan',
  phone: '0791680632',
  academicYear: '۱۴۰۴ - ۱۴۰۵',
  issueDate: '۱۴۰۴/۰۱/۱۵',
};

const students = [
  { id: 's1', name: 'صبغت الله میرزا', father: 'میرزا', rollNo: 1, className: 'صنف دوم' },
  { id: 's2', name: 'محمد ناصح محمد امین', father: 'محمد امین', rollNo: 2, className: 'صنف دوم' },
  { id: 's3', name: 'ریحانه قل', father: 'میر آخند محمد', rollNo: 3, className: 'صنف دوم' },
  { id: 's4', name: 'پری اکبر', father: 'حضرت علی', rollNo: 4, className: 'صنف دوم', baseNumber: '1405-8812' },
  { id: 's5', name: 'عبدالرحمن ستانکزی', father: 'گل حسن', rollNo: 5, className: 'صنف دوم' },
  { id: 's6', name: 'سمیرا نذری', father: 'عبدالواسع', rollNo: 6, className: 'صنف دوم', baseNumber: '1405-8819' },
  { id: 's7', name: 'احمد شاه محب', father: 'عنایت الله', rollNo: 7, className: 'صنف دوم' },
  { id: 's8', name: 'احمد سیر رحیمی', father: 'محمد رحیم', rollNo: 8, className: 'صنف هفتم - الف' },
];

const staff = [
  { id: 't1', name: 'حسام الدین سیدی', father: 'عبدالغفار', position: 'مدیر مکتب' },
  { id: 't2', name: 'مژگان نظری', father: 'عبدالغنی', position: 'نگران صنف دوم' },
  { id: 't3', name: 'بشیر احمد رشیدی', father: 'محمد نعیم', position: 'معلم انگلیسی' },
  { id: 't4', name: 'نظیر احمد ساپی', father: 'گل محمد', position: 'معلم ریاضی' },
];

const cards = [
  ...students.map((s) => studentToCard(s, school.academicYear)),
  ...staff.map((t) => staffToCard(t)),
];

const html = await buildIdCardsSheet(cards, school);
writeFileSync('public/test-idcards.html', html);
console.log('✓ ورق کارت‌ها ساخته شد:', Math.round(html.length / 1024), 'KB —', cards.length, 'کارت');
