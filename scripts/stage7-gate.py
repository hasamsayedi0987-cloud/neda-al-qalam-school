#!/usr/bin/env python3
# مرحلهٔ ۷ — اتصال دروازهٔ QR به فایل‌های موجود:
# اسکیما (sqlite + postgres)، refactor لغو QR به کتابخانهٔ مشترک، بخش gate در دسترسی‌ها،
# ناوبری سه‌زبانه، شل اپ (آیکون/ایمپورت/رندر)، نسخهٔ ۳.۱۰.۰ و SW v22
import sys

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            if new in s:
                print(f'• {path}: قبلاً اعمال شده'); continue
            print(f'✗ NOT FOUND in {path}: {old[:70]!r}'); sys.exit(1)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    print(f'✓ {path}')

GATE_MODEL = '''
// ═══════════════ دروازهٔ ورود و خروج با QR کارت — نسخهٔ ۳.۱۰.۰ (مرحلهٔ ۷) ═══════════════

model GateLog {
  id          String   @id @default(cuid())
  studentId   String
  date        String   // تاریخ کابل YYYY-MM-DD — روزِ ثبت
  kind        String   // IN | OUT
  at          DateTime // ساعت دقیق اسکن
  byUserId    String?  // ثبت‌کنندهٔ اسکن (نگهبان/مدیر)
  byName      String?  // نام نمایشی ثبت‌کننده
  method      String   @default("QR") // QR | MANUAL
  clientToken String?  @unique // شناسهٔ یکتای هر اسکن — ضدتکرار اسکن دوباره و صف آفلاین
  createdAt   DateTime @default(now())

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@index([date])
  @@index([studentId, date])
}
'''

for schema in ['prisma/schema.prisma', 'prisma/schema.postgres.prisma']:
    edit(schema, [
        ('  smsMessages  SmsOutbox[]\n', '  smsMessages  SmsOutbox[]\n  gateLogs     GateLog[]\n'),
        ('// ═══════════════ تنظیمات (کلید-مقدار) ═══════════════',
         GATE_MODEL + '\n// ═══════════════ تنظیمات (کلید-مقدار) ═══════════════'),
    ])

# ─── refactor /api/qr — منبع مشترک لغو با /api/gate ───
edit('src/app/api/qr/route.ts', [
    ("""const REVOCATION_KEY = 'qrRevocations';
const MAX_ITEMS = 500;

type Revocations = Record<string, string>; // personId → زمان لغو (ISO)

async function readRevocations(): Promise<Revocations> {
  const row = await db.setting.findUnique({ where: { key: REVOCATION_KEY } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Revocations) : {};
  } catch {
    return {};
  }
}

async function writeRevocations(map: Revocations): Promise<void> {
  await db.setting.upsert({
    where: { key: REVOCATION_KEY },
    update: { value: JSON.stringify(map) },
    create: { key: REVOCATION_KEY, value: JSON.stringify(map) },
  });
}""",
     """const MAX_ITEMS = 500;"""),
    ("import { handleApiError, str } from '@/lib/api-helpers';",
     "import { handleApiError, str } from '@/lib/api-helpers';\nimport { isRevoked, readRevocations, writeRevocations } from '@/lib/qr-revoke';"),
    ("""    // لغو — توکن‌های صادرشده پیش از زمان لغو پذیرفته نمی‌شوند
    const revs = await readRevocations();
    const revokedAt = revs[data.id];
    if (revokedAt && Math.floor(new Date(revokedAt).getTime() / 1000) >= data.iat) {
      throw new ApiError('این کد QR توسط ادارهٔ مکتب لغو شده است', 410);
    }""",
     """    // لغو — توکن‌های صادرشده پیش از زمان لغو پذیرفته نمی‌شوند (منبع مشترک با /api/gate)
    if (await isRevoked(data.id, data.iat)) {
      throw new ApiError('این کد QR توسط ادارهٔ مکتب لغو شده است', 410);
    }"""),
])

# ─── بخش دروازه در دسترسی‌ها (نگهبان = کارمند STAFF) ───
edit('src/lib/access.ts', [
    ("""  activities: {
    label: 'فعالیت شاگردان',""",
     """  gate: {
    label: 'دروازهٔ ورود و خروج (QR)',
    roles: ['ADMIN', 'HEADTEACHER', 'STAFF'],
    manageable: true,
    hint: 'اسکن QR کارت هویت در دروازه — ثبت ورود/خروج با ساعت دقیق، اعلان والدین، تاریخچهٔ رفت‌وآمد و لغو کارت گم‌شده',
  },
  activities: {
    label: 'فعالیت شاگردان',"""),
])

# ─── ناوبری سه‌زبانه ───
s = open('src/lib/i18n-nav.ts', encoding='utf-8').read()
first = s.find("  attendance:")
if first == -1:
    print('✗ NAV_PS attendance یافت نشد'); sys.exit(1)
end1 = s.find('\n', first) + 1
s = s[:end1] + "  gate: 'د دروازې ننوتل/وتل (QR)',\n" + s[end1:]
second = s.find("  attendance:", end1)
if second == -1:
    print('✗ NAV_EN attendance یافت نشد'); sys.exit(1)
end2 = s.find('\n', second) + 1
s = s[:end2] + "  gate: 'Gate Entry/Exit (QR)',\n" + s[end2:]
open('src/lib/i18n-nav.ts', 'w', encoding='utf-8').write(s)
print('✓ src/lib/i18n-nav.ts')

# ─── شل اپ ───
edit('src/components/app/app-shell.tsx', [
    ("} from 'lucide-react';", "  DoorOpen,\n} from 'lucide-react';"),
    ("  attendance: CalendarCheck,", "  attendance: CalendarCheck,\n  gate: DoorOpen,"),
    ("const IdCardsView = dynamic(() => import('./id-cards-view').then((m) => m.IdCardsView), { loading: () => <ViewSkeleton /> });",
     "const IdCardsView = dynamic(() => import('./id-cards-view').then((m) => m.IdCardsView), { loading: () => <ViewSkeleton /> });\n// نسخهٔ ۳.۱۰.۰ — دروازهٔ ورود و خروج با اسکن QR کارت\nconst GateView = dynamic(() => import('./gate-view').then((m) => m.GateView), { loading: () => <ViewSkeleton /> });"),
    ("{view === 'attendance' && <AttendanceView user={user} />}",
     "{view === 'attendance' && <AttendanceView user={user} />}\n          {view === 'gate' && <GateView user={user} />}"),
])

# ─── نسخه و سرویس‌ورکر ───
edit('src/lib/version.ts', [
    ("export const APP_VERSION = '3.9.0';", "export const APP_VERSION = '3.10.0';"),
    ("export const APP_VERSION_FA = '۳.۹.۰';", "export const APP_VERSION_FA = '۳.۱۰.۰';"),
])
edit('public/sw.js', [("const VERSION = 'v21';", "const VERSION = 'v22';")])
print('✓ همهٔ تغییرات مرحلهٔ ۷ اعمال شد')
