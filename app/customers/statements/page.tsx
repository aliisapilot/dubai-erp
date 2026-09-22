"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FileSpreadsheet, Search, Loader2, Printer, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import StatementOfAccountTemplate, { StatementData, StatementEntry } from "@/components/documents/StatementOfAccountTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { getCurrentCompany } from "@/lib/helpers";

type Customer = {
  id: string;
  name: string | null;
  customer_code: string | null;
  trn: string | null;
  address: string | null;
  phone: string | null;
};

type Invoice = {
  id: string;
  customer_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  status: string | null;
};

type Payment = {
  id: string;
  customer_id: string | null;
  payment_number: string | null;
  payment_date: string | null;
  amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
};

type ReceiptVoucher = {
  id: string;
  customer_id: string | null;
  voucher_number: string | null;
  voucher_date: string | null;
  amount: number | null;
  payment_method: string | null;
  cheque_number: string | null;
  status?: string | null;
};

export default function StatementOfAccountPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [openingBalance, setOpeningBalance] = useState(0);

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [{ data: custs }, co] = await Promise.all([
      supabase.from("customers").select("id, name, customer_code, trn, address, phone").eq("active", true).order("name"),
      getCurrentCompany(),
    ]);
    setCustomers((custs || []) as Customer[]);
    if (co) setCompany(co as CompanyDocInfo);
    if ((custs || []).length > 0) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const qCid = urlParams?.get("customer_id");
      if (qCid && custs!.some(c => c.id === qCid)) {
        setSelectedCustomerId(qCid);
      } else {
        setSelectedCustomerId(custs![0].id);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    if (selectedCustomerId) {
      generateStatement();
    }
  }, [selectedCustomerId, fromDate, toDate, openingBalance]);

  async function generateStatement() {
    if (!selectedCustomerId) return;
    setCalculating(true);

    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) {
      setCalculating(false);
      return;
    }

    // Fetch Invoices, Payments, and Receipt Vouchers for this customer
    const [{ data: invs }, { data: pays }, { data: rcvs }] = await Promise.all([
      supabase
        .from("tax_invoices")
        .select("id, customer_id, invoice_number, invoice_date, total_amount, status")
        .eq("customer_id", selectedCustomerId)
        .order("invoice_date", { ascending: true }),
      supabase
        .from("payments")
        .select("id, customer_id, payment_number, payment_date, amount, payment_method, reference_number")
        .eq("customer_id", selectedCustomerId)
        .order("payment_date", { ascending: true }),
      supabase
        .from("receipt_vouchers")
        .select("id, customer_id, voucher_number, voucher_date, amount, payment_method, cheque_number, status")
        .eq("customer_id", selectedCustomerId)
        .order("voucher_date", { ascending: true }),
    ]);

    // Build unified transactions list
    type RawTx = {
      date: string;
      reference_no: string;
      description: string;
      debit: number;
      credit: number;
    };

    const rawTxs: RawTx[] = [];

    (invs || []).forEach((inv: Invoice) => {
      const st = (inv.status || "").toLowerCase();
      // Exclude cancelled and unposted draft invoices from customer statement balances
      if (st === "cancelled" || st === "draft") return;
      if (inv.invoice_date) {
        rawTxs.push({
          date: inv.invoice_date,
          reference_no: inv.invoice_number || "INV",
          description: `Tax Invoice ${inv.invoice_number || ""}`,
          debit: Number(inv.total_amount) || 0,
          credit: 0,
        });
      }
    });

    (pays || []).forEach((p: Payment) => {
      if (p.payment_date) {
        rawTxs.push({
          date: p.payment_date,
          reference_no: p.payment_number || p.reference_number || "PAY",
          description: `Payment Received (${p.payment_method || "Cash"})`,
          debit: 0,
          credit: Number(p.amount) || 0,
        });
      }
    });

    (rcvs || []).forEach((rcv: ReceiptVoucher) => {
      const rst = (rcv.status || "").toLowerCase();
      // Exclude cancelled or draft receipt vouchers
      if (rst === "cancelled" || rst === "draft") return;
      if (rcv.voucher_date) {
        rawTxs.push({
          date: rcv.voucher_date,
          reference_no: rcv.voucher_number || "RCV",
          description: `Receipt Voucher (${rcv.payment_method || "Cash"}${rcv.cheque_number ? ` - Chq: ${rcv.cheque_number}` : ""})`,
          debit: 0,
          credit: Number(rcv.amount) || 0,
        });
      }
    });

    // Sort chronologically
    rawTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate opening balance before `fromDate`
    let computedOpening = Number(openingBalance) || 0;
    const filteredTxs: RawTx[] = [];

    rawTxs.forEach(tx => {
      if (fromDate && tx.date < fromDate) {
        computedOpening += (tx.debit - tx.credit);
      } else if (!toDate || tx.date <= toDate) {
        filteredTxs.push(tx);
      }
    });

    // Compute running balance line-by-line
    let currentBalance = computedOpening;
    const entries: StatementEntry[] = filteredTxs.map(tx => {
      currentBalance += (tx.debit - tx.credit);
      return {
        date: tx.date,
        reference_no: tx.reference_no,
        description: tx.description,
        debit: tx.debit,
        credit: tx.credit,
        balance: currentBalance,
      };
    });

    const now = new Date();
    const stNumber = `SOA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${cust.customer_code || cust.id.slice(0, 4).toUpperCase()}`;

    const statementData: StatementData = {
      statement_number: stNumber,
      statement_date: now.toISOString().split("T")[0],
      from_date: fromDate || null,
      to_date: toDate || null,
      customer_name: cust.name || "Customer",
      customer_trn: cust.trn,
      customer_address: cust.address,
      customer_phone: cust.phone,
      opening_balance: computedOpening,
      entries,
      closing_balance: currentBalance,
    };

    setStatement(statementData);
    setCalculating(false);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Link
              href="/customers"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Back to Customers"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Statement of Account</h1>
              <p className="text-sm text-slate-500">Customer ledger balances, invoices, payments, and running balance</p>
            </div>
          </div>
          {statement && (
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
            >
              <Printer size={18} /> Print / Export A4 Statement
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Filter Controls Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="mb-1 block font-semibold text-slate-700">Select Customer</label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.customer_code ? `(${c.customer_code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700">Initial Opening Balance (AED)</label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={e => setOpeningBalance(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Live Statement Preview Table */}
        {loading || calculating ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-slate-400" />
          </div>
        ) : !statement ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center text-slate-500">
            Select a customer to generate their statement of account.
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPI Banner */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Opening Balance</span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  {statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Total Charges (Invoiced)</span>
                <span className="text-lg font-bold font-mono text-rose-700">
                  {statement.entries.reduce((s, e) => s + e.debit, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-xs text-slate-500 block font-medium">Total Received (Credits)</span>
                <span className="text-lg font-bold font-mono text-emerald-700">
                  {statement.entries.reduce((s, e) => s + e.credit, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">{statement.customer_name}</h2>
                  <p className="text-xs text-slate-500">Ref: {statement.statement_number}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Outstanding Closing Balance:</span>
                  <span className="text-base font-extrabold font-mono text-slate-900">
                    {statement.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                  </span>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref No</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Debit (Charges)</th>
                    <th className="px-4 py-3 text-right">Credit (Paid)</th>
                    <th className="px-4 py-3 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  <tr className="bg-slate-50/60 font-semibold text-slate-700">
                    <td className="px-4 py-2.5 font-mono">{fromDate || "—"}</td>
                    <td className="px-4 py-2.5 font-mono">—</td>
                    <td className="px-4 py-2.5">Opening Balance Brought Forward</td>
                    <td className="px-4 py-2.5 text-right font-mono">—</td>
                    <td className="px-4 py-2.5 text-right font-mono">—</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-900 font-bold">
                      {statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                    </td>
                  </tr>

                  {statement.entries.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-600 font-mono">
                        {e.date ? new Date(e.date).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{e.reference_no}</td>
                      <td className="px-4 py-2.5 text-slate-800">{e.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-rose-700">
                        {e.debit > 0 ? e.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-700 font-semibold">
                        {e.credit > 0 ? e.credit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        {e.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                      </td>
                    </tr>
                  ))}

                  {statement.entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* A4 Print Modal */}
      {statement && (
        <PrintModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)}>
          <StatementOfAccountTemplate
            company={company}
            statement={statement}
            onClose={() => setShowPrintModal(false)}
          />
        </PrintModal>
      )}
    </main>
  );
}
