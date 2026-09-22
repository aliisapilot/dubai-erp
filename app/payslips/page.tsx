"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FileText, Search, Loader2, Printer, Receipt } from "lucide-react";
import { statusClass, fmtAED, getCurrentCompany } from "@/lib/helpers";
import SalarySlipTemplate, { SalarySlipData } from "@/components/documents/SalarySlipTemplate";
import EmployeePaymentVoucherTemplate, { PaymentVoucherData } from "@/components/documents/EmployeePaymentVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Employee = {
  id: string;
  first_name: string | null;
  name?: string | null;
  employee_number: string | null;
  designation: string | null;
  department: string | null;
  joining_date?: string | null;
  account_number?: string | null;
  bank_name: string | null;
  iban: string | null;
};

type SS = {
  id: string;
  company_id: string;
  employee_id: string | null;
  payroll_period?: string | null;
  payroll_year?: number | null;
  payroll_month: number | null;
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
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PayslipsPage() {
  const [records, setRecords] = useState<SS[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, Employee>>({});
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [search, setSearch] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [loading, setLoading] = useState(true);

  // Print Modals
  const [activeSlip, setActiveSlip] = useState<SalarySlipData | null>(null);
  const [activeVoucher, setActiveVoucher] = useState<PaymentVoucherData | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setLoading(false);
      return;
    }
    const [{ data: ss }, { data: emps }, co] = await Promise.all([
      supabase
        .from("salary_statements")
        .select("*")
        .eq("status", "Finalized")
        .order("payroll_month", { ascending: false }),
      supabase
        .from("employees")
        .select("id, first_name, employee_number, designation, department, bank_name, iban, joining_date, account_number"),
      getCurrentCompany(),
    ]);

    setRecords((ss || []) as SS[]);
    const em: Record<string, Employee> = {};
    (emps || []).forEach((e: Employee) => {
      em[e.id] = e;
    });
    setEmpMap(em);
    if (co) setCompany(co as CompanyDocInfo);
    setLoading(false);
  }

  function handleOpenSlip(r: SS) {
    const emp = empMap[r.employee_id || ""];
    const now = new Date();
    const slipData: SalarySlipData = {
      employee_name: emp?.first_name || emp?.name || "Employee",
      employee_id: emp?.employee_number || emp?.id?.slice(0, 8) || "EMP-001",
      designation: emp?.designation || "Staff",
      department: emp?.department || "Operations",
      joining_date: emp?.joining_date || null,
      account_number: emp?.account_number || emp?.iban || null,
      bank_name: emp?.bank_name || null,
      iban: emp?.iban || null,
      month: r.payroll_month || 1,
      year: r.payroll_year || now.getFullYear(),
      basic_salary: Number(r.basic_salary) || 0,
      housing_allowance: Number(r.housing_allowance) || 0,
      transport_allowance: Number(r.transport_allowance) || 0,
      other_allowances: Number(r.other_allowances) || 0,
      friday_pay: Number(r.friday_pay) || 0,
      overtime_amount: Number(r.overtime_amount) || 0,
      absence_deduction: Number(r.absence_deduction || r.leave_deduction) || 0,
      advance_deduction: Number(r.advance_deduction) || 0,
      insurance_deduction: Number(r.insurance_deduction) || 0,
      other_deductions: Number(r.other_deductions || r.loan_deduction) || 0,
      total_earnings: Number(r.gross_salary) || 0,
      total_deductions: (Number(r.gross_salary) || 0) - (Number(r.net_salary) || 0),
      net_pay: Number(r.net_salary) || 0,
      status: r.status || "Finalized",
    };
    setActiveSlip(slipData);
  }

  function handleOpenVoucher(r: SS) {
    const emp = empMap[r.employee_id || ""];
    const now = new Date();
    const voucherNumber = `PV-${r.payroll_year || now.getFullYear()}${String(r.payroll_month || now.getMonth() + 1).padStart(2, "0")}-${(emp?.employee_number || "EMP").replace(/[^a-zA-Z0-9]/g, "")}`;

    const voucherData: PaymentVoucherData = {
      voucher_number: voucherNumber,
      voucher_date: r.payment_date || now.toISOString().split("T")[0],
      employee_name: emp?.first_name || emp?.name || "Employee",
      employee_id: emp?.employee_number || emp?.id?.slice(0, 8) || "EMP-001",
      designation: emp?.designation || "Staff",
      month: r.payroll_month || 1,
      year: r.payroll_year || now.getFullYear(),
      net_amount: Number(r.net_salary) || 0,
      payment_method: r.payment_method || "Bank Transfer",
      bank_reference: emp?.iban ? `WPS IBAN: ${emp.iban}` : (emp?.account_number || "Cash / Cheque Disbursement"),
      bank_name: emp?.bank_name || null,
      notes: `Disbursement of net salary for ${MONTHS[(r.payroll_month || 1) - 1]} ${r.payroll_year || now.getFullYear()}`,
      prepared_by: "HR & Accounts",
      approved_by: "Management",
    };

    setActiveVoucher(voucherData);
  }

  const filtered = records.filter(r => {
    if (filterPeriod && String(r.payroll_month) !== filterPeriod) return false;
    const empName = empMap[r.employee_id || ""]?.first_name || empMap[r.employee_id || ""]?.name || "";
    return [empName, String(r.payroll_month)].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payslips & Payment Vouchers</h1>
              <p className="text-sm text-slate-500">Official A4 Salary Slips and Employee Payment Vouchers</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <input
            type="month"
            value={filterPeriod}
            onChange={e => setFilterPeriod(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
            <FileText size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No finalized payslips found. Finalize salary statements in HR module to generate documents.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3 text-right">Net Salary</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{empMap[r.employee_id || ""]?.first_name || empMap[r.employee_id || ""]?.name || "—"}</div>
                      <div className="text-xs text-slate-400">{empMap[r.employee_id || ""]?.employee_number || ""} · {empMap[r.employee_id || ""]?.designation || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {r.payroll_month ? `${MONTHS[(r.payroll_month || 1) - 1]} ${r.payroll_year || new Date().getFullYear()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.payment_method || "Bank Transfer"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 text-sm">
                      {fmtAED(r.net_salary)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenSlip(r)}
                          className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                          title="Print A4 Salary Slip"
                        >
                          <Printer size={13} /> Salary Slip
                        </button>
                        <button
                          onClick={() => handleOpenVoucher(r)}
                          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          title="Generate Payment Voucher"
                        >
                          <Receipt size={13} /> Payment Voucher
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

      {/* Payment Voucher Print Modal */}
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
