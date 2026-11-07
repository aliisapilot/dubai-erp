"use client";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, X, Save, Loader2, Pencil, Eye, Printer, Trash2, FileSignature } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, fmtDate, todayISO, generateDocNumber, calcLineItem, formatDisplayDocNumber } from "@/lib/helpers";
import PurchaseOrderTemplate, { PurchaseOrderData, POLineItem } from "@/components/documents/PurchaseOrderTemplate";
import PrintModal from "@/components/documents/PrintModal";
import EditDocumentReferenceModal from "@/components/documents/EditDocumentReferenceModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import DocumentSplitScreenEditor, {
  DocumentEditorFormState,
  EditorLineItem,
} from "@/components/documents/DocumentSplitScreenEditor";
import { withSupplierDocumentDetails, serializeCustomPartyNotes } from "@/lib/documentCustomer";
import {
  PurchaseOrderStatus,
  PURCHASE_ORDER_STATUS_OPTIONS,
  normalizePurchaseOrderStatus,
  formatPurchaseOrderStatus,
  parsePurchaseOrderError,
} from "@/lib/purchaseOrderTypes";

// DB verified: purchase_orders columns: id, purchase_order_number, order_date, expected_date, status, company_id, supplier_id, project_id
// purchase_order_items: purchase_order_id (FK), discount_percent (not discount_pct), NO vat_category
type Supplier = { id: string; name: string | null; supplier_code: string | null; trn?: string | null; address?: string | null; phone?: string | null; email?: string | null };
type Project = { id: string; project_number: string; name: string };
type Product = { id: string; name: string | null; sku: string | null; cost_price: number | null; vat_rate: number | null; unit: string | null; description?: string | null };
type POLine = { id?: string; product_id: string; description: string; quantity: number; unit_price: number; discount_pct: number; vat_rate: number; line_total: number; vat_amount: number; sort_order: number };
type PO = {
  id: string;
  company_id: string;
  purchase_order_number: string | null;
  supplier_id: string | null;
  supplier_name?: string;
  supplier_trn?: string;
  supplier_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  custom_project_name?: string | null;
  is_custom_supplier?: boolean | null;
  custom_supplier?: unknown;
  project_id?: string | null;
  order_date: string | null;
  expected_date: string | null;
  status: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  notes: string | null;
  created_at: string | null;
};
type POForm = {
  supplier_id: string;
  supplier_name?: string;
  customer_name?: string;
  supplier_trn?: string;
  customer_trn?: string;
  supplier_address?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  custom_project_name?: string;
  is_custom_supplier?: boolean;
  project_id: string;
  order_date: string;
  expected_date: string;
  status: PurchaseOrderStatus;
  notes: string;
};
const emptyForm: POForm = { supplier_id:"", project_id:"", order_date: todayISO(), expected_date:"", status:"draft", notes:"" };
const emptyLine = (): POLine => ({ product_id:"", description:"", quantity:1, unit_price:0, discount_pct:0, vat_rate:5, line_total:0, vat_amount:0, sort_order:0 });
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";
function recalc(item: POLine): POLine { const { vatAmount, lineTotal } = calcLineItem(item.quantity, item.unit_price, item.discount_pct, item.vat_rate); return { ...item, line_total: lineTotal, vat_amount: vatAmount }; }

export default function PurchaseOrdersPage() {
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [printDoc, setPrintDoc] = useState<PurchaseOrderData | null>(null);
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<POForm>(emptyForm);
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  const [viewing, setViewing] = useState<{po: PO; lines: POLine[]} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  useEffect(() => { loadAll(); }, []);
  async function loadAll() {
    setLoading(true);
    const [{ data: po }, { data: s }, { data: pr }, { data: p }, comp] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name, supplier_code, trn, address, phone, email").eq("active", true).order("name"),
      supabase.from("projects").select("id, project_number, name").order("project_number"),
      supabase.from("products").select("id, name, sku, cost_price, vat_rate, unit, description").eq("active", true).order("name"),
      getCurrentCompany(),
    ]);
    setOrders(((po||[]) as PO[]).map(item => withSupplierDocumentDetails(item) as PO)); setSuppliers((s||[]) as Supplier[]); setProjects((pr||[]) as Project[]); setProducts((p||[]) as Product[]);
    setCompany(comp);
    setLoading(false);
  }

  async function handlePrintPO(po: PO) {
    const enrichedPO = withSupplierDocumentDetails(po) as PO;
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", enrichedPO.id).order("sort_order");
    const supp = suppMap[enrichedPO.supplier_id || ""];
    const proj = projMap[enrichedPO.project_id || ""];

    type DBPOItem = { id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; unit?: string };

    const lineItems: POLineItem[] = ((items || []) as DBPOItem[]).map((it) => ({
      id: it.id,
      description: it.description || "",
      quantity: Number(it.quantity) || 1,
      unit: it.unit || "Nos",
      unit_price: Number(it.unit_price) || 0,
      vat_rate: Number(it.vat_rate ?? 5),
      vat_amount: Number(it.vat_amount) || 0,
      line_total: Number(it.line_total) || 0,
    }));

    const poDoc: PurchaseOrderData = {
      id: enrichedPO.id,
      po_number: enrichedPO.purchase_order_number || enrichedPO.id.slice(0, 8).toUpperCase(),
      po_date: enrichedPO.order_date || todayISO(),
      supplier_name: enrichedPO.supplier_name || supp?.name || "Supplier",
      supplier_trn: enrichedPO.supplier_trn || supp?.trn || null,
      supplier_address: enrichedPO.supplier_address || supp?.address || null,
      vendor_reference: null,
      vendor_contact: enrichedPO.contact_person || supp?.phone || null,
      vendor_mobile: enrichedPO.contact_number || supp?.phone || null,
      vendor_email: enrichedPO.contact_email || supp?.email || null,
      project_name: enrichedPO.custom_project_name || proj?.name || null,
      project_number: proj?.project_number || null,
      delivery_terms: po.expected_date ? `Expected Delivery: ${fmtDate(po.expected_date)}` : null,
      payment_terms: "Standard 30 Days Credit / Cash on Delivery",
      notes: po.notes || null,
      status: po.status || "Draft",
      subtotal: Number(po.subtotal) || 0,
      vat_amount: Number(po.vat_amount) || 0,
      total_amount: Number(po.total_amount) || 0,
      items: lineItems,
    };

    setPrintDoc(poDoc);
  }

  const totals = useCallback(() => { const sub = lines.reduce((s,l) => s + l.quantity*l.unit_price*(1-l.discount_pct/100), 0); const vat = lines.reduce((s,l) => s + l.vat_amount, 0); return { sub, vat, total: sub+vat }; }, [lines]);
  function onProductSelect(idx: number, pid: string) { const prod = products.find(p => p.id === pid); setLines(ls => ls.map((l,i) => i!==idx?l:recalc({ ...l, product_id: pid, description: prod?.name||l.description, unit_price: prod?.cost_price??l.unit_price, vat_rate: prod?.vat_rate??5 }))); }
  function updateLine(idx: number, u: Partial<POLine>) { setLines(ls => ls.map((l,i) => i!==idx?l:recalc({...l,...u}))); }
  function addLine() { setLines(ls => [...ls, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length===1) return; setLines(ls => ls.filter((_,i)=>i!==idx)); }
  const ff = (k: keyof POForm, v: string) => setForm(c => ({...c,[k]:v}));
  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(emptyForm); setLines([emptyLine()]); setShowForm(true); }
  async function openEdit(po: PO) {
    setError(""); setSuccess("");
    const enriched = withSupplierDocumentDetails(po) as PO;
    setEditing(enriched);
    setForm({
      supplier_id: enriched.supplier_id||"",
      project_id: enriched.project_id||"",
      order_date: enriched.order_date||todayISO(),
      expected_date: enriched.expected_date||"",
      status: normalizePurchaseOrderStatus(enriched.status),
      notes: enriched.notes||""
    });
    // DB FK: purchase_order_id (not po_id)
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("sort_order");
    // Map DB discount_percent → UI discount_pct
    type DBPOItem = { id?: string; purchase_order_id?: string; product_id?: string; description?: string; quantity?: number; unit_price?: number; discount_percent?: number; vat_rate?: number; line_total?: number; vat_amount?: number; sort_order?: number };
    setLines((items||[]).length>0?(items as DBPOItem[]).map(it => ({ product_id: it.product_id||"", description: it.description||"", quantity: Number(it.quantity)||1, unit_price: Number(it.unit_price)||0, discount_pct: Number(it.discount_percent??0), vat_rate: Number(it.vat_rate ?? 5), line_total: Number(it.line_total)||0, vat_amount: Number(it.vat_amount)||0, sort_order: Number(it.sort_order)||0 })):[emptyLine()]);
    setShowForm(true);
  }
  async function openView(po: PO) {
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", po.id).order("sort_order");
    setViewing({ po: withSupplierDocumentDetails(po) as PO, lines: (items||[]) as POLine[] });
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.supplier_id) { setError("Please select a supplier."); return; }
    setSaving(true);
    try {
      const { sub, vat, total } = totals();
      const normStatus = normalizePurchaseOrderStatus(form.status);
      // DB: purchase_order_number, order_date (not po_date), expected_date
      const payload = {
        supplier_id: form.supplier_id,
        project_id: form.project_id || null,
        order_date: form.order_date || null,
        expected_date: form.expected_date || null,
        status: normStatus,
        subtotal: sub,
        vat_amount: vat,
        total_amount: total,
        notes: form.notes || null,
        updated_at: new Date().toISOString()
      };
      let poid: string;
      if (editing) {
        const { error: updateErr } = await supabase.from("purchase_orders").update(payload).eq("id", editing.id);
        if (updateErr) throw updateErr;
        poid = editing.id;
        // Upsert line items: preserve existing IDs, insert new ones, delete removed ones
        const { data: existingItems } = await supabase.from("purchase_order_items").select("id").eq("purchase_order_id", poid);
        const existingIds = new Set((existingItems || []).map((it: { id: string }) => it.id));
        const currentIds = new Set<string>();
        for (const l of lines) {
          if (l.id && existingIds.has(l.id)) {
            const { error: updErr } = await supabase.from("purchase_order_items").update({ product_id: l.product_id||null, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_percent: l.discount_pct, vat_rate: l.vat_rate, line_total: l.line_total, vat_amount: l.vat_amount }).eq("id", l.id);
            if (updErr) throw updErr;
            currentIds.add(l.id);
          } else {
            const { error: insErr } = await supabase.from("purchase_order_items").insert({ purchase_order_id: poid, product_id: l.product_id||null, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_percent: l.discount_pct, vat_rate: l.vat_rate, line_total: l.line_total, vat_amount: l.vat_amount, sort_order: lines.indexOf(l) });
            if (insErr) throw insErr;
          }
        }
        // Delete items no longer in the form
        const toDelete = [...existingIds].filter(id => !currentIds.has(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase.from("purchase_order_items").delete().in("id", toDelete);
          if (delErr) throw delErr;
        }
      } else {
        const cid = await getCompanyId();
        const poNum = await generateDocNumber(cid, "PO");
        const { data: ins, error: err } = await supabase.from("purchase_orders").insert({ ...payload, company_id: cid, purchase_order_number: poNum }).select("id").single();
        if (err) throw err;
        poid = ins.id;
      }
      // If Received, update stock
      if (normStatus === "received" && normalizePurchaseOrderStatus(editing?.status) !== "received") {
        for (const l of lines.filter(l=>l.product_id && l.quantity > 0)) {
          const { data: prod } = await supabase.from("products").select("current_stock").eq("id", l.product_id).single();
          if (!prod) continue;
          const before = prod.current_stock || 0;
          const after = before + l.quantity;
          const { error: stockErr } = await supabase.from("products").update({ current_stock: after, updated_at: new Date().toISOString() }).eq("id", l.product_id);
          if (stockErr) throw stockErr;
          const cid = await getCompanyId();
          // DB stock_movements: previous_stock, new_stock (not before_stock, after_stock)
          const { error: movementErr } = await supabase.from("stock_movements").insert({ company_id: cid, product_id: l.product_id, movement_type: "IN", quantity: l.quantity, previous_stock: before, new_stock: after, reference_type: "purchase_order", reference_id: poid });
          if (movementErr) throw movementErr;
        }
      }
      // DB: purchase_order_id (FK), discount_percent (not discount_pct), no vat_category
      const { error: itemErr } = await supabase.from("purchase_order_items").insert(lines.map((l,i)=>({ purchase_order_id: poid, product_id: l.product_id||null, description: l.description, quantity: l.quantity, unit_price: l.unit_price, discount_percent: l.discount_pct, vat_rate: l.vat_rate, line_total: l.line_total, vat_amount: l.vat_amount, sort_order: i })));
      if (itemErr) throw itemErr;
      setSuccess(editing?"PO updated.":"Purchase order created."); closeForm(); await loadAll();
    } catch (err: unknown) { setError(parsePurchaseOrderError(err)); }
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
    const isCustom = Boolean(payload.form.is_custom_supplier);
    if (!isCustom && !payload.form.customer_id) {
      const err = new Error("Please select an existing supplier or enter custom supplier details.");
      setError(err.message);
      throw err;
    }
    if (isCustom && !payload.form.customer_name?.trim()) {
      const err = new Error("Please enter the custom supplier / vendor name.");
      setError(err.message);
      throw err;
    }
    setSaving(true);
    try {
      const normStatus = normalizePurchaseOrderStatus(payload.form.status);
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
      const serializedNotes = isCustom && customPayload ? serializeCustomPartyNotes(rawNotes, customPayload) : rawNotes;

      const dataPayload: Record<string, unknown> = {
        supplier_id: isCustom ? null : payload.form.customer_id || null,
        supplier_name: isCustom ? payload.form.customer_name?.trim() : null,
        supplier_address: isCustom ? payload.form.customer_address || null : null,
        supplier_trn: isCustom ? payload.form.customer_trn || null : null,
        contact_person: isCustom ? payload.form.contact_person || null : null,
        contact_number: isCustom ? payload.form.contact_number || null : null,
        contact_email: isCustom ? payload.form.contact_email || null : null,
        custom_project_name: isCustom ? payload.form.custom_project_name || null : null,
        is_custom_supplier: isCustom,
        custom_supplier: customPayload,
        project_id: payload.form.project_id || null,
        order_date: payload.form.invoice_date || null,
        expected_date: payload.form.supply_date || null,
        status: normStatus,
        subtotal: payload.subtotal,
        vat_amount: payload.vat_amount,
        total_amount: payload.total_amount,
        payment_terms: payload.form.payment_terms || null,
        notes: serializedNotes || null,
        updated_at: new Date().toISOString(),
      };

      const executeSave = async (recordPayload: Record<string, unknown>) => {
        if (editing) {
          const { error: err } = await supabase.from("purchase_orders").update(recordPayload).eq("id", editing.id);
          if (err) throw err;
          const { error: delErr } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", editing.id);
          if (delErr) throw delErr;
          return { id: editing.id, poNumber: editing.purchase_order_number || editing.id };
        } else {
          const cid = await getCompanyId();
          const pno = await generateDocNumber(cid, "PO");
          const { data: ins, error: err } = await supabase.from("purchase_orders").insert({
            ...recordPayload,
            company_id: cid,
            purchase_order_number: pno,
          }).select("id").single();
          if (err) throw err;
          return { id: ins.id, poNumber: pno };
        }
      };

      let saveRes: { id: string; poNumber: string };
      try {
        saveRes = await executeSave(dataPayload);
      } catch (saveErr: unknown) {
        const errObj = saveErr as { message?: string; code?: string };
        if (errObj?.message && (errObj.message.includes("column") || errObj.code === "PGRST204" || errObj.code === "42703")) {
          const minimalPayload = {
            supplier_id: isCustom ? null : payload.form.customer_id || null,
            project_id: payload.form.project_id || null,
            order_date: payload.form.invoice_date || null,
            expected_date: payload.form.supply_date || null,
            status: normStatus,
            subtotal: payload.subtotal,
            vat_amount: payload.vat_amount,
            total_amount: payload.total_amount,
            payment_terms: payload.form.payment_terms || null,
            notes: serializedNotes || null,
            updated_at: new Date().toISOString(),
          };
          saveRes = await executeSave(minimalPayload);
        } else {
          throw saveErr;
        }
      }
      const poid = saveRes.id;

      // If Received, update stock
      if (normStatus === "received" && normalizePurchaseOrderStatus(editing?.status) !== "received") {
        for (const l of payload.lines.filter((l) => l.product_id && l.quantity > 0)) {
          const { data: prod } = await supabase.from("products").select("current_stock").eq("id", l.product_id).single();
          if (!prod) continue;
          const before = prod.current_stock || 0;
          const after = before + l.quantity;
          const { error: stockErr } = await supabase.from("products").update({ current_stock: after, updated_at: new Date().toISOString() }).eq("id", l.product_id);
          if (stockErr) throw stockErr;
          const cid = await getCompanyId();
          const { error: movementErr } = await supabase.from("stock_movements").insert({
            company_id: cid,
            product_id: l.product_id,
            movement_type: "IN",
            quantity: l.quantity,
            previous_stock: before,
            new_stock: after,
            reference_type: "purchase_order",
            reference_id: poid,
          });
          if (movementErr) throw movementErr;
        }
      }

      // Insert line items
      const { error: itemErr } = await supabase.from("purchase_order_items").insert(
        payload.lines.map((l, i) => ({
          purchase_order_id: poid,
          product_id: l.product_id || null,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_pct,
          vat_rate: l.vat_rate,
          line_total: l.line_total,
          vat_amount: l.vat_amount,
          sort_order: i,
        }))
      );
      if (itemErr) throw itemErr;

      setSuccess(`Purchase order ${saveRes.poNumber} ${editing ? "updated" : "saved"} successfully.`);
      closeForm();
      await loadAll();
    } catch (err: unknown) {
      const msg = parsePurchaseOrderError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }
  const suppMap = Object.fromEntries(suppliers.map(s=>[s.id,s]));
  const projMap = Object.fromEntries(projects.map(p=>[p.id,p]));
  const filtered = orders.filter(po => {
    const norm = normalizePurchaseOrderStatus(po.status);
    if (filterStatus && norm !== filterStatus) return false;
    const sn = po.supplier_name || suppMap[po.supplier_id||""]?.name || "";
    const pn = po.custom_project_name || projMap[po.project_id||""]?.project_number || "";
    const stLabel = formatPurchaseOrderStatus(po.status);
    const simplifiedNum = formatDisplayDocNumber(po.purchase_order_number, "purchase_order");
    return [po.purchase_order_number, simplifiedNum, sn, pn, po.status, stLabel].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const { sub: fSub, vat: fVAT, total: fTotal } = totals();

  async function deletePO(po: PO) {
    if (!window.confirm(`Are you sure you want to delete purchase order ${po.purchase_order_number || "this PO"}? This cannot be undone.`)) return;
    setError("");
    try {
      const { error: itemDeleteErr } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", po.id);
      if (itemDeleteErr) throw itemDeleteErr;
      const { error: delErr } = await supabase.from("purchase_orders").delete().eq("id", po.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete purchase order ${po.purchase_order_number} because it is referenced in supplier bills or receipt records.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Purchase order ${po.purchase_order_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete purchase order.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-900 p-2.5 text-white"><FileSignature size={22}/></div><div><h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1><p className="text-sm text-slate-500">Manage supplier purchase orders</p></div></div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18}/>New PO</button>
        </div></header>
        <div className="mx-auto max-w-7xl px-6 py-8">
          {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
          {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
          <div className="mb-6 flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search POs…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"/>
            </div>
            <select
              value={filterStatus}
              onChange={e=>setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"
            >
              <option value="">All Statuses</option>
              {PURCHASE_ORDER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400"/></div> : filtered.length===0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><FileSignature size={40} className="mx-auto mb-3 text-slate-300"/><p className="text-sm text-slate-500">No purchase orders.</p></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="px-4 py-3">PO No.</th><th className="px-4 py-3">Supplier / Project</th><th className="px-4 py-3">PO Date</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">Total (AED)</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filtered.map(po=>{
                  const normSt = normalizePurchaseOrderStatus(po.status);
                  const isReceived = normSt === "received";
                  const isCancelled = normSt === "cancelled";
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {formatDisplayDocNumber(po.purchase_order_number, "purchase_order") || po.id.slice(0,8).toUpperCase()}
                        </span>
                        {po.purchase_order_number && po.purchase_order_number !== formatDisplayDocNumber(po.purchase_order_number, "purchase_order") && (
                          <span className="text-[10px] text-slate-400 block font-normal mt-0.5" title="Original Database Identifier">
                            {po.purchase_order_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap font-semibold text-slate-900">
                          <span>{po.supplier_name || suppMap[po.supplier_id||""]?.name||"—"}</span>
                          {po.is_custom_supplier && (
                            <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                              Custom
                            </span>
                          )}
                        </div>
                        {po.custom_project_name ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                            📁 {po.custom_project_name}
                          </span>
                        ) : po.project_id && projMap[po.project_id] ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                            📁 {projMap[po.project_id].project_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(po.order_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(po.expected_date)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{fmtAED(po.vat_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtAED(po.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(po.status||"draft")}`}>
                          {formatPurchaseOrderStatus(po.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handlePrintPO(po)}
                          title="Print / View A4 Purchase Order"
                          className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-900 hover:text-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition"
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button onClick={()=>openView(po)} title="View Summary" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Eye size={14}/></button>
                        {!isReceived && !isCancelled && (
                          <button onClick={()=>openEdit(po)} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14}/></button>
                        )}
                        <button onClick={()=>deletePO(po)} title="Delete Purchase Order" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"><Trash2 size={14}/></button>
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>

      {/* Live Split-Screen Form & PDF Preview */}
      {showForm && (
        <DocumentSplitScreenEditor
          isOpen={showForm}
          onClose={closeForm}
          documentType="purchase_order"
          documentTitle="Purchase Order"
          documentNumberLabel="Purchase Order Number"
          company={company}
          partyType="supplier"
          partyLabel="Supplier / Vendor"
          suppliers={suppliers}
          initialInvoice={
            editing
              ? editing
              : {
                  customer_id: form.supplier_id,
                  supplier_id: form.supplier_id,
                  customer_name: form.supplier_name || form.customer_name,
                  customer_trn: form.supplier_trn || form.customer_trn,
                  customer_address: form.supplier_address || form.customer_address,
                  contact_person: form.contact_person,
                  contact_number: form.contact_number,
                  contact_email: form.contact_email,
                  custom_project_name: form.custom_project_name,
                  is_custom_supplier: form.is_custom_supplier,
                  order_date: form.order_date,
                  invoice_date: form.order_date,
                  expected_date: form.expected_date,
                  supply_date: form.expected_date,
                  status: form.status,
                  notes: form.notes,
                }
          }
          initialLines={lines.map((l) => ({
            id: l.id,
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            unit: "Nos",
            unit_price: l.unit_price,
            discount_pct: l.discount_pct,
            vat_rate: l.vat_rate,
            taxable_amount:
              l.quantity * l.unit_price -
              l.quantity * l.unit_price * (l.discount_pct / 100),
            vat_amount: l.vat_amount,
            line_total: l.line_total,
          }))}
          projects={projects}
          products={products.map((p) => ({
            ...p,
            selling_price: p.cost_price ?? null,
          }))}
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
                <h2 className="text-xl font-bold">PO {viewing.po.purchase_order_number || viewing.po.id.slice(0,8).toUpperCase()}</h2>
                <p className="text-sm text-slate-500">{suppMap[viewing.po.supplier_id||""]?.name}</p>
                {viewing.po.project_id && projMap[viewing.po.project_id] && (
                  <p className="text-xs text-blue-600 font-semibold mt-0.5">
                    Project: {projMap[viewing.po.project_id].project_number} â€” {projMap[viewing.po.project_id].name}
                  </p>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    const po = viewing.po;
                    setViewing(null);
                    handlePrintPO(po);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Printer size={14} /> Print A4 PO
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const po = viewing.po;
                    setViewing(null);
                    deletePO(po);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(viewing.po.status||"draft")}`}>
                  {formatPurchaseOrderStatus(viewing.po.status)}
                </span>
                <button onClick={()=>setViewing(null)}><X size={20}/></button>
              </div>
            </div>
            <table className="w-full text-sm mb-4"><thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-center">VAT%</th><th className="px-3 py-2 text-right">VAT</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{viewing.lines.map((l,i)=><tr key={i}><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-center">{l.quantity}</td><td className="px-3 py-2 text-right">{fmtAED(l.unit_price)}</td><td className="px-3 py-2 text-center">{l.vat_rate}%</td><td className="px-3 py-2 text-right">{fmtAED(l.vat_amount)}</td><td className="px-3 py-2 text-right font-semibold">{fmtAED(l.line_total)}</td></tr>)}</tbody></table>
            <div className="flex justify-end"><div className="w-64 space-y-1 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtAED(viewing.po.subtotal)}</span></div><div className="flex justify-between text-amber-600"><span>VAT</span><span>{fmtAED(viewing.po.vat_amount)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{fmtAED(viewing.po.total_amount)}</span></div></div></div>
          </div>
        </div>
      )}
      </div>

      {/* A4 Print Modal */}
      <PrintModal isOpen={!!printDoc} onClose={() => setPrintDoc(null)}>
        {printDoc && (
          <PurchaseOrderTemplate
            company={company}
            po={printDoc}
            onClose={() => setPrintDoc(null)}
          />
        )}
      </PrintModal>

      {showRenameModal && editing && (company?.id || editing.company_id) && (
        <EditDocumentReferenceModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          companyId={company?.id || editing.company_id}
          docType="purchase_order"
          documentId={editing.id}
          currentReferenceNumber={editing.purchase_order_number || ""}
          onSuccess={(newNum) => {
            setEditing((prev) => (prev ? { ...prev, purchase_order_number: newNum } : prev));
            loadAll();
            setSuccess(`Purchase order reference updated to ${newNum}`);
          }}
        />
      )}
    </main>
  );
}
