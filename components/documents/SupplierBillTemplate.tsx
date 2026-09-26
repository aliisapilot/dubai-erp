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

export type SupplierBillLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
};

export type SupplierBillData = {
  id?: string;
  bill_number: string;
  bill_date: string;
  due_date?: string | null;
  supplier_name: string;
  supplier_trn?: string | null;
  supplier_address?: string | null;
  supplier_invoice_ref?: string | null;
  po_number?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  notes?: string | null;
  status?: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  paid_amount?: number;
  items: SupplierBillLineItem[];
};

type BillProps = {
  company: CompanyDocInfo | null;
  bill: SupplierBillData;
  onClose?: () => void;
};

export default function SupplierBillTemplate({
  company,
  bill,
  onClose,
}: BillProps) {
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("supplier_bill"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "supplier_bill").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const rendererData: MockDocumentData = {
    document_number: bill.bill_number,
    document_date: bill.bill_date,
    due_date: bill.due_date || undefined,
    status: bill.status || undefined,
    customer_name: bill.supplier_name,
    customer_trn: bill.supplier_trn || undefined,
    customer_address: bill.supplier_address || undefined,
    supplier_name: bill.supplier_name,
    project_name: bill.project_name || undefined,
    project_number: bill.project_number || bill.supplier_invoice_ref || bill.po_number || undefined,
    items: bill.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      vat_amount: it.vat_amount,
      line_total: it.line_total,
    })),
    subtotal: bill.subtotal,
    vat_amount: bill.vat_amount,
    total_amount: bill.total_amount,
    advance_amount: bill.paid_amount,
    notes: bill.notes || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items);
  const paid = Number(bill.paid_amount) || 0;
  const balance = Math.max(0, bill.total_amount - paid);

  return (
    <DocumentContainer
      docTypeLabel="Supplier Bill"
      docNumber={bill.bill_number}
      status={bill.status}
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
          docTitle="SUPPLIER BILL"
          arabicTitle="فاتورة مورد"
          docNumber={bill.bill_number}
          docDate={bill.bill_date}
        />

        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Vendor Details (بيانات المورد):</span>
              <span className="text-slate-400 font-normal">Payee</span>
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{bill.supplier_name}</div>
              {bill.supplier_trn && (
                <div><span className="text-slate-500">TRN:</span> <span className="font-mono font-bold text-slate-900">{bill.supplier_trn}</span></div>
              )}
              {bill.supplier_address && (
                <div><span className="text-slate-500">Address:</span> {bill.supplier_address}</div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1 flex justify-between">
              <span>Bill References:</span>
              <span className="text-indigo-700 font-semibold font-mono">{bill.bill_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-500">Bill Date:</span>
                <div className="font-semibold text-slate-900">{fmtDate(bill.bill_date)}</div>
              </div>
              {bill.due_date && (
                <div>
                  <span className="text-slate-500">Due Date:</span>
                  <div className="font-semibold text-slate-900">{fmtDate(bill.due_date)}</div>
                </div>
              )}
              {bill.supplier_invoice_ref && (
                <div>
                  <span className="text-slate-500">Vendor Inv #:</span>
                  <div className="font-semibold text-slate-900">{bill.supplier_invoice_ref}</div>
                </div>
              )}
              {bill.po_number && (
                <div>
                  <span className="text-slate-500">PO Ref:</span>
                  <div className="font-semibold text-slate-900">{bill.po_number}</div>
                </div>
              )}
              {bill.project_number && (
                <div className="col-span-2 mt-1 pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">Project:</span>
                  <div className="font-bold text-slate-900">{bill.project_number} {bill.project_name ? `— ${bill.project_name}` : ""}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="my-3 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-3">Description (البيان)</th>
                <th className="py-2 px-2 text-center w-14">Qty</th>
                <th className="py-2 px-2 text-center w-14">Unit</th>
                <th className="py-2 px-2 text-right w-24">Rate (AED)</th>
                <th className="py-2 px-2 text-right w-20">VAT (5%)</th>
                <th className="py-2 px-3 text-right w-28">Total (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {bill.items.map((item, idx) => (
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

        <div className="grid grid-cols-12 gap-4 my-4">
          <div className="col-span-7 space-y-2 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3 space-y-1.5">
              <div className="font-semibold text-slate-800">Amount in Words:</div>
              <div className="text-slate-700 italic font-medium">{numberToWordsEnglish(bill.total_amount)}</div>
              <div className="text-slate-800 font-arabic text-right dir-rtl font-semibold text-[13px] pt-1 border-t border-slate-200/60">
                {numberToWordsArabic(bill.total_amount)}
              </div>
            </div>
            {bill.notes && (
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Remarks:</span> {bill.notes}
              </div>
            )}
          </div>

          <div className="col-span-5">
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="flex justify-between py-2 px-3 bg-slate-50/60 border-b border-slate-200">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-mono font-semibold">{fmtAED(bill.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b border-slate-200">
                <span className="text-slate-600">VAT Total (5%):</span>
                <span className="font-mono font-semibold text-amber-700">{fmtAED(bill.vat_amount)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-indigo-50/60 border-b border-indigo-200 font-bold text-slate-900 text-sm">
                <span>Total Payable:</span>
                <span className="font-mono text-indigo-900">{fmtAED(bill.total_amount)}</span>
              </div>
              {paid > 0 && (
                <>
                  <div className="flex justify-between py-2 px-3 border-b border-slate-200 text-slate-600">
                    <span>Paid / Disbursed:</span>
                    <span className="font-mono text-emerald-700">-{fmtAED(paid)}</span>
                  </div>
                  <div className="flex justify-between py-2 px-3 bg-slate-100 font-bold text-slate-900">
                    <span>Outstanding Balance:</span>
                    <span className="font-mono">{fmtAED(balance)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

      <DocSignatureArea
        preparedByTitle="Accounts Payable"
        receivedByTitle="Finance Manager Approval"
        signatureSrc={company?.signature_url || undefined}
        stampSrc={company?.stamp_url || undefined}
        date={bill.bill_date}
      />

      <DocFooter company={company} showBankDetails={false} />
        </>
      )}
    </DocumentContainer>
  );
}
