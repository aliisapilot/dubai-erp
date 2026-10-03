"use client";

import { FormEvent, useEffect, useState, useMemo, ChangeEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Search, Wallet, X, Loader2, ArrowUpRight, ArrowDownLeft,
  History, Printer, Eye,
  FileText, LayoutDashboard, ShieldAlert,
  MessageCircle, Copy, Check, FileSpreadsheet, Bell
} from "lucide-react";
import { getCurrentCompany, fmtAED, fmtDate, todayISO } from "@/lib/helpers";
import {
  ChequeRecord, ChequeType, ChequeStatus, ChequeFormInput,
  UAE_BANKS, formatChequeStatus, chequeStatusBadge,
  getChequeUrgency, isChequeOverdue, computeChequeMetrics, ChequeStatusHistoryRecord
} from "@/lib/chequeTypes";
import {
  fetchCheques, createCheque, updateCheque, transitionChequeStatus,
  fetchChequeById, uploadChequeDocument, getChequeDocumentSignedUrl
} from "@/lib/chequeService";
import { openWhatsApp, generateChequeWhatsAppMessage } from "@/lib/whatsappUtils";
import PrintModal from "@/components/documents/PrintModal";
import ChequePrintTemplate from "@/components/cheques/ChequePrintTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null; phone?: string | null };
type Supplier = { id: string; name: string | null; supplier_code: string | null; trn: string | null; phone?: string | null };
type Employee = { id: string; first_name?: string | null; name?: string | null };
type TaxInvoice = { id: string; invoice_number: string | null; total_amount: number | null; customer_id: string | null };
type SupplierBill = { id: string; bill_number: string | null; total_amount: number | null; paid_amount: number | null; supplier_id: string | null };

const emptyForm: ChequeFormInput = {
  cheque_type: "incoming",
  cheque_number: "",
  bank_name: "Emirates NBD",
  branch_name: "Dubai Main",
  amount: "0",
  issue_date: todayISO(),
  due_date: todayISO(),
  customer_id: "",
  supplier_id: "",
  payee_name: "",
  tax_invoice_id: "",
  supplier_bill_id: "",
  responsible_employee_id: "",
  responsible_employee_name: "",
  notes: "",
  cheque_image_front_url: "",
  cheque_image_back_url: "",
  deposit_slip_url: "",
  bounce_slip_url: "",
};

export default function ChequeRegisterPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);

  // Filters & State
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "incoming" | "outgoing">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bankFilter, setBankFilter] = useState<string>("all");

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCheque, setEditingCheque] = useState<ChequeRecord | null>(null);
  const [form, setForm] = useState<ChequeFormInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Status Change Dialog
  const [statusTargetCheque, setStatusTargetCheque] = useState<ChequeRecord | null>(null);
  const [targetStatus, setTargetStatus] = useState<ChequeStatus>("deposited");
  const [statusDate, setStatusDate] = useState(todayISO());
  const [statusNotes, setStatusNotes] = useState("");
  const [depositAccount, setDepositAccount] = useState("");
  const [clearanceRef, setClearanceRef] = useState("");
  const [bounceReason, setBounceReason] = useState("Insufficient funds");
  const [cancellationReason, setCancellationReason] = useState("");
  const [recordAccountingPayment, setRecordAccountingPayment] = useState(true);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Detail / Audit History Drawer
  const [detailCheque, setDetailCheque] = useState<ChequeRecord | null>(null);
  const [detailHistory, setDetailHistory] = useState<ChequeStatusHistoryRecord[]>([]);
  const [frontImageSignedUrl, setFrontImageSignedUrl] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Print Preview
  const [printCheque, setPrintCheque] = useState<ChequeRecord | null>(null);

  // WhatsApp Reminder Modal
  const [whatsAppModalCheque, setWhatsAppModalCheque] = useState<ChequeRecord | null>(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [chqs, custs, supps, emps, invs, bls, co] = await Promise.all([
        fetchCheques(),
        supabase.from("customers").select("id, name, customer_code, trn, phone").eq("active", true).order("name"),
        supabase.from("suppliers").select("id, name, supplier_code, trn, phone").eq("active", true).order("name"),
        supabase.from("employees").select("id, first_name, name").eq("status", "active").order("first_name"),
        supabase.from("tax_invoices").select("id, invoice_number, total_amount, customer_id").order("invoice_date", { ascending: false }).limit(200),
        supabase.from("supplier_bills").select("id, bill_number, total_amount, paid_amount, supplier_id").order("bill_date", { ascending: false }).limit(200),
        getCurrentCompany(),
      ]);

      setCheques(chqs);
      setCustomers((custs.data || []) as Customer[]);
      setSuppliers((supps.data || []) as Supplier[]);
      setEmployees((emps.data || []) as Employee[]);
      setInvoices((invs.data || []) as TaxInvoice[]);
      setBills((bls.data || []) as SupplierBill[]);
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Failed to load cheque register data:", err);
    } finally {
      setLoading(false);
    }
  }

  function openWhatsAppModal(c: ChequeRecord) {
    const phone = c.cheque_type === "incoming" ? c.customer?.phone : c.supplier?.phone;
    setWhatsAppModalCheque(c);
    setWhatsAppPhone(phone || "");
    setCopiedWhatsApp(false);
  }

  function exportChequesToCSV() {
    if (!filteredCheques || filteredCheques.length === 0) return;
    const headers = [
      "Cheque Number",
      "Direction",
      "Bank Name",
      "Branch",
      "Amount (AED)",
      "Issue Date",
      "Due Date",
      "Counterparty",
      "Tax Invoice",
      "Supplier Bill",
      "Status",
      "Clearance Date",
      "Notes",
    ];

    const rows = filteredCheques.map((c) => [
      `"${c.cheque_number}"`,
      `"${c.cheque_type}"`,
      `"${c.bank_name || ""}"`,
      `"${c.branch_name || ""}"`,
      `"${Number(c.amount || 0).toFixed(2)}"`,
      `"${c.issue_date || ""}"`,
      `"${c.due_date || ""}"`,
      `"${(c.cheque_type === "incoming" ? c.customer?.name : c.supplier?.name) || c.payee_name || ""}"`,
      `"${c.tax_invoice?.invoice_number || ""}"`,
      `"${c.supplier_bill?.bill_number || ""}"`,
      `"${c.status || ""}"`,
      `"${c.clearance_date || ""}"`,
      `"${(c.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Dubai_ERP_Cheques_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Open Create Modal
  function openAdd(type: ChequeType) {
    setEditingCheque(null);
    setFormError("");
    setForm({
      ...emptyForm,
      cheque_type: type,
      issue_date: todayISO(),
      due_date: todayISO(),
    });
    setShowModal(true);
  }

  // Open Edit Modal
  function openEdit(c: ChequeRecord) {
    setEditingCheque(c);
    setFormError("");
    setForm({
      cheque_type: c.cheque_type,
      cheque_number: c.cheque_number,
      bank_name: c.bank_name,
      branch_name: c.branch_name || "",
      amount: String(c.amount),
      issue_date: c.issue_date,
      due_date: c.due_date,
      customer_id: c.customer_id || "",
      supplier_id: c.supplier_id || "",
      payee_name: c.payee_name || "",
      tax_invoice_id: c.tax_invoice_id || "",
      supplier_bill_id: c.supplier_bill_id || "",
      responsible_employee_id: c.responsible_employee_id || "",
      responsible_employee_name: c.responsible_employee_name || "",
      notes: c.notes || "",
      cheque_image_front_url: c.cheque_image_front_url || "",
      cheque_image_back_url: c.cheque_image_back_url || "",
      deposit_slip_url: c.deposit_slip_url || "",
      bounce_slip_url: c.bounce_slip_url || "",
    });
    setShowModal(true);
  }

  // Save Cheque
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      setFormError("Cheque amount must be greater than 0 AED.");
      return;
    }
    if (!form.cheque_number.trim()) {
      setFormError("Cheque number is required.");
      return;
    }

    setSaving(true);
    try {
      // Find employee name if selected
      const emp = employees.find((em) => em.id === form.responsible_employee_id);
      const empName = emp ? emp.first_name || emp.name || "" : form.responsible_employee_name;

      if (editingCheque) {
        await updateCheque(editingCheque.id, {
          ...form,
          responsible_employee_name: empName,
        });
      } else {
        await createCheque({
          ...form,
          responsible_employee_name: empName,
        });
      }

      setShowModal(false);
      await loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  // Handle image upload to private storage
  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>, folder: "front" | "back" | "deposit" | "bounce") {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const path = await uploadChequeDocument(file, folder);
      if (folder === "front") setForm((f) => ({ ...f, cheque_image_front_url: path }));
      if (folder === "back") setForm((f) => ({ ...f, cheque_image_back_url: path }));
      if (folder === "deposit") setForm((f) => ({ ...f, deposit_slip_url: path }));
      if (folder === "bounce") setForm((f) => ({ ...f, bounce_slip_url: path }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Upload error: ${msg}`);
    } finally {
      setUploadingImage(false);
    }
  }

  // Open Status Transition Dialog
  function openStatusDialog(cheque: ChequeRecord, defaultTarget: ChequeStatus) {
    setStatusTargetCheque(cheque);
    setTargetStatus(defaultTarget);
    setStatusDate(todayISO());
    setStatusNotes("");
    setClearanceRef(`CLR-${Date.now().toString().slice(-6)}`);
    setDepositAccount("Company Operational Account");
    setBounceReason("Insufficient funds / Drawers signature differs");
    setCancellationReason("");
    setRecordAccountingPayment(true);
    setStatusError("");
  }

  // Submit Status Change
  async function handleStatusSubmit(e: FormEvent) {
    e.preventDefault();
    if (!statusTargetCheque) return;
    setStatusError("");
    setStatusSubmitting(true);

    try {
      await transitionChequeStatus({
        chequeId: statusTargetCheque.id,
        targetStatus,
        actionDate: statusDate,
        depositBankAccount: depositAccount,
        clearanceReference: clearanceRef,
        bounceReason,
        cancellationReason,
        notes: statusNotes,
        recordAccountingPayment: targetStatus === "cleared" ? recordAccountingPayment : false,
      });

      setStatusTargetCheque(null);
      await loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusError(msg);
    } finally {
      setStatusSubmitting(false);
    }
  }

  // View Cheque Audit History & Scans
  async function openDetail(cheque: ChequeRecord) {
    setDetailCheque(cheque);
    setLoadingDetail(true);
    setFrontImageSignedUrl(null);

    try {
      const res = await fetchChequeById(cheque.id);
      setDetailHistory(res.history);

      if (cheque.cheque_image_front_url) {
        const signed = await getChequeDocumentSignedUrl(cheque.cheque_image_front_url);
        setFrontImageSignedUrl(signed);
      }
    } catch (err) {
      console.error("Load detail error:", err);
    } finally {
      setLoadingDetail(false);
    }
  }

  // Filtered Cheques
  const filteredCheques = useMemo(() => {
    return cheques.filter((c) => {
      if (typeFilter !== "all" && c.cheque_type !== typeFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "overdue") {
          if (!isChequeOverdue(c.due_date, c.status)) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (bankFilter !== "all" && c.bank_name !== bankFilter) return false;

      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const party = c.cheque_type === "incoming" ? c.customer?.name || c.payee_name : c.supplier?.name || c.payee_name;

      return (
        c.cheque_number.toLowerCase().includes(s) ||
        (party && party.toLowerCase().includes(s)) ||
        c.bank_name.toLowerCase().includes(s) ||
        (c.notes && c.notes.toLowerCase().includes(s)) ||
        (c.responsible_employee_name && c.responsible_employee_name.toLowerCase().includes(s))
      );
    });
  }, [cheques, typeFilter, statusFilter, bankFilter, search]);

  const metrics = useMemo(() => computeChequeMetrics(cheques), [cheques]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Page Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm">
              <Wallet size={22} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cheque Register</h1>
                <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-bold">
                  PDC &amp; CDC
                </span>
              </div>
              <p className="text-xs text-slate-500">Track and manage inward and outward cheques with status verification</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/cheques/dashboard"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <LayoutDashboard size={15} className="text-slate-500" />
              Calendar Dashboard
            </Link>

            <Link
              href="/reports/cheques"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <Printer size={15} className="text-slate-500" />
              Cheque Reports
            </Link>

            <Link
              href="/cheques/settings"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <Bell size={15} className="text-slate-500" />
              Reminder Settings
            </Link>

            <button
              type="button"
              onClick={exportChequesToCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              title="Export filtered cheques to CSV / Excel spreadsheet"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => openAdd("incoming")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <ArrowDownLeft size={16} />
              Receive Cheque
            </button>

            <button
              type="button"
              onClick={() => openAdd("outgoing")}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
            >
              <ArrowUpRight size={16} />
              Issue Cheque
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Inward (Customer)</span>
            <p className="mt-1 text-lg font-black text-emerald-700">{fmtAED(metrics.totalIncomingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{metrics.totalIncomingCount} total cheques</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Outward (Supplier)</span>
            <p className="mt-1 text-lg font-black text-blue-700">{fmtAED(metrics.totalOutgoingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{metrics.totalOutgoingCount} total cheques</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending in Hand</span>
            <p className="mt-1 text-lg font-black text-amber-600">{fmtAED(metrics.pendingAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting deposit</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">In Bank (Clearing)</span>
            <p className="mt-1 text-lg font-black text-indigo-600">{fmtAED(metrics.depositedAmount)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Deposited in bank</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cleared &amp; Settled</span>
            <p className="mt-1 text-lg font-black text-slate-900">{fmtAED(metrics.clearedAmount)}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">Funds settled</p>
          </div>

          <div className={`rounded-xl border p-3.5 shadow-xs ${metrics.overdueCount > 0 ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}>
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center justify-between">
              Overdue Risk
              {metrics.overdueCount > 0 && <ShieldAlert size={14} className="text-rose-600" />}
            </span>
            <p className="mt-1 text-lg font-black text-rose-700">{fmtAED(metrics.overdueAmount)}</p>
            <p className="text-[10px] text-rose-600 mt-0.5">{metrics.overdueCount} cheques past due</p>
          </div>
        </div>

        {/* Filters & Direction Tabs */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            {/* Direction Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  typeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Cheques ({cheques.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("incoming")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  typeFilter === "incoming" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ArrowDownLeft size={13} />
                Incoming ({metrics.totalIncomingCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("outgoing")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  typeFilter === "outgoing" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ArrowUpRight size={13} />
                Outgoing ({metrics.totalOutgoingCount})
              </button>
            </div>

            {/* Quick Count Indicators */}
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-900">{filteredCheques.length}</span> of {cheques.length} recorded cheques
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative md:col-span-2">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by cheque #, customer/supplier, bank, notes..."
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-slate-50/50"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending In Hand</option>
                <option value="deposited">Deposited in Bank</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced / Returned</option>
                <option value="cancelled">Cancelled</option>
                <option value="overdue">⚠️ Overdue Cheques</option>
              </select>
            </div>

            {/* Bank Filter */}
            <div>
              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
              >
                <option value="all">All UAE Banks</option>
                {UAE_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Cheques Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Cheque #</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4">Party / Counterparty</th>
                  <th className="py-3 px-4">Drawee Bank</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Amount (AED)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Loader2 size={24} className="mx-auto animate-spin mb-2" />
                      Loading cheques register...
                    </td>
                  </tr>
                ) : filteredCheques.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-700">No cheques found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Try clearing your filters or record a new cheque voucher.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCheques.map((c) => {
                    const isInc = c.cheque_type === "incoming";
                    const party = isInc
                      ? c.customer?.name || c.payee_name || "Customer"
                      : c.supplier?.name || c.payee_name || "Supplier";
                    const urgency = getChequeUrgency(c.due_date, c.status);

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Cheque # */}
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <button
                            type="button"
                            onClick={() => openDetail(c)}
                            className="hover:text-emerald-600 transition-colors text-left flex items-center gap-1.5"
                          >
                            <span>#{c.cheque_number}</span>
                            {c.cheque_image_front_url && (
                              <span className="rounded bg-slate-100 p-0.5 text-slate-500" title="Image attached">
                                <FileText size={11} />
                              </span>
                            )}
                          </button>
                          {c.tax_invoice && (
                            <span className="block text-[10px] text-slate-500 font-sans font-normal">
                              Inv: {c.tax_invoice.invoice_number}
                            </span>
                          )}
                          {c.supplier_bill && (
                            <span className="block text-[10px] text-slate-500 font-sans font-normal">
                              Bill: {c.supplier_bill.bill_number}
                            </span>
                          )}
                        </td>

                        {/* Direction */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isInc
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {isInc ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                            {isInc ? "Inward" : "Outward"}
                          </span>
                        </td>

                        {/* Party */}
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 truncate max-w-[180px]">{party}</p>
                          {c.responsible_employee_name && (
                            <p className="text-[10px] text-slate-400">Assigned: {c.responsible_employee_name}</p>
                          )}
                        </td>

                        {/* Bank */}
                        <td className="py-3 px-4">
                          <p className="text-slate-800 font-medium truncate max-w-[150px]">{c.bank_name}</p>
                          {c.branch_name && <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{c.branch_name}</p>}
                        </td>

                        {/* Due Date & Urgency */}
                        <td className="py-3 px-4">
                          <p className="font-mono text-slate-800 font-semibold">{fmtDate(c.due_date)}</p>
                          <span className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] ${urgency.badgeClass}`}>
                            {urgency.label}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                          {fmtAED(c.amount)}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${chequeStatusBadge(
                              c.status
                            )}`}
                          >
                            {formatChequeStatus(c.status)}
                          </span>
                          {c.status === "cleared" && c.is_payment_recorded && (
                            <span className="block text-[9px] text-emerald-600 font-semibold mt-0.5">
                              ✓ Accounting Linked
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Status transitions based on current status */}
                            {c.status === "pending" && (
                              <button
                                type="button"
                                onClick={() => openStatusDialog(c, "deposited")}
                                className="rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                              >
                                Deposit
                              </button>
                            )}

                            {c.status === "deposited" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openStatusDialog(c, "cleared")}
                                  className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openStatusDialog(c, "bounced")}
                                  className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200"
                                >
                                  Bounce
                                </button>
                              </>
                            )}

                            {c.status === "bounced" && (
                              <button
                                type="button"
                                onClick={() => openStatusDialog(c, "deposited")}
                                className="rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200"
                              >
                                Re-present
                              </button>
                            )}

                            {/* View Detail & History */}
                            <button
                              type="button"
                              onClick={() => openDetail(c)}
                              title="Audit History & Scans"
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <Eye size={15} />
                            </button>

                            {/* WhatsApp Reminder */}
                            <button
                              type="button"
                              onClick={() => openWhatsAppModal(c)}
                              title="Send WhatsApp Reminder / Advice"
                              className="rounded p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            >
                              <MessageCircle size={15} />
                            </button>

                            {/* Print Voucher */}
                            <button
                              type="button"
                              onClick={() => setPrintCheque(c)}
                              title="Print Cheque Voucher"
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <Printer size={15} />
                            </button>

                            {/* Edit (only if not cleared) */}
                            {c.status !== "cleared" && (
                              <button
                                type="button"
                                onClick={() => openEdit(c)}
                                title="Edit Cheque"
                                className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Wallet size={18} className="text-emerald-400" />
                <h2 className="text-base font-bold">
                  {editingCheque
                    ? `Edit Cheque #${editingCheque.cheque_number}`
                    : form.cheque_type === "incoming"
                    ? "Record Inward Customer Cheque"
                    : "Issue Outward Supplier Cheque"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              {/* Cheque Type Toggle */}
              {!editingCheque && (
                <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cheque_type: "incoming" }))}
                    className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      form.cheque_type === "incoming" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <ArrowDownLeft size={14} /> Inward (From Customer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cheque_type: "outgoing" }))}
                    className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                      form.cheque_type === "outgoing" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <ArrowUpRight size={14} /> Outward (To Supplier)
                  </button>
                </div>
              )}

              {/* Cheque # and Amount */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cheque Number *</label>
                  <input
                    type="text"
                    required
                    value={form.cheque_number}
                    onChange={(e) => setForm((f) => ({ ...f, cheque_number: e.target.value }))}
                    placeholder="e.g. 000452"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount in AED *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Bank & Branch */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Drawee Bank *</label>
                  <select
                    value={form.bank_name}
                    onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                  >
                    {UAE_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch / City</label>
                  <input
                    type="text"
                    value={form.branch_name}
                    onChange={(e) => setForm((f) => ({ ...f, branch_name: e.target.value }))}
                    placeholder="e.g. Business Bay Branch, Dubai"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Issue Date & Due Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date *</label>
                  <input
                    type="date"
                    required
                    value={form.issue_date}
                    onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Due / Maturity Date (Cheque Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Counterparty Selection */}
              {form.cheque_type === "incoming" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                    <select
                      value={form.customer_id}
                      onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                    >
                      <option value="">-- Select Customer --</option>
                      {customers.map((cu) => (
                        <option key={cu.id} value={cu.id}>
                          {cu.name} {cu.customer_code ? `(${cu.customer_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Drawer / Payee Name</label>
                    <input
                      type="text"
                      value={form.payee_name}
                      onChange={(e) => setForm((f) => ({ ...f, payee_name: e.target.value }))}
                      placeholder="Drawer name if non-customer or different"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier</label>
                    <select
                      value={form.supplier_id}
                      onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                    >
                      <option value="">-- Select Supplier --</option>
                      {suppliers.map((su) => (
                        <option key={su.id} value={su.id}>
                          {su.name} {su.supplier_code ? `(${su.supplier_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Beneficiary Name</label>
                    <input
                      type="text"
                      value={form.payee_name}
                      onChange={(e) => setForm((f) => ({ ...f, payee_name: e.target.value }))}
                      placeholder="Beneficiary / Payee on cheque leaf"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Optional Linkage: Invoice or Bill */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.cheque_type === "incoming" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Link to Tax Invoice (Optional)</label>
                    <select
                      value={form.tax_invoice_id}
                      onChange={(e) => setForm((f) => ({ ...f, tax_invoice_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                    >
                      <option value="">-- None / General Advance --</option>
                      {invoices
                        .filter((inv) => !form.customer_id || inv.customer_id === form.customer_id)
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number} (AED {inv.total_amount?.toLocaleString()})
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Link to Supplier Bill (Optional)</label>
                    <select
                      value={form.supplier_bill_id}
                      onChange={(e) => setForm((f) => ({ ...f, supplier_bill_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                    >
                      <option value="">-- None / Advance Payment --</option>
                      {bills
                        .filter((b) => !form.supplier_id || b.supplier_id === form.supplier_id)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bill_number} (Remaining: AED {(Number(b.total_amount) - Number(b.paid_amount || 0)).toLocaleString()})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Employee</label>
                  <select
                    value={form.responsible_employee_id}
                    onChange={(e) => setForm((f) => ({ ...f, responsible_employee_id: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white"
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map((em) => (
                      <option key={em.id} value={em.id}>
                        {em.first_name || em.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Supporting Document Uploads */}
              <div className="border-t border-slate-200 pt-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cheque Front Image / Scan</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, "front")}
                    className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {uploadingImage && <Loader2 size={16} className="animate-spin text-emerald-600" />}
                  {form.cheque_image_front_url && (
                    <span className="text-[11px] font-semibold text-emerald-600">✓ Image attached</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Payment Terms</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional remarks or instructions..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingCheque ? "Save Changes" : "Save Cheque"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STATUS CHANGE DIALOG */}
      {statusTargetCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-900 text-white">
              <h3 className="font-bold text-sm">
                Update Cheque Status (#{statusTargetCheque.cheque_number})
              </h3>
              <button
                type="button"
                onClick={() => setStatusTargetCheque(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="p-5 space-y-3.5 text-xs">
              {statusError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 font-medium">
                  {statusError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Status *</label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as ChequeStatus)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none bg-white font-bold"
                >
                  <option value="deposited">Deposited (Submitted to Bank)</option>
                  <option value="cleared">Cleared (Funds Settled in Bank)</option>
                  <option value="bounced">Bounced (Returned Unpaid)</option>
                  <option value="cancelled">Cancelled (Voided)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Action Date *</label>
                <input
                  type="date"
                  required
                  value={statusDate}
                  onChange={(e) => setStatusDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              {targetStatus === "deposited" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Deposit Bank Account</label>
                  <input
                    type="text"
                    value={depositAccount}
                    onChange={(e) => setDepositAccount(e.target.value)}
                    placeholder="e.g. Emirates NBD Main Operational A/C"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
              )}

              {targetStatus === "cleared" && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Clearance Reference</label>
                    <input
                      type="text"
                      value={clearanceRef}
                      onChange={(e) => setClearanceRef(e.target.value)}
                      placeholder="Bank statement transaction ref"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none font-mono"
                    />
                  </div>

                  {!statusTargetCheque.is_payment_recorded && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={recordAccountingPayment}
                          onChange={(e) => setRecordAccountingPayment(e.target.checked)}
                          className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="font-bold text-emerald-900 block text-xs">
                            Record in Accounting Payments
                          </span>
                          <span className="text-[11px] text-emerald-700 leading-tight block mt-0.5">
                            Automatically creates an official payment receipt or voucher and reconciles linked invoice/bill balances safely.
                          </span>
                        </div>
                      </label>
                    </div>
                  )}
                </>
              )}

              {targetStatus === "bounced" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bounce / Dishonour Reason *</label>
                  <input
                    type="text"
                    required
                    value={bounceReason}
                    onChange={(e) => setBounceReason(e.target.value)}
                    placeholder="e.g. Insufficient funds, signature mismatch"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
              )}

              {targetStatus === "cancelled" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cancellation Reason *</label>
                  <input
                    type="text"
                    required
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="e.g. Replaced by Bank Transfer"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Audit Notes</label>
                <textarea
                  rows={2}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Optional remarks for audit history..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusTargetCheque(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {statusSubmitting && <Loader2 size={13} className="animate-spin" />}
                  Confirm Status Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL & AUDIT HISTORY DRAWER */}
      {detailCheque && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">Cheque #{detailCheque.cheque_number}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${chequeStatusBadge(detailCheque.status)}`}>
                    {formatChequeStatus(detailCheque.status)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {detailCheque.cheque_type === "incoming" ? "Inward Customer Receipt" : "Outward Supplier Disbursement"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailCheque(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* Financial Summary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Amount</span>
                  <p className="text-xl font-black text-slate-900 mt-0.5">{fmtAED(detailCheque.amount)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Due Date</span>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{fmtDate(detailCheque.due_date)}</p>
                </div>
              </div>

              {/* WhatsApp Quick Reminder Card */}
              {(() => {
                const phone =
                  detailCheque.cheque_type === "incoming"
                    ? detailCheque.customer?.phone
                    : detailCheque.supplier?.phone;

                return (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <MessageCircle size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block text-xs">WhatsApp Notice</span>
                        <span className="text-[11px] text-slate-500 block">
                          {phone ? `Phone: ${phone}` : "Instant formatted reminder"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openWhatsAppModal(detailCheque)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                    >
                      <MessageCircle size={13} />
                      WhatsApp
                    </button>
                  </div>
                );
              })()}

              {/* Details List */}
              <div className="space-y-2 border border-slate-200 rounded-xl p-3.5">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Bank:</span>
                  <span className="font-bold text-slate-900">{detailCheque.bank_name}</span>
                </div>
                {detailCheque.branch_name && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Branch:</span>
                    <span className="text-slate-800">{detailCheque.branch_name}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Issue Date:</span>
                  <span className="font-mono text-slate-800">{fmtDate(detailCheque.issue_date)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Counterparty:</span>
                  <span className="font-semibold text-slate-900">
                    {detailCheque.customer?.name || detailCheque.supplier?.name || detailCheque.payee_name || "—"}
                  </span>
                </div>
                {detailCheque.responsible_employee_name && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Assigned To:</span>
                    <span className="text-slate-800">{detailCheque.responsible_employee_name}</span>
                  </div>
                )}
                {detailCheque.notes && (
                  <div className="py-1">
                    <span className="text-slate-500 block mb-0.5">Notes:</span>
                    <p className="text-slate-700 bg-slate-50 p-2 rounded">{detailCheque.notes}</p>
                  </div>
                )}
              </div>

              {/* Cheque Scan Image */}
              {frontImageSignedUrl && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                    <FileText size={14} className="text-slate-500" />
                    Cheque Scan Document
                  </h4>
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frontImageSignedUrl}
                      alt="Cheque scan"
                      className="w-full h-auto object-contain max-h-56"
                    />
                  </div>
                </div>
              )}

              {/* Status Change Audit Trail */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                  <History size={14} className="text-slate-500" />
                  Status Change History &amp; Audit Trail
                </h4>

                {loadingDetail ? (
                  <p className="text-slate-400 py-3 text-center">Loading audit log...</p>
                ) : detailHistory.length === 0 ? (
                  <p className="text-slate-400 py-3 text-center">No history logs recorded.</p>
                ) : (
                  <div className="space-y-3 pl-2 border-l-2 border-slate-200">
                    {detailHistory.map((h) => (
                      <div key={h.id} className="relative pl-3">
                        <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-slate-900 border-2 border-white" />
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 capitalize">
                            {h.to_status}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {fmtDate(h.action_date)}
                          </span>
                        </div>
                        {h.notes && <p className="text-slate-600 text-[11px] mt-0.5">{h.notes}</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">By: {h.action_by_name || "System"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPrintCheque(detailCheque)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Printer size={14} /> Print Voucher
              </button>
              <button
                type="button"
                onClick={() => setDetailCheque(null)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The shared portal keeps the voucher outside hidden screen ancestors. */}
      {printCheque && (
        <PrintModal isOpen={true} onClose={() => setPrintCheque(null)}>
          <ChequePrintTemplate mode="voucher" company={company} cheque={printCheque} />
        </PrintModal>
      )}
      {/* WHATSAPP REMINDER DISPATCH MODAL */}
      {whatsAppModalCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-emerald-700 text-white px-5 py-3.5">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} className="text-emerald-200" />
                <span className="font-bold text-sm">WhatsApp Cheque Reminder</span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppModalCheque(null)}
                className="rounded-full p-1 text-emerald-200 hover:text-white hover:bg-emerald-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Counterparty & Cheque Info */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Recipient</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">
                    {whatsAppModalCheque.customer?.name ||
                      whatsAppModalCheque.supplier?.name ||
                      whatsAppModalCheque.payee_name ||
                      "Counterparty"}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Cheque</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">
                    #{whatsAppModalCheque.cheque_number} ({fmtAED(whatsAppModalCheque.amount)})
                  </p>
                </div>
              </div>

              {/* Recipient Phone Input */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient WhatsApp Number (UAE or International)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={whatsAppPhone}
                    onChange={(e) => setWhatsAppPhone(e.target.value)}
                    placeholder="e.g. 050 123 4567 or +971 50 123 4567"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Numbers like 050... are automatically formatted as UAE +971 for WhatsApp.
                </p>
              </div>

              {/* Message Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Message Preview</label>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = generateChequeWhatsAppMessage(whatsAppModalCheque, company?.name);
                      navigator.clipboard.writeText(msg);
                      setCopiedWhatsApp(true);
                      setTimeout(() => setCopiedWhatsApp(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                  >
                    {copiedWhatsApp ? (
                      <>
                        <Check size={12} className="text-emerald-600" /> Copied to Clipboard
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy Text
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-slate-700 text-[11px] leading-relaxed select-all">
                  {generateChequeWhatsAppMessage(whatsAppModalCheque, company?.name)}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setWhatsAppModalCheque(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  const msg = generateChequeWhatsAppMessage(whatsAppModalCheque, company?.name);
                  openWhatsApp(whatsAppPhone, msg);
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors"
              >
                <MessageCircle size={15} />
                Open in WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
