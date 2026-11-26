'use client';

/**
 * دروازهٔ ورود و خروج با اسکن QR — نسخهٔ ۳.۱۰.۰ (مرحلهٔ ۷)
 *
 *  • اسکن: دوربین گوشی نگهبان کد QR کارت هویت را می‌خواند (jsQR روی فریم‌های زنده)؛
 *    سرور تصمیم می‌گیرد «ورود» یا «خروج» (یک‌درمیان، ضدتکرار ۴۵ ثانیه) و ساعت دقیق
 *    همان لحظه ثبت می‌شود — حتی وقتی اینترنت قطع است (صف آفلاین با clientToken یکتا).
 *  • بازخورد زنده: ورود (سبز)، خروج (آبی)، تکراری (زرد)، خطا/کارت لغوشده (سرخ) + بوق.
 *  • پنل مدیر: وضعیت امروز (ورودها/خروج‌ها/داخل مکتب)، تاریخچهٔ رفت‌وآمد با فیلتر
 *    تاریخ و صنف، ثبت دستی برای کارت گم‌شده، لغو ثبت اشتباه، لغو کارت گم‌شده.
 *  • لغو کارت: اسکن کارت لغوشده رد می‌شود؛ چاپ مجدد در بخش «کارت هویت» توکن تازه
 *    می‌سازد (نسخهٔ ۳.۸.۱) — کارت جدید کار می‌کند و کارت قبلی باطل می‌ماند.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader, LoadingBlock, EmptyState } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits, isoToJalaliDisplay } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser } from '@/lib/types';
import {
  ScanLine, Camera, CameraOff, LogIn, LogOut, RefreshCw, DoorOpen,
  Undo2, ShieldBan, ClipboardList, UserPlus, Loader2, ClipboardPaste, WifiOff,
} from 'lucide-react';

/* ─── ساعت کابل روی دستگاه ─── */
function clockFa(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const hhmm = new Date(t + 4.5 * 3600 * 1000).toISOString().slice(11, 16);
  const [h, m] = hhmm.split(':');
  return `${toPersianDigits(h)}:${toPersianDigits(m)}`;
}

function kabulTodayIso(): string {
  return new Date(Date.now() + 4.5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface ScanResponse {
  ok: boolean;
  duplicate?: boolean;
  kind: 'IN' | 'OUT';
  kindFa: string;
  date: string;
  clock: string;
  studentName?: string;
  className?: string;
  message: string;
}

interface GateLogRow {
  id: string;
  kind: string;
  at: string;
  method: string;
  byName: string | null;
  student: {
    id: string;
    firstName: string;
    lastName: string | null;
    fatherName: string;
    rollNo: number | null;
    classId: string | null;
    class: { name: string } | null;
  };
}

interface GateStatus {
  date: string;
  ins: number;
  outs: number;
  inside: number;
  smsOn: boolean;
  logs: GateLogRow[];
}

type Tone = 'in' | 'out' | 'warn' | 'err';

const TONE_STYLES: Record<Tone, string> = {
  in: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  out: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  err: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const TONE_ICONS: Record<Tone, React.ComponentType<{ className?: string }>> = {
  in: LogIn,
  out: LogOut,
  warn: RefreshCw,
  err: ShieldBan,
};

/** بوق کوتاه پس از هر اسکن موفق خواندن */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 110);
  } catch {
    /* صدا حیاتی نیست */
  }
}

/* ─── دوربین اسکن ─── */
function GateScanner({ onToken }: { onToken: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState('');
  const lastRef = useRef({ text: '', at: 0 });
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const stop = useCallback(() => setCamOn(false), []);

  const start = useCallback(() => {
    setCamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('این مرورگر از دوربین پشتیبانی نمی‌کند — کد کارت را دستی وارد کنید.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        const v = videoRef.current;
        if (!v) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        v.srcObject = stream;
        void v.play();
        setCamOn(true);
      })
      .catch(() =>
        setCamError('دسترسی به دوربین ممکن نشد — اجازهٔ دوربین را بدهید یا کد را دستی وارد کنید.'),
      );
  }, []);

  useEffect(() => {
    if (!camOn) return;
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState >= 2 && v.videoWidth > 0) {
        const w = 420;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 320;
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          const now = Date.now();
          if (code?.data && !(code.data === lastRef.current.text && now - lastRef.current.at < 2500)) {
            lastRef.current = { text: code.data, at: now };
            beep();
            onTokenRef.current(code.data);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      // خاموش‌کردن دوربین — هم هنگام توقف، هم هنگام ترک صفحه
      const v = videoRef.current;
      const stream = (v?.srcObject as MediaStream | null) || null;
      stream?.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    };
  }, [camOn]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video ref={videoRef} playsInline muted className="h-[44vh] min-h-[280px] w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {!camOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90">
            <Camera className="h-10 w-10" />
            <p className="text-sm">کارت شاگرد را جلوی دوربین بگیرید</p>
            <Button onClick={start}>روشن‌کردن دوربین</Button>
          </div>
        )}
        {/* قاب اسکن */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        {camOn && (
          <Button variant="destructive" size="sm" className="absolute right-3 top-3 gap-1" onClick={stop}>
            <CameraOff className="h-4 w-4" /> توقف دوربین
          </Button>
        )}
      </div>
      {camError && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300" dir="auto">
          {camError}
        </p>
      )}
    </div>
  );
}

/* ─── تب اسکن (نگهبان + مدیر) ─── */
function ScanTab() {
  const [feedback, setFeedback] = useState<{ tone: Tone; title: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [session, setSession] = useState<{ id: string; ok: boolean; title: string; detail: string }[]>([]);
  const busyRef = useRef(false);

  const handleToken = useCallback(async (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const clientToken =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await apiSend<ScanResponse>('/api/gate', 'POST', {
        action: 'scan',
        token,
        clientAt: new Date().toISOString(),
        clientToken,
      });
      if (res.queued) {
        setFeedback({
          tone: 'warn',
          title: 'ذخیره شد (حالت آفلاین)',
          detail: 'اینترنت قطع است — اسکن با ساعت همین لحظه در حافظهٔ گوشی ماند و با وصل شدن انترنت ثبت می‌شود.',
        });
        setSession((s) => [{ id: `${Date.now()}`, ok: true, title: 'آفلاین — ذخیره شد', detail: 'با وصل شدن انترنت ثبت می‌شود' }, ...s].slice(0, 25));
        return;
      }
      if (res.data) {
        const d = res.data;
        const tone: Tone = d.duplicate ? 'warn' : d.kind === 'IN' ? 'in' : 'out';
        setFeedback({
          tone,
          title: `${d.kindFa} — ${d.studentName || 'شاگرد'}`,
          detail: `ساعت ${d.clock}${d.className ? ` | صنف ${d.className}` : ''}${d.duplicate ? ' | این اسکن قبلاً ثبت شده بود' : ''}`,
        });
        setSession((s) =>
          [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ok: !d.duplicate, title: `${d.kindFa}: ${d.studentName || ''}`, detail: `ساعت ${d.clock}` }, ...s].slice(0, 25),
        );
      } else {
        const err = res.error || 'خطا در ثبت اسکن';
        const tone: Tone = res.status === 409 ? 'warn' : 'err';
        setFeedback({ tone, title: res.status === 409 ? 'اسکن تکراری' : 'ثبت نشد', detail: err });
        setSession((s) => [{ id: `${Date.now()}`, ok: false, title: 'ثبت نشد', detail: err }, ...s].slice(0, 25));
      }
    } catch {
      setFeedback({ tone: 'err', title: 'خطا در ثبت اسکن', detail: 'ارتباط با سرور برقرار نشد — دوباره تلاش کنید' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const ToneIcon = feedback ? TONE_ICONS[feedback.tone] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3">
        <GateScanner onToken={(t) => void handleToken(t)} />

        {feedback && ToneIcon && (
          <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${TONE_STYLES[feedback.tone]}`}>
            <ToneIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold" dir="auto">{feedback.title}</p>
              <p className="mt-0.5 text-xs opacity-85 break-words" dir="auto">{feedback.detail}</p>
            </div>
            {busy && <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin" />}
          </div>
        )}

        <Card>
          <CardContent className="space-y-2 p-3">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardPaste className="h-3.5 w-3.5" /> ورود دستی کد کارت (وقتی دوربین کار نمی‌کند)
            </Label>
            <div className="flex gap-2">
              <Input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="کد داخل QR کارت را اینجا بچسبانید…"
                dir="ltr"
                className="text-xs"
              />
              <Button
                size="sm"
                disabled={busy || !manualToken.trim()}
                onClick={() => {
                  const t = manualToken.trim();
                  if (t) {
                    setManualToken('');
                    void handleToken(t);
                  }
                }}
              >
                ثبت
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardContent className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ScanLine className="h-4 w-4" /> آخرین اسکن‌های این دستگاه
          </p>
          {session.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">هنوز اسکنی ثبت نشده است</p>
          ) : (
            <ul className="max-h-[52vh] space-y-1.5 overflow-y-auto">
              {session.map((it) => (
                <li
                  key={it.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${it.ok ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5'}`}
                >
                  <p className="font-medium" dir="auto">{it.title}</p>
                  {it.detail && <p className="opacity-70" dir="auto">{it.detail}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            در قطعی اینترنت هم اسکن‌ها ذخیره و خودکار ارسال می‌شوند — ساعت اسکن دقیق حفظ می‌شود.
            اسکن اولِ روز «ورود» و اسکن بعدی «خروج» ثبت می‌گردد.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── تب پنل مدیر ─── */
function PanelTab({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [date, setDate] = useState(kabulTodayIso);
  const [classId, setClassId] = useState('__all__');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [mClassId, setMClassId] = useState('');
  const [mStudentId, setMStudentId] = useState('');
  const [mKind, setMKind] = useState<'IN' | 'OUT'>('IN');
  const [mStudents, setMStudents] = useState<{ id: string; firstName: string; lastName: string | null; rollNo: number | null }[]>([]);
  const [manualBusy, setManualBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ date });
      if (classId !== '__all__') p.set('classId', classId);
      const d = await apiGet<GateStatus>(`/api/gate?${p.toString()}`);
      setData(d);
    } catch {
      /* آفلاین — آخرین داده می‌ماند */
    }
    setLoading(false);
  }, [date, classId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet<{ classes: { id: string; name: string }[] }>('/api/classes');
        setClasses(d.classes || []);
      } catch {
        /* آفلاین — فهرست صنف خالی می‌ماند */
      }
    })();
  }, []);

  // تازه‌سازی خودکار هر ۳۰ ثانیه — وضعیت دروازه همیشه زنده
  useEffect(() => {
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // فهرست شاگردان صنف برای ثبت دستی
  useEffect(() => {
    if (!mClassId) return;
    (async () => {
      try {
        const d = await apiGet<{ students: { id: string; firstName: string; lastName: string | null; rollNo: number | null }[] }>(
          `/api/students?classId=${mClassId}&pageSize=100`,
        );
        setMStudents(d.students || []);
      } catch {
        setMStudents([]);
      }
    })();
  }, [mClassId]);

  const undo = async (logId: string, name: string) => {
    if (!window.confirm(`ثبتِ «${name}» لغو شود؟ اگر پیامک آن هنوز ارسال نشده باشد، پیامکش هم لغو می‌شود.`)) return;
    const res = await apiSend('/api/gate', 'POST', { action: 'undo', logId });
    if (res.data) {
      toast({ title: 'ثبت لغو شد' });
      void load();
    } else {
      toast({ title: 'لغو ناموفق', description: res.error, variant: 'destructive' });
    }
  };

  const revokeCard = async (studentId: string, name: string) => {
    if (
      !window.confirm(
        `کارت «${name}» لغو شود؟ از این پس اسکن این کارت در دروازه رد می‌شود.\nبرای صدور کارت جدید: بخش «کارت هویت» → همان صنف → چاپ مجدد کارت این شاگرد (توکن تازه صادر می‌شود و کارت قبلی باطل می‌ماند).`,
      )
    )
      return;
    const res = await apiSend('/api/qr', 'POST', { action: 'revoke', id: studentId });
    if (res.data) {
      toast({ title: 'کارت لغو شد', description: 'برای کارت جدید از بخش «کارت هویت» چاپ مجدد کنید' });
    } else {
      toast({ title: 'لغو ناموفق', description: res.error, variant: 'destructive' });
    }
  };

  const toggleSms = async () => {
    if (!data) return;
    const res = await apiSend<{ ok: boolean; smsOn: boolean }>('/api/gate', 'POST', { action: 'config', smsOn: !data.smsOn });
    if (res.data) {
      setData({ ...data, smsOn: res.data.smsOn });
      toast({ title: res.data.smsOn ? 'پیامک والدین فعال شد' : 'پیامک والدین غیرفعال شد' });
    } else {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
    }
  };

  const submitManual = async () => {
    setManualBusy(true);
    const res = await apiSend('/api/gate', 'POST', {
      action: 'manual',
      studentId: mStudentId,
      kind: mKind,
      clientAt: new Date().toISOString(),
    });
    setManualBusy(false);
    if (res.data) {
      toast({ title: 'ثبت شد', description: (res.data as ScanResponse).message });
      setManualOpen(false);
      setMStudentId('');
      void load();
    } else {
      toast({ title: 'ثبت نشد', description: res.error, variant: 'destructive' });
    }
  };

  if (loading && !data) return <LoadingBlock rows={5} />;

  return (
    <div className="space-y-4">
      {/* خلاصهٔ روز */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-muted-foreground">ورودهای امروز</p>
            <p className="text-2xl font-bold text-emerald-600">{toPersianDigits(data?.ins ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-muted-foreground">خروج‌های امروز</p>
            <p className="text-2xl font-bold text-sky-600">{toPersianDigits(data?.outs ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-muted-foreground">داخل مکتب</p>
            <p className="text-2xl font-bold text-primary">{toPersianDigits(data?.inside ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* فیلترها و عملیات */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{isoToJalaliDisplay(date)}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40 text-xs" dir="ltr" />
        </div>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">همهٔ صنف‌ها</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> تازه‌سازی
        </Button>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setManualOpen(true)}>
              <UserPlus className="h-4 w-4" /> ثبت دستی
            </Button>
            <Button variant={data?.smsOn ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => void toggleSms()}>
              {data?.smsOn ? 'پیامک والدین: فعال' : 'پیامک والدین: خاموش'}
            </Button>
          </>
        )}
      </div>

      {/* تاریخچهٔ رفت‌وآمد */}
      <Card>
        <CardContent className="p-0">
          {!data || data.logs.length === 0 ? (
            <EmptyState message="برای این تاریخ ثبت ورود/خروجی وجود ندارد. با اسکن کارت شاگردان در تب «اسکن» اولین ثبت را بسازید." icon={DoorOpen} />
          ) : (
            <div className="overflow-x-auto nice-scroll max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-accent z-10">
                  <TableRow>
                    <TableHead className="w-16">ساعت</TableHead>
                    <TableHead>شاگرد</TableHead>
                    <TableHead className="hidden md:table-cell">صنف</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead className="hidden sm:table-cell">روش</TableHead>
                    <TableHead className="hidden lg:table-cell">ثبت‌کننده</TableHead>
                    {isAdmin && <TableHead className="text-left">عملیات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => {
                    const name = `${log.student.firstName} ${log.student.lastName || ''}`.trim();
                    return (
                      <TableRow key={log.id} className="hover:bg-accent/40 transition-colors">
                        <TableCell className="font-medium">{clockFa(log.at)}</TableCell>
                        <TableCell>
                          <p className="font-medium" dir="auto">{name}</p>
                          <p className="text-[11px] text-muted-foreground" dir="auto">
                            ولد: {log.student.fatherName}
                            {log.student.rollNo != null ? ` | حاضری ${toPersianDigits(log.student.rollNo)}` : ''}
                          </p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{log.student.class?.name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={log.kind === 'IN' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}>
                            {log.kind === 'IN' ? 'ورود' : 'خروج'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {log.method === 'QR' ? 'اسکن QR' : 'دستی'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground" dir="auto">
                          {log.byName || '—'}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-left">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                title="لغو این ثبت (اشتباه)"
                                onClick={() => void undo(log.id, name)}
                              >
                                <Undo2 className="h-3.5 w-3.5" /> لغو ثبت
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                                title="لغو کارت گم‌شده — اسکن آن از این پس رد می‌شود"
                                onClick={() => void revokeCard(log.student.id, name)}
                              >
                                <ShieldBan className="h-3.5 w-3.5" /> لغو کارت
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] leading-4 text-muted-foreground">
        «لغو کارت» برای کارت گم‌شده است: کارت لغوشده دیگر اسکن نمی‌شود؛ کارت جدید را از بخش «کارت هویت» دوباره چاپ کنید.
        «لغو ثبت» فقط یک ثبت اشتباه ورود/خروج را پاک می‌کند. آخرین {toPersianDigits(300)} ثبت هر روز نمایش داده می‌شود.
      </p>

      {/* دیالوگ ثبت دستی */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت دستی ورود / خروج</DialogTitle>
            <DialogDescription>برای شاگردی که کارتش گم‌شده یا خراب است — ساعت ثبت، همین حالا است.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>صنف</Label>
              <Select
                value={mClassId || '__none__'}
                onValueChange={(v) => {
                  setMClassId(v);
                  setMStudentId('');
                  setMStudents([]); // فهرست کهنهٔ صنف قبلی انتخاب نشود
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="صنف را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>صنف را انتخاب کنید</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>شاگرد</Label>
              <Select value={mStudentId || '__none__'} onValueChange={setMStudentId} disabled={!mClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={mClassId ? 'شاگرد را انتخاب کنید' : 'اول صنف را انتخاب کنید'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>شاگرد را انتخاب کنید</SelectItem>
                  {mStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName || ''}
                      {s.rollNo != null ? ` — حاضری ${toPersianDigits(s.rollNo)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نوع ثبت</Label>
              <Select value={mKind} onValueChange={(v) => setMKind(v === 'OUT' ? 'OUT' : 'IN')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">ورود به مکتب</SelectItem>
                  <SelectItem value="OUT">خروج از مکتب</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>انصراف</Button>
            <Button disabled={!mStudentId || manualBusy} onClick={() => void submitManual()}>
              {manualBusy && <Loader2 className="h-4 w-4 animate-spin" />} ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GateView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'ADMIN' || user.role === 'HEADTEACHER';
  const [tab, setTab] = useState<'scan' | 'panel'>('scan');

  return (
    <div className="space-y-4">
      <PageHeader
        title="دروازهٔ ورود و خروج (QR)"
        subtitle="اسکن کارت هویت شاگرد — ثبت ورود و خروج با ساعت دقیق، اطلاع‌رسانی والدین و تاریخچهٔ کامل رفت‌وآمد"
        icon={DoorOpen}
        actions={
          isAdmin ? (
            <div className="flex gap-1.5">
              <Button variant={tab === 'scan' ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setTab('scan')}>
                <ScanLine className="h-4 w-4" /> اسکن
              </Button>
              <Button variant={tab === 'panel' ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => setTab('panel')}>
                <ClipboardList className="h-4 w-4" /> وضعیت و تاریخچه
              </Button>
            </div>
          ) : undefined
        }
      />
      {tab === 'scan' ? <ScanTab /> : <PanelTab isAdmin={isAdmin} />}
    </div>
  );
}
