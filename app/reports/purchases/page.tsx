"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import { printCurrentDocument } from "@/lib/print";
import {
  ShoppingBag, ArrowLeft, Printer
} from "lucide-react";

export default function PurchasesReportPage() {
  type SupplierBillRow = { id: string; bill_number?: string | null; bill_date?: string | null; subtotal?: number | null; vat_amount?: number | null; total_amount?: number | null; paid_amount?: number | null; balance_due?: number | null; status?: string | null; suppliers?: { name?: string | null } | { name?: string | null }[] | null };
  const [bills, setBills] = useState<SupplierBillRow[]>([]);
  const [dateFrom] = useState("");
  const [dateTo] = useState("");

  async function loadPurchasingData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const billRes = await supabase
        .from("supplier_bills")
        .select("*, suppliers(name)")
        .eq("company_id", companyId)
        .order("bill_date", { ascending: false });

      const queryError = billRes.error;
      if (queryError) throw new Error(queryError.message);

      setBills((billRes.data || []) as SupplierBillRow[]);
    } catch (err) {
      console.error("Error loading purchases report:", err);
    } finally {
      // The report remains usable with an empty result when the query fails.
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadPurchasingData);
  // Report snapshot loads once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBills = bills.filter(b => {
    if (dateFrom && (b.bill_date || "") < dateFrom) return false;
    if (dateTo && (b.bill_date || "") > dateTo) return false;
    return true;
  });

  const totalBillNet = filteredBills.reduce((acc, b) => acc + (Number(b.subtotal) || 0), 0);
  const totalBillVat = filteredBills.reduce((acc, b) => acc + (Number(b.vat_amount) || 0), 0);
  const totalPaid = filteredBills.reduce((acc, b) => acc + (Number(b.paid_amount) || 0), 0);
  const totalDue = filteredBills.reduce((acc, b) => acc + (Number(b.balance_due) || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-print-root>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <ShoppingBag size={20} />
              </span>
              Purchases &amp; Vendor Commitments Report
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Audit of purchase orders, supplier bills, input VAT, and accounts payable balances</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void printCurrentDocument()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <Printer size={15} /> Print Report
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Purchases (Net)</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalBillNet.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Excluding VAT</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Input VAT Paid (5%)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
            AED {totalBillVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600 mt-1">Claimable on FTA return</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Disbursed to Vendors</p>
          <p className="text-2xl font-bold text-blue-700 mt-2 font-mono">
            AED {totalPaid.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-blue-600 mt-1">Confirmed bill payments</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Outstanding Vendor Dues</p>
          <p className="text-2xl font-bold text-amber-700 mt-2 font-mono">
            AED {totalDue.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-amber-600 mt-1">Accounts payable balance</p>
        </div>
      </div>

      {/* Supplier Bills Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Supplier Bills Ledger</h3>
          <span className="text-xs text-slate-500 font-mono">{filteredBills.length} bills</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Subtotal (AED)</th>
                <th className="px-4 py-3 text-right">VAT 5% (AED)</th>
                <th className="px-4 py-3 text-right">Total (AED)</th>
                <th className="px-4 py-3 text-right">Paid (AED)</th>
                <th className="px-4 py-3 text-right">Balance Due (AED)</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 font-mono">{b.bill_number}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{b.bill_date}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{(Array.isArray(b.suppliers) ? b.suppliers[0]?.name : b.suppliers?.name) || "Supplier"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(b.subtotal || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{Number(b.vat_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{Number(b.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-blue-600">{Number(b.paid_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-600 font-bold">{Number(b.balance_due || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
