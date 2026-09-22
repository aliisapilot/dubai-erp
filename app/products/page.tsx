"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  Package,
  X,
  Save,
  Loader2,
  Pencil,
  Power,
  AlertTriangle,
  ChevronDown,
  Filter,
  Trash2,
} from "lucide-react";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";

type Product = {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  product_type: "Product" | "Service";
  category: string | null;
  unit: string | null;
  cost_price: number | null;
  selling_price: number | null;
  vat_rate: number | null;
  vat_category: string | null;
  opening_stock: number | null;
  current_stock: number | null;
  minimum_stock: number | null;
  active: boolean;
  notes: string | null;
};

type ProductForm = {
  sku: string;
  name: string;
  description: string;
  product_type: "Product" | "Service";
  category: string;
  unit: string;
  cost_price: string;
  selling_price: string;
  vat_rate: string;
  vat_category: string;
  opening_stock: string;
  current_stock: string;
  minimum_stock: string;
  notes: string;
};

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  description: "",
  product_type: "Product",
  category: "",
  unit: "",
  cost_price: "",
  selling_price: "",
  vat_rate: "5",
  vat_category: "Standard Rated",
  opening_stock: "0",
  current_stock: "0",
  minimum_stock: "0",
  notes: "",
};

const UAE_VAT_CATEGORIES = [
  "Standard Rated",
  "Zero Rated",
  "Exempt",
  "Out of Scope",
];

const COMMON_UNITS = [
  "Pcs","Nos","Kg","Gm","Litre","Ml","Meter","Sqm","Box","Carton","Set","Pair","Hour","Day","Month",
];

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none resize-none";
const selectClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none";

function StatCard({ label, value, color = "slate", icon }: { label: string; value: number; color?: "slate"|"emerald"|"amber"; icon?: React.ReactNode }) {
  const colors = { slate: "text-slate-700", emerald: "text-emerald-600", amber: "text-amber-600" };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-2xl font-bold ${colors[color]}`}>{icon}{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All"|"Product"|"Service">("All");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) { console.error("Load products error:", error); setError(error.message); setProducts([]); }
    else { setProducts((data || []) as Product[]); }
    setLoading(false);
  }

  function updateField(field: keyof ProductForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openAddForm() {
    setError(""); setSuccess(""); setEditingProduct(null); setForm(emptyForm); setShowForm(true);
  }

  function openEditForm(product: Product) {
    setError(""); setSuccess(""); setEditingProduct(product);
    setForm({
      sku: product.sku || "",
      name: product.name || "",
      description: product.description || "",
      product_type: product.product_type || "Product",
      category: product.category || "",
      unit: product.unit || "",
      cost_price: product.cost_price != null ? String(product.cost_price) : "",
      selling_price: product.selling_price != null ? String(product.selling_price) : "",
      vat_rate: product.vat_rate != null ? String(product.vat_rate) : "5",
      vat_category: product.vat_category || "Standard Rated",
      opening_stock: product.opening_stock != null ? String(product.opening_stock) : "0",
      current_stock: product.current_stock != null ? String(product.current_stock) : "0",
      minimum_stock: product.minimum_stock != null ? String(product.minimum_stock) : "0",
      notes: product.notes || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false); setEditingProduct(null); setForm(emptyForm); setError("");
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!form.name.trim()) { setError("Product name is required."); return; }
    setSaving(true);
    try {
      // DB columns: sku, name, description, category, unit, cost_price, selling_price, vat_rate, current_stock, minimum_stock
      // NO: product_type, vat_category, opening_stock, notes
      const payload = {
        sku: form.sku.trim() || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        unit: form.unit.trim() || null,
        cost_price: form.cost_price !== "" ? Number(form.cost_price) : null,
        selling_price: form.selling_price !== "" ? Number(form.selling_price) : null,
        vat_rate: form.vat_rate !== "" ? Number(form.vat_rate) : null,
        current_stock: form.current_stock !== "" ? Number(form.current_stock) : null,
        minimum_stock: form.minimum_stock !== "" ? Number(form.minimum_stock) : null,
        updated_at: new Date().toISOString(),
      };
      if (editingProduct) {
        const { error: updateError } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (updateError) throw new Error(updateError.message);
        setSuccess("Product updated successfully.");
      } else {
        const companyId = await getCompanyId();
        const autoSku = form.sku.trim() || (await generateDocNumber(companyId, "PRD"));
        const { error: insertError } = await supabase.from("products").insert({ ...payload, sku: autoSku, company_id: companyId, active: true });
        if (insertError) throw new Error(insertError.message);
        setSuccess("Product added successfully.");
      }
      closeForm();
      await loadProducts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setError(""); setSuccess("");
    const { error: updateError } = await supabase.from("products").update({ active: !product.active, updated_at: new Date().toISOString() }).eq("id", product.id);
    if (updateError) { setError(updateError.message); return; }
    setSuccess(product.active ? "Product deactivated successfully." : "Product reactivated successfully.");
    await loadProducts();
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Are you sure you want to delete product "${product.name}"? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      const { error: delErr } = await supabase.from("products").delete().eq("id", product.id);
      if (delErr) {
        if (delErr.code === "23503" || delErr.message.includes("foreign key")) {
          throw new Error(`Product "${product.name}" cannot be deleted because it is referenced in invoices, quotations, or purchase orders. You can deactivate it instead.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Product "${product.name}" deleted successfully.`);
      await loadProducts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete product.");
    }
  }

  const filtered = products.filter((p) => {
    if (typeFilter !== "All" && p.product_type !== typeFilter) return false;
    const txt = [p.sku, p.name, p.category, p.unit, p.description].filter(Boolean).join(" ").toLowerCase();
    return txt.includes(search.toLowerCase());
  });

  const totalActive = products.filter((p) => p.active).length;
  const lowStock = products.filter((p) => p.active && p.product_type === "Product" && p.minimum_stock != null && (p.current_stock ?? 0) <= p.minimum_stock).length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Package size={22} /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Products &amp; Inventory</h1>
              <p className="text-sm text-slate-500">Manage your products, services, and stock levels</p>
            </div>
          </div>
          <button onClick={openAddForm} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
            <Plus size={18} />Add Product
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-4"><X size={16} /></button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Products" value={products.length} />
          <StatCard label="Active" value={totalActive} color="emerald" />
          <StatCard label="Inactive" value={products.length - totalActive} color="slate" />
          <StatCard label="Low Stock" value={lowStock} color={lowStock > 0 ? "amber" : "slate"} icon={lowStock > 0 ? <AlertTriangle size={14} /> : undefined} />
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="product-search" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU, category…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" />
          </div>
          <div className="relative">
            <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select id="product-type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "All"|"Product"|"Service")} className="appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-8 pr-8 text-sm focus:border-slate-400 focus:outline-none">
              <option value="All">All Types</option>
              <option value="Product">Product</option>
              <option value="Service">Service</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 size={28} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
            <Package size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">{search || typeFilter !== "All" ? "No products match your search." : "No products yet. Click \"Add Product\" to get started."}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Cost (AED)</th>
                    <th className="px-4 py-3 text-right">Price (AED)</th>
                    <th className="px-4 py-3 text-center">VAT %</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((product) => {
                    const isLow = product.product_type === "Product" && product.minimum_stock != null && (product.current_stock ?? 0) <= product.minimum_stock;
                    return (
                      <tr key={product.id} className={`hover:bg-slate-50 transition-colors ${!product.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.sku || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{product.name}</div>
                          {product.description && <div className="truncate max-w-[180px] text-xs text-slate-400">{product.description}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${product.product_type === "Service" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{product.product_type}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.category || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{product.cost_price != null ? product.cost_price.toFixed(2) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{product.selling_price != null ? product.selling_price.toFixed(2) : "—"}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{product.vat_rate != null ? `${product.vat_rate}%` : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {product.product_type === "Product" ? (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLow ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                              {isLow && <AlertTriangle size={10} />}
                              {product.current_stock ?? 0}{product.unit ? ` ${product.unit}` : ""}
                            </span>
                          ) : <span className="text-slate-400 text-xs">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {product.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditForm(product)} title="Edit product" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => toggleActive(product)} title={product.active ? "Deactivate product" : "Reactivate product"} className={`rounded-lg p-1.5 transition-colors ${product.active ? "text-slate-400 hover:bg-red-50 hover:text-red-500" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"}`}><Power size={14} /></button>
                            <button onClick={() => deleteProduct(product)} title="Delete product" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
              Showing {filtered.length} of {products.length} product{products.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-900 p-2 text-white"><Package size={18} /></div>
                <h2 className="text-lg font-bold text-slate-900">{editingProduct ? "Edit Product" : "Add New Product"}</h2>
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <form id="product-form" onSubmit={saveProduct} className="space-y-6 p-6">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

                <Section title="Basic Information">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="SKU / Product Code">
                      <input id="product-sku" type="text" value={form.sku} onChange={(e) => updateField("sku", e.target.value)} placeholder="e.g. PRD-001" className={inputClass} />
                    </Field>
                    <Field label="Product Type" required>
                      <select id="product-type" value={form.product_type} onChange={(e) => updateField("product_type", e.target.value as "Product"|"Service")} className={selectClass}>
                        <option value="Product">Product</option>
                        <option value="Service">Service</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Product Name" required>
                    <input id="product-name" type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Enter product name" required className={inputClass} />
                  </Field>
                  <Field label="Description">
                    <textarea id="product-description" value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Optional product description" rows={2} className={inputClass} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Category">
                      <input id="product-category" type="text" value={form.category} onChange={(e) => updateField("category", e.target.value)} placeholder="e.g. Electronics" className={inputClass} />
                    </Field>
                    <Field label="Unit">
                      <select id="product-unit" value={form.unit} onChange={(e) => updateField("unit", e.target.value)} className={selectClass}>
                        <option value="">— Select unit —</option>
                        {COMMON_UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title="Pricing (AED)">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cost Price (AED)">
                      <input id="product-cost-price" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => updateField("cost_price", e.target.value)} placeholder="0.00" className={inputClass} />
                    </Field>
                    <Field label="Selling Price (AED)">
                      <input id="product-selling-price" type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => updateField("selling_price", e.target.value)} placeholder="0.00" className={inputClass} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="VAT Rate (%)">
                      <input id="product-vat-rate" type="number" min="0" max="100" step="0.01" value={form.vat_rate} onChange={(e) => updateField("vat_rate", e.target.value)} placeholder="5" className={inputClass} />
                    </Field>
                    <Field label="VAT Category">
                      <select id="product-vat-category" value={form.vat_category} onChange={(e) => updateField("vat_category", e.target.value)} className={selectClass}>
                        {UAE_VAT_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    </Field>
                  </div>
                </Section>

                {form.product_type === "Product" && (
                  <Section title="Stock Levels">
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Opening Stock">
                        <input id="product-opening-stock" type="number" min="0" step="1" value={form.opening_stock} onChange={(e) => updateField("opening_stock", e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Current Stock">
                        <input id="product-current-stock" type="number" min="0" step="1" value={form.current_stock} onChange={(e) => updateField("current_stock", e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Minimum Stock">
                        <input id="product-minimum-stock" type="number" min="0" step="1" value={form.minimum_stock} onChange={(e) => updateField("minimum_stock", e.target.value)} className={inputClass} />
                      </Field>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">Low-stock alert fires when Current Stock &le; Minimum Stock.</p>
                  </Section>
                )}

                <Section title="Additional Notes">
                  <Field label="Notes">
                    <textarea id="product-notes" value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Any additional notes" rows={3} className={inputClass} />
                  </Field>
                </Section>
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="product-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Saving…" : editingProduct ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
