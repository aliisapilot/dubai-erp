"use client";
import { usePersistedDocumentDesign, DesignLoadState } from "./usePersistedDocumentDesign";

import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import { fmtAED, fmtDate, formatDisplayDocNumber } from "@/lib/helpers";
import { stripCustomPartyTags } from "@/lib/documentCustomer";

import DocumentContainer from "./DocumentContainer";

export type QuotationLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount_percent?: number;
  discount_pct?: number;
  discount_amount?: number;
  taxable_amount?: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
};

export type QuotationData = {
  id?: string;
  quotation_number: string;
  quotation_date: string;
  expiry_date?: string | null;
  customer_name: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  subject?: string | null;
  scope_of_work?: string | null;
  price_validity?: string | null;
  supply_time?: string | null;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  terms_conditions?: string | null;
  notes?: string | null;
  status?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  items: QuotationLineItem[];
};

type QuotationProps = {
  company: CompanyDocInfo | null;
  quotation: QuotationData;
  onClose?: () => void;
};

export default function QuotationTemplate({
  company,
  quotation,
  onClose,
}: QuotationProps) {
  const design = usePersistedDocumentDesign(company?.id, 'quotation');
  const customLayout = design.layout;
  if (!design.ready) return <DesignLoadState error={design.error} retry={design.retry} />;

  const rendererData: MockDocumentData = {
    document_number: formatDisplayDocNumber(quotation.quotation_number, "quotation") || quotation.quotation_number,
    document_date: quotation.quotation_date,
    due_date: quotation.expiry_date || undefined,
    status: quotation.status || undefined,
    customer_name: quotation.customer_name,
    customer_trn: quotation.customer_trn || undefined,
    customer_address: quotation.customer_address || undefined,
    contact_person: quotation.contact_person || undefined,
    contact_number: quotation.contact_number || undefined,
    contact_email: quotation.contact_email || undefined,
    project_name: quotation.project_name || undefined,
    project_number: quotation.project_number || undefined,
    scope_of_work: quotation.scope_of_work || undefined,
    items: quotation.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: it.unit_price,
      discount: it.discount_pct || it.discount_percent || 0,
      vat_rate: it.vat_rate,
      vat_amount: it.vat_amount,
      line_total: it.line_total,
    })),
    subtotal: quotation.subtotal,
    vat_amount: quotation.vat_amount,
    total_amount: quotation.total_amount,
    payment_terms: stripCustomPartyTags(quotation.payment_terms) || undefined,
    notes: stripCustomPartyTags(quotation.notes || quotation.terms_conditions) || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData);
  const effectiveTitle =
    customLayout?.numberingConfig?.customTitle ||
    customLayout?.elements?.find((e) => e.type === "doc_title")?.customText ||
    "QUOTATION";
  const effectiveTitleAr =
    customLayout?.numberingConfig?.customTitleAr ||
    "عرض أسعار";

  return (
    <DocumentContainer
      docTypeLabel={effectiveTitle}
      docNumber={quotation.quotation_number}
      status={quotation.status}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
      totalPages={totalPages}
      hideControls={true}
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
          docTitle={effectiveTitle}
          arabicTitle={effectiveTitleAr}
          docNumber={quotation.quotation_number}
          docDate={quotation.quotation_date}
        />

        {/* Customer & Document Information */}
        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Client Details (بيانات العميل):</span>
              <span className="text-slate-400 font-normal">Prospective Buyer</span>
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{quotation.customer_name}</div>
              {quotation.customer_trn && (
                <div>
                  <span className="text-slate-500">TRN:</span>{" "}
                  <span className="font-mono font-bold text-slate-900">{quotation.customer_trn}</span>
                </div>
              )}
              {quotation.customer_address && (
                <div><span className="text-slate-500">Address:</span> {quotation.customer_address}</div>
              )}
              {quotation.contact_person && (
                <div>
                  <span className="text-slate-500">Attention:</span> {quotation.contact_person}
                  {quotation.contact_number ? ` (${quotation.contact_number})` : ""}
                </div>
              )}
              {quotation.contact_email && (
                <div><span className="text-slate-500">Email:</span> {quotation.contact_email}</div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Offer Details (بيانات العرض):</span>
              <span className="text-blue-700 font-semibold font-mono">{quotation.quotation_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Date:</span>
                <div className="font-semibold text-slate-900">{fmtDate(quotation.quotation_date)}</div>
              </div>
              <div>
                <span className="text-slate-500">Validity:</span>
                <div className="font-semibold text-slate-900">{quotation.price_validity || (quotation.expiry_date ? fmtDate(quotation.expiry_date) : "30 Days")}</div>
              </div>
              {stripCustomPartyTags(quotation.payment_terms) && (
                <div>
                  <span className="text-slate-500">Payment Terms:</span>
                  <div className="font-semibold text-slate-900">{stripCustomPartyTags(quotation.payment_terms)}</div>
                </div>
              )}
              {quotation.supply_time && (
                <div>
                  <span className="text-slate-500">Delivery Schedule:</span>
                  <div className="font-semibold text-slate-900">{quotation.supply_time}</div>
                </div>
              )}
              {quotation.project_number && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">Project / Job:</span>
                  <div className="font-bold text-slate-900">{quotation.project_number} {quotation.project_name ? `— ${quotation.project_name}` : ""}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Subject / Scope */}
        {(quotation.subject || quotation.scope_of_work) && (
          <div className="mb-3 rounded border border-slate-200 bg-slate-50/30 p-2.5 text-xs text-slate-700 space-y-1">
            {quotation.subject && <div><span className="font-bold text-slate-900">Subject (الموضوع):</span> {quotation.subject}</div>}
            {quotation.scope_of_work && <div><span className="font-semibold text-slate-900">Scope of Work:</span> {quotation.scope_of_work}</div>}
          </div>
        )}

        {/* Items Table */}
        <div className="my-3 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-3">Item &amp; Specification (بيان الأصناف والمواصفات)</th>
                <th className="py-2 px-2 text-center w-14">Qty</th>
                <th className="py-2 px-2 text-center w-14">Unit</th>
                <th className="py-2 px-2 text-right w-24">Unit Rate (AED)</th>
                <th className="py-2 px-2 text-right w-20">VAT (5%)</th>
                <th className="py-2 px-3 text-right w-28">Total (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {quotation.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-2 text-center text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium text-slate-800 whitespace-pre-line">{item.description}</td>
                  <td className="py-2 px-2 text-center font-mono">{item.quantity}</td>
                  <td className="py-2 px-2 text-center text-slate-600">{item.unit || "Nos"}</td>
                  <td className="py-2 px-2 text-right font-mono">{Number(item.unit_price).toFixed(2)}</td>
                  <td className="py-2 px-2 text-right font-mono text-amber-700">{Number(item.vat_amount).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{Number(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculations & Words */}
        <div className="grid grid-cols-12 gap-4 my-4">
          <div className="col-span-7 space-y-2 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-slate-800">Amount in Words:</div>
              <div className="text-slate-700 italic font-medium">{numberToWordsEnglish(quotation.total_amount)}</div>
              <div className="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[13px] pt-1 border-t border-slate-200/60">
                {numberToWordsArabic(quotation.total_amount)}
              </div>
            </div>

            {stripCustomPartyTags(quotation.terms_conditions) && (
              <div className="rounded border border-slate-200 bg-slate-50/30 p-2.5 text-[11px] text-slate-600">
                <div className="font-bold text-slate-800 text-xs mb-1">Terms &amp; Conditions (الشروط والأحكام):</div>
                <div className="whitespace-pre-line leading-relaxed">{stripCustomPartyTags(quotation.terms_conditions)}</div>
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="flex justify-between py-2 px-3 bg-slate-50/60 border-b border-slate-200">
                <span className="text-slate-600">Subtotal (Excl. VAT):</span>
                <span className="font-mono font-semibold">{fmtAED(quotation.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b border-slate-200">
                <span className="text-slate-600">VAT Total (5%):</span>
                <span className="font-mono font-semibold text-amber-700">{fmtAED(quotation.vat_amount)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-blue-50/60 border-b border-blue-200 font-bold text-slate-900 text-sm">
                <span>Total Offer (المجموع):</span>
                <span className="font-mono text-blue-900">{fmtAED(quotation.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

      <DocSignatureArea
        preparedByTitle="COMPANY AUTHORIZED SIGNATURE & STAMP"
        receivedByTitle="CLIENT ACKNOWLEDGEMENT"
        signatureSrc={company?.signature_url || undefined}
        stampSrc={company?.stamp_url || undefined}
        companyName={company?.legal_name || company?.name}
        clientName={quotation.customer_name}
        date={quotation.quotation_date}
      />

      <DocFooter company={company} showBankDetails={true} />
        </>
      )}
    </DocumentContainer>
  );
}
