"use client";

import React, { useRef, useState } from "react";
import {
  Sliders,
  RotateCcw,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Italic,
  Table as TableIcon,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Type,
  PencilLine,
  Database,
  FileText,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  DocumentLayout,
  LayoutElement,
  ElementType,
} from "@/lib/documentDesigner";
import PageBorderSection from "./PageBorderSection";
import PrintingSettingsSection from "./PrintingSettingsSection";
import SmartFitSection from "./SmartFitSection";

// ── Universal Text Editor: Element Content Configuration ──────────────────────
// Describes what text each element type renders, whether it's dynamic, and
// what template tokens the user can insert.
interface ElementContentConfig {
  /** Human-readable label for the edit section */
  label: string;
  /** Short description of the default data source */
  description: string;
  /** Placeholder text for the textarea when empty */
  placeholder: string;
  /** If true, the element pulls data from the database by default */
  isDynamic: boolean;
  /** RTL text direction (Arabic elements) */
  isRtl?: boolean;
  /** Available template tokens that can be inserted */
  tokens?: { token: string; label: string }[];
  /** Textarea rows */
  rows?: number;
  /** Default template string that can be loaded into the textarea */
  defaultTemplate?: string;
}

const ELEMENT_CONTENT_CONFIG: Partial<Record<ElementType, ElementContentConfig>> = {
  company_name_en: {
    label: "Company Name (English)",
    description: "Shows your company's legal name from Company Settings.",
    placeholder: "Leave blank to use company name from settings",
    isDynamic: true,
    tokens: [
      { token: "{company_name}", label: "Company Legal Name" },
      { token: "{company_short}", label: "Short Name" },
    ],
    defaultTemplate: "{company_name}",
    rows: 2,
  },
  company_name_ar: {
    label: "Company Name (Arabic)",
    description: "Shows your company's Arabic name from Company Settings.",
    placeholder: "اتركه فارغًا لاستخدام اسم الشركة من الإعدادات",
    isDynamic: true,
    isRtl: true,
    tokens: [
      { token: "{company_name_ar}", label: "Arabic Company Name" },
    ],
    defaultTemplate: "{company_name_ar}",
    rows: 2,
  },
  company_address: {
    label: "Company Address & Contact",
    description: "Shows address, TRN, phone and email from Company Settings.",
    placeholder: "Leave blank to use address from settings. Use tokens: {address}, {trn}, {phone}, {email}",
    isDynamic: true,
    tokens: [
      { token: "{address}", label: "Full Address" },
      { token: "{trn}", label: "TRN" },
      { token: "{phone}", label: "Phone" },
      { token: "{email}", label: "Email" },
      { token: "{website}", label: "Website" },
    ],
    defaultTemplate: "{address}\nTRN: {trn} | Tel: {phone} | Email: {email}",
    rows: 3,
  },
  company_trn: {
    label: "Company TRN",
    description: "Shows Tax Registration Number from Company Settings.",
    placeholder: "e.g. TRN: {trn}",
    isDynamic: true,
    tokens: [
      { token: "{trn}", label: "TRN Number" },
    ],
    defaultTemplate: "TRN: {trn}",
    rows: 1,
  },
  doc_title: {
    label: "Document Title",
    description: "The main title banner (e.g. TAX INVOICE, QUOTATION).",
    placeholder: "e.g. TAX INVOICE, PROFORMA INVOICE",
    isDynamic: false,
    defaultTemplate: "TAX INVOICE",
    rows: 1,
  },
  doc_meta: {
    label: "Document Reference Info",
    description: "Shows document number, dates and status. Type below to customize or override.",
    placeholder: "Type custom reference text or use tokens: {doc_number}, {doc_date}, {due_date}...",
    isDynamic: true,
    tokens: [
      { token: "{doc_number}", label: "Doc #" },
      { token: "{doc_date}", label: "Date" },
      { token: "{due_date}", label: "Due Date" },
      { token: "{supply_date}", label: "Supply Date" },
      { token: "{payment_terms}", label: "Terms" },
      { token: "{project_name}", label: "Project" },
    ],
    defaultTemplate: "Document Reference: {doc_number}\nDate: {doc_date}\nDue Date: {due_date}\nPayment Terms: {payment_terms}",
    rows: 4,
  },
  customer_info: {
    label: "Customer / Client Details",
    description: "Shows customer name, TRN, address and contact. Type below to customize or override.",
    placeholder: "Type custom customer info or use tokens: {customer_name}, {customer_trn}...",
    isDynamic: true,
    tokens: [
      { token: "{customer_name}", label: "Customer Name" },
      { token: "{customer_trn}", label: "TRN" },
      { token: "{customer_address}", label: "Address" },
      { token: "{contact_person}", label: "Contact" },
      { token: "{contact_number}", label: "Phone" },
      { token: "{contact_email}", label: "Email" },
    ],
    defaultTemplate: "{customer_name}\nTRN: {customer_trn}\n{customer_address}\nAttn: {contact_person}\nTel: {contact_number}",
    rows: 4,
  },
  supplier_info: {
    label: "Supplier Details",
    description: "Shows supplier name, address and contact. Type below to customize or override.",
    placeholder: "Type custom supplier info or use tokens: {supplier_name}, {supplier_trn}...",
    isDynamic: true,
    tokens: [
      { token: "{supplier_name}", label: "Supplier Name" },
      { token: "{supplier_trn}", label: "TRN" },
      { token: "{supplier_address}", label: "Address" },
      { token: "{contact_person}", label: "Contact" },
    ],
    defaultTemplate: "{supplier_name}\nTRN: {supplier_trn}\n{supplier_address}\nAttn: {contact_person}",
    rows: 4,
  },
  project_info: {
    label: "Project Information",
    description: "Shows project name, site, and manager. Type below to customize or override.",
    placeholder: "Type custom project info or use tokens: {project_name}, {site_location}...",
    isDynamic: true,
    tokens: [
      { token: "{project_name}", label: "Project Name" },
      { token: "{project_number}", label: "Project #" },
      { token: "{site_location}", label: "Location" },
    ],
    defaultTemplate: "{project_name}\nProject #: {project_number}\nLocation: {site_location}",
    rows: 3,
  },
  amount_in_words: {
    label: "Amount in Words",
    description: "Shows total amount in English and Arabic words. Type below to customize or override.",
    placeholder: "Type custom amount in words or use token: {amount_in_words}",
    isDynamic: true,
    tokens: [
      { token: "{amount_in_words}", label: "Calculated Words" },
      { token: "{total_amount}", label: "Total Amount" },
    ],
    defaultTemplate: "Amount in Words:\n{amount_in_words}",
    rows: 3,
  },
  payment_terms: {
    label: "Terms & Remarks",
    description: "Shows payment terms and notes from the document record.",
    placeholder: "Leave blank to use document notes. Or type custom terms text.",
    isDynamic: true,
    tokens: [
      { token: "{payment_terms}", label: "Payment Terms" },
      { token: "{notes}", label: "Document Notes" },
    ],
    defaultTemplate: "Terms & Remarks:\n{payment_terms}",
    rows: 4,
  },
  bank_details: {
    label: "Bank Transfer Details",
    description: "Shows bank name, IBAN, SWIFT from Company Settings.",
    placeholder: "Auto-populated from company bank details",
    isDynamic: true,
    tokens: [
      { token: "{bank_name}", label: "Bank Name" },
      { token: "{iban}", label: "IBAN Number" },
      { token: "{swift}", label: "SWIFT/BIC Code" },
      { token: "{bank_account}", label: "Account Name" },
    ],
    defaultTemplate: "Bank Transfer Information:\nBank: {bank_name}\nAccount: {bank_account}\nIBAN: {iban}\nSWIFT: {swift}",
    rows: 4,
  },
  company_signature: {
    label: "Signature Label",
    description: "The text label above/below the signature image.",
    placeholder: "e.g. COMPANY AUTHORIZED SIGNATURE",
    isDynamic: false,
    defaultTemplate: "COMPANY AUTHORIZED SIGNATURE",
    rows: 1,
  },
  footer: {
    label: "Footer Text",
    description: "Shows company contact info at the page bottom.",
    placeholder: "Leave blank for default footer. Use tokens: {company_name}, {phone}, {email}, {website}",
    isDynamic: true,
    tokens: [
      { token: "{company_name}", label: "Company Name" },
      { token: "{phone}", label: "Phone" },
      { token: "{email}", label: "Email" },
      { token: "{website}", label: "Website" },
    ],
    defaultTemplate: "{company_name} | Tel: {phone} | Email: {email} | Web: {website}",
    rows: 2,
  },
  custom_text: {
    label: "Custom Text Content",
    description: "Free-form text block. You control the content entirely.",
    placeholder: "Type your custom text here...",
    isDynamic: false,
    defaultTemplate: "Custom Text Content",
    rows: 4,
  },
  watermark: {
    label: "Watermark Text",
    description: "Overlay text displayed diagonally across the document.",
    placeholder: "e.g. DRAFT, ORIGINAL, COPY, CONFIDENTIAL",
    isDynamic: false,
    rows: 1,
  },
  totals: {
    label: "Totals Section Labels",
    description: "Customize the labels for Subtotal, VAT, and Grand Total. Calculated values come from document items.",
    placeholder: "Leave blank for defaults: Subtotal, VAT Total (5%), Grand Total",
    isDynamic: true,
    tokens: [
      { token: "{subtotal_label}", label: "Subtotal Label" },
      { token: "{vat_label}", label: "VAT Label" },
      { token: "{grand_total_label}", label: "Grand Total Label" },
    ],
    defaultTemplate: "Subtotal\nVAT Total (5%)\nGrand Total",
    rows: 4,
  },
  line_items: {
    label: "Line Items Table",
    description: "Populated from document items. Use Table Settings below to configure columns and headers.",
    placeholder: "Auto-populated from document line items",
    isDynamic: true,
    rows: 1,
  },
  company_stamp: {
    label: "Company Stamp Label",
    description: "Text label displayed below the company stamp image.",
    placeholder: "e.g. OFFICIAL COMPANY STAMP",
    isDynamic: false,
    defaultTemplate: "OFFICIAL COMPANY STAMP",
    rows: 1,
  },
};

interface RightInspectorProps {
  layout: DocumentLayout;
  selectedElement: LayoutElement | null;
  onUpdateElement: (id: string, patch: Partial<LayoutElement>) => void;
  onUpdateLayoutBranding: (brandingPatch: Partial<DocumentLayout["branding"]>) => void;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
  onDeleteElement?: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  onResetElement?: (id: string) => void;
  onApplyElementToOthers?: (elem: LayoutElement) => void;
  onDuplicateElement?: (elem: LayoutElement) => void;
  onReplaceImage?: (elem: LayoutElement, file: File) => void;
  onPreviewActualSize?: () => void;
  onOpenTestSheet?: () => void;
}

const QUICK_SWATCHES = [
  "#0F172A", // Navy Primary
  "#C9A227", // Gold Accent
  "#334155", // Text Slate
  "#64748B", // Muted
  "#CBD5E1", // Border
  "#F8FAFC", // Light Slate
  "#FFFFFF", // White
  "#000000", // Black
];

const FONT_FAMILIES = [
  { label: "Default / Sans-Serif", value: "inherit" },
  { label: "Arial / Helvetica", value: "Arial, Helvetica, sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', Roboto, sans-serif" },
  { label: "Times New Roman (Serif)", value: "'Times New Roman', Times, serif" },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Courier New (Monospace)", value: "'Courier New', Courier, monospace" },
  { label: "Arabic Standard (Amiri/Segoe)", value: "'Segoe UI Arabic', 'Amiri', 'Traditional Arabic', Arial, sans-serif" },
];

export default function RightInspector({
  layout,
  selectedElement,
  onUpdateElement,
  onUpdateLayoutBranding,
  onUpdatePageSettings,
  onDeleteElement,
  onMoveLayer,
  onResetElement,
  onApplyElementToOthers,
  onDuplicateElement,
  onReplaceImage,
  onPreviewActualSize,
  onOpenTestSheet,
}: RightInspectorProps) {
  const imageReplaceInputRef = useRef<HTMLInputElement>(null);
  const [activeTabOverride, setActiveTabOverride] = useState<"element" | "page_borders" | null>(null);
  const currentElementId = selectedElement ? selectedElement.id : null;
  const [prevElementId, setPrevElementId] = useState<string | null>(currentElementId);

  if (currentElementId !== prevElementId) {
    setPrevElementId(currentElementId);
    setActiveTabOverride(null);
  }

  const activeTab = activeTabOverride || (selectedElement ? "element" : "page_borders");

  const renderPageAndBordersContent = () => (
    <div className="p-4 space-y-5 text-xs">
      {/* Page Margins */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
          Page Margins (mm)
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Top Margin</label>
            <input
              type="number"
              min={0}
              max={50}
              value={layout.page.margins.top}
              onChange={(e) =>
                onUpdatePageSettings({
                  margins: { ...layout.page.margins, top: Number(e.target.value) || 0 },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Bottom Margin</label>
            <input
              type="number"
              min={0}
              max={50}
              value={layout.page.margins.bottom}
              onChange={(e) =>
                onUpdatePageSettings({
                  margins: { ...layout.page.margins, bottom: Number(e.target.value) || 0 },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Left Margin</label>
            <input
              type="number"
              min={0}
              max={50}
              value={layout.page.margins.left}
              onChange={(e) =>
                onUpdatePageSettings({
                  margins: { ...layout.page.margins, left: Number(e.target.value) || 0 },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Right Margin</label>
            <input
              type="number"
              min={0}
              max={50}
              value={layout.page.margins.right}
              onChange={(e) =>
                onUpdatePageSettings({
                  margins: { ...layout.page.margins, right: Number(e.target.value) || 0 },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>
        </div>
      </div>

      {/* Dynamic Fitting & Adaptive Layout (A4) */}
      <SmartFitSection
        layout={layout}
        onUpdatePageSettings={onUpdatePageSettings}
        onPreviewActualSize={onPreviewActualSize}
      />

      {/* Printing & Physical Output Settings (A4) */}
      <PrintingSettingsSection
        layout={layout}
        onUpdatePageSettings={onUpdatePageSettings}
        onPreviewActualSize={onPreviewActualSize}
        onOpenTestSheet={onOpenTestSheet}
      />

      {/* Page Border & Background Design */}
      <PageBorderSection
        layout={layout}
        onUpdatePageSettings={onUpdatePageSettings}
      />

      {/* Document Branding Palette */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Document Brand Theme
        </div>

        {/* Primary Navy */}
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Primary Color (Headers)</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layout.branding.primaryColor}
              onChange={(e) => onUpdateLayoutBranding({ primaryColor: e.target.value })}
              className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400">
              {layout.branding.primaryColor}
            </span>
          </div>
        </div>

        {/* Accent Gold */}
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Gold / Accent Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layout.branding.accentColor}
              onChange={(e) => onUpdateLayoutBranding({ accentColor: e.target.value })}
              className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400">
              {layout.branding.accentColor}
            </span>
          </div>
        </div>

        {/* Table Header */}
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Table Header Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layout.branding.tableHeaderColor}
              onChange={(e) => onUpdateLayoutBranding({ tableHeaderColor: e.target.value })}
              className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400">
              {layout.branding.tableHeaderColor}
            </span>
          </div>
        </div>

        {/* Total Highlight */}
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Total Highlight Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layout.branding.totalHighlightColor}
              onChange={(e) => onUpdateLayoutBranding({ totalHighlightColor: e.target.value })}
              className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400">
              {layout.branding.totalHighlightColor}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // If NO element is selected, show Document Page Settings and Central Branding
  if (!selectedElement) {
    return (
      <aside className="designer-scrollbar flex h-full min-h-0 w-84 sm:w-88 md:w-96 min-w-[320px] max-w-[420px] shrink-0 select-none flex-col overflow-x-hidden overflow-y-auto border-l border-slate-800 bg-slate-900 text-white" tabIndex={0} aria-label="Page and branding settings">
        <div className="p-3 border-b border-slate-800 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Sliders size={15} className="text-amber-400" />
          <span>Page &amp; Branding Settings</span>
        </div>
        {renderPageAndBordersContent()}
      </aside>
    );
  }

  // Selected Element Inspector
  const elem = selectedElement;
  const isImageElement = ["logo", "watermark", "company_stamp", "company_signature", "building_image", "custom_image"].includes(elem.type);
  const contentConfig = ELEMENT_CONTENT_CONFIG[elem.type as ElementType] || null;
  // Elements that support typography controls in the "Text & Typography" section
  const isTextElement = [
    "company_name_en", "company_name_ar", "company_address", "doc_title", "doc_meta",
    "customer_info", "supplier_info", "project_info", "custom_text", "footer",
    "payment_terms", "company_trn", "company_signature", "amount_in_words", "bank_details",
    "totals", "line_items", "company_stamp"
  ].includes(elem.type) || elem.customText !== undefined;
  // Elements where customText overrides content (editable in the Universal Text Editor)
  const isContentEditable = contentConfig !== null && !["line_items"].includes(elem.type);
  // For totals, we allow customText to override labels but it's handled specially
  const isTotalsElement = elem.type === "totals";
  const isLineItemsElement = elem.type === "line_items";
  const isDataOnlyElement = contentConfig !== null && !isContentEditable && !isTotalsElement && !isLineItemsElement;
  const aspectRatio = elem.imageAspectRatio || elem.width / Math.max(1, elem.height);

  const updateWidth = (rawWidth: number) => {
    let width = Math.max(5, Math.min(layout.page.widthMm - elem.x, rawWidth || 5));
    let height = elem.height;
    if (elem.lockAspectRatio && aspectRatio > 0) {
      height = width / aspectRatio;
      if (height > layout.page.heightMm - elem.y) {
        height = layout.page.heightMm - elem.y;
        width = height * aspectRatio;
      }
    }
    onUpdateElement(elem.id, { width, height });
  };

  const updateHeight = (rawHeight: number) => {
    let height = Math.max(5, Math.min(layout.page.heightMm - elem.y, rawHeight || 5));
    let width = elem.width;
    if (elem.lockAspectRatio && aspectRatio > 0) {
      width = height * aspectRatio;
      if (width > layout.page.widthMm - elem.x) {
        width = layout.page.widthMm - elem.x;
        height = width / aspectRatio;
      }
    }
    onUpdateElement(elem.id, { width, height });
  };

  return (
    <aside className="designer-scrollbar flex h-full min-h-0 w-84 sm:w-88 md:w-96 min-w-[320px] max-w-[420px] shrink-0 select-none flex-col overflow-x-hidden overflow-y-auto border-l border-slate-800 bg-slate-900 text-white" tabIndex={0} aria-label="Element and page settings">
      {/* Top Inspector Tab Switcher */}
      <div className="flex border-b border-slate-800 bg-slate-950/80 p-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTabOverride("element")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold transition cursor-pointer ${
            activeTab === "element"
              ? "bg-slate-800 text-white shadow-sm border border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders size={13} className="text-blue-400 shrink-0" />
          <span className="truncate">{elem.label}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTabOverride("page_borders")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold transition cursor-pointer ${
            activeTab === "page_borders"
              ? "bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles size={13} className="text-amber-400 shrink-0" />
          <span className="truncate">Page &amp; Borders</span>
        </button>
      </div>

      {activeTab === "page_borders" ? (
        renderPageAndBordersContent()
      ) : (
        <>
          {/* Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-100 truncate max-w-[180px]">
                {elem.label}
              </div>
              <div className="text-[10px] text-amber-400 font-mono">
                Type: {elem.type}
              </div>
            </div>

        {/* Quick Element Actions */}
        <div className="flex items-center gap-1">
          {onApplyElementToOthers && (
            <button
              onClick={() => onApplyElementToOthers(elem)}
              className="p-1.5 rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition"
              title="Apply this element to other documents"
            >
              <Copy size={14} />
            </button>
          )}
          {onResetElement && (
            <button
              onClick={() => onResetElement(elem.id)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition"
              title="Reset this element to default"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={() => onUpdateElement(elem.id, { locked: !elem.locked })}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              elem.locked ? "text-amber-400" : "text-slate-400"
            }`}
            title={elem.locked ? "Unlock element" : "Lock position"}
          >
            {elem.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button
            onClick={() => onUpdateElement(elem.id, { visible: !elem.visible })}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              elem.visible ? "text-slate-300" : "text-red-400"
            }`}
            title={elem.visible ? "Hide element" : "Show element"}
          >
            {elem.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          {(elem.type === "custom_text" || elem.type === "divider" || elem.type === "custom_image") && onDeleteElement && (
            <button
              onClick={() => onDeleteElement(elem.id)}
              className="p-1.5 rounded hover:bg-slate-800 text-red-400 hover:text-red-300 transition"
              title="Delete element"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Prominent Locked Alert Banner */}
      {elem.locked && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <Lock size={14} className="shrink-0" />
            <span className="font-semibold text-[11px]">Element is locked</span>
          </div>
          <button
            onClick={() => onUpdateElement(elem.id, { locked: false })}
            className="text-[10px] px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
          >
            Unlock
          </button>
        </div>
      )}

      <div className="p-4 space-y-5 text-xs">
        {/* ══════════════════════════════════════════════════════════════════════
            UNIVERSAL TEXT EDITOR — Edit Content Section (appears at TOP)
            Shows for ALL elements that have text content (editable or dynamic).
            ══════════════════════════════════════════════════════════════════════ */}
        {contentConfig && (
          <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/40 to-slate-900/60 overflow-hidden">
            {/* Section Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-500/20 bg-indigo-950/30">
              <PencilLine size={14} className="text-indigo-400 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                Edit Content
              </span>
              {contentConfig.isDynamic && (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  <Database size={9} className="shrink-0" />
                  <span>Dynamic</span>
                </span>
              )}
              {!contentConfig.isDynamic && (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  <FileText size={9} className="shrink-0" />
                  <span>Static</span>
                </span>
              )}
            </div>

            <div className="p-3 space-y-2.5">
              {/* Element Label & Description */}
              <div>
                <div className="text-[11px] font-semibold text-slate-200">
                  {contentConfig.label}
                </div>
                <div className="text-[10px] text-slate-400 leading-snug mt-0.5 flex items-start gap-1">
                  <Info size={10} className="text-slate-500 shrink-0 mt-0.5" />
                  <span>{contentConfig.description}</span>
                </div>
              </div>

              {/* Text Editor Area — only for content-editable elements */}
              {isContentEditable && (
                <>
                  <div className="relative">
                    <textarea
                      id="element-content-editor-textarea"
                      rows={contentConfig.rows || 3}
                      value={elem.customText || ""}
                      onChange={(e) => onUpdateElement(elem.id, { customText: e.target.value || undefined })}
                      placeholder={contentConfig.placeholder}
                      dir={contentConfig.isRtl ? "rtl" : "ltr"}
                      className={`w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 transition placeholder:text-slate-500 resize-y min-h-[32px] ${
                        contentConfig.isRtl ? "text-right font-arabic" : ""
                      }`}
                    />
                    {elem.customText && (
                      <button
                        type="button"
                        onClick={() => onUpdateElement(elem.id, { customText: undefined })}
                        className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition"
                        title="Clear custom text and revert to default data source"
                      >
                        <RotateCcw size={9} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  {/* Status: Custom override vs Default */}
                  {elem.customText ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                      <AlertTriangle size={10} className="shrink-0" />
                      <span className="font-medium">Custom override active — default data is hidden.</span>
                    </div>
                  ) : contentConfig.isDynamic ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/8 px-2 py-1 rounded border border-emerald-500/20">
                        <Database size={10} className="shrink-0" />
                        <span>Using live data from your records. Type above to override.</span>
                      </div>
                      {contentConfig.defaultTemplate && (
                        <button
                          type="button"
                          onClick={() => onUpdateElement(elem.id, { customText: contentConfig.defaultTemplate })}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 hover:border-indigo-400/50 transition w-full justify-center"
                          title="Load the standard template format with dynamic tokens into the editor to customize it"
                        >
                          <FileText size={11} className="shrink-0" />
                          <span>Pre-fill Standard Format to Edit</span>
                        </button>
                      )}
                    </div>
                  ) : null}

                  {/* Template Token Inserter */}
                  {contentConfig.tokens && contentConfig.tokens.length > 0 && (
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                        <Type size={10} className="shrink-0" />
                        <span>Insert dynamic field:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {contentConfig.tokens.map((t) => (
                          <button
                            key={t.token}
                            type="button"
                            onClick={() => {
                              const current = elem.customText || "";
                              onUpdateElement(elem.id, { customText: current + t.token });
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 border border-slate-700 text-indigo-300 hover:bg-indigo-500/15 hover:border-indigo-500/40 hover:text-indigo-200 transition"
                            title={`Insert ${t.label} token: ${t.token}`}
                          >
                            {t.token}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Data-only elements: show info but no editable textarea */}
              {isDataOnlyElement && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-800/60 px-2 py-1.5 rounded border border-slate-700">
                  <Database size={10} className="text-emerald-400 shrink-0" />
                  <span>This section is populated automatically from your document records. Customize its appearance using the styling controls below.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick action: Apply This Element to Other Documents */}
        {onApplyElementToOthers && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => onApplyElementToOthers(elem)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs transition"
            >
              <Copy size={13} />
              <span>Apply This Element to Other Documents</span>
            </button>
          </div>
        )}

        {/* ── Position & Dimensions (in mm) ─────────────────────────────────── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center justify-between">
            <span>Position &amp; Size (mm)</span>
            <button
              onClick={() =>
                onUpdateElement(elem.id, {
                  lockAspectRatio: !elem.lockAspectRatio,
                  imageAspectRatio: isImageElement ? aspectRatio : elem.imageAspectRatio,
                })
              }
              className={`text-[10px] flex items-center gap-1 ${
                elem.lockAspectRatio ? "text-amber-400 font-semibold" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {elem.lockAspectRatio ? <Lock size={11} /> : <Unlock size={11} />}
              <span>Lock Aspect</span>
            </button>
          </div>

          {/* Image Bounding Box Helper (Matching Actual Image Aspect Ratio) */}
          {isImageElement && (
            <div className="mb-2 p-2 rounded bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Box Aspect: {Math.round((elem.width / Math.max(1, elem.height)) * 100) / 100} : 1</span>
                <button
                  type="button"
                  onClick={() => {
                    const ratio = elem.imageAspectRatio || (elem.id === "logo" ? 10 / 3 : 1);
                    const targetHeight = Math.round((elem.width / ratio) * 10) / 10;
                    onUpdateElement(elem.id, {
                      height: targetHeight,
                      lockAspectRatio: true,
                      imageAspectRatio: ratio,
                    });
                  }}
                  className="text-amber-400 hover:text-amber-300 font-medium text-[10px] underline"
                >
                  Fit Box to Image Aspect
                </button>
              </div>

              {elem.id === "logo" && (
                <div className="flex items-center gap-1 pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateElement("logo", { x: 85, y: 10, width: 40, height: 12, lockAspectRatio: true, imageAspectRatio: 10 / 3 });
                    }}
                    className="flex-1 py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] text-center"
                  >
                    Center Header (40×12)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateElement("logo", { x: 12, y: 10, width: 40, height: 12, lockAspectRatio: true, imageAspectRatio: 10 / 3 });
                    }}
                    className="flex-1 py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] text-center"
                  >
                    Left Header (40×12)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateElement("logo", { x: 92.5, y: 10, width: 25, height: 25, lockAspectRatio: true, imageAspectRatio: 1 });
                    }}
                    className="flex-1 py-0.5 px-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] text-center"
                  >
                    Square (25×25)
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">X Position</label>
              <input
                type="number"
                min={0}
                max={layout.page.widthMm - elem.width}
                step={1}
                value={Math.round(elem.x * 10) / 10}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, {
                    x: Math.max(0, Math.min(layout.page.widthMm - elem.width, Number(e.target.value) || 0)),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Y Position</label>
              <input
                type="number"
                min={0}
                max={layout.page.heightMm - elem.height}
                step={1}
                value={Math.round(elem.y * 10) / 10}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, {
                    y: Math.max(0, Math.min(layout.page.heightMm - elem.height, Number(e.target.value) || 0)),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Width</label>
              <input
                type="number"
                min={5}
                max={layout.page.widthMm - elem.x}
                step={1}
                value={Math.round(elem.width * 10) / 10}
                disabled={elem.locked}
                onChange={(e) => updateWidth(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Height</label>
              <input
                type="number"
                min={5}
                max={layout.page.heightMm - elem.y}
                step={1}
                value={Math.round(elem.height * 10) / 10}
                disabled={elem.locked}
                onChange={(e) => updateHeight(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* ── Flow & Dynamic Spacing Controls ───────────────────────────────── */}
        {elem.type !== "watermark" && elem.type !== "footer" && (
          <div className="pt-3 border-t border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center justify-between">
              <span>Dynamic Spacing &amp; Flow</span>
              <span className="text-[10px] text-amber-400 font-mono">
                {elem.flowMode === "fixed" ? "Fixed" : "Auto-Flow"}
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Positioning Behavior</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateElement(elem.id, { flowMode: "flow" })}
                    className={`py-1.5 px-2 rounded text-xs font-semibold text-center transition ${
                      elem.flowMode !== "fixed"
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                    title="Element dynamically follows table height changes, eliminating vertical gaps"
                  >
                    Flow with Table
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateElement(elem.id, { flowMode: "fixed" })}
                    className={`py-1.5 px-2 rounded text-xs font-semibold text-center transition ${
                      elem.flowMode === "fixed"
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                    title="Lock to exact static X/Y coordinates regardless of row count"
                  >
                    Fixed Position
                  </button>
                </div>
              </div>

              {elem.type === "line_items" && (
                <div className="text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800 leading-normal">
                  <span>💡 <strong>Dynamic Table Height:</strong> Table expands automatically for 1, 5, or 20 items. When content overflows A4 boundaries, pagination will create additional pages cleanly.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Layer Order Controls ─────────────────────────────────────────── */}
        <div className="pt-3 border-t border-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            Layer Hierarchy (Z-Index: {elem.zIndex})
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => onMoveLayer(elem.id, "top")}
              disabled={elem.locked}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px] disabled:opacity-40"
              title="Bring to Front"
            >
              <ArrowUpToLine size={13} />
              <span>Front</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "up")}
              disabled={elem.locked}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px] disabled:opacity-40"
              title="Bring Forward"
            >
              <ArrowUp size={13} />
              <span>Forward</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "down")}
              disabled={elem.locked}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px] disabled:opacity-40"
              title="Send Backward"
            >
              <ArrowDown size={13} />
              <span>Backward</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "bottom")}
              disabled={elem.locked}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px] disabled:opacity-40"
              title="Send to Back"
            >
              <ArrowDownToLine size={13} />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* ── Typography & Content ─────────────────────────────────────────── */}
        {isTextElement && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Text &amp; Typography
            </div>

            {/* Editable Content */}
            {isTextElement && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Text Content</label>
                <textarea
                  rows={2}
                  value={elem.customText || ""}
                  onChange={(e) => onUpdateElement(elem.id, { customText: e.target.value || undefined })}
                  placeholder="Leave blank to use document/company data"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
            )}

            {/* Font Family */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Font Family</label>
              <select
                value={elem.fontFamily || "inherit"}
                onChange={(e) => onUpdateElement(elem.id, { fontFamily: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size & Weight */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={60}
                  value={elem.fontSize || 12}
                  onChange={(e) =>
                    onUpdateElement(elem.id, { fontSize: Number(e.target.value) || 12 })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Weight</label>
                <select
                  value={elem.fontWeight || "normal"}
                  onChange={(e) =>
                    onUpdateElement(elem.id, {
                      fontWeight: e.target.value as LayoutElement["fontWeight"],
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="normal">Normal (400)</option>
                  <option value="medium">Medium (500)</option>
                  <option value="semibold">Semibold (600)</option>
                  <option value="bold">Bold (700)</option>
                  <option value="extrabold">Extrabold (800)</option>
                </select>
              </div>
            </div>

            {/* Text Alignment & Italic */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Alignment &amp; Style</label>
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded border border-slate-700">
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "left" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "left" || !elem.textAlign
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Align Left"
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "center" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "center"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Align Center"
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "right" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "right"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Align Right"
                >
                  <AlignRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "justify" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "justify"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Justify"
                >
                  <AlignJustify size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateElement(elem.id, {
                      fontStyle: elem.fontStyle === "italic" ? "normal" : "italic",
                    })
                  }
                  className={`px-2 py-1 rounded flex justify-center border-l border-slate-700 ${
                    elem.fontStyle === "italic"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Toggle Italic"
                >
                  <Italic size={14} />
                </button>
              </div>
            </div>

            {/* Line Height & Letter Spacing */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Line Height</label>
                <input
                  type="number"
                  min={0.8}
                  max={3}
                  step={0.1}
                  value={elem.lineHeight || 1.3}
                  onChange={(e) =>
                    onUpdateElement(elem.id, { lineHeight: Number(e.target.value) || 1.3 })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Letter Spacing (px)</label>
                <input
                  type="number"
                  min={-2}
                  max={10}
                  step={0.5}
                  value={elem.letterSpacing ?? 0}
                  onChange={(e) =>
                    onUpdateElement(elem.id, { letterSpacing: Number(e.target.value) || 0 })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Text Color + Quick Swatches */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400">Text Color</label>
                <span className="font-mono text-[10px] text-slate-400">{elem.color || "#0F172A"}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={elem.color || "#0F172A"}
                  onChange={(e) => onUpdateElement(elem.id, { color: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={elem.color || ""}
                  onChange={(e) => onUpdateElement(elem.id, { color: e.target.value })}
                  placeholder="#0F172A"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {QUICK_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => onUpdateElement(elem.id, { color: swatch })}
                    className="w-5 h-5 rounded-full border border-slate-700 hover:scale-110 transition shadow"
                    style={{ backgroundColor: swatch }}
                    title={swatch}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Image Specific Controls ──────────────────────────────────────── */}
        {isImageElement && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
              <ImageIcon size={14} className="text-blue-400" />
              <span>Image Properties</span>
            </div>

            {/* Image Preview & Replace */}
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded border border-slate-600 bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                  {elem.imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={elem.imageSrc}
                      alt={elem.label}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 truncate">
                    {elem.label}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {Math.round(elem.width)} × {Math.round(elem.height)} mm
                  </div>
                  <input
                    type="file"
                    ref={imageReplaceInputRef}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onReplaceImage) {
                        onReplaceImage(elem, file);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => imageReplaceInputRef.current?.click()}
                    className="mt-1.5 flex items-center gap-1 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-medium transition cursor-pointer border border-slate-600"
                  >
                    <Upload size={12} className="text-amber-400" />
                    <span>Replace Image</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Object Fit */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Object Fit</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded border border-slate-700">
                {(["contain", "cover", "fill"] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => onUpdateElement(elem.id, { imageFit: fit })}
                    className={`py-1 rounded text-[11px] capitalize ${
                      (elem.imageFit || "contain") === fit
                        ? "bg-amber-500 text-slate-950 font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400">Image Opacity</label>
                <span className="text-[10px] font-mono text-slate-300">
                  {Math.round((elem.opacity ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((elem.opacity ?? 1) * 100)}
                onChange={(e) =>
                  onUpdateElement(elem.id, { opacity: Number(e.target.value) / 100 })
                }
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        )}

        {/* ── General Styles (Background, Border, Radius, Opacity) ──────────── */}
        <div className="pt-3 border-t border-slate-800 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-400" />
            <span>Card Styling &amp; Border</span>
          </div>

          {/* Background Color */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-slate-400">Background Color</label>
              {elem.backgroundColor && (
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { backgroundColor: undefined })}
                  className="text-[10px] text-amber-400 hover:underline"
                >
                  Clear (Transparent)
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={elem.backgroundColor || "#FFFFFF"}
                onChange={(e) => onUpdateElement(elem.id, { backgroundColor: e.target.value })}
                className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={elem.backgroundColor || ""}
                onChange={(e) => onUpdateElement(elem.id, { backgroundColor: e.target.value })}
                placeholder="transparent"
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
          </div>

          {/* Border Width & Color */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Border Width (px)</label>
              <input
                type="number"
                min={0}
                max={8}
                value={elem.borderWidth ?? 0}
                onChange={(e) =>
                  onUpdateElement(elem.id, { borderWidth: Number(e.target.value) || 0 })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Corner Radius (px)</label>
              <input
                type="number"
                min={0}
                max={24}
                value={elem.borderRadius ?? 0}
                onChange={(e) =>
                  onUpdateElement(elem.id, { borderRadius: Number(e.target.value) || 0 })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {elem.borderWidth ? (
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Border Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={elem.borderColor || "#CBD5E1"}
                  onChange={(e) => onUpdateElement(elem.id, { borderColor: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={elem.borderColor || ""}
                  onChange={(e) => onUpdateElement(elem.id, { borderColor: e.target.value })}
                  placeholder="#CBD5E1"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Table Designer (When Line-Item Table selected) ───────────────── */}
        {elem.type === "line_items" && elem.tableSettings && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
              <TableIcon size={14} className="text-emerald-400" />
              <span>Line-Item Table Settings</span>
            </div>

            {/* Header Colors */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Header Background</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={elem.tableSettings.headerBg}
                    onChange={(e) =>
                      onUpdateElement(elem.id, {
                        tableSettings: { ...elem.tableSettings!, headerBg: e.target.value },
                      })
                    }
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    {elem.tableSettings.headerBg}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Header Text</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={elem.tableSettings.headerTextColor}
                    onChange={(e) =>
                      onUpdateElement(elem.id, {
                        tableSettings: { ...elem.tableSettings!, headerTextColor: e.target.value },
                      })
                    }
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    {elem.tableSettings.headerTextColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Font & Row Height */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={16}
                  value={elem.tableSettings.fontSize}
                  onChange={(e) =>
                    onUpdateElement(elem.id, {
                      tableSettings: {
                        ...elem.tableSettings!,
                        fontSize: Number(e.target.value) || 10,
                      },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Row Height</label>
                <input
                  type="number"
                  min={6}
                  max={20}
                  value={elem.tableSettings.rowHeight}
                  onChange={(e) =>
                    onUpdateElement(elem.id, {
                      tableSettings: {
                        ...elem.tableSettings!,
                        rowHeight: Number(e.target.value) || 8,
                      },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            </div>

            {/* Table Columns Config */}
            <div className="pt-2 space-y-2">
              {/* Quick Toggle for Calculation Type (Measurement Takeoff) */}
              {elem.tableSettings.columns.some((c) => c.key === "calc_type") && (
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300 text-[11px]">
                      Calculation Type &amp; Formula
                    </span>
                    {(() => {
                      const calcColIdx = elem.tableSettings.columns.findIndex((c) => c.key === "calc_type");
                      const isVisible = calcColIdx >= 0 && elem.tableSettings.columns[calcColIdx].visible;
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...elem.tableSettings!.columns];
                            if (calcColIdx >= 0) {
                              updated[calcColIdx] = {
                                ...updated[calcColIdx],
                                visible: !isVisible,
                              };
                              onUpdateElement(elem.id, {
                                tableSettings: { ...elem.tableSettings!, columns: updated },
                              });
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                            isVisible
                              ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                              : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
                          }`}
                          title="Toggle Calculation Type & Formula column in Measurement Sheet"
                        >
                          {isVisible ? "Visible" : "Hidden (Removed)"}
                        </button>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Formulas are hidden by default for clean presentation. Click to toggle this column in the PDF.
                  </p>
                </div>
              )}

              {/* Quick Toggle for UAE VAT in Takeoff Summary (Measurement Sheet) */}
              {layout.documentType === "measurement_sheet" && (
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300 text-[11px]">
                      UAE VAT (5%) in Takeoff Summary
                    </span>
                    {(() => {
                      const totalsElem = layout.elements.find((e) => e.type === "totals");
                      const isVatDisabled = totalsElem?.customText === "vat_disabled";
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (totalsElem) {
                              onUpdateElement(totalsElem.id, {
                                customText: isVatDisabled ? undefined : "vat_disabled",
                              });
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                            !isVatDisabled
                              ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                              : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
                          }`}
                          title="Toggle 5% UAE VAT in Takeoff Summary"
                        >
                          {!isVatDisabled ? "5% VAT: Active" : "VAT: Disabled"}
                        </button>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Shows Net Subtotal, 5% UAE VAT, and Grand Total in the Takeoff Summary card.
                  </p>
                </div>
              )}

              <label className="text-[10px] font-bold text-slate-400 block mb-1.5">
                Columns Configuration (Show / Hide &amp; Width)
              </label>
              <div className="space-y-1.5 pr-1">
                {elem.tableSettings.columns.map((col, idx) => (
                  <div
                    key={col.key}
                    className="flex items-center justify-between p-1.5 rounded bg-slate-800/80 border border-slate-700/80 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...elem.tableSettings!.columns];
                          updated[idx] = { ...col, visible: !col.visible };
                          onUpdateElement(elem.id, {
                            tableSettings: { ...elem.tableSettings!, columns: updated },
                          });
                        }}
                        className={`p-0.5 rounded ${
                          col.visible ? "text-amber-400" : "text-slate-600"
                        }`}
                        title={col.visible ? "Hide Column" : "Show Column"}
                      >
                        {col.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <span className={col.visible ? "text-slate-200" : "text-slate-500 line-through"}>
                        {col.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={80}
                        value={col.widthPct}
                        onChange={(e) => {
                          const updated = [...elem.tableSettings!.columns];
                          updated[idx] = { ...col, widthPct: Number(e.target.value) || 10 };
                          onUpdateElement(elem.id, {
                            tableSettings: { ...elem.tableSettings!, columns: updated },
                          });
                        }}
                        className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right font-mono text-[10px] text-white"
                      />
                      <span className="text-[9px] text-slate-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

              {/* Column Header Labels Editor */}
              <div className="pt-2 border-t border-slate-700">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
                  <Type size={12} className="text-emerald-400" />
                  <span>Column Header Labels</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">Customize English and Arabic labels for each visible column.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {elem.tableSettings.columns
                    .filter((col) => col.visible)
                    .map((col) => (
                      <div key={col.key} className="p-2 bg-slate-800/50 rounded border border-slate-700">
                        <div className="text-[9px] font-mono text-slate-500 mb-1">{col.key}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">English Label</label>
                            <input
                              type="text"
                              value={col.label}
                              onChange={(e) => {
                                const newColumns = elem.tableSettings!.columns.map((c) =>
                                  c.key === col.key ? { ...c, label: e.target.value } : c
                                );
                                onUpdateElement(elem.id, { tableSettings: { ...elem.tableSettings!, columns: newColumns } });
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-emerald-400"
                              placeholder="English label"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block mb-0.5">Arabic Label (optional)</label>
                            <input
                              type="text"
                              value={col.labelAr || ""}
                              onChange={(e) => {
                                const newColumns = elem.tableSettings!.columns.map((c) =>
                                  c.key === col.key ? { ...c, labelAr: e.target.value || undefined } : c
                                );
                                onUpdateElement(elem.id, { tableSettings: { ...elem.tableSettings!, columns: newColumns } });
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-emerald-400"
                              placeholder="Arabic label"
                              dir="rtl"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Totals Card Configuration ───────────────────────────────────── */}
        {elem.type === "totals" && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Totals &amp; Summary Configuration
            </div>
            {layout.documentType === "measurement_sheet" && (
              <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300 text-[11px]">
                    UAE VAT (5%) Calculation
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const isVatDisabled = elem.customText === "vat_disabled";
                      onUpdateElement(elem.id, {
                        customText: isVatDisabled ? undefined : "vat_disabled",
                      });
                    }}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                      elem.customText !== "vat_disabled"
                        ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {elem.customText !== "vat_disabled" ? "5% VAT: Active" : "VAT: Disabled"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Calculates 5% standard UAE VAT on net measurement total and displays Grand Total (Inc. VAT).
                </p>
              </div>
            )}
          </div>
        )}

        {/* Totals Labels Editor (for non-measurement document types) */}
        {elem.type === "totals" && layout.documentType !== "measurement_sheet" && (
          <div className="pt-2 border-t border-slate-700">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
              <Type size={12} className="text-amber-400" />
              <span>Totals Row Labels</span>
            </div>
            <p className="text-[10px] text-slate-500 mb-2">Customize English &amp; Arabic labels for totals rows.</p>
            <div className="space-y-2.5">
              <div className="p-2 bg-slate-800/50 rounded border border-slate-700">
                <div className="text-[9px] font-bold text-slate-400 mb-1">Subtotal</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={elem.totalsLabels?.subtotal || "Subtotal"}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, subtotal: e.target.value } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="English"
                  />
                  <input
                    type="text"
                    value={elem.totalsLabels?.subtotalAr || ""}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, subtotalAr: e.target.value || undefined } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="العربية"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="p-2 bg-slate-800/50 rounded border border-slate-700">
                <div className="text-[9px] font-bold text-slate-400 mb-1">VAT Total</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={elem.totalsLabels?.vat || "VAT Total (5%)"}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, vat: e.target.value } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="English"
                  />
                  <input
                    type="text"
                    value={elem.totalsLabels?.vatAr || ""}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, vatAr: e.target.value || undefined } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="العربية"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="p-2 bg-slate-800/50 rounded border border-slate-700">
                <div className="text-[9px] font-bold text-slate-400 mb-1">Grand Total</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={elem.totalsLabels?.grandTotal || "Grand Total"}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, grandTotal: e.target.value } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="English"
                  />
                  <input
                    type="text"
                    value={elem.totalsLabels?.grandTotalAr || ""}
                    onChange={(e) => onUpdateElement(elem.id, { totalsLabels: { ...elem.totalsLabels, grandTotalAr: e.target.value || undefined } })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-amber-400"
                    placeholder="العربية"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Actions Group ───────────────────────────────────── */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          {onDuplicateElement && (
            <button
              type="button"
              onClick={() => onDuplicateElement(elem)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition font-semibold text-xs cursor-pointer"
              title="Duplicate this element with all settings"
            >
              <Copy size={13} className="text-blue-400" />
              <span>Duplicate Element</span>
            </button>
          )}

          {onResetElement && (
            <button
              type="button"
              onClick={() => onResetElement(elem.id)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition font-semibold text-xs cursor-pointer"
              title="Reset this element to UAE Corporate Professional Default"
            >
              <RotateCcw size={13} />
              <span>Reset Element to Default Layout</span>
            </button>
          )}

          {(elem.type === "custom_text" || elem.type === "divider" || elem.type === "custom_image") && onDeleteElement && (
            <button
              type="button"
              onClick={() => onDeleteElement(elem.id)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition font-semibold text-xs cursor-pointer"
              title="Delete element from document"
            >
              <Trash2 size={13} />
              <span>Delete Element</span>
            </button>
          )}
        </div>
      </div>
      </>
      )}
    </aside>
  );
}
