"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Save,
  Printer,
  FileCheck2,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { DocumentTypeId, DocumentLayout } from "@/lib/documentDesigner";
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
}

export interface DocumentSplitScreenEditorProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: DocumentTypeId;
  documentTitle?: string;
  company: CompanyDocInfo | null;
  initialInvoice?: {
    id?: string;
    invoice_number?: string | null;
    customer_id?: string | null;
    project_id?: string | null;
    invoice_date?: string | null;
    supply_date?: string | null;
    due_date?: string | null;
    payment_terms?: string | null;
    status?: string | null;
    notes?: string | null;
    terms?: string | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    total_amount?: number | null;
  } | null;
  initialLines?: EditorLineItem[];
  customers: Array<{
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
  projects?: Array<{ id: string; project_number: string; name: string }>;
  products?: Array<{
    id: string;
    name: string | null;
    sku?: string | null;
    selling_price?: number | null;
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

function DocumentSplitScreenEditorWorkspace({
  onClose,
  documentType,
  documentTitle = "Tax Invoice",
  company,
  initialInvoice,
  initialLines,
  customers,
  projects = [],
  products = [],
  onSave,
  saving = false,
  onRename,
}: DocumentSplitScreenEditorProps) {
  const design = usePersistedDocumentDesign(company?.id, documentType);

  const [form, setForm] = useState<DocumentEditorFormState>(() => ({
    customer_id: initialInvoice?.customer_id || "",
    project_id: initialInvoice?.project_id || "",
    invoice_date: initialInvoice?.invoice_date || todayISO(),
    supply_date: initialInvoice?.supply_date || todayISO(),
    due_date: initialInvoice?.due_date || "",
    payment_terms: initialInvoice?.payment_terms || "30 days",
    status: initialInvoice?.status || "draft",
    notes: initialInvoice?.notes || "",
    terms: initialInvoice?.terms || "",
  }));

  const [lines, setLines] = useState<EditorLineItem[]>(() => {
    if (initialLines && initialLines.length > 0) {
      return initialLines.map(recalc);
    }
    return [emptyLine()];
  });

  const [activeTabMobile, setActiveTabMobile] = useState<"form" | "preview">("form");
  const [zoom, setZoom] = useState<number>(0.85);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [dirty, setDirty] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const isIssued = (initialInvoice?.status || "").toLowerCase() === "issued" || (initialInvoice?.status || "") === "Final";

  // Lookup maps
  const custMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const projMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const selectedCustomer = custMap[form.customer_id];
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
                unit_price: prod?.selling_price ?? l.unit_price,
                vat_rate: prod?.vat_rate ?? 5,
              })
        )
      );
      setDirty(true);
    },
    [products]
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

  // Construct real-time MockDocumentData for the Live PDF preview
  const previewData: MockDocumentData = useMemo(() => {
    const isNew = !initialInvoice?.invoice_number;
    const effectiveNumber = isNew ? "[DRAFT - Assigned on Save]" : initialInvoice.invoice_number || "INV";

    return {
      document_number: effectiveNumber,
      document_date: form.invoice_date,
      supply_date: form.supply_date,
      due_date: form.due_date,
      status: form.status,
      customer_name: selectedCustomer?.name || "Customer / Client Name",
      customer_trn: selectedCustomer?.trn || undefined,
      customer_address: selectedCustomer?.address || undefined,
      contact_person: selectedCustomer?.contact_person || undefined,
      contact_number: selectedCustomer?.phone || selectedCustomer?.mobile || undefined,
      contact_email: selectedCustomer?.email || undefined,
      project_name: selectedProject?.name || undefined,
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
  }, [initialInvoice, form, selectedCustomer, selectedProject, totals, lines]);

  const totalPreviewPages = useMemo(() => {
    if (!design.layout) return 1;
    return getDocumentPageCount(design.layout, previewData.items.length, previewData.items, previewData);
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
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    if (lines.length === 0 || !lines[0].description) {
      setError("Please add at least one line item with a description.");
      return;
    }

    setError("");
    const finalStatus = targetStatus || form.status;
    await onSave({
      form: { ...form, status: finalStatus },
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
                {initialInvoice ? `Edit ${documentTitle}` : `New ${documentTitle}`}
              </h2>
              <span className="font-mono text-xs rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                {initialInvoice?.invoice_number || "[Draft Preview]"}
              </span>
              {initialInvoice?.invoice_number && onRename && (
                <button
                  type="button"
                  onClick={onRename}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Safely rename invoice reference number with collision check"
                >
                  <Pencil size={11} />
                  <span>Edit #</span>
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
                  Synced
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
            disabled={saving || isIssued}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer disabled:opacity-50"
            title="Save as Draft"
          >
            <Save size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveDocument()}
            disabled={saving || isIssued}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-md transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span>{saving ? "Saving…" : initialInvoice ? "Save Changes" : "Save Document"}</span>
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
          className={`flex flex-col border-r border-slate-800 bg-slate-900/90 text-slate-200 overflow-y-auto designer-scrollbar w-full lg:w-1/2 ${
            activeTabMobile === "form" ? "block" : "hidden lg:flex"
          }`}
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

            {isIssued && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <span>
                  This document is Finalized/Issued. Financial details are locked to preserve accounting integrity.
                  To modify, cancel this document and create a replacement or credit note.
                </span>
              </div>
            )}

            {/* Document Metadata Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Document Details</span>
                <span className="text-[10px] text-amber-400 font-mono">Live Sync Active</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Customer Selection */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Customer / Client <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={form.customer_id}
                    onChange={(e) => handleFormChange("customer_id", e.target.value)}
                    disabled={isIssued}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="">— Select Customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.trn ? `(TRN: ${c.trn})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      {selectedCustomer.trn && <span>TRN: <strong className="text-slate-200">{selectedCustomer.trn}</strong></span>}
                      {selectedCustomer.phone && <span>Tel: {selectedCustomer.phone}</span>}
                      {selectedCustomer.address && <span className="truncate max-w-xs">{selectedCustomer.address}</span>}
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
                    disabled={isIssued}
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
                    disabled={isIssued}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="issued">Final / Issued</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                {/* Document Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => handleFormChange("invoice_date", e.target.value)}
                    disabled={isIssued}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* Supply Date */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Date of Supply
                  </label>
                  <input
                    type="date"
                    value={form.supply_date}
                    onChange={(e) => handleFormChange("supply_date", e.target.value)}
                    disabled={isIssued}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* Payment Terms */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={form.payment_terms}
                    onChange={(e) => handleFormChange("payment_terms", e.target.value)}
                    placeholder="e.g. 50% Advance, Balance on Delivery / 30 Days"
                    disabled={isIssued}
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
                      <th className="px-2.5 py-2 w-20 text-right">Price</th>
                      <th className="px-2.5 py-2 w-14 text-center">Disc%</th>
                      <th className="px-2.5 py-2 w-14 text-center">VAT%</th>
                      <th className="px-2.5 py-2 w-20 text-right">Total</th>
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
                            disabled={isIssued}
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
                            disabled={isIssued}
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
                            disabled={isIssued}
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
                            disabled={isIssued}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-white focus:outline-none"
                          />
                        </td>

                        {/* Price */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={l.unit_price}
                            onChange={(e) => handleUpdateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                            disabled={isIssued}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-right text-white focus:outline-none"
                          />
                        </td>

                        {/* Disc% */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={l.discount_pct}
                            onChange={(e) => handleUpdateLine(idx, { discount_pct: Number(e.target.value) || 0 })}
                            disabled={isIssued}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-white focus:outline-none"
                          />
                        </td>

                        {/* VAT% */}
                        <td className="p-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={l.vat_rate}
                            onChange={(e) => handleUpdateLine(idx, { vat_rate: Number(e.target.value) || 0 })}
                            disabled={isIssued}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-center text-amber-300 focus:outline-none"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="px-2 py-1 text-right font-bold text-slate-100 whitespace-nowrap">
                          {l.line_total.toFixed(2)}
                        </td>

                        {/* Delete row */}
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={isIssued || lines.length <= 1}
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

              {!isIssued && (
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
                  placeholder="Notes printed on document..."
                  disabled={isIssued}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Terms &amp; Conditions
                </label>
                <textarea
                  rows={3}
                  value={form.terms}
                  onChange={(e) => handleFormChange("terms", e.target.value)}
                  placeholder="Terms printed on document..."
                  disabled={isIssued}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live A4 PDF Document Preview */}
        <div
          className={`flex-1 flex flex-col bg-slate-950 overflow-hidden relative ${
            activeTabMobile === "preview" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Top Preview Controls Bar */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 text-xs text-slate-300 select-none">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-200">WYSIWYG PDF Live Preview</span>
              <span className="text-[10px] text-slate-400">
                ({previewData.items.length} {previewData.items.length === 1 ? "line" : "lines"})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 rounded bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
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
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
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
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
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
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
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
  const editorKey = `${props.initialInvoice?.id || "new"}-${props.initialInvoice?.invoice_number || "draft"}`;
  return <DocumentSplitScreenEditorWorkspace key={editorKey} {...props} />;
}
