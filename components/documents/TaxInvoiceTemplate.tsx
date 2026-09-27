"use client";

import React, { useState, useEffect } from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import { fmtAED, fmtDate } from "@/lib/helpers";
import DocumentContainer from "./DocumentContainer";
import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";
import { DocumentLayout, loadDocumentLayout, createDefaultLayout } from "@/lib/documentDesigner";

export type TaxInvoiceLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount_pct?: number;
  taxable_amount: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
};

export type TaxInvoiceData = {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  supply_date?: string | null;
  due_date?: string | null;
  customer_name: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  location?: string | null;
  scope_of_work?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  advance_amount?: number;
  payment_terms?: string | null;
  payment_schedule?: string | null;
  notes?: string | null;
  status?: string | null;
  items: TaxInvoiceLineItem[];
};

type TaxInvoiceProps = {
  company: CompanyDocInfo | null;
  invoice: TaxInvoiceData;
  onClose?: () => void;
};

export default function TaxInvoiceTemplate({
  company,
  invoice,
  onClose,
}: TaxInvoiceProps) {
  // Always initialize with default UAE Corporate template so the Tax Invoice preview
  // and PDF Designer share the exact same underlying layout and dimensions.
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("tax_invoice"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "tax_invoice").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const advance = Number(invoice.advance_amount) || 0;
  const netPayable = Math.max(0, invoice.total_amount - advance);

  const rendererData: MockDocumentData = {
    document_number: invoice.invoice_number,
    document_date: invoice.invoice_date,
    supply_date: invoice.supply_date || invoice.invoice_date,
    due_date: invoice.due_date || undefined,
    status: invoice.status || undefined,
    customer_name: invoice.customer_name,
    customer_trn: invoice.customer_trn || undefined,
    customer_address: invoice.customer_address || undefined,
    contact_person: invoice.contact_person || undefined,
    contact_number: invoice.contact_number || undefined,
    contact_email: invoice.contact_email || undefined,
    project_name: invoice.project_name || undefined,
    project_number: invoice.project_number || undefined,
    location: invoice.location || undefined,
    scope_of_work: invoice.scope_of_work || undefined,
    items: invoice.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: it.unit_price,
      discount: it.discount_pct || 0,
      vat_rate: it.vat_rate,
      vat_amount: it.vat_amount,
      line_total: it.line_total,
    })),
    subtotal: invoice.subtotal,
    vat_amount: invoice.vat_amount,
    total_amount: invoice.total_amount,
    advance_amount: invoice.advance_amount,
    payment_terms: invoice.payment_terms || undefined,
    notes: invoice.notes || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData);

  return (
    <DocumentContainer
      docTypeLabel="Tax Invoice"
      docNumber={invoice.invoice_number}
      status={invoice.status}
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
          <DocHeader
          company={company}
          docTitle="TAX INVOICE"
          arabicTitle="فاتورة ضريبية"
          docNumber={invoice.invoice_number}
          docDate={invoice.invoice_date}
          subTitle="Original Tax Invoice Issued Under UAE Federal Decree-Law on Value Added Tax"
        />

        {/* Customer & Document Information */}
        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          {/* Left Box: Customer Details */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Customer Details (بيانات العميل):</span>
              <span className="text-slate-400 font-normal">Buyer</span>
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{invoice.customer_name}</div>
              {invoice.customer_trn && (
                <div>
                  <span className="text-slate-500">TRN (الرقم الضريبي):</span>{" "}
                  <span className="font-mono font-bold text-slate-900">{invoice.customer_trn}</span>
                </div>
              )}
              {invoice.customer_address && (
                <div>
                  <span className="text-slate-500">Address:</span> {invoice.customer_address}
                </div>
              )}
              {invoice.contact_person && (
                <div>
                  <span className="text-slate-500">Contact:</span> {invoice.contact_person}
                  {invoice.contact_number ? ` (${invoice.contact_number})` : ""}
                </div>
              )}
              {invoice.contact_number && !invoice.contact_person && (
                <div><span className="text-slate-500">Tel/Mob:</span> {invoice.contact_number}</div>
              )}
              {invoice.contact_email && (
                <div className="break-all"><span className="text-slate-500">Email:</span> {invoice.contact_email}</div>
              )}
            </div>
          </div>

          {/* Right Box: Invoice Meta & Project Reference */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Invoice &amp; Job Reference (بيانات الفاتورة):</span>
              <span className="text-emerald-700 font-semibold font-mono">{invoice.invoice_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Invoice Date:</span>
                <div className="font-semibold text-slate-900">{fmtDate(invoice.invoice_date)}</div>
              </div>
              <div>
                <span className="text-slate-500">Date of Supply:</span>
                <div className="font-semibold text-slate-900">{fmtDate(invoice.supply_date || invoice.invoice_date)}</div>
              </div>
              {invoice.due_date && (
                <div>
                  <span className="text-slate-500">Payment Due:</span>
                  <div className="font-semibold text-slate-900">{fmtDate(invoice.due_date)}</div>
                </div>
              )}
              {invoice.payment_terms && (
                <div>
                  <span className="text-slate-500">Payment Terms:</span>
                  <div className="font-semibold text-slate-900">{invoice.payment_terms}</div>
                </div>
              )}
              {invoice.project_number && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">Project / Contract:</span>
                  <div className="font-bold text-slate-900">
                    {invoice.project_number} {invoice.project_name ? `— ${invoice.project_name}` : ""}
                  </div>
                  {invoice.location && (
                    <div className="text-[11px] text-slate-500">Site: {invoice.location}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scope of Work (if present) */}
        {invoice.scope_of_work && (
          <div className="mb-3 rounded border border-slate-200 bg-slate-50/30 p-2.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Scope of Work / Description (نطاق العمل):</span>{" "}
            {invoice.scope_of_work}
          </div>
        )}

        {/* Line Items Table */}
        <div className="my-3 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-3">Item Description (بيان الصنف والخدمة)</th>
                <th className="py-2 px-2 text-center w-14">Qty</th>
                <th className="py-2 px-2 text-center w-14">Unit</th>
                <th className="py-2 px-2 text-right w-24">Rate (AED)</th>
                <th className="py-2 px-2 text-right w-24">Taxable (AED)</th>
                <th className="py-2 px-2 text-right w-20">VAT (5%)</th>
                <th className="py-2 px-3 text-right w-28">Total (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {invoice.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-400 italic">
                    No items on this invoice.
                  </td>
                </tr>
              ) : (
                invoice.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium text-slate-800 whitespace-pre-line">
                      {item.description}
                    </td>
                    <td className="py-2 px-2 text-center font-mono">{item.quantity}</td>
                    <td className="py-2 px-2 text-center text-slate-600">{item.unit || "Nos"}</td>
                    <td className="py-2 px-2 text-right font-mono">{Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono">{Number(item.taxable_amount).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-mono text-amber-700">{Number(item.vat_amount).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      {Number(item.line_total).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals & Amount in Words Grid */}
        <div className="grid grid-cols-12 gap-4 my-4">
          {/* Left: Amount in Words */}
          <div className="col-span-7 space-y-2 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-slate-800">
                Amount in Words (المبلغ بالحروف):
              </div>
              <div className="text-slate-700 italic font-medium">
                {numberToWordsEnglish(invoice.total_amount)}
              </div>
              <div className="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[13px] pt-1 border-t border-slate-200/60">
                {numberToWordsArabic(invoice.total_amount)}
              </div>
            </div>

            {/* Banking Details */}
            {company?.bank_name && (
              <div className="rounded border border-slate-200 bg-slate-50/40 p-2.5 text-[11px] text-slate-600 space-y-0.5">
                <div className="font-bold text-slate-800 text-xs">Bank Transfer Information (بيانات التحويل):</div>
                <div><span className="text-slate-500">Bank:</span> {company.bank_name}</div>
                {company.bank_account_name && <div><span className="text-slate-500">Account Name:</span> {company.bank_account_name}</div>}
                {company.iban && <div><span className="text-slate-500">IBAN:</span> <span className="font-mono font-bold text-slate-900">{company.iban}</span></div>}
                {company.swift_bic && <div><span className="text-slate-500">SWIFT:</span> <span className="font-mono">{company.swift_bic}</span></div>}
              </div>
            )}
          </div>

          {/* Right: Calculations */}
          <div className="col-span-5">
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="flex justify-between py-2 px-3 bg-slate-50/60 border-b border-slate-200">
                <span className="text-slate-600">Subtotal (Excl. VAT):</span>
                <span className="font-mono font-semibold">{fmtAED(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b border-slate-200">
                <span className="text-slate-600">VAT Total (5% ضريبة):</span>
                <span className="font-mono font-semibold text-amber-700">{fmtAED(invoice.vat_amount)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-emerald-50/60 border-b border-emerald-200 font-bold text-slate-900 text-sm">
                <span>Grand Total (المجموع الإجمالي):</span>
                <span className="font-mono text-emerald-800">{fmtAED(invoice.total_amount)}</span>
              </div>
              {advance > 0 && (
                <>
                  <div className="flex justify-between py-2 px-3 border-b border-slate-200 text-slate-600">
                    <span>Advance / Paid:</span>
                    <span className="font-mono text-emerald-700">-{fmtAED(advance)}</span>
                  </div>
                  <div className="flex justify-between py-2 px-3 bg-slate-100 font-bold text-slate-900">
                    <span>Balance Due:</span>
                    <span className="font-mono">{fmtAED(netPayable)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes & Payment Schedule */}
        {(invoice.notes || invoice.payment_schedule) && (
          <div className="my-3 rounded border border-slate-200 bg-slate-50/30 p-2.5 text-xs text-slate-600 space-y-1">
            {invoice.payment_schedule && (
              <div><span className="font-semibold text-slate-800">Payment Schedule:</span> {invoice.payment_schedule}</div>
            )}
            {invoice.notes && (
              <div><span className="font-semibold text-slate-800">Notes / Remarks:</span> {invoice.notes}</div>
            )}
          </div>
        )}

      {/* Dual Signature & Stamp Area */}
      <DocSignatureArea
        preparedByTitle="COMPANY AUTHORIZED SIGNATURE & STAMP"
        receivedByTitle="CLIENT ACKNOWLEDGEMENT"
        stampSrc={company?.stamp_url ?? undefined}
        signatureSrc={company?.signature_url ?? undefined}
        companyName={company?.legal_name ?? company?.name ?? undefined}
        clientName={invoice.customer_name}
        date={invoice.invoice_date}
      />

      {/* Document Footer with Bank payment details */}
      <DocFooter company={company} showBankDetails={true} />
        </>
      )}
    </DocumentContainer>
  );
}
