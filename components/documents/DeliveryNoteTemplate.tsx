"use client";

import { useEffect, useState } from "react";
import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";
import { DocumentLayout, createDefaultLayout, loadDocumentLayout } from "@/lib/documentDesigner";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import DocumentContainer from "./DocumentContainer";

export type DeliveryNoteItem = {
  id?: string;
  item_description?: string | null;
  product_name?: string | null;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  remarks?: string | null;
};

export type DeliveryNoteData = {
  id?: string;
  delivery_number: string;
  delivery_date: string;
  dispatch_date?: string | null;
  customer_name: string;
  customer_address?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  order_ref?: string | null;
  driver_name?: string | null;
  driver_number?: string | null;
  vehicle_number?: string | null;
  delivery_method?: string | null;
  notes?: string | null;
  receiver_name?: string | null;
  receiver_mobile?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  items: DeliveryNoteItem[];
};

type DeliveryNoteTemplateProps = {
  company: CompanyDocInfo | null;
  deliveryNote: DeliveryNoteData;
  onClose?: () => void;
};

export default function DeliveryNoteTemplate({
  company,
  deliveryNote,
  onClose,
}: DeliveryNoteTemplateProps) {
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("delivery_note"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "delivery_note").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const rendererData: MockDocumentData = {
    document_number: deliveryNote.delivery_number,
    document_date: deliveryNote.delivery_date,
    customer_name: deliveryNote.customer_name,
    customer_address: deliveryNote.customer_address || undefined,
    contact_person: deliveryNote.contact_person || deliveryNote.receiver_name || undefined,
    contact_number: deliveryNote.contact_number || deliveryNote.receiver_mobile || undefined,
    project_name: deliveryNote.project_name || undefined,
    project_number: deliveryNote.project_number || deliveryNote.order_ref || undefined,
    items: deliveryNote.items.map((it) => ({
      description: it.description || it.item_description || it.product_name || "Item",
      quantity: it.quantity,
      unit: it.unit || "Nos",
      unit_price: 0,
      vat_amount: 0,
      line_total: 0,
    })),
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    notes: deliveryNote.notes || undefined,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length);
  return (
    <DocumentContainer
      docTypeLabel="Delivery Note"
      docNumber={deliveryNote.delivery_number}
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
      {/* Letterhead Header */}
      <DocHeader
          company={company}
          docTitle="DELIVERY NOTE"
          arabicTitle="سند تسليم بضاعة"
          docNumber={deliveryNote.delivery_number}
          docDate={deliveryNote.dispatch_date || deliveryNote.delivery_date}
          subTitle="Goods Delivery & Site Dispatch Acknowledgement"
        />

        {/* Customer & Dispatch Logistics Grid */}
        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          {/* Left: Customer / Site Details */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1">
              Customer & Delivery Location (العميل وموقع التسليم):
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="font-bold text-sm text-slate-900">{deliveryNote.customer_name}</div>
              {deliveryNote.project_name && (
                <div className="text-[11px]"><span className="text-slate-500">Project / Job:</span> <span className="font-semibold text-slate-900">{deliveryNote.project_name}</span> {deliveryNote.project_number ? `(${deliveryNote.project_number})` : ""}</div>
              )}
              {deliveryNote.customer_address && (
                <div className="text-[11px]"><span className="text-slate-500">Address / Site:</span> {deliveryNote.customer_address}</div>
              )}
              {deliveryNote.contact_person && (
                <div className="text-[11px]"><span className="text-slate-500">Contact Person:</span> {deliveryNote.contact_person}</div>
              )}
              {deliveryNote.contact_number && (
                <div className="text-[11px]"><span className="text-slate-500">Contact Tel/Mob:</span> <span className="font-mono">{deliveryNote.contact_number}</span></div>
              )}
            </div>
          </div>

          {/* Right: Dispatch / Transport Details */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-2 border-b border-slate-200 pb-1">
              Dispatch & Transport Details (بيانات الشحن والسائق):
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-700">
              <div>
                <span className="text-slate-500 block text-[10px]">Dispatch Date:</span>
                <span className="font-semibold">
                  {deliveryNote.dispatch_date ? new Date(deliveryNote.dispatch_date).toLocaleDateString("en-GB") : new Date(deliveryNote.delivery_date).toLocaleDateString("en-GB")}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Order / Invoice Ref:</span>
                <span className="font-mono font-bold text-slate-800">{deliveryNote.order_ref || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Driver Name:</span>
                <span className="font-semibold text-slate-900">{deliveryNote.driver_name || "Company Driver"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Driver Mobile:</span>
                <span className="font-mono">{deliveryNote.driver_number || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Vehicle No:</span>
                <span className="font-mono font-bold text-slate-900">{deliveryNote.vehicle_number || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Delivery Method:</span>
                <span>{deliveryNote.delivery_method || "By Road"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-4 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Item Description (وصف المواد)</th>
                <th className="py-2.5 px-3 w-20 text-center">Unit (الوحدة)</th>
                <th className="py-2.5 px-3 w-24 text-center">Quantity (الكمية)</th>
                <th className="py-2.5 px-3 w-44">Remarks (ملاحظات)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {deliveryNote.items.map((item, index) => {
                const desc = item.item_description || item.product_name || item.description || `Item ${index + 1}`;
                return (
                  <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {desc}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-700">
                      {item.unit || "Nos"}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-900 text-sm">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {item.remarks || "—"}
                    </td>
                  </tr>
                );
              })}
              {deliveryNote.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No items recorded on this delivery note.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs text-slate-800">
                <td colSpan={3} className="py-2.5 px-3 text-right">
                  Total Items / Quantities:
                </td>
                <td className="py-2.5 px-3 text-center font-mono text-sm">
                  {deliveryNote.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)}
                </td>
                <td className="py-2.5 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* General Dispatch Notes */}
        {deliveryNote.notes && (
          <div className="mt-3 text-xs text-slate-600 rounded bg-slate-50 p-2.5 border border-slate-200">
            <span className="font-bold text-slate-800">Delivery Instructions / Remarks: </span>
            {deliveryNote.notes}
          </div>
        )}

        {/* Multi-party Signature & Receiver Acknowledgement */}
        <DocSignatureArea
          mode="delivery"
          companyName={company?.legal_name || company?.name}
          preparedBy="Dispatch Department"
          receiverName={deliveryNote.receiver_name}
          receiverMobile={deliveryNote.receiver_mobile}
        />

        {/* Footer */}
        <DocFooter
          notes="Goods once delivered in good condition cannot be returned without prior authorization."
          customText="Original: Customer Copy | Pink: Driver Copy | Yellow: Accounts Copy"
        />
        </>
      )}
    </DocumentContainer>
  );
}
