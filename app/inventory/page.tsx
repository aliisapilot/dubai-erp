"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, fmtAED, todayISO } from "@/lib/helpers";
import {
  Package,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Search,
  CheckCircle2,
  History,
  Printer,
  Users,
  Ruler,
  Layers,
  Filter,
  Download,
} from "lucide-react";
import {
  getMaterialsList,
  roundDecimal,
  WAREHOUSE_LOCATIONS,
  type MaterialItem,
} from "@/lib/materialInventory";
import PrintModal from "@/components/documents/PrintModal";
import StockBalanceReportTemplate, {
  StockBalanceReportData,
} from "@/components/documents/StockBalanceReportTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

export default function InventoryStockPage() {
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Print State
  const [showPrintModal, setShowPrintModal] = useState(false);

  async function loadInventoryData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [coRes, mats] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        getMaterialsList(companyId),
      ]);

      if (coRes.data) setCompany(coRes.data);
      setMaterials(mats);
    } catch (err) {
      console.error("Error loading inventory stock:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInventoryData();
  }, []);

  // Brands and categories for filters
  const brands = useMemo(() => {
    return Array.from(new Set(materials.map((m) => m.brand).filter(Boolean)));
  }, [materials]);

  const categories = useMemo(() => {
    return Array.from(new Set(materials.map((m) => m.category).filter(Boolean)));
  }, [materials]);

  // Filtered materials
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch =
        (m.name?.toLowerCase() || "").includes(q) ||
        (m.sku?.toLowerCase() || "").includes(q) ||
        (m.brand?.toLowerCase() || "").includes(q) ||
        (m.specification?.toLowerCase() || "").includes(q) ||
        (m.category?.toLowerCase() || "").includes(q);

      const matchBrand = selectedBrand === "all" || m.brand === selectedBrand;
      const matchCat = selectedCategory === "all" || m.category === selectedCategory;
      const matchLow = !filterLowStockOnly || (m.current_stock <= m.minimum_stock && m.active);

      return matchSearch && matchBrand && matchCat && matchLow;
    });
  }, [materials, search, selectedBrand, selectedCategory, filterLowStockOnly]);

  // Valuation and KPI calculations
  const totalValuation = materials.reduce(
    (acc, m) => acc + (m.current_stock || 0) * (m.cost_price || 0),
    0
  );

  const totalFabricSqm = materials
    .filter((m) => m.is_fabric)
    .reduce((acc, m) => acc + (m.current_stock || 0), 0);

  const lowStockItems = materials.filter(
    (m) => m.current_stock <= m.minimum_stock && m.active
  );

  const outOfStockItems = materials.filter((m) => m.current_stock <= 0 && m.active);

  // Print Report Data
  const printReportData: StockBalanceReportData = {
    report_date: todayISO(),
    brand_filter: selectedBrand !== "all" ? selectedBrand : undefined,
    category_filter: selectedCategory !== "all" ? selectedCategory : undefined,
    warehouse_filter: selectedWarehouse !== "all" ? selectedWarehouse : undefined,
    items: filtered.map((m) => ({
      material_name: m.name,
      brand: m.brand,
      specification: m.specification,
      width: m.fabric_width,
      unit: m.unit,
      current_stock_sqm: m.is_fabric ? m.current_stock : m.square_metres_available,
      current_stock_rm: m.running_metres_available,
      cost_price: m.cost_price,
      total_valuation: roundDecimal(m.current_stock * m.cost_price, 2),
      minimum_stock: m.minimum_stock,
      is_low_stock: m.current_stock <= m.minimum_stock,
    })),
    total_valuation: totalValuation,
    total_fabric_sqm: totalFabricSqm,
    low_stock_count: lowStockItems.length,
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Fabric &amp; Material Stock Inventory</h1>
            <span className="rounded-md bg-emerald-500/10 text-emerald-400 px-2 py-0.5 text-xs font-semibold border border-emerald-500/20">
              UAE Industrial Standard
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time stock tracking in Square Metres (m²) &amp; Running Metres (m), warehouse valuation, cutting wastage, and consumption audits
          </p>
        </div>

        {/* Quick Actions Navigation Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/inventory/stock-in"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowDownRight size={15} /> Stock In
          </Link>
          <Link
            href="/inventory/stock-out"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowUpRight size={15} /> Material Used (Stock Out)
          </Link>
          <Link
            href="/inventory/customer-usage"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <Users size={15} /> Customer Usage
          </Link>
          <Link
            href="/inventory/adjustments"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <RefreshCw size={14} /> Adjustments
          </Link>
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <History size={15} /> Ledger
          </Link>
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <Printer size={15} /> Print Stock Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Warehouse Inventory Valuation
          </p>
          <p className="mt-2 text-2xl font-bold text-white font-mono">
            AED {fmtAED(totalValuation)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Calculated at purchase cost rate</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            Total Fabric Stock (Square Metres)
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-black text-emerald-300 font-mono">
              {totalFabricSqm.toLocaleString("en-AE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m²
            </p>
            <Layers size={22} className="text-emerald-400" />
          </div>
          <p className="mt-1 text-xs text-emerald-400/80">Available across Korean, German &amp; PVC rolls</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            Low Stock Alerts
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-bold text-amber-300 font-mono">{lowStockItems.length}</p>
            <AlertTriangle className="text-amber-400" size={22} />
          </div>
          <p className="mt-1 text-xs text-amber-400/80">At or below reorder threshold</p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
            Out of Stock Items
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-bold text-rose-300 font-mono">{outOfStockItems.length}</p>
            <Package className="text-rose-400" size={22} />
          </div>
          <p className="mt-1 text-xs text-rose-400/80">Zero balance in warehouse</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
            <input
              type="text"
              placeholder="Search by name, brand, SKU, width..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Brands (Korean, German, etc.)</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  Brand: {b}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Low Stock Toggle */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterLowStockOnly}
                onChange={(e) => setFilterLowStockOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
              />
              <span>Low Stock Alerts Only</span>
            </label>
            <span className="text-xs text-slate-500 ml-auto">{filtered.length} items</span>
          </div>
        </div>
      </div>

      {/* Materials Stock Balance Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <th className="p-3">Material &amp; SKU</th>
                <th className="p-3">Brand &amp; Category</th>
                <th className="p-3">Specification / Colour</th>
                <th className="p-3 text-center">Width</th>
                <th className="p-3 text-right bg-emerald-950/40 text-emerald-300 font-bold">
                  Stock Balance (m²)
                </th>
                <th className="p-3 text-right text-slate-300">Equivalent RM</th>
                <th className="p-3 text-right">Cost Rate</th>
                <th className="p-3 text-right">Total Valuation</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Loading fabric and material balances...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No materials found matching your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const isLow = m.current_stock <= m.minimum_stock && m.active;
                  const isOut = m.current_stock <= 0 && m.active;
                  const val = roundDecimal(m.current_stock * m.cost_price, 2);

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isOut ? "bg-rose-950/10" : isLow ? "bg-amber-950/10" : ""
                      }`}
                    >
                      <td className="p-3 font-semibold text-white">
                        <span className="block">{m.name}</span>
                        {m.sku && <span className="text-[10px] font-mono text-slate-500">[{m.sku}]</span>}
                      </td>

                      <td className="p-3">
                        <span className="font-medium text-slate-200 block">{m.brand}</span>
                        <span className="text-[10px] text-slate-400">{m.category}</span>
                      </td>

                      <td className="p-3">
                        <span className="text-slate-300 block">{m.specification || "Standard"}</span>
                        {m.colour && <span className="text-[10px] text-slate-400">Colour: {m.colour}</span>}
                      </td>

                      <td className="p-3 text-center font-mono text-sky-400 font-semibold whitespace-nowrap">
                        {m.fabric_width > 0 ? `${m.fabric_width} m` : "—"}
                      </td>

                      {/* Prominent Square Metres */}
                      <td className="p-3 text-right font-mono font-bold text-sm text-emerald-400 bg-emerald-950/20">
                        {m.current_stock.toFixed(2)} {m.unit}
                      </td>

                      {/* Equivalent Running Metres */}
                      <td className="p-3 text-right font-mono text-slate-300">
                        {m.is_fabric && m.fabric_width > 0 ? `${m.running_metres_available.toFixed(2)} m` : "—"}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-300">
                        AED {fmtAED(m.cost_price)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-white">
                        AED {fmtAED(val)}
                      </td>

                      <td className="p-3 text-center">
                        {isOut ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            In Stock
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/inventory/stock-in?productId=${m.id}`}
                            className="p-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                            title="Stock In this material"
                          >
                            <ArrowDownRight size={14} />
                          </Link>
                          <Link
                            href={`/inventory/stock-out?productId=${m.id}`}
                            className="p-1 rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white transition-colors"
                            title="Issue / Dispatch material"
                          >
                            <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-950 font-bold text-white text-xs border-t border-slate-700">
                  <td colSpan={4} className="p-3 text-right uppercase">
                    Warehouse Total Area:
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-400 text-sm bg-emerald-950/40">
                    {totalFabricSqm.toFixed(2)} m²
                  </td>
                  <td colSpan={2} className="p-3 text-right text-xs uppercase">
                    Total Valuation:
                  </td>
                  <td className="p-3 text-right font-mono text-white text-sm">
                    AED {fmtAED(totalValuation)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Print Stock Balance Report Modal */}
      {showPrintModal && (
        <PrintModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)}>
          <StockBalanceReportTemplate
            company={company}
            data={printReportData}
            onClose={() => setShowPrintModal(false)}
          />
        </PrintModal>
      )}
    </div>
  );
}
