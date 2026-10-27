'use client';

/**
 * پلتفرم یکپارچهٔ ارتباطات — نسخهٔ ۲.۳
 * صندوق ورودی/ارسالی با جست‌وجو و فیلتر (نقش/صنف/تاریخ/وضعیت)، گفتگوی دو‌نفره،
 * رسید خواندن، پیوست، پیام فوری، ویرایش، حذف — به‌همراه پنل‌های مدیریتی
 * (صلاحیت‌های ارتباطی + گزارش فعالیت‌ها) برای مدیر سیستم.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { effectivePerms, parseCommPolicy, KIND_LABELS, EDIT_WINDOW_MS, type CommPerms } from '@/lib/comm';
import { MessageSquare, Send, CheckCheck, Inbox, FileText, PenLine, Trash2, Pencil, Search, Paperclip, AlertCircle, MessagesSquare, ShieldCheck, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';
import { ComposePanel, type Contact, type ClassInfo } from './compose-panel';

const CommPolicyPanel = dynamic(() => import('./comm-admin-panels').then((m) => m.CommPolicyPanel), {
  ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری…</p>,
});
const CommReportsPanel = dynamic(() => import('./comm-admin-panels').then((m) => m.CommReportsPanel), {
  ssr: false, loading: () => <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری…</p>,
});

interface Msg {
  id: string;
  subject: string | null;
  body: string;
  category: string;
  kind: string;
  priority: string;
  attachmentName: string | null;
  read?: boolean;
  readAt?: string | null;
  editedAt?: string | null;
  createdAt: string;
  toLabel: string;
  fromId?: string;
  fromName: string;
  fromRole: string;
  readCount?: number;
  totalCount?: number;
  recipientIds?: string[];
  toRole?: string | null;
  toClassId?: string | null;
  toClassLabel?: string | null;
}
interface MessagesData {
  inbox: Msg[];
  sent: Msg[];
  unread: number;
  contacts: Contact[];
  classes: ClassInfo[];
  myPerms?: CommPerms;
}

const CATEGORIES: { value: string; label: string; cls: string }[] = [
  { value: 'GENERAL', label: 'عمومی', cls: 'bg-muted text-foreground' },
  { value: 'ACADEMIC', label: 'تحصیلی', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { value: 'DISCIPLINARY', label: 'انضباطی', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  { value: 'ANNOUNCEMENT', label: 'اطلاعیه', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
];
const catOf = (c: string) => CATEGORIES.find((x) => x.value === c) || CATEGORIES[0];

function timeFa(iso: string): string {
  const date = isoToJalaliDisplay(iso.slice(0, 10));
  return `${date} — ${toPersianDigits(iso.slice(11, 16))}`;
}

/** دانلود پیوست — سازگار با WebView اندروید (پل دانلود) */
function downloadAttachment(name: string, dataUrl: string) {
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);/)?.[1] || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    (window as unknown as { __noqDownloadName?: string }).__noqDownloadName = name;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  } catch { /* ignore */ }
}

export function MessagesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<MessagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inbox');

  // فیلترها
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<'all' | 'unread'>('all');
  const [kindF, setKindF] = useState('');
  const [roleF, setRoleF] = useState('');
  const [classF, setClassF] = useState('');
  const [dateF, setDateF] = useState('');

  // گفتگو / جزئیات / ویرایش
  const [threadPeer, setThreadPeer] = useState<{ id: string; name: string } | null>(null);
  const [threadText, setThreadText] = useState('');
  const [detailMsg, setDetailMsg] = useState<Msg | null>(null);
  const [editMsg, setEditMsg] = useState<Msg | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState('GENERAL');
  const [savingEdit, setSavingEdit] = useState(false);

  const perms: CommPerms = useMemo(
    () => data?.myPerms || effectivePerms(user.role, user.id, parseCommPolicy(null)),
    [data, user],
  );
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

  useEffect(() => { void load(); }, [load]);

  const applyFilter = useCallback((list: Msg[], sent: boolean): Msg[] => {
    const now = Date.now();
    return list.filter((m) => {
      if (q) {
        const hay = `${m.subject || ''} ${m.body} ${sent ? m.toLabel : m.fromName}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (statusF === 'unread' && (sent || m.read)) return false;
      if (kindF && (m.kind || 'DIRECT') !== kindF) return false;
      if (roleF && (sent ? '' : m.fromRole) !== roleF) return false;
      if (classF && (m.toClassLabel || '') !== classF) return false;
      if (dateF && now - new Date(m.createdAt).getTime() > Number(dateF) * 24 * 3600 * 1000) return false;
      return true;
    });
  }, [q, statusF, kindF, roleF, classF, dateF]);

  const inbox = useMemo(() => (data ? applyFilter(data.inbox, false) : []), [data, applyFilter]);
  const sent = useMemo(() => (data ? applyFilter(data.sent, true) : []), [data, applyFilter]);

  const roleOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.inbox.map((m) => m.fromRole).filter(Boolean))];
  }, [data]);
  const classOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.inbox.map((m) => m.toClassLabel).filter(Boolean))] as string[];
  }, [data]);

  const markRead = async (m: Msg) => {
    if (m.read) return;
    m.read = true;
    setData((d) => (d ? {
      ...d,
      inbox: d.inbox.map((x) => (x.id === m.id ? { ...x, read: true } : x)),
      unread: Math.max(0, d.unread - 1),
    } : d));
    await apiSend('/api/messages', 'PATCH', { id: m.id });
  };

  const markAll = async () => {
    const res = await apiSend('/api/messages', 'PATCH', { all: true });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: 'همهٔ پیام‌ها خوانده‌شده شد' });
    void load();
  };

  const deleteMsg = async (m: Msg, sentBox: boolean) => {
    const hard = sentBox && perms.deleteOwn;
    const confirmText = hard && (m.totalCount || 0) > 1
      ? 'این پیام گروهی برای همهٔ گیرندگان حذف (فراخوانی) شود؟'
      : 'این پیام حذف شود؟\nپیام از صندوق پاک می‌شود و این عمل بازگشت‌پذیر نیست.';
    if (!window.confirm(confirmText)) return;
    const res = await apiSend(`/api/messages?id=${m.id}`, 'DELETE', undefined, {
      queueLabel: m.subject ? `حذف پیام: ${m.subject}` : 'حذف پیام',
    });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({
      title: res.queued ? 'حذف ذخیره شد — پس از اتصال همگام می‌شود' : 'پیام حذف شد',
    });
    if (!res.queued) void load();
  };

  const openMsg = async (m: Msg) => {
    if (!m.read) await markRead(m);
    if ((m.kind || 'DIRECT') === 'DIRECT' && m.fromId) {
      setThreadPeer({ id: m.fromId, name: m.fromName || 'کاربر' });
    } else {
      setDetailMsg(m);
    }
  };

  const openEdit = (m: Msg) => {
    setEditMsg(m);
    setEditSubject(m.subject || '');
    setEditBody(m.body);
    setEditCategory(m.category);
  };

  const saveEdit = async () => {
    if (!editMsg) return;
    setSavingEdit(true);
    const res = await apiSend('/api/messages', 'PATCH', {
      edit: true, id: editMsg.id, body: editBody, subject: editSubject, category: editCategory,
    }, { queueLabel: 'ویرایش پیام' });
    setSavingEdit(false);
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: res.queued ? 'ویرایش ذخیره شد — پس از اتصال همگام می‌شود' : 'پیام ویرایش شد' });
    setEditMsg(null);
    if (!res.queued) void load();
  };

  const canEditMsg = (m: Msg): boolean => {
    if (!perms.editOwn) return false;
    if (Date.now() - new Date(m.createdAt).getTime() > EDIT_WINDOW_MS) return false;
    if ((m.readCount || 0) > 0) return false;
    return true;
  };

  const sendReply = async (peerId: string) => {
    const text = threadText.trim();
    if (!text) return;
    setThreadText('');
    const res = await apiSend('/api/messages', 'POST', {
      body: text, category: 'GENERAL', targets: [{ kind: 'users', userIds: [peerId] }],
    }, { queueLabel: 'پاسخ پیام' });
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: res.queued ? 'پاسخ ذخیره شد — پس از اتصال همگام می‌شود' : 'پاسخ ارسال شد' });
    if (!res.queued) void load();
  };

  const viewAttachment = async (m: Msg) => {
    try {
      const d = await apiGet<{ attachment: { name: string; type: string; data: string } | null }>(`/api/messages?id=${m.id}`);
      if (!d.attachment) {
        toast({ title: 'پیوست یافت نشد', variant: 'destructive' });
        return;
      }
      downloadAttachment(d.attachment.name, d.attachment.data);
    } catch {
      toast({ title: 'دریافت پیوست ناموفق بود', variant: 'destructive' });
    }
  };

  /** پیام‌های گفتگوی دو نفره */
  const threadMsgs = useMemo(() => {
    if (!threadPeer || !data) return [];
    const inb = data.inbox.filter((m) => (m.kind || 'DIRECT') === 'DIRECT' && m.fromId === threadPeer.id);
    const snt = data.sent.filter((m) => (m.kind || 'DIRECT') === 'DIRECT' && (m.recipientIds || []).includes(threadPeer.id));
    return [...inb, ...snt].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [threadPeer, data]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری پیام‌ها…</p>;
  }

  const canPolicy = perms.managePolicy;
  const canReports = perms.reports;

  const msgRow = (m: Msg, sentBox: boolean) => {
    const kind = m.kind || (sentBox ? 'DIRECT' : 'BROADCAST');
    const cat = catOf(m.category);
    const readReceipt = sentBox && perms.seeReadStatus && (m.totalCount || 0) > 0;
    return (
      <div
        key={m.id}
        className={cn(
          'rounded-xl border p-3 transition-colors cursor-pointer',
          !sentBox && !m.read ? 'border-primary/40 bg-primary/5' : 'hover:bg-accent/40',
          m.priority === 'URGENT' && 'border-r-4 border-r-rose-500',
        )}
        onClick={() => (sentBox ? setDetailMsg(m) : openMsg(m))}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {!sentBox && !m.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="نخوانده" />}
          <span className="min-w-0 flex-1 text-right font-medium text-sm truncate">
            {sentBox ? `به: ${m.toLabel}` : `${m.fromName || 'کاربر'}${m.fromRole ? ` (${ROLE_LABELS[m.fromRole] || m.fromRole})` : ''}`}
          </span>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', cat.cls)}>{cat.label}</Badge>
          {kind !== 'DIRECT' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">
              {KIND_LABELS[kind] || kind}
            </Badge>
          )}
          {m.priority === 'URGENT' && (
            <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-rose-500/15 text-rose-700 dark:text-rose-300 gap-0.5">
              <AlertCircle className="h-2.5 w-2.5" /> فوری
            </Badge>
          )}
          {m.editedAt && <span className="text-[10px] text-muted-foreground shrink-0">(ویرایش‌شده)</span>}
          <span className="text-[11px] text-muted-foreground shrink-0">{timeFa(m.createdAt)}</span>
          {m.attachmentName && <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="پیوست" />}
          {/* رسید خواندن */}
          {readReceipt && (
            <span className={cn('text-[10.5px] shrink-0 flex items-center gap-0.5', (m.readCount || 0) > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
              <CheckCheck className="h-3.5 w-3.5" />
              {m.totalCount === 1
                ? (m.readCount ? 'خوانده شد' : 'نخوانده')
                : `${toPersianDigits(m.readCount || 0)}/${toPersianDigits(m.totalCount || 0)} خوانده`}
            </span>
          )}
        </div>
        {m.subject && <p className="text-sm font-medium mt-1.5">{m.subject}</p>}
        <p className="text-[13px] text-foreground/80 mt-0.5 line-clamp-2 whitespace-pre-wrap break-words">{m.body}</p>
        {m.toClassLabel && !sentBox && (
          <p className="text-[10.5px] text-muted-foreground mt-1">صنف: {m.toClassLabel}</p>
        )}
        <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
          {sentBox && canEditMsg(m) && (
            <button type="button" onClick={() => openEdit(m)} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-500/10 transition-colors" aria-label="ویرایش پیام" title="ویرایش (تا ۳۰ دقیقه)">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {m.attachmentName && (
            <button type="button" onClick={() => void viewAttachment(m)} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-500/10 transition-colors" aria-label="دریافت پیوست" title={`پیوست: ${m.attachmentName}`}>
              <Paperclip className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteMsg(m, sentBox)}
            aria-label="حذف پیام"
            title="حذف پیام"
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10 transition-colors mr-auto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const filtersBar = (sentBox: boolean) => (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در پیام‌ها و نام اشخاص…" className="h-9 pr-8" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!sentBox && (
          <>
            <Select value={statusF} onValueChange={(v) => setStatusF(v as typeof statusF)}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ پیام‌ها</SelectItem>
                <SelectItem value="unread">نخوانده‌ها</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindF || '__all__'} onValueChange={(v) => setKindF(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="نوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">همهٔ انواع</SelectItem>
                <SelectItem value="DIRECT">خصوصی</SelectItem>
                <SelectItem value="GROUP">گروهی</SelectItem>
                <SelectItem value="BROADCAST">همگانی</SelectItem>
              </SelectContent>
            </Select>
            {roleOptions.length > 1 && (
              <Select value={roleF || '__all__'} onValueChange={(v) => setRoleF(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="نقش فرستنده" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">همهٔ نقش‌ها</SelectItem>
                  {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {classOptions.length > 1 && (
              <Select value={classF || '__all__'} onValueChange={(v) => setClassF(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="صنف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">همهٔ صنف‌ها</SelectItem>
                  {classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </>
        )}
        <Select value={dateF || '__all__'} onValueChange={(v) => setDateF(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="تاریخ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">هر زمان</SelectItem>
            <SelectItem value="1">۲۴ ساعت اخیر</SelectItem>
            <SelectItem value="7">۷ روز اخیر</SelectItem>
            <SelectItem value="30">۳۰ روز اخیر</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
        <TabsList className={cn('gap-0.5 w-full overflow-x-auto nice-scroll', canPolicy || canReports ? 'grid grid-cols-5' : 'grid grid-cols-3')}>
          <TabsTrigger value="inbox" className="gap-1"><Inbox className="h-3.5 w-3.5" /> ورودی {!!data?.unread && `(${toPersianDigits(data.unread)})`}</TabsTrigger>
          <TabsTrigger value="sent" className="gap-1"><FileText className="h-3.5 w-3.5" /> ارسالی</TabsTrigger>
          <TabsTrigger value="compose" className="gap-1"><PenLine className="h-3.5 w-3.5" /> نوشتن</TabsTrigger>
          {canPolicy && <TabsTrigger value="policy" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" /> صلاحیت‌ها</TabsTrigger>}
          {canReports && <TabsTrigger value="reports" className="gap-1"><ScrollText className="h-3.5 w-3.5" /> گزارش‌ها</TabsTrigger>}
        </TabsList>

        <TabsContent value="inbox" className="mt-3 space-y-2">
          {filtersBar(false)}
          <div className="space-y-2">
            {inbox.length ? inbox.map((m) => msgRow(m, false)) : (
              <p className="p-6 text-center text-sm text-muted-foreground">پیامی مطابق فیلترها در صندوق شما نیست</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {filtersBar(true)}
          <div className="space-y-2">
            {sent.length ? sent.map((m) => msgRow(m, true)) : (
              <p className="p-6 text-center text-sm text-muted-foreground">هنوز پیامی نفرستاده‌اید</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="compose" className="mt-3">
          {data && (
            <ComposePanel
              contacts={data.contacts}
              classes={data.classes}
              perms={perms}
              userRole={user.role}
              onSent={() => { void load(); setTab('sent'); }}
            />
          )}
        </TabsContent>

        {canPolicy && (
          <TabsContent value="policy" className="mt-3">
            <CommPolicyPanel />
          </TabsContent>
        )}
        {canReports && (
          <TabsContent value="reports" className="mt-3">
            <CommReportsPanel />
          </TabsContent>
        )}
      </Tabs>

      {/* گفتگوی دو نفره */}
      <Dialog open={!!threadPeer} onOpenChange={(v) => !v && setThreadPeer(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-base">
              <MessagesSquare className="h-4 w-4 text-primary" /> گفتگو با {threadPeer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto nice-scroll space-y-2 py-1">
            {threadMsgs.map((m) => {
              const mine = m.recipientIds !== undefined;
              return (
                <div key={m.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                  <div className={cn(
                    'rounded-xl px-3 py-2 max-w-[85%] text-sm space-y-0.5',
                    mine ? 'bg-primary/10 rounded-bl-sm' : 'bg-muted rounded-br-sm',
                  )}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {timeFa(m.createdAt)}
                      {mine && perms.seeReadStatus && (m.readCount || 0) > 0 && <CheckCheck className="h-3 w-3 text-emerald-600" />}
                      {m.editedAt && <span>(ویرایش‌شده)</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            {threadMsgs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">آغاز گفتگو</p>}
          </div>
          {perms.reply && (
            <div className="flex items-end gap-2 pt-2 border-t">
              <Textarea
                rows={2} value={threadText} onChange={(e) => setThreadText(e.target.value)}
                placeholder={`پاسخ به ${threadPeer?.name}…`}
                className="min-h-[44px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (threadPeer) void sendReply(threadPeer.id);
                  }
                }}
              />
              <Button size="icon" onClick={() => threadPeer && void sendReply(threadPeer.id)} disabled={!threadText.trim()} aria-label="ارسال پاسخ">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* جزئیات پیام (گروهی/همگانی) */}
      <Dialog open={!!detailMsg} onOpenChange={(v) => !v && setDetailMsg(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto nice-scroll">
          {detailMsg && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base leading-6">{detailMsg.subject || 'پیام'}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <b>{detailMsg.fromName || detailMsg.toLabel}</b>
                <span className="text-muted-foreground">
                  {detailMsg.fromRole ? `(${ROLE_LABELS[detailMsg.fromRole] || detailMsg.fromRole})` : ''}
                </span>
                <Badge variant="outline" className={cn('text-[10px] px-1.5', catOf(detailMsg.category).cls)}>{catOf(detailMsg.category).label}</Badge>
                <span className="text-[11px] text-muted-foreground">{timeFa(detailMsg.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words leading-6">{detailMsg.body}</p>
              {detailMsg.attachmentName && (
                <Button variant="outline" size="sm" onClick={() => void viewAttachment(detailMsg)} className="gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" /> دریافت پیوست: {detailMsg.attachmentName}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ویرایش پیام */}
      <Dialog open={!!editMsg} onOpenChange={(v) => !v && setEditMsg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">ویرایش پیام</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">موضوع</Label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">دسته</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">متن پیام</Label>
              <Textarea rows={5} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditMsg(null)}>انصراف</Button>
              <Button onClick={saveEdit} disabled={savingEdit || !editBody.trim()}>
                {savingEdit ? 'در حال ذخیره…' : 'ذخیرهٔ ویرایش'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
