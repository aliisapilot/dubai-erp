"use client";

import ReportLoadState from "@/components/ReportLoadState";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, Filter, Search, Download, CheckCircle, Clock } from "lucide-react";
import { fmtAED, getCompanyId, formatEmployeeCode } from "@/lib/helpers";
import { normalizeSalaryStatementStatus, formatSalaryStatementStatus } from "@/lib/payrollTypes";
import { getMonthlyAdjustmentsForPeriod, MonthlyEmployeeAdjustment } from "@/lib/payrollWorkflowService";


type SS = {
  id: string;
  employee_id: string | null;
  payroll_month: string | number | null;
  payroll_year?: number | null;
  basic_salary?: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances?: number | null;
  friday_pay?: number | null;
  bonus?: number | null;
  gross_salary: number | null;
  absence_deduction?: number | null;
  advance_deduction?: number | null;
  insurance_deduction?: number | null;
  loan_deduction?: number | null;
  leave_deduction?: number | null;
  other_deductions?: number | null;
  total_deductions?: number | null;
  net_salary: number | null;
  overtime_amount: number | null;
  status: string | null;
};

type Employee = {
  id: string;
  first_name: string | null;
  employee_number: string | null;
  designation?: string | null;
  basic_salary?: number | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const now = new Date();

export default function PayrollSummaryPage() {
  const [records, setRecords] = useState<SS[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, Employee>>({});
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Month-wide calculated stats
  const [monthPayableDays, setMonthPayableDays] = useState<Record<string, number>>({});
  const [monthOtHours, setMonthOtHours] = useState<Record<string, number>>({});

  const [loadError, setLoadError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState("");
  const requestVersion = useRef(0);

  async function load() {
    const version = ++requestVersion.current;
    setLoadError("");
    try {
      setLoading(true);
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const period = `${year}-${String(month).padStart(2, "0")}`;

      const [
        { data: ss, error: salaryError },
        { data: emps, error: employeeError },
        { data: attData },
        { data: otData },
      ] = await Promise.all([
        supabase
          .from("salary_statements")
          .select("*")
          .gte("payroll_month", startDate)
          .lte("payroll_month", endDate),
        supabase
          .from("employees")
          .select("id, first_name, employee_number, designation, basic_salary")
          .order("first_name"),
        supabase
          .from("attendance")
          .select("employee_id, status, attendance_date")
          .gte("attendance_date", startDate)
          .lte("attendance_date", endDate),
        supabase
          .from("overtime")
          .select("employee_id, hours, approval_status, overtime_date")
          .gte("overtime_date", startDate)
          .lte("overtime_date", endDate),
      ]);

      if (salaryError || employeeError) {
        throw new Error((salaryError || employeeError)!.message);
      }
      if (version !== requestVersion.current) return;

      const emList = ((emps || []) as Employee[]).sort((a, b) => {
        const codeA = formatEmployeeCode(a.employee_number);
        const codeB = formatEmployeeCode(b.employee_number);
        const numA = parseInt(codeA.replace(/\D/g, ""), 10);
        const numB = parseInt(codeB.replace(/\D/g, ""), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return (a.first_name || "").localeCompare(b.first_name || "");
      });
      const em: Record<string, Employee> = {};
      emList.forEach((e) => { em[e.id] = e; });
      setEmployees(emList);
      setEmpMap(em);
      setRecords((ss || []) as SS[]);

      // Fetch adjustments for payable days
      let adjMap: Record<string, MonthlyEmployeeAdjustment> = {};
      try {
        const cid = await getCompanyId().catch(() => "");
        if (cid) {
          adjMap = await getMonthlyAdjustmentsForPeriod(cid, period);
        }
      } catch {}


      // Calculate Payable Days per employee
      const payableMap: Record<string, number> = {};
      const otHoursMap: Record<string, number> = {};

      emList.forEach((e) => {
        // Attendance calc
        const empAtt = (attData || []).filter((a) => a.employee_id === e.id);
        const absentCount = empAtt.filter((a) => (a.status || "").toLowerCase() === "absent").length;
        const halfDayCount = empAtt.filter((a) => ["half_day", "hd"].includes((a.status || "").toLowerCase())).length;
        const adj = adjMap[e.id];
        const payableAdj = adj?.payable_days_adjustment || 0;
        const calculatedPayable = Math.max(0, 30 - absentCount - (halfDayCount * 0.5) + payableAdj);
        payableMap[e.id] = calculatedPayable;

        // OT Hours calc
        const empOt = (otData || []).filter((o) => o.employee_id === e.id);
        const approvedOt = empOt
          .filter((o) => (o.approval_status || "").toLowerCase() === "approved")
          .reduce((s, o) => s + (Number(o.hours) || 0), 0);
        otHoursMap[e.id] = approvedOt + (adj?.overtime_hours_adjustment || 0);
      });

      setMonthPayableDays(payableMap);
      setMonthOtHours(otHoursMap);
      setLoadedPeriod(`${year}-${month}`);
    } catch (err) {
      if (version === requestVersion.current) {
        setLoadError(err instanceof Error ? err.message : "Could not load payroll.");
        setLoadedPeriod(`${year}-${month}`);
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void Promise.resolve().then(load); }, [year, month]);

  // Filter records
  const filteredRecords = records.filter((r) => {
    if (filterEmployeeId && r.employee_id !== filterEmployeeId) return false;
    const normStatus = normalizeSalaryStatementStatus(r.status);
    if (filterStatus !== "all" && normStatus !== filterStatus) return false;

    if (search.trim()) {
      const emp = r.employee_id ? empMap[r.employee_id] : null;
      const searchTarget = [
        emp?.first_name,
        emp?.employee_number,
        emp?.designation,
        r.status,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchTarget.includes(search.toLowerCase())) return false;
    }

    return true;
  });

  // Calculate the 10 KPIs
  const totalEmployees = filteredRecords.length;

  const totalPayableDays = filteredRecords.reduce((sum, r) => {
    const pDays = r.employee_id ? monthPayableDays[r.employee_id] ?? 30 : 30;
    return sum + pDays;
  }, 0);

  const totalOvertimeHours = filteredRecords.reduce((sum, r) => {
    const otH = r.employee_id ? monthOtHours[r.employee_id] ?? 0 : 0;
    return sum + otH;
  }, 0);

  const totalOvertimeCharges = filteredRecords.reduce((sum, r) => sum + (Number(r.overtime_amount) || 0), 0);

  const totalBasicSalary = filteredRecords.reduce((sum, r) => sum + (Number(r.basic_salary) || 0), 0);

  const totalAllowances = filteredRecords.reduce((sum, r) => {
    const allow =
      (Number(r.housing_allowance) || 0) +
      (Number(r.transport_allowance) || 0) +
      (Number(r.other_allowances) || 0) +
      (Number(r.friday_pay) || 0) +
      (Number(r.bonus) || 0);
    return sum + allow;
  }, 0);

  const totalDeductions = filteredRecords.reduce((sum, r) => {
    const ded =
      r.total_deductions != null
        ? Number(r.total_deductions)
        : (Number(r.gross_salary) || 0) - (Number(r.net_salary) || 0);
    return sum + Math.max(0, ded);
  }, 0);

  const totalNetSalary = filteredRecords.reduce((sum, r) => sum + (Number(r.net_salary) || 0), 0);

  const paidAmount = filteredRecords.reduce((sum, r) => {
    const isPaid = normalizeSalaryStatementStatus(r.status) === "paid";
    return sum + (isPaid ? (Number(r.net_salary) || 0) : 0);
  }, 0);

  const outstandingAmount = filteredRecords.reduce((sum, r) => {
    const isPaid = normalizeSalaryStatementStatus(r.status) === "paid";
    return sum + (!isPaid ? (Number(r.net_salary) || 0) : 0);
  }, 0);

  // Quick export function
  function exportCSV() {
    const headers = [
      "Employee Code",
      "Employee Name",
      "Payable Days",
      "Basic Salary (AED)",
      "Allowances (AED)",
      "OT Hours",
      "OT Charges (AED)",
      "Deductions (AED)",
      "Net Salary (AED)",
      "Status",
    ];

    const rows = filteredRecords.map((r) => {
      const emp = r.employee_id ? empMap[r.employee_id] : null;
      const pDays = r.employee_id ? monthPayableDays[r.employee_id] ?? 30 : 30;
      const otH = r.employee_id ? monthOtHours[r.employee_id] ?? 0 : 0;
      const allow =
        (Number(r.housing_allowance) || 0) +
        (Number(r.transport_allowance) || 0) +
        (Number(r.other_allowances) || 0) +
        (Number(r.friday_pay) || 0) +
        (Number(r.bonus) || 0);
      const ded =
        r.total_deductions != null
          ? Number(r.total_deductions)
          : (Number(r.gross_salary) || 0) - (Number(r.net_salary) || 0);

      return [
        `"${formatEmployeeCode(emp?.employee_number) || "-"}"`,
        `"${emp?.first_name || "Employee"}"`,
        pDays,
        (Number(r.basic_salary) || 0).toFixed(2),
        allow.toFixed(2),
        otH,
        (Number(r.overtime_amount) || 0).toFixed(2),
        ded.toFixed(2),
        (Number(r.net_salary) || 0).toFixed(2),
        `"${formatSalaryStatementStatus(r.status)}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_summary_${year}_${String(month).padStart(2, "0")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <BarChart3 size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payroll Summary</h1>
              <p className="text-sm text-slate-500">
                Monthly executive overview, attendance payable days, overtime charges, and disbursement KPIs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none appearance-none"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min="2020"
              max="2099"
              className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <button
              onClick={exportCSV}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              title="Export Summary CSV"
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee name or code…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400" />
            <select
              value={filterEmployeeId}
              onChange={(e) => setFilterEmployeeId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none appearance-none"
            >
              <option value="">All Employees ({employees.length})</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatEmployeeCode(e.employee_number)} - {e.first_name || "Unnamed"}
                </option>
              ))}
            </select>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft Only</option>
            <option value="approved">Approved Only</option>
            <option value="paid">Paid Only</option>
          </select>
        </div>

        {loading || loadedPeriod !== `${year}-${month}` || loadError ? (
          <ReportLoadState
            loading={loading || loadedPeriod !== `${year}-${month}`}
            error={loadError}
            onRetry={() => void load()}
          />
        ) : (
          <>
            {/* 10 Requested Executive KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">1. Total Employees</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{totalEmployees}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">In current view</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">2. Total Payable Days</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{totalPayableDays.toFixed(1)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Actual net payable days</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">3. Total OT Hours</p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{totalOvertimeHours.toFixed(1)} hrs</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Approved overtime hours</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">4. Total OT Charges</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{fmtAED(totalOvertimeCharges)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Configured costing methods</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">5. Total Basic Salary</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{fmtAED(totalBasicSalary)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Base contract salaries</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">6. Total Allowances</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{fmtAED(totalAllowances)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Housing + Transport + Other</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">7. Total Deductions</p>
                <p className="mt-1 text-2xl font-bold text-red-600">- {fmtAED(totalDeductions)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Absences, advances & others</p>
              </div>

              <div className="rounded-xl border border-slate-900 bg-slate-900 p-4 shadow-sm text-white">
                <p className="text-xs text-slate-300 font-medium">8. Total Net Salary</p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">{fmtAED(totalNetSalary)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Final payroll liability</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                  <CheckCircle size={14} className="text-emerald-600" /> 9. Paid Amount
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{fmtAED(paidAmount)}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Disbursed via vouchers</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                  <Clock size={14} className="text-amber-600" /> 10. Outstanding Amount
                </div>
                <p className="mt-1 text-2xl font-bold text-amber-700">{fmtAED(outstandingAmount)}</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Pending disbursement</p>
              </div>
            </div>

            {/* Table */}
            {filteredRecords.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
                <BarChart3 size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">
                  No payroll records found for {MONTHS[month - 1]} {year} matching the selected filters.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3 text-center">Payable Days</th>
                      <th className="px-4 py-3 text-right">Basic Salary</th>
                      <th className="px-4 py-3 text-right">Allowances</th>
                      <th className="px-4 py-3 text-right">OT (Hrs / AED)</th>
                      <th className="px-4 py-3 text-right">Deductions</th>
                      <th className="px-4 py-3 text-right font-bold">Net Salary</th>
                      <th className="px-4 py-3 text-center">Disbursement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((r) => {
                      const emp = r.employee_id ? empMap[r.employee_id] : null;
                      const pDays = r.employee_id ? monthPayableDays[r.employee_id] ?? 30 : 30;
                      const otH = r.employee_id ? monthOtHours[r.employee_id] ?? 0 : 0;
                      const allow =
                        (Number(r.housing_allowance) || 0) +
                        (Number(r.transport_allowance) || 0) +
                        (Number(r.other_allowances) || 0) +
                        (Number(r.friday_pay) || 0) +
                        (Number(r.bonus) || 0);
                      const ded =
                        r.total_deductions != null
                          ? Number(r.total_deductions)
                          : (Number(r.gross_salary) || 0) - (Number(r.net_salary) || 0);
                      const isPaid = normalizeSalaryStatementStatus(r.status) === "paid";

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              {emp?.first_name || "Employee"}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {formatEmployeeCode(emp?.employee_number)} · {emp?.designation || "Staff"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-medium text-slate-700">
                            {pDays.toFixed(1)} / 30
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                            {fmtAED(r.basic_salary)}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                            {fmtAED(allow)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className="font-semibold text-amber-700">{fmtAED(r.overtime_amount)}</span>
                            <span className="text-xs text-slate-400 block">{otH} hrs</span>
                          </td>
                          <td className="px-4 py-3 text-right text-red-600 tabular-nums">
                            - {fmtAED(ded)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {fmtAED(r.net_salary)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.status === "approved"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {isPaid ? <CheckCircle size={11} /> : <Clock size={11} />}
                              {formatSalaryStatementStatus(r.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-900 font-bold text-white text-xs uppercase tracking-wider">
                      <td className="px-4 py-3">TOTALS ({filteredRecords.length})</td>
                      <td className="px-4 py-3 text-center font-mono">{totalPayableDays.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right">{fmtAED(totalBasicSalary)}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{fmtAED(totalAllowances)}</td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {fmtAED(totalOvertimeCharges)}
                        <span className="text-[10px] block opacity-80">{totalOvertimeHours.toFixed(1)} hrs</span>
                      </td>
                      <td className="px-4 py-3 text-right text-red-300">- {fmtAED(totalDeductions)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-mono text-sm">{fmtAED(totalNetSalary)}</td>
                      <td className="px-4 py-3 text-center text-[11px] text-slate-300">
                        Paid: {fmtAED(paidAmount)} | Out: {fmtAED(outstandingAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
