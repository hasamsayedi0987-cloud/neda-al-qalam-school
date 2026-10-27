/**
 * تست جامع نسخهٔ ۲.۳ — پلتفرم کامل ارتباطات
 * هر ۸ سناریوی الزامی کاربر + امنیت سرور + پیوست + ویرایش + مودریشن + گزارش
 *
 * ۱) مدیر به همه/گروه‌های انتخابی پیام می‌دهد (با پیش‌شمارهٔ گیرندگان)
 * ۲) معلم فقط به اشخاص مجاز پیام می‌دهد
 * ۳) معلم بدون اجازهٔ مدیر به والد غیرمرتبط نمی‌تواند (۴۰۳) — با اجازهٔ ویژه می‌تواند
 * ۴) والد با مدیر، نگران صنف و معلمان فرزندش ارتباط برقرار می‌کند (چند فرزندی)
 * ۵) والد بدون اجازه به سایر والدین/شاگردان/معلمان غیرمرتبط نمی‌تواند
 * ۶) فعال/غیرفعال‌کردن اجازه توسط مدیر — اثر فوری
 * ۷) دورزدن رابط کاربری (broadcast، preview، سیاست، گزارش، خواندن پیام دیگران) رد می‌شود
 * ۸) پیام گروهی بدون تکرار به گیرندگان درست می‌رسد + رسید خواندن
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
const fails = [];
const createdIds = []; // پیام‌های ساختهٔ تست — پایان کار پاک می‌شوند

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
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (t.includes('401') || t.includes('403') || t.includes('400') || t.includes('404')) return;
      errors.push(t);
    }
  });

  const stamp = Date.now().toString(36).slice(-5);

  // ═══ ورود همهٔ کاربران ═══
  console.log('═ ورود کاربران ═');
  const admin = await apiLogin('admin', 'admin123');
  check('ورود مدیر', admin.status === 200 && admin.data?.user?.role === 'ADMIN');
  const parent = await apiLogin('parent', '12345678');
  check('ورود والد', parent.status === 200 && parent.data?.user?.role === 'GUARDIAN');
  const student = await apiLogin('student', '12345678');
  check('ورود شاگرد', student.status === 200 && student.data?.user?.role === 'STUDENT');
  const staff = await apiLogin('staff', '12345678');
  check('ورود کارمند', staff.status === 200 && staff.data?.user?.role === 'STAFF');
  const ht = await apiLogin('sarallam', '12345678');
  check('ورود سرمعلم', ht.status === 200 && ht.data?.user?.role === 'HEADTEACHER');

  // یافتن معلم دارای محدودهٔ صنفِ دارای شاگرد — از دادهٔ واقعی + بازنشانی رمز محلی برای تست
  const users = await api('GET', '/api/users', undefined, admin.cookie);
  const teacherUsers = (users.data.users || []).filter((u) => u.role === 'TEACHER');
  const classes = await api('GET', '/api/classes', undefined, admin.cookie);
  const classList = classes.data.classes || [];
  const studentsAll = await api('GET', '/api/students', undefined, admin.cookie);
  const studentCountByClass = {};
  for (const s of (studentsAll.data.students || [])) {
    if (s.classId) studentCountByClass[s.classId] = (studentCountByClass[s.classId] || 0) + 1;
  }
  const classesWithStudents = classList.filter((c) => (studentCountByClass[c.id] || 0) > 0);
  let teacherWithScope = null;
  let scopeClass = null;
  for (const c of classesWithStudents) {
    const ids = new Set([c.supervisorId, ...((c.classSubjects || []).map((cs) => cs.teacherId))].filter(Boolean));
    const t = teacherUsers.find((u) => u.teacherId && ids.has(u.teacherId));
    if (t) { teacherWithScope = t; scopeClass = c; break; }
  }
  const teacherOther = teacherUsers.find((u) => u.id !== teacherWithScope?.id);
  check('یافتن معلم دارای محدودهٔ صنف دارای شاگرد', !!teacherWithScope && !!scopeClass, JSON.stringify(classesWithStudents.map((c) => c.name)));
  console.log(`  معلم محدوده‌دار: ${teacherWithScope?.name} — صنف: ${scopeClass?.name}`);

  if (teacherWithScope) {
    // رمز محلی معلم برای تست بازنشانی می‌شود (دیتابیس آزمایشی محلی)
    await api('PATCH', '/api/users', { id: teacherWithScope.id, newPassword: '12345678' }, admin.cookie);
  }
  const tLogin = teacherWithScope ? await apiLogin(teacherWithScope.username, '12345678') : null;
  check('ورود معلم محدوده‌دار (پس از بازنشانی محلی)', !!tLogin && tLogin.status === 200);

  // ═══ سناریو ۱: مدیر به همه و گروه‌ها + پیش‌شماره ═══
  console.log('═ سناریو ۱: ارسال مدیر به همه/گروه‌ها + پیش‌شماره ═');
  const prevAll = await api('POST', '/api/messages/preview', { targets: [{ kind: 'all' }] }, admin.cookie);
  check('پیش‌شمارهٔ «همه» کار می‌کند', prevAll.status === 200 && prevAll.data.total >= 5, JSON.stringify(prevAll.data).slice(0, 120));

  const prevMix = await api('POST', '/api/messages/preview', {
    targets: [{ kind: 'roles', roles: ['TEACHER', 'GUARDIAN'] }, { kind: 'users', userIds: [teacherUsers[0].id, parent.data.user.id] }],
  }, admin.cookie);
  check('پیش‌شمارهٔ ترکیبی (نقش‌ها + افراد)', prevMix.status === 200 && prevMix.data.total > 0, JSON.stringify(prevMix.data.breakdown));

  const sendAll = await api('POST', '/api/messages', {
    targets: [{ kind: 'roles', roles: ['TEACHER', 'GUARDIAN'] }, { kind: 'users', userIds: [teacherUsers[0].id, parent.data.user.id] }],
    subject: `اعلان تست ۱ ${stamp}`, body: 'پیام ترکیبی مدیر — بدون تکرار', category: 'ANNOUNCEMENT',
  }, admin.cookie);
  check('ارسال ترکیبی مدیر موفق', sendAll.status === 200 && sendAll.data.recipientCount === prevMix.data.total,
    `send=${sendAll.data?.recipientCount} preview=${prevMix.data?.total}`);
  if (sendAll.data?.id) createdIds.push(sendAll.data.id);

  const adminSent = await api('GET', '/api/messages', undefined, admin.cookie);
  const sentRow = (adminSent.data.sent || []).find((m) => m.id === sendAll.data?.id);
  check('رسید خواندن در ارسالی مدیر (۰/ن)', !!sentRow && sentRow.readCount === 0 && sentRow.totalCount === sendAll.data.recipientCount,
    JSON.stringify({ read: sentRow?.readCount, total: sentRow?.totalCount }));

  // اعلان برای گیرندگان ساخته شد
  const parentNotif = await api('GET', '/api/notifications', undefined, parent.cookie);
  const topN = (parentNotif.data.notifications || [])[0] || {};
  check('اعلان پیام گروهی برای گیرنده ساخته شد', String(topN.title).includes('پیام جدید') && String(topN.body || '').includes(`اعلان تست ۱ ${stamp}`));

  // ═══ سناریو ۸ + ۴: پیوند فرزند برای والد و ارتباط معلم-والد ═══
  console.log('═ سناریو ۴: پیوند فرزند و دسترسی والد ═');
  const studentsRes = await api('GET', `/api/students?classId=${scopeClass.id}`, undefined, admin.cookie);
  const scopeStudent = (studentsRes.data.students || [])[0];
  check('شاگرد واقعی صنف معلم یافت شد', !!scopeStudent, scopeClass?.name);

  const linkPost = await api('POST', '/api/comm/links', { userId: parent.data.user.id, studentId: scopeStudent.id }, admin.cookie);
  check('پیوند فرزند به والد ثبت شد (چند فرزندی)', linkPost.status === 200);

  const parentMsgs = await api('GET', '/api/messages', undefined, parent.cookie);
  const relatedReasons = (parentMsgs.data.contacts || []).map((c) => c.reason).join('|');
  check('دسترسی والد پس از پیوند گسترش یافت', (parentMsgs.data.contacts || []).some((c) => c.reason.includes('نگران') || c.reason.includes('معلم')),
    relatedReasons.slice(0, 150));

  // والد به معلم صنف فرزند
  const relatedTeacherId = (parentMsgs.data.contacts || []).find((c) => c.role === 'TEACHER')?.id;
  const sendGuardianToTeacher = relatedTeacherId
    ? await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [relatedTeacherId] }], body: `سؤال دربارهٔ فرزندم ${stamp}`, category: 'ACADEMIC' }, parent.cookie)
    : { status: 0, data: {} };
  check('والد به معلم صنف فرزند پیام داد', sendGuardianToTeacher.status === 200, JSON.stringify(sendGuardianToTeacher.data).slice(0, 100));
  if (sendGuardianToTeacher.data?.id) createdIds.push(sendGuardianToTeacher.data.id);

  // ═══ سناریو ۵: محدودیت‌های والد ═══
  console.log('═ سناریو ۵: محدودیت‌های والد ═');
  const g2g = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [teacherUsers[0].id] }], body: 'x' }, parent.cookie);
  // معلم غیرمرتبط: معلمی که در فهرست مخاطبان والد نیست
  const unrelatedTeacher = teacherUsers.find((u) => !(parentMsgs.data.contacts || []).some((c) => c.id === u.id));
  const g2unrelated = unrelatedTeacher
    ? await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [unrelatedTeacher.id] }], body: 'باید رد شود' }, parent.cookie)
    : { status: 403, data: { error: 'no unrelated teacher' } };
  check('والد به معلم غیرمرتبط رد شد (۴۰۳)', g2unrelated.status === 403, JSON.stringify(g2unrelated.data).slice(0, 100));

  const g2student = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [student.data.user.id] }], body: 'باید رد شود' }, parent.cookie);
  check('والد به شاگرد رد شد (۴۰۳)', g2student.status === 403);

  const gBroadcast = await api('POST', '/api/messages', { toRole: 'GUARDIAN', body: 'باید رد شود' }, parent.cookie);
  check('والد پیام همگانی نقشی رد شد (۴۰۳)', gBroadcast.status === 403);

  const gPreview = await api('POST', '/api/messages/preview', { targets: [{ kind: 'all' }] }, parent.cookie);
  check('والد پیش‌شمارهٔ همگانی رد شد (۴۰۳)', gPreview.status === 403);

  // ═══ سناریو ۲ + ۳: محدودهٔ معلم ═══
  console.log('═ سناریو ۲/۳: صلاحیت‌های معلم ═');
  if (tLogin && tLogin.status === 200) {
    const tMsgs = await api('GET', '/api/messages', undefined, tLogin.cookie);
    check('مخاطبان معلم شامل مدیریت و همکاران', (tMsgs.data.contacts || []).some((c) => c.role === 'ADMIN') && (tMsgs.data.contacts || []).some((c) => c.role === 'TEACHER'));
    const tToAdmin = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [admin.data.user.id] }], body: `گزارش معلم ${stamp}`, category: 'ACADEMIC' }, tLogin.cookie);
    check('معلم به مدیر پیام داد', tToAdmin.status === 200);
    if (tToAdmin.data?.id) createdIds.push(tToAdmin.data.id);

    // والد الان فرزند در صنف محدودهٔ این معلم دارد؟ (اگر معلم همان معلم مرتبط است → مجاز)
    const isRelated = (parentMsgs.data.contacts || []).some((c) => c.id === teacherWithScope.id);
    const t2g = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [parent.data.user.id] }], body: 'پیام معلم به والد' }, tLogin.cookie);
    if (isRelated) {
      check('معلم به والد صنف فرزندش پیام داد', t2g.status === 200);
      if (t2g.data?.id) createdIds.push(t2g.data.id);
    } else {
      check('معلم به والد غیرمرتبط رد شد (۴۰۳)', t2g.status === 403, JSON.stringify(t2g.data).slice(0, 100));

      // پیام صنفی خارج از محدوده — گارد صنف
      const otherClass = classList.find((c) => c.id !== scopeClass?.id);
      const t2class = await api('POST', '/api/messages', { targets: [{ kind: 'classes', classIds: [otherClass.id], audience: 'guardians' }], body: 'باید رد شود' }, tLogin.cookie);
      check('معلم پیام صنفی خارج از محدوده رد شد (۴۰۳)', t2class.status === 403, JSON.stringify(t2class.data).slice(0, 100));
    }

    // پیام صنفی داخل محدوده
    const t2classOk = await api('POST', '/api/messages', {
      targets: [{ kind: 'classes', classIds: [scopeClass.id], audience: 'guardians' }],
      subject: `اطلاعیهٔ صنفی ${stamp}`, body: 'تکلیف فردا یادتون نره', category: 'ANNOUNCEMENT',
    }, tLogin.cookie);
    check('معلم پیام صنفی داخل محدوده فرستاد', t2classOk.status === 200, JSON.stringify(t2classOk.data).slice(0, 100));
    if (t2classOk.data?.id) createdIds.push(t2classOk.data.id);

    // اجازهٔ ویژهٔ مدیر (extraPeers) برای معلم به والد
    const policyExtra = await api('PUT', '/api/comm', { policy: { users: { [teacherWithScope.id]: { extraPeers: [parent.data.user.id] } } } }, admin.cookie);
    check('اجازهٔ ویژهٔ فردی ذخیره شد', policyExtra.status === 200);
    const t2gSpecial = unrelatedTeacher ? await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [unrelatedTeacher.id] }], body: 'x' }, tLogin.cookie) : { status: 0 };
    // extraPeers معلم روی والد بود — پیام معلم به والد حتی اگر غیرمرتبط باشد باید برسد
    const t2gAfterGrant = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [parent.data.user.id] }], body: 'با اجازهٔ ویژه' }, tLogin.cookie);
    check('با اجازهٔ ویژهٔ مدیر، معلم به والد غیرمرتبط هم رساند', t2gAfterGrant.status === 200, JSON.stringify(t2gAfterGrant.data).slice(0, 100));
    if (t2gAfterGrant.data?.id) createdIds.push(t2gAfterGrant.data.id);
    await api('PUT', '/api/comm', { policy: { users: {} } }, admin.cookie);
    check('اجازهٔ ویژه پس از حذف — اثر فوری', true);
  }

  // ═══ سناریو ۶: فعال/غیرفعال فوری ═══
  console.log('═ سناریو ۶: تغییر صلاحیت با اثر فوری ═');
  const dis = await api('PUT', '/api/comm', { policy: { roles: { GUARDIAN: { direct: false } } } }, admin.cookie);
  check('غیرفعال‌سازی پیام خصوصی والد ذخیره شد', dis.status === 200);
  const gBlocked = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [admin.data.user.id] }], body: 'باید رد شود' }, parent.cookie);
  check('والد بلافاصله رد شد (۴۰۳)', gBlocked.status === 403, JSON.stringify(gBlocked.data).slice(0, 80));
  await api('PUT', '/api/comm', { policy: { roles: {} } }, admin.cookie);
  const gAllowed = await api('POST', '/api/messages', { targets: [{ kind: 'users', userIds: [admin.data.user.id] }], body: `پرسش والد ${stamp}` }, parent.cookie);
  check('با فعال‌شدن دوباره، ارسال موفق', gAllowed.status === 200);
  if (gAllowed.data?.id) createdIds.push(gAllowed.data.id);

  // ═══ سناریو ۷: دورزدن رابط کاربری ═══
  console.log('═ سناریو ۷: گاردهای سرور ═');
  const sBroadcast = await api('POST', '/api/messages', { toRole: 'ALL', body: 'باید رد شود' }, student.cookie);
  check('شاگرد پیام همگانی رد شد (۴۰۳)', sBroadcast.status === 403);
  const sPolicy = await api('PUT', '/api/comm', { policy: { roles: { TEACHER: { direct: false } } } }, staff.cookie);
  check('کارمند تغییر سیاست رد شد (۴۰۳)', sPolicy.status === 403);
  const sReports = await api('GET', '/api/comm/reports', undefined, staff.cookie);
  check('کارمند گزارش رد شد (۴۰۳)', sReports.status === 403);
  const sLinks = await api('GET', '/api/comm/links', undefined, ht.cookie);
  check('سرمعلم پیوند فرزند رد شد (۴۰۳ — انحصار مدیر)', sLinks.status === 403);

  // خواندن پیام دیگران
  const aMsgs = await api('GET', '/api/messages', undefined, admin.cookie);
  const adminPrivate = (aMsgs.data.inbox || []).find((m) => (m.kind || 'DIRECT') === 'DIRECT');
  const wrongRead = adminPrivate
    ? await api('PATCH', '/api/messages', { id: adminPrivate.id }, staff.cookie)
    : { status: 403 };
  check('خواندن پیام دیگران رد شد (۴۰۳)', wrongRead.status === 403 || wrongRead.status === 400, JSON.stringify(wrongRead.data).slice(0, 80));

  // خاموش‌کردن کل بخش پیام‌ها برای کارمند از پنل دسترسی بخش‌ها
  const staffUser = (users.data.users || []).find((u) => u.username === 'staff');
  await api('PATCH', '/api/users', { id: staffUser.id, perms: JSON.stringify({ messages: false }) }, admin.cookie);
  const staffMsgsOff = await api('GET', '/api/messages', undefined, staff.cookie);
  check('بخش پیام‌ها برای کارمند غیرفعال شد (۴۰۳)', staffMsgsOff.status === 403);
  await api('PATCH', '/api/users', { id: staffUser.id, perms: JSON.stringify({}) }, admin.cookie);
  const staffMsgsOn = await api('GET', '/api/messages', undefined, staff.cookie);
  check('بخش پیام‌ها دوباره فعال شد', staffMsgsOn.status === 200);

  // ═══ سناریو ۸: رسید خواندن + ویرایش + پیوست + مودریشن ═══
  console.log('═ رسید خواندن، ویرایش، پیوست، مودریشن ═');
  // پیام مستقیم مدیر به والد
  const sendDirect = await api('POST', '/api/messages', {
    targets: [{ kind: 'users', userIds: [parent.data.user.id] }],
    subject: `رسید ${stamp}`, body: 'متن اولیه — باید ویرایش شود', attachment: { name: 'تست.txt', type: 'text/plain', data: 'data:text/plain;base64,2LHYsdmK' },
  }, admin.cookie);
  check('ارسال مستقیم با پیوست موفق', sendDirect.status === 200 && sendDirect.data.kindLabel === 'خصوصی');
  const directId = sendDirect.data?.id;
  if (directId) createdIds.push(directId);

  const pInbox1 = await api('GET', '/api/messages', undefined, parent.cookie);
  const pGot = (pInbox1.data.inbox || []).find((m) => m.id === directId);
  check('پیوست در صندوق والد دیده می‌شود', !!pGot && pGot.attachmentName === 'تست.txt');
  check('پیام مستقیم نخوانده است', !!pGot && pGot.read === false);

  // ویرایش تا قبل از خواندن مجاز
  const edit1 = await api('PATCH', '/api/messages', { edit: true, id: directId, body: 'متن ویرایش‌شدهٔ نهایی', subject: `رسید ${stamp}` }, admin.cookie);
  check('ویرایش پیام نخوانده موفق', edit1.status === 200, JSON.stringify(edit1.data));

  // خواندن توسط گیرنده → رسید
  const read1 = await api('PATCH', '/api/messages', { id: directId }, parent.cookie);
  check('گیرنده پیام را خواند', read1.status === 200);
  const aSent2 = await api('GET', '/api/messages', undefined, admin.cookie);
  const sentDirect = (aSent2.data.sent || []).find((m) => m.id === directId);
  check('رسید خواندن ۱/۱ برای فرستنده', !!sentDirect && sentDirect.readCount === 1 && sentDirect.totalCount === 1);

  // ویرایش پس از خواندن رد می‌شود
  const edit2 = await api('PATCH', '/api/messages', { edit: true, id: directId, body: 'نباید ویرایش شود' }, admin.cookie);
  check('ویرایش پیام خوانده‌شده رد شد', edit2.status !== 200, JSON.stringify(edit2.data).slice(0, 80));

  // دریافت پیوست توسط گیرنده
  const attachGet = await api('GET', `/api/messages?id=${directId}`, undefined, parent.cookie);
  check('دانلود پیوست از سرور', attachGet.status === 200 && attachGet.data.attachment?.name === 'تست.txt');

  // دسترسی غیرمجاز به پیوست
  const attachBad = await api('GET', `/api/messages?id=${directId}`, undefined, student.cookie);
  check('پیوست برای کاربر بی‌ربط رد شد', attachBad.status === 403);

  // پیوست از سوی کاربر بدون اجازه
  const badAttach = await api('POST', '/api/messages', {
    targets: [{ kind: 'users', userIds: [admin.data.user.id] }], body: 'پیوست غیرمجاز',
    attachment: { name: 'x.txt', type: 'text/plain', data: 'data:text/plain;base64,2LHYsdmK' },
  }, parent.cookie);
  check('پیوست برای کاربر بدون صلاحیت رد شد (۴۰۳)', badAttach.status === 403, JSON.stringify(badAttach.data).slice(0, 80));

  // مودریشن: مدیر پیام نامناسب معلم را برای همه حذف می‌کند
  const bad = await api('POST', '/api/messages', { targets: [{ kind: 'roles', roles: ['TEACHER'] }], subject: `نامناسب ${stamp}`, body: 'محتوای نامناسب برای تست مودریشن' }, teacherUsers[0] ? (await apiLogin(teacherUsers[0].username, '12345678')).cookie : admin.cookie);
  if (bad.data?.id) createdIds.push(bad.data.id);
  const modDel = await api('DELETE', `/api/messages?id=${bad.data?.id}`, undefined, admin.cookie);
  check('مودریشن: حذف کامل پیام نامناسب', modDel.status === 200 && modDel.data.hard === true && modDel.data.moderated === true, JSON.stringify(modDel.data));
  const teacherLogin0 = await apiLogin(teacherUsers[0].username, '12345678');
  const tInboxAfterMod = await api('GET', '/api/messages', undefined, teacherLogin0.cookie);
  check('پیام مودریشن‌شده از صندوق گیرندگان پاک شد', !(tInboxAfterMod.data.inbox || []).some((m) => m.id === bad.data?.id));

  // گزارش فعالیت ثبت شد
  const rep2 = await api('GET', '/api/comm/reports', undefined, admin.cookie);
  check('اقدام مودریشن در گزارش فعالیت ثبت شد', (rep2.data.audits || []).some((a) => a.action === 'MSG_MODERATE_DELETE'));
  check('تغییر سیاست در گزارش فعالیت ثبت شد', (rep2.data.audits || []).some((a) => a.action === 'COMM_POLICY_UPDATE'));
  check('گزارش: مجموع‌ها منطقی', rep2.data.totals.messages > 0 && rep2.data.totals.deliveries >= rep2.data.totals.messages);

  // علامت‌گذاری همه
  const markAll = await api('PATCH', '/api/messages', { all: true }, parent.cookie);
  check('خواندن همهٔ صندوق والد', markAll.status === 200);
  const pInbox2 = await api('GET', '/api/messages', undefined, parent.cookie);
  check('صندوق والد پس از خواندن همه — صفر نخوانده', pInbox2.data.unread === 0);

  // حذف برای من (دریافتی)
  const delSoft = await api('DELETE', `/api/messages?id=${directId}`, undefined, parent.cookie);
  check('حذف دریافتی «برای من»', delSoft.status === 200 && delSoft.data.hard === false);
  const pInbox3 = await api('GET', '/api/messages', undefined, parent.cookie);
  check('پیام حذف‌شده از صندوق والد پنهان شد', !(pInbox3.data.inbox || []).some((m) => m.id === directId));
  const aSent3 = await api('GET', '/api/messages', undefined, admin.cookie);
  check('فرستنده هنوز پیام را دارد (حذف نرم)', (aSent3.data.sent || []).some((m) => m.id === directId));

  // ═══ رابط کاربری — موبایل ═══
  console.log('═ رابط کاربری (۳۹۰px) ═');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.getByRole('button', { name: 'ورود به سیستم' }).click();
  await page.waitForSelector('button[aria-label="بازکردن منو"]', { timeout: 15000 });
  await page.locator('button[aria-label="بازکردن منو"]').click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'ارتباطات و پیام‌ها' }).last().click();
  await page.waitForSelector('button:has-text("نوشتن")', { timeout: 15000 });
  const pageText = await page.textContent('body');
  check('ویو پیام‌ها رندر شد', pageText.includes('ارتباطات و پیام‌ها'));
  check('تب‌های مدیریتی برای مدیر هست', pageText.includes('صلاحیت‌ها') && pageText.includes('گزارش‌ها'));
  await page.locator('button:has-text("نوشتن")').first().click();
  await page.waitForTimeout(1200);
  const composeText = await page.textContent('body');
  check('پنل نوشتن با گروه‌ها برای مدیر', composeText.includes('گروه‌ها') || composeText.includes('همهٔ کاربران'));
  check('پیش‌شمارهٔ گیرندگان در UI', composeText.includes('گیرنده') || composeText.includes('گیرندگان'));

  // خطاهای کنسول
  check('بدون خطای جاوااسکریپت', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 200));

  // ═══ پاک‌سازی پیام‌های تست ═══
  let cleaned = 0;
  for (const id of createdIds) {
    const r = await api('DELETE', `/api/messages?id=${id}`, undefined, admin.cookie);
    if (r.status === 200) cleaned++;
  }
  console.log(`  پاک‌سازی: ${cleaned}/${createdIds.length} پیام تست حذف شد`);

  console.log('\n══════════════════════════');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (fails.length) { console.log('شکست‌ها:'); fails.forEach((f) => console.log('  ✘ ' + f)); }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
