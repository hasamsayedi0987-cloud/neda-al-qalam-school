'use client';

/**
 * پلتفرم یکپارچهٔ ارتباطات — پیام مستقیم و اعلان همگانی
 * مدیر/سرمعلم: همگانی به نقش‌ها و والدین صنف‌ها | همه: پیام مستقیم طبق دسترسی
 * دسته‌ها: عمومی | تحصیلی | انضباطی | اطلاعیه
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { MessageSquare, Send, CheckCheck, Inbox, FileText, PenLine, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';

interface Msg {
  id: string;
  subject: string | null;
  body: string;
  category: string;
  read: boolean;
  createdAt: string;
  toLabel: string;
  fromName: string;
  fromRole: string;
}
interface Contacts { id: string; name: string; role: string }
interface ClassInfo { id: string; name: string }
interface MessagesData {
  inbox: Msg[];
  sent: Msg[];
  unread: number;
  contacts: Contacts[];
  classes: ClassInfo[];
}

const CATEGORIES: { value: string; label: string; cls: string }[] = [
  { value: 'GENERAL', label: 'عمومی', cls: 'bg-muted text-foreground' },
  { value: 'ACADEMIC', label: 'تحصیلی', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { value: 'DISCIPLINARY', label: 'انضباطی', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  { value: 'ANNOUNCEMENT', label: 'اطلاعیه', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
];
const catOf = (c: string) => CATEGORIES.find((x) => x.value === c) || CATEGORIES[0];

export function MessagesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<MessagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inbox');
  // فرم نوشتن
  const [toType, setToType] = useState<'direct' | 'role' | 'class'>('direct');
  const [toUserId, setToUserId] = useState('');
  const [toRole, setToRole] = useState('');
  const [toClassId, setToClassId] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const canBroadcast = user.role === 'ADMIN' || user.role === 'HEADTEACHER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<MessagesData>('/api/messages');
      setData(d);
    } catch (e) {
      toast({ title: 'خطا در دریافت پیام‌ها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const text = body.trim();
    if (!text) {
      toast({ title: 'متن پیام را بنویسید', variant: 'destructive' });
      return;
    }
    const payload: Record<string, string> = { body: text, category };
    if (subject.trim()) payload.subject = subject.trim();
    if (toType === 'direct') {
      if (!toUserId) {
        toast({ title: 'گیرنده را انتخاب کنید', variant: 'destructive' });
        return;
      }
      payload.toUserId = toUserId;
    } else if (toType === 'role') {
      if (!toRole) {
        toast({ title: 'نقش گیرنده را انتخاب کنید', variant: 'destructive' });
        return;
      }
      payload.toRole = toRole;
    } else {
      if (!toClassId) {
        toast({ title: 'صنف را انتخاب کنید', variant: 'destructive' });
        return;
      }
      payload.toClassId = toClassId;
    }
    setSending(true);
    const res = await apiSend('/api/messages', 'POST', payload, { queueLabel: `پیام به ${toType === 'direct' ? 'کاربر' : toType === 'role' ? ROLE_LABELS[toRole] || toRole : 'والدین صنف'}` });
    setSending(false);
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'پیام در حافظهٔ گوشی ذخیره شد — پس از اتصال همگام می‌شود' : 'پیام ارسال شد' });
    setBody('');
    setSubject('');
    if (!res.queued) void load();
  };

  const markRead = async (m: Msg) => {
    if (m.read) return;
    await apiSend('/api/messages', 'PATCH', { id: m.id });
    void load();
  };

  const markAll = async () => {
    await apiSend('/api/messages', 'PATCH', { all: true });
    toast({ title: 'همهٔ پیام‌ها خوانده‌شده شد' });
    void load();
  };

  /** حذف پیام — برای من حذف می‌شود؛ پیام مستقیمِ خود فرستنده کامل پاک می‌شود */
  const deleteMsg = async (m: Msg) => {
    if (!window.confirm('این پیام حذف شود؟\nپیام از صندوق شما پاک می‌شود و این عمل بازگشت‌پذیر نیست.')) return;
    const res = await apiSend(`/api/messages?id=${m.id}`, 'DELETE', undefined, {
      queueLabel: m.subject ? `حذف پیام: ${m.subject}` : 'حذف پیام',
    });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: res.queued
        ? 'حذف در حافظهٔ گوشی ذخیره شد — پس از اتصال همگام می‌شود'
        : 'پیام حذف شد',
    });
    if (!res.queued) void load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری پیام‌ها…</p>;
  }

  const msgRow = (m: Msg, sent: boolean) => (
    <div
      key={m.id}
      className={cn(
        'rounded-xl border p-3 transition-colors',
        !sent && !m.read && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!sent && !m.read ? (
          <button
            type="button"
            onClick={() => markRead(m)}
            className="min-w-0 flex-1 text-right font-medium text-sm hover:underline underline-offset-2"
            title="برای علامت‌گذاری «خوانده‌شده» لمس کنید"
          >
            {m.fromName || 'کاربر'}
            {m.fromRole ? ` (${ROLE_LABELS[m.fromRole] || m.fromRole})` : ''}
          </button>
        ) : (
          <span className="min-w-0 flex-1 font-medium text-sm truncate">
            {sent ? `به: ${m.toLabel}` : m.fromName || 'کاربر'}
            {!sent && m.fromRole ? ` (${ROLE_LABELS[m.fromRole] || m.fromRole})` : ''}
          </span>
        )}
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', catOf(m.category).cls)}>
          {catOf(m.category).label}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{toPersianDigits(isoToJalaliDisplay(m.createdAt.slice(0, 10)))}</span>
        {!sent && !m.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="نخوانده" />}
        <button
          type="button"
          onClick={() => deleteMsg(m)}
          aria-label="حذف پیام"
          title="حذف پیام"
          className="shrink-0 rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {m.subject && <p className="text-sm font-medium mt-1.5">{m.subject}</p>}
      <p className="text-[13px] text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> ارتباطات و پیام‌ها
          {!!data?.unread && <Badge className="bg-primary">{toPersianDigits(data.unread)} نخوانده</Badge>}
        </h1>
        {tab === 'inbox' && !!data?.unread && (
          <Button variant="outline" size="sm" onClick={markAll} className="gap-1">
            <CheckCheck className="h-4 w-4" /> خواندن همه
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="inbox" className="gap-1.5"><Inbox className="h-4 w-4" /> صندوق ورودی {!!data?.unread && `(${toPersianDigits(data.unread)})`}</TabsTrigger>
          <TabsTrigger value="sent" className="gap-1.5"><FileText className="h-4 w-4" /> ارسال‌شده</TabsTrigger>
          <TabsTrigger value="compose" className="gap-1.5"><PenLine className="h-4 w-4" /> نوشتن</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-3 space-y-2">
          {data?.inbox.length ? data.inbox.map((m) => msgRow(m, false)) : (
            <p className="p-6 text-center text-sm text-muted-foreground">پیامی در صندوق شما نیست</p>
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {data?.sent.length ? data.sent.map((m) => msgRow(m, true)) : (
            <p className="p-6 text-center text-sm text-muted-foreground">هنوز پیامی نفرستاده‌اید</p>
          )}
        </TabsContent>

        <TabsContent value="compose" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1">
                <Label>نوع گیرنده</Label>
                <Select value={toType} onValueChange={(v) => setToType(v as typeof toType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">پیام مستقیم به یک کاربر</SelectItem>
                    {canBroadcast && <SelectItem value="role">همگانی به یک نقش</SelectItem>}
                    {canBroadcast && <SelectItem value="class">همگانی به والدین یک صنف</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              {toType === 'direct' && (
                <div className="space-y-1">
                  <Label>گیرنده</Label>
                  <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger><SelectValue placeholder="انتخاب کاربر…" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {(data?.contacts || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — {ROLE_LABELS[c.role] || c.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    فهرست بر اساس دسترسی شما تنظیم شده است — معلم با والدین و شاگردان صنف‌های خود و مدیران پیام ردوبدل می‌کند.
                  </p>
                </div>
              )}

              {toType === 'role' && (
                <div className="space-y-1">
                  <Label>نقش گیرنده</Label>
                  <Select value={toRole} onValueChange={setToRole}>
                    <SelectTrigger><SelectValue placeholder="انتخاب نقش…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">همه (همگانی)</SelectItem>
                      {Object.entries(ROLE_LABELS).map(([r, l]) => (
                        <SelectItem key={r} value={r}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {toType === 'class' && (
                <div className="space-y-1">
                  <Label>صنف (پیام به والدین آن صنف)</Label>
                  <Select value={toClassId} onValueChange={setToClassId}>
                    <SelectTrigger><SelectValue placeholder="انتخاب صنف…" /></SelectTrigger>
                    <SelectContent>
                      {(data?.classes || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>دستهٔ پیام</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>موضوع (اختیاری)</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع پیام…" />
                </div>
              </div>

              <div className="space-y-1">
                <Label>متن پیام</Label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="پیام خود را بنویسید… موارد انضباطی، تحصیلی یا اطلاعیه‌ها را به‌صورت تفکیک‌شده ارسال کنید." />
              </div>

              <div className="flex justify-end">
                <Button onClick={send} disabled={sending} className="gap-1.5">
                  <Send className="h-4 w-4" /> {sending ? 'در حال ارسال…' : 'ارسال پیام'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
