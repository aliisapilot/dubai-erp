"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany, parsePayrollMonth, todayISO, formatEmployeeCode, compareEmployees, compareSalaryStatements } from "@/lib/helpers";
import {
  FileCheck2, Search, ArrowLeft, Printer, Banknote
} from "lucide-react";
import EmployeePaymentVoucherTemplate, { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

type Employee = {
  id: string;
  first_name: string | null;
  employee_number: string | null;
  designation: string | null;
  department: string | null;
  bank_name: string | null;
  account_number?: string | null;
  iban: string | null;
};

type SalaryStatement = {
  id: string;
  employee_id: string | null;
  payroll_year?: number | null;
  payroll_month: string | number | null;
  net_salary: number | null;
  payment_date: string | null;
  payment_method: string | null;
  status: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function EmployeePaymentVouchersPage() {
  const [statements, setStatements] = useState<SalaryStatement[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, Employee>>({});
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");

  // Print voucher modal
  const [activeVoucher, setActiveVoucher] = useState<PaymentVoucherData | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  async function loadData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [ssRes, empRes, co] = await Promise.all([
        supabase
          .from("salary_statements")
          .select("*")
          .eq("company_id", companyId)
          .order("payroll_month", { ascending: false }),
        supabase
          .from("employees")
          .select("id, first_name, employee_number, designation, department, bank_name, account_number, iban")
          .eq("company_id", companyId),
        getCurrentCompany()
      ]);

      const em: Record<string, Employee> = {};
      const sortedEmps = ((empRes.data || []) as Employee[]).sort(compareEmployees);
      sortedEmps.forEach((e: Employee) => { em[e.id] = e; });
      setEmpMap(em);
      const sortedSS = ((ssRes.data || []) as SalaryStatement[]).sort((a, b) => compareSalaryStatements(a, b, em));
      setStatements(sortedSS);
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Error loading payment vouchers:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, []);

  async function handleMarkPaid(ssId: string) {
    if (!window.confirm("Confirm marking this salary payment voucher as Paid / Disbursed? This finalizes the statement and prevents duplicate disbursements.")) return;
    setMarkingPaidId(ssId);
    try {
      const { error } = await supabase
        .from("salary_statements")
        .update({ status: "paid", payment_date: todayISO() })
        .eq("id", ssId);
      if (error) throw error;
      await loadData();
    } catch (err) {
      console.error("Error marking voucher as paid:", err);
      alert("Failed to update voucher status: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setMarkingPaidId(null);
    }
  }

  function handleOpenVoucher(ss: SalaryStatement, idx: number) {
    const emp = ss.employee_id ? empMap[ss.employee_id] : null;
    const parsed = parsePayrollMonth(ss.payroll_month, ss.payroll_year);
    const year = ss.payroll_year || parsed.year;
    const month = parsed.month;
    const voucherNo = `EPV-${year}-${String(month).padStart(2, "0")}-${String(idx + 1).padStart(3, "0")}`;

    setActiveVoucher({
      voucher_number: voucherNo,
      voucher_date: ss.payment_date || todayISO(),
      employee_name: emp?.first_name || "Employee",
      employee_id: formatEmployeeCode(emp?.employee_number) || "-",
      designation: emp?.designation || "-",
      month: month,
      year: year,
      net_amount: ss.net_salary || 0,
      payment_method: ss.payment_method || "Bank Transfer",
      bank_name: emp?.bank_name,
      bank_reference: emp?.iban || emp?.account_number || undefined,
      prepared_by: "HR & Accounts Department",
      approved_by: "Managing Director",
    });
  }

  const filtered = useMemo(() => {
    return statements
      .filter(ss => {
        const emp = ss.employee_id ? empMap[ss.employee_id] : null;
        const name = (emp?.first_name || "").toLowerCase();
        const empNo = formatEmployeeCode(emp?.employee_number).toLowerCase();
        const q = search.toLowerCase();
        const matchSearch = name.includes(q) || empNo.includes(q);
        const parsed = parsePayrollMonth(ss.payroll_month, ss.payroll_year);
        const matchMonth = monthFilter === "all" || String(parsed.month) === monthFilter;
        return matchSearch && matchMonth;
      })
      .sort((a, b) => compareSalaryStatements(a, b, empMap));
  }, [statements, empMap, search, monthFilter]);

  const totalDisbursed = filtered.reduce((acc, ss) => acc + (ss.net_salary || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="app-screen-content no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/payslips"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <FileCheck2 size={20} />
              </span>
              Employee Payment Vouchers (EPV)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Formal salary disbursement vouchers with WPS bank account details and signature authorization</p>
          </div>
        </div>

        <Link
          href="/salary-statements"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm font-medium transition-colors"
        >
          <Banknote size={16} /> Salary Statements
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Disbursements</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalDisbursed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Total across selected vouchers</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Vouchers</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">{filtered.length}</p>
          <p className="text-xs text-slate-400 mt-1">Disbursement vouchers logged</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">WPS Compliance</p>
          <p className="text-sm font-bold text-blue-900 mt-2">UAE Wages Protection System</p>
          <p className="text-xs text-blue-600 mt-1">Contains authorized bank routing &amp; IBAN</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Payroll Months</option>
            {MONTHS.map((m, idx) => (
              <option key={m} value={String(idx + 1)}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Payment Method</th>
                <th className="px-4 py-3">Bank Details</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading employee payment vouchers...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No payment vouchers found for the selected period.
                  </td>
                </tr>
              ) : (
                filtered.map((ss, idx) => {
                  const emp = ss.employee_id ? empMap[ss.employee_id] : null;
                  const parsed = parsePayrollMonth(ss.payroll_month, ss.payroll_year);

                  return (
                    <tr key={ss.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{emp?.first_name || "Employee"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatEmployeeCode(emp?.employee_number)} &bull; {emp?.designation || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {parsed.label}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {ss.payment_method || "Bank Transfer"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {emp?.bank_name ? `${emp.bank_name} - ` : ""}
                        {emp?.iban || emp?.account_number || "No Bank Registered"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        AED {(ss.net_salary || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          (ss.status || "").toLowerCase() === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}>
                          {(ss.status || "").toLowerCase() === "paid" ? "Paid & Disbursed" : ss.status || "Finalized"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(ss.status || "").toLowerCase() !== "paid" && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(ss.id)}
                              disabled={markingPaidId === ss.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-semibold transition-colors disabled:opacity-50"
                              title="Mark as paid and lock statement"
                            >
                              <FileCheck2 size={12} /> {markingPaidId === ss.id ? "Marking..." : "Mark Paid"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenVoucher(ss, idx)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold transition-colors"
                          >
                            <Printer size={13} /> Print
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* PRINT VOUCHER MODAL */}
      {activeVoucher && (() => {
        const docFile = generateDocumentPdfFilename({
          docType: "employee_payment_voucher",
          docNumber: activeVoucher.voucher_number,
          employeeName: activeVoucher.employee_name,
          month: Number(activeVoucher.month) || undefined,
          year: Number(activeVoucher.year) || undefined,
        });
        return (
          <PrintModal
            isOpen={!!activeVoucher}
            onClose={() => setActiveVoucher(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <EmployeePaymentVoucherTemplate
              company={company}
              voucher={activeVoucher}
              onClose={() => setActiveVoucher(null)}
            />
          </PrintModal>
        );
      })()}
    </div>
  );
}
