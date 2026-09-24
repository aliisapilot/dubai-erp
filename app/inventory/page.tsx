"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  Package, AlertTriangle, ArrowDownRight, ArrowUpRight,
  RefreshCw, Search, Filter, Plus, FileText, CheckCircle2, History
} from "lucide-react";

type ProductStock = {
  id: string;
  sku: string | null;
  name: string;
  product_type: "Product" | "Service";
  category: string | null;
  unit: string | null;
  cost_price: number | null;
  selling_price: number | null;
  current_stock: number | null;
  minimum_stock: number | null;
  active: boolean;
};

export default function InventoryStockPage() {
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  async function loadProducts() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, category, unit, cost_price, selling_price, current_stock, minimum_stock, active")
        .eq("company_id", companyId)
        .order("name", { ascending: true });

      if (error) throw error;
      setProducts((data || []).map(d => ({ ...d, product_type: "Product" as const })));
    } catch (err) {
      console.error("Error loading inventory stock:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadProducts);
  }, []);

  // Filter physical items for valuation
  const physicalItems = products.filter(p => p.product_type === "Product");
  const totalValuation = physicalItems.reduce((acc, p) => acc + ((p.current_stock || 0) * (p.cost_price || 0)), 0);
  const lowStockItems = physicalItems.filter(p => (p.current_stock ?? 0) <= (p.minimum_stock ?? 0) && p.active);
  const outOfStockItems = physicalItems.filter(p => (p.current_stock ?? 0) <= 0 && p.active);

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

  const filtered = products.filter(p => {
    const matchSearch =
      (p.name?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (p.sku?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (p.category?.toLowerCase() || "").includes(search.toLowerCase());
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    const matchLow = !filterLowStockOnly || ((p.current_stock ?? 0) <= (p.minimum_stock ?? 0) && p.product_type === "Product");
    return matchSearch && matchCat && matchLow;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stock &amp; Inventory</h1>
            <span className="rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-semibold border border-emerald-200">
              UAE VAT Compliant
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Real-time stock tracking, physical valuation, and warehouse inventory management</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/inventory/stock-in"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
          >
            <ArrowDownRight size={16} /> Stock In
          </Link>
          <Link
            href="/inventory/stock-out"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium shadow-sm transition-colors"
          >
            <ArrowUpRight size={16} /> Stock Out
          </Link>
          <Link
            href="/inventory/adjustments"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"
          >
            <RefreshCw size={15} /> Adjustments
          </Link>
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium shadow-sm transition-colors"
          >
            <History size={16} /> Ledger
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Stock Valuation</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            AED {totalValuation.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-slate-400">Calculated at purchase cost price</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Physical SKUs</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-bold text-slate-900">{physicalItems.length}</p>
            <span className="text-xs text-slate-500">{products.length - physicalItems.length} Services</span>
          </div>
          <p className="mt-1 text-xs text-emerald-600 font-medium">Tracked in warehouse</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Low Stock Alerts</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-bold text-amber-900">{lowStockItems.length}</p>
            <AlertTriangle className="text-amber-500" size={24} />
          </div>
          <p className="mt-1 text-xs text-amber-600 font-medium">Below reorder minimum</p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <p className="text-xs font-medium text-rose-700 uppercase tracking-wider">Out of Stock</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-bold text-rose-900">{outOfStockItems.length}</p>
            <Package className="text-rose-500" size={24} />
          </div>
          <p className="mt-1 text-xs text-rose-600 font-medium">Requires immediate restock</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by SKU, item name, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              filterLowStockOnly
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <AlertTriangle size={15} />
            Low Stock Only
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">SKU / Item</th>
                <th className="px-4 py-3">Type &amp; Category</th>
                <th className="px-4 py-3 text-right">Unit Cost (AED)</th>
                <th className="px-4 py-3 text-right">Selling Price (AED)</th>
                <th className="px-4 py-3 text-right">Current Stock</th>
                <th className="px-4 py-3 text-right">Min Stock</th>
                <th className="px-4 py-3 text-right">Valuation (AED)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading inventory records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No matching stock items found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isLow = (item.current_stock ?? 0) <= (item.minimum_stock ?? 0) && item.product_type === "Product";
                  const valuation = (item.current_stock || 0) * (item.cost_price || 0);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{item.sku || "No SKU"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.product_type === "Product" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-purple-50 text-purple-700 border border-purple-200"
                        }`}>
                          {item.product_type}
                        </span>
                        {item.category && (
                          <span className="block text-xs text-slate-500 mt-0.5">{item.category}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {(item.cost_price || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {(item.selling_price || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {item.product_type === "Product" ? (
                          <span className={`font-mono ${isLow ? "text-amber-700" : "text-slate-900"}`}>
                            {item.current_stock ?? 0} {item.unit || ""}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Service (N/A)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 font-mono">
                        {item.product_type === "Product" ? (item.minimum_stock ?? 0) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-900">
                        {item.product_type === "Product" ? valuation.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.product_type === "Product" && isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                            <AlertTriangle size={11} /> Low Stock
                          </span>
                        ) : item.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">
                            <CheckCircle2 size={11} /> Normal
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.product_type === "Product" && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/inventory/stock-in?productId=${item.id}`}
                              title="Stock In"
                              className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                            >
                              <ArrowDownRight size={16} />
                            </Link>
                            <Link
                              href={`/inventory/stock-out?productId=${item.id}`}
                              title="Stock Out"
                              className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                            >
                              <ArrowUpRight size={16} />
                            </Link>
                          </div>
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
    </div>
  );
}
