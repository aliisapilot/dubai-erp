"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate } from "@/lib/helpers";

export interface ProjectMaterialConsumptionData {
  project_number: string;
  project_name: string;
  customer_name: string;
  location?: string | null;
  report_date: string;
  materials_summary: {
    material_name: string;
    brand: string;
    specification?: string | null;
    width?: number | null;
    total_rm_used: number;
    total_sqm_used: number;
    total_wastage_sqm: number;
    unit_cost: number;
    total_cost: number;
  }[];
  movement_history: {
    issue_date: string;
    reference_number: string;
    material_name: string;
    sqm_used: number;
    wastage_sqm: number;
    total_cost: number;
    issued_by: string;
  }[];
  total_actual_sqm: number;
  total_actual_rm: number;
  total_wastage_sqm: number;
  total_actual_cost: number;
}

type Props = {
  company: CompanyDocInfo | null;
  data: ProjectMaterialConsumptionData;
  onClose?: () => void;
};

export default function ProjectMaterialConsumptionTemplate({ company, data, onClose }: Props) {
  return (
    <DocumentContainer
      docTypeLabel="PROJECT MATERIAL REPORT"
      docNumber={data.project_number}
      onClose={onClose}
    >
      <div className="print-page bg-white p-8 text-slate-800 text-xs font-sans max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between">
        <div>
          {/* Header */}
          <DocHeader
            company={company}
            docTitle="PROJECT MATERIAL CONSUMPTION REPORT"
            arabicTitle="تقرير استهلاك المواد والقماش للمشروع"
            docNumber={data.project_number}
            docDate={fmtDate(data.report_date)}
            clientOrSupplierLabel="Customer / Client"
            clientOrSupplierName={data.customer_name}
          />

          {/* Project Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Project Name</span>
              <span className="font-bold text-slate-900">{data.project_name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Site Location</span>
              <span className="font-bold text-slate-900">{data.location || "Dubai / UAE Site"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Fabric Area Consumed</span>
              <span className="font-bold text-blue-700 font-mono text-sm">
                {data.total_actual_sqm.toFixed(2)} m²
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Material Cost</span>
              <span className="font-bold text-slate-950 font-mono text-sm">
                AED {fmtAED(data.total_actual_cost)}
              </span>
            </div>
          </div>

          {/* Material Consumption Summary Table */}
          <div className="my-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              1. Materials Consumed Breakdown:
            </h4>
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px]">
                  <th className="p-2 border border-slate-700 w-8 text-center">#</th>
                  <th className="p-2 border border-slate-700">Material &amp; Brand</th>
                  <th className="p-2 border border-slate-700 text-center">Width</th>
                  <th className="p-2 border border-slate-700 text-right">Used RM</th>
                  <th className="p-2 border border-slate-700 text-right bg-blue-950 font-bold">Used Area (m²)</th>
                  <th className="p-2 border border-slate-700 text-right bg-amber-950 font-bold">Wastage (m²)</th>
                  <th className="p-2 border border-slate-700 text-right">Unit Rate</th>
                  <th className="p-2 border border-slate-700 text-right">Material Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {data.materials_summary.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-2 border border-slate-300 font-bold text-slate-900">
                      {m.material_name}
                      <span className="text-[10px] text-slate-500 block font-normal">{m.brand} {m.specification ? `• ${m.specification}` : ""}</span>
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-mono">
                      {m.width ? `${m.width} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {m.total_rm_used > 0 ? `${m.total_rm_used.toFixed(2)} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-blue-900 bg-blue-50/50">
                      {m.total_sqm_used.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono text-amber-700 bg-amber-50/50">
                      {m.total_wastage_sqm.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {fmtAED(m.unit_cost)}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold">
                      {fmtAED(m.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                  <td colSpan={3} className="p-2.5 border border-slate-300 text-right uppercase">
                    Project Actual Totals:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono">
                    {data.total_actual_rm > 0 ? `${data.total_actual_rm.toFixed(2)} m` : "—"}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-blue-900 bg-blue-100/60 text-sm">
                    {data.total_actual_sqm.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-amber-800 bg-amber-100/60 text-sm">
                    {data.total_wastage_sqm.toFixed(2)} m²
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right text-xs">Total:</td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-sm text-slate-950">
                    AED {fmtAED(data.total_actual_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Issue History Table */}
          {data.movement_history.length > 0 && (
            <div className="my-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                2. Material Issue Notes (MIN) Dispatch History:
              </h4>
              <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-[10px]">
                    <th className="p-1.5 border border-slate-700">Date</th>
                    <th className="p-1.5 border border-slate-700">MIN Ref</th>
                    <th className="p-1.5 border border-slate-700">Material</th>
                    <th className="p-1.5 border border-slate-700 text-right">Area (m²)</th>
                    <th className="p-1.5 border border-slate-700 text-right">Wastage (m²)</th>
                    <th className="p-1.5 border border-slate-700 text-right">Cost (AED)</th>
                    <th className="p-1.5 border border-slate-700">Issued By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.movement_history.map((h, hIdx) => (
                    <tr key={hIdx}>
                      <td className="p-1.5 border border-slate-300">{fmtDate(h.issue_date)}</td>
                      <td className="p-1.5 border border-slate-300 font-mono font-bold text-slate-900">{h.reference_number}</td>
                      <td className="p-1.5 border border-slate-300">{h.material_name}</td>
                      <td className="p-1.5 border border-slate-300 text-right font-mono font-bold text-blue-900">{h.sqm_used.toFixed(2)} m²</td>
                      <td className="p-1.5 border border-slate-300 text-right font-mono text-amber-700">{h.wastage_sqm.toFixed(2)} m²</td>
                      <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">{fmtAED(h.total_cost)}</td>
                      <td className="p-1.5 border border-slate-300 text-slate-600">{h.issued_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verification Signatures */}
        <div>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 my-6 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Storekeeper / Dispatcher</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Warehouse In-Charge
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Site Engineer / QS</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Project Engineer
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Approved By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Project Manager
              </div>
            </div>
          </div>

          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
