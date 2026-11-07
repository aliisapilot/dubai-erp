"use client";
import { planDeliveryStock } from "@/lib/deliveryStock";

import { FormEvent, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, X, Save, Loader2, Pencil, Printer, Trash2, ClipboardList, ZoomIn, ZoomOut, Maximize2, Minimize2, CheckCircle2, AlertTriangle } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtDate, todayISO, generateDocNumber, formatDisplayDocNumber } from "@/lib/helpers";
import DeliveryNoteTemplate, { DeliveryNoteData } from "@/components/documents/DeliveryNoteTemplate";
import PrintModal from "@/components/documents/PrintModal";
import EditDocumentReferenceModal from "@/components/documents/EditDocumentReferenceModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { parseDatabaseError } from "@/lib/paymentTypes";
import { withCustomerDocumentDetails, serializeCustomPartyNotes } from "@/lib/documentCustomer";
import DynamicDocumentRenderer, {
  MockDocumentData,
  getDocumentPageCount,
} from "@/components/documents/DynamicDocumentRenderer";
import { usePersistedDocumentDesign } from "@/components/documents/usePersistedDocumentDesign";
import { NumericCellInput } from "@/components/ui/NumericCellInput";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null; address: string | null; contact_person: string | null; phone: string | null; mobile: string | null; email: string | null; active: boolean | null };
type Product = { id: string; name: string | null; sku: string | null; unit: string | null; current_stock: number | null; description?: string | null };
type Project = { id: string; name: string | null; project_number: string | null };
type DNLine = { id?: string; product_id: string; description: string; quantity: number; unit: string; remarks?: string; sort_order: number };

type DN = {
  id: string;
  company_id: string;
  delivery_note_number: string | null; // DB: delivery_note_number (not dn_number)
  customer_id: string | null;
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  custom_project_name?: string | null;
  is_custom_customer?: boolean | null;
  custom_customer?: Record<string, unknown> | null;
  project_id?: string | null;
  delivery_date: string | null; // DB: delivery_date (not dn_date or dispatch_date)
  status: string | null;
  order_ref: string | null;
  driver_name: string | null;
  driver_number: string | null;
  vehicle_number: string | null;
  delivery_method: string | null;
  receiver_name: string | null;
  receiver_mobile: string | null;
  notes: string | null;
  created_at: string | null;
};

type DNForm = {
  customer_id: string;
  project_id: string;
  delivery_date: string;
  dispatch_date: string;
  status: string;
  customer_address: string;
  contact_person: string;
  contact_number: string;
  order_ref: string;
  driver_name: string;
  driver_number: string;
  vehicle_number: string;
  delivery_method: string;
  receiver_name: string;
  receiver_mobile: string;
  notes: string;
};

const emptyForm: DNForm = {
  customer_id: "",
  project_id: "",
  delivery_date: todayISO(),
  dispatch_date: todayISO(),
  status: "draft",
  customer_address: "",
  contact_person: "",
  contact_number: "",
  order_ref: "",
  driver_name: "",
  driver_number: "",
  vehicle_number: "",
  delivery_method: "Company Vehicle",
  receiver_name: "",
  receiver_mobile: "",
  notes: "",
};

const emptyLine = (): DNLine => ({ product_id: "", description: "", quantity: 1, unit: "Nos", remarks: "", sort_order: 0 });

export default function DeliveryNotesPage() {
  const [notes, setNotes] = useState<DN[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);

  const [form, setForm] = useState<DNForm>(emptyForm);
  const [lines, setLines] = useState<DNLine[]>([emptyLine()]);
  const [partyMode, setPartyMode] = useState<"existing" | "custom">("existing");
  const [customCustomer, setCustomCustomer] = useState<{
    name: string;
    address: string;
    contact_person: string;
    phone: string;
    email: string;
    trn: string;
    project_name: string;
  }>({
    name: "",
    address: "",
    contact_person: "",
    phone: "",
    email: "",
    trn: "",
    project_name: "",
  });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DN | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  // Print Modal State
  const [printDoc, setPrintDoc] = useState<DeliveryNoteData | null>(null);

  const design = usePersistedDocumentDesign(company?.id, "delivery_note");
  const [activeTabMobile, setActiveTabMobile] = useState<"form" | "preview">("form");
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [zoom, setZoom] = useState(0.85);

  const previewData: MockDocumentData = useMemo(() => {
    const isCustom = partyMode === "custom";
    const cust = customers.find((c) => c.id === form.customer_id);
    const prj = projects.find((p) => p.id === form.project_id);
    return {
      document_number: editing?.delivery_note_number || "[Draft - Generated on Save]",
      document_date: form.delivery_date || todayISO(),
      supply_date: form.dispatch_date || form.delivery_date || todayISO(),
      status: form.status,
      customer_name: isCustom
        ? customCustomer.name || "Custom Customer / Client"
        : cust?.name || "Customer / Client Name",
      customer_trn: isCustom ? customCustomer.trn || undefined : cust?.trn || undefined,
      customer_address: isCustom
        ? customCustomer.address || form.customer_address || undefined
        : form.customer_address || cust?.address || undefined,
      contact_person: isCustom
        ? customCustomer.contact_person || form.contact_person || undefined
        : form.contact_person || cust?.contact_person || undefined,
      contact_number: isCustom
        ? customCustomer.phone || form.contact_number || undefined
        : form.contact_number || cust?.phone || cust?.mobile || undefined,
      contact_email: isCustom
        ? customCustomer.email || undefined
        : cust?.email || undefined,
      project_name: isCustom
        ? customCustomer.project_name || prj?.name || undefined
        : prj?.name || undefined,
      project_number: prj?.project_number || undefined,
      notes: form.notes,
      payment_terms: `Dispatch: ${form.dispatch_date || "—"} | Method: ${form.delivery_method} | Driver: ${form.driver_name || "—"} (${form.driver_number || "—"}) | Vehicle: ${form.vehicle_number || "—"} | Receiver: ${form.receiver_name || "—"}`,
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      items: lines.map((l) => ({
        description: l.description ? `${l.description}${l.remarks ? ` (${l.remarks})` : ""}` : "Item Description",
        quantity: l.quantity,
        unit: l.unit || "Nos",
        unit_price: 0,
        discount: 0,
        vat_rate: 0,
        vat_amount: 0,
        line_total: 0,
      })),
    };
  }, [editing, form, lines, customers, projects, partyMode, customCustomer]);

  const totalPreviewPages = useMemo(() => {
    if (!design.layout) return 1;
    return getDocumentPageCount(design.layout, previewData.items.length, previewData.items, previewData);
  }, [design.layout, previewData]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: dn }, { data: c }, { data: p }, co, { data: prjs }] = await Promise.all([
      supabase.from("delivery_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code, trn, address, contact_person, phone, mobile, email, active").order("name"),
      supabase.from("products").select("id, name, sku, unit, current_stock, description").eq("active", true).order("name"),
      getCurrentCompany(),
      supabase.from("projects").select("id, name, project_number").order("created_at", { ascending: false }),
    ]);
    setNotes(((dn || []) as DN[]).map(item => withCustomerDocumentDetails(item) as DN));
    setCustomers((c || []) as Customer[]);
    setProducts((p || []) as Product[]);
    if (co) setCompany(co as CompanyDocInfo);
    setProjects((prjs || []) as Project[]);
    setLoading(false);
  }

  function onCustomerChange(cid: string) {
    const cust = customers.find(c => c.id === cid);
    setForm(f => ({
      ...f,
      customer_id: cid,
      customer_address: cust?.address || f.customer_address,
      contact_number: cust?.phone || f.contact_number,
    }));
  }

  function onProductSelect(idx: number, pid: string) {
    const prod = products.find(p => p.id === pid);
    const lineDesc = prod?.description
      ? `${prod.name || ""} - ${prod.description}`.trim()
      : prod?.name || "";
    setLines(ls => ls.map((l, i) => i !== idx ? l : {
      ...l,
      product_id: pid,
      description: lineDesc || l.description,
      unit: prod?.unit || l.unit || "Nos"
    }));
  }

  function updateLine(idx: number, k: keyof DNLine, v: string | number) {
    setLines(ls => ls.map((l, i) => i !== idx ? l : { ...l, [k]: v }));
  }

  function addLine() {
    setLines(ls => [...ls, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return;
    setLines(ls => ls.filter((_, i) => i !== idx));
  }

  const ff = (k: keyof DNForm, v: string) => setForm(c => ({ ...c, [k]: v }));

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
    setForm(emptyForm);
    setLines([emptyLine()]);
    setShowForm(true);
  }

  async function openEdit(dn: DN) {
    setError("");
    setSuccess("");
    const enriched = withCustomerDocumentDetails(dn) as DN;
    setEditing(enriched);
    const isCustom = Boolean(enriched.is_custom_customer || (!enriched.customer_id && enriched.customer_name));
    setPartyMode(isCustom ? "custom" : "existing");
    setCustomCustomer({
      name: enriched.customer_name || "",
      address: enriched.customer_address || "",
      contact_person: enriched.contact_person || "",
      phone: enriched.contact_number || "",
      email: enriched.contact_email || "",
      trn: enriched.customer_trn || "",
      project_name: enriched.custom_project_name || "",
    });
    setForm({
      customer_id: enriched.customer_id || "",
      project_id: enriched.project_id || "",
      delivery_date: enriched.delivery_date || todayISO(),
      dispatch_date: enriched.delivery_date || todayISO(),
      status: (enriched.status || "draft").toLowerCase(),
      customer_address: enriched.customer_address || "",
      contact_person: enriched.contact_person || "",
      contact_number: enriched.contact_number || "",
      order_ref: enriched.order_ref || "",
      driver_name: enriched.driver_name || "",
      driver_number: enriched.driver_number || "",
      vehicle_number: enriched.vehicle_number || "",
      delivery_method: enriched.delivery_method || "Company Vehicle",
      receiver_name: enriched.receiver_name || "",
      receiver_mobile: enriched.receiver_mobile || "",
      notes: enriched.notes || "",
    });

    const { data: items } = await supabase
      .from("delivery_note_items")
      .select("*")
      .eq("delivery_note_id", dn.id) // DB FK: delivery_note_id (not dn_id)
      .order("sort_order");

    setLines((items || []).length > 0 ? (items as DNLine[]) : [emptyLine()]);
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setError("");
  }

  async function handlePrintDN(dn: DN) {
    const cust = customers.find(c => c.id === dn.customer_id);
    const customerDetails = withCustomerDocumentDetails({ ...dn, customer: cust });
    const prj = projects.find(p => p.id === dn.project_id);
    const { data: items } = await supabase
      .from("delivery_note_items")
      .select("*")
      .eq("delivery_note_id", dn.id) // DB FK: delivery_note_id (not dn_id)
      .order("sort_order");

    const printData: DeliveryNoteData = {
      id: dn.id,
      delivery_number: dn.delivery_note_number || "DN-XXXX", // DB: delivery_note_number
      delivery_date: dn.delivery_date || todayISO(),
      dispatch_date: dn.delivery_date || todayISO(),
      customer_name: customerDetails.customer_name,
      customer_trn: customerDetails.customer_trn,
      customer_address: customerDetails.customer_address,
      contact_person: customerDetails.contact_person,
      contact_number: customerDetails.contact_number,
      contact_email: customerDetails.contact_email,
      order_ref: dn.order_ref,
      driver_name: dn.driver_name,
      driver_number: dn.driver_number,
      vehicle_number: dn.vehicle_number,
      delivery_method: dn.delivery_method,
      receiver_name: dn.receiver_name,
      receiver_mobile: dn.receiver_mobile,
      notes: dn.notes,
      project_name: customerDetails.custom_project_name || prj?.name || null,
      project_number: prj?.project_number || null,
      items: (items || []).map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit: it.unit || "Nos",
        remarks: it.remarks || "",
      })),
    };

    setPrintDoc(printData);
  }

  function handlePrintCurrent() {
    const isCustom = partyMode === "custom";
    const cust = customers.find(c => c.id === form.customer_id);
    const prj = projects.find(p => p.id === form.project_id);
    const currentPrintData: DeliveryNoteData = {
      id: editing?.id || "draft",
      delivery_number: editing?.delivery_note_number || "DN-DRAFT",
      delivery_date: form.delivery_date || todayISO(),
      dispatch_date: form.dispatch_date || form.delivery_date || todayISO(),
      customer_name: isCustom ? customCustomer.name : cust?.name || "",
      customer_trn: isCustom ? customCustomer.trn : cust?.trn,
      customer_address: isCustom ? customCustomer.address : cust?.address,
      contact_person: isCustom ? customCustomer.contact_person : cust?.contact_person,
      contact_number: isCustom ? customCustomer.phone : cust?.phone || cust?.mobile,
      contact_email: isCustom ? customCustomer.email : cust?.email,
      order_ref: form.order_ref,
      driver_name: form.driver_name,
      driver_number: form.driver_number,
      vehicle_number: form.vehicle_number,
      delivery_method: form.delivery_method,
      receiver_name: form.receiver_name,
      receiver_mobile: form.receiver_mobile,
      notes: form.notes,
      project_name: isCustom ? customCustomer.project_name : prj?.name || null,
      project_number: prj?.project_number || null,
      items: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit || "Nos",
        remarks: l.remarks || "",
      })),
    };
    setPrintDoc(currentPrintData);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    let effectivePartyMode = partyMode;
    if (effectivePartyMode === "existing" && !form.customer_id && customCustomer.name.trim()) {
      effectivePartyMode = "custom";
      setPartyMode("custom");
    } else if (effectivePartyMode === "custom" && !customCustomer.name.trim() && form.customer_id) {
      effectivePartyMode = "existing";
      setPartyMode("existing");
    }

    const isCustom = effectivePartyMode === "custom";
    if (!isCustom && !form.customer_id) {
      setError("Please select an existing customer or switch to Custom Customer.");
      return;
    }
    if (isCustom && !customCustomer.name.trim()) {
      setError("Please enter Customer / Company Name.");
      return;
    }
    setSaving(true);
    try {
      const shouldDeductStock = form.status.toLowerCase() === "delivered" && editing?.status?.toLowerCase() !== "delivered";
      let stockPlan: ReturnType<typeof planDeliveryStock> = [];
      let stockCompanyId: string | null = null;
      if (shouldDeductStock) {
        const productIds = [...new Set(lines.filter(line => line.product_id && line.quantity > 0).map(line => line.product_id))];
        if (productIds.length) {
          stockCompanyId = await getCompanyId();
          const { data: stockRows, error: stockReadError } = await supabase.from("products")
            .select("id, current_stock").eq("company_id", stockCompanyId).in("id", productIds);
          if (stockReadError) throw stockReadError;
          stockPlan = planDeliveryStock(lines, stockRows || []);
        }
      }

      const customPayload = isCustom
        ? {
            name: customCustomer.name.trim(),
            address: customCustomer.address,
            contact_person: customCustomer.contact_person,
            phone: customCustomer.phone,
            email: customCustomer.email,
            trn: customCustomer.trn,
            project_name: customCustomer.project_name,
          }
        : null;

      const rawNotes = form.notes.trim() || "";
      const serializedNotes = isCustom && customPayload ? serializeCustomPartyNotes(rawNotes, customPayload) : rawNotes;

      const payload: Record<string, unknown> = {
        customer_id: isCustom ? null : form.customer_id || null,
        customer_name: isCustom ? customCustomer.name.trim() : null,
        customer_address: isCustom ? (customCustomer.address.trim() || form.customer_address.trim() || null) : (form.customer_address.trim() || null),
        customer_trn: isCustom ? customCustomer.trn.trim() || null : null,
        contact_person: isCustom ? (customCustomer.contact_person.trim() || form.contact_person.trim() || null) : (form.contact_person.trim() || null),
        contact_number: isCustom ? (customCustomer.phone.trim() || form.contact_number.trim() || null) : (form.contact_number.trim() || null),
        contact_email: isCustom ? customCustomer.email.trim() || null : null,
        custom_project_name: isCustom ? customCustomer.project_name.trim() || null : null,
        is_custom_customer: isCustom,
        custom_customer: customPayload,
        project_id: form.project_id || null,
        delivery_date: form.delivery_date || null,
        status: form.status.toLowerCase(),
        order_ref: form.order_ref.trim() || null,
        driver_name: form.driver_name.trim() || null,
        driver_number: form.driver_number.trim() || null,
        vehicle_number: form.vehicle_number.trim() || null,
        delivery_method: form.delivery_method || "Company Vehicle",
        receiver_name: form.receiver_name.trim() || null,
        receiver_mobile: form.receiver_mobile.trim() || null,
        notes: serializedNotes || null,
        updated_at: new Date().toISOString(),
      };

      const executeSave = async (recordPayload: Record<string, unknown>) => {
        if (editing) {
          const { error: updateErr } = await supabase.from("delivery_notes").update(recordPayload).eq("id", editing.id);
          if (updateErr) throw updateErr;
          return { id: editing.id, number: editing.delivery_note_number || editing.id };
        } else {
          const cid = await getCompanyId();
          const dno = await generateDocNumber(cid, "DN");
          const { data: ins, error: err } = await supabase
            .from("delivery_notes")
            .insert({ ...recordPayload, company_id: cid, delivery_note_number: dno })
            .select("id")
            .single();
          if (err) throw new Error(err.message);
          return { id: ins.id, number: dno };
        }
      };

      let dnid: string;
      let dnNumber = "";
      try {
        const res = await executeSave(payload);
        dnid = res.id;
        dnNumber = res.number;
      } catch (saveErr: unknown) {
        const errObj = saveErr as { message?: string; code?: string };
        if (errObj?.message && (errObj.message.includes("column") || errObj.code === "PGRST204" || errObj.code === "42703")) {
          const minimalPayload = {
            customer_id: isCustom ? null : form.customer_id || null,
            project_id: form.project_id || null,
            delivery_date: form.delivery_date || null,
            status: form.status.toLowerCase(),
            customer_address: form.customer_address.trim() || null,
            contact_person: form.contact_person.trim() || null,
            contact_number: form.contact_number.trim() || null,
            order_ref: form.order_ref.trim() || null,
            driver_name: form.driver_name.trim() || null,
            driver_number: form.driver_number.trim() || null,
            vehicle_number: form.vehicle_number.trim() || null,
            delivery_method: form.delivery_method || "Company Vehicle",
            receiver_name: form.receiver_name.trim() || null,
            receiver_mobile: form.receiver_mobile.trim() || null,
            notes: serializedNotes || null,
            updated_at: new Date().toISOString(),
          };
          const res = await executeSave(minimalPayload);
          dnid = res.id;
          dnNumber = res.number;
        } else {
          throw saveErr;
        }
      }

      // Apply the preflight plan: repeated product lines use cumulative balances.
      if (shouldDeductStock) {
        for (const movement of stockPlan) {
          const { error: stockErr } = await supabase.from("products")
            .update({ current_stock: movement.newStock, updated_at: new Date().toISOString() })
            .eq("id", movement.productId).eq("company_id", stockCompanyId!);
          if (stockErr) throw stockErr;
          const { error: movementErr } = await supabase.from("stock_movements").insert({
            company_id: stockCompanyId!,
            product_id: movement.productId,
            movement_type: "OUT",
            quantity: movement.quantity,
            previous_stock: movement.previousStock,
            new_stock: movement.newStock,
            reference_type: "delivery_note",
            reference_id: dnid,
            notes: `Delivery Note ${dnNumber}`,
          });
          if (movementErr) throw movementErr;
        }
      }

      setSuccess(editing ? "Delivery note updated." : "Delivery note created.");
      closeForm();
      await loadAll();
    } catch (err: unknown) {
      setError(parseDatabaseError(err, "Failed to save delivery note"));
    } finally {
      setSaving(false);
    }
  }

  const custMap = Object.fromEntries(customers.map(c => [c.id, c]));
  const selectableCustomers = customers.filter(c => c.active !== false || c.id === form.customer_id);
  const prjMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const filtered = notes.filter(n => {
    if (filterStatus && (n.status || "").toLowerCase() !== filterStatus.toLowerCase()) return false;
    const cname = n.customer_name || custMap[n.customer_id || ""]?.name || "";
    const pname = n.custom_project_name || prjMap[n.project_id || ""]?.name || "";
    const simplifiedNum = formatDisplayDocNumber(n.delivery_note_number, "delivery_note");
    return [n.delivery_note_number, simplifiedNum, cname, pname, n.order_ref, n.driver_name, n.vehicle_number, n.receiver_name, n.status]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });

  async function deleteDN(dn: DN) {
    if (!window.confirm(`Are you sure you want to delete delivery note ${dn.delivery_note_number || "this delivery note"}? This cannot be undone.`)) return;
    setError("");
    try {
      const { error: itemDeleteErr } = await supabase.from("delivery_note_items").delete().eq("delivery_note_id", dn.id);
      if (itemDeleteErr) throw itemDeleteErr;
      const { error: delErr } = await supabase.from("delivery_notes").delete().eq("id", dn.id);
      if (delErr) {
        if (delErr.code === "23503") {
          throw new Error(`Cannot delete delivery note ${dn.delivery_note_number} because it is referenced by invoices or shipment records.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Delivery note ${dn.delivery_note_number} deleted successfully.`);
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery note.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <ClipboardList size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Delivery Notes</h1>
              <p className="text-sm text-slate-500">Real-world UAE dispatch logistics & delivery notes</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            <Plus size={18} /> New Delivery Note
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}

        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by DN #, customer, driver, vehicle, ref…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
            <ClipboardList size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No delivery notes found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">DN No.</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Dispatch Date</th>
                  <th className="px-4 py-3">Driver / Vehicle</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Receiver</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(dn => (
                  <tr key={dn.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {formatDisplayDocNumber(dn.delivery_note_number, "delivery_note") || "—"}
                      </span>
                      {dn.delivery_note_number && dn.delivery_note_number !== formatDisplayDocNumber(dn.delivery_note_number, "delivery_note") && (
                        <span className="text-[10px] text-slate-400 block font-normal mt-0.5" title="Original Database Identifier">
                          {dn.delivery_note_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{dn.customer_name || custMap[dn.customer_id || ""]?.name || "—"}</span>
                        {(dn.is_custom_customer || (!dn.customer_id && dn.customer_name)) && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Custom
                          </span>
                        )}
                      </div>
                      {dn.project_id && prjMap[dn.project_id] ? (
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                          {prjMap[dn.project_id]?.project_number}: {prjMap[dn.project_id]?.name}
                        </span>
                      ) : dn.custom_project_name ? (
                        <span className="inline-block mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                          Project: {dn.custom_project_name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(dn.delivery_date)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="font-medium">{dn.driver_name || "—"}</div>
                      {dn.vehicle_number && <div className="text-[11px] text-slate-400 font-mono">{dn.vehicle_number}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{dn.order_ref || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{dn.receiver_name || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(dn.status || "Draft")}`}>
                        {dn.status || "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handlePrintDN(dn)}
                          title="Print / View A4 Delivery Note"
                          className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-900 hover:text-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition"
                        >
                          <Printer size={13} /> Print
                        </button>
                        {(dn.status || "").toLowerCase() !== "delivered" && (
                          <button
                            onClick={() => openEdit(dn)}
                            title="Edit"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteDN(dn)}
                          title="Delete Delivery Note"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
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

      {/* Split-Screen Edit/Create Workspace with Live Preview */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-150">
          {/* Top Bar */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <ClipboardList size={18} />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-wide">
                  {editing ? "Edit Delivery Note" : "New Delivery Note"}
                </h2>
                <span className="font-mono text-xs rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                  {editing?.delivery_note_number || "[Draft Preview]"}
                </span>
                {editing && (
                  <button
                    type="button"
                    onClick={() => setShowRenameModal(true)}
                    className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-0.5 text-xs font-bold text-amber-300 transition cursor-pointer"
                  >
                    <Pencil size={11} />
                    <span>Edit #</span>
                  </button>
                )}
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
                form="dn-form"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-md transition cursor-pointer"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>{saving ? "Saving…" : editing ? "Save Changes" : "Save Delivery Note"}</span>
              </button>
              <button
                type="button"
                onClick={closeForm}
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

          {/* Main Split Body */}
          <div className="relative flex flex-1 overflow-hidden">
            {/* LEFT: Form Panel */}
            <div
              className={`flex flex-col border-r border-slate-800 bg-slate-900/90 text-slate-200 overflow-y-auto designer-scrollbar ${
                previewFullscreen ? "hidden" : "w-full lg:w-1/2"
              } ${activeTabMobile === "form" ? "block" : "hidden lg:flex"}`}
            >
              <div className="p-5 space-y-4">
                <form id="dn-form" onSubmit={save} className="space-y-4">
                  {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                  {form.status === "delivered" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-500/10 p-3 text-xs text-amber-300">
                      ⚠️ When saved as Delivered, stock will be automatically deducted for product line items.
                    </div>
                  )}

                  {/* Customer & Site Reference */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Customer & Site Reference</div>
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
                          <label className="mb-1 block text-xs font-medium text-slate-300">Customer <span className="text-red-500">*</span></label>
                          <select
                            value={form.customer_id}
                            onChange={e => onCustomerChange(e.target.value)}
                            required={partyMode === "existing"}
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                          >
                            <option value="">— Select Customer —</option>
                            {selectableCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-300">Project / Job (Optional)</label>
                          <select
                            value={form.project_id}
                            onChange={e => ff("project_id", e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          >
                            <option value="">— Select Project (Optional) —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.project_number} - {p.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-slate-300">Order / Invoice Ref</label>
                          <input
                            type="text"
                            value={form.order_ref}
                            onChange={e => ff("order_ref", e.target.value)}
                            placeholder="e.g. PO-8492 / INV-1002"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-slate-300">Delivery Address / Project Site</label>
                          <input
                            type="text"
                            value={form.customer_address}
                            onChange={e => ff("customer_address", e.target.value)}
                            placeholder="Delivery location details"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-300">Contact Person</label>
                          <input
                            type="text"
                            value={form.contact_person}
                            onChange={e => ff("contact_person", e.target.value)}
                            placeholder="Site contact name"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-300">Contact Tel / Mobile</label>
                          <input
                            type="text"
                            value={form.contact_number}
                            onChange={e => ff("contact_number", e.target.value)}
                            placeholder="+971 50 123 4567"
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                          ✍️ <strong>Custom Customer Mode</strong>: Enter customer information manually for this delivery note. No entry will be created in your customer database.
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-300">Customer / Company Name <span className="text-red-500">*</span></label>
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
                            <label className="mb-1 block text-xs font-medium text-slate-300">Project / Site Name (Optional)</label>
                            <input
                              type="text"
                              value={customCustomer.project_name}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, project_name: e.target.value }))}
                              placeholder="e.g. Dubai Marina Tower Phase 2"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-300">TRN (Optional)</label>
                            <input
                              type="text"
                              value={customCustomer.trn}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, trn: e.target.value }))}
                              placeholder="100XXXXXXXXX003"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-300">Delivery Address / Site Location</label>
                            <input
                              type="text"
                              value={customCustomer.address}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="Plot / Street / Emirate"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-300">Contact Person</label>
                            <input
                              type="text"
                              value={customCustomer.contact_person}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, contact_person: e.target.value }))}
                              placeholder="Site contact name"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-300">Contact Mobile / Phone</label>
                            <input
                              type="text"
                              value={customCustomer.phone}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="+971 50 123 4567"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-300">Contact Email</label>
                            <input
                              type="email"
                              value={customCustomer.email}
                              onChange={e => setCustomCustomer(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="contact@company.ae"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-300">Order / Invoice Ref</label>
                            <input
                              type="text"
                              value={form.order_ref}
                              onChange={e => ff("order_ref", e.target.value)}
                              placeholder="e.g. PO-8492 / INV-1002"
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dispatch & Transport Details */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dispatch & Transport Details</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Dispatch Date</label>
                        <input
                          type="date"
                          value={form.dispatch_date}
                          onChange={e => ff("dispatch_date", e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Delivery Method</label>
                        <select
                          value={form.delivery_method}
                          onChange={e => ff("delivery_method", e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                        >
                          <option>Company Vehicle</option>
                          <option>Customer Pickup</option>
                          <option>Third-Party Courier</option>
                          <option>Freight Carrier</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Status</label>
                        <select
                          value={form.status}
                          onChange={e => ff("status", e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white focus:border-amber-400 focus:outline-none"
                        >
                          <option value="draft">Draft</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Driver Name</label>
                        <input
                          type="text"
                          value={form.driver_name}
                          onChange={e => ff("driver_name", e.target.value)}
                          placeholder="Driver full name"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Driver Mobile</label>
                        <input
                          type="text"
                          value={form.driver_number}
                          onChange={e => ff("driver_number", e.target.value)}
                          placeholder="+971 55..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Vehicle Number</label>
                        <input
                          type="text"
                          value={form.vehicle_number}
                          onChange={e => ff("vehicle_number", e.target.value)}
                          placeholder="e.g. DXB 84920"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Item Details</p>
                      <span className="text-[11px] text-slate-400">{lines.length} Line(s)</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-800/80 text-[10px] font-semibold uppercase text-slate-400">
                            <th className="px-2.5 py-2 text-left w-44">Product Item</th>
                            <th className="px-2.5 py-2 text-left">Description</th>
                            <th className="px-2.5 py-2 w-16 text-center">Qty</th>
                            <th className="px-2.5 py-2 w-16 text-center">Unit</th>
                            <th className="px-2.5 py-2 text-left w-36">Remarks</th>
                            <th className="px-2.5 py-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {lines.map((l, i) => (
                            <tr key={i} className="hover:bg-slate-800/30">
                              <td className="p-1">
                                <select
                                  value={l.product_id}
                                  onChange={e => onProductSelect(i, e.target.value)}
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-white focus:outline-none"
                                >
                                  <option value="">— Select Product —</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.current_stock ?? 0})</option>)}
                                </select>
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={l.description}
                                  onChange={e => updateLine(i, "description", e.target.value)}
                                  placeholder="Description"
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-sans text-white focus:outline-none"
                                />
                              </td>
                              <td className="p-1">
                                <NumericCellInput
                                  value={l.quantity}
                                  onChange={(val) => updateLine(i, "quantity", val)}
                                  min={0.001}
                                  fallback={1}
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-xs text-center text-white focus:outline-none"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={l.unit}
                                  onChange={e => updateLine(i, "unit", e.target.value)}
                                  placeholder="Nos"
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-1 text-xs text-center text-white focus:outline-none"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={l.remarks || ""}
                                  onChange={e => updateLine(i, "remarks", e.target.value)}
                                  placeholder="Batch # / Tag"
                                  className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[11px] text-white focus:outline-none"
                                />
                              </td>
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLine(i)}
                                  disabled={lines.length === 1}
                                  className="text-slate-500 hover:text-rose-400 disabled:opacity-20 cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      onClick={addLine}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white transition cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Line Item</span>
                    </button>
                  </div>

                  {/* Receiver Acknowledgement */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Receiver Acknowledgement</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Receiver Name</label>
                        <input
                          type="text"
                          value={form.receiver_name}
                          onChange={e => ff("receiver_name", e.target.value)}
                          placeholder="Person receiving on site"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-300">Receiver Mobile</label>
                        <input
                          type="text"
                          value={form.receiver_mobile}
                          onChange={e => ff("receiver_mobile", e.target.value)}
                          placeholder="+971 50..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Delivery Notes / Remarks</label>
                    <textarea
                      value={form.notes}
                      onChange={e => ff("notes", e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                      placeholder="Special delivery instructions or remarks"
                    />
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
                  <span className="font-semibold text-slate-200">WYSIWYG Delivery Note Preview</span>
                  <span className="text-[10px] text-slate-400">({previewData.items.length} lines)</span>
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

      {/* A4 Print Modal */}
      <PrintModal isOpen={!!printDoc} onClose={() => setPrintDoc(null)}>
        {printDoc && (
          <DeliveryNoteTemplate
            company={company}
            deliveryNote={printDoc}
            onClose={() => setPrintDoc(null)}
          />
        )}
      </PrintModal>

      {showRenameModal && editing && (company?.id || editing.company_id) && (
        <EditDocumentReferenceModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          companyId={company?.id || editing.company_id}
          docType="delivery_note"
          documentId={editing.id}
          currentReferenceNumber={editing.delivery_note_number || ""}
          onSuccess={(newNum) => {
            setEditing((prev) => (prev ? { ...prev, delivery_note_number: newNum } : prev));
            loadAll();
            setSuccess(`Delivery note reference updated to ${newNum}`);
          }}
        />
      )}
    </main>
  );
}

