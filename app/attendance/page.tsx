"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, CalendarCheck, X, Save, Loader2, Pencil, Trash2 } from "lucide-react";
import { getCompanyId, statusClass, todayISO } from "@/lib/helpers";

type Employee = { id: string; first_name: string | null; employee_number: string | null };
type Att = { id: string; company_id: string; employee_id: string | null; attendance_date: string | null; check_in: string | null; check_out: string | null; total_hours: number | null; regular_hours: number | null; overtime_hours: number | null; status: string | null; remarks: string | null };
type AttendanceStatus = "present" | "absent" | "leave" | "holiday" | "late" | "early_departure";
type AttForm = { employee_id: string; attendance_date: string; check_in: string; check_out: string; regular_hours: string; overtime_hours: string; status: AttendanceStatus; remarks: string };
const empty: AttForm = { employee_id:"", attendance_date: todayISO(), check_in:"", check_out:"", regular_hours:"8", overtime_hours:"0", status:"present", remarks:"" };
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";
const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "holiday", label: "Holiday" },
  { value: "late", label: "Late" },
  { value: "early_departure", label: "Early Departure" },
];

function normalizeAttendanceStatus(status: unknown): AttendanceStatus {
  const normalized = String(status || "present").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_OPTIONS.some(option => option.value === normalized)
    ? normalized as AttendanceStatus
    : "present";
}

function formatAttendanceStatus(status: unknown): string {
  const normalized = normalizeAttendanceStatus(status);
  return STATUS_OPTIONS.find(option => option.value === normalized)?.label || "Present";
}

export default function AttendancePage() {
  const [records, setRecords] = useState<Att[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<AttForm>(empty);
  const [search, setSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Att | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: att }, { data: emps }] = await Promise.all([
      supabase.from("attendance").select("*").order("attendance_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employees").select("id, first_name, employee_number").in("status", ["active", "Active"]).order("first_name"),
    ]);
    setRecords((att || []) as Att[]);
    setEmployees((emps || []) as Employee[]);
    setLoading(false);
  }

  const f = (k: keyof AttForm, v: string) => setForm(c => ({ ...c, [k]: v }));
  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(empty); setShowForm(true); }
  function openEdit(r: Att) {
    setError(""); setSuccess(""); setEditing(r);
    setForm({ employee_id: r.employee_id||"", attendance_date: r.attendance_date||todayISO(), check_in: r.check_in||"", check_out: r.check_out||"", regular_hours: String(r.regular_hours??8), overtime_hours: String(r.overtime_hours??0), status: normalizeAttendanceStatus(r.status), remarks: r.remarks||"" });
    setShowForm(true);
  }
  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function deleteAttendance(r: Att) {
    const empName = empMap[r.employee_id || ""]?.first_name || "this employee";
    const dateStr = r.attendance_date || "selected date";
    if (!confirm(`Are you sure you want to delete the attendance record for "${empName}" on ${dateStr}? This action cannot be undone.`)) {
      return;
    }
    try {
      const { error: err } = await supabase.from("attendance").delete().eq("id", r.id);
      if (err) {
        if (err.code === "23503" || err.message?.includes("foreign key")) {
          alert("Cannot delete attendance record because it is referenced by other records (e.g. payroll statements).");
        } else {
          alert("Error deleting attendance record: " + err.message);
        }
        return;
      }
      setSuccess("Attendance record deleted successfully.");
      if (editing?.id === r.id) {
        closeForm();
      }
      await loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete attendance record");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.employee_id) { setError("Please select an employee."); return; }
    if (!form.attendance_date) { setError("Date is required."); return; }
    setSaving(true);
    try {
      const cin = form.check_in || null;
      const cout = form.check_out || null;
      let totalHours: number | null = null;
      if (cin && cout) {
        const [h1,m1] = cin.split(":").map(Number);
        const [h2,m2] = cout.split(":").map(Number);
        totalHours = Math.max(0, (h2*60+m2 - h1*60-m1)/60);
      }
      const payload = { employee_id: form.employee_id, attendance_date: form.attendance_date, check_in: cin, check_out: cout, total_hours: totalHours, regular_hours: Number(form.regular_hours)||8, overtime_hours: Number(form.overtime_hours)||0, status: normalizeAttendanceStatus(form.status), remarks: form.remarks.trim()||null, updated_at: new Date().toISOString() };
      if (editing) {
        const { error: err } = await supabase.from("attendance").update(payload).eq("id", editing.id);
        if (err) throw new Error(err.message);
        setSuccess("Attendance updated.");
      } else {
        const cid = await getCompanyId();
        const { error: err } = await supabase.from("attendance").insert({ ...payload, company_id: cid });
        if (err) throw new Error(err.message === "duplicate key value violates unique constraint \"attendance_employee_date_unique\"" ? "Attendance already exists for this employee on this date." : err.message);
        setSuccess("Attendance added.");
      }
      closeForm(); await loadAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error saving attendance";
      setError(message.includes("attendance_status_check")
        ? "The selected attendance status is not supported by the database."
        : message);
    }
    finally { setSaving(false); }
  }

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const filtered = records.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false;
    if (filterDate && r.attendance_date !== filterDate) return false;
    const empName = empMap[r.employee_id||""]?.first_name||"";
    return [empName, r.attendance_date, r.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });
  const presentToday = records.filter(r => r.attendance_date === todayISO() && normalizeAttendanceStatus(r.status) === "present").length;
  const absentToday = records.filter(r => r.attendance_date === todayISO() && normalizeAttendanceStatus(r.status) === "absent").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl bg-slate-900 p-2 sm:p-2.5 text-white shrink-0"><CalendarCheck size={20} /></div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Attendance</h1>
              <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">Track daily employee attendance</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-semibold text-white hover:bg-slate-800 shrink-0"><Plus size={16} /><span className="hidden sm:inline">Add Record</span><span className="sm:hidden">Add</span></button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-3 sm:py-4"><p className="text-xs text-slate-500 font-medium">Today Present</p><p className="mt-1 text-xl sm:text-2xl font-bold text-emerald-600">{presentToday}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-3 sm:py-4"><p className="text-xs text-slate-500 font-medium">Today Absent</p><p className="mt-1 text-xl sm:text-2xl font-bold text-red-500">{absentToday}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-3 sm:py-4 col-span-2 sm:col-span-1"><p className="text-xs text-slate-500 font-medium">Total Records</p><p className="mt-1 text-xl sm:text-2xl font-bold text-slate-700">{records.length}</p></div>
        </div>
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" /></div>
          <div className="flex gap-3">
            <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} className="flex-1 sm:flex-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none">
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name}</option>)}
            </select>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="flex-1 sm:flex-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none" />
            {filterDate && <button onClick={()=>setFilterDate("")} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50">Clear</button>}
          </div>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><CalendarCheck size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No attendance records found.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 whitespace-nowrap">Employee</th><th className="px-4 py-3 whitespace-nowrap">Date</th><th className="px-4 py-3 whitespace-nowrap">Check In</th><th className="px-4 py-3 whitespace-nowrap">Check Out</th><th className="px-4 py-3 text-center whitespace-nowrap">Hours</th><th className="px-4 py-3 text-center whitespace-nowrap">OT Hrs</th><th className="px-4 py-3 text-center whitespace-nowrap">Status</th><th className="px-4 py-3 text-center whitespace-nowrap">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900 whitespace-nowrap">{empMap[r.employee_id||""]?.first_name||"—"}</div><div className="text-xs text-slate-400">{empMap[r.employee_id||""]?.employee_number||""}</div></td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.attendance_date||"—"}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.check_in||"—"}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.check_out||"—"}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{r.total_hours != null ? r.total_hours.toFixed(1) : "—"}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{r.overtime_hours != null ? r.overtime_hours.toFixed(1) : "0"}</td>
                      <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(formatAttendanceStatus(r.status))}`}>{formatAttendanceStatus(r.status)}</span></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(r)} title="Edit Attendance" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteAttendance(r)} title="Delete Attendance" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Showing {filtered.length} of {records.length} records</div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{editing?"Edit Attendance":"Add Attendance"}</h2>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="att-form" onSubmit={save} className="p-6 space-y-4">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Employee <span className="text-red-500">*</span></label>
                  <select value={form.employee_id} onChange={e=>f("employee_id",e.target.value)} required className={sel}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.employee_number ? `${e.employee_number} - ` : ""}{e.first_name}</option>)}
                  </select>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Date <span className="text-red-500">*</span></label><input type="date" value={form.attendance_date} onChange={e=>f("attendance_date",e.target.value)} required className={inp} /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                  <select value={form.status} onChange={e=>f("status",normalizeAttendanceStatus(e.target.value))} className={sel}>
                    {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Check In</label><input type="time" value={form.check_in} onChange={e=>f("check_in",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Check Out</label><input type="time" value={form.check_out} onChange={e=>f("check_out",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Regular Hours</label><input type="number" min="0" max="24" step="0.5" value={form.regular_hours} onChange={e=>f("regular_hours",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Overtime Hours</label><input type="number" min="0" max="24" step="0.5" value={form.overtime_hours} onChange={e=>f("overtime_hours",e.target.value)} className={inp} /></div>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Remarks</label><textarea value={form.remarks} onChange={e=>f("remarks",e.target.value)} rows={2} className={inp} /></div>
              </form>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              {editing ? (
                <button
                  type="button"
                  onClick={() => deleteAttendance(editing)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                >
                  <Trash2 size={14} /> Delete
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" form="att-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>} {saving?"Saving…":editing?"Save Changes":"Add Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
