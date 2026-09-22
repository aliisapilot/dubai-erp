"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  History, Search, Filter, ArrowLeft, ArrowDownRight, ArrowUpRight,
  RefreshCw, Package, Calendar, Download
} from "lucide-react";

type StockMovement = {
  id: string;
  created_at: string;
  movement_type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER" | "RETURN";
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_number: string | null;
  notes: string | null;
  products?: {
    name: string;
    sku: string | null;
    unit: string | null;
    category: string | null;
  };
};

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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
        .select("id, created_at, movement_type, quantity, previous_stock, new_stock, unit_cost, reference_type, reference_number, notes, products(name, sku, unit, category)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMovements((data as unknown as StockMovement[]) || []);
    } catch (err) {
      console.error("Error loading stock movements:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = movements.filter((m) => {
    const prodName = m.products?.name?.toLowerCase() || "";
    const prodSku = m.products?.sku?.toLowerCase() || "";
    const refNum = m.reference_number?.toLowerCase() || "";
    const notesStr = m.notes?.toLowerCase() || "";
    const q = search.toLowerCase();

    const matchesSearch = prodName.includes(q) || prodSku.includes(q) || refNum.includes(q) || notesStr.includes(q);
    const matchesType = typeFilter === "all" || m.movement_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalIn = movements.filter(m => m.movement_type === "IN").reduce((acc, m) => acc + (m.quantity || 0), 0);
  const totalOut = movements.filter(m => m.movement_type === "OUT").reduce((acc, m) => acc + (m.quantity || 0), 0);
  const totalAdjustments = movements.filter(m => m.movement_type === "ADJUSTMENT").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <History size={20} />
              </span>
              Stock Movements Ledger
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Complete chronological audit trail of all warehouse receipts, issues, and adjustments</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inventory/stock-in"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
          >
            <ArrowDownRight size={14} /> Stock In
          </Link>
          <Link
            href="/inventory/stock-out"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
          >
            <ArrowUpRight size={14} /> Stock Out
          </Link>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Received (In)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">+{totalIn.toLocaleString()}</p>
            <p className="text-xs text-slate-400">Goods receipts &amp; returns</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <ArrowDownRight size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Dispatched (Out)</p>
            <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">-{totalOut.toLocaleString()}</p>
            <p className="text-xs text-slate-400">Site issues &amp; deliveries</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <ArrowUpRight size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Stock Reconciliations</p>
            <p className="text-2xl font-bold text-blue-600 mt-1 font-mono">{totalAdjustments}</p>
            <p className="text-xs text-slate-400">Physical count adjustments</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <RefreshCw size={24} />
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by product, SKU, reference #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Movement Types</option>
            <option value="IN">Stock In (Receipt)</option>
            <option value="OUT">Stock Out (Dispatch)</option>
            <option value="ADJUSTMENT">Adjustments</option>
            <option value="TRANSFER">Transfers</option>
            <option value="RETURN">Returns</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Product / SKU</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Prev &rarr; New Stock</th>
                <th className="px-4 py-3 text-right">Unit Cost (AED)</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading stock movements ledger...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No stock movements found matching current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const isPositive = m.movement_type === "IN" || (m.movement_type === "ADJUSTMENT" && m.new_stock > m.previous_stock);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString("en-AE", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{m.products?.name || "Unknown Product"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{m.products?.sku || "No SKU"}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          m.movement_type === "IN"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.movement_type === "OUT"
                            ? "bg-amber-100 text-amber-800"
                            : m.movement_type === "ADJUSTMENT"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={isPositive ? "text-emerald-600" : "text-amber-600"}>
                          {isPositive ? `+${m.quantity}` : `-${m.quantity}`} {m.products?.unit || ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 whitespace-nowrap">
                        {m.previous_stock} &rarr; <span className="font-semibold text-slate-800">{m.new_stock}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {m.unit_cost ? Number(m.unit_cost).toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="font-medium">{m.reference_type || "-"}</span>
                        {m.reference_number && (
                          <span className="block font-mono text-[11px] text-slate-500">{m.reference_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                        {m.notes || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
