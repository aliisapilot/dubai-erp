"use client";

import React, { useEffect, useState } from "react";
import { Printer, X, ZoomIn, ZoomOut, Maximize2, FileText, ChevronLeft } from "lucide-react";
import { DocumentLayout, formatDocNumber } from "@/lib/documentDesigner";
import DynamicDocumentRenderer, {
  SAMPLE_DOCUMENT_DATA,
  getDocumentPageCount,
  getSampleDocumentData,
  MockDocumentData,
} from "../documents/DynamicDocumentRenderer";
import { CompanyDocInfo } from "../documents/DocHeader";
import { printCurrentDocument } from "@/lib/print";

const TEST_DATASETS: Record<string, { label: string; count: number; data: MockDocumentData }> = {
  short_1: {
    label: "1 Item",
    count: 1,
    data: {
      ...SAMPLE_DOCUMENT_DATA,
      items: [SAMPLE_DOCUMENT_DATA.items[0]],
      subtotal: SAMPLE_DOCUMENT_DATA.items[0].line_total,
      vat_amount: SAMPLE_DOCUMENT_DATA.items[0].vat_amount,
      total_amount: SAMPLE_DOCUMENT_DATA.items[0].line_total + SAMPLE_DOCUMENT_DATA.items[0].vat_amount,
    },
  },
  compact_2: {
    label: "2 Items",
    count: 2,
    data: {
      ...SAMPLE_DOCUMENT_DATA,
      items: SAMPLE_DOCUMENT_DATA.items.slice(0, 2),
      subtotal: SAMPLE_DOCUMENT_DATA.items.slice(0, 2).reduce((s, i) => s + i.line_total, 0),
      vat_amount: SAMPLE_DOCUMENT_DATA.items.slice(0, 2).reduce((s, i) => s + i.vat_amount, 0),
      total_amount: SAMPLE_DOCUMENT_DATA.items.slice(0, 2).reduce((s, i) => s + i.line_total + i.vat_amount, 0),
    },
  },
  sample_4: {
    label: "4 Items",
    count: 4,
    data: SAMPLE_DOCUMENT_DATA,
  },
  medium_8: {
    label: "8 Items",
    count: 8,
    data: {
      ...SAMPLE_DOCUMENT_DATA,
      items: [
        ...SAMPLE_DOCUMENT_DATA.items,
        {
          description: "Heavy Duty Ground Anchor Pins & Tension Ratchet Straps (5 Ton Rated)",
          quantity: 24,
          unit: "Sets",
          unit_price: 180,
          vat_rate: 5,
          vat_amount: 216,
          line_total: 4536,
        },
        {
          description: "Fire Retardant Heavy Gauge White Roof Lining with Decorative Gold Trim",
          quantity: 1,
          unit: "Lot",
          unit_price: 8500,
          vat_rate: 5,
          vat_amount: 425,
          line_total: 8925,
        },
        {
          description: "Industrial Portable Air Conditioning Packaged Unit (10 Ton Capacity)",
          quantity: 4,
          unit: "Units",
          unit_price: 6800,
          vat_rate: 5,
          vat_amount: 1360,
          line_total: 28560,
        },
        {
          description: "Temporary Power Distribution Board & Heavy Gauge Rubberized Cables",
          quantity: 1,
          unit: "Job",
          unit_price: 4500,
          vat_rate: 5,
          vat_amount: 225,
          line_total: 4725,
        },
      ],
      subtotal: 184500,
      vat_amount: 9225,
      total_amount: 193725,
    },
  },
  long_18: {
    label: "18 Items",
    count: 18,
    data: {
      ...SAMPLE_DOCUMENT_DATA,
      items: Array.from({ length: 18 }, (_, i) => ({
        description: `Industrial PVC Structural Arch Assembly Component #${i + 1} with UAE Civil Defence Certification`,
        quantity: i + 1,
        unit: "Nos",
        unit_price: 1200 + i * 150,
        vat_rate: 5,
        vat_amount: Math.round((1200 + i * 150) * (i + 1) * 0.05),
        line_total: Math.round((1200 + i * 150) * (i + 1) * 1.05),
      })),
      subtotal: 312000,
      vat_amount: 15600,
      total_amount: 327600,
    },
  },
  empty_0: {
    label: "0 Items",
    count: 0,
    data: {
      ...SAMPLE_DOCUMENT_DATA,
      items: [],
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
    },
  },
};

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  layout: DocumentLayout;
  company: CompanyDocInfo | null;
  docTitle: string;
  totalPages?: number;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  layout,
  company,
  docTitle,
}: DocumentPreviewModalProps) {
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>("sample_4");
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const vh = window.innerHeight;
      const idealScale = Math.min(1, Math.max(0.4, (vh - 120) / 1123));
      return Math.round(idealScale * 100) / 100;
    }
    return 0.85;
  });

  const activeDataset =
    layout.documentType === "tax_invoice"
      ? (layout.numberingConfig
          ? {
              ...(TEST_DATASETS[selectedDatasetKey]?.data || SAMPLE_DOCUMENT_DATA),
              document_number: formatDocNumber(layout.numberingConfig, layout.numberingConfig.nextSequence || 1),
            }
          : TEST_DATASETS[selectedDatasetKey]?.data || SAMPLE_DOCUMENT_DATA)
      : getSampleDocumentData(layout.documentType, layout.numberingConfig);
  const computedTotalPages = getDocumentPageCount(layout, activeDataset.items.length, activeDataset.items, activeDataset);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void printCurrentDocument();
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
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${computedTotalPages > 1 ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"}`}>
                {computedTotalPages > 1 ? `⚠️ ${computedTotalPages} Pages` : "✓ 1 Page A4"}
              </span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <span>Dataset:</span>
                <select
                  value={selectedDatasetKey}
                  onChange={(e) => setSelectedDatasetKey(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-amber-300 font-semibold cursor-pointer outline-none"
                >
                  {Object.entries(TEST_DATASETS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label} ({info.count} items)
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
            onClick={() => void printCurrentDocument()}
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
      <div className="designer-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain p-8 flex flex-col items-center gap-8 print:p-0 print:m-0 print:overflow-visible print:block print:w-[210mm] print:bg-white">
        {Array.from({ length: computedTotalPages }, (_, index) => {
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
                  Page {pageNum} of {computedTotalPages}
                </span>
              </div>

              {/* A4 Sheet Container */}
              <div
                className="designer-preview-sheet-container print:!transform-none print:!m-0 print:!mb-0"
                style={{
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                  transformOrigin: "top center",
                  marginBottom: scale < 1 ? `-${Math.round((1 - scale) * 297 * 3.7795)}px` : undefined,
                }}
              >
                <DynamicDocumentRenderer
                  layout={layout}
                  company={company}
                  data={activeDataset}
                  isDesignerPreview={false}
                  scale={1}
                  pageNumber={pageNum}
                  totalPages={computedTotalPages}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
