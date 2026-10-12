"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Banknote, X, Save, Loader2, Pencil, Eye, Printer, Receipt, Trash2 } from "lucide-react";
import { getCompanyId, getCurrentCompany, statusClass, fmtAED, parsePayrollMonth } from "@/lib/helpers";
import {
  SalaryStatementStatus,
  SALARY_STATEMENT_STATUS_OPTIONS,
  normalizeSalaryStatementStatus,
  formatSalaryStatementStatus,
  parseSalaryStatementError,
} from "@/lib/payrollTypes";
import SalarySlipTemplate, { SalarySlipData } from "@/components/documents/SalarySlipTemplate";
import EmployeePaymentVoucherTemplate, { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Employee = {
  id: string;
  first_name: string | null;
  employee_number: string | null;
  designation?: string | null;
  department?: string | null;
  joining_date?: string | null;
  account_number?: string | null;
  bank_name: string | null;
  iban: string | null;
  basic_salary: number | null;
  payment_method: string | null;
};

type SS = {
  id: string;
  company_id: string;
  employee_id: string | null;
  payroll_period?: string | null;
  payroll_year?: number | null;
  payroll_month: string | number | null;
  basic_salary: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances?: number | null;
  friday_pay?: number | null;
  overtime_amount: number | null;
  bonus?: number | null;
  gross_salary: number | null;
  absence_deduction?: number | null;
  advance_deduction?: number | null;
  insurance_deduction?: number | null;
  loan_deduction?: number | null;
  leave_deduction?: number | null;
  other_deductions: number | null;
  total_deductions?: number | null;
  net_salary: number | null;
  payment_date: string | null;
  payment_method: string | null;
  status: string | null;
  notes?: string | null;
};

type SSForm = {
  employee_id: string;
  payroll_year: string;
  payroll_month: string;
  basic_salary: string;
  housing_allowance: string;
  transport_allowance: string;
  other_allowances: string;
  friday_pay: string;
  overtime_amount: string;
  bonus: string;
  absence_deduction: string;
  advance_deduction: string;
  insurance_deduction: string;
  loan_deduction: string;
  leave_deduction: string;
  other_deductions: string;
  payment_date: string;
  payment_method: string;
  status: SalaryStatementStatus;
  notes: string;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const now = new Date();
const empty: SSForm = {
  employee_id: "",
  payroll_year: String(now.getFullYear()),
  payroll_month: String(now.getMonth() + 1),
  basic_salary: "0",
  housing_allowance: "0",
  transport_allowance: "0",
  other_allowances: "0",
  friday_pay: "0",
  overtime_amount: "0",
  bonus: "0",
  absence_deduction: "0",
  advance_deduction: "0",
  insurance_deduction: "0",
  loan_deduction: "0",
  leave_deduction: "0",
  other_deductions: "0",
  payment_date: "",
  payment_method: "Bank Transfer",
  status: "draft",
  notes: "",
};

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

function calcTotals(f: SSForm) {
  const gross = (Number(f.basic_salary) || 0) +
    (Number(f.housing_allowance) || 0) +
    (Number(f.transport_allowance) || 0) +
    (Number(f.other_allowances) || 0) +
    (Number(f.friday_pay) || 0) +
    (Number(f.overtime_amount) || 0) +
    (Number(f.bonus) || 0);

  const deductions = (Number(f.absence_deduction) || 0) +
    (Number(f.advance_deduction) || 0) +
    (Number(f.insurance_deduction) || 0) +
    (Number(f.loan_deduction) || 0) +
    (Number(f.leave_deduction) || 0) +
    (Number(f.other_deductions) || 0);

  return { gross, deductions, net: gross - deductions };
}

export default function SalaryStatementsPage() {
  const [records, setRecords] = useState<SS[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [form, setForm] = useState<SSForm>(empty);
  const [search, setSearch] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SS | null>(null);
  const [viewRec, setViewRec] = useState<SS | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Print Modals
  const [activeSlip, setActiveSlip] = useState<SalarySlipData | null>(null);
  const [activeVoucher, setActiveVoucher] = useState<PaymentVoucherData | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: ss }, { data: emps }, co] = await Promise.all([
      supabase.from("salary_statements").select("*").order("payroll_month", { ascending: false }),
      supabase.from("employees").select("id, first_name, employee_number, designation, department, joining_date, account_number, bank_name, iban, basic_salary, payment_method").order("first_name"),
      getCurrentCompany(),
    ]);
    setRecords((ss || []) as SS[]);
    setEmployees((emps || []) as Employee[]);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  const ff = (k: keyof SSForm, v: string) => setForm(c => ({ ...c, [k]: v }));

  function onEmpChange(empId: string) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) { setForm(c => ({ ...c, employee_id: empId })); return; }
    // Load OT for selected month
    const yr = Number(form.payroll_year) || now.getFullYear();
    const mo = Number(form.payroll_month) || now.getMonth()+1;
    const period = `${yr}-${String(mo).padStart(2,"0")}`;
    supabase.from("overtime").select("hours").eq("employee_id", empId).in("approval_status",["approved", "Approved"]).gte("overtime_date", `${period}-01`).lte("overtime_date", `${period}-31`)
      .then(({data}) => {
        const totalHours = (data||[]).reduce((s,r) => s + (Number(r.hours)||0), 0);
        const hourly = (Number(emp.basic_salary) || 0) / 30 / 8;
        const otTotal = Math.round(totalHours * hourly * 1.25);
        setForm(c => ({
          ...c,
          employee_id: empId,
          basic_salary: String(emp.basic_salary??0),
          overtime_amount: String(otTotal),
        }));
      });
  }

  const { gross: fGross, deductions: fDed, net: fNet } = calcTotals(form);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  function openAdd() {
    setError("");
    setSuccess("");
    setEditing(null);
    setForm(empty);
    setShowForm(true);
  }

  function openEdit(ss: SS) {
    if (normalizeSalaryStatementStatus(ss.status) === "paid") {
      setError("Paid salary statements cannot be edited.");
      return;
    }
    setError("");
    setSuccess("");
    setEditing(ss);
    const parsed = parsePayrollMonth(ss.payroll_month, ss.payroll_year);
    setForm({
      employee_id: ss.employee_id || "",
      payroll_year: String(ss.payroll_year || parsed.year),
      payroll_month: String(parsed.month),
      basic_salary: String(ss.basic_salary ?? 0),
      housing_allowance: String(ss.housing_allowance ?? 0),
      transport_allowance: String(ss.transport_allowance ?? 0),
      other_allowances: String(ss.other_allowances ?? 0),
      friday_pay: String(ss.friday_pay ?? 0),
      overtime_amount: String(ss.overtime_amount ?? 0),
      bonus: String(ss.bonus ?? 0),
      absence_deduction: String(ss.absence_deduction ?? 0),
      advance_deduction: String(ss.advance_deduction ?? 0),
      insurance_deduction: String(ss.insurance_deduction ?? 0),
      loan_deduction: String(ss.loan_deduction ?? 0),
      leave_deduction: String(ss.leave_deduction ?? 0),
      other_deductions: String(ss.other_deductions ?? 0),
      payment_method: ss.payment_method || "Bank Transfer",
      payment_date: ss.payment_date || "",
      status: normalizeSalaryStatementStatus(ss.status),
      notes: ss.notes || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id) {
      setError("Please select an employee.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    const { gross, deductions, net } = calcTotals(form);
    const yr = Number(form.payroll_year) || now.getFullYear();
    const mo = Number(form.payroll_month) || (now.getMonth() + 1);
    const payrollDate = `${yr}-${String(mo).padStart(2, "0")}-01`;

    const cid = await getCompanyId();

    const payload = {
      company_id: cid,
      employee_id: form.employee_id,
      payroll_month: payrollDate,
      payroll_year: yr,
      basic_salary: Number(form.basic_salary) || 0,
      housing_allowance: Number(form.housing_allowance) || 0,
      transport_allowance: Number(form.transport_allowance) || 0,
      other_allowances: Number(form.other_allowances) || 0,
      friday_pay: Number(form.friday_pay) || 0,
      overtime_amount: Number(form.overtime_amount) || 0,
      bonus: Number(form.bonus) || 0,
      gross_salary: gross,
      absence_deduction: Number(form.absence_deduction) || 0,
      advance_deduction: Number(form.advance_deduction) || 0,
      insurance_deduction: Number(form.insurance_deduction) || 0,
      loan_deduction: Number(form.loan_deduction) || 0,
      leave_deduction: Number(form.leave_deduction) || 0,
      other_deductions: Number(form.other_deductions) || 0,
      total_deductions: deductions,
      net_salary: net,
      payment_method: form.payment_method,
      payment_date: form.payment_date || null,
      status: normalizeSalaryStatementStatus(form.status),
      notes: form.notes || null,
    };

    let res;
    if (editing) {
      const updatePayload: Partial<typeof payload> = { ...payload };
      delete updatePayload.company_id;
      res = await supabase.from("salary_statements").update(updatePayload).eq("id", editing.id);
    } else {
      res = await supabase.from("salary_statements").insert(payload);
    }

    if (res.error) {
      const errMsg = (res.error.message || "").toLowerCase();
      const errDetails = ((res.error as { details?: string }).details || "").toLowerCase();
      const isMissingColumnError =
        errMsg.includes("column") ||
        errMsg.includes("schema cache") ||
        errDetails.includes("column") ||
        (res.error as { code?: string }).code === "PGRST204";

      if (isMissingColumnError) {
        // Fallback for environments where salary statement breakdown columns are pending schema cache sync
        const fallbackPayload: Record<string, unknown> = { ...payload };
        fallbackPayload.other_deductions =
          (Number(payload.other_deductions) || 0) + (Number(payload.leave_deduction) || 0);

        delete fallbackPayload.payroll_year;
        delete fallbackPayload.housing_allowance;
        delete fallbackPayload.transport_allowance;
        delete fallbackPayload.other_allowances;
        delete fallbackPayload.leave_deduction;
        delete fallbackPayload.notes;

        if (editing) {
          const fallbackUpdate = { ...fallbackPayload };
          delete fallbackUpdate.company_id;
          res = await supabase.from("salary_statements").update(fallbackUpdate).eq("id", editing.id);
        } else {
          res = await supabase.from("salary_statements").insert(fallbackPayload);
        }
      }
    }

    if (res.error) {
      setError(parseSalaryStatementError(res.error));
    } else {
      setSuccess(editing ? "Statement updated successfully." : "Statement created successfully.");
      setShowForm(false);
      setEditing(null);
      await loadAll();
    }
    setSaving(false);
  }

  async function deleteStatement(r: SS) {
    if (normalizeSalaryStatementStatus(r.status) === "paid") {
      setError("Paid salary statements cannot be deleted.");
      return;
    }
    const emp = empMap[r.employee_id || ""];
    const empName = emp?.first_name || "this employee";
    if (!window.confirm(`Are you sure you want to delete the salary statement for ${empName}? This cannot be undone.`)) return;
    setError("");
    try {
      const { error: delErr } = await supabase.from("salary_statements").delete().eq("id", r.id);
      if (delErr) throw new Error(delErr.message);
      setSuccess("Salary statement deleted successfully.");
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete statement.");
    }
  }

  function handleOpenSlip(r: SS) {
    const emp = empMap[r.employee_id || ""];
    const parsed = parsePayrollMonth(r.payroll_month, r.payroll_year);
    const slipData: SalarySlipData = {
      employee_name: emp?.first_name || "Employee",
      employee_id: emp?.employee_number || r.employee_id || "EMP-001",
      designation: emp?.designation,
      department: emp?.department,
      joining_date: emp?.joining_date,
      account_number: emp?.account_number,
      bank_name: emp?.bank_name,
      iban: emp?.iban,
      month: parsed.month,
      year: r.payroll_year || parsed.year,
      basic_salary: r.basic_salary ?? 0,
      housing_allowance: r.housing_allowance ?? 0,
      transport_allowance: r.transport_allowance ?? 0,
      other_allowances: r.other_allowances ?? 0,
      friday_pay: r.friday_pay ?? 0,
      overtime_amount: r.overtime_amount ?? 0,
      absence_deduction: r.absence_deduction ?? 0,
      advance_deduction: r.advance_deduction ?? 0,
      insurance_deduction: r.insurance_deduction ?? 0,
      other_deductions: (r.other_deductions ?? 0) + (r.loan_deduction ?? 0) + (r.leave_deduction ?? 0),
      total_earnings: r.gross_salary ?? 0,
      total_deductions: (r.gross_salary ?? 0) - (r.net_salary ?? 0),
      net_pay: r.net_salary ?? 0,
      status: r.status,
    };
    setActiveSlip(slipData);
  }

  function handleOpenVoucher(r: SS) {
    const emp = empMap[r.employee_id || ""];
    const parsed = parsePayrollMonth(r.payroll_month, r.payroll_year);
    const vData: PaymentVoucherData = {
      voucher_number: `PV-SAL-${parsed.year}${String(parsed.month).padStart(2, "0")}-${(emp?.employee_number || "EMP").replace(/[^a-zA-Z0-9]/g, "")}`,
      voucher_date: r.payment_date || now.toISOString().split("T")[0],
      employee_name: emp?.first_name || "Employee",
      employee_id: emp?.employee_number || r.employee_id || "EMP-001",
      designation: emp?.designation,
      month: parsed.month,
      year: r.payroll_year || parsed.year,
      net_amount: r.net_salary ?? 0,
      payment_method: r.payment_method || "Bank Transfer",
      bank_name: emp?.bank_name,
      bank_reference: r.payment_method === "Bank Transfer" ? (emp?.iban || emp?.account_number || undefined) : undefined,
      notes: `Salary settlement for ${parsed.label} per approved payroll statement`,
      prepared_by: "HR & Accounts",
      approved_by: "Finance Manager",
    };
    setActiveVoucher(vData);
  }

  const filtered = records.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false;
    const parsed = parsePayrollMonth(r.payroll_month, r.payroll_year);
    if (filterPeriod && parsed.periodStr !== filterPeriod) return false;
    const empName = empMap[r.employee_id||""]?.first_name || "";
    return [empName, parsed.label, r.status].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white"><Banknote size={22} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Salary Statements</h1><p className="text-sm text-slate-500">Monthly payroll processing, A4 salary slips, and linked employee payment vouchers</p></div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus size={18} />New Statement</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showForm && <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none" /></div>
          <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none appearance-none"><option value="">All Employees</option>{employees.map(e=><option key={e.id} value={e.id}>{e.first_name || e.employee_number || "Unnamed employee"}</option>)}</select>
          <input type="month" value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none" />
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center"><Banknote size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm text-slate-500">No salary statements found.</p></div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Deductions</th><th className="px-4 py-3 text-right">Net Salary</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Actions & Documents</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{empMap[r.employee_id||""]?.first_name || "—"}</div>
                      <div className="text-xs text-slate-400">{empMap[r.employee_id||""]?.employee_number||""} · {empMap[r.employee_id||""]?.designation||""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.payroll_month ? parsePayrollMonth(r.payroll_month, r.payroll_year).label : "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmtAED(r.gross_salary)}</td>
                    <td className="px-4 py-3 text-right text-red-600">- {fmtAED((r.gross_salary || 0) - (r.net_salary || 0))}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmtAED(r.net_salary)}</td>
                    <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(r.status||"draft")}`}>{formatSalaryStatementStatus(r.status)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleOpenSlip(r)}
                          className="flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-sm"
                          title="Print A4 Salary Slip"
                        >
                          <Printer size={12} /> Salary Slip
                        </button>
                        <button
                          onClick={() => handleOpenVoucher(r)}
                          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          title="Generate Employee Payment Voucher"
                        >
                          <Receipt size={12} /> Voucher
                        </button>
                        <button onClick={() => setViewRec(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Quick View"><Eye size={14} /></button>
                        {normalizeSalaryStatementStatus(r.status) !== "paid" && <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit Statement"><Pencil size={14} /></button>}
                        {normalizeSalaryStatementStatus(r.status) !== "paid" && <button onClick={() => deleteStatement(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete Statement"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{editing?"Edit Salary Statement":"New Salary Statement"}</h2>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form id="ss-form" onSubmit={save} className="p-6 space-y-5">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1"><label className="mb-1 block text-sm font-medium text-slate-700">Employee <span className="text-red-500">*</span></label>
                    <select value={form.employee_id} onChange={e=>onEmpChange(e.target.value)} required className={sel}><option value="">— Select —</option>{employees.map(e=><option key={e.id} value={e.id}>{e.first_name || e.employee_number || "Unnamed employee"}</option>)}</select>
                  </div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Year</label><input type="number" step="1" min="2020" max="2099" value={form.payroll_year} onChange={e=>ff("payroll_year",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Month</label><select value={form.payroll_month} onChange={e=>ff("payroll_month",e.target.value)} className={sel}>{MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings (AED)</p>
                <div className="grid grid-cols-2 gap-4">
                  {([["basic_salary","Basic Salary Pay"],["housing_allowance","Housing Allowance"],["transport_allowance","Transport Allowance"],["other_allowances","Other Allowances"],["friday_pay","Friday / Weekend Pay"],["overtime_amount","Overtime Amount"],["bonus","Bonus"]] as [keyof SSForm, string][]).map(([k,l]) => (
                    <div key={k}><label className="mb-1 block text-sm font-medium text-slate-700">{l}</label><input type="number" min="0" step="0.01" value={form[k]} onChange={e=>ff(k,e.target.value)} className={inp} /></div>
                  ))}
                </div>
                <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm"><span className="font-semibold text-emerald-700">Gross Salary: {fmtAED(fGross)}</span></div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deductions (AED)</p>
                <div className="grid grid-cols-2 gap-4">
                  {([["absence_deduction","Absence / Unpaid Days Deduction"],["advance_deduction","Salary Advance Deduction"],["insurance_deduction","Medical Insurance Deduction"],["loan_deduction","Loan Deduction"],["leave_deduction","Unpaid Leave"],["other_deductions","Other Deductions"]] as [keyof SSForm, string][]).map(([k,l]) => (
                    <div key={k}><label className="mb-1 block text-sm font-medium text-slate-700">{l}</label><input type="number" min="0" step="0.01" value={form[k]} onChange={e=>ff(k,e.target.value)} className={inp} /></div>
                  ))}
                </div>
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm"><span className="font-semibold text-red-600">Total Deductions: {fmtAED(fDed)}</span></div>
                <div className="rounded-lg bg-slate-900 px-4 py-3 text-sm"><span className="font-bold text-white">Net Salary: {fmtAED(fNet)}</span></div>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Date</label><input type="date" value={form.payment_date} onChange={e=>ff("payment_date",e.target.value)} className={inp} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Method</label><select value={form.payment_method} onChange={e=>ff("payment_method",e.target.value)} className={sel}><option>Bank Transfer</option><option>Cash</option><option>Cheque</option></select></div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={e=>ff("status", e.target.value as SalaryStatementStatus)}
                      className={sel}
                    >
                      {SALARY_STATEMENT_STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={form.notes} onChange={e=>ff("notes",e.target.value)} rows={2} className={inp} /></div>
              </form>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" form="ss-form" disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving?<Loader2 size={16} className="animate-spin"/>:<Save size={16}/>}{saving?"Saving…":editing?"Save Changes":"Create Statement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewRec && (() => { const emp = empMap[viewRec.employee_id||""]; return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setViewRec(null)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex justify-between"><h2 className="text-lg font-bold text-slate-900">Salary Statement</h2><button onClick={()=>setViewRec(null)}><X size={20} /></button></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">{emp?.first_name || "—"} ({emp?.employee_number||"—"})</span><span className="font-semibold text-slate-700">{viewRec.payroll_month ? parsePayrollMonth(viewRec.payroll_month, viewRec.payroll_year).label : "—"}</span></div>
            <table className="w-full text-sm"><tbody>
              {[["Basic Salary",viewRec.basic_salary],["Housing Allowance",viewRec.housing_allowance],["Transport Allowance",viewRec.transport_allowance],["Other Allowances",viewRec.other_allowances],["Friday / Weekend Pay",viewRec.friday_pay],["Overtime",viewRec.overtime_amount],["Bonus",viewRec.bonus]].map(([l,v])=>(
                <tr key={String(l)}><td className="py-1 text-slate-500">{l}</td><td className="py-1 text-right text-slate-900">{fmtAED(v as number)}</td></tr>
              ))}
              <tr className="border-t border-slate-200"><td className="py-2 font-semibold text-emerald-700">Gross Salary</td><td className="py-2 text-right font-bold text-emerald-700">{fmtAED(viewRec.gross_salary)}</td></tr>
              {[["Absence Deduction",viewRec.absence_deduction],["Advance Deduction",viewRec.advance_deduction],["Insurance Deduction",viewRec.insurance_deduction],["Loan Deduction",viewRec.loan_deduction],["Leave Deduction",viewRec.leave_deduction],["Other Deductions",viewRec.other_deductions]].map(([l,v])=>(
                <tr key={String(l)}><td className="py-1 text-red-500">- {l}</td><td className="py-1 text-right text-red-600">- {fmtAED(v as number)}</td></tr>
              ))}
              <tr className="border-t-2 border-slate-900 bg-slate-900"><td className="py-2 px-2 font-bold text-white rounded-bl-lg">Net Salary</td><td className="py-2 px-2 text-right font-bold text-white rounded-br-lg">{fmtAED(viewRec.net_salary)}</td></tr>
            </tbody></table>
            <div className="text-xs text-slate-400 text-center">{viewRec.payment_method} · {viewRec.payment_date||"No payment date"} · <span className={`rounded-full px-2 py-0.5 font-semibold ${statusClass(viewRec.status||"draft")}`}>{formatSalaryStatementStatus(viewRec.status)}</span></div>
          </div>
        </div>
      ); })()}

      </div>

      {/* Salary Slip Print Modal */}
      <PrintModal isOpen={!!activeSlip} onClose={() => setActiveSlip(null)}>
        {activeSlip && (
          <SalarySlipTemplate
            company={company}
            slip={activeSlip}
            onClose={() => setActiveSlip(null)}
          />
        )}
      </PrintModal>

      {/* Employee Payment Voucher Print Modal */}
      <PrintModal isOpen={!!activeVoucher} onClose={() => setActiveVoucher(null)}>
        {activeVoucher && (
          <EmployeePaymentVoucherTemplate
            company={company}
            voucher={activeVoucher}
            onClose={() => setActiveVoucher(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}
