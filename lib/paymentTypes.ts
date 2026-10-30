/**
 * Canonical Payment Types, Payment Methods, and Error Helpers
 * ===========================================================
 * Database constraints on public.payments:
 * - payments_payment_type_check:
 *     CHECK (payment_type IN ('customer_receipt', 'supplier_payment', 'other_payment'))
 * - payments_payment_method_check:
 *     CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'card', 'online', 'other'))
 */

export type PaymentType = "customer_receipt" | "supplier_payment" | "other_payment";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "card" | "online" | "other";

export interface PaymentTypeOption {
  value: PaymentType;
  label: string;
  badgeClass: string;
  description: string;
}

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

export const PAYMENT_TYPE_OPTIONS: readonly PaymentTypeOption[] = [
  {
    value: "customer_receipt",
    label: "Customer Receipt (Inbound)",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    description: "Received payment from customer for sales invoices or advance",
  },
  {
    value: "supplier_payment",
    label: "Supplier Payment (Outbound)",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    description: "Disbursement made to supplier for bills or purchase orders",
  },
  {
    value: "other_payment",
    label: "Other Payment / Receipt",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    description: "General or miscellaneous cash/bank movement",
  },
] as const;

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Credit / Debit Card" },
  { value: "online", label: "Online / Payment Gateway" },
  { value: "other", label: "Other Method" },
] as const;

/**
 * Normalizes payment_type to one of the canonical database check constraint values.
 */
export function normalizePaymentType(type: unknown): PaymentType {
  if (!type) return "customer_receipt";
  const s = String(type).trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (s) {
    case "customer":
    case "customer_receipt":
    case "inbound":
    case "in":
    case "incoming":
    case "receipt":
    case "receive":
      return "customer_receipt";

    case "supplier":
    case "supplier_payment":
    case "outbound":
    case "out":
    case "outgoing":
    case "disbursement":
    case "pay":
    case "payment":
      return "supplier_payment";

    case "other":
    case "other_payment":
    case "general":
      return "other_payment";

    default:
      return "customer_receipt";
  }
}

/**
 * Formats canonical payment_type into user-friendly UI label.
 */
export function formatPaymentType(type: unknown): string {
  const norm = normalizePaymentType(type);
  const found = PAYMENT_TYPE_OPTIONS.find((o) => o.value === norm);
  return found ? found.label : "Payment";
}

/**
 * Normalizes payment_method to canonical lowercase check constraint values.
 */
export function normalizePaymentMethod(method: unknown): PaymentMethod {
  if (!method) return "bank_transfer";
  const s = String(method).trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (s) {
    case "bank_transfer":
    case "bank":
    case "transfer":
    case "wire":
    case "wire_transfer":
      return "bank_transfer";

    case "cash":
    case "petty_cash":
      return "cash";

    case "cheque":
    case "check":
    case "pdc":
      return "cheque";

    case "card":
    case "credit_card":
    case "debit_card":
    case "pos":
      return "card";

    case "online":
    case "gateway":
    case "stripe":
      return "online";

    case "other":
    default:
      return "other";
  }
}

/**
 * Formats canonical payment_method into user-friendly UI label.
 */
export function formatPaymentMethod(method: unknown): string {
  const norm = normalizePaymentMethod(method);
  const found = PAYMENT_METHOD_OPTIONS.find((o) => o.value === norm);
  return found ? found.label : "Bank Transfer";
}

export interface StructuredDatabaseError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Universal error formatter for database write operations.
 * Logs full structured diagnostic details to the console during development,
 * and extracts a safe, clean, informative string for the UI without leaking secrets.
 */
export function parseDatabaseError(error: unknown, fallbackMessage = "Failed to save record"): string {
  if (!error) return fallbackMessage;

  let message = "";
  let code: string | undefined;
  let details: string | null | undefined;
  let hint: string | null | undefined;

  if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    message = String(errObj.message || errObj.error_description || fallbackMessage);
    code = errObj.code ? String(errObj.code) : undefined;
    details = errObj.details ? String(errObj.details) : undefined;
    hint = errObj.hint ? String(errObj.hint) : undefined;
  } else {
    message = String(error);
  }

  // Developer diagnostic logging (structured, clean)
  if (process.env.NODE_ENV !== "production") {
    console.error("[Database Write Operation Diagnostic]", {
      code,
      message,
      details,
      hint,
    });
  }

  // Translate specific PostgreSQL check constraint violations into helpful user messages
  if (message.includes("payments_payment_method_check")) {
    return "Invalid payment method. Supported methods are: Bank Transfer, Cash, Cheque, Card, Online, or Other.";
  }
  if (message.includes("payments_payment_type_check")) {
    return "Invalid payment type. Supported types are: Customer Receipt, Supplier Payment, or Other Payment.";
  }
  if (message.includes("proforma_invoices_status_check")) {
    return "Invalid proforma invoice status. Allowed values are: Draft, Sent, Accepted, Invoiced, or Cancelled.";
  }
  if (message.includes("quotations_status_check")) {
    return "Invalid quotation status. Allowed values are: Draft, Sent, Accepted, Rejected, or Expired.";
  }
  if (message.includes("tax_invoices_status_check")) {
    return "Invalid tax invoice status. Allowed values are: Draft, Issued, Overdue, Paid, Partially Paid, or Cancelled.";
  }
  if (message.includes("salary_statements_status_check")) {
    return "Invalid salary statement status. Allowed values are: Draft, Paid, or Cancelled.";
  }
  if (message.includes("purchase_orders_status_check")) {
    return "Invalid purchase order status. Allowed values are: Draft, Confirmed, Sent, Partially Received, Received, or Cancelled.";
  }
  if (message.includes("delivery_notes_status_check")) {
    return "Invalid delivery note status. Allowed values are: Draft, Delivered, or Cancelled.";
  }
  if (message.includes("violates check constraint")) {
    const match = message.match(/violates check constraint "([^"]+)"/);
    const constraint = match ? match[1] : "check constraint";
    return `Validation error: values violated database rule (${constraint}).`;
  }
  if (message.includes("violates not-null constraint")) {
    const match = message.match(/column "([^"]+)"/);
    const col = match ? match[1] : "required field";
    if (col === "customer_id") {
      return "Missing customer selection: 'customer_id' cannot be empty. Please select an existing customer or apply the database migration for custom customers.";
    }
    return `Missing required information: '${col}' cannot be empty.`;
  }
  if (message.includes("violates foreign key constraint")) {
    return "Referenced record (such as customer, supplier, or project) was not found in the system.";
  }
  if (message.includes("duplicate key value") || message.includes("unique constraint")) {
    return "A record with this reference number already exists. Please use a unique number.";
  }

  return message || fallbackMessage;
}
