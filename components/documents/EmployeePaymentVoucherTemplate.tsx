"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import DocumentContainer from "./DocumentContainer";
import { CompanyStamp, AuthorizedSignature } from "./StampAndSignature";

export type PaymentVoucherData = {
  voucher_number: string;
  voucher_date: string;
  employee_name: string;
  employee_id: string;
  designation?: string | null;
  month: string | number;
  year: number;
  net_amount: number;
  payment_method: string; // 'Bank Transfer' | 'Cash' | 'Cheque'
  bank_reference?: string | null;
  bank_name?: string | null;
  notes?: string | null;
  prepared_by?: string | null;
  approved_by?: string | null;
};

type PaymentVoucherProps = {
  company: CompanyDocInfo | null;
  voucher: PaymentVoucherData;
  onClose?: () => void;
};

export default function EmployeePaymentVoucherTemplate({
  company,
  voucher,
  onClose,
}: PaymentVoucherProps) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthLabel = typeof voucher.month === "number" ? monthNames[voucher.month - 1] || `Month ${voucher.month}` : voucher.month;

  return (
    <DocumentContainer
      docTypeLabel="Payment Voucher"
      docNumber={voucher.voucher_number}
      onClose={onClose}
      company={company ?? undefined}
    >
      {/* Letterhead Header */}
      <DocHeader
          company={company}
          docTitle="PAYMENT VOUCHER"
          arabicTitle="سند صرف"
          docNumber={voucher.voucher_number}
          docDate={voucher.voucher_date}
        />

        {/* Voucher Main Details Grid */}
        <div className="rounded border-2 border-slate-300 p-4 my-4 text-xs space-y-3 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">Paid To (الاسم المستفيد):</span>
              <span className="font-extrabold text-slate-900 text-sm">{voucher.employee_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Employee ID / Staff Code:</span>
              <span className="font-mono font-bold text-slate-800">{voucher.employee_id}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pb-3 border-b border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">Payment Period (عن شهر):</span>
              <span className="font-semibold text-slate-800">{monthLabel} {voucher.year}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Payment Method (طريقة الصرف):</span>
              <span className="font-semibold text-slate-900">{voucher.payment_method}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Bank / Transfer Ref:</span>
              <span className="font-mono font-semibold text-slate-800">{voucher.bank_reference || "WPS Auto-Batch"}</span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="rounded bg-white p-3 border border-slate-300 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-600 uppercase">Amount Paid (المبلغ المصروف):</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">
                {numberToWordsEnglish(voucher.net_amount)}
              </div>
              <div dir="rtl" className="text-xs font-semibold text-slate-800 font-arabic mt-0.5">
                {numberToWordsArabic(voucher.net_amount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black font-mono text-slate-900">
                {voucher.net_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-sans font-bold">AED</span>
              </div>
            </div>
          </div>

          {voucher.notes && (
            <div className="text-[11px] text-slate-600 pt-1">
              <span className="font-bold text-slate-800">Particulars / Description: </span>
              {voucher.notes}
            </div>
          )}
        </div>

        {/* Receiver Declaration */}
        <div className="rounded border border-dashed border-slate-300 p-3 bg-white text-[11px] text-slate-700 my-4 leading-relaxed">
          <strong>Employee Acknowledgement & Release (إقرار واستلام الموظف):</strong>
          <p className="mt-1 text-slate-600">
            I, the undersigned, hereby acknowledge the receipt of the full and final net remuneration stated above for the period of <strong>{monthLabel} {voucher.year}</strong> without any remaining claim or deduction for this period.
          </p>
          <p dir="rtl" className="mt-1 text-slate-600 font-arabic">
            أقر أنا الموقع أدناه باستلامي كامل المبلغ الموضح أعلاه عن الفترة المذكورة دون أي تحفظ أو مطالبات متبقية عن هذه الفترة.
          </p>
        </div>

        {/* 3-Column Formal Signatures */}
        <div className="grid grid-cols-3 gap-4 border-t-2 border-slate-300 pt-4 text-xs mt-6">
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Prepared By (إعداد المحاسب)</div>
            <div className="font-bold text-slate-800 text-xs mt-1">{voucher.prepared_by || "Accounts Dept."}</div>
            <div className="h-14 border-b border-dashed border-slate-300 my-2 flex items-center justify-center">
              <AuthorizedSignature title="Payroll Accountant" />
            </div>
            <div className="text-[10px] text-slate-400">Signature &amp; Date</div>
          </div>
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Approved By (اعتماد الإدارة)</div>
            <div className="font-bold text-slate-800 text-xs mt-1">{voucher.approved_by || "General Manager"}</div>
            <div className="h-14 border-b border-dashed border-slate-300 my-2 flex items-center justify-center">
              <CompanyStamp size={64} />
            </div>
            <div className="text-[10px] text-slate-400">Official Stamp</div>
          </div>
          <div className="rounded border border-slate-200 p-3 text-center bg-slate-50/50">
            <div className="text-[10px] text-slate-500 uppercase font-bold text-slate-900">Received By (توقيع المستلم)</div>
            <div className="font-bold text-slate-800 text-xs mt-1">{voucher.employee_name}</div>
            <div className="h-14 border-b border-dashed border-slate-300 my-2"></div>
            <div className="text-[10px] text-slate-400">Employee Signature &amp; Date</div>
          </div>
        </div>

        {/* Footer */}
        <DocFooter
          customText="Internal accounting voucher. Kept on record for audit and WPS payroll reconciliation."
        />
    </DocumentContainer>
  );
}
