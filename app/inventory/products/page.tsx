"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, fmtAED } from "@/lib/helpers";
import {
  getMaterialsList,
  saveMaterialMaster,
  MATERIAL_CATEGORIES,
  SUPPORTED_UNITS,
  type MaterialItem,
} from "@/lib/materialInventory";
import {
  Package,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Power,
  ArrowLeft,
  Loader2,
  Layers,
} from "lucide-react";

type Draft = {
  id?: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  unit: string;
  cost_price: string;
  selling_price: string;
  vat_rate: string;
  minimum_stock: string;
  opening_stock: string;
  supplier_name: string;
  notes: string;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  sku: "",
  category: "PVC Fabric",
  description: "",
  unit: "PCS",
  cost_price: "0",
  selling_price: "0",
  vat_rate: "5",
  minimum_stock: "0",
  opening_stock: "0",
  supplier_name: "",
  notes: "",
  active: true,
};

export default function MaterialProductsPage() {
  const [companyId, setCompanyId] = useState("");
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (id: string) => {
    try {
      const data = await getMaterialsList(id);
      setMaterials(data);
    } catch {
      setError("Unable to load materials.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCompanyId().then(async (id) => {
      if (!active) return;
      if (!id) {
        setError("Please select a company before managing materials.");
        setLoading(false);
        return;
      }
      setCompanyId(id);
      await refresh(id);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  function edit(item: MaterialItem) {
    setDraft({
      id: item.id,
      name: item.name,
      sku: item.sku || "",
      category: item.category,
      description: item.description || "",
      unit: item.unit,
      cost_price: String(item.cost_price),
      selling_price: String(item.selling_price),
      vat_rate: String(item.vat_rate),
      minimum_stock: String(item.minimum_stock),
      opening_stock: String(item.current_stock),
      supplier_name: item.supplier_name || "",
      notes: item.notes || "",
      active: item.active !== false,
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleActive(item: MaterialItem) {
    if (!companyId) return;
    setTogglingId(item.id);
    setError("");
    setNotice("");
    try {
      const nextActive = !item.active;
      const { error: updateErr } = await supabase
        .from("products")
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("company_id", companyId);

      if (updateErr) throw updateErr;

      setNotice(`"${item.name}" has been ${nextActive ? "activated" : "deactivated"}.`);
      await refresh(companyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change material status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!companyId || saving) return;
    setError("");
    setNotice("");

    if (!draft.name.trim()) {
      setError("Material name is required.");
      return;
    }

    const sku = draft.sku.trim();
    if (sku && materials.some((m) => m.id !== draft.id && m.sku?.trim().toLowerCase() === sku.toLowerCase())) {
      setError("This SKU already exists for this company.");
      return;
    }

    const costNum = Number(draft.cost_price);
    const sellingNum = Number(draft.selling_price);
    const vatNum = Number(draft.vat_rate);
    const minStockNum = Number(draft.minimum_stock);
    const openingStockNum = Number(draft.opening_stock);

    const numbers = [costNum, sellingNum, vatNum, minStockNum, openingStockNum];
    if (numbers.some((n) => !Number.isFinite(n) || n < 0) || vatNum > 100) {
      setError("Enter valid non-negative numbers for prices and stock, and a VAT rate between 0 and 100.");
      return;
    }

    setSaving(true);
    try {
      await saveMaterialMaster(
        companyId,
        {
          id: draft.id,
          name: draft.name.trim(),
          sku: sku || null,
          category: draft.category,
          description: draft.description.trim() || null,
          unit: draft.unit,
          cost_price: costNum,
          selling_price: sellingNum,
          vat_rate: vatNum,
          minimum_stock: minStockNum,
          supplier_name: draft.supplier_name.trim() || null,
          notes: draft.notes.trim() || null,
          active: draft.active,
        },
        draft.id ? 0 : openingStockNum
      );

      await refresh(companyId);
      const isNew = !draft.id;
      setDraft(emptyDraft);
      setNotice(
        isNew && openingStockNum > 0
          ? `Material "${draft.name.trim()}" created with opening stock of ${openingStockNum} ${draft.unit} (logged in inventory ledger).`
          : `Material "${draft.name.trim()}" saved successfully.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save material.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none";

  const visibleMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (statusFilter === "active" && !m.active) return false;
      if (statusFilter === "inactive" && m.active) return false;
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [m.name, m.sku, m.category, m.supplier_name, m.description]
        .some((val) => (val || "").toLowerCase().includes(q));
    });
  }, [materials, statusFilter, categoryFilter, search]);

  const activeCount = useMemo(() => materials.filter((m) => m.active).length, [materials]);
  const inactiveCount = useMemo(() => materials.filter((m) => !m.active).length, [materials]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/inventory"
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Back to Inventory"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="rounded-xl bg-blue-600/10 border border-blue-500/20 p-2.5 text-blue-400">
              <Package size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Products & Materials Catalog</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage raw materials, fabrics, and finished goods. Integrated with document editors &amp; stock movements.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/inventory/stock-in"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
            >
              Stock In
            </Link>
            <Link
              href="/inventory"
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition shadow-sm"
            >
              Inventory Dashboard
            </Link>
          </div>
        </div>

        {/* Create / Edit Form */}
        <form onSubmit={save} className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <h2 className="text-sm font-semibold text-white">
                {draft.id ? "Edit Product / Material" : "Add New Product or Material"}
              </h2>
            </div>
            {draft.id && (
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft);
                  setError("");
                  setNotice("");
                }}
                className="text-xs text-slate-400 hover:text-white transition"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Product / Material Name <span className="text-rose-400">*</span>
              </label>
              <input
                required
                className={inputClass}
                placeholder="e.g. PVC Fabric 650 GSM Blue"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                SKU / Item Code
              </label>
              <input
                className={inputClass}
                placeholder="e.g. PVC-650-BLU"
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Category
              </label>
              <select
                className={inputClass}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Unit of Measure
              </label>
              <select
                className={inputClass}
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              >
                {SUPPORTED_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Purchase Price (AED)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={draft.cost_price}
                onChange={(e) => setDraft({ ...draft, cost_price: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Selling Price (AED)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={draft.selling_price}
                onChange={(e) => setDraft({ ...draft, selling_price: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                VAT Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className={inputClass}
                value={draft.vat_rate}
                onChange={(e) => setDraft({ ...draft, vat_rate: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Minimum Stock Alert
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={draft.minimum_stock}
                onChange={(e) => setDraft({ ...draft, minimum_stock: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                {draft.id ? "Current Stock (Ledger Managed)" : "Opening Stock Quantity"}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={Boolean(draft.id)}
                className={`${inputClass} ${
                  draft.id ? "bg-slate-950/70 border-slate-800 text-slate-400 cursor-not-allowed" : ""
                }`}
                value={draft.opening_stock}
                onChange={(e) => setDraft({ ...draft, opening_stock: e.target.value })}
              />
              {draft.id ? (
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Stock is updated via Stock In / Adjustments
                </span>
              ) : (
                <span className="text-[10px] text-blue-400 block mt-0.5">
                  Creates an audited opening stock movement
                </span>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Default Supplier (Optional)
              </label>
              <input
                className={inputClass}
                placeholder="e.g. Al Safwah Trading"
                value={draft.supplier_name}
                onChange={(e) => setDraft({ ...draft, supplier_name: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Description / Specifications
              </label>
              <input
                className={inputClass}
                placeholder="Technical specifications, fabric width, roll length, etc."
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Internal Notes
              </label>
              <input
                className={inputClass}
                placeholder="Storage rack location, handling notes, etc."
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
              <AlertTriangle size={15} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{notice}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !companyId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </>
              ) : draft.id ? (
                "Save Changes"
              ) : (
                <>
                  <Plus size={14} /> Add Material
                </>
              )}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft);
                  setError("");
                  setNotice("");
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Catalog List Section */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">
                Saved Materials ({materials.length})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter Tabs */}
              <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    statusFilter === "active"
                      ? "bg-slate-800 text-white font-semibold shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("inactive")}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    statusFilter === "inactive"
                      ? "bg-slate-800 text-white font-semibold shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Deactivated ({inactiveCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    statusFilter === "all"
                      ? "bg-slate-800 text-white font-semibold shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  All ({materials.length})
                </button>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Search Bar */}
              <div className="relative min-w-[200px]">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  aria-label="Search materials"
                  placeholder="Search name, SKU, category..."
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-xs gap-2">
              <Loader2 size={18} className="animate-spin text-blue-500" />
              <span>Loading materials catalog...</span>
            </div>
          ) : visibleMaterials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center text-xs text-slate-400">
              <Package size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="font-semibold text-slate-300">No Materials Found</p>
              <p className="text-slate-500 mt-1">
                {search.trim()
                  ? `No items match "${search}". Try adjusting your search or filters.`
                  : "No materials recorded in this view. Use the form above to add your first product or material."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMaterials.map((m) => (
                <article
                  key={m.id}
                  className={`rounded-xl border p-4 space-y-3 transition ${
                    m.active
                      ? "border-slate-800 bg-slate-900/80 hover:border-slate-700"
                      : "border-slate-800/60 bg-slate-950/60 opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-white font-semibold">{m.name}</strong>
                        {!m.active && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {m.sku ? (
                          <span className="font-mono text-blue-400">{m.sku}</span>
                        ) : (
                          <span className="italic text-slate-500">No SKU</span>
                        )}{" "}
                        · {m.category} · <span className="font-semibold">{m.unit}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => edit(m)}
                        className="rounded p-1 text-slate-400 hover:text-blue-400 transition"
                        title="Edit material"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(m)}
                        disabled={togglingId === m.id}
                        className={`rounded p-1 transition ${
                          m.active
                            ? "text-slate-400 hover:text-amber-400"
                            : "text-slate-500 hover:text-emerald-400"
                        }`}
                        title={m.active ? "Deactivate material" : "Reactivate material"}
                      >
                        {togglingId === m.id ? (
                          <Loader2 size={14} className="animate-spin text-slate-400" />
                        ) : (
                          <Power size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800/80 pt-2.5">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Selling Price</span>
                      <span className="font-semibold text-slate-200">
                        {fmtAED(m.selling_price)}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">
                          (+{m.vat_rate}% VAT)
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Purchase Cost</span>
                      <span className="text-slate-300">{fmtAED(m.cost_price)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-2 text-slate-400">
                    <span>
                      Stock:{" "}
                      <strong className={m.current_stock <= m.minimum_stock ? "text-amber-400" : "text-emerald-400"}>
                        {m.current_stock} {m.unit}
                      </strong>
                    </span>
                    {m.supplier_name && (
                      <span className="text-[11px] text-slate-500 truncate max-w-[140px]" title={m.supplier_name}>
                        {m.supplier_name}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
