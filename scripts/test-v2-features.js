/**
 * تست ویژگی‌های نسخهٔ ۲.۰ — داشبورد نموداری، پروفایل شاگرد، ورود گروهی،
 * ارتقای صنف، همه‌حاضر، ویرایش فعالیت، دارک‌مود، گاردهای امنیتی
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';

function ok(msg) { console.log(`  ✓ ${msg}`); }
function bad(msg) { console.log(`  ✗ ${msg}`); process.exitCode = 1; }

const browser = await chromium.launch();

async function login(page, u = 'admin', p = 'admin123') {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.fill('#username', u);
  await page.fill('#password', p);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2200);
}

// ═══ فاز ۱: داشبورد — نمودارها ═══
console.log('── فاز ۱: داشبورد با نمودار ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await login(page);
  await page.waitForTimeout(1500);
  const hasTrend = await page.locator('text=روند حاضری ۷ روز اخیر').count();
  hasTrend ? ok('کارت «روند حاضری ۷ روز اخیر» نمایش داده شد') : bad('نمودار روند حاضری نیست');
  const svgCount = await page.locator('svg.recharts-surface').count();
  svgCount >= 1 ? ok(`نمودار رندر شد (${svgCount} نمودار SVG)`) : bad('نمودار SVG رندر نشد');
  const hasDist = await page.locator('text=توزیع رتبهٔ نمرات سالانه').count();
  hasDist ? ok('نمودار توزیع نمرات نمایش داده شد') : bad('نمودار توزیع نمرات نیست');
  errors.length === 0 ? ok('صفر خطای جاوااسکریپت در داشبورد') : bad('خطا: ' + errors[0].slice(0, 100));
  await page.close();
}

// ═══ فاز ۲: دارک‌مود ═══
console.log('── فاز ۲: دارک‌مود ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(page);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => document.documentElement.className);
  await page.getByRole('button', { name: /تم/ }).click(); // روشن → سیستم
  await page.getByRole('button', { name: /تم/ }).click(); // سیستم → تاریک
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.documentElement.className);
  (after.includes('dark') && !before.includes('dark')) ? ok('دارک‌مود فعال شد (کلاس dark روی html)') : bad(`کلاس تم تغییر نکرد: ${before} → ${after}`);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  bg !== 'rgb(255, 255, 255)' ? ok(`پس‌زمینهٔ تاریک: ${bg}`) : bad('پس‌زمینه هنوز سفید است');
  // پایداری پس از ریلود
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const persisted = await page.evaluate(() => document.documentElement.className);
  persisted.includes('dark') ? ok('دارک‌مود پس از ریلود حفظ شد (localStorage)') : bad('دارک‌مود بعد از ریلود از دست رفت');
  await page.close();
}

// ═══ فاز ۳: پروفایل شاگرد ═══
console.log('── فاز ۳: پروفایل شاگرد ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(page);
  await page.getByRole('button', { name: 'شاگردان', exact: true }).click();
  await page.waitForTimeout(1800);
  await page.locator('table tbody tr').first().locator('button').first().click();
  await page.waitForTimeout(1800);
  const profileVisible = await page.locator('text=پروفایل شاگرد').count();
  profileVisible ? ok('دیالوگ پروفایل باز شد') : bad('پروفایل باز نشد');
  const hasAtt = await page.locator('text=حاضری').first().isVisible().catch(() => false);
  hasAtt ? ok('خلاصهٔ حاضری نمایش داده شد') : bad('خلاصهٔ حاضری نیست');
  const hasGrades = await page.locator('text=نمرات نهایی مضامین').isVisible().catch(() => false);
  hasGrades ? ok('نمرات نهایی مضامین نمایش داده شد') : bad('نمرات پروفایل نیست');
  await page.close();
}

// ═══ فاز ۴: ورود گروهی CSV (پیش‌نمایش + ثبت) ═══
console.log('── فاز ۴: ورود گروهی CSV ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(page);
  await page.getByRole('button', { name: 'شاگردان', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'ورود گروهی' }).click();
  await page.waitForTimeout(800);
  const stamp = Date.now().toString(36).slice(-4);
  const csv = `طلا${stamp},تستی,پدر تستی,صنف هشتم,F\nبدونصنف${stamp},تستی,پدر تستی,,M\n,ناقص,ولد خالی,,M`;
  await page.locator('textarea').fill(csv);
  await page.waitForTimeout(500);
  const preview = await page.locator('text=پیش‌نمایش:').textContent().catch(() => '');
  preview.includes('۲') && preview.includes('۱')
    ? ok(`پیش‌نمایش درست: ${preview.trim()}`)
    : bad(`پیش‌نمایش نادرست: ${preview}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /ثبت ۲ شاگرد/ }).click();
  await page.waitForTimeout(2500);
  const found = await page.locator(`td:has-text("طلا${stamp}")`).count();
  found ? ok('شاگرد CSV در جدول ثبت شد') : bad('شاگرد CSV ثبت نشد');
  await page.close();
}

// ═══ فاز ۵: همه‌حاضر + ارتقای صنف ═══
console.log('── فاز ۵: حاضری «همه حاضر» و ارتقای صنف ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(page);
  await page.getByRole('button', { name: 'حاضری یومیه', exact: true }).click();
  await page.waitForTimeout(1500);
  // انتخاب صنف — دکمهٔ «همه حاضر» با ظاهر شدن شاگردان رندر می‌شود
  await page.locator('button[role="combobox"]').first().click();
  await page.getByRole('option', { name: 'صنف هفتم' }).first().click();
  await page.waitForTimeout(2000);
  const allBtn = await page.getByRole('button', { name: /همه حاضر/ }).count();
  allBtn ? ok('دکمهٔ «همه حاضر» موجود است') : bad('دکمهٔ همه‌حاضر نیست');
  // ارتقای صنف — فقط باز شدن دیالوگ (بدون اجرای انتقال واقعی)
  await page.getByRole('button', { name: 'شاگردان', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'ارتقای صنف' }).click();
  await page.waitForTimeout(700);
  const promoteDlg = await page.locator('text=ارتقای دسته‌جمعی صنف').count();
  promoteDlg ? ok('دیالوگ ارتقای صنف باز شد') : bad('دیالوگ ارتقا نیست');
  await page.keyboard.press('Escape');
  await page.close();
}

// ═══ فاز ۶: ویرایش فعالیت + گاردهای امنیتی ═══
console.log('── فاز ۶: ویرایش فعالیت و امنیت ──');
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(page);
  await page.getByRole('button', { name: 'فعالیت شاگردان', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator('button[role="combobox"]').first().click();
  await page.getByRole('option', { name: 'صنف هفتم' }).first().click();
  await page.waitForTimeout(1500);
  const editBtns = await page.locator('table').getByRole('button', { name: 'ویرایش' }).count();
  editBtns > 0 ? ok(`دکمهٔ ویرایش فعالیت موجود است (${editBtns})`) : bad('دکمهٔ ویرایش فعالیت نیست');
  await page.close();

  // گارد امنیتی: کارمند به کارنامه دسترسی ندارد
  const cookie = await (async () => {
    const res = await fetch(`${BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: 'staff', password: '12345678' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] || '';
  })();
  const res = await fetch(`${BASE}/api/results?mode=student&studentId=x`, { headers: { cookie } });
  res.status === 403 ? ok('گارد امنیتی: کارمند به کارنامه دسترسی ندارد (403)') : bad(`کارمند کارنامه گرفت: ${res.status}`);

  // محدودیت نرخ ورود: ۶ تلاش غلط → ۴۲۹
  let last = 0;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: 'ratelimit-probe', password: 'wrong' }),
    });
    last = r.status;
    if (r.status === 429) break;
  }
  last === 429 ? ok('محدودیت نرخ ورود فعال شد (429 پس از تلاش‌های مکرر)') : bad(`rate limit فعال نشد (آخرین: ${last})`);
}

await browser.close();
console.log(process.exitCode ? '\n★ شکست تست‌ها' : '\n★ همهٔ تست‌های v2 PASS');
