"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Wallet, X, Save, Loader2, Pencil } from "lucide-react";
import { getCompanyId, fmtAED, fmtDate, todayISO, generateDocNumber } from "@/lib/helpers";
import {
  PaymentType,
  PaymentMethod,
  PAYMENT_METHOD_OPTIONS,
  normalizePaymentType,
  normalizePaymentMethod,
  formatPaymentMethod,
  parseDatabaseError,
} from "@/lib/paymentTypes";

type Customer = { id: string; name: string | null; customer_code: string | null };
type Supplier = { id: string; name: string | null; supplier_code: string | null };
type Payment = { id: string; company_id: string; payment_number: string | null; payment_type: string | null; customer_id: string | null; supplier_id: string | null; payment_date: string | null; amount: number | null; payment_method: string | null; reference_number: string | null; bank_name: string | null; notes: string | null };
type PForm = { payment_type: PaymentType; customer_id: string; supplier_id: string; payment_date: string; amount: string; payment_method: PaymentMethod; reference_number: string; bank_name: string; notes: string };
const empty: PForm = { payment_type: "customer_receipt", customer_id: "", supplier_id: "", payment_date: todayISO(), amount: "0", payment_method: "bank_transfer", reference_number: "", bank_name: "", notes: "" };
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<PForm>(empty);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: pay }, { data: cust }, { data: supp }] = await Promise.all([
      supabase.from("payments").select("*").order("payment_date", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code").eq("active", true).order("name"),
      supabase.from("suppliers").select("id, name, supplier_code").eq("active", true).order("name"),
    ]);
    setPayments((pay || []) as Payment[]);
    setCustomers((cust || []) as Customer[]);
    setSuppliers((supp || []) as Supplier[]);
    setLoading(false);
  }

  const f = (k: keyof PForm, v: string) => setForm(c => ({ ...c, [k]: v }));
  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(empty); setShowForm(true); }
  function openEdit(p: Payment) {
    setError(""); setSuccess(""); setEditing(p);
    setForm({
      payment_type: normalizePaymentType(p.payment_type),
      customer_id: p.customer_id || "",
      supplier_id: p.supplier_id || "",
      payment_date: p.payment_date || todayISO(),
      amount: String(p.amount ?? 0),
      payment_method: normalizePaymentMethod(p.payment_method),
      reference_number: p.reference_number || "",
      bank_name: p.bank_name || "",
      notes: p.notes || ""
    });
    setShowForm(true);
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    const amt = Number(form.amount);
    if (amt <= 0) { setError("Amount must be greater than 0."); return; }
    const normType = normalizePaymentType(form.payment_type);
    if (normType === "customer_receipt" && !form.customer_id) { setError("Please select a customer."); return; }
    if (normType === "supplier_payment" && !form.supplier_id) { setError("Please select a supplier."); return; }
    setSaving(true);
    try {
      const normMethod = normalizePaymentMethod(form.payment_method);
      const payload = {
        payment_type: normType,
        customer_id: normType === "customer_receipt" ? form.customer_id || null : null,
        supplier_id: normType === "supplier_payment" ? form.supplier_id || null : null,
        payment_date: form.payment_date || todayISO(),
        amount: amt,
        payment_method: normMethod,
        reference_number: form.reference_number.trim() || null,
        bank_name: form.bank_name.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString()
      };
      if (editing) {
        const { error: err } = await supabase.from("payments").update(payload).eq("id", editing.id);
        if (err) throw err;
        setSuccess("Payment updated.");
      } else {
        const cid = await getCompanyId();
        const pno = await generateDocNumber(cid, "PAY");
        const { error: err } = await supabase.from("payments").insert({ ...payload, company_id: cid, payment_number: pno });
        if (err) throw err;
        setSuccess("Payment recorded.");
      }
      closeForm(); await loadAll();
    } catch (err: unknown) { setError(parseDatabaseError(err, "Failed to save payment")); }
    finally { setSaving(false); }
  }

  const custMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const suppMap = Object.fromEntries(suppliers.map(s=>[s.id,s]));
  const filtered = payments.filter(p => {
    const normPType = normalizePaymentType(p.payment_type);
    if (filterType && normPType !== filterType) return false;
    const party = normPType === "customer_receipt" ? custMap[p.customer_id||""]?.name : suppMap[p.supplier_id||""]?.name;
    const methodLabel = formatPaymentMethod(p.payment_method);
    return [p.payment_number, party, p.reference_number, p.payment_method, methodLabel].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const totalIn = payments.filter(p => normalizePaymentType(p.payment_type) === "customer_receipt").reduce((s,p) => s + (Number(p.amount) || 0), 0);
  const totalOut = payments.filter(p => normalizePaymentType(p.payment_type) === "supplier_payment").reduce((s,p) => s + (Number(p.amount) || 0), 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Wallet size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Payments</h1><p className="text-sm text-slate-500">Manage customer and supplier payments</p></div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />Record Payment</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500">Total Received (Customers)</p><p className="mt-1 text-xl font-bold text-emerald-600">{fmtAED(totalIn)}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500">Total Paid (Suppliers)</p><p className="mt-1 text-xl font-bold text-red-500">{fmtAED(totalOut)}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500">Net Cash Position</p><p className={`mt-1 text-xl font-bold ${totalIn-totalOut>=0?"text-emerald-600":"text-red-500"}`}>{fmtAED(totalIn-totalOut)}</p></div>
        </div>
        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search payments…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" /></div>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
            <option value="">All Types</option>
            <option value="customer_receipt">Customer (Received)</option>
            <option value="supplier_payment">Supplier (Paid)</option>
          </select>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><Wallet size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No payments found.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">No.</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Party</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Ref.</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => {
                  const normPType = normalizePaymentType(p.payment_type);
                  const party = normPType === "customer_receipt" ? custMap[p.customer_id||""]?.name : suppMap[p.supplier_id||""]?.name;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.payment_number||"—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${normPType==="customer_receipt"?"bg-emerald-50 text-emerald-700":"bg-blue-50 text-blue-700"}`}>
                          {normPType==="customer_receipt"?"Received":"Paid"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{party||"—"}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.payment_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatPaymentMethod(p.payment_method)}</td>
                      <td className="px-4 py-3 text-slate-500">{p.reference_number||"—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(p.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700">Settled</span>
                      </td>
                      <td className="px-4 py-3 text-center"><button onClick={()=>openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Showing {filtered.length} of {payments.length} payments</div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{editing?"Edit Payment":"Record Payment"}</h2>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="pay-form" onSubmit={save} className="p-6 space-y-4">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Type</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                      <input type="radio" value="customer_receipt" checked={form.payment_type==="customer_receipt"} onChange={e=>f("payment_type",e.target.value)} />
                      Customer Receipt (Received)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                      <input type="radio" value="supplier_payment" checked={form.payment_type==="supplier_payment"} onChange={e=>f("payment_type",e.target.value)} />
                      Supplier Payment (Paid)
                    </label>
                  </div>
                </div>
                {form.payment_type === "customer_receipt" && <div><label className="mb-1 block text-sm font-medium text-slate-700">Customer <span className="text-red-500">*</span></label><select value={form.customer_id} onChange={e=>f("customer_id",e.target.value)} className={sel}><option value="">— Select Customer —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code ? `${c.customer_code} - ` : ""}{c.name}</option>)}</select></div>}
                {form.payment_type === "supplier_payment" && <div><label className="mb-1 block text-sm font-medium text-slate-700">Supplier <span className="text-red-500">*</span></label><select value={form.supplier_id} onChange={e=>f("supplier_id",e.target.value)} className={sel}><option value="">— Select Supplier —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_code ? `${s.supplier_code} - ` : ""}{s.name}</option>)}</select></div>}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Date</label><input type="date" value={form.payment_date} onChange={e=>f("payment_date",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Amount (AED) <span className="text-red-500">*</span></label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>f("amount",e.target.value)} required className={inp} /></div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Payment Method</label>
                    <select value={form.payment_method} onChange={e=>f("payment_method",e.target.value)} className={sel}>
                      {PAYMENT_METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Reference No.</label><input type="text" value={form.reference_number} onChange={e=>f("reference_number",e.target.value)} placeholder="Cheque/TT/Ref #" className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Bank Name</label><input type="text" value={form.bank_name} onChange={e=>f("bank_name",e.target.value)} className={inp} /></div>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={2} className={inp} /></div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="pay-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}{saving?"Saving…":editing?"Save Changes":"Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
