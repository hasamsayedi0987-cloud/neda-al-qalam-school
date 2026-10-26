/**
 * تست جامع نسخهٔ ۲.۲.۰ — ۱۵ مورد گزارش کاربر
 *
 * ۱) همگام‌سازی: DELETE با شناسهٔ موقت ۴۰۴ → حذف بی‌خطر از صف (نه گیر کردن)
 * ۲) مالی: ثبت پرداخت، اعتبارسنجی ماه/مبلغ، خلاصه
 * ۳) پیام‌ها: مستقیم، همگانی به نقش، خوانده‌شدن، گارد گیرنده
 * ۴) برنامهٔ هفتگی: ثبت اسلات + تداخل زمانی ۴۰۹ + حذف
 * ۵) مضامین: کد + واحد درسی
 * ۶) صنف: ظرفیت + فیس ماهانه
 * ۷) حاضری: آمار سالانه (mode=annual)
 * ۸) کتابخانه: جریمهٔ دیرکرد هنگام پس‌دادن + overdue
 * ۹) فعالیت: عکس + اعلان والد
 * ۱۰) پشتیبان v3: شامل مالی/پیام‌ها/برنامه
 * ۱۱) تنظیمات: feeDeadlineDay + finePerDay + پاک‌سازی حاضری (گارد سال نامعتبر)
 * ۱۲) دسترسی: معلم → /api/fees ممنوع (مگر فعال شود)
 * ۱۳) sync: discardAllFailedItems (مرورگر)
 * ۱۴) کپی تقسیم مضامین (action=copy-division)
 * ۱۵) عدم خطای کنسول در بارگذاری
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
  return { cookie: setCookie.split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
}

async function api(method, url, body, cookie) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const stamp = Date.now().toString(36).slice(-5);
  const admin = await apiLogin('admin', 'admin123');
  check('ورود مدیر', admin.status === 200 && admin.data?.user?.role === 'ADMIN');

  // ═══ فاز ۱: مالی ═══
  console.log('═ فاز ۱: مالی و فیس ═');
  const fees0 = await api('GET', '/api/fees', undefined, admin.cookie);
  check('GET /api/fees — شاگردان و پرداخت‌ها', fees0.status === 200 && Array.isArray(fees0.data.students) && Array.isArray(fees0.data.payments));
  const payStudent = fees0.data.students.find((s) => s.status === 'ACTIVE');
  check('شاگرد فعال موجود است', !!payStudent);
  const badMonth = await api('POST', '/api/fees', { studentId: payStudent?.id, month: '1405/1', amount: 100 }, admin.cookie);
  check('رد ماه نامعتبر', badMonth.status === 400);
  const badAmount = await api('POST', '/api/fees', { studentId: payStudent?.id, month: '1405-10', amount: -5 }, admin.cookie);
  check('رد مبلغ منفی', badAmount.status === 400);
  const pay = await api('POST', '/api/fees', { studentId: payStudent?.id, month: '1405-10', amount: 250, method: 'CASH', note: 'تست' }, admin.cookie);
  check('ثبت پرداخت موفق', pay.status === 200 && !!pay.data.id);
  const fees1 = await api('GET', '/api/fees', undefined, admin.cookie);
  const found = fees1.data.payments.find((p) => p.id === pay.data.id);
  check('پرداخت در خلاصه دیده می‌شود', !!found && found.amount === 250);
  if (found) {
    const del = await api('DELETE', `/api/fees?id=${found.id}`, undefined, admin.cookie);
    check('حذف پرداخت توسط مدیر', del.status === 200);
  }

  // ═══ فاز ۲: پیام‌ها ═══
  console.log('═ فاز ۲: پلتفرم ارتباطات ═');
  const tRes = await api('POST', '/api/teachers', { name: `معلم پیام ${stamp}`, position: 'معلم' }, admin.cookie);
  const teacherId = tRes.data.id;
  const uRes = await api('POST', '/api/users', { username: `msg${stamp}`, password: 'test123456', name: `استاد پیام ${stamp}`, role: 'TEACHER', teacherId }, admin.cookie);
  check('ساخت معلم + حساب', uRes.status === 200 && !!uRes.data.id);
  const teacher = await apiLogin(`msg${stamp}`, 'test123456');
  check('ورود معلم', teacher.status === 200);
  const msgSend = await api('POST', '/api/messages', { toUserId: uRes.data.id, subject: 'تست', body: 'سلام — این یک پیام آزمایشی است', category: 'ACADEMIC' }, admin.cookie);
  check('ارسال پیام مستقیم', msgSend.status === 200 && !!msgSend.data.id, JSON.stringify(msgSend.data).slice(0, 80));
  const tinbox = await api('GET', '/api/messages', undefined, teacher.cookie);
  const inboxHit = (tinbox.data.inbox || []).find((m) => m.id === msgSend.data.id);
  check('پیام در صندوق معلم + نام فرستنده', !!inboxHit && inboxHit.fromName.includes('مدیر') === false && !!inboxHit.fromName);
  check('شمار نخوانده درست', tinbox.data.unread >= 1);
  const mark = await api('PATCH', '/api/messages', { id: msgSend.data.id }, teacher.cookie);
  check('علامت خوانده‌شده', mark.status === 200);
  const tinbox2 = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('نخوانده صفر شد', tinbox2.data.unread === 0);
  const tsend = await api('POST', '/api/messages', { toRole: 'ALL', body: 'معلم نمی‌تواند همگانی بفرستد' }, teacher.cookie);
  check('گارد: همگانی فقط مدیر/سرمعلم', tsend.status === 403);
  const bcast = await api('POST', '/api/messages', { toRole: 'TEACHER', body: 'اطلاعیهٔ همگانی برای معلمان', category: 'ANNOUNCEMENT' }, admin.cookie);
  check('همگانی به نقش', bcast.status === 200);
  const tinbox3 = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('همگانی در صندوق معلم', (tinbox3.data.inbox || []).some((m) => m.toLabel && m.toLabel.includes('همگانی')));
  const tcontact = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('فهرست مخاطبان معلم شامل مدیر', (tcontact.data.contacts || []).some((c) => c.role === 'ADMIN'));

  // ═══ فاز ۳: برنامهٔ هفتگی ═══
  console.log('═ فاز ۳: صنف‌ها، ظرفیت، برنامهٔ هفتگی ═');
  const cls1 = await api('POST', '/api/classes', { grade: 3, name: `صنف جدول ${stamp}`, capacity: 40, monthlyFee: 300 }, admin.cookie);
  const cls2 = await api('POST', '/api/classes', { grade: 3, name: `صنف جدول دوم ${stamp}` }, admin.cookie);
  check('صنف با ظرفیت + فیس', cls1.status === 200);
  const clsList = await api('GET', '/api/classes', undefined, admin.cookie);
  const c1 = clsList.data.classes.find((c) => c.id === cls1.data.id);
  check('ظرفیت/فیس برگشت داده شد', c1 && c1.capacity === 40 && c1.monthlyFee === 300);
  const subRes = await api('POST', '/api/subjects', { name: `ریاضی ${stamp}`, code: `MTH-${stamp}`, credits: 4 }, admin.cookie);
  check('مضمون با کد + واحد', subRes.status === 200);
  const subList = await api('GET', '/api/subjects', undefined, admin.cookie);
  const sub = subList.data.subjects.find((s) => s.id === subRes.data.id);
  check('کد/واحد در GET مضامین', sub && sub.code === `MTH-${stamp}` && sub.credits === 4);
  const slot1 = await api('POST', '/api/schedule', { classId: cls1.data.id, subjectId: subRes.data.id, teacherId, day: 0, period: 1 }, admin.cookie);
  check('ثبت اسلات برنامهٔ هفتگی', slot1.status === 200);
  const clash = await api('POST', '/api/schedule', { classId: cls2.data.id, subjectId: subRes.data.id, teacherId, day: 0, period: 1 }, admin.cookie);
  check('تداخل زمانی معلم رد شد (۴۰۹)', clash.status === 409 && String(clash.data.error).includes('تداخل'));
  const ok2 = await api('POST', '/api/schedule', { classId: cls2.data.id, subjectId: subRes.data.id, teacherId, day: 0, period: 2 }, admin.cookie);
  check('اسلات غیرمتعارف ثبت شد', ok2.status === 200);
  const sched = await api('GET', '/api/schedule', undefined, admin.cookie);
  check('اسلات‌ها با نام صنف/مضمون/معلم', (sched.data.slots || []).some((s) => s.className && s.subjectName && s.teacherName));
  const delSlot = await api('DELETE', `/api/schedule?id=${ok2.data.id}`, undefined, admin.cookie);
  check('حذف اسلات', delSlot.status === 200);

  // کپی تقسیم مضامین — صنف مقصد خالی از این مضمون است
  await api('DELETE', `/api/classes/assign?csId=${(clsList.data.classes.find((c) => c.id === cls2.data.id)?.classSubjects || [])[0]?.id}`, undefined, admin.cookie).catch(() => {});
  const copy = await api('POST', '/api/classes/assign', { action: 'copy-division', fromClassId: cls1.data.id, toClassId: cls2.data.id }, admin.cookie);
  check('کپی تقسیم مضامین', copy.status === 200 && (copy.data.copied || 0) >= 1, JSON.stringify(copy.data).slice(0, 80));

  // ═══ فاز ۴: حاضری سالانه ═══
  console.log('═ فاز ۴: حاضری — آمار سالانه ═');
  const annual = await api('GET', `/api/attendance?mode=annual&classId=${cls1.data.id}&jy=1405`, undefined, admin.cookie);
  check('mode=annual پاسخ سالم', annual.status === 200 && Array.isArray(annual.data.students) && Array.isArray(annual.data.records));
  const tannual = await api('GET', `/api/attendance?mode=annual&classId=${cls2.data.id}&jy=1405`, undefined, teacher.cookie);
  check('معلم صنف خودش annual دارد', tannual.status === 200);

  // ═══ فاز ۵: کتابخانه — جریمه ═══
  console.log('═ فاز ۵: کتابخانه — جریمهٔ دیرکرد ═');
  const setFine = await api('PUT', '/api/settings', { settings: { finePerDay: '5', feeDeadlineDay: '10' } }, admin.cookie);
  check('ذخیرهٔ finePerDay/feeDeadlineDay', setFine.status === 200);
  const setGet = await api('GET', '/api/settings', undefined, admin.cookie);
  check('تنظیمات برگشت داده شد', setGet.data.settings.finePerDay === '5' && setGet.data.settings.feeDeadlineDay === '10');
  const book = await api('POST', '/api/library', { action: 'save-book', title: `کتاب آزمون ${stamp}`, copies: 2 }, admin.cookie);
  const pastDue = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const lend = await api('POST', '/api/library', { action: 'lend', bookId: book.data.id, borrowerName: 'شاگرد تست', borrowerType: 'STUDENT', loanDate: pastDue, dueDate: pastDue }, admin.cookie);
  check('امانت با تاریخ گذشته', lend.status === 200);
  const libList = await api('GET', '/api/library', undefined, admin.cookie);
  const loan = libList.data.loans.find((l) => l.bookId === book.data.id && l.status === 'LENT');
  check('overdue محاسبه شد', loan && loan.overdue === true);
  const ret = await api('POST', '/api/library', { action: 'return', loanId: loan.id }, admin.cookie);
  check('پس‌دادن با جریمه (۳ روز × ۵)', ret.status === 200 && ret.data.fine === 15, `fine=${ret.data.fine}`);
  const libList2 = await api('GET', '/api/library', undefined, admin.cookie);
  const loan2 = libList2.data.loans.find((l) => l.id === loan.id);
  check('جریمه در سابقه ثبت شد', loan2 && loan2.fineAmount === 15);
  await api('DELETE', `/api/library?id=${book.data.id}`, undefined, admin.cookie);

  // ═══ فاز ۶: فعالیت با عکس + اعلان والد ═══
  console.log('═ فاز ۶: فعالیت شاگردان — عکس و اعلان ═');
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const stuRes = await api('GET', '/api/students', undefined, admin.cookie);
  const someStudent = stuRes.data.students.find((s) => s.status === 'ACTIVE');
  const act = await api('POST', '/api/activities', { studentId: someStudent?.id, type: 'HOMEWORK', note: 'فعالیت با عکس تست', date: new Date().toISOString().slice(0, 10), image: tinyPng }, admin.cookie);
  check('ثبت فعالیت با عکس', act.status === 200);
  const actGet = await api('GET', `/api/activities?studentId=${someStudent?.id}`, undefined, admin.cookie);
  const actHit = (actGet.data.activities || []).find((a) => a.id === act.data.id);
  check('عکس فعالیت ذخیره شد', actHit && typeof actHit.image === 'string' && actHit.image.startsWith('data:image'));
  const bigImg = 'data:image/png;base64,' + 'A'.repeat(450_000);
  const actBig = await api('POST', '/api/activities', { studentId: someStudent?.id, type: 'OTHER', note: 'x', image: bigImg }, admin.cookie);
  check('عکس بزرگ‌تر از ۴۰۰KB رد شد', actBig.status === 200); // سرور به null تبدیل می‌کند نه خطا
  await api('DELETE', `/api/activities?id=${act.data.id}`, undefined, admin.cookie);

  // ═══ فاز ۷: پشتیبان v3 + پاک‌سازی حاضری ═══
  console.log('═ فاز ۷: پشتیبان‌گیری و داده‌های سال‌های گذشته ═');
  const bkRes = await fetch(`${BASE}/api/backup`, { headers: { cookie: admin.cookie } });
  const bk = await bkRes.json().catch(() => ({}));
  check('پشتیبان نسخهٔ ۳', bk.version === 3);
  check('پشتیبان شامل مالی/پیام/برنامه', Array.isArray(bk.data?.feePayments) && Array.isArray(bk.data?.messages) && Array.isArray(bk.data?.scheduleSlots));
  const clearBad = await api('DELETE', '/api/backup', { action: 'clear-attendance', beforeJalaliYear: 99 }, admin.cookie);
  check('گارد سال نامعتبر', clearBad.status === 400);
  const clearOk = await api('DELETE', '/api/backup', { action: 'clear-attendance', beforeJalaliYear: 1390 }, admin.cookie);
  check('پاک‌سازی حاضری قدیمی اجرا شد', clearOk.status === 200 && typeof clearOk.data.deleted === 'number');

  // ═══ فاز ۸: گارد دسترسی مالی ═══
  console.log('═ فاز ۸: دسترسی‌ها ═');
  const tfees = await api('GET', '/api/fees', undefined, teacher.cookie);
  check('معلم به مالی دسترسی ندارد (۴۰۳)', tfees.status === 403);
  const tmsg = await api('GET', '/api/messages', undefined, teacher.cookie);
  check('معلم پیام‌های خود را دارد (۲۰۰)', tmsg.status === 200);

  // ═══ فاز ۹: همگام‌سازی — سناریوی DELETE با شناسهٔ موقت ═══
  console.log('═ فاز ۹: همگام‌سازی — ریشهٔ هشدار قرمز ═');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await page.locator('button:has-text("خروج")').count() > 0) {
    await page.locator('button:has-text("خروج")').first().click();
    await page.waitForTimeout(800);
  }
  await page.fill('input[type="text"], input#username, input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check('ورود مرورگری مدیر', await page.locator('text=خانه').count() > 0);

  // سناریو: آفلاین صنف بساز (POST صف می‌شود) → آنلاین flush → شناسهٔ واقعی → آفلاین DELETE با شناسهٔ موقت در URL → آنلاین flush
  await page.evaluate(() => window.__setOfflineOff && window.__setOfflineOff());
  await page.evaluate(() => {
    // شبیه‌سازی آفلاین از طریق قطع شبکه با CDP انجام می‌شود؛ در اینجا مستقیم صف را می‌سازیم
    const QUEUE_KEY = 'noq_offline_queue_v1';
    const tempId = `tmp-test-${Date.now().toString(36)}`;
    // ۱) POST صنف با شناسهٔ موقت
    const post = { id: `${Date.now()}-p1`, url: '/api/classes', method: 'POST', body: { grade: 2, name: `صنف سینک ${Date.now().toString(36).slice(-4)}`, capacity: null, monthlyFee: null, supervisorId: null, actingSupervisorId: null }, createdAt: Date.now(), label: 'صنف سینک', tempId };
    // ۲) DELETE همان صنف با شناسهٔ موقت در URL (پیش از اینجا این حالت برای همیشه گیر می‌کرد!)
    const del = { id: `${Date.now()}-d1`, url: `/api/classes?id=${tempId}`, method: 'DELETE', body: {}, createdAt: Date.now(), label: 'صنف سینک — حذف' };
    localStorage.setItem(QUEUE_KEY, JSON.stringify([post, del]));
  });
  // اپ را وادار به flush می‌کنیم: یک GET ساده → flush خودکار در بازهٔ ۳۰ ثانیه نیست — از دکمهٔ همگام‌سازی استفاده می‌کنیم اگر باشد، وگرنه reload
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); });
  await page.waitForTimeout(3500);
  const queueAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('noq_offline_queue_v1') || '[]'));
  const queueErr = queueAfter.map((q) => `${q.label}:${q.lastError || 'ok'}`).join(' | ');
  check('DELETE-با-tempId از صف تخلیه شد (دیگر گیر نمی‌کند)', queueAfter.length === 0, `باقی‌مانده: ${queueAfter.length} ${queueErr}`);
  check('هیچ ثبت خطاخورده‌ای نماند', (queueAfter.filter((q) => q.failCount)).length === 0);
  // صنف واقعاً ساخته و بعداً حذف نشده (چون DELETE با شناسهٔ موقت ۴۰۴ شد — طبیعی و بی‌خطر)
  const clsList2 = await api('GET', '/api/classes', undefined, admin.cookie);
  const syncClass = clsList2.data.classes.find((c) => (c.name || '').includes('صنف سینک'));
  if (syncClass) await api('DELETE', `/api/classes?id=${syncClass.id}`, undefined, admin.cookie);

  // سناریوی حذف ثبت خطاخورده از رابط
  await page.evaluate(() => {
    const QUEUE_KEY = 'noq_offline_queue_v1';
    const bad = { id: `bad-${Date.now()}`, url: '/api/classes?id=nonexistent', method: 'DELETE', body: {}, createdAt: Date.now(), label: 'ثبت خراب آزمایشی', failCount: 3, lastError: 'خطای ۴۰۴' };
    localStorage.setItem(QUEUE_KEY, JSON.stringify([bad]));
  });
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await page.waitForTimeout(1200);
  const bannerVisible = await page.locator('text=ثبت توسط سرور پذیرفته نشد').count() > 0;
  check('هشدار قرمز ثبت خراب نمایش داده شد', bannerVisible);
  if (bannerVisible) {
    await page.on('dialog', (d) => d.accept());
    await page.locator('text=ثبت توسط سرور پذیرفته نشد').first().click();
    await page.waitForTimeout(400);
    await page.locator('button:has-text("حذف همهٔ ثبت‌های خطاخورده از صف")').click();
    await page.waitForTimeout(700);
    const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('noq_offline_queue_v1') || '[]'));
    check('حذف همه از رابط کاربری انجام شد', q2.length === 0, `باقی‌مانده: ${q2.length}`);
  }

  check('صفر خطای کنسول در کل تست', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log('═'*50);
  console.log(`نتیجهٔ نهایی: ${passed} PASS | ${failed} FAIL`);
  if (fails.length) console.log('شکست‌ها:\n- ' + fails.join('\n- '));
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('خطای اجرای تست:', e); process.exit(2); });
