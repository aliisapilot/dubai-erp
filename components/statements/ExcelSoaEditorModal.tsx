"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Undo,
  Redo,
  Clipboard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Download,
  Save,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerCandidate, StoredSoaRecord } from "@/lib/soaManager";
import type { RawHistoricalEntry } from "@/lib/customerStatementEngine";
import { getExportSoaPdfFilename } from "@/lib/soaManager";

interface ExcelSoaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: StoredSoaRecord | null;
  customers: CustomerCandidate[];
  onSaved: () => void;
}

let rowIdCounter = 0;
function createRowId(prefix = "row"): string {
  rowIdCounter++;
  return `${prefix}_${rowIdCounter}_${Date.now()}`;
}

function parseNum(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export default function ExcelSoaEditorModal(props: ExcelSoaEditorModalProps) {
  if (!props.isOpen || !props.record) return null;
  return <ExcelSoaEditorModalContent key={props.record.id} {...props} record={props.record} />;
}

function ExcelSoaEditorModalContent({
  onClose,
  record,
  customers,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  record: StoredSoaRecord;
  customers: CustomerCandidate[];
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState(record.customer_id || "");
  const [soaNumber, setSoaNumber] = useState(record.soa_number || "");
  const [statementDate, setStatementDate] = useState(record.statement_date || "");
  const [openingBalance, setOpeningBalance] = useState(Number(record.opening_balance) || 0);
  const [entries, setEntries] = useState<RawHistoricalEntry[]>(
    record.entries ? JSON.parse(JSON.stringify(record.entries)) : []
  );
  const [showPdfPreview, setShowPdfPreview] = useState(true);
  const [undoStack, setUndoStack] = useState<RawHistoricalEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<RawHistoricalEntry[][]>([]);
  const [pastePromptOpen, setPastePromptOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState("");
  const [validationAlert, setValidationAlert] = useState<{
    valid: boolean;
    difference: number;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Decimal-safe recalculation of running balances across all rows
  function recalc(openBal: number, list: RawHistoricalEntry[]) {
    let running = Math.round(openBal * 100) / 100;
    let debits = 0;
    let credits = 0;
    const computed = list.map((e) => {
      const d = parseNum(e.debit);
      const c = parseNum(e.credit);
      debits += d;
      credits += c;
      running = Math.round((running + d - c) * 100) / 100;
      return {
        ...e,
        debit: d,
        credit: c,
        balance: running,
      };
    });
    return {
      computedEntries: computed,
      totalDebits: Math.round(debits * 100) / 100,
      totalCredits: Math.round(credits * 100) / 100,
      closingBal: Math.round((openBal + debits - credits) * 100) / 100,
    };
  }

  const { computedEntries, totalDebits, totalCredits, closingBal } = recalc(
    openingBalance,
    entries
  );

  function pushUndo() {
    setUndoStack((prev) => [...prev, entries]);
    setRedoStack([]);
  }

  function handleRowChange(rowId: string, field: keyof RawHistoricalEntry, val: unknown) {
    pushUndo();
    const updated = entries.map((e) => {
      if (e.id !== rowId) return e;
      return { ...e, [field]: val, is_edited: true };
    });
    const { computedEntries: res } = recalc(openingBalance, updated);
    setEntries(res);
  }

  function handleAddRow() {
    pushUndo();
    const newRow: RawHistoricalEntry = {
      id: createRowId("manual"),
      date: statementDate || new Date().toISOString().slice(0, 10),
      reference_no: "",
      original_reference: "",
      description: "",
      debit: 0,
      credit: 0,
      status: "historical",
      is_edited: true,
      source_filename: record?.file_name,
    };
    const next = [...entries, newRow];
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleDeleteRow(rowId: string) {
    const row = entries.find((e) => e.id === rowId);
    if (!confirm(`Are you sure you want to delete row "${row?.reference_no || row?.description || 'Row'}"?`)) {
      return;
    }
    pushUndo();
    const next = entries.filter((e) => e.id !== rowId);
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, s.length - 1));
    setRedoStack((s) => [...s, entries]);
    const { computedEntries: res } = recalc(openingBalance, prev);
    setEntries(res);
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, s.length - 1));
    setUndoStack((s) => [...s, entries]);
    const { computedEntries: res } = recalc(openingBalance, next);
    setEntries(res);
  }

  function handleClipboardPaste(text: string) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return;

    pushUndo();
    const pastedRows: RawHistoricalEntry[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const pDate = parts[0]?.trim();
        const pRef = parts[1]?.trim();
        const pDesc = parts[2]?.trim() || "";
        const pDebit = parseNum(parts[3] || 0);
        const pCredit = parseNum(parts[4] || 0);
        pastedRows.push({
          id: createRowId("pasted"),
          date: pDate || statementDate || new Date().toISOString().slice(0, 10),
          reference_no: pRef || (pDebit > 0 ? "INV" : "REC"),
          original_reference: pRef,
          description: pDesc || (pDebit > 0 ? "Invoice Charge" : "Payment"),
          debit: pDebit,
          credit: pCredit,
          status: "historical",
          is_edited: true,
          source_filename: record?.file_name,
        });
      }
    }

    if (pastedRows.length > 0) {
      const combined = [...entries, ...pastedRows];
      const { computedEntries: res } = recalc(openingBalance, combined);
      setEntries(res);
    }
  }

  function handleValidateStatement() {
    const expected = Math.round((openingBalance + totalDebits - totalCredits) * 100) / 100;
    const targetClosing = record?.closing_balance !== null && record?.closing_balance !== undefined
      ? record.closing_balance
      : closingBal;
    const diff = Math.abs(targetClosing - expected);

    if (diff < 0.05) {
      setValidationAlert({
        valid: true,
        difference: 0,
        message: `Statement is arithmetically balanced! Opening (AED ${openingBalance.toFixed(2)}) + Debits (AED ${totalDebits.toFixed(2)}) - Credits (AED ${totalCredits.toFixed(2)}) = Closing (AED ${closingBal.toFixed(2)}).`,
      });
    } else {
      setValidationAlert({
        valid: false,
        difference: diff,
        message: `Discrepancy of AED ${diff.toFixed(2)} detected. Target closing is AED ${targetClosing.toFixed(2)}, but computed balance is AED ${expected.toFixed(2)}.`,
      });
    }
  }

  async function handleSave(options: { verify: boolean }) {
    setErrorMsg("");
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const res = await fetch("/api/customer-statements", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          attachmentId: record?.id,
          action: "update_statement",
          customerId: customerId || undefined,
          soaNumber: soaNumber.trim() || undefined,
          statementDate: statementDate || null,
          openingBalance,
          closingBalance: closingBal,
          entries: computedEntries,
          isVerified: options.verify,
          status: options.verify ? "verified" : "pending_verification",
          needsReview: !options.verify,
          reason: options.verify
            ? "User approved and verified Statement of Account"
            : "User saved Statement of Account draft",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to save statement.");
      }

      onSaved();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save statement.");
    } finally {
      setSaving(false);
    }
  }

  const exportPdfFilename = getExportSoaPdfFilename(
    soaNumber || record.soa_number,
    customers.find((c) => c.id === customerId)?.name || record.customer_name,
    statementDate || record.statement_date
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="flex flex-col w-full h-[95vh] max-w-[98vw] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Excel-Style SOA Editor:</span>
                <span className="text-cyan-400 font-mono">{soaNumber || record.soa_number}</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Original file: <strong className="text-slate-300">{record.file_name}</strong> (immutable original preserved)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPdfPreview(!showPdfPreview)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              {showPdfPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showPdfPreview ? "Hide Original" : "Show Original"}</span>
            </button>

            {record.file_url && (
              <a
                href={record.file_url}
                target="_blank"
                rel="noreferrer"
                download={exportPdfFilename}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
                title="Download original document"
              >
                <Download size={13} />
                <span>Original PDF</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Top Statement Metadata Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-5 py-3 bg-slate-900/60 border-b border-slate-800/80 text-xs shrink-0">
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">SOA Number</label>
            <input
              type="text"
              value={soaNumber}
              onChange={(e) => setSoaNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Statement Date</label>
            <input
              type="date"
              value={statementDate ? statementDate.slice(0, 10) : ""}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Opening (AED)</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(parseNum(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-right font-mono text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Closing Balance</label>
            <div className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs font-mono font-bold text-white flex items-center justify-between">
              <span>AED {closingBal.toFixed(2)}</span>
              <span className="text-[10px] text-slate-400 font-normal font-sans">
                ({computedEntries.length} rows)
              </span>
            </div>
          </div>
        </div>

        {/* Validation Alert / Discrepancy Banner */}
        {validationAlert && (
          <div
            className={`px-5 py-2.5 flex items-center justify-between text-xs border-b ${
              validationAlert.valid
                ? "bg-emerald-950/70 border-emerald-800 text-emerald-200"
                : "bg-rose-950/70 border-rose-800 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {validationAlert.valid ? (
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              )}
              <span>{validationAlert.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setValidationAlert(null)}
              className="text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="px-5 py-2.5 bg-rose-950/80 border-b border-rose-800 flex items-center gap-2 text-rose-200 text-xs">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Toolbar for Table Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 bg-slate-900/40 border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Row</span>
            </button>

            <button
              type="button"
              onClick={() => setPastePromptOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <Clipboard size={13} />
              <span>Paste Excel Rows</span>
            </button>

            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>

            <button
              type="button"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleValidateStatement}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-800/80 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 font-semibold transition cursor-pointer"
            >
              <ShieldCheck size={14} />
              <span>Validate Balance</span>
            </button>
          </div>
        </div>

        {/* Paste Modal Prompt */}
        {pastePromptOpen && (
          <div className="p-4 bg-slate-900 border-b border-cyan-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">Paste Rows from Excel / Spreadsheet</h4>
              <button
                type="button"
                onClick={() => setPastePromptOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Copy 5 columns from Excel (Date | Reference | Description | Debit | Credit) and paste below:
            </p>
            <textarea
              rows={3}
              value={rawPasteText}
              onChange={(e) => setRawPasteText(e.target.value)}
              placeholder={"2026-05-09\tINV-117\tTax Invoice INV-117\t3861.90\t0.00\n2026-06-15\tREC-044\tPayment Received\t0.00\t3861.90"}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPastePromptOpen(false)}
                className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleClipboardPaste(rawPasteText);
                  setRawPasteText("");
                  setPastePromptOpen(false);
                }}
                className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
              >
                Insert Rows
              </button>
            </div>
          </div>
        )}

        {/* Main Two-Panel Layout */}
        <div className={`grid gap-3 flex-1 overflow-hidden p-4 ${showPdfPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Left Panel: Original PDF Preview */}
          {showPdfPreview && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden flex flex-col h-full">
              <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
                <span>Original Document: <strong className="text-white">{record.file_name}</strong></span>
                <span className="font-mono text-[10px]">
                  {record.file_size ? `${Math.round(record.file_size / 1024)} KB` : "PDF"}
                </span>
              </div>
              <div className="flex-1 bg-slate-950 p-2 overflow-hidden flex items-center justify-center">
                {record.file_url ? (
                  <iframe
                    src={record.file_url}
                    title="Original PDF Document"
                    className="w-full h-full min-h-[400px] rounded border border-slate-800 bg-white"
                  />
                ) : (
                  <div className="text-center p-6 text-slate-500 text-xs">
                    Original document URL not available.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Panel: Editable Spreadsheet Table */}
          <div
            ref={tableContainerRef}
            className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-y-auto flex flex-col h-full"
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text && text.includes("\t")) {
                e.preventDefault();
                handleClipboardPaste(text);
              }
            }}
          >
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] sticky top-0 z-10 font-mono">
                <tr>
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-2 text-left w-28">Date</th>
                  <th className="py-2.5 px-2 text-left w-28">Reference</th>
                  <th className="py-2.5 px-2 text-left">Description</th>
                  <th className="py-2.5 px-2 text-right w-24">Debit</th>
                  <th className="py-2.5 px-2 text-right w-24">Credit</th>
                  <th className="py-2.5 px-2 text-right w-28">Balance</th>
                  <th className="py-2.5 px-1 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {computedEntries.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-1 px-2 text-center text-slate-500 text-[10px]">
                      {idx + 1}
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="date"
                        value={row.date?.slice(0, 10) || ""}
                        onChange={(e) => handleRowChange(row.id, "date", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text"
                        value={row.reference_no || ""}
                        onChange={(e) => handleRowChange(row.id, "reference_no", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="text"
                        value={row.description || ""}
                        onChange={(e) => handleRowChange(row.id, "description", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-slate-200 font-sans focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.debit || ""}
                        onChange={(e) => handleRowChange(row.id, "debit", parseNum(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        step="0.01"
                        value={row.credit || ""}
                        onChange={(e) => handleRowChange(row.id, "credit", parseNum(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] text-right text-emerald-400 focus:border-cyan-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-2 text-right text-[11px] font-bold text-white">
                      {row.balance !== undefined ? Number(row.balance).toFixed(2) : "—"}
                    </td>
                    <td className="py-1 px-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition"
                        title="Delete row"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

                {computedEntries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                      No transaction rows found. Click <strong>Add Row</strong> or <strong>Paste Excel Rows</strong> to enter entries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with Save Draft & Approve / Verify */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-t border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-3 text-slate-400">
            <span>
              Opening: <strong className="text-white font-mono">AED {openingBalance.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Debits: <strong className="text-cyan-300 font-mono">AED {totalDebits.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Credits: <strong className="text-emerald-300 font-mono">AED {totalCredits.toFixed(2)}</strong>
            </span>
            <span>•</span>
            <span>
              Closing: <strong className="text-white font-mono font-bold">AED {closingBal.toFixed(2)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void handleSave({ verify: false })}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 font-semibold transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSave({ verify: true })}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>Approve &amp; Verify</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
