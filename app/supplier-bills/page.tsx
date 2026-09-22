"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Search, FileText, X, Save, Loader2, Printer, CheckCircle,
  Clock, DollarSign, Building2, ShoppingBag, Eye, ExternalLink, Pencil, Trash2
} from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem } from "@/lib/helpers";
import SupplierBillTemplate, { SupplierBillData, SupplierBillLineItem } from "@/components/documents/SupplierBillTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Supplier = { id: string; name: string | null; trn: string | null; address: string | null };
type PO = { id: string; purchase_order_number?: string | null; total_amount: number | null };
type Project = { id: string; name: string | null; project_number: string | null };

type BillItem = {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  sort_order: number;
};

type Bill = {
  id: string;
  company_id: string;
  bill_number: string;
  supplier_id: string;
  purchase_order_id?: string | null; // DB column is purchase_order_id (not po_id)
  project_id?: string | null;
  bill_date: string;
  due_date?: string | null;
  supplier_invoice_ref?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  notes?: string | null;
  created_at: string;
};

type BillForm = {
  supplier_id: string;
  purchase_order_id: string; // DB column is purchase_order_id
  project_id: string;
  bill_date: string;
  due_date: string;
  supplier_invoice_ref: string;
  status: string;
  notes: string;
};

const emptyForm: BillForm = {
  supplier_id: "",
  purchase_order_id: "",
  project_id: "",
  bill_date: todayISO(),
  due_date: "",
  supplier_invoice_ref: "",
  status: "Pending",
  notes: "",
};

const emptyLine = (): BillItem => ({
  description: "",
  quantity: 1,
  unit: "Nos",
  unit_price: 0,
  vat_rate: 5,
  vat_amount: 0,
  line_total: 0,
  sort_order: 0,
});

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function SupplierBillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);

  const [form, setForm] = useState<BillForm>(emptyForm);
  const [lines, setLines] = useState<BillItem[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [printBill, setPrintBill] = useState<SupplierBillData | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: bList }, { data: supList }, { data: poList }, { data: prjList }, co] = await Promise.all([
        supabase.from("supplier_bills").select("*").order("bill_date", { ascending: false }),
        supabase.from("suppliers").select("id, name, trn, address").eq("active", true).order("name"),
        supabase.from("purchase_orders").select("id, purchase_order_number, total_amount").order("order_date", { ascending: false }),
        supabase.from("projects").select("id, name, project_number").order("created_at", { ascending: false }),
        getCurrentCompany(),
      ]);
      setBills((bList || []) as Bill[]);
      setSuppliers((supList || []) as Supplier[]);
      setPos((poList || []) as PO[]);
      setProjects((prjList || []) as Project[]);
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totals = useCallback(() => {
    const sub = lines.reduce((acc, l) => acc + (l.quantity * l.unit_price), 0);
    const vat = lines.reduce((acc, l) => acc + l.vat_amount, 0);
    return { sub, vat, total: sub + vat, subtotal: sub, vat_amount: vat, total_amount: sub + vat };
  }, [lines]);

  function updateLine(idx: number, u: Partial<BillItem>) {
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...u };
      const { vatAmount, lineTotal } = calcLineItem(updated.quantity, updated.unit_price, 0, updated.vat_rate);
      return { ...updated, vat_amount: vatAmount, line_total: lineTotal };
    }));
  }

  function addLine() {
    setLines(ls => [...ls, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return;
    setLines(ls => ls.filter((_, i) => i !== idx));
  }

  function openAdd() {
    setError("");
    setSuccess("");
    setEditing(null);
    setForm(emptyForm);
    setLines([emptyLine()]);
    setShowModal(true);
  }

  async function openEdit(b: Bill) {
    setError("");
    setSuccess("");
    setEditing(b);
    setForm({
      supplier_id: b.supplier_id,
      purchase_order_id: b.purchase_order_id || "",
      project_id: b.project_id || "",
      bill_date: b.bill_date,
      due_date: b.due_date || "",
      supplier_invoice_ref: b.supplier_invoice_ref || "",
      status: b.status || "Pending",
      notes: b.notes || "",
    });
    const { data: items } = await supabase.from("supplier_bill_items").select("*").eq("bill_id", b.id).order("sort_order");
    setLines((items || []).length > 0 ? (items as BillItem[]) : [emptyLine()]);
    setShowModal(true);
  }

  async function handlePrint(b: Bill) {
    const { data: items } = await supabase.from("supplier_bill_items").select("*").eq("bill_id", b.id).order("sort_order");
    const sup = suppliers.find(s => s.id === b.supplier_id);
    const prj = projects.find(p => p.id === b.project_id);
    const po = pos.find(p => p.id === b.purchase_order_id);

    setPrintBill({
      bill_number: b.bill_number,
      bill_date: b.bill_date,
      due_date: b.due_date,
      supplier_name: sup?.name || "Supplier",
      supplier_trn: sup?.trn,
      supplier_address: sup?.address,
      supplier_invoice_ref: b.supplier_invoice_ref,
      po_number: po?.purchase_order_number || po?.id.slice(0, 8).toUpperCase(),
      project_name: prj?.name,
      project_number: prj?.project_number,
      notes: b.notes,
      status: b.status,
      subtotal: b.subtotal,
      vat_amount: b.vat_amount,
      total_amount: b.total_amount,
      paid_amount: b.paid_amount,
      items: (items || []).map((it: BillItem) => ({
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        vat_amount: it.vat_amount,
        line_total: it.line_total,
      })),
    });
  }

  async function saveBill(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.supplier_id) {
      setError("Please select a vendor / supplier.");
      return;
    }
    if (lines.some(l => !l.description.trim())) {
      setError("Every line must include an item description.");
      return;
    }

    setSaving(true);
    try {
      const { subtotal, vat_amount, total_amount } = totals();
      let billId: string;

      if (editing) {
        const { error: err } = await supabase.from("supplier_bills").update({
          supplier_id: form.supplier_id,
          purchase_order_id: form.purchase_order_id || null,
          po_id: form.purchase_order_id || null,
          project_id: form.project_id || null,
          bill_date: form.bill_date || todayISO(),
          due_date: form.due_date || null,
          supplier_invoice_ref: form.supplier_invoice_ref.trim() || null,
          subtotal,
          vat_amount,
          total_amount,
          status: form.status,
          notes: form.notes.trim() || null,
          updated_at: new Date().toISOString(),
        }).eq("id", editing.id);
        if (err) throw err;
        billId = editing.id;
        await supabase.from("supplier_bill_items").delete().eq("bill_id", billId);
      } else {
        const cid = await getCompanyId();
        const bno = await generateDocNumber(cid, "BILL");
        const { data: ins, error: err } = await supabase.from("supplier_bills").insert({
          company_id: cid,
          bill_number: bno,
          supplier_id: form.supplier_id,
          purchase_order_id: form.purchase_order_id || null,
          po_id: form.purchase_order_id || null,
          project_id: form.project_id || null,
          bill_date: form.bill_date || todayISO(),
          due_date: form.due_date || null,
          supplier_invoice_ref: form.supplier_invoice_ref.trim() || null,
          subtotal,
          vat_amount,
          total_amount,
          paid_amount: 0,
          status: form.status,
          notes: form.notes.trim() || null,
        }).select("id").single();
        if (err) throw err;
        billId = ins.id;
      }

      const itemRows = lines.map((l, i) => ({
        bill_id: billId,
        description: l.description.trim(),
        quantity: l.quantity,
        unit: l.unit || "Nos",
        unit_price: l.unit_price,
        vat_rate: l.vat_rate,
        vat_amount: l.vat_amount,
        line_total: l.line_total,
        sort_order: i,
      }));
      const { error: itemsErr } = await supabase.from("supplier_bill_items").insert(itemRows);
      if (itemsErr) throw itemsErr;

      setSuccess("Supplier bill saved successfully.");
      setShowModal(false);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving bill");
    } finally {
      setSaving(false);
    }
  }

  const supMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));
  const prjMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  const filtered = bills.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false;
    const sName = supMap[b.supplier_id] || "";
    return [b.bill_number, sName, b.supplier_invoice_ref]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const totalBilled = bills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const totalPaid = bills.reduce((s, b) => s + (Number(b.paid_amount) || 0), 0);
  const totalOutstanding = Math.max(0, totalBilled - totalPaid);

  async function deleteBill(b: Bill) {
    if (!window.confirm(`Are you sure you want to delete bill ${b.bill_number}? This cannot be undone.`)) return;
    setError("");
    try {
      await supabase.from("supplier_bill_items").delete().eq("bill_id", b.id);
      const { error: delErr } = await supabase.from("supplier_bills").delete().eq("id", b.id);
      if (delErr) throw new Error(delErr.message);
      setSuccess(`Supplier bill ${b.bill_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete supplier bill.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-900 p-2.5 text-white">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Supplier Bills</h1>
              <p className="text-sm text-slate-500">Accounts payable, procurement invoices &amp; vendor bills</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition shadow"
          >
            <Plus size={16} /> New Supplier Bill
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Invoiced (Bills)</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">{fmtAED(totalBilled)}</span>
              <span className="text-xs text-slate-400 font-mono">{bills.length} bills</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Disbursed / Paid</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-emerald-600">{fmtAED(totalPaid)}</span>
              <CheckCircle size={18} className="text-emerald-500" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding Payable</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-amber-600">{fmtAED(totalOutstanding)}</span>
              <Clock size={18} className="text-amber-500" />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by bill number, vendor, invoice ref..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>

        {/* Bills Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No supplier bills found. Click &quot;New Supplier Bill&quot; to record vendor payables.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3">Bill Number</th>
                  <th className="px-4 py-3">Vendor / Supplier</th>
                  <th className="px-4 py-3">Bill Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map(b => {
                  const sName = supMap[b.supplier_id] || "—";
                  const paid = Number(b.paid_amount) || 0;
                  const bal = Math.max(0, b.total_amount - paid);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold font-mono text-slate-900">
                        {b.bill_number}
                        {b.supplier_invoice_ref && (
                          <div className="text-[10px] text-slate-400 font-normal">Ref: {b.supplier_invoice_ref}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{sName}</td>
                      <td className="px-4 py-3.5 text-slate-600">{fmtDate(b.bill_date)}</td>
                      <td className="px-4 py-3.5 text-slate-600">{fmtDate(b.due_date)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">{fmtAED(b.total_amount)}</td>
                      <td className="px-4 py-3.5 text-right font-mono text-emerald-600">{fmtAED(paid)}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold text-amber-700">{fmtAED(bal)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusClass(b.status)}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handlePrint(b)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Print / PDF"
                        >
                          <Printer size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(b)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Edit Bill"
                        >
                          <Pencil size={15} />
                        </button>
                        {paid === 0 && (
                          <button
                            onClick={() => deleteBill(b)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete Unpaid Bill"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Bill Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {editing ? "Edit Supplier Bill" : "New Supplier Bill"}
                </h2>
                {!editing ? (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium border border-blue-200">
                    Bill #: Auto-generated on save
                  </span>
                ) : (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-medium border border-slate-200">
                    Bill #: {editing.bill_number} (Read-only)
                  </span>
                )}
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <form onSubmit={saveBill} className="p-6 space-y-5">
              {/* Header Fields */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Vendor / Supplier *</label>
                  <select
                    value={form.supplier_id}
                    onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                    className={sel}
                    required
                  >
                    <option value="">Select Vendor</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.trn ? `(TRN: ${s.trn})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={form.bill_date}
                    onChange={e => setForm(f => ({ ...f, bill_date: e.target.value }))}
                    className={inp}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Payment Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className={inp}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Vendor Invoice / Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-98741"
                    value={form.supplier_invoice_ref}
                    onChange={e => setForm(f => ({ ...f, supplier_invoice_ref: e.target.value }))}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Purchase Order Ref</label>
                  <select
                    value={form.purchase_order_id}
                    onChange={e => setForm(f => ({ ...f, purchase_order_id: e.target.value }))}
                    className={sel}
                  >
                  <option value="">None / Direct Bill</option>
                    {pos.map(p => (
                      <option key={p.id} value={p.id}>{p.purchase_order_number || p.id.slice(0, 8).toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Link to Project</label>
                  <select
                    value={form.project_id}
                    onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                    className={sel}
                  >
                    <option value="">None / General Overhead</option>
                    {projects.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.project_number} — {pr.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line items table */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Bill Line Items</span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    <Plus size={14} /> Add Line
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-2">Description</th>
                        <th className="p-2 w-16 text-center">Qty</th>
                        <th className="p-2 w-16 text-center">Unit</th>
                        <th className="p-2 w-24 text-right">Unit Price</th>
                        <th className="p-2 w-20 text-center">VAT %</th>
                        <th className="p-2 w-24 text-right">Total (AED)</th>
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Item description or service"
                              value={l.description}
                              onChange={e => updateLine(i, { description: e.target.value })}
                              className={inp}
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={l.quantity}
                              onChange={e => updateLine(i, { quantity: Number(e.target.value) })}
                              className={inp + " text-center"}
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.unit}
                              onChange={e => updateLine(i, { unit: e.target.value })}
                              className={inp + " text-center"}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.unit_price}
                              onChange={e => updateLine(i, { unit_price: Number(e.target.value) })}
                              className={inp + " text-right font-mono"}
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={l.vat_rate}
                              onChange={e => updateLine(i, { vat_rate: Number(e.target.value) })}
                              className={inp + " text-center font-mono"}
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-800">
                            {l.line_total.toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              disabled={lines.length === 1}
                              className="text-slate-400 hover:text-red-500 disabled:opacity-30"
                            >
                              <X size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end pt-2">
                <div className="w-72 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold">{fmtAED(totals().subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>VAT (5%):</span>
                    <span className="font-mono font-semibold text-amber-700">{fmtAED(totals().vat_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900 text-sm">
                    <span>Total Bill:</span>
                    <span className="font-mono text-indigo-900">{fmtAED(totals().total_amount)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">Notes &amp; Payment Details</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Terms, bank account for payment or supplier remarks..."
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
                  {saving ? "Saving..." : editing ? "Update Bill" : "Record Supplier Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* Print / PDF Modal */}
      <PrintModal isOpen={!!printBill} onClose={() => setPrintBill(null)}>
        {printBill && (
          <SupplierBillTemplate
            company={company}
            bill={printBill}
            onClose={() => setPrintBill(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}
