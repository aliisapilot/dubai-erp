"use client";

import React, { useEffect, useState } from "react";
import { Printer, X, ZoomIn, ZoomOut, Maximize2, FileText, ChevronLeft } from "lucide-react";
import { DocumentLayout } from "@/lib/documentDesigner";
import DynamicDocumentRenderer, { SAMPLE_DOCUMENT_DATA } from "../documents/DynamicDocumentRenderer";
import { CompanyDocInfo } from "../documents/DocHeader";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  layout: DocumentLayout;
  company: CompanyDocInfo | null;
  docTitle: string;
  totalPages: number;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  layout,
  company,
  docTitle,
  totalPages,
}: DocumentPreviewModalProps) {
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const vh = window.innerHeight;
      const idealScale = Math.min(1, Math.max(0.4, (vh - 120) / 1123));
      return Math.round(idealScale * 100) / 100;
    }
    return 0.85;
  });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="print-modal-container fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md overflow-hidden print:static print:inset-auto print:bg-transparent print:p-0 print:m-0 print:overflow-visible print:block print:w-[210mm]"
    >
      {/* ── Screen-Only Control Toolbar ────────────────────────────────────────── */}
      <header className="no-print print-hide h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-white shrink-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>{docTitle}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold uppercase tracking-wide border border-blue-500/30">
                A4 Print Preview
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {totalPages} Page{totalPages > 1 ? "s" : ""} • Exact 210mm × 297mm
            </p>
          </div>
        </div>

        {/* Center: Zoom Controls */}
        <div className="flex items-center gap-2 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/70 text-xs">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.4, Math.round((s - 0.1) * 10) / 10))}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="font-mono text-slate-200 min-w-[42px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.5, Math.round((s + 0.1) * 10) / 10))}
            className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <div className="h-3.5 w-px bg-slate-700 mx-1" />
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                const ideal = Math.min(1, Math.max(0.4, (window.innerHeight - 120) / 1123));
                setScale(Math.round(ideal * 100) / 100);
              }
            }}
            className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1"
          >
            <Maximize2 size={12} />
            <span>Fit Height</span>
          </button>
          <button
            type="button"
            onClick={() => setScale(1.0)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
              scale === 1.0 ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            100%
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>Back to Designer</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow cursor-pointer"
          >
            <Printer size={15} />
            <span>Print Document</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
            title="Close Preview (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── Document Scroll Area ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-8 flex flex-col items-center gap-8 print:p-0 print:m-0 print:overflow-visible print:block print:w-[210mm] print:bg-white">
        {Array.from({ length: totalPages }, (_, index) => {
          const pageNum = index + 1;
          return (
            <div
              key={pageNum}
              className="flex flex-col items-center print:block print:m-0 print:p-0"
            >
              {/* Page Number Badge (Screen only) */}
              <div className="no-print print-hide mb-2 text-xs font-medium text-slate-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>
                  Page {pageNum} of {totalPages}
                </span>
              </div>

              {/* A4 Sheet Container */}
              <div
                className="print:transform-none"
                style={{
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                  transformOrigin: "top center",
                  marginBottom: scale < 1 ? `-${Math.round((1 - scale) * 297 * 3.7795)}px` : undefined,
                }}
              >
                <DynamicDocumentRenderer
                  layout={layout}
                  company={company}
                  data={SAMPLE_DOCUMENT_DATA}
                  isDesignerPreview={false}
                  scale={1}
                  pageNumber={pageNum}
                  totalPages={totalPages}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
