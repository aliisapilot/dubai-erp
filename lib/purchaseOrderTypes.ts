/**
 * Canonical Purchase Order Status Definitions & Normalization
 * ==========================================================
 * Database Constraint (purchase_orders_status_check):
 *   CHECK (status IN ('draft', 'confirmed', 'sent', 'partially_received', 'received', 'cancelled'))
 */

import { formatDatabaseError } from "@/lib/helpers";

export type PurchaseOrderStatus =
  | "draft"
  | "confirmed"
  | "sent"
  | "partially_received"
  | "received"
  | "cancelled";

export interface PurchaseOrderStatusOption {
  value: PurchaseOrderStatus;
  label: string;
  badgeClass: string;
  description: string;
}

export const PURCHASE_ORDER_STATUS_OPTIONS: readonly PurchaseOrderStatusOption[] = [
  {
    value: "draft",
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    description: "Initial purchase order drafting",
  },
  {
    value: "confirmed",
    label: "Confirmed",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    description: "Approved internally by purchasing/project manager",
  },
  {
    value: "sent",
    label: "Sent",
    badgeClass: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    description: "Dispatched and transmitted to the supplier",
  },
  {
    value: "partially_received",
    label: "Partially Received",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    description: "Part of the ordered goods have been delivered",
  },
  {
    value: "received",
    label: "Received",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    description: "Goods fully received into company warehouse",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    description: "Voided or cancelled purchase order",
  },
] as const;

/**
 * Normalizes any incoming status string to a valid database status.
 * Handles legacy TitleCase values, synonyms, and variations gracefully.
 */
export function normalizePurchaseOrderStatus(status: unknown): PurchaseOrderStatus {
  if (!status) return "draft";
  const s = String(status).trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (s) {
    case "draft":
      return "draft";
    case "confirmed":
    case "approved": // Legacy UI "Approved" maps canonically to DB "confirmed"
    case "accept":
    case "accepted":
      return "confirmed";
    case "sent":
    case "issued":
      return "sent";
    case "partially_received":
    case "partial":
    case "partial_received":
      return "partially_received";
    case "received":
    case "completed":
    case "fulfilled":
      return "received";
    case "cancelled":
    case "canceled":
    case "void":
    case "rejected":
      return "cancelled";
    default:
      return "draft";
  }
}

/**
 * Formats canonical status into human-friendly label ("Draft", "Confirmed", "Sent", "Received", "Cancelled").
 */
export function formatPurchaseOrderStatus(status: unknown): string {
  const norm = normalizePurchaseOrderStatus(status);
  const opt = PURCHASE_ORDER_STATUS_OPTIONS.find((o) => o.value === norm);
  return opt ? opt.label : "Draft";
}

/**
 * Translates PostgreSQL errors for purchase orders into clean, readable explanations.
 */
export function parsePurchaseOrderError(error: unknown): string {
  if (!error) return "An unexpected error occurred.";
  const msg = formatDatabaseError(error);

  if (msg.includes("purchase_orders_status_check")) {
    return "Invalid Purchase Order status. Supported statuses are Draft, Confirmed, Sent, Partially Received, Received, and Cancelled.";
  }
  if (msg.includes("purchase_orders_purchase_order_number_unique") || (msg.includes("purchase_order_number") && msg.includes("unique"))) {
    return "A Purchase Order with this reference number already exists. Please generate a new number.";
  }
  if (msg.includes("check constraint")) {
    return "Validation error: one or more fields violated database integrity constraints.";
  }
  return msg;
}
