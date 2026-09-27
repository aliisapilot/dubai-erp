"use client";

import { useEffect, useState } from "react";
import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";
import { DocumentLayout, createDefaultLayout, loadDocumentLayout } from "@/lib/documentDesigner";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import { fmtAED, fmtDate } from "@/lib/helpers";
import DocumentContainer from "./DocumentContainer";

export type ProformaLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  discount_pct?: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
};

export type ProformaInvoiceData = {
  id?: string;
  proforma_number: string;
  proforma_date: string;
  customer_name: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  contact_email?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  status?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  items: ProformaLineItem[];
};

type ProformaProps = {
  company: CompanyDocInfo | null;
  proforma: ProformaInvoiceData;
  onClose?: () => void;
};

export default function ProformaInvoiceTemplate({
  company,
  proforma,
  onClose,
}: ProformaProps) {
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("proforma_invoice"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "proforma_invoice").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const rendererData: MockDocumentData = {
    document_number: proforma.proforma_number,
    document_date: proforma.proforma_date,
    status: proforma.status || undefined,
    customer_name: proforma.customer_name,
    customer_trn: proforma.customer_trn || undefined,
    customer_address: proforma.customer_address || undefined,
    contact_person: proforma.contact_person || undefined,
    contact_number: proforma.contact_number || undefined,
    contact_email: proforma.contact_email || undefined,
    project_name: proforma.project_name || undefined,
    project_number: proforma.project_number || undefined,
    items: proforma.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: it.unit_price,
      discount: it.discount_pct || 0,
      vat_rate: it.vat_rate,
      vat_amount: it.vat_amount,
      line_total: it.line_total,
    })),
    subtotal: proforma.subtotal,
    vat_amount: proforma.vat_amount,
    total_amount: proforma.total_amount,
    payment_terms: proforma.payment_terms || undefined,
    notes: proforma.notes || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData);
  return (
    <DocumentContainer
      docTypeLabel="Proforma Invoice"
      docNumber={proforma.proforma_number}
      status={proforma.status}
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
          docTitle="PROFORMA INVOICE"
          arabicTitle="فاتورة مبدئية"
          docNumber={proforma.proforma_number}
          docDate={proforma.proforma_date}
          subTitle="Advance Payment Request & Estimated Tax Breakdown"
        />

        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Customer Details (بيانات العميل):</span>
              <span className="text-slate-400 font-normal">Buyer</span>
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{proforma.customer_name}</div>
              {proforma.customer_trn && (
                <div><span className="text-slate-500">TRN:</span> <span className="font-mono font-bold text-slate-900">{proforma.customer_trn}</span></div>
              )}
              {proforma.customer_address && (
                <div><span className="text-slate-500">Address:</span> {proforma.customer_address}</div>
              )}
              {proforma.contact_person && (
                <div><span className="text-slate-500">Contact:</span> {proforma.contact_person}</div>
              )}
              {proforma.contact_number && (
                <div><span className="text-slate-500">Tel/Mob:</span> {proforma.contact_number}</div>
              )}
              {proforma.contact_email && (
                <div className="break-all"><span className="text-slate-500">Email:</span> {proforma.contact_email}</div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Proforma Reference:</span>
              <span className="text-purple-700 font-semibold font-mono">{proforma.proforma_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Date:</span>
                <div className="font-semibold text-slate-900">{fmtDate(proforma.proforma_date)}</div>
              </div>
              {proforma.payment_terms && (
                <div>
                  <span className="text-slate-500">Payment Terms:</span>
                  <div className="font-semibold text-slate-900">{proforma.payment_terms}</div>
                </div>
              )}
              {proforma.project_number && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">Project / Order:</span>
                  <div className="font-bold text-slate-900">{proforma.project_number} {proforma.project_name ? `— ${proforma.project_name}` : ""}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="my-3 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-3">Description (بيان الخدمة / الصنف)</th>
                <th className="py-2 px-2 text-center w-14">Qty</th>
                <th className="py-2 px-2 text-center w-14">Unit</th>
                <th className="py-2 px-2 text-right w-24">Rate (AED)</th>
                <th className="py-2 px-2 text-right w-20">VAT (5%)</th>
                <th className="py-2 px-3 text-right w-28">Total (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {proforma.items.map((item, idx) => (
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
              <div className="text-slate-700 italic font-medium">{numberToWordsEnglish(proforma.total_amount)}</div>
              <div className="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[13px] pt-1 border-t border-slate-200/60">
                {numberToWordsArabic(proforma.total_amount)}
              </div>
            </div>

            {company?.bank_name && (
              <div className="rounded border border-slate-200 bg-slate-50/40 p-2.5 text-[11px] text-slate-600 space-y-0.5">
                <div className="font-bold text-slate-800 text-xs">Bank Details for Advance Remittance:</div>
                <div><span className="text-slate-500">Bank:</span> {company.bank_name}</div>
                {company.iban && <div><span className="text-slate-500">IBAN:</span> <span className="font-mono font-bold text-slate-900">{company.iban}</span></div>}
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="flex justify-between py-2 px-3 bg-slate-50/60 border-b border-slate-200">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-mono font-semibold">{fmtAED(proforma.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b border-slate-200">
                <span className="text-slate-600">VAT (5%):</span>
                <span className="font-mono font-semibold text-amber-700">{fmtAED(proforma.vat_amount)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-purple-50/60 border-b border-purple-200 font-bold text-slate-900 text-sm">
                <span>Total Amount:</span>
                <span className="font-mono text-purple-900">{fmtAED(proforma.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {proforma.notes && (
          <div className="my-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Remarks:</span> {proforma.notes}
          </div>
        )}

      <DocSignatureArea
        preparedByTitle="Finance / Accounts Dept."
        receivedByTitle="Authorized Signature & Stamp"
        date={proforma.proforma_date}
      />

      <DocFooter company={company} showBankDetails={true} />
        </>
      )}
    </DocumentContainer>
  );
}
