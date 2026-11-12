"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FilePlus2,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { fmtAED, todayISO, getCompanyId } from "@/lib/helpers";

export interface SoaDraftEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

export interface SoaDraftRecord {
  id: string;
  customerId: string;
  customerName: string;
  draftNumber: string;
  draftDate: string;
  openingBalance: number;
  entries: SoaDraftEntry[];
  sourceFormat: "blank" | "xlsx" | "csv" | "pdf";
  sourceFilename?: string;
  createdAt: string;
  updatedAt: string;
}

interface StartNewSoaModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerCode?: string;
  onDraftSaved?: (draft: SoaDraftRecord) => void;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDateCell(raw: unknown): string {
  if (raw == null || raw === "") return todayISO();
  if (typeof raw === "number" && raw > 25000 && raw < 80000) {
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return todayISO();
}

function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export default function StartNewSoaModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerCode,
  onDraftSaved,
}: StartNewSoaModalProps) {
  const [draftNumber, setDraftNumber] = useState(`SOA-DRAFT-${todayISO().replace(/-/g, "")}`);
  const [draftDate, setDraftDate] = useState(todayISO());
  const [openingBalance, setOpeningBalance] = useState<string>("0.00");
  const [entries, setEntries] = useState<SoaDraftEntry[]>([]);
  const [sourceFormat, setSourceFormat] = useState<"blank" | "xlsx" | "csv" | "pdf">("blank");
  const [sourceFilename, setSourceFilename] = useState<string | undefined>(undefined);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SoaDraftRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !customerId) return;
    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      setDraftNumber(`SOA-DRAFT-${todayISO().replace(/-/g, "")}`);
      setDraftDate(todayISO());
      setOpeningBalance("0.00");
      setEntries([]);
      setSourceFormat("blank");
      setSourceFilename(undefined);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const raw = localStorage.getItem(`dubai-erp.soa-drafts.${customerId}`);
        setSavedDrafts(raw ? (JSON.parse(raw) as SoaDraftRecord[]) : []);
      } catch {
        setSavedDrafts([]);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, customerId]);

  if (!isOpen) return null;

  const parsedOpening = parseAmount(openingBalance);
  const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);
  const closingBalance = Math.round((parsedOpening + totalDebits - totalCredits) * 100) / 100;

  function handleAddEmptyRow() {
    setEntries((prev) => [
      ...prev,
      {
        id: makeId(),
        date: draftDate || todayISO(),
        reference: "",
        description: "",
        debit: 0,
        credit: 0,
      },
    ]);
  }

  function handleUpdateRow(id: string, patch: Partial<SoaDraftEntry>) {
    setEntries((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function handleRemoveRow(id: string) {
    setEntries((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error("The spreadsheet has no sheets.");
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });

        const mapped: SoaDraftEntry[] = rows
          .map((row) => {
            const keys = Object.keys(row);
            const findCol = (patterns: RegExp[]) => {
              const k = keys.find((key) => patterns.some((p) => p.test(key.toLowerCase())));
              return k ? row[k] : "";
            };
            const dateVal = findCol([/date/, /dt/, /txn/]);
            const refVal = findCol([/ref/, /inv/, /doc/, /voucher/, /no/]);
            const descVal = findCol([/desc/, /particular/, /memo/, /detail/, /narration/]);
            const debitVal = findCol([/debit/, /dr/, /charge/, /invoice/, /amount/]);
            const creditVal = findCol([/credit/, /cr/, /payment/, /receipt/, /paid/]);

            return {
              id: makeId(),
              date: normalizeDateCell(dateVal),
              reference: String(refVal || "").trim(),
              description: String(descVal || "").trim(),
              debit: parseAmount(debitVal),
              credit: parseAmount(creditVal),
            };
          })
          .filter((r) => r.reference || r.description || r.debit > 0 || r.credit > 0);

        if (mapped.length === 0) {
          throw new Error("No valid statement rows were found in the uploaded file.");
        }
        setEntries(mapped);
        setSourceFormat(ext === "csv" ? "csv" : "xlsx");
        setSourceFilename(file.name);
        setSuccessMsg(`Imported ${mapped.length} draft rows from ${file.name}. Live ledger was not modified.`);
      } else if (ext === "pdf") {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/smart-import/parse", {
          method: "POST",
          body: formData,
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to parse PDF file.");
        }

        const extracted = payload?.extracted || payload;
        const rawItems: Array<Record<string, unknown>> =
          extracted?.line_items || extracted?.entries || extracted?.transactions || [];

        const mapped: SoaDraftEntry[] = rawItems.map((item) => ({
          id: makeId(),
          date: normalizeDateCell(item.date || item.invoice_date || draftDate),
          reference: String(item.reference || item.invoice_number || item.doc_number || "").trim(),
          description: String(item.description || item.memo || "Imported PDF row").trim(),
          debit: parseAmount(item.debit ?? item.amount ?? 0),
          credit: parseAmount(item.credit ?? item.payment ?? 0),
        }));

        if (extracted?.opening_balance != null) {
          setOpeningBalance(parseAmount(extracted.opening_balance).toFixed(2));
        }

        setEntries(mapped);
        setSourceFormat("pdf");
        setSourceFilename(file.name);
        setSuccessMsg(
          mapped.length > 0
            ? `Parsed ${mapped.length} draft rows from PDF ${file.name}. Live ledger was not modified.`
            : `PDF ${file.name} attached to draft. You can now add or edit rows manually.`
        );
      } else {
        throw new Error("Unsupported file format. Please upload .xlsx, .csv, or .pdf.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to import file into SOA draft.");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveDraft() {
    if (!customerId) {
      setErrorMsg("Please select a customer first.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const now = new Date().toISOString();
      const draft: SoaDraftRecord = {
        id: makeId(),
        customerId,
        customerName,
        draftNumber: draftNumber.trim() || `SOA-DRAFT-${todayISO().replace(/-/g, "")}`,
        draftDate,
        openingBalance: parsedOpening,
        entries,
        sourceFormat,
        sourceFilename,
        createdAt: now,
        updatedAt: now,
      };

      // 1. Save locally per customer (100% isolated from live accounting tables)
      const nextDrafts = [draft, ...savedDrafts].slice(0, 20);
      try {
        localStorage.setItem(`dubai-erp.soa-drafts.${customerId}`, JSON.stringify(nextDrafts));
      } catch {}
      setSavedDrafts(nextDrafts);

      // 2. Optionally record draft metadata in import_batches as status='draft' (zero ledger mutations)
      try {
        const companyId = await getCompanyId().catch(() => null);
        const { data: authData } = await supabase.auth.getUser();
        if (companyId) {
          await supabase.from("import_batches").insert({
            company_id: companyId,
            batch_name: `${draft.draftNumber} (${customerName})`,
            file_count: sourceFilename ? 1 : 0,
            filenames: sourceFilename ? [sourceFilename] : [],
            status: "draft",
            records_created: { soa_drafts: 1 },
            summary: {
              draftType: "independent_soa_draft",
              customerId,
              customerName,
              draftNumber: draft.draftNumber,
              draftDate: draft.draftDate,
              openingBalance: draft.openingBalance,
              closingBalance,
              entriesCount: entries.length,
              sourceFormat,
            },
            created_by: authData?.user?.email || "Current User",
          });
        }
      } catch (batchErr) {
        console.warn("Could not record SOA draft in import_batches:", batchErr);
      }

      setSuccessMsg(
        `Independent SOA draft "${draft.draftNumber}" saved (${entries.length} rows, closing ${fmtAED(closingBalance)}). Live invoices, payments, and customer balances remain unchanged.`
      );
      onDraftSaved?.(draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save SOA draft.");
    } finally {
      setSaving(false);
    }
  }

  function handleExportDraftCsv() {
    let running = parsedOpening;
    const lines = ["Date,Reference,Description,Debit,Credit,Balance"];
    for (const row of entries) {
      running = Math.round((running + row.debit - row.credit) * 100) / 100;
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      lines.push(
        [
          esc(row.date),
          esc(row.reference),
          esc(row.description),
          row.debit.toFixed(2),
          row.credit.toFixed(2),
          running.toFixed(2),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draftNumber || "SOA_Draft"}_${customerName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleLoadExistingDraft(draft: SoaDraftRecord) {
    setDraftNumber(draft.draftNumber);
    setDraftDate(draft.draftDate);
    setOpeningBalance(draft.openingBalance.toFixed(2));
    setEntries(draft.entries);
    setSourceFormat(draft.sourceFormat);
    setSourceFilename(draft.sourceFilename);
    setSuccessMsg(`Loaded saved draft "${draft.draftNumber}".`);
  }

  let runningBal = parsedOpening;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-950/80 p-2 text-cyan-400 border border-cyan-800/60">
              <FilePlus2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Start New SOA (Independent Draft)</h3>
              <p className="text-xs text-slate-400">
                Customer: <span className="text-slate-200 font-semibold">{customerName}</span>{" "}
                {customerCode ? `(${customerCode})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
          {/* Isolation Guarantee */}
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3.5 flex items-start gap-3">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-emerald-300 block">
                Independent Statement Draft — Zero Live Ledger Changes
              </span>
              <p className="text-emerald-200/85 leading-relaxed">
                This creates an isolated empty statement draft. You can build it manually or import from Excel, CSV, or PDF.
                Existing tax invoices, receipt vouchers, customer payments, and live customer balances remain untouched.
              </p>
            </div>
          </div>

          {/* Draft Header Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-850 p-4 rounded-xl border border-slate-800">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold block">Draft Reference</label>
              <input
                type="text"
                value={draftNumber}
                onChange={(e) => setDraftNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold block">Statement Date</label>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold block">Draft Opening Balance (AED)</label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Import / Add Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 font-bold transition cursor-pointer disabled:opacity-50"
              >
                {parsing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                <span>Import Excel / CSV / PDF</span>
              </button>

              <button
                type="button"
                onClick={handleAddEmptyRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
              >
                <Plus size={13} className="text-emerald-400" />
                <span>Add Row</span>
              </button>

              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportDraftCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 font-semibold transition cursor-pointer"
                >
                  <Download size={13} className="text-amber-400" />
                  <span>Export CSV</span>
                </button>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-400">
              Debits: <span className="text-rose-300 font-bold">{fmtAED(totalDebits)}</span> | Credits:{" "}
              <span className="text-emerald-300 font-bold">{fmtAED(totalCredits)}</span> | Closing:{" "}
              <span className="text-cyan-300 font-bold">{fmtAED(closingBalance)}</span>
            </div>
          </div>

          {/* Draft Entries Table */}
          <div className="rounded-xl border border-slate-800 overflow-x-auto bg-slate-950/50">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-850 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      <FileSpreadsheet size={24} className="mx-auto mb-2 text-slate-600" />
                      Empty SOA draft. Click <strong>Import Excel / CSV / PDF</strong> or <strong>Add Row</strong> to populate entries.
                    </td>
                  </tr>
                ) : (
                  entries.map((row) => {
                    runningBal = Math.round((runningBal + row.debit - row.credit) * 100) / 100;
                    return (
                      <tr key={row.id} className="hover:bg-slate-900/60">
                        <td className="px-2 py-1.5">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => handleUpdateRow(row.id, { date: e.target.value })}
                            className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.reference}
                            placeholder="INV-001"
                            onChange={(e) => handleUpdateRow(row.id, { reference: e.target.value })}
                            className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={row.description}
                            placeholder="Description"
                            onChange={(e) => handleUpdateRow(row.id, { description: e.target.value })}
                            className="w-full min-w-[140px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={row.debit}
                            onChange={(e) => handleUpdateRow(row.id, { debit: parseAmount(e.target.value) })}
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-right font-mono text-rose-300"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={row.credit}
                            onChange={(e) => handleUpdateRow(row.id, { credit: parseAmount(e.target.value) })}
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-right font-mono text-emerald-300"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-200">
                          {fmtAED(runningBal)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Saved Drafts List */}
          {savedDrafts.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-850/60 p-3 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Saved SOA Drafts for {customerName} ({savedDrafts.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {savedDrafts.slice(0, 6).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleLoadExistingDraft(d)}
                    className="rounded-lg border border-slate-700 bg-slate-900 hover:border-cyan-600 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    <span className="font-mono font-semibold text-cyan-300">{d.draftNumber}</span> · {d.entries.length} rows
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-950/70 border border-rose-800 p-3 text-rose-300">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-950/70 border border-emerald-800 p-3 text-emerald-300">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-850 border-t border-slate-800 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Saving Draft...</span>
              </>
            ) : (
              <>
                <FilePlus2 size={14} />
                <span>Save Independent SOA Draft</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

