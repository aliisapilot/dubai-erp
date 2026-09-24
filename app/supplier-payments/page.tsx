"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Search, Wallet, X, Save, Loader2, CheckCircle,
  Truck, ArrowUpRight, DollarSign, Calendar, FileText
} from "lucide-react";
import { getCompanyId, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber } from "@/lib/helpers";

type Supplier = { id: string; name: string | null; trn: string | null };
type SupplierBill = { id: string; bill_number: string; total_amount: number; paid_amount: number; status: string };

type SupplierPayment = {
  id: string;
  company_id: string;
  payment_number: string | null;
  supplier_id: string | null;
  payment_date: string | null;
  amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  bank_name: string | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
};

type PaymentForm = {
  supplier_id: string;
  bill_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference_number: string;
  bank_name: string;
  notes: string;
};

const emptyForm: PaymentForm = {
  supplier_id: "",
  bill_id: "",
  payment_date: todayISO(),
  amount: "0",
  payment_method: "Bank Transfer",
  reference_number: "",
  bank_name: "",
  notes: "",
};

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function SupplierPaymentsPage() {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [filteredBills, setFilteredBills] = useState<SupplierBill[]>([]);

  const [form, setForm] = useState<PaymentForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: payData }, { data: supData }, { data: billData }] = await Promise.all([
        supabase.from("payments").select("*").eq("payment_type", "supplier").order("payment_date", { ascending: false }),
        supabase.from("suppliers").select("id, name, trn").eq("active", true).order("name"),
        supabase.from("supplier_bills").select("id, bill_number, total_amount, paid_amount, status, supplier_id"),
      ]);
      setPayments((payData || []) as SupplierPayment[]);
      setSuppliers((supData || []) as Supplier[]);
      setBills((billData || []) as (SupplierBill & { supplier_id: string })[]);
    } catch (err) {
      console.error("Load supplier payments error:", err);
    } finally {
      setLoading(false);
    }
  }

  function onSupplierChange(supId: string) {
    setForm(f => ({ ...f, supplier_id: supId, bill_id: "", amount: "0" }));
    const supBills = (bills as (SupplierBill & { supplier_id: string })[]).filter(b => b.supplier_id === supId && b.status !== "Paid");
    setFilteredBills(supBills);
  }

  function onBillChange(billId: string) {
    const selectedBill = bills.find(b => b.id === billId);
    if (selectedBill) {
      const remaining = Math.max(0, Number(selectedBill.total_amount) - Number(selectedBill.paid_amount));
      setForm(f => ({ ...f, bill_id: billId, amount: remaining > 0 ? String(remaining) : "0" }));
    } else {
      setForm(f => ({ ...f, bill_id: billId }));
    }
  }

  async function savePayment(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const amt = Number(form.amount);
    if (!form.supplier_id) {
      setError("Please select a supplier.");
      return;
    }
    if (amt <= 0) {
      setError("Payment amount must be greater than 0.");
      return;
    }

    // Overpayment prevention
    if (form.bill_id) {
      const bill = bills.find(b => b.id === form.bill_id);
      if (bill) {
        const remaining = Number(bill.total_amount) - Number(bill.paid_amount);
        if (amt > remaining + 0.01) {
          setError(`Payment amount (AED ${amt.toFixed(2)}) exceeds remaining balance on bill ${bill.bill_number} (AED ${remaining.toFixed(2)}). Accidental overpayment blocked.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const cid = await getCompanyId();
      const pno = await generateDocNumber(cid, "SPAY");

      // Record in payments table
      const { error: pErr } = await supabase.from("payments").insert({
        company_id: cid,
        payment_number: pno,
        payment_type: "supplier",
        supplier_id: form.supplier_id,
        payment_date: form.payment_date || todayISO(),
        amount: amt,
        payment_method: form.payment_method,
        reference_number: form.reference_number.trim() || null,
        bank_name: form.bank_name.trim() || null,
        notes: form.notes.trim() || (form.bill_id ? `Settlement for Bill ${bills.find(b => b.id === form.bill_id)?.bill_number}` : null),
      });
      if (pErr) throw pErr;

      // Update bill paid amount if bill is linked
      if (form.bill_id) {
        const bill = bills.find(b => b.id === form.bill_id);
        if (bill) {
          const newPaid = Number(bill.paid_amount) + amt;
          const newStatus = newPaid >= Number(bill.total_amount) - 0.01 ? "Paid" : "Partially Paid";
          const { error: billUpdateErr } = await supabase.from("supplier_bills").update({
            paid_amount: newPaid,
            status: newStatus,
            updated_at: new Date().toISOString(),
          }).eq("id", form.bill_id);
          if (billUpdateErr) throw billUpdateErr;
        }
      }

      setSuccess("Supplier payment recorded successfully.");
      setShowModal(false);
      setForm(emptyForm);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving payment");
    } finally {
      setSaving(false);
    }
  }

  const supMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

  const filtered = payments.filter(p => {
    const sName = supMap[p.supplier_id || ""] || "";
    return [p.payment_number, sName, p.reference_number, p.payment_method]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <Wallet size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Supplier Payments</h1>
              <p className="text-sm text-slate-500">Vendor disbursements, cheque releases &amp; bank settlement records</p>
            </div>
          </div>
          <button
            onClick={() => { setError(""); setSuccess(""); setShowModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition shadow"
          >
            <Plus size={16} /> Make Supplier Payment
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* KPI Banner */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Supplier Disbursements Recorded</span>
            <div className="mt-1 text-3xl font-black text-slate-900">{fmtAED(totalPaid)}</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
            <ArrowUpRight size={28} />
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by payment #, vendor, reference..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {filtered.length} payments
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No supplier payments recorded yet. Click &quot;Make Supplier Payment&quot; to issue disbursements.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3">Voucher #</th>
                  <th className="px-4 py-3">Vendor / Payee</th>
                  <th className="px-4 py-3">Payment Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference / Cheque</th>
                  <th className="px-4 py-3 text-right">Amount Paid</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map(p => {
                  const sName = supMap[p.supplier_id || ""] || "Supplier";
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold font-mono text-slate-900">{p.payment_number || "SPAY"}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{sName}</td>
                      <td className="px-4 py-3.5 text-slate-600">{fmtDate(p.payment_date)}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-700">{p.payment_method || "Bank Transfer"}</td>
                      <td className="px-4 py-3.5 text-slate-600 font-mono">{p.reference_number || "—"}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">{fmtAED(p.amount)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(p.status || "Completed")}`}>
                          {p.status || "Completed"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate">{p.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-bold text-slate-900">Record Supplier Payment</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <form onSubmit={savePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Select Supplier *</label>
                <select
                  value={form.supplier_id}
                  onChange={e => onSupplierChange(e.target.value)}
                  className={sel}
                  required
                >
                  <option value="">Select Vendor</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.trn ? `(TRN: ${s.trn})` : ""}</option>
                  ))}
                </select>
              </div>

              {form.supplier_id && filteredBills.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Apply to Supplier Bill (Optional)</label>
                  <select
                    value={form.bill_id}
                    onChange={e => onBillChange(e.target.value)}
                    className={sel}
                  >
                    <option value="">General Supplier Account Advance / Credit</option>
                    {filteredBills.map(b => {
                      const bal = Number(b.total_amount) - Number(b.paid_amount);
                      return (
                        <option key={b.id} value={b.id}>
                          {b.bill_number} — Total: {fmtAED(b.total_amount)} (Bal Due: {fmtAED(bal)})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={form.payment_date}
                    onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                    className={inp}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Amount Paid (AED) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className={inp + " font-mono font-bold text-slate-900"}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                    className={sel}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Reference / Cheque #</label>
                  <input
                    type="text"
                    placeholder="Chq / Transfer ref #"
                    value={form.reference_number}
                    onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))}
                    className={inp}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Bank Name / Paid From</label>
                <input
                  type="text"
                  placeholder="e.g. Emirates NBD, ADCB, Petty Cash"
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className={inp}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Payment remarks or invoice details"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={inp}
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? "Saving..." : "Disburse Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
