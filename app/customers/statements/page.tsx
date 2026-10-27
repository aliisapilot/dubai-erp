"use client";
import ReportLoadState from "@/components/ReportLoadState";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FileSpreadsheet, Loader2, Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import StatementOfAccountTemplate, { StatementData, StatementEntry } from "@/components/documents/StatementOfAccountTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { getCurrentCompany, todayISO } from "@/lib/helpers";
import { CustomPartyData } from "@/lib/documentCustomer";

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
  status?: string | null;
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
  const [toDate, setToDate] = useState(todayISO());
  const [openingBalance, setOpeningBalance] = useState(0);
  const [partyMode, setPartyMode] = useState<"existing" | "custom">("existing");
  const [customCustomer, setCustomCustomer] = useState<CustomPartyData>({
    name: "",
    address: "",
    contact_person: "",
    phone: "",
    email: "",
    trn: "",
    project_name: "",
  });

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [loadError, setLoadError] = useState("");
  const requestVersion = useRef(0);

  async function loadInitialData() {
    setLoadError("");
    try {
    setLoading(true);
    const [{ data: custs, error: customerError }, co] = await Promise.all([
      supabase.from("customers").select("id, name, customer_code, trn, address, phone").eq("active", true).order("name"),
      getCurrentCompany(),
    ]);
    if (customerError) throw new Error(customerError.message);
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
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  async function generateStatement() {
    if (partyMode === "existing" && !selectedCustomerId) return;
    if (partyMode === "custom" && !customCustomer.name.trim()) return;

    const version = ++requestVersion.current;
    setCalculating(true);
    setLoadError("");
    setStatement(null);
    try {
      let custName = "";
      let custTrn: string | null = null;
      let custAddress: string | null = null;
      let custPhone: string | null = null;
      let custCode = "";

      let invsPromise;
      let paysPromise;
      let rcvsPromise;

      if (partyMode === "existing") {
        const cust = customers.find(c => c.id === selectedCustomerId);
        if (!cust) {
          setCalculating(false);
          return;
        }
        custName = cust.name || "Customer";
        custTrn = cust.trn;
        custAddress = cust.address;
        custPhone = cust.phone;
        custCode = cust.customer_code || cust.id.slice(0, 4).toUpperCase();

        invsPromise = supabase
          .from("tax_invoices")
          .select("id, customer_id, invoice_number, invoice_date, total_amount, status")
          .eq("customer_id", selectedCustomerId)
          .order("invoice_date", { ascending: true });
        paysPromise = supabase
          .from("payments")
          .select("id, customer_id, payment_number, payment_date, amount, payment_method, reference_number")
          .eq("customer_id", selectedCustomerId)
          .order("payment_date", { ascending: true });
        rcvsPromise = supabase
          .from("receipt_vouchers")
          .select("id, customer_id, voucher_number, voucher_date, amount, payment_method, cheque_number")
          .eq("customer_id", selectedCustomerId)
          .order("voucher_date", { ascending: true });
      } else {
        custName = customCustomer.name.trim();
        custTrn = customCustomer.trn?.trim() || null;
        custAddress = customCustomer.address?.trim() || null;
        custPhone = customCustomer.phone?.trim() || null;
        custCode = "CUST-DIRECT";

        invsPromise = supabase
          .from("tax_invoices")
          .select("id, customer_id, invoice_number, invoice_date, total_amount, status, customer_name")
          .ilike("customer_name", custName)
          .order("invoice_date", { ascending: true });
        paysPromise = Promise.resolve({ data: [] as any[], error: null });
        rcvsPromise = supabase
          .from("receipt_vouchers")
          .select("id, customer_id, voucher_number, voucher_date, amount, payment_method, cheque_number, customer_name, received_from")
          .or(`customer_name.ilike.%${custName}%,received_from.ilike.%${custName}%`)
          .order("voucher_date", { ascending: true });
      }

      const [{ data: invs, error: invoiceError }, { data: pays, error: paymentError }, { data: rcvs, error: receiptError }] = await Promise.all([
        invsPromise,
        paysPromise,
        rcvsPromise,
      ]);

      const queryError = invoiceError || paymentError || receiptError;
      if (queryError) throw new Error(queryError.message);
      if (version !== requestVersion.current) return;

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
      if ((p.status || "completed").toLowerCase() !== "completed") return;
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
    const stNumber = `SOA-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${custCode}`;

    const statementData: StatementData = {
      statement_number: stNumber,
      statement_date: todayISO(),
      from_date: fromDate || null,
      to_date: toDate || null,
      customer_name: custName,
      customer_trn: custTrn,
      customer_address: custAddress,
      customer_phone: custPhone,
      opening_balance: computedOpening,
      entries,
      closing_balance: currentBalance,
    };

    if (version === requestVersion.current) setStatement(statementData);
    } catch (err) {
      if (version === requestVersion.current) setLoadError(err instanceof Error ? err.message : "Could not load statement transactions.");
    } finally {
      if (version === requestVersion.current) setCalculating(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadInitialData);
  }, []);

  useEffect(() => {
    if ((partyMode === "existing" && selectedCustomerId) || (partyMode === "custom" && customCustomer.name.trim())) {
      void Promise.resolve().then(generateStatement);
    }
    return () => { requestVersion.current++; };
  }, [selectedCustomerId, fromDate, toDate, openingBalance, partyMode, customCustomer.name, customCustomer.trn, customCustomer.address, customCustomer.phone]);

  if (loading || calculating || loadError) return <ReportLoadState loading={loading || calculating} error={loadError} onRetry={() => void (customers.length ? generateStatement() : loadInitialData())} />;

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
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Mode</span>
              <p className="text-[11px] text-slate-400">Select an existing account or enter custom customer details directly</p>
            </div>
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setPartyMode("existing")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  partyMode === "existing"
                    ? "bg-white text-slate-900 font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Existing Customer
              </button>
              <button
                type="button"
                onClick={() => setPartyMode("custom")}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  partyMode === "custom"
                    ? "bg-white text-slate-900 font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Custom Customer
              </button>
            </div>
          </div>

          {partyMode === "existing" ? (
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
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                ✍️ <strong>Custom Customer Statement</strong>: Enter customer details directly. No entry will be added to your customer directory.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="md:col-span-2">
                  <label className="mb-1 block font-semibold text-slate-700">Customer / Company Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customCustomer.name}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Al-Futtaim Engineering LLC"
                    required
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">TRN (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.trn}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, trn: e.target.value }))}
                    placeholder="100XXXXXXXXX003"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Phone (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.phone}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+971 50 123 4567"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-semibold text-slate-700">Address / Location (Optional)</label>
                  <input
                    type="text"
                    value={customCustomer.address}
                    onChange={e => setCustomCustomer(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Plot / Street / Emirate"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none"
                  />
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
                <div className="md:col-span-2">
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
          )}
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
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
