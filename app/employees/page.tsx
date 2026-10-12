"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Users2, X, Save, Loader2, Pencil, Power, Trash2 } from "lucide-react";
import { getCompanyId, statusClass, formatEmployeeCode } from "@/lib/helpers";

import {
  getEmployeeSalarySettings,
  saveEmployeeSalarySettings,
  OvertimeCostingMethod,
} from "@/lib/payrollWorkflowService";

// DB verified: employees columns: id, first_name, employee_number, designation, department, phone, email,
// joining_date, employee_code, account_number, basic_salary, bank_name, iban, payment_method, status, company_id
// Optional columns: housing_allowance, transport_allowance, other_allowances, overtime_rate, overtime_costing_method, working_days_divisor, overtime_multiplier, salary_effective_date
type Employee = {
  id: string; company_id: string; employee_number: string | null;
  first_name: string | null; // DB: first_name (not name)
  designation: string | null; department: string | null;
  joining_date: string | null; basic_salary: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances?: number | null;
  overtime_rate?: number | null;
  overtime_costing_method?: string | null;
  working_days_divisor?: number | null;
  overtime_multiplier?: number | null;
  salary_effective_date?: string | null;
  payment_method: string | null;
  bank_name: string | null; account_number: string | null; iban: string | null;
  email: string | null; phone: string | null;
  status: string | null;
};

export type EmployeeStatus = "active" | "inactive" | "on_leave" | "terminated";

export const EMPLOYEE_STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On Leave" },
  { value: "terminated", label: "Terminated" },
];

export function normalizeEmployeeStatus(status: unknown): EmployeeStatus {
  if (!status) return "active";
  const s = String(status).toLowerCase().trim().replace(/\s+/g, "_");
  const found = EMPLOYEE_STATUS_OPTIONS.find(opt => opt.value === s);
  return found ? found.value : "active";
}

export function formatEmployeeStatus(status: string | null | undefined): string {
  if (!status) return "Active";
  const norm = normalizeEmployeeStatus(status);
  const found = EMPLOYEE_STATUS_OPTIONS.find(opt => opt.value === norm);
  return found ? found.label : status.charAt(0).toUpperCase() + status.slice(1);
}

function toDbStatus(status: EmployeeStatus): string {
  return normalizeEmployeeStatus(status);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return fallback;
}

type EmpForm = {
  employee_number: string;
  first_name: string;
  designation: string;
  department: string;
  joining_date: string;
  basic_salary: string;
  housing_allowance: string;
  transport_allowance: string;
  other_allowances: string;
  overtime_rate: string;
  overtime_costing_method: OvertimeCostingMethod;
  working_days_divisor: string;
  overtime_multiplier: string;
  salary_effective_date: string;
  payment_method: string;
  bank_name: string;
  account_number: string;
  iban: string;
  email: string;
  phone: string;
  status: EmployeeStatus;
};

const empty: EmpForm = {
  employee_number: "",
  first_name: "",
  designation: "",
  department: "",
  joining_date: "",
  basic_salary: "0",
  housing_allowance: "0",
  transport_allowance: "0",
  other_allowances: "0",
  overtime_rate: "",
  overtime_costing_method: "auto",
  working_days_divisor: "30",
  overtime_multiplier: "1.25",
  salary_effective_date: "",
  payment_method: "Bank Transfer",
  bank_name: "",
  account_number: "",
  iban: "",
  email: "",
  phone: "",
  status: "active",
};

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<EmpForm>(empty);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    if (error) { setError(error.message); setEmployees([]); }
    else setEmployees((data || []) as Employee[]);
    setLoading(false);
  }

  const f = <K extends keyof EmpForm>(k: K, v: EmpForm[K]) => setForm(c => ({ ...c, [k]: v }));

  function openAdd() { setError(""); setSuccess(""); setEditing(null); setForm(empty); setShowForm(true); }

  async function openEdit(e: Employee) {
    setError(""); setSuccess(""); setEditing(e);
    // Load persisted payroll settings
    const settings = await getEmployeeSalarySettings(e.id);
    setForm({
      employee_number: formatEmployeeCode(e.employee_number),
      first_name: e.first_name||"",
      designation: e.designation||"",
      department: e.department||"",
      joining_date: e.joining_date||"",
      basic_salary: String(e.basic_salary ?? settings.basic_salary ?? 0),
      housing_allowance: String(e.housing_allowance ?? settings.housing_allowance ?? 0),
      transport_allowance: String(e.transport_allowance ?? settings.transport_allowance ?? 0),
      other_allowances: String(e.other_allowances ?? settings.other_allowances ?? 0),
      overtime_rate: settings.overtime_rate != null ? String(settings.overtime_rate) : (e.overtime_rate != null ? String(e.overtime_rate) : ""),
      overtime_costing_method: (e.overtime_costing_method as OvertimeCostingMethod) || settings.overtime_costing_method || "auto",
      working_days_divisor: String(e.working_days_divisor || settings.working_days_divisor || 30),
      overtime_multiplier: String(e.overtime_multiplier || settings.overtime_multiplier || 1.25),
      salary_effective_date: e.salary_effective_date || settings.effective_date || "",
      payment_method: e.payment_method||"Bank Transfer",
      bank_name: e.bank_name||"",
      account_number: e.account_number||"",
      iban: e.iban||"",
      email: e.email||"",
      phone: e.phone||"",
      status: normalizeEmployeeStatus(e.status),
    });
    setShowForm(true);
  }

  function closeForm() { if (saving) return; setShowForm(false); setEditing(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    if (!form.first_name.trim()) { setError("Employee name is required."); return; }
    setSaving(true);
    try {
      const cid = await getCompanyId();
      // Calculate next sequential code EMP-01, EMP-02, EMP-03...
      const maxNum = employees.reduce((max, e) => {
        const digits = (e.employee_number || "").replace(/\D/g, "");
        const n = parseInt(digits, 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      const autoCode = `EMP-${String(maxNum + 1).padStart(2, "0")}`;
      const empNum = form.employee_number.trim()
        ? formatEmployeeCode(form.employee_number.trim())
        : (!editing ? autoCode : formatEmployeeCode(editing.employee_number));

      const validStatus = normalizeEmployeeStatus(form.status);
      const payload: Record<string, unknown> = {
        employee_number: empNum,
        employee_code: empNum,
        first_name: form.first_name.trim(),
        designation: form.designation.trim() || null,
        department: form.department.trim() || null,
        joining_date: form.joining_date || null,
        basic_salary: Number(form.basic_salary) || 0,
        housing_allowance: Number(form.housing_allowance) || 0,
        transport_allowance: Number(form.transport_allowance) || 0,
        other_allowances: Number(form.other_allowances) || 0,
        overtime_rate: form.overtime_rate ? Number(form.overtime_rate) : null,
        overtime_costing_method: form.overtime_costing_method,
        working_days_divisor: Number(form.working_days_divisor) || 30,
        overtime_multiplier: Number(form.overtime_multiplier) || 1.25,
        salary_effective_date: form.salary_effective_date || null,
        payment_method: form.payment_method || null,
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        iban: form.iban.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: toDbStatus(validStatus),
      };

      let savedId = editing?.id;

      if (editing) {
        const { error: err } = await supabase.from("employees").update(payload).eq("id", editing.id);
        if (err) {
          // If schema has not migrated extra columns yet, fallback to core payload
          delete payload.housing_allowance;
          delete payload.transport_allowance;
          delete payload.other_allowances;
          delete payload.overtime_rate;
          delete payload.overtime_costing_method;
          delete payload.working_days_divisor;
          delete payload.overtime_multiplier;
          delete payload.salary_effective_date;
          const { error: fbErr } = await supabase.from("employees").update(payload).eq("id", editing.id);
          if (fbErr) throw fbErr;
        }
        setSuccess("Employee record updated successfully.");
      } else {
        const { data: newEmp, error: err } = await supabase
          .from("employees")
          .insert({ ...payload, company_id: cid })
          .select("id")
          .single();

        if (err) {
          delete payload.housing_allowance;
          delete payload.transport_allowance;
          delete payload.other_allowances;
          delete payload.overtime_rate;
          delete payload.overtime_costing_method;
          delete payload.working_days_divisor;
          delete payload.overtime_multiplier;
          delete payload.salary_effective_date;
          const { data: fbEmp, error: fbErr } = await supabase
            .from("employees")
            .insert({ ...payload, company_id: cid })
            .select("id")
            .single();
          if (fbErr) throw fbErr;
          savedId = fbEmp?.id;
        } else {
          savedId = newEmp?.id;
        }
        setSuccess("Employee added successfully.");
      }

      // Persist extended salary & overtime settings safely
      if (savedId) {
        await saveEmployeeSalarySettings(savedId, {
          basic_salary: Number(form.basic_salary) || 0,
          housing_allowance: Number(form.housing_allowance) || 0,
          transport_allowance: Number(form.transport_allowance) || 0,
          other_allowances: Number(form.other_allowances) || 0,
          overtime_rate: form.overtime_rate ? Number(form.overtime_rate) : null,
          overtime_costing_method: form.overtime_costing_method,
          working_days_divisor: Number(form.working_days_divisor) || 30,
          overtime_multiplier: Number(form.overtime_multiplier) || 1.25,
          effective_date: form.salary_effective_date || null,
        });
      }

      setShowForm(false);
      setEditing(null);
      setForm(empty);
      await load();
    } catch (err: unknown) {
      console.error("Employee save error:", err);
      const msg = getErrorMessage(err, "Error saving employee record");
      if (msg.toLowerCase().includes("check constraint") || msg.includes("employees_status_check")) {
        setError("The employee status was rejected by the database. Please choose Active, Inactive, On Leave, or Terminated.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }


  async function deleteEmployee(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete employee "${name}"? This action cannot be undone.`)) return;
    try {
      const { error: err } = await supabase.from("employees").delete().eq("id", id);
      if (err) {
        if (err.code === "23503" || err.message.includes("foreign key")) {
          alert("Cannot delete employee: this employee has associated salary slips, expenses, or operational records. You can deactivate them instead.");
        } else {
          alert("Error deleting employee: " + err.message);
        }
        return;
      }
      setSuccess("Employee deleted successfully.");
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to delete employee"));
    }
  }

  async function toggleActive(emp: Employee) {
    const cur = normalizeEmployeeStatus(emp.status);
    const newStatus: EmployeeStatus = cur === "active" ? "inactive" : "active";
    const { error: err } = await supabase.from("employees").update({ status: toDbStatus(newStatus) }).eq("id", emp.id);
    if (err) { setError(err.message); return; }
    setSuccess(newStatus === "inactive" ? "Employee deactivated." : "Employee reactivated.");
    await load();
  }

  const filtered = employees.filter((e, idx) => {
    const q = search.toLowerCase();
    const code = formatEmployeeCode(e.employee_number, idx).toLowerCase();
    const searchTarget = [code, e.employee_number, e.first_name, e.designation, e.department, e.email, e.phone].filter(Boolean).join(" ").toLowerCase();
    return searchTarget.includes(q);
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Users2 size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Employees</h1><p className="text-sm text-slate-500">Manage employee records and profiles</p></div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />Add Employee</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            ["Total", employees.length, "slate"],
            ["Active", employees.filter(e => normalizeEmployeeStatus(e.status) === "active").length, "emerald"],
            ["Inactive", employees.filter(e => normalizeEmployeeStatus(e.status) !== "active").length, "slate"]
          ].map(([l, v, c]) => (
            <div key={String(l)} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs text-slate-500 font-medium">{l}</p>
              <p className={`mt-1 text-2xl font-bold ${c === "emerald" ? "text-emerald-600" : "text-slate-700"}`}>{v}</p>
            </div>
          ))}
        </div>
        <div className="mb-6 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" />
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><Users2 size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No employees found.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">No.</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Department</th><th className="px-4 py-3 text-right">Monthly Package</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(emp => {
                  const norm = normalizeEmployeeStatus(emp.status);
                  const label = formatEmployeeStatus(emp.status);
                  const totalPackage =
                    (Number(emp.basic_salary) || 0) +
                    (Number(emp.housing_allowance) || 0) +
                    (Number(emp.transport_allowance) || 0) +
                    (Number(emp.other_allowances) || 0);
                  const hasAllowances = (emp.housing_allowance || emp.transport_allowance || emp.other_allowances);

                  return (
                    <tr key={emp.id} className={`hover:bg-slate-50 ${norm !== "active" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-mono font-bold text-xs text-slate-700">{formatEmployeeCode(emp.employee_number, employees.indexOf(emp))}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{emp.first_name}</div><div className="text-xs text-slate-400">{emp.email || ""}</div></td>
                      <td className="px-4 py-3 text-slate-600">{emp.designation || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{emp.department || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-semibold text-slate-900">AED {totalPackage.toFixed(2)}</div>
                        {hasAllowances ? (
                          <div className="text-[11px] text-slate-400">Basic: AED {(emp.basic_salary || 0).toFixed(2)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(label)}`}>{label}</span></td>

                      <td className="px-4 py-3"><div className="flex justify-center gap-2">
                        <button onClick={() => openEdit(emp)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => toggleActive(emp)} className={`rounded-lg p-1.5 ${norm === "active" ? "text-slate-400 hover:bg-red-50 hover:text-red-500" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"}`} title={norm === "active" ? "Deactivate" : "Activate"}><Power size={14} /></button>
                        <button onClick={() => deleteEmployee(emp.id, emp.first_name || "this employee")} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={14} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Showing {filtered.length} of {employees.length} employees</div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-3"><div className="rounded-lg bg-slate-900 p-2 text-white"><Users2 size={18} /></div><h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Employee" : "Add Employee"}</h2></div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="emp-form" onSubmit={save} className="p-6 space-y-6">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Basic Info</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Employee No.</label><input type="text" value={form.employee_number} onChange={e => f("employee_number", e.target.value)} placeholder="Auto-generated (EMP-01, EMP-02…)" className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label><input type="text" value={form.first_name} onChange={e => f("first_name", e.target.value)} required className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Designation</label><input type="text" value={form.designation} onChange={e => f("designation", e.target.value)} className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Department</label><input type="text" value={form.department} onChange={e => f("department", e.target.value)} className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Joining Date</label><input type="date" value={form.joining_date} onChange={e => f("joining_date", e.target.value)} className={inp} /></div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                      <select value={form.status} onChange={e => f("status", normalizeEmployeeStatus(e.target.value))} className={sel}>
                        {EMPLOYEE_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payroll & Salary Settings (UAE)</p>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Total Monthly Package: AED {(
                        (Number(form.basic_salary) || 0) +
                        (Number(form.housing_allowance) || 0) +
                        (Number(form.transport_allowance) || 0) +
                        (Number(form.other_allowances) || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Basic Salary (AED) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" step="0.01" value={form.basic_salary} onChange={e=>f("basic_salary",e.target.value)} required className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Housing Allowance (AED)</label>
                      <input type="number" min="0" step="0.01" value={form.housing_allowance} onChange={e=>f("housing_allowance",e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Transport Allowance (AED)</label>
                      <input type="number" min="0" step="0.01" value={form.transport_allowance} onChange={e=>f("transport_allowance",e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Other Allowances (AED)</label>
                      <input type="number" min="0" step="0.01" value={form.other_allowances} onChange={e=>f("other_allowances",e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Working Days Divisor Policy</label>
                      <select value={form.working_days_divisor} onChange={e=>f("working_days_divisor",e.target.value)} className={sel}>
                        <option value="30">30 Days (UAE Standard Calendar)</option>
                        <option value="26">26 Days (Excluding Fridays)</option>
                        <option value="28">28 Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Salary Calculation Method</label>
                      <select value={form.overtime_costing_method} onChange={e=>f("overtime_costing_method",e.target.value as OvertimeCostingMethod)} className={sel}>
                        <option value="auto">Method A: Auto UAE Rule (1.25x Basic)</option>
                        <option value="hourly_rate">Method B: Manual Hourly Overtime Rate</option>
                        <option value="manual_fixed">Method C: Manual Flat Charge</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Default Overtime Rate (AED/hr)</label>
                      <input type="number" min="0" step="0.01" value={form.overtime_rate} onChange={e=>f("overtime_rate",e.target.value)} placeholder="e.g. 25.00 (Optional override)" className={inp} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Rate Effective Date</label>
                      <input type="date" value={form.salary_effective_date} onChange={e=>f("salary_effective_date",e.target.value)} className={inp} />
                    </div>
                  </div>
                </div>
                <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment & Bank Info</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Method</label><select value={form.payment_method} onChange={e=>f("payment_method",e.target.value)} className={sel}><option>Bank Transfer</option><option>Cash</option><option>Cheque</option></select></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Bank Name</label><input type="text" value={form.bank_name} onChange={e=>f("bank_name",e.target.value)} className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Account Number</label><input type="text" value={form.account_number} onChange={e=>f("account_number",e.target.value)} className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">IBAN</label><input type="text" value={form.iban} onChange={e=>f("iban",e.target.value)} className={inp} /></div>
                  </div>
                </div>
                <div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Email</label><input type="email" value={form.email} onChange={e=>f("email",e.target.value)} className={inp} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Phone</label><input type="text" value={form.phone} onChange={e=>f("phone",e.target.value)} className={inp} /></div>
                  </div>
                </div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="emp-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>} {saving?"Saving…":editing?"Save Changes":"Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
