"use client";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, FileText, X, Save, Loader2, Pencil, Eye, ArrowRight, Printer, Trash2 } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem } from "@/lib/helpers";
import { useRouter } from "next/navigation";
import QuotationTemplate from "@/components/documents/QuotationTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null };
type Product = { id: string; name: string | null; sku: string | null; selling_price: number | null; vat_rate: number | null; unit: string | null };
type Project = { id: string; name: string | null; project_number: string | null };
type LineItem = { id?: string; product_id: string; description: string; quantity: number; unit?: string | null; unit_price: number; discount_percent: number; discount_pct?: number; vat_rate: number; vat_category?: string; line_total: number; vat_amount: number; sort_order: number };
type RawItemRecord = {
  id?: string;
  product_id?: string | null;
  description?: string;
  quantity?: number;
  unit?: string | null;
  unit_price?: number;
  discount_percent?: number;
  discount_pct?: number;
  vat_rate?: number;
  vat_category?: string;
  line_total?: number;
  vat_amount?: number;
  sort_order?: number;
};

type Quotation = { id: string; company_id: string; quotation_number: string | null; customer_id: string | null; project_id?: string | null; quotation_date: string | null; expiry_date: string | null; status: string | null; subtotal: number | null; discount_amount: number | null; vat_amount: number | null; total_amount: number | null; notes: string | null; terms: string | null; created_at: string | null };
type QForm = { customer_id: string; project_id: string; quotation_date: string; expiry_date: string; status: string; notes: string; terms: string };

type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

const STATUS_OPTIONS: { value: QuotationStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

function normalizeQuotationStatus(status: unknown): QuotationStatus {
  const s = String(status || "draft").toLowerCase().trim();
  const valid = STATUS_OPTIONS.some(opt => opt.value === s);
  return valid ? (s as QuotationStatus) : "draft";
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return "Draft";
  const s = String(status).toLowerCase().trim();
  const match = STATUS_OPTIONS.find(opt => opt.value === s);
  return match ? match.label : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

const emptyForm: QForm = { customer_id:"", project_id:"", quotation_date: todayISO(), expiry_date:"", status:"draft", notes:"", terms:"" };
const emptyLine = (): LineItem => ({ product_id:"", description:"", quantity:1, unit:"Nos", unit_price:0, discount_percent:0, vat_rate:5, vat_category:"Standard Rated", line_total:0, vat_amount:0, sort_order:0 });
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

function recalc(item: LineItem): LineItem {
  const disc = Number(item.discount_percent ?? item.discount_pct ?? 0);
  const { vatAmount, lineTotal } = calcLineItem(item.quantity, item.unit_price, disc, item.vat_rate);
  return { ...item, discount_percent: disc, line_total: lineTotal, vat_amount: vatAmount };
}

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<QForm>(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [viewing, setViewing] = useState<{q: Quotation; lines: LineItem[]} | null>(null);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [printRec, setPrintRec] = useState<{q: Quotation; lines: LineItem[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: q }, { data: c }, { data: p }, { data: prjs }, co] = await Promise.all([
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code, trn").eq("active", true).order("name"),
      supabase.from("products").select("id, name, sku, selling_price, vat_rate, unit").eq("active", true).order("name"),
      supabase.from("projects").select("id, name, project_number").order("created_at", { ascending: false }),
      getCurrentCompany(),
    ]);
    setQuotations((q || []) as Quotation[]);
    setCustomers((c || []) as Customer[]);
    setProducts((p || []) as Product[]);
    setProjects((prjs || []) as Project[]);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  async function openPrint(q: Quotation) {
    const { data: rawItems } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    const mapped = (rawItems || []).map((it: RawItemRecord) => ({
      ...emptyLine(),
      ...it,
      discount_percent: Number(it.discount_percent ?? it.discount_pct ?? 0),
    }));
    setPrintRec({ q, lines: mapped as LineItem[] });
  }

  const totals = useCallback(() => {
    const subtotal = lines.reduce((s,l) => {
      const disc = Number(l.discount_percent ?? l.discount_pct ?? 0);
      return s + (l.quantity * l.unit_price * (1 - disc / 100));
    }, 0);
    const vatAmount = lines.reduce((s,l) => s + l.vat_amount, 0);
    const total = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  }, [lines]);

  function onProductSelect(idx: number, productId: string) {
    const prod = products.find(p => p.id === productId);
    setLines(ls => ls.map((l, i) => i !== idx ? l : recalc({
      ...l, product_id: productId,
      description: prod?.name || l.description,
      unit: prod?.unit || l.unit || "Nos",
      unit_price: prod?.selling_price ?? l.unit_price,
      vat_rate: prod?.vat_rate ?? 5,
      vat_category: "Standard Rated",
    })));
  }

  function updateLine(idx: number, updates: Partial<LineItem>) {
    setLines(ls => ls.map((l, i) => i !== idx ? l : recalc({ ...l, ...updates })));
  }

  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length === 1) return; setLines(ls => ls.filter((_,i) => i !== idx)); }

  const ff = (k: keyof QForm, v: string) => setForm(c => ({ ...c, [k]: v }));

  function openAdd() {
    setError("");
    setSuccess("");
    setEditing(null);
    setForm({ ...emptyForm, status: "draft" });
    setLines([emptyLine()]);
    setShowForm(true);
  }

  async function openEdit(q: Quotation) {
    setError("");
    setSuccess("");
    setEditing(q);
    setForm({
      customer_id: q.customer_id || "",
      project_id: q.project_id || "",
      quotation_date: q.quotation_date || todayISO(),
      expiry_date: q.expiry_date || "",
      status: normalizeQuotationStatus(q.status),
      notes: q.notes || "",
      terms: q.terms || ""
    });
    const { data: items } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    const rawItems = (items || []) as RawItemRecord[];
    const mapped: LineItem[] = rawItems.map((it) => ({
      id: it.id,
      product_id: it.product_id || "",
      description: it.description || "",
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      discount_percent: Number(it.discount_percent ?? it.discount_pct ?? 0),
      vat_rate: Number(it.vat_rate) || 5,
      vat_category: it.vat_category || "Standard Rated",
      line_total: Number(it.line_total) || 0,
      vat_amount: Number(it.vat_amount) || 0,
      sort_order: Number(it.sort_order) || 0,
      unit: it.unit || "Nos",
    }));
    setLines(mapped.length > 0 ? mapped : [emptyLine()]);
    setShowForm(true);
  }

  async function openView(q: Quotation) {
    const { data: items } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    const rawItems = (items || []) as RawItemRecord[];
    const mapped: LineItem[] = rawItems.map((it) => ({
      id: it.id,
      product_id: it.product_id || "",
      description: it.description || "",
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      discount_percent: Number(it.discount_percent ?? it.discount_pct ?? 0),
      vat_rate: Number(it.vat_rate) || 5,
      vat_category: it.vat_category || "Standard Rated",
      line_total: Number(it.line_total) || 0,
      vat_amount: Number(it.vat_amount) || 0,
      sort_order: Number(it.sort_order) || 0,
      unit: it.unit || "Nos",
    }));
    setViewing({ q, lines: mapped });
  }

  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function updateQuotationStatus(quotationId: string, nextStatus: string): Promise<boolean> {
    try {
      const validStatus = normalizeQuotationStatus(nextStatus);
      const { error: err } = await supabase
        .from("quotations")
        .update({
          status: validStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", quotationId);
      if (err) throw err;
      await loadAll();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update quotation status");
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.customer_id) { setError("Please select a customer."); return; }
    if (lines.length === 0) { setError("Please add at least one line item."); return; }
    if (lines.some(l => !l.description.trim())) { setError("All line items must have a description."); return; }
    setSaving(true);
    try {
      const { subtotal, vatAmount, total } = totals();
      // Ensure status sent to Supabase is strictly the lowercase database value (e.g. 'draft')
      const dbStatus: QuotationStatus = normalizeQuotationStatus(form.status);

      let qid: string;
      if (editing) {
        const updatePayload = {
          customer_id: form.customer_id,
          project_id: form.project_id || null,
          quotation_date: form.quotation_date || null,
          expiry_date: form.expiry_date || null,
          status: String(dbStatus),
          subtotal,
          discount_amount: 0,
          vat_amount: vatAmount,
          total_amount: total,
          notes: form.notes.trim() || null,
          terms: form.terms.trim() || null,
          updated_at: new Date().toISOString()
        };
        const { error: err } = await supabase.from("quotations").update(updatePayload).eq("id", editing.id);
        if (err) throw new Error(err.message);
        qid = editing.id;
        const { error: delErr } = await supabase.from("quotation_items").delete().eq("quotation_id", qid);
        if (delErr) throw new Error(delErr.message);
      } else {
        const cid = await getCompanyId();
        const qno = await generateDocNumber(cid, "QUO");
        const insertPayload = {
          company_id: cid,
          quotation_number: qno,
          customer_id: form.customer_id,
          project_id: form.project_id || null,
          quotation_date: form.quotation_date || null,
          expiry_date: form.expiry_date || null,
          status: String(dbStatus),
          subtotal,
          discount_amount: 0,
          vat_amount: vatAmount,
          total_amount: total,
          notes: form.notes.trim() || null,
          terms: form.terms.trim() || null,
          updated_at: new Date().toISOString()
        };
        const { data: ins, error: err } = await supabase.from("quotations").insert(insertPayload).select("id").single();
        if (err) throw new Error(err.message);
        qid = ins.id;
      }
      const itemPayload = lines.map((l, i) => {
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unit_price) || 0;
        const discPct = Number(l.discount_percent ?? l.discount_pct ?? 0);
        const gross = qty * price;
        const discAmt = gross * (discPct / 100);
        const taxable = gross - discAmt;
        const vatRate = Number(l.vat_rate) || 0;
        const vatAmt = Number(l.vat_amount) || (taxable * (vatRate / 100));
        const lineTot = Number(l.line_total) || (taxable + vatAmt);

        return {
          quotation_id: qid,
          product_id: l.product_id || null,
          description: l.description,
          quantity: qty,
          unit: l.unit || "Nos",
          unit_price: price,
          discount_percent: discPct,
          discount_amount: discAmt,
          taxable_amount: taxable,
          vat_rate: vatRate,
          vat_amount: vatAmt,
          line_total: lineTot,
          sort_order: i,
        };
      });
      const { error: itemErr } = await supabase.from("quotation_items").insert(itemPayload);
      if (itemErr) throw new Error(itemErr.message);
      setSuccess(editing ? "Quotation updated." : "Quotation created.");
      closeForm(); await loadAll();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  }

  async function convertToProforma(q: Quotation) {
    router.push(`/proforma-invoices?from_quotation=${q.id}`);
  }

  const custMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const prjMap = Object.fromEntries(projects.map(p=>[p.id,p]));
  const filtered = quotations.filter(q => {
    if (filterStatus && (q.status || "").toLowerCase() !== filterStatus.toLowerCase()) return false;
    const cname = custMap[q.customer_id||""]?.name||"";
    const pname = prjMap[q.project_id||""]?.name||"";
    return [q.quotation_number, cname, pname, formatStatus(q.status), q.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const { subtotal: fSub, vatAmount: fVAT, total: fTotal } = totals();

  async function deleteQuotation(q: Quotation) {
    if (!window.confirm(`Are you sure you want to delete quotation ${q.quotation_number || "this quotation"}? This cannot be undone.`)) {
      return;
    }
    setError("");
    try {
      await supabase.from("quotation_items").delete().eq("quotation_id", q.id);
      const { error: delErr } = await supabase.from("quotations").delete().eq("id", q.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete quotation ${q.quotation_number} because it is referenced in converted orders or invoices.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Quotation ${q.quotation_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete quotation.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileText size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Quotations</h1><p className="text-sm text-slate-500">Create and manage sales quotations</p></div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />New Quotation</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[["Total",quotations.length,"slate"],["Draft",quotations.filter(q=>(q.status||"").toLowerCase()==="draft").length,"slate"],["Sent",quotations.filter(q=>(q.status||"").toLowerCase()==="sent").length,"blue"],["Accepted",quotations.filter(q=>(q.status||"").toLowerCase()==="accepted").length,"emerald"]].map(([l,v,c])=>(
            <div key={String(l)} className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500 font-medium">{l}</p><p className={`mt-1 text-2xl font-bold ${c==="emerald"?"text-emerald-600":c==="blue"?"text-blue-600":"text-slate-700"}`}>{v}</p></div>
          ))}
        </div>
        <div className="mb-6 flex gap-3">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quotations…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" /></div>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
            <option value="">All Status</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><FileText size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No quotations found.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">No.</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{q.quotation_number||"—"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>{custMap[q.customer_id||""]?.name||"—"}</div>
                      {q.project_id && prjMap[q.project_id] && (
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                          {prjMap[q.project_id]?.project_number}: {prjMap[q.project_id]?.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(q.quotation_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(q.expiry_date)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(q.total_amount)}</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(formatStatus(q.status))}`}>{formatStatus(q.status)}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-center gap-1">
                      <button onClick={() => openView(q)} title="View" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Eye size={14} /></button>
                      <button onClick={() => openPrint(q)} title="Print / PDF Document" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><Printer size={14} /></button>
                      {((q.status||"").toLowerCase() === "draft" || (q.status||"").toLowerCase() === "sent") && <button onClick={() => openEdit(q)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>}
                      {(q.status||"").toLowerCase() === "accepted" && <button onClick={() => convertToProforma(q)} title="Convert to Proforma" className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><ArrowRight size={14} /></button>}
                      {["draft", "sent", "rejected", "expired"].includes((q.status || "").toLowerCase()) && (
                        <button onClick={() => deleteQuotation(q)} title="Delete Quotation" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Panel */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Quotation" : "New Quotation"}</h2>
                {!editing ? (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium border border-blue-200">
                    Quotation #: Auto-generated on save
                  </span>
                ) : (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-medium border border-slate-200">
                    Quotation #: {editing.quotation_number} (Read-only)
                  </span>
                )}
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="q-form" onSubmit={save} className="p-6 space-y-6">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {/* Header */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Customer <span className="text-red-500">*</span></label><select value={form.customer_id} onChange={e=>ff("customer_id",e.target.value)} required className={sel}><option value="">— Select Customer —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code?`${c.customer_code} - `:""}{c.name}</option>)}</select></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Project / Job (Optional)</label><select value={form.project_id} onChange={e=>ff("project_id",e.target.value)} className={sel}><option value="">— No Project Linked —</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_number} - {p.name}</option>)}</select></div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={normalizeQuotationStatus(form.status)}
                      onChange={e => ff("status", normalizeQuotationStatus(e.target.value))}
                      className={sel}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Quotation Date</label><input type="date" value={form.quotation_date} onChange={e=>ff("quotation_date",e.target.value)} className={inp} /></div>
                  <div className="col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date</label><input type="date" value={form.expiry_date} onChange={e=>ff("expiry_date",e.target.value)} className={inp} /></div>
                </div>
                {/* Line Items */}
                <div>
                  <div className="flex justify-between items-center mb-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Line Items</p></div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left w-48">Product</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 w-16 text-center">Qty</th><th className="px-3 py-2 w-24 text-right">Unit Price</th><th className="px-3 py-2 w-16 text-center">Disc%</th><th className="px-3 py-2 w-16 text-center">VAT%</th><th className="px-3 py-2 w-28 text-right">Total</th><th className="px-3 py-2 w-10"></th></tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1"><select value={l.product_id} onChange={e=>onProductSelect(i,e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none"><option value="">— Select —</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku?`${p.sku} - `:""}{p.name}</option>)}</select></td>
                            <td className="px-2 py-1"><input type="text" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})} placeholder="Description" className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none" required /></td>
                            <td className="px-2 py-1"><input type="number" min="1" step="1" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none" /></td>
                            <td className="px-2 py-1"><input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-right focus:outline-none" /></td>
                            <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.discount_percent} onChange={e=>updateLine(i,{discount_percent:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none" /></td>
                            <td className="px-2 py-1"><input type="number" min="0" max="100" step="0.01" value={l.vat_rate} onChange={e=>updateLine(i,{vat_rate:Number(e.target.value)})} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-center focus:outline-none" /></td>
                            <td className="px-2 py-1 text-right text-xs font-semibold text-slate-900 whitespace-nowrap">AED {l.line_total.toFixed(2)}</td>
                            <td className="px-2 py-1 text-center"><button type="button" onClick={()=>removeLine(i)} disabled={lines.length===1} className="text-slate-400 hover:text-red-500 disabled:opacity-30"><X size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"><Plus size={14} />Add Line</button>
                </div>
                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(fSub)}</span></div>
                    <div className="flex justify-between text-slate-600"><span>VAT</span><span>{fmtAED(fVAT)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900"><span>Total (AED)</span><span>{fmtAED(fTotal)}</span></div>
                  </div>
                </div>
                {/* Notes & Terms */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={form.notes} onChange={e=>ff("notes",e.target.value)} rows={3} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Terms & Conditions</label><textarea value={form.terms} onChange={e=>ff("terms",e.target.value)} rows={3} className={inp} /></div>
                </div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="q-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}{saving?"Saving…":editing?"Save Changes":"Create Quotation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setViewing(null)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Quotation {viewing.q.quotation_number}</h2>
                <p className="text-sm text-slate-500">{custMap[viewing.q.customer_id||""]?.name}</p>
                {viewing.q.project_id && prjMap[viewing.q.project_id] && (
                  <p className="text-xs text-blue-600 font-medium mt-0.5">
                    Linked Project: {prjMap[viewing.q.project_id]?.project_number} - {prjMap[viewing.q.project_id]?.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={normalizeQuotationStatus(viewing.q.status)}
                  onChange={async (e) => {
                    const nextVal = e.target.value;
                    const ok = await updateQuotationStatus(viewing.q.id, nextVal);
                    if (ok) {
                      setViewing(v => v ? { ...v, q: { ...v.q, status: normalizeQuotationStatus(nextVal) } } : null);
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(formatStatus(viewing.q.status))}`}>{formatStatus(viewing.q.status)}</span>
                <button
                  onClick={() => {
                    const target = viewing.q;
                    setViewing(null);
                    openPrint(target);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  <Printer size={13} /> Print / Save PDF
                </button>
                <button onClick={()=>setViewing(null)}><X size={20} /></button>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-slate-500 mb-4">
              <span>Date: {fmtDate(viewing.q.quotation_date)}</span>
              <span>Expires: {fmtDate(viewing.q.expiry_date)}</span>
            </div>
            <table className="w-full text-sm mb-4">
              <thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-center">Disc%</th><th className="px-3 py-2 text-center">VAT%</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {viewing.lines.map((l,i)=>(
                  <tr key={i}><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-center">{l.quantity}</td><td className="px-3 py-2 text-right">{fmtAED(l.unit_price)}</td><td className="px-3 py-2 text-center">{Number(l.discount_percent ?? l.discount_pct ?? 0)}%</td><td className="px-3 py-2 text-center">{l.vat_rate}%</td><td className="px-3 py-2 text-right text-slate-600">{fmtAED(l.vat_amount)}</td><td className="px-3 py-2 text-right font-semibold">{fmtAED(l.line_total)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end"><div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(viewing.q.subtotal)}</span></div>
              <div className="flex justify-between text-slate-600"><span>VAT</span><span>{fmtAED(viewing.q.vat_amount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900"><span>Total (AED)</span><span>{fmtAED(viewing.q.total_amount)}</span></div>
            </div></div>
            {viewing.q.notes && <p className="mt-4 text-xs text-slate-500"><span className="font-semibold">Notes:</span> {viewing.q.notes}</p>}
            {viewing.q.terms && <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Terms:</span> {viewing.q.terms}</p>}
          </div>
        </div>
      )}
      </div>

      {/* A4 Print Modal */}
      <PrintModal isOpen={!!printRec} onClose={() => setPrintRec(null)}>
        {printRec && (
          <QuotationTemplate
            company={company}
            quotation={{
              quotation_number: printRec.q.quotation_number || "QUO",
              quotation_date: printRec.q.quotation_date || "",
              expiry_date: printRec.q.expiry_date,
              customer_name: custMap[printRec.q.customer_id || ""]?.name || "Customer",
              customer_trn: custMap[printRec.q.customer_id || ""]?.trn,
              project_number: printRec.q.project_id ? prjMap[printRec.q.project_id]?.project_number : undefined,
              project_name: printRec.q.project_id ? prjMap[printRec.q.project_id]?.name : undefined,
              payment_terms: "As per agreement",
              terms_conditions: printRec.q.terms,
              notes: printRec.q.notes,
              status: printRec.q.status,
              subtotal: printRec.q.subtotal || 0,
              vat_amount: printRec.q.vat_amount || 0,
              total_amount: printRec.q.total_amount || 0,
              items: printRec.lines.map(l => ({
                description: l.description,
                quantity: l.quantity,
                unit: l.unit,
                unit_price: l.unit_price,
                discount_percent: l.discount_percent,
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
