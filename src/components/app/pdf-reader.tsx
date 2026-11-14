'use client';

/**
 * خوانندهٔ PDF داخل اپ — نسخهٔ ۳.۱.۰
 *
 * PDF.js (pdfjs-dist): کتاب مستقیماً داخل اپ خوانده می‌شود — بدون برنامهٔ خارجی،
 * هم در مرورگر کامپیوتر و هم در WebView اندروید. صفحه‌گردانی، بزرگ‌نمایی و دانلود.
 * فایل از سرور (کش سرویس‌ورکر) می‌آید — پس از یک بار بازکردن، آفلاین هم خوانده می‌شود.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronRight, ChevronLeft, Download, ZoomIn, ZoomOut, FileText } from 'lucide-react';
import { toPersianDigits } from '@/lib/jalali';
import { apiGet } from '@/lib/client/api';
import { downloadDataUrl } from '@/lib/client/download';

interface PdfFile {
  fileName: string;
  data: string;
}

export function PdfReader({ bookId, title }: { bookId: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const loadTaskRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<PdfFile | null>(null);

  // ── دریافت فایل + گشودن سند ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await apiGet<PdfFile>(`/api/library?file=1&id=${bookId}`);
        if (cancelled) return;
        setFile({ fileName: f.fileName, data: f.data });
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const b64 = f.data.split(',')[1] || '';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const task = pdfjs.getDocument({
          data: bytes,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        });
        loadTaskRef.current = task;
        const doc = await task.promise;
        if (cancelled) { void task.destroy(); return; }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error && e.message ? e.message : 'بازکردن کتاب ناموفق بود');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void loadTaskRef.current?.destroy();
      loadTaskRef.current = null;
      docRef.current = null;
    };
  }, [bookId]);

  // ── رندر صفحهٔ جاری ──
  const renderPage = useCallback(async (doc: PDFDocumentProxy, pageNo: number, sc: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pdfPage = await doc.getPage(pageNo);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewport = pdfPage.getViewport({ scale: sc });
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    renderTaskRef.current?.cancel();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const task = pdfPage.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
    renderTaskRef.current = task as unknown as { cancel: () => void; promise: Promise<unknown> };
    await task.promise;
  }, []);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || loading) return;
    renderPage(doc, page, scale).catch(() => { /* لغو رندر قبلی — عادی است */ });
  }, [page, scale, loading, renderPage]);

  const goPage = (p: number) => {
    if (!numPages) return;
    setPage(Math.max(1, Math.min(numPages, p)));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">در حال بازکردن کتاب…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground">در حالت آفلاین، کتابی که قبلاً باز کرده‌اید دوباره خوانده می‌شود.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0" style={{ height: '75vh' }}>
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b shrink-0">
        <span className="text-xs font-semibold truncate flex-1 min-w-[120px]" title={title}>{title}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.25) * 100) / 100))} aria-label="کوچک‌نمایی">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-[11px] text-muted-foreground w-10 text-center">{toPersianDigits(Math.round(scale * 100))}٪</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100))} aria-label="بزرگ‌نمایی">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="صفحهٔ قبل">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            dir="ltr"
            className="h-8 w-14 text-center text-xs"
            inputMode="numeric"
            value={toPersianDigits(page)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
              if (Number.isFinite(n) && n > 0) goPage(n);
            }}
            aria-label="شمارهٔ صفحه"
          />
          <span className="text-[11px] text-muted-foreground">از {toPersianDigits(numPages)}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goPage(page + 1)} disabled={page >= numPages} aria-label="صفحهٔ بعد">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        {file && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => downloadDataUrl(file.fileName, file.data)}>
            <Download className="h-3.5 w-3.5" /> دانلود
          </Button>
        )}
      </div>
      {/* بوم صفحه */}
      <div className="flex-1 min-h-0 overflow-auto nice-scroll bg-muted/40 rounded-lg mt-2 flex justify-center p-2">
        <canvas ref={canvasRef} className="shadow-md bg-white" />
      </div>
    </div>
  );
}
