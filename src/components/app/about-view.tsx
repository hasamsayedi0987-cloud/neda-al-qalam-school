'use client';

import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from './ui-bits';
import { toPersianDigits } from '@/lib/jalali';
import { GraduationCap, Phone, Mail, Code2, ShieldCheck, Wifi, DatabaseBackup, Printer } from 'lucide-react';

export function AboutView() {
  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader title="دربارهٔ اپلیکیشن و سازنده" subtitle="مکتب خصوصی نداالقلم — سیستم مدیریت تعلیمی" icon={GraduationCap} />

      {/* کارت سازنده */}
      <Card className="border-emerald-200 overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-gradient-to-l from-emerald-700 to-emerald-600 p-5 text-white flex items-center gap-4">
            <div className="relative h-20 w-20 rounded-full overflow-hidden border-4 border-white/30 shadow-lg shrink-0 bg-white">
              <Image src="/dev-photo.png" alt="عکس سازندهٔ اپ — حسام الدین سیدی" fill className="object-cover" />
            </div>
            <div>
              <p className="text-lg font-bold">حسام الدین سیدی</p>
              <p className="text-sm text-emerald-100">توسعه‌دهندهٔ اپلیکیشن مدیریت مکتب خصوصی نداالقلم</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <a href="tel:0791680632" className="flex items-center gap-2.5 rounded-lg border border-emerald-100 px-3 py-2.5 hover:bg-emerald-50 transition-colors">
              <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">شمارهٔ تماس</p>
                <p dir="ltr" className="font-semibold text-emerald-900">{toPersianDigits('0791680632')}</p>
              </div>
            </a>
            <a href="mailto:hasamsayedi0987@gmail.com" className="flex items-center gap-2.5 rounded-lg border border-emerald-100 px-3 py-2.5 hover:bg-emerald-50 transition-colors">
              <Mail className="h-4 w-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">ایمیل</p>
                <p dir="ltr" className="font-semibold text-emerald-900 text-xs truncate">hasamsayedi0987@gmail.com</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* دربارهٔ اپ */}
      <Card className="border-emerald-100">
        <CardContent className="p-5 space-y-4 text-sm leading-7">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
            <Code2 className="h-5 w-5" /> دربارهٔ اپلیکیشن
          </div>
          <p>
            این اپلیکیشن برای مدیریت کامل امور تعلیمی <b>مکتب خصوصی نداالقلم</b> طراحی شده است؛ از ثبت‌نام شاگردان صنف اول تا دوازدهم،
            مدیریت مضامین و معلمان گرفته تا ثبت نمرات چهارو‌نیم‌ماهه و سالانه، حاضری یومیه، فعالیت‌های روزمرهٔ شاگردان و مدیریت کتابخانه.
            نمرات ثبت‌شده به‌صورت <b>خودکار</b> در جدول نتایج هر صنف منعکس می‌شود و مجموع، اوسط (تا دو رقم اعشار)، رتبهٔ در صنف و
            نتیجهٔ نهایی (ارتقا یا تکرار صنف) بدون دخالت دستی محاسبه می‌گردد.
          </p>
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
                پس از وصل شدن به شبکه به‌صورت خودکار همگام می‌گردد. اپ را می‌توان مانند برنامهٔ موبایل نصب کرد.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[13px]">
                <Printer className="h-4 w-4" /> چاپ و خروجی
              </p>
              <p className="text-xs text-muted-foreground leading-6 mt-1">
                جدول نتایج، کارنامه و گزارش حاضری به‌صورت PDF (از طریق چاپ)، Word و Excel قابل استخراج است؛
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
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <p className="font-semibold text-emerald-800 text-[13px]">مقیاس نمرات و مکتسبه</p>
            <p className="text-xs text-muted-foreground leading-6 mt-1">
              الف: ۹۰ تا ۱۰۰ | ب: ۸۰ تا ۹۰ | ج: ۷۰ تا ۸۰ | د: ۶۰ تا ۷۰ | هـ: ۵۰ تا ۶۰ | زیر ۵۰: تکرار صنف
              — نمرهٔ نهائی هر مضمون میانگین نمرهٔ چهارو‌نیم‌ماهه و سالانه است.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            نسخهٔ ۱.۰.۰ — ساخته‌شده با محبت برای شاگردان و معلمان مکتب خصوصی نداالقلم، ولایت بدخشان، ولسوالی بهارک.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
