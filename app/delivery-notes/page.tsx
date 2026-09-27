"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, X, Save, Loader2, Pencil, Printer, Trash2, ClipboardList } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtDate, todayISO, generateDocNumber } from "@/lib/helpers";
import DeliveryNoteTemplate, { DeliveryNoteData } from "@/components/documents/DeliveryNoteTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { parseDatabaseError } from "@/lib/paymentTypes";
import { withCustomerDocumentDetails } from "@/lib/documentCustomer";

type Customer = { id: string; name: string | null; customer_code: string | null; trn: string | null; address: string | null; contact_person: string | null; phone: string | null; mobile: string | null; email: string | null; active: boolean | null };
type Product = { id: string; name: string | null; sku: string | null; unit: string | null; current_stock: number | null };
type Project = { id: string; name: string | null; project_number: string | null };
type DNLine = { product_id: string; description: string; quantity: number; unit: string; remarks?: string; sort_order: number };

type DN = {
  id: string;
  company_id: string;
  delivery_note_number: string | null; // DB: delivery_note_number (not dn_number)
  customer_id: string | null;
  project_id?: string | null;
  delivery_date: string | null; // DB: delivery_date (not dn_date or dispatch_date)
  status: string | null;
  customer_address: string | null;
  contact_person: string | null;
  contact_number: string | null;
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
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function DeliveryNotesPage() {
  const [notes, setNotes] = useState<DN[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);

  const [form, setForm] = useState<DNForm>(emptyForm);
  const [lines, setLines] = useState<DNLine[]>([emptyLine()]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DN | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Print Modal State
  const [printDoc, setPrintDoc] = useState<DeliveryNoteData | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: dn }, { data: c }, { data: p }, co, { data: prjs }] = await Promise.all([
      supabase.from("delivery_notes").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, customer_code, trn, address, contact_person, phone, mobile, email, active").order("name"),
      supabase.from("products").select("id, name, sku, unit, current_stock").eq("active", true).order("name"),
      getCurrentCompany(),
      supabase.from("projects").select("id, name, project_number").order("created_at", { ascending: false }),
    ]);
    setNotes((dn || []) as DN[]);
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
    setLines(ls => ls.map((l, i) => i !== idx ? l : {
      ...l,
      product_id: pid,
      description: prod?.name || l.description,
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
    setForm(emptyForm);
    setLines([emptyLine()]);
    setShowForm(true);
  }

  async function openEdit(dn: DN) {
    setError("");
    setSuccess("");
    setEditing(dn);
    setForm({
      customer_id: dn.customer_id || "",
      project_id: dn.project_id || "",
      delivery_date: dn.delivery_date || todayISO(),
      dispatch_date: dn.delivery_date || todayISO(),
      status: (dn.status || "draft").toLowerCase(),
      customer_address: dn.customer_address || "",
      contact_person: dn.contact_person || "",
      contact_number: dn.contact_number || "",
      order_ref: dn.order_ref || "",
      driver_name: dn.driver_name || "",
      driver_number: dn.driver_number || "",
      vehicle_number: dn.vehicle_number || "",
      delivery_method: dn.delivery_method || "Company Vehicle",
      receiver_name: dn.receiver_name || "",
      receiver_mobile: dn.receiver_mobile || "",
      notes: dn.notes || "",
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
      project_name: prj?.name || null,
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

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id,
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
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      let dnid: string;
      let dnNumber = "";

      if (editing) {
        const { error: updateErr } = await supabase.from("delivery_notes").update(payload).eq("id", editing.id);
        if (updateErr) throw updateErr;
        dnid = editing.id;
        dnNumber = editing.delivery_note_number || editing.id; // DB: delivery_note_number
        const { error: deleteItemsErr } = await supabase.from("delivery_note_items").delete().eq("delivery_note_id", dnid); // DB FK
        if (deleteItemsErr) throw deleteItemsErr;
      } else {
        const cid = await getCompanyId();
        const dno = await generateDocNumber(cid, "DN");
        dnNumber = dno;
        const { data: ins, error: err } = await supabase
          .from("delivery_notes")
          .insert({ ...payload, company_id: cid, delivery_note_number: dno }) // DB: delivery_note_number
          .select("id")
          .single();
        if (err) throw new Error(err.message);
        dnid = ins.id;
      }

      const { error: itemErr } = await supabase.from("delivery_note_items").insert(
        lines
          .filter(l => l.description.trim())
          .map((l, i) => ({
            delivery_note_id: dnid, // DB FK: delivery_note_id (not dn_id)
            product_id: l.product_id || null,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit || "Nos",
            remarks: l.remarks || null,
            sort_order: i,
          }))
      );
      if (itemErr) throw itemErr;

      // Stock deduction if Delivered
      if (form.status === "delivered" && editing?.status?.toLowerCase() !== "delivered") {
        for (const l of lines) {
          if (!l.product_id || l.quantity <= 0) continue;
          const prod = products.find(p => p.id === l.product_id);
          if (!prod) continue;
          const newStock = Math.max(0, (prod.current_stock || 0) - l.quantity);
          const { error: stockErr } = await supabase.from("products").update({ current_stock: newStock, updated_at: new Date().toISOString() }).eq("id", l.product_id);
          if (stockErr) throw stockErr;
          const cid = await getCompanyId();
          const { error: movementErr } = await supabase.from("stock_movements").insert({
            company_id: cid,
            product_id: l.product_id,
            movement_type: "OUT",
            quantity: l.quantity,
            previous_stock: prod.current_stock, // DB: previous_stock (not before_stock)
            new_stock: newStock, // DB: new_stock (not after_stock)
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
    const cname = custMap[n.customer_id || ""]?.name || "";
    const pname = prjMap[n.project_id || ""]?.name || "";
    return [n.delivery_note_number, cname, pname, n.order_ref, n.driver_name, n.vehicle_number, n.receiver_name, n.status]
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
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">{dn.delivery_note_number || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>{custMap[dn.customer_id || ""]?.name || "—"}</div>
                      {dn.project_id && prjMap[dn.project_id] && (
                        <span className="inline-block mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">
                          {prjMap[dn.project_id]?.project_number}: {prjMap[dn.project_id]?.name}
                        </span>
                      )}
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

      {/* Edit/Create Drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{editing ? "Edit Delivery Note" : "New Delivery Note"}</h2>
                {!editing ? (
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium border border-blue-200">
                    DN #: Auto-generated on save
                  </span>
                ) : (
                  <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-medium border border-slate-200">
                    DN #: {editing.delivery_note_number} (Read-only)
                  </span>
                )}
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="dn-form" onSubmit={save} className="p-6 space-y-4">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {form.status === "delivered" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    ⚠️ When saved as Delivered, stock will be automatically deducted for product line items.
                  </div>
                )}

                {/* Section 1: Customer & Order Reference */}
                <div className="rounded-lg border border-slate-200 p-3.5 space-y-3 bg-slate-50/50">
                  <div className="text-xs font-bold uppercase text-slate-700">Customer & Site Reference</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Customer <span className="text-red-500">*</span></label>
                      <select value={form.customer_id} onChange={e => onCustomerChange(e.target.value)} required className={sel}>
                        <option value="">— Select Customer —</option>
                        {selectableCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Project / Job (Optional)</label>
                      <select value={form.project_id} onChange={e => ff("project_id", e.target.value)} className={sel}>
                        <option value="">— Select Project (Optional) —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.project_number} - {p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">Order / Invoice Ref</label>
                      <input type="text" value={form.order_ref} onChange={e => ff("order_ref", e.target.value)} placeholder="e.g. PO-8492 / INV-1002" className={inp} />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-700">Delivery Address / Project Site</label>
                      <input type="text" value={form.customer_address} onChange={e => ff("customer_address", e.target.value)} placeholder="Delivery location details" className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Contact Person</label>
                      <input type="text" value={form.contact_person} onChange={e => ff("contact_person", e.target.value)} placeholder="Site contact name" className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Contact Tel / Mobile</label>
                      <input type="text" value={form.contact_number} onChange={e => ff("contact_number", e.target.value)} placeholder="+971 50 123 4567" className={inp} />
                    </div>
                  </div>
                </div>

                {/* Section 2: Logistics & Transport */}
                <div className="rounded-lg border border-slate-200 p-3.5 space-y-3 bg-slate-50/50">
                  <div className="text-xs font-bold uppercase text-slate-700">Dispatch & Transport Details</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Dispatch Date</label>
                      <input type="date" value={form.dispatch_date} onChange={e => ff("dispatch_date", e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Delivery Method</label>
                      <select value={form.delivery_method} onChange={e => ff("delivery_method", e.target.value)} className={sel}>
                        <option>Company Vehicle</option>
                        <option>Customer Pickup</option>
                        <option>Third-Party Courier</option>
                        <option>Freight Carrier</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                      <select value={form.status} onChange={e => ff("status", e.target.value)} className={sel}>
                        <option value="draft">Draft</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Driver Name</label>
                      <input type="text" value={form.driver_name} onChange={e => ff("driver_name", e.target.value)} placeholder="Driver full name" className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Driver Mobile</label>
                      <input type="text" value={form.driver_number} onChange={e => ff("driver_number", e.target.value)} placeholder="+971 55..." className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Vehicle Number</label>
                      <input type="text" value={form.vehicle_number} onChange={e => ff("vehicle_number", e.target.value)} placeholder="e.g. DXB 84920" className={inp} />
                    </div>
                  </div>
                </div>

                {/* Section 3: Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Item Details</p>
                    <span className="text-[11px] text-slate-500">{lines.length} Line(s)</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="px-2 py-2 text-left w-44">Product Item</th>
                          <th className="px-2 py-2 text-left">Description</th>
                          <th className="px-2 py-2 w-16 text-center">Qty</th>
                          <th className="px-2 py-2 w-16 text-center">Unit</th>
                          <th className="px-2 py-2 text-left w-36">Remarks</th>
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-1.5 py-1">
                              <select value={l.product_id} onChange={e => onProductSelect(i, e.target.value)} className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none">
                                <option value="">— Select Product —</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.current_stock ?? 0})</option>)}
                              </select>
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="text" value={l.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Description" className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none" />
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="number" min="1" step="1" value={l.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-center focus:outline-none" />
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="text" value={l.unit} onChange={e => updateLine(i, "unit", e.target.value)} placeholder="Nos" className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-center focus:outline-none" />
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="text" value={l.remarks || ""} onChange={e => updateLine(i, "remarks", e.target.value)} placeholder="e.g. Batch # / Tag" className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none" />
                            </td>
                            <td className="px-1.5 py-1 text-center">
                              <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="text-slate-400 hover:text-red-500 disabled:opacity-30">
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLine} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-400">
                    <Plus size={14} /> Add Line Item
                  </button>
                </div>

                {/* Section 4: Receiver Acknowledgement */}
                <div className="rounded-lg border border-slate-200 p-3.5 space-y-3 bg-slate-50/50">
                  <div className="text-xs font-bold uppercase text-slate-700">Receiver Acknowledgement</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Receiver Name</label>
                      <input type="text" value={form.receiver_name} onChange={e => ff("receiver_name", e.target.value)} placeholder="Person receiving on site" className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Receiver Mobile</label>
                      <input type="text" value={form.receiver_mobile} onChange={e => ff("receiver_mobile", e.target.value)} placeholder="+971 50..." className={inp} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Delivery Notes / Remarks</label>
                  <textarea value={form.notes} onChange={e => ff("notes", e.target.value)} rows={2} className={inp} placeholder="Special delivery instructions or remarks" />
                </div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" form="dn-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Delivery Note"}
              </button>
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
    </main>
  );
}

