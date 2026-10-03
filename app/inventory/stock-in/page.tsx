"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";
import { ArrowDownRight, ArrowLeft, Loader2, Save, CheckCircle2, History, Package } from "lucide-react";

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_price: number | null;
  current_stock: number | null;
};

type StockInRecord = {
  id: string;
  created_at: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_cost: number;
  reference_type: string | null;
  reference_number: string | null;
  notes: string | null;
  products?: { name: string; sku: string | null; unit: string | null };
};

function StockInForm() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") || "";

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [referenceType, setReferenceType] = useState("Supplier Delivery / GRN");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [recentMovements, setRecentMovements] = useState<StockInRecord[]>([]);

  useEffect(() => {
    loadData();
  // Initial inventory lookup only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, unit, cost_price, current_stock")
        .eq("active", true)
        .order("name", { ascending: true });

      setProducts(prods || []);

      if (initialProductId && prods) {
        const selected = prods.find((p) => p.id === initialProductId);
        if (selected && selected.cost_price) {
          setUnitCost(selected.cost_price.toString());
        }
      }

      // Recent Stock In movements
      const { data: recents } = await supabase
        .from("stock_movements")
        .select("id, created_at, quantity, previous_stock, new_stock, unit_cost, reference_type, reference_number, notes, products(name, sku, unit)")
        .eq("company_id", companyId)
        .eq("movement_type", "IN")
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentMovements((recents as unknown as StockInRecord[]) || []);
    } catch (err) {
      console.error("Error loading stock in data:", err);
    } finally {
    }
  }

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.id === productId);
    if (prod && prod.cost_price !== null && prod.cost_price !== undefined) {
      setUnitCost(prod.cost_price.toString());
    }
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const qtyNum = parseFloat(quantity);
    if (!selectedProductId) {
      setErrorMsg("Please select an inventory item.");
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setErrorMsg("Please enter a valid received quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No active company found.");

      // Fetch fresh current stock
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("current_stock, cost_price")
        .eq("id", selectedProductId)
        .single();

      if (prodErr || !prodData) throw new Error("Could not retrieve current product stock.");

      const prevStock = Number(prodData.current_stock || 0);
      const newStock = prevStock + qtyNum;
      const costVal = parseFloat(unitCost) || Number(prodData.cost_price || 0);

      const refNo = referenceNumber.trim() || await generateDocNumber(companyId, "GRN");

      // Update product current stock
      const { error: updateErr } = await supabase
        .from("products")
        .update({ current_stock: newStock })
        .eq("id", selectedProductId);

      if (updateErr) throw updateErr;



      // Log movement
      const { error: moveErr } = await supabase
        .from("stock_movements")
        .insert({
          company_id: companyId,
          product_id: selectedProductId,
          movement_type: "IN",
          quantity: qtyNum,
          previous_stock: prevStock,
          new_stock: newStock,
          unit_cost: costVal,
          reference_type: referenceType,
          reference_number: refNo,
          notes: notes.trim() || null,
        });

      if (moveErr) throw moveErr;

      setSuccessMsg(`Successfully received ${qtyNum} ${selectedProduct?.unit || "units"}. New stock: ${newStock}.`);
      setQuantity("");
      setReferenceNumber("");
      setNotes("");

      // Reload
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record stock in.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <ArrowDownRight size={20} />
              </span>
              Stock In / Goods Receipt
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Receive physical inventory, update stock levels, and log purchase movements</p>
          </div>
        </div>

        <Link
          href="/inventory/movements"
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5"
        >
          <History size={16} /> View All Movements
        </Link>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Receipt Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product / Item *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Select an item to receive --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ""} — Current: {p.current_stock ?? 0} {p.unit || ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Current Stock:</span> {selectedProduct.current_stock ?? 0} {selectedProduct.unit || "units"}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Default Cost:</span> AED {(selectedProduct.cost_price || 0).toFixed(2)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Quantity Received *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Unit Cost (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 120.00"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Receipt Reason / Type
                </label>
                <select
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="Supplier Delivery / GRN">Supplier Delivery / GRN</option>
                  <option value="Purchase Order Receipt">Purchase Order Receipt</option>
                  <option value="Opening Stock In">Opening Stock In</option>
                  <option value="Return from Project Site">Return from Project Site</option>
                  <option value="Customer Return">Customer Return</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Reference # (PO, Bill, DN)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-2026-0012 or GRN-882"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Notes / Warehouse Location / Batch
              </label>
              <textarea
                rows={2}
                placeholder="Warehouse Rack A3, Supplier Invoice #1029..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Recording Receipt...
                </>
              ) : (
                <>
                  <Save size={16} /> Confirm Stock In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <Package size={16} className="text-emerald-600" /> Stock In Guidelines
          </h3>
          <ul className="text-xs text-slate-500 space-y-2.5 list-disc pl-4 leading-relaxed">
            <li>Stock In transactions directly increment physical inventory quantities in the database.</li>
            <li>Every entry is automatically audited in the Stock Movements ledger with date, timestamp, and previous vs. new quantities.</li>
            <li>When receiving from a Purchase Order or Supplier Bill, include the reference number for tracking.</li>
            <li>Unit cost helps update average purchase valuation without altering standard selling price.</li>
          </ul>
        </div>
      </div>

      {/* Recent Stock In Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Recent Goods Received (Last 10)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty Received</th>
                <th className="px-4 py-3 text-right">Prev &rarr; New Stock</th>
                <th className="px-4 py-3 text-right">Cost (AED)</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No stock in records logged yet.
                  </td>
                </tr>
              ) : (
                recentMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-slate-500">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {m.products?.name || "Product"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 font-mono">
                      +{m.quantity} {m.products?.unit || ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {m.previous_stock} &rarr; {m.new_stock}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {(m.unit_cost || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {m.reference_type} {m.reference_number ? `(${m.reference_number})` : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function StockInPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading Stock In form...</div>}>
      <StockInForm />
    </Suspense>
  );
}
