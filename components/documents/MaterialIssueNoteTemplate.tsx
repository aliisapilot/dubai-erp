"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate } from "@/lib/helpers";

export interface MaterialIssueNoteData {
  document_number: string;
  issue_date: string;
  customer_name: string;
  customer_type?: "existing" | "new" | "custom";
  project_name?: string | null;
  purpose: string;
  warehouse: string;
  issued_by: string;
  received_by?: string | null;
  items: {
    material_name: string;
    brand: string;
    specification?: string | null;
    width?: number | null;
    running_metres_used?: number | null;
    square_metres_used: number;
    wastage_quantity: number;
    total_deduction: number;
    unit_cost: number;
    total_cost: number;
  }[];
  total_square_metres: number;
  total_running_metres: number;
  total_wastage: number;
  total_deduction: number;
  total_material_cost: number;
  notes?: string | null;
}

type Props = {
  company: CompanyDocInfo | null;
  data: MaterialIssueNoteData;
  onClose?: () => void;
};

export default function MaterialIssueNoteTemplate({ company, data, onClose }: Props) {
  return (
    <DocumentContainer
      docTypeLabel="MATERIAL ISSUE NOTE"
      docNumber={data.document_number}
      onClose={onClose}
    >
      <div className="print-page bg-white p-8 text-slate-800 text-xs font-sans max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between">
        <div>
          {/* Header */}
          <DocHeader
            company={company}
            docTitle="MATERIAL ISSUE NOTE (MIN)"
            arabicTitle="إذن صرف مواد وقماش للمشروع"
            docNumber={data.document_number}
            docDate={fmtDate(data.issue_date)}
            clientOrSupplierLabel="Customer / For Whom"
            clientOrSupplierName={data.customer_name}
          />

          {/* Reference Info Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Target Project / Job</span>
              <span className="font-bold text-slate-900">{data.project_name || "General Workshop Usage"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Purpose of Usage</span>
              <span className="font-bold text-slate-900">{data.purpose}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Issuing Warehouse</span>
              <span className="font-bold text-slate-900">{data.warehouse}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Issued By Staff</span>
              <span className="font-bold text-slate-900">{data.issued_by}</span>
            </div>
          </div>

          {/* Issued Materials Table */}
          <div className="overflow-x-auto my-4">
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px]">
                  <th className="p-2 border border-slate-700 w-8 text-center">#</th>
                  <th className="p-2 border border-slate-700">Material &amp; Specification</th>
                  <th className="p-2 border border-slate-700 text-center">Width</th>
                  <th className="p-2 border border-slate-700 text-right">Used RM</th>
                  <th className="p-2 border border-slate-700 text-right bg-blue-950 font-bold">Used Area (m²)</th>
                  <th className="p-2 border border-slate-700 text-right bg-amber-950 font-bold">Wastage (m²)</th>
                  <th className="p-2 border border-slate-700 text-right bg-rose-950 font-bold">Total Stock Out</th>
                  <th className="p-2 border border-slate-700 text-right">Cost Rate</th>
                  <th className="p-2 border border-slate-700 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {data.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-2 border border-slate-300">
                      <span className="font-bold text-slate-900 block">{it.material_name}</span>
                      <span className="text-[10px] text-slate-500">
                        Brand: {it.brand} {it.specification ? `• ${it.specification}` : ""}
                      </span>
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-mono">
                      {it.width ? `${it.width} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {it.running_metres_used ? `${it.running_metres_used.toFixed(2)} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-blue-900 bg-blue-50/50">
                      {it.square_metres_used.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono text-amber-700 bg-amber-50/50">
                      {it.wastage_quantity > 0 ? `${it.wastage_quantity.toFixed(2)} m²` : "0.00 m²"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-rose-900 bg-rose-50/50">
                      {it.total_deduction.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {fmtAED(it.unit_cost)}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                      {fmtAED(it.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                  <td colSpan={3} className="p-2.5 border border-slate-300 text-right uppercase">
                    Total Material Consumed:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono">
                    {data.total_running_metres > 0 ? `${data.total_running_metres.toFixed(2)} m` : "—"}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-blue-900 bg-blue-100/60">
                    {data.total_square_metres.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-amber-800 bg-amber-100/60">
                    {data.total_wastage.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-rose-900 bg-rose-100/60 text-sm">
                    {data.total_deduction.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right text-xs">Total Cost:</td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-sm text-slate-950">
                    AED {fmtAED(data.total_material_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Purpose & Notes */}
          {data.notes && (
            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-[11px] my-3">
              <span className="font-bold text-slate-700 block mb-0.5">Instructions &amp; Cutting Notes:</span>
              <p className="text-slate-600 whitespace-pre-wrap">{data.notes}</p>
            </div>
          )}
        </div>

        {/* 3-Column Verification Signatures */}
        <div>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 my-6 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Issued &amp; Dispatched By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                {data.issued_by} (Storekeeper)
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Received &amp; Verified By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                {data.received_by || "Workshop Supervisor / Site Rep"}
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Authorized By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Production / Project Manager
              </div>
            </div>
          </div>

          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
