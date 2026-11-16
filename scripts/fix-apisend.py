# اصلاح امضای apiSend در پنج ویوی جدید (نسخهٔ ۳.۳.۰)
import pathlib

BASE = pathlib.Path('/home/z/my-project/src/components/app')

OLD_SEND = """    setSaving(true);
    try {
      await apiSend('__URL__', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      toast({ title: okMsg });
      load();
    } catch (err) {
      toast({ title: 'خطا', description: String(err).slice(0, __N__), variant: 'destructive' });
    } finally {
      setSaving(false);
    }"""

NEW_SEND = """    setSaving(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string }>('__URL__', 'POST', payload);
      if (res.error) {
        toast({ title: 'خطا', description: res.error.slice(0, __N__), variant: 'destructive' });
        return;
      }
      toast({ title: okMsg, description: res.data?.note });
      load();
    } catch (err) {
      toast({ title: 'خطا', description: String(err).slice(0, __N__), variant: 'destructive' });
    } finally {
      setSaving(false);
    }"""

VIEWS = {
    'transport-view.tsx': ('/api/transport', 120),
    'store-view.tsx': ('/api/store', 140),
    'treasury-view.tsx': ('/api/treasury', 140),
    'expenses-view.tsx': ('/api/expenses', 140),
}

for fname, (url, n) in VIEWS.items():
    p = BASE / fname
    s = p.read_text(encoding='utf-8')
    old = OLD_SEND.replace('__URL__', url).replace('__N__', str(n))
    new = NEW_SEND.replace('__URL__', url).replace('__N__', str(n))
    if old not in s:
        print(f'✘ الگوی send در {fname} یافت نشد')
        continue
    s = s.replace(old, new)
    p.write_text(s, encoding='utf-8')
    print(f'✔ {fname} اصلاح شد')

# sms-view — نتیجهٔ ApiResult
p = BASE / 'sms-view.tsx'
s = p.read_text(encoding='utf-8')
old_call = """      const res = await apiSend<{ queued?: number; note?: string; sent?: number; failed?: number; attempted?: number }>('/api/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const extra = res.queued !== undefined ? ` — ${toPersianDigits(res.queued)} پیام در صف` : res.attempted !== undefined ? ` — ${toPersianDigits(res.sent || 0)} ارسال شد، ${toPersianDigits(res.failed || 0)} ناکام` : '';
      toast({ title: okMsg + extra, description: res.note });"""
new_call = """      const res = await apiSend<{ queued?: number; note?: string; sent?: number; failed?: number; attempted?: number }>('/api/sms', 'POST', payload);
      if (res.error) {
        toast({ title: 'خطا', description: res.error.slice(0, 160), variant: 'destructive' });
        return;
      }
      const d = res.data || {};
      const extra = d.queued !== undefined ? ` — ${toPersianDigits(d.queued)} پیام در صف` : d.attempted !== undefined ? ` — ${toPersianDigits(d.sent || 0)} ارسال شد، ${toPersianDigits(d.failed || 0)} ناکام` : '';
      toast({ title: okMsg + extra, description: d.note });"""
if old_call in s:
    s = s.replace(old_call, new_call)
    p.write_text(s, encoding='utf-8')
    print('✔ sms-view.tsx اصلاح شد')
else:
    print('✘ الگوی sms یافت نشد')
