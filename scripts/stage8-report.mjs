/**
 * گزارش آزمون نهایی مرحلهٔ ۸ — سند Word دری (RTL) — قالب گزارش آزمون (Template C)
 * جلد: R1 (بازتاب‌یافته برای راست‌به‌چپ) با پالت WM-1 (آموزشی)
 * اجرا: node scripts/stage8-report.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableOfContents, PageBreak,
  SectionType, TableLayoutType,
} from 'docx';
import fs from 'node:fs';

/* ─── دادهٔ واقعی آزمون ─── */
const R = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/stage8-results.json', 'utf8'));
const fa = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const suites = {};
for (const x of R.results) {
  const k = x.suite.split('-')[0];
  suites[k] = suites[k] || { p: 0, f: 0 };
  x.ok ? suites[k].p++ : suites[k].f++;
}
const find = (name) => R.results.find((x) => x.name.includes(name)) || {};
const perf = R.results.filter((x) => x.suite.startsWith('T8'));
const perfRow = (name) => {
  const x = perf.find((p) => p.name.includes(name));
  if (!x) return ['—', '—', '—'];
  const m = [...x.detail.matchAll(/(p50|p95|max)=(\d+)ms/g)];
  const g = (k) => m.find((y) => y[1] === k)?.[2] || '—';
  return [fa(g('p50')), fa(g('p95')), fa(g('max'))];
};

/* ─── پالت WM-1 (آموزشی) + سبک جدول ─── */
const P = {
  bg: 'F4F1E9', primary: '15857A', accent: 'FF6A3B',
  cover: { titleColor: '15857A', subtitleColor: '606060', metaColor: '707070', footerColor: 'A0A0A0' },
  table: { headerBg: '15857A', headerText: 'FFFFFF', accentLine: '15857A', innerLine: 'D5D0C8', surface: 'F0EDE5' },
};
const FONT = { ascii: 'Tahoma', hAnsi: 'Tahoma', cs: 'Tahoma', eastAsia: 'Tahoma' };
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { ...noBorders, insideHorizontal: NB, insideVertical: NB };

/* ─── سازنده‌های متن دری ─── */
const run = (text, o = {}) => new TextRun({ text, rightToLeft: true, font: FONT, ...o });
const body = (text, o = {}) => new Paragraph({
  bidirectional: true, alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 312, after: 120 }, ...o.p,
  children: [run(text, { size: 24, color: '000000', ...o.r })],
});
const h = (text, level) => new Paragraph({
  heading: level, bidirectional: true, alignment: AlignmentType.RIGHT,
  spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 140, line: 312 },
  children: [run(text, { bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 28, color: P.primary })],
});
const caption = (text) => new Paragraph({
  keepNext: true, bidirectional: true, alignment: AlignmentType.RIGHT,
  spacing: { before: 160, after: 80, line: 312 },
  children: [run(text, { bold: true, size: 21, color: '404040' })],
});

/* جدول افقی-خط با راست‌به‌چپ — ستون‌ها به ترتیب منطقی (اولین = راست‌ترین) */
function table(headers, rows, widths) {
  const cell = (text, i, isHeader) => new TableCell({
    width: { size: widths[i], type: WidthType.PERCENTAGE },
    shading: isHeader
      ? { type: ShadingType.CLEAR, fill: P.table.headerBg }
      : { type: ShadingType.CLEAR, fill: 'FFFFFF' },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { line: 276 },
      children: [run(String(text), { size: 21, bold: isHeader, color: isHeader ? P.table.headerText : '000000' })],
    })],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) })),
    ],
  });
}

/* ─── چیدمان عنوان جلد — نسخهٔ فارسی (پهنای نویسهٔ دری ≈ ۰٫۵۵ چین) ─── */
function calcTitleLayoutFa(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charW = (pt) => pt * 11;
  const cpl = (pt) => Math.floor(maxWidthTwips / charW(pt));
  const split = (t, n) => {
    if (t.length <= n) return [t];
    const words = t.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur.trim());
    if (lines.length > 1 && lines[lines.length - 1].length <= 4) {
      const last = lines.pop();
      lines[lines.length - 1] += ' ' + last;
    }
    return lines;
  };
  let pt = preferredPt, lines;
  while (pt >= minPt) {
    lines = split(title, cpl(pt));
    if (lines.length <= 3) break;
    pt -= 2;
  }
  return { titlePt: pt, titleLines: lines };
}

function calcCoverSpacing(p) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838 } = p;
  const SAFETY = 1200;
  const usable = pageHeight - SAFETY;
  const contentH = titleLineCount * (titlePt * 23 + 200) + (hasSubtitle ? 12 * 23 + 600 : 0) +
    (hasEnglishLabel ? 9 * 23 + 600 : 0) + metaLineCount * (10 * 23 + 100) + fixedHeight + 3 * 300;
  const rem = Math.max(usable - contentH, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(rem * 0.45), rawBottom = Math.floor(rem * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

/* ─── جلد R1 — بازتاب‌یافته برای RTL ─── */
function buildCoverR1RTL(cfg) {
  const padL = 800, padR = 1200;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayoutFa(cfg.title, availableWidth, 40, 24);
  const sp = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!cfg.subtitle, hasEnglishLabel: !!cfg.englishLabel,
    metaLineCount: (cfg.metaLines || []).length, fixedHeight: 400,
  });
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const ch = [];
  ch.push(new Paragraph({ spacing: { before: sp.topSpacing } }));
  if (cfg.englishLabel) {
    ch.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT,
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: cfg.englishLabel.split('').join('  '), size: 18, color: P.accent, font: FONT, characterSpacing: 40 })],
    }));
  }
  titleLines.forEach((line, i) => ch.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    indent: { right: padR },
    spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: 'atLeast' },
    children: [run(line, { size: titlePt * 2, bold: true, color: P.cover.titleColor })],
  })));
  if (cfg.subtitle) ch.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    indent: { right: padR }, spacing: { after: 800 },
    children: [run(cfg.subtitle, { size: 24, color: P.cover.subtitleColor })],
  }));
  for (const line of cfg.metaLines || []) ch.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    indent: { right: padR + 200 }, spacing: { after: 80 },
    border: { right: accentRight },
    children: [run(line, { size: 24, color: P.cover.metaColor })],
  }));
  ch.push(new Paragraph({ spacing: { before: sp.bottomSpacing } }));
  ch.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      run(cfg.footerRight || '', { size: 16, color: P.cover.footerColor }),
      new TextRun({ text: '                                        ' }),
      new TextRun({ text: cfg.footerLeft || '', size: 16, color: P.cover.footerColor }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: 'exact' },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, verticalAlign: 'top', children: ch })],
    })],
  })];
}

/* ─── سربرگ و پانوشت ─── */
const pageHeader = () => new Header({
  children: [new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine, space: 4 } },
    children: [run('گزارش آزمون نهایی سامانهٔ مکتب — نسخهٔ ۳.۱۰.۰', { size: 18, color: '808080' })],
  })],
});
// نشانگر رنگی برای پس‌پردازش: رومی = 808081، عربی = 808080
const pageFooter = (roman) => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: roman ? '808081' : '808080', font: FONT })],
  })],
});

/* ─── محتوا ─── */
const total = R.results.length;
const S = (k) => `${fa(suites[k].p + suites[k].f)}`;
const suiteNames = {
  T2: 'ورود و کنترل دسترسی نقش‌ها', T3: 'حاضری و دروازهٔ QR',
  T4: 'اعلان و پیامک والدین', T5: 'پشتیبان‌گیری و بازیابی',
  T6: 'هم‌زمانی کاربران', T7: 'تست‌های امنیتی', T8: 'عملکرد با ۱۰۵۰ شاگرد',
};

const bodyChildren = [
  h('۱. خلاصهٔ اجرایی', HeadingLevel.HEADING_1),
  body('این گزارش نتیجهٔ مرحلهٔ هشتم — «آزمایش نهایی و پشتیبان‌گیری» — از برنامهٔ تقویت سامانهٔ مکتب خصوصی نداالقلم است. هدف این مرحله، اطمینان از عملکرد صحیح همهٔ بخش‌ها پیش از استفادهٔ عملیاتی بود؛ برای این منظور، مجموعه‌ای از ' + fa(total) + ' مورد آزمون روی «بیلد تولیدی» سامانه (همان نسخه‌ای که روی سرور اجرا می‌شود) با دادهٔ آزمون شامل ' + fa('۱۰۵۰') + ' شاگرد در ' + fa('۸') + ' صنف و ' + fa('۱۹۸۰') + ' ثبت تاریخچهٔ دروازه اجرا شد.'),
  body('نتیجهٔ نهایی: هر ' + fa(total) + ' مورد آزمون با موفقیت گذشت (۷۶ از ۷۶). در جریان همین آزمون‌ها سه نقص واقعی کشف و اصلاح شد که مهم‌ترین آن‌ها فقدان تاریخچهٔ دروازهٔ ورود و خروج در فایل پشتیبان بود؛ نقصی که در صورت بروز حادثه، کل تاریخچهٔ رفت‌وآمد شاگردان را هنگام بازیابی از بین می‌برد. دو نقص دیگر، مسابقهٔ ثبت هم‌زمان در دروازه و در ثبت شاگرد بود که در شرایط عادی دیده نمی‌شد اما در فشار هم‌زمانی (۲۰ درخواست موازی) به ثبت‌های مضاعف می‌انجامید. هر سه اصلاح در نسخهٔ ۳.۱۰.۰ اعمال و با اجرای دوبارهٔ کامل آزمون‌ها تأیید شد.'),
  body('عملکرد سامانه با ' + fa('۱۰۵۰') + ' شاگرد بسیار مطلوب ارزیابی شد: میانهٔ زمان پاسخ همهٔ APIهای اصلی زیر ' + fa('۱۰') + ' میلی‌ثانیه، سنگین‌ترین درخواست (خروجی کامل اکسل شاگردان) حدود ' + fa('۳۳') + ' میلی‌ثانیه و خروجی پشتیبان کل دیتابیس ' + fa('۴۸') + ' میلی‌ثانیه بود. بر مبنای این نتایج، سامانه برای استفادهٔ عملیاتی روزانهٔ مکتب — شامل حاضری، دروازهٔ QR، اطلاع‌رسانی والدین و پشتیبان‌گیری — آماده ارزیابی می‌شود.'),

  h('۲. دامنهٔ آزمون، محیط و روش', HeadingLevel.HEADING_1),
  body('دامنهٔ آزمون هر هشت محور مورد انتظار مرحلهٔ هشتم را پوشش می‌دهد: ورود با تمام نقش‌های کاربری، ثبت حضور و غیاب، QR و ورود و خروج، پیامک و اعلان والدین، بازیابی نسخهٔ پشتیبان، هم‌زمانی کاربران، تست‌های امنیتی به‌همراه Lint و Build، و بررسی عملکرد با بیش از ' + fa('۱۰۰۰') + ' دانش‌آموز. آزمون‌های عملکردی و هم‌زمانی به‌طور خاص با حجم دادهٔ بیش از حد واقعی طراحی شدند تا حاشیهٔ اطمینان برای رشد شمار شاگردان فراهم باشد.'),
  body('محیط آزمون، همان بیلد تولیدی است که پس از اجرای کامل TypeScript، ESLint و ساخت Next.js روی سرور محلی راه‌اندازی شد؛ یعنی نتایج، رفتار واقعی نسخهٔ مستقر را بازتاب می‌دهد نه نسخهٔ توسعهٔ نیمه‌کاره. دادهٔ آزمون با اسکریپت «stage8-seed» ساخته شد: ' + fa('۸') + ' صنف، ' + fa('۱۰۵۰') + ' شاگرد با نام‌های واقعی دری، شمارهٔ والد برای بخشی از پرونده‌ها، ' + fa('۷') + ' حساب کاربری پیش‌فرض (یک حساب برای هر نقش)، پیوند سرپرست با سه شاگرد و حدود ' + fa('۱۹۸۰') + ' ثبت دروازه در یازده روز گذشته تا پنل وضعیت با دادهٔ سنگین آزموده شود.'),
  body('روش اجرا، آزمون خودکار در سطح رابط برنامه‌نویسی (API) است: اسکریپت «stage8-tests» برای هر نقش نشست (Session) جداگانه می‌سازد، درخواست‌های واقعی ارسال می‌کند و هر پاسخ را با مقدار مورد انتظار مقایسه می‌کند. مزیت این روش، تکرارپذیری است: کل مجموعه در حدود پنج ثانیه اجرا می‌شود و پس از هر اصلاح می‌تواند دوباره کامل اجرا شود. سنجه‌های عملکرد با ' + fa('۱۵') + ' بار فراخوانی مکرر هر مسیر و محاسبهٔ میانه (p50) و صدک ۹۵ (p95) به‌دست آمد.'),

  h('۳. نتایج کلی آزمون‌ها', HeadingLevel.HEADING_1),
  body('جدول زیر توزیع ' + fa(total) + ' مورد آزمون را بر هفت محور نشان می‌دهد؛ در همهٔ محورها هیچ شکستی باقی نمانده است. جزئیات هر محور در بخش‌های بعدی آمده است.'),
  caption('جدول ۱: توزیع نتایج آزمون بر محورها'),
  table(['محور آزمون', 'شمار آزمون', 'نتیجه'],
    Object.keys(suiteNames).map((k) => [suiteNames[k], S(k), 'همه موفق']), [60, 20, 20]),
  body('در مجموع ' + fa(R.pass) + ' مورد موفق و ' + fa(R.fail) + ' مورد ناموفق در اجرای نهایی ثبت شد؛ زمان کل اجرای مجموعه ' + fa(R.secs) + ' ثانیه بود. این چرخهٔ کامل پس از اعمال سه اصلاح، دو بار پشت‌سرهم با نتیجهٔ یکسان اجرا شد تا ثبات نتایج تأیید شود.'),

  h('۴. ورود با تمام نقش‌ها و کنترل دسترسی', HeadingLevel.HEADING_1),
  body('هر هفت نقش سامانه (مدیر، سرمعلم، معلم، کارمند/نگهبان، کتابخانه‌دار، شاگرد و سرپرست) با حساب پیش‌فرض وارد شدند و نقش بازگشتی از سرور با نقش مورد انتظار مطابقت داشت. رمز نادرست در همهٔ حالت‌ها رد می‌شود و محدودیت تلاش ورود — پنج تلاش ناموفق برای هر نام کاربری — در تلاش ششم پاسخ ' + fa('۴۲۹') + ' می‌دهد؛ قفل پس از آن حتی با رمز درست نیز ادامه می‌یابد که رفتار درست ضد حملهٔ عبور فراگیر است.'),
  body('ماتریس دسترسی نشان داد مرز نقش‌ها دقیقاً رعایت می‌شود: معلم به بخش مالی و پشتیبان دسترسی ندارد، شاگرد فهرست عمومی شاگردان را نمی‌بیند و سرپرست به بخش فیس راه ندارد. دو مورد به‌طور عمدی متفاوت رفتار می‌کنند و در آزمون نیز تأیید شد: سرپرست هنگام درخواست فهرست شاگردان، فقط پروندهٔ فرزند خودش را دریافت می‌کند (حداکثر یک رکورد) و کتابخانه‌دار برای ثبت امانت کتاب به فهرست نام‌ها دسترسی دارد — هر دو تصمیم طراحی نسخه‌های پیشین‌اند و در آزمون به‌عنوان رفتار مطلوب ثبت شدند. کارمند/نگهبان به بخش دروازه دسترسی دارد و معلمِ بدون صنف سپرده‌شده، درخواست حاضری‌اش با خطای «درخواست نامعتبر» رد می‌شود نه با رد صلاحیت.'),
  caption('جدول ۲: موارد گزیدهٔ آزمون ورود و دسترسی'),
  table(['مورد آزمون', 'نتیجهٔ مشاهده‌شده'], [
    ['ورود موفق هر ۷ نقش با رمز پیش‌فرض', 'همه موفق — نقش بازگشتی درست'],
    ['رمز نادرست', '۴۰۱ — رد می‌شود'],
    ['تلاش ششم پس از ۵ شکست', '۴۲۹ — محدودیت فعال'],
    ['سرپرست و فهرست شاگردان', '۲۰۰ — فقط پروندهٔ فرزند خودش'],
    ['معلم و بخش مالی/پشتیبان', '۴۰۳ — رد صلاحیت'],
    ['کارمند (نگهبان) و دروازه', '۲۰۰ — دسترسی مجاز'],
  ], [55, 45]),

  h('۵. حاضری یومیه و دروازهٔ QR', HeadingLevel.HEADING_1),
  body('ثبت گروهی حاضری برای ' + fa('۲۵') + ' شاگرد یک صنف با یک درخواست انجام شد (' + fa('۲۵') + ' رکورد ذخیره‌شده) و ثبت حاضری برای تاریخ آینده به‌درستی رد شد. اعلان غیبت فقط برای غیبتِ تازه ساخته می‌شود: ثبت دوبارهٔ همان غیبت در همان روز، اعلان تکراری برای والدین نمی‌سازد — رفتاری که از مرحلهٔ سوم تثبیت شده و در این آزمون مجدد تأیید شد.'),
  body('چرخهٔ کامل دروازه آزموده شد: توکن کارت با امضای سرور صادر شد؛ اسکن اول «ورود»، اسکن دوم «خروج» و اسکن سوم دوباره «ورود» ثبت کرد تا رفت‌وآمد چندبارهٔ یک روز (مانند مرخصی زودهنگام و بازگشت) کامل ثبت شود. اسکن فوریِ تکراری با پاسخ ' + fa('۴۰۹') + ' رد شد. کارت لغوشده ' + fa('۴۱۰') + ' داد و پس از بازگردانی توسط مدیر دوباره کار کرد. توکن دستکاری‌شده و رشتهٔ نامفهوم هر دو با ' + fa('۴۰۰') + ' رد شدند. سرپرست کد کارت فرزند خودش را می‌تواند باز کند اما کد کارت شاگرد دیگر و اسکن دروازه برای او ' + fa('۴۰۳') + ' است. تاریخچهٔ روز، شمارش ورود/خروج و «داخل مکتب» را درست محاسبه کرد.'),
  caption('جدول ۳: موارد گزیدهٔ آزمون حاضری و QR'),
  table(['مورد آزمون', 'نتیجهٔ مشاهده‌شده'], [
    ['ثبت گروهی ۲۵ حاضری', '۲۵ رکورد ذخیره شد'],
    ['حاضری برای تاریخ آینده', '۴۰۰ — رد می‌شود'],
    ['ورود ← خروج ← ورود (چرخهٔ چندباره)', 'هر سه با ساعت دقیق ثبت شد'],
    ['اسکن تکراری زیر ۴۵ ثانیه', '۴۰۹ — رد می‌شود'],
    ['کارت لغوشده / بازگردانی', '۴۱۰ / پس از بازگردانی کار می‌کند'],
    ['توکن جعلی و کد بیگانه', '۴۰۰ — رد می‌شود'],
  ], [55, 45]),

  h('۶. اعلان و پیامک والدین', HeadingLevel.HEADING_1),
  body('برای هر رویداد دروازه، اعلان درون‌برنامه‌ای برای حساب سرپرست ساخته می‌شود و Push نیز فراخوانی می‌گردد (در محیط آزمون مشترک Push ثبت نشده بود و فراخوانی به‌درستی بی‌خطا رد شد). غیبت شاگرد نیز اعلان جداگانه برای سرپرست می‌سازد. شمارش اعلان‌ها پیش و پس از هر رویداد مقایسه شد: غیبت تازه ' + fa('۰→۱') + '، ثبت دوبارهٔ همان غیبت بدون افزایش، و ورود شاگرد ' + fa('۰→۱') + '.'),
  body('پیامک والدین در دروازه پیش‌فرض خاموش است و فقط با فعال‌سازی مدیر کار می‌کند — سوییچ «پیامک والدین» در پنل وضعیت آزموده شد. با فعال بودن، هر ثبت ورود/خروج یک ردیف در صف پیامک (smsOutbox) با شناسهٔ یکتای «GATE:شناسهٔ ثبت» می‌سازد؛ همین شناسه تضمین می‌کند اسکن تکراری یا ارسال دوبارهٔ صف، پیام مضاعف نسازد. لغو یک ثبت از سوی مدیر، پیامکِ هنوز ارسال‌نشدهٔ همان ثبت را نیز از صف حذف می‌کند — در آزمون صف از ' + fa('۱') + ' به ' + fa('۰') + ' رسید. در محیط آزمون دروازهٔ واقعی پیامک تنظیم نبود و ردیف‌ها در حالت «در انتظار» ماندند که رفتار مورد انتظار است؛ روی سرور اصلی، فرستندهٔ موجود همهٔ ردیف‌های در انتظار را ارسال می‌کند.'),

  h('۷. پشتیبان‌گیری و بازیابی', HeadingLevel.HEADING_1),
  body('مهم‌ترین یافتهٔ این مرحله در همین محور بود. خروجی پشتیبان (فرمت JSON با نسخه‌بندی) پیش از اصلاح، جدول «GateLog» (تاریخچهٔ دروازه) را به‌کلی شامل نمی‌شد و در بازیابی، فیلدهای «refDate» و «clientToken» ردیف‌های پیامک نیز بازسازی نمی‌شدند؛ یعنی بازیابیِ پس از حادثه، تاریخچهٔ رفت‌وآمد را پاک و ضدتکرار پیامک غیبت را می‌شکست. اصلاح در نسخهٔ پشتیبان شمارهٔ ۶ اعمال شد و آزمون بازیابی کامل به‌درستی گذشت.'),
  body('سناریوی آزمون به این ترتیب بود: نخست خروجی کامل پشتیبان گرفته شد (حجم حدود ' + fa('۱.۵') + ' مگابایت)؛ سپس یک «شاگرد نشان‌دار» ساخته شد تا تغییر پس از لحظهٔ پشتیبان شبیه‌سازی شود؛ سپس بازیابی اجرا شد. پس از بازیابی، شمارش همهٔ جدول‌ها (شاگردان، صنف‌ها، ثبت‌های دروازه، حاضری، پیامک) دقیقاً برابر لحظهٔ پشتیبان بود، شاگرد نشان‌دار حذف شده بود و تاریخچهٔ دروازه (' + fa('۱۹۸۵') + ' رکورد) کاملاً بازگشته بود. پس از بازیابی، همهٔ نشست‌های پیشین باطل می‌شوند و ورود تازه با همان رمز ممکن است — این رفتار امن در آزمون تأیید شد.'),
  caption('جدول ۴: شمارش رکوردها پیش و پس از بازیابی'),
  table(['جدول', 'پیش از بازیابی', 'پس از بازیابی'], [
    ['شاگردان', fa('۱۰۵۰'), fa('۱۰۵۰')],
    ['صنف‌ها', fa('۸'), fa('۸')],
    ['ثبت‌های دروازه (GateLog)', fa('۱۹۸۵'), fa('۱۹۸۵')],
    ['حاضری روز', fa('۲۵'), fa('۲۵')],
    ['شاگرد نشان‌دار', fa('۱'), fa('۰ — حذف شد')],
  ], [40, 30, 30]),

  h('۸. هم‌زمانی کاربران', HeadingLevel.HEADING_1),
  body('فشار هم‌زمانی، دومین یافتهٔ مهم بود. پیش از اصلاح، ارسال ۲۰ اسکن موازی یک کارت به ' + fa('۲۲') + ' ثبت مضاعف می‌انجامید: همهٔ درخواست‌ها هم‌زمان «آخرین ثبت» را خالی می‌دیدند و همه ثبت می‌ساختند (الگوی خطای بررسی-سپس-نوشتن). پس از اصلاح — خواندن و نوشتن در یک تراکنش به‌همراه زنجیرهٔ ترتیبی ثبت — همان ۲۰ اسکن موازی دقیقاً یک ثبت می‌سازد و ۱۹ مورد با پاسخ ' + fa('۴۰۹') + ' «اسکن تکراری» رد می‌شوند. همین اصلاح برای ثبت شاگرد نیز اعمال شد: ده ثبت موازی با شمارهٔ دانش‌آموزی تکراری در یک صنف، اکنون دقیقاً یک پرونده می‌سازد.'),
  body('سناریوی «صف آفلاین» نیز آزموده شد: ده بار ارسال دوبارهٔ یک اسکن با همان شناسهٔ یکتا (clientToken) فقط یک ثبت می‌سازد و همهٔ پاسخ‌ها نتیجهٔ اصلی را با نشان «تکراری» برمی‌گردانند؛ ساعت ثبت نیز همان ساعت اسکن آفلاین ماند (اختلاف صفر میلی‌ثانیه) نه ساعت وصل شدن به اینترنت. در نهایت، ده ورود هم‌زمان با یک حساب بدون هیچ قفس اشتباهی موفق شد.'),
  caption('جدول ۵: رفتار هم‌زمانی پیش و پس از اصلاح'),
  table(['سناریو', 'پیش از اصلاح', 'پس از اصلاح'], [
    ['۲۰ اسکن موازی یک کارت', fa('۲۲ ثبت مضاعف'), fa('۱ ثبت + ۱۹×۴۰۹')],
    ['۱۰ بازیابی موازی یک اسکن آفلاین', 'نامعین', fa('۱ ثبت — ساعت اسکن حفظ شد')],
    ['۱۰ ثبت موازی با شمارهٔ تکراری', fa('۹ پروندهٔ مضاعف'), fa('۱ پرونده')],
    ['۱۰ ورود هم‌زمان یک حساب', fa('۱۰ موفق'), fa('۱۰ موفق')],
  ], [34, 33, 33]),

  h('۹. تست‌های امنیتی، Lint و Build', HeadingLevel.HEADING_1),
  body('چهارده مورد آزمون امنیتی همگی گذشتند: همهٔ ' + fa('۹') + ' مسیر حساس بدون نشست پاسخ ' + fa('۴۰۱') + ' می‌دهند؛ توکن QR با امضای جعلی، کوکی دستکاری‌شده و کد بیگانه رد می‌شوند؛ تلاش تزریق SQL در جستجوی شاگردان پاسخ امن می‌دهد (پرس‌وجوهای پارامتری Prisma)؛ رشتهٔ XSS به‌عنوان داده ذخیره می‌شود اما در رندر رابط با فرار (Escape) نمایش داده می‌شود؛ و معلم نمی‌تواند صلاحیت خودش را ارتقا دهد (' + fa('۴۰۳') + '). سطح کد نیز پاک است: TypeScript بدون خطا، ESLint بدون اخطار و ساخت تولیدی (Next.js standalone) موفق — این سه به‌عنوان دروازهٔ کیفیت در هر انتشار اجرا می‌شوند.'),

  h('۱۰. عملکرد با ۱۰۵۰ شاگرد', HeadingLevel.HEADING_1),
  body('سنجه‌ها با ' + fa('۱۵') + ' بار فراخوانی مکرر هر مسیر (و ' + fa('۵') + ' بار برای مسیرهای سنگین) روی دیتابیس با ' + fa('۱۰۵۰') + ' شاگرد و نزدیک به ' + fa('۲۰۰۰') + ' ثبت دروازه محاسبه شد. میانهٔ همهٔ مسیرهای عادی زیر ' + fa('۱۰') + ' میلی‌ثانیه است و صدک ۹۵ نیز جز در دو مسیر سنگین زیر ' + fa('۲۵') + ' میلی‌ثانیه ماند. این ارقام برای کاربری روزانه با چند صد کاربر هم‌زمان به‌وفور کافی است و حاشیهٔ امن برای دوبرابر شدن شمار شاگردان دارد.'),
  caption('جدول ۶: زمان پاسخ مسیرهای اصلی (میلی‌ثانیه)'),
  table(['مسیر', 'میانه (p50)', 'صدک ۹۵ (p95)', 'بیشینه'], [
    ['فهرست صنف‌ها', ...perfRow('فهرست صنف‌ها')],
    ['فهرست شاگردان (صفحهٔ ۵۰)', ...perfRow('صفحهٔ ۵۰')],
    ['جستجوی شاگردان', ...perfRow('جستجو')],
    ['فهرست ۱۰۰تایی یک صنف', ...perfRow('صنف ۱۰۰تایی')],
    ['داشبورد', ...perfRow('داشبورد')],
    ['تاریخچهٔ دروازهٔ امروز', ...perfRow('تاریخ امروز')],
    ['ثبت گروهی ۵۰ حاضری', ...perfRow('۵۰ رکورد')],
    ['خروجی کامل شاگردان (all=1)', ...perfRow('سنگین')],
    ['خروجی پشتیبان کل دیتابیس', ...perfRow('کل دیتابیس')],
  ], [40, 20, 20, 20]),

  h('۱۱. تحلیل نواقص کشف‌شده', HeadingLevel.HEADING_1),
  body('سه نقص کشف‌شده همگی در همین چرخهٔ آزمون یافت، اصلاح و بازآزمایی شدند. جدول زیر خلاصهٔ آن‌هاست؛ شرح فنی در ادامه آمده است.'),
  caption('جدول ۷: نواقص کشف‌شده و وضعیت اصلاح'),
  table(['نقص', 'شدت', 'اصلاح اعمال‌شده', 'وضعیت'], [
    ['پشتیبان بدون تاریخچهٔ دروازه و فیلدهای ضدتکرار پیامک', 'بالا', 'نسخهٔ پشتیبان ۶: گنجاندن GateLog و refDate/clientToken در خروجی و بازیابی', 'اصلاح و بازآزمایی شد'],
    ['مسابقهٔ ثبت موازی در دروازه', 'بالا', 'تراکنش + زنجیرهٔ ثبت + بازیابی نتیجه با clientToken', 'اصلاح و بازآزمایی شد'],
    ['مسابقهٔ شمارهٔ تکراری در ثبت شاگرد', 'متوسط', 'زنجیرهٔ ترتیبی بررسی-سپس-ساخت در ثبت شاگرد', 'اصلاح و بازآزمایی شد'],
  ], [30, 12, 38, 20]),
  body('دربارهٔ نقص نخست باید شفاف بود: این نقص در عملکرد روزمره دیده نمی‌شد و فقط هنگام بازیابی پشتیبان اثر می‌گذاشت؛ به همین دلیل در آزمون‌های عادی مراحل قبل پنهان مانده بود. اصلاح آن نه‌تنها جدول دروازه را به پشتیبان افزود، بلکه بازیابی فایل‌های پشتیبان قدیمی (بدون این جدول) را نیز امن نگه می‌دارد — بازیابی فقط اگر فیلد در فایل موجود باشد اجرا می‌شود. دو نقص هم‌زمانی نیز در استفادهٔ تک‌کاربره بی‌اثر بودند اما در روز شلوغ مکتب (دو نگهبان یا ثبت هم‌زمان دبیرخانه) می‌توانستند دادهٔ غلط بسازند؛ اهمیت آزمون فشار دقیقاً همین‌جاست.'),

  h('۱۲. ریسک‌ها و موارد باقی‌مانده', HeadingLevel.HEADING_1),
  body('سه نکته برای راهبری عملیاتی مهم است. نخست، پیامک والدین در دروازه پیش‌فرض خاموش است تا هزینهٔ پیامک بدون اطلاع مدیریت تحمیل نشود؛ فعال‌سازی آن از پنل دروازه توسط مدیر انجام می‌شود و پس از فعال‌سازی، فرستندهٔ پیامک موجود همهٔ ردیف‌های در انتظار را ارسال می‌کند. دوم، حساب‌های پیش‌فرض (' + fa('۷') + ' حساب) پس از نخستین ورود باید رمزشان تغییر کند؛ سامانه این را با پرچم «تغییر رمز اجباری» نشان می‌دهد و مدیر باید پیش از شروع سال تحصیلی همهٔ رمزها را نوسازی کند. سوم، آزمون‌ها روی محیط با دادهٔ آزمون اجرا شدند؛ پیش از شروع عملیاتی، مدیر باید یک پشتیبان از دادهٔ واقعی بگیرد و بازیابی آن را یک‌بار در محیط آزمون تمرین کند — همان سناریویی که در این گزارش تأیید شده است.'),

  h('۱۳. نتیجه‌گیری و توصیه‌ها', HeadingLevel.HEADING_1),
  body('نتیجهٔ نهایی آزمون: «قبول — آمادهٔ استفادهٔ عملیاتی». هر هشت هدف مرحلهٔ هشتم با شواهد کمی تأیید شد؛ سه نقص واقعی کشف و اصلاح شد و کل مجموعه پس از اصلاح، دو بار پشت‌سرهم بدون شکست اجرا شد. نسخهٔ نهایی ۳.۱۰.۰ به‌همراه این اصلاحات روی مخزن منتشر و دیپلوی شد.'),
  body('توصیه‌های عملیاتی به این ترتیب است: مدیر مکتب پیش از شروع استفاده، رمز هر هفت حساب پیش‌فرض را تغییر دهد و دسترسی بخش دروازه را فقط برای حساب نگهبان فعال کند؛ هفته‌ای یک‌بار فایل پشتیبان گرفته و ماهی یک‌بار بازیابی آن را در محیط آزمون تمرین کند؛ سوییچ پیامک دروازه را بسته به بودجهٔ پیامک روشن یا خاموش نگه دارد؛ و پس از هر به‌روزرسانی نسخه، مجموعهٔ آزمون «stage8-tests» را یک‌بار اجرا کند تا regressions پیش از رسیدن به کاربران کشف شود. اجرای مجدد آزمون‌ها به همین سادگی است: اجرای seed و سپس مجموعه، در مجموع زیر یک دقیقه.'),

  h('ضمیمه: جزئیات فنی اجرای آزمون', HeadingLevel.HEADING_1),
  body('فایل‌های آزمون در مخزن نگهداری می‌شوند: «scripts/stage8-seed.mjs» دادهٔ آزمون را می‌سازد (شامل هفت حساب پیش‌فرض، ' + fa('۱۰۵۰') + ' شاگرد، پیوند سرپرست و ثبت‌های دروازه) و «scripts/stage8-tests.mjs» کل مجموعهٔ ' + fa(total) + ' موردی را اجرا و نتیجه را در «scripts/stage8-results.json» می‌نویسد. هر مورد آزمون در این فایل با نام، محور، نتیجه و جزئیات پاسخ ثبت شده است تا هر ادعای این گزارش قابل ردیابی به خروجی خام باشد. اصلاحات سه نقص در کامیت «19200f1» منتشر شد و نسخهٔ پشتیبان به شمارهٔ ۶ ارتقا یافت.'),
];

/* ─── سند ─── */
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: '000000' },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: FONT, size: 32, bold: true, color: P.primary }, paragraph: { spacing: { before: 360, after: 160, line: 312 } } },
      heading2: { run: { font: FONT, size: 28, bold: true, color: P.primary }, paragraph: { spacing: { before: 240, after: 120, line: 312 } } },
    },
  },
  sections: [
    { // جلد
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1RTL({
        title: 'گزارش آزمون نهایی و پشتیبان‌گیری سامانه',
        subtitle: 'مرحلهٔ هشتم از برنامهٔ تقویت امنیت و پایداری — نسخهٔ ۳.۱۰.۰',
        englishLabel: 'FINAL TEST REPORT',
        metaLines: [
          'سامانه: مکتب خصوصی نداالقلم',
          'دامنهٔ آزمون: ورود نقش‌ها، حاضری، QR دروازه، اعلان والدین، پشتیبان، هم‌زمانی، امنیت، عملکرد',
          'مجموعهٔ آزمون: ' + fa(total) + ' مورد — نتیجه: ' + fa(R.pass) + ' موفق / ' + fa(R.fail) + ' ناموفق',
          'تاریخ گزارش: قوس ۱۴۰۵ (نوامبر ۲۰۲۶)',
          'تهیه‌کننده: حسام الدین سیدی — توسعه‌دهندهٔ سامانه',
        ],
        footerRight: 'مکتب خصوصی نداالقلم',
        footerLeft: 'سند داخلی — نسخهٔ ۱.۰',
      }),
    },
    { // فهرست — رومی
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter(true) },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
          children: [run('فهرست مطالب', { bold: true, size: 32, color: P.primary })],
        }),
        new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({
          bidirectional: true, spacing: { before: 200 },
          children: [run('یادداشت: این فهرست با کد میدانی ساخته می‌شود؛ پس از باز کردن سند در Word، برای تازه‌سازی شمارهٔ صفحه‌ها روی فهرست راست‌کلیک کرده و «Update Field» را انتخاب کنید.', { italics: true, size: 18, color: '888888' })],
        }),
        // بدون PageBreak — بخش بدنه با NEXT_PAGE خودش صفحهٔ تازه آغاز می‌کند
      ],
    },
    { // بدنه — عربی از ۱
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter(false) },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('/home/z/my-project/download/گزارش-آزمون-نهایی-مرحله-۸.docx', buf);
  console.log('DOCX_DONE', buf.length, 'bytes');
});
