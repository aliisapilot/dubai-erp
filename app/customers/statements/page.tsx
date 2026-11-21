"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Upload,
  Download,
  FileText,
  Loader2,
  X,
  AlertTriangle,
  ExternalLink,
  Edit2,
  Trash2,
  Plus,
  MoreVertical,
  Clock,
  History,
  CheckCircle2,
  Layers,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerCandidate, StoredSoaRecord } from "@/lib/soaManager";
import { getExportSoaPdfFilename } from "@/lib/soaManager";
import type { StatementData, StatementEntry } from "@/lib/customerStatementEngine";
import BulkSoaImportModal from "@/components/statements/BulkSoaImportModal";
import ExcelSoaEditorModal from "@/components/statements/ExcelSoaEditorModal";
import PrintModal from "@/components/documents/PrintModal";
import StatementOfAccountTemplate from "@/components/documents/StatementOfAccountTemplate";
import type { CompanyDocInfo } from "@/components/documents/DocHeader";

function formatDisplayDate(iso?: string | null): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export default function CustomerStatementsPage() {
  const [companyId, setCompanyId] = useState<string>("");
  const [companyInfo, setCompanyInfo] = useState<CompanyDocInfo | null>(null);
  const [customers, setCustomers] = useState<CustomerCandidate[]>([]);
  const [statements, setStatements] = useState<StoredSoaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // View mode tab: "statements" (default) or "ledger" (live accounting statement)
  const [viewTab, setViewTab] = useState<"statements" | "ledger">("statements");

  // Selected customer & filters for ledger view
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [customerSavedSoa, setCustomerSavedSoa] = useState<StoredSoaRecord | null>(null);

  // Filters for ledger view
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Filters for statements table
  const [statementSearch, setStatementSearch] = useState("");
  const [statementCustomerFilter, setStatementCustomerFilter] = useState("");
  const [statementStatusFilter, setStatementStatusFilter] = useState<string>("all");
  const [statementFromDate, setStatementFromDate] = useState("");
  const [statementToDate, setStatementToDate] = useState("");

  // Batch actions on statements table
  const [selectedStatementIds, setSelectedStatementIds] = useState<Set<string>>(new Set());
  const [batchCustomerTarget, setBatchCustomerTarget] = useState("");
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCutoverModal, setShowCutoverModal] = useState(false);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [showUploadsModal, setShowUploadsModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StatementEntry | null>(null);
  const [editingSoaRecord, setEditingSoaRecord] = useState<StoredSoaRecord | null>(null);

  // Modals form state
  const [editForm, setEditForm] = useState<{
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    reason: string;
  }>({ date: "", reference: "", description: "", debit: 0, credit: 0, reason: "" });

  const [newRowForm, setNewRowForm] = useState<{
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    reason: string;
  }>({ date: "", reference: "", description: "", debit: 0, credit: 0, reason: "" });

  const [cutoverDateInput, setCutoverDateInput] = useState("");
  const [cutoverApprovedInput, setCutoverApprovedInput] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Load customer statements & unified statement data
  const loadStatement = useCallback(async (targetCustomerId?: string, fDate?: string, tDate?: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const params = new URLSearchParams();
      if (targetCustomerId) params.set("customerId", targetCustomerId);
      if (fDate) params.set("fromDate", fDate);
      if (tDate) params.set("toDate", tDate);

      const res = await fetch(`/api/customer-statements?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Could not load customer statements.");
      }

      setCompanyId(json.companyId || "");
      setCompanyInfo(json.company || null);
      setCustomers(json.customers || []);
      setStatements(json.statements || []);
      setStatementData(json.statement || null);
      setCustomerSavedSoa(json.customerSavedSoa || null);

      if (json.selectedCustomer?.id) {
        setSelectedCustomerId(json.selectedCustomer.id);
      } else if (targetCustomerId) {
        setSelectedCustomerId(targetCustomerId);
      } else if (json.customers?.length > 0) {
        setSelectedCustomerId(json.customers[0].id);
      }

      if (json.customerSavedSoa?.cutover_date) {
        setCutoverDateInput(json.customerSavedSoa.cutover_date);
        setCutoverApprovedInput(Boolean(json.customerSavedSoa.is_cutover_approved));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load statements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        let initialCid = "";
        let initialTab: "statements" | "ledger" | null = null;
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          initialCid = sp.get("customer_id") || "";
          const tab = sp.get("tab");
          if (tab === "ledger" || tab === "statements") {
            initialTab = tab;
          }
        }
        if (initialTab) setViewTab(initialTab);
        void loadStatement(initialCid || undefined);
      }
    });
    return () => {
      active = false;
    };
  }, [loadStatement]);

  const handleSelectCustomer = (cid: string) => {
    setSelectedCustomerId(cid);
    void loadStatement(cid, fromDate || undefined, toDate || undefined);
  };

  const handleApplyDateFilter = () => {
    void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
  };

  const handleClearDateFilter = () => {
    setFromDate("");
    setToDate("");
    void loadStatement(selectedCustomerId, undefined, undefined);
  };

  // Filter statement entries by client search query (for ledger tab)
  const filteredEntries = useMemo(() => {
    if (!statementData?.entries) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statementData.entries;
    return statementData.entries.filter((e) => {
      const matchRef = (e.reference_no || "").toLowerCase().includes(q);
      const matchDesc = (e.description || "").toLowerCase().includes(q);
      const matchDate = (e.date || "").includes(q);
      return matchRef || matchDesc || matchDate;
    });
  }, [statementData, searchQuery]);

  // Filtered statements for Statements of Account table
  const filteredStatements = useMemo(() => {
    return statements.filter((s) => {
      if (statementSearch.trim()) {
        const q = statementSearch.trim().toLowerCase();
        const matchNum = (s.soa_number || "").toLowerCase().includes(q);
        const matchCust = (s.customer_name || "").toLowerCase().includes(q);
        const matchFile = (s.file_name || "").toLowerCase().includes(q);
        if (!matchNum && !matchCust && !matchFile) return false;
      }
      if (statementCustomerFilter && s.customer_id !== statementCustomerFilter) {
        return false;
      }
      if (statementStatusFilter === "verified") {
        if (!s.is_verified || s.needs_review) return false;
      } else if (statementStatusFilter === "needs_review") {
        if (!s.needs_review) return false;
      } else if (statementStatusFilter === "error") {
        if (s.status !== "rejected") return false;
      } else if (statementStatusFilter === "pending") {
        if (s.is_verified || s.status === "rejected" || s.needs_review) return false;
      }
      if (statementFromDate && s.statement_date && s.statement_date < statementFromDate) return false;
      if (statementToDate && s.statement_date && s.statement_date > statementToDate) return false;

      return true;
    });
  }, [statements, statementSearch, statementCustomerFilter, statementStatusFilter, statementFromDate, statementToDate]);

  // Selected customer object
  const currentCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Standardized PDF filename
  const pdfFilename = useMemo(() => {
    return getExportSoaPdfFilename(
      statementData?.statement_number,
      currentCustomer?.name || statementData?.customer_name,
      statementData?.statement_date
    );
  }, [statementData, currentCustomer]);

  // Batch toggle handlers
  const handleToggleSelectAllStatements = () => {
    if (selectedStatementIds.size === filteredStatements.length && filteredStatements.length > 0) {
      setSelectedStatementIds(new Set());
    } else {
      setSelectedStatementIds(new Set(filteredStatements.map((s) => s.id)));
    }
  };

  const handleToggleSelectStatement = (id: string) => {
    const next = new Set(selectedStatementIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedStatementIds(next);
  };

  // Delete a single statement record
  async function handleDeleteStatement(id: string, soaNum?: string) {
    if (!confirm(`Are you sure you want to delete Statement ${soaNum || "record"}? The original uploaded file will be preserved.`)) {
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      const res = await fetch(`/api/customer-statements?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || "Failed to delete statement");
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete statement.");
    }
  }

  // Batch apply customer
  async function handleBatchApplyCustomer() {
    if (!batchCustomerTarget || selectedStatementIds.size === 0) return;
    setIsApplyingBatch(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      const custObj = customers.find((c) => c.id === batchCustomerTarget);

      for (const id of Array.from(selectedStatementIds)) {
        const stmt = statements.find((s) => s.id === id);
        if (!stmt) continue;
        await fetch("/api/customer-statements", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            attachmentId: id,
            action: "update_statement",
            customerId: batchCustomerTarget,
            soaNumber: stmt.soa_number,
            statementDate: stmt.statement_date,
            openingBalance: stmt.opening_balance,
            closingBalance: stmt.closing_balance,
            entries: stmt.entries,
            reason: `Batch customer assignment to ${custObj?.name || batchCustomerTarget}`,
          }),
        });
      }
      setSelectedStatementIds(new Set());
      setBatchCustomerTarget("");
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to apply customer to selected statements.");
    } finally {
      setIsApplyingBatch(false);
    }
  }

  // Batch delete statements
  async function handleBatchDeleteStatements() {
    if (selectedStatementIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedStatementIds.size} selected statement record(s)?`)) return;
    setIsApplyingBatch(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      for (const id of Array.from(selectedStatementIds)) {
        await fetch(`/api/customer-statements?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      }
      setSelectedStatementIds(new Set());
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete selected statements.");
    } finally {
      setIsApplyingBatch(false);
    }
  }

  // Submit edit of a historical row (for live ledger)
  async function handleSaveEditEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!customerSavedSoa || !editingEntry) return;

    setSubmittingAction(true);
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
          attachmentId: customerSavedSoa.id,
          action: "edit_entry",
          entryId: editingEntry.historical_entry_id || editingEntry.id,
          entry: {
            date: editForm.date,
            reference_no: editForm.reference,
            description: editForm.description,
            debit: editForm.debit,
            credit: editForm.credit,
          },
          reason: editForm.reason || "Manual historical transaction edit",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to update transaction row.");
      }

      setEditingEntry(null);
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update transaction.");
    } finally {
      setSubmittingAction(false);
    }
  }

  // Submit adding a manual historical entry (for live ledger)
  async function handleSaveNewRow(e: React.FormEvent) {
    e.preventDefault();
    if (!customerSavedSoa) return;

    setSubmittingAction(true);
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
          attachmentId: customerSavedSoa.id,
          action: "add_entry",
          entry: {
            date: newRowForm.date || new Date().toISOString().slice(0, 10),
            reference_no: newRowForm.reference || "ADJ",
            description: newRowForm.description || "Historical Adjustment",
            debit: newRowForm.debit,
            credit: newRowForm.credit,
          },
          reason: newRowForm.reason || "Manual addition of historical entry",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to add transaction row.");
      }

      setShowAddRowModal(false);
      setNewRowForm({ date: "", reference: "", description: "", debit: 0, credit: 0, reason: "" });
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add entry.");
    } finally {
      setSubmittingAction(false);
    }
  }

  // Delete a historical entry (for live ledger)
  async function handleDeleteHistoricalEntry(entry: StatementEntry) {
    if (!customerSavedSoa) return;
    if (!confirm(`Are you sure you want to delete historical row ${entry.reference_no}?`)) return;

    setLoading(true);
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
          attachmentId: customerSavedSoa.id,
          action: "delete_entry",
          entryId: entry.historical_entry_id || entry.id,
          reason: "User deleted historical statement row",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to delete transaction row.");
      }

      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete entry.");
      setLoading(false);
    }
  }

  // Save Cutover Settings
  async function handleSaveCutoverSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!customerSavedSoa) return;

    setSubmittingAction(true);
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
          attachmentId: customerSavedSoa.id,
          action: "update_cutover",
          cutoverDate: cutoverDateInput || null,
          isCutoverApproved: cutoverApprovedInput,
          reason: "User updated cutover settings",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Failed to update cutover settings.");
      }

      setShowCutoverModal(false);
      void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update cutover.");
    } finally {
      setSubmittingAction(false);
    }
  }

  // Export table rows to CSV
  function handleExportCsv() {
    if (!statementData?.entries || statementData.entries.length === 0) return;
    const headers = ["Date", "Reference", "Description", "Debit", "Credit", "Running Balance", "Status"];
    const rows = statementData.entries.map((e) => [
      e.date,
      `"${(e.reference_no || "").replace(/"/g, '""')}"`,
      `"${(e.description || "").replace(/"/g, '""')}"`,
      e.debit.toFixed(2),
      e.credit.toFixed(2),
      e.balance.toFixed(2),
      e.status || "live",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${pdfFilename.replace(/\.pdf$/, ".csv")}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Summary counts for statements
  const verifiedCount = useMemo(() => statements.filter((s) => s.is_verified && !s.needs_review).length, [statements]);
  const needsReviewCount = useMemo(() => statements.filter((s) => s.needs_review).length, [statements]);
  const pendingCount = useMemo(() => statements.filter((s) => !s.is_verified && !s.needs_review && s.status !== "rejected").length, [statements]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Back to Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Customer Statements
              </h1>
              <p className="text-xs text-slate-400">
                Authoritative Statement of Account imports & automatic ERP financial ledger synchronization
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Upload size={14} />
              <span>Import SOA</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              disabled={!statementData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            >
              <Download size={14} />
              <span>Download SOA</span>
            </button>

            {/* Small More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 p-2.5 text-slate-400 hover:text-white transition cursor-pointer"
                title="More options"
              >
                <MoreVertical size={16} />
              </button>

              {showMoreMenu && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-xl py-1 text-xs z-30"
                  onMouseLeave={() => setShowMoreMenu(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowAddRowModal(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer"
                  >
                    <Plus size={13} className="text-cyan-400" />
                    <span>Add Historical Row</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowCutoverModal(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer"
                  >
                    <Clock size={13} className="text-amber-400" />
                    <span>Cutover Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowUploadsModal(true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer"
                  >
                    <History size={13} className="text-blue-400" />
                    <span>View Original SOA Files</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      handleExportCsv();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2 cursor-pointer border-t border-slate-800"
                  >
                    <FileText size={13} className="text-emerald-400" />
                    <span>Export to CSV</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View Mode Segmented Tabs */}
        <div className="flex border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewTab("statements")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                viewTab === "statements"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <FileText size={15} />
              <span>Statements of Account</span>
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  viewTab === "statements" ? "bg-cyan-700/80 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {statements.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab("ledger")}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                viewTab === "ledger"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Layers size={15} />
              <span>Live Customer Ledger</span>
              {statementData && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    viewTab === "ledger" ? "bg-cyan-700/80 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {filteredEntries.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {loadError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-800 bg-rose-950/50 p-4 text-xs text-rose-200">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* TAB 1: STATEMENTS OF ACCOUNT (DEFAULT) */}
        {viewTab === "statements" && (
          <div className="space-y-4">
            {/* Quick Summary Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total SOAs</span>
                  <span className="text-lg font-bold font-mono text-white">{statements.length}</span>
                </div>
                <FileText size={20} className="text-cyan-400 opacity-60" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Verified</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">{verifiedCount}</span>
                </div>
                <CheckCircle2 size={20} className="text-emerald-400 opacity-60" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Needs Review</span>
                  <span className="text-lg font-bold font-mono text-amber-400">{needsReviewCount}</span>
                </div>
                <AlertTriangle size={20} className="text-amber-400 opacity-60" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Pending</span>
                  <span className="text-lg font-bold font-mono text-cyan-300">{pendingCount}</span>
                </div>
                <Clock size={20} className="text-cyan-300 opacity-60" />
              </div>
            </div>

            {/* Filter Bar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Search */}
                <div className="md:col-span-4 relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={statementSearch}
                    onChange={(e) => setStatementSearch(e.target.value)}
                    placeholder="Search SOA #, customer, or filename..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-9 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  {statementSearch && (
                    <button
                      type="button"
                      onClick={() => setStatementSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Customer Filter */}
                <div className="md:col-span-3">
                  <select
                    value={statementCustomerFilter}
                    onChange={(e) => setStatementCustomerFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">All Customers ({customers.length})</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="md:col-span-2">
                  <select
                    value={statementStatusFilter}
                    onChange={(e) => setStatementStatusFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="verified">Verified</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="pending">Pending</option>
                    <option value="error">Error</option>
                  </select>
                </div>

                {/* Date Filters */}
                <div className="md:col-span-3 flex items-center gap-1.5">
                  <input
                    type="date"
                    value={statementFromDate}
                    onChange={(e) => setStatementFromDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    title="From date"
                  />
                  <span className="text-slate-500 text-xs">-</span>
                  <input
                    type="date"
                    value={statementToDate}
                    onChange={(e) => setStatementToDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    title="To date"
                  />
                  {(statementSearch || statementCustomerFilter || statementStatusFilter !== "all" || statementFromDate || statementToDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatementSearch("");
                        setStatementCustomerFilter("");
                        setStatementStatusFilter("all");
                        setStatementFromDate("");
                        setStatementToDate("");
                      }}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                      title="Reset filters"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Batch Actions Bar (Visible when 1+ selected) */}
              {selectedStatementIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-2.5 bg-cyan-950/30 -mx-3.5 -mb-3.5 px-3.5 py-2 rounded-b-2xl">
                  <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
                    <span>{selectedStatementIds.size} statement(s) selected</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStatementIds(new Set())}
                      className="text-[11px] text-slate-400 hover:text-white underline ml-1 cursor-pointer"
                    >
                      Deselect all
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={batchCustomerTarget}
                        onChange={(e) => setBatchCustomerTarget(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                      >
                        <option value="">Select Customer to Apply...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleBatchApplyCustomer}
                        disabled={!batchCustomerTarget || isApplyingBatch}
                        className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                      >
                        {isApplyingBatch ? "Applying..." : "Apply to Selected"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleBatchDeleteStatements}
                      disabled={isApplyingBatch}
                      className="rounded-lg border border-rose-800 bg-rose-950/60 hover:bg-rose-900 text-rose-300 px-3 py-1 text-xs font-semibold transition cursor-pointer"
                    >
                      Delete Selected
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Statements Table */}
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
                <span>Loading Statements of Account...</span>
              </div>
            ) : filteredStatements.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center space-y-3">
                <FileText size={36} className="mx-auto text-slate-600" />
                <h2 className="text-base font-bold text-white">No Statements Found</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {statements.length === 0
                    ? "No Statement of Account files have been uploaded yet. Click Import SOA to bulk import historical statements (PDF, Excel, CSV, ZIP)."
                    : "No statements match your current search and filters. Try adjusting or clearing your filters."}
                </p>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Import SOA</span>
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                    <tr>
                      <th className="px-4 py-3.5 text-center w-10">
                        <input
                          type="checkbox"
                          checked={filteredStatements.length > 0 && selectedStatementIds.size === filteredStatements.length}
                          onChange={handleToggleSelectAllStatements}
                          className="rounded border-slate-700 bg-slate-950 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3.5 text-left font-semibold">SOA Number</th>
                      <th className="px-4 py-3.5 text-left font-semibold">Customer</th>
                      <th className="px-4 py-3.5 text-left font-semibold">Date</th>
                      <th className="px-4 py-3.5 text-right font-semibold">Closing Balance</th>
                      <th className="px-4 py-3.5 text-center font-semibold">Status</th>
                      <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredStatements.map((stmt) => {
                      const isSelected = selectedStatementIds.has(stmt.id);
                      return (
                        <tr
                          key={stmt.id}
                          className={`hover:bg-slate-800/40 transition ${isSelected ? "bg-cyan-950/20" : ""}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectStatement(stmt.id)}
                              className="rounded border-slate-700 bg-slate-950 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-white">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-cyan-400 shrink-0" />
                              <button
                                type="button"
                                onClick={() => setEditingSoaRecord(stmt)}
                                className="hover:text-cyan-300 hover:underline cursor-pointer text-left"
                                title="Click to view/edit in Excel-style editor"
                              >
                                {stmt.soa_number || "—"}
                              </button>
                            </div>
                            {stmt.file_name && stmt.file_name !== stmt.soa_number && (
                              <div className="text-[10px] text-slate-500 font-sans truncate max-w-xs" title={stmt.file_name}>
                                {stmt.file_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-200 block">{stmt.customer_name || "Unassigned"}</span>
                            {stmt.customer_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCustomerId(stmt.customer_id);
                                  setViewTab("ledger");
                                  void loadStatement(stmt.customer_id);
                                }}
                                className="text-[10px] text-cyan-400 hover:underline hover:text-cyan-300"
                                title="View live ledger for this customer"
                              >
                                View Live Ledger →
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {stmt.statement_date ? (
                              formatDisplayDate(stmt.statement_date)
                            ) : (
                              <span className="text-slate-500 italic">Unknown</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            {stmt.closing_balance != null ? (
                              stmt.closing_balance < 0 ? (
                                <span className="text-emerald-400">
                                  (AED {Math.abs(stmt.closing_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}) Cr
                                </span>
                              ) : (
                                <span className={stmt.closing_balance > 0 ? "text-cyan-300" : "text-slate-300"}>
                                  AED {stmt.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              )
                            ) : (
                              <span className="text-amber-400 font-semibold italic text-[11px]">Not extracted</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {stmt.is_verified && !stmt.needs_review ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                                <CheckCircle2 size={12} />
                                Verified
                              </span>
                            ) : stmt.status === "rejected" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-950/80 border border-rose-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
                                <AlertTriangle size={12} />
                                Error
                              </span>
                            ) : stmt.needs_review ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 border border-amber-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                                <AlertTriangle size={12} />
                                Needs Review
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-950/80 border border-cyan-700/60 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                                <Clock size={12} />
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingSoaRecord(stmt)}
                                className="inline-flex items-center gap-1 rounded-lg border border-cyan-800/60 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 hover:text-white px-2.5 py-1 text-xs font-semibold transition cursor-pointer"
                                title="Open Excel-style editor with original PDF preview"
                              >
                                <Edit2 size={12} />
                                <span>View / Edit</span>
                              </button>

                              {stmt.storage_path ? (
                                <a
                                  href={`/api/smart-import/storage?path=${encodeURIComponent(stmt.storage_path)}&bucket=${encodeURIComponent(stmt.storage_bucket || "smart-imports")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 text-xs font-semibold transition"
                                  title="Download / View original PDF"
                                >
                                  <Download size={12} />
                                  <span>PDF</span>
                                </a>
                              ) : (
                                <span className="text-slate-600 text-xs px-2">—</span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteStatement(stmt.id, stmt.soa_number)}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                                title="Delete statement record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE CUSTOMER LEDGER STATEMENT */}
        {viewTab === "ledger" && (
          <div className="space-y-6">
            {/* Customer Selector & Prominent Outstanding Balance */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                {/* Customer Selector */}
                <div className="lg:col-span-5 space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Select Customer
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                      </option>
                    ))}
                  </select>
                  {currentCustomer?.trn && (
                    <p className="text-[11px] text-slate-400 font-mono">
                      TRN: <span className="text-slate-300">{currentCustomer.trn}</span>
                    </p>
                  )}
                </div>

                {/* Prominent Outstanding Balance Banner */}
                <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-5 border-t lg:border-t-0 lg:border-l border-slate-800/80 pt-4 lg:pt-0 lg:pl-6">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Current Outstanding Balance
                    </span>
                    <div
                      className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                        (statementData?.closing_balance || 0) > 0 ? "text-cyan-400" : "text-emerald-400"
                      }`}
                    >
                      AED {(statementData?.closing_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      <span>
                        Opening: <strong className="text-slate-300">AED {(statementData?.opening_balance || 0).toFixed(2)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Total Invoices: <strong className="text-slate-300">AED {(statementData?.total_debits || 0).toFixed(2)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Total Payments: <strong className="text-emerald-300">AED {(statementData?.total_credits || 0).toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>

                  {statementData?.cutover_date && (
                    <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-right shrink-0">
                      <span className="text-[10px] text-amber-300 font-semibold block uppercase">
                        Cutover Date
                      </span>
                      <span className="text-xs text-white font-mono font-bold">
                        {formatDisplayDate(statementData.cutover_date)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Date Filters & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reference or description..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-9 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    title="From date"
                  />
                </div>
                <span className="text-slate-500 text-xs">to</span>
                <div className="relative">
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    title="To date"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyDateFilter}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer"
                >
                  Filter
                </button>
                {(fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={handleClearDateFilter}
                    className="rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                    title="Clear date filter"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Statement Transaction Table */}
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
                <span>Calculating customer statement & live ledger...</span>
              </div>
            ) : !statementData || filteredEntries.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center space-y-3">
                <FileText size={36} className="mx-auto text-slate-600" />
                <h2 className="text-base font-bold text-white">No Statement Transactions Found</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No live invoices, payments, or imported historical entries found for this customer. Click <strong>Import SOA</strong> to upload historical records or create a Tax Invoice in the ERP.
                </p>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Import SOA</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Desktop Clean Table */}
                <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                      <tr>
                        <th className="px-4 py-3.5 text-left font-semibold">Date</th>
                        <th className="px-4 py-3.5 text-left font-semibold">Reference</th>
                        <th className="px-4 py-3.5 text-left font-semibold">Description</th>
                        <th className="px-4 py-3.5 text-right font-semibold">Debit (AED)</th>
                        <th className="px-4 py-3.5 text-right font-semibold">Credit (AED)</th>
                        <th className="px-4 py-3.5 text-right font-semibold">Balance (AED)</th>
                        <th className="px-4 py-3.5 text-center font-semibold">Source</th>
                        <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {/* Opening Balance Row */}
                      <tr className="bg-slate-950/40 text-slate-400 font-medium">
                        <td className="px-4 py-3 font-mono">{formatDisplayDate(statementData.from_date || statementData.statement_date)}</td>
                        <td className="px-4 py-3 font-mono">—</td>
                        <td className="px-4 py-3 italic">Opening Balance Brought Forward</td>
                        <td className="px-4 py-3 text-right font-mono">—</td>
                        <td className="px-4 py-3 text-right font-mono">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-200">
                          {statementData.opening_balance.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                            Opening
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">—</td>
                      </tr>

                      {/* Transaction Rows */}
                      {filteredEntries.map((row, idx) => {
                        const isHistorical = Boolean(row.is_historical);
                        const isLive = !isHistorical || row.status === "live";
                        const isEdited = Boolean(row.is_edited);

                        return (
                          <tr key={row.id || `entry_${idx}`} className="hover:bg-slate-800/40 transition">
                            <td className="px-4 py-3 font-mono text-slate-300">
                              {formatDisplayDate(row.date)}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-white">
                              {row.invoice_id ? (
                                <Link
                                  href={`/tax-invoices?id=${row.invoice_id}`}
                                  className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 hover:underline"
                                  target="_blank"
                                >
                                  <span>{row.reference_no}</span>
                                  <ExternalLink size={11} className="opacity-60" />
                                </Link>
                              ) : row.voucher_id ? (
                                <Link
                                  href={`/receipt-vouchers?id=${row.voucher_id}`}
                                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 hover:underline"
                                  target="_blank"
                                >
                                  <span>{row.reference_no}</span>
                                  <ExternalLink size={11} className="opacity-60" />
                                </Link>
                              ) : (
                                <span>{row.reference_no}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {row.description}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-white font-medium">
                              {row.debit > 0 ? row.debit.toFixed(2) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-emerald-400 font-medium">
                              {row.credit > 0 ? row.credit.toFixed(2) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-white">
                              {row.balance.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {row.status === "matched" ? (
                                <span className="inline-flex rounded-full bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300" title="Historical entry matched to live ERP record">
                                  Matched
                                </span>
                              ) : isLive ? (
                                <span className="inline-flex rounded-full bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" title="Live ERP record (updates automatically)">
                                  Live
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300" title="Imported historical SOA entry">
                                  Historical {isEdited ? "• Edited" : ""}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isLive && row.invoice_id ? (
                                <Link
                                  href={`/tax-invoices?id=${row.invoice_id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                                >
                                  <span>Edit Source</span>
                                  <ExternalLink size={11} />
                                </Link>
                              ) : isLive && row.voucher_id ? (
                                <Link
                                  href={`/receipt-vouchers?id=${row.voucher_id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                                >
                                  <span>Edit Source</span>
                                  <ExternalLink size={11} />
                                </Link>
                              ) : isHistorical && customerSavedSoa ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingEntry(row);
                                      setEditForm({
                                        date: row.date?.slice(0, 10) || "",
                                        reference: row.reference_no,
                                        description: row.description,
                                        debit: row.debit,
                                        credit: row.credit,
                                        reason: "",
                                      });
                                    }}
                                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition cursor-pointer"
                                    title="Edit historical row"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistoricalEntry(row)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                                    title="Delete historical row"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards (Visible only on small screens) */}
                <div className="md:hidden space-y-2.5">
                  {filteredEntries.map((row, idx) => (
                    <div key={`m_${row.id || idx}`} className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-400">{formatDisplayDate(row.date)}</span>
                        <span className="font-mono font-bold text-white text-sm">
                          AED {row.balance.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-cyan-400">{row.reference_no}</span>
                        <span className="text-slate-300">{row.description}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400">
                          Debit: <strong className="text-white">{row.debit > 0 ? row.debit.toFixed(2) : "0.00"}</strong>
                        </span>
                        <span className="text-slate-400">
                          Credit: <strong className="text-emerald-400">{row.credit > 0 ? row.credit.toFixed(2) : "0.00"}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Add Row Action at bottom */}
                {customerSavedSoa && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRowModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Historical Entry</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk SOA Import Modal */}
      {showImportModal && (
        <BulkSoaImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          companyId={companyId}
          customers={customers}
          existingStatements={statements}
          onImportComplete={() => {
            setShowImportModal(false);
            void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
          }}
        />
      )}

      {/* Full-Screen Excel-Style SOA Editor Modal */}
      {editingSoaRecord && (
        <ExcelSoaEditorModal
          isOpen={Boolean(editingSoaRecord)}
          record={editingSoaRecord}
          customers={customers}
          onClose={() => setEditingSoaRecord(null)}
          onSaved={() => {
            setEditingSoaRecord(null);
            void loadStatement(selectedCustomerId, fromDate || undefined, toDate || undefined);
          }}
        />
      )}

      {/* Print / Download SOA Modal */}
      {showPrintModal && statementData && (
        <PrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          documentFilename={pdfFilename}
          documentTitle="Statement of Account"
        >
          <StatementOfAccountTemplate
            company={companyInfo}
            statement={statementData}
            onClose={() => setShowPrintModal(false)}
          />
        </PrintModal>
      )}

      {/* Edit Historical Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 size={14} className="text-cyan-400" />
                <span>Edit Historical Transaction</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditEntry} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Reference</label>
                <input
                  type="text"
                  required
                  value={editForm.reference}
                  onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Debit (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.debit}
                    onChange={(e) => setEditForm({ ...editForm, debit: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Credit (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.credit}
                    onChange={(e) => setEditForm({ ...editForm, credit: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Reason for Edit (Audit Log)</label>
                <input
                  type="text"
                  placeholder="e.g. Corrected invoice reference"
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingAction ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Historical Entry Modal */}
      {showAddRowModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={14} className="text-cyan-400" />
                <span>Add Historical Transaction</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddRowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveNewRow} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newRowForm.date || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setNewRowForm({ ...newRowForm, date: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Reference</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. INV-HIST-01 or REC-001"
                  value={newRowForm.reference}
                  onChange={(e) => setNewRowForm({ ...newRowForm, reference: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Historical Material Supply"
                  value={newRowForm.description}
                  onChange={(e) => setNewRowForm({ ...newRowForm, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Debit (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newRowForm.debit}
                    onChange={(e) => setNewRowForm({ ...newRowForm, debit: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Credit (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newRowForm.credit}
                    onChange={(e) => setNewRowForm({ ...newRowForm, credit: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Reason (Audit Trail)</label>
                <input
                  type="text"
                  placeholder="e.g. Missing historical invoice from archive"
                  value={newRowForm.reason}
                  onChange={(e) => setNewRowForm({ ...newRowForm, reason: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddRowModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingAction ? "Adding..." : "Add Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cutover Settings Modal */}
      {showCutoverModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock size={14} className="text-amber-400" />
                <span>Historical Cutover Settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCutoverModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCutoverSettings} className="space-y-3">
              <p className="text-slate-400 text-[11px]">
                The cutover date marks the transition between imported historical SOA data and live ERP transactions. Invoices and payments before this date come from your imported SOA; subsequent records populate automatically from the ERP ledger.
              </p>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                  Cutover Date
                </label>
                <input
                  type="date"
                  value={cutoverDateInput}
                  onChange={(e) => setCutoverDateInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={cutoverApprovedInput}
                  onChange={(e) => setCutoverApprovedInput(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900"
                />
                <span className="font-semibold text-white">Approve and lock cutover date</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCutoverModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingAction ? "Saving..." : "Save Cutover"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uploads Archive Modal */}
      {showUploadsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4 text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History size={14} className="text-cyan-400" />
                <span>Original Imported SOA Files</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1">
              {statements
                .filter((s) => s.customer_id === selectedCustomerId)
                .map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{s.file_name}</p>
                      <p className="text-[11px] text-slate-400">
                        SOA: {s.soa_number} • Date: {s.statement_date} • Closing: {s.closing_balance != null ? `AED ${s.closing_balance.toFixed(2)}` : "Not extracted"}
                      </p>
                    </div>
                    {s.storage_path && (
                      <a
                        href={`/api/smart-import/storage?path=${encodeURIComponent(s.storage_path)}&bucket=${encodeURIComponent(s.storage_bucket || "smart-imports")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold text-xs"
                      >
                        <Download size={13} />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                ))}
              {statements.filter((s) => s.customer_id === selectedCustomerId).length === 0 && (
                <p className="text-center text-slate-500 py-6">
                  No uploaded SOA files archived for this customer.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setShowUploadsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
