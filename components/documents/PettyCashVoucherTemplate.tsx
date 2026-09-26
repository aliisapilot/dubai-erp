"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import DocumentContainer from "./DocumentContainer";
import DocSignatureArea from "./DocSignatureArea";

export type PettyCashVoucherData = {
  voucher_number: string;
  transaction_date: string;
  transaction_type: "DISBURSEMENT" | "REPLENISHMENT";
  payee: string;
  category: string;
  amount: number;
  balance_after: number;
  receipt_ref?: string | null;
  description: string;
  approved_by?: string | null;
};

type PettyCashVoucherProps = {
  company: CompanyDocInfo | null;
  voucher: PettyCashVoucherData;
  onClose?: () => void;
};

export default function PettyCashVoucherTemplate({
  company,
  voucher,
  onClose,
}: PettyCashVoucherProps) {
  const isReplenish = voucher.transaction_type === "REPLENISHMENT";

  return (
    <DocumentContainer
      docTypeLabel={isReplenish ? "Petty Cash Replenishment" : "Petty Cash Voucher"}
      docNumber={voucher.voucher_number}
      onClose={onClose}
      company={company ?? undefined}
      showWatermark={true}
      totalPages={1}
    >
      <div className="space-y-4 print:space-y-2.5">
        {/* Letterhead Header */}
        <DocHeader
          company={company}
          docTitle={isReplenish ? "PETTY CASH REPLENISHMENT" : "PETTY CASH VOUCHER"}
          arabicTitle={isReplenish ? "سند تعويض صندوق المصروفات النثرية" : "سند صرف صندوق نثريات"}
          docNumber={voucher.voucher_number}
          docDate={voucher.transaction_date}
        />

        {/* Voucher Main Details Grid */}
        <div className="rounded border-2 border-slate-300 p-3.5 print:p-2.5 text-xs space-y-3 print:space-y-2 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-4 pb-2.5 border-b border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">
                {isReplenish ? "Replenished From / Bank (مصدر التغذية / البنك):" : "Paid To / Beneficiary (يصرف للسيد / المستفيد):"}
              </span>
              <span className="font-extrabold text-slate-900 text-sm">{voucher.payee}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Category / Expense Account (بند المصروف):</span>
              <span className="font-bold text-slate-800">{voucher.category}</span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="rounded bg-white p-3 print:p-2 border border-slate-300 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-600 uppercase">
                {isReplenish ? "Replenishment Sum (مبلغ التغذية):" : "Disbursement Amount (المبلغ المصروف):"}
              </div>
              <div className="text-xs font-semibold text-slate-900 mt-1">
                {numberToWordsEnglish(voucher.amount)}
              </div>
              <div dir="rtl" className="text-xs font-semibold text-slate-800 font-arabic mt-0.5">
                {numberToWordsArabic(voucher.amount)}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black font-mono ${isReplenish ? "text-emerald-700" : "text-amber-700"}`}>
                {voucher.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-sans font-bold">AED</span>
              </div>
            </div>
          </div>

          {/* Details & Balances */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div>
              <span className="text-slate-500 block text-[10px]">Transaction Type (نوع المعاملة):</span>
              <span className={`inline-block px-2 py-0.5 mt-0.5 rounded text-[11px] font-bold uppercase ${
                isReplenish ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}>
                {isReplenish ? "Replenishment (+)" : "Disbursement (-)"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Receipt / Bill Ref (رقم الفاتورة/الإيصال):</span>
              <span className="font-mono font-semibold text-slate-800">{voucher.receipt_ref || "None Attached"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Petty Cash Balance After (الرصيد المتبقي بعد المعاملة):</span>
              <span className="font-mono font-bold text-slate-900">
                {voucher.balance_after.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
              </span>
            </div>
          </div>

          {/* Description */}
          {voucher.description && (
            <div className="text-[11px] text-slate-700 pt-2 border-t border-slate-200">
              <span className="font-bold text-slate-900">Purpose / Details (الغرض والبيان): </span>
              {voucher.description}
            </div>
          )}
        </div>

        {/* 2-Column Signatures */}
        <DocSignatureArea
          preparedByTitle="Custodian / Cashier (أمين الصندوق)"
          preparedBy="Cashier"
          receivedByTitle={isReplenish ? "Authorized Approval (الاعتماد)" : "Received By Payee (توقيع المستلم)"}
          approvedBy={voucher.approved_by || company?.legal_name || company?.name || "Accounts Dept."}
          signatureSrc={company?.signature_url || undefined}
          stampSrc={company?.stamp_url || undefined}
        />

        {/* Footer */}
        <DocFooter company={company} />
      </div>
    </DocumentContainer>
  );
}
