"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocumentContainer from "./DocumentContainer";
import { fmtAED, fmtDate, todayISO } from "@/lib/helpers";

export interface StockBalanceReportData {
  report_date: string;
  category_filter?: string;
  brand_filter?: string;
  warehouse_filter?: string;
  items: {
    material_name: string;
    brand: string;
    specification?: string | null;
    width?: number | null;
    unit: string;
    current_stock_sqm: number;
    current_stock_rm: number;
    cost_price: number;
    total_valuation: number;
    minimum_stock: number;
    is_low_stock: boolean;
  }[];
  total_valuation: number;
  total_fabric_sqm: number;
  low_stock_count: number;
}

type Props = {
  company: CompanyDocInfo | null;
  data: StockBalanceReportData;
  onClose?: () => void;
};

export default function StockBalanceReportTemplate({ company, data, onClose }: Props) {
  return (
    <DocumentContainer
      docTypeLabel="STOCK BALANCE REPORT"
      docNumber={`STOCK-${todayISO().replace(/-/g, "")}`}
      onClose={onClose}
    >
      <div className="print-page bg-white p-8 text-slate-800 text-xs font-sans max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between">
        <div>
          {/* Header */}
          <DocHeader
            company={company}
            docTitle="FABRIC & MATERIAL STOCK BALANCE REPORT"
            arabicTitle="تقرير أرصدة وتقييم المخزون والقماش"
            docNumber={`STK-${todayISO().replace(/-/g, "")}`}
            docDate={fmtDate(data.report_date)}
            clientOrSupplierLabel="Inventory Scope"
            clientOrSupplierName="Warehouse Physical Audit"
          />

          {/* KPI Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Warehouse Valuation</span>
              <span className="font-bold text-slate-900 font-mono text-base">
                AED {fmtAED(data.total_valuation)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Fabric Stock (m²)</span>
              <span className="font-bold text-emerald-800 font-mono text-base">
                {data.total_fabric_sqm.toFixed(2)} m²
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block uppercase">Low Stock Alerts</span>
              <span className={`font-bold font-mono text-base ${data.low_stock_count > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {data.low_stock_count} SKUs Below Reorder
              </span>
            </div>
          </div>

          {/* Stock Table */}
          <div className="overflow-x-auto my-4">
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px]">
                  <th className="p-2 border border-slate-700 w-8 text-center">#</th>
                  <th className="p-2 border border-slate-700">Material Name &amp; SKU</th>
                  <th className="p-2 border border-slate-700">Brand / Specs</th>
                  <th className="p-2 border border-slate-700 text-center">Width</th>
                  <th className="p-2 border border-slate-700 text-right bg-emerald-950 font-bold">Stock (m²)</th>
                  <th className="p-2 border border-slate-700 text-right">Equiv RM</th>
                  <th className="p-2 border border-slate-700 text-right">Cost Rate</th>
                  <th className="p-2 border border-slate-700 text-right">Valuation (AED)</th>
                  <th className="p-2 border border-slate-700 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {data.items.map((it, idx) => (
                  <tr key={idx} className={it.is_low_stock ? "bg-amber-50/60" : "hover:bg-slate-50"}>
                    <td className="p-2 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-2 border border-slate-300 font-bold text-slate-900">
                      {it.material_name}
                    </td>
                    <td className="p-2 border border-slate-300">
                      <span>{it.brand}</span>
                      {it.specification && <span className="text-[10px] text-slate-500 block">{it.specification}</span>}
                    </td>
                    <td className="p-2 border border-slate-300 text-center font-mono">
                      {it.width ? `${it.width} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50/50">
                      {it.current_stock_sqm.toFixed(2)} m²
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono text-slate-600">
                      {it.current_stock_rm > 0 ? `${it.current_stock_rm.toFixed(2)} m` : "—"}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono">
                      {fmtAED(it.cost_price)}
                    </td>
                    <td className="p-2 border border-slate-300 text-right font-mono font-bold text-slate-950">
                      {fmtAED(it.total_valuation)}
                    </td>
                    <td className="p-2 border border-slate-300 text-center">
                      {it.is_low_stock ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Low Stock
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          In Stock
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                  <td colSpan={4} className="p-2.5 border border-slate-300 text-right uppercase">
                    Warehouse Balance Totals:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-emerald-800 bg-emerald-100/60 text-sm">
                    {data.total_fabric_sqm.toFixed(2)} m²
                  </td>
                  <td colSpan={2} className="p-2.5 border border-slate-300 text-right text-xs">
                    Total Inventory Value:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right font-mono text-sm text-slate-950">
                    AED {fmtAED(data.total_valuation)}
                  </td>
                  <td className="p-2.5 border border-slate-300"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Verification Signatures */}
        <div>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 my-6 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Stock Auditor / Count By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Storekeeper
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Reviewed By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                Finance &amp; Accounts
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-[11px] mb-12">Authorized By</p>
              <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                General Manager
              </div>
            </div>
          </div>

          <DocFooter company={company} />
        </div>
      </div>
    </DocumentContainer>
  );
}
