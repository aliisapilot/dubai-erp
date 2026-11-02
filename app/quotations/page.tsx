"use client";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, FileText, X, Save, Loader2, Pencil, Eye, ArrowRight, Printer, Trash2 } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem, formatDisplayDocNumber } from "@/lib/helpers";
import { useRouter } from "next/navigation";
import QuotationTemplate from "@/components/documents/QuotationTemplate";
import PrintModal from "@/components/documents/PrintModal";
import EditDocumentReferenceModal from "@/components/documents/EditDocumentReferenceModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { withCustomerDocumentDetails, stripCustomPartyTags } from "@/lib/documentCustomer";
import { parseDatabaseError } from "@/lib/paymentTypes";
import DocumentSplitScreenEditor, {
  DocumentEditorFormState,
  EditorLineItem,
} from "@/components/documents/DocumentSplitScreenEditor";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null; address: string | null; contact_person: string | null; phone: string | null; mobile: string | null; email: string | null; active: boolean | null };
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

type Quotation = {
  id: string;
  company_id: string;
  quotation_number: string | null;
  customer_id: string | null;
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string | null;
  contact_mobile?: string | null;
  contact_number?: string;
  contact_email?: string | null;
  custom_project_name?: string | null;
  is_custom_customer?: boolean | null;
  custom_customer?: unknown;
  project_id?: string | null;
  quotation_date: string | null;
  expiry_date: string | null;
  status: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  notes: string | null;
  terms: string | null;
  payment_terms?: string | null;
  created_at: string | null;
};
type QForm = {
  customer_id: string;
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  custom_project_name?: string;
  is_custom_customer?: boolean;
  project_id: string;
  quotation_date: string;
  expiry_date: string;
  status: string;
  notes: string;
  terms: string;
};

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
  const [showRenameModal, setShowRenameModal] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: q }, { data: c }, { data: p }, { data: prjs }, co] = await Promise.all([
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code, trn, address, contact_person, phone, mobile, email, active").order("name"),
      supabase.from("products").select("id, name, sku, selling_price, vat_rate, unit").eq("active", true).order("name"),
      supabase.from("projects").select("id, name, project_number").order("created_at", { ascending: false }),
      getCurrentCompany(),
    ]);
    setQuotations(((q || []) as Quotation[]).map(item => withCustomerDocumentDetails(item) as Quotation));
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
    const customer = customers.find((item) => item.id === q.customer_id);
    setPrintRec({ q: withCustomerDocumentDetails({ ...q, customer }) as Quotation, lines: mapped as LineItem[] });
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
    const enriched = withCustomerDocumentDetails(q) as Quotation;
    setEditing(enriched);
    setForm({
      customer_id: enriched.customer_id || "",
      project_id: enriched.project_id || "",
      quotation_date: enriched.quotation_date || todayISO(),
      expiry_date: enriched.expiry_date || "",
      status: normalizeQuotationStatus(enriched.status),
      notes: enriched.notes || "",
      terms: enriched.terms || ""
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
      vat_rate: Number(it.vat_rate ?? 5),
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
      vat_rate: Number(it.vat_rate ?? 5),
      vat_category: it.vat_category || "Standard Rated",
      line_total: Number(it.line_total) || 0,
      vat_amount: Number(it.vat_amount) || 0,
      sort_order: Number(it.sort_order) || 0,
      unit: it.unit || "Nos",
    }));
    setViewing({ q: withCustomerDocumentDetails(q) as Quotation, lines: mapped });
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
        // Upsert line items: preserve existing IDs, insert new ones, delete removed ones
        const { data: existingItems } = await supabase.from("quotation_items").select("id").eq("quotation_id", qid);
        const existingIds = new Set((existingItems || []).map((it: { id: string }) => it.id));
        const currentIds = new Set<string>();
        for (const l of lines) {
          const qty = Number(l.quantity) || 0;
          const price = Number(l.unit_price) || 0;
          const discPct = Number(l.discount_percent ?? l.discount_pct ?? 0);
          const gross = qty * price;
          const discAmt = gross * (discPct / 100);
          const taxable = gross - discAmt;
          const vatRate = Number(l.vat_rate) || 0;
          const vatAmt = Number(l.vat_amount) || (taxable * (vatRate / 100));
          const lineTot = Number(l.line_total) || (taxable + vatAmt);
          if (l.id && existingIds.has(l.id)) {
            const { error: updErr } = await supabase.from("quotation_items").update({ product_id: l.product_id||null, description: l.description, quantity: qty, unit: l.unit||"Nos", unit_price: price, discount_percent: discPct, discount_amount: discAmt, taxable_amount: taxable, vat_rate: vatRate, vat_amount: vatAmt, line_total: lineTot }).eq("id", l.id);
            if (updErr) throw new Error(updErr.message);
            currentIds.add(l.id);
          } else {
            const { error: insErr } = await supabase.from("quotation_items").insert({ quotation_id: qid, product_id: l.product_id||null, description: l.description, quantity: qty, unit: l.unit||"Nos", unit_price: price, discount_percent: discPct, discount_amount: discAmt, taxable_amount: taxable, vat_rate: vatRate, vat_amount: vatAmt, line_total: lineTot, sort_order: lines.indexOf(l) });
            if (insErr) throw new Error(insErr.message);
          }
        }
        const toDelete = [...existingIds].filter(id => !currentIds.has(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from("quotation_items").delete().in("id", toDelete);
          if (delErr) throw new Error(delErr.message);
        }
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
      setSuccess(editing ? "Quotation updated." : "Quotation created.");
      closeForm(); await loadAll();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  }

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
      const err = new Error("Please select an existing customer or enter custom customer details.");
      setError(err.message);
      throw err;
    }
    if (isCustom && !payload.form.customer_name?.trim()) {
      const err = new Error("Please enter the custom customer / company name.");
      setError(err.message);
      throw err;
    }
    setSaving(true);
    try {
      const dbStatus = normalizeQuotationStatus(payload.form.status);
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

      const rawNotes = payload.form.notes?.trim() || "";

      const dataPayload: Record<string, unknown> = {
        customer_id: isCustom ? null : payload.form.customer_id || null,
        customer_name: isCustom ? payload.form.customer_name?.trim() : null,
        customer_address: isCustom ? payload.form.customer_address || null : null,
        customer_trn: isCustom ? payload.form.customer_trn || null : null,
        contact_person: isCustom ? payload.form.contact_person || null : null,
        contact_number: isCustom ? payload.form.contact_number || null : null,
        contact_email: isCustom ? payload.form.contact_email || null : null,
        custom_project_name: isCustom ? payload.form.custom_project_name || null : null,
        is_custom_customer: isCustom,
        custom_customer: customPayload,
        project_id: payload.form.project_id || null,
        quotation_date: payload.form.invoice_date || null,
        expiry_date: payload.form.supply_date || null,
        status: String(dbStatus),
        subtotal: payload.subtotal,
        discount_amount: 0,
        vat_amount: payload.vat_amount,
        total_amount: payload.total_amount,
        payment_terms: payload.form.payment_terms || null,
        notes: rawNotes || null,
        terms: payload.form.terms?.trim() || payload.form.payment_terms || null,
        updated_at: new Date().toISOString(),
      };

      const executeSave = async (recordPayload: Record<string, unknown>) => {
        if (editing) {
          const { error: err } = await supabase.from("quotations").update(recordPayload).eq("id", editing.id);
          if (err) throw err;
          return { id: editing.id, quotationNumber: editing.quotation_number || editing.id };
        } else {
          const cid = company?.id || (await getCompanyId());
          let qno = await generateDocNumber(cid, "QUO");
          let insertedId = "";
          let attempts = 0;
          while (attempts < 3) {
            attempts++;
            const { data: ins, error: err } = await supabase.from("quotations").insert({
              company_id: cid,
              quotation_number: qno,
              ...recordPayload,
            }).select("id");
            if (err) {
              if (err.code === "23505" && attempts < 3) {
                qno = await generateDocNumber(cid, "QUO");
                continue;
              }
              throw err;
            }
            insertedId = ins?.[0]?.id || "";
            break;
          }
          if (!insertedId) {
            const { data: fetched } = await supabase
              .from("quotations")
              .select("id")
              .eq("company_id", cid)
              .eq("quotation_number", qno)
              .maybeSingle();
            return { id: fetched?.id || "", quotationNumber: qno };
          }
          return { id: insertedId, quotationNumber: qno };
        }
      };

      let saveRes: { id: string; quotationNumber: string };
      try {
        saveRes = await executeSave(dataPayload);
      } catch (saveErr: unknown) {
        const errObj = saveErr as { message?: string; code?: string };
        const isColErr = errObj?.message && (errObj.message.includes("column") || errObj.code === "PGRST204" || errObj.code === "42703");
        const isNotNullCustomer = errObj?.code === "23502" && (errObj?.message?.includes("customer_id") || JSON.stringify(errObj).includes("customer_id"));

        if (isColErr) {
          const minimalPayload: Record<string, unknown> = {
            customer_id: isCustom ? null : payload.form.customer_id || null,
            project_id: payload.form.project_id || null,
            quotation_date: payload.form.invoice_date || null,
            expiry_date: payload.form.supply_date || null,
            status: String(dbStatus),
            subtotal: payload.subtotal,
            discount_amount: 0,
            vat_amount: payload.vat_amount,
            total_amount: payload.total_amount,
            notes: rawNotes || null,
            terms: payload.form.terms?.trim() || payload.form.payment_terms || null,
            updated_at: new Date().toISOString(),
          };
          try {
            saveRes = await executeSave(minimalPayload);
          } catch (minErr: unknown) {
            const mErr = minErr as { message?: string; code?: string };
            const isMinColErr = mErr?.message && (mErr.message.includes("column") || mErr.code === "PGRST204" || mErr.code === "42703");
            if (isMinColErr) {
              // Tier 3: base legacy columns without updated_at
              const tier3Payload: Record<string, unknown> = {
                customer_id: isCustom ? null : payload.form.customer_id || null,
                project_id: payload.form.project_id || null,
                quotation_date: payload.form.invoice_date || null,
                expiry_date: payload.form.supply_date || null,
                status: String(dbStatus),
                subtotal: payload.subtotal,
                discount_amount: 0,
                vat_amount: payload.vat_amount,
                total_amount: payload.total_amount,
                notes: rawNotes || null,
                terms: payload.form.terms?.trim() || payload.form.payment_terms || null,
              };
              try {
                saveRes = await executeSave(tier3Payload);
              } catch (t3Err: unknown) {
                const t3 = t3Err as { message?: string; code?: string };
                if (isCustom && (t3?.code === "23502" || t3?.message?.includes("customer_id")) && customers.length > 0) {
                  tier3Payload.customer_id = customers[0].id;
                  saveRes = await executeSave(tier3Payload);
                } else {
                  throw t3Err;
                }
              }
            } else if (isCustom && (mErr?.code === "23502" || mErr?.message?.includes("customer_id")) && customers.length > 0) {
              minimalPayload.customer_id = customers[0].id;
              saveRes = await executeSave(minimalPayload);
            } else {
              throw minErr;
            }
          }
        } else if (isNotNullCustomer && isCustom && customers.length > 0) {
          const fallbackWithCustomer = { ...dataPayload, customer_id: customers[0].id };
          saveRes = await executeSave(fallbackWithCustomer);
        } else {
          throw saveErr;
        }
      }
      const qid = saveRes.id;

      // Upsert line items
      try {
        const { data: existingItems } = await supabase.from("quotation_items").select("id").eq("quotation_id", qid);
        const existingIds = new Set((existingItems || []).map((it: { id: string }) => it.id));
        const currentIds = new Set<string>();
        for (let i = 0; i < payload.lines.length; i++) {
          const l = payload.lines[i];
          const qty = Number(l.quantity) || 0;
          const price = Number(l.unit_price) || 0;
          const discPct = Number(l.discount_pct || 0);
          const gross = qty * price;
          const discAmt = gross * (discPct / 100);
          const taxable = gross - discAmt;
          const vatRate = Number(l.vat_rate) || 0;
          const vatAmt = Number(l.vat_amount) || (taxable * (vatRate / 100));
          const lineTot = Number(l.line_total) || (taxable + vatAmt);
          const itemPayload: Record<string, unknown> = {
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
          const upsertItem = async (pLoad: Record<string, unknown>) => {
            if (l.id && existingIds.has(l.id)) {
              const { error: updErr } = await supabase.from("quotation_items").update(pLoad).eq("id", l.id);
              if (updErr) throw updErr;
              currentIds.add(l.id);
            } else {
              const { data: insItem, error: insErr } = await supabase.from("quotation_items").insert({
                quotation_id: qid,
                ...pLoad,
              }).select("id");
              if (insErr) throw insErr;
              const insId = insItem?.[0]?.id;
              if (insId) currentIds.add(insId);
            }
          };
          try {
            await upsertItem(itemPayload);
          } catch (itErr: unknown) {
            const iErr = itErr as { message?: string; code?: string };
            if (iErr?.message && (iErr.message.includes("column") || iErr.code === "PGRST204" || iErr.code === "42703")) {
              const fallbackItem = { ...itemPayload };
              delete fallbackItem.unit;
              await upsertItem(fallbackItem);
            } else {
              throw itErr;
            }
          }
        }
        const toDelete = [...existingIds].filter(id => !currentIds.has(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from("quotation_items").delete().in("id", toDelete);
          if (delErr) throw delErr;
        }
      } catch (itemErr: unknown) {
        // Atomic cleanup: If line items fail on a new document, rollback the created header
        if (!editing && qid) {
          try {
            await supabase.from("quotation_items").delete().eq("quotation_id", qid);
            await supabase.from("quotations").delete().eq("id", qid);
          } catch (cleanupErr) {
            console.error("Failed to clean up incomplete quotation:", cleanupErr);
          }
        }
        throw itemErr;
      }

      setSuccess(`Quotation ${saveRes.quotationNumber} ${editing ? "updated" : "saved"} successfully.`);
      closeForm();
      await loadAll();
    } catch (err: unknown) {
      const msg = parseDatabaseError(err, "Failed to save quotation. Please check required fields and network.");
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function convertToProforma(q: Quotation) {
    router.push(`/proforma-invoices?from_quotation=${q.id}`);
  }

  const custMap = Object.fromEntries(customers.map(c=>[c.id,c]));
  const selectableCustomers = customers.filter(c => c.active !== false || c.id === form.customer_id);
  const prjMap = Object.fromEntries(projects.map(p=>[p.id,p]));
  const filtered = quotations.filter(q => {
    if (filterStatus && (q.status || "").toLowerCase() !== filterStatus.toLowerCase()) return false;
    const cname = custMap[q.customer_id||""]?.name||"";
    const pname = prjMap[q.project_id||""]?.name||"";
    const simplifiedNum = formatDisplayDocNumber(q.quotation_number, "quotation");
    return [q.quotation_number, simplifiedNum, cname, pname, formatStatus(q.status), q.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
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

  function quotationActions(q: Quotation, showLabels = false) {
    const status = (q.status || "").toLowerCase();
    const actionClass = showLabels
      ? "flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      : "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700";

    return (
      <>
        <button type="button" onClick={() => openView(q)} title="View" aria-label={`View ${q.quotation_number || "quotation"}`} className={actionClass}>
          <Eye size={showLabels ? 15 : 14} />{showLabels && <span>View</span>}
        </button>
        <button type="button" onClick={() => openPrint(q)} title="Print / PDF Document" aria-label={`Open PDF for ${q.quotation_number || "quotation"}`} className={actionClass}>
          <Printer size={showLabels ? 15 : 14} />{showLabels && <span>PDF</span>}
        </button>
        {(status === "draft" || status === "sent") && (
          <button type="button" onClick={() => openEdit(q)} title="Edit" aria-label={`Edit ${q.quotation_number || "quotation"}`} className={actionClass}>
            <Pencil size={showLabels ? 15 : 14} />{showLabels && <span>Edit</span>}
          </button>
        )}
        {status === "accepted" && (
          <button type="button" onClick={() => convertToProforma(q)} title="Convert to Proforma" aria-label={`Convert ${q.quotation_number || "quotation"} to proforma`} className={`${actionClass} hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700`}>
            <ArrowRight size={showLabels ? 15 : 14} />{showLabels && <span>Proforma</span>}
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteQuotation(q)}
          title="Delete Quotation"
          aria-label={`Delete ${q.quotation_number || "quotation"}`}
          className={`${actionClass} hover:border-red-200 hover:bg-red-50 hover:text-red-600`}
        >
          <Trash2 size={showLabels ? 15 : 14} />{showLabels && <span>Delete</span>}
        </button>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileText size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Quotations</h1><p className="text-sm text-slate-500">Create and manage sales quotations</p></div>
          </div>
          <button onClick={openAdd} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 sm:gap-2 sm:px-4 sm:text-sm"><Plus size={18} /><span className="hidden min-[360px]:inline">New Quotation</span><span className="min-[360px]:hidden">New</span></button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-4 grid grid-cols-4 gap-2 sm:mb-6 sm:gap-4">
          {[["Total",quotations.length,"slate"],["Draft",quotations.filter(q=>(q.status||"").toLowerCase()==="draft").length,"slate"],["Sent",quotations.filter(q=>(q.status||"").toLowerCase()==="sent").length,"blue"],["Accepted",quotations.filter(q=>(q.status||"").toLowerCase()==="accepted").length,"emerald"]].map(([l,v,c])=>(
            <div key={String(l)} className="rounded-xl border border-slate-200 bg-white px-2 py-3 sm:px-4 sm:py-4"><p className="truncate text-[10px] font-medium text-slate-500 sm:text-xs">{l}</p><p className={`mt-1 text-xl font-bold sm:text-2xl ${c==="emerald"?"text-emerald-600":c==="blue"?"text-blue-600":"text-slate-700"}`}>{v}</p></div>
          ))}
        </div>
        <div className="mb-4 flex gap-2 sm:mb-6 sm:gap-3">
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
          <>
          <div className="space-y-3 md:hidden">
            {filtered.map(q => (
              <article key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-blue-700">
                      {formatDisplayDocNumber(q.quotation_number, "quotation") || "—"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <h2 className="break-words text-sm font-bold leading-snug text-slate-900">{q.customer_name || custMap[q.customer_id || ""]?.name || "—"}</h2>
                      {q.is_custom_customer && (
                        <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                          Custom
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(formatStatus(q.status))}`}>{formatStatus(q.status)}</span>
                </div>
                {q.custom_project_name ? (
                  <p className="mt-2 break-words rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                    📁 {q.custom_project_name}
                  </p>
                ) : q.project_id && prjMap[q.project_id] ? (
                  <p className="mt-2 break-words rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                    {prjMap[q.project_id]?.project_number}: {prjMap[q.project_id]?.name}
                  </p>
                ) : null}
                <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-xs">
                  <div><dt className="text-[10px] uppercase tracking-wide text-slate-400">Date</dt><dd className="mt-0.5 font-medium text-slate-700">{fmtDate(q.quotation_date)}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-slate-400">Expiry</dt><dd className="mt-0.5 font-medium text-slate-700">{fmtDate(q.expiry_date)}</dd></div>
                  <div className="text-right"><dt className="text-[10px] uppercase tracking-wide text-slate-400">Total</dt><dd className="mt-0.5 font-bold text-slate-900">{fmtAED(q.total_amount)}</dd></div>
                </dl>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {quotationActions(q, true)}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">No.</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {formatDisplayDocNumber(q.quotation_number, "quotation") || "—"}
                      </span>
                      {q.quotation_number && q.quotation_number !== formatDisplayDocNumber(q.quotation_number, "quotation") && (
                        <span className="text-[10px] text-slate-400 block font-normal mt-0.5" title="Original Database Identifier">
                          {q.quotation_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{q.customer_name || custMap[q.customer_id||""]?.name||"—"}</span>
                        {q.is_custom_customer && (
                          <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                            Custom
                          </span>
                        )}
                      </div>
                      {q.custom_project_name ? (
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                          📁 {q.custom_project_name}
                        </span>
                      ) : q.project_id && prjMap[q.project_id] ? (
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                          {prjMap[q.project_id]?.project_number}: {prjMap[q.project_id]?.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(q.quotation_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(q.expiry_date)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(q.total_amount)}</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(formatStatus(q.status))}`}>{formatStatus(q.status)}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-center gap-1">{quotationActions(q)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Live Split-Screen Form & PDF Preview */}
      {showForm && (
        <DocumentSplitScreenEditor
          isOpen={showForm}
          onClose={closeForm}
          documentType="quotation"
          documentTitle="Quotation"
          documentNumberLabel="Quotation Number"
          company={company}
          initialInvoice={
            editing
              ? editing
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
                  project_id: form.project_id,
                  quotation_date: form.quotation_date,
                  expiry_date: form.expiry_date,
                  status: form.status,
                  payment_terms: form.terms || "30 days",
                  notes: form.notes,
                  terms: form.terms,
                }
          }
          initialLines={lines.map((l) => ({
            id: l.id,
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "Nos",
            unit_price: l.unit_price,
            discount_pct: Number(l.discount_percent ?? l.discount_pct ?? 0),
            vat_rate: l.vat_rate,
            taxable_amount:
              l.quantity * l.unit_price -
              l.quantity * l.unit_price * (Number(l.discount_percent ?? l.discount_pct ?? 0) / 100),
            vat_amount: l.vat_amount,
            line_total: l.line_total,
          }))}
          customers={customers}
          projects={projects.map((p) => ({
            id: p.id,
            project_number: p.project_number || "",
            name: p.name || "",
          }))}
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
                <button
                  onClick={() => {
                    const target = viewing.q;
                    setViewing(null);
                    deleteQuotation(target);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 size={13} /> Delete
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
              customer_name: printRec.q.customer_name || "",
              customer_trn: printRec.q.customer_trn,
              customer_address: printRec.q.customer_address,
              contact_person: printRec.q.contact_person,
              contact_number: printRec.q.contact_number,
              contact_email: printRec.q.contact_email,
              project_number: printRec.q.project_id ? prjMap[printRec.q.project_id]?.project_number : undefined,
              project_name: printRec.q.project_id ? prjMap[printRec.q.project_id]?.name : undefined,
              payment_terms: "As per agreement",
              terms_conditions: stripCustomPartyTags(printRec.q.terms) || undefined,
              notes: stripCustomPartyTags(printRec.q.notes) || undefined,
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

      {showRenameModal && editing && (company?.id || editing.company_id) && (
        <EditDocumentReferenceModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          companyId={company?.id || editing.company_id}
          docType="quotation"
          documentId={editing.id}
          currentReferenceNumber={editing.quotation_number || ""}
          onSuccess={(newNum) => {
            setEditing((prev) => (prev ? { ...prev, quotation_number: newNum } : prev));
            setQuotations((prev) =>
              prev.map((q) => (q.id === editing.id ? { ...q, quotation_number: newNum } : q))
            );
            setSuccess(`Quotation reference updated to ${newNum}`);
          }}
        />
      )}
    </main>
  );
}
