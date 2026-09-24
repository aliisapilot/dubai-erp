"use client";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, FileCheck2, X, Save, Loader2, Pencil, Printer, Trash2, Ban } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem } from "@/lib/helpers";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import TaxInvoiceTemplate from "@/components/documents/TaxInvoiceTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null; address: string | null };
type Project = { id: string; project_number: string; name: string };
type Product = { id: string; name: string | null; sku: string | null; selling_price: number | null; vat_rate: number | null; vat_category: string | null; unit: string | null };
type Company = { name: string | null; legal_name: string | null; trn: string | null; address: string | null; city: string | null; phone: string | null; email: string | null };
type LineItem = { id?: string; product_id: string; description: string; quantity: number; unit: string; unit_price: number; discount_pct: number; vat_rate: number; taxable_amount: number; vat_amount: number; line_total: number; sort_order: number };
// DB verified: tax_invoices has project_id, payment_terms, supply_date — NO due_date
// DB verified: tax_invoice_items FK is tax_invoice_id (NOT invoice_id), uses discount_percent (NOT discount_pct), NO vat_category
type TI = { id: string; company_id: string; invoice_number: string | null; customer_id: string | null; project_id?: string | null; proforma_invoice_id: string | null; invoice_date: string | null; supply_date: string | null; status: string | null; subtotal: number | null; vat_amount: number | null; total_amount: number | null; payment_terms: string | null; notes: string | null; created_at: string | null };
type TIForm = { customer_id: string; project_id: string; invoice_date: string; supply_date: string; status: string; payment_terms: string; notes: string };
const emptyForm: TIForm = { customer_id:"", project_id:"", invoice_date: todayISO(), supply_date: todayISO(), status:"draft", payment_terms:"30 days", notes:"" };
const emptyLine = (): LineItem => ({ product_id:"", description:"", quantity:1, unit:"", unit_price:0, discount_pct:0, vat_rate:5, taxable_amount:0, vat_amount:0, line_total:0, sort_order:0 });
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";
function recalc(item: LineItem): LineItem { const { taxable, vatAmount, lineTotal } = calcLineItem(item.quantity, item.unit_price, item.discount_pct, item.vat_rate); return { ...item, taxable_amount: taxable, vat_amount: vatAmount, line_total: lineTotal }; }

function TIContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoices, setInvoices] = useState<TI[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [form, setForm] = useState<TIForm>(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TI | null>(null);
  const [printRec, setPrintRec] = useState<{ti: TI; lines: LineItem[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadAll().then((loaded) => {
      if (!loaded) return;
      const pid = searchParams.get("from_proforma");
      if (pid) loadFromProforma(pid);
    });
  }, []);

  /**
   * Loads the invoice list plus the dropdown lookups.
   *
   * Two things this must never do silently:
   *  1. Query without a signed-in session — every request would then be sent as
   *     the `anon` role, which has no SELECT grant on `tax_invoices`
   *     (42501 "permission denied"), so Supabase answers `data: null` and the
   *     list would render as "No tax invoices".
   *  2. Swallow the query error — a failed load has to be reported instead of
   *     being presented as an empty list.
   *
   * Returns true when the list was loaded successfully.
   */
  async function loadAll(): Promise<boolean> {
    setLoading(true);
    setLoadError("");

    // 1) Establish the session first (same gate the dashboard uses).
    const { data: authData, error: authErr } = await supabase.auth.getSession();
    if (authErr) {
      setLoadError(authErr.message);
      setLoading(false);
      return false;
    }
    if (!authData.session) {
      setLoadError("You are not signed in. Please sign in again to view tax invoices.");
      setLoading(false);
      router.replace("/login");
      return false;
    }

    try {
      // 2) Resolve the current company so the list is scoped to it explicitly
      //    (RLS still applies on top of this filter).
      const co = await getCurrentCompany();

      let tiQuery = supabase.from("tax_invoices").select("*");
      if (co?.id) tiQuery = tiQuery.eq("company_id", co.id);

      const [{ data: ti, error: tiErr }, { data: c }, { data: pr }, { data: p }] = await Promise.all([
        tiQuery.order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, customer_code, trn, address").eq("active", true).order("name"),
        supabase.from("projects").select("id, project_number, name").order("project_number"),
        supabase.from("products").select("id, name, sku, selling_price, vat_rate, unit").eq("active", true).order("name"),
      ]);
      if (tiErr) throw new Error(tiErr.message);

      setInvoices((ti || []) as TI[]);
      setCustomers((c || []) as Customer[]);
      setProjects((pr || []) as Project[]);
      setProducts((p || []) as Product[]);
      if (co) setCompany(co as Company);
      setLoading(false);
      return true;
    } catch (err: unknown) {
      // Surface load failures instead of rendering them as an empty list.
      setLoadError(err instanceof Error ? err.message : "Failed to load tax invoices.");
      setLoading(false);
      return false;
    }
  }

  async function loadFromProforma(proformaId: string) {
    const { data: pi } = await supabase.from("proforma_invoices").select("*").eq("id", proformaId).single();
    // proforma_invoice_items FK is proforma_invoice_id (not proforma_id)
    const { data: items } = await supabase.from("proforma_invoice_items").select("*").eq("proforma_invoice_id", proformaId).order("sort_order");
    if (pi) {
      setForm(f => ({ ...f, customer_id: pi.customer_id||"", project_id: pi.project_id||"", notes: pi.notes||"" }));
      // Map DB discount_percent → UI discount_pct
      type DBProformaItem = { id?: string; proforma_invoice_id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; taxable_amount?: number; vat_amount?: number; line_total?: number; sort_order?: number; unit?: string };
      setLines((items||[]).map((it: DBProformaItem) => ({ ...emptyLine(), product_id: it.product_id||"", description: it.description||"", quantity: Number(it.quantity)||1, unit_price: Number(it.unit_price)||0, discount_pct: Number(it.discount_percent??0), vat_rate: Number(it.vat_rate)||5, taxable_amount: Number(it.taxable_amount)||0, vat_amount: Number(it.vat_amount)||0, line_total: Number(it.line_total)||0, sort_order: Number(it.sort_order)||0, unit: it.unit||"", id: undefined })));
      setShowForm(true);
    }
  }

  const totals = useCallback(() => {
    const sub = lines.reduce((s,l) => s + l.taxable_amount, 0);
    const vat = lines.reduce((s,l) => s + l.vat_amount, 0);
    return { sub, vat, total: sub + vat };
  }, [lines]);

  function onProductSelect(idx: number, pid: string) {
    const prod = products.find(p => p.id === pid);
    setLines(ls => ls.map((l,i) => i!==idx?l:recalc({ ...l, product_id: pid, description: prod?.name||l.description, unit: prod?.unit||l.unit, unit_price: prod?.selling_price??l.unit_price, vat_rate: prod?.vat_rate??5 })));
  }
  function updateLine(idx: number, u: Partial<LineItem>) { setLines(ls => ls.map((l,i) => i!==idx?l:recalc({...l,...u}))); }
  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length===1) return; setLines(ls => ls.filter((_,i)=>i!==idx)); }
  const ff = (k: keyof TIForm, v: string) => setForm(c => ({...c,[k]:v}));
  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(emptyForm); setLines([emptyLine()]); setShowForm(true); }
  async function openEdit(ti: TI) {
    if (ti.status === "issued") { setError("Final invoices cannot be edited. Cancel and reissue."); return; }
    setError(""); setSuccess(""); setEditing(ti);
    setForm({ customer_id: ti.customer_id||"", project_id: ti.project_id||"", invoice_date: ti.invoice_date||todayISO(), supply_date: ti.supply_date||todayISO(), status: ti.status||"draft", payment_terms: ti.payment_terms||"", notes: ti.notes||"" });
    // DB FK: tax_invoice_id (not invoice_id)
    const { data: items } = await supabase.from("tax_invoice_items").select("*").eq("tax_invoice_id", ti.id).order("sort_order");
    // Map DB discount_percent → UI discount_pct
    type DBTaxItem = { id?: string; tax_invoice_id?: string; product_id?: string; description?: string; quantity?: number; unit?: string; unit_price?: number; discount_percent?: number; vat_rate?: number; taxable_amount?: number; vat_amount?: number; line_total?: number; sort_order?: number };
    setLines((items||[]).length>0?(items as DBTaxItem[]).map(it => ({ ...emptyLine(), ...it, discount_pct: Number(it.discount_percent??0) } as LineItem)):[emptyLine()]);
    setShowForm(true);
  }
  async function openPrint(ti: TI) { const { data: items } = await supabase.from("tax_invoice_items").select("*").eq("tax_invoice_id", ti.id).order("sort_order"); setPrintRec({ ti, lines: (items||[]) as LineItem[] }); }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  const isDraft = (s?: string | null) => (s || "").toLowerCase() === "draft";
  const isCancelled = (s?: string | null) => (s || "").toLowerCase() === "cancelled";

  async function deleteDraftInvoice(ti: TI) {
    if (!isDraft(ti.status)) {
      setError("Only draft invoices can be permanently deleted. Issued or posted invoices must be cancelled to preserve accounting history.");
      return;
    }
    if (!confirm(`Are you sure you want to delete draft invoice "${ti.invoice_number}"? This action cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      const { error: itemsErr } = await supabase.from("tax_invoice_items").delete().eq("tax_invoice_id", ti.id);
      if (itemsErr) throw new Error(itemsErr.message);
      const { error: invErr } = await supabase.from("tax_invoices").delete().eq("id", ti.id);
      if (invErr) {
        if (invErr.code === "23503") {
          throw new Error("Cannot delete draft invoice: other records (such as delivery notes or receipts) reference it.");
        }
        throw new Error(invErr.message);
      }
      setSuccess(`Draft invoice ${ti.invoice_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete draft invoice.");
    }
  }

  async function cancelInvoice(ti: TI) {
    if (isDraft(ti.status)) {
      await deleteDraftInvoice(ti);
      return;
    }
    if (!confirm(`Are you sure you want to cancel invoice "${ti.invoice_number}"? This will mark it as Cancelled and preserve accounting history without destroying linked records.`)) return;
    setError("");
    setSuccess("");
    try {
      const { error: err } = await supabase.from("tax_invoices").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", ti.id);
      if (err) throw new Error(err.message);
      setSuccess(`Invoice ${ti.invoice_number} has been marked as Cancelled.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel invoice.");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.customer_id) { setError("Please select a customer."); return; }
    if (editing?.status === "Final") { setError("Final invoices cannot be edited."); return; }
    setSaving(true);
    try {
      const { sub, vat, total } = totals();
      // DB: no due_date column in tax_invoices
      const payload = { customer_id: form.customer_id, project_id: form.project_id || null, invoice_date: form.invoice_date||null, supply_date: form.supply_date||null, status: form.status, subtotal: sub, vat_amount: vat, total_amount: total, payment_terms: form.payment_terms||null, notes: form.notes||null, updated_at: new Date().toISOString() };
      let iid: string;
      if (editing) {
        const { error: updateErr } = await supabase.from("tax_invoices").update(payload).eq("id", editing.id);
        if (updateErr) throw updateErr;
        iid = editing.id;
        // DB FK: tax_invoice_id (not invoice_id)
        const { error: deleteItemsErr } = await supabase.from("tax_invoice_items").delete().eq("tax_invoice_id", iid);
        if (deleteItemsErr) throw deleteItemsErr;
      } else {
        const cid = await getCompanyId(); const ino = await generateDocNumber(cid, "INV");
        const { data: ins, error: err } = await supabase.from("tax_invoices").insert({ ...payload, company_id: cid, invoice_number: ino }).select("id").single();
        if (err) throw new Error(err.message);
        iid = ins.id;
      }
      // DB: tax_invoice_id (FK), discount_percent (not discount_pct), no vat_category
      const { error: itemErr } = await supabase.from("tax_invoice_items").insert(lines.map((l,i)=>({ tax_invoice_id: iid, product_id: l.product_id||null, description: l.description, quantity: l.quantity, unit: l.unit||null, unit_price: l.unit_price, discount_percent: l.discount_pct, vat_rate: l.vat_rate, taxable_amount: l.taxable_amount, vat_amount: l.vat_amount, line_total: l.line_total, sort_order: i })));
      if (itemErr) throw itemErr;
      setShowForm(false);
      setEditing(null);
      setSuccess(editing?"Invoice updated.":"Tax invoice created.");
      await loadAll();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  }

  const custMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const projMap = Object.fromEntries(projects.map(p=>[p.id,p]));
  const filtered = invoices.filter(ti => { if (filterStatus && ti.status!==filterStatus) return false; const cn=custMap[ti.customer_id||""]?.name||""; const pn=projMap[ti.project_id||""]?.project_number||""; return [ti.invoice_number, cn, pn, ti.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()); });
  const { sub: fSub, vat: fVAT, total: fTotal } = totals();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileCheck2 size={22}/></div><div><h1 className="text-2xl font-bold text-slate-900">Tax Invoices</h1><p className="text-sm text-slate-500">UAE VAT-compliant tax invoices</p></div></div>
        <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18}/>New Invoice</button>
      </div></header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
        <div className="mb-6 flex gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"/></div><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"><option value="">All Status</option><option value="draft">Draft</option><option value="issued">Final</option><option value="cancelled">Cancelled</option><option value="partially_paid">Partially Paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400"/></div> : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-16 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load tax invoices.</p>
            <p className="mt-2 text-sm text-red-600">{loadError}</p>
            <button onClick={() => loadAll()} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Retry</button>
          </div>
        ) : filtered.length===0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><FileCheck2 size={40} className="mx-auto mb-3 text-slate-300"/><p className="text-sm text-slate-500">No tax invoices.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Invoice No.</th><th className="px-4 py-3">Customer / Project</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Taxable</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map(ti=>(
                <tr key={ti.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{ti.invoice_number||"—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{custMap[ti.customer_id||""]?.name||"—"}</div>
                    {ti.project_id && projMap[ti.project_id] && (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                        📁 {projMap[ti.project_id].project_number}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(ti.invoice_date)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtAED(ti.subtotal)}</td>
                  <td className="px-4 py-3 text-right text-amber-600">{fmtAED(ti.vat_amount)}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(ti.total_amount)}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(ti.status||"Draft")}`}>{ti.status||"Draft"}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-center items-center gap-1">
                    <button onClick={()=>openPrint(ti)} title="Print Document" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"><Printer size={14}/></button>
                    {!isCancelled(ti.status) && ti.status!=="issued" && ti.status!=="Final" && (
                      <button onClick={()=>openEdit(ti)} title="Edit Invoice" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"><Pencil size={14}/></button>
                    )}
                    {isDraft(ti.status) ? (
                      <button onClick={()=>deleteDraftInvoice(ti)} title="Delete Draft" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"><Trash2 size={14}/></button>
                    ) : !isCancelled(ti.status) ? (
                      <button onClick={()=>cancelInvoice(ti)} title="Cancel / Void Invoice" className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition"><Ban size={14}/></button>
                    ) : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm}/>
          <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{editing ? "Edit Tax Invoice" : "New Tax Invoice"}</h2>
                {!editing ? (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium border border-blue-200">
                    Invoice #: Auto-generated on save
                  </span>
                ) : (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-medium border border-slate-200">
                    Invoice #: {editing.invoice_number} (Read-only)
                  </span>
                )}
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="ti-form" onSubmit={save} className="p-6 space-y-5">
                {error&&<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Customer <span className="text-red-500">*</span></label><select value={form.customer_id} onChange={e=>ff("customer_id",e.target.value)} required className={sel}><option value="">— Select Customer —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.trn?` (TRN: ${c.trn})`:""}</option>)}</select></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Status</label><select value={form.status} onChange={e=>ff("status",e.target.value)} className={sel}><option value="draft">Draft</option><option value="issued">Final</option><option value="cancelled">Cancelled</option><option value="partially_paid">Partially Paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Project / Job (Optional)</label>
                    <select value={form.project_id} onChange={e=>ff("project_id",e.target.value)} className={sel}>
                      <option value="">— No Project / General —</option>
                      {projects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Invoice Date</label><input type="date" value={form.invoice_date} onChange={e=>ff("invoice_date",e.target.value)} className={inp}/></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Supply Date</label><input type="date" value={form.supply_date} onChange={e=>ff("supply_date",e.target.value)} className={inp}/></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Terms</label><input type="text" value={form.payment_terms} onChange={e=>ff("payment_terms",e.target.value)} placeholder="e.g. 30 days" className={inp}/></div>
                </div>
                {editing?.status==="Final"&&<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">⚠️ This invoice is Final. Change status to Draft to edit financial details. Otherwise, Cancel and reissue.</div>}
                <div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left w-40">Product</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 w-32 text-center">Qty</th><th className="px-3 py-2 w-16 text-center">Unit</th><th className="px-3 py-2 w-24 text-right">Price</th><th className="px-3 py-2 w-14 text-center">Disc%</th><th className="px-3 py-2 w-14 text-center">VAT%</th><th className="px-3 py-2 w-24 text-right">Taxable</th><th className="px-3 py-2 w-20 text-right">VAT</th><th className="px-3 py-2 w-24 text-right">Total</th><th className="px-3 py-2 w-8"></th></tr></thead>
                    <tbody>{lines.map((l,i)=>(
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1"><select value={l.product_id} onChange={e=>onProductSelect(i,e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"><option value="">—</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                        <td className="px-2 py-1"><input type="text" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})} placeholder="Description" className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none" required/></td>
                        <td className="px-2 py-1"><input type="number" min="1" step="1" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} className="w-full min-w-[7rem] rounded border border-slate-200 px-3 py-1.5 text-sm font-medium text-center tabular-nums focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="text" value={l.unit} onChange={e=>updateLine(i,{unit:e.target.value})} placeholder="pcs" className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-right focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.discount_pct} onChange={e=>updateLine(i,{discount_pct:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.vat_rate} onChange={e=>updateLine(i,{vat_rate:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none"/></td>
                        <td className="px-2 py-1 text-right text-xs whitespace-nowrap">{l.taxable_amount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-xs text-amber-600 whitespace-nowrap">{l.vat_amount.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right text-xs font-semibold whitespace-nowrap">AED {l.line_total.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center"><button type="button" onClick={()=>removeLine(i)} disabled={lines.length===1} className="text-slate-400 hover:text-red-500 disabled:opacity-30"><X size={14}/></button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400"><Plus size={14}/>Add Line</button>
                </div>
                <div className="flex justify-end"><div className="w-72 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Taxable Amount</span><span>{fmtAED(fSub)}</span></div>
                  <div className="flex justify-between text-amber-700 font-medium"><span>VAT ({lines[0]?.vat_rate??5}%)</span><span>{fmtAED(fVAT)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 text-base"><span>Total inc. VAT</span><span>{fmtAED(fTotal)}</span></div>
                </div></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={form.notes} onChange={e=>ff("notes",e.target.value)} rows={2} className={inp}/></div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="ti-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}{saving?"Saving…":editing?"Save Changes":"Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Print Modal */}
      <PrintModal isOpen={!!printRec} onClose={() => setPrintRec(null)}>
        {printRec && (
          <TaxInvoiceTemplate
            company={company}
            invoice={{
              invoice_number: printRec.ti.invoice_number || "INV",
              invoice_date: printRec.ti.invoice_date || "",
              supply_date: printRec.ti.supply_date,
              customer_name: custMap[printRec.ti.customer_id || ""]?.name || "Customer",
              customer_trn: custMap[printRec.ti.customer_id || ""]?.trn,
              customer_address: custMap[printRec.ti.customer_id || ""]?.address,
              project_number: printRec.ti.project_id ? projMap[printRec.ti.project_id]?.project_number : undefined,
              project_name: printRec.ti.project_id ? projMap[printRec.ti.project_id]?.name : undefined,
              payment_terms: printRec.ti.payment_terms,
              notes: printRec.ti.notes,
              status: printRec.ti.status,
              subtotal: printRec.ti.subtotal || 0,
              vat_amount: printRec.ti.vat_amount || 0,
              total_amount: printRec.ti.total_amount || 0,
              items: printRec.lines.map(l => ({
                description: l.description,
                quantity: l.quantity,
                unit: l.unit,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                taxable_amount: l.taxable_amount,
                vat_rate: l.vat_rate,
                vat_amount: l.vat_amount,
                line_total: l.line_total,
              })),
            }}
            onClose={() => setPrintRec(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}

export default function TaxInvoicesPage() {
  return <Suspense><TIContent /></Suspense>;
}



