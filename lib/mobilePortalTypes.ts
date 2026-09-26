/**
 * Dubai ERP Mobile Document Portal: Types & Helper Definitions
 * ============================================================
 * Defines categories, document representations, role permissions,
 * and native Web Share integration for iPhone / Android.
 */

export type MobileDocumentCategory =
  | "quotation"
  | "proforma"
  | "tax_invoice"
  | "delivery_note"
  | "purchase_order"
  | "supplier_bill"
  | "cheque"
  | "company_file";

export interface MobilePortalDocument {
  id: string;
  category: MobileDocumentCategory;
  categoryLabel: string;
  documentNumber: string;
  date: string;
  dueDate?: string | null;
  partyName: string;
  partyTrn?: string | null;
  partyRole: "Customer" | "Supplier" | "Counterparty" | "Company";
  amount?: number | null;
  status: string;
  statusBadgeClass: string;
  notes?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  hasAttachment: boolean;
  rawData?: unknown;
}

export interface MobilePortalPermissions {
  mobileAccessEnabled: boolean;
  role: string;
  allowedCategories: MobileDocumentCategory[];
  canViewFinancials: boolean;
  canShareDocuments: boolean;
  canDownloadDocuments: boolean;
}

export const DEFAULT_PERMISSIONS: MobilePortalPermissions = {
  mobileAccessEnabled: true,
  role: "admin",
  allowedCategories: [
    "quotation",
    "proforma",
    "tax_invoice",
    "delivery_note",
    "purchase_order",
    "supplier_bill",
    "cheque",
    "company_file",
  ],
  canViewFinancials: true,
  canShareDocuments: true,
  canDownloadDocuments: true,
};

export interface CategoryTabMeta {
  key: MobileDocumentCategory | "all";
  label: string;
  shortLabel: string;
  badgeColor: string;
}

export const MOBILE_CATEGORY_TABS: readonly CategoryTabMeta[] = [
  { key: "all", label: "All Documents", shortLabel: "All", badgeColor: "bg-slate-900 text-white" },
  { key: "tax_invoice", label: "Tax Invoices", shortLabel: "Invoices", badgeColor: "bg-emerald-600 text-white" },
  { key: "quotation", label: "Quotations", shortLabel: "Quotes", badgeColor: "bg-teal-600 text-white" },
  { key: "proforma", label: "Proforma Invoices", shortLabel: "Proforma", badgeColor: "bg-cyan-600 text-white" },
  { key: "delivery_note", label: "Delivery Notes", shortLabel: "Delivery", badgeColor: "bg-blue-600 text-white" },
  { key: "purchase_order", label: "Purchase Orders", shortLabel: "Orders", badgeColor: "bg-indigo-600 text-white" },
  { key: "supplier_bill", label: "Supplier Bills", shortLabel: "Bills", badgeColor: "bg-purple-600 text-white" },
  { key: "cheque", label: "Cheque Documents", shortLabel: "Cheques", badgeColor: "bg-amber-600 text-white" },
  { key: "company_file", label: "Company Files", shortLabel: "Files", badgeColor: "bg-slate-700 text-white" },
] as const;

export function getCategoryBadgeColor(category: MobileDocumentCategory): string {
  const found = MOBILE_CATEGORY_TABS.find((t) => t.key === category);
  return found?.badgeColor || "bg-slate-700 text-white";
}

export function getCategoryLabel(category: MobileDocumentCategory): string {
  const found = MOBILE_CATEGORY_TABS.find((t) => t.key === category);
  return found?.label || "Document";
}

/**
 * Triggers native mobile share sheet (iOS AirDrop, WhatsApp, Mail, Files, etc.)
 * with automatic fallback to clipboard copy.
 */
export async function shareDocument(params: {
  title: string;
  text: string;
  url?: string;
}): Promise<{ shared: boolean; method: "native" | "clipboard" | "failed"; error?: string }> {
  const { title, text, url = window.location.href } = params;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { shared: true, method: "native" };
    } catch (err: unknown) {
      // AbortError indicates user cancelled share dialog - not a failure
      if (err instanceof Error && err.name === "AbortError") {
        return { shared: false, method: "native" };
      }
    }
  }

  // Fallback to clipboard
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      return { shared: true, method: "clipboard" };
    }
  } catch {
    // Clipboard permission denied or unavailable
  }

  return { shared: false, method: "failed", error: "Sharing not supported on this browser." };
}
