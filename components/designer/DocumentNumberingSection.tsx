"use client";

import React, { useId } from "react";
import {
  Type,
  Hash,
  RotateCcw,
  Calendar,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  DocumentLayout,
  DocumentTypeId,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import {
  DocNumberingConfig,
  DocSeparator,
  DEFAULT_NUMBERING_CONFIGS,
  formatDocNumber,
} from "@/lib/documentNumbering";

interface DocumentNumberingSectionProps {
  layout: DocumentLayout;
  onUpdateNumberingConfig?: (patch: Partial<DocNumberingConfig>) => void;
  onUpdateElement?: (id: string, patch: Partial<import("@/lib/documentDesigner").LayoutElement>) => void;
}

const TITLE_SUGGESTIONS: Record<DocumentTypeId, string[]> = {
  quotation: ["QTN", "QUOTATION", "PRICE ESTIMATE", "PROPOSAL"],
  proforma_invoice: ["PI", "PROFORMA INVOICE", "PROFORMA", "ESTIMATE INVOICE"],
  tax_invoice: ["TAX INVOICE", "INVOICE", "COMMERCIAL INVOICE"],
  delivery_note: ["DN", "DELIVERY NOTE", "DELIVERY CHALLAN", "DISPATCH NOTE"],
  purchase_order: ["PO", "PURCHASE ORDER", "SUPPLIER ORDER"],
  receipt_voucher: ["RCV", "RECEIPT VOUCHER", "OFFICIAL RECEIPT"],
  customer_statement: ["SOA", "STATEMENT OF ACCOUNT", "ACCOUNT STATEMENT"],
  supplier_bill: ["BILL", "SUPPLIER BILL", "PURCHASE INVOICE"],
  salary_statement: ["PAYSLIP", "SALARY STATEMENT", "SALARY SLIP"],
  project_handover: ["HO", "PROJECT HANDOVER CERTIFICATE", "HANDOVER CERTIFICATE"],
  work_method_statement: ["WMS", "WORK METHOD STATEMENT", "METHOD STATEMENT"],
  employee_payment_voucher: ["EPV", "PAYMENT VOUCHER", "PETTY CASH VOUCHER"],
  measurement_sheet: ["MS", "MEASUREMENT & TAKEOFF SHEET", "TAKEOFF SHEET"],
};

export default function DocumentNumberingSection({
  layout,
  onUpdateNumberingConfig,
  onUpdateElement,
}: DocumentNumberingSectionProps) {
  const titleInputId = useId();
  const titleArInputId = useId();
  const prefixInputId = useId();
  const nextSeqInputId = useId();

  const docConfig =
    DOCUMENT_TYPE_OPTIONS.find((d) => d.id === layout.documentType) ||
    DOCUMENT_TYPE_OPTIONS[0];

  const currentNumbering: DocNumberingConfig =
    layout.numberingConfig ||
    DEFAULT_NUMBERING_CONFIGS[layout.documentType] ||
    DEFAULT_NUMBERING_CONFIGS.quotation;

  const currentTitle =
    currentNumbering.customTitle ||
    layout.elements.find((e) => e.type === "doc_title")?.customText ||
    docConfig.defaultTitle;

  const currentTitleAr =
    currentNumbering.customTitleAr || docConfig.defaultTitleAr;

  const livePreview = formatDocNumber(
    currentNumbering,
    currentNumbering.nextSequence || 1
  );

  const handleTitleChange = (val: string) => {
    onUpdateNumberingConfig?.({ customTitle: val });
    const titleElem = layout.elements.find((e) => e.type === "doc_title");
    if (titleElem && onUpdateElement) {
      onUpdateElement(titleElem.id, { customText: val || undefined });
    }
  };

  const handleTitleArChange = (val: string) => {
    onUpdateNumberingConfig?.({ customTitleAr: val });
  };

  const handleResetToDefault = () => {
    const defaultCfg =
      DEFAULT_NUMBERING_CONFIGS[layout.documentType] ||
      DEFAULT_NUMBERING_CONFIGS.quotation;

    onUpdateNumberingConfig?.({ ...defaultCfg });
    const titleElem = layout.elements.find((e) => e.type === "doc_title");
    if (titleElem && onUpdateElement) {
      onUpdateElement(titleElem.id, { customText: defaultCfg.customTitle });
    }
  };

  const suggestions = TITLE_SUGGESTIONS[layout.documentType] || [
    docConfig.defaultTitle,
  ];

  return (
    <div className="space-y-5 p-3.5 text-xs">
      {/* ── 1. DOCUMENT TITLE SECTION ───────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-amber-400">
            <Type size={15} />
            <span>Document Title</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {docConfig.label}
          </span>
        </div>

        <div>
          <label
            htmlFor={titleInputId}
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Visible Document Title (English)
          </label>
          <input
            id={titleInputId}
            type="text"
            value={currentTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={`e.g. ${docConfig.defaultTitle}`}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-lg px-3 py-2 text-xs text-white font-semibold outline-none transition"
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            Displayed on PDF Designer header, document previews, print, and
            downloaded PDFs.
          </p>
        </div>

        {/* Quick Suggestion Chips */}
        <div>
          <div className="text-[10px] font-medium text-slate-400 mb-1.5">
            Quick Suggestions:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleTitleChange(sug)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                  currentTitle === sug
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60"
                }`}
              >
                {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Arabic Title */}
        <div>
          <label
            htmlFor={titleArInputId}
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Arabic Title (العنوان بالعربية)
          </label>
          <input
            id={titleArInputId}
            type="text"
            dir="rtl"
            value={currentTitleAr}
            onChange={(e) => handleTitleArChange(e.target.value)}
            placeholder={docConfig.defaultTitleAr}
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-lg px-3 py-2 text-xs text-white font-arabic text-right outline-none transition"
          />
        </div>
      </div>

      {/* ── 2. DOCUMENT NUMBER FORMAT SECTION ───────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-emerald-400">
            <Hash size={15} />
            <span>Document Number Format</span>
          </div>
          <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
            New Documents
          </span>
        </div>

        {/* Live Preview Banner */}
        <div className="rounded-lg bg-gradient-to-r from-slate-900 to-slate-800 border border-emerald-500/30 p-3 flex flex-col gap-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Live Formatted Preview</span>
            <CheckCircle2 size={12} className="text-emerald-400" />
          </div>
          <div className="font-mono text-base font-extrabold text-white tracking-wide bg-slate-950/80 px-3 py-2 rounded border border-slate-700/80 text-center select-all">
            {livePreview}
          </div>
          <div className="text-[10px] text-slate-400 leading-tight flex items-center gap-1.5 mt-0.5">
            <ShieldCheck size={11} className="text-emerald-400 shrink-0" />
            <span>
              Applied to future documents. Saved historical documents retain
              original numbers.
            </span>
          </div>
        </div>

        {/* Prefix Input (Editable or Removable) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor={prefixInputId}
              className="text-[11px] font-semibold text-slate-300"
            >
              Prefix
            </label>
            {currentNumbering.prefix && (
              <button
                type="button"
                onClick={() => onUpdateNumberingConfig?.({ prefix: "" })}
                className="text-[10px] text-red-400 hover:underline cursor-pointer"
              >
                Remove Prefix
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id={prefixInputId}
              type="text"
              value={currentNumbering.prefix}
              onChange={(e) =>
                onUpdateNumberingConfig?.({
                  prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                })
              }
              placeholder="e.g. QTN or leave empty"
              className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 rounded-lg px-3 py-2 text-xs font-mono uppercase text-white outline-none transition"
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Leave blank if you want a number-only sequence (e.g. 0001 or
            2026-0001).
          </p>
        </div>

        {/* Include Year Toggle */}
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-blue-400" />
              <span className="text-xs font-semibold text-slate-200">
                Include Year
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentNumbering.includeYear}
                onChange={(e) =>
                  onUpdateNumberingConfig?.({ includeYear: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {currentNumbering.includeYear && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              {/* Year Format */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Year Format
                </label>
                <div className="flex rounded border border-slate-700 overflow-hidden bg-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNumberingConfig?.({ yearFormat: "YYYY" })
                    }
                    className={`flex-1 py-1 text-[10px] font-bold transition cursor-pointer ${
                      currentNumbering.yearFormat === "YYYY"
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    YYYY (2026)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNumberingConfig?.({ yearFormat: "YY" })
                    }
                    className={`flex-1 py-1 text-[10px] font-bold transition cursor-pointer ${
                      currentNumbering.yearFormat === "YY"
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    YY (26)
                  </button>
                </div>
              </div>

              {/* Year Position */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Year Position
                </label>
                <div className="flex rounded border border-slate-700 overflow-hidden bg-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNumberingConfig?.({ yearPosition: "after_prefix" })
                    }
                    className={`flex-1 py-1 text-[10px] font-bold transition cursor-pointer ${
                      currentNumbering.yearPosition === "after_prefix"
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="QTN-2026-0001"
                  >
                    After Prefix
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNumberingConfig?.({
                        yearPosition: "after_sequence",
                      })
                    }
                    className={`flex-1 py-1 text-[10px] font-bold transition cursor-pointer ${
                      currentNumbering.yearPosition === "after_sequence"
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="QTN-0001-2026 or QTN/145/26"
                  >
                    After Seq
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
            Separator
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: "-", label: "Hyphen (-)" },
                { id: "/", label: "Slash (/)" },
                { id: " ", label: "Space ( )" },
                { id: "", label: "None" },
              ] as { id: DocSeparator; label: string }[]
            ).map((sep) => (
              <button
                key={sep.id}
                type="button"
                onClick={() =>
                  onUpdateNumberingConfig?.({ separator: sep.id })
                }
                className={`py-1.5 px-1 rounded text-[11px] font-mono font-bold text-center border transition cursor-pointer ${
                  currentNumbering.separator === sep.id
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                {sep.label}
              </button>
            ))}
          </div>
        </div>

        {/* Number Padding */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
            Number Padding
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[3, 4, 5, 6].map((digits) => (
              <button
                key={digits}
                type="button"
                onClick={() =>
                  onUpdateNumberingConfig?.({ padding: digits })
                }
                className={`py-1.5 px-1 rounded text-[10px] font-mono font-bold text-center border transition cursor-pointer ${
                  currentNumbering.padding === digits
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                {digits}d ({String(1).padStart(digits, "0")})
              </button>
            ))}
          </div>
        </div>

        {/* Starting / Next Sequence Number */}
        <div>
          <label
            htmlFor={nextSeqInputId}
            className="block text-[11px] font-semibold text-slate-300 mb-1"
          >
            Starting / Next Sequence Number
          </label>
          <input
            id={nextSeqInputId}
            type="number"
            min={1}
            max={999999}
            value={currentNumbering.nextSequence || 1}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              onUpdateNumberingConfig?.({ nextSequence: val });
            }}
            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none transition"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Specify the sequence number for the next created document.
          </p>
        </div>

        {/* Reset to Default */}
        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition cursor-pointer"
          >
            <RotateCcw size={12} className="text-amber-400" />
            <span>Reset to Default</span>
          </button>
        </div>
      </div>
    </div>
  );
}
