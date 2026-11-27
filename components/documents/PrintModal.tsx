"use client";

import React, { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Maximize, Printer, Save, Share2, Sliders, X, ZoomIn, ZoomOut } from "lucide-react";
import { getDocumentPreviewScale } from "@/lib/documentPreview";
import { exportDocumentToPdf } from "@/lib/exportDocumentPdf";
import CanonicalPdfPreview from "./CanonicalPdfPreview";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  editorHref?: string;
  extraActions?: ReactNode;
  documentFilename?: string;
  documentTitle?: string;
  isDraftOrUnsaved?: boolean;
  onSaveBeforeExport?: () => Promise<void> | void;
}

const emptySubscribe = () => () => { };

export default function PrintModal({
  isOpen,
  onClose,
  children,
  editorHref,
  extraActions,
  documentFilename,
  documentTitle,
  isDraftOrUnsaved,
  onSaveBeforeExport,
}: PrintModalProps) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 794, height: 1123 });
  const [scale, setScale] = useState(() =>
    typeof window === "undefined" ? 1 : getDocumentPreviewScale(window.innerWidth - 32, 794)
  );
  const [isFit, setIsFit] = useState(true);
  const [exportingAction, setExportingAction] = useState<"download" | "share" | "print" | null>(null);
  const [exportNotice, setExportNotice] = useState<{
    text: string;
    url?: string;
    isError?: boolean;
    retryAction?: "download" | "share" | "print";
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setExportNotice(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, documentFilename, documentTitle]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const updateDimensions = () => {
      const content = previewRef.current;
      if (!content) return;
      const page = content.querySelector<HTMLElement>(".print-page, .document-sheet, .dynamic-document-page");
      const nextDimensions = {
        width: page?.offsetWidth || content.offsetWidth || 794,
        height: content.scrollHeight || page?.scrollHeight || 1123,
      };
      setDimensions((current) =>
        current.width === nextDimensions.width && current.height === nextDimensions.height
          ? current
          : nextDimensions
      );
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (previewRef.current) observer.observe(previewRef.current);
    if (surfaceRef.current) observer.observe(surfaceRef.current);
    return () => observer.disconnect();
  }, [isOpen, children]);

  useEffect(() => {
    if (!isOpen || !isFit) return;
    const updateFit = () => {
      const availableWidth = (surfaceRef.current?.clientWidth || window.innerWidth) - 32;
      setScale(getDocumentPreviewScale(availableWidth, dimensions.width));
    };

    updateFit();
    window.addEventListener("resize", updateFit);
    const observer = new ResizeObserver(updateFit);
    if (surfaceRef.current) observer.observe(surfaceRef.current);
    return () => {
      window.removeEventListener("resize", updateFit);
      observer.disconnect();
    };
  }, [dimensions.width, isFit, isOpen]);

  if (!isOpen) return null;

  const runPdfAction = async (action: "download" | "share" | "print") => {
    setExportingAction(action);
    setExportNotice(null);
    try {
      const res = await exportDocumentToPdf({
        filename: documentFilename,
        scopeElement: previewRef.current,
        action,
      });
      if (action === "share" && res.method === "ios-fallback" && res.fallbackUrl) {
        setExportNotice({
          text: `Tap "Open PDF" below, then tap Share → Save to Files (${res.filename}).`,
          url: res.fallbackUrl,
        });
      } else if (action === "download" && res.method === "ios-fallback" && res.fallbackUrl) {
        setExportNotice({
          text: `iOS Safari: Use "Share" (Save to Files) or tap Open PDF to view "${res.filename}".`,
          url: res.fallbackUrl,
        });
      } else if (action === "print" && res.fallbackUrl) {
        setExportNotice({
          text:
            res.method === "ios-fallback"
              ? `Tap "Open PDF" to open and print the A4 PDF (${res.filename}).`
              : `Opened A4 PDF for printing (${res.filename}).`,
          url: res.fallbackUrl,
        });
      }
    } catch (e) {
      console.error(e);
      setExportNotice({
        text: e instanceof Error ? e.message : "Failed to generate PDF from server renderer.",
        isError: true,
        retryAction: action,
      });
    } finally {
      setExportingAction(null);
    }
  };

  const displayTitle = documentTitle || documentFilename?.replace(/\.pdf$/i, "") || "Document preview";

  const modalElement = (
    <div
      className="erp-screen-theme print-modal-container fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden bg-black/70 backdrop-blur-sm pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:static print:block print:h-auto print:w-[210mm] print:max-w-none print:overflow-visible print:bg-transparent print:p-0 print:shadow-none"
      role="dialog"
      aria-modal="true"
      aria-label="Document print preview"
      data-document-filename={documentFilename}
      data-document-title={displayTitle}
    >
      <header className="print-preview-toolbar no-print flex flex-wrap shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white sm:px-4">
        <div className="min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold" id="print-preview-title">{displayTitle}</div>
        <div className="flex flex-wrap shrink-0 items-center gap-1">
          {extraActions}
          <button type="button" onClick={() => { setIsFit(false); setScale((value) => Math.max(0.1, value - 0.1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800" aria-label="Zoom out" title="Zoom out">
            <ZoomOut size={18} />
          </button>
          <button type="button" onClick={() => setIsFit(true)} className="flex h-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-200 hover:bg-slate-800" aria-label="Fit page to width" title="Fit page to width">
            <Maximize size={16} /><span>Fit</span>
          </button>
          <button type="button" onClick={() => { setIsFit(false); setScale((value) => Math.min(2, value + 0.1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800" aria-label="Zoom in" title="Zoom in">
            <ZoomIn size={18} />
          </button>
          {editorHref && (
            <a
              href={editorHref}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 sm:px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
              title="Open and edit template in PDF Designer"
              aria-label="Edit in PDF Editor"
            >
              <Sliders size={15} className="text-amber-400" />
              <span className="hidden md:inline">PDF Editor</span>
            </a>
          )}
          <button
            type="button"
            disabled={exportingAction !== null}
            onClick={() => void runPdfAction("share")}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 sm:px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            aria-label="Share or Save to Files"
            title="Share or Save PDF to Files"
          >
            {exportingAction === "share" ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} className="text-emerald-400" />}
            <span className="hidden sm:inline">Share</span>
          </button>
          <button
            type="button"
            disabled={exportingAction !== null}
            onClick={() => void runPdfAction("download")}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 sm:px-3 text-xs font-bold text-white hover:bg-blue-500 cursor-pointer disabled:opacity-50"
            aria-label="Download A4 PDF"
            title="Download clean A4 PDF directly"
          >
            {exportingAction === "download" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden min-[380px]:inline">Download PDF</span>
          </button>
          <button
            type="button"
            disabled={exportingAction !== null}
            onClick={() => void runPdfAction("print")}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 sm:px-3 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
          >
            {exportingAction === "print" ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            <span className="hidden md:inline">Print / Save</span>
          </button>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800" aria-label="Close document preview" title="Close preview">
            <X size={18} />
          </button>
        </div>
      </header>
      {isDraftOrUnsaved && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-950/90 px-3 py-2 text-xs text-amber-200">
          <span>Unsaved changes / draft preview. Save first to lock the final document number and details.</span>
          {onSaveBeforeExport && (
            <button
              type="button"
              onClick={() => void onSaveBeforeExport()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-bold text-white cursor-pointer"
            >
              <Save size={13} />
              <span>Save &amp; Finalize PDF</span>
            </button>
          )}
        </div>
      )}
      {exportNotice && (
        <div
          className={`no-print flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs ${exportNotice.isError
            ? "border-rose-500/40 bg-rose-950/95 text-rose-100"
            : "border-blue-500/40 bg-blue-950/90 text-blue-100"
            }`}
        >
          <span>{exportNotice.text}</span>
          <div className="flex items-center gap-2">
            {exportNotice.retryAction && (
              <button
                type="button"
                onClick={() => void runPdfAction(exportNotice.retryAction!)}
                className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
              >
                Retry
              </button>
            )}
            {exportNotice.url && (
              <a
                href={exportNotice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-500"
              >
                Open PDF
              </a>
            )}
            <button type="button" onClick={() => setExportNotice(null)} className="text-blue-300 hover:text-white p-1">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div ref={surfaceRef} className="print-preview-surface flex flex-col min-h-0 flex-1 items-center justify-start overflow-auto overscroll-contain bg-slate-200 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-4 min-w-0">
        <CanonicalPdfPreview
          filename={documentFilename || `${displayTitle}.pdf`}
          revisionKey={`${documentFilename || ""}|${displayTitle}`}
          scale={scale}
          debounceMs={30}
          onScopeElement={(el) => {
            previewRef.current = el;
          }}
        >
          {children}
        </CanonicalPdfPreview>
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(modalElement, document.body);
  }

  return modalElement;
}
