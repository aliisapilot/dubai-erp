/**
 * Cheque Management & Automatic Reminders: Canonical Types & Helpers
 * =================================================================
 * Enforces database check constraints, status flows, UAE bank catalog,
 * and date calculation logic.
 */

export type ChequeType = "incoming" | "outgoing";

export type ChequeStatus = "pending" | "deposited" | "cleared" | "bounced" | "cancelled";

export type ChequeReminderType =
  | "7_days_before"
  | "3_days_before"
  | "1_day_before"
  | "due_today"
  | "overdue";

export interface ChequeRecord {
  id: string;
  company_id: string;
  cheque_type: ChequeType;
  cheque_number: string;
  bank_name: string;
  branch_name: string | null;
  amount: number;
  issue_date: string;
  due_date: string;
  customer_id: string | null;
  supplier_id: string | null;
  payee_name: string | null;
  tax_invoice_id: string | null;
  supplier_bill_id: string | null;
  payment_id: string | null;
  is_payment_recorded: boolean;
  status: ChequeStatus;
  deposit_date: string | null;
  deposit_bank_account: string | null;
  clearance_date: string | null;
  clearance_reference: string | null;
  bounce_date: string | null;
  bounce_reason: string | null;
  cancellation_date: string | null;
  cancellation_reason: string | null;
  responsible_employee_id: string | null;
  responsible_employee_name: string | null;
  notes: string | null;
  cheque_image_front_url: string | null;
  cheque_image_back_url: string | null;
  deposit_slip_url: string | null;
  bounce_slip_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined counterparty data
  customer?: { id: string; name: string | null; customer_code?: string | null; trn?: string | null; phone?: string | null } | null;
  supplier?: { id: string; name: string | null; supplier_code?: string | null; trn?: string | null; phone?: string | null } | null;
  tax_invoice?: { id: string; invoice_number: string | null; total_amount: number | null } | null;
  supplier_bill?: { id: string; bill_number: string | null; total_amount: number | null; paid_amount: number | null } | null;
}

export interface ChequeStatusHistoryRecord {
  id: string;
  company_id: string;
  cheque_id: string;
  from_status: ChequeStatus | null;
  to_status: ChequeStatus;
  action_date: string;
  action_by: string | null;
  action_by_name: string | null;
  notes: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ChequeReminderRecord {
  id: string;
  company_id: string;
  cheque_id: string;
  reminder_type: ChequeReminderType;
  due_date: string;
  recipient_email: string | null;
  channel: "in_app" | "email" | "both";
  notification_title: string;
  notification_message: string;
  status: "pending" | "sent" | "failed" | "read" | "dismissed";
  sent_at: string | null;
  read_at: string | null;
  delivery_error: string | null;
  retry_count: number;
  created_at: string;
  cheque?: ChequeRecord;
}

export interface ChequeFormInput {
  cheque_type: ChequeType;
  cheque_number: string;
  bank_name: string;
  branch_name: string;
  amount: string;
  issue_date: string;
  due_date: string;
  customer_id: string;
  supplier_id: string;
  payee_name: string;
  tax_invoice_id: string;
  supplier_bill_id: string;
  responsible_employee_id: string;
  responsible_employee_name: string;
  notes: string;
  cheque_image_front_url: string;
  cheque_image_back_url: string;
  deposit_slip_url: string;
  bounce_slip_url: string;
}

/**
 * Standard list of licensed Commercial and Islamic Banks operating in the UAE
 */
export const UAE_BANKS = [
  "Emirates NBD",
  "Abu Dhabi Commercial Bank (ADCB)",
  "Dubai Islamic Bank (DIB)",
  "First Abu Dhabi Bank (FAB)",
  "Mashreq Bank",
  "Abu Dhabi Islamic Bank (ADIB)",
  "Commercial Bank of Dubai (CBD)",
  "RAKBANK (National Bank of Ras Al Khaimah)",
  "Sharjah Islamic Bank (SIB)",
  "National Bank of Fujairah (NBF)",
  "Bank of Sharjah",
  "Ajman Bank",
  "Emirates Islamic Bank",
  "Standard Chartered Bank UAE",
  "HSBC Bank Middle East",
  "Citibank UAE",
  "Habib Bank AG Zurich",
  "Other UAE Bank",
] as const;

export interface StatusMeta {
  value: ChequeStatus;
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
}

export const CHEQUE_STATUS_CONFIG: Record<ChequeStatus, StatusMeta> = {
  pending: {
    value: "pending",
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-500",
    description: "In hand or issued, awaiting deposit or maturity date",
  },
  deposited: {
    value: "deposited",
    label: "Deposited",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    dotClass: "bg-blue-500",
    description: "Deposited into bank account, clearing in process",
  },
  cleared: {
    value: "cleared",
    label: "Cleared",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotClass: "bg-emerald-500",
    description: "Funds credited or debited by the bank",
  },
  bounced: {
    value: "bounced",
    label: "Bounced",
    badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
    dotClass: "bg-rose-500",
    description: "Dishonoured / returned unpaid by bank",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    dotClass: "bg-slate-400",
    description: "Voided or cancelled by mutual consent",
  },
};

export function formatChequeStatus(status: string | null | undefined): string {
  if (!status) return "Pending";
  const s = status.toLowerCase() as ChequeStatus;
  return CHEQUE_STATUS_CONFIG[s]?.label || status;
}

export function chequeStatusBadge(status: string | null | undefined): string {
  if (!status) return CHEQUE_STATUS_CONFIG.pending.badgeClass;
  const s = status.toLowerCase() as ChequeStatus;
  return CHEQUE_STATUS_CONFIG[s]?.badgeClass || "bg-slate-100 text-slate-700 border border-slate-200";
}

export function formatChequeType(type: string | null | undefined): string {
  if (type === "incoming") return "Incoming (Customer)";
  if (type === "outgoing") return "Outgoing (Supplier)";
  return "Cheque";
}

/**
 * Calculates calendar day difference between target date and today.
 * Negative number means overdue.
 */
export function getDaysDifference(targetDate: string, baseDate = new Date()): number {
  if (!targetDate) return 0;
  const t = new Date(targetDate);
  t.setHours(0, 0, 0, 0);
  const b = new Date(baseDate);
  b.setHours(0, 0, 0, 0);
  const diffMs = t.getTime() - b.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function isChequeOverdue(dueDate: string, status: ChequeStatus): boolean {
  if (status === "cleared" || status === "cancelled") return false;
  return getDaysDifference(dueDate) < 0;
}

export function isDueToday(dueDate: string): boolean {
  return getDaysDifference(dueDate) === 0;
}

export interface ChequeUrgency {
  label: string;
  badgeClass: string;
  days: number;
  isOverdue: boolean;
  isDueToday: boolean;
}

export function getChequeUrgency(dueDate: string, status: ChequeStatus): ChequeUrgency {
  const days = getDaysDifference(dueDate);
  if (status === "cleared") {
    return { label: "Settled", badgeClass: "bg-slate-100 text-slate-500", days, isOverdue: false, isDueToday: false };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", badgeClass: "bg-slate-100 text-slate-400", days, isOverdue: false, isDueToday: false };
  }
  if (status === "bounced") {
    return { label: "Dishonoured", badgeClass: "bg-rose-100 text-rose-800 font-bold", days, isOverdue: true, isDueToday: false };
  }

  if (days < 0) {
    return {
      label: `${Math.abs(days)}d Overdue`,
      badgeClass: "bg-red-50 text-red-700 border border-red-200 font-semibold",
      days,
      isOverdue: true,
      isDueToday: false,
    };
  }
  if (days === 0) {
    return {
      label: "Due Today",
      badgeClass: "bg-amber-100 text-amber-800 border border-amber-300 font-bold animate-pulse",
      days,
      isOverdue: false,
      isDueToday: true,
    };
  }
  if (days === 1) {
    return {
      label: "Due Tomorrow",
      badgeClass: "bg-amber-50 text-amber-700 border border-amber-200 font-medium",
      days,
      isOverdue: false,
      isDueToday: false,
    };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days} days`,
      badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
      days,
      isOverdue: false,
      isDueToday: false,
    };
  }
  return {
    label: `Due in ${days} days`,
    badgeClass: "bg-slate-50 text-slate-600 border border-slate-200",
    days,
    isOverdue: false,
    isDueToday: false,
  };
}

export interface ChequeDashboardMetrics {
  totalIncomingCount: number;
  totalIncomingAmount: number;
  totalOutgoingCount: number;
  totalOutgoingAmount: number;
  netPosition: number; // Incoming - Outgoing
  pendingAmount: number;
  depositedAmount: number;
  clearedAmount: number;
  bouncedAmount: number;
  overdueAmount: number;
  overdueCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
}

export function computeChequeMetrics(cheques: ChequeRecord[]): ChequeDashboardMetrics {
  let totalIncomingCount = 0;
  let totalIncomingAmount = 0;
  let totalOutgoingCount = 0;
  let totalOutgoingAmount = 0;
  let pendingAmount = 0;
  let depositedAmount = 0;
  let clearedAmount = 0;
  let bouncedAmount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;
  let dueThisWeekCount = 0;

  for (const c of cheques) {
    const amt = Number(c.amount) || 0;
    const isInc = c.cheque_type === "incoming";
    const days = getDaysDifference(c.due_date);

    if (isInc) {
      totalIncomingCount++;
      totalIncomingAmount += amt;
    } else {
      totalOutgoingCount++;
      totalOutgoingAmount += amt;
    }

    if (c.status === "pending") pendingAmount += amt;
    else if (c.status === "deposited") depositedAmount += amt;
    else if (c.status === "cleared") clearedAmount += amt;
    else if (c.status === "bounced") bouncedAmount += amt;

    if (isChequeOverdue(c.due_date, c.status)) {
      overdueAmount += amt;
      overdueCount++;
    } else if (c.status !== "cleared" && c.status !== "cancelled") {
      if (days === 0) dueTodayCount++;
      if (days > 0 && days <= 7) dueThisWeekCount++;
    }
  }

  return {
    totalIncomingCount,
    totalIncomingAmount,
    totalOutgoingCount,
    totalOutgoingAmount,
    netPosition: totalIncomingAmount - totalOutgoingAmount,
    pendingAmount,
    depositedAmount,
    clearedAmount,
    bouncedAmount,
    overdueAmount,
    overdueCount,
    dueTodayCount,
    dueThisWeekCount,
  };
}
