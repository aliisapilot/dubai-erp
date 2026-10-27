"use client";
import { usePersistedDocumentDesign, DesignLoadState } from "./usePersistedDocumentDesign";

import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import DocumentContainer from "./DocumentContainer";
import DocSignatureArea from "./DocSignatureArea";

export type ReceiptVoucherData = {
  voucher_number: string;
  voucher_date: string;
  received_from: string;
  customer_address?: string | null;
  customer_trn?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  project_name?: string | null;
  amount: number;
  payment_method: string;
  cheque_number?: string | null;
  cheque_date?: string | null;
  bank_name?: string | null;
  reference_invoice?: string | null;
  total_due?: number;
  advance_amount?: number;
  balance_amount?: number;
  accountant_name?: string | null;
  notes?: string | null;
};

type ReceiptVoucherProps = {
  company: CompanyDocInfo | null;
  voucher: ReceiptVoucherData;
  onClose?: () => void;
};

export default function ReceiptVoucherTemplate({
  company,
  voucher,
  onClose,
}: ReceiptVoucherProps) {
  const design = usePersistedDocumentDesign(company?.id, 'receipt_voucher');
  const customLayout = design.layout;
  if (!design.ready) return <DesignLoadState error={design.error} retry={design.retry} />;

  const rendererData: MockDocumentData = {
    document_number: voucher.voucher_number,
    document_date: voucher.voucher_date,
    customer_name: voucher.received_from,
    customer_address: voucher.customer_address || undefined,
    customer_trn: voucher.customer_trn || undefined,
    contact_person: voucher.contact_person || undefined,
    contact_number: voucher.contact_number || undefined,
    contact_email: voucher.contact_email || undefined,
    project_name: voucher.project_name || undefined,
    items: [
      {
        description: `Payment Received via ${voucher.payment_method}${voucher.cheque_number ? ` (Cheque #${voucher.cheque_number})` : ""}${voucher.reference_invoice ? ` for ${voucher.reference_invoice}` : ""}`,
        quantity: 1,
        unit: "Voucher",
        unit_price: voucher.amount,
        vat_amount: 0,
        line_total: voucher.amount,
      },
    ],
    subtotal: voucher.amount,
    vat_amount: 0,
    total_amount: voucher.amount,
    advance_amount: voucher.advance_amount,
    payment_terms: voucher.payment_method,
    notes: voucher.notes || undefined,
  };
  const totalPages = customLayout
    ? getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData)
    : 1;
  return (
    <DocumentContainer
      docTypeLabel="Receipt Voucher"
      docNumber={voucher.voucher_number}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
      totalPages={totalPages}
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
      <div className="space-y-6">
        {/* Letterhead Header */}
        <DocHeader
          company={company}
          docTitle="RECEIPT VOUCHER"
          arabicTitle="سند قبض"
          docNumber={voucher.voucher_number}
          docDate={voucher.voucher_date}
        />

        {/* Voucher Main Details Grid */}
        <div className="rounded border-2 border-slate-300 p-4 text-xs space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">Received From (استلمنا من السيد/السادة):</span>
              <span className="font-extrabold text-slate-900 text-sm break-words">{voucher.received_from}</span>
              {voucher.customer_address && (
                <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">{voucher.customer_address}</div>
              )}
              {voucher.customer_trn && (
                <div className="text-[11px] text-slate-600 mt-0.5">
                  TRN: <span className="font-mono font-semibold">{voucher.customer_trn}</span>
                </div>
              )}
              {(voucher.contact_person || voucher.contact_number || voucher.contact_email) && (
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {[voucher.contact_person, voucher.contact_number, voucher.contact_email].filter(Boolean).join(" • ")}
                </div>
              )}
              {voucher.project_name && (
                <div className="text-[10px] font-semibold text-blue-700 mt-0.5">
                  Project: {voucher.project_name}
                </div>
              )}
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Reference / Invoice (مقابل فاتورة/بيان):</span>
              <span className="font-mono font-bold text-slate-800">{voucher.reference_invoice || "General Payment on Account"}</span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="rounded bg-white p-4 border border-slate-300 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-600 uppercase">Received Sum of (مبلغ وقدره):</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">
                {numberToWordsEnglish(voucher.amount)}
              </div>
              <div dir="rtl" className="text-xs font-semibold text-slate-800 font-arabic mt-0.5">
                {numberToWordsArabic(voucher.amount)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black font-mono text-emerald-800">
                {voucher.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-sans font-bold">AED</span>
              </div>
            </div>
          </div>

          {/* Payment Method Details */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div>
              <span className="text-slate-500 block text-[10px]">Payment Method (طريقة الدفع):</span>
              <span className="font-semibold text-slate-900">{voucher.payment_method}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Cheque / Wire Ref:</span>
              <span className="font-mono font-semibold text-slate-800">{voucher.cheque_number || "Direct Deposit"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Drawn on Bank (المسحوب عليه):</span>
              <span className="font-semibold text-slate-800">{voucher.bank_name || "Bank Transfer"}</span>
            </div>
          </div>

          {/* Account Balance Summary if applicable */}
          {((voucher.total_due || 0) > 0 || (voucher.balance_amount || 0) > 0) && (
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-slate-700">
              <div>
                <span className="text-slate-500 block text-[10px]">Total Invoice Due:</span>
                <span className="font-mono font-bold">{(voucher.total_due || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Amount Received:</span>
                <span className="font-mono font-bold text-emerald-700">{voucher.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Remaining Balance:</span>
                <span className="font-mono font-bold text-rose-700">{(voucher.balance_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
              </div>
            </div>
          )}

          {voucher.notes && (
            <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
              <span className="font-bold text-slate-800">Description / Notes: </span>
              {voucher.notes}
            </div>
          )}
        </div>

        {/* 2-Column Signatures */}
        <DocSignatureArea
          preparedByTitle="Accountant / Cashier (المحاسب)"
          preparedBy={voucher.accountant_name || "Finance Dept."}
          receivedByTitle="Authorized Signatory & Stamp (الختم والتوقيع المعتمد)"
          approvedBy={company?.legal_name || company?.name || "Management"}
          signatureSrc={company?.signature_url || undefined}
          stampSrc={company?.stamp_url || undefined}
          date={voucher.voucher_date}
        />

        {/* Footer */}
        <DocFooter
          notes="Receipt is subject to realization of cheque funds into the company account."
          customText="Original Receipt Voucher. Generated via Dubai ERP Finance Suite."
        />
      </div>
        </>
      )}
    </DocumentContainer>
  );
}
