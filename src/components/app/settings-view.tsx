'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { PageHeader, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits, toLatinDigits, isoToJalaliDisplay, gregorianToJalali } from '@/lib/jalali';
import { DEFAULT_SCALE, scaleRangesText, type GradeScaleEntry } from '@/lib/grading';
import { SECTIONS } from '@/lib/access';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import type { SessionUser, AppSettings } from '@/lib/types';
import { Download, Upload, Save, Settings as SettingsIcon, KeyRound, DatabaseBackup, AlertTriangle, Plus, Trash2, ShieldCheck, Wallet, CalendarClock, History, Eraser, AlarmClock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** کلیدهای اضافی تنظیمات — در سرور whitelist شده‌اند (EDITABLE_KEYS) */
type SettingsForm = AppSettings & {
  feeDeadlineDay?: string; // روز ضرب‌الاجل فیس در ماه (۱ تا ۲۹ — خالی = غیرفعال)
  finePerDay?: string; // جریمهٔ دیرکرد کتابخانه — افغانی به‌ازای هر روز
  backupReminderDays?: string; // یادآوری پشتیبان‌گیری هر چند روز (۷/۱۴/۳۰/۹۰)
};

/** زمان آخرین پشتیبان این دستگاه — مبنای یادآوری خودکار */
const LAST_BACKUP_KEY = 'noq_last_backup_at';

const DEFAULTS: SettingsForm = {
  schoolName: 'مکتب خصوصی نداالقلم',
  province: '', district: '', authority: '', academicYear: '',
  directorName: '', directorPhone: '', directorEmail: '',
  maxWritten: '40', maxOral: '20', maxHomework: '20', maxActivity: '20',
  resultNote: '',
  tagline: '',
  navLabels: '{}',
  permTeacherGrades: '1', permTeacherGradeDelete: '1', permTeacherStudents: '1',
  feeDeadlineDay: '', finePerDay: '5', backupReminderDays: '30',
};

export function SettingsView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [settings, setSettings] = useState<SettingsForm>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [scale, setScale] = useState<GradeScaleEntry[]>(DEFAULT_SCALE);
  const [navLabels, setNavLabels] = useState<Record<string, string>>({});
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [clearYear, setClearYear] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    apiGet<{ settings: SettingsForm }>('/api/settings')
      .then((d) => {
        const rawReminder = d.settings.backupReminderDays || '30';
        setSettings({
          ...DEFAULTS,
          ...d.settings,
          feeDeadlineDay: d.settings.feeDeadlineDay || '',
          finePerDay: d.settings.finePerDay || '5',
          backupReminderDays:
            rawReminder === '7' || rawReminder === '14' || rawReminder === '30' || rawReminder === '90'
              ? rawReminder
              : '30',
        });
        try {
          const parsed = JSON.parse(d.settings.gradeScale || '[]') as GradeScaleEntry[];
          if (Array.isArray(parsed) && parsed.length >= 2) setScale(parsed);
        } catch { /* پیش‌فرض */ }
        try {
          const nl = JSON.parse(d.settings.navLabels || '{}') as Record<string, string>;
          if (nl && typeof nl === 'object') setNavLabels(nl);
        } catch { /* پیش‌فرض */ }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // زمان آخرین پشتیبان این دستگاه — پس از نصب (نمایش فوری، بدون ناسازگاری SSR)
  useEffect(() => {
    try {
      setLastBackupAt(localStorage.getItem(LAST_BACKUP_KEY));
    } catch { /* حالت خصوصی مرورگر */ }
  }, []);

  const save = async () => {
    // اعتبارسنجی فیلدهای مالی پیش از ارسال
    const fd = (settings.feeDeadlineDay || '').trim();
    if (fd) {
      const n = Number(toLatinDigits(fd));
      if (!n || n < 1 || n > 29) {
        toast({ title: 'خطا', description: 'روز ضرب‌الاجل فیس باید عددی بین ۱ تا ۲۹ باشد — خالی یعنی غیرفعال', variant: 'destructive' });
        return;
      }
    }
    const fp = (settings.finePerDay || '').trim();
    if (fp && Number(toLatinDigits(fp)) < 0) {
      toast({ title: 'خطا', description: 'جریمهٔ دیرکرد نمی‌تواند منفی باشد', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await apiSend('/api/settings', 'PUT', {
      settings: { ...settings, gradeScale: JSON.stringify(scale), navLabels: JSON.stringify(navLabels) },
    });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'تنظیمات ذخیره شد' });
    setTimeout(() => window.location.reload(), 1200);
  };

  const setScaleRow = (i: number, patch: Partial<GradeScaleEntry>) => {
    setScale((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const addScaleRow = () => {
    setScale((s) => [...s, { label: '', min: 0 }]);
  };
  const removeScaleRow = (i: number) => {
    setScale((s) => (s.length > 2 ? s.filter((_, idx) => idx !== i) : s));
  };

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirm) {
      toast({ title: 'خطا', description: 'تکرار رمز عبور مطابقت ندارد', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/auth', 'POST', {
      action: 'change-password',
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    });
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'رمز عبور تغییر کرد' });
    setPwOpen(false);
    setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
  };

  /** ثبت زمان آخرین پشتیبان این دستگاه — تازه‌کردن مبنای یادآوری خودکار */
  const markBackedUp = () => {
    const iso = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, iso);
    } catch { /* حالت خصوصی مرورگر */ }
    setLastBackupAt(iso);
  };

  const downloadBackup = async () => {
    try {
      const res = await fetch('/api/backup', { cache: 'no-store' });
      if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
      const blob = await res.blob();
      // نام فایل از Content-Disposition سرور — با نام پیش‌فرض جایگزین
      const m = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') || '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m?.[1] || `nedaalqalam-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      markBackedUp();
      toast({ title: 'فایل پشتیبان دانلود شد', description: 'آن را در محل امن نگهداری کنید' });
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ناموفق', variant: 'destructive' });
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) return;
    try {
      const text = await restoreFile.text();
      const json = JSON.parse(text);
      const res = await apiSend('/api/backup', 'POST', json);
      if (res.error) {
        toast({ title: 'خطا', description: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'بازیابی انجام شد', description: 'همهٔ داده‌ها بازگردانی گردید — صفحه تازه‌سازی می‌شود' });
      setRestoreConfirm(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast({ title: 'خطا', description: 'فایل نامعتبر است', variant: 'destructive' });
    }
  };

  /** پاک‌سازی حاضری سال‌های گذشته — حذف همیشگی رکوردهای حاضری یومیه؛ نمرات دست نمی‌خورند */
  const clearOldAttendance = async () => {
    const year = Number(toLatinDigits(clearYear).trim());
    const nowJ = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    if (!year || year < 1300 || year > nowJ.jy) {
      toast({ title: 'خطا', description: `سال شمسی معتبر وارد کنید (مثلاً ${toPersianDigits(nowJ.jy - 1)})`, variant: 'destructive' });
      return;
    }
    const first = window.confirm(
      `هشدار جدی: تمام رکوردهای حاضری یومیهٔ سال ${toPersianDigits(year)} و سال‌های پیش از آن برای همیشه حذف می‌شوند. نمرات و کارنامه‌ها دست نمی‌خورند. ادامه می‌دهید؟`,
    );
    if (!first) return;
    const second = window.confirm('تأیید نهایی: این عمل بازگشت‌پذیر نیست و دادهٔ حذف‌شده قابل بازیابی نیست. مطمئن هستید؟');
    if (!second) return;
    setClearing(true);
    // عملیات مخرب هرگز در صف آفلاین قرار نمی‌گیرد
    const res = await apiSend('/api/backup', 'DELETE', { action: 'clear-attendance', beforeJalaliYear: year }, { allowQueue: false });
    setClearing(false);
    if (res.error) {
      toast({ title: 'خطا در پاک‌سازی حاضری', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'پاک‌سازی انجام شد', description: `حاضری سال ${toPersianDigits(year)} و سال‌های قبل‌تر حذف گردید` });
  };

  const set = (key: keyof SettingsForm, value: string) => setSettings({ ...settings, [key]: value });

  // یادآوری پشتیبان‌گیری — هرگاه از مهلت تعیین‌شده گذشته باشد، نوار زردرنگ بالا نمایش داده می‌شود
  const reminderDays = Math.max(1, Number(toLatinDigits(settings.backupReminderDays || '30')) || 30);
  const lastBackupMs = lastBackupAt ? new Date(lastBackupAt).getTime() : 0;
  const backupOverdue = lastBackupMs > 0 && Date.now() - lastBackupMs > reminderDays * 86_400_000;
  const overdueDays = lastBackupMs > 0 ? Math.floor((Date.now() - lastBackupMs) / 86_400_000) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="تنظیمات" subtitle="معلومات مکتب، مقیاس نمرات، رمز عبور و پشتیبان‌گیری" icon={SettingsIcon} />

      {/* یادآوری پشتیبان‌گیری — برجسته و زردرنگ، فقط وقتی از مهلت گذشته باشد */}
      {isAdmin && backupOverdue && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/70 dark:bg-amber-950/40">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <AlarmClock className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {toPersianDigits(overdueDays)} روز از آخرین پشتیبان گذشته است
              </p>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5 leading-5">
                برای ایمنی معلومات مکتب (شاگردان، نمرات، مالی و...) همین حالا یک نسخهٔ پشتیبان تهیه کنید.
              </p>
            </div>
          </div>
          <Button
            onClick={downloadBackup}
            className="gap-1.5 shrink-0 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:text-white dark:hover:bg-amber-500"
          >
            <Download className="h-4 w-4" /> دانلود پشتیبان الآن
          </Button>
        </div>
      )}

      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900">معلومات مکتب</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="نام مکتب"><Input value={settings.schoolName} onChange={(e) => set('schoolName', e.target.value)} /></Field>
            <Field label="سال تعلیمی (شمسی)"><Input dir="ltr" className="text-left" value={settings.academicYear} onChange={(e) => set('academicYear', e.target.value)} /></Field>
            <Field label="ولایت"><Input value={settings.province} onChange={(e) => set('province', e.target.value)} /></Field>
            <Field label="ولسوالی / ناحیه"><Input value={settings.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label="آمریت مربوطه"><Input value={settings.authority} onChange={(e) => set('authority', e.target.value)} /></Field>
            <Field label="نام مدیر"><Input value={settings.directorName} onChange={(e) => set('directorName', e.target.value)} /></Field>
            <Field label="تماس مدیر"><Input dir="ltr" className="text-left" value={settings.directorPhone} onChange={(e) => set('directorPhone', e.target.value)} /></Field>
            <Field label="ایمیل مدیر"><Input dir="ltr" className="text-left" value={settings.directorEmail} onChange={(e) => set('directorEmail', e.target.value)} /></Field>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900">عناوین و نام‌ها — قابل تغییر توسط مدیر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-5">
              نام مکتب، شعار و عنوان هر بخشِ منو را همین‌جا تغییر دهید — تغییرات برای همهٔ کاربران در منو، سربرگ و صفحهٔ ورود اعمال می‌شود. اگر فیلدی را خالی بگذارید، عنوان پیش‌فرض استفاده می‌شود.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام مکتب (همه‌جا نمایش داده می‌شود)">
                <Input value={settings.schoolName} onChange={(e) => set('schoolName', e.target.value)} />
              </Field>
              <Field label="شعار زیر نام مکتب">
                <Input value={settings.tagline || ''} onChange={(e) => set('tagline', e.target.value)} placeholder="سیستم مدیریت تعلیمی" />
              </Field>
            </div>
            <Separator className="my-1" />
            <p className="text-xs font-semibold text-emerald-800">عناوین بخش‌های منو:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(SECTIONS).map(([key, def]) => (
                <Field key={key} label={def.label}>
                  <Input
                    value={navLabels[key] || ''}
                    placeholder={def.label}
                    onChange={(e) => setNavLabels({ ...navLabels, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900">مقاطع نمرات — سقف هر جزء از ۱۰۰</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="تحریری"><Input type="number" min={0} value={settings.maxWritten} onChange={(e) => set('maxWritten', e.target.value)} /></Field>
            <Field label="تقریری/عملی"><Input type="number" min={0} value={settings.maxOral} onChange={(e) => set('maxOral', e.target.value)} /></Field>
            <Field label="کارخانگی"><Input type="number" min={0} value={settings.maxHomework} onChange={(e) => set('maxHomework', e.target.value)} /></Field>
            <Field label="فعالیت صنفی"><Input type="number" min={0} value={settings.maxActivity} onChange={(e) => set('maxActivity', e.target.value)} /></Field>
            <div className="sm:col-span-4">
              <Field label="متن مقررات نتیجه (در کارنامه چاپ می‌شود)">
                <Input value={settings.resultNote || ''} onChange={(e) => set('resultNote', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* مکتسبه‌های قابل تنظیم — الف/ب/ج... با حد دلخواه */}
      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900">مکتسبه‌ها و حد نمرات (قابل تغییر)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-5">
              مثال: اگر «الف» باید از ۸۵ شروع شود، عدد کنار آن را به ۸۵ تغییر دهید. حد کمترین مکتسبهٔ قبولی، مرز ارتقا و تکرار صنف است.
              پیش‌نمایش فعلی: <span className="font-semibold text-emerald-800">{scaleRangesText(scale)}</span>
            </p>
            <div className="space-y-2">
              {scale.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="max-w-[140px]" placeholder="نام مکتسبه (الف...)"
                    value={row.label} onChange={(e) => setScaleRow(i, { label: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">حداقل نمره:</span>
                  <Input
                    dir="ltr" type="number" min={0} max={100} className="max-w-[100px] text-left"
                    value={row.min} onChange={(e) => setScaleRow(i, { min: Number(e.target.value) })}
                  />
                  <Button
                    variant="ghost" size="icon" aria-label="حذف سطر"
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    disabled={scale.length <= 2}
                    onClick={() => removeScaleRow(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addScaleRow} className="gap-1.5 border-emerald-300 text-emerald-800">
              <Plus className="h-4 w-4" /> افزودن مکتسبه
            </Button>
          </CardContent>
        </Card>
      )}

      {/* مالی — ضرب‌الاجل فیس و جریمهٔ دیرکرد کتابخانه */}
      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <Wallet className="h-5 w-5" /> مالی — ضرب‌الاجل و جریمه
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="روز ضرب‌الاجل فیس در ماه" hint="عدد ۱ تا ۲۹ — خالی بگذارید یعنی ضرب‌الاجل غیرفعال است">
              <Input
                dir="ltr" type="number" min={1} max={29} className="text-left" placeholder="مثلاً ۵"
                value={settings.feeDeadlineDay || ''} onChange={(e) => set('feeDeadlineDay', e.target.value)}
              />
            </Field>
            <Field label="جریمهٔ دیرکرد کتابخانه (افغانی در روز)" hint="پیش‌فرض ۵ افغانی به‌ازای هر روز تأخیر">
              <Input
                dir="ltr" type="number" min={0} className="text-left" placeholder="۵"
                value={settings.finePerDay || ''} onChange={(e) => set('finePerDay', e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground leading-5 sm:col-span-2">
              پس از روز ضرب‌الاجل، پرداخت فیس ماهانه دیرکرد محسوب می‌شود؛ جریمهٔ کتابخانه نیز به‌ازای هر روز تأخیر در بازنگرداندن کتاب بر اساس این عدد محاسبه می‌گردد.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> دسترسی معلمان — کنترل توسط مدیر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-5">
              هر معلم فقط شاگردان صنف‌هایی را می‌بیند که مضمونی در آنها تدریس می‌کند یا نگران آن صنف است،
              و فقط نمرات مضامین سپرده‌شده به خودش را می‌تواند ثبت یا ویرایش کند — حتی اگر در چند صنف و چند مضمون درس بدهد.
              با کلیدهای زیر تعیین کنید معلمان چه مجوزهایی داشته باشند:
            </p>
            <div className="space-y-3">
              {([
                ['permTeacherGrades', 'ثبت و ویرایش نمرات مضامین خود', 'معلم بتواند نمرات تحریری، تقریری، کارخانگی و فعالیت هر شاگرد را در مضامین خود ثبت و ویرایش کند'],
                ['permTeacherGradeDelete', 'حذف نمرات مضامین خود', 'معلم بتواند نمرهٔ ثبت‌شدهٔ هر شاگرد را حذف کند (با پاک‌کردن همهٔ اجزا یا دکمهٔ حذف)'],
                ['permTeacherStudents', 'ثبت و ویرایش شاگردان صنف‌های خود', 'معلم بتواند شاگرد جدید در صنف‌های خود ثبت و معلومات شاگردان همان صنف‌ها را ویرایش کند'],
              ] as const).map(([key, label, desc]) => (
                <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-900">{label}</p>
                    <p className="text-xs text-muted-foreground leading-5 mt-0.5">{desc}</p>
                  </div>
                  <Switch
                    checked={settings[key] !== '0'}
                    onCheckedChange={(v) => set(key, v ? '1' : '0')}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیرهٔ تنظیمات'}
          </Button>
        </div>
      )}

      {/* رمز عبور */}
      <Card className="border-emerald-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> امنیت حساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            رمز عبور خود را به‌صورت دوره‌ای تغییر دهید تا امنیت حساب تضمین شود.
          </p>
          <Button variant="outline" onClick={() => setPwOpen(true)} className="gap-1.5 border-emerald-300 text-emerald-800">
            <KeyRound className="h-4 w-4" /> تغییر رمز عبور
          </Button>
        </CardContent>
      </Card>

      {/* پشتیبان‌گیری خودکار — زمان‌بندی */}
      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> پشتیبان‌گیری خودکار (زمان‌بندی)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-5">
              تعیین کنید هر چند روز یک‌بار نسخهٔ پشتیبان تهیه شود. هرگاه از آخرین پشتیبانِ این دستگاه این مدت بگذرد، با باز کردن تنظیمات یادآوری زردرنگ نمایش داده می‌شود. با هر «تهیهٔ فایل پشتیبان»، زمان آخرین پشتیبان تازه می‌شود.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Field label="یادآوری پشتیبان‌گیری هر">
                <Select
                  value={settings.backupReminderDays || '30'}
                  onValueChange={(v) => set('backupReminderDays', v)}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">۷ روز</SelectItem>
                    <SelectItem value="14">۱۴ روز</SelectItem>
                    <SelectItem value="30">۳۰ روز</SelectItem>
                    <SelectItem value="90">۹۰ روز</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground leading-6">
                آخرین پشتیبان این دستگاه:{' '}
                <b className="text-emerald-800 dark:text-emerald-300">
                  {lastBackupAt ? isoToJalaliDisplay(lastBackupAt.slice(0, 10)) : 'هنوز تهیه نشده'}
                </b>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* پشتیبان‌گیری */}
      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5" /> پشتیبان‌گیری و بازیابی
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2 leading-6">
                از تمام داده‌های مکتب (شاگردان، نمرات، حاضری، کتابخانه و...) یک فایل پشتیبان تهیه و در محل امن نگهداری کنید.
                بازیابی داده‌ها <b className="text-emerald-800">تنها برای مدیر مکتب</b> ممکن است.
              </p>
              <Button onClick={downloadBackup} className="gap-1.5">
                <Download className="h-4 w-4" /> تهیهٔ فایل پشتیبان (Backup)
              </Button>
            </div>
            <Separator />
            <div>
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-3 mb-3">
                <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-800 leading-5">
                  هشدار: بازیابی، تمام داده‌های فعلی را با محتوای فایل پشتیبان جایگزین می‌کند. این عمل بازگشت‌پذیر نیست.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file" accept=".json" className="max-w-xs"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                />
                <Button
                  variant="destructive" disabled={!restoreFile}
                  onClick={() => setRestoreConfirm(true)}
                  className="gap-1.5"
                >
                  <Upload className="h-4 w-4" /> بازیابی از فایل
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* مدیریت داده‌های سال‌های گذشته */}
      {isAdmin && (
        <Card className="border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
              <History className="h-5 w-5" /> مدیریت داده‌های سال‌های گذشته
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="سال تعلیمی جاری (شمسی)"
                hint="همان فیلد کارت «معلومات مکتب» است — با «ذخیرهٔ تنظیمات» ثبت می‌شود"
              >
                <Input
                  dir="ltr" className="text-left" placeholder="۱۴۰۵"
                  value={settings.academicYear} onChange={(e) => set('academicYear', e.target.value)}
                />
              </Field>
            </div>
            <Separator />
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 space-y-3 dark:border-rose-900/60 dark:bg-rose-950/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-800 leading-5 dark:text-rose-300">
                  منطقهٔ خطر — پاک‌سازی حاضری سال‌های گذشته: با وارد کردن سال شمسی، همهٔ رکوردهای حاضری یومیهٔ آن سال و سال‌های قبل از آن برای همیشه حذف می‌شود تا پایگاه داده سبک بماند. نمرات و کارنامه‌ها دست نمی‌خورند و تاریخچهٔ آن‌ها می‌ماند. این عمل بازگشت‌پذیر نیست.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  dir="ltr" inputMode="numeric" className="text-left max-w-[140px]" placeholder="۱۴۰۴"
                  value={clearYear} onChange={(e) => setClearYear(e.target.value)}
                />
                <Button
                  variant="destructive" className="gap-1.5"
                  disabled={clearing || !clearYear.trim()}
                  onClick={clearOldAttendance}
                >
                  <Eraser className="h-4 w-4" /> {clearing ? 'در حال پاک‌سازی...' : 'پاک‌سازی حاضری سال‌های گذشته'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* دیالوگ تغییر رمز */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تغییر رمز عبور</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="رمز فعلی">
              <Input dir="ltr" className="text-left" type="password" value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
            </Field>
            <Field label="رمز جدید (حداقل ۶ حرف)">
              <Input dir="ltr" className="text-left" type="password" value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} />
            </Field>
            <Field label="تکرار رمز جدید">
              <Input dir="ltr" className="text-left" type="password" value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>انصراف</Button>
            <Button onClick={changePassword}>تغییر رمز</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تایید بازیابی */}
      <Dialog open={restoreConfirm} onOpenChange={setRestoreConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تایید بازیابی</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 py-2">
            آیا مطمئن هستید؟ تمام داده‌های فعلی حذف و داده‌های فایل پشتیبان <b>«{restoreFile?.name}»</b> بازگردانی می‌شود.
            این عمل قابل بازگشت نیست.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirm(false)}>انصراف</Button>
            <Button variant="destructive" onClick={restoreBackup}>بله، بازیابی کن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading && <p className="text-xs text-muted-foreground">در حال بارگذاری تنظیمات... {toPersianDigits('')}</p>}
    </div>
  );
}
