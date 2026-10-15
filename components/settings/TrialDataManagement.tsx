"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Trash2, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

type CountsMap = Record<string, number>;

const CONFIRMATION_PHRASE = "DELETE 4dbb309a-f31c-4615-8bb5-59df7a6326e3";

const CLEANUP_TABLES = [
  { key: "measurement_items", label: "Measurement Items" },
  { key: "quotation_items", label: "Quotation Items" },
  { key: "tax_invoice_items", label: "Tax Invoice Items" },
  { key: "delivery_note_items", label: "Delivery Note Items" },
  { key: "purchase_order_items", label: "Purchase Order Items" },
  { key: "supplier_bill_items", label: "Supplier Bill Items" },
  { key: "cheque_status_history", label: "Cheque Status History" },
  { key: "proforma_invoice_items", label: "Proforma Invoice Items" },
  { key: "quotations", label: "Quotations" },
  { key: "tax_invoices", label: "Tax Invoices" },
  { key: "delivery_notes", label: "Delivery Notes" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "supplier_bills", label: "Supplier Bills" },
  { key: "expenses", label: "Expenses" },
  { key: "payments", label: "Payments" },
  { key: "petty_cash_transactions", label: "Petty Cash Transactions" },
  { key: "receipt_vouchers", label: "Receipt Vouchers" },
  { key: "employee_payment_vouchers", label: "Employee Payment Vouchers" },
  { key: "cheques", label: "Cheques" },
  { key: "measurement_projects", label: "Measurement Projects" },
  { key: "proforma_invoices", label: "Proforma Invoices" },
  { key: "projects", label: "Projects" },
];

export default function TrialDataManagement({ companyId }: { companyId: string }) {
  const [counts, setCounts] = useState<CountsMap>({});
  const [loading, setLoading] = useState(true);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result: CountsMap = {};
    try {
      for (const t of CLEANUP_TABLES) {
        const { count, error } = await supabase
          .from(t.key as unknown as Parameters<typeof supabase.from>[0])
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId);
        if (error) {
          result[t.key] = 0;
        } else {
          result[t.key] = count ?? 0;
        }
      }
      setCounts(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch counts");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      void Promise.resolve().then(fetchCounts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleDryRun = async () => {
    if (!userId) return;
    setDryRunLoading(true);
    setError(null);
    try {
      await fetchCounts();
      const { error: rpcError } = await supabase.rpc("record_admin_audit", {
        p_company_id: companyId,
        p_actor_user_id: userId,
        p_action_type: "trial_data_cleanup",
        p_action_details: { operation: "dry_run" },
        p_record_counts: counts,
        p_is_dry_run: true,
      });
      if (rpcError) throw rpcError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dry run failed");
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!userId || confirmationInput.trim().toUpperCase() !== "DELETE") {
      setError("Please type DELETE to confirm");
      return;
    }
    setExecuteLoading(true);
    setError(null);
    try {
      await fetchCounts();
      const { data: audit, error: rpcError } = await supabase.rpc("record_admin_audit", {
        p_company_id: companyId,
        p_actor_user_id: userId,
        p_action_type: "trial_data_cleanup",
        p_action_details: { operation: "execute" },
        p_record_counts: counts,
        p_is_dry_run: false,
        p_confirmation_token: confirmationInput.trim(),
      });
      if (rpcError) throw rpcError;
      setAuditId(audit);
      setShowConfirm(false);
      setConfirmationInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setExecuteLoading(false);
    }
  };

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-amber-600 p-2 text-white">
          <ShieldAlert size={18} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Trial Data Management</h2>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Scan and clean up trial operational data for this company. All actions are audited in the admin audit log.
      </p>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={handleDryRun} disabled={dryRunLoading || loading} className="flex items-center gap-2 rounded-lg bg-white border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60">
          {dryRunLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Dry Run Scan
        </button>
        <button onClick={() => setShowConfirm(true)} disabled={totalRecords === 0} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
          <Trash2 size={16} />
          Execute Cleanup
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" /> Loading counts...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-slate-700">Table</th>
                <th className="text-right py-2 font-medium text-slate-700">Records</th>
              </tr>
            </thead>
            <tbody>
              {CLEANUP_TABLES.map(t => (
                <tr key={t.key} className="border-b border-slate-200">
                  <td className="py-2">{t.label}</td>
                  <td className="py-2 text-right font-mono">{counts[t.key] ?? 0}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right font-mono">{totalRecords}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {auditId && (
        <div className="mt-4 text-xs text-slate-600">
          Last audit ID: <span className="font-mono">{auditId}</span>
        </div>
      )}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-red-700">
              <AlertTriangle size={20} />
              <h3 className="text-lg font-semibold">Confirm Trial Data Cleanup</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              This will record a cleanup action for {totalRecords} records. Type <span className="font-mono font-bold">DELETE</span> to confirm.
            </p>
            <input value={confirmationInput} onChange={e => setConfirmationInput(e.target.value)} placeholder="Type DELETE" className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowConfirm(false); setConfirmationInput(""); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleExecute} disabled={executeLoading || confirmationInput.trim().toUpperCase() !== "DELETE"} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {executeLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

