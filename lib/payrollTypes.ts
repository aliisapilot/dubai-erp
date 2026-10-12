/**
 * Canonical Salary Statement Status Definitions & Normalization
 * =============================================================
 * Database Constraint (salary_statements_status_check):
 *   CHECK (status IN ('draft', 'approved', 'paid'))
 */

export type SalaryStatementStatus = "draft" | "approved" | "paid";

export interface SalaryStatusOption {
  value: SalaryStatementStatus;
  label: string;
  badgeClass: string;
  description: string;
}

export const SALARY_STATEMENT_STATUS_OPTIONS: readonly SalaryStatusOption[] = [
  {
    value: "draft",
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    description: "Initial payroll preparation, editable by accountant/HR",
  },
  {
    value: "approved",
    label: "Approved",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    description: "Audited and approved for salary disbursement",
  },
  {
    value: "paid",
    label: "Paid",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    description: "Payment disbursed via bank transfer, cash, or cheque",
  },
] as const;

/**
 * Normalizes any incoming status (including legacy TitleCase or variants)
 * to a strictly valid database status ('draft' | 'approved' | 'paid').
 */
export function normalizeSalaryStatementStatus(status: unknown): SalaryStatementStatus {
  if (!status) return "draft";
  const s = String(status).trim().toLowerCase();
  if (s === "draft") return "draft";
  if (s === "approved" || s === "reviewed" || s === "review") return "approved";
  if (s === "paid" || s === "finalized" || s === "final" || s === "completed") return "paid";
  return "draft";
}

/**
 * Formats canonical status into human-friendly label ("Draft", "Approved", "Paid").
 */
export function formatSalaryStatementStatus(status: unknown): string {
  const norm = normalizeSalaryStatementStatus(status);
  const opt = SALARY_STATEMENT_STATUS_OPTIONS.find((o) => o.value === norm);
  return opt ? opt.label : "Draft";
}

/**
 * Checks whether a salary statement status represents a finalized/disbursed payroll record.
 */
export function isSalaryStatementPaid(status: unknown): boolean {
  const norm = normalizeSalaryStatementStatus(status);
  return norm === "paid";
}

/**
 * Returns user-friendly message for PostgreSQL check constraint errors.
 */
export function parseSalaryStatementError(error: unknown): string {
  if (!error) return "An unexpected error occurred.";
  const msg = typeof error === "string" ? error : (error as { message?: string }).message || String(error);

  if (msg.includes("salary_statements_status_check")) {
    return "Invalid salary statement status. Supported statuses are Draft, Approved, and Paid.";
  }
  if (msg.includes("salary_statements_payroll_month_check") || (msg.includes("payroll_month") && msg.includes("check constraint"))) {
    return "Invalid payroll month. Please provide a valid date in YYYY-MM-01 format.";
  }
  if (msg.includes("schema cache") || (msg.includes("Could not find the") && msg.includes("column"))) {
    return "Database schema column missing or schema cache syncing. Please execute the latest database migration.";
  }
  if (msg.includes("check constraint")) {
    return "Validation error: one or more fields violated database integrity constraints.";
  }
  return msg;
}
