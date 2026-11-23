/* ─────────────── ۲) جدول نتایج رسمی (خلیجدول) — A4 عمودی، عین فایل رسمی ۱۴۰۵ ─────────────── */

/** ظرفیت رسمی قالب: ۲۱ مضمون (سطرهای ۱۳–۳۳ فایل رسمی) — مضامین کمتر = سطرهای خالی فرم */
const CAP_SUBJECTS = 21;
const JADWAL_GROUP = 3; // سه شاگرد در هر صفحهٔ عمودی + نوار تائید

const JADWAL_CSS = `
  .jpage { page-break-after: always; position: relative; }
  .jpage:last-child { page-break-after: auto; }
  .jlogo { position: absolute; left: 1mm; }
  .jt { font-size: 6.2pt; }
  .jt .b { font-weight: 700; }
  .jt .subj { font-size: 6.2pt; }
  .jt .mark { font-size: 7.5pt; }
  .jt .res { font-size: 6.8pt; }
  .jt .grade { font-size: 8pt; font-weight: 700; }
  .jt .lbl { font-size: 5.6pt; }
  .jt .vtxt { font-size: 6.4pt; font-weight: 700; }
  .jt .vtxt2 { font-size: 5.6pt; font-weight: 700; }
  .jt .vplain { font-size: 5.6pt; }
  .jt .diag { position: relative; background-image: linear-gradient(to top right, transparent calc(50% - 0.5px), #000 calc(50% - 0.5px), #000 calc(50% + 0.5px), transparent calc(50% + 0.5px)); }
  .jt .diag span { position: absolute; font-size: 5.4pt; }
  .jt .diag .d1 { top: 1px; right: 2px; }
  .jt .diag .d2 { bottom: 1px; left: 2px; }
`;

/* عرض ستون‌های B..Y — متناسب با فایل رسمی (جمع ≈ ۷۳۵ پیکسل ≈ ۱۹۴ میلی‌متر) */
const JW = [24, 30, 30, 30, 30, 30, 30, 22, 5, 30, 78,
  40, 36, 40, 18, 40, 36, 40, 18, 40, 36, 40, 18, 24];
/* بلندی سطرهای ۴..۴۲ (pt) — عین فایل رسمی فشرده‌شده برای یک صفحهٔ A4 عمودی */
const JH = [19, 19, 19, 19, 19, 19, 17, 17, 17,
  ...Array.from({ length: 21 }, () => 17),
  18, 18, 18, 18,
  16, 16, 16, 16, 16];

export function buildOfficialResultsHtml(d: OfficialClassInput, origin = ''): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const secondLine = d.school.govHeader?.trim() || d.school.adminOffice?.trim() || '';
  const supervisor = d.supervisor?.trim();
  const sm = classSummary(d, subjects);
  const pages: string[] = [];

  const groupCount = Math.max(1, Math.ceil(d.students.length / JADWAL_GROUP));
  for (let g = 0; g < groupCount; g++) {
    const studs = [0, 1, 2].map((k) => d.students[g * JADWAL_GROUP + k]);
    const aggs = studs.map((s) => studentAgg(d, s, subjects));
    const cells: Grid = new Map();
    const set = (r: number, c: number, cell: GCell) => cells.set(`${r},${c}`, cell);
    const vtx = (t: string, cls = 'vtxt') => `<span class="vtx ${cls}">${t}</span>`;

    /* ═══ قطعهٔ هویتی مشترک (B–L — عین Print_Titles فایل رسمی) ═══ */
    // سطر ۰ (اکسل ۴): شماره
    set(0, 9, { t: 'شماره', cs: 2, cls: 'b' });
    // سطرهای ۱–۳ (اکسل ۵–۷): برچسب بلند «شهرت» + نام/نام پدر/نام پدر کلان
    set(1, 9, { t: vtx('شهرت', 'vtxt2'), rs: 3 });
    set(1, 10, { t: 'نام', cls: 'b' });
    set(2, 10, { t: 'نام پدر', cls: 'b' });
    set(3, 10, { t: 'نام پدر کلان', cls: 'b' });
    // سطرهای ۴–۵ (اکسل ۸–۹): نمبر اساس / نمبر تذکره
    set(4, 9, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(5, 9, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    // سرستون مورب مضامین/سال‌نامه + سرستون‌های نمره (اکسل ۱۰–۱۲)
    set(6, 9, { t: '<span class="d1">مضامین</span><span class="d2">سال‌نامه</span>', rs: 3, cs: 2, cls: 'diag' });
    // legend نتیجه‌ها و درجه‌ها (اکسل ۶–۸ — گوشهٔ ستون‌های B–G)
    set(2, 1, { t: 'موفق', cls: 'lbl' }); set(2, 2, { t: 'تلاش بیشتر', cls: 'lbl' });
    set(2, 3, { t: 'معذ ر تی', cls: 'lbl' }); set(2, 4, { t: 'غایب', cls: 'lbl' });
    set(3, 0, { t: 'ارتقا صنف', cls: 'lbl' }); set(3, 1, { t: 'تکرار صنف', cls: 'lbl' });
    set(3, 2, { t: 'مشروط', cls: 'lbl' }); set(3, 3, { t: 'معذرتی', cls: 'lbl' });
    set(3, 4, { t: 'محروم', cls: 'lbl' }); set(3, 5, { t: 'سه پارچه', cls: 'lbl' });
    set(4, 1, { t: 'الف', cls: 'lbl' }); set(4, 2, { t: 'ب', cls: 'lbl' });
    set(4, 3, { t: 'ج', cls: 'lbl' }); set(4, 4, { t: 'د', cls: 'lbl' }); set(4, 5, { t: 'هـ', cls: 'lbl' });
    // فضای خالی بالای فرم — بدون کادر (B4:H5)
    for (const r of [0, 1]) for (let c = 0; c <= 6; c++) if (!(r === 0 && c === 7)) set(r, c, { nb: true });
    // سطرهای ۵ و حاشیه‌های legend — ستون H خالی بدون کادر در سطرهای ۲–۴ (مثل فایل)
    for (let c = 0; c <= 6; c++) for (const r of [5]) if (!cells.get(`${r},${c}`)) set(r, c, { nb: true });
    // نوار عمودی I — عین فایل رسمی
    set(0, 7, { t: vtx('جدول نتایج'), rs: 4 });
    set(4, 7, { t: vtx(`صنف ${esc(d.className)}`), rs: 5 });
    set(9, 7, { t: vtx(`بابت سال تعلیمی ${esc(year)}`), rs: 7 });
    set(16, 7, { t: vtx(supervisor ? `نگران صنف : (${esc(supervisor)})` : 'نگران صنف'), rs: 9 });
    // سربرگ چرخیدهٔ ستون‌های B–H (اکسل ۱۳–۲۶) — عین فایل رسمی
    set(9, 0, { t: vtx('وزارت معارف'), rs: 14, cs: 2 });
    set(9, 2, { t: vtx(esc(dirLine)), rs: 14, cs: 2 });
    set(9, 4, { t: vtx(esc(secondLine)), rs: 14, cs: 2 });
    set(9, 6, { t: vtx(esc(d.school.name)), rs: 14 });
    // خلص نتایج چهارونیم ماه (اکسل ۳۱–۳۶ — ستون‌های B–H)
    set(27, 0, { t: vtx('خلص نتایج چهارونیم ماه'), rs: 6 });
    const midHead = ['تعداد داخله', 'شامل امتحان', 'موفق', 'تلاش بیشتر', 'معذ ر تی', 'غایب'];
    midHead.forEach((h, i) => set(27, 1 + i, { t: vtx(h, 'vplain'), rs: 4 }));
    const midVals = [fa(sm.dakhila), fa(sm.dakhila - sm.midAbsent), fa(sm.midPass), fa(sm.midTry), '', fa(sm.midAbsent)];
    midVals.forEach((v, i) => set(31, 1 + i, { t: v, rs: 2 }));
    // خلص نتایج سالانه (اکسل ۳۷–۴۲ — ستون‌های B–I)
    set(33, 0, { t: vtx('خلص نتایج سالانه'), rs: 6 });
    const annHead = ['تعداد داخله', 'شامل امتحان', 'ارتقا صنف', 'تکرار صنف', 'مشروط', 'معذرتی', 'محروم'];
    annHead.forEach((h, i) => set(33, 1 + i, { t: vtx(h, 'vplain'), rs: 4 }));
    const annVals = [fa(sm.dakhila), fa(sm.dakhila - sm.deprived), fa(sm.annPromote), fa(sm.annRepeat), fa(sm.annCond), '', fa(sm.deprived)];
    annVals.forEach((v, i) => set(37, 1 + i, { t: v, rs: 2 }));

    /* ═══ بلوک سه شاگرد (M..X) + نوار تائید (Y) — عین فایل رسمی ═══ */
    const bases = [11, 15, 19]; // M، Q، U
    studs.forEach((s, i) => {
      const b = bases[i];
      const a = aggs[i];
      const att = attOf(d, s?.id || '');
      const mid = att?.mid, ann = att?.annual;
      const nm = (v: number | null | undefined) => (v == null ? '' : fa(v));
      set(0, b, { t: s ? fa(s.rollNo ?? g * JADWAL_GROUP + i + 1) : '', cs: 3, cls: 'mark' });
      set(1, b, { t: s ? esc(s.name) : '', cs: 3 });
      set(2, b, { t: s ? esc(s.father) : '', cs: 3 });
      set(3, b, { t: s ? esc(s.grandFather || '') : '', cs: 3 });
      set(4, b, { t: s ? esc(s.baseNumber || '') : '', cs: 3 });
      set(5, b, { t: s ? esc(s.idNumber || '') : '', cs: 3 });
      // سرستون‌های نمره — چرخیده عین فایل رسمی
      set(6, b, { t: vtx('چهارو نیم ماهه', 'vplain'), rs: 3 });
      set(6, b + 1, { t: vtx('سالانه', 'vplain'), rs: 3 });
      set(6, b + 2, { t: vtx('نمرات نهائی', 'vplain'), rs: 3 });
      // ستون «مربوط» جداکنندهٔ بلوک‌ها — تمام طول جدول (عین ستون P/T/X فایل رسمی)
      set(0, b + 3, { t: '', rs: 39 });
      // نمرات مضامین — سطرهای ۹–۲۹ (اکسل ۱۳–۳۳)
      for (let r = 0; r < CAP_SUBJECTS; r++) {
        const m = s && subjects[r] ? d.marks[s.id]?.[subjects[r].id] || {} : {};
        set(9 + r, b, { t: fmtScore(m.midterm ?? null), cls: 'mark' });
        set(9 + r, b + 1, { t: fmtScore(m.annual ?? null), cls: 'mark' });
        set(9 + r, b + 2, { t: fmtScore(m.final ?? null), cls: 'mark' });
      }
      set(30, b, { t: fmtScore(a.totMid), cls: 'mark' });
      set(30, b + 1, { t: fmtScore(a.totAnn), cls: 'mark' });
      set(30, b + 2, { t: fmtScore(a.totFin), cls: 'mark' });
      set(31, b, { t: fmtScore(a.avgMid), cls: 'mark' });
      set(31, b + 1, { t: fmtScore(a.avgAnn), cls: 'mark' });
      set(31, b + 2, { t: fmtScore(a.avgFin), cls: 'mark' });
      set(32, b, { t: esc(a.natiyeMid), cls: 'res' });
      set(32, b + 1, { t: esc(a.natiyeAnn), cls: 'res' });
      set(33, b, { t: esc(a.darajeMid), cls: 'grade' });
      set(33, b + 1, { t: esc(a.darajeAnn), cls: 'grade' });
      // ضوابط حاضری — چه | از میان | سالانه (سطرهای ۳۴–۳۸ — عین فرمول‌های M38..O42)
      const has = ann && ann.days > 0;
      const rows: Array<[(number | undefined), (number | undefined)]> = [
        [mid?.days, ann?.days], [mid?.present, ann?.present], [mid?.absent, ann?.absent],
        [mid?.sick, ann?.sick], [mid?.leave, ann?.leave],
      ];
      rows.forEach(([mv, av], k) => {
        set(34 + k, b, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'mark' });
        set(34 + k, b + 1, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'mark' });
        set(34 + k, b + 2, { t: has ? nm(av) : '', cls: 'mark' });
      });
    });

    // نوار تائید عمودی (Y) — چهار بخش عین فایل رسمی
    set(0, 23, { t: vtx('تائید اداره مکتب', 'vplain'), rs: 6 });
    set(8, 23, { t: vtx('تائید آمریت حوزه تعلیمی/ولسوالی', 'vplain'), rs: 8 });
    set(21, 23, { t: vtx('تائید مدیریت نتایج', 'vplain'), rs: 6 });
    set(33, 23, { t: vtx('تائید و مهر ریاست معارف', 'vplain'), rs: 6 });
    [6, 7, 16, 17, 18, 19, 20, 27, 28, 29, 30, 31, 32, 36, 37, 38].forEach((r) => set(r, 23, { t: '' }));

    const page = `${renderGrid(39, JW, JH, cells, 'jt', 'ltr')}
<div class="jlogo" style="top:1.5mm"><img src="${MINISTRY_JADWAL}" style="width:23mm;height:auto"/></div>
<div class="jlogo" style="top:112mm"><img src="${SCHOOL_SEAL_JADWAL}" style="width:30mm;height:auto"/></div>`;
    pages.push(`<div class="jpage">${page}</div>`);
  }

  return docShell(`جدول نتایج — ${d.className}`, 'portrait', pages.join(''), JADWAL_CSS);
}

/* ─────────────── ۳) اطلاع‌نامهٔ رسمی هر شاگرد — A4 عمودی، عین فایل رسمی ۱۴۰۵ ─────────────── */

const NOTICE_CSS = `
  .npage { page-break-after: always; position: relative; }
  .npage:last-child { page-break-after: auto; }
  .nlogo { position: absolute; top: 1.5mm; }
  .nt { font-size: 6.4pt; }
  .nt .b { font-weight: 700; }
  .nt .big { font-size: 11pt; font-weight: 700; }
  .nt .ttl { font-size: 13pt; font-weight: 700; white-space: nowrap; }
  .nt .subj { font-size: 6.4pt; }
  .nt .mark { font-size: 8pt; }
  .nt .res { font-size: 7pt; }
  .nt .grade { font-size: 8pt; font-weight: 700; }
  .nt .lbl { font-size: 5.8pt; }
  .nt .vtxt { font-size: 6.2pt; font-weight: 700; }
  .nt .vplain { font-size: 5.8pt; }
  .nt .tiny { font-size: 5.2pt; line-height: 1.5; }
  .nt .gh { font-size: 6.6pt; font-weight: 700; }
`;

/* عرض ستون‌های A..M — RTL؛ جمع ≈ ۷۴۲ پیکسل ≈ ۱۹۶ میلی‌متر */
const NW = [28, 114, 66, 62, 66, 62, 62, 62, 62, 62, 35, 35, 26];
/* بلندی سطرهای ۱..۴۶ (pt) — عین فایل رسمی فشرده‌شده برای یک صفحهٔ A4 عمودی */
const NH = [16, 16, 16, 16, 12, 22, 18, 18, 18, 18, 18, 18,
  22, 22, 22, 22,
  ...Array.from({ length: 21 }, () => 16),
  18, 18, 18, 18,
  17, 17, 17, 17, 17];

export function buildOfficialNoticeHtml(d: OfficialClassInput, origin = '', onlyStudentId?: string): string {
  void origin;
  const subjects = d.subjects.slice(0, CAP_SUBJECTS);
  const year = (d.academicYear || '۱۴۰۵').trim();
  const dirLine = d.school.directorateLine?.trim()
    || (d.school.province?.trim() ? `ریاست معارف ${d.school.province.trim()}` : 'ریاست معارف');
  const secondLine = d.school.govHeader?.trim() || d.school.adminOffice?.trim() || '';
  const supervisor = d.supervisor?.trim();
  const students = onlyStudentId ? d.students.filter((s) => s.id === onlyStudentId) : d.students;
  const list = students.length ? students : d.students.slice(0, 1);

  const pages = list.map((s) => {
    const a = studentAgg(d, s, subjects);
    const att = attOf(d, s.id);
    const mid = att?.mid, ann = att?.annual;
    const has = ann && ann.days > 0;
    const nm = (v: number | null | undefined) => (v == null ? '' : fa(v));
    const cells: Grid = new Map();
    const set = (r: number, c: number, cell: GCell) => cells.set(`${r},${c}`, cell);
    const vtx = (t: string, cls = 'vtxt') => `<span class="vtx ${cls}">${t}</span>`;

    /* ═══ سربرگ (سطرهای ۱–۴) — عین فایل رسمی ═══ */
    set(0, 3, { t: 'وزارت معارف', cs: 6, cls: 'big' });
    set(1, 3, { t: esc(dirLine), cs: 6, cls: 'big' });
    set(2, 3, { t: esc(secondLine), cs: 6, cls: 'big' });
    set(3, 3, { t: `(${esc(d.school.name.replace(/^\(+|\)+$/g, '').trim())})`, cs: 6, cls: 'big' });
    // سطر ۵ — خالی ادغام‌شدهٔ D5:I5
    set(4, 3, { t: '', cs: 6 });
    /* ═══ سطر ۶: اطلاع‌نامه + صنف + نگران صنف + بابت سال تعلیمی ═══ */
    set(5, 1, { t: 'اطــــلاع نامـــــه', cls: 'ttl' });
    set(5, 2, { t: `صنف ${esc(d.className)}`, cs: 3, cls: 'b' });
    set(5, 5, { t: supervisor ? `نگران صنف : (${esc(supervisor)})` : '', cs: 3, cls: 'b' });
    set(5, 8, { t: `بابت سال تعلیمی ${esc(year)}`, cs: 4, cls: 'b' });
    /* ═══ بلوک هویتی (سطرهای ۷–۱۲) — عین فایل رسمی ═══ */
    set(6, 0, { t: 'شماره حاضری', cs: 2, cls: 'b' });
    set(6, 2, { t: s ? fa(s.rollNo) : '', cs: 3, cls: 'mark' });
    set(7, 0, { t: vtx('شهرت', 'vplain'), rs: 3 });
    set(7, 1, { t: 'نام', cls: 'b' });
    set(8, 1, { t: 'نام پدر', cls: 'b' });
    set(9, 1, { t: 'نام پدرکلان', cls: 'b' });
    set(7, 2, { t: s ? esc(s.name) : '', cs: 3 });
    set(8, 2, { t: s ? esc(s.father) : '', cs: 3 });
    set(9, 2, { t: s ? esc(s.grandFather || '') : '', cs: 3 });
    set(10, 0, { t: 'نمبر اساس', cs: 2, cls: 'b' });
    set(10, 2, { t: s ? esc(s.baseNumber || '') : '', cs: 3 });
    set(11, 0, { t: 'نمبر تذکره', cs: 2, cls: 'b' });
    set(11, 2, { t: s ? esc(s.idNumber || '') : '', cs: 3 });
    /* ═══ سرستون امتحانات + نمره‌ها (سطرهای ۱۳–۱۶) ═══ */
    set(12, 0, { t: 'امتحانات', rs: 4, cs: 2, cls: 'gh' });
    set(12, 2, { t: vtx('چهارو نیم ماهه', 'vplain'), rs: 4 });
    set(12, 3, { t: vtx('سالانه', 'vplain'), rs: 4 });
    set(12, 4, { t: vtx('نمرات نهائی', 'vplain'), rs: 4 });
    /* ═══ عنوان «اطلای نامه» — تصویر رسمی فایل (F7:K11) ═══ */
    set(6, 5, { t: `<img src="${NOTICE_TITLE_IMG}" style="width:100%;height:auto;display:block"/>`, rs: 5, cs: 6 });
    /* ═══ مضامین (سطرهای ۱۷–۳۷) ═══ */
    for (let i = 0; i < CAP_SUBJECTS; i++) {
      const sub = subjects[i];
      const m = s && subjects[i] ? d.marks[s.id]?.[subjects[i].id] || {} : {};
      set(16 + i, 0, { t: sub ? esc(sub.name) : '', cs: 2, cls: 'subj' });
      set(16 + i, 2, { t: fmtScore(m.midterm ?? null), cls: 'mark' });
      set(16 + i, 3, { t: fmtScore(m.annual ?? null), cls: 'mark' });
      set(16 + i, 4, { t: fmtScore(m.final ?? null), cls: 'mark' });
    }
    /* ═══ مجموعه / اوسط / نتیجه / درجه (سطرهای ۳۸–۴۱) ═══ */
    set(37, 0, { t: 'مجموعه نمرات', cs: 2, cls: 'subj' });
    set(38, 0, { t: 'اوسط نمرات', cs: 2, cls: 'subj' });
    set(39, 0, { t: 'نتیجه', cs: 2, cls: 'subj b' });
    set(40, 0, { t: 'درجه', cs: 2, cls: 'subj b' });
    set(37, 2, { t: fmtScore(a.totMid), cls: 'mark' });
    set(37, 3, { t: fmtScore(a.totAnn), cls: 'mark' });
    set(37, 4, { t: fmtScore(a.totFin), cls: 'mark' });
    set(38, 2, { t: fmtScore(a.avgMid), cls: 'mark' });
    set(38, 3, { t: fmtScore(a.avgAnn), cls: 'mark' });
    set(38, 4, { t: fmtScore(a.avgFin), cls: 'mark' });
    set(39, 2, { t: esc(a.natiyeMid), cls: 'res' });
    set(39, 3, { t: esc(a.natiyeAnn), cls: 'res' });
    set(40, 2, { t: esc(a.darajeMid), cls: 'grade' });
    set(40, 3, { t: esc(a.darajeAnn), cls: 'grade' });
    /* ═══ ضوابط حاضری (سطرهای ۴۲–۴۶) — عین فایل رسمی ═══ */
    set(41, 0, { t: vtx('ضوابط حاضری', 'vplain'), rs: 5 });
    const attRows = ['ایام سال تعلیمی', 'حاضر', 'غیر حاضر', 'مریض', 'رخصت'];
    const attVals: Array<[(number | undefined), (number | undefined)]> = [
      [mid?.days, ann?.days], [mid?.present, ann?.present], [mid?.absent, ann?.absent],
      [mid?.sick, ann?.sick], [mid?.leave, ann?.leave],
    ];
    attRows.forEach((h, k) => {
      const [mv, av] = attVals[k];
      set(41 + k, 1, { t: h, cls: 'lbl' });
      set(41 + k, 2, { t: has && mid && mid.days > 0 ? nm(mv) : '', cls: 'mark' });
      set(41 + k, 3, { t: has ? nm((av ?? 0) - (mv ?? 0)) : '', cls: 'mark' });
      set(41 + k, 4, { t: has ? nm(av) : '', cls: 'mark' });
    });
    /* ═══ درجه‌بندی چهارونیم‌ماهه (سطرهای ۲۰–۲۶) — عین متن‌های فایل رسمی ═══ */
    set(19, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان چهارونیم ماه', cs: 5, cls: 'gh' });
    set(19, 10, { t: 'نتیجه', cls: 'gh' });
    set(19, 11, { t: 'درجه', cls: 'gh' });
    set(20, 5, { t: 'از  36  الی  40', cs: 5, cls: 'subj' });
    set(21, 5, { t: 'از  30  الی  35.99', cs: 5, cls: 'subj' });
    set(22, 5, { t: 'از  24  الی  29.99', cs: 5, cls: 'subj' });
    set(23, 5, { t: 'از  20  الی 23.99', cs: 5, cls: 'subj' });
    set(24, 5, { t: 'شاگردی که اوسط نمرات آن از 0  تا 19.99 باشد و یا حد اقل در یک مضون کمتر از 16 نمره اخذ نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(20, 10, { t: 'موفق', cls: 'subj' }); set(20, 11, { t: 'الف', cls: 'grade' });
    set(21, 11, { t: 'ب', cls: 'grade' });
    set(22, 11, { t: 'ج', cls: 'grade' });
    set(23, 11, { t: 'د', cls: 'grade' });
    set(24, 10, { t: 'تلاش بیشتر', cls: 'subj' }); set(24, 11, { t: 'هـ', cls: 'grade' });
    /* ═══ درجه‌بندی سالانه (سطرهای ۲۷–۳۵) ═══ */
    set(26, 5, { t: 'درجه بندی شاگردان به اساس اوسط مجموع نمرات در امتحان سالانه', cs: 5, cls: 'gh' });
    set(27, 5, { t: 'از  90  الی  100', cs: 5, cls: 'subj' });
    set(28, 5, { t: 'از  75  الی  89.99', cs: 5, cls: 'subj' });
    set(29, 5, { t: 'از  60  الی  74.99', cs: 5, cls: 'subj' });
    set(30, 5, { t: 'از  50  الی  59.99', cs: 5, cls: 'subj' });
    set(31, 5, { t: 'شاگردی که اوسط نمرات آن از 50 بالاتر باشد و در 1 الی 3 مضمون کمتر از 40 نمره اخد نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(33, 5, { t: 'شاگردی که اوسط مجموع نمرات آن از 0 تا 49.99 باشد و یا در بیشتر از 3 مضمون، کمتر از 40 نمره اخذ نموده باشد.', cs: 5, rs: 2, cls: 'tiny' });
    set(27, 10, { t: 'ارتقا صنف', cls: 'subj' }); set(27, 11, { t: 'الف', cls: 'grade' });
    set(28, 11, { t: 'ب', cls: 'grade' });
    set(29, 11, { t: 'ج', cls: 'grade' });
    set(30, 11, { t: 'د', cls: 'grade' });
    set(31, 10, { t: 'مشروط', cls: 'subj' }); set(31, 11, { t: 'هـ', cls: 'grade' });
    set(33, 10, { t: 'تکرار صنف', cls: 'subj' });
    /* ═══ محل امضاء (سطرهای ۳۶–۴۴) — عین فایل رسمی ═══ */
    set(35, 5, { t: 'محل امضاء', cs: 2, cls: 'gh' });
    set(35, 7, { t: 'امتحان چهارونیم ماه', cs: 2, cls: 'gh' });
    set(35, 9, { t: 'امتحان سالانه', cs: 3, cls: 'gh' });
    const sigs = ['امضاء نگران صنف', 'امضاء سر معلم', 'امضاء مدیر مکتب', 'امضاء ولی شاگرد'];
    sigs.forEach((t, i) => {
      set(36 + i * 2, 5, { t, cs: 2, rs: 2, cls: 'gh' });
      set(36 + i * 2, 7, { t: '', cs: 2, rs: 2 });
      set(36 + i * 2, 9, { t: '', cs: 3, rs: 2 });
    });
    /* ═══ یادداشت (سطرهای ۴۵–۴۶) ═══ */
    set(44, 5, { t: 'یادداشت: در صورت که شهرت،نمبر اساس، نمبر تذکره و یا سایر مشخصات مربوط به شاگرد مغایرت داشته باشد، الی مدت سه روز بعد از ابلاغ نتایج جهت اصلاح آن به اداره مکتب مراجعه نمایند.', cs: 7, rs: 2, cls: 'tiny' });
    /* ═══ ستون فقرات M — برچسب‌های چرخیدهٔ لبهٔ فرم (عین فایل رسمی) ═══ */
    set(6, 12, { t: vtx('شماره حاضری', 'vplain') });
    set(7, 12, { t: vtx('شهرت', 'vplain'), rs: 3 });
    set(10, 12, { t: vtx('نمبر اساس', 'vplain') });
    set(11, 12, { t: vtx('نمبر تذکره', 'vplain') });
    set(12, 12, { t: vtx('امتحانات', 'vplain'), rs: 4 });
    for (let i = 0; i < CAP_SUBJECTS; i++) set(16 + i, 12, { t: subjects[i] ? vtx(esc(subjects[i].name), 'vplain') : '' });
    set(37, 12, { t: vtx('مجموعه نمرات', 'vplain') });
    set(38, 12, { t: vtx('اوسط نمرات', 'vplain') });
    set(39, 12, { t: vtx('نتیجه', 'vplain') });
    set(40, 12, { t: vtx('درجه', 'vplain') });
    set(41, 12, { t: vtx('ضوابط حاضری', 'vplain'), rs: 5 });

    return `<div class="npage">${renderGrid(46, NW, NH, cells, 'nt', 'rtl')}
<div class="nlogo" style="left:2mm"><img src="${SCHOOL_LOGO_NOTICE}" style="width:17mm;height:auto"/></div>
<div class="nlogo" style="right:2mm"><img src="${MINISTRY_NOTICE}" style="width:18mm;height:auto"/></div></div>`;
  });

  return docShell(`اطلاع‌نامه‌ها — ${d.className}`, 'portrait', pages.join(''), NOTICE_CSS);
}
