'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { PageHeader, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import type { SessionUser, AppSettings } from '@/lib/types';
import { Download, Upload, Save, Settings as SettingsIcon, KeyRound, DatabaseBackup, AlertTriangle } from 'lucide-react';

const DEFAULTS: AppSettings = {
  schoolName: 'مکتب خصوصی نداالقلم',
  province: '', district: '', authority: '', academicYear: '',
  directorName: '', directorPhone: '', directorEmail: '',
  maxWritten: '40', maxOral: '20', maxHomework: '20', maxActivity: '20',
  resultNote: '',
};

export function SettingsView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    apiGet<{ settings: AppSettings }>('/api/settings')
      .then((d) => setSettings({ ...DEFAULTS, ...d.settings }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await apiSend('/api/settings', 'PUT', { settings });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'تنظیمات ذخیره شد' });
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

  const downloadBackup = async () => {
    try {
      const res = await fetch('/api/backup', { cache: 'no-store' });
      if (!res.ok) throw new Error('دریافت فایل ناموفق بود');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `پشتیبان-نداالقلم-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
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

  const set = (key: keyof AppSettings, value: string) => setSettings({ ...settings, [key]: value });

  return (
    <div className="space-y-5">
      <PageHeader title="تنظیمات" subtitle="معلومات مکتب، مقیاس نمرات، رمز عبور و پشتیبان‌گیری" icon={SettingsIcon} />

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
            <CardTitle className="text-base text-emerald-900">مقیاس نمرات (سقف هر جزء از ۱۰۰)</CardTitle>
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
