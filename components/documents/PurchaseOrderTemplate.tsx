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

export type POLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
};

export type PurchaseOrderData = {
  id?: string;
  po_number: string;
  po_date: string;
  supplier_name: string;
  supplier_trn?: string | null;
  supplier_address?: string | null;
  vendor_reference?: string | null;
  vendor_contact?: string | null;
  vendor_mobile?: string | null;
  vendor_email?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  terms_conditions?: string | null;
  notes?: string | null;
  status?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  items: POLineItem[];
};

type POProps = {
  company: CompanyDocInfo | null;
  po: PurchaseOrderData;
  onClose?: () => void;
};

export default function PurchaseOrderTemplate({
  company,
  po,
  onClose,
}: POProps) {
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("purchase_order"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "purchase_order").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const rendererData: MockDocumentData = {
    document_number: po.po_number,
    document_date: po.po_date,
    status: po.status || undefined,
    customer_name: po.supplier_name,
    customer_trn: po.supplier_trn || undefined,
    customer_address: po.supplier_address || undefined,
    supplier_name: po.supplier_name,
    contact_person: po.vendor_contact || undefined,
    contact_number: po.vendor_mobile || undefined,
    project_name: po.project_name || undefined,
    project_number: po.project_number || po.vendor_reference || undefined,
    items: po.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      vat_amount: it.vat_amount,
      line_total: it.line_total,
    })),
    subtotal: po.subtotal,
    vat_amount: po.vat_amount,
    total_amount: po.total_amount,
    payment_terms: po.payment_terms || undefined,
    notes: po.notes || po.terms_conditions || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length);
  return (
    <DocumentContainer
      docTypeLabel="Purchase Order"
      docNumber={po.po_number}
      status={po.status}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
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
          docTitle="PURCHASE ORDER"
          arabicTitle="أمر شراء رسمي"
          docNumber={po.po_number}
          docDate={po.po_date}
          subTitle="Official Vendor Purchase Order & Supply Agreement"
        />

        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Vendor / Supplier (المورد):</span>
              <span className="text-slate-400 font-normal">Supplier</span>
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{po.supplier_name}</div>
              {po.supplier_trn && (
                <div><span className="text-slate-500">TRN:</span> <span className="font-mono font-bold text-slate-900">{po.supplier_trn}</span></div>
              )}
              {po.supplier_address && (
                <div><span className="text-slate-500">Address:</span> {po.supplier_address}</div>
              )}
              {po.vendor_contact && (
                <div><span className="text-slate-500">Contact:</span> {po.vendor_contact} {po.vendor_mobile ? `(${po.vendor_mobile})` : ""}</div>
              )}
              {po.vendor_email && (
                <div><span className="text-slate-500">Email:</span> {po.vendor_email}</div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Order Details (بيانات الأمر):</span>
              <span className="text-blue-700 font-semibold font-mono">{po.po_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Date:</span>
                <div className="font-semibold text-slate-900">{fmtDate(po.po_date)}</div>
              </div>
              {po.vendor_reference && (
                <div>
                  <span className="text-slate-500">Quote / Ref:</span>
                  <div className="font-semibold text-slate-900">{po.vendor_reference}</div>
                </div>
              )}
              {po.payment_terms && (
                <div>
                  <span className="text-slate-500">Payment Terms:</span>
                  <div className="font-semibold text-slate-900">{po.payment_terms}</div>
                </div>
              )}
              {po.delivery_terms && (
                <div>
                  <span className="text-slate-500">Delivery Terms:</span>
                  <div className="font-semibold text-slate-900">{po.delivery_terms}</div>
                </div>
              )}
              {po.project_number && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">For Project / Site:</span>
                  <div className="font-bold text-slate-900">{po.project_number} {po.project_name ? `— ${po.project_name}` : ""}</div>
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
                <th className="py-2 px-3">Item &amp; Specifications (المواصفات والبنود)</th>
                <th className="py-2 px-2 text-center w-14">Qty</th>
                <th className="py-2 px-2 text-center w-14">Unit</th>
                <th className="py-2 px-2 text-right w-24">Rate (AED)</th>
                <th className="py-2 px-2 text-right w-20">VAT (5%)</th>
                <th className="py-2 px-3 text-right w-28">Total (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {po.items.map((item, idx) => (
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

        {/* Totals & Words */}
        <div className="grid grid-cols-12 gap-4 my-4">
          <div className="col-span-7 space-y-2 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-slate-800">Amount in Words:</div>
              <div className="text-slate-700 italic font-medium">{numberToWordsEnglish(po.total_amount)}</div>
              <div className="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[13px] pt-1 border-t border-slate-200/60">
                {numberToWordsArabic(po.total_amount)}
              </div>
            </div>

            {po.terms_conditions && (
              <div className="rounded border border-slate-200 bg-slate-50/30 p-2.5 text-[11px] text-slate-600">
                <div className="font-bold text-slate-800 text-xs mb-1">Purchasing Terms &amp; Conditions:</div>
                <div className="whitespace-pre-line leading-relaxed">{po.terms_conditions}</div>
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="flex justify-between py-2 px-3 bg-slate-50/60 border-b border-slate-200">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-mono font-semibold">{fmtAED(po.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b border-slate-200">
                <span className="text-slate-600">VAT (5%):</span>
                <span className="font-mono font-semibold text-amber-700">{fmtAED(po.vat_amount)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-blue-50/60 border-b border-blue-200 font-bold text-slate-900 text-sm">
                <span>Grand Total:</span>
                <span className="font-mono text-blue-900">{fmtAED(po.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {po.notes && (
          <div className="my-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Special Instructions:</span> {po.notes}
          </div>
        )}

      <DocSignatureArea
        preparedByTitle="Procurement Officer / Purchasing Dept."
        receivedByTitle="Authorized Approval & Stamp"
        date={po.po_date}
      />

      <DocFooter company={company} showBankDetails={false} />
        </>
      )}
    </DocumentContainer>
  );
}
