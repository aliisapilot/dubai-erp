"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Clock, X, Save, Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { getCompanyId, statusClass, todayISO } from "@/lib/helpers";

type Employee = { id: string; first_name: string | null; employee_number: string | null; basic_salary: number | null };
type OT = { id: string; company_id: string; employee_id: string | null; overtime_date: string | null; hours: number | null; approval_status: string | null; approved_by: string | null; created_at: string | null };
type OTForm = { employee_id: string; overtime_date: string; hours: string; approval_status: string; approved_by: string };
const empty: OTForm = { employee_id: "", overtime_date: todayISO(), hours: "0", approval_status: "Pending", approved_by: "" };
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function OvertimePage() {
  const [records, setRecords] = useState<OT[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<OTForm>(empty);
  const [search, setSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OT | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: ot }, { data: emps }] = await Promise.all([
      supabase.from("overtime").select("*").order("overtime_date", { ascending: false }),
      supabase.from("employees").select("id, first_name, employee_number, basic_salary").eq("status", "Active").order("first_name"),
    ]);
    setRecords((ot || []) as OT[]);
    setEmployees((emps || []) as Employee[]);
    setLoading(false);
  }

  const f = (k: keyof OTForm, v: string) => setForm(c => ({ ...c, [k]: v }));

  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(empty); setShowForm(true); }
  function openEdit(r: OT) {
    setError(""); setSuccess(""); setEditing(r);
    setForm({
      employee_id: r.employee_id || "",
      overtime_date: r.overtime_date || todayISO(),
      hours: String(r.hours ?? 0),
      approval_status: r.approval_status || "Pending",
      approved_by: r.approved_by || ""
    });
    setShowForm(true);
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.employee_id) { setError("Please select an employee."); return; }
    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id,
        overtime_date: form.overtime_date || null,
        hours: Number(form.hours) || 0,
        approval_status: form.approval_status,
        approved_by: form.approved_by.trim() || null,
        updated_at: new Date().toISOString()
      };
      if (editing) {
        const { error: err } = await supabase.from("overtime").update(payload).eq("id", editing.id);
        if (err) throw new Error(err.message);
        setSuccess("Overtime updated.");
      } else {
        const cid = await getCompanyId();
        const { error: err } = await supabase.from("overtime").insert({ ...payload, company_id: cid });
        if (err) throw new Error(err.message);
        setSuccess("Overtime added.");
      }
      closeForm(); await loadAll();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
    finally { setSaving(false); }
  }

  async function approve(r: OT) {
    const { error } = await supabase.from("overtime").update({ approval_status: "Approved", updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { setError(error.message); return; }
    setSuccess("Overtime approved."); await loadAll();
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const filtered = records.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false;
    if (filterStatus && r.approval_status !== filterStatus) return false;
    const empName = empMap[r.employee_id || ""]?.first_name || "";
    return [empName, r.overtime_date].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const totalHours = records.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const pending = records.filter(r => r.approval_status === "Pending").length;
  const approvedCount = records.filter(r => r.approval_status === "Approved").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Clock size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Overtime</h1><p className="text-sm text-slate-500">Track and approve employee overtime</p></div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />Add OT Record</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500 font-medium">Total OT Hours</p><p className="mt-1 text-2xl font-bold text-slate-700">{totalHours} hrs</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500 font-medium">Pending Approval</p><p className="mt-1 text-2xl font-bold text-amber-600">{pending}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><p className="text-xs text-slate-500 font-medium">Approved</p><p className="mt-1 text-2xl font-bold text-emerald-600">{approvedCount}</p></div>
        </div>
        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" /></div>
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.employee_number ? `${e.employee_number} - ` : ""}{e.first_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
            <option value="">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option>
          </select>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><Clock size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No overtime records.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-center">OT Hours</th><th className="px-4 py-3">Approved By</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-900">{empMap[r.employee_id || ""]?.first_name || "—"}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.overtime_date || "—"}</td>
                    <td className="px-4 py-3 text-center text-slate-600 font-bold">{r.hours ?? 0} hrs</td>
                    <td className="px-4 py-3 text-slate-600">{r.approved_by || "—"}</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(r.approval_status || "Pending")}`}>{r.approval_status || "Pending"}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>
                      {r.approval_status === "Pending" && <button onClick={() => approve(r)} title="Approve" className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><CheckCircle2 size={14} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Showing {filtered.length} of {records.length} records</div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit OT Record" : "Add OT Record"}</h2>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="ot-form" onSubmit={save} className="p-6 space-y-4">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Employee <span className="text-red-500">*</span></label>
                  <select value={form.employee_id} onChange={e => f("employee_id", e.target.value)} required className={sel}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.employee_number ? `${e.employee_number} - ` : ""}{e.first_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Date</label><input type="date" value={form.overtime_date} onChange={e => f("overtime_date", e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">OT Hours</label><input type="number" min="0" step="0.5" value={form.hours} onChange={e => f("hours", e.target.value)} className={inp} /></div>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Approval Status</label>
                  <select value={form.approval_status} onChange={e => f("approval_status", e.target.value)} className={sel}><option>Pending</option><option>Approved</option><option>Rejected</option></select>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Approved By</label><input type="text" value={form.approved_by} onChange={e => f("approved_by", e.target.value)} className={inp} /></div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="ot-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : editing ? "Save Changes" : "Add Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
