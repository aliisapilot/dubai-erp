"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber, todayISO } from "@/lib/helpers";
import {
  CreditCard, Search, Plus, Loader2, X, Trash2,
  Edit2, Receipt, CheckCircle2,
  Briefcase, Truck, User
} from "lucide-react";

type Expense = {
  id: string;
  expense_number: string;
  expense_date: string;
  category: string;
  amount: number;
  vat_amount: number;
  total_amount: number;
  payment_method: "Cash" | "Bank Transfer" | "Cheque" | "Credit Card" | "Petty Cash";
  project_id: string | null;
  supplier_id: string | null;
  employee_id: string | null;
  receipt_reference: string | null;
  description: string;
  status: "Pending" | "Approved" | "Paid" | "Rejected";
  created_at: string;
  projects?: { name: string; project_number: string };
  suppliers?: { name: string };
  employees?: { first_name: string };
};

type OptionItem = { id: string; name: string };

const DEFAULT_CATEGORIES = [
  "Office Rent & Premise",
  "DEWA, Empower & Utilities",
  "Trade License & Dubai Municipality Fees",
  "Visa & Labour PRO Expenses",
  "Fuel, Transport & Salik",
  "Site Consumables & Minor Tools",
  "Software, Telecom & IT",
  "Marketing & Client Entertainment",
  "General & Administrative",
  "Other Direct Operating Expense"
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<OptionItem[]>([]);
  const [suppliers, setSuppliers] = useState<OptionItem[]>([]);
  const [employees, setEmployees] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formNumber, setFormNumber] = useState("");
  const [formDate, setFormDate] = useState(todayISO());
  const [formCategory, setFormCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [applyVat, setApplyVat] = useState(true);
  const [formVatAmount, setFormVatAmount] = useState("0");
  const [formTotalAmount, setFormTotalAmount] = useState("0");
  const [formPaymentMethod, setFormPaymentMethod] = useState<"Cash" | "Bank Transfer" | "Cheque" | "Credit Card" | "Petty Cash">("Bank Transfer");
  const [formProjectId, setFormProjectId] = useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formReceiptRef, setFormReceiptRef] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<"Pending" | "Approved" | "Paid" | "Rejected">("Paid");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [expRes, prjRes, supRes, empRes] = await Promise.all([
        supabase
          .from("expenses")
          .select("*, projects(name, project_number), suppliers(name), employees(first_name)")
          .eq("company_id", companyId)
          .order("expense_date", { ascending: false }),
        supabase.from("projects").select("id, name").eq("company_id", companyId).order("name"),
        supabase.from("suppliers").select("id, name").eq("company_id", companyId).order("name"),
        supabase.from("employees").select("id, first_name").eq("company_id", companyId).order("first_name")
      ]);

      setExpenses((expRes.data as unknown as Expense[]) || []);
      setProjects(prjRes.data || []);
      setSuppliers(supRes.data || []);
      setEmployees((empRes.data || []).map(emp => ({ id: emp.id, name: emp.first_name || "Unnamed employee" })));
    } catch (err) {
      console.error("Error loading expenses:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingId(null);
    setFormNumber("");
    setFormDate(todayISO());
    setFormCategory(DEFAULT_CATEGORIES[0]);
    setCustomCategory("");
    setFormAmount("");
    setApplyVat(true);
    setFormVatAmount("0");
    setFormTotalAmount("0");
    setFormPaymentMethod("Bank Transfer");
    setFormProjectId("");
    setFormSupplierId("");
    setFormEmployeeId("");
    setFormReceiptRef("");
    setFormDescription("");
    setFormStatus("Paid");
    setErrorMsg("");
    setShowModal(true);
  }

  function handleEdit(e: Expense) {
    setEditingId(e.id);
    setFormNumber(e.expense_number);
    setFormDate(e.expense_date);
    if (DEFAULT_CATEGORIES.includes(e.category)) {
      setFormCategory(e.category);
      setCustomCategory("");
    } else {
      setFormCategory("Other / Custom");
      setCustomCategory(e.category);
    }
    setFormAmount(e.amount.toString());
    setApplyVat(e.vat_amount > 0);
    setFormVatAmount(e.vat_amount.toString());
    setFormTotalAmount(e.total_amount.toString());
    setFormPaymentMethod(e.payment_method);
    setFormProjectId(e.project_id || "");
    setFormSupplierId(e.supplier_id || "");
    setFormEmployeeId(e.employee_id || "");
    setFormReceiptRef(e.receipt_reference || "");
    setFormDescription(e.description);
    setFormStatus(e.status);
    setErrorMsg("");
    setShowModal(true);
  }

  function handleAmountChange(netStr: string, vatActive: boolean) {
    setFormAmount(netStr);
    const net = parseFloat(netStr) || 0;
    const vat = vatActive ? net * 0.05 : 0;
    setFormVatAmount(vat.toFixed(2));
    setFormTotalAmount((net + vat).toFixed(2));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const net = parseFloat(formAmount);
    if (isNaN(net) || net <= 0) {
      setErrorMsg("Please enter a valid expense amount.");
      return;
    }
    if (!formDescription.trim()) {
      setErrorMsg("Please enter an expense description.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const category = formCategory === "Other / Custom" && customCategory.trim()
        ? customCategory.trim()
        : formCategory;

      const vat = applyVat ? parseFloat(formVatAmount) || 0 : 0;
      const total = net + vat;

      const expNum = editingId ? formNumber.trim() : await generateDocNumber(companyId, "EXP");

      const payload = {
        company_id: companyId,
        expense_number: expNum,
        expense_date: formDate,
        category,
        amount: net,
        vat_amount: vat,
        total_amount: total,
        payment_method: formPaymentMethod,
        project_id: formProjectId || null,
        supplier_id: formSupplierId || null,
        employee_id: formEmployeeId || null,
        receipt_reference: formReceiptRef.trim() || null,
        description: formDescription.trim(),
        status: formStatus,
      };

      if (editingId) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editingId);
        if (error) throw error;
        setSuccessMsg("Expense updated successfully.");
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
        setSuccessMsg("Expense registered successfully.");
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record expense.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Expense record deleted.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete expense.";
      alert(msg);
    }
  }

  const filtered = expenses.filter(e => {
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const q = search.toLowerCase();
    const matchSearch =
      e.expense_number.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.receipt_reference || "").toLowerCase().includes(q) ||
      (e.projects?.name || "").toLowerCase().includes(q) ||
      (e.suppliers?.name || "").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const totalExpense = filtered.reduce((acc, e) => acc + (e.total_amount || 0), 0);
  const totalVat = filtered.reduce((acc, e) => acc + (e.vat_amount || 0), 0);
  const projectLinked = filtered.filter(e => e.project_id).reduce((acc, e) => acc + (e.total_amount || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <CreditCard size={20} />
            </span>
            Expenses &amp; Operating Costs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Track company overheads, project direct costs, recoverable 5% input VAT, and bills</p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/petty-cash"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <Receipt size={16} /> Petty Cash
          </Link>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
          >
            <Plus size={16} /> Record Expense
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {successMsg}
          </div>
          <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Expenses</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalExpense.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">{filtered.length} expense entries</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Input VAT (5% Recoverable)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
            AED {totalVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600 mt-1">Deductible in FTA VAT return</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Project-Allocated Expenses</p>
          <p className="text-2xl font-bold text-blue-700 mt-2 font-mono">
            AED {projectLinked.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-blue-600 mt-1">Direct job costing impact</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search expense #, description, ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Expense Categories</option>
            {DEFAULT_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Expense #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Payment Method</th>
                <th className="px-4 py-3">Linked Entity</th>
                <th className="px-4 py-3 text-right">Net (AED)</th>
                <th className="px-4 py-3 text-right">VAT (AED)</th>
                <th className="px-4 py-3 text-right">Total (AED)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    Loading expenses...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    No expense records found. Click &quot;Record Expense&quot; to log overheads and project disbursements.
                  </td>
                </tr>
              ) : (
                filtered.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                      {exp.expense_number}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                      {exp.expense_date}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {exp.category}
                    </td>
                    <td className="px-4 py-3 text-slate-700 truncate max-w-xs">
                      {exp.description}
                      {exp.receipt_reference && (
                        <span className="block text-[10px] text-slate-400 font-mono">Receipt: {exp.receipt_reference}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {exp.payment_method}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {exp.projects?.name ? (
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-medium">
                          <Briefcase size={10} /> {exp.projects.name}
                        </span>
                      ) : exp.suppliers?.name ? (
                        <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[10px] font-medium">
                          <Truck size={10} /> {exp.suppliers.name}
                        </span>
                      ) : exp.employees?.first_name ? (
                        <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded text-[10px] font-medium">
                          <User size={10} /> {exp.employees.first_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">General</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {exp.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">
                      {exp.vat_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {exp.total_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        exp.status === "Paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : exp.status === "Approved"
                          ? "bg-blue-100 text-blue-800"
                          : exp.status === "Rejected"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(exp)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(exp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? "Edit Expense" : "Record Operating Expense"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expense # {editingId ? "(Read-only)" : "(Auto-generated on save)"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingId ? formNumber : "Auto-generated on save"}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {DEFAULT_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Other / Custom">Other / Custom Category...</option>
                </select>
                {formCategory === "Other / Custom" && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom category name..."
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Net Amount (AED) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => handleAmountChange(e.target.value, applyVat)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">VAT (5%)</label>
                    <label className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyVat}
                        onChange={(e) => {
                          setApplyVat(e.target.checked);
                          handleAmountChange(formAmount, e.target.checked);
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      5% VAT
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!applyVat}
                    value={formVatAmount}
                    onChange={(e) => setFormVatAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled
                    value={formTotalAmount}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as "Cash" | "Bank Transfer" | "Cheque" | "Credit Card" | "Petty Cash")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Credit Card">Company Credit Card</option>
                    <option value="Petty Cash">Petty Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "Pending" | "Approved" | "Paid" | "Rejected")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Link Project</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- None (General) --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Link Supplier</label>
                  <select
                    value={formSupplierId}
                    onChange={(e) => setFormSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- None --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee / Payee</label>
                  <select
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- None --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Invoice Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. DEWA-992140 or REC-8821"
                  value={formReceiptRef}
                  onChange={(e) => setFormReceiptRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Monthly office electricity &amp; water bill, site tools purchase..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  {editingId ? "Save Changes" : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
