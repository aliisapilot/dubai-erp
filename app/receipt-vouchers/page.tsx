"use client";

import { FormEvent, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Receipt, Plus, Search, Loader2, X, Printer, Pencil, Trash2, ZoomIn, ZoomOut, Maximize2, Minimize2, CheckCircle2, AlertTriangle } from "lucide-react";
import { getCompanyId, getCurrentCompany, fmtAED, statusClass, todayISO, generateDocNumber } from "@/lib/helpers";
import ReceiptVoucherTemplate, { ReceiptVoucherData } from "@/components/documents/ReceiptVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { parseDatabaseError } from "@/lib/paymentTypes";
import DynamicDocumentRenderer, {
  MockDocumentData,
  getDocumentPageCount,
} from "@/components/documents/DynamicDocumentRenderer";
import { usePersistedDocumentDesign } from "@/components/documents/usePersistedDocumentDesign";
import {
  CustomPartyData,
  withCustomerDocumentDetails,
  serializeCustomPartyNotes,
  parseCustomPartyFromNotes,
} from "@/lib/documentCustomer";

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
  customer_name?: string | null;
  customer_address?: string | null;
  customer_trn?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  custom_project_name?: string | null;
  is_custom_customer?: boolean | null;
  custom_customer?: CustomPartyData | null;
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

  const [partyMode, setPartyMode] = useState<"existing" | "custom">("existing");
  const [customCustomer, setCustomCustomer] = useState<CustomPartyData>({
    name: "",
    address: "",
    contact_person: "",
    phone: "",
    email: "",
    trn: "",
    project_name: "",
  });

  const design = usePersistedDocumentDesign(company?.id, "receipt_voucher");
  const [activeTabMobile, setActiveTabMobile] = useState<"form" | "preview">("form");
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [zoom, setZoom] = useState(0.85);

  const previewData: MockDocumentData = useMemo(() => {
    const cust = customers.find((c) => c.id === form.customer_id);
    const amountVal = parseFloat(form.amount) || 0;
    const resolvedName = partyMode === "custom"
      ? (customCustomer.name || "Custom Customer")
      : (form.received_from || cust?.name || "Payer Name / Customer");
    const resolvedAddress = partyMode === "custom" ? customCustomer.address : undefined;
    const resolvedTrn = partyMode === "custom" ? customCustomer.trn : (cust?.trn || undefined);
    const resolvedContact = partyMode === "custom" ? customCustomer.contact_person : undefined;
    const resolvedPhone = partyMode === "custom" ? customCustomer.phone : undefined;
    const resolvedEmail = partyMode === "custom" ? customCustomer.email : undefined;
    const resolvedProject = partyMode === "custom" ? customCustomer.project_name : undefined;

    return {
      document_number: form.voucher_number || editing?.voucher_number || "[Draft - Generated on Save]",
      document_date: form.voucher_date || todayISO(),
      status: "posted",
      customer_name: resolvedName,
      customer_address: resolvedAddress || undefined,
      customer_trn: resolvedTrn || undefined,
      contact_person: resolvedContact || undefined,
      contact_number: resolvedPhone || undefined,
      contact_email: resolvedEmail || undefined,
      project_name: resolvedProject || undefined,
      notes: form.notes || undefined,
      payment_terms: `${form.payment_method}${
        form.cheque_number
          ? ` (Cheque #${form.cheque_number}${form.cheque_date ? ` dt. ${form.cheque_date}` : ""}${
              form.bank_name ? `, ${form.bank_name}` : ""
            })`
          : ""
      }`,
      subtotal: amountVal,
      vat_amount: 0,
      total_amount: amountVal,
      items: [
        {
          description: form.tax_invoice_id
            ? `Receipt towards Tax Invoice ${invoices.find((i) => i.id === form.tax_invoice_id)?.invoice_number || ""}`
            : `Payment received via ${form.payment_method}${form.notes ? ` - ${form.notes}` : ""}`,
          quantity: 1,
          unit: "Voucher",
          unit_price: amountVal,
          discount: 0,
          vat_rate: 0,
          vat_amount: 0,
          line_total: amountVal,
        },
      ],
    };
  }, [form, editing, customers, invoices, partyMode, customCustomer]);

  const totalPreviewPages = useMemo(() => {
    if (!design.layout) return 1;
    return getDocumentPageCount(design.layout, previewData.items.length, previewData.items, previewData);
  }, [design.layout, previewData]);

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

    const enriched = (vchs || []).map((v: Record<string, unknown>) => withCustomerDocumentDetails(v));
    setVouchers(enriched as RCV[]);
    setCustomers((custs || []) as Customer[]);
    setInvoices((invs || []) as Invoice[]);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  function openAdd() {
    setError("");
    setSuccess("");
    setEditing(null);
    setPartyMode("existing");
    setCustomCustomer({
      name: "",
      address: "",
      contact_person: "",
      phone: "",
      email: "",
      trn: "",
      project_name: "",
    });
    setForm({ ...emptyForm, voucher_date: todayISO() });
    setShowModal(true);
  }

  function openEdit(v: RCV) {
    setError("");
    setSuccess("");
    setEditing(v);
    const isCustom = Boolean(v.is_custom_customer || (!v.customer_id && (v.customer_name || v.custom_customer)));
    setPartyMode(isCustom ? "custom" : "existing");
    setCustomCustomer({
      name: v.customer_name || v.custom_customer?.name || (isCustom ? v.received_from : "") || "",
      address: v.customer_address || v.custom_customer?.address || "",
      contact_person: v.contact_person || v.custom_customer?.contact_person || "",
      phone: v.contact_number || v.custom_customer?.phone || "",
      email: v.contact_email || v.custom_customer?.email || "",
      trn: v.customer_trn || v.custom_customer?.trn || "",
      project_name: v.custom_project_name || v.custom_customer?.project_name || "",
    });
    setForm({
      voucher_number: v.voucher_number,
      voucher_date: v.voucher_date || todayISO(),
      customer_id: v.customer_id || "",
      received_from: v.customer_name || v.received_from || "",
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
    let effectivePartyMode = partyMode;
    if (effectivePartyMode === "existing" && !form.customer_id && customCustomer.name.trim()) {
      effectivePartyMode = "custom";
      setPartyMode("custom");
    } else if (effectivePartyMode === "custom" && !customCustomer.name.trim() && form.customer_id) {
      effectivePartyMode = "existing";
      setPartyMode("existing");
    }

    const isCustom = effectivePartyMode === "custom";
    const effectivePayer = isCustom ? customCustomer.name.trim() : form.received_from.trim();
    if (!effectivePayer || Number(form.amount) <= 0) {
      setError("Please provide a valid customer/payer name and an amount greater than 0.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const rawNotes = (form.notes || "").trim();
      const serializedNotes = isCustom
        ? serializeCustomPartyNotes(rawNotes || null, customCustomer)
        : (rawNotes || null);

      const basePayload: Record<string, unknown> = {
        voucher_date: form.voucher_date || todayISO(),
        customer_id: isCustom ? null : (form.customer_id || null),
        received_from: effectivePayer,
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
        notes: serializedNotes,
      };

      const fullPayload: Record<string, unknown> = {
        ...basePayload,
        customer_name: partyMode === "custom" ? customCustomer.name.trim() : null,
        customer_address: partyMode === "custom" ? customCustomer.address?.trim() || null : null,
        customer_trn: partyMode === "custom" ? customCustomer.trn?.trim() || null : null,
        contact_person: partyMode === "custom" ? customCustomer.contact_person?.trim() || null : null,
        contact_number: partyMode === "custom" ? customCustomer.phone?.trim() || null : null,
        contact_email: partyMode === "custom" ? customCustomer.email?.trim() || null : null,
        custom_project_name: partyMode === "custom" ? customCustomer.project_name?.trim() || null : null,
        is_custom_customer: partyMode === "custom",
        custom_customer: partyMode === "custom" ? customCustomer : null,
      };

      if (editing) {
        const updateErr = (await supabase.from("receipt_vouchers").update(fullPayload).eq("id", editing.id)).error;
        if (updateErr) {
          console.warn("[ReceiptVoucher] Full update error, falling back to base columns + serialized notes:", updateErr.message);
          const fallbackRes = await supabase.from("receipt_vouchers").update(basePayload).eq("id", editing.id);
          if (fallbackRes.error) throw fallbackRes.error;
        }
        setSuccess("Receipt voucher updated successfully.");
      } else {
        const cid = await getCompanyId();
        const vno = await generateDocNumber(cid, "RCV");
        const insertErr = (await supabase.from("receipt_vouchers").insert({
          ...fullPayload,
          company_id: cid,
          voucher_number: vno,
        })).error;
        if (insertErr) {
          console.warn("[ReceiptVoucher] Full insert error, falling back to base columns + serialized notes:", insertErr.message);
          const fallbackRes = await supabase.from("receipt_vouchers").insert({
            ...basePayload,
            company_id: cid,
            voucher_number: vno,
          });
          if (fallbackRes.error) throw fallbackRes.error;
        }
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

  function handlePrintCurrent() {
    const isCustom = partyMode === "custom";
    const cust = customers.find(c => c.id === form.customer_id);
    const inv = invoices.find(i => i.id === form.tax_invoice_id);
    const vData: ReceiptVoucherData = {
      voucher_number: editing?.voucher_number || form.voucher_number || "RCV-DRAFT",
      voucher_date: form.voucher_date || todayISO(),
      received_from: isCustom ? customCustomer.name : form.received_from || cust?.name || "",
      customer_address: isCustom ? customCustomer.address || undefined : undefined,
      customer_trn: isCustom ? customCustomer.trn || undefined : cust?.trn || undefined,
      contact_person: isCustom ? customCustomer.contact_person || undefined : undefined,
      contact_number: isCustom ? customCustomer.phone || undefined : undefined,
      contact_email: isCustom ? customCustomer.email || undefined : undefined,
      project_name: isCustom ? customCustomer.project_name || undefined : undefined,
      amount: Number(form.amount) || 0,
      payment_method: form.payment_method,
      cheque_number: form.cheque_number || undefined,
      cheque_date: form.cheque_date || undefined,
      bank_name: form.bank_name || undefined,
      reference_invoice: inv?.invoice_number || undefined,
      total_due: form.total_due ? Number(form.total_due) : undefined,
      advance_amount: form.advance_amount ? Number(form.advance_amount) : undefined,
      balance_amount: form.balance_amount ? Number(form.balance_amount) : undefined,
      accountant_name: form.accountant_name || "Accounts Dept.",
      notes: form.notes || undefined,
    };
    setPrintVoucher(vData);
  }

  function handlePrint(v: RCV) {
    const cust = customers.find(c => c.id === v.customer_id);
    const inv = invoices.find(i => i.id === v.tax_invoice_id);
    const vData: ReceiptVoucherData = {
      voucher_number: v.voucher_number,
      voucher_date: v.voucher_date,
      received_from: v.customer_name || v.received_from || cust?.name || "",
      customer_address: v.customer_address || v.custom_customer?.address || undefined,
      customer_trn: v.customer_trn || v.custom_customer?.trn || cust?.trn || undefined,
      contact_person: v.contact_person || v.custom_customer?.contact_person || undefined,
      contact_number: v.contact_number || v.custom_customer?.phone || undefined,
      contact_email: v.contact_email || v.custom_customer?.email || undefined,
      project_name: v.custom_project_name || v.custom_customer?.project_name || undefined,
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
    [v.voucher_number, v.customer_name, v.received_from, v.payment_method, v.cheque_number, v.custom_project_name]
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
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{v.customer_name || v.received_from}</span>
                        {(v.is_custom_customer || (!v.customer_id && v.customer_name)) && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Custom
                          </span>
                        )}
                      </div>
                      {v.custom_project_name && (
                        <span className="inline-block mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                          Project: {v.custom_project_name}
                        </span>
                      )}
                    </td>
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

      {/* Split-Screen Modal with Live PDF Preview */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-150">
          {/* Top Bar */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Receipt size={18} />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-wide">
                  {editing ? "Edit Receipt Voucher" : "Issue Receipt Voucher"}
                </h2>
                <span className="font-mono text-xs rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                  {editing?.voucher_number || form.voucher_number || "[Draft Preview]"}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  Live Sync
                </span>
              </div>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5 lg:hidden">
              <button
                type="button"
                onClick={() => setActiveTabMobile("form")}
                className={`px-3 py-1 text-xs font-semibold rounded-md ${
                  activeTabMobile === "form" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-300"
                }`}
              >
                Editor Form
              </button>
              <button
                type="button"
                onClick={() => setActiveTabMobile("preview")}
                className={`px-3 py-1 text-xs font-semibold rounded-md ${
                  activeTabMobile === "preview" ? "bg-blue-600 text-white font-bold" : "text-slate-300"
                }`}
              >
                Live PDF
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintCurrent}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                title="Print or Export PDF"
              >
                <Printer size={14} className="text-indigo-400" />
                <span className="hidden sm:inline">Print / Export</span>
              </button>
              <button
                type="submit"
                form="rcv-form"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-md transition cursor-pointer"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>{saving ? "Saving…" : editing ? "Save Changes" : "Save Voucher"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* Top Global Error Banner: Visible across all scroll positions and mobile tabs */}
          {error && (
            <div className="z-20 flex shrink-0 items-center justify-between border-b border-rose-500/40 bg-rose-950/95 px-4 py-2 text-xs text-rose-200 shadow-md">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                <span className="font-semibold">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError("")}
                className="rounded p-1 text-rose-300 hover:bg-rose-900 transition cursor-pointer"
                title="Dismiss error"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Split Workspace */}
          <div className="relative flex flex-1 overflow-hidden">
            {/* LEFT: Form Panel */}
            <div
              className={`flex flex-col border-r border-slate-800 bg-slate-900/90 text-slate-200 overflow-y-auto designer-scrollbar ${
                previewFullscreen ? "hidden" : "w-full lg:w-1/2"
              } ${activeTabMobile === "form" ? "block" : "hidden lg:flex"}`}
            >
              <div className="p-5 space-y-4">
                <form id="rcv-form" onSubmit={saveVoucher} className="space-y-4 text-xs">
                  {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Voucher Details</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block font-semibold text-slate-300">Voucher Ref #</label>
                        <input
                          type="text"
                          value={form.voucher_number}
                          readOnly
                          placeholder={editing ? editing.voucher_number : "Auto-generated on save"}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-mono font-bold text-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-semibold text-slate-300">Receipt Date</label>
                        <input
                          type="date"
                          value={form.voucher_date}
                          onChange={e => setForm({ ...form, voucher_date: e.target.value })}
                          required
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Customer Selection: Existing vs Custom */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Customer / Payer</div>
                        <div className="flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
                          <button
                            type="button"
                            onClick={() => setPartyMode("existing")}
                            className={`px-2.5 py-1 rounded font-medium transition ${
                              partyMode === "existing"
                                ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            Existing Customer
                          </button>
                          <button
                            type="button"
                            onClick={() => setPartyMode("custom")}
                            className={`px-2.5 py-1 rounded font-medium transition ${
                              partyMode === "custom"
                                ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            Custom Customer
                          </button>
                        </div>
                      </div>

                      {partyMode === "existing" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block font-semibold text-slate-300">Customer (Optional Link)</label>
                            <select
                              value={form.customer_id}
                              onChange={e => onCustomerSelect(e.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                            >
                              <option value="">— Select Customer —</option>
                              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block font-semibold text-slate-300">Received From (Payer) <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={form.received_from}
                              onChange={e => setForm({ ...form, received_from: e.target.value })}
                              placeholder="Full payer name"
                              required={partyMode === "existing"}
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                            ✍️ <strong>Custom Customer Mode</strong>: Enter customer details manually for this receipt voucher. No record will be created in your customer database.
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="mb-1 block font-semibold text-slate-300">Customer / Company Name <span className="text-red-500">*</span></label>
                              <input
                                type="text"
                                value={customCustomer.name}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, name: e.target.value }))}
                                required
                                placeholder="e.g. Al-Futtaim Engineering LLC"
                                className="w-full rounded-lg border border-amber-500/50 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-semibold text-slate-300">Project / Site Name (Optional)</label>
                              <input
                                type="text"
                                value={customCustomer.project_name}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, project_name: e.target.value }))}
                                placeholder="e.g. Dubai Marina Phase 1"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-semibold text-slate-300">TRN (Optional)</label>
                              <input
                                type="text"
                                value={customCustomer.trn}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, trn: e.target.value }))}
                                placeholder="100XXXXXXXXX003"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="mb-1 block font-semibold text-slate-300">Address / Location</label>
                              <input
                                type="text"
                                value={customCustomer.address}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="Office / Street / City"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-semibold text-slate-300">Contact Person</label>
                              <input
                                type="text"
                                value={customCustomer.contact_person}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, contact_person: e.target.value }))}
                                placeholder="Contact name"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-semibold text-slate-300">Contact Mobile / Phone</label>
                              <input
                                type="text"
                                value={customCustomer.phone}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="+971 50 123 4567"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="mb-1 block font-semibold text-slate-300">Contact Email</label>
                              <input
                                type="email"
                                value={customCustomer.email}
                                onChange={e => setCustomCustomer(prev => ({ ...prev, email: e.target.value }))}
                                placeholder="accounts@customer.ae"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block font-semibold text-slate-300">Amount Received (AED) <span className="text-red-500">*</span></label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.amount}
                          onChange={e => setForm({ ...form, amount: e.target.value })}
                          required
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-center font-mono font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block font-semibold text-slate-300">Payment Method</label>
                        <select
                          value={form.payment_method}
                          onChange={e => setForm({ ...form, payment_method: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                        >
                          <option>Cash</option>
                          <option>Cheque</option>
                          <option>Bank Transfer</option>
                          <option>Credit Card</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block font-semibold text-slate-300">Invoice Link</label>
                        <select
                          value={form.tax_invoice_id}
                          onChange={e => setForm({ ...form, tax_invoice_id: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        >
                          <option value="">— Select Invoice —</option>
                          {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}
                        </select>
                      </div>
                    </div>

                    {form.payment_method === "Cheque" && (
                      <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-700 bg-slate-850 p-3">
                        <div>
                          <label className="mb-1 block font-semibold text-slate-300">Cheque Number</label>
                          <input
                            type="text"
                            value={form.cheque_number}
                            onChange={e => setForm({ ...form, cheque_number: e.target.value })}
                            placeholder="000123"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-semibold text-slate-300">Cheque Date</label>
                          <input
                            type="date"
                            value={form.cheque_date}
                            onChange={e => setForm({ ...form, cheque_date: e.target.value })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-semibold text-slate-300">Bank Name</label>
                          <input
                            type="text"
                            value={form.bank_name}
                            onChange={e => setForm({ ...form, bank_name: e.target.value })}
                            placeholder="e.g. ADCB / ENBD"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block font-semibold text-slate-300">Particulars / Payment Description</label>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        rows={2}
                        placeholder="Being payment for..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>

            {/* RIGHT: Live A4 PDF Preview */}
            <div
              className={`flex-1 flex flex-col bg-slate-950 overflow-hidden relative ${
                previewFullscreen ? "w-full" : ""
              } ${activeTabMobile === "preview" ? "flex" : "hidden lg:flex"}`}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 text-xs text-slate-300 select-none">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-slate-200">WYSIWYG Receipt Voucher Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFullscreen(f => !f)}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    {previewFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    <span className="hidden sm:inline">{previewFullscreen ? "Split View" : "Full Screen"}</span>
                  </button>
                  <div className="flex items-center gap-1 rounded bg-slate-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    >
                      <ZoomOut size={12} />
                    </button>
                    <span
                      onClick={() => setZoom(0.85)}
                      className="px-1.5 text-[10px] font-mono font-bold text-slate-300 cursor-pointer hover:text-amber-400"
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                    >
                      <ZoomIn size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Canvas View */}
              <div
                className="flex-1 overflow-auto designer-scrollbar p-6 sm:p-8 flex justify-center items-start overscroll-contain bg-slate-950"
                style={{
                  backgroundImage: "radial-gradient(circle at center, rgba(148,163,184,0.15) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                {design.ready && design.layout ? (
                  <div
                    style={{
                      width: `${design.layout.page.widthMm * zoom * 3.7795296}px`,
                      height: `${design.layout.page.heightMm * zoom * 3.7795296}px`,
                      flexShrink: 0,
                      position: "relative",
                      margin: "0 auto",
                    }}
                  >
                    <div
                      className="erp-document-surface absolute top-0 left-0 origin-top-left bg-white shadow-2xl rounded-sm border border-slate-300"
                      style={{
                        width: `${design.layout.page.widthMm}mm`,
                        height: `${design.layout.page.heightMm}mm`,
                        transform: `scale(${zoom})`,
                      }}
                    >
                      <DynamicDocumentRenderer
                        layout={design.layout}
                        company={company}
                        data={previewData}
                        isDesignerPreview={false}
                        scale={1}
                        pageNumber={1}
                        totalPages={totalPreviewPages}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                  </div>
                )}
              </div>
            </div>
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
