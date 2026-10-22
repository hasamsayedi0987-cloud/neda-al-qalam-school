'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Phone, Mail, Code2, ShieldCheck, Wifi, DatabaseBackup, Printer, Pencil, Save, Smartphone } from 'lucide-react';
import type { SessionUser } from '@/lib/types';

/** عکس را به dataURL فشرده تبدیل می‌کند (حداکثر ۴۰۰ پیکسل — مناسب ذخیره در تنظیمات) */
async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 400;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

interface AboutInfo {
  text: string;
  photo: string | null;
  name: string;
  title: string;
  phone: string;
  email: string;
  version: string;
  location: string;
}

const DEFAULT_DEV: AboutInfo = {
  text: 'توسعه‌دهندهٔ اپلیکیشن مدیریت مکتب خصوصی نداالقلم',
  photo: '/dev-photo.png',
  name: 'حسام الدین سیدی',
  title: 'توسعه‌دهندهٔ اپلیکیشن',
  phone: '0791680632',
  email: 'hasamsayedi0987@gmail.com',
  version: '۱.۲',
  location: 'افغانستان، ولایت بدخشان، ولسوالی بهارک',
};

const DEFAULT_APP: AboutInfo = {
  text: 'این اپلیکیشن برای مدیریت کامل امور تعلیمی مکتب خصوصی نداالقلم طراحی شده است؛ از ثبت‌نام شاگردان صنف اول تا دوازدهم، مدیریت مضامین و معلمان گرفته تا ثبت نمرات چهارو‌نیم‌ماهه و سالانه، حاضری یومیه، فعالیت‌های روزمرهٔ شاگردان و مدیریت کتابخانه.',
  photo: null,
  name: 'مکتب خصوصی نداالقلم',
  title: 'سیستم مدیریت تعلیمی',
  phone: '',
  email: '',
  version: '۱.۲',
  location: '',
};

function parseAbout(json: string | undefined, fallback: AboutInfo): AboutInfo {
  if (!json) return { ...fallback };
  try {
    const obj = JSON.parse(json) as Partial<AboutInfo>;
    const merged = { ...fallback, ...obj };
    if (!merged.photo) merged.photo = fallback.photo; // اگر عکس حذف شده، پیش‌فرض
    return merged;
  } catch {
    return { ...fallback };
  }
}

export function AboutView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const isAdmin = user.role === 'ADMIN';
  const [dev, setDev] = useState<AboutInfo>(DEFAULT_DEV);
  const [app, setApp] = useState<AboutInfo>(DEFAULT_APP);
  const [editOpen, setEditOpen] = useState<'dev' | 'app' | null>(null);
  const [form, setForm] = useState<AboutInfo>(DEFAULT_DEV);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>('/api/settings')
      .then((d) => {
        setDev(parseAbout(d.settings.aboutDev, DEFAULT_DEV));
        setApp(parseAbout(d.settings.aboutApp, DEFAULT_APP));
      })
      .catch(() => {});
  }, []);

  const openEdit = (which: 'dev' | 'app') => {
    setForm({ ...(which === 'dev' ? dev : app) });
    setEditOpen(which);
  };

  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, photo: dataUrl }));
      toast({ title: 'عکس انتخاب شد', description: 'پس از ذخیره اعمال می‌شود' });
    } catch {
      toast({ title: 'خطا', description: 'خواندن عکس ناموفق بود', variant: 'destructive' });
    }
  };

  const saveEdit = async () => {
    if (!editOpen) return;
    setSaving(true);
    const key = editOpen === 'dev' ? 'aboutDev' : 'aboutApp';
    const res = await apiSend('/api/settings', 'PUT', { settings: { [key]: JSON.stringify(form) } });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    if (editOpen === 'dev') setDev(form); else setApp(form);
    setEditOpen(null);
    toast({ title: 'معلومات ذخیره شد' });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader title="دربارهٔ اپلیکیشن و سازنده" subtitle="مکتب خصوصی نداالقلم — سیستم مدیریت تعلیمی" icon={GraduationCap} />

      {/* کارت سازنده */}
      <Card className="border-emerald-200 overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-gradient-to-l from-emerald-700 to-emerald-600 p-5 text-white flex items-center gap-4">
            <div className="relative h-20 w-20 rounded-full overflow-hidden border-4 border-white/30 shadow-lg shrink-0 bg-white">
              {dev.photo ? (
                <Image src={dev.photo} alt={`عکس ${dev.name}`} fill className="object-cover" unoptimized={dev.photo.startsWith('data:')} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-emerald-700">{dev.name.slice(0, 1)}</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">{dev.name}</p>
              <p className="text-sm text-emerald-100">{dev.title || 'توسعه‌دهندهٔ اپلیکیشن مدیریت مکتب خصوصی نداالقلم'}</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {dev.phone && (
              <a href={`tel:${dev.phone}`} className="flex items-center gap-2.5 rounded-lg border border-emerald-100 px-3 py-2.5 hover:bg-emerald-50 transition-colors">
                <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">شمارهٔ تماس</p>
                  <p dir="ltr" className="font-semibold text-emerald-900">{toPersianDigits(dev.phone)}</p>
                </div>
              </a>
            )}
            {dev.email && (
              <a href={`mailto:${dev.email}`} className="flex items-center gap-2.5 rounded-lg border border-emerald-100 px-3 py-2.5 hover:bg-emerald-50 transition-colors">
                <Mail className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">ایمیل</p>
                  <p dir="ltr" className="font-semibold text-emerald-900 text-xs truncate">{dev.email}</p>
                </div>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* دربارهٔ اپ */}
      <Card className="border-emerald-100">
        <CardContent className="p-5 space-y-4 text-sm leading-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
              <Code2 className="h-5 w-5" /> دربارهٔ اپلیکیشن
            </div>
            {isAdmin && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1 border-emerald-300 text-emerald-800" onClick={() => openEdit('app')}>
                  <Pencil className="h-3.5 w-3.5" /> ویرایش
                </Button>
              </div>
            )}
          </div>
          {app.photo && (
            <div className="relative w-full max-w-sm mx-auto h-40 rounded-xl overflow-hidden border border-emerald-100">
              <Image src={app.photo} alt={app.name} fill className="object-cover" unoptimized={app.photo.startsWith('data:')} />
            </div>
          )}
          <p className="whitespace-pre-wrap">{app.text}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <ShieldCheck className="h-4 w-4" /> نقش‌ها و دسترسی‌ها
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                مدیر (دسترسی کامل)، سرمعلم (نظارت و تایید نمرات)، معلم (حاضری و نمرات مضمون خود)،
                شاگرد و سرپرست (مشاهدهٔ نمرات و حاضری)، ملازم و کارمندان (وظایف)، کتابخانه‌دار (مدیریت امانت).
                مدیر می‌تواند هر کاربر را غیرفعال یا حذف کند تا دیگر نتواند وارد سیستم شود.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <Wifi className="h-4 w-4" /> آنلاین و آفلاین
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                اپ هم آنلاین و هم آفلاین کار می‌کند؛ داده‌های ثبت‌شده در حالت آفلاین در صف ذخیره شده و
                پس از وصل شدن به شبکه به‌صورت خودکار همگام می‌گردد. برای امنیت، با هر بار بازکردن اپ یا سایت، ورود مجدد لازم است.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <Printer className="h-4 w-4" /> چاپ و خروجی
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                جدول نتایج، کارنامه، گزارش حاضری و تقدیرنامه به‌صورت PDF (از طریق چاپ)، Word و Excel قابل استخراج است؛
                همهٔ تاریخ‌ها شمسی و رابط کاملاً فارسی و راست‌به‌چپ است.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <DatabaseBackup className="h-4 w-4" /> پشتیبان‌گیری
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                مدیر می‌تواند از تمام داده‌ها فایل پشتیبان (Backup) تهیه کند و تنها مدیر اجازهٔ بازیابی عمومی را دارد.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <Smartphone className="h-4 w-4" /> نصب روی گوشی (اندروید و آیفون)
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                <b className="text-emerald-800">اندروید:</b> فایل APK را از صفحهٔ انتشار (Releases) گیت‌هاب دانلود و نصب کنید.
                <b className="text-emerald-800"> آیفون (iOS):</b> سایت را با Safari باز کنید، دکمهٔ اشتراک (مربع با فلش به‌بالا) را بزنید و
                «Add to Home Screen / افزودن به صفحهٔ اصلی» را انتخاب کنید — اپ مثل یک برنامهٔ واقعی تمام‌صفحه با آیکون خودش نصب می‌شود و آفلاین هم کار می‌کند.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            نسخهٔ {app.version || '۱.۲'} — ساخته‌شده با محبت برای شاگردان و معلمان مکتب خصوصی نداالقلم{app.location ? `، ${app.location}` : ''}.
          </p>
        </CardContent>
      </Card>

      {/* دکمهٔ ویرایش اطلاعات سازنده — تنها مدیر */}
      {isAdmin && (
        <div className="flex justify-start">
          <Button variant="outline" className="gap-1.5 border-emerald-300 text-emerald-800" onClick={() => openEdit('dev')}>
            <Pencil className="h-4 w-4" /> ویرایش اطلاعات سازنده و عکس
          </Button>
        </div>
      )}

      {/* دیالوگ ویرایش */}
      <Dialog open={editOpen !== null} onOpenChange={(o) => !o && setEditOpen(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editOpen === 'dev' ? 'ویرایش اطلاعات سازنده' : 'ویرایش متن دربارهٔ اپ'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editOpen === 'dev' && (
              <>
                <Field label="نام"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="عنوان / توضیح کوتاه"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="شمارهٔ تماس"><Input dir="ltr" className="text-left" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                  <Field label="ایمیل"><Input dir="ltr" className="text-left" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                </div>
              </>
            )}
            {editOpen === 'app' && (
              <>
                <Field label="نسخه (مثال: ۱.۲)"><Input dir="ltr" className="text-left" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></Field>
                <Field label="موقعیت (ولایت/ولسوالی)"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
              </>
            )}
            <Field label={editOpen === 'dev' ? 'توضیحات (اختیاری)' : 'متن دربارهٔ اپلیکیشن'}>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </Field>
            <Field label="عکس (برای حذف عکس، دکمهٔ حذف را بزنید)">
              <div className="flex items-center gap-2">
                <Input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} />
                {form.photo && (
                  <Button variant="outline" size="sm" onClick={() => { setForm({ ...form, photo: null }); if (fileRef.current) fileRef.current.value = ''; }}>
                    حذف عکس
                  </Button>
                )}
              </div>
            </Field>
            {form.photo && (
              <div className="relative h-32 w-32 rounded-lg overflow-hidden border">
                <img src={form.photo} alt="پیش‌نمایش" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(null)}>انصراف</Button>
            <Button onClick={saveEdit} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره...' : 'ذخیره'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
