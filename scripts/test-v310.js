/**
 * تست‌های نسخهٔ ۳.۱.۰ — ۸ مورد اصلاحی کاربر
 *
 * ۱) وب دسکتاپ: منوی کناری از md، بدون خطای کنسول
 * ۲) همگام‌سازی: ایدمپوتنسی پیام/پرداخت/شاگرد/کتاب (تکرار replay صف غیرممکن)
 * ۳) اعلان بیرون از اپ: کلید پوش در مسیر درست + poll با hasMore + اندروید
 * ۴) عدم تکرار اعلان: خواندن/حذف اعلان ماندگار روی سرور
 * ۵) حذف کامل پیام: فراخوانی → فشار دوم = حذف کامل
 * ۶) پیوست فایل/تصویر: ارسال + دریافت + نمایش متادیتا
 * ۷) کتابخانهٔ PDF: بارگذاری + دریافت فایل + متادیتا در فهرست
 * ۸) نمرات افغانستان: سقف دوره‌ای ۴۰/۶۰ + نهائی = مجموع + کامیاب/ناکام + تنظیمات
 *
 * اجرا: node scripts/test-v310.js  (سرور پروداکشن — BASE یا http://127.0.0.1:3100)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const jar = {}; // کوکی هر نشست

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✘ ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`); }
}

async function api(session, method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar[session] ? { Cookie: jar[session] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jar[session] = setCookie.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch { /* باینری/خالی */ }
  return { status: res.status, json };
}

(async () => {
  /* ═══ فاز ۱ — زیرساخت فایل‌ها ═══ */
  console.log('═ فاز ۱: زیرساخت فایل‌ها ═');

  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  check('سرویس‌ورکر نسخهٔ v13 است (کش تازه برای ۳.۱)', sw.includes("const VERSION = 'v13'"));
  check('سرویس‌ورکر هندلر push دارد', sw.includes("addEventListener('push'"));

  const manifest = fs.readFileSync(path.join(ROOT, 'apk-build/AndroidManifest.xml'), 'utf8');
  check('مانیفست versionCode 17 است', manifest.includes('android:versionCode="17"'));
  check('مانیفست versionName 3.1.0 است', manifest.includes('android:versionName="3.1.0"'));
  check('مجوز SCHEDULE_EXACT_ALARM (آلارم دقیق در Doze)', manifest.includes('android.permission.SCHEDULE_EXACT_ALARM'));
  check('مجوز REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', manifest.includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'));
  check('مجوز VIBRATE ثبت شده', manifest.includes('android.permission.VIBRATE'));

  const svc = fs.readFileSync(path.join(ROOT, 'apk-build/java/af/nedaalqalam/school/NotifyService.java'), 'utf8');
  check('NotifyService جبران صف‌به‌صف اعلان‌ها (hasMore) دارد', svc.includes('hasMore'));
  check('NotifyService آلارم دقیق Doze-محور دارد', svc.includes('setExactAndAllowWhileIdle'));
  check('NotifyService حفاظ آلارم هر پول دوباره مسلح می‌شود', svc.includes('scheduleAlarmWatchdog') && svc.split('scheduleAlarmWatchdog()').length >= 3);

  const mainAct = fs.readFileSync(path.join(ROOT, 'apk-build/java/af/nedaalqalam/school/MainActivity.java'), 'utf8');
  check('MainActivity استثنای باتری می‌خواهد (اعلان همیشه به‌موقع)', mainAct.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'));

  const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const schemaPg = fs.readFileSync(path.join(ROOT, 'prisma/schema.postgres.prisma'), 'utf8');
  for (const [label, s] of [['sqlite', schema], ['postgres', schemaPg]]) {
    check(`اسکیمای ${label}: clientToken روی Message/FeePayment/Student/Book`,
      (s.match(/clientToken\s+String\?\s+@unique/g) || []).length === 4);
    check(`اسکیمای ${label}: فیلدهای PDF کتاب`, s.includes('fileData') && s.includes('fileName') && s.includes('fileSize'));
    check(`اسکیمای ${label}: متادیتای پیوست پیام`, s.includes('attachName') && s.includes('attachType'));
  }

  const ver = fs.readFileSync(path.join(ROOT, 'src/lib/version.ts'), 'utf8');
  check('نسخهٔ اپ ۳.۱.۰ در version.ts', ver.includes("'3.1.0'"));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('package.json نسخهٔ 3.1.0', pkg.version === '3.1.0');

  const settingsApi = fs.readFileSync(path.join(ROOT, 'src/app/api/settings/route.ts'), 'utf8');
  check('کلیدهای نمرات افغانستان در whitelist تنظیمات',
    ['midtermMax', 'annualMax', 'passMark', 'passLabel', 'failLabel'].every((k) => settingsApi.includes(`'${k}'`)));

  const push = fs.readFileSync(path.join(ROOT, 'src/lib/client/push.ts'), 'utf8');
  check('اشتراک پوش وب از مسیر درست /api/push (ریشهٔ باگ اعلان وب)', !push.includes("fetch('/api/push/key'") && push.includes("fetch('/api/push'"));

  const libApi = fs.readFileSync(path.join(ROOT, 'src/app/api/library/route.ts'), 'utf8');
  check('کتابخانه: دریافت فایل PDF (?file=1)', libApi.includes("sp.get('file')"));
  check('کتابخانه: سقف حجم PDF', libApi.includes('MAX_BOOK_DATAURL'));

  const msgApi = fs.readFileSync(path.join(ROOT, 'src/app/api/messages/route.ts'), 'utf8');
  check('پیام: ایدمپوتنسی clientToken', msgApi.includes('clientToken') && msgApi.includes('duplicate: true'));
  check('پیام: حذف کامل با فشار دوم', msgApi.includes('hard: true'));
  check('پیام: فهرست بدون محتوای base64 پیوست', msgApi.includes('attachName'));

  check('pdf.worker برای مطالعهٔ داخل اپ موجود است', fs.existsSync(path.join(ROOT, 'public/pdf.worker.min.mjs')));
  check('فونت‌های استاندارد PDF.js کپی شده', fs.existsSync(path.join(ROOT, 'public/pdfjs/standard_fonts')));
  check('خوانندهٔ PDF در اپ ثبت شده', fs.existsSync(path.join(ROOT, 'src/components/app/pdf-reader.tsx')));

  const grading = fs.readFileSync(path.join(ROOT, 'src/lib/grading.ts'), 'utf8');
  check('grading.ts: نمرهٔ نهائی = مجموع (۴۰+۶۰)', grading.includes('DEFAULT_PERIOD_MAX') && grading.includes('subjectResult'));

  const apiClient = fs.readFileSync(path.join(ROOT, 'src/lib/client/api.ts'), 'utf8');
  check('کلاینت: توکن ایدمپوتنسی خودکار در صف', apiClient.includes('IDEMPOTENT_POSTS') && apiClient.includes('clientToken'));
  check('کلاینت: overlay اعلان‌ها برای خواندن تکی/حذف', apiClient.includes('notifications') && apiClient.includes("idFromUrl(e.url)"));
  check('کلاینت: هشدار سرریز صف بدون گم‌شدن بی‌صدا', apiClient.includes('noq:queue-drop'));

  /* ═══ فاز ۲ — سرور: ورود ═══ */
  console.log('═ فاز ۲: API سرور ═');
  const login = await api('admin', 'POST', '/api/auth', { action: 'login', username: 'admin', password: 'admin123' });
  check('ورود مدیر', login.status === 200 && login.json?.user?.id, login.json?.error);

  // ── مورد ۳: کلید پوش + poll ──
  const pushKey = await api('admin', 'GET', '/api/push');
  check('GET /api/push کلید VAPID عمومی می‌دهد (باگ اعلان وب رفع شد)', pushKey.status === 200 && !!pushKey.json?.publicKey, JSON.stringify(pushKey.json));
  const poll = await api('admin', 'GET', '/api/notifications/poll');
  check('poll فیلد hasMore دارد (جبران بیش از ۲۰ اعلان)', poll.status === 200 && typeof poll.json?.hasMore === 'boolean');

  // ── مخاطب برای پیام: کاربر معلم ──
  const contacts = await api('admin', 'GET', '/api/messages');
  const teacherContact = (contacts.json?.contacts || []).find((c) => c.role === 'TEACHER') || (contacts.json?.contacts || [])[0];
  check('مخاطبی برای تست پیام هست', !!teacherContact);

  // ── مورد ۲: ایدمپوتنسی پیام ──
  const ct = `ct-test-${Date.now()}`;
  const m1 = await api('admin', 'POST', '/api/messages', { body: 'تست ایدمپوتنسی ۳.۱', category: 'GENERAL', targets: [{ kind: 'users', userIds: [teacherContact.id] }], clientToken: ct });
  check('پیام اول ثبت شد', m1.status === 200 && !!m1.json?.id, JSON.stringify(m1.json));
  const m2 = await api('admin', 'POST', '/api/messages', { body: 'تست ایدمپوتنسی ۳.۱', category: 'GENERAL', targets: [{ kind: 'users', userIds: [teacherContact.id] }], clientToken: ct });
  check('ارسال مجدد با همان توکن → همان پیام (بدون تکرار)', m2.status === 200 && m2.json?.duplicate === true && m2.json?.id === m1.json.id, JSON.stringify(m2.json));
  check('شناسهٔ دو پاسخ یکی است', m1.json.id === m2.json.id);

  // ── مورد ۶: پیوست تصویر ──
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const mAtt = await api('admin', 'POST', '/api/messages', { body: 'با تصویر', category: 'GENERAL', targets: [{ kind: 'users', userIds: [teacherContact.id] }], attachment: { name: 'dot.png', type: 'image/png', data: tinyPng } });
  check('پیام با پیوست تصویر ثبت شد', mAtt.status === 200 && !!mAtt.json?.id, JSON.stringify(mAtt.json));
  const mAttGet = await api('admin', 'GET', `/api/messages?id=${mAtt.json.id}`);
  check('دریافت پیوست از سرور', mAttGet.status === 200 && mAttGet.json?.attachment?.data === tinyPng && mAttGet.json.attachment.name === 'dot.png');

  // ── مورد ۵: حذف کامل پیام (فراخوانی → حذف کامل) ──
  const del1 = await api('admin', 'DELETE', `/api/messages?id=${mAtt.json.id}`);
  check('حذف اول فرستنده = فراخوانی', del1.status === 200 && del1.json?.recalled === true, JSON.stringify(del1.json));
  const del1Get = await api('admin', 'GET', `/api/messages?id=${mAtt.json.id}`);
  check('پس از فراخوانی، متن جایگزین «این پیام حذف شد» است', del1Get.status === 200 && del1Get.json?.deleted === true && del1Get.json?.body === 'این پیام حذف شد');
  const del2 = await api('admin', 'DELETE', `/api/messages?id=${mAtt.json.id}`);
  check('فشار دوم = حذف کامل', del2.status === 200 && del2.json?.hard === true, JSON.stringify(del2.json));
  const del2Get = await api('admin', 'GET', `/api/messages?id=${mAtt.json.id}`);
  check('پس از حذف کامل، پیام دیگر وجود ندارد', del2Get.status >= 400, JSON.stringify(del2Get.json));
  // پاک‌سازی پیام تست ایدمپوتنسی
  await api('admin', 'DELETE', `/api/messages?id=${m1.json.id}`);
  await api('admin', 'DELETE', `/api/messages?id=${m1.json.id}`);

  // ── مورد ۴: اعلان — خواندن/حذف ماندگار ──
  const loginT = await api('teacher', 'POST', '/api/auth', { action: 'login', username: 'teacher', password: '12345678' });
  check('ورود معلم (نشست دوم)', loginT.status === 200 && !!loginT.json?.user?.id, JSON.stringify(loginT.json));
  // پاک‌سازی اعلان‌های کهنهٔ اجراهای قبلی (پایگاه دادهٔ آزمون) — فهرست ۵۰تایی شلوغ نشود
  await api('teacher', 'DELETE', '/api/notifications');
  // پیام تازه به خودِ کاربر معلمِ نشست دوم (نه مخاطب تصادفی از فهرست) — اعلانش باید ساخته شود
  const teacherUserId = loginT.json.user.id;
  const mNotif = await api('admin', 'POST', '/api/messages', { body: 'تست اعلان ۳.۱', category: 'GENERAL', targets: [{ kind: 'users', userIds: [teacherUserId] }] });
  check('پیام برای معلم ارسال شد', mNotif.status === 200 && !!mNotif.json?.id, JSON.stringify(mNotif.json));
  // notifyRecipients آتش‌وفراموش است — تا ۵ ثانیه منتظر ساخته‌شدن اعلان می‌مانیم
  let notif = null;
  let nBefore = null;
  for (let i = 0; i < 10 && !notif; i++) {
    await new Promise((r) => setTimeout(r, 500));
    nBefore = await api('teacher', 'GET', '/api/notifications');
    notif = (nBefore.json?.notifications || []).find((n) => !n.read && n.messageId === mNotif.json?.id);
  }
  check('اعلان پیام تازه برای معلم آمده است', !!notif, JSON.stringify((nBefore?.json?.notifications || [])[0]));
  if (notif) {
    const patch = await api('teacher', 'PATCH', '/api/notifications', { id: notif.id });
    check('خواندن اعلان روی سرور ثبت می‌شود', patch.status === 200);
    const nAfter = await api('teacher', 'GET', '/api/notifications');
    const again = (nAfter.json?.notifications || []).find((n) => n.id === notif.id);
    check('اعلان خوانده‌شده دیگر نخوانده نیست (بعد از رفرش برنمی‌گردد)', !again || again.read === true);
    const delN = await api('teacher', 'DELETE', `/api/notifications?id=${notif.id}`);
    check('حذف اعلان', delN.status === 200);
    const nFinal = await api('teacher', 'GET', '/api/notifications');
    check('اعلان حذف‌شده دیگر در فهرست نیست', !((nFinal.json?.notifications || []).some((n) => n.id === notif.id)));
  }

  // ── مورد ۸: نمرات افغانستان ──
  const classes = await api('admin', 'GET', '/api/classes');
  // اولین صنفی که مضمون سپرده‌شده و شاگرد دارد (کلاس‌های آزمونی «صنف جدول» بدون شاگرد رد می‌شوند)
  const firstClass = (classes.json?.classes || []).find((c) => (c.classSubjects || []).length > 0 && (c.studentCount || 0) > 0);
  const cs = (firstClass?.classSubjects || [])[0];
  check('مضمونی برای تست نمرات هست', !!cs, JSON.stringify((classes.json?.classes || []).slice(0, 2)));
  if (cs) {
    const gGet = await api('admin', 'GET', `/api/grades?classSubjectId=${cs.id}`);
    check('GET نمرات سقف دوره‌ها را می‌دهد: ۴۰/۶۰',
      gGet.json?.periodMax?.MIDTERM === 40 && gGet.json?.periodMax?.ANNUAL === 60,
      JSON.stringify(gGet.json?.periodMax));
    const studentsIn = gGet.json?.students || [];
    const stu = studentsIn[0];
    check('شاگردی در صنف هست', !!stu);
    if (stu) {
      // ثبت ۲۰ تحریری در چهارو‌نیم‌ماهه — باید به سقف ۱۶ محدود شود
      const saveMid = await api('admin', 'POST', '/api/grades', { classSubjectId: cs.id, period: 'MIDTERM', items: [{ studentId: stu.id, written: 20, oral: 7, homework: 6, activity: 9 }] });
      check('ثبت نمرات چهارو‌نیم‌ماهه', saveMid.status === 200, JSON.stringify(saveMid.json));
      const gMid = await api('admin', 'GET', `/api/grades?classSubjectId=${cs.id}`);
      const gm = (gMid.json?.grades || []).find((g) => g.studentId === stu.id && g.period === 'MIDTERM');
      check('سقف اجزا اعمال شد: تحریری ۲۰→۱۶، تقریری ۷→۸؟ (محدود به سقف)', gm && gm.written === 16 && gm.oral <= 8, JSON.stringify(gm));
      check('مجموع چهارو‌نیم‌ماهه ≤ ۴۰', gm && gm.total <= 40, String(gm?.total));
      const saveAnn = await api('admin', 'POST', '/api/grades', { classSubjectId: cs.id, period: 'ANNUAL', items: [{ studentId: stu.id, written: 24, oral: 12, homework: 12, activity: 12 }] });
      check('ثبت نمرات سالانه', saveAnn.status === 200, JSON.stringify(saveAnn.json));
      const gAnn = await api('admin', 'GET', `/api/grades?classSubjectId=${cs.id}`);
      const ga = (gAnn.json?.grades || []).find((g) => g.studentId === stu.id && g.period === 'ANNUAL');
      check('مجموع سالانه = ۶۰ (از سقف ۶۰)', ga && ga.total === 60, String(ga?.total));
      // جدول نتایج: نهائی = مجموع دو دوره + نتیجهٔ کامیاب/ناکام
      // چهارو‌نیم‌ماهه: ۲۰→۱۶ (سقف) +۷+۶+۹→۸ = ۳۷ | سالانه: در سقف = ۶۰ | نهائی = ۹۷
      const res = await api('admin', 'GET', `/api/results?mode=class&classId=${firstClass.id}`);
      const row = (res.json?.rows || []).find((r) => r.student.id === stu.id);
      const ps = row?.perSubject?.[cs.subjectId];
      check('نهائی = ۳۷ + ۶۰ = ۹۷ (مجموع واقعی، نه میانگین)', ps && ps.final === 97, JSON.stringify(ps));
      check('چهارو‌نیم‌ماهه نرمال‌شده از ۴۰: ۳۷', ps && ps.midterm === 37, String(ps?.midterm));
      check('سالانه از ۶۰: ۶۰', ps && ps.annual === 60, String(ps?.annual));
      check('ستون نتیجهٔ هر مضمون: کامیاب', ps?.result === 'کامیاب', String(ps?.result));
      check('نتیجهٔ کل شاگرد: کامیاب', row?.result === 'کامیاب', String(row?.result));
      check('سرور labels را می‌فرستد (کامیاب/ناکام قابل‌تغییر)', res.json?.labels?.passLabel === 'کامیاب' && res.json?.labels?.passMark === 40);
      // کارنامهٔ شاگرد
      const rc = await api('admin', 'GET', `/api/results?mode=student&studentId=${stu.id}`);
      const sub = (rc.json?.subjects || [])[0];
      check('کارنامه: نهائی از ۱۰۰ با ساختار ۴۰+۶۰', sub && sub.final === 97, JSON.stringify(sub));
      check('کارنامه: نتیجهٔ مضمون ثبت شده', sub?.result === 'کامیاب');
      // پاک‌سازی نمرات تست
      await api('admin', 'POST', '/api/grades', { action: 'delete', classSubjectId: cs.id, period: 'MIDTERM', studentIds: [stu.id] });
      await api('admin', 'POST', '/api/grades', { action: 'delete', classSubjectId: cs.id, period: 'ANNUAL', studentIds: [stu.id] });
    }
  }

  // ── مورد ۸: حد نصاب از تنظیمات ──
  const setPut = await api('admin', 'PUT', '/api/settings', { settings: { midtermMax: '40', annualMax: '60', passMark: '40', passLabel: 'کامیاب', failLabel: 'ناکام' } });
  check('ذخیرهٔ حد نصاب/سقف‌ها از تنظیمات', setPut.status === 200, JSON.stringify(setPut.json));
  const setGet = await api('admin', 'GET', '/api/settings');
  check('تنظیمات نمرات برگشت داده می‌شود',
    setGet.json?.settings?.midtermMax === '40' && setGet.json?.settings?.annualMax === '60' &&
    setGet.json?.settings?.passMark === '40' && setGet.json?.settings?.passLabel === 'کامیاب' && setGet.json?.settings?.failLabel === 'ناکام',
    JSON.stringify(setGet.json?.settings));

  // ── مورد ۲: ایدمپوتنسی پرداخت و شاگرد ──
  const students = await api('admin', 'GET', '/api/students');
  const stu0 = (students.json?.students || [])[0];
  check('شاگردی برای تست مالی هست', !!stu0);
  if (stu0) {
    const fct = `ct-fee-${Date.now()}`;
    const f1 = await api('admin', 'POST', '/api/fees', { studentId: stu0.id, month: '1405-10', amount: 500, clientToken: fct });
    const f2 = await api('admin', 'POST', '/api/fees', { studentId: stu0.id, month: '1405-10', amount: 500, clientToken: fct });
    check('پرداخت تکراری با همان توکن → همان رکورد', f1.json?.id && f2.json?.id === f1.json.id, JSON.stringify({ f1: f1.json, f2: f2.json }));
    const delF = await api('admin', 'DELETE', `/api/fees?id=${f1.json.id}`);
    check('پاک‌سازی پرداخت تست', delF.status === 200, JSON.stringify(delF.json));
  }
  const sct = `ct-stu-${Date.now()}`;
  const s1 = await api('admin', 'POST', '/api/students', { firstName: 'آزمون', fatherName: 'تکرارناپذیر', lastName: '۳.۱', clientToken: sct });
  const s2 = await api('admin', 'POST', '/api/students', { firstName: 'آزمون', fatherName: 'تکرارناپذیر', lastName: '۳.۱', clientToken: sct });
  check('ثبت شاگرد تکراری با همان توکن → همان پرونده', s1.json?.id && s2.json?.id === s1.json.id, JSON.stringify({ s1: s1.json, s2: s2.json }));
  if (s1.json?.id) {
    const delS = await api('admin', 'DELETE', `/api/students?id=${s1.json.id}`);
    check('پاک‌سازی شاگرد تست', delS.status === 200);
  }

  // ── مورد ۷: کتابخانهٔ PDF ──
  const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF').toString('base64');
  const bct = `ct-book-${Date.now()}`;
  const book1 = await api('admin', 'POST', '/api/library', { action: 'save-book', title: 'کتاب آزمون ۳.۱', copies: 2, clientToken: bct, pdfFile: { name: 'test.pdf', type: 'application/pdf', data: `data:application/pdf;base64,${minimalPdf}` } });
  check('کتاب با فایل PDF ثبت شد', book1.status === 200 && !!book1.json?.id, JSON.stringify(book1.json));
  const book2 = await api('admin', 'POST', '/api/library', { action: 'save-book', title: 'کتاب آزمون ۳.۱', copies: 2, clientToken: bct });
  check('ثبت کتاب تکراری با همان توکن → همان کتاب', book2.json?.id === book1.json.id, JSON.stringify(book2.json));
  const libList = await api('admin', 'GET', '/api/library');
  const libBook = (libList.json?.books || []).find((b) => b.id === book1.json.id);
  check('فهرست کتاب‌ها نام و متادیتای PDF را دارد (بدون محتوای سنگین)', libBook && libBook.fileName === 'test.pdf' && !libBook.fileData, JSON.stringify(libBook));
  const libFile = await api('admin', 'GET', `/api/library?file=1&id=${book1.json.id}`);
  check('دریافت محتوای PDF کتاب برای مطالعهٔ داخل اپ', libFile.json?.data?.startsWith('data:application/pdf') && libFile.json?.fileName === 'test.pdf');
  const delBook = await api('admin', 'DELETE', `/api/library?id=${book1.json.id}`);
  check('پاک‌سازی کتاب تست', delBook.status === 200);

  // ── پشتیبان: تنظیمات نمرات در فایل پشتیبان هست ──
  const backup = await api('admin', 'GET', '/api/backup');
  const settingsInBackup = (backup.json?.data?.settings || []).find((s) => s.key === 'passMark');
  check('فایل پشتیبان شامل حد نصاب نمرات است', backup.status === 200 && settingsInBackup?.value === '40', JSON.stringify(settingsInBackup));

  /* ═══ فاز ۳ — وب دسکتاپ (مورد ۱) ═══ */
  console.log('═ فاز ۳: وب دسکتاپ ═');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    // خطاها فقط پس از ورود جمع می‌شود — ۴۰۱ پیش از ورود رفتار عادی اپ است
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);
    // منوی کناری در دسکتاپ دیده می‌شود و همبرگری پنهان است
    const sidebarVisible = await page.locator('aside').isVisible().catch(() => false);
    check('دسکتاپ: منوی کناری همیشه دیده می‌شود', sidebarVisible);
    const hamburgerHidden = !(await page.locator('button[aria-label="بازکردن منو"]').isVisible().catch(() => false));
    check('دسکتاپ: دکمهٔ همبرگری موبایل پنهان است', hamburgerHidden);
    const versionShown = await page.getByText('۳.۱.۰').first().isVisible().catch(() => false);
    check('نسخهٔ ۳.۱.۰ در منو نمایش داده می‌شود', versionShown);
    // بخش کتابخانه: ستون PDF
    await page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('view', 'library'); history.replaceState(null, '', u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForTimeout(2500);
    const libHeader = await page.getByText('PDF', { exact: true }).first().isVisible().catch(() => false);
    check('کتابخانه: ستون PDF در جدول هست (نسخهٔ دیجیتال)', libHeader);
    check('بدون خطای کنسول در دسکتاپ', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await browser.close();
  } catch (e) {
    check('مرورگر دسکتاپ بدون خطا', false, String(e).slice(0, 200));
    try { await browser?.close(); } catch { /* ignore */ }
  }

  // پاک‌سازی پیام تست اعلان
  await api('admin', 'DELETE', `/api/messages?id=${mNotif.json.id}`);
  await api('admin', 'DELETE', `/api/messages?id=${mNotif.json.id}`);

  /* ═══ نتیجه ═══ */
  console.log('═══════════════════════════');
  console.log(`نتیجهٔ نهایی: ${pass} موفق، ${fail} ناموفق`);
  if (failures.length) {
    console.log('شکست‌ها:');
    for (const f of failures) console.log(`  ✘ ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
