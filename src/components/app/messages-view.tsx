'use client';

/**
 * چت‌خانهٔ مکتب — رابط گفتگوی ساده، سریع و زیبا (سبک واتساپ) — نسخهٔ ۲.۴
 *
 *  • فهرست گفتگوها: آخرین پیام، زمان هوشمند، نشان نخوانده، جست‌وجوی اشخاص و پیام‌ها
 *  • گفتگوی دو‌نفره: حباب‌های پیام، تاریخ‌بند، زمان، وضعیت خوانده‌شدن (تیک‌ها)، پیوست عکس/فایل
 *  • پیام‌های گروهی و همگانی به‌صورت «کانال» در همان فهرست — مرتب و خوانا
 *  • گفتگوی جدید با انتخاب از مخاطبان مجاز + پنل گروهی/همگانی برای مدیر و سرمعلم
 *  • ویرایش/حذف مطابق صلاحیت‌ها — پنل‌های «صلاحیت‌ها» و «گزارش‌ها» برای مدیر
 *  • همهٔ محدودیت‌ها سمت سرور اجرا می‌شود؛ این رابط فقط نمایش است
 *  • کاملاً آفلاین‌پسند: کش و صف همگام‌سازی قبلی (api.ts) دست‌نخورده استفاده می‌شود
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend } from '@/lib/client/api';
import { isoToJalaliDisplay, gregorianToJalali, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { effectivePerms, parseCommPolicy, EDIT_WINDOW_MS, MAX_ATTACH_DATAURL, type CommPerms } from '@/lib/comm';
import {
  Send, CheckCheck, Check, Clock, Paperclip, Pencil, Trash2, Search, AlertCircle,
  MessagesSquare, ShieldCheck, ScrollText, SquarePen, Megaphone, ArrowRight, X, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';
import { ComposePanel, compressImage, type Contact, type ClassInfo } from './compose-panel';

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

/** یک گفتگو در فهرست — یا چت دو‌نفره یا «کانال» پیام‌های گروهی/همگانی */
interface Conversation {
  key: string;
  peerId: string | null; // چت دو‌نفره
  name: string;
  role: string;
  reason: string;
  isChannel: boolean;
  chTarget: string; // زیرنویس کانال — مثلاً «همگانی — همه»
  chFromId: string | null; // فرستندهٔ کانال دریافتی
  unread: number;
  lastAt: string;
  lastPreview: string;
  lastMine: boolean;
  lastRead: boolean;
  lastAttach: boolean;
  lastUrgent: boolean;
}

const CATEGORIES = [
  { value: 'GENERAL', label: 'عمومی' },
  { value: 'ACADEMIC', label: 'تحصیلی' },
  { value: 'DISCIPLINARY', label: 'انضباطی' },
  { value: 'ANNOUNCEMENT', label: 'اطلاعیه' },
];

// پیام‌های در انتظار همگام‌سازی — بیرون از کامپوننت تا با بازماند ویو گم نشود
const pendingGlobal = new Set<string>();

const ROLE_AVATAR: Record<string, string> = {
  ADMIN: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  HEADTEACHER: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  TEACHER: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  GUARDIAN: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  STUDENT: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  STAFF: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  LIBRARIAN: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function avatarCls(role: string): string {
  return ROLE_AVATAR[role] || 'bg-muted text-muted-foreground';
}

/** زمان هوشمند — امروز فقط ساعت، غیر از آن تاریخ شمسی کوتاه */
function smartTime(iso: string, todayIso: string): string {
  const d = iso.slice(0, 10);
  if (d === todayIso) return toPersianDigits(iso.slice(11, 16));
  return jDateShort(d);
}

function jDateShort(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const j = gregorianToJalali(y, m, d);
    return toPersianDigits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`);
  } catch {
    return isoDate;
  }
}

/** برچسب تاریخ‌بند گفتگو — امروز/دیروز/تاریخ کامل */
function dayLabel(isoDate: string, todayIso: string, yesterdayIso: string): string {
  if (isoDate === todayIso) return 'امروز';
  if (isoDate === yesterdayIso) return 'دیروز';
  return isoToJalaliDisplay(isoDate);
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

/* ─── ردیف گفتگو در فهرست ─── */
function ConvRow({ conv, todayIso, active, onClick }: { conv: Conversation; todayIso: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 text-right transition-colors border-b border-border/40',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      {/* آواتار */}
      <span className={cn('h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold', avatarCls(conv.role))}>
        {conv.isChannel ? <Megaphone className="h-4.5 w-4.5" /> : initialsOf(conv.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{conv.name}</span>
          <span className={cn('shrink-0 text-[10.5px]', conv.unread ? 'text-primary font-bold' : 'text-muted-foreground')}>
            {conv.lastAt ? smartTime(conv.lastAt, todayIso) : ''}
          </span>
        </span>
        <span className="flex items-center gap-1.5 mt-0.5">
          {conv.lastMine && !conv.isChannel && (
            conv.lastRead
              ? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="خوانده شد" />
              : <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="ارسال شد" />
          )}
          {conv.lastUrgent && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="فوری" />}
          {conv.lastAttach && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="پیوست" />}
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{conv.lastPreview}</span>
          {!!conv.unread && (
            <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-bold flex items-center justify-center">
              {toPersianDigits(conv.unread)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/* ─── بخش ۲: ویوی اصلی ─── */

export function MessagesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const [data, setData] = useState<MessagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // فهرست و جست‌وجو
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // گفتگوی فعال
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeOverride, setActiveOverride] = useState<Conversation | null>(null); // چت تازه بدون تاریخچه

  // نوشتن پاسخ
  const [threadText, setThreadText] = useState('');
  const [threadAttach, setThreadAttach] = useState<{ name: string; type: string; data: string } | null>(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set(pendingGlobal));

  // دیالوگ‌ها
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState('people');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [editMsg, setEditMsg] = useState<Msg | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState('GENERAL');
  const [savingEdit, setSavingEdit] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const perms: CommPerms = useMemo(
    () => data?.myPerms || effectivePerms(user.role, user.id, parseCommPolicy(null)),
    [data, user],
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  /* بارگیری — silent برای پول/بازآوری بی‌صدا (آفلاین پیام خطا نمی‌دهد) */
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      const d = await apiGet<MessagesData>('/api/messages');
      setData(d);
      // پیام‌های در انتظار — آن‌هایی که با همگام‌سازی به ردیف واقعی بدل شدند حذف می‌شوند
      setPendingIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) if ((d.sent || []).some((m) => m.id === id)) next.add(id);
        pendingGlobal.clear();
        for (const id of next) pendingGlobal.add(id);
        return next;
      });
      setLoadError(null);
    } catch (e) {
      if (!silent) setLoadError(e instanceof Error ? e.message : 'خطا در دریافت پیام‌ها');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // دریافت فوری — پول هر ۲۰ ثانیه + بازگشت به تب
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 20000);
    const onVis = () => { if (document.visibilityState === 'visible') void load(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const contactMap = useMemo(() => new Map((data?.contacts || []).map((c) => [c.id, c])), [data]);

  /* ساخت فهرست گفتگوها از ورودی + ارسالی */
  const conversations = useMemo<Conversation[]>(() => {
    if (!data) return [];
    const map = new Map<string, Conversation>();
    const ensure = (key: string, init: Partial<Conversation>): Conversation => {
      let c = map.get(key);
      if (!c) {
        c = { key, peerId: null, name: '', role: '', reason: '', isChannel: false, chTarget: '', chFromId: null, unread: 0, lastAt: '', lastPreview: '', lastMine: false, lastRead: false, lastAttach: false, lastUrgent: false, ...init };
        map.set(key, c);
      }
      return c;
    };
    const previewOf = (m: Msg): string => {
      const body = (m.body || '').replace(/\s+/g, ' ').trim();
      if (body) return body.length > 72 ? body.slice(0, 72) + '…' : body;
      return m.attachmentName ? `پیوست: ${m.attachmentName}` : 'پیام';
    };
    const newer = (c: Conversation, m: Msg, mine: boolean) => {
      if (!c.lastAt || m.createdAt >= c.lastAt) {
        c.lastAt = m.createdAt;
        c.lastPreview = previewOf(m);
        c.lastMine = mine;
        c.lastRead = mine ? (m.readCount || 0) > 0 : Boolean(m.read);
        c.lastAttach = Boolean(m.attachmentName);
        c.lastUrgent = m.priority === 'URGENT';
      }
    };

    for (const m of data.inbox) {
      const kind = m.kind || 'DIRECT';
      if (kind === 'DIRECT' && m.fromId) {
        const ct = contactMap.get(m.fromId);
        const conv = ensure(`u:${m.fromId}`, { peerId: m.fromId, name: m.fromName || ct?.name || 'کاربر', role: m.fromRole || ct?.role || '', reason: ct?.reason || '' });
        if (!m.read) conv.unread += 1;
        newer(conv, m, false);
      } else {
        const key = `c:${m.fromId || '?'}:${m.toRole || m.toClassId || 'GRP'}`;
        const conv = ensure(key, { isChannel: true, name: m.fromName || 'کاربر', role: m.fromRole || '', chFromId: m.fromId || null, chTarget: m.toLabel || 'پیام گروهی' });
        if (!m.read) conv.unread += 1;
        newer(conv, m, false);
      }
    }

    for (const m of data.sent) {
      const kind = m.kind || 'DIRECT';
      if (kind === 'DIRECT') {
        let peerId = (m.recipientIds || [])[0] || null;
        if (!peerId) {
          // ردیف موقت آفلاین — تطبیق با نام گفتگوی موجود
          const hit = [...map.values()].find((c) => !c.isChannel && c.peerId && c.name === m.toLabel);
          peerId = hit?.peerId || null;
        }
        if (peerId) {
          const ct = contactMap.get(peerId);
          const conv = ensure(`u:${peerId}`, { peerId, name: m.toLabel || ct?.name || 'کاربر', role: ct?.role || '', reason: ct?.reason || '' });
          newer(conv, m, true);
        } else {
          const conv = ensure(`t:${m.id}`, { name: m.toLabel || 'کاربر' });
          newer(conv, m, true);
        }
      } else {
        const conv = ensure(`c:me:${m.toLabel || 'X'}`, { isChannel: true, name: m.toLabel || 'گیرندگان', role: '', chTarget: 'پیام گروهی شما' });
        newer(conv, m, true);
      }
    }
    return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [data, contactMap]);

  const activeConv = useMemo<Conversation | null>(() => {
    if (!activeKey) return null;
    return conversations.find((c) => c.key === activeKey) || activeOverride;
  }, [conversations, activeKey, activeOverride]);

  /* پیام‌های گفتگوی فعال — مرتب زمانی */
  const thread = useMemo<Msg[]>(() => {
    if (!data || !activeConv) return [];
    const out: Msg[] = [];
    if (activeConv.isChannel) {
      if (activeConv.key.startsWith('c:me:')) {
        const label = activeConv.key.slice(5);
        out.push(...data.sent.filter((m) => (m.kind || 'DIRECT') !== 'DIRECT' && (m.toLabel || 'X') === label));
      } else {
        for (const m of data.inbox) {
          if ((m.kind || 'DIRECT') === 'DIRECT' || !m.fromId) continue;
          if (`c:${m.fromId}:${m.toRole || m.toClassId || 'GRP'}` === activeConv.key) out.push(m);
        }
      }
    } else if (activeConv.peerId) {
      const pid = activeConv.peerId;
      for (const m of data.inbox) if ((m.kind || 'DIRECT') === 'DIRECT' && m.fromId === pid) out.push(m);
      for (const m of data.sent) {
        if ((m.kind || 'DIRECT') !== 'DIRECT') continue;
        if ((m.recipientIds || []).includes(pid) || (!m.recipientIds && m.toLabel === activeConv.name)) out.push(m);
      }
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [data, activeConv]);

  /* بازکردن گفتگو + خواندن نخوانده‌هایش */
  const openConv = useCallback((conv: Conversation) => {
    setActiveOverride(null);
    setActiveKey(conv.key);
    setThreadText('');
    setThreadAttach(null);
    if (!data) return;
    const unreadMsgs = data.inbox.filter((m) => {
      if (m.read) return false;
      if (conv.isChannel) return (m.kind || 'DIRECT') !== 'DIRECT' && `c:${m.fromId}:${m.toRole || m.toClassId || 'GRP'}` === conv.key;
      return (m.kind || 'DIRECT') === 'DIRECT' && m.fromId === conv.peerId;
    });
    if (unreadMsgs.length) {
      const ids = new Set(unreadMsgs.map((u) => u.id));
      setData((d) => d ? {
        ...d,
        inbox: d.inbox.map((x) => (ids.has(x.id) ? { ...x, read: true } : x)),
        unread: Math.max(0, d.unread - unreadMsgs.length),
      } : d);
      for (const m of unreadMsgs) void apiSend('/api/messages', 'PATCH', { id: m.id });
    }
  }, [data]);

  /* شروع گفتگوی جدید با یک مخاطب */
  const startWith = useCallback((c: Contact) => {
    const conv: Conversation = { key: `u:${c.id}`, peerId: c.id, name: c.name, role: c.role, reason: c.reason, isChannel: false, chTarget: '', chFromId: null, unread: 0, lastAt: '', lastPreview: '', lastMine: false, lastRead: false, lastAttach: false, lastUrgent: false };
    setActiveOverride(conv);
    setActiveKey(conv.key);
    setNewChatOpen(false);
    setQ('');
  }, []);

  const markAll = async () => {
    setData((d) => d ? { ...d, inbox: d.inbox.map((x) => ({ ...x, read: true })), unread: 0 } : d);
    const res = await apiSend('/api/messages', 'PATCH', { all: true });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: 'همهٔ پیام‌ها خوانده‌شده شد' });
  };

  /* ارسال در گفتگو */
  const sendThread = async () => {
    const conv = activeConv;
    if (!conv || conv.isChannel || !conv.peerId) return;
    const text = threadText.trim();
    if (!text && !threadAttach) return;
    setSending(true);
    const payload: Record<string, unknown> = {
      body: text || `(پیوست: ${threadAttach?.name || 'فایل'})`,
      category: 'GENERAL',
      targets: [{ kind: 'users', userIds: [conv.peerId] }],
    };
    if (threadAttach) payload.attachment = threadAttach;
    const res = await apiSend<{ id: string }>('/api/messages', 'POST', payload, { queueLabel: 'ارسال پیام' });
    setSending(false);
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    const attachName = threadAttach?.name || null;
    setThreadText('');
    setThreadAttach(null);
    if (taRef.current) taRef.current.style.height = 'auto';
    if (res.queued) {
      const tempId = res.tempId || `tmp-${Date.now()}`;
      setData((d) => d ? {
        ...d,
        sent: [{ id: tempId, subject: null, body: String(payload.body), category: 'GENERAL', kind: 'DIRECT', priority: 'NORMAL', attachmentName: attachName, createdAt: new Date().toISOString(), toLabel: conv.name, recipientIds: [conv.peerId] } as Msg, ...d.sent],
      } : d);
      pendingGlobal.add(tempId);
      setPendingIds((s) => new Set(s).add(tempId));
      toast({ title: 'ذخیره شد — پس از اتصال همگام می‌شود' });
    } else {
      toast({ title: 'پیام ارسال شد' });
      void load(true);
    }
  };

  /* انتخاب و فشرده‌سازی پیوست */
  const onPickFile = async (f: File | null) => {
    if (!f) return;
    setAttachLoading(true);
    try {
      let dataUrl: string;
      if (f.type.startsWith('image/')) {
        dataUrl = await compressImage(f);
      } else {
        if (f.size > 330_000) throw new Error('big');
        dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error('read'));
          r.readAsDataURL(f);
        });
      }
      if (dataUrl.length > MAX_ATTACH_DATAURL) throw new Error('big');
      setThreadAttach({ name: f.name.slice(0, 120), type: f.type || 'application/octet-stream', data: dataUrl });
    } catch {
      toast({ title: 'حجم فایل بیش از حد مجاز است — حداکثر حدود ۳۵۰ کیلوبایت', variant: 'destructive' });
    } finally {
      setAttachLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const viewAttachment = async (m: Msg) => {
    try {
      const d = await apiGet<{ attachment: { name: string; type: string; data: string } | null }>(`/api/messages?id=${m.id}`);
      if (!d.attachment) { toast({ title: 'پیوست یافت نشد', variant: 'destructive' }); return; }
      downloadAttachment(d.attachment.name, d.attachment.data);
    } catch {
      toast({ title: 'دریافت پیوست ناموفق بود — در حالت آفلاین پس از اتصال تلاش کنید', variant: 'destructive' });
    }
  };

  const canEditMsg = (m: Msg): boolean => {
    if (!perms.editOwn) return false;
    if (Date.now() - new Date(m.createdAt).getTime() > EDIT_WINDOW_MS) return false;
    if ((m.readCount || 0) > 0) return false;
    return true;
  };

  const deleteMsg = async (m: Msg, mine: boolean) => {
    const hard = mine && perms.deleteOwn;
    const confirmText = hard && (m.totalCount || 0) > 1
      ? 'این پیام گروهی برای همهٔ گیرندگان حذف (فراخوانی) شود؟'
      : 'این پیام حذف شود؟ این عمل بازگشت‌پذیر نیست.';
    if (!window.confirm(confirmText)) return;
    const res = await apiSend(`/api/messages?id=${m.id}`, 'DELETE', undefined, { queueLabel: 'حذف پیام' });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: res.queued ? 'حذف ذخیره شد — پس از اتصال همگام می‌شود' : 'پیام حذف شد' });
    if (!res.queued) void load(true);
  };

  const openEdit = (m: Msg) => {
    setEditMsg(m);
    setEditBody(m.body);
    setEditCategory(m.category);
  };

  const saveEdit = async () => {
    if (!editMsg) return;
    setSavingEdit(true);
    const res = await apiSend('/api/messages', 'PATCH', { edit: true, id: editMsg.id, body: editBody, subject: editMsg.subject, category: editCategory }, { queueLabel: 'ویرایش پیام' });
    setSavingEdit(false);
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: res.queued ? 'ویرایش ذخیره شد — پس از اتصال همگام می‌شود' : 'پیام ویرایش شد' });
    setEditMsg(null);
    if (!res.queued) void load(true);
  };

  const growTa = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, activeKey]);

/* ─── بخش ۳: نمایش ─── */

  const qTrim = q.trim().toLowerCase();
  const visibleConvs = useMemo(() => {
    let list = conversations;
    if (unreadOnly) list = list.filter((c) => c.unread > 0);
    if (qTrim) list = list.filter((c) => `${c.name} ${c.reason} ${c.chTarget} ${c.lastPreview}`.toLowerCase().includes(qTrim));
    return list;
  }, [conversations, unreadOnly, qTrim]);

  const matchedContacts = useMemo(() => {
    if (!qTrim) return [];
    return (data?.contacts || []).filter((c) => c.name.toLowerCase().includes(qTrim)).slice(0, 6);
  }, [data, qTrim]);

  const canComposeGroups = perms.group || perms.announce || perms.allUsers;

  // مخاطبان دیالوگ گفتگوی جدید — گروه‌بندی نقشی
  const [ncQ, setNcQ] = useState('');
  const groupedContacts = useMemo(() => {
    const s = ncQ.trim().toLowerCase();
    const list = (data?.contacts || []).filter((c) => !s || c.name.toLowerCase().includes(s));
    const order = ['ADMIN', 'HEADTEACHER', 'TEACHER', 'GUARDIAN', 'STUDENT', 'STAFF', 'LIBRARIAN'];
    return order.map((r) => ({ role: r, items: list.filter((c) => c.role === r) })).filter((g) => g.items.length > 0);
  }, [data, ncQ]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری پیام‌ها…</p>;
  }
  if (loadError && !data) {
    return (
      <div className="space-y-3 text-center py-10">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>تلاش دوباره</Button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-7rem)] min-h-[440px]">
      <div className="h-full grid md:grid-cols-[minmax(300px,360px)_1fr] rounded-xl border overflow-hidden bg-background">

        {/* ─── فهرست گفتگوها ─── */}
        <section className={cn('flex flex-col min-h-0', activeConv && 'hidden md:flex')}>
          <div className="px-3 pt-3 pb-2 border-b space-y-2 bg-sidebar/40 shrink-0">
            <div className="flex items-center gap-1">
              <h1 className="text-base font-bold flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">پیام‌ها</span>
                {!!data.unread && <Badge className="bg-primary text-[10px] px-1.5 shrink-0">{toPersianDigits(data.unread)} نخوانده</Badge>}
              </h1>
              {!!data.unread && (
                <button type="button" title="خواندن همه" aria-label="خواندن همه" onClick={() => void markAll()} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-500/10 transition-colors">
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              {perms.managePolicy && (
                <button type="button" title="صلاحیت‌های ارتباطی" aria-label="صلاحیت‌های ارتباطی" onClick={() => setPolicyOpen(true)} className="rounded-lg p-2 text-violet-600 hover:bg-violet-500/10 transition-colors">
                  <ShieldCheck className="h-4 w-4" />
                </button>
              )}
              {perms.reports && (
                <button type="button" title="گزارش فعالیت پیام‌ها" aria-label="گزارش فعالیت پیام‌ها" onClick={() => setReportsOpen(true)} className="rounded-lg p-2 text-sky-600 hover:bg-sky-500/10 transition-colors">
                  <ScrollText className="h-4 w-4" />
                </button>
              )}
              <button
                type="button" title="گفتگوی جدید" aria-label="گفتگوی جدید"
                onClick={() => { setNewChatTab(perms.direct ? 'people' : canComposeGroups ? 'groups' : 'people'); setNewChatOpen(true); }}
                className="rounded-lg p-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
              >
                <SquarePen className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی گفتگو یا شخص…" className="h-9 pr-8 bg-background" />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'unread'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setUnreadOnly(v === 'unread')}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors border',
                    (v === 'unread') === unreadOnly ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-accent',
                  )}
                >
                  {v === 'all' ? 'همه' : 'نخوانده‌ها'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto nice-scroll">
            {!!qTrim && matchedContacts.length > 0 && perms.direct && (
              <>
                <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">شروع گفتگوی جدید</p>
                {matchedContacts.map((c) => (
                  <button key={c.id} type="button" onClick={() => startWith(c)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 text-right transition-colors">
                    <span className={cn('h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', avatarCls(c.role))}>{initialsOf(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{ROLE_LABELS[c.role] || c.role}{c.reason ? ` — ${c.reason}` : ''}</span>
                    </span>
                    <SquarePen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">گفتگوها</p>
              </>
            )}
            {visibleConvs.length > 0 ? (
              visibleConvs.map((c) => <ConvRow key={c.key} conv={c} todayIso={todayIso} active={c.key === activeKey} onClick={() => openConv(c)} />)
            ) : (
              <div className="p-8 text-center space-y-2.5">
                <MessagesSquare className="h-9 w-9 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {qTrim ? 'چیزی یافت نشد' : unreadOnly ? 'نخوانده‌ای ندارید' : 'هنوز گفتگویی ندارید'}
                </p>
                {!qTrim && !unreadOnly && perms.direct && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNewChatOpen(true)}>
                    <SquarePen className="h-3.5 w-3.5" /> گفتگوی جدید
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ─── گفتگوی فعال ─── */}
        <section className={cn('flex flex-col min-h-0 border-r', !activeConv && 'hidden md:flex')}>
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
              <MessagesSquare className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">گفتگویی را انتخاب کنید</p>
              <p className="text-xs text-muted-foreground max-w-xs leading-5">
                از فهرست یک گفتگو باز کنید یا با دکمهٔ «گفتگوی جدید» به مدیریت، همکاران، والدین و شاگردان مجاز پیام بدهید.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-sidebar/40 shrink-0">
                <button type="button" className="md:hidden rounded-lg p-1.5 hover:bg-accent transition-colors shrink-0" onClick={() => setActiveKey(null)} aria-label="بازگشت به فهرست">
                  <ArrowRight className="h-5 w-5" />
                </button>
                <span className={cn('h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', avatarCls(activeConv.role))}>
                  {activeConv.isChannel ? <Megaphone className="h-4 w-4" /> : initialsOf(activeConv.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{activeConv.isChannel && activeConv.key.startsWith('c:me:') ? `به: ${activeConv.name}` : activeConv.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeConv.isChannel
                      ? activeConv.chTarget
                      : [ROLE_LABELS[activeConv.role] || '', activeConv.reason].filter(Boolean).join(' — ')}
                  </p>
                </div>
                {activeConv.isChannel && (
                  <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-700 dark:text-violet-300 shrink-0 gap-1">
                    <Megaphone className="h-3 w-3" /> {activeConv.key.startsWith('c:me:') ? 'ارسالی' : 'همگانی'}
                  </Badge>
                )}
              </div>

              {/* پیام‌ها */}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto nice-scroll px-2.5 py-3">
                {thread.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">آغاز گفتگو — اولین پیام را بفرستید</p>
                )}
                {thread.map((m, i) => {
                  const day = m.createdAt.slice(0, 10);
                  const prevDay = i > 0 ? thread[i - 1].createdAt.slice(0, 10) : null;
                  const mine = m.recipientIds !== undefined || pendingIds.has(m.id);
                  const pending = pendingIds.has(m.id);
                  const multi = (m.totalCount || 0) > 1;
                  return (
                    <Fragment key={m.id}>
                      {day !== prevDay && (
                        <div className="flex justify-center py-2">
                          <span className="rounded-full bg-muted px-3 py-0.5 text-[10.5px] text-muted-foreground">{dayLabel(day, todayIso, yesterdayIso)}</span>
                        </div>
                      )}
                      <div className={cn('flex mb-1.5', mine ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'group max-w-[85%] sm:max-w-[72%] rounded-2xl px-3 pt-2 pb-1.5 text-sm shadow-sm',
                            mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm',
                            m.priority === 'URGENT' && 'ring-1 ring-rose-400/70',
                          )}
                        >
                          {m.subject && <p className="font-bold text-[13px] mb-0.5 break-words">{m.subject}</p>}
                          <p className="whitespace-pre-wrap break-words leading-6">{m.body}</p>
                          {m.attachmentName && (
                            <button
                              type="button"
                              onClick={() => void viewAttachment(m)}
                              className={cn(
                                'mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] transition-colors max-w-full',
                                mine ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25' : 'bg-background/60 hover:bg-background',
                              )}
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{m.attachmentName}</span>
                            </button>
                          )}
                          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] opacity-80">
                            {m.editedAt && <span>(ویرایش‌شده)</span>}
                            {m.priority === 'URGENT' && <span className="font-bold">فوری</span>}
                            <span dir="ltr">{toPersianDigits(m.createdAt.slice(11, 16))}</span>
                            {mine && pending && <Clock className="h-3 w-3" aria-label="در انتظار همگام‌سازی" />}
                            {mine && !pending && perms.seeReadStatus && multi && (
                              <span className="flex items-center gap-0.5">
                                <CheckCheck className="h-3 w-3" />
                                {toPersianDigits(m.readCount || 0)}/{toPersianDigits(m.totalCount || 0)}
                              </span>
                            )}
                            {mine && !pending && perms.seeReadStatus && !multi && ((m.readCount || 0) > 0 ? <CheckCheck className="h-3.5 w-3.5" aria-label="خوانده شد" /> : <Check className="h-3 w-3" aria-label="ارسال شد" />)}
                            {mine && !pending && canEditMsg(m) && (
                              <button type="button" onClick={() => openEdit(m)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="ویرایش پیام" title="ویرایش (تا ۳۰ دقیقه)">
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                            <button type="button" onClick={() => void deleteMsg(m, mine)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="حذف پیام" title={mine ? 'حذف برای همه' : 'حذف برای من'}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {/* نوشتن پیام / پانوشت کانال */}
              {activeConv.isChannel ? (
                <div className="border-t p-3 flex flex-col items-center gap-1.5 text-center bg-sidebar/30 shrink-0">
                  <p className="text-[11px] text-muted-foreground">
                    {activeConv.key.startsWith('c:me:') ? 'پیام‌های گروهی/همگانی شما' : 'پیام گروهی/همگانی — پاسخ در گفتگوی خصوصی داده می‌شود'}
                  </p>
                  {!activeConv.key.startsWith('c:me:') && activeConv.chFromId && contactMap.get(activeConv.chFromId) && perms.enabled && perms.reply && (
                    <Button size="sm" variant="outline" onClick={() => { const c = contactMap.get(activeConv.chFromId!); if (c) startWith(c); }}>
                      پیام به فرستنده
                    </Button>
                  )}
                </div>
              ) : perms.enabled && perms.reply ? (
                <div className="border-t p-2.5 space-y-2 bg-sidebar/30 shrink-0">
                  {threadAttach && (
                    <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{threadAttach.name}</span>
                      <button type="button" onClick={() => setThreadAttach(null)} aria-label="حذف پیوست" className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5">
                    {perms.attach && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={attachLoading}
                        title="ارسال عکس یا فایل"
                        aria-label="ارسال عکس یا فایل"
                        className="rounded-lg p-2.5 text-muted-foreground hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
                      >
                        {attachLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                      </button>
                    )}
                    <input
                      ref={fileRef} type="file" className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                      onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
                    />
                    <Textarea
                      ref={taRef}
                      rows={1}
                      value={threadText}
                      onChange={(e) => { setThreadText(e.target.value); growTa(); }}
                      placeholder="پیام…"
                      aria-label="متن پیام"
                      className="min-h-[42px] max-h-[120px] resize-none py-2.5"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendThread();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-[42px] w-[42px] shrink-0 rounded-lg"
                      onClick={() => void sendThread()}
                      disabled={sending || (!threadText.trim() && !threadAttach)}
                      aria-label="ارسال پیام"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t p-3 text-center text-[11px] text-muted-foreground bg-sidebar/30 shrink-0">
                  {perms.enabled ? 'پاسخ‌دادن برای شما توسط مدیر غیرفعال شده است — پیام‌ها را می‌توانید بخوانید' : 'پیام‌رسانی برای شما توسط مدیر غیرفعال است'}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ─── دیالوگ گفتگوی جدید ─── */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <SquarePen className="h-4 w-4 text-primary" /> گفتگوی جدید
            </DialogTitle>
          </DialogHeader>
          <Tabs value={newChatTab} onValueChange={setNewChatTab} className="flex flex-col min-h-0 flex-1">
            <TabsList className={cn('shrink-0', canComposeGroups && perms.direct ? 'grid grid-cols-2' : 'grid grid-cols-1')}>
              {perms.direct && <TabsTrigger value="people">اشخاص</TabsTrigger>}
              {canComposeGroups && <TabsTrigger value="groups">گروهی و همگانی</TabsTrigger>}
            </TabsList>
            <TabsContent value="people" className="mt-3 flex flex-col min-h-0">
              <div className="relative pb-2 shrink-0">
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={ncQ} onChange={(e) => setNcQ(e.target.value)} placeholder="جست‌وجوی نام مخاطب…" className="pr-8" />
              </div>
              <div className="max-h-[52vh] overflow-y-auto nice-scroll -mx-1 px-1">
                {groupedContacts.length > 0 ? groupedContacts.map((g) => (
                  <div key={g.role}>
                    <p className="px-2 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{ROLE_LABELS[g.role] || g.role}</p>
                    {g.items.map((c) => (
                      <button key={c.id} type="button" onClick={() => startWith(c)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/60 text-right transition-colors">
                        <span className={cn('h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', avatarCls(c.role))}>{initialsOf(c.name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{c.reason}{c.classLabel ? ` — ${c.classLabel}` : ''}{c.subjectName ? ` — ${c.subjectName}` : ''}</span>
                        </span>
                        <SquarePen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {(data?.contacts || []).length === 0 ? 'مخاطبی برای شما تعریف نشده است — با مدیر مکتب تماس بگیرید' : 'مخاطبی با این نام یافت نشد'}
                  </p>
                )}
              </div>
            </TabsContent>
            {canComposeGroups && (
              <TabsContent value="groups" className="mt-3 overflow-y-auto nice-scroll">
                <ComposePanel
                  contacts={data.contacts}
                  classes={data.classes}
                  perms={perms}
                  userRole={user.role}
                  onSent={() => { setNewChatOpen(false); void load(true); }}
                />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── دیالوگ ویرایش پیام ─── */}
      <Dialog open={!!editMsg} onOpenChange={(v) => !v && setEditMsg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">ویرایش پیام</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">متن پیام</Label>
              <Textarea rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditMsg(null)}>انصراف</Button>
              <Button onClick={() => void saveEdit()} disabled={savingEdit || !editBody.trim()}>
                {savingEdit ? 'در حال ذخیره…' : 'ذخیرهٔ ویرایش'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── دیالوگ صلاحیت‌های ارتباطی (مدیر) ─── */}
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-violet-600" /> صلاحیت‌های ارتباطی
            </DialogTitle>
          </DialogHeader>
          <CommPolicyPanel />
        </DialogContent>
      </Dialog>

      {/* ─── دیالوگ گزارش فعالیت پیام‌ها (مدیر) ─── */}
      <Dialog open={reportsOpen} onOpenChange={setReportsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <ScrollText className="h-4 w-4 text-sky-600" /> گزارش فعالیت پیام‌ها
            </DialogTitle>
          </DialogHeader>
          <CommReportsPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}
