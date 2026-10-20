"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

export function PdfViewer({ url, initialPage = 1, onPageChange, className }: { url: string; initialPage?: number; onPageChange?: (p: number) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.reason || (res.status === 403 ? "You are not allowed to open this file." : `Could not load file (${res.status})`));
        }
        const data = new Uint8Array(await res.arrayBuffer());
        loaded = await pdfjs.getDocument({ data }).promise;
        if (!cancelled) { setDoc(loaded); setPage((p) => Math.min(Math.max(1, p), loaded!.numPages)); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; loaded?.destroy(); };
  }, [url]);

  const render = useCallback(async () => {
    if (!doc || !canvasRef.current || !wrapRef.current) return;
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const width = wrapRef.current.clientWidth || 600;
    const scale = (width / base.width) * zoom;
    const vp = p.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = canvasRef.current;
    c.width = Math.floor(vp.width * dpr);
    c.height = Math.floor(vp.height * dpr);
    c.style.width = `${Math.floor(vp.width)}px`;
    c.style.height = `${Math.floor(vp.height)}px`;
    taskRef.current?.cancel();
    const task = p.render({ canvas: c, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
    taskRef.current = task;
    await task.promise.catch(() => {});
  }, [doc, page, zoom]);

  useEffect(() => { render(); onPageChange?.(page); }, [render, page, onPageChange]);
  useEffect(() => {
    const ro = new ResizeObserver(() => render());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [render]);

  const n = doc?.numPages ?? 0;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && page > 1) { e.preventDefault(); setPage(page - 1); }
    if (e.key === "ArrowRight" && page < n) { e.preventDefault(); setPage(page + 1); }
  };
  return (
    <div className={className} onKeyDown={onKeyDown}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="icon-lg" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
        <span className="min-w-24 text-center text-sm tabular-nums" aria-live="polite">Page {n ? page : "–"} / {n || "–"}</span>
        <Button variant="outline" size="icon-lg" aria-label="Next page" disabled={page >= n} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="icon-lg" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut /></Button>
          <Button variant="outline" size="icon-lg" aria-label="Fit width" onClick={() => setZoom(1)}><Maximize2 /></Button>
          <Button variant="outline" size="icon-lg" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><ZoomIn /></Button>
        </div>
      </div>
      <div ref={wrapRef} tabIndex={0} role="region" aria-label="Document page (use arrow keys to change page)" className="relative max-h-[75vh] focus-visible:outline-2 focus-visible:outline-ring min-h-64 overflow-auto rounded-lg border bg-muted/40">
        {loading && <div className="absolute inset-0 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
        {error && <div className="p-6 text-sm text-destructive">{error}</div>}
        <canvas ref={canvasRef} className="mx-auto block bg-white shadow-sm" aria-label={`Page ${page} of document`} role="img" />
      </div>
    </div>
  );
}
