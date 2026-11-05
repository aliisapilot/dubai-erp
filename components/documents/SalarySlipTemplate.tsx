"use client";
import { usePersistedDocumentDesign, DesignLoadState } from "./usePersistedDocumentDesign";

import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import DocumentContainer from "./DocumentContainer";

export type SalarySlipData = {
  employee_name: string;
  employee_id: string;
  designation?: string | null;
  department?: string | null;
  joining_date?: string | null;
  account_number?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  month: string | number;
  year: number;
  // Earnings
  basic_salary: number;
  housing_allowance?: number;
  transport_allowance?: number;
  other_allowances?: number;
  friday_pay?: number;
  overtime_amount?: number;
  bonus?: number;
  // Deductions
  absence_deduction?: number;
  advance_deduction?: number;
  insurance_deduction?: number;
  loan_deduction?: number;
  leave_deduction?: number;
  other_deductions?: number;
  // Calculated
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  status?: string | null;
};

type SalarySlipProps = {
  company: CompanyDocInfo | null;
  slip: SalarySlipData;
  onClose?: () => void;
};

export default function SalarySlipTemplate({
  company,
  slip,
  onClose,
}: SalarySlipProps) {
  const design = usePersistedDocumentDesign(company?.id, 'salary_statement');
  const customLayout = design.layout;
  if (!design.ready) return <DesignLoadState error={design.error} retry={design.retry} />;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthLabel = typeof slip.month === "number" ? monthNames[slip.month - 1] || `Month ${slip.month}` : slip.month;

  const rendererData: MockDocumentData = {
    document_number: `SLIP-${slip.year}-${String(slip.month).padStart(2, "0")}-${slip.employee_id}`,
    document_date: `${slip.year}-${String(slip.month).padStart(2, "0")}-01`,
    customer_name: `${slip.employee_name} (${slip.employee_id})`,
    scope_of_work: slip.designation || undefined,
    items: [
      { description: "Basic Salary", quantity: 1, unit_price: slip.basic_salary, line_total: slip.basic_salary, vat_amount: 0 },
      ...(slip.housing_allowance ? [{ description: "Housing Allowance", quantity: 1, unit_price: slip.housing_allowance, line_total: slip.housing_allowance, vat_amount: 0 }] : []),
      ...(slip.transport_allowance ? [{ description: "Transport Allowance", quantity: 1, unit_price: slip.transport_allowance, line_total: slip.transport_allowance, vat_amount: 0 }] : []),
      ...(slip.other_allowances ? [{ description: "Other Allowances", quantity: 1, unit_price: slip.other_allowances, line_total: slip.other_allowances, vat_amount: 0 }] : []),
      ...(slip.overtime_amount ? [{ description: "Overtime Pay", quantity: 1, unit_price: slip.overtime_amount, line_total: slip.overtime_amount, vat_amount: 0 }] : []),
      ...(slip.friday_pay ? [{ description: "Friday / Weekend Pay", quantity: 1, unit_price: slip.friday_pay, line_total: slip.friday_pay, vat_amount: 0 }] : []),
      ...(slip.bonus ? [{ description: "Bonus", quantity: 1, unit_price: slip.bonus, line_total: slip.bonus, vat_amount: 0 }] : []),
      ...(slip.absence_deduction ? [{ description: "Absence Deduction", quantity: 1, unit_price: -slip.absence_deduction, line_total: -slip.absence_deduction, vat_amount: 0 }] : []),
      ...(slip.advance_deduction ? [{ description: "Advance Salary Deduction", quantity: 1, unit_price: -slip.advance_deduction, line_total: -slip.advance_deduction, vat_amount: 0 }] : []),
      ...(slip.insurance_deduction ? [{ description: "Insurance Deduction", quantity: 1, unit_price: -slip.insurance_deduction, line_total: -slip.insurance_deduction, vat_amount: 0 }] : []),
      ...(slip.loan_deduction ? [{ description: "Loan Deduction", quantity: 1, unit_price: -slip.loan_deduction, line_total: -slip.loan_deduction, vat_amount: 0 }] : []),
      ...(slip.leave_deduction ? [{ description: "Leave Deduction", quantity: 1, unit_price: -slip.leave_deduction, line_total: -slip.leave_deduction, vat_amount: 0 }] : []),
      ...(slip.other_deductions ? [{ description: "Other Deductions", quantity: 1, unit_price: -slip.other_deductions, line_total: -slip.other_deductions, vat_amount: 0 }] : []),
    ],
    subtotal: slip.total_earnings,
    vat_amount: 0,
    total_amount: slip.net_pay,
    notes: `Department: ${slip.department || "N/A"} | Bank: ${slip.bank_name || "N/A"} | IBAN: ${slip.iban || "N/A"}`,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData);

  return (
    <DocumentContainer
      docTypeLabel="Salary Payslip"
      docNumber={`SAL-${slip.year}-${String(slip.month).padStart(2, "0")}`}
      status={slip.status || "Finalized"}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
      totalPages={totalPages}
      partyName={slip.employee_name}
      documentDate={`${slip.year}-${String(slip.month).padStart(2, "0")}-01`}
    >
      {customLayout ? (
        <div className="flex flex-col gap-6 print:gap-0">
          {Array.from({ length: totalPages }, (_, index) => (
            <DynamicDocumentRenderer
              key={index}
              layout={customLayout}
              company={company}
              data={rendererData}
              isDesignerPreview={false}
              scale={1}
              pageNumber={index + 1}
              totalPages={totalPages}
            />
          ))}
        </div>
      ) : (
        <>
      {/* Letterhead Header */}
      <DocHeader
          company={company}
          docTitle="SALARY STATEMENT"
          arabicTitle="كشف راتب"
          docNumber={`SLIP-${slip.year}-${String(slip.month).padStart(2, "0")}-${slip.employee_id}`}
          docDate={`${slip.year}-${String(slip.month).padStart(2, "0")}-28`}
        />

        {/* Employee Profile Grid */}
        <div className="rounded border border-slate-300 bg-slate-50/70 p-4 text-xs my-4">
          <div className="grid grid-cols-3 gap-y-2 gap-x-4">
            <div>
              <span className="text-slate-500 block text-[10px]">Employee Name:</span>
              <span className="font-bold text-slate-900 text-sm">{slip.employee_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Employee ID / Code:</span>
              <span className="font-mono font-bold text-slate-800">{slip.employee_id || "EMP-001"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Designation / Role:</span>
              <span className="font-semibold text-slate-800">{slip.designation || "Staff"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Department:</span>
              <span className="text-slate-700">{slip.department || "Operations"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Date of Joining:</span>
              <span className="text-slate-700">
                {slip.joining_date ? new Date(slip.joining_date).toLocaleDateString("en-GB") : "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Payroll Period:</span>
              <span className="font-semibold text-slate-800">{monthLabel} {slip.year}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Bank / Payment Mode:</span>
              <span className="text-slate-700">{slip.bank_name || "WPS Bank Transfer"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block text-[10px]">Bank Account / IBAN:</span>
              <span className="font-mono font-bold text-slate-900">
                {slip.iban || slip.account_number || "AE—"}
              </span>
            </div>
          </div>
        </div>

        {/* Earnings and Deductions Two-Column Breakdown */}
        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          {/* Earnings Column */}
          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="bg-slate-800 text-white font-bold px-3 py-2 uppercase text-[11px] flex justify-between">
              <span>Earnings (المستحقات)</span>
              <span>Amount (AED)</span>
            </div>
            <div className="p-3 space-y-2 bg-white">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-700">Basic Salary Pay (الراتب الأساسي):</span>
                <span className="font-mono font-semibold text-slate-900">{slip.basic_salary.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              {(slip.housing_allowance || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-700">Housing Allowance (بدل سكن):</span>
                  <span className="font-mono font-semibold text-slate-900">{(slip.housing_allowance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {(slip.transport_allowance || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-700">Transport Allowance (بدل انتقال):</span>
                  <span className="font-mono font-semibold text-slate-900">{(slip.transport_allowance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {(slip.friday_pay || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100 bg-amber-50/50 px-1 rounded">
                  <span className="text-slate-800 font-medium">Friday / Weekend Pay (بدل يوم الجمعة):</span>
                  <span className="font-mono font-bold text-slate-900">{(slip.friday_pay || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {(slip.overtime_amount || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100 bg-emerald-50/50 px-1 rounded">
                  <span className="text-slate-800 font-medium">Overtime Hours Pay (العمل الإضافي):</span>
                  <span className="font-mono font-bold text-emerald-800">{(slip.overtime_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {(slip.other_allowances || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-700">Other Allowances (بدلات أخرى):</span>
                  <span className="font-mono font-semibold text-slate-900">{(slip.other_allowances || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {(slip.bonus || 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-100 bg-sky-50/50 px-1 rounded">
                  <span className="text-slate-800 font-medium">Bonus / Incentives (مكافأة):</span>
                  <span className="font-mono font-bold text-slate-900">{(slip.bonus || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
            <div className="bg-slate-100 px-3 py-2 border-t-2 border-slate-300 font-bold flex justify-between text-slate-900">
              <span>Total Earnings (إجمالي المستحقات):</span>
              <span className="font-mono text-sm">{slip.total_earnings.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
            </div>
          </div>

          {/* Deductions Column */}
          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="bg-slate-800 text-white font-bold px-3 py-2 uppercase text-[11px] flex justify-between">
              <span>Deductions (الاستقطاعات)</span>
              <span>Amount (AED)</span>
            </div>
            <div className="p-3 space-y-2 bg-white">
              {(slip.absence_deduction || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Absence / Unpaid Leave (خصم غياب):</span>
                  <span className="font-mono font-semibold">{(slip.absence_deduction || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {(slip.advance_deduction || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Salary Advance (سلفة راتب):</span>
                  <span className="font-mono font-semibold">{(slip.advance_deduction || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {(slip.insurance_deduction || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Medical Insurance (تأمين صحي):</span>
                  <span className="font-mono font-semibold">{(slip.insurance_deduction || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {(slip.loan_deduction || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Loan Deduction (خصم قرض):</span>
                  <span className="font-mono font-semibold">{(slip.loan_deduction || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {(slip.leave_deduction || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Leave Deduction (خصم إجازة):</span>
                  <span className="font-mono font-semibold">{(slip.leave_deduction || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {(slip.other_deductions || 0) > 0 ? (
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-800">
                  <span>Other Deductions / Penalties:</span>
                  <span className="font-mono font-semibold">{(slip.other_deductions || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              ) : null}
              {slip.total_deductions === 0 && (
                <div className="py-6 text-center text-slate-400 text-[11px]">
                  Nil deductions for this payroll period.
                </div>
              )}
            </div>
            <div className="bg-slate-100 px-3 py-2 border-t-2 border-slate-300 font-bold flex justify-between text-rose-900">
              <span>Total Deductions (إجمالي الخصومات):</span>
              <span className="font-mono text-sm">{slip.total_deductions.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
            </div>
          </div>
        </div>

        {/* Net Salary Payable Box */}
        <div className="rounded border-2 border-slate-900 bg-slate-900 text-white p-4 my-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Net Payable Amount (صافي الراتب المستحق للصرف):
            </div>
            <div className="text-xs text-slate-300 mt-1">
              {numberToWordsEnglish(slip.net_pay)}
            </div>
            <div dir="rtl" className="text-xs text-amber-300 mt-0.5 font-arabic">
              {numberToWordsArabic(slip.net_pay)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold font-mono text-amber-400">
              {slip.net_pay.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm">AED</span>
            </div>
            <span className="inline-block mt-1 rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
              {slip.status || "Finalized"}
            </span>
          </div>
        </div>

      {/* Multi-party Salary Signature Blocks */}
      <DocSignatureArea
        mode="salary"
        preparedBy="HR & Payroll Officer"
        approvedBy="Financial Controller"
        receiverName={slip.employee_name}
        signatureSrc={company?.signature_url || undefined}
        stampSrc={company?.stamp_url || undefined}
      />

      {/* Footer */}
      <DocFooter
        customText="Confidential document intended solely for the named employee. Generated via Dubai ERP WPS compliance."
      />
        </>
      )}
    </DocumentContainer>
  );
}
