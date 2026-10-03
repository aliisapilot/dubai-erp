"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Receipt, Plus, Search, Loader2, X, Printer, Pencil, Trash2 } from "lucide-react";
import { getCompanyId, getCurrentCompany, fmtAED, statusClass, todayISO, generateDocNumber } from "@/lib/helpers";
import ReceiptVoucherTemplate, { ReceiptVoucherData } from "@/components/documents/ReceiptVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { parseDatabaseError } from "@/lib/paymentTypes";

type Customer = { id: string; name: string | null; trn: string | null };
type Invoice = { id: string; invoice_number: string | null; total_amount: number | null };

type RCV = {
  id: string;
  company_id: string;
  voucher_number: string;
  voucher_date: string;
  customer_id: string | null;
  received_from: string;
  amount: number;
  payment_method: string;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  tax_invoice_id: string | null;
  total_due: number | null;
  advance_amount: number | null;
  balance_amount: number | null;
  accountant_name: string | null;
  notes: string | null;
  created_at: string | null;
};

type RCVForm = {
  voucher_number: string;
  voucher_date: string;
  customer_id: string;
  received_from: string;
  amount: string;
  payment_method: string;
  cheque_number: string;
  cheque_date: string;
  bank_name: string;
  tax_invoice_id: string;
  total_due: string;
  advance_amount: string;
  balance_amount: string;
  accountant_name: string;
  notes: string;
};

const emptyForm: RCVForm = {
  voucher_number: "",
  voucher_date: todayISO(),
  customer_id: "",
  received_from: "",
  amount: "0",
  payment_method: "Cash",
  cheque_number: "",
  cheque_date: "",
  bank_name: "",
  tax_invoice_id: "",
  total_due: "0",
  advance_amount: "0",
  balance_amount: "0",
  accountant_name: "Accounts Dept.",
  notes: "",
};

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function ReceiptVouchersPage() {
  const [vouchers, setVouchers] = useState<RCV[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RCV | null>(null);
  const [form, setForm] = useState<RCVForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [printVoucher, setPrintVoucher] = useState<ReceiptVoucherData | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: vchs }, { data: custs }, { data: invs }, co] = await Promise.all([
      supabase.from("receipt_vouchers").select("*").order("voucher_date", { ascending: false }),
      supabase.from("customers").select("id, name, trn").eq("active", true).order("name"),
      supabase.from("tax_invoices").select("id, invoice_number, total_amount").order("invoice_date", { ascending: false }),
      getCurrentCompany(),
    ]);

    setVouchers((vchs || []) as RCV[]);
    setCustomers((custs || []) as Customer[]);
    setInvoices((invs || []) as Invoice[]);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  function openAdd() {
    setError("");
    setSuccess("");
    setEditing(null);
    setForm({ ...emptyForm, voucher_date: todayISO() });
    setShowModal(true);
  }

  function openEdit(v: RCV) {
    setError("");
    setSuccess("");
    setEditing(v);
    setForm({
      voucher_number: v.voucher_number,
      voucher_date: v.voucher_date || todayISO(),
      customer_id: v.customer_id || "",
      received_from: v.received_from || "",
      amount: String(v.amount ?? 0),
      payment_method: v.payment_method || "Cash",
      cheque_number: v.cheque_number || "",
      cheque_date: v.cheque_date || "",
      bank_name: v.bank_name || "",
      tax_invoice_id: v.tax_invoice_id || "",
      total_due: String(v.total_due ?? 0),
      advance_amount: String(v.advance_amount ?? 0),
      balance_amount: String(v.balance_amount ?? 0),
      accountant_name: v.accountant_name || "Accounts Dept.",
      notes: v.notes || "",
    });
    setShowModal(true);
  }

  function onCustomerSelect(cid: string) {
    const c = customers.find(item => item.id === cid);
    setForm(f => ({
      ...f,
      customer_id: cid,
      received_from: c?.name || f.received_from,
    }));
  }

  async function saveVoucher(e: FormEvent) {
    e.preventDefault();
    if (!form.received_from.trim() || Number(form.amount) <= 0) {
      setError("Please provide a valid payer name and amount greater than 0.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload: Record<string, unknown> = {
        voucher_date: form.voucher_date || todayISO(),
        customer_id: form.customer_id || null,
        received_from: form.received_from.trim(),
        amount: Number(form.amount) || 0,
        payment_method: form.payment_method,
        cheque_number: form.cheque_number.trim() || null,
        cheque_date: form.cheque_date || null,
        bank_name: form.bank_name.trim() || null,
        tax_invoice_id: form.tax_invoice_id || null,
        total_due: Number(form.total_due) || 0,
        advance_amount: Number(form.advance_amount) || 0,
        balance_amount: Number(form.balance_amount) || 0,
        accountant_name: form.accountant_name.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        // Preserve existing voucher number — editing never changes or regenerates numbers
        const { error: err } = await supabase.from("receipt_vouchers").update(payload).eq("id", editing.id);
        if (err) throw err;
        setSuccess("Receipt voucher updated successfully.");
      } else {
        const cid = await getCompanyId();
        // Automatic sequential numbering via centralized generateDocNumber -> next_doc_number RPC
        const vno = await generateDocNumber(cid, "RCV");
        const { error: err } = await supabase.from("receipt_vouchers").insert({
          ...payload,
          company_id: cid,
          voucher_number: vno,
        });
        if (err) throw err;
        setSuccess("Receipt voucher issued successfully.");
      }

      setShowModal(false);
      setEditing(null);
      await loadData();
    } catch (err: unknown) {
      setError(parseDatabaseError(err, "Failed to save receipt voucher"));
    } finally {
      setSaving(false);
    }
  }

  function handlePrint(v: RCV) {
    const cust = customers.find(c => c.id === v.customer_id);
    const inv = invoices.find(i => i.id === v.tax_invoice_id);
    const vData: ReceiptVoucherData = {
      voucher_number: v.voucher_number,
      voucher_date: v.voucher_date,
      received_from: v.received_from,
      customer_trn: cust?.trn,
      amount: Number(v.amount) || 0,
      payment_method: v.payment_method,
      cheque_number: v.cheque_number,
      cheque_date: v.cheque_date,
      bank_name: v.bank_name,
      reference_invoice: inv?.invoice_number,
      total_due: v.total_due ? Number(v.total_due) : undefined,
      advance_amount: v.advance_amount ? Number(v.advance_amount) : undefined,
      balance_amount: v.balance_amount ? Number(v.balance_amount) : undefined,
      accountant_name: v.accountant_name,
      notes: v.notes,
    };
    setPrintVoucher(vData);
  }

  async function deleteReceiptVoucher(v: RCV) {
    if (!window.confirm(`Are you sure you want to delete receipt voucher ${v.voucher_number}? This action cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      const { error: delErr } = await supabase.from("receipt_vouchers").delete().eq("id", v.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete receipt voucher ${v.voucher_number} because it is referenced in payments or financial entries.`);
        }
        throw delErr;
      }
      setSuccess(`Receipt voucher ${v.voucher_number} deleted successfully.`);
      await loadData();
    } catch (err: unknown) {
      setError(parseDatabaseError(err, "Failed to delete receipt voucher"));
    }
  }

  const filtered = vouchers.filter(v =>
    [v.voucher_number, v.received_from, v.payment_method, v.cheque_number]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <Receipt size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Receipt Vouchers</h1>
              <p className="text-sm text-slate-500">Official cash, cheque, and bank transfer receipt vouchers (RCV)</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            <Plus size={18} /> New Receipt Voucher
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showModal && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-6 flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vouchers by number, received from, cheque ref…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center text-slate-500">
            <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
            <p>No receipt vouchers recorded. Issue a new receipt voucher above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Voucher #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Received From</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Cheque / Ref</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">{v.voucher_number}</td>
                    <td className="px-4 py-3 text-slate-600">{v.voucher_date}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{v.received_from}</td>
                    <td className="px-4 py-3 text-slate-600">{v.payment_method}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{v.cheque_number || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 text-sm">
                      {fmtAED(v.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass("Posted")}`}>
                        Posted
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center items-center gap-1">
                        <button
                          onClick={() => handlePrint(v)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Print Voucher"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(v)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Edit Voucher"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteReceiptVoucher(v)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Delete Voucher"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Receipt Voucher" : "Issue Receipt Voucher"}</h2>
                {editing && (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {editing.voucher_number}
                  </span>
                )}
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <form onSubmit={saveVoucher} className="p-6 space-y-3 max-h-[80vh] overflow-y-auto text-xs">
              {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Voucher Ref #</label>
                  <input
                    type="text"
                    value={form.voucher_number}
                    readOnly
                    placeholder={editing ? editing.voucher_number : "Auto-generated on save (RCV-…)"}
                    className={inp + " bg-slate-50 text-slate-500 cursor-not-allowed"}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Receipt Date</label>
                  <input type="date" value={form.voucher_date} onChange={e => setForm({ ...form, voucher_date: e.target.value })} required className={inp} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Customer (Optional Link)</label>
                  <select value={form.customer_id} onChange={e => onCustomerSelect(e.target.value)} className={sel}>
                    <option value="">— Select Customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Received From (Payer) <span className="text-red-500">*</span></label>
                  <input type="text" value={form.received_from} onChange={e => setForm({ ...form, received_from: e.target.value })} placeholder="Full payer name" required className={inp} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Amount Received (AED) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className={inp} />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className={sel}>
                    <option>Cash</option>
                    <option>Cheque</option>
                    <option>Bank Transfer</option>
                    <option>Credit Card</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Invoice Link</label>
                  <select value={form.tax_invoice_id} onChange={e => setForm({ ...form, tax_invoice_id: e.target.value })} className={sel}>
                    <option value="">— Select Invoice —</option>
                    {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}
                  </select>
                </div>
              </div>

              {form.payment_method === "Cheque" && (
                <div className="grid grid-cols-3 gap-3 rounded bg-slate-50 p-3 border border-slate-200">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Cheque Number</label>
                    <input type="text" value={form.cheque_number} onChange={e => setForm({ ...form, cheque_number: e.target.value })} placeholder="000123" className={inp} />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Cheque Date</label>
                    <input type="date" value={form.cheque_date} onChange={e => setForm({ ...form, cheque_date: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Bank Name</label>
                    <input type="text" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. ADCB" className={inp} />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Particulars / Payment Description</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Being payment for..." className={inp} />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "Saving…" : editing ? "Save Changes" : "Issue Receipt Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* Print Modal */}
      <PrintModal isOpen={!!printVoucher} onClose={() => setPrintVoucher(null)}>
        {printVoucher && (
          <ReceiptVoucherTemplate
            company={company}
            voucher={printVoucher}
            onClose={() => setPrintVoucher(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}
