"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Clock, X, Save, Loader2, Pencil, CheckCircle2, Trash2 } from "lucide-react";
import { getCompanyId, statusClass, todayISO, formatEmployeeCode, compareEmployees } from "@/lib/helpers";

type Employee = { id: string; first_name: string | null; employee_number: string | null; basic_salary: number | null };
type OT = { id: string; company_id: string; employee_id: string | null; overtime_date: string | null; hours: number | null; approval_status: string | null; approved_by: string | null; created_at: string | null };
type ApprovalStatus = "pending" | "approved" | "rejected";
type OTForm = { employee_id: string; overtime_date: string; hours: string; approval_status: ApprovalStatus };
const empty: OTForm = { employee_id: "", overtime_date: todayISO(), hours: "0", approval_status: "pending" };
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";
const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function normalizeApprovalStatus(status: unknown): ApprovalStatus {
  const normalized = String(status || "pending").trim().toLowerCase();
  return APPROVAL_OPTIONS.some(option => option.value === normalized)
    ? normalized as ApprovalStatus
    : "pending";
}

function formatApprovalStatus(status: unknown): string {
  const normalized = normalizeApprovalStatus(status);
  return APPROVAL_OPTIONS.find(option => option.value === normalized)?.label || "Pending";
}

import MonthlyAttendanceOvertimeSheet from "@/components/attendance/MonthlyAttendanceOvertimeSheet";
import { FileSpreadsheet } from "lucide-react";

export default function OvertimePage() {
  const [viewMode, setViewMode] = useState<"monthly" | "list">("monthly");
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
      supabase.from("employees").select("id, first_name, employee_number, basic_salary").in("status", ["active", "Active"]).order("first_name"),
    ]);
    setRecords((ot || []) as OT[]);
    const list = ((emps || []) as Employee[]).sort(compareEmployees);
    setEmployees(list);
    setLoading(false);
  }

  const f = <K extends keyof OTForm>(k: K, v: OTForm[K]) => setForm(c => ({ ...c, [k]: v }));

  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(empty); setShowForm(true); }
  function openEdit(r: OT) {
    setError(""); setSuccess(""); setEditing(r);
    setForm({
      employee_id: r.employee_id || "",
      overtime_date: r.overtime_date || todayISO(),
      hours: String(r.hours ?? 0),
      approval_status: normalizeApprovalStatus(r.approval_status),
    });
    setShowForm(true);
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.employee_id) { setError("Please select an employee."); return; }
    setSaving(true);
    try {
      const approvalStatus = normalizeApprovalStatus(form.approval_status);
      let approvedBy: string | null = null;
      if (approvalStatus === "approved") {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error(authError.message);
        if (!authData.user) throw new Error("You must be signed in to approve overtime.");
        approvedBy = authData.user.id;
      }
      const payload = {
        employee_id: form.employee_id,
        overtime_date: form.overtime_date || null,
        hours: Number(form.hours) || 0,
        approval_status: approvalStatus,
        approved_by: approvedBy,
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error saving overtime";
      setError(message.includes("overtime_approval_status_check")
        ? "The selected overtime approval status is not supported by the database."
        : message);
    }
    finally { setSaving(false); }
  }

  async function approve(r: OT) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError(authError?.message || "You must be signed in to approve overtime.");
      return;
    }
    const { error } = await supabase.from("overtime").update({ approval_status: "approved", approved_by: authData.user.id, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { setError(error.message); return; }
    setSuccess("Overtime approved."); await loadAll();
  }

  async function deleteOvertime(r: OT) {
    const empName = empMap[r.employee_id || ""]?.first_name || "this employee";
    const dateStr = r.overtime_date || "selected date";
    if (!confirm(`Are you sure you want to delete the overtime record of ${r.hours ?? 0} hrs for "${empName}" on ${dateStr}? This action cannot be undone.`)) {
      return;
    }
    try {
      const { error: err } = await supabase.from("overtime").delete().eq("id", r.id);
      if (err) {
        if (err.code === "23503" || err.message?.includes("foreign key")) {
          alert("Cannot delete overtime record because it is referenced by other records (e.g. payroll statements).");
        } else {
          alert("Error deleting overtime record: " + err.message);
        }
        return;
      }
      setSuccess("Overtime record deleted successfully.");
      if (editing?.id === r.id) {
        closeForm();
      }
      await loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete overtime record");
    }
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const filtered = records
    .filter(r => {
      if (filterEmp && r.employee_id !== filterEmp) return false;
      if (filterStatus && normalizeApprovalStatus(r.approval_status) !== filterStatus) return false;
      const empName = empMap[r.employee_id || ""]?.first_name || "";
      return [empName, r.overtime_date].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      const dateDiff = (b.overtime_date || "").localeCompare(a.overtime_date || "");
      if (dateDiff !== 0) return dateDiff;
      const empA = a.employee_id ? empMap[a.employee_id] : null;
      const empB = b.employee_id ? empMap[b.employee_id] : null;
      return compareEmployees(empA || {}, empB || {});
    });
  const totalHours = records.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const pending = records.filter(r => normalizeApprovalStatus(r.approval_status) === "pending").length;
  const approvedCount = records.filter(r => normalizeApprovalStatus(r.approval_status) === "approved").length;

  if (viewMode === "monthly") {
    return <MonthlyAttendanceOvertimeSheet initialTab="overtime" onSwitchToLegacy={() => setViewMode("list")} />;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Clock size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Overtime</h1><p className="text-sm text-slate-500">Track and approve employee overtime</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("monthly")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span>Monthly Workbook View</span>
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              <Plus size={18} />Add OT Record
            </button>
          </div>
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
            {employees.map((e) => <option key={e.id} value={e.id}>{formatEmployeeCode(e.employee_number)} - {e.first_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
            <option value="">All Status</option>{APPROVAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><Clock size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No overtime records.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-center">OT Hours</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-semibold text-slate-900">{empMap[r.employee_id || ""]?.first_name || "—"}</div><div className="font-mono text-xs text-slate-400 font-bold">{formatEmployeeCode(empMap[r.employee_id || ""]?.employee_number)}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.overtime_date || "—"}</td>
                    <td className="px-4 py-3 text-center text-slate-600 font-bold">{r.hours ?? 0} hrs</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(formatApprovalStatus(r.approval_status))}`}>{formatApprovalStatus(r.approval_status)}</span></td>
                    <td className="px-4 py-3"><div className="flex justify-center gap-1">
                      <button onClick={() => openEdit(r)} title="Edit Overtime" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>
                      {normalizeApprovalStatus(r.approval_status) === "pending" && <button onClick={() => approve(r)} title="Approve" className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><CheckCircle2 size={14} /></button>}
                      <button onClick={() => deleteOvertime(r)} title="Delete Overtime" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"><Trash2 size={14} /></button>
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
                    {employees.map((e) => <option key={e.id} value={e.id}>{formatEmployeeCode(e.employee_number)} - {e.first_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Date</label><input type="date" value={form.overtime_date} onChange={e => f("overtime_date", e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">OT Hours</label><input type="number" min="0" step="0.5" value={form.hours} onChange={e => f("hours", e.target.value)} className={inp} /></div>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Approval Status</label>
                  <select value={form.approval_status} onChange={e => f("approval_status", normalizeApprovalStatus(e.target.value))} className={sel}>{APPROVAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                </div>
                <p className="text-xs text-slate-500">Approved records are attributed automatically to the signed-in user.</p>
              </form>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              {editing ? (
                <button
                  type="button"
                  onClick={() => deleteOvertime(editing)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                >
                  <Trash2 size={14} /> Delete
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" form="ot-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : editing ? "Save Changes" : "Add Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
