import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** نام کامل شاگرد — شهرت/تخلص اختیاری است و اگر خالی باشد فقط اسم نمایش داده می‌شود */
export function fullName(s: { firstName?: string | null; lastName?: string | null }): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ');
}
