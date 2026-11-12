"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  History,
  RotateCcw,
  Search,
  Calendar,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";

export interface ImportBatchRecord {
  id: string;
  company_id?: string;
  batch_name?: string;
  file_count?: number;
  filenames?: string[];
  status?: string;
  records_created?: Record<string, number> | number;
  records_matched?: Record<string, number> | number;
  created_by?: string;
  created_at?: string;
  rolled_back?: boolean;
  rolled_back_at?: string;
}

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultModuleFilter?: "all" | "customer_statement" | "tax_invoice" | "quotation";
}

export default function ImportHistoryModal({
  isOpen,
  onClose,
  defaultModuleFilter = "all",
}: ImportHistoryModalProps) {
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>(defaultModuleFilter);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchRecord | null>(null);

  // Rollback state
  const [rollbackTarget, setRollbackTarget] = useState<ImportBatchRecord | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackSuccessMsg, setRollbackSuccessMsg] = useState("");
  const [rollbackErrorMsg, setRollbackErrorMsg] = useState("");

  const fetchBatches = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    }

    try {
      const companyId = await getCompanyId();

      // Query batches from Supabase scoped to company
      let query = supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;

      if (error) {
        // Fallback: try calling the history endpoint
        try {
          const res = await fetch("/api/smart-import/history");
          if (res.ok) {
            const json = await res.json();
            setBatches(json.batches || []);
          } else {
            setBatches([]);
          }
        } catch {
          setBatches([]);
        }
      } else {
        setBatches(data || []);
      }
    } catch (err) {
      console.warn("Error fetching import batches:", err);
      setBatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    queueMicrotask(() => {
      if (!isMounted) return;
      setRollbackSuccessMsg("");
      setRollbackErrorMsg("");
      setSelectedBatch(null);
      setRollbackTarget(null);
    });

    const loadInitialBatches = async () => {
      try {
        const companyId = await getCompanyId();
        let query = supabase
          .from("import_batches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60);

        if (companyId) {
          query = query.eq("company_id", companyId);
        }

        const { data, error } = await query;
        if (!isMounted) return;

        if (error) {
          try {
            const res = await fetch("/api/smart-import/history");
            if (res.ok) {
              const json = await res.json();
              if (isMounted) setBatches(json.batches || []);
            } else if (isMounted) {
              setBatches([]);
            }
          } catch {
            if (isMounted) setBatches([]);
          }
        } else {
          setBatches(data || []);
        }
      } catch (err) {
        console.warn("Error fetching import batches:", err);
        if (isMounted) setBatches([]);
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void loadInitialBatches();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    setRollbackErrorMsg("");
    setRollbackSuccessMsg("");

    try {
      const res = await fetch("/api/smart-import/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: rollbackTarget.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Try direct update in Supabase
        const { error: directErr } = await supabase
          .from("import_batches")
          .update({
            rolled_back: true,
            rolled_back_at: new Date().toISOString(),
            status: "rolled_back",
          })
          .eq("id", rollbackTarget.id);

        if (directErr) {
          throw new Error(data.message || directErr.message || "Rollback failed");
        }
      }

      setRollbackSuccessMsg(
        `Batch ${rollbackTarget.id.substring(0, 8)} successfully marked as rolled back.`
      );
      setRollbackTarget(null);
      fetchBatches(true);
    } catch (err) {
      setRollbackErrorMsg(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  };

  if (!isOpen) return null;

  // Filter batches
  const filteredBatches = batches.filter((b) => {
    const nameMatch =
      !searchQuery ||
      b.batch_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.filenames?.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase())) ||
      b.created_by?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!nameMatch) return false;

    if (moduleFilter === "all") return true;
    if (moduleFilter === "customer_statement") {
      return (
        b.batch_name?.toLowerCase().includes("statement") ||
        b.batch_name?.toLowerCase().includes("soa") ||
        (typeof b.records_created === "object" && b.records_created !== null && "customer_statement" in b.records_created)
      );
    }
    if (moduleFilter === "tax_invoice") {
      return (
        b.batch_name?.toLowerCase().includes("invoice") ||
        (typeof b.records_created === "object" && b.records_created !== null && "tax_invoice" in b.records_created)
      );
    }
    if (moduleFilter === "quotation") {
      return (
        b.batch_name?.toLowerCase().includes("quotation") ||
        (typeof b.records_created === "object" && b.records_created !== null && "quotation" in b.records_created)
      );
    }

    return true;
  });

  const getRecordCountStr = (batch: ImportBatchRecord) => {
    if (typeof batch.records_created === "number") {
      return `${batch.records_created} records`;
    }
    if (typeof batch.records_created === "object" && batch.records_created !== null) {
      const parts = Object.entries(batch.records_created).map(
        ([k, v]) => `${v} ${k.replace(/_/g, " ")}`
      );
      return parts.length > 0 ? parts.join(", ") : "0 records";
    }
    return "0 records";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <History size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">Import Audit History</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {batches.length} {batches.length === 1 ? "Batch" : "Batches"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Audit log of all imported statements, tax invoices, and quotations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchBatches(true)}
              disabled={refreshing || loading}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 transition text-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {rollbackSuccessMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{rollbackSuccessMsg}</span>
          </div>
        )}

        {rollbackErrorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>{rollbackErrorMsg}</span>
          </div>
        )}

        {/* CONTROLS BAR: SEARCH & TABS */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-850/50 flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
            <button
              type="button"
              onClick={() => setModuleFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer shrink-0 ${
                moduleFilter === "all"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-slate-800/60 text-slate-400 border border-slate-750 hover:text-slate-200"
              }`}
            >
              All Modules
            </button>
            <button
              type="button"
              onClick={() => setModuleFilter("customer_statement")}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer shrink-0 ${
                moduleFilter === "customer_statement"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-slate-800/60 text-slate-400 border border-slate-750 hover:text-slate-200"
              }`}
            >
              SOA Statements
            </button>
            <button
              type="button"
              onClick={() => setModuleFilter("tax_invoice")}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer shrink-0 ${
                moduleFilter === "tax_invoice"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-slate-800/60 text-slate-400 border border-slate-750 hover:text-slate-200"
              }`}
            >
              Tax Invoices
            </button>
            <button
              type="button"
              onClick={() => setModuleFilter("quotation")}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer shrink-0 ${
                moduleFilter === "quotation"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-slate-800/60 text-slate-400 border border-slate-750 hover:text-slate-200"
              }`}
            >
              Quotations
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter batches by name or file..."
              className="w-full sm:w-64 bg-slate-900 border border-slate-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* ROLLBACK CONFIRMATION INLINE MODAL */}
        {rollbackTarget && (
          <div className="mx-5 my-3 p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-200">
                  Confirm Rollback of Batch: {rollbackTarget.batch_name || rollbackTarget.id.substring(0, 8)}
                </h4>
                <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                  Marking this batch as rolled back will flag the import audit log. Live financial records created by this batch can be reviewed or reversed without affecting historical live ledger stability.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-800/30">
              <button
                type="button"
                onClick={() => setRollbackTarget(null)}
                disabled={rollingBack}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRollback}
                disabled={rollingBack}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5"
              >
                {rollingBack && <Loader2 size={13} className="animate-spin" />}
                Confirm Rollback
              </button>
            </div>
          </div>
        )}

        {/* BATCH LIST */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={24} className="animate-spin text-cyan-400" />
              <p className="text-xs">Loading import batches...</p>
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
              <div className="p-3 rounded-full bg-slate-800/80 text-slate-400">
                <FileSpreadsheet size={24} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">No import batches found</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {searchQuery || moduleFilter !== "all"
                    ? "Try adjusting your filter or search query."
                    : "Imported SOAs, Tax Invoices, or Quotations will be logged here with complete audit trail."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBatches.map((batch) => {
                const isRolledBack = batch.rolled_back || batch.status === "rolled_back";
                const dateStr = batch.created_at
                  ? new Date(batch.created_at).toLocaleString("en-AE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Unknown date";

                return (
                  <div
                    key={batch.id}
                    className={`rounded-xl border p-4 transition ${
                      isRolledBack
                        ? "bg-slate-900/60 border-slate-800/80 opacity-75"
                        : "bg-slate-850/60 border-slate-800 hover:border-slate-750"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                            isRolledBack
                              ? "bg-amber-950/40 border border-amber-800/40 text-amber-400"
                              : "bg-cyan-950/40 border border-cyan-800/40 text-cyan-400"
                          }`}
                        >
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold text-slate-200">
                              {batch.batch_name || "Import Batch"}
                            </h4>
                            {isRolledBack ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60">
                                Rolled Back
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                                Completed
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-slate-500" />
                              {dateStr}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span>{getRecordCountStr(batch)}</span>
                            {batch.created_by && (
                              <>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-400">by {batch.created_by}</span>
                              </>
                            )}
                          </div>

                          {batch.filenames && batch.filenames.length > 0 && (
                            <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                              <span className="text-slate-500">File:</span>
                              <span className="text-slate-300 truncate max-w-md">
                                {batch.filenames.join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ACTIONS */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {!isRolledBack && (
                          <button
                            type="button"
                            onClick={() => setRollbackTarget(batch)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-750 bg-slate-800 hover:bg-amber-950/30 hover:border-amber-800/50 text-slate-400 hover:text-amber-300 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                            title="Rollback this batch"
                          >
                            <RotateCcw size={12} />
                            Rollback
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedBatch(selectedBatch?.id === batch.id ? null : batch)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-750 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition cursor-pointer"
                        >
                          {selectedBatch?.id === batch.id ? "Hide Details" : "View Details"}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDABLE DETAILS */}
                    {selectedBatch?.id === batch.id && (
                      <div className="mt-3 pt-3 border-t border-slate-800 text-xs space-y-2 animate-in fade-in duration-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 font-mono text-[11px] bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                          <div>
                            <span className="text-slate-500">Batch ID:</span> {batch.id}
                          </div>
                          <div>
                            <span className="text-slate-500">Company ID:</span>{" "}
                            {batch.company_id || "N/A"}
                          </div>
                          <div>
                            <span className="text-slate-500">File Count:</span> {batch.file_count || 1}
                          </div>
                          <div>
                            <span className="text-slate-500">Status:</span> {batch.status || "completed"}
                          </div>
                          {isRolledBack && batch.rolled_back_at && (
                            <div className="col-span-2 text-amber-400">
                              <span className="text-amber-500">Rolled back at:</span>{" "}
                              {new Date(batch.rolled_back_at).toLocaleString("en-AE")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info size={13} className="text-slate-400" />
            <span>Audit batches preserve complete import logs and ensure full accounting traceability.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

