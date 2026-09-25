"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany } from "@/lib/helpers";
import {
   ArrowLeft, Printer, ShieldCheck
} from "lucide-react";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

export default function VatReportPage() {
  type InvoiceVatRow = { subtotal?: number | null; vat_amount?: number | null; invoice_date?: string | null; status?: string | null };
  type BillVatRow = { subtotal?: number | null; vat_amount?: number | null; bill_date?: string | null; status?: string | null };
  type ExpenseVatRow = { amount?: number | null; vat_amount?: number | null; expense_date?: string | null; status?: string | null };
  const [invoices, setInvoices] = useState<InvoiceVatRow[]>([]);
  const [bills, setBills] = useState<BillVatRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseVatRow[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function loadVatData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [invRes, billRes, expRes, co] = await Promise.all([
        supabase.from("tax_invoices").select("subtotal, vat_amount, total_amount, invoice_date, status").eq("company_id", companyId),
        supabase.from("supplier_bills").select("subtotal, vat_amount, total_amount, bill_date, status").eq("company_id", companyId),
        supabase.from("expenses").select("amount, vat_amount, total_amount, expense_date, status").eq("company_id", companyId),
        getCurrentCompany(),
      ]);

      const queryError = invRes.error || billRes.error || expRes.error;
      if (queryError) throw new Error(queryError.message);
      setInvoices((invRes.data || []).filter(i => (i.status || "").toLowerCase() !== "cancelled"));
      setBills((billRes.data || []).filter(b => (b.status || "").toLowerCase() !== "cancelled"));
      setExpenses((expRes.data || []).filter(e => (e.status || "").toLowerCase() !== "rejected"));
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Error loading VAT data:", err);
    } finally {
      // The report remains usable with an empty result when the query fails.
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadVatData);
  }, []);

  // Filter by date
  const filteredInvoices = invoices.filter(i => {
    if (dateFrom && (i.invoice_date || "") < dateFrom) return false;
    if (dateTo && (i.invoice_date || "") > dateTo) return false;
    return true;
  });

  const filteredBills = bills.filter(b => {
    if (dateFrom && (b.bill_date || "") < dateFrom) return false;
    if (dateTo && (b.bill_date || "") > dateTo) return false;
    return true;
  });

  const filteredExpenses = expenses.filter(e => {
    if (dateFrom && (e.expense_date || "") < dateFrom) return false;
    if (dateTo && (e.expense_date || "") > dateTo) return false;
    return true;
  });

  // Box 1: Output Tax (Sales)
  const box1Amount = filteredInvoices.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
  const box1Vat = filteredInvoices.reduce((acc, i) => acc + (Number(i.vat_amount) || 0), 0);

  // Box 9: Input Tax (Purchases + Operating Expenses)
  const purchasesAmount = filteredBills.reduce((acc, b) => acc + (Number(b.subtotal) || 0), 0);
  const purchasesVat = filteredBills.reduce((acc, b) => acc + (Number(b.vat_amount) || 0), 0);

  const expensesAmount = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const expensesVat = filteredExpenses.reduce((acc, e) => acc + (Number(e.vat_amount) || 0), 0);

  const box9Amount = purchasesAmount + expensesAmount;
  const box9Vat = purchasesVat + expensesVat;

  // Net VAT = Output Tax - Input Tax
  const netVatPayable = box1Vat - box9Vat;
  const isPayable = netVatPayable >= 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
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
                <ShieldCheck size={20} />
              </span>
              UAE FTA VAT Return (Form 201) Summary
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Official Federal Tax Authority compliant Output Tax, Input Tax &amp; Net VAT position</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium transition-colors"
        >
          <Printer size={15} /> Print Return
        </button>
      </div>

      {/* Company TRN Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Taxable Person Details</p>
          <h2 className="text-xl font-bold mt-0.5">{company?.name || "Your Company LLC"}</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Tax Registration Number (TRN): <span className="text-white font-bold">{company?.trn || "100XXXXXXXXX003"}</span>
          </p>
        </div>
        <div className="text-right">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Standard Rate: 5%
          </span>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase">Tax Period From:</span>
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
            Reset Dates
          </button>
        )}
      </div>

      {/* FTA Return Boxes Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 text-sm">VAT on Sales and all other Outputs (Output Tax)</h3>
        </div>
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-100 text-[11px] uppercase font-semibold text-slate-700">
            <tr>
              <th className="px-4 py-3">Box #</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Amount (AED)</th>
              <th className="px-4 py-3 text-right">VAT Amount (AED)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="px-4 py-3 font-mono font-bold text-slate-900">Box 1</td>
              <td className="px-4 py-3 font-medium text-slate-800">
                Standard rated supplies in Dubai &amp; other Emirates (5%)
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                {box1Amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                {box1Vat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </td>
            </tr>
            <tr className="bg-slate-50/50">
              <td className="px-4 py-3 font-mono text-slate-400">Box 2 - 8</td>
              <td className="px-4 py-3 text-slate-400">
                Zero-rated, exempt &amp; supplies subject to reverse charge provisions
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-400">0.00</td>
              <td className="px-4 py-3 text-right font-mono text-slate-400">0.00</td>
            </tr>
          </tbody>
        </table>

        <div className="px-6 py-4 bg-slate-50 border-t border-b border-slate-200">
          <h3 className="font-bold text-slate-900 text-sm">VAT on Expenses and all other Inputs (Input Tax)</h3>
        </div>
        <table className="w-full text-left text-xs text-slate-600">
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="px-4 py-3 font-mono font-bold text-slate-900 w-24">Box 9</td>
              <td className="px-4 py-3 font-medium text-slate-800">
                Standard rated expenses &amp; vendor purchases (5% Recoverable)
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Bills: AED {purchasesVat.toFixed(2)} &bull; Expenses: AED {expensesVat.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 w-44">
                {box9Amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold text-blue-600 w-44">
                {box9Vat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Net Calculation Bar */}
        <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Box 10 — Net VAT Position</p>
            <p className="text-sm text-slate-300 mt-0.5">
              {isPayable ? "Net VAT Payable to Federal Tax Authority" : "Net VAT Refundable from FTA"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black font-mono text-emerald-400">
              AED {Math.abs(netVatPayable).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Output Tax (AED {box1Vat.toFixed(2)}) &minus; Input Tax (AED {box9Vat.toFixed(2)})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
