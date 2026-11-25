#!/usr/bin/env python3
# مرحلهٔ ۵ — پایداری: کلید نشست ضدتضاد، ضدحذف صف در flush، تلاش دوبارهٔ ثبت خطاخورده،
# و سازگاری مسیر ورود با محدودیت تلاش دیتابیسی (async)
import sys

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            if new in s:
                print(f'• {path}: قبلاً اعمال شده'); continue
            print(f'✗ NOT FOUND in {path}: {old[:70]!r}'); sys.exit(1)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path}')

# ─── ۱) کلید امنیتی نشست — منبع واحد، بدون ناسازگاری بین نمونه‌ها ───
edit('src/lib/auth.ts', [
    ("""    // تولید و ذخیرهٔ کلید تصادفی — در پایگاه داده (قابل دسترس عمومی نیست)
    const generated = randomBytes(32).toString('hex');
    await db.setting.upsert({
      where: { key: 'authSecret' },
      update: { value: generated },
      create: { key: 'authSecret', value: generated },
    });
    cachedSecret = generated;
    return cachedSecret;""",
     """    // نسخهٔ ۳.۸.۴ — ضد ناسازگاری کلید بین نمونه‌های سرور:
    // اگر کلید از قبل در دیتابیس هست، هرگز بازنویسی نمی‌شود (update خالی — بدون رقابت)؛
    // و مقدار نهایی همیشه از خود دیتابیس خوانده می‌شود تا دو نمونهٔ هم‌زمان که
    // هر دو کلید تازه ساخته‌اند، در نهایت به «یک» کلید مشترک برسند.
    const generated = randomBytes(32).toString('hex');
    await db.setting.upsert({
      where: { key: 'authSecret' },
      update: {},
      create: { key: 'authSecret', value: generated },
    });
    const finalRow = await db.setting.findUnique({ where: { key: 'authSecret' } });
    cachedSecret = finalRow?.value && finalRow.value.length >= 32 ? finalRow.value : generated;
    return cachedSecret;"""),
])

# ─── ۲) مسیر ورود — فراخوانی‌های async محدودیت تلاش دیتابیسی ───
edit('src/app/api/auth/route.ts', [
    ("      const rl = checkRateLimit(rlKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);",
     "      const rl = await checkRateLimit(rlKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);"),
    ("        recordFailure(rlKey, LOGIN_WINDOW_MS);",
     "        await recordFailure(rlKey, LOGIN_WINDOW_MS);"),
    ("      clearFailures(rlKey);",
     "      await clearFailures(rlKey);"),
])

# ─── ۳) صف آفلاین — ضدحذف ناخواسته در انتهای flush + تلاش دوبارهٔ ثبت خطاخورده ───
edit('src/lib/client/api.ts', [
    ("""  writeQueue(remaining);
  authRequired = authFailed && remaining.length > 0;""",
     """  // نسخهٔ ۳.۸.۴ — ضد حذف ناخواسته: درخواست‌هایی که حین ارسال این دسته به صف اضافه شدند
  // (ثبت جدید کاربر در همان لحظه) با بازنویسی صف گم نمی‌شوند — فقط آیتم‌های همین دسته
  // حذف/به‌روزرسانی می‌شوند و آیتم‌های تازه سر جای خود می‌مانند.
  const processedIds = new Set(queue.map((q) => q.id));
  const fresh = readQueue().filter((q) => !processedIds.has(q.id));
  writeQueue([...remaining, ...fresh]);
  authRequired = authFailed && remaining.length > 0;"""),
    ("""/** پاک‌کردن همهٔ ثبت‌های خطاخوردهٔ صف (با تأیید مدیر) — دادهٔ سرور دست‌نخورده می‌ماند */""",
     """/** تلاش دوبارهٔ دستی یک ثبت خطاخورده — خطای پیشین پاک و بلافاصله ارسال می‌شود */
export function retryQueueItem(id: string) {
  const queue = readQueue();
  const idx = queue.findIndex((q) => q.id === id);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], failCount: 0, lastError: undefined };
  writeQueue(queue);
  notify();
  void flushQueue();
}

/** پاک‌کردن همهٔ ثبت‌های خطاخوردهٔ صف (با تأیید مدیر) — دادهٔ سرور دست‌نخورده می‌ماند */"""),
])

# ─── ۴) رابط — دکمهٔ «تلاش دوباره» برای هر ثبت خطاخورده ───
edit('src/components/app/app-shell.tsx', [
    ("import { apiGet, apiSend, onSyncStateChange, pendingSyncCount, failedSyncItems, isOnline, isAuthRequired, flushQueue, tryAutoRelogin, discardQueueItem, discardAllFailedItems, forgetLastUser, prefetchSections } from '@/lib/client/api';",
     "import { apiGet, apiSend, onSyncStateChange, pendingSyncCount, failedSyncItems, isOnline, isAuthRequired, flushQueue, tryAutoRelogin, discardQueueItem, discardAllFailedItems, retryQueueItem, forgetLastUser, prefetchSections } from '@/lib/client/api';"),
    ("""                        <button
                          type="button"
                          onClick={() => discardItem(f.id, f.label)}
                          className="shrink-0 rounded-md border border-rose-400/40 px-2 py-0.5 hover:bg-rose-500/10"
                        >
                          حذف از صف
                        </button>""",
     """                        <button
                          type="button"
                          onClick={() => { retryQueueItem(f.id); toast({ title: 'دوباره تلاش می‌شود', description: f.label }); }}
                          className="shrink-0 rounded-md border border-emerald-400/40 px-2 py-0.5 hover:bg-emerald-500/10"
                        >
                          تلاش دوباره
                        </button>
                        <button
                          type="button"
                          onClick={() => discardItem(f.id, f.label)}
                          className="shrink-0 rounded-md border border-rose-400/40 px-2 py-0.5 hover:bg-rose-500/10"
                        >
                          حذف از صف
                        </button>"""),
])

# ─── ۵) نسخهٔ ۳.۸.۴ + SW v21 ───
edit('src/lib/version.ts', [
    ("export const APP_VERSION = '3.8.3';", "export const APP_VERSION = '3.8.4';"),
    ("export const APP_VERSION_FA = '۳.۸.۳';", "export const APP_VERSION_FA = '۳.۸.۴';"),
])
edit('public/sw.js', [("const VERSION = 'v20';", "const VERSION = 'v21';")])
print('✓ همهٔ تغییرات مرحلهٔ ۵ اعمال شد')
