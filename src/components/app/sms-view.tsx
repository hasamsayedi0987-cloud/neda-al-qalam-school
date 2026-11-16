'use client';

/**
 * پیام‌های SMS به شماره‌های والدین — نسخهٔ ۳.۳.۰
 * اطلاع اتومات حاضری (غایبین روز)، فیس باقی ماه، امتحانات و اطلاعیهٔ عمومی
 * ارسال از دروازهٔ SMS قابل تنظیم (هر سیستم پیام‌کوتاه با قالب {phone}/{body})
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToday, toPersianDigits } from '@/lib/jalali';
import { MessageCircleMore, Send, BellRing, Wallet, BookOpenCheck, Megaphone, Trash2, RefreshCw, Settings2 } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

interface SmsRow {
  id: string; to: string; studentId: string | null; category: string; body: string;
  status: string; error: string | null; sentAt: string | null; createdAt: string;
  student?: { firstName: string; lastName: string | null; class?: { name: string } } | null;
}
interface SmsData {
  outbox: SmsRow[];
  templates: { ATTENDANCE: string; FEE: string; EXAM: string; NOTICE: string };
  providerConfigured: boolean;
  counts: { pending: number; sent: number; failed: number };
}
interface ClassRow { id: string; name: string; }

const catLabel = (c: string) => ({
  ATTENDANCE: 'حاضری', FEE: 'فیس', EXAM: 'امتحان', NOTICE: 'اطلاعیه', CUSTOM: 'دستوی',
}[c] || c);

export function SmsView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<SmsData | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [attDate, setAttDate] = useState(isoToday());
  const nowJy = new Date().getFullYear();
  const [feeMonth, setFeeMonth] = useState('');
  const [examClass, setExamClass] = useState('all');
  const [noticeText, setNoticeText] = useState('');
  const [singleTo, setSingleTo] = useState('');
  const [singleBody, setSingleBody] = useState('');
  const [tpl, setTpl] = useState({ ATTENDANCE: '', FEE: '', EXAM: '', NOTICE: '' });
  const [provider, setProvider] = useState('{"url":"","method":"GET","params":{"phone":"{phone}","body":"{body}"}}');
  const [busy, setBusy] = useState(false);

  const canWrite = user.role === 'ADMIN' || user.role === 'HEADTEACHER';
  const isAdmin = user.role === 'ADMIN';

  const load = useCallback(() => {
    apiGet<SmsData>('/api/sms').then((d) => { setData(d); setTpl(d.templates); }).catch(() => {});
    apiGet<{ classes: ClassRow[] }>('/api/classes').then((d) => setClasses(d.classes)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await apiSend<{ queued?: number; note?: string; sent?: number; failed?: number; attempted?: number }>('/api/sms', 'POST', payload);
      if (res.error) {
        toast({ title: 'خطا', description: res.error.slice(0, 160), variant: 'destructive' });
        return;
      }
      const d = res.data || {};
      const extra = d.queued !== undefined ? ` — ${toPersianDigits(d.queued)} پیام در صف` : d.attempted !== undefined ? ` — ${toPersianDigits(d.sent || 0)} ارسال شد، ${toPersianDigits(d.failed || 0)} ناکام` : '';
      toast({ title: okMsg + extra, description: d.note });
      load();
    } catch (err) {
      toast({ title: 'خطا', description: String(err).slice(0, 160), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveTemplates = () => send({ action: 'save-templates', value: JSON.stringify(tpl) }, 'قالب‌ها ذخیره شد');
  const saveProvider = () => {
    try { JSON.parse(provider); } catch { toast({ title: 'قالب دروازه JSON نامعتبر است', variant: 'destructive' }); return; }
    send({ action: 'save-provider', value: provider }, 'دروازهٔ SMS ذخیره شد');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <MessageCircleMore className="h-6 w-6 text-emerald-600" />
        <h1 className="text-xl font-bold">پیام‌های والدین (SMS)</h1>
        {!data?.providerConfigured && <Badge variant="destructive">دروازه تنظیم نشده</Badge>}
        {data?.providerConfigured && <Badge className="bg-emerald-600 text-white">دروازه فعال</Badge>}
        <div className="ms-auto flex gap-2">
          {canWrite && <Button onClick={() => send({ action: 'send-pending' }, 'ارسال صف')} disabled={busy} className="gap-1"><Send className="h-4 w-4" /> ارسال صف انتظار</Button>}
          {canWrite && <Button variant="outline" onClick={() => send({ action: 'retry-failed' }, 'ناکام‌ها به صف برگشت')} className="gap-1"><RefreshCw className="h-4 w-4" /> تلاش مجدد</Button>}
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        <Badge variant="outline">صف: {toPersianDigits(data?.counts.pending || 0)}</Badge>
        <Badge className="bg-emerald-600 text-white">ارسال‌شده: {toPersianDigits(data?.counts.sent || 0)}</Badge>
        <Badge variant="destructive">ناکام: {toPersianDigits(data?.counts.failed || 0)}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-amber-600" /> اطلاع حاضری — والدین غایبین</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="w-56"><Label>تاریخ</Label><Input dir="ltr" type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} /></div>
            <Button disabled={busy} onClick={() => send({ action: 'queue-attendance', date: attDate }, 'پیام‌های حاضری جور شد')}>جور کردن و صف کردن</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-sky-600" /> اطلاع فیس باقی — به اساس ماه</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="w-56"><Label>ماه شمسی (مثال: ۱۴۰۵-۰۳)</Label><Input dir="ltr" value={feeMonth} onChange={(e) => setFeeMonth(e.target.value)} placeholder="1405-03" /></div>
            <Button disabled={busy || !feeMonth} onClick={() => send({ action: 'queue-fee', month: feeMonth }, 'پیام‌های فیس باقی جور شد')}>جور کردن و صف کردن</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-violet-600" /> اطلاع امتحانات</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="w-56"><Label>صنف</Label>
              <Select value={examClass} onValueChange={setExamClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ صنف‌ها</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={busy} onClick={() => send({ action: 'queue-exam', classId: examClass === 'all' ? '' : examClass }, 'پیام‌های امتحان جور شد')}>جور کردن و صف کردن</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-emerald-600" /> اطلاعیهٔ عمومی + پیام دستوی</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={2} value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="متن اطلاعیه برای همهٔ والدین…" />
            <Button disabled={busy || !noticeText} onClick={async () => { await send({ action: 'queue-notice', body: noticeText }, 'اطلاعیه صف شد'); setNoticeText(''); }}>اطلاعیه به همهٔ والدین</Button>
            <div className="border-t pt-3 grid grid-cols-2 gap-2">
              <Input dir="ltr" value={singleTo} onChange={(e) => setSingleTo(e.target.value)} placeholder="شمارهٔ موبایل" />
              <Input value={singleBody} onChange={(e) => setSingleBody(e.target.value)} placeholder="متن پیام دستوی" />
            </div>
            <Button variant="outline" disabled={busy || !singleTo || !singleBody} onClick={async () => { await send({ action: 'queue-single', to: singleTo, body: singleBody }, 'پیام دستوی در صف شد'); setSingleTo(''); setSingleBody(''); }}>درج در صف</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>صف پیام‌ها (آخرین {toPersianDigits(200)})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b"><th className="p-2 text-start">شماره</th><th className="p-2 text-start">متعلم</th><th className="p-2 text-start">نوع</th><th className="p-2 text-start">متن</th><th className="p-2 text-start">وضعیت</th><th className="p-2"></th></tr></thead>
            <tbody>
              {(data?.outbox || []).map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-2" dir="ltr">{m.to}</td>
                  <td className="p-2">{m.student ? `${m.student.firstName} ${m.student.lastName || ''}` : '—'}</td>
                  <td className="p-2"><Badge variant="outline">{catLabel(m.category)}</Badge></td>
                  <td className="p-2 max-w-72 truncate" title={m.body}>{m.body}</td>
                  <td className="p-2">
                    {m.status === 'SENT' ? <Badge className="bg-emerald-600 text-white">ارسال شد</Badge>
                      : m.status === 'FAILED' ? <Badge variant="destructive" title={m.error || ''}>ناکام</Badge>
                      : <Badge variant="outline">در انتظار</Badge>}
                  </td>
                  <td className="p-2">{canWrite && <Button size="sm" variant="ghost" onClick={() => send({ action: 'delete', id: m.id }, 'حذف شد')}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</td>
                </tr>
              ))}
              {(data?.outbox.length || 0) === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">صف خالی است — با دکمه‌های بالا پیام جور کنید</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> قالب پیام‌ها — جای‌نگه‌دارها: {'{school} {name} {class} {date} {month} {amount} {body}'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>حاضری</Label><Textarea rows={2} value={tpl.ATTENDANCE} onChange={(e) => setTpl({ ...tpl, ATTENDANCE: e.target.value })} /></div>
              <div><Label>فیس باقی</Label><Textarea rows={2} value={tpl.FEE} onChange={(e) => setTpl({ ...tpl, FEE: e.target.value })} /></div>
              <div><Label>امتحان</Label><Textarea rows={2} value={tpl.EXAM} onChange={(e) => setTpl({ ...tpl, EXAM: e.target.value })} /></div>
              <div><Label>اطلاعیه</Label><Textarea rows={2} value={tpl.NOTICE} onChange={(e) => setTpl({ ...tpl, NOTICE: e.target.value })} /></div>
              <Button onClick={saveTemplates} disabled={busy}>ذخیرهٔ قالب‌ها</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> دروازهٔ SMS</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">هر سیستم پیام‌کوتاه که با GET یا POST کار کند، با جای‌نگه‌دارهای <code dir="ltr">{'{phone}'}</code> و <code dir="ltr">{'{body}'}</code> هم‌خوان می‌شود. مثال:</p>
              <Textarea rows={6} dir="ltr" className="font-mono text-xs" value={provider} onChange={(e) => setProvider(e.target.value)} />
              <Button onClick={saveProvider} disabled={busy}>ذخیرهٔ دروازه</Button>
              <p className="text-xs text-muted-foreground">تا وقتی دروازه تنظیم نشود، پیام‌ها در «صف انتظار» می‌مانند و پس از تنظیم با «ارسال صف انتظار» می‌روند.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
