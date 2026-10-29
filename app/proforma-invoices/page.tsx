"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, FileSpreadsheet, X, Loader2, Pencil, Eye, ArrowRight, Printer, Trash2 } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber } from "@/lib/helpers";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ProformaInvoiceTemplate from "@/components/documents/ProformaInvoiceTemplate";
import PrintModal from "@/components/documents/PrintModal";
import EditDocumentReferenceModal from "@/components/documents/EditDocumentReferenceModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { withCustomerDocumentDetails, stripCustomPartyTags, serializeCustomPartyNotes } from "@/lib/documentCustomer";
import { parseDatabaseError } from "@/lib/paymentTypes";
import DocumentSplitScreenEditor, {
  DocumentEditorFormState,
  EditorLineItem,
} from "@/components/documents/DocumentSplitScreenEditor";

type Customer = { id: string; name: string | null; customer_code: string | null; trn?: string | null; address?: string | null; contact_person?: string | null; phone?: string | null; mobile?: string | null; email?: string | null; active?: boolean | null };
type Product = { id: string; name: string | null; sku: string | null; selling_price: number | null; vat_rate: number | null; unit?: string | null };
type LineItem = { id?: string; product_id: string; description: string; quantity: number; unit?: string; unit_price: number; discount_pct: number; vat_rate: number; line_total: number; vat_amount: number; sort_order: number };
// DB: proforma_invoices has: valid_until (not due_date), no project_id, no payment_terms
type PI = {
  id: string;
  company_id: string;
  proforma_number: string | null;
  customer_id: string | null;
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  custom_project_name?: string | null;
  is_custom_customer?: boolean | null;
  custom_customer?: unknown;
  quotation_id: string | null;
  proforma_date: string | null;
  valid_until: string | null;
  status: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  notes: string | null;
  created_at: string | null;
};
type PIForm = {
  customer_id: string;
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  custom_project_name?: string;
  is_custom_customer?: boolean;
  proforma_date: string;
  valid_until: string;
  status: string;
  payment_terms: string;
  notes: string;
};
const emptyForm: PIForm = { customer_id:"", proforma_date: todayISO(), valid_until:"", status:"draft", payment_terms:"30 days", notes:"" };
const emptyLine = (): LineItem => ({ product_id:"", description:"", quantity:1, unit:"Nos", unit_price:0, discount_pct:0, vat_rate:5, line_total:0, vat_amount:0, sort_order:0 });
// DB schema mapping (verified against live Supabase):
// proforma_invoices: valid_until (NOT due_date), NO project_id, NO payment_terms
// proforma_invoice_items: proforma_invoice_id (FK), discount_percent (NOT discount_pct), NO vat_category

function PIContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<PI[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<PIForm>(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PI | null>(null);
  const [viewing, setViewing] = useState<{pi: PI; lines: LineItem[]} | null>(null);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [printRec, setPrintRec] = useState<{pi: PI; lines: LineItem[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  useEffect(() => {
    loadAll().then(() => {
      const qid = searchParams.get("from_quotation");
      if (qid) loadFromQuotation(qid);
    });
  // Load the initial list and optional quotation conversion once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: pi }, { data: c }, { data: p }, co] = await Promise.all([
      supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code, trn, address, contact_person, phone, mobile, email, active").order("name"),
      supabase.from("products").select("id, name, sku, selling_price, vat_rate, unit").eq("active", true).order("name"),
      getCurrentCompany(),
    ]);
    setInvoices(((pi || []) as PI[]).map(item => withCustomerDocumentDetails(item) as PI));
    setCustomers((c || []) as Customer[]);
    setProducts((p || []) as Product[]);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  async function openPrint(pi: PI) {
    const { data: rawItems } = await supabase.from("proforma_invoice_items").select("*").eq("proforma_invoice_id", pi.id).order("sort_order");
    type DBItem = { id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; sort_order?: number; unit?: string };
    const mapped = (rawItems || []).map((it: DBItem) => ({
      ...emptyLine(),
      ...it,
      discount_pct: Number(it.discount_percent ?? 0),
    }));
    const customer = customers.find((item) => item.id === pi.customer_id);
    setPrintRec({ pi: withCustomerDocumentDetails({ ...pi, customer }) as PI, lines: mapped as LineItem[] });
  }

  async function loadFromQuotation(quotationId: string) {
    const { data: q } = await supabase.from("quotations").select("*").eq("id", quotationId).single();
    const { data: items } = await supabase.from("quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order");
    if (q) {
      const enrichedQ = withCustomerDocumentDetails(q);
      setForm(f => ({
        ...f,
        customer_id: enrichedQ.customer_id || "",
        notes: enrichedQ.notes || "",
        payment_terms: enrichedQ.payment_terms || ((enrichedQ as Record<string, unknown>).terms as string) || "30 days",
      }));
      type QuotationItemSource = { product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; sort_order?: number };
      setLines(((items || []) as QuotationItemSource[]).map((it) => ({
        product_id: it.product_id || "",
        description: it.description || "",
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        discount_pct: Number(it.discount_percent ?? 0), // DB: discount_percent
        vat_rate: Number(it.vat_rate ?? 5),
        line_total: Number(it.line_total) || 0,
        vat_amount: Number(it.vat_amount) || 0,
        sort_order: Number(it.sort_order) || 0,
        id: undefined,
      })));
      setShowForm(true);
    }
  }

  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(emptyForm); setLines([emptyLine()]); setShowForm(true); }
  async function openEdit(pi: PI) {
    setError(""); setSuccess("");
    const enriched = withCustomerDocumentDetails(pi) as PI;
    setEditing(enriched);
    setForm({
      customer_id: enriched.customer_id||"",
      customer_name: enriched.customer_name,
      customer_trn: enriched.customer_trn,
      customer_address: enriched.customer_address,
      contact_person: enriched.contact_person,
      contact_number: enriched.contact_number,
      contact_email: enriched.contact_email,
      custom_project_name: enriched.custom_project_name || undefined,
      is_custom_customer: enriched.is_custom_customer || false,
      proforma_date: enriched.proforma_date||todayISO(),
      valid_until: enriched.valid_until||"",
      status: (enriched.status||"draft").toLowerCase(),
      payment_terms: (enriched as { terms_conditions?: string | null }).terms_conditions||"",
      notes: enriched.notes||""
    });
    const { data: items } = await supabase.from("proforma_invoice_items").select("*").eq("proforma_invoice_id", pi.id).order("sort_order");
    // Map DB discount_percent back to UI discount_pct
    type DBItem = { id?: string; proforma_invoice_id?: string; product_id?: string; description?: string; quantity?: number; unit?: string; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; sort_order?: number };
    setLines((items||[]).length>0?(items as DBItem[]).map(it => ({ ...it, discount_pct: Number(it.discount_percent ?? 0) } as LineItem)):[emptyLine()]);
    setShowForm(true);
  }
  async function openView(pi: PI) {
    const { data: items } = await supabase.from("proforma_invoice_items").select("*").eq("proforma_invoice_id", pi.id).order("sort_order");
    setViewing({ pi: withCustomerDocumentDetails(pi) as PI, lines: (items||[]) as LineItem[] });
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function handleSaveSplitScreen(payload: {
    form: DocumentEditorFormState;
    lines: EditorLineItem[];
    subtotal: number;
    vat_amount: number;
    total_amount: number;
  }) {
    setError("");
    setSuccess("");
    const isCustom = Boolean(payload.form.is_custom_customer);
    if (!isCustom && !payload.form.customer_id) {
      const msg = "Please select an existing customer or enter custom customer details.";
      setError(msg);
      throw new Error(msg);
    }
    if (isCustom && !payload.form.customer_name?.trim()) {
      const msg = "Please enter the custom customer / company name.";
      setError(msg);
      throw new Error(msg);
    }
    if (!payload.lines || payload.lines.length === 0 || !payload.lines.some((l) => l.description?.trim())) {
      const msg = "Please add at least one line item with a description.";
      setError(msg);
      throw new Error(msg);
    }
    setSaving(true);
    try {
      const customPayload = isCustom
        ? {
            name: payload.form.customer_name?.trim() || "",
            address: payload.form.customer_address || "",
            contact_person: payload.form.contact_person || "",
            phone: payload.form.contact_number || "",
            email: payload.form.contact_email || "",
            trn: payload.form.customer_trn || "",
            project_name: payload.form.custom_project_name || "",
          }
        : null;

      const selectedCustomer = !isCustom && payload.form.customer_id
        ? customers.find((c) => c.id === payload.form.customer_id)
        : null;

      // Status check constraint normalization: only allowed DB statuses
      const validStatuses = ["draft", "sent", "accepted", "invoiced", "cancelled"];
      let normalizedStatus = (payload.form.status || "draft").toLowerCase();
      if (normalizedStatus === "issued" || normalizedStatus === "final") {
        normalizedStatus = "sent";
      } else if (normalizedStatus === "approved") {
        normalizedStatus = "accepted";
      } else if (!validStatuses.includes(normalizedStatus)) {
        normalizedStatus = "draft";
      }

      const notesContent = isCustom && customPayload
        ? serializeCustomPartyNotes((payload.form.notes || "").trim(), customPayload)
        : (payload.form.notes || "").trim() || null;

      // Tier 1: Full payload with custom columns and terms_conditions
      const tier1Payload: Record<string, unknown> = {
        customer_id: isCustom ? null : payload.form.customer_id || null,
        customer_name: isCustom ? payload.form.customer_name?.trim() : (selectedCustomer?.name || null),
        customer_address: isCustom ? payload.form.customer_address || null : (selectedCustomer?.address || null),
        customer_trn: isCustom ? payload.form.customer_trn || null : (selectedCustomer?.trn || null),
        contact_person: isCustom ? payload.form.contact_person || null : (selectedCustomer?.contact_person || null),
        contact_number: isCustom ? payload.form.contact_number || null : (selectedCustomer?.phone || selectedCustomer?.mobile || null),
        contact_email: isCustom ? payload.form.contact_email || null : (selectedCustomer?.email || null),
        custom_project_name: isCustom ? payload.form.custom_project_name || null : null,
        is_custom_customer: isCustom,
        custom_customer: customPayload,
        proforma_date: payload.form.invoice_date || null,
        valid_until: payload.form.supply_date || null,
        terms_conditions: payload.form.payment_terms?.trim() || null,
        status: normalizedStatus,
        subtotal: payload.subtotal,
        vat_amount: payload.vat_amount,
        total_amount: payload.total_amount,
        notes: notesContent,
        updated_at: new Date().toISOString(),
      };

      const executeSave = async (recordPayload: Record<string, unknown>) => {
        if (editing) {
          const { error: err } = await supabase.from("proforma_invoices").update(recordPayload).eq("id", editing.id);
          if (err) throw err;
          return { id: editing.id, proformaNumber: editing.proforma_number || editing.id };
        } else {
          const cid = company?.id || (await getCompanyId());
          let pno = await generateDocNumber(cid, "PRO");
          let insertedId = "";
          let attempts = 0;
          while (attempts < 3) {
            attempts++;
            const { data: ins, error: err } = await supabase.from("proforma_invoices").insert({
              company_id: cid,
              proforma_number: pno,
              ...recordPayload,
            }).select("id");
            if (err) {
              if (err.code === "23505" && attempts < 3) {
                pno = await generateDocNumber(cid, "PRO");
                continue;
              }
              throw err;
            }
            insertedId = ins?.[0]?.id || "";
            break;
          }
          if (!insertedId) {
            // RLS fallback: fetch generated record by number
            const { data: fetched } = await supabase
              .from("proforma_invoices")
              .select("id")
              .eq("company_id", cid)
              .eq("proforma_number", pno)
              .maybeSingle();
            return { id: fetched?.id || "", proformaNumber: pno };
          }
          return { id: insertedId, proformaNumber: pno };
        }
      };

      let saveRes: { id: string; proformaNumber: string };
      try {
        saveRes = await executeSave(tier1Payload);
      } catch (tier1Err: unknown) {
        const t1 = tier1Err as { message?: string; code?: string };
        const isColErr = t1?.message && (t1.message.includes("column") || t1.code === "PGRST204" || t1.code === "42703");
        const isNotNullCustomer = t1?.code === "23502" && (t1?.message?.includes("customer_id") || JSON.stringify(t1).includes("customer_id"));

        if (isColErr) {
          // Tier 2: Try without terms_conditions
          const tier2Payload = { ...tier1Payload };
          delete tier2Payload.terms_conditions;
          try {
            saveRes = await executeSave(tier2Payload);
          } catch (tier2Err: unknown) {
            const t2 = tier2Err as { message?: string; code?: string };
            const isT2ColErr = t2?.message && (t2.message.includes("column") || t2.code === "PGRST204" || t2.code === "42703");
            if (isT2ColErr) {
              // Tier 3: Core baseline columns only, with custom customer encoded in notes
              const tier3Payload: Record<string, unknown> = {
                customer_id: isCustom ? null : payload.form.customer_id || null,
                proforma_date: payload.form.invoice_date || null,
                valid_until: payload.form.supply_date || null,
                status: normalizedStatus,
                subtotal: payload.subtotal,
                vat_amount: payload.vat_amount,
                total_amount: payload.total_amount,
                notes: notesContent,
                updated_at: new Date().toISOString(),
              };
              try {
                saveRes = await executeSave(tier3Payload);
              } catch (tier3Err: unknown) {
                const t3 = tier3Err as { message?: string; code?: string };
                if (isCustom && (t3?.code === "23502" || t3?.message?.includes("customer_id")) && customers.length > 0) {
                  // Tier 4: NOT NULL on customer_id violated; use fallback customer ID
                  tier3Payload.customer_id = customers[0].id;
                  saveRes = await executeSave(tier3Payload);
                } else {
                  throw tier3Err;
                }
              }
            } else {
              throw tier2Err;
            }
          }
        } else if (isNotNullCustomer && isCustom && customers.length > 0) {
          // Tier 4 fallback directly from Tier 1 failure
          const tier4Payload = { ...tier1Payload, customer_id: customers[0].id };
          saveRes = await executeSave(tier4Payload);
        } else {
          throw tier1Err;
        }
      }
      const pid = saveRes.id;

      // Upsert proforma line items if proforma ID is available
      if (pid) {
        try {
          const { data: existingItems } = await supabase.from("proforma_invoice_items").select("id").eq("proforma_invoice_id", pid);
          const existingIds = new Set((existingItems || []).map((it: { id: string }) => it.id));
          const currentIds = new Set<string>();

          for (let i = 0; i < payload.lines.length; i++) {
            const l = payload.lines[i];
            const itemPayload: Record<string, unknown> = {
              product_id: l.product_id || null,
              description: l.description,
              quantity: Number(l.quantity) || 0,
              unit: l.unit || "Nos",
              unit_price: Number(l.unit_price) || 0,
              discount_percent: Number(l.discount_pct) || 0,
              vat_rate: Number(l.vat_rate) || 0,
              line_total: Number(l.line_total) || 0,
              vat_amount: Number(l.vat_amount) || 0,
              sort_order: i,
            };

            const executeItemUpsert = async (payloadToSave: Record<string, unknown>) => {
              if (l.id && existingIds.has(l.id)) {
                const { error: updErr } = await supabase.from("proforma_invoice_items").update(payloadToSave).eq("id", l.id);
                if (updErr) throw updErr;
                currentIds.add(l.id);
              } else {
                const { data: insItem, error: insErr } = await supabase.from("proforma_invoice_items").insert({
                  proforma_invoice_id: pid,
                  ...payloadToSave,
                }).select("id");
                if (insErr) throw insErr;
                const insId = insItem?.[0]?.id;
                if (insId) currentIds.add(insId);
              }
            };

            try {
              await executeItemUpsert(itemPayload);
            } catch (itemErr: unknown) {
              const iErr = itemErr as { message?: string; code?: string };
              if (iErr?.message && (iErr.message.includes("column") || iErr.code === "PGRST204" || iErr.code === "42703")) {
                // Graceful fallback if 'unit' column is missing in legacy schema
                const fallbackPayload = { ...itemPayload };
                delete fallbackPayload.unit;
                try {
                  await executeItemUpsert(fallbackPayload);
                } catch (itemErr2: unknown) {
                  const iErr2 = itemErr2 as { message?: string; code?: string };
                  if (iErr2?.message && (iErr2.message.includes("column") || iErr2.code === "PGRST204" || iErr2.code === "42703")) {
                    const minimalItemPayload = {
                      product_id: l.product_id || null,
                      description: l.description,
                      quantity: Number(l.quantity) || 0,
                      unit_price: Number(l.unit_price) || 0,
                      vat_rate: Number(l.vat_rate) || 0,
                      line_total: Number(l.line_total) || 0,
                      sort_order: i,
                    };
                    await executeItemUpsert(minimalItemPayload);
                  } else {
                    throw itemErr2;
                  }
                }
              } else {
                throw itemErr;
              }
            }
          }

          const toDelete = [...existingIds].filter((id) => !currentIds.has(id));
          if (toDelete.length > 0) {
            const { error: delErr } = await supabase.from("proforma_invoice_items").delete().in("id", toDelete);
            if (delErr) throw delErr;
          }
        } catch (itemErr: unknown) {
          // Atomic cleanup: If line items fail on a new document, rollback the created header
          // so an incomplete invoice is never left behind
          if (!editing && pid) {
            try {
              await supabase.from("proforma_invoice_items").delete().eq("proforma_invoice_id", pid);
              await supabase.from("proforma_invoices").delete().eq("id", pid);
            } catch (cleanupErr) {
              console.error("Failed to clean up incomplete proforma invoice:", cleanupErr);
            }
          }
          throw itemErr;
        }
      }

      setSuccess(`Proforma invoice ${saveRes.proformaNumber} ${editing ? "updated" : "saved"} successfully.`);
      setShowForm(false);
      setEditing(null);
      await loadAll();
    } catch (err: unknown) {
      const msg = parseDatabaseError(err, "Failed to save proforma invoice. Please check required fields and network.");
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }

  const custMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const filtered = invoices.filter(pi => {
    if (filterStatus && pi.status?.toLowerCase()!==filterStatus.toLowerCase()) return false;
    const cn = pi.customer_name || custMap[pi.customer_id||""]?.name||"";
    const pn = pi.custom_project_name || "";
    return [pi.proforma_number, cn, pn, pi.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });

  async function deleteProforma(pi: PI) {
    if (!window.confirm(`Are you sure you want to delete proforma invoice ${pi.proforma_number || "this proforma"}? This cannot be undone.`)) {
      return;
    }
    setError("");
    try {
      const { error: itemDeleteErr } = await supabase.from("proforma_invoice_items").delete().eq("proforma_invoice_id", pi.id);
      if (itemDeleteErr) throw itemDeleteErr;
      const { error: delErr } = await supabase.from("proforma_invoices").delete().eq("id", pi.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete proforma invoice ${pi.proforma_number} because it has been converted to tax invoices or referenced by other records.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Proforma invoice ${pi.proforma_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete proforma invoice.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileSpreadsheet size={22} /></div><div><h1 className="text-2xl font-bold text-slate-900">Proforma Invoices</h1><p className="text-sm text-slate-500">Create and manage proforma invoices</p></div></div>
        <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />New Proforma</button>
      </div></header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
        <div className="mb-6 flex gap-3"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search proformas…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"/></div><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"><option value="">All Status</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="invoiced">Invoiced</option><option value="cancelled">Cancelled</option></select></div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400"/></div> : filtered.length===0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-300"/><p className="text-sm text-slate-500">No proforma invoices.</p></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-3">No.</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Valid Until</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map(pi=>(
                <tr key={pi.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{pi.proforma_number||"—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap font-semibold text-slate-900">
                      <span>{pi.customer_name || custMap[pi.customer_id||""]?.name||"—"}</span>
                      {pi.is_custom_customer && (
                        <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                          Custom
                        </span>
                      )}
                    </div>
                    {pi.custom_project_name && (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                        📁 {pi.custom_project_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(pi.proforma_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(pi.valid_until)}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(pi.total_amount)}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(pi.status||"Draft")}`}>{pi.status||"Draft"}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-center gap-1">
                    <button onClick={()=>openView(pi)} title="View Summary" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"><Eye size={14}/></button>
                    <button onClick={()=>openPrint(pi)} title="Print / PDF" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"><Printer size={14}/></button>
                    {["draft", "sent"].includes((pi.status||"").toLowerCase())&&<button onClick={()=>openEdit(pi)} title="Edit Proforma" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"><Pencil size={14}/></button>}
                    {!(["cancelled", "invoiced"].includes((pi.status||"").toLowerCase()))&&<button onClick={()=>router.push(`/tax-invoices?from_proforma=${pi.id}`)} title="Convert to Tax Invoice" className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 cursor-pointer"><ArrowRight size={14}/></button>}
                    <button onClick={()=>deleteProforma(pi)} title="Delete Proforma Invoice" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"><Trash2 size={14}/></button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Split-Screen Form & PDF Preview */}
      {showForm && (
        <DocumentSplitScreenEditor
          isOpen={showForm}
          onClose={closeForm}
          documentType="proforma_invoice"
          documentTitle="Proforma Invoice"
          documentNumberLabel="Proforma Number"
          company={company}
          initialInvoice={
            editing
              ? {
                  ...editing,
                  // Map DB column terms_conditions → payment_terms so the editor
                  // initialises the payment-terms bullet list correctly.
                  payment_terms:
                    (editing as unknown as { terms_conditions?: string | null }).terms_conditions ||
                    editing.notes ||
                    "30 days",
                }
              : {
                  customer_id: form.customer_id,
                  customer_name: form.customer_name,
                  customer_trn: form.customer_trn,
                  customer_address: form.customer_address,
                  contact_person: form.contact_person,
                  contact_number: form.contact_number,
                  contact_email: form.contact_email,
                  custom_project_name: form.custom_project_name,
                  is_custom_customer: form.is_custom_customer,
                  proforma_date: form.proforma_date,
                  valid_until: form.valid_until,
                  status: form.status,
                  payment_terms: form.payment_terms || "30 days",
                  notes: form.notes,
                }
          }
          initialLines={lines.map((l) => ({
            id: l.id,
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "Nos",
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            taxable_amount:
              l.quantity * l.unit_price -
              l.quantity * l.unit_price * (l.discount_pct / 100),
            vat_amount: l.vat_amount,
            line_total: l.line_total,
          }))}
          customers={customers}
          products={products}
          onSave={handleSaveSplitScreen}
          saving={saving}
          onRename={
            editing && (company?.id || editing.company_id)
              ? () => setShowRenameModal(true)
              : undefined
          }
        />
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setViewing(null)}/>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Proforma {viewing.pi.proforma_number}</h2>
                <p className="text-sm text-slate-500">{custMap[viewing.pi.customer_id||""]?.name}</p>
              </div>
              <div className="flex gap-2 items-center">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(viewing.pi.status||"Draft")}`}>{viewing.pi.status}</span>
                <button
                  onClick={() => {
                    const target = viewing.pi;
                    setViewing(null);
                    openPrint(target);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  <Printer size={13} /> Print / Save PDF
                </button>
                <button
                  onClick={() => {
                    const target = viewing.pi;
                    setViewing(null);
                    deleteProforma(target);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 size={13} /> Delete
                </button>
                <button onClick={()=>setViewing(null)}><X size={20}/></button>
              </div>
            </div>
            <table className="w-full text-sm mb-4"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-center">VAT%</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{viewing.lines.map((l,i)=><tr key={i}><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-center">{l.quantity}</td><td className="px-3 py-2 text-right">{fmtAED(l.unit_price)}</td><td className="px-3 py-2 text-center">{l.vat_rate}%</td><td className="px-3 py-2 text-right">{fmtAED(l.vat_amount)}</td><td className="px-3 py-2 text-right font-semibold">{fmtAED(l.line_total)}</td></tr>)}</tbody></table>
            <div className="flex justify-end"><div className="w-64 space-y-1 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(viewing.pi.subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>VAT</span><span>{fmtAED(viewing.pi.vat_amount)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmtAED(viewing.pi.total_amount)}</span></div></div></div>
          </div>
        </div>
      )}
      </div>

      {/* A4 Print Modal */}
      {printRec && (
        <PrintModal isOpen={!!printRec} onClose={() => setPrintRec(null)}>
          <ProformaInvoiceTemplate
            company={company}
            proforma={{
              proforma_number: printRec.pi.proforma_number || "PRO",
              proforma_date: printRec.pi.proforma_date || "",
              customer_name: printRec.pi.customer_name || "",
              customer_trn: printRec.pi.customer_trn,
              customer_address: printRec.pi.customer_address,
              contact_person: printRec.pi.contact_person,
              contact_number: printRec.pi.contact_number,
              contact_email: printRec.pi.contact_email,
              payment_terms: (printRec.pi as unknown as { terms_conditions?: string | null }).terms_conditions || printRec.pi.notes || undefined,
              notes: stripCustomPartyTags(printRec.pi.notes) || undefined,
              status: printRec.pi.status,
              subtotal: printRec.pi.subtotal || 0,
              vat_amount: printRec.pi.vat_amount || 0,
              total_amount: printRec.pi.total_amount || 0,
              items: printRec.lines.map(l => ({
                description: l.description,
                quantity: l.quantity,
                unit: l.unit || "Nos",
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                taxable_amount: (l.quantity * l.unit_price) * (1 - (l.discount_pct || 0) / 100),
                vat_rate: l.vat_rate,
                vat_amount: l.vat_amount,
                line_total: l.line_total,
              })),
            }}
            onClose={() => setPrintRec(null)}
          />
        </PrintModal>
      )}

      {showRenameModal && editing && (company?.id || editing.company_id) && (
        <EditDocumentReferenceModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          companyId={company?.id || editing.company_id}
          docType="proforma_invoice"
          documentId={editing.id}
          currentReferenceNumber={editing.proforma_number || ""}
          onSuccess={(newNum) => {
            setEditing((prev) => (prev ? { ...prev, proforma_number: newNum } : prev));
            loadAll();
            setSuccess(`Proforma reference updated to ${newNum}`);
          }}
        />
      )}
    </main>
  );
}

export default function ProformaInvoicesPage() {
  return <Suspense><PIContent /></Suspense>;
}
