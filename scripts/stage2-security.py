#!/usr/bin/env python3
# مرحلهٔ ۲ امنیت — توکن QR + حذف اطلاعات شخصی + safeImg + دکمهٔ لغو
import re, sys

def edit(path, pairs, must=True):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            if must:
                print(f'✗ NOT FOUND in {path}: {old[:70]!r}'); sys.exit(1)
            continue
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path}')

# ─── ۱) auth.ts — توکن امضاشدهٔ QR (HMAC با کلید نشست) ───
QR_LIB = '''

/* ═══════════ امنیت QR کارت‌ها — توکن امضاشده و قابل لغو (مرحلهٔ ۲) ═══════════
 * QR کارت هرگز اطلاعات شخصی (نام/ولد/صنف) حمل نمی‌کند؛ فقط یک توکن تصادفیِ
 * امضاشده با کلید نشست است که تنها سرور می‌تواند آن را بازکند. لغو با ثبت
 * زمان لغو به‌ازای هر شخص در Setting(qrRevocations) انجام می‌شود: هر توکنی که
 * پیش از زمان لغو صادر شده باشد دیگر پذیرفته نمی‌شود؛ چاپ مجدد، توکن تازه می‌سازد. */
export interface QrTokenData {
  kind: 'student' | 'staff';
  id: string;
  iat: number; // ثانیهٔ یونیکس — مبنای مقایسه با زمان لغو
}

const QR_SIGN_CONTEXT = '|noq-qr-v1';

export async function issueQrToken(kind: 'student' | 'staff', id: string): Promise<string> {
  if (!id) throw new ApiError('شناسه شخص لازم است');
  const secret = await getAuthSecret();
  const iat = Math.floor(Date.now() / 1000);
  const jti = randomBytes(6).toString('hex');
  const body = Buffer.from(JSON.stringify({ k: kind === 'staff' ? 's' : 't', id, iat, jti }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret + QR_SIGN_CONTEXT).update(body).digest('base64url').slice(0, 24);
  return `NOQ1.${body}.${sig}`;
}

export async function verifyQrToken(token: string): Promise<QrTokenData | null> {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'NOQ1' || !parts[1] || !parts[2]) return null;
    const secret = await getAuthSecret();
    const expected = createHmac('sha256', secret + QR_SIGN_CONTEXT).update(parts[1]).digest('base64url').slice(0, 24);
    const a = Buffer.from(parts[2], 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { k?: string; id?: string; iat?: number };
    if (typeof p.id !== 'string' || !p.id || typeof p.iat !== 'number' || !Number.isFinite(p.iat)) return null;
    return { kind: p.k === 's' ? 'staff' : 'student', id: p.id, iat: p.iat };
  } catch {
    return null;
  }
}
'''
s = open('src/lib/auth.ts', encoding='utf-8').read()
if 'issueQrToken' not in s:
    if not s.endswith('\n'):
        s += '\n'
    s += QR_LIB
    open('src/lib/auth.ts', 'w', encoding='utf-8').write(s)
    print('✓ src/lib/auth.ts (توکن QR)')
else:
    print('• auth.ts قبلاً ویرایش شده')

# ─── ۲) id-cards.ts — QR بدون اطلاعات شخصی + safeImg + توکن از سرور ───
edit('src/lib/client/id-cards.ts', [
  (
    "import { printRawHtml } from './exports';",
    "import { printRawHtml } from './exports';\nimport { apiSend } from '@/lib/client/api';"
  ),
  (
    """/* ─── محتوای QR — متن ساخت‌یافتهٔ قابل خواندن پس از اسکن ─── */

export function idCardQrPayload(c: IdCardData, school: IdCardSchoolInfo): string {
  const base = `مکتب: ${school.name}`;
  if (c.kind === 'student') {
    return `${base} | شاگرد: ${c.name} | ولد: ${c.father} | صنف: ${c.line1} | شمارهٔ کارت: ${c.cardNo}${school.issueDate ? ` | صدور: ${school.issueDate}` : ''} | شناسه: ${c.id}`;
  }
  return `${base} | کارمند: ${c.name} | وظیفه: ${c.line1} | شمارهٔ کارت: ${c.cardNo} | شناسه: ${c.id}`;
}""",
    """/* ─── محتوای QR — امنیت مرحلهٔ ۲ ───
 * QR هرگز اطلاعات شخصی (نام/ولد/صنف) حمل نمی‌کند؛ توکن امضاشدهٔ سرور است که فقط
 * از طریق /api/qr پس از اعتبارسنجی سمت سرور به اطلاعات محدود می‌رسد.
 * در نبود توکن (آفلاین) فقط شمارهٔ سریال کارت — که روی خود کارت چاپ شده — قرار می‌گیرد. */
export function idCardQrPayload(c: IdCardData): string {
  return `NOQ-CARD:${c.cardNo}`;
}

/** گرفتن توکن‌های امن QR از سرور — ناکامی (آفلاین) → undefined و fallback به شمارهٔ کارت */
export async function fetchIdCardTokens(cards: IdCardData[]): Promise<Map<string, string> | undefined> {
  try {
    const items = cards.slice(0, 500).map((c) => ({ kind: c.kind, id: c.id }));
    const res = await apiSend<{ tokens: Record<string, string> }>('/api/qr', 'POST', { action: 'issue', items });
    const tokens = res?.tokens || {};
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(tokens)) if (typeof v === 'string' && v) map.set(k, v);
    return map.size ? map : undefined;
  } catch {
    return undefined;
  }
}

/** امنیت — فقط dataURL تصویر معتبر وارد قالب چاپ می‌شود (ضد تزریق در src) */
const IMG_DATA_RE = /^data:image\\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function safeImg(v: string | null | undefined, max = 600_000): string {
  if (!v) return '';
  const s = v.trim();
  return s.length <= max && IMG_DATA_RE.test(s) ? s : '';
}"""
  ),
  (
    """  const photo = c.photo
    ? `<img src="${c.photo}" alt=""/>`
    : `<div class="initial">${esc(c.name.trim().charAt(0) || '؟')}</div>`;""",
    """  const photoSrc = safeImg(c.photo);
  const photo = photoSrc
    ? `<img src="${photoSrc}" alt=""/>`
    : `<div class="initial">${esc(c.name.trim().charAt(0) || '؟')}</div>`;
  const logoSrc = safeImg(school.logo);"""
  ),
  (
    '    <img class="logo" src="${school.logo}" alt=""/>',
    '    ${logoSrc ? `<img class="logo" src="${logoSrc}" alt=""/>` : \'<div class="logo"></div>\'}'
  ),
  (
    """export async function buildIdCardsSheet(
  cards: IdCardData[],
  school: IdCardSchoolInfo,
): Promise<string> {""",
    """export async function buildIdCardsSheet(
  cards: IdCardData[],
  school: IdCardSchoolInfo,
  qrTokens?: Map<string, string>,
): Promise<string> {
  if (!qrTokens) qrTokens = await fetchIdCardTokens(cards);"""
  ),
  (
    '      const qr = await idCardQrDataUrl(idCardQrPayload(c, school));',
    '      const qr = await idCardQrDataUrl(qrTokens?.get(`${c.kind}:${c.id}`) || idCardQrPayload(c));'
  ),
])

# ─── ۳) id-cards-view.tsx — دکمهٔ لغو/بازگردانی QR ───
s = open('src/components/app/id-cards-view.tsx', encoding='utf-8').read()
if 'revokeQr' not in s:
    m = re.search(r"import \{([^}]*)\} from 'lucide-react';", s)
    assert m, 'lucide import'
    if 'ShieldOff' not in m.group(1):
        s = s.replace(m.group(0), "import { " + m.group(1).rstrip() + ", ShieldOff, ShieldCheck } from 'lucide-react';")
    m2 = re.search(r"import \{([^}]*)\} from '@/lib/client/api';", s)
    if m2:
        if 'apiSend' not in m2.group(1):
            s = s.replace(m2.group(0), "import {" + m2.group(1).rstrip() + ", apiSend } from '@/lib/client/api';")
    else:
        s = s.replace("import { toPersianDigits, jalaliNowDisplay } from '@/lib/jalali';",
                      "import { toPersianDigits, jalaliNowDisplay } from '@/lib/jalali';\nimport { apiSend } from '@/lib/client/api';")
    anchor = '  const makePreview = useCallback(async () => {'
    assert anchor in s, 'makePreview anchor'
    handlers = '''  /** لغو/بازگردانی توکن QR کارت‌های انتخاب‌شده — کدهای چاپ‌شدهٔ قبلی بی‌اعتبار می‌شوند */
  const revokeQr = async (restore: boolean) => {
    if (!cards.length) return;
    const what = restore ? 'بازگردانی' : 'لغو';
    if (!window.confirm(`${what} کد QR کارت‌های انتخاب‌شده (${toPersianDigits(cards.length)} کارت) — تأیید می‌کنید؟\\nپس از لغو، کدهای چاپ‌شدهٔ قبلی دیگر معتبر نیستند؛ برای کارت جدید دوباره چاپ کنید.`)) return;
    setBusy(true);
    try {
      for (const c of cards) {
        await apiSend('/api/qr', 'POST', { action: restore ? 'restore' : 'revoke', kind: c.kind, id: c.id });
      }
      toast({ title: `${what} کد QR برای ${toPersianDigits(cards.length)} کارت انجام شد` });
    } catch {
      toast({ title: 'عملیات ناکام شد — با انترنت دوباره کوشش کنید', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

'''
    s = s.replace(anchor, handlers + anchor)
    btn_anchor = '''              <Button size="sm" variant="outline" disabled={!cards.length || busy} onClick={doPrint}>
                <Printer className="h-4 w-4 ms-1" /> چاپ (PDF)
              </Button>'''
    assert btn_anchor in s, 'button anchor'
    s = s.replace(btn_anchor, btn_anchor + '''
              <Button size="sm" variant="ghost" disabled={!cards.length || busy} onClick={() => revokeQr(false)}>
                <ShieldOff className="h-4 w-4 ms-1" /> لغو QR
              </Button>
              <Button size="sm" variant="ghost" disabled={!cards.length || busy} onClick={() => revokeQr(true)}>
                <ShieldCheck className="h-4 w-4 ms-1" /> بازگردانی QR
              </Button>''')
    open('src/components/app/id-cards-view.tsx', 'w', encoding='utf-8').write(s)
    print('✓ id-cards-view.tsx (لغو/بازگردانی)')
else:
    print('• view قبلاً ویرایش شده')

# ─── ۴) SW v18 + نسخهٔ ۳.۸.۱ ───
edit('public/sw.js', [("const VERSION = 'v17';", "const VERSION = 'v18';")])
edit('src/lib/version.ts', [
  ("export const APP_VERSION = '3.8.0';", "export const APP_VERSION = '3.8.1';"),
  ("export const APP_VERSION_FA = '۳.۸.۰';", "export const APP_VERSION_FA = '۳.۸.۱';"),
])
print('✓ همهٔ تغییرات مرحلهٔ ۲ اعمال شد')
