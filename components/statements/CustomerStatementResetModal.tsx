"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  ShieldCheck,
  Download,
  RotateCcw,
  CheckCircle2,
  Loader2,
  History,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtAED, todayISO, getCompanyId } from "@/lib/helpers";
import type { StatementData } from "@/components/documents/StatementOfAccountTemplate";

interface CustomerStatementResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  customerCode?: string;
  currentOpeningBalance: number;
  statement: StatementData | null;
  onResetComplete: (newBalance: number) => void;
}

interface RollbackSnapshot {
  customerId: string;
  customerName: string;
  previousBalance: number;
  resetAt: string;
  userEmail?: string;
  statementClosingBalance?: number;
}

export default function CustomerStatementResetModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerCode,
  currentOpeningBalance,
  statement,
  onResetComplete,
}: CustomerStatementResetModalProps) {
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [existingRollback, setExistingRollback] = useState<RollbackSnapshot | null>(null);

  // Check for available rollback snapshot
  useEffect(() => {
    if (!isOpen || !customerId) return;
    let isMounted = true;
    queueMicrotask(() => {
      if (!isMounted) return;
      try {
        const stored = localStorage.getItem(`dubai-erp.customer-statement-rollback.${customerId}`);
        if (stored) {
          setExistingRollback(JSON.parse(stored));
        } else {
          setExistingRollback(null);
        }
      } catch {
        setExistingRollback(null);
      }
      setHasDownloadedBackup(false);
      setConfirmCheckbox(false);
      setConfirmText("");
      setErrorMessage("");
      setSuccessMessage("");
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, customerId]);

  if (!isOpen) return null;

  const totalDebits = statement?.total_debits ?? statement?.entries.reduce((s, e) => s + e.debit, 0) ?? 0;
  const totalCredits = statement?.total_credits ?? statement?.entries.reduce((s, e) => s + e.credit, 0) ?? 0;
  const invoiceCount = statement?.entries.filter((e) => e.debit > 0).length ?? 0;
  const paymentCount = statement?.entries.filter((e) => e.credit > 0).length ?? 0;

  // Calculation of proposed balance after resetting opening balance to 0
  const currentClosing = statement?.closing_balance ?? currentOpeningBalance;
  const proposedClosing = totalDebits - totalCredits;

  const canExecuteReset =
    hasDownloadedBackup &&
    confirmCheckbox &&
    confirmText.trim().toUpperCase() === "RESET" &&
    !resetting;

  function handleDownloadBackup() {
    try {
      const backupData = {
        app: "Dubai ERP",
        version: "1.0",
        backupType: "customer_statement_snapshot",
        exportedAt: new Date().toISOString(),
        customer: {
          id: customerId,
          name: customerName,
          code: customerCode || "—",
          savedOpeningBalance: currentOpeningBalance,
        },
        statementSnapshot: {
          statementNumber: statement?.statement_number,
          statementDate: statement?.statement_date,
          openingBalance: statement?.opening_balance ?? currentOpeningBalance,
          closingBalance: statement?.closing_balance,
          totalDebits,
          totalCredits,
          entriesCount: statement?.entries.length || 0,
          entries: statement?.entries || [],
        },
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statement_Backup_${customerName.replace(/[^a-zA-Z0-9]/g, "_")}_${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setHasDownloadedBackup(true);
      setErrorMessage("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to generate backup file.");
    }
  }

  async function handleExecuteReset() {
    if (!canExecuteReset) return;
    setResetting(true);
    setErrorMessage("");

    try {
      const companyId = await getCompanyId().catch(() => null);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      // 1. Create durable rollback snapshot before mutation
      const snapshot: RollbackSnapshot = {
        customerId,
        customerName,
        previousBalance: currentOpeningBalance,
        resetAt: new Date().toISOString(),
        userEmail: user?.email || "Current User",
        statementClosingBalance: currentClosing,
      };

      try {
        localStorage.setItem(
          `dubai-erp.customer-statement-rollback.${customerId}`,
          JSON.stringify(snapshot)
        );
        setExistingRollback(snapshot);
      } catch (storageErr) {
        console.warn("Could not write rollback snapshot to localStorage:", storageErr);
      }

      // 2. Safe non-destructive update: reset opening_balance to 0 on customers table
      const { error: custErr } = await supabase
        .from("customers")
        .update({
          opening_balance: 0,
          opening_balance_date: todayISO(),
        })
        .eq("id", customerId);

      if (custErr) {
        throw new Error(`Failed to update customer opening balance: ${custErr.message}`);
      }

      // 3. Log audit entry in customer_opening_balance_history
      if (companyId) {
        try {
          await supabase.from("customer_opening_balance_history").insert({
            company_id: companyId,
            customer_id: customerId,
            old_amount: currentOpeningBalance,
            new_amount: 0,
            reason: `Fresh Start Reset: customer statement cutover balance reset to 0 for fresh historical SOA import. Backup snapshot preserved.`,
            created_by: user?.id || null,
            user_email: user?.email || "Current User",
          });
        } catch (auditErr) {
          console.warn("Could not insert into customer_opening_balance_history:", auditErr);
        }
      }

      setSuccessMessage(
        `Statement workspace successfully reset for ${customerName}! Opening balance set to AED 0.00. Live invoices (${invoiceCount}) and payments (${paymentCount}) are completely preserved.`
      );

      onResetComplete(0);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  async function handleRestorePreviousSnapshot() {
    if (!existingRollback) return;
    setRestoring(true);
    setErrorMessage("");

    try {
      const targetBal = existingRollback.previousBalance;
      const companyId = await getCompanyId().catch(() => null);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      // 1. Restore customer opening balance in Supabase
      const { error: custErr } = await supabase
        .from("customers")
        .update({
          opening_balance: targetBal,
          opening_balance_date: todayISO(),
        })
        .eq("id", customerId);

      if (custErr) {
        throw new Error(`Failed to restore opening balance: ${custErr.message}`);
      }

      // 2. Log restoration in audit history
      if (companyId) {
        try {
          await supabase.from("customer_opening_balance_history").insert({
            company_id: companyId,
            customer_id: customerId,
            old_amount: 0,
            new_amount: targetBal,
            reason: `Rollback / Restoration: Restored previous opening balance (${fmtAED(targetBal)}) from snapshot dated ${existingRollback.resetAt}.`,
            created_by: user?.id || null,
            user_email: user?.email || "Current User",
          });
        } catch (auditErr) {
          console.warn("Could not log restoration audit:", auditErr);
        }
      }

      // 3. Clear rollback snapshot
      localStorage.removeItem(`dubai-erp.customer-statement-rollback.${customerId}`);
      setExistingRollback(null);

      setSuccessMessage(`Successfully restored previous balance: ${fmtAED(targetBal)}!`);
      onResetComplete(targetBal);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Restoration failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-rose-950/80 p-2 text-rose-400 border border-rose-800/60">
              <RotateCcw size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Fresh Start / Reset Customer Statement</h3>
              <p className="text-xs text-slate-400">
                Customer: <span className="text-slate-200 font-semibold">{customerName}</span> {customerCode ? `(${customerCode})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {/* Safety Notice: Zero destructive deletes */}
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-emerald-300 block text-sm">
                  Financial Source Records 100% Protected
                </span>
                <p className="text-emerald-200/90 leading-relaxed">
                  This reset operation <strong>NEVER deletes</strong> invoices, payments, or receipt vouchers.
                  It resets the customer&apos;s initial cutover opening balance to <strong>AED 0.00</strong> so you can cleanly rebuild their ledger from imported historical SOA files.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] font-mono">
                  <div className="bg-slate-900/60 p-2 rounded border border-emerald-800/40">
                    <span className="text-slate-400 block text-[10px]">Tax Invoices</span>
                    <span className="font-bold text-emerald-300">{invoiceCount} Protected (Safe)</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded border border-emerald-800/40">
                    <span className="text-slate-400 block text-[10px]">Receipts/Payments</span>
                    <span className="font-bold text-emerald-300">{paymentCount} Protected (Safe)</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded border border-emerald-800/40">
                    <span className="text-slate-400 block text-[10px]">Opening Balance</span>
                    <span className="font-bold text-rose-300">Resets to AED 0.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rollback Available Banner */}
          {existingRollback && (
            <div className="rounded-xl border border-purple-800/60 bg-purple-950/40 p-4 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold text-purple-300 flex items-center gap-1.5 text-xs">
                  <History size={14} /> Previous Reset Snapshot Available
                </span>
                <p className="text-[11px] text-purple-200">
                  A snapshot from {new Date(existingRollback.resetAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} is stored with previous balance of{" "}
                  <strong>{fmtAED(existingRollback.previousBalance)}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestorePreviousSnapshot}
                disabled={restoring}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Rollback to Snapshot
              </button>
            </div>
          )}

          {/* Before & After Balance Preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-850/80 p-4 space-y-3">
            <span className="font-bold text-slate-200 block text-xs uppercase tracking-wider">
              Statement Balance Preview
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Current */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-700/60 space-y-1.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Statement</span>
                <div className="flex justify-between text-slate-300">
                  <span>Opening Cutover:</span>
                  <span className="font-mono font-bold text-white">{fmtAED(currentOpeningBalance)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Invoices ({invoiceCount}):</span>
                  <span className="font-mono font-medium text-rose-400">+{fmtAED(totalDebits)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Payments ({paymentCount}):</span>
                  <span className="font-mono font-medium text-emerald-400">−{fmtAED(totalCredits)}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold">
                  <span>Closing Balance:</span>
                  <span className="font-mono text-rose-300 text-sm">{fmtAED(currentClosing)}</span>
                </div>
              </div>

              {/* Proposed After Reset */}
              <div className="bg-slate-900 p-3 rounded-lg border border-cyan-800/60 space-y-1.5">
                <span className="text-[10px] text-cyan-400 font-bold uppercase block">After Fresh Start</span>
                <div className="flex justify-between text-slate-300">
                  <span>Opening Cutover:</span>
                  <span className="font-mono font-bold text-cyan-300">AED 0.00</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Invoices ({invoiceCount}):</span>
                  <span className="font-mono font-medium text-rose-400">+{fmtAED(totalDebits)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Payments ({paymentCount}):</span>
                  <span className="font-mono font-medium text-emerald-400">−{fmtAED(totalCredits)}</span>
                </div>
                <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold">
                  <span>New Closing Balance:</span>
                  <span className="font-mono text-cyan-300 text-sm">{fmtAED(proposedClosing)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 1: Mandatory Backup */}
          <div className="rounded-xl border border-slate-800 bg-slate-850 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-200 block text-xs">
                  Step 1: Download Complete Statement Backup
                </span>
                <p className="text-[11px] text-slate-400">
                  Export full customer statement snapshot and history before any reset.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadBackup}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-sm cursor-pointer ${
                  hasDownloadedBackup
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700 hover:bg-emerald-900"
                    : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-600"
                }`}
              >
                {hasDownloadedBackup ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span>Backup Downloaded ✓</span>
                  </>
                ) : (
                  <>
                    <Download size={13} className="text-cyan-400" />
                    <span>Download Backup (JSON)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Confirmation Gate */}
          <div className="rounded-xl border border-slate-800 bg-slate-850 p-4 space-y-3">
            <span className="font-bold text-slate-200 block text-xs">
              Step 2: Explicit Confirmation Gate
            </span>

            <label className="flex items-start gap-2.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0"
              />
              <span className="leading-relaxed text-[11px]">
                I confirm that I want to reset the initial cutover balance to <strong>AED 0.00</strong> for{" "}
                <strong>{customerName}</strong>. I understand all live invoices and payments remain safe.
              </span>
            </label>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 block">
                Type <strong className="text-rose-400 font-mono">RESET</strong> to unlock execution:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono font-bold text-xs text-white focus:border-rose-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-950/70 border border-rose-800 p-3 text-rose-300">
              <AlertTriangle size={15} className="text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-950/70 border border-emerald-800 p-3 text-emerald-300">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-850 border-t border-slate-800 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteReset}
            disabled={!canExecuteReset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 font-bold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {resetting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <RotateCcw size={14} />
                <span>Execute Fresh Start Reset</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

