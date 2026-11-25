"use client";

import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { exportDocumentToPdf } from "@/lib/exportDocumentPdf";

export interface CanonicalPdfReadyInfo {
  filename: string;
  blob: Blob;
  pageCount: number;
}

interface RenderedPageBitmap {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
}

interface CanonicalPdfPreviewProps {
  /** Off-screen authoritative A4 document sheet(s) serialized to `/api/pdf/render`. */
  children: ReactNode;
  /** Authoritative PDF filename (`[DocNum] [Customer] - [Description].pdf`). */
  filename: string;
  /** Change key (JSON/hash of document data + layout settings) triggering debounced PDF refresh. */
  revisionKey: string;
  /** Visual zoom factor (only scales displayed pages; never alters PDF geometry). */
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

/**
 * Renders the **actual canonical server-generated Chromium A4 PDF** as crisp high-DPI
 * page images via `pdfjs-dist`, guaranteeing 100% WYSIWYG visual parity between
 * Live Preview, Document Editor, Mobile Preview, Download PDF, Print PDF, and Share PDF.
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
  const [pages, setPages] = useState<RenderedPageBitmap[]>([]);
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

  const generateAndRasterize = useCallback(async (targetKey: string) => {
    const scope = sourceRef.current;
    if (!scope) return;

    const seq = ++renderSeqRef.current;
    setErrorMsg("");

    try {
      const result = await exportDocumentToPdf({
        filename,
        scopeElement: scope,
        action: "blob",
        landscape,
      });

      if (seq !== renderSeqRef.current) return;

      const pdfjs = await getPdfJs();
      const buffer = await result.blob.arrayBuffer();
      if (seq !== renderSeqRef.current) return;

      const loadingTask = pdfjs.getDocument({ data: buffer });
      const pdfDoc = await loadingTask.promise;
      if (seq !== renderSeqRef.current) {
        void pdfDoc.destroy();
        return;
      }

      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 2.5) : 2;
      // Match 96 DPI CSS reference width (794px for 210mm A4) so scale=1 matches A4 screen sizing
      const baseRenderScale = (794 / 595.28) * dpr;
      const rendered: RenderedPageBitmap[] = [];

      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        if (seq !== renderSeqRef.current) {
          void pdfDoc.destroy();
          return;
        }
        const cssViewport = page.getViewport({ scale: 794 / 595.28 });
        const pixelViewport = page.getViewport({ scale: baseRenderScale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(pixelViewport.width));
        canvas.height = Math.max(1, Math.floor(pixelViewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");

        await page.render({
          canvasContext: ctx,
          viewport: pixelViewport,
        }).promise;

        rendered.push({
          pageNumber: p,
          width: Math.round(cssViewport.width),
          height: Math.round(cssViewport.height),
          dataUrl: canvas.toDataURL("image/png"),
        });
      }

      const totalPages = pdfDoc.numPages;
      void pdfDoc.destroy();

      if (seq !== renderSeqRef.current) return;
      setPages(rendered);
      setRenderedKey(targetKey);
      onPdfReady?.({
        filename: result.filename,
        blob: result.blob,
        pageCount: totalPages,
      });
    } catch (err) {
      if (seq !== renderSeqRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to render canonical PDF preview.";
      setErrorMsg(msg);
      onPdfError?.(msg);
    }
  }, [filename, landscape, onPdfError, onPdfReady]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void generateAndRasterize(compositeKey);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [compositeKey, debounceMs, generateAndRasterize]);

  const visiblePages =
    typeof pageNumber === "number" && pageNumber >= 1
      ? pages.filter((p) => p.pageNumber === pageNumber)
      : pages;

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

      {/* Updating Preview Indicator — never silently show stale PDF as current */}
      {isUpdating && (
        <div className="sticky top-2 z-20 mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-slate-900/95 px-3.5 py-1.5 text-xs font-semibold text-blue-200 shadow-lg backdrop-blur-sm">
          <Loader2 size={14} className="animate-spin text-blue-400" />
          <span>Updating Preview…</span>
        </div>
      )}

      {/* Error State with Explicit Retry */}
      {errorMsg && (
        <div className="my-4 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/90 p-5 text-center text-xs text-rose-100 shadow-xl">
          <AlertCircle size={24} className="text-rose-400" />
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

      {/* Rendered Canonical PDF Pages */}
      {visiblePages.length > 0 ? (
        <div className={`flex flex-col items-center gap-5 transition-opacity duration-150 ${isUpdating ? "opacity-60" : "opacity-100"}`}>
          {visiblePages.map((pg) => (
            <div
              key={pg.pageNumber}
              className="relative shrink-0 bg-white shadow-2xl ring-1 ring-slate-300/80"
              style={{
                width: Math.round(pg.width * scale),
                height: Math.round(pg.height * scale),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pg.dataUrl}
                alt={`Page ${pg.pageNumber} of ${pages.length}`}
                className="block h-full w-full select-none"
                draggable={false}
              />
              {pages.length > 1 && typeof pageNumber !== "number" && (
                <div className="mt-1.5 text-center text-[11px] font-medium text-slate-400">
                  Page {pg.pageNumber} of {pages.length}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-xs text-slate-400">
          <Loader2 size={24} className="animate-spin text-blue-400" />
          <span>Generating canonical A4 PDF preview…</span>
        </div>
      ) : null}
    </div>
  );
}
