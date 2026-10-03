"use client";
import { printCurrentDocument } from "@/lib/print";

import React, { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Maximize, Printer, Sliders, X, ZoomIn, ZoomOut } from "lucide-react";
import { getDocumentPreviewScale } from "@/lib/documentPreview";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  editorHref?: string;
  extraActions?: ReactNode;
}

const emptySubscribe = () => () => {};

export default function PrintModal({ isOpen, onClose, children, editorHref, extraActions }: PrintModalProps) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const previewRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 794, height: 1123 });
  const [scale, setScale] = useState(() =>
    typeof window === "undefined" ? 1 : getDocumentPreviewScale(window.innerWidth - 32, 794)
  );
  const [isFit, setIsFit] = useState(true);

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

  const modalElement = (
    <div
      className="erp-screen-theme print-modal-container fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-black/70 backdrop-blur-sm pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:static print:block print:h-auto print:w-[210mm] print:max-w-none print:overflow-visible print:bg-transparent print:p-0 print:shadow-none"
      role="dialog"
      aria-modal="true"
      aria-label="Document print preview"
    >
      <header className="print-preview-toolbar no-print flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white sm:px-4">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold" id="print-preview-title">Document preview</div>
        <div className="flex shrink-0 items-center gap-1">
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
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
              title="Open and edit template in PDF Designer"
              aria-label="Edit in PDF Editor"
            >
              <Sliders size={15} className="text-amber-400" />
              <span className="hidden min-[480px]:inline">PDF Editor</span>
            </a>
          )}
          <button type="button" onClick={() => void printCurrentDocument()} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500" aria-label="Print or save as PDF" title="Print or save as PDF">
            <Printer size={16} /><span className="hidden min-[380px]:inline">Print / Save</span>
          </button>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800" aria-label="Close document preview" title="Close preview">
            <X size={18} />
          </button>
        </div>
      </header>
      <div ref={surfaceRef} className="print-preview-surface flex min-h-0 flex-1 items-start justify-center overflow-auto overscroll-contain bg-slate-200 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-4">
        <div className="print-preview-scale-shell relative shrink-0" style={{ width: dimensions.width * scale, height: dimensions.height * scale }}>
          <div ref={previewRef} className="print-preview-scale-content absolute left-0 top-0 origin-top-left" style={{ width: dimensions.width, transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(modalElement, document.body);
  }

  return modalElement;
}
