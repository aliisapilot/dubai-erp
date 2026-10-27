"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  X,
  Save,
  Printer,
  FileCheck2,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  Building2,
  UserCheck,
} from "lucide-react";
import { DocumentTypeId } from "@/lib/documentDesigner";
import { CompanyDocInfo } from "./DocHeader";
import DynamicDocumentRenderer, {
  MockDocumentData,
  getDocumentPageCount,
} from "./DynamicDocumentRenderer";
import { usePersistedDocumentDesign } from "./usePersistedDocumentDesign";
import { calcLineItem, fmtAED, todayISO } from "@/lib/helpers";

export interface EditorLineItem {
  id?: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
  vat_rate: number;
  taxable_amount: number;
  vat_amount: number;
  line_total: number;
}

export interface DocumentEditorFormState {
  customer_id: string;
  project_id: string;
  invoice_date: string;
  supply_date: string;
  due_date?: string;
  payment_terms: string;
  status: string;
  notes: string;
  terms?: string;
  party_mode?: "existing" | "custom";
  is_custom_customer?: boolean;
  is_custom_supplier?: boolean;
  customer_name?: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  custom_project_name?: string | null;
  supplier_name?: string;
  supplier_trn?: string | null;
  supplier_address?: string | null;
}

export const PRESET_PAYMENT_TERMS = [
  {
    name: "50% Advance / 50% Balance (Standard)",
    terms: [
      "Advance 50% to be released along with order confirmation.",
      "Balance 50% to be released after completion.",
    ],
  },
  {
    name: "100% Advance Payment",
    terms: ["100% advance payment against proforma invoice."],
  },
  {
    name: "30 Days Credit",
    terms: ["100% payment within 30 days from invoice date."],
  },
  {
    name: "30% Advance / 60% Delivery / 10% Handover",
    terms: [
      "30% advance on confirmation.",
      "60% upon delivery of materials at site.",
      "10% after completion & handover.",
    ],
  },
  {
    name: "Cash on Delivery (COD)",
    terms: ["100% payment on delivery and physical inspection."],
  },
];

export interface DocumentSplitScreenEditorProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentTypeId;
  documentTitle?: string;
  documentNumberLabel?: string;
  company: CompanyDocInfo | null;
  initialInvoice?: {
    id?: string;
    invoice_number?: string | null;
    quotation_number?: string | null;
    proforma_number?: string | null;
    purchase_order_number?: string | null;
    delivery_note_number?: string | null;
    customer_id?: string | null;
    supplier_id?: string | null;
    project_id?: string | null;
    invoice_date?: string | null;
    quotation_date?: string | null;
    proforma_date?: string | null;
    order_date?: string | null;
    delivery_date?: string | null;
    supply_date?: string | null;
    due_date?: string | null;
    valid_until?: string | null;
    expiry_date?: string | null;
    expected_date?: string | null;
    payment_terms?: string | null;
    status?: string | null;
    notes?: string | null;
    terms?: string | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    total_amount?: number | null;
    customer_name?: string | null;
    customer_address?: string | null;
    customer_trn?: string | null;
    contact_person?: string | null;
    contact_number?: string | null;
    contact_mobile?: string | null;
    contact_email?: string | null;
    custom_project_name?: string | null;
    is_custom_customer?: boolean | null;
    supplier_name?: string | null;
    supplier_address?: string | null;
    supplier_trn?: string | null;
    is_custom_supplier?: boolean | null;
    custom_customer?: unknown;
    custom_supplier?: unknown;
  } | null;
  initialLines?: EditorLineItem[];
  customers?: Array<{
    id: string;
    name: string | null;
    customer_code?: string | null;
    trn?: string | null;
    address?: string | null;
    contact_person?: string | null;
    phone?: string | null;
    mobile?: string | null;
    email?: string | null;
    active?: boolean | null;
  }>;
  suppliers?: Array<{
    id: string;
    name: string | null;
    supplier_code?: string | null;
    trn?: string | null;
    address?: string | null;
    contact_person?: string | null;
    phone?: string | null;
    email?: string | null;
    active?: boolean | null;
  }>;
  partyType?: "customer" | "supplier";
  partyLabel?: string;
  projects?: Array<{ id: string; project_number: string; name: string }>;
  products?: Array<{
    id: string;
    name: string | null;
    sku?: string | null;
    selling_price?: number | null;
    cost_price?: number | null;
    vat_rate?: number | null;
    unit?: string | null;
  }>;
  onSave: (payload: {
    form: DocumentEditorFormState;
    lines: EditorLineItem[];
    subtotal: number;
    vat_amount: number;
    total_amount: number;
  }) => Promise<void>;
  saving?: boolean;
  onRename?: () => void;
}

const emptyLine = (): EditorLineItem => ({
  product_id: "",
  description: "",
  quantity: 1,
  unit: "Nos",
  unit_price: 0,
  discount_pct: 0,
  vat_rate: 5,
  taxable_amount: 0,
  vat_amount: 0,
  line_total: 0,
});

function recalc(item: EditorLineItem): EditorLineItem {
  const { taxable, vatAmount, lineTotal } = calcLineItem(
    item.quantity,
    item.unit_price,
    item.discount_pct,
    item.vat_rate
  );
  return {
    ...item,
    taxable_amount: taxable,
    vat_amount: vatAmount,
    line_total: lineTotal,
  };
}

function parseTermsToList(raw?: string | null): string[] {
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n/)
    .map((t) => t.trim().replace(/^[-•*➢]\s*/, ""))
    .filter(Boolean);
  return lines.length > 0 ? lines : [];
}

function DocumentSplitScreenEditorWorkspace({
  onClose,
  documentType,
  documentTitle = "Document",
  documentNumberLabel,
  company,
  initialInvoice,
  initialLines,
  customers = [],
  suppliers = [],
  partyType = "customer",
  partyLabel,
  projects = [],
  products = [],
  onSave,
  saving = false,
  onRename,
}: DocumentSplitScreenEditorProps) {
  const design = usePersistedDocumentDesign(company?.id, documentType);

  const effectiveDocNumber =
    initialInvoice?.invoice_number ||
    initialInvoice?.quotation_number ||
    initialInvoice?.proforma_number ||
    initialInvoice?.purchase_order_number ||
    initialInvoice?.delivery_note_number ||
    null;

  const initialPrimaryDate =
    initialInvoice?.invoice_date ||
    initialInvoice?.quotation_date ||
    initialInvoice?.proforma_date ||
    initialInvoice?.order_date ||
    initialInvoice?.delivery_date ||
    todayISO();

  const initialSecondaryDate =
    initialInvoice?.supply_date ||
    initialInvoice?.valid_until ||
    initialInvoice?.expiry_date ||
    initialInvoice?.expected_date ||
    todayISO();

  const [form, setForm] = useState<DocumentEditorFormState>(() => ({
    customer_id: initialInvoice?.customer_id || initialInvoice?.supplier_id || "",
    project_id: initialInvoice?.project_id || "",
    invoice_date: initialPrimaryDate,
    supply_date: initialSecondaryDate,
    due_date: initialInvoice?.due_date || "",
    payment_terms: initialInvoice?.payment_terms || "30 days",
    status: initialInvoice?.status || "draft",
    notes: initialInvoice?.notes || "",
    terms: initialInvoice?.terms || "",
  }));

  const isSupplierParty = partyType === "supplier";
  const partyLabelSingle = isSupplierParty ? "Supplier" : "Customer";

  const initiallyCustom = Boolean(
    initialInvoice?.is_custom_customer ||
    initialInvoice?.is_custom_supplier ||
    (!initialInvoice?.customer_id && !initialInvoice?.supplier_id && (initialInvoice?.customer_name || initialInvoice?.supplier_name))
  );

  const [partyMode, setPartyMode] = useState<"existing" | "custom">(
    initiallyCustom ? "custom" : "existing"
  );

  const [customParty, setCustomParty] = useState<{
    name: string;
    address: string;
    contact_person: string;
    phone: string;
    email: string;
    trn: string;
    project_name: string;
  }>(() => ({
    name: initialInvoice?.customer_name || initialInvoice?.supplier_name || "",
    address: initialInvoice?.customer_address || initialInvoice?.supplier_address || "",
    contact_person: initialInvoice?.contact_person || (initialInvoice as Record<string, unknown>)?.vendor_contact as string || "",
    phone: initialInvoice?.contact_number || (initialInvoice as Record<string, unknown>)?.contact_mobile as string || (initialInvoice as Record<string, unknown>)?.vendor_mobile as string || "",
    email: initialInvoice?.contact_email || (initialInvoice as Record<string, unknown>)?.vendor_email as string || "",
    trn: initialInvoice?.customer_trn || initialInvoice?.supplier_trn || (initialInvoice as Record<string, unknown>)?.vendor_trn as string || "",
    project_name: (initialInvoice as Record<string, unknown>)?.custom_project_name as string || "",
  }));

  // Editable bullet terms state
  const [termsList, setTermsList] = useState<string[]>(() => {
    const parsed = parseTermsToList(initialInvoice?.payment_terms);
    return parsed.length > 0 ? parsed : [initialInvoice?.payment_terms || "30 days"];
  });

  const [lines, setLines] = useState<EditorLineItem[]>(() => {
    if (initialLines && initialLines.length > 0) {
      return initialLines.map(recalc);
    }
    return [emptyLine()];
  });

  const [activeTabMobile, setActiveTabMobile] = useState<"form" | "preview">("form");
  const [previewFullscreen, setPreviewFullscreen] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(0.85);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [dirty, setDirty] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const isIssuedOriginal =
    (initialInvoice?.status || "").toLowerCase() === "issued" ||
    (initialInvoice?.status || "") === "Final" ||
    (initialInvoice?.status || "").toLowerCase() === "paid" ||
    (initialInvoice?.status || "").toLowerCase() === "partially_paid";

  const [isUnlockedForEdit, setIsUnlockedForEdit] = useState<boolean>(!isIssuedOriginal);
  const isFormDisabled = isIssuedOriginal && !isUnlockedForEdit;

  // Lookup maps
  const custMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const suppMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);
  const projMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const selectedCustomer = partyType === "customer" ? custMap[form.customer_id] : null;
  const selectedSupplier = partyType === "supplier" ? suppMap[form.customer_id] : null;
  const selectedProject = projMap[form.project_id];

  // Financial calculations
  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.taxable_amount, 0);
    const vat = lines.reduce((s, l) => s + l.vat_amount, 0);
    return { sub, vat, total: sub + vat };
  }, [lines]);

  // Line manipulation handlers
  const handleProductSelect = useCallback(
    (idx: number, pid: string) => {
      const prod = products.find((p) => p.id === pid);
      setLines((prev) =>
        prev.map((l, i) =>
          i !== idx
            ? l
            : recalc({
                ...l,
                product_id: pid,
                description: prod?.name || l.description,
                unit: prod?.unit || l.unit || "Nos",
                unit_price:
                  partyType === "supplier"
                    ? prod?.cost_price ?? prod?.selling_price ?? l.unit_price
                    : prod?.selling_price ?? l.unit_price,
                vat_rate: prod?.vat_rate ?? 5,
              })
        )
      );
      setDirty(true);
    },
    [products, partyType]
  );

  const handleUpdateLine = useCallback((idx: number, patch: Partial<EditorLineItem>) => {
    setLines((prev) => prev.map((l, i) => (i !== idx ? l : recalc({ ...l, ...patch }))));
    setDirty(true);
  }, []);

  const handleAddLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
    setDirty(true);
  }, []);

  const handleRemoveLine = useCallback((idx: number) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
    setDirty(true);
  }, []);

  const handleFormChange = (key: keyof DocumentEditorFormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  // Payment terms bullet manipulation handlers
  const syncTerms = (newList: string[]) => {
    setTermsList(newList);
    const joined = newList.filter((t) => t.trim().length > 0).join("\n");
    setForm((prev) => ({ ...prev, payment_terms: joined }));
    setDirty(true);
  };

  const handleAddTerm = () => {
    syncTerms([...termsList, ""]);
  };

  const handleUpdateTerm = (idx: number, val: string) => {
    const updated = [...termsList];
    updated[idx] = val;
    syncTerms(updated);
  };

  const handleRemoveTerm = (idx: number) => {
    const updated = termsList.filter((_, i) => i !== idx);
    syncTerms(updated.length > 0 ? updated : [""]);
  };

  const handleMoveTerm = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= termsList.length) return;
    const updated = [...termsList];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    syncTerms(updated);
  };

  const handleApplyPreset = (presetTerms: string[]) => {
    syncTerms([...presetTerms]);
  };

  // Construct real-time MockDocumentData for the Live PDF preview
  const previewData: MockDocumentData = useMemo(() => {
    const isNew = !effectiveDocNumber;
    const effectiveNumber = isNew ? "[DRAFT - Assigned on Save]" : effectiveDocNumber;

    const isCustom = partyMode === "custom";

    const partyName = isCustom
      ? customParty.name.trim() || (isSupplierParty ? "Supplier / Vendor Name" : "Customer / Client Name")
      : isSupplierParty
      ? selectedSupplier?.name || "Supplier / Vendor Name"
      : selectedCustomer?.name || "Customer / Client Name";

    const partyTrn = isCustom
      ? customParty.trn.trim() || undefined
      : isSupplierParty
      ? selectedSupplier?.trn || undefined
      : selectedCustomer?.trn || undefined;

    const partyAddress = isCustom
      ? customParty.address.trim() || undefined
      : isSupplierParty
      ? selectedSupplier?.address || undefined
      : selectedCustomer?.address || undefined;

    const partyContact = isCustom
      ? customParty.contact_person.trim() || undefined
      : isSupplierParty
      ? selectedSupplier?.contact_person || undefined
      : selectedCustomer?.contact_person || undefined;

    const partyPhone = isCustom
      ? customParty.phone.trim() || undefined
      : isSupplierParty
      ? selectedSupplier?.phone || undefined
      : selectedCustomer?.phone || selectedCustomer?.mobile || undefined;

    const partyEmail = isCustom
      ? customParty.email.trim() || undefined
      : isSupplierParty
      ? selectedSupplier?.email || undefined
      : selectedCustomer?.email || undefined;

    const effectiveProjectName = isCustom && customParty.project_name.trim()
      ? customParty.project_name.trim()
      : selectedProject?.name || undefined;

    return {
      document_number: effectiveNumber,
      document_date: form.invoice_date,
      supply_date: form.supply_date,
      due_date: form.due_date,
      status: form.status,
      customer_name: partyName,
      customer_trn: partyTrn,
      customer_address: partyAddress,
      supplier_name: isSupplierParty ? partyName : undefined,
      contact_person: partyContact,
      contact_number: partyPhone,
      contact_email: partyEmail,
      project_name: effectiveProjectName,
      project_number: selectedProject?.project_number || undefined,
      payment_terms: form.payment_terms,
      notes: form.notes,
      subtotal: totals.sub,
      vat_amount: totals.vat,
      total_amount: totals.total,
      items: lines.map((l) => ({
        description: l.description || "Description",
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        discount: l.discount_pct,
        vat_rate: l.vat_rate,
        vat_amount: l.vat_amount,
        line_total: l.line_total,
      })),
    };
  }, [
    effectiveDocNumber,
    partyType,
    partyMode,
    customParty,
    isSupplierParty,
    selectedCustomer,
    selectedSupplier,
    selectedProject,
    form,
    totals,
    lines,
  ]);

  const totalPreviewPages = useMemo(() => {
    if (!design.layout) return 1;
    return getDocumentPageCount(
      design.layout,
      previewData.items.length,
      previewData.items,
      previewData
    );
  }, [design.layout, previewData]);

  const handleClose = () => {
    if (dirty) {
      if (!confirm("You have unsaved changes in this document. Discard changes and close?")) {
        return;
      }
    }
    onClose();
  };

  const handleSaveDocument = async (targetStatus?: string) => {
    const isCustom = partyMode === "custom";
    if (isCustom) {
      if (!customParty.name.trim()) {
        setError(`Please enter ${partyLabelSingle} Name.`);
        return;
      }
    } else {
      if (!form.customer_id) {
        setError(`Please select an existing ${partyLabelSingle}.`);
        return;
      }
    }
    if (lines.length === 0 || !lines[0].description) {
      setError("Please add at least one line item with a description.");
      return;
    }

    setError("");
    const finalStatus = targetStatus || form.status;
    const finalCustomerName = isCustom
      ? customParty.name.trim()
      : isSupplierParty
      ? selectedSupplier?.name || ""
      : selectedCustomer?.name || "";
    const finalTrn = isCustom
      ? customParty.trn.trim() || null
      : isSupplierParty
      ? selectedSupplier?.trn || null
      : selectedCustomer?.trn || null;
    const finalAddress = isCustom
      ? customParty.address.trim() || null
      : isSupplierParty
      ? selectedSupplier?.address || null
      : selectedCustomer?.address || null;
    const finalContact = isCustom
      ? customParty.contact_person.trim() || null
      : isSupplierParty
      ? selectedSupplier?.contact_person || null
      : selectedCustomer?.contact_person || null;
    const finalPhone = isCustom
      ? customParty.phone.trim() || null
      : isSupplierParty
      ? selectedSupplier?.phone || null
      : selectedCustomer?.phone || selectedCustomer?.mobile || null;
    const finalEmail = isCustom
      ? customParty.email.trim() || null
      : isSupplierParty
      ? selectedSupplier?.email || null
      : selectedCustomer?.email || null;
    const finalProjectName = isCustom
      ? customParty.project_name.trim() || null
      : selectedProject?.name || null;

    await onSave({
      form: {
        ...form,
        status: finalStatus,
        party_mode: partyMode,
        is_custom_customer: isCustom && !isSupplierParty,
        is_custom_supplier: isCustom && isSupplierParty,
        customer_name: finalCustomerName,
        customer_trn: finalTrn,
        customer_address: finalAddress,
        contact_person: finalContact,
        contact_number: finalPhone,
        contact_email: finalEmail,
        custom_project_name: finalProjectName,
        supplier_name: isSupplierParty ? finalCustomerName : undefined,
        supplier_trn: isSupplierParty ? finalTrn : undefined,
        supplier_address: isSupplierParty ? finalAddress : undefined,
      },
      lines,
      subtotal: totals.sub,
      vat_amount: totals.vat,
      total_amount: totals.total,
    });
    setDirty(false);
  };

  const handlePrint = () => {
    window.print();
  };

  // Label helpers based on document type
  const primaryDateLabel =
    documentType === "quotation"
      ? "Quotation Date"
      : documentType === "proforma_invoice"
      ? "Proforma Date"
      : documentType === "purchase_order"
      ? "Order Date"
      : documentType === "delivery_note"
      ? "Delivery Date"
      : "Invoice Date";

  const secondaryDateLabel =
    documentType === "quotation"
      ? "Valid Until / Expiry Date"
      : documentType === "proforma_invoice"
      ? "Valid Until"
      : documentType === "purchase_order"
      ? "Expected Delivery Date"
      : documentType === "delivery_note"
      ? "Dispatch Date"
      : "Date of Supply";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-150">
      {/* ── Top Header Bar ────────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <FileCheck2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-wide">
                {effectiveDocNumber ? `Edit ${documentTitle}` : `New ${documentTitle}`}
              </h2>
              <span className="font-mono text-xs rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                {effectiveDocNumber || "[Draft Preview]"}
              </span>
              {effectiveDocNumber && onRename && (
                <button
                  type="button"
                  onClick={onRename}
                  className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-0.5 text-xs font-bold text-amber-300 transition cursor-pointer"
                  title="Edit document reference number independently"
                >
                  <Pencil size={11} />
                  <span>Edit Number</span>
                </button>
              )}
              {dirty ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  Unsaved Changes
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  Live Sync
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5 lg:hidden">
          <button
            type="button"
            onClick={() => setActiveTabMobile("form")}
            className={`px-3 py-1 text-xs font-semibold rounded-md ${
              activeTabMobile === "form" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
            }`}
          >
            Editor Form
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMobile("preview")}
            className={`px-3 py-1 text-xs font-semibold rounded-md ${
              activeTabMobile === "preview" ? "bg-blue-600 text-white font-bold" : "text-slate-300"
            }`}
          >
            Live PDF
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            title="Print or Export PDF"
          >
            <Printer size={14} className="text-indigo-400" />
            <span className="hidden sm:inline">Print / Export</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveDocument("draft")}
            disabled={saving || isFormDisabled}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer disabled:opacity-50"
            title="Save as Draft"
          >
            <Save size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveDocument()}
            disabled={saving || isFormDisabled}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-md transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span>{saving ? "Saving…" : effectiveDocNumber ? "Save Changes" : "Save Document"}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            title="Close editor (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── Main Split-Screen Workspace ───────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* LEFT PANEL: Editable Document Form */}
        <div
          className={`flex flex-col border-r border-slate-800 bg-slate-900/90 text-slate-200 overflow-y-auto designer-scrollbar ${
            previewFullscreen ? "hidden" : "w-full lg:w-1/2"
          } ${activeTabMobile === "form" ? "block" : "hidden lg:flex"}`}
        >
          <div className="p-5 space-y-5">
            {error && (
              <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center justify-between">
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>
                  <X size={14} />
                </button>
              </div>
            )}

            {isIssuedOriginal && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertTriangle size={16} />
                    <span>Issued Document Accounting Controls</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUnlockedForEdit(!isUnlockedForEdit)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isUnlockedForEdit
                        ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                        : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
                    }`}
                  >
                    <Pencil size={12} />
                    <span>{isUnlockedForEdit ? "Lock Editing" : "Unlock for Editing"}</span>
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  {isUnlockedForEdit
                    ? "Document unlocked for amendment. You can modify line items, quantities, rates, details, or dates. Changes are reflected in real-time in the live preview."
                    : "This document is marked as Issued/Final. In accordance with accounting controls, fields are locked by default. Click 'Unlock for Editing' above to amend details."}
                </p>
              </div>
            )}

            {/* Document Metadata Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>{documentTitle} Details</span>
                <span className="text-[10px] text-amber-400 font-mono">Live Sync Active</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Reference Number */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {documentNumberLabel || `${documentTitle} Reference Number`}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-mono font-bold text-emerald-400">
                      {effectiveDocNumber || "[Draft - Generated on Save]"}
                    </div>
                    {effectiveDocNumber && onRename && (
                      <button
                        type="button"
                        onClick={onRename}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                        title="Edit Number independently"
                      >
                        <Pencil size={12} />
                        <span>Edit Number</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Party (Customer / Supplier) Selection */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      {partyLabel || (partyType === "supplier" ? "Supplier / Vendor" : "Customer / Client")}{" "}
                      <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {partyMode === "custom" ? "Direct Manual Entry" : "Saved Database"}
                    </span>
                  </div>

                  {/* Mode Toggle Switcher */}
                  <div className="flex rounded-lg border border-slate-700 bg-slate-900/90 p-1 mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPartyMode("existing");
                        setDirty(true);
                      }}
                      disabled={isFormDisabled}
                      className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        partyMode === "existing"
                          ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Building2 size={13} />
                      <span>Existing {partyLabelSingle}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPartyMode("custom");
                        setDirty(true);
                      }}
                      disabled={isFormDisabled}
                      className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        partyMode === "custom"
                          ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <UserCheck size={13} />
                      <span>Custom {partyLabelSingle}</span>
                    </button>
                  </div>

                  {partyMode === "existing" ? (
                    <div>
                      <select
                        value={form.customer_id}
                        onChange={(e) => handleFormChange("customer_id", e.target.value)}
                        disabled={isFormDisabled}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="">
                          — Select {partyLabel || (partyType === "supplier" ? "Supplier" : "Customer")} —
                        </option>
                        {partyType === "supplier"
                          ? suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} {s.trn ? `(TRN: ${s.trn})` : ""}
                              </option>
                            ))
                          : customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.trn ? `(TRN: ${c.trn})` : ""}
                              </option>
                            ))}
                      </select>
                      {partyType === "supplier" && selectedSupplier && (
                        <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                          {selectedSupplier.trn && <span>TRN: <strong className="text-slate-200">{selectedSupplier.trn}</strong></span>}
                          {selectedSupplier.phone && <span>Tel: {selectedSupplier.phone}</span>}
                          {selectedSupplier.address && <span className="truncate max-w-xs">{selectedSupplier.address}</span>}
                        </div>
                      )}
                      {partyType === "customer" && selectedCustomer && (
                        <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                          {selectedCustomer.trn && <span>TRN: <strong className="text-slate-200">{selectedCustomer.trn}</strong></span>}
                          {selectedCustomer.phone && <span>Tel: {selectedCustomer.phone}</span>}
                          {selectedCustomer.address && <span className="truncate max-w-xs">{selectedCustomer.address}</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Custom Party Direct Manual Entry */
                    <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-slate-900/60 p-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          {partyLabelSingle} / Company Name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={customParty.name}
                          onChange={(e) => {
                            setCustomParty((prev) => ({ ...prev, name: e.target.value }));
                            setDirty(true);
                          }}
                          disabled={isFormDisabled}
                          placeholder={`Enter full ${partyLabelSingle.toLowerCase()} or company name`}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Contact Person
                          </label>
                          <input
                            type="text"
                            value={customParty.contact_person}
                            onChange={(e) => {
                              setCustomParty((prev) => ({ ...prev, contact_person: e.target.value }));
                              setDirty(true);
                            }}
                            disabled={isFormDisabled}
                            placeholder="e.g. John Doe"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Mobile / Phone
                          </label>
                          <input
                            type="text"
                            value={customParty.phone}
                            onChange={(e) => {
                              setCustomParty((prev) => ({ ...prev, phone: e.target.value }));
                              setDirty(true);
                            }}
                            disabled={isFormDisabled}
                            placeholder="+971 50 123 4567"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={customParty.email}
                            onChange={(e) => {
                              setCustomParty((prev) => ({ ...prev, email: e.target.value }));
                              setDirty(true);
                            }}
                            disabled={isFormDisabled}
                            placeholder="accounts@company.com"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            TRN (Optional)
                          </label>
                          <input
                            type="text"
                            value={customParty.trn}
                            onChange={(e) => {
                              setCustomParty((prev) => ({ ...prev, trn: e.target.value }));
                              setDirty(true);
                            }}
                            disabled={isFormDisabled}
                            placeholder="100XXXXXXXXX00003"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">
                          Address
                        </label>
                        <input
                          type="text"
                          value={customParty.address}
                          onChange={(e) => {
                            setCustomParty((prev) => ({ ...prev, address: e.target.value }));
                            setDirty(true);
                          }}
                          disabled={isFormDisabled}
                          placeholder="Office / Building, Street, Area, Emirate, UAE"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">
                          Project Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={customParty.project_name}
                          onChange={(e) => {
                            setCustomParty((prev) => ({ ...prev, project_name: e.target.value }));
                            setDirty(true);
                          }}
                          disabled={isFormDisabled}
                          placeholder="e.g. Warehouse Tension Structure"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Project / Job */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Project / Job Ref (Optional)
                  </label>
                  <select
                    value={form.project_id}
                    onChange={(e) => handleFormChange("project_id", e.target.value)}
                    disabled={isFormDisabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">— General / No Project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_number} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => handleFormChange("status", e.target.value)}
                    disabled={isFormDisabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted / Approved</option>
                    <option value="issued">Final / Issued</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Primary Document Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {primaryDateLabel}
                  </label>
                  <input
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => handleFormChange("invoice_date", e.target.value)}
                    disabled={isFormDisabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* Secondary Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {secondaryDateLabel}
                  </label>
                  <input
                    type="date"
                    value={form.supply_date}
                    onChange={(e) => handleFormChange("supply_date", e.target.value)}
                    disabled={isFormDisabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Line Items &amp; Charges
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {lines.length} {lines.length === 1 ? "Item" : "Items"}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-2.5 py-2 w-32">Product</th>
                      <th className="px-2.5 py-2">Item Description</th>
                      <th className="px-2.5 py-2 w-16 text-center">Qty</th>
                      <th className="px-2.5 py-2 w-14 text-center">Unit</th>
                      <th className="px-2.5 py-2 w-20 text-center">Rate</th>
                      <th className="px-2.5 py-2 w-14 text-center">Disc%</th>
                      <th className="px-2.5 py-2 w-14 text-center">VAT%</th>
                      <th className="px-2.5 py-2 w-20 text-center">Total</th>
                      <th className="px-1.5 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {lines.map((l, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        {/* Product quick lookup */}
                        <td className="p-1">
                          <select
                            value={l.product_id}
                            onChange={(e) => handleProductSelect(idx, e.target.value)}
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-white focus:outline-none"
                          >
                            <option value="">— Custom —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Description */}
                        <td className="p-1">
                          <textarea
                            rows={1}
                            value={l.description}
                            onChange={(e) => handleUpdateLine(idx, { description: e.target.value })}
                            placeholder="Description"
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-sans text-white focus:outline-none resize-y min-h-[28px]"
                            required
                          />
                        </td>

                        {/* Qty */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={l.quantity}
                            onChange={(e) => handleUpdateLine(idx, { quantity: Number(e.target.value) || 1 })}
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-white focus:outline-none"
                          />
                        </td>

                        {/* Unit */}
                        <td className="p-1">
                          <input
                            type="text"
                            value={l.unit}
                            onChange={(e) => handleUpdateLine(idx, { unit: e.target.value })}
                            placeholder="pcs"
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-white focus:outline-none"
                          />
                        </td>

                        {/* Rate (AED) - Centered */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={l.unit_price}
                            onChange={(e) => handleUpdateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-center font-mono text-white focus:outline-none"
                          />
                        </td>

                        {/* Disc% - Centered */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={l.discount_pct}
                            onChange={(e) => handleUpdateLine(idx, { discount_pct: Number(e.target.value) || 0 })}
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-white focus:outline-none"
                          />
                        </td>

                        {/* VAT% - Centered */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={l.vat_rate}
                            onChange={(e) => handleUpdateLine(idx, { vat_rate: Number(e.target.value) || 0 })}
                            disabled={isFormDisabled}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-amber-300 focus:outline-none"
                          />
                        </td>

                        {/* Total (AED) - Centered */}
                        <td className="px-2 py-1 text-center font-bold text-slate-100 whitespace-nowrap font-mono">
                          {l.line_total.toFixed(2)}
                        </td>

                        {/* Delete row */}
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={isFormDisabled || lines.length <= 1}
                            className="text-slate-500 hover:text-rose-400 disabled:opacity-20 cursor-pointer"
                            title="Remove Line"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!isFormDisabled && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Line Item</span>
                </button>
              )}

              {/* Financial Totals Card */}
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono text-slate-200">{fmtAED(totals.sub)}</span>
                  </div>
                  <div className="flex justify-between text-amber-400 font-semibold">
                    <span>VAT (5%):</span>
                    <span className="font-mono">{fmtAED(totals.vat)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-2 text-sm font-bold text-white">
                    <span>Grand Total AED:</span>
                    <span className="font-mono text-emerald-400">{fmtAED(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Editable Payment Terms Section (Bulleted in PDF) ───────────────── */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-xs font-bold">➢</span>
                  <label className="text-xs font-bold text-white tracking-wide">
                    Payment Terms
                  </label>
                  <span className="text-[10px] text-slate-400">
                    (Rendered as bullet list with ➢ heading in PDF)
                  </span>
                </div>

                {/* Preset Templates Selector */}
                <div className="flex items-center gap-1.5">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const found = PRESET_PAYMENT_TERMS.find((p) => p.name === e.target.value);
                        if (found) handleApplyPreset(found.terms);
                        e.target.value = "";
                      }
                    }}
                    disabled={isFormDisabled}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-amber-300 focus:outline-none cursor-pointer hover:bg-slate-750"
                  >
                    <option value="">⚡ Load Preset Template…</option>
                    {PRESET_PAYMENT_TERMS.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Bullets List */}
              <div className="space-y-2">
                {termsList.map((term, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold text-xs select-none">•</span>
                    <input
                      type="text"
                      value={term}
                      onChange={(e) => handleUpdateTerm(tIdx, e.target.value)}
                      placeholder={`Payment term ${tIdx + 1} (e.g. Advance 50% to be released...)`}
                      disabled={isFormDisabled}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />

                    {/* Reordering Controls */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveTerm(tIdx, -1)}
                        disabled={isFormDisabled || tIdx === 0}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Move Up"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveTerm(tIdx, 1)}
                        disabled={isFormDisabled || tIdx === termsList.length - 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                        title="Move Down"
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTerm(tIdx)}
                        disabled={isFormDisabled || termsList.length <= 1}
                        className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-20 cursor-pointer"
                        title="Delete term"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {!isFormDisabled && (
                  <button
                    type="button"
                    onClick={handleAddTerm}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-1 text-xs text-amber-300 hover:border-amber-400/60 hover:text-amber-200 transition cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Add Payment Term Line</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notes & Terms */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Public Notes / Remarks
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => handleFormChange("notes", e.target.value)}
                  placeholder="Additional notes or remarks printed on document..."
                  disabled={isFormDisabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Terms &amp; Conditions (Optional)
                </label>
                <textarea
                  rows={3}
                  value={form.terms}
                  onChange={(e) => handleFormChange("terms", e.target.value)}
                  placeholder="General warranty, legal or delivery conditions..."
                  disabled={isFormDisabled}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live A4 PDF Document Preview */}
        <div
          className={`flex-1 flex flex-col bg-slate-950 overflow-hidden relative ${
            previewFullscreen ? "w-full" : ""
          } ${activeTabMobile === "preview" ? "flex" : "hidden lg:flex"}`}
        >
          {/* Top Preview Controls Bar */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 text-xs text-slate-300 select-none">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-200">WYSIWYG Live PDF Preview</span>
              <span className="text-[10px] text-slate-400">
                ({previewData.items.length} {previewData.items.length === 1 ? "line" : "lines"})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Fullscreen Expand Toggle */}
              <button
                type="button"
                onClick={() => setPreviewFullscreen((f) => !f)}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                  previewFullscreen
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title={previewFullscreen ? "Exit Fullscreen Preview" : "Expand Live Preview to Full Screen"}
              >
                {previewFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                <span className="hidden sm:inline">{previewFullscreen ? "Split View" : "Full Screen"}</span>
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 rounded bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut size={12} />
                </button>
                <span
                  onClick={() => setZoom(0.85)}
                  className="px-1.5 text-[10px] font-mono font-bold text-slate-300 cursor-pointer hover:text-amber-400"
                  title="Click to reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn size={12} />
                </button>
              </div>

              {/* Multi-page controls */}
              {totalPreviewPages > 1 && (
                <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                  <button
                    type="button"
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={previewPage <= 1}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span className="text-[10px] font-mono text-slate-300">
                    {previewPage}/{totalPreviewPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                    disabled={previewPage >= totalPreviewPages}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Canvas Scroll Area */}
          <div
            className="flex-1 overflow-auto designer-scrollbar p-6 sm:p-8 flex justify-center items-start overscroll-contain bg-slate-950"
            style={{
              backgroundImage: "radial-gradient(circle at center, rgba(148,163,184,0.15) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            {design.ready && design.layout ? (
              <div
                style={{
                  width: `${design.layout.page.widthMm * zoom * 3.7795296}px`,
                  height: `${design.layout.page.heightMm * zoom * 3.7795296}px`,
                  flexShrink: 0,
                  position: "relative",
                  margin: "0 auto",
                }}
              >
                <div
                  className="erp-document-surface absolute top-0 left-0 origin-top-left bg-white shadow-2xl rounded-sm border border-slate-300"
                  style={{
                    width: `${design.layout.page.widthMm}mm`,
                    height: `${design.layout.page.heightMm}mm`,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <DynamicDocumentRenderer
                    layout={design.layout}
                    company={company}
                    data={previewData}
                    isDesignerPreview={false}
                    scale={1}
                    pageNumber={previewPage}
                    totalPages={totalPreviewPages}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                <Loader2 size={24} className="animate-spin text-slate-500" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentSplitScreenEditor(props: DocumentSplitScreenEditorProps) {
  if (!props.isOpen) return null;
  const editorKey = `${props.initialInvoice?.id || "new"}-${
    props.initialInvoice?.invoice_number ||
    props.initialInvoice?.quotation_number ||
    props.initialInvoice?.proforma_number ||
    props.initialInvoice?.purchase_order_number ||
    props.initialInvoice?.delivery_note_number ||
    "draft"
  }`;
  return <DocumentSplitScreenEditorWorkspace key={editorKey} {...props} />;
}
