"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, fmtAED } from "@/lib/helpers";
import {
  BarChart3, ArrowLeft, Search, Calendar, Download, Printer,
  Receipt, FileText, CheckCircle2, TrendingUp
} from "lucide-react";

export default function SalesReportPage() {
  type SalesDocumentRow = { id: string; status?: string | null; subtotal?: number | null; vat_amount?: number | null; total_amount?: number | null; invoice_number?: string | null; invoice_date?: string | null; customers?: { name?: string | null } | { name?: string | null }[] | null };
  const [invoices, setInvoices] = useState<SalesDocumentRow[]>([]);
  const [quotations, setQuotations] = useState<SalesDocumentRow[]>([]);
  const [proformas, setProformas] = useState<SalesDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function loadSalesData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [invRes, qRes, piRes] = await Promise.all([
        supabase.from("tax_invoices").select("*, customers(name)").eq("company_id", companyId).order("invoice_date", { ascending: false }),
        supabase.from("quotations").select("*, customers(name)").eq("company_id", companyId).order("quotation_date", { ascending: false }),
        supabase.from("proforma_invoices").select("*, customers(name)").eq("company_id", companyId).order("proforma_date", { ascending: false }),
      ]);

      const queryError = invRes.error || qRes.error || piRes.error;
      if (queryError) throw new Error(queryError.message);

      setInvoices((invRes.data || []) as SalesDocumentRow[]);
      setQuotations((qRes.data || []) as SalesDocumentRow[]);
      setProformas((piRes.data || []) as SalesDocumentRow[]);
    } catch (err) {
      console.error("Error loading sales report:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadSalesData);
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    if (dateFrom && (inv.invoice_date || "") < dateFrom) return false;
    if (dateTo && (inv.invoice_date || "") > dateTo) return false;
    return true;
  });

  const activeInvoices = filteredInvoices.filter(i => (i.status || "").toLowerCase() !== "cancelled");
  const totalSalesExVat = activeInvoices.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
  const totalVat = activeInvoices.reduce((acc, i) => acc + (Number(i.vat_amount) || 0), 0);
  const totalGrossSales = activeInvoices.reduce((acc, i) => acc + (Number(i.total_amount) || 0), 0);

  const acceptedQuotes = quotations.filter(q => (q.status || "").toLowerCase() === "accepted").length;
  const quoteWinRate = quotations.length > 0 ? (acceptedQuotes / quotations.length) * 100 : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <TrendingUp size={20} />
              </span>
              Sales &amp; Revenue Report
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Comprehensive audit of issued tax invoices, quotations pipeline, and 5% sales VAT</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <Printer size={15} /> Print Report
        </button>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-rose-600 hover:underline font-medium"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Revenue</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalSalesExVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Excluding 5% VAT</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Output VAT (5%)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2 font-mono">
            AED {totalVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600 mt-1">Collected on customer sales</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Gross Sales (Inc. VAT)</p>
          <p className="text-2xl font-bold text-blue-700 mt-2 font-mono">
            AED {totalGrossSales.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-blue-600 mt-1">{filteredInvoices.length} invoices issued</p>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">Quotation Win Rate</p>
          <p className="text-2xl font-bold text-purple-700 mt-2 font-mono">
            {quoteWinRate.toFixed(1)}%
          </p>
          <p className="text-xs text-purple-600 mt-1">{acceptedQuotes} of {quotations.length} accepted</p>
        </div>
      </div>

      {/* Tax Invoices Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Issued Tax Invoices Ledger</h3>
          <span className="text-xs text-slate-500 font-mono">{filteredInvoices.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Taxable Net (AED)</th>
                <th className="px-4 py-3 text-right">VAT 5% (AED)</th>
                <th className="px-4 py-3 text-right">Total (AED)</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 font-mono">{inv.invoice_number}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{inv.invoice_date}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{(Array.isArray(inv.customers) ? inv.customers[0]?.name : inv.customers?.name) || "Customer"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(inv.subtotal || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{Number(inv.vat_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{Number(inv.total_amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{inv.status}</span>
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
