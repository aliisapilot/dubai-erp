"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";
import {
  RefreshCw, Plus, Search, ArrowLeft, Loader2, CheckCircle2,
  AlertTriangle, X, Trash2, Eye, Calendar, FileText
} from "lucide-react";

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_price: number | null;
  current_stock: number | null;
};

type AdjustmentItemRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string | null;
  recorded_stock: number;
  counted_stock: number;
  difference: number;
  unit_cost: number;
  notes: string;
};

type StockAdjustment = {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason: string;
  status: "Draft" | "Completed" | "Cancelled";
  notes: string | null;
  created_at: string;
  stock_adjustment_items?: {
    id: string;
    product_id: string;
    recorded_stock: number;
    counted_stock: number;
    difference: number;
    unit_cost: number;
    notes: string | null;
    products?: { name: string; sku: string | null; unit: string | null };
  }[];
};

export default function StockAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal create state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adjustmentNumber, setAdjustmentNumber] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("Physical Stock Count Variance");
  const [notes, setNotes] = useState("");
  const [itemRows, setItemRows] = useState<AdjustmentItemRow[]>([]);
  const [selectedAddProdId, setSelectedAddProdId] = useState("");

  // View modal
  const [viewingAdj, setViewingAdj] = useState<StockAdjustment | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [adjRes, prodRes] = await Promise.all([
        supabase
          .from("stock_adjustments")
          .select("*, stock_adjustment_items(*, products(name, sku, unit))")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("products")
          .select("id, name, sku, unit, cost_price, current_stock")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("name", { ascending: true })
      ]);

      setAdjustments(adjRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      console.error("Error loading adjustments:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setAdjustmentNumber("");
    setAdjustmentDate(new Date().toISOString().split("T")[0]);
    setReason("Physical Stock Count Variance");
    setNotes("");
    setItemRows([]);
    setSelectedAddProdId("");
    setErrorMsg("");
    setShowCreateModal(true);
  }

  function handleAddItem() {
    if (!selectedAddProdId) return;
    const prod = products.find(p => p.id === selectedAddProdId);
    if (!prod) return;

    if (itemRows.some(r => r.product_id === prod.id)) {
      setErrorMsg("This product is already added in this adjustment.");
      return;
    }

    const rec = prod.current_stock ?? 0;
    setItemRows([
      ...itemRows,
      {
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        recorded_stock: rec,
        counted_stock: rec,
        difference: 0,
        unit_cost: prod.cost_price || 0,
        notes: "",
      },
    ]);
    setSelectedAddProdId("");
    setErrorMsg("");
  }

  function handleCountChange(idx: number, countedVal: string) {
    const counted = parseFloat(countedVal) || 0;
    setItemRows(prev => {
      const copy = [...prev];
      const rec = copy[idx].recorded_stock;
      copy[idx].counted_stock = counted;
      copy[idx].difference = counted - rec;
      return copy;
    });
  }

  function handleRemoveItem(idx: number) {
    setItemRows(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveAdjustment(e: FormEvent) {
    e.preventDefault();
    if (itemRows.length === 0) {
      setErrorMsg("Please add at least one item to adjust.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const docNum = await generateDocNumber(companyId, "ADJ");

      // 1. Insert header
      const { data: header, error: headErr } = await supabase
        .from("stock_adjustments")
        .insert({
          company_id: companyId,
          adjustment_number: docNum,
          adjustment_date: adjustmentDate,
          reason,
          status: "Completed",
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (headErr) throw headErr;

      // 2. Insert items
      const itemsToInsert = itemRows.map(r => ({
        adjustment_id: header.id,
        product_id: r.product_id,
        recorded_stock: r.recorded_stock,
        counted_stock: r.counted_stock,
        difference: r.difference,
        unit_cost: r.unit_cost,
        notes: r.notes.trim() || null,
      }));

      const { error: itemErr } = await supabase
        .from("stock_adjustment_items")
        .insert(itemsToInsert);

      if (itemErr) throw itemErr;

      // 3. Update products and log movements
      for (const row of itemRows) {
        if (row.difference !== 0) {
          // Update product stock
          await supabase
            .from("products")
            .update({ current_stock: row.counted_stock })
            .eq("id", row.product_id);

          // Log movement
          await supabase
            .from("stock_movements")
            .insert({
              company_id: companyId,
              product_id: row.product_id,
              movement_type: "ADJUSTMENT",
              quantity: Math.abs(row.difference),
              previous_stock: row.recorded_stock,
              new_stock: row.counted_stock,
              unit_cost: row.unit_cost,
              reference_type: "Stock Adjustment",
              reference_id: header.id,
              reference_number: docNum,
              notes: `Adjustment: ${reason}. Variance: ${row.difference > 0 ? "+" : ""}${row.difference}`,
            });
        }
      }

      setSuccessMsg(`Stock Adjustment ${docNum} completed successfully.`);
      setShowCreateModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record adjustment.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = adjustments.filter(a =>
    a.adjustment_number.toLowerCase().includes(search.toLowerCase()) ||
    a.reason.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top bar */}
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
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                <RefreshCw size={20} />
              </span>
              Stock Adjustments &amp; Reconciliation
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Reconcile physical inventory counts with book records and record variances</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> New Stock Adjustment
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {successMsg}
          </div>
          <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search by adjustment # or reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Adjustment #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-center">Items Adjusted</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading stock adjustments...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No stock adjustments found. Click &quot;New Stock Adjustment&quot; to reconcile inventory.
                  </td>
                </tr>
              ) : (
                filtered.map((adj) => (
                  <tr key={adj.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                      {adj.adjustment_number}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                      {adj.adjustment_date}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {adj.reason}
                      {adj.notes && <span className="block text-xs text-slate-400 truncate max-w-xs">{adj.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-semibold text-slate-700">
                        {adj.stock_adjustment_items?.length || 0} items
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} /> {adj.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setViewingAdj(adj)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Eye size={14} /> Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">New Physical Stock Adjustment</h3>
                <p className="text-xs text-slate-500">Record physical count differences and sync stock levels</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment # (Auto-generated on save)</label>
                  <input
                    type="text"
                    disabled
                    value="Auto-generated on save"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Date</label>
                  <input
                    type="date"
                    required
                    value={adjustmentDate}
                    onChange={(e) => setAdjustmentDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Physical Stock Count Variance">Physical Stock Count Variance</option>
                    <option value="Damaged / Broken in Warehouse">Damaged / Broken in Warehouse</option>
                    <option value="Expired Stock Scrap">Expired Stock Scrap</option>
                    <option value="Audit Reconciliation">Audit Reconciliation</option>
                    <option value="Opening Stock Correction">Opening Stock Correction</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Add item bar */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Add Inventory Item to Adjust</label>
                <div className="flex gap-2">
                  <select
                    value={selectedAddProdId}
                    onChange={(e) => setSelectedAddProdId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose item to add to count --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ""} — Book Stock: {p.current_stock ?? 0} {p.unit || ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedAddProdId}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Add Item
                  </button>
                </div>
              </div>

              {/* Line items table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-right">Book Stock</th>
                      <th className="px-3 py-2.5 text-right w-28">Physical Count</th>
                      <th className="px-3 py-2.5 text-right">Variance</th>
                      <th className="px-3 py-2.5 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {itemRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                          No items added yet. Select an item above and click &quot;Add Item&quot;.
                        </td>
                      </tr>
                    ) : (
                      itemRows.map((row, idx) => (
                        <tr key={row.product_id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{row.product_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.sku || "No SKU"}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-slate-700">
                            {row.recorded_stock} {row.unit || ""}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              required
                              value={row.counted_stock}
                              onChange={(e) => handleCountChange(idx, e.target.value)}
                              className="w-24 text-right rounded border border-slate-300 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            <span className={row.difference > 0 ? "text-emerald-600" : row.difference < 0 ? "text-rose-600" : "text-slate-400"}>
                              {row.difference > 0 ? `+${row.difference}` : row.difference} {row.unit || ""}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Audit Remarks</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Count verified by Warehouse Supervisor & Internal Auditor..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || itemRows.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Complete &amp; Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {viewingAdj && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-mono">{viewingAdj.adjustment_number}</h3>
                <p className="text-xs text-slate-500">Date: {viewingAdj.adjustment_date} &bull; Reason: {viewingAdj.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingAdj(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {viewingAdj.notes && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Remarks:</span> {viewingAdj.notes}
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5 text-right">Recorded</th>
                    <th className="px-3 py-2.5 text-right">Physical Count</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {viewingAdj.stock_adjustment_items?.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {item.products?.name || "Product"}
                        {item.products?.sku && <span className="block text-[10px] text-slate-400 font-mono">{item.products.sku}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {item.recorded_stock} {item.products?.unit || ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-900 font-semibold">
                        {item.counted_stock} {item.products?.unit || ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">
                        <span className={item.difference > 0 ? "text-emerald-600" : item.difference < 0 ? "text-rose-600" : "text-slate-400"}>
                          {item.difference > 0 ? `+${item.difference}` : item.difference} {item.products?.unit || ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingAdj(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
