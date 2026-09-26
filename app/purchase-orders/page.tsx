"use client";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, X, Save, Loader2, Pencil, Eye, Printer, Trash2, FileSignature } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem } from "@/lib/helpers";
import PurchaseOrderTemplate, { PurchaseOrderData, POLineItem } from "@/components/documents/PurchaseOrderTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import {
  PurchaseOrderStatus,
  PURCHASE_ORDER_STATUS_OPTIONS,
  normalizePurchaseOrderStatus,
  formatPurchaseOrderStatus,
  parsePurchaseOrderError,
} from "@/lib/purchaseOrderTypes";

// DB verified: purchase_orders columns: id, purchase_order_number, order_date, expected_date, status, company_id, supplier_id, project_id
// purchase_order_items: purchase_order_id (FK), discount_percent (not discount_pct), NO vat_category
type Supplier = { id: string; name: string | null; supplier_code: string | null; trn?: string | null; address?: string | null; phone?: string | null; email?: string | null };
type Project = { id: string; project_number: string; name: string };
type Product = { id: string; name: string | null; sku: string | null; cost_price: number | null; vat_rate: number | null; unit: string | null };
type POLine = { product_id: string; description: string; quantity: number; unit_price: number; discount_pct: number; vat_rate: number; line_total: number; vat_amount: number; sort_order: number };
type PO = { id: string; company_id: string; purchase_order_number: string | null; supplier_id: string | null; project_id?: string | null; order_date: string | null; expected_date: string | null; status: string | null; subtotal: number | null; vat_amount: number | null; total_amount: number | null; notes: string | null; created_at: string | null };
type POForm = { supplier_id: string; project_id: string; order_date: string; expected_date: string; status: PurchaseOrderStatus; notes: string };
const emptyForm: POForm = { supplier_id:"", project_id:"", order_date: todayISO(), expected_date:"", status:"draft", notes:"" };
const emptyLine = (): POLine => ({ product_id:"", description:"", quantity:1, unit_price:0, discount_pct:0, vat_rate:5, line_total:0, vat_amount:0, sort_order:0 });
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";
function recalc(item: POLine): POLine { const { vatAmount, lineTotal } = calcLineItem(item.quantity, item.unit_price, item.discount_pct, item.vat_rate); return { ...item, line_total: lineTotal, vat_amount: vatAmount }; }

export default function PurchaseOrdersPage() {
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [printDoc, setPrintDoc] = useState<PurchaseOrderData | null>(null);
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<POForm>(emptyForm);
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  const [viewing, setViewing] = useState<{po: PO; lines: POLine[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadAll(); }, []);
  async function loadAll() {
    setLoading(true);
    const [{ data: po }, { data: s }, { data: pr }, { data: p }, comp] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name, supplier_code, trn, address, phone, email").eq("active", true).order("name"),
      supabase.from("projects").select("id, project_number, name").order("project_number"),
      supabase.from("products").select("id, name, sku, cost_price, vat_rate, unit").eq("active", true).order("name"),
      getCurrentCompany(),
    ]);
    setOrders((po||[]) as PO[]); setSuppliers((s||[]) as Supplier[]); setProjects((pr||[]) as Project[]); setProducts((p||[]) as Product[]);
    setCompany(comp);
    setLoading(false);
  }

  async function handlePrintPO(po: PO) {
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("sort_order");
    const supp = suppMap[po.supplier_id || ""];
    const proj = projMap[po.project_id || ""];

    type DBPOItem = { id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; unit?: string };

    const lineItems: POLineItem[] = ((items || []) as DBPOItem[]).map((it) => ({
      id: it.id,
      description: it.description || "",
      quantity: Number(it.quantity) || 1,
      unit: it.unit || "Nos",
      unit_price: Number(it.unit_price) || 0,
      vat_rate: Number(it.vat_rate) || 5,
      vat_amount: Number(it.vat_amount) || 0,
      line_total: Number(it.line_total) || 0,
    }));

    const poDoc: PurchaseOrderData = {
      id: po.id,
      po_number: po.purchase_order_number || po.id.slice(0, 8).toUpperCase(),
      po_date: po.order_date || todayISO(),
      supplier_name: supp?.name || "Supplier",
      supplier_trn: supp?.trn || null,
      supplier_address: supp?.address || null,
      vendor_reference: null,
      vendor_contact: supp?.phone || null,
      vendor_mobile: supp?.phone || null,
      vendor_email: supp?.email || null,
      project_name: proj?.name || null,
      project_number: proj?.project_number || null,
      delivery_terms: po.expected_date ? `Expected Delivery: ${fmtDate(po.expected_date)}` : null,
      payment_terms: "Standard 30 Days Credit / Cash on Delivery",
      notes: po.notes || null,
      status: po.status || "Draft",
      subtotal: Number(po.subtotal) || 0,
      vat_amount: Number(po.vat_amount) || 0,
      total_amount: Number(po.total_amount) || 0,
      items: lineItems,
    };

    setPrintDoc(poDoc);
  }

  const totals = useCallback(() => { const sub = lines.reduce((s,l) => s + l.quantity*l.unit_price*(1-l.discount_pct/100), 0); const vat = lines.reduce((s,l) => s + l.vat_amount, 0); return { sub, vat, total: sub+vat }; }, [lines]);
  function onProductSelect(idx: number, pid: string) { const prod = products.find(p => p.id === pid); setLines(ls => ls.map((l,i) => i!==idx?l:recalc({ ...l, product_id: pid, description: prod?.name||l.description, unit_price: prod?.cost_price??l.unit_price, vat_rate: prod?.vat_rate??5 }))); }
  function updateLine(idx: number, u: Partial<POLine>) { setLines(ls => ls.map((l,i) => i!==idx?l:recalc({...l,...u}))); }
  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length===1) return; setLines(ls => ls.filter((_,i)=>i!==idx)); }
  const ff = (k: keyof POForm, v: string) => setForm(c => ({...c,[k]:v}));
  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(emptyForm); setLines([emptyLine()]); setShowForm(true); }
  async function openEdit(po: PO) {
    setError(""); setSuccess(""); setEditing(po);
    setForm({
      supplier_id: po.supplier_id||"",
      project_id: po.project_id||"",
      order_date: po.order_date||todayISO(),
      expected_date: po.expected_date||"",
      status: normalizePurchaseOrderStatus(po.status),
      notes: po.notes||""
    });
    // DB FK: purchase_order_id (not po_id)
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("sort_order");
    // Map DB discount_percent → UI discount_pct
    type DBPOItem = { id?: string; purchase_order_id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; sort_order?: number };
    setLines((items||[]).length>0?(items as DBPOItem[]).map(it => ({ product_id: it.product_id||"", description: it.description||"", quantity: Number(it.quantity)||1, unit_price: Number(it.unit_price)||0, discount_pct: Number(it.discount_percent??0), vat_rate: Number(it.vat_rate)||5, line_total: Number(it.line_total)||0, vat_amount: Number(it.vat_amount)||0, sort_order: Number(it.sort_order)||0 })):[emptyLine()]);
    setShowForm(true);
  }
  async function openView(po: PO) { const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("sort_order"); setViewing({ po, lines: (items||[]) as POLine[] }); }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.supplier_id) { setError("Please select a supplier."); return; }
    setSaving(true);
    try {
      const { sub, vat, total } = totals();
      const normStatus = normalizePurchaseOrderStatus(form.status);
      // DB: purchase_order_number, order_date (not po_date), expected_date
      const payload = {
        supplier_id: form.supplier_id,
        project_id: form.project_id || null,
        order_date: form.order_date || null,
        expected_date: form.expected_date || null,
        status: normStatus,
        subtotal: sub,
        vat_amount: vat,
        total_amount: total,
        notes: form.notes || null,
        updated_at: new Date().toISOString()
      };
      let poid: string;
      if (editing) {
        const { error: updateErr } = await supabase.from("purchase_orders").update(payload).eq("id", editing.id);
        if (updateErr) throw updateErr;
        poid = editing.id;
        // DB FK: purchase_order_id (not po_id)
        const { error: deleteItemsErr } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poid);
        if (deleteItemsErr) throw deleteItemsErr;
      } else {
        const cid = await getCompanyId();
        const poNum = await generateDocNumber(cid, "PO");
        const { data: ins, error: err } = await supabase.from("purchase_orders").insert({ ...payload, company_id: cid, purchase_order_number: poNum }).select("id").single();
        if (err) throw err;
        poid = ins.id;
      }
      // If Received, update stock
      if (normStatus === "received" && normalizePurchaseOrderStatus(editing?.status) !== "received") {
        for (const l of lines.filter(l=>l.product_id && l.quantity > 0)) {
          const { data: prod } = await supabase.from("products").select("current_stock").eq("id", l.product_id).single();
          if (!prod) continue;
          const before = prod.current_stock || 0;
          const after = before + l.quantity;
          const { error: stockErr } = await supabase.from("products").update({ current_stock: after, updated_at: new Date().toISOString() }).eq("id", l.product_id);
          if (stockErr) throw stockErr;
          const cid = await getCompanyId();
          // DB stock_movements: previous_stock, new_stock (not before_stock, after_stock)
          const { error: movementErr } = await supabase.from("stock_movements").insert({ company_id: cid, product_id: l.product_id, movement_type: "IN", quantity: l.quantity, previous_stock: before, new_stock: after, reference_type: "purchase_order", reference_id: poid });
          if (movementErr) throw movementErr;
        }
      }
      // DB: purchase_order_id (FK), discount_percent (not discount_pct), no vat_category
      const { error: itemErr } = await supabase.from("purchase_order_items").insert(lines.map((l,i)=>({ purchase_order_id: poid, product_id: l.product_id||null, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_percent: l.discount_pct, vat_rate: l.vat_rate, line_total: l.line_total, vat_amount: l.vat_amount, sort_order: i })));
      if (itemErr) throw itemErr;
      setSuccess(editing?"PO updated.":"Purchase order created."); closeForm(); await loadAll();
    } catch (err: unknown) { setError(parsePurchaseOrderError(err)); }
    finally { setSaving(false); }
  }

  const suppMap = Object.fromEntries(suppliers.map(s=>[s.id,s]));
  const projMap = Object.fromEntries(projects.map(p=>[p.id,p]));
  const filtered = orders.filter(po => {
    const norm = normalizePurchaseOrderStatus(po.status);
    if (filterStatus && norm !== filterStatus) return false;
    const sn = suppMap[po.supplier_id||""]?.name || "";
    const pn = projMap[po.project_id||""]?.project_number || "";
    const stLabel = formatPurchaseOrderStatus(po.status);
    return [po.purchase_order_number, sn, pn, po.status, stLabel].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const { sub: fSub, vat: fVAT, total: fTotal } = totals();

  async function deletePO(po: PO) {
    if (!window.confirm(`Are you sure you want to delete purchase order ${po.purchase_order_number || "this PO"}? This cannot be undone.`)) return;
    setError("");
    try {
      const { error: itemDeleteErr } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", po.id);
      if (itemDeleteErr) throw itemDeleteErr;
      const { error: delErr } = await supabase.from("purchase_orders").delete().eq("id", po.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete purchase order ${po.purchase_order_number} because it is referenced in supplier bills or receipt records.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Purchase order ${po.purchase_order_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete purchase order.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileSignature size={22}/></div><div><h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1><p className="text-sm text-slate-500">Manage supplier purchase orders</p></div></div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18}/>New PO</button>
        </div></header>
        <div className="mx-auto max-w-7xl px-6 py-8">
          {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
          {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
          <div className="mb-6 flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search POs…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"/>
            </div>
            <select
              value={filterStatus}
              onChange={e=>setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"
            >
              <option value="">All Statuses</option>
              {PURCHASE_ORDER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400"/></div> : filtered.length===0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><FileSignature size={40} className="mx-auto mb-3 text-slate-300"/><p className="text-sm text-slate-500">No purchase orders.</p></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-3">PO No.</th><th className="px-4 py-3">Supplier / Project</th><th className="px-4 py-3">PO Date</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filtered.map(po=>{
                  const normSt = normalizePurchaseOrderStatus(po.status);
                  const isReceived = normSt === "received";
                  const isCancelled = normSt === "cancelled";
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{po.purchase_order_number || po.id.slice(0,8).toUpperCase()}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{suppMap[po.supplier_id||""]?.name||"—"}</div>
                        {po.project_id && projMap[po.project_id] && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                            📁 {projMap[po.project_id].project_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(po.order_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(po.expected_date)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{fmtAED(po.vat_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(po.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(po.status||"draft")}`}>
                          {formatPurchaseOrderStatus(po.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handlePrintPO(po)}
                          title="Print / View A4 Purchase Order"
                          className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-900 hover:text-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition"
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button onClick={()=>openView(po)} title="View Summary" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Eye size={14}/></button>
                        {!isReceived && !isCancelled && (
                          <button onClick={()=>openEdit(po)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14}/></button>
                        )}
                        <button onClick={()=>deletePO(po)} title="Delete Purchase Order" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"><Trash2 size={14}/></button>
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm}/>
          <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{editing ? "Edit PO" : "New Purchase Order"}</h2>
                {!editing ? (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium border border-blue-200">
                    PO #: Auto-generated on save
                  </span>
                ) : (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-medium border border-slate-200">
                    PO #: {editing.purchase_order_number} (Read-only)
                  </span>
                )}
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="po-form" onSubmit={save} className="p-6 space-y-5">
                {error&&<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {normalizePurchaseOrderStatus(form.status)==="received"&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">✅ When saved as Received, stock will be updated for product line items.</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Supplier <span className="text-red-500">*</span></label><select value={form.supplier_id} onChange={e=>ff("supplier_id",e.target.value)} required className={sel}><option value="">— Select Supplier —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={e=>ff("status", normalizePurchaseOrderStatus(e.target.value))}
                      className={sel}
                    >
                      {PURCHASE_ORDER_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Project / Job (Optional)</label>
                    <select value={form.project_id} onChange={e=>ff("project_id",e.target.value)} className={sel}>
                      <option value="">— No Project / General Stock —</option>
                      {projects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Order Date</label><input type="date" value={form.order_date} onChange={e=>ff("order_date",e.target.value)} className={inp}/></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Expected Delivery</label><input type="date" value={form.expected_date} onChange={e=>ff("expected_date",e.target.value)} className={inp}/></div>
                </div>
                <div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left w-48">Product</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 w-16 text-center">Qty</th><th className="px-3 py-2 w-24 text-right">Cost Price</th><th className="px-3 py-2 w-14 text-center">Disc%</th><th className="px-3 py-2 w-14 text-center">VAT%</th><th className="px-3 py-2 w-28 text-right">Total</th><th className="px-3 py-2 w-8"></th></tr></thead>
                    <tbody>{lines.map((l,i)=>(
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1"><select value={l.product_id} onChange={e=>onProductSelect(i,e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"><option value="">—</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                        <td className="px-2 py-1"><input type="text" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})} placeholder="Description" className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="1" step="1" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-right focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.discount_pct} onChange={e=>updateLine(i,{discount_pct:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.vat_rate} onChange={e=>updateLine(i,{vat_rate:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1 text-right text-xs font-semibold whitespace-nowrap">AED {l.line_total.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center"><button type="button" onClick={()=>removeLine(i)} disabled={lines.length===1} className="text-slate-400 hover:text-red-500 disabled:opacity-30"><X size={14}/></button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400"><Plus size={14}/>Add Line</button>
                </div>
                <div className="flex justify-end"><div className="w-64 space-y-2 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(fSub)}</span></div><div className="flex justify-between text-amber-700"><span>VAT</span><span>{fmtAED(fVAT)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmtAED(fTotal)}</span></div></div></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={form.notes} onChange={e=>ff("notes",e.target.value)} rows={2} className={inp}/></div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="po-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}{saving?"Saving…":editing?"Save Changes":"Create PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setViewing(null)}/>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">PO {viewing.po.purchase_order_number || viewing.po.id.slice(0,8).toUpperCase()}</h2>
                <p className="text-sm text-slate-500">{suppMap[viewing.po.supplier_id||""]?.name}</p>
                {viewing.po.project_id && projMap[viewing.po.project_id] && (
                  <p className="text-xs text-blue-600 font-semibold mt-0.5">
                    Project: {projMap[viewing.po.project_id].project_number} — {projMap[viewing.po.project_id].name}
                  </p>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    const po = viewing.po;
                    setViewing(null);
                    handlePrintPO(po);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Printer size={14} /> Print A4 PO
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const po = viewing.po;
                    setViewing(null);
                    deletePO(po);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(viewing.po.status||"draft")}`}>
                  {formatPurchaseOrderStatus(viewing.po.status)}
                </span>
                <button onClick={()=>setViewing(null)}><X size={20}/></button>
              </div>
            </div>
            <table className="w-full text-sm mb-4"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-center">VAT%</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{viewing.lines.map((l,i)=><tr key={i}><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-center">{l.quantity}</td><td className="px-3 py-2 text-right">{fmtAED(l.unit_price)}</td><td className="px-3 py-2 text-center">{l.vat_rate}%</td><td className="px-3 py-2 text-right">{fmtAED(l.vat_amount)}</td><td className="px-3 py-2 text-right font-semibold">{fmtAED(l.line_total)}</td></tr>)}</tbody></table>
            <div className="flex justify-end"><div className="w-64 space-y-1 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(viewing.po.subtotal)}</span></div><div className="flex justify-between text-amber-600"><span>VAT</span><span>{fmtAED(viewing.po.vat_amount)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmtAED(viewing.po.total_amount)}</span></div></div></div>
          </div>
        </div>
      )}
      </div>

      {/* A4 Print Modal */}
      <PrintModal isOpen={!!printDoc} onClose={() => setPrintDoc(null)}>
        {printDoc && (
          <PurchaseOrderTemplate
            company={company}
            po={printDoc}
            onClose={() => setPrintDoc(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}
