"use client";

import React, { useMemo } from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import DocumentContainer from "./DocumentContainer";
import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";
import { usePersistedDocumentDesign, DesignLoadState } from "./usePersistedDocumentDesign";
import { DocumentLayout } from "@/lib/documentDesigner";
import { fmtAED, fmtDate } from "@/lib/helpers";
import {
  MeasurementRowCalculated,
  MeasurementSheetSummary,
} from "@/lib/measurementTypes";
import { formatResultWithUnit } from "@/lib/measurementCalculations";
import { getAdaptiveDocumentDensity } from "@/lib/documentLayoutEngine";
import { numberToWordsEnglish } from "@/lib/amountInWords";

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
  vat_rate?: number;
  include_vat?: boolean;
};

interface MeasurementSheetTemplateProps {
  company: CompanyDocInfo | null;
  data: MeasurementSheetDocData;
  scale?: number;
  showCalculationType?: boolean;
  showVat?: boolean;
}

export default function MeasurementSheetTemplate({
  company,
  data,
  scale,
  showCalculationType,
  showVat,
}: MeasurementSheetTemplateProps) {
  const { summary } = data;
  const isVatActive =
    showVat !== undefined
      ? showVat
      : data.include_vat !== undefined
      ? data.include_vat
      : (summary.vatAmountAED !== undefined && summary.vatAmountAED > 0) ||
        (data.vat_rate !== undefined && data.vat_rate > 0);

  const effectiveVatRate = data.vat_rate ?? summary.vatRate ?? 5;
  const netCost = summary.totalCostAED;
  const vatAmount = summary.vatAmountAED ?? (isVatActive ? Math.round(netCost * effectiveVatRate) / 100 : 0);
  const grandTotal = summary.grandTotalWithVatAED ?? (netCost + (isVatActive ? vatAmount : 0));

  const design = usePersistedDocumentDesign(company?.id, "measurement_sheet");
  const customLayout = design.layout;

  // Map measurement domain data to standard renderer document data
  const rendererData: MockDocumentData = useMemo(() => {
    return {
      document_number: data.sheet_number,
      document_date: data.sheet_date,
      customer_name: data.customer_name || "Client / Project Manager",
      project_name: data.project_name || undefined,
      project_number: data.project_number || undefined,
      title: data.title || "Fabrication & Takeoff Sheet",
      items: data.items.map((item, idx) => {
        const dimStr =
          item.calc_type === "quantity_only"
            ? "—"
            : item.calc_type === "linear"
            ? `L: ${item.length_entered} ${item.dim_unit} (${item.length_m.toFixed(3)}m)`
            : item.is_variable_width && item.width2_m !== undefined
            ? `L: ${item.length_entered} ${item.dim_unit} (${item.length_m.toFixed(3)}m)\nW: avg ${item.average_width_m?.toFixed(3)}m`
            : `L: ${item.length_entered} ${item.dim_unit} (${item.length_m.toFixed(3)}m)\nW: ${item.width_entered} ${item.dim_unit}`;

        const calcTypeLabel =
          item.calc_type === "pvc_edge_joint"
            ? "PVC Edge + Centre Joint"
            : item.calc_type === "linear"
            ? "Linear Length"
            : item.calc_type === "area"
            ? "Surface Area"
            : item.calc_type === "perimeter"
            ? "Perimeter"
            : item.calc_type === "quantity_only"
            ? "Item Count"
            : "Custom Formula";

        const calcTypeFormula = item.formula_display ? `${calcTypeLabel}\n${item.formula_display}` : calcTypeLabel;
        const resultDisplay = formatResultWithUnit(item.calculated_total, item.result_unit);

        return {
          description: item.notes ? `${item.description}\n${item.notes}` : (item.description || "Measurement item"),
          quantity: item.quantity,
          unit: "pcs",
          unit_price: item.rate,
          discount: 0,
          vat_rate: isVatActive ? effectiveVatRate : 0,
          vat_amount: 0,
          line_total: item.total_cost,
          area_name: item.area_name || `Area ${idx + 1}`,
          dimensions: dimStr,
          calc_type: calcTypeLabel,
          calc_type_formula: calcTypeFormula,
          result_display: resultDisplay,
          result_unit: item.result_unit,
          calculated_total: item.calculated_total,
        };
      }),
      subtotal: netCost,
      vat_amount: isVatActive ? vatAmount : 0,
      total_amount: isVatActive ? grandTotal : netCost,
      notes: data.notes || undefined,
      payment_terms:
        "Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.",
    };
  }, [data, isVatActive, effectiveVatRate, netCost, vatAmount, grandTotal]);

  // Apply modal live overrides for calculation type formula column and UAE VAT
  const activeLayout = useMemo(() => {
    if (!customLayout) return customLayout;
    const layoutCopy: DocumentLayout = JSON.parse(JSON.stringify(customLayout));

    if (showCalculationType !== undefined) {
      const tableElem = layoutCopy.elements.find((e) => e.type === "line_items");
      if (tableElem?.tableSettings?.columns) {
        const calcCol = tableElem.tableSettings.columns.find((c) => c.key === "calc_type");
        if (calcCol) {
          calcCol.visible = showCalculationType;
        }
      }
    }

    if (showVat !== undefined) {
      const totalsElem = layoutCopy.elements.find((e) => e.type === "totals");
      if (totalsElem) {
        totalsElem.customText = showVat ? undefined : "vat_disabled";
      }
    }

    // Auto-normalize visible column widths to 100%
    const tableElem = layoutCopy.elements.find((e) => e.type === "line_items");
    if (tableElem?.tableSettings?.columns) {
      const visibleCols = tableElem.tableSettings.columns.filter((c) => c.visible);
      const totalPct = visibleCols.reduce((sum, c) => sum + (c.widthPct || 10), 0);
      if (totalPct > 0 && Math.abs(totalPct - 100) > 0.5) {
        visibleCols.forEach((c) => {
          c.widthPct = Math.round((c.widthPct / totalPct) * 100 * 10) / 10;
        });
      }
    }

    return layoutCopy;
  }, [customLayout, showCalculationType, showVat]);

  const totalPages = getDocumentPageCount(activeLayout, rendererData.items.length, rendererData.items, rendererData);

  const tableElem = activeLayout?.elements?.find((e) => e.type === "line_items");
  const customColumns = tableElem?.tableSettings?.columns;
  const showFormulaCol =
    showCalculationType !== undefined
      ? showCalculationType
      : (customColumns?.find((c) => c.key === "calc_type")?.visible ?? false);

  const density = getAdaptiveDocumentDensity(data.items.length, {
    hasLongDescriptions: data.items.some((i) => (i.description?.length || 0) > 40),
    hasFormulas: showFormulaCol,
  });

  const tableSettings = tableElem?.tableSettings;
  const headerBg = tableSettings?.headerBg || "#0F172A";
  const headerTextColor = tableSettings?.headerTextColor || "#FFFFFF";
  const borderColor = tableSettings?.borderColor || "#CBD5E1";

  // Block print with clear load state until the user's saved cloud design has loaded
  if (!design.ready) return <DesignLoadState error={design.error} retry={design.retry} />;

  return (
    <DocumentContainer
      docNumber={data.sheet_number}
      docTypeLabel="MEASUREMENT TAKEOFF"
      company={company}
      totalPages={totalPages}
      layout={activeLayout}
      noPadding={Boolean(activeLayout)}
      showWatermark={!activeLayout}
    >
      {activeLayout ? (
        <div className="flex flex-col gap-6 print:gap-0">
          {Array.from({ length: totalPages }, (_, index) => (
            <DynamicDocumentRenderer
              key={index}
              layout={activeLayout}
              company={company}
              data={rendererData}
              isDesignerPreview={false}
              scale={scale || 1}
              pageNumber={index + 1}
              totalPages={totalPages}
            />
          ))}
        </div>
      ) : (
        <div className="text-slate-800 bg-white font-sans text-xs">
          {/* Official Company Header */}
          <DocHeader company={company} docTitle="MEASUREMENT & TAKEOFF SHEET" docNumber={data.sheet_number} />

          {/* Document Reference Info */}
          <div className={`${density.sectionGapClass} grid grid-cols-2 gap-3 rounded border border-slate-200 bg-slate-50/70 ${density.cardPaddingClass} text-xs`}>
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
          <div className={`${density.sectionGapClass} overflow-hidden rounded border`} style={{ borderColor }}>
            <table className={`w-full table-fixed border-collapse text-left ${density.tableTextClass}`}>
              <colgroup>
                <col style={{ width: showFormulaCol ? "3.5%" : "4%" }} />
                <col style={{ width: showFormulaCol ? "8.5%" : "13%" }} />
                <col style={{ width: showFormulaCol ? "22%" : "33%" }} />
                <col style={{ width: showFormulaCol ? "12%" : "16%" }} />
                <col style={{ width: showFormulaCol ? "5%" : "8%" }} />
                {showFormulaCol && <col style={{ width: "20%" }} />}
                <col style={{ width: showFormulaCol ? "10%" : "12%" }} />
                <col style={{ width: showFormulaCol ? "8%" : "6%" }} />
                <col style={{ width: showFormulaCol ? "11%" : "8%" }} />
              </colgroup>
              <thead>
                <tr
                  className="font-semibold uppercase tracking-wider"
                  style={{ backgroundColor: headerBg, color: headerTextColor }}
                >
                  <th className={`${density.tableHeaderClass} text-center`}>#</th>
                  <th className={`${density.tableHeaderClass} whitespace-nowrap`}>Area / Ref</th>
                  <th className={`${density.tableHeaderClass}`}>Description</th>
                  <th className={`${density.tableHeaderClass} text-center whitespace-nowrap`}>Dimensions</th>
                  <th className={`${density.tableHeaderClass} text-center whitespace-nowrap`}>Qty</th>
                  {showFormulaCol && (
                    <th className={`${density.tableHeaderClass}`}>Calculation Type & Formula</th>
                  )}
                  <th className={`${density.tableHeaderClass} text-right whitespace-nowrap`}>Result & Unit</th>
                  <th className={`${density.tableHeaderClass} text-right whitespace-nowrap`}>Rate</th>
                  <th className={`${density.tableHeaderClass} text-right whitespace-nowrap`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className={`${density.tableCellClass} text-center font-mono text-slate-400 text-[8.5px] align-top`}>{idx + 1}</td>
                    <td className={`${density.tableCellClass} font-bold text-slate-900 text-[9px] truncate align-top`}>
                      {item.area_name || `Area ${idx + 1}`}
                    </td>
                    <td className={`${density.tableCellClass} text-slate-700 text-[9px] break-words align-top`}>
                      <div className="font-semibold text-slate-900 leading-snug">{item.description || "Measurement item"}</div>
                      {item.notes && <div className="text-[8px] text-slate-500 italic leading-snug mt-0.5">{item.notes}</div>}
                    </td>
                    <td className={`${density.tableCellClass} text-center text-slate-600 font-mono text-[8px] leading-snug align-top`}>
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
                    <td className={`${density.tableCellClass} text-center font-bold text-slate-900 text-[9px] whitespace-nowrap align-top`}>
                      {item.quantity} pcs
                    </td>
                    {showFormulaCol && (
                      <td className={`${density.tableCellClass} text-slate-600 align-top`}>
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
                    )}
                    <td className={`${density.tableCellClass} text-right font-black font-mono text-slate-900 whitespace-nowrap text-[9.5px] align-top`}>
                      {formatResultWithUnit(item.calculated_total, item.result_unit)}
                    </td>
                    <td className={`${density.tableCellClass} text-right text-slate-700 font-mono text-[8.5px] whitespace-nowrap align-top`}>
                      {item.rate > 0 ? `${fmtAED(item.rate)} / ${item.result_unit}` : "—"}
                    </td>
                    <td className={`${density.tableCellClass} text-right font-black text-slate-950 font-mono whitespace-nowrap text-[9.5px] align-top`}>
                      {item.total_cost > 0 ? fmtAED(item.total_cost) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unit-Safe Summary & Notes (Side by Side) */}
          <div className={`grid grid-cols-2 gap-3 ${density.sectionGapClass}`}>
            {/* Notes & Compliance */}
            <div className={`rounded border border-slate-200 bg-slate-50/50 ${density.cardPaddingClass} text-[9px]`}>
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
            <div className={`rounded border border-slate-200 bg-white ${density.cardPaddingClass} shadow-2xs ${density.compactSummary ? "space-y-0.5" : "space-y-1"}`}>
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

              {netCost > 0 && (
                <div className="border-t border-slate-200 pt-1 mt-0.5 space-y-0.5">
                  {isVatActive ? (
                    <>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-600 font-medium">Net Amount:</span>
                        <span className="font-bold font-mono text-slate-900 text-xs">
                          {fmtAED(netCost)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-600 font-medium">VAT ({effectiveVatRate}%):</span>
                        <span className="font-bold font-mono text-emerald-800 text-xs">
                          {fmtAED(vatAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] border-t border-slate-300 pt-0.5 mt-0.5 bg-slate-50/80 -mx-1 px-1 rounded">
                        <span className="text-slate-950 font-black uppercase text-[9px] tracking-wide">
                          Total Amount:
                        </span>
                        <span className="font-black font-mono text-slate-950 text-xs">
                          {fmtAED(grandTotal)}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-500 italic mt-0.5 leading-tight truncate">
                        Amount in words: {numberToWordsEnglish(grandTotal)}
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-900 font-bold uppercase text-[9px] tracking-wide">Total Estimated Cost:</span>
                      <span className="font-black font-mono text-slate-950 text-xs">
                        {fmtAED(netCost)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Signatures */}
          <DocSignatureArea
            mode="standard"
            compact={density.signatureCompact}
            preparedByTitle="Prepared By (Estimator / Engineer)"
            receivedByTitle="Approved By (Project Manager / Client)"
          />

          {/* Official Footer */}
          <DocFooter company={company} />
        </div>
      )}
    </DocumentContainer>
  );
}
