'use client';

/**
 * پنل نوشتن پیام — گیرندگان مطابق صلاحیت‌ها و روابط واقعی:
 *  • مدیر/سرمعلم: افراد، نقش‌ها، صنف‌ها (والدین/شاگردان/معلمان)، همه — با پیش‌شمارهٔ گیرندگان
 *  • معلم: مخاطبان مجاز خود (مدیریت، همکاران، والدین و شاگردان صنف‌هایش) + پیام صنفی سریع
 *  • والد: مدیریت مکتب، نگران صنف و معلمان فرزندانش (به تفکیک فرزند)
 *  • شاگرد: مدیریت مکتب و معلمان صنف خود
 *  • کارمند/کتابخانه: مدیریت و همکاران
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiSend, isOnline } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import { MAX_ATTACH_DATAURL, type CommPerms } from '@/lib/comm';
import {
  Send, Users, Layers, Globe2, Paperclip, X, Loader2, FileText, Image as ImageIcon, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Contact {
  id: string; name: string; role: string; reason: string;
  classLabel?: string | null; subjectName?: string | null;
}
export interface ClassInfo { id: string; name: string }
export interface MsgTarget {
  kind: 'all' | 'roles' | 'classes' | 'users';
  roles?: string[];
  classIds?: string[];
  audience?: 'guardians' | 'students' | 'teachers' | 'classAll';
  userIds?: string[];
}
interface PreviewData {
  total: number;
  breakdown: Array<{ label: string; count: number }>;
  byRole: Record<string, number>;
  names: string[];
  truncated: boolean;
}

const CATEGORIES = [
  { value: 'GENERAL', label: 'عمومی' },
  { value: 'ACADEMIC', label: 'تحصیلی' },
  { value: 'DISCIPLINARY', label: 'انضباطی' },
  { value: 'ANNOUNCEMENT', label: 'اطلاعیه' },
];
const ROLE_TARGETS = ['TEACHER', 'GUARDIAN', 'STUDENT', 'STAFF', 'LIBRARIAN', 'HEADTEACHER', 'ADMIN'];
const AUDIENCES = [
  { value: 'guardians', label: 'والدین صنف' },
  { value: 'students', label: 'شاگردان صنف' },
  { value: 'teachers', label: 'معلمان صنف' },
];

interface Attach { name: string; type: string; data: string }

/** فشرده‌سازی عکس — حداکثر ۱۲۸۰ پیکسل، JPEG با کیفیت ۰٫۷ (اشتراکی با چت‌خانه) */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export function ComposePanel({
  contacts, classes, perms, userRole, onSent,
}: {
  contacts: Contact[];
  classes: ClassInfo[];
  perms: CommPerms;
  userRole: string;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const isMgmt = userRole === 'ADMIN' || userRole === 'HEADTEACHER';
  const canGroups = isMgmt || perms.group;

  const [mode, setMode] = useState<'people' | 'groups'>(isMgmt ? 'groups' : 'people');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roleSel, setRoleSel] = useState<Set<string>>(new Set());
  const [classSel, setClassSel] = useState<Set<string>>(new Set());
  const [classAll, setClassAll] = useState(false);
  const [audience, setAudience] = useState<'guardians' | 'students' | 'teachers' | 'classAll'>('guardians');
  const [wantAll, setWantAll] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [attachment, setAttachment] = useState<Attach | null>(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const contactGroups = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of contacts) {
      if (search && !c.name.includes(search) && !(c.classLabel || '').includes(search)) continue;
      const key = c.reason || 'سایر';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()];
  }, [contacts, search]);

  const selectedContacts = useMemo(() => contacts.filter((c) => selected.has(c.id)), [contacts, selected]);

  /** هدف‌های فعلی — به ترتیب انتخاب */
  const buildTargets = useCallback((): MsgTarget[] => {
    const targets: MsgTarget[] = [];
    if (mode === 'people') {
      if (selected.size > 0) targets.push({ kind: 'users', userIds: [...selected] });
    } else {
      if (wantAll) targets.push({ kind: 'all' });
      if (roleSel.size > 0) targets.push({ kind: 'roles', roles: [...roleSel] });
      if (classSel.size > 0) targets.push({ kind: 'classes', classIds: [...classSel], audience: classAll ? 'classAll' : audience });
    }
    return targets;
  }, [mode, selected, wantAll, roleSel, classSel, classAll, audience]);

  const targets = buildTargets();
  const hasTarget = targets.length > 0;

  /** پیش‌شمارهٔ گیرندگان — با تأخیر تا هر انتخاب یک درخواست نزند */
  useEffect(() => {
    if (!hasTarget || !isOnline()) { setPreview(null); return; }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewLoading(true);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/messages/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets }),
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setPreview(json as PreviewData);
        else setPreview(null);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [targets, hasTarget]);

  const pickFile = async (f: File | null) => {
    if (!f) return;
    setAttachLoading(true);
    try {
      let data: string;
      if (f.type.startsWith('image/')) {
        data = await compressImage(f);
      } else {
        if (f.size > 350_000) {
          toast({ title: 'حجم فایل بیش از حد مجاز است', description: 'حداکثر ۳۵۰ کیلوبایت — عکس‌ها خودکار فشرده می‌شوند', variant: 'destructive' });
          return;
        }
        data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error('read'));
          r.readAsDataURL(f);
        });
      }
      if (data.length > MAX_ATTACH_DATAURL) {
        toast({ title: 'حجم پیوست زیاد است', description: 'پس از فشرده‌سازی همچنان بزرگ است — فایل کوچک‌تری انتخاب کنید', variant: 'destructive' });
        return;
      }
      setAttachment({ name: f.name, type: f.type || 'application/octet-stream', data });
    } catch {
      toast({ title: 'خواندن فایل ناموفق بود', variant: 'destructive' });
    } finally {
      setAttachLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text) { toast({ title: 'متن پیام را بنویسید', variant: 'destructive' }); return; }
    if (!hasTarget) { toast({ title: 'گیرنده را انتخاب کنید', variant: 'destructive' }); return; }
    const payload: Record<string, unknown> = { body: text, category, targets };
    if (subject.trim()) payload.subject = subject.trim();
    if (urgent) payload.urgent = true;
    if (attachment) payload.attachment = attachment;
    const label = preview?.total
      ? `پیام به ${toPersianDigits(preview.total)} گیرنده`
      : mode === 'people' && selected.size === 1
        ? `پیام به ${selectedContacts[0]?.name || 'گیرنده'}`
        : 'پیام گروهی';
    setSending(true);
    const res = await apiSend<{ id: string; recipientCount: number; kindLabel: string }>('/api/messages', 'POST', payload, {
      queueLabel: label,
    });
    setSending(false);
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    if (res.queued) {
      toast({ title: 'پیام در حافظهٔ گوشی ذخیره شد', description: 'پس از اتصال به انترنت خودکار همگام می‌شود', duration: 3500 });
    } else {
      toast({
        title: res.data?.kindLabel === 'همگانی' ? 'اطلاعیه ارسال شد' : 'پیام ارسال شد',
        description: res.data?.recipientCount ? `به ${toPersianDigits(res.data.recipientCount)} گیرنده` : undefined,
      });
    }
    setBody(''); setSubject(''); setAttachment(null); setUrgent(false);
    setSelected(new Set()); setRoleSel(new Set()); setClassSel(new Set()); setWantAll(false);
    onSent();
  };

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const chip = (label: string, active: boolean, onClick: () => void, key?: string) => (
    <button
      key={key || label} type="button" onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors min-h-[32px]',
        active ? 'bg-primary text-primary-foreground border-primary font-medium' : 'bg-background hover:bg-accent',
      )}
    >
      {label}
    </button>
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3.5">
        {/* نوع گیرنده */}
        {canGroups && (
          <div className="flex flex-wrap gap-1.5">
            {isMgmt && chip('اشخاص مشخص', mode === 'people', () => setMode('people'), 'm-people')}
            {isMgmt && chip('گروه‌ها و همه', mode === 'groups', () => setMode('groups'), 'm-groups')}
            {!isMgmt && chip('انتخاب گیرندگان', true, () => {}, 'm-fixed')}
          </div>
        )}

        {/* حالت افراد — مخاطبان مجاز */}
        {(mode === 'people' || !canGroups) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">مخاطبان مجاز شما {selected.size > 0 && `— ${toPersianDigits(selected.size)} انتخاب‌شده`}</Label>
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-rose-600">پاک‌کردن انتخاب</button>
              )}
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا صنف…" className="h-9" />
            {/* پیام صنفی سریع معلم */}
            {userRole === 'TEACHER' && classes.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> پیام سریع صنفی</p>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c) => (
                    <div key={c.id} className="flex items-center gap-1">
                      {chip(`والدین ${c.name}`, false, () => {
                        setSelected(new Set());
                        toast({ title: `پیام به والدین ${c.name}`, description: 'در پایان «ارسال» را بزنید — گیرندگان از صنف تعیین می‌شوند', duration: 2500 });
                        setMode('groups');
                        setClassSel(new Set([c.id]));
                        setAudience('guardians');
                      }, `tg-${c.id}`)}
                      {chip(`شاگردان ${c.name}`, false, () => {
                        setSelected(new Set());
                        setMode('groups');
                        setClassSel(new Set([c.id]));
                        setAudience('students');
                      }, `ts-${c.id}`)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto nice-scroll space-y-2.5 rounded-lg border p-2">
              {contactGroups.map(([reason, list]) => (
                <div key={reason} className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground sticky top-0 bg-card py-0.5">{reason} <span className="font-normal">({toPersianDigits(list.length)})</span></p>
                  {list.map((c) => {
                    const picked = selected.has(c.id);
                    return (
                      <button
                        key={c.id} type="button"
                        onClick={() => toggle(selected, c.id, setSelected)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-right transition-colors min-h-[40px]',
                          picked ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="font-medium truncate block">{c.name}</span>
                          <span className="text-[10.5px] text-muted-foreground block truncate">
                            {ROLE_LABELS[c.role] || c.role}{c.subjectName ? ` — ${c.subjectName}` : ''}{c.classLabel ? ` — ${c.classLabel}` : ''}
                          </span>
                        </span>
                        <span className={cn('h-4.5 w-4.5 rounded-full border-2 shrink-0 flex items-center justify-center', picked ? 'bg-primary border-primary' : 'border-muted-foreground/40')}>
                          {picked && <span className="text-[9px] text-primary-foreground">✓</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {contactGroups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {search ? 'مخاطبی با این نام یافت نشد' : 'مخاطب مجازی برای شما تعریف نشده — در صورت نیاز از مدیر اجازه بگیرید'}
                </p>
              )}
            </div>
            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedContacts.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 text-[11px]">
                    {c.name}
                    <button type="button" onClick={() => toggle(selected, c.id, setSelected)} aria-label={`حذف ${c.name}`}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* حالت گروه‌ها — مدیر/سرمعلم */}
        {mode === 'groups' && canGroups && (
          <div className="space-y-3">
            {perms.allUsers && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5"><Globe2 className="h-4 w-4 text-amber-600" /> همهٔ کاربران سیستم</p>
                  <p className="text-[11px] text-muted-foreground">پیام به تمام کاربران فعال مکتب</p>
                </div>
                <Switch checked={wantAll} onCheckedChange={setWantAll} aria-label="همهٔ کاربران" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">گروه‌های نقشی</Label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_TARGETS.map((r) => chip(ROLE_LABELS[r] || r, roleSel.has(r), () => toggle(roleSel, r, setRoleSel), `role-${r}`))}
              </div>
            </div>
            {classes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">صنف‌ها</Label>
                <div className="flex flex-wrap gap-1.5">
                  {classes.map((c) => chip(c.name, classSel.has(c.id), () => toggle(classSel, c.id, setClassSel), `cls-${c.id}`))}
                </div>
                {classSel.size > 0 && (
                  <Select value={classAll ? 'classAll' : audience} onValueChange={(v) => { setAudience(v as typeof audience); setClassAll(v === 'classAll'); }}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      <SelectItem value="classAll">همهٔ اعضای صنف (والد + شاگرد + معلم)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        )}

        {/* پیش‌شمارهٔ گیرندگان */}
        {hasTarget && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary shrink-0" />
              {previewLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> در حال شمارش گیرندگان…</p>
              ) : preview ? (
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary">این پیام به {toPersianDigits(preview.total)} گیرنده می‌رسد</p>
                  {preview.breakdown.length > 0 && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {preview.breakdown.filter((b) => b.count > 0).map((b) => `${b.label}: ${toPersianDigits(b.count)}`).join(' • ')}
                    </p>
                  )}
                  {!preview.total && <p className="text-[11px] text-rose-600">هیچ گیرنده‌ای یافت نشد — انتخاب را بررسی کنید</p>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isOnline() ? 'برای شمارش دقیق گیرندگان، انتخاب را کامل کنید' : 'آفلاین — شمارش دقیق پس از اتصال انجام می‌شود'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* مشخصات پیام */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">دستهٔ پیام</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">موضوع (اختیاری)</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع پیام…" className="h-9" />
          </div>
        </div>

        {perms.urgent && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">پیام فوری</p>
              <p className="text-[11px] text-muted-foreground">با اعلان پررنگ و علامت «فوری» برای گیرنده نمایش داده می‌شود</p>
            </div>
            <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="پیام فوری" />
          </div>
        )}

        {perms.attach && (
          <div className="space-y-1.5">
            <input
              ref={fileRef} type="file" className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => void pickFile(e.target.files?.[0] || null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={attachLoading} className="gap-1.5">
                {attachLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : attachment ? <FileText className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
                پیوست فایل / تصویر
              </Button>
              {attachment && (
                <Badge variant="secondary" className="gap-1 max-w-56">
                  {attachment.type.startsWith('image/') ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{attachment.name}</span>
                  <button type="button" onClick={() => setAttachment(null)} aria-label="حذف پیوست"><X className="h-3 w-3" /></button>
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">متن پیام</Label>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="پیام خود را بنویسید… دستهٔ مناسب (تحصیلی، انضباطی، اطلاعیه) را انتخاب کنید." />
          <p className="text-[10.5px] text-muted-foreground">{toPersianDigits(body.length)} نویسه — حداکثر ۸٬۰۰۰</p>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {mode === 'people' && selected.size > 0
              ? `${toPersianDigits(selected.size)} شخص انتخاب‌شده`
              : hasTarget ? 'گیرندگان هوشمند — بدون ارسال تکراری' : 'هنوز گیرنده‌ای انتخاب نشده'}
          </p>
          <Button onClick={send} disabled={sending || !hasTarget} className="gap-1.5">
            <Send className="h-4 w-4" /> {sending ? 'در حال ارسال…' : 'ارسال پیام'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
