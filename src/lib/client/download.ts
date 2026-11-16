'use client';

/**
 * دانلود فایل خروجی از dataURL — سازگار با WebView اندروید (پل AndroidBridge.saveFile)
 * نسخهٔ ۳.۱.۰ — مشترک بین پیوست پیام‌ها و کتاب‌های PDF کتابخانه
 */

export function downloadDataUrl(name: string, dataUrl: string) {
  try {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta?.match(/data:(.*?);/)?.[1] || meta?.match(/data:(.+)/)?.[1] || 'application/octet-stream';
    const bin = atob(b64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    (window as unknown as { __noqDownloadName?: string }).__noqDownloadName = name;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  } catch { /* ignore */ }
}
