"use client";

import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { exportDocumentToPdf } from "@/lib/exportDocumentPdf";

export interface CanonicalPdfReadyInfo {
  filename: string;
  blob: Blob;
  pageCount: number;
}

interface CachedCanonicalEntry {
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  pageCount: number;
  pageSizes: Array<{ width: number; height: number }>;
}

interface CanonicalPdfPreviewProps {
  /** Authoritative A4 document sheet(s) serialized to `/api/pdf/render`. */
  children: ReactNode;
  /** Authoritative PDF filename (`[DocNum] [Customer] - [Description].pdf`). */
  filename: string;
  /** Change key (document data + layout settings) triggering debounced PDF refresh. */
  revisionKey: string;
  /** Visual zoom factor (only scales displayed pages; never alters PDF geometry or triggers server calls). */
  scale: number;
  /** Optional single page filter (1-indexed). Omit to show all pages stacked vertically. */
  pageNumber?: number;
  /** Debounce delay in ms before calling `/api/pdf/render`. */
  debounceMs?: number;
  /** Optional landscape override. */
  landscape?: boolean;
  /** Optional ref callback exposing the off-screen serialization container for Download/Print/Share. */
  onScopeElement?: (el: HTMLDivElement | null) => void;
  /** Called whenever a new canonical PDF Blob is ready. */
  onPdfReady?: (info: CanonicalPdfReadyInfo) => void;
  /** Called whenever canonical PDF generation fails. */
  onPdfError?: (message: string) => void;
  /** Called when updating state toggles. */
  onUpdatingChange?: (isUpdating: boolean) => void;
  /** Optional className for outer page stack wrapper. */
  className?: string;
}

const MAX_CANVAS_PIXELS = 12_000_000; // Safe below iOS Safari ~16.7MP limit
const canonicalCache = new Map<string, CachedCanonicalEntry>();

function fastDomHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      if (typeof window !== "undefined" && mod.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      return mod;
    });
  }
  return pdfjsPromise;
}

function PdfCanvasPage({
  pdfDoc,
  pageNumber,
  cssWidth,
  cssHeight,
  scale,
  totalPages,
  showPageBadge,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
  totalPages: number;
  showPageBadge: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(pageNumber === 1);
  const effectiveVisible = pageNumber === 1 || typeof IntersectionObserver === "undefined" || isVisible;

  useEffect(() => {
    if (pageNumber === 1 || typeof IntersectionObserver === "undefined") {
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber]);

  useEffect(() => {
    if (!effectiveVisible) return;
    let cancelled = false;

    async function drawPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 3) : 2;
        const baseScale = 794 / baseViewport.width;
        let pixelScale = baseScale * Math.max(scale, 0.5) * dpr;

        // Clamp total canvas pixels for mobile Safari memory safety
        const estPixels = baseViewport.width * pixelScale * (baseViewport.height * pixelScale);
        if (estPixels > MAX_CANVAS_PIXELS) {
          pixelScale *= Math.sqrt(MAX_CANVAS_PIXELS / estPixels);
        }

        const pixelViewport = page.getViewport({ scale: pixelScale });
        canvas.width = Math.max(1, Math.floor(pixelViewport.width));
        canvas.height = Math.max(1, Math.floor(pixelViewport.height));

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvasContext: ctx,
          viewport: pixelViewport,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        // Ignore expected RenderingCancelledException during rapid zoom changes
        if (
          err &&
          typeof err === "object" &&
          "name" in err &&
          (err as { name?: string }).name === "RenderingCancelledException"
        ) {
          return;
        }
      }
    }

    void drawPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale, effectiveVisible]);

  const displayW = Math.round(cssWidth * scale);
  const displayH = Math.round(cssHeight * scale);

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div
        className="relative shrink-0 bg-white shadow-2xl ring-1 ring-slate-300/80 overflow-hidden"
        style={{ width: displayW, height: displayH }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: displayW, height: displayH }}
          className="block"
        />
      </div>
      {showPageBadge && totalPages > 1 && (
        <div className="mt-1.5 text-center text-[11px] font-medium text-slate-400">
          Page {pageNumber} of {totalPages}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the **actual canonical server-generated Chromium A4 PDF** directly onto
 * HiDPI `<canvas>` elements via `pdfjs-dist` at exact display pixel resolution.
 *
 * - Reopening an unchanged document hits `canonicalCache` immediately (zero delay).
 * - First-time uncached loads show an immediate provisional shared-template preview while
 *   generating the canonical PDF in the background (zero blank loading screens).
 * - Edits keep the previous canonical preview visible with a non-blocking "Updating Preview…"
 *   indicator and swap cleanly when the latest revision finishes.
 * - Zoom changes re-rasterize the cached PDF locally on `<canvas>` with zero server requests.
 */
export default function CanonicalPdfPreview({
  children,
  filename,
  revisionKey,
  scale,
  pageNumber,
  debounceMs = 200,
  landscape,
  onScopeElement,
  onPdfReady,
  onPdfError,
  onUpdatingChange,
  className = "",
}: CanonicalPdfPreviewProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [renderedKey, setRenderedKey] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const renderSeqRef = useRef<number>(0);

  const compositeKey = `${revisionKey}|${filename}|${landscape ? "L" : "P"}|${retryNonce}`;
  const isUpdating = renderedKey !== compositeKey && !errorMsg;

  useEffect(() => {
    onUpdatingChange?.(isUpdating);
  }, [isUpdating, onUpdatingChange]);

  useEffect(() => {
    onScopeElement?.(sourceRef.current);
  }, [onScopeElement, children]);

  const loadIntoPdfJs = useCallback(
    async (
      targetKey: string,
      entry: CachedCanonicalEntry,
      seq: number
    ) => {
      const pdfjs = await getPdfJs();
      // Clone slice so pdf.js worker transfer never detaches our cached ArrayBuffer
      const doc = await pdfjs.getDocument({ data: entry.arrayBuffer.slice(0) }).promise;
      if (seq !== renderSeqRef.current) {
        void doc.destroy();
        return;
      }

      let sizes = entry.pageSizes;
      if (!sizes.length) {
        sizes = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const pg = await doc.getPage(p);
          const vp = pg.getViewport({ scale: 794 / pg.getViewport({ scale: 1 }).width });
          sizes.push({ width: Math.round(vp.width), height: Math.round(vp.height) });
        }
        entry.pageSizes = sizes;
      }

      setPdfDoc((prev) => {
        if (prev && prev !== doc) {
          void prev.destroy().catch(() => {});
        }
        return doc;
      });
      setPageSizes(sizes);
      setRenderedKey(targetKey);
      onPdfReady?.({
        filename,
        blob: entry.blob,
        pageCount: doc.numPages,
      });
    },
    [filename, onPdfReady]
  );

  const generateAndLoad = useCallback(
    async (targetKey: string) => {
      const seq = ++renderSeqRef.current;
      setErrorMsg("");

      const scope = sourceRef.current;
      if (!scope) return;

      const domHash = fastDomHash(scope.innerHTML || "");
      const cacheKey = `${targetKey}|${domHash}`;

      // 1. Instant cache hit when reopening unchanged document
      const cached = canonicalCache.get(cacheKey);
      if (cached) {
        try {
          await loadIntoPdfJs(targetKey, cached, seq);
          return;
        } catch {
          canonicalCache.delete(cacheKey);
        }
      }

      try {
        const result = await exportDocumentToPdf({
          filename,
          scopeElement: scope,
          action: "blob",
          landscape,
        });

        if (seq !== renderSeqRef.current) return;

        const arrayBuffer = await result.blob.arrayBuffer();
        if (seq !== renderSeqRef.current) return;

        const entry: CachedCanonicalEntry = {
          blob: result.blob,
          arrayBuffer,
          pageCount: 0,
          pageSizes: [],
        };

        if (canonicalCache.size >= 16) {
          const oldest = canonicalCache.keys().next().value;
          if (oldest) canonicalCache.delete(oldest);
        }
        canonicalCache.set(cacheKey, entry);

        await loadIntoPdfJs(targetKey, entry, seq);
      } catch (err) {
        if (seq !== renderSeqRef.current) return;
        const msg = err instanceof Error ? err.message : "Failed to render canonical PDF preview.";
        setErrorMsg(msg);
        onPdfError?.(msg);
      }
    },
    [filename, landscape, loadIntoPdfJs, onPdfError]
  );

  useEffect(() => {
    const domHash = fastDomHash(sourceRef.current?.innerHTML || "");
    const isCached = canonicalCache.has(`${compositeKey}|${domHash}`);
    const timer = setTimeout(() => {
      void generateAndLoad(compositeKey);
    }, isCached ? 0 : debounceMs);

    return () => clearTimeout(timer);
  }, [compositeKey, children, debounceMs, generateAndLoad]);

  const pagesToRender =
    pdfDoc && pageSizes.length > 0
      ? pageSizes
          .map((sz, idx) => ({ pageNum: idx + 1, ...sz }))
          .filter((p) => (typeof pageNumber === "number" && pageNumber >= 1 ? p.pageNum === pageNumber : true))
      : [];

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Off-screen fixed-A4 source DOM serialized to /api/pdf/render */}
      <div
        ref={sourceRef}
        aria-hidden="true"
        data-canonical-pdf-source="true"
        style={{
          position: "fixed",
          left: "-99999px",
          top: 0,
          width: "210mm",
          pointerEvents: "none",
          opacity: 0,
          zIndex: -1,
        }}
      >
        {children}
      </div>

      {/* Non-blocking status pill */}
      {isUpdating && (
        <div className="sticky top-2 z-20 mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-slate-900/95 px-3.5 py-1.5 text-xs font-semibold text-blue-200 shadow-lg backdrop-blur-sm">
          <Loader2 size={14} className="animate-spin text-blue-400" />
          <span>{pdfDoc ? "Updating Preview…" : "Provisional Preview · Generating Canonical PDF…"}</span>
        </div>
      )}

      {/* Error Banner with Explicit Retry */}
      {errorMsg && (
        <div className="my-3 flex max-w-md flex-col items-center gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/90 p-4 text-center text-xs text-rose-100 shadow-xl">
          <AlertCircle size={22} className="text-rose-400" />
          <p className="font-semibold">Canonical PDF Preview Error</p>
          <p className="text-rose-200/90">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
          >
            <RefreshCw size={13} />
            <span>Retry Preview</span>
          </button>
        </div>
      )}

      {/* Canonical HiDPI Canvas Pages OR Provisional Shared-Template Preview */}
      {pdfDoc && pagesToRender.length > 0 ? (
        <div className="flex flex-col items-center gap-5">
          {pagesToRender.map((pg) => (
            <PdfCanvasPage
              key={pg.pageNum}
              pdfDoc={pdfDoc}
              pageNumber={pg.pageNum}
              cssWidth={pg.width}
              cssHeight={pg.height}
              scale={scale}
              totalPages={pageSizes.length}
              showPageBadge={typeof pageNumber !== "number"}
            />
          ))}
        </div>
      ) : !errorMsg ? (
        /* Immediate Provisional Shared-Template Preview (zero blank loading screen) */
        <div
          className="relative shrink-0 overflow-hidden bg-white shadow-2xl ring-1 ring-amber-400/50"
          style={{
            width: Math.round(794 * scale),
            height: Math.round(1123 * scale),
          }}
        >
          <div
            style={{
              width: 794,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
