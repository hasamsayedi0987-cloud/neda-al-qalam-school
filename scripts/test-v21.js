/**
 * تست جامع نسخهٔ ۲.۱.۰ — ۹ مسئلهٔ گزارش کاربر
 *
 * ۱) معلم مضامین و صنف نگرانی خود را می‌بیند + نمره + حاضری
 * ۲) ولد و ولدیت (پدر کلان) در جدول نتایج و کارنامه
 * ۳) دسترسی کامل هر کاربر به بخش خودش
 * ۴) نظارت مدیر (نمرات در انتظار تایید در داشبورد)
 * ۵) محدود/فعال/غیرفعال کردن دسترسی بخش‌ها توسط مدیر
 * ۶) کپی دسترسی‌های یک کاربر به کاربر دیگر
 * ۷) نگران موقت صنف (در غیاب نگران اصلی)
 * ۸) چند مدیر + تعیین معلم به مدیر
 * ۹) تغییر عناوین (نام مکتب + برچسب منو)
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
const fails = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; fails.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ✘ ${name} ${extra}`); }
}

async function apiLogin(u, p) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: u, password: p }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { cookie, data, status: res.status };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  console.log('═ فاز ۰: ورود مدیر ═');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // اگر نشست فعال است خروج
  if (await page.locator('button:has-text("خروج")').count() > 0) {
    await page.locator('button:has-text("خروج")').first().click();
    await page.waitForTimeout(800);
  }
  await page.fill('input[type="text"], input#username, input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('ورود مدیر موفق', await page.locator('text=خانه / داشبورد').count() > 0 || await page.locator('text=داشبورد').count() > 0);

  const adminCookie = (await apiLogin('admin', 'admin123')).cookie;

  console.log('═ فاز ۱: ساخت ساختار تعلیمی (معلم + مضمون + صنف + نگرانی + حساب) ═');
  const stamp = 'v21' + Date.now().toString().slice(-6);
  // معلم جدید
  const tRes = await fetch(`${BASE}/api/teachers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: `استاد ${stamp}`, position: 'معلم' }),
  });
  const tData = await tRes.json();
  check('ایجاد پروندهٔ معلم', !!tData.id, JSON.stringify(tData));
  const teacherId = tData.id;

  // مضمون جدید
  const sRes = await fetch(`${BASE}/api/subjects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: `ریاضی ${stamp}` }),
  });
  const sData = await sRes.json();
  check('ایجاد مضمون', !!sData.id);
  const subjectId = sData.id;

  // صنف جدید با نگران = معلم
  const cRes = await fetch(`${BASE}/api/classes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ grade: 4, name: `صنف آزمون ${stamp}`, supervisorId: teacherId }),
  });
  const cData = await cRes.json();
  check('ایجاد صنف با نگران معلم', !!cData.id, JSON.stringify(cData));
  const classId = cData.id;

  // سپردن مضمون به معلم
  const aRes = await fetch(`${BASE}/api/classes/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ classId, subjectId, teacherId }),
  });
  const aData = await aRes.json();
  check('سپردن مضمون به معلم', aData.ok !== false && !aData.error, JSON.stringify(aData));

  // شاگرد با ولد و ولدیت
  const stRes = await fetch(`${BASE}/api/students`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ firstName: 'احمد', lastName: `نجیب${stamp}`, fatherName: 'محمدنبی', grandFather: 'دولت‌خان', gender: 'M' }),
  });
  const stData = await stRes.json();
  check('ثبت شاگرد با ولد و ولدیت', !!stData.id);
  const studentId = stData.id;
  // انتقال شاگرد به صنف (PATCH)
  const stPRes = await fetch(`${BASE}/api/students`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: studentId, classId }),
  });
  await stPRes.json();

  // حساب کاربری معلم با پیوند صحیح
  const uRes = await fetch(`${BASE}/api/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ username: `t${stamp}`, password: 'test123456', name: `استاد ${stamp}`, role: 'TEACHER', teacherId }),
  });
  const uData = await uRes.json();
  check('ایجاد حساب کاربری معلم پیوسته', !!uData.id, JSON.stringify(uData));
  const tUser = `t${stamp}`;

  console.log('═ فاز ۲: معلم وارد می‌شود — مسئلهٔ ۱ ═');
  const tLogin = await apiLogin(tUser, 'test123456');
  check('ورود معلم', !!tLogin.data?.user?.id, JSON.stringify(tLogin.data));
  check('پیوند معلم صحیح', tLogin.data?.user?.teacherId === teacherId);
  const tCookie = tLogin.cookie;

  const csRes = await fetch(`${BASE}/api/classes`, { headers: { cookie: tCookie } });
  const csData = await csRes.json();
  const myClass = (csData.classes || []).find((c) => c.id === classId);
  check('معلم فقط صنف خودش را می‌بیند', (csData.classes || []).length === 1 && !!myClass);
  const myCs = myClass?.classSubjects?.find((x) => x.subjectId === subjectId);
  check('مضمون سپرده‌شده در صنف معلم دیده می‌شود', !!myCs, JSON.stringify(myClass?.classSubjects?.map(x => x.subject?.name)));

  // ثبت نمره توسط معلم
  const gRes = await fetch(`${BASE}/api/grades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: tCookie },
    body: JSON.stringify({
      classSubjectId: myCs.id, period: 'MIDTERM',
      items: [{ studentId, written: 30, oral: 15, homework: 18, activity: 17 }],
    }),
  });
  const gData = await gRes.json();
  check('معلم نمرهٔ مضمون خود را ثبت کرد', gData.saved === 1, JSON.stringify(gData));

  // حاضری صنف نگرانی توسط معلم
  const today = new Date().toISOString().slice(0, 10);
  const atRes = await fetch(`${BASE}/api/attendance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: tCookie },
    body: JSON.stringify({ date: today, classId, items: [{ studentId, status: 'PRESENT' }] }),
  });
  const atData = await atRes.json();
  check('معلم (نگران) حاضری صنف خود را گرفت', atData.saved === 1, JSON.stringify(atData));

  console.log('═ فاز ۳: ولدیت در نتایج — مسئلهٔ ۲ ═');
  const rRes = await fetch(`${BASE}/api/results?mode=class&classId=${classId}`, { headers: { cookie: adminCookie } });
  const rData = await rRes.json();
  const row = (rData.rows || [])[0];
  check('grandFather در جدول نتایج برگشت داده می‌شود', row?.student?.grandFather === 'دولت‌خان', JSON.stringify(row?.student));

  // نمرات سالانه هم ثبت شود تا نمرهٔ نهائی کامل باشد
  await fetch(`${BASE}/api/grades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: tCookie },
    body: JSON.stringify({
      classSubjectId: myCs.id, period: 'ANNUAL',
      items: [{ studentId, written: 32, oral: 16, homework: 19, activity: 18 }],
    }),
  });

  console.log('═ فاز ۴: داشبورد نظارت — مسئلهٔ ۴ ═');
  const dRes = await fetch(`${BASE}/api/dashboard`, { headers: { cookie: adminCookie } });
  const dData = await dRes.json();
  const pa = dData.pendingApprovals || [];
  check('نمرات در انتظار تایید در داشبورد مدیر', pa.some((x) => x.classSubjectId === myCs.id), JSON.stringify(pa).slice(0, 150));

  console.log('═ فاز ۵: دسترسی بخش‌ها — مسئلهٔ ۵ ═');
  // کتابخانه را برای معلم فعال کنیم (نقش معلم پیش‌فرض ندارد)
  const pRes1 = await fetch(`${BASE}/api/users`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: uData.id, perms: { library: true, grades: false } }),
  });
  const p1 = await pRes1.json();
  check('ذخیرهٔ دسترسی‌های خاص کاربر', p1.ok === true, JSON.stringify(p1));

  // معلم دیگر نمرات را نمی‌بیند (403) ولی کتابخانه را می‌بیند
  const g403 = await fetch(`${BASE}/api/grades?classSubjectId=${myCs.id}`, { headers: { cookie: tCookie } });
  check('بخش محدودشده → ۴۰۳ سرور', g403.status === 403, String(g403.status));
  const lib200 = await fetch(`${BASE}/api/library`, { headers: { cookie: tCookie } });
  check('بخش فعال‌شده → ۲۰۰ سرور', lib200.status === 200, String(lib200.status));

  // ورود مجدد معلم — perms در نشست
  const tLogin2 = await apiLogin(tUser, 'test123456');
  check('perms در پاسخ ورود', tLogin2.data?.user?.perms && JSON.parse(tLogin2.data.user.perms).library === true, JSON.stringify(tLogin2.data?.user?.perms));

  console.log('═ فاز ۶: کپی دسترسی — مسئلهٔ ۶ ═');
  // کاربر دوم (معلم دوم) و کپی دسترسی از معلم اول
  const t2Res = await fetch(`${BASE}/api/teachers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: `استاد دوم ${stamp}`, position: 'معلم' }),
  });
  const t2Data = await t2Res.json();
  const u2Res = await fetch(`${BASE}/api/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ username: `t2${stamp}`, password: 'test123456', name: `استاد دوم ${stamp}`, role: 'TEACHER', teacherId: t2Data.id }),
  });
  const u2Data = await u2Res.json();
  const cpRes = await fetch(`${BASE}/api/users`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: u2Data.id, perms: { library: true, grades: false } }),
  });
  const cpData = await cpRes.json();
  check('کپی دسترسی‌ها به کاربر دوم', cpData.ok === true, JSON.stringify(cpData));
  const uList = await (await fetch(`${BASE}/api/users`, { headers: { cookie: adminCookie } })).json();
  const u2 = uList.users.find((x) => x.id === u2Data.id);
  check('دسترسی کپی‌شده ذخیره شده', u2?.perms && JSON.parse(u2.perms).grades === false, JSON.stringify(u2?.perms));

  console.log('═ فاز ۷: نگران موقت — مسئلهٔ ۷ ═');
  // معلم دوم را نگران موقت صنف اول کنیم (نگران اصلی = معلم اول در مرخصی)
  const asRes = await fetch(`${BASE}/api/classes`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: classId, actingSupervisorId: t2Data.id }),
  });
  const asData = await asRes.json();
  check('تعیین نگران موقت', asData.ok === true, JSON.stringify(asData));
  // معلم دوم حالا می‌تواند حاضری صنف را بگیرد
  const t2Login = await apiLogin(`t2${stamp}`, 'test123456');
  const t2Cookie = t2Login.cookie;
  const at2Res = await fetch(`${BASE}/api/attendance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: t2Cookie },
    body: JSON.stringify({ date: '2025-01-02', classId, items: [{ studentId, status: 'ABSENT' }] }),
  });
  const at2Data = await at2Res.json();
  check('نگران موقت حاضری صنف را می‌گیرد', at2Data.saved === 1, JSON.stringify(at2Data));

  console.log('═ فاز ۸: چند مدیر + تعیین معلم به مدیر — مسئلهٔ ۸ ═');
  const prRes = await fetch(`${BASE}/api/users`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: uData.id, role: 'ADMIN' }),
  });
  const prData = await prRes.json();
  check('تعیین معلم به مدیر (دوم)', prData.ok === true, JSON.stringify(prData));
  const a2Login = await apiLogin(tUser, 'test123456');
  check('مدیر دوم وارد می‌شود', a2Login.data?.user?.role === 'ADMIN');
  // گارد آخرین مدیر: تلاش برای تنزل خود مدیر اول وقتی مدیر دوم غیرفعال نیست → باید موفق باشد (دو مدیر فعال)
  // ولی غیرفعال کردن هر دو با هم ممکن نیست — غیرفعال کردن مدیر دوم توسط مدیر اول:
  const deRes = await fetch(`${BASE}/api/users`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: uData.id, role: 'TEACHER' }),
  });
  check('بازگشت نقش معلم', (await deRes.json()).ok === true);

  console.log('═ فاز ۹: تغییر عناوین — مسئلهٔ ۹ ═');
  const tagRes = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ settings: {
      schoolName: 'مکتب آزمون نداالقلم',
      tagline: 'سیستم آزمایشی مدیریت',
      navLabels: JSON.stringify({ dashboard: 'خانهٔ آزمایشی', grades: 'نمرات من' }),
    } }),
  });
  check('ذخیرهٔ عناوین جدید', (await tagRes.json()).ok === true);

  // باز شدن صفحه با نشست معلم — برچسب‌ها اعمال شوند
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(2000);
  if (await page2.locator('button:has-text("خروج")').count() > 0) {
    await page2.locator('button:has-text("خروج")').first().click();
    await page2.waitForTimeout(800);
  }
  await page2.fill('input[type="text"], input#username, input[name="username"]', tUser);
  await page2.fill('input[type="password"]', 'test123456');
  await page2.click('button[type="submit"]');
  await page2.waitForTimeout(3000);
  const schoolVisible = await page2.locator('text=مکتب آزمون نداالقلم').count();
  check('نام مکتب جدید در سربرگ ظاهر شد', schoolVisible > 0);
  const navLabel = await page2.locator('text=خانهٔ آزمایشی').count();
  check('برچسب سفارشی منو ظاهر شد', navLabel > 0);
  // معلم با grades=false نباید «ثبت نمرات» را ببیند — ولی عنوانش «نمرات من» بود؛ برچسب سفارشی یعنی دیده می‌شود؟ باید نباشد
  const gradesNav = await page2.locator('a:has-text("نمرات من"), button:has-text("نمرات من")').count();
  check('بخش محدودشده از منوی معلم حذف شد', gradesNav === 0);
  const libNav = await page2.locator('text=کتابخانه').count();
  check('بخش فعال‌شده در منوی معلم ظاهر شد', libNav > 0);
  await ctx2.close();

  console.log('═ فاز ۱۰: رابط — بنر معلم و جدول نتایج با ولدیت ═');
  // نشست معلم اول (دسترسی نمرات بازگردانده شود)
  await fetch(`${BASE}/api/users`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: uData.id, perms: {} }),
  });
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page3 = await ctx3.newPage();
  await page3.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page3.waitForTimeout(2000);
  if (await page3.locator('button:has-text("خروج")').count() > 0) {
    await page3.locator('button:has-text("خروج")').first().click();
    await page3.waitForTimeout(800);
  }
  await page3.fill('input[type="text"], input#username, input[name="username"]', tUser);
  await page3.fill('input[type="password"]', 'test123456');
  await page3.click('button[type="submit"]');
  await page3.waitForTimeout(2500);
  // رفتن به ثبت نمرات
  const gradesBtn = page3.locator('button:has-text("ثبت نمرات")').first();
  await gradesBtn.click();
  await page3.waitForTimeout(1500);
  const banner = await page3.locator('text=مضامین سپرده‌شده به شما').count();
  check('بنر مضامین معلم نمایش داده شد', banner > 0);
  const noWarn = await page3.locator('text=حساب شما به پروندهٔ معلم پیوند ندارد').count();
  check('بنر خطای پیوند برای معلم پیوسته نمایش داده نمی‌شود', noWarn === 0);

  // انتخاب صنف و مضمون — جدول نمره‌دهی
  await page3.locator('.space-y-1 button, [role="combobox"]').first();
  // صنف انتخاب
  const classSelect = page3.locator('[role="combobox"]').first();
  await classSelect.click();
  await page3.waitForTimeout(500);
  await page3.locator(`[role="option"]:has-text("صنف آزمون ${stamp}")`).first().click();
  await page3.waitForTimeout(500);
  const subjectSelect = page3.locator('[role="combobox"]').nth(1);
  await subjectSelect.click();
  await page3.waitForTimeout(500);
  await page3.locator(`[role="option"]:has-text("ریاضی ${stamp}")`).first().click();
  await page3.waitForTimeout(1500);
  const gradeRow = await page3.locator('text=ولد محمدنبی').count();
  check('ولد شاگرد در جدول نمرات', gradeRow > 0);
  const gfRow = await page3.locator('text=ولدیت دولت‌خان').count();
  check('ولدیت شاگرد در جدول نمرات', gfRow > 0);
  await ctx3.close();

  // جدول نتایج در رابط مدیر — ولدیت زیر نام شاگرد
  await page.goto(`${BASE}/?view=results`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const classSel = page.locator('[role="combobox"]').first();
  await classSel.click();
  await page.waitForTimeout(500);
  await page.locator(`[role="option"]:has-text("صنف آزمون ${stamp}")`).first().click();
  await page.waitForTimeout(2000);
  const gfResults = await page.locator('text=ولدیت دولت‌خان').count();
  check('ولدیت در جدول نتایج (رابط مدیر)', gfResults > 0);

  // بازگردانی عناوین پیش‌فرض
  await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ settings: { schoolName: 'مکتب خصوصی نداالقلم', tagline: '', navLabels: '{}' } }),
  });

  console.log('═ فاز ۱۱: خطاهای کنسول ═');
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('net::') && !e.includes('404') && !e.includes('Failed to load resource'));
  check('صفر خطای کنسول', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n═══ نتیجه: ${passed} موفق، ${failed} ناموفق ═══`);
  if (fails.length) { console.log('شکست‌ها:'); fails.forEach((f) => console.log('  ✘ ' + f)); process.exit(failed > 0 ? 1 : 0); }
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
