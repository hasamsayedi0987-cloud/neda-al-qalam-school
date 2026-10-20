'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, LoadingBlock, Field } from './ui-bits';
import { apiGet, apiSend } from '@/lib/client/api';
import { toPersianDigits, isoToJalaliDisplay, isoToday } from '@/lib/jalali';
import { useToast } from '@/hooks/use-toast';
import { Award, Printer, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import type { SessionUser, StudentInfo, TeacherInfo } from '@/lib/types';

export interface CertConfig {
  title: string;
  subtitle: string;
  body: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  borderStyle: string;
  borderWidth: number;
  borderColor: string;
  fontFamily: string;
  titleSize: number;
  bodySize: number;
  showLogo: boolean;
  logoSize: number;
  showDate: boolean;
  showSignature: boolean;
  signatureName: string;
  dateText: string;
}

export interface CertTemplate {
  id: string;
  name: string;
  config: CertConfig;
}

const DEFAULT_CONFIG: CertConfig = {
  title: 'تقدیرنامه',
  subtitle: 'مکتب خصوصی نداالقلم',
  body: 'بدین‌وسیله از شاگرد محترم {نام} صنف {صنف} به سبب {علت} قدردانی و تقدیر می‌گردد. امید است با تلاش بیشتر، موفقیت‌های بعدی را رقم بزند.',
  bgColor: '#f0fdf4',
  textColor: '#064e3b',
  accentColor: '#047857',
  borderStyle: 'double',
  borderWidth: 6,
  borderColor: '#047857',
  fontFamily: 'Vazirmatn',
  titleSize: 34,
  bodySize: 17,
  showLogo: true,
  logoSize: 84,
  showDate: true,
  showSignature: true,
  signatureName: 'مدیر مکتب',
  dateText: '',
};

const BORDER_STYLES = [
  { value: 'solid', label: 'خط ساده' },
  { value: 'double', label: 'خط دوگانه' },
  { value: 'dashed', label: 'خط چین' },
  { value: 'dotted', label: 'نقطه‌چین' },
  { value: 'none', label: 'بدون خط' },
];

const FONT_OPTIONS = [
  { value: 'Vazirmatn', label: 'وزیرمتن' },
  { value: 'serif', label: 'نستعلیق‌گونه (سریف)' },
  { value: 'sans-serif', label: 'ساده (سنس)' },
];

export function CertificatesView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const canEdit = user.role === 'ADMIN' || user.role === 'HEADTEACHER';
  const [templates, setTemplates] = useState<CertTemplate[]>([]);
  const [active, setActive] = useState<CertTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // گیرنده
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [receiverType, setReceiverType] = useState<'student' | 'teacher' | 'manual'>('student');
  const [studentId, setStudentId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [manualName, setManualName] = useState('');
  const [reason, setReason] = useState('موفقیت‌های برجستهٔ تعلیمی');

  const [nameOpen, setNameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ templates: CertTemplate[] }>('/api/certificates');
      setTemplates(d.templates);
      setActive((cur) => cur || d.templates[0] || { id: '', name: 'پیش‌نویس', config: { ...DEFAULT_CONFIG } });
    } catch {
      setActive({ id: '', name: 'پیش‌نویس', config: { ...DEFAULT_CONFIG } });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    apiGet<{ students: StudentInfo[] }>('/api/students')
      .then((d) => setStudents(d.students || []))
      .catch(() => {});
    apiGet<{ teachers: TeacherInfo[] }>('/api/teachers')
      .then((d) => setTeachers(d.teachers || []))
      .catch(() => {});
  }, [load]);

  const setCfg = (patch: Partial<CertConfig>) => {
    setActive((t) => (t ? { ...t, config: { ...t.config, ...patch } } : t));
  };

  const receiverName = () => {
    if (receiverType === 'student') {
      const s = students.find((x) => x.id === studentId);
      return s ? `${s.firstName} ${s.lastName}` : '{نام}';
    }
    if (receiverType === 'teacher') {
      const t = teachers.find((x) => x.id === teacherId);
      return t ? t.name : '{نام}';
    }
    return manualName.trim() || '{نام}';
  };

  const receiverClass = () => {
    if (receiverType === 'student') {
      const s = students.find((x) => x.id === studentId);
      return (s as { className?: string | null })?.className || '';
    }
    return '';
  };

  const fillBody = () => {
    return (active?.config.body || '')
      .replaceAll('{نام}', receiverName())
      .replaceAll('{صنف}', receiverClass())
      .replaceAll('{علت}', reason.trim() || 'تلاش و موفقیت');
  };

  const saveTemplate = async () => {
    if (!active) return;
    setSaving(true);
    const res = active.id
      ? await apiSend('/api/certificates', 'PATCH', { id: active.id, name: active.name, config: active.config })
      : await apiSend('/api/certificates', 'POST', { name: active.name, config: active.config });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'قالب ذخیره شد' });
    load();
  };

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await apiSend('/api/certificates', 'POST', { name: newName.trim(), config: active?.config });
    setSaving(false);
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setNameOpen(false);
    setNewName('');
    toast({ title: 'قالب جدید ساخته شد' });
    load();
  };

  const deleteTemplate = async (t: CertTemplate) => {
    if (!confirm(`قالب «${t.name}» حذف شود؟`)) return;
    const res = await apiSend(`/api/certificates?id=${t.id}`, 'DELETE');
    if (res.error) {
      toast({ title: 'خطا', description: res.error, variant: 'destructive' });
      return;
    }
    setActive(null);
    toast({ title: 'قالب حذف شد' });
    load();
  };

  const printCertificate = () => {
    window.print();
  };

  if (loading) return <LoadingBlock label="در حال بارگذاری تقدیرنامه‌ها..." />;
  if (!active) return null;

  const cfg = active.config;
  const today = isoToJalaliDisplay(isoToday());

  return (
    <div className="space-y-5">
      <PageHeader title="تقدیرنامه‌ساز" subtitle="طرح ورق A4 با رنگ، خط، استایل و متن دلخواه" icon={Award} />

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
        {/* پنل طراحی */}
        <div className="space-y-4 print:hidden">
          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900">قالب‌ها</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActive(t)}
                    className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                      t.id === active.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={() => setNameOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> قالب جدید
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300" onClick={saveTemplate} disabled={saving}>
                      <Save className="h-3.5 w-3.5" /> {active.id ? 'به‌روزرسانی قالب' : 'ذخیرهٔ قالب'}
                    </Button>
                    {active.id && (
                      <Button size="sm" variant="outline" className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => deleteTemplate(active)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
                <Wand2 className="h-4 w-4" /> طراحی ورق
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="عنوان بالای ورق"><Input value={cfg.title} onChange={(e) => setCfg({ title: e.target.value })} /></Field>
                <Field label="زیرعنوان (نام مکتب)"><Input value={cfg.subtitle} onChange={(e) => setCfg({ subtitle: e.target.value })} /></Field>
              </div>
              <Field label="متن تقدیرنامه — از {نام} {صنف} {علت} استفاده کنید">
                <textarea
                  className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm leading-7"
                  value={cfg.body}
                  onChange={(e) => setCfg({ body: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="رنگ پس‌زمینه">
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.bgColor} onChange={(e) => setCfg({ bgColor: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" aria-label="رنگ پس‌زمینه" />
                    <Input dir="ltr" className="text-left text-xs" value={cfg.bgColor} onChange={(e) => setCfg({ bgColor: e.target.value })} />
                  </div>
                </Field>
                <Field label="رنگ متن">
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.textColor} onChange={(e) => setCfg({ textColor: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" aria-label="رنگ متن" />
                    <Input dir="ltr" className="text-left text-xs" value={cfg.textColor} onChange={(e) => setCfg({ textColor: e.target.value })} />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="رنگ خط و تزئینات">
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.accentColor} onChange={(e) => setCfg({ accentColor: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" aria-label="رنگ تزئینات" />
                    <Input dir="ltr" className="text-left text-xs" value={cfg.accentColor} onChange={(e) => setCfg({ accentColor: e.target.value })} />
                  </div>
                </Field>
                <Field label="رنگ قاب">
                  <div className="flex items-center gap-2">
                    <input type="color" value={cfg.borderColor} onChange={(e) => setCfg({ borderColor: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" aria-label="رنگ قاب" />
                    <Input dir="ltr" className="text-left text-xs" value={cfg.borderColor} onChange={(e) => setCfg({ borderColor: e.target.value })} />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="استایل قاب">
                  <Select value={cfg.borderStyle} onValueChange={(v) => setCfg({ borderStyle: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BORDER_STYLES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="ضخامت قاب">
                  <Input dir="ltr" type="number" min={0} max={20} className="text-left" value={cfg.borderWidth} onChange={(e) => setCfg({ borderWidth: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="نوع خط">
                  <Select value={cfg.fontFamily} onValueChange={(v) => setCfg({ fontFamily: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="اندازهٔ عنوان">
                  <Input dir="ltr" type="number" min={18} max={60} className="text-left" value={cfg.titleSize} onChange={(e) => setCfg({ titleSize: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.showLogo} onChange={(e) => setCfg({ showLogo: e.target.checked })} />
                  نمایش لوگوی مکتب
                </label>
                {cfg.showLogo && (
                  <Field label="اندازهٔ لوگو">
                    <Input dir="ltr" type="number" min={40} max={160} className="text-left" value={cfg.logoSize} onChange={(e) => setCfg({ logoSize: Number(e.target.value) })} />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.showDate} onChange={(e) => setCfg({ showDate: e.target.checked })} />
                  نمایش تاریخ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cfg.showSignature} onChange={(e) => setCfg({ showSignature: e.target.checked })} />
                  نمایش امضا
                </label>
              </div>
              {cfg.showSignature && (
                <Field label="عنوان امضاکننده"><Input value={cfg.signatureName} onChange={(e) => setCfg({ signatureName: e.target.value })} /></Field>
              )}
              {cfg.showDate && (
                <Field label="تاریخ (خالی = امروز)">
                  <Input placeholder={today} value={cfg.dateText} onChange={(e) => setCfg({ dateText: e.target.value })} />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-emerald-900">گیرنده</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={receiverType} onValueChange={(v) => setReceiverType(v as 'student' | 'teacher' | 'manual')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">شاگرد</SelectItem>
                  <SelectItem value="teacher">معلم / کارمند</SelectItem>
                  <SelectItem value="manual">نام دستی</SelectItem>
                </SelectContent>
              </Select>
              {receiverType === 'student' && (
                <Select value={studentId || undefined} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="شاگرد را انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} {s.className ? `— ${s.className}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {receiverType === 'teacher' && (
                <Select value={teacherId || undefined} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="معلم/کارمند را انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} — {t.position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {receiverType === 'manual' && (
                <Field label="نام گیرنده"><Input value={manualName} onChange={(e) => setManualName(e.target.value)} /></Field>
              )}
              <Field label="علت تقدیر ({علت})">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button onClick={printCertificate} className="w-full gap-1.5 h-11">
                <Printer className="h-5 w-5" /> چاپ / ذخیره PDF (A4)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* پیش‌نمایش A4 */}
        <div className="print:hidden">
          <p className="text-xs text-muted-foreground mb-2">پیش‌نمایش ورق A4 (۲۱۰×۲۹۷ میلی‌متر)</p>
          <div className="rounded-lg border bg-slate-100 p-4 overflow-auto">
            <div
              className="cert-sheet mx-auto shadow-xl"
              style={{
                width: 420,
                height: 594,
                background: cfg.bgColor,
                color: cfg.textColor,
                fontFamily: cfg.fontFamily === 'serif' ? 'Georgia, serif' : cfg.fontFamily === 'sans-serif' ? 'sans-serif' : `'${cfg.fontFamily}', sans-serif`,
                border: `${cfg.borderWidth}px ${cfg.borderStyle} ${cfg.borderColor}`,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div style={{ width: '100%', borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: 8, marginBottom: 10 }}>
                <p style={{ fontSize: cfg.titleSize, fontWeight: 700, margin: 0 }}>{cfg.title}</p>
                <p style={{ fontSize: 14, opacity: 0.85, margin: '4px 0 0' }}>{cfg.subtitle}</p>
              </div>
              {cfg.showLogo && (
                <img src="/logo.png" alt="لوگو" style={{ width: cfg.logoSize, height: cfg.logoSize, objectFit: 'contain', margin: '10px 0' }} />
              )}
              <p style={{ fontSize: cfg.bodySize, lineHeight: 2.1, margin: '14px 12px', whiteSpace: 'pre-wrap' }}>
                {fillBody()}
              </p>
              <div style={{ flex: 1 }} />
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 8px' }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{cfg.showDate ? (cfg.dateText || today) : ''}</span>
                <div style={{ textAlign: 'center' }}>
                  {cfg.showSignature && (
                    <>
                      <div style={{ width: 110, borderTop: `1.5px solid ${cfg.accentColor}`, marginBottom: 4 }} />
                      <span style={{ fontSize: 12 }}>{cfg.signatureName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ورق چاپ */}
      <div id="cert-print-root" className="hidden print:block">
        <div
          style={{
            width: '210mm',
            minHeight: '296mm',
            background: cfg.bgColor,
            color: cfg.textColor,
            fontFamily: cfg.fontFamily === 'serif' ? 'Georgia, serif' : cfg.fontFamily === 'sans-serif' ? 'sans-serif' : `'${cfg.fontFamily}', sans-serif`,
            border: `${cfg.borderWidth}mm/3.8 ${cfg.borderStyle} ${cfg.borderColor}`.replace('mm/3.8', `px ${cfg.borderStyle}`),
            padding: '18mm 16mm',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ width: '100%', borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: '6mm', marginBottom: '6mm' }}>
            <p style={{ fontSize: `${cfg.titleSize}pt`, fontWeight: 700, margin: 0 }}>{cfg.title}</p>
            <p style={{ fontSize: 12, opacity: 0.85, margin: '3mm 0 0' }}>{cfg.subtitle}</p>
          </div>
          {cfg.showLogo && (
            <img src="/logo.png" alt="لوگو" style={{ width: `${cfg.logoSize}px`, height: `${cfg.logoSize}px`, objectFit: 'contain', margin: '8mm 0' }} />
          )}
          <p style={{ fontSize: `${cfg.bodySize}pt`, lineHeight: 2.2, margin: '10mm 8mm', whiteSpace: 'pre-wrap' }}>
            {fillBody()}
          </p>
          <div style={{ flex: 1 }} />
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 6mm' }}>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{cfg.showDate ? (cfg.dateText || today) : ''}</span>
            <div style={{ textAlign: 'center' }}>
              {cfg.showSignature && (
                <>
                  <div style={{ width: '40mm', borderTop: `1.5px solid ${cfg.accentColor}`, marginBottom: '2mm' }} />
                  <span style={{ fontSize: 10 }}>{cfg.signatureName}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* دیالوگ نام قالب */}
      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>قالب جدید</DialogTitle></DialogHeader>
          <Field label="نام قالب (مثال: تقدیر معلمان)">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameOpen(false)}>انصراف</Button>
            <Button onClick={createTemplate} disabled={saving}>ساخت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
