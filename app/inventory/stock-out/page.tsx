"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";
import { ArrowUpRight, ArrowLeft, Loader2, Save, CheckCircle2, History, AlertTriangle, ShieldAlert } from "lucide-react";

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_price: number | null;
  current_stock: number | null;
};

type StockOutRecord = {
  id: string;
  created_at: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reference_type: string | null;
  reference_number: string | null;
  notes: string | null;
  products?: { name: string; sku: string | null; unit: string | null };
};

function StockOutForm() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") || "";
  const router = useRouter();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [quantity, setQuantity] = useState("");
  const [referenceType, setReferenceType] = useState("Site Issue / Project Consumption");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [recentMovements, setRecentMovements] = useState<StockOutRecord[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, unit, cost_price, current_stock")
        .eq("active", true)
        .order("name", { ascending: true });

      setProducts(prods || []);

      // Recent Stock Out movements
      const { data: recents } = await supabase
        .from("stock_movements")
        .select("id, created_at, quantity, previous_stock, new_stock, reference_type, reference_number, notes, products(name, sku, unit)")
        .eq("company_id", companyId)
        .eq("movement_type", "OUT")
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentMovements((recents as unknown as StockOutRecord[]) || []);
    } catch (err) {
      console.error("Error loading stock out data:", err);
    } finally {
      setLoading(false);
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
      setErrorMsg("Please enter a valid dispatch quantity greater than 0.");
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

      // Negative stock validation
      if (qtyNum > prevStock && !allowNegative) {
        throw new Error(
          `Cannot dispatch ${qtyNum} units. Available stock is only ${prevStock} units. (Negative stock prevented)`
        );
      }

      const newStock = prevStock - qtyNum;
      const costVal = Number(prodData.cost_price || 0);

      // Update product current stock
      const { error: updateErr } = await supabase
        .from("products")
        .update({ current_stock: newStock })
        .eq("id", selectedProductId);

      if (updateErr) throw updateErr;

      const refNo = referenceNumber.trim() || await generateDocNumber(companyId, "GIN");

      // Log movement
      const { error: moveErr } = await supabase
        .from("stock_movements")
        .insert({
          company_id: companyId,
          product_id: selectedProductId,
          movement_type: "OUT",
          quantity: qtyNum,
          previous_stock: prevStock,
          new_stock: newStock,
          unit_cost: costVal,
          reference_type: referenceType,
          reference_number: refNo,
          notes: notes.trim() || null,
        });

      if (moveErr) throw moveErr;

      setSuccessMsg(`Successfully issued ${qtyNum} ${selectedProduct?.unit || "units"}. Remaining stock: ${newStock}.`);
      setQuantity("");
      setReferenceNumber("");
      setNotes("");

      // Reload
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record stock out.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const currentAvailable = selectedProduct?.current_stock ?? 0;
  const dispatchQty = parseFloat(quantity) || 0;
  const willBeNegative = selectedProduct && dispatchQty > currentAvailable;

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
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                <ArrowUpRight size={20} />
              </span>
              Stock Out / Dispatch Issue
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Issue inventory to project sites, record customer deliveries, and scrap damaged stock</p>
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
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-600 shrink-0" />
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
        {/* Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product / Item to Issue *
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Select an item to dispatch --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ""} — Available: {p.current_stock ?? 0} {p.unit || ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-800">Available Stock:</span>{" "}
                  <span className={`font-mono font-bold ${currentAvailable <= 0 ? "text-rose-600" : "text-slate-900"}`}>
                    {currentAvailable} {selectedProduct.unit || "units"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Unit Cost Valuation:</span> AED {(selectedProduct.cost_price || 0).toFixed(2)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Quantity to Issue *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  placeholder="e.g. 10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Issue Reason / Purpose
                </label>
                <select
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="Site Issue / Project Consumption">Site Issue / Project Consumption</option>
                  <option value="Delivery Note / Dispatch">Delivery Note / Dispatch</option>
                  <option value="Damage / Scrap / Wastage">Damage / Scrap / Wastage</option>
                  <option value="Sample / Marketing">Sample / Marketing</option>
                  <option value="Internal Transfer">Internal Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {willBeNegative && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-rose-800">
                  <AlertTriangle size={15} /> Negative Stock Warning
                </div>
                <p>
                  Requested dispatch ({dispatchQty}) exceeds currently available inventory ({currentAvailable}).
                  This will result in a negative stock balance of {currentAvailable - dispatchQty}.
                </p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowNegative}
                    onChange={(e) => setAllowNegative(e.target.checked)}
                    className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="font-medium text-rose-900">Explicitly allow negative stock dispatch</span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Reference # (DN, Project Job #, Task)
              </label>
              <input
                type="text"
                placeholder="e.g. DN-2026-0045 or PRJ-BURJ-01"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Remarks / Issued To / Site Location
              </label>
              <textarea
                rows={2}
                placeholder="Issued to Site Foreman Ahmad for Level 14 HVAC ducting..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (willBeNegative && !allowNegative)}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Recording Dispatch...
                </>
              ) : (
                <>
                  <Save size={16} /> Confirm Stock Out
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-600" /> Stock Integrity Controls
          </h3>
          <ul className="text-xs text-slate-500 space-y-2.5 list-disc pl-4 leading-relaxed">
            <li>Stock Out transactions reduce on-hand physical inventory immediately.</li>
            <li>By default, negative stock balances are strictly blocked to prevent discrepancies between physical and recorded assets.</li>
            <li>For project job allocations, reference the project ID or delivery note so material expenses can be traced back.</li>
            <li>All dispatches create immutable stock movement audit entries.</li>
          </ul>
        </div>
      </div>

      {/* Recent Stock Out Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Recent Dispatches / Issues (Last 10)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty Issued</th>
                <th className="px-4 py-3 text-right">Prev &rarr; New Stock</th>
                <th className="px-4 py-3">Reference Type</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No stock out records logged yet.
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
                    <td className="px-4 py-2.5 text-right font-semibold text-amber-600 font-mono">
                      -{m.quantity} {m.products?.unit || ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {m.previous_stock} &rarr; {m.new_stock}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {m.reference_type} {m.reference_number ? `(${m.reference_number})` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 truncate max-w-xs">
                      {m.notes || "-"}
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

export default function StockOutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading Stock Out form...</div>}>
      <StockOutForm />
    </Suspense>
  );
}
