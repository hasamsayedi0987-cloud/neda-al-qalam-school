import { toPersianDigits } from "@/lib/jalali";

/** Format money as Afghan Afghani with localized digits: «۱٬۰۰۰ افغانی» (dr/ps), "1,000 AFN" (en) */
export function formatAFN(n: number | null | undefined, locale: string = "dr"): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const grouped = Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  if (locale === "en") return `${grouped} AFN`;
  return `${toPersianDigits(grouped)} افغانی`;
}

/** Format a plain number with localized digits */
export function formatNumber(n: number | null | undefined, locale: string = "dr"): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(1);
  return locale === "en" ? s : toPersianDigits(s);
}

/** Parse «۱٬۰۰۰» / "1,000" / «۱۵۰» into a number */
export function parseMoney(input: string): number {
  const cleaned = input
    .replace(/[٬,\s]/g, "")
    .replace(/[۰-۹٠-٩]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}
