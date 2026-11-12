"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany, generateDocNumber, todayISO } from "@/lib/helpers";
import {
  Wallet, Search, ArrowLeft, ArrowDownRight, ArrowUpRight,
  Loader2, X, Trash2, CheckCircle2, Printer
} from "lucide-react";
import PettyCashVoucherTemplate, { PettyCashVoucherData } from "@/components/documents/PettyCashVoucherTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

type PettyCashTx = {
  id: string;
  voucher_number: string;
  transaction_date: string;
  transaction_type: "DISBURSEMENT" | "REPLENISHMENT";
  payee: string;
  category: string;
  amount: number;
  balance_after: number;
  receipt_ref: string | null;
  description: string;
  approved_by: string | null;
  created_at: string;
};

const PETTY_CATEGORIES = [
  "Office Tea, Coffee & Pantry Supplies",
  "Courier, Postage & Delivery Charges",
  "Site Petrol, Salik & Transport Cash",
  "Minor Office Stationery & Printing",
  "Site Cleaning & Janitorial Consumables",
  "Urgent Minor Hardware & Tools",
  "Staff Emergency Advance",
  "Bank Cash Withdrawal (Replenishment)",
  "Other Petty Disbursement"
];

export default function PettyCashPage() {
  const [transactions, setTransactions] = useState<PettyCashTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [printVoucher, setPrintVoucher] = useState<PettyCashVoucherData | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [txType, setTxType] = useState<"DISBURSEMENT" | "REPLENISHMENT">("DISBURSEMENT");
  const [formDate, setFormDate] = useState(todayISO());
  const [formPayee, setFormPayee] = useState("");
  const [formCategory, setFormCategory] = useState(PETTY_CATEGORIES[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formReceiptRef, setFormReceiptRef] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formApprovedBy, setFormApprovedBy] = useState("Accounts Manager");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data, error } = await supabase
        .from("petty_cash_transactions")
        .select("*")
        .eq("company_id", companyId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);

      const co = await getCurrentCompany();
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Error loading petty cash transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate current cash float from latest entry or net sum
  const latestTx = transactions[0];
  const currentFloat = latestTx ? latestTx.balance_after : 0;

  function handleOpenCreate(type: "DISBURSEMENT" | "REPLENISHMENT") {
    setTxType(type);
    setFormDate(todayISO());
    setFormPayee(type === "REPLENISHMENT" ? "Bank Cash Withdrawal (Company Account)" : "");
    setFormCategory(type === "REPLENISHMENT" ? "Bank Cash Withdrawal (Replenishment)" : PETTY_CATEGORIES[0]);
    setFormAmount("");
    setFormReceiptRef("");
    setFormDescription(type === "REPLENISHMENT" ? "Petty cash float replenishment from bank withdrawal" : "");
    setFormApprovedBy("Accounts Manager");
    setErrorMsg("");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0.");
      return;
    }

    if (txType === "DISBURSEMENT" && amt > currentFloat) {
      if (!confirm(`Warning: Disbursement amount (AED ${amt}) exceeds current petty cash balance (AED ${currentFloat}). Continue?`)) {
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const prefix = txType === "REPLENISHMENT" ? "PCR" : "PCV";
      const voucherNum = await generateDocNumber(companyId, prefix);

      const newBalance = txType === "REPLENISHMENT"
        ? currentFloat + amt
        : currentFloat - amt;

      const { error } = await supabase
        .from("petty_cash_transactions")
        .insert({
          company_id: companyId,
          voucher_number: voucherNum,
          transaction_date: formDate,
          transaction_type: txType,
          payee: formPayee.trim(),
          category: formCategory,
          amount: amt,
          balance_after: newBalance,
          receipt_ref: formReceiptRef.trim() || null,
          description: formDescription.trim(),
          approved_by: formApprovedBy.trim() || null,
        });

      if (error) throw error;

      setSuccessMsg(`Petty cash ${txType.toLowerCase()} recorded. New float balance: AED ${newBalance.toFixed(2)}`);
      setShowModal(false);
      loadTransactions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record transaction.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this petty cash transaction?")) return;
    try {
      const { error } = await supabase.from("petty_cash_transactions").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Transaction deleted.");
      loadTransactions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete transaction.";
      alert(msg);
    }
  }

  const filtered = transactions.filter(t => {
    const matchType = typeFilter === "all" || t.transaction_type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      t.voucher_number.toLowerCase().includes(q) ||
      t.payee.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.receipt_ref || "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const totalDisbursed = transactions.filter(t => t.transaction_type === "DISBURSEMENT").reduce((acc, t) => acc + t.amount, 0);
  const totalReplenished = transactions.filter(t => t.transaction_type === "REPLENISHMENT").reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/expenses"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                <Wallet size={20} />
              </span>
              Petty Cash Float &amp; Vouchers
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage on-hand cash register, daily office disbursements, and bank replenishments</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenCreate("DISBURSEMENT")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium shadow-sm transition-colors"
          >
            <ArrowUpRight size={16} /> New Disbursement
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreate("REPLENISHMENT")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
          >
            <ArrowDownRight size={16} /> Top-Up Float
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {successMsg}
          </div>
          <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Current Cash Float Balance</p>
          <p className={`text-3xl font-bold mt-2 font-mono ${currentFloat < 200 ? "text-rose-600" : "text-amber-900"}`}>
            AED {currentFloat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-amber-600 mt-1">Available in office cash box</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Disbursed (Out)</p>
          <p className="text-2xl font-bold text-rose-600 mt-2 font-mono">
            AED {totalDisbursed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Daily vouchers &amp; expenses</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Replenished (In)</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">
            AED {totalReplenished.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Cash withdrawals from bank</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search voucher #, payee, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Transactions</option>
            <option value="DISBURSEMENT">Disbursements (Out)</option>
            <option value="REPLENISHMENT">Replenishments (In)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Voucher #</th>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Type</th>
                <th className="px-4 py-3 whitespace-nowrap">Payee / Source</th>
                <th className="px-4 py-3">Category &amp; Description</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount (AED)</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Running Balance (AED)</th>
                <th className="px-4 py-3 whitespace-nowrap">Approved By</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading petty cash ledger...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No petty cash transactions found. Click &quot;Top-Up Float&quot; or &quot;New Disbursement&quot; to begin.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const isReplenish = tx.transaction_type === "REPLENISHMENT";

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 font-mono whitespace-nowrap">
                        {tx.voucher_number}
                        {tx.receipt_ref && <span className="block text-[10px] text-slate-400 font-mono">Rec: {tx.receipt_ref}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {tx.transaction_date}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isReplenish
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {isReplenish ? "INFLOW" : "OUTFLOW"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {tx.payee}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-900">{tx.category}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{tx.description}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isReplenish ? "text-emerald-600" : "text-amber-600"}>
                          {isReplenish ? "+" : "-"}{tx.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {tx.balance_after.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {tx.approved_by || "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPrintVoucher({
                              voucher_number: tx.voucher_number,
                              transaction_date: tx.transaction_date,
                              transaction_type: tx.transaction_type,
                              payee: tx.payee,
                              category: tx.category,
                              amount: tx.amount,
                              balance_after: tx.balance_after,
                              receipt_ref: tx.receipt_ref,
                              description: tx.description,
                              approved_by: tx.approved_by,
                            })}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Print / View Voucher"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tx.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {txType === "REPLENISHMENT" ? "Top-Up Petty Cash Float" : "New Petty Cash Disbursement"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Voucher # (Auto-generated on save)
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Auto-generated on save"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono bg-slate-100 text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {txType === "REPLENISHMENT" ? "Funding Source / Account *" : "Payee Name *"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={txType === "REPLENISHMENT" ? "Bank Cash Withdrawal" : "Driver / Site Foreman / Office Assistant"}
                  value={formPayee}
                  onChange={(e) => setFormPayee(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {PETTY_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (AED) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Bill #</label>
                  <input
                    type="text"
                    placeholder="e.g. REC-1029"
                    value={formReceiptRef}
                    onChange={(e) => setFormReceiptRef(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Purpose *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Tea and milk for office pantry, courier fees to Abu Dhabi..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Approved By</label>
                <input
                  type="text"
                  value={formApprovedBy}
                  onChange={(e) => setFormApprovedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm ${
                    txType === "REPLENISHMENT"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                  {txType === "REPLENISHMENT" ? "Top-Up Float" : "Record Disbursement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT MODAL */}
      {printVoucher && (() => {
        const docFile = generateDocumentPdfFilename({
          documentType: "petty_cash_voucher",
          documentNumber: printVoucher.voucher_number || "PCV",
          customerName: printVoucher.payee,
          workDescription: printVoucher.description || printVoucher.category,
        });
        return (
          <PrintModal
            isOpen={Boolean(printVoucher)}
            onClose={() => setPrintVoucher(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <PettyCashVoucherTemplate
              company={company}
              voucher={printVoucher}
              onClose={() => setPrintVoucher(null)}
            />
          </PrintModal>
        );
      })()}
    </div>
  );
}
