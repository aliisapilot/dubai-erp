"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  Package, ArrowLeft, Printer, AlertTriangle, ArrowDownRight,
  ArrowUpRight, RefreshCw, History, CheckCircle2
} from "lucide-react";

export default function InventoryReportPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventoryData();
  }, []);

  async function loadInventoryData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [pRes, mRes] = await Promise.all([
        supabase.from("products").select("*").eq("company_id", companyId).order("name"),
        supabase.from("stock_movements").select("*, products(name, sku, unit)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
      ]);

      setProducts(pRes.data || []);
      setMovements(mRes.data || []);
    } catch (err) {
      console.error("Error loading inventory report:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalValuation = products.reduce((acc, p) => acc + ((p.current_stock || 0) * (p.cost_price || 0)), 0);
  const lowStockItems = products.filter(p => (p.current_stock ?? 0) <= (p.minimum_stock ?? 0) && p.active);
  const outOfStockItems = products.filter(p => (p.current_stock ?? 0) <= 0 && p.active);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Package size={20} />
              </span>
              Inventory Valuation &amp; Stock Report
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Physical warehouse valuation at cost, reorder alerts, and movement activity audit</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <Printer size={15} /> Print Report
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Warehouse Valuation</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalValuation.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Based on purchase unit costs</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Low Stock SKUs</p>
          <p className="text-2xl font-bold text-amber-700 mt-2 font-mono">{lowStockItems.length}</p>
          <p className="text-xs text-amber-600 mt-1">At or below reorder threshold</p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Out of Stock SKUs</p>
          <p className="text-2xl font-bold text-rose-700 mt-2 font-mono">{outOfStockItems.length}</p>
          <p className="text-xs text-rose-600 mt-1">Zero quantity on hand</p>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Physical Inventory Valuation</h3>
          <span className="text-xs text-slate-500 font-mono">{products.length} SKUs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Item / SKU</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Cost Price (AED)</th>
                <th className="px-4 py-3 text-right">Selling Price (AED)</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Min Stock</th>
                <th className="px-4 py-3 text-right">Total Valuation (AED)</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const val = (p.current_stock || 0) * (p.cost_price || 0);
                const isLow = (p.current_stock ?? 0) <= (p.minimum_stock ?? 0);

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-900">{p.name}</span>
                      {p.sku && <span className="block text-[10px] text-slate-400 font-mono">{p.sku}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{p.category || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{Number(p.cost_price || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{Number(p.selling_price || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                      {p.current_stock ?? 0} {p.unit || ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{p.minimum_stock ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                      {val.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isLow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {isLow ? "Low Stock" : "Normal"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
