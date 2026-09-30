"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate } from "@/lib/helpers";
import {
  MeasurementRowCalculated,
  MeasurementSheetSummary,
} from "@/lib/measurementTypes";
import { formatResultWithUnit } from "@/lib/measurementCalculations";

export type MeasurementSheetDocData = {
  id?: string;
  sheet_number: string;
  sheet_date: string;
  title: string;
  customer_name?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  notes?: string | null;
  items: MeasurementRowCalculated[];
  summary: MeasurementSheetSummary;
};

interface MeasurementSheetTemplateProps {
  company: CompanyDocInfo | null;
  data: MeasurementSheetDocData;
  scale?: number;
}

export default function MeasurementSheetTemplate({
  company,
  data,
}: MeasurementSheetTemplateProps) {
  const { summary } = data;

  return (
    <DocumentContainer
      docNumber={data.sheet_number}
      docTypeLabel="MEASUREMENT TAKEOFF"
      company={company}
    >
      <div className="flex min-h-[1050px] flex-col justify-between p-4 text-slate-800 bg-white font-sans text-xs">
        <div>
          {/* Official Company Header */}
          <DocHeader company={company} docTitle="MEASUREMENT & TAKEOFF SHEET" docNumber={data.sheet_number} />

          {/* Document Reference Info */}
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sheet Title</p>
              <p className="font-bold text-slate-900 text-sm">{data.title || "Fabrication & Takeoff Sheet"}</p>
              {data.project_name && (
                <p className="text-slate-600 mt-1">
                  <span className="font-medium text-slate-500">Project: </span>
                  {data.project_name} {data.project_number ? `(${data.project_number})` : ""}
                </p>
              )}
              {data.customer_name && (
                <p className="text-slate-600">
                  <span className="font-medium text-slate-500">Client: </span>
                  {data.customer_name}
                </p>
              )}
            </div>

            <div className="text-right">
              <div className="inline-block text-left">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sheet Number</p>
                <p className="font-bold text-emerald-700 text-sm font-mono">{data.sheet_number}</p>
                <p className="text-slate-600 mt-1">
                  <span className="font-medium text-slate-500">Date: </span>
                  {fmtDate(data.sheet_date)}
                </p>
              </div>
            </div>
          </div>

          {/* Measurements Table */}
          <div className="mb-6 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="bg-slate-900 text-white font-medium text-[10px] uppercase tracking-wider">
                  <th className="py-2.5 px-2 text-center w-8">#</th>
                  <th className="py-2.5 px-3">Area / Ref</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2 text-center">Dimensions</th>
                  <th className="py-2.5 px-2 text-center">Qty</th>
                  <th className="py-2.5 px-3">Calculation Type & Formula</th>
                  <th className="py-2.5 px-3 text-right">Result & Unit</th>
                  <th className="py-2.5 px-2 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {item.area_name || `Area ${idx + 1}`}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div>{item.description || "Measurement item"}</div>
                      {item.notes && <div className="text-[9px] text-slate-400 italic mt-0.5">{item.notes}</div>}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600 whitespace-nowrap font-mono text-[10px]">
                      {item.calc_type === "quantity_only" ? (
                        "—"
                      ) : (
                        <div>
                          <div>L: {item.length_entered} {item.dim_unit} ({item.length_m.toFixed(3)}m)</div>
                          {item.calc_type !== "linear" && (
                            <div>
                              {item.is_variable_width && item.width2_m !== undefined
                                ? `W: avg ${item.average_width_m?.toFixed(3)}m`
                                : `W: ${item.width_entered} ${item.dim_unit}`}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center font-semibold text-slate-900">
                      {item.quantity} pcs
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="font-medium text-slate-800 text-[10px]">
                        {item.calc_type === "pvc_edge_joint"
                          ? "PVC Edge + Centre Joint"
                          : item.calc_type === "linear"
                          ? "Linear Length"
                          : item.calc_type === "area"
                          ? "Surface Area"
                          : item.calc_type === "perimeter"
                          ? "Perimeter"
                          : item.calc_type === "quantity_only"
                          ? "Item Count"
                          : "Custom Formula"}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 truncate max-w-[200px]" title={item.formula_display}>
                        {item.formula_display}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-800 whitespace-nowrap">
                      {formatResultWithUnit(item.calculated_total, item.result_unit)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600 font-mono text-[10px] whitespace-nowrap">
                      {item.rate > 0 ? `${fmtAED(item.rate)} / ${item.result_unit}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900 font-mono whitespace-nowrap">
                      {item.total_cost > 0 ? fmtAED(item.total_cost) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unit-Safe Summary Card (Separates m, m², and pcs) */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Notes & Explanation */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
              <h4 className="font-semibold text-slate-800 text-xs mb-1.5 uppercase tracking-wider">
                Measurement Notes & Compliance
              </h4>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                All dimensions normalized to metric standard (1000 mm = 1 m). Linear measurements (m), surface areas
                (m²), and counts (pcs) are strictly segregated to avoid unit mixing. Fabrications conform to approved shop
                drawings and engineering specifications.
              </p>
              {data.notes && (
                <div className="mt-2 text-[10px] text-slate-700 border-t border-slate-200 pt-2">
                  <span className="font-semibold">Project Notes: </span>
                  {data.notes}
                </div>
              )}
            </div>

            {/* Separated Totals */}
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm space-y-2">
              <h4 className="font-bold text-slate-900 text-xs border-b border-slate-100 pb-1.5 uppercase tracking-wider">
                Measurement Summary
              </h4>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Total Pieces (Count):</span>
                <span className="font-bold font-mono text-slate-900">{summary.totalPieces} pcs</span>
              </div>

              {summary.totalLinearM > 0 && (
                <div className="flex justify-between items-center text-xs bg-emerald-50/70 px-2 py-1 rounded border border-emerald-100">
                  <span className="text-emerald-900 font-semibold">Total Linear Metres:</span>
                  <span className="font-bold font-mono text-emerald-800 text-sm">
                    {summary.totalLinearM.toFixed(3)} m
                  </span>
                </div>
              )}

              {summary.totalAreaM2 > 0 && (
                <div className="flex justify-between items-center text-xs bg-blue-50/70 px-2 py-1 rounded border border-blue-100">
                  <span className="text-blue-900 font-semibold">Total Square Metres (Area):</span>
                  <span className="font-bold font-mono text-blue-800 text-sm">
                    {summary.totalAreaM2.toFixed(3)} m²
                  </span>
                </div>
              )}

              {summary.totalCostAED > 0 && (
                <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-1.5">
                  <span className="text-slate-900 font-bold uppercase">Total Estimated Cost:</span>
                  <span className="font-black font-mono text-slate-900 text-base">
                    {fmtAED(summary.totalCostAED)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Area Breakdown Summary Box */}
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/30 p-3">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Area-by-Area Breakdown</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {summary.areaSummary.map((a, i) => (
                <div key={i} className="bg-white p-2 rounded border border-slate-200 text-center">
                  <p className="font-semibold text-slate-800 text-[11px] truncate">{a.area_name}</p>
                  <p className="text-[10px] text-slate-500">{a.quantity} pcs</p>
                  <p className="font-bold font-mono text-emerald-700 text-xs mt-0.5">
                    {formatResultWithUnit(a.calculated_total, a.result_unit)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          {/* Signatures */}
          <DocSignatureArea
            mode="standard"
            preparedByTitle="Prepared By (Estimator / Engineer)"
            receivedByTitle="Approved By (Project Manager / Client)"
          />

          {/* Official Footer */}
          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
