"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany } from "@/lib/helpers";
import {
  FileSpreadsheet, ArrowLeft, Printer,
  Truck, RefreshCw
} from "lucide-react";
import StatementOfAccountTemplate, { StatementData, StatementEntry } from "@/components/documents/StatementOfAccountTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Supplier = {
  id: string;
  name: string;
  supplier_code: string | null;
  trn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type Bill = {
  id: string;
  supplier_id: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  status: string;
};

type SupplierPayment = {
  id: string;
  supplier_id: string;
  payment_number: string | null;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  status?: string | null;
};

export default function SupplierStatementOfAccountPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [openingBalance] = useState(0);

  const [generating, setGenerating] = useState(false);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  async function loadSuppliers() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [sRes, co] = await Promise.all([
        supabase.from("suppliers").select("id, name, supplier_code, trn, address, phone, email").eq("company_id", companyId).order("name"),
        getCurrentCompany()
      ]);

      if (sRes.error) throw new Error(sRes.error.message);

      setSuppliers(sRes.data || []);
      if (sRes.data && sRes.data.length > 0) {
        setSelectedSupplierId(sRes.data[0].id);
      }
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Error loading suppliers:", err);
    } finally {
      // The page renders its empty-state if supplier loading fails.
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadSuppliers);
  }, []);

  async function generateStatement() {
    if (!selectedSupplierId) return;
    setGenerating(true);

    try {
      const selected = suppliers.find(s => s.id === selectedSupplierId);
      if (!selected) return;

      // Fetch bills & payments
      const [billsRes, paysRes] = await Promise.all([
        supabase
          .from("supplier_bills")
          .select("id, supplier_id, bill_number, bill_date, total_amount, status")
          .eq("supplier_id", selectedSupplierId)
          .order("bill_date", { ascending: true }),
        supabase
          .from("supplier_payments")
          .select("id, supplier_id, payment_number, payment_date, amount, payment_method")
          .eq("supplier_id", selectedSupplierId)
          .order("payment_date", { ascending: true })
      ]);

      const queryError = billsRes.error || paysRes.error;
      if (queryError) throw new Error(queryError.message);

      const bills: Bill[] = (billsRes.data || []).filter(b => (b.status || "").toLowerCase() !== "cancelled");
      const pays: SupplierPayment[] = paysRes.data || [];

      // Build unified timeline
      type RawTx = {
        date: string;
        ref: string;
        desc: string;
        charge: number; // bill
        credit: number; // payment
      };

      const rawList: RawTx[] = [];

      bills.forEach(b => {
        rawList.push({
          date: b.bill_date,
          ref: b.bill_number,
          desc: "Supplier Bill / Goods Receipt",
          charge: Number(b.total_amount || 0),
          credit: 0,
        });
      });

      pays.forEach(p => {
        rawList.push({
          date: p.payment_date,
          ref: p.payment_number || "PAY",
          desc: `Disbursement (${p.payment_method})`,
          charge: 0,
          credit: Number(p.amount || 0),
        });
      });

      // Sort chronologically
      rawList.sort((a, b) => (a.date > b.date ? 1 : -1));

      // Filter by date range and calculate running balance
      let currentBal = openingBalance;
      const entries: StatementEntry[] = [];

      rawList.forEach(item => {
        if (fromDate && item.date < fromDate) {
          // Add to pre-period opening balance
          currentBal = currentBal + item.charge - item.credit;
          return;
        }
        if (toDate && item.date > toDate) {
          return;
        }

        currentBal = currentBal + item.charge - item.credit;
        entries.push({
          date: item.date,
          reference_no: item.ref,
          description: item.desc,
          debit: item.charge,
          credit: item.credit,
          balance: currentBal,
        });
      });

      const now = new Date();
      const stNumber = `SOA-SUP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${selected.supplier_code || selected.id.slice(0, 4).toUpperCase()}`;

      setStatement({
        statement_number: stNumber,
        statement_date: now.toISOString().split("T")[0],
        customer_name: selected.name,
        customer_trn: selected.trn || undefined,
        customer_address: selected.address || undefined,
        from_date: fromDate || "Start",
        to_date: toDate,
        opening_balance: openingBalance,
        closing_balance: currentBal,
        entries,
      });
    } catch (err) {
      console.error("Error generating supplier statement:", err);
    } finally {
      setGenerating(false);
    }
  }

  const selectedSup = suppliers.find(s => s.id === selectedSupplierId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="app-screen-content no-print">
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
              <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                <Truck size={20} />
              </span>
              Supplier Statement of Account
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Comprehensive audit ledger of vendor bills, purchase orders, disbursements, and running balance</p>
          </div>
        </div>

        {statement && (
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
          >
            <Printer size={16} /> Print / Export PDF
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Supplier *</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.trn ? `(TRN: ${s.trn})` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={generateStatement}
              disabled={generating || !selectedSupplierId}
              className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {generating ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Generate Statement
            </button>
          </div>
        </div>
      </div>

      {/* Results View */}
      {statement && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Opening Balance</p>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                AED {statement.opening_balance.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Bills Charged</p>
              <p className="text-xl font-bold text-rose-600 mt-1 font-mono">
                AED {statement.entries.reduce((a, c) => a + c.debit, 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Paid / Disbursed</p>
              <p className="text-xl font-bold text-emerald-600 mt-1 font-mono">
                AED {statement.entries.reduce((a, c) => a + c.credit, 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Outstanding Vendor Balance</p>
              <p className="text-xl font-bold text-amber-700 mt-1 font-mono">
                AED {statement.closing_balance.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Statement Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Statement Ledger — {selectedSup?.name}</h3>
                <p className="text-xs text-slate-500">{statement.from_date} &bull; {statement.to_date}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Bills / Charges (AED)</th>
                    <th className="px-4 py-3 text-right">Payments / Credits (AED)</th>
                    <th className="px-4 py-3 text-right">Running Balance (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No transactions recorded for this supplier during the selected period.
                      </td>
                    </tr>
                  ) : (
                    statement.entries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{e.date}</td>
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{e.reference_no}</td>
                        <td className="px-4 py-2.5 text-slate-700">{e.description}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-rose-600">
                          {e.debit > 0 ? e.debit.toFixed(2) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-600">
                          {e.credit > 0 ? e.credit.toFixed(2) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                          {e.balance.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* PRINT MODAL */}
      <PrintModal isOpen={showPrintModal && !!statement} onClose={() => setShowPrintModal(false)}>
        {statement && (
          <StatementOfAccountTemplate
            company={company}
            statement={{
              ...statement,
              customer_name: `[Supplier] ${statement.customer_name}`,
            }}
            onClose={() => setShowPrintModal(false)}
          />
        )}
      </PrintModal>
    </div>
  );
}
