"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, fmtAED, fmtDate, todayISO } from "@/lib/helpers";
import {
  History,
  Search,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Filter,
  X,
  ShieldAlert,
} from "lucide-react";
import {
  normalizeStockMovement,
  executeMovementReversal,
  type MaterialMovementRecord,
} from "@/lib/materialInventory";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<MaterialMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Reversal Modal State
  const [reversingMovement, setReversingMovement] = useState<MaterialMovementRecord | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalUser, setReversalUser] = useState("Authorized Manager");
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadMovements();
  }, []);

  async function loadMovements() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(*)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMovements((data || []).map(normalizeStockMovement));
    } catch (err) {
      console.error("Error loading stock movements:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const q = search.toLowerCase();
      const prodName = (m.product?.name || "").toLowerCase();
      const prodBrand = (m.product?.brand || "").toLowerCase();
      const refNum = (m.reference_number || "").toLowerCase();
      const custName = (m.customer_name || "").toLowerCase();
      const prjName = (m.project_name || "").toLowerCase();
      const notesStr = (m.notes || "").toLowerCase();

      const matchesSearch =
        prodName.includes(q) ||
        prodBrand.includes(q) ||
        refNum.includes(q) ||
        custName.includes(q) ||
        prjName.includes(q) ||
        notesStr.includes(q);

      const matchesType = typeFilter === "all" || m.movement_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [movements, search, typeFilter]);

  async function handleConfirmReversal(e: React.FormEvent) {
    e.preventDefault();
    if (!reversingMovement) return;

    if (!reversalReason.trim()) {
      setReversalError("Audit reversal reason is mandatory.");
      return;
    }

    setReversing(true);
    setReversalError("");
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Active company session not found.");

      const result = await executeMovementReversal(
        companyId,
        reversingMovement.id,
        reversalReason.trim(),
        reversalUser.trim() || "Authorized Manager"
      );

      setSuccessMsg(
        `✓ Movement reversed successfully! Reversal Ref: ${result.reversalDocNumber}. New Stock: ${result.newStock}.`
      );
      setReversingMovement(null);
      setReversalReason("");
      await loadMovements();
    } catch (err: any) {
      console.error("Reversal error:", err);
      setReversalError(err.message || "Failed to execute reversal.");
    } finally {
      setReversing(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <History size={20} />
              </span>
              Material Movements Ledger &amp; Audit Trail
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Immutable chronological record of warehouse receipts, dispatches, cutting wastage, and controlled reversals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inventory/stock-in"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowDownRight size={14} /> Stock In
          </Link>
          <Link
            href="/inventory/stock-out"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowUpRight size={14} /> Material Used
          </Link>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between shadow-lg text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg("")}
            className="text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
            <input
              type="text"
              placeholder="Search by material, brand, customer, project, MIN/GRN reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All Movement Types</option>
              <option value="IN">Stock In (Receipts)</option>
              <option value="OUT">Stock Out (Dispatches &amp; Usage)</option>
              <option value="ADJUSTMENT">Stock Adjustments</option>
              <option value="REVERSAL">Audited Reversals</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <th className="p-3">Timestamp / Date</th>
                <th className="p-3">Type</th>
                <th className="p-3">Doc Reference</th>
                <th className="p-3">Material &amp; Specification</th>
                <th className="p-3">Customer / Project</th>
                <th className="p-3 text-center">Width</th>
                <th className="p-3 text-right">Quantity (m²)</th>
                <th className="p-3 text-right">Previous Stock</th>
                <th className="p-3 text-right">New Stock</th>
                <th className="p-3 text-right">Cost Rate</th>
                <th className="p-3 text-center">Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    <Loader2 size={20} className="animate-spin mx-auto text-sky-400 mb-2" />
                    Loading stock movement ledger...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No movements found matching the filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const isIn = m.movement_type === "IN";
                  const isOut = m.movement_type === "OUT";
                  const isRev = m.movement_type === "REVERSAL" || m.is_reversal;

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isRev ? "bg-rose-950/10" : ""
                      }`}
                    >
                      <td className="p-3 whitespace-nowrap text-slate-300">
                        <span>{fmtDate(m.created_at)}</span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {m.created_at ? m.created_at.split("T")[1]?.slice(0, 5) : ""}
                        </span>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {isIn && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ArrowDownRight size={11} /> Stock In
                          </span>
                        )}
                        {isOut && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <ArrowUpRight size={11} /> Used / Out
                          </span>
                        )}
                        {isRev && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <RotateCcw size={11} /> Reversal
                          </span>
                        )}
                        {m.movement_type === "ADJUSTMENT" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            <RefreshCw size={11} /> Adjustment
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-mono font-bold text-sky-400 whitespace-nowrap">
                        {m.reference_number || "—"}
                      </td>

                      <td className="p-3">
                        <span className="font-semibold text-white block">{m.product?.name || "Material"}</span>
                        <span className="text-[10px] text-slate-400">
                          {m.product?.brand} {m.product?.specification ? `• ${m.product.specification}` : ""}
                        </span>
                      </td>

                      <td className="p-3 max-w-[170px]">
                        <span className="font-medium text-slate-200 block truncate">
                          {m.customer_name || "—"}
                        </span>
                        {m.project_name && (
                          <span className="text-[10px] text-sky-400 block truncate">
                            {m.project_name}
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono text-slate-300">
                        {m.fabric_width ? `${m.fabric_width} m` : "—"}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-sm">
                        <span
                          className={
                            isIn
                              ? "text-emerald-400"
                              : isOut
                              ? "text-rose-400"
                              : isRev
                              ? "text-amber-400"
                              : "text-slate-200"
                          }
                        >
                          {isIn ? "+" : isOut ? "-" : ""}
                          {m.quantity.toFixed(2)} {m.product?.unit || "m²"}
                        </span>
                        {m.running_metres ? (
                          <span className="text-[10px] text-slate-500 block">
                            ≈ {m.running_metres.toFixed(1)} RM
                          </span>
                        ) : null}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-400">
                        {m.previous_stock.toFixed(2)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-white">
                        {m.new_stock.toFixed(2)}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-300">
                        {m.unit_cost ? `AED ${fmtAED(m.unit_cost)}` : "—"}
                      </td>

                      <td className="p-3 text-center">
                        {!isRev && (isIn || isOut) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReversingMovement(m);
                              setReversalError("");
                              setReversalReason("");
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-[10px] text-rose-300 hover:bg-rose-950/80 hover:text-rose-200 transition-colors border border-slate-700"
                            title="Perform audited reversal"
                          >
                            <RotateCcw size={11} /> Reverse
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Controlled Reversal Modal */}
      {reversingMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert size={20} />
                <h3 className="font-bold text-white text-base">Controlled Movement Reversal</h3>
              </div>
              <button
                type="button"
                onClick={() => setReversingMovement(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
              <p className="font-bold">⚠️ Irreversible Audit Action:</p>
              <p>
                Reversing this {reversingMovement.movement_type} movement of{" "}
                <strong>
                  {reversingMovement.quantity} {reversingMovement.product?.unit || "m²"}
                </strong>{" "}
                ({reversingMovement.product?.name}) will create an offsetting REVERSAL transaction and adjust the current stock balance accordingly.
              </p>
            </div>

            {reversalError && (
              <div className="p-3 rounded-lg bg-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} /> {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Audit Reason for Reversal <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Incorrect quantity entered, supplier delivery cancelled, cutting error correction..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Authorized By
                </label>
                <input
                  type="text"
                  required
                  value={reversalUser}
                  onChange={(e) => setReversalUser(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReversingMovement(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {reversing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Reversing...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={13} /> Confirm Audit Reversal
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
