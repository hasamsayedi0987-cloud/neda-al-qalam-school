/**
 * تولید «جدول نتایج سالانهٔ وزارت معارف» — دقیقاً بر پایهٔ فایل اصلی رسمی (نسخهٔ ۱۴۰۵)
 *
 * روش: پچ مستقیم XML داخل فایل قالب (بدون بازنویسی با کتابخانه) تا
 * ساختار، قالب‌بندی، ادغام حجره‌ها، قالب‌بندی شرطی، اعتبارسنجی‌ها، عرض ستون‌ها و
 * تنظیمات چاپ فایل اصلی «بایت‌به‌بایت» حفظ شود. فقط دو شیت «لیست» و «جدول نتایج»
 * مقداردهی می‌شوند؛ سایر ۷ شیت (شقه‌ها، اطلاع‌نامه، خلص، فهرست، پوش) با فرمول‌های
 * خودشان از این دو شیت تغذیه می‌شوند و خودکار زنده می‌گردند.
 *
 * ظرفیت قالب: ۸۱ شاگرد (بلوک‌های ۴ ستونی + ستون تائید بعد از هر ۳ شاگرد)
 * ساختار جدول: مضامین در سطرهای ۱۳–۳۳ (۲۱ مضمون)، هر شاگرد:
 *   [چهارونیم‌ماهه][سالانه][نمرات نهائی=فرمول][ملاحظات]
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export interface MoeStudentRow {
  id?: string; // شناسهٔ شاگرد — کلید نگاشت حاضری
  firstName: string;
  lastName?: string | null;
  fatherName: string;
  grandFather?: string | null;
  idNumber?: string | null;
  baseNumber?: string | null; // نمبر اساس وزارت معارف — ستون E لیست (نسخهٔ ۳.۵.۱)
  marks: Array<{ subject: string; midterm: number | null; annual: number | null }>;
}

/** شمار حاضری یک شاگرد در یک پنجرهٔ زمانی (چهارونیم‌ماهه یا سالانه) */
export interface MoeAttendanceCount {
  days: number; // ایام سال تعلیمی — روزهای ثبت‌حاضری صنف
  present: number;
  absent: number;
  sick: number;
  leave: number;
}

export interface MoeWorkbookInput {
  className: string;
  teacherName?: string | null; // نگران صنف
  schoolName: string;
  directorateLine?: string | null; // ریاست معارف ولایت/آمریت حوزه
  province?: string | null; // ولایت — جایگزین ریاست معارف در نبود خط سربرگ
  academicYear?: string | null; // مثلاً ۱۴۰۵
  students: MoeStudentRow[];
  subjects: string[]; // نام مضامین صنف از دیتابیس
  /** حاضری یومیه از سیستم: studentId → {mid: چهارونیم‌ماهه, annual: سالانه} (نسخهٔ ۳.۵.۱) */
  attendance?: Record<string, { mid?: MoeAttendanceCount | null; annual?: MoeAttendanceCount | null }> | null;
}

const TEMPLATE_URL = '/templates/moe-annual-results-template.xlsx';
const MAX_STUDENTS = 81;
const SUBJECT_ROW_START = 13;
const SUBJECT_ROW_END = 33;

// ─── ابزارهای XML ───────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** جایگزینی یا حذفِ مقدار یک حجره، حفظ کامل استایل (s) و ساختار */
function setCell(
  xml: string,
  coord: string,
  value: string | number | null,
  sst?: (text: string) => number
): string {
  const re = new RegExp(`<c r="${coord}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  if (!m) return xml; // حجره نیست — بعداً درج می‌شود
  const attrs = m[1] || '';
  const style = attrs.match(/ s="(\d+)"/)?.[0] || '';
  if (value === null) {
    // پاک‌سازی: حجرهٔ استایل‌دار خالی
    return xml.replace(re, `<c r="${coord}"${style}/>`);
  }
  if (typeof value === 'number') {
    const v = Number.isFinite(value) ? String(value) : '';
    return xml.replace(re, `<c r="${coord}"${style}><v>${v}</v></c>`);
  }
  // متن: از طریق sharedStrings — سازگاری کامل با Excel و LibreOffice
  if (sst) return xml.replace(re, `<c r="${coord}"${style} t="s"><v>${sst(value)}</v></c>`);
  return xml.replace(re, `<c r="${coord}"${style} t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`);
}

/** درج حجرهٔ تازه در ردیف (به‌ترتیب ستون) اگر وجود نداشته باشد */
function ensureCell(xml: string, coord: string, value: string | number): string {
  const re = new RegExp(`<c r="${coord}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  if (xml.match(re)) return setCell(xml, coord, value);
  const rowMatch = coord.match(/^([A-Z]+)(\d+)$/);
  const letters = rowMatch![1];
  const rowNum = rowMatch![2];
  const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const rm = xml.match(rowRe);
  if (!rm) return xml;
  const [full, open, body, close] = rm;
  const cellXml =
    typeof value === 'number'
      ? `<c r="${coord}"><v>${String(value)}</v></c>`
      : `<c r="${coord}" t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
  // جای درست بر اساس ترتیب ستون‌ها
  const mine = colNum(letters);
  const cellRe = /<c r="([A-Z]+)\d+"/g;
  let insertAt = body.length;
  let mm: RegExpExecArray | null;
  while ((mm = cellRe.exec(body)) !== null) {
    if (colNum(mm[1]) > mine) {
      insertAt = mm.index;
      break;
    }
  }
  return xml.replace(full, open + body.slice(0, insertAt) + cellXml + body.slice(insertAt) + close);
}

/** نگاشت نام شیت → مسیر فایل XML از workbook.xml و rels */
function sheetPaths(files: Record<string, Uint8Array>): Record<string, string> {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2]);
  }
  const out: Record<string, string> = {};
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = relMap.get(m[2]) || '';
    const clean = target.replace(/^\//, '').replace(/^xl\//, '');
    out[m[1].trim()] = 'xl/' + clean; // نام شیت‌ها فاصلهٔ انتهایی دارند («لیست »)
  }
  return out;
}

/** نرمال‌سازی نام مضمون برای تطبیق با لیست قالب */
export function normalizeSubject(name: string): string {
  return name
    .replace(/[\u200c\u200f\u200e\u0640]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '') // اعراب
    .replace(/\s+/g, '')
    .replace(/ی/g, 'ی').replace(/ک/g, 'ک')
    .trim();
}

// ─── ساختار قالب ────────────────────────────────────────────────

/** ستون شروع بلوک هر شاگرد (۱ = A): گروه‌های ۳تایی + ستون تائید */
function studentBlockStart(i: number): number {
  return 13 + Math.floor(i / 3) * 13 + (i % 3) * 4;
}

/** سطر مضامین قالب: شمارهٔ سطر → نام مضمون (از ستون K، سطرهای ۱۳–۳۳) */
function templateSubjectRows(sheetXml: string): Array<{ row: number; name: string }> {
  const rows: Array<{ row: number; name: string }> = [];
  for (let r = SUBJECT_ROW_START; r <= SUBJECT_ROW_END; r++) {
    const m = sheetXml.match(new RegExp(`<c r="K${r}"[^>]*t="s"[^>]*><v>(\\d+)</v>`));
    if (!m) continue;
    rows.push({ row: r, name: '__ss__' + m[1] }); // اندیس sharedStrings — بعداً حل می‌شود
  }
  return rows;
}

/** حل اندیس‌های sharedStrings به متن — هر <si> می‌تواند چند <t> داشته باشد */
function resolveShared(xml: string, sheetXml: string): Array<{ row: number; name: string }> {
  const raw = templateSubjectRows(sheetXml);
  const sst: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let txt = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) txt += t[1];
    sst.push(txt.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  }
  return raw.map((r) => ({ row: r.row, name: r.name.startsWith('__ss__') ? sst[Number(r.name.slice(6))] ?? '' : r.name }));
}

/** مدیریت sharedStrings — افزودن متن‌های تازه و گرفتن اندیس (سازگار با Excel و LibreOffice) */
function createSstManager(files: Record<string, Uint8Array>) {
  const xml = strFromU8(files['xl/sharedStrings.xml']);
  const indexByText = new Map<string, number>();
  let i = 0;
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let txt = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) txt += t[1];
    const decoded = txt.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    if (!indexByText.has(decoded)) indexByText.set(decoded, i);
    i++;
  }
  const added: string[] = [];
  return {
    /** اندیس متن — در صورت نبود، به انتهای sst افزوده می‌شود */
    index(text: string): number {
      if (indexByText.has(text)) return indexByText.get(text)!;
      const idx = i;
      indexByText.set(text, idx);
      i++;
      added.push(text);
      return idx;
    },
    /** XML نهایی با siهای تازه + شمارش ارجاع‌ها */
    serialize(allSheetsXml: string[]): string {
      let out = xml;
      if (added.length) {
        const newSi = added
          .map((t) => `<si><t xml:space="preserve">${escXml(t)}</t></si>`)
          .join('');
        out = xml.replace(/<\/sst>$/, newSi + '</sst>');
        const uniqueCount = i;
        const totalRefs = allSheetsXml.reduce((n, s) => n + (s.match(/t="s"[^>]*>/g)?.length || 0), 0);
        out = out
          .replace(/(<sst[^>]*)count="\d+"/, `$1count="${totalRefs}"`)
          .replace(/(<sst[^>]*)uniqueCount="\d+"/, `$1uniqueCount="${uniqueCount}"`);
      }
      return out;
    },
  };
}

// ─── تولیدکنندهٔ اصلی ────────────────────────────────────────────

export async function generateMoeAnnualWorkbook(inp: MoeWorkbookInput): Promise<Blob> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('قالب وزارت معارف بارگذاری نشد');
  const buf = new Uint8Array(await res.arrayBuffer());
  const filled = fillMoeTemplate(buf, inp);
  return new Blob([filled.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** هستهٔ خالص برای تست: Uint8Array ورودی → خروجی */
export function fillMoeTemplate(buf: Uint8Array, inp: MoeWorkbookInput): Uint8Array {
  const files = unzipSync(buf);
  const paths = sheetPaths(files);
  const pList = paths['لیست'];
  const pJadwal = paths['جدول نتایج'];
  if (!pList || !pJadwal || !files[pList] || !files[pJadwal]) {
    throw new Error('شیت‌های «لیست» یا «جدول نتایج» در قالب یافت نشدند');
  }
  const sheetList = strFromU8(files[pList]);
  const sheetJadwal = strFromU8(files[pJadwal]);
  const sstManager = createSstManager(files);
  const sst = sstManager.index.bind(sstManager);
  const year = (inp.academicYear || '').trim() || '۱۴۰۵';
  const dirLine = (inp.directorateLine || '').trim();
  // ریاست معارف — از تنظیمات؛ در نبود آن از ولایت، وگرنه خالی (متن کهنهٔ قالب نمی‌ماند)
  const directorate = dirLine || (inp.province?.trim() ? `ریاست معارف ${inp.province.trim()}` : '');
  const students = inp.students.slice(0, MAX_STUDENTS);

  // ═══ شیت «لیست» — ردیف ۱ (معلومات کلی) ═══
  let L = sheetList;
  L = setCell(L, 'C1', `صنف (${inp.className.replace(/^صنف\s*/, '')})`, sst);
  if (inp.teacherName) L = setCell(L, 'D1', `نگران صنف : (${inp.teacherName})`, sst);
  L = setCell(L, 'I1', `( ${inp.schoolName} )`, sst);
  L = setCell(L, 'T1', directorate || null, sst);
  L = setCell(L, 'V1', `بابت سال ${year}`, sst);

  // ═══ شیت «لیست» — شاگردان (سطرهای ۴+) ═══
  // اول پاک‌سازی دادهٔ نمونهٔ قالب (اسم/ولد/ولدیت/اساس/تذکره/حاضری/ملاحظات)
  for (let r = 4; r <= 84; r++) {
    for (const c of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']) {
      L = setCell(L, `${c}${r}`, null);
    }
  }
  students.forEach((st, i) => {
    const r = 4 + i;
    const fullName = [st.firstName, st.lastName].filter(Boolean).join(' ').trim();
    L = setCell(L, `B${r}`, fullName, sst); // اسم (+ شهرت در صورت وجود — قالب ستون جدا ندارد)
    L = setCell(L, `C${r}`, st.fatherName || '', sst); // ولد
    if (st.grandFather) L = setCell(L, `D${r}`, st.grandFather, sst); // ولدیت
    if (st.baseNumber) L = setCell(L, `E${r}`, st.baseNumber, sst); // نمبر اساس — نسخهٔ ۳.۵.۱
    if (st.idNumber) L = setCell(L, `F${r}`, st.idNumber, sst); // نمبر تذکره

    // ═══ ضوابط حاضری — از حاضری یومیهٔ سیستم (نسخهٔ ۳.۵.۱) ═══
    // لیست: G=ایام/H=حاضر/I=غیرحاضر/J=مریض/K=رخصت (چهارونیم‌ماهه) — L..P همان (سالانه)
    // جدول نتایج سطرهای ۳۸-۴۲ با فرمول از این ستون‌ها تغذیه می‌شود + «از میان» خودکار
    const att = st.id ? inp.attendance?.[st.id] : undefined;
    if (att?.annual && att.annual.days > 0) {
      L = setCell(L, `L${r}`, att.annual.days);
      L = setCell(L, `M${r}`, att.annual.present);
      L = setCell(L, `N${r}`, att.annual.absent);
      L = setCell(L, `O${r}`, att.annual.sick);
      L = setCell(L, `P${r}`, att.annual.leave);
    }
    if (att?.mid && att.mid.days > 0) {
      L = setCell(L, `G${r}`, att.mid.days);
      L = setCell(L, `H${r}`, att.mid.present);
      L = setCell(L, `I${r}`, att.mid.absent);
      L = setCell(L, `J${r}`, att.mid.sick);
      L = setCell(L, `K${r}`, att.mid.leave);
    }
  });

  // ═══ شیت «جدول نتایج» ═══
  let J = sheetJadwal;
  // سربرگ
  J = setCell(J, 'D13', directorate || null, sst); // «ریاست معارف بدخشان» → ولایت مکتب
  J = setCell(J, 'I13', `بابت سال تعلیمی ${year}`, sst);

  // سطرهای مضامین قالب + تطبیق با مضامین صنف
  const tplSubjects = resolveShared(strFromU8(files['xl/sharedStrings.xml']), J);
  const dbSubjects = inp.subjects.map((s) => normalizeSubject(s));
  const rowBySubject = new Map<string, number>();
  for (const tpl of tplSubjects) {
    const key = normalizeSubject(tpl.name);
    if (key && !rowBySubject.has(key)) rowBySubject.set(key, tpl.row);
  }
  const subjectRowOf = (name: string): number | null => {
    const key = normalizeSubject(name);
    if (rowBySubject.has(key)) return rowBySubject.get(key)!;
    // تطبیق بخشی — «دروس اجتماعی/تاریخ» و امثال آن
    for (const [k, row] of rowBySubject) {
      if (k && (k.includes(key) || key.includes(k))) return row;
    }
    return null;
  };

  // نمرات: هر شاگرد ۴ ستون [چهارونیم][سالانه][نهائی=فرمول][ملاحظات]
  students.forEach((st, i) => {
    const start = studentBlockStart(i);
    for (const mk of st.marks) {
      const row = subjectRowOf(mk.subject);
      if (!row) continue;
      if (mk.midterm != null) J = setCell(J, `${colLetter(start)}${row}`, mk.midterm);
      if (mk.annual != null) J = setCell(J, `${colLetter(start + 1)}${row}`, mk.annual);
    }
  });

  // ═══ محاسبهٔ کامل هنگام باز شدن در Excel/LibreOffice (پاک‌شدن کش‌های کهنهٔ قالب) ═══
  const wbXml = strFromU8(files['xl/workbook.xml']);
  const calcFixed = wbXml.replace(
    /<calcPr([^/>]*)\/>/,
    '<calcPr$1 fullCalcOnLoad="1"/>'
  );
  if (calcFixed !== wbXml) files['xl/workbook.xml'] = strToU8(calcFixed);

  // ═══ بسته‌بندی مجدد — سایر فایل‌ها بایت‌به‌بایت حفظ می‌شوند ═══
  const out: Record<string, Uint8Array> = { ...files };
  // شمارش ارجاع‌های t="s" در همهٔ شیت‌ها برای count صحیح sst
  const allSheetXmls = Object.keys(out)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k) && k !== pList && k !== pJadwal)
    .map((k) => strFromU8(out[k]));
  files['xl/sharedStrings.xml'] = strToU8(sstManager.serialize([...allSheetXmls, L, J]));
  out['xl/sharedStrings.xml'] = files['xl/sharedStrings.xml']; // خروجی از out ساخته می‌شود
  out[pList] = strToU8(L);
  out[pJadwal] = strToU8(J);
  return zipSync(out, { level: 6 });
}

/** نام فایل خروجی */
export function moeWorkbookFileName(inp: MoeWorkbookInput): string {
  return `جدول نتایج سالانه ${inp.academicYear || ''} ${inp.className}.xlsx`.trim();
}
