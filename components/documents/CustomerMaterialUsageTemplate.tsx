"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate, todayISO } from "@/lib/helpers";

export interface CustomerMaterialUsageData {
  customer_name: string;
  statement_date: string;
  date_from?: string;
  date_to?: string;
  project_filter?: string | null;
  items: {
    issue_date: string;
    reference_number: string;
    project_name?: string | null;
    material_name: string;
    brand: string;
    width?: number | null;
    running_metres?: number | null;
    square_metres: number;
    wastage_quantity?: number | null;
    unit_rate: number;
    total_cost: number;
    purpose?: string | null;
  }[];
  total_square_metres: number;
  total_running_metres: number;
  total_wastage: number;
  total_cost: number;
  brand_summary: {
    brand: string;
    square_metres: number;
    cost: number;
  }[];
}

type Props = {
  company: CompanyDocInfo | null;
  data: CustomerMaterialUsageData;
  onClose?: () => void;
};

export default function CustomerMaterialUsageTemplate({ company, data, onClose }: Props) {
  const periodText =
    data.date_from || data.date_to
      ? `${data.date_from ? fmtDate(data.date_from) : "Start"} to ${data.date_to ? fmtDate(data.date_to) : "Present"}`
      : "All Historical Movements";

  return (
    <DocumentContainer
      docTypeLabel="CUSTOMER MATERIAL STATEMENT"
      docNumber={data.customer_name}
      onClose={onClose}
    >
      <div className="print-page bg-white p-8 text-slate-800 text-xs font-sans max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between">
        <div>
          {/* Header */}
          <DocHeader
            company={company}
            docTitle="CUSTOMER MATERIAL CONSUMPTION STATEMENT"
            arabicTitle="كشف استهلاك القماش والمواد للعميل"
            docNumber={`STMT-${todayISO().replace(/-/g, "")}`}
            docDate={fmtDate(data.statement_date)}
            clientOrSupplierLabel="Customer / Client"
            clientOrSupplierName={data.customer_name}
          />

          {/* Statement Meta Card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Statement Period</span>
              <span className="font-bold text-slate-900">{periodText}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Project Filter</span>
              <span className="font-bold text-slate-900">{data.project_filter || "All Projects & Orders"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Material Issued</span>
              <span className="font-bold text-blue-700 font-mono text-sm">
                {data.total_square_metres.toFixed(2)} m²
              </span>
            </div>
          </div>

          {/* Detailed Usage Table */}
          <div className="overflow-x-auto my-4">
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px]">
                  <th className="p-2 border border-slate-700">Date</th>
                  <th className="p-2 border border-slate-700">Ref / Note</th>
                  <th className="p-2 border border-slate-700">Project / Job</th>
                  <th className="p-2 border border-slate-700">Material &amp; Brand</th>
                  <th className="p-2 border border-slate-700 text-center">Width</th>
                  <th className="p-2 border border-slate-700 text-right">RM</th>
                  <th className="p-2 border border-slate-700 text-right bg-blue-950 font-bold">Square M (m²)</th>
                  <th className="p-2 border border-slate-700 text-right">Rate</th>
                  <th className="p-2 border border-slate-700 text-right">Total (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-400">
                      No material consumption records found for this customer and period.
                    </td>
                  </tr>
                ) : (
                  data.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-300 whitespace-nowrap">{fmtDate(it.issue_date)}</td>
                      <td className="p-2 border border-slate-300 font-mono text-[10px] font-semibold text-slate-700">
                        {it.reference_number}
                      </td>
                      <td className="p-2 border border-slate-300 text-slate-700">
                        {it.project_name || it.purpose || "Direct Issue"}
                      </td>
                      <td className="p-2 border border-slate-300">
                        <span className="font-bold text-slate-900 block">{it.material_name}</span>
                        <span className="text-[10px] text-slate-500">{it.brand}</span>
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-mono">
                        {it.width ? `${it.width} m` : "—"}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-mono">
                        {it.running_metres ? `${it.running_metres.toFixed(2)} m` : "—"}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-mono font-bold text-blue-900 bg-blue-50/50">
                        {it.square_metres.toFixed(2)} m²
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-mono">
                        {fmtAED(it.unit_rate)}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                        {fmtAED(it.total_cost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                  <td colSpan={5} className="p-2.5 border border-slate-300 text-right uppercase">
                    Customer Grand Totals:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono">
                    {data.total_running_metres > 0 ? `${data.total_running_metres.toFixed(2)} m` : "—"}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-blue-900 bg-blue-100/60 text-sm">
                    {data.total_square_metres.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right text-xs">Total:</td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-sm text-slate-950">
                    AED {fmtAED(data.total_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Brand-Wise Consumption Summary */}
          {data.brand_summary.length > 0 && (
            <div className="my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">
                Brand-Wise Consumption Summary:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {data.brand_summary.map((bs, bIdx) => (
                  <div key={bIdx} className="p-2 bg-white rounded border border-slate-200">
                    <span className="font-bold text-slate-800 block text-xs">{bs.brand}</span>
                    <span className="font-mono text-blue-700 font-semibold block text-sm mt-0.5">
                      {bs.square_metres.toFixed(2)} m²
                    </span>
                    <span className="text-[10px] text-slate-500">AED {fmtAED(bs.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Signatures & Footer */}
        <div>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 my-6 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Prepared By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Accounts / Store Controller
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Verified By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Technical Manager
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Customer Acknowledgment</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Authorized Client Representative
              </div>
            </div>
          </div>

          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
