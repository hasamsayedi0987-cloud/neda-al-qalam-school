'use client';

import * as React from 'react';

/**
 * پیوند لایه‌های شناور (Dialog/Sheet/AlertDialog/Drawer) با تاریخچهٔ مرورگر
 * — بخشی از حل «دکمهٔ برگشت گوشی»:
 *
 *  • بازشدن هر لایه → یک مدخل تاریخچه push می‌شود
 *  • دکمهٔ برگشت گوشی/مرورگر → اول لایهٔ رویانی بسته می‌شود (نه خروج از اپ!)
 *  • بستن لایه با دکمه/کلیک → مدخلِ خودش از تاریخچه مصرف می‌شود (پس‌ماند نمی‌ماند)
 *  • چند لایهٔ تو در تو → هر «برگشت» فقط لایهٔ رویانی را می‌بندد
 *
 * برای جلوگیری از حلقه، برگشت‌های برنامه‌ای با شمارنده فرونشانی می‌شوند تا
 * popstate ناشی از history.back() برنامه، بسته‌شدن لایه‌های دیگر را باعث نشود.
 */

const layerStack: symbol[] = [];
let suppressPop = 0;

function programmaticBack() {
  suppressPop++;
  try { window.history.back(); } catch { suppressPop = Math.max(0, suppressPop - 1); }
  setTimeout(() => { suppressPop = Math.max(0, suppressPop - 1); }, 0);
}

function currentEntryIsLayer(): boolean {
  try {
    const st = window.history.state as { noqLayer?: boolean } | null;
    return Boolean(st?.noqLayer);
  } catch {
    return false;
  }
}

function claimEntry() {
  const id = Symbol('noq-layer');
  layerStack.push(id);
  try { window.history.pushState({ noqLayer: true }, ''); } catch { /* ignore */ }
  return id;
}

function releaseEntry(id: symbol) {
  const idx = layerStack.lastIndexOf(id);
  const wasTop = idx !== -1 && idx === layerStack.length - 1;
  if (idx !== -1) layerStack.splice(idx, 1);
  // مصرف مدخل فقط اگر رویانی بودیم و مدخل فعلی تاریخچه از آنِ لایه‌هاست
  if (wasTop && currentEntryIsLayer()) programmaticBack();
}

/** لایهٔ رویانی باز است؟ — برای دکمهٔ برگشت سراسری (اندروید) */
export function hasOpenLayer(): boolean {
  return layerStack.length > 0;
}

/**
 * @param open  باز بودن لایه (کنترل‌شده یا داخلی)
 * @param requestClose  بستن لایه هنگام فشردن دکمهٔ برگشت
 */
export function useDialogHistory(open: boolean, requestClose: () => void) {
  const idRef = React.useRef<symbol | null>(null);
  const closeRef = React.useRef(requestClose);
  React.useEffect(() => {
    closeRef.current = requestClose;
  });

  React.useEffect(() => {
    if (open) {
      if (!idRef.current) idRef.current = claimEntry();
    } else if (idRef.current) {
      const id = idRef.current;
      idRef.current = null;
      releaseEntry(id);
    }
  }, [open]);

  React.useEffect(() => {
    const onPop = () => {
      // برگشتِ برنامه‌ای (مصرف مدخل هنگام بستن با دکمه) — نادیده
      if (suppressPop > 0) return;
      if (!idRef.current) return;
      const id = idRef.current;
      const isTop = layerStack[layerStack.length - 1] === id;
      const idx = layerStack.lastIndexOf(id);
      if (idx !== -1) layerStack.splice(idx, 1);
      idRef.current = null;
      if (isTop) closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // unmount در حالت باز (تعویض بخش/خروج) — مدخل مصرف شود تا در تاریخچه پس‌ماند نماند
      if (idRef.current) {
        const id = idRef.current;
        idRef.current = null;
        releaseEntry(id);
      }
    };
  }, []);
}
