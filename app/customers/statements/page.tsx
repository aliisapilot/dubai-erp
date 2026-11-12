"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Upload,
  Eye,
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  X,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtAED } from "@/lib/helpers";
import type { CustomerCandidate, StoredSoaRecord } from "@/lib/soaManager";
import BulkSoaImportModal from "@/components/statements/BulkSoaImportModal";
import SoaPreviewModal from "@/components/statements/SoaPreviewModal";

function formatDisplayDate(iso: string): string {
  if (!iso) return "—";
  const parts = iso.split("T")[0].split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export default function CustomerStatementsPage() {
  const [companyId, setCompanyId] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerCandidate[]>([]);
  const [statements, setStatements] = useState<StoredSoaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedCustomerFilterId, setSelectedCustomerFilterId] = useState("");

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<StoredSoaRecord | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadStatements = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const res = await fetch("/api/customer-statements", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Could not load customer statements.");
      }

      setCompanyId(json.companyId || "");
      setCustomers(json.customers || []);
      setStatements(json.statements || []);

      // Honor ?customer_id=... query param if linked from /customers
      if (typeof window !== "undefined") {
        const qCid = new URLSearchParams(window.location.search).get("customer_id");
        if (qCid) setSelectedCustomerFilterId(qCid);
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
      if (active) void loadStatements();
    });
    return () => {
      active = false;
    };
  }, [loadStatements]);

  const filteredStatements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return statements.filter((s) => {
      if (selectedCustomerFilterId && s.customer_id !== selectedCustomerFilterId) {
        return false;
      }
      if (dateFilter && !s.statement_date.startsWith(dateFilter)) {
        return false;
      }
      if (q) {
        const matchCust = s.customer_name.toLowerCase().includes(q);
        const matchSoa = s.soa_number.toLowerCase().includes(q);
        const matchFile = s.file_name.toLowerCase().includes(q);
        if (!matchCust && !matchSoa && !matchFile) return false;
      }
      return true;
    });
  }, [statements, searchQuery, dateFilter, selectedCustomerFilterId]);

  const activeCustomerFilterName = useMemo(() => {
    if (!selectedCustomerFilterId) return "";
    return (
      customers.find((c) => c.id === selectedCustomerFilterId)?.name ||
      statements.find((s) => s.customer_id === selectedCustomerFilterId)?.customer_name ||
      "Selected Customer"
    );
  }, [selectedCustomerFilterId, customers, statements]);

  async function handleDownloadOriginal(record: StoredSoaRecord) {
    if (!record.storage_path) return;
    setDownloadingId(record.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      const url = `/api/smart-import/storage?path=${encodeURIComponent(
        record.storage_path
      )}&bucket=${encodeURIComponent(record.storage_bucket || "smart-imports")}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Download failed.");

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = record.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to download file.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
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
                {statements.length} imported statement{statements.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2.5 text-sm font-bold transition shadow-sm cursor-pointer"
          >
            <Upload size={16} />
            <span>Import SOA Files</span>
          </button>
        </div>

        {/* Search & Date Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer or SOA number..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative sm:w-48">
            <Calendar
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
              title="Filter by statement date"
            />
          </div>
        </div>

        {/* Customer History Filter Pill */}
        {selectedCustomerFilterId && (
          <div className="flex items-center justify-between rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-4 py-2.5 text-xs">
            <span>
              Viewing statements for{" "}
              <strong className="text-cyan-300">{activeCustomerFilterName}</strong> (
              {filteredStatements.length})
            </span>
            <button
              type="button"
              onClick={() => setSelectedCustomerFilterId("")}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-200 font-semibold transition cursor-pointer"
            >
              <X size={12} />
              <span>Show All Customers</span>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {loadError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-800 bg-rose-950/50 p-4 text-xs text-rose-200">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
            <span>Loading customer statements...</span>
          </div>
        ) : filteredStatements.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center space-y-3">
            <FileText size={36} className="mx-auto text-slate-600" />
            <h2 className="text-base font-bold text-white">
              {statements.length === 0 ? "No Customer Statements Imported Yet" : "No Matching Statements"}
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {statements.length === 0
                ? "Click Import SOA Files to upload your PDF, Excel, CSV, or ZIP Statements of Account."
                : "Try clearing your search or date filter."}
            </p>
            {statements.length === 0 && (
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-bold transition cursor-pointer"
              >
                <Upload size={14} />
                <span>Import SOA Files</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Clean Table */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5 text-left font-semibold">Customer</th>
                    <th className="px-5 py-3.5 text-left font-semibold">SOA Number</th>
                    <th className="px-5 py-3.5 text-left font-semibold">Statement Date</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Closing Balance</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredStatements.map((s) => {
                    const isPdf = s.file_name.toLowerCase().endsWith(".pdf");
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerFilterId(s.customer_id)}
                            className="text-left font-semibold text-white hover:text-cyan-300 transition cursor-pointer"
                            title="View all statements for this customer"
                          >
                            {s.customer_name}
                          </button>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            {isPdf ? (
                              <FileText size={11} className="text-rose-400" />
                            ) : (
                              <FileSpreadsheet size={11} className="text-emerald-400" />
                            )}
                            <span className="truncate max-w-[260px]">{s.file_name}</span>
                            {s.needs_review && (
                              <span className="rounded bg-amber-950/80 border border-amber-800 px-1.5 py-0.2 text-[10px] text-amber-300">
                                Needs Review
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-200">
                          {s.soa_number}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-300">
                          {formatDisplayDate(s.statement_date)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-100">
                          {fmtAED(s.closing_balance)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewRecord(s)}
                              disabled={!s.storage_path}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                            >
                              <Eye size={13} className="text-cyan-400" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadOriginal(s)}
                              disabled={!s.storage_path || downloadingId === s.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                            >
                              {downloadingId === s.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Download size={13} className="text-emerald-400" />
                              )}
                              <span>Download</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredStatements.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerFilterId(s.customer_id)}
                        className="font-bold text-sm text-white hover:text-cyan-300 text-left truncate block w-full cursor-pointer"
                      >
                        {s.customer_name}
                      </button>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{s.soa_number}</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-cyan-300 shrink-0">
                      {fmtAED(s.closing_balance)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{formatDisplayDate(s.statement_date)}</span>
                    <span className="truncate max-w-[180px]">{s.file_name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewRecord(s)}
                      disabled={!s.storage_path}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                    >
                      <Eye size={14} className="text-cyan-400" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadOriginal(s)}
                      disabled={!s.storage_path || downloadingId === s.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                    >
                      {downloadingId === s.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} className="text-emerald-400" />
                      )}
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bulk Import Modal */}
      <BulkSoaImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        companyId={companyId}
        customers={customers}
        existingStatements={statements}
        onImportComplete={() => {
          void loadStatements();
        }}
      />

      {/* Preview Modal */}
      <SoaPreviewModal
        isOpen={Boolean(previewRecord)}
        onClose={() => setPreviewRecord(null)}
        record={previewRecord}
      />
    </main>
  );
}
