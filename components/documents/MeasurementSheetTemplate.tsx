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
      totalPages={1}
    >
      <div className="text-slate-800 bg-white font-sans text-xs">
        {/* Official Company Header */}
        <DocHeader company={company} docTitle="MEASUREMENT & TAKEOFF SHEET" docNumber={data.sheet_number} />

        {/* Document Reference Info */}
        <div className="mb-2 grid grid-cols-2 gap-3 rounded border border-slate-200 bg-slate-50/70 p-2 text-xs">
          <div>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sheet Title</p>
            <p className="font-bold text-slate-900 text-xs">{data.title || "Fabrication & Takeoff Sheet"}</p>
            {data.project_name && (
              <p className="text-slate-600 text-[10px] mt-0.5">
                <span className="font-medium text-slate-500">Project: </span>
                {data.project_name} {data.project_number ? `(${data.project_number})` : ""}
              </p>
            )}
            {data.customer_name && (
              <p className="text-slate-600 text-[10px]">
                <span className="font-medium text-slate-500">Client: </span>
                {data.customer_name}
              </p>
            )}
          </div>

          <div className="text-right">
            <div className="inline-block text-left">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sheet Number</p>
              <p className="font-bold text-emerald-700 text-xs font-mono">{data.sheet_number}</p>
              <p className="text-slate-600 text-[10px] mt-0.5">
                <span className="font-medium text-slate-500">Date: </span>
                {fmtDate(data.sheet_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Measurements Table */}
        <div className="mb-2 overflow-hidden rounded border border-slate-200">
          <table className="w-full table-fixed border-collapse text-left text-[9.5px]">
            <colgroup>
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "8.5%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-900 text-white font-semibold text-[8.5px] uppercase tracking-wider">
                <th className="py-1 px-1 text-center">#</th>
                <th className="py-1 px-1.5 whitespace-nowrap">Area / Ref</th>
                <th className="py-1 px-2">Description</th>
                <th className="py-1 px-1 text-center whitespace-nowrap">Dimensions</th>
                <th className="py-1 px-1 text-center whitespace-nowrap">Qty</th>
                <th className="py-1 px-2">Calculation Type & Formula</th>
                <th className="py-1 px-1.5 text-right whitespace-nowrap">Result & Unit</th>
                <th className="py-1 px-1.5 text-right whitespace-nowrap">Rate</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item, idx) => (
                <tr key={item.id || idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="py-1 px-1 text-center font-mono text-slate-400 text-[8.5px] align-top">{idx + 1}</td>
                  <td className="py-1 px-1.5 font-bold text-slate-900 text-[9px] truncate align-top">
                    {item.area_name || `Area ${idx + 1}`}
                  </td>
                  <td className="py-1 px-2 text-slate-700 text-[9px] break-words align-top">
                    <div className="font-semibold text-slate-900 leading-snug">{item.description || "Measurement item"}</div>
                    {item.notes && <div className="text-[8px] text-slate-500 italic leading-snug mt-0.5">{item.notes}</div>}
                  </td>
                  <td className="py-1 px-1 text-center text-slate-600 font-mono text-[8px] leading-snug align-top">
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
                  <td className="py-1 px-1 text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top">
                    {item.quantity} pcs
                  </td>
                  <td className="py-1 px-2 text-slate-600 align-top">
                    <div className="font-semibold text-slate-800 text-[9px] leading-snug">
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
                    <div className="text-[8px] font-mono text-slate-600 break-words leading-tight mt-0.5" title={item.formula_display}>
                      {item.formula_display}
                    </div>
                  </td>
                  <td className="py-1 px-1.5 text-right font-black font-mono text-slate-900 whitespace-nowrap text-[9.5px] align-top">
                    {formatResultWithUnit(item.calculated_total, item.result_unit)}
                  </td>
                  <td className="py-1 px-1.5 text-right text-slate-700 font-mono text-[8.5px] whitespace-nowrap align-top">
                    {item.rate > 0 ? `${fmtAED(item.rate)} / ${item.result_unit}` : "—"}
                  </td>
                  <td className="py-1 px-2 text-right font-black text-slate-950 font-mono whitespace-nowrap text-[9.5px] align-top">
                    {item.total_cost > 0 ? fmtAED(item.total_cost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unit-Safe Summary & Notes (Side by Side) */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          {/* Notes & Compliance */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-2 text-[9px]">
            <h4 className="font-bold text-slate-800 text-[9.5px] mb-0.5 uppercase tracking-wider">
              Measurement Notes & Compliance
            </h4>
            <p className="text-slate-600 leading-tight">
              Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.
            </p>
            {data.notes && (
              <div className="mt-1 text-slate-700 border-t border-slate-200 pt-0.5">
                <span className="font-semibold">Notes: </span>
                {data.notes}
              </div>
            )}
          </div>

          {/* Separated Totals */}
          <div className="rounded border border-slate-200 bg-white p-2 shadow-2xs space-y-1">
            <h4 className="font-bold text-slate-900 text-[9.5px] border-b border-slate-100 pb-0.5 uppercase tracking-wider">
              Takeoff Summary
            </h4>

            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-600 font-medium">Total Pieces:</span>
              <span className="font-bold font-mono text-slate-900">{summary.totalPieces} pcs</span>
            </div>

            {summary.totalLinearM > 0 && (
              <div className="flex justify-between items-center text-[10px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                <span className="text-slate-700 font-semibold">Total Linear Metres:</span>
                <span className="font-bold font-mono text-slate-900 text-xs">
                  {summary.totalLinearM.toFixed(3)} m
                </span>
              </div>
            )}

            {summary.totalAreaM2 > 0 && (
              <div className="flex justify-between items-center text-[10px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                <span className="text-slate-700 font-semibold">Total Square Metres:</span>
                <span className="font-bold font-mono text-slate-900 text-xs">
                  {summary.totalAreaM2.toFixed(3)} m²
                </span>
              </div>
            )}

            {summary.totalCostAED > 0 && (
              <div className="flex justify-between items-center text-[10px] border-t border-slate-200 pt-1 mt-0.5">
                <span className="text-slate-900 font-bold uppercase text-[9px] tracking-wide">Total Estimated Cost:</span>
                <span className="font-black font-mono text-slate-950 text-xs">
                  {fmtAED(summary.totalCostAED)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Signatures */}
        <DocSignatureArea
          mode="standard"
          preparedByTitle="Prepared By (Estimator / Engineer)"
          receivedByTitle="Approved By (Project Manager / Client)"
        />

        {/* Official Footer */}
        <DocFooter company={company} />
      </div>
    </DocumentContainer>
  );
}
