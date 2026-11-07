"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCompanyId } from "@/lib/helpers";
import {
  getMaterialsList,
  saveMaterialMaster,
  MATERIAL_CATEGORIES,
  SUPPORTED_UNITS,
  type MaterialItem,
} from "@/lib/materialInventory";

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
  supplier_name: string;
  notes: string;
};

const emptyDraft: Draft = {
  name: "", sku: "", category: "Other / Custom", description: "",
  unit: "Pcs", cost_price: "0", selling_price: "0", vat_rate: "5",
  minimum_stock: "0", supplier_name: "", notes: "",
};

export default function MaterialProductsPage() {
  const [companyId, setCompanyId] = useState("");
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (id: string) => {
    setMaterials(await getMaterialsList(id));
  }, []);

  useEffect(() => {
    let active = true;
    getCompanyId().then(async (id) => {
      if (!active) return;
      if (!id) { setError("Please select a company before managing materials."); return; }
      setCompanyId(id);
      try { await refresh(id); } catch { if (active) setError("Unable to load materials."); }
    });
    return () => { active = false; };
  }, [refresh]);

  function edit(item: MaterialItem) {
    setDraft({
      id: item.id, name: item.name, sku: item.sku || "",
      category: item.category, description: item.description || "",
      unit: item.unit, cost_price: String(item.cost_price),
      selling_price: String(item.selling_price), vat_rate: String(item.vat_rate),
      minimum_stock: String(item.minimum_stock),
      supplier_name: item.supplier_name || "", notes: item.notes || "",
    });
    setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!companyId || saving) return;
    setError(""); setNotice("");
    if (!draft.name.trim()) { setError("Material name is required."); return; }
    const sku = draft.sku.trim();
    if (sku && materials.some(m => m.id !== draft.id && m.sku?.trim().toLowerCase() === sku.toLowerCase())) {
      setError("This SKU already exists for this company."); return;
    }
    const numbers = [draft.cost_price, draft.selling_price, draft.vat_rate, draft.minimum_stock].map(Number);
    if (numbers.some(n => !Number.isFinite(n) || n < 0) || numbers[2] > 100) {
      setError("Enter valid non-negative prices and stock thresholds, and a VAT rate between 0 and 100."); return;
    }
    setSaving(true);
    try {
      await saveMaterialMaster(companyId, {
        id: draft.id, name: draft.name.trim(), sku: sku || null,
        category: draft.category, description: draft.description,
        unit: draft.unit, cost_price: numbers[0], selling_price: numbers[1],
        vat_rate: numbers[2], minimum_stock: numbers[3],
        supplier_name: draft.supplier_name || null, notes: draft.notes,
      }, 0);
      await refresh(companyId);
      setDraft(emptyDraft);
      setNotice("Material saved. Use Stock In to record opening quantities with an audit trail.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save material.");
    } finally { setSaving(false); }
  }

  const inputClass = "w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-white";
  const visible = materials.filter(m => [m.name, m.sku, m.category].some(v => (v || "").toLowerCase().includes(search.toLowerCase())));

  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Products & Materials</h1>
        <p className="text-sm text-slate-400">Manage your product catalog. Stock quantities are maintained through the inventory ledger.</p></div>
      <Link href="/inventory" className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Back to Inventory</Link>
    </div>
    <form onSubmit={save} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <h2 className="font-semibold">{draft.id ? "Edit Material" : "Add Product / Material"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">Material name *<input required className={inputClass} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label className="text-sm">SKU<input className={inputClass} value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})}/></label>
        <label className="text-sm">Category<select className={inputClass} value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{MATERIAL_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label className="text-sm">Unit<select className={inputClass} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}>{SUPPORTED_UNITS.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
        {(["cost_price","selling_price","vat_rate","minimum_stock"] as const).map(k=><label className="text-sm" key={k}>{({cost_price:"Purchase price (AED)",selling_price:"Selling price (AED)",vat_rate:"VAT (%)",minimum_stock:"Minimum stock"})[k]}<input className={inputClass} type="number" min="0" step="0.01" value={draft[k]} onChange={e=>setDraft({...draft,[k]:e.target.value})}/></label>)}
        <label className="text-sm">Supplier<input className={inputClass} value={draft.supplier_name} onChange={e=>setDraft({...draft,supplier_name:e.target.value})}/></label>
        <label className="text-sm sm:col-span-2">Description<input className={inputClass} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
        <label className="text-sm">Notes<input className={inputClass} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
      </div>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={saving || !companyId} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-50">{saving ? "Saving..." : draft.id ? "Save Changes" : "Add Material"}</button>
      {draft.id && <button type="button" onClick={()=>setDraft(emptyDraft)} className="rounded-lg border border-slate-700 px-4 py-2">Cancel Edit</button>}
      <Link href="/inventory/stock-in" className="rounded-lg border border-slate-700 px-4 py-2">Record Stock In</Link></div>
    </form>
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Saved Materials ({materials.length})</h2>
      <input aria-label="Search materials" placeholder="Search materials or SKU" className={inputClass+" max-w-sm"} value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(m=><article key={m.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2"><strong>{m.name}</strong><button type="button" className="text-sm text-emerald-400" onClick={()=>edit(m)}>Edit</button></div>
        <p className="text-xs text-slate-400">{m.sku || "No SKU"} · {m.category} · {m.unit}</p>
        <p className="text-sm">Selling: AED {m.selling_price.toFixed(2)} · VAT {m.vat_rate}%</p>
        <p className="text-sm text-slate-400">Stock: {m.current_stock} {m.unit}</p>
      </article>)}</div>
    </section>
  </main>;
}
