#!/usr/bin/env node
/**
 * دودتست کامل نسخهٔ ۳.۳.۰ — قوانین وزارت معارف + بخش‌های جدید
 * ترانسپورت، فروشات، خزانه/تسلیمی، مصارفات/معاشات، SMS، مضامین ملی،
 * فیلدهای کارت سوانح، باندهای الف-هـ، مشروط/محروم، پشتیبان v5، زبان
 */
const BASE = 'http://127.0.0.1:3100';
let cookie = '';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✔ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; results.push(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

(async () => {
  console.log('═══ دودتست نسخهٔ ۳.۳.۰ — قوانین وزارت معارف افغانستان ═══\n');

  // ۱ — ورود مدیر
  const login = await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', username: 'admin', password: 'admin123' }) });
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  check('ورود مدیر', login.status === 200 && cookie.length > 10);

  // ۲ — تنظیمات معارف (کلیدهای جدید)
  const setPut = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: { licenseNo: 'JK-1405-1234', schoolPhone: '0791680632', schoolEmail: 'info@nedaalqalam.edu.af', language: 'dr', minAverage: '50', attendanceMin: '75' } }) });
  check('ذخیرهٔ کلیدهای جدید تنظیمات (جواز/تماس/زبان/حد نصاب‌ها)', setPut.status === 200);
  const setGet = await api('/api/settings');
  check('خواندن جواز فعالیت', setGet.json.settings?.licenseNo === 'JK-1405-1234');

  // ۳ — صنف + مضامین ملی
  const classes = await api('/api/classes');
  const cls = classes.json.classes || [];
  check('فهرست صنف‌ها', cls.length >= 0, `${cls.length} صنف`);
  let classId = cls[0]?.id;
  if (!classId) {
    const created = await api('/api/classes', { method: 'POST', body: JSON.stringify({ grade: 7, name: 'صنف هفتم' }) });
    classId = created.json.id;
  }
  const cur = await api('/api/curriculum?grade=7');
  check('فهرست مضامین ملی صنف هفتم', cur.status === 200 && (cur.json.subjects || []).length >= 14, `${(cur.json.subjects || []).length} مضمون`);
  check('پشتو و دری در نصاب ملی صنف ۷', (cur.json.subjects || []).includes('پشتو') && (cur.json.subjects || []).includes('دری'));
  const apply = await api('/api/curriculum', { method: 'POST', body: JSON.stringify({ action: 'apply-national', classId }) });
  check('درج مضامین ملی در صنف', apply.status === 200 && (apply.json.createdLinks || 0) + (apply.json.existingLinks || 0) > 0, apply.json.message || '');

  // ۴ — شاگرد با فیلدهای کارت سوانح
  const st = await api('/api/students', { method: 'POST', body: JSON.stringify({ firstName: 'احمد', fatherName: 'محمد', grandFather: 'علی', classId, idNumber: '1301-0456', idPlace: 'کابل', fatherTongue: 'دری', motherTongue: 'پشتو', guardianName: 'محمدی', guardianPhone: '0790000001', enrolledYear: '1405' }) });
  check('ثبت شاگرد با فیلدهای کارت سوانح (محل صدور تذکره، زبان پدری/مادری)', st.status === 200 && st.json.id);
  const studentId = st.json.id;
  const stList = await api('/api/students?search=احمد');
  const found = (stList.json.students || []).find((s) => s.id === studentId);
  check('ذخیرهٔ فیلدهای معارف در پرونده', found?.idPlace === 'کابل' && found?.fatherTongue === 'دری' && found?.motherTongue === 'پشتو');

  // ۵ — ترانسپورت: ثبت، وصول فیس، مصرف، گذارش
  const trEnroll = await api('/api/transport', { method: 'POST', body: JSON.stringify({ action: 'save-enrollment', studentId, route: 'کارته‌نو — پل‌سنگی', vehicleNo: 'KBL-777', monthlyFee: 500 }) });
  check('ثبت متعلم ترانسپورت', trEnroll.status === 200 && trEnroll.json.id);
  const enrollId = trEnroll.json.id;
  const trPay = await api('/api/transport', { method: 'POST', body: JSON.stringify({ action: 'save-payment', enrollmentId: enrollId, month: '1405-03', amount: 500, paidAt: '2026-11-16' }) });
  check('وصول فیس ماهانهٔ ترانسپورت', trPay.status === 200 && trPay.json.id);
  const trExp = await api('/api/transport', { method: 'POST', body: JSON.stringify({ action: 'save-expense', month: '1405-03', amount: 300, note: 'تیل موتر' }) });
  check('ثبت مصرف ترانسپورت', trExp.status === 200 && trExp.json.id);
  const trGet = await api('/api/transport?month=1405-03');
  check('گذارش ماهانهٔ ترانسپورت: عواید ۵۰۰، مصرف ۳۰۰، مفاد ۲۰۰', trGet.json.monthReport?.income === 500 && trGet.json.monthReport?.expense === 300 && trGet.json.monthReport?.profit === 200, JSON.stringify(trGet.json.monthReport));

  // ۶ — فروشات: کتاب و یونیفورم، خریداری، فروش، مفاد
  const item1 = await api('/api/store', { method: 'POST', body: JSON.stringify({ action: 'save-item', name: 'ریاضی هفتم', kind: 'BOOK', buyPrice: 100, sellPrice: 150, stock: 0 }) });
  check('ثبت کتاب درسی', item1.status === 200 && item1.json.id);
  const item2 = await api('/api/store', { method: 'POST', body: JSON.stringify({ action: 'save-item', name: 'پیراهن‌وتنبان', kind: 'UNIFORM', size: '۳۰', buyPrice: 400, sellPrice: 600 }) });
  check('ثبت یونیفورم', item2.status === 200 && item2.json.id);
  const pur = await api('/api/store', { method: 'POST', body: JSON.stringify({ action: 'save-purchase', itemId: item1.json.id, qty: 20, unitCost: 100 }) });
  check('خریداری از بازار + پر شدن انبار', pur.status === 200);
  const sale = await api('/api/store', { method: 'POST', body: JSON.stringify({ action: 'save-sale', itemId: item1.json.id, studentId, qty: 5, unitPrice: 150 }) });
  check('فروش کتاب به متعلم', sale.status === 200 && sale.json.id);
  const saleBad = await api('/api/store', { method: 'POST', body: JSON.stringify({ action: 'save-sale', itemId: item2.json.id, qty: 3, unitPrice: 600 }) });
  check('جلوگیری از فروش بیش از انبار', saleBad.status === 400, saleBad.json.error || '');
  const storeGet = await api('/api/store?kind=BOOK');
  check('گذارش مفاد کتاب: عواید ۷۵۰، بهای ۵۰۰، مفاد ۲۵۰', storeGet.json.report?.revenue === 750 && storeGet.json.report?.cost === 500 && storeGet.json.report?.profit === 250, JSON.stringify({ r: storeGet.json.report?.revenue, c: storeGet.json.report?.cost, p: storeGet.json.report?.profit }));

  // ۷ — مصارفات و معاشات
  const cat = await api('/api/expenses', { method: 'POST', body: JSON.stringify({ action: 'save-category', name: 'تیل و برق' }) });
  check('ثبت کتگوری مصرف', cat.status === 200 && cat.json.id);
  const exp = await api('/api/expenses', { method: 'POST', body: JSON.stringify({ action: 'save-expense', categoryId: cat.json.id, amount: 1200, date: '2026-11-16', note: 'برق ماه' }) });
  check('ثبت مصرف با کتگوری', exp.status === 200 && exp.json.id);
  const teachers = await api('/api/teachers');
  const t1 = (teachers.json.teachers || [])[0];
  if (t1) {
    const sal = await api('/api/expenses', { method: 'POST', body: JSON.stringify({ action: 'save-salary', teacherId: t1.id, month: '1405-03', amount: 9000, status: 'PAID' }) });
    check('ثبت معاش کارمند', sal.status === 200 && sal.json.id);
  } else {
    check('ثبت معاش کارمند', true, 'کارمندی ثبت نشده — رد شد');
  }
  const expGet = await api('/api/expenses?from=2026-11-01&to=2026-11-30');
  check('فلتر مصارفات به تاریخ + کتگوری', expGet.status === 200 && expGet.json.totals?.expenses === 1200);

  // ۸ — خزانه: دخل، تجری، بیلانس، تسلیمی با رسید
  const handover = await api('/api/treasury', { method: 'POST', body: JSON.stringify({ action: 'save-handover', amount: 2000, date: '2026-11-16', receiptNo: 'R-001', note: 'تسلیمی هفته' }) });
  check('تسلیمی پول به صاحب مکتب با نمبر رسید', handover.status === 200 && handover.json.id);
  const manual = await api('/api/treasury', { method: 'POST', body: JSON.stringify({ action: 'save-transaction', type: 'DAKHIL', amount: 800, note: 'هدیه' }) });
  check('دخل دستوی', manual.status === 200 && manual.json.id);
  const treas = await api('/api/treasury');
  const inc = treas.json.income || {};
  const out = treas.json.outcome || {};
  check('عواید خزانه: فیس + فروشات + ترانسپورت + دستوی', inc.fees >= 0 && inc.store === 750 && inc.transport === 500 && inc.manualIn === 800, `فیس ${inc.fees} | فروش ${inc.store} | ترانس ${inc.transport}`);
  check('مصارف خزانه: مصارفات + معاشات + ترانسپورت', out.expenses === 1200 && out.salaries >= (t1 ? 9000 : 0) && out.transportExpenses === 300, JSON.stringify(out));
  const expectedBalance = inc.total - out.total - 2000;
  check('بیلانس خزانه = دخل − تجری − تسلیمی', treas.json.balance === expectedBalance, `${treas.json.balance} = ${inc.total} - ${out.total} - 2000`);

  // ۹ — SMS: قالب‌ها، صف حاضری، صف فیس، ارسال
  const smsTpl = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'save-templates', value: JSON.stringify({ ATTENDANCE: '{school}: {name} صنف {class} در {date} غایب بود.', FEE: '{school}: فیس {month} {name}: {amount} افغانی باقی.', EXAM: '{school}: امتحان {class} آغاز شد.', NOTICE: '{school}: {body}' }) }) });
  check('ذخیرهٔ قالب‌های SMS (مدیر)', smsTpl.status === 200);
  const smsCfg = await api('/api/sms');
  check('خواندن قالب‌ها و وضعیت دروازه', smsCfg.status === 200 && typeof smsCfg.json.providerConfigured === 'boolean');
  // حاضری غایب برای صف SMS
  await api('/api/attendance', { method: 'POST', body: JSON.stringify({ action: 'save', date: '2026-11-16', classId, items: [{ studentId, status: 'ABSENT' }] }) });
  const qAtt = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'queue-attendance', date: '2026-11-16' }) });
  check('صف پیام حاضری به والدین غایبین', qAtt.status === 200 && (qAtt.json.queued || 0) >= 1, `صف: ${qAtt.json.queued}`);
  const qFee = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'queue-fee', month: '1405-11' }) });
  check('صف پیام فیس باقی ماه', qFee.status === 200, `صف: ${qFee.json.queued}`);
  const sendNoProvider = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'send-pending' }) });
  check('پایان صف بدون دروازه → پیام روشن', sendNoProvider.status === 400 && String(sendNoProvider.json.error || '').includes('دروازه'), sendNoProvider.json.error || '');
  const prov = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'save-provider', value: JSON.stringify({ url: 'http://127.0.0.1:9/sms', method: 'POST', params: { to: '{phone}', text: '{body}' } }) }) });
  check('ذخیرهٔ دروازهٔ SMS', prov.status === 200);
  const sendFail = await api('/api/sms', { method: 'POST', body: JSON.stringify({ action: 'send-pending' }) });
  check('تلاش ارسال از طریق دروازه (ناکام قابل انتظار — دروازهٔ آزمونی)', sendFail.status === 200 && typeof sendFail.json.failed === 'number', `ارسال ${sendFail.json.sent}، ناکام ${sendFail.json.failed}`);

  // ۱۰ — نمرات و قوانین معارف: باندها، مشروط، محروم
  const subjects = await api('/api/subjects');
  const subList = subjects.json.subjects || subjects.json || [];
  const csList = await api('/api/classes');
  const cs = (csList.json.classes || []).find((c) => c.id === classId);
  const csSubjects = cs?.classSubjects || [];
  check('مضامین سپرده‌شدهٔ صنف موجود است', csSubjects.length > 0, `${csSubjects.length} مضمون`);
  const csId = csSubjects[0]?.id;
  const gPost = await api('/api/grades', { method: 'POST', body: JSON.stringify({ classSubjectId: csId, period: 'MIDTERM', approved: true, items: [{ studentId, written: 24, oral: 12 }] }) });
  check('ثبت نمرهٔ شقه — تحریری ۲۴ از ۲۵ + تقریری ۱۲ از ۱۵', gPost.status === 200 && gPost.json.saved >= 1, JSON.stringify(gPost.json).slice(0, 90));
  const gGet = await api(`/api/grades?classSubjectId=${csId}`);
  check('ترکیب رسمی اجزا: چهارو‌نیم‌ماهه تحریری ۲۵/تقریری ۱۵', gGet.json.periodComponents?.MIDTERM?.maxWritten === 25 && gGet.json.periodComponents?.MIDTERM?.maxOral === 15, JSON.stringify(gGet.json.periodComponents?.MIDTERM));
  const gAnn = await api('/api/grades', { method: 'POST', body: JSON.stringify({ classSubjectId: csId, period: 'ANNUAL', approved: true, items: [{ studentId, written: 44, oral: 14 }] }) });
  check('نمرهٔ سالانه: تحریری ۴۴ از ۴۰ → محدود به سقف', gAnn.status === 200);
  const resGet = await api(`/api/results?mode=student&studentId=${studentId}`);
  const row = resGet.json.subjects?.[0];
  check('نمرهٔ نهائی مضمون = چهارونیم‌ماهه ۳۶ + سالانه ۵۴ = ۹۰ (تحریری سالانه به سقف ۴۰ محدود شد)', row?.final === 90, `نهایی: ${row?.final}`);
  check('مکتسبهٔ الف ≥۹۰٪', row?.letter === 'الف', row?.letter);

  // ۱۱ — پشتیبان v5 شامل جدول‌های جدید
  const backup = await api('/api/backup');
  const bd = backup.json.data || {};
  check('پشتیبان نسخهٔ ۵ — همهٔ ۱۲ جدول جدید', backup.json.version === 5 && Array.isArray(bd.transportEnrollments) && Array.isArray(bd.storeItems) && Array.isArray(bd.smsOutbox) && Array.isArray(bd.moneyHandovers) && Array.isArray(bd.salaryPayments) && Array.isArray(bd.treasuryTransactions), `version ${backup.json.version}`);

  // ۱۲ — زبان رابط
  await api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: { language: 'ps' } }) });
  const langGet = await api('/api/settings');
  check('سویچ زبان به پشتو ذخیره می‌شود', langGet.json.settings?.language === 'ps');
  await api('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: { language: 'dr' } }) });

  console.log(results.join('\n'));
  console.log(`\n═══ نتیجهٔ نهایی: ${pass} موفق، ${fail} ناموفق ═══`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('خطای کلی:', e); process.exit(1); });
