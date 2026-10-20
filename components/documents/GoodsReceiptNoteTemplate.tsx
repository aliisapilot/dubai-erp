"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate } from "@/lib/helpers";

export interface GoodsReceiptNoteData {
  document_number: string;
  receipt_date: string;
  supplier_name: string;
  supplier_invoice_ref?: string | null;
  purchase_order_ref?: string | null;
  warehouse: string;
  received_by?: string | null;
  items: {
    material_name: string;
    brand: string;
    specification?: string | null;
    width?: number | null;
    colour?: string | null;
    rolls_count?: number | null;
    running_metres?: number | null;
    square_metres: number;
    unit_rate: number;
    rate_unit: string;
    total_cost: number;
    batch_roll_ref?: string | null;
  }[];
  total_square_metres: number;
  total_running_metres: number;
  total_cost: number;
  notes?: string | null;
}

type Props = {
  company: CompanyDocInfo | null;
  data: GoodsReceiptNoteData;
  onClose?: () => void;
};

export default function GoodsReceiptNoteTemplate({ company, data, onClose }: Props) {
  return (
    <DocumentContainer
      docTypeLabel="GOODS RECEIPT NOTE"
      docNumber={data.document_number}
      onClose={onClose}
    >
      <div className="print-page bg-white p-8 text-slate-800 text-xs font-sans max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between">
        <div>
          {/* Official Letterhead Header */}
          <DocHeader
            company={company}
            docTitle="GOODS RECEIPT NOTE (GRN)"
            arabicTitle="سند استلام بضاعة ومواد"
            docNumber={data.document_number}
            docDate={fmtDate(data.receipt_date)}
            clientOrSupplierLabel="Supplier / Vendor"
            clientOrSupplierName={data.supplier_name}
          />

          {/* Reference Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Warehouse Location</span>
              <span className="font-bold text-slate-900">{data.warehouse}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Supplier Invoice / Ref</span>
              <span className="font-bold text-slate-900">{data.supplier_invoice_ref || "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Purchase Order</span>
              <span className="font-bold text-slate-900">{data.purchase_order_ref || "Direct GRN"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Received By Staff</span>
              <span className="font-bold text-slate-900">{data.received_by || "Warehouse In-charge"}</span>
            </div>
          </div>

          {/* Received Materials Table */}
          <div className="overflow-x-auto my-4">
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px]">
                  <th className="p-2 border border-slate-700 w-8 text-center">#</th>
                  <th className="p-2 border border-slate-700">Material &amp; Brand</th>
                  <th className="p-2 border border-slate-700">Specification / Colour</th>
                  <th className="p-2 border border-slate-700 text-center">Width</th>
                  <th className="p-2 border border-slate-700 text-right">Rolls</th>
                  <th className="p-2 border border-slate-700 text-right">Running M</th>
                  <th className="p-2 border border-slate-700 text-right bg-emerald-950/80 font-bold">Square M (m²)</th>
                  <th className="p-2 border border-slate-700 text-right">Rate (AED)</th>
                  <th className="p-2 border border-slate-700 text-right">Total (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {data.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-2 border border-slate-300">
                      <span className="font-bold text-slate-900 block">{it.material_name}</span>
                      <span className="text-[10px] text-slate-500">{it.brand}</span>
                    </td>
                    <td className="p-2 border border-slate-300">
                      <span>{it.specification || "Standard"}</span>
                      {it.colour && <span className="block text-slate-500">Colour: {it.colour}</span>}
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-mono">
                      {it.width ? `${it.width} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {it.rolls_count ? `${it.rolls_count} R` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {it.running_metres ? `${it.running_metres.toFixed(2)} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50/50">
                      {it.square_metres.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {fmtAED(it.unit_rate)}
                      <span className="text-[9px] text-slate-500 block">/{it.rate_unit.replace("per_", "")}</span>
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                      {fmtAED(it.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                  <td colSpan={5} className="p-2.5 border border-slate-300 text-right uppercase">
                    Total Received Quantities:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono">
                    {data.total_running_metres > 0 ? `${data.total_running_metres.toFixed(2)} m` : "—"}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-emerald-800 bg-emerald-100/60 text-sm">
                    {data.total_square_metres.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right text-xs">Total Cost:</td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-sm text-slate-950">
                    AED {fmtAED(data.total_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {data.notes && (
            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-[11px] my-3">
              <span className="font-bold text-slate-700 block mb-0.5">Remarks / Inspection Notes:</span>
              <p className="text-slate-600 whitespace-pre-wrap">{data.notes}</p>
            </div>
          )}
        </div>

        {/* 3-Column Formal Verification Signatures */}
        <div>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 my-6 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Delivered / Handed Over By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Supplier Driver / Representative
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Received &amp; Inspected By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                {data.received_by || "Warehouse In-charge"}
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Authorized By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Operations Manager
              </div>
            </div>
          </div>

          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
