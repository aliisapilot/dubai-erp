import { supabase } from "@/lib/supabase";
import { generateNextDocumentNumber } from "@/lib/documentNumbering";

export { generateNextDocumentNumber } from "@/lib/documentNumbering";
export type { DocNumberingConfig } from "@/lib/documentNumbering";

export type CompanyDocDetails = {
  id: string;
  name: string;
  arabic_name?: string | null;
  legal_name?: string | null;
  trn?: string | null;
  address?: string | null;
  city?: string | null;
  po_box?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  background_url?: string | null;
  building_image_url?: string | null;
  footer_image_url?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  bank_iban?: string | null;
  bank_swift?: string | null;
  logo_size?: number | null;
  arabic_name_size?: number | null;
  brand_primary?: string | null;
  brand_accent?: string | null;
  brand_text?: string | null;
  brand_muted?: string | null;
  brand_border?: string | null;
  brand_table_header?: string | null;
  brand_total_highlight?: string | null;
  default_vat_rate?: number | null;
};

/**
 * Get the authenticated user's company id.
 * Supports both company owners and authorized company members.
 */
export async function getCompanyId(): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (user) {
    // 1. Try owner lookup
    const { data: ownerCo } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (ownerCo?.id) return ownerCo.id;

    // 2. Try member profile lookup
    const { data: prof } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (prof?.company_id) return prof.company_id;
  }

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("You are not logged in.");

  throw new Error("No company is linked to your account. Please contact your company administrator.");
}

let inMemoryCompanyCache: CompanyDocDetails | null = null;
let pendingCompanyPromise: Promise<CompanyDocDetails | null> | null = null;
let companyCacheUser: string | null = null;
let companyCacheGeneration = 0;

/** Clear display data after account changes or successful company settings edits. */
export function clearCompanyCache(): void {
  inMemoryCompanyCache = null;
  pendingCompanyPromise = null;
  companyCacheGeneration++;
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem("dubai-erp.company-cache"); } catch {}
  }
}

// Do not restore an unscoped persisted company before verifying the current user.
export function getCachedCompanySync(): CompanyDocDetails | null {
  return inMemoryCompanyCache;
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user?.id ?? null;
    if (userId !== companyCacheUser) {
      clearCompanyCache();
      companyCacheUser = userId;
    }
  });
}

async function fetchCompanyFresh(userId: string, generation: number): Promise<CompanyDocDetails | null> {
  try {
    const { data: ownerCo, error: ownerError } = await supabase.from("companies")
      .select("*").eq("owner_id", userId).maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    let company = ownerCo;
    if (!company) {
      const { data: prof, error: profileError } = await supabase.from("profiles")
        .select("company_id").eq("id", userId).maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (prof?.company_id) {
        const { data: memberCo, error: memberError } = await supabase.from("companies")
          .select("*").eq("id", prof.company_id).maybeSingle();
        if (memberError) throw new Error(memberError.message);
        company = memberCo;
      }
    }
    if (generation !== companyCacheGeneration || userId !== companyCacheUser) return null;
    inMemoryCompanyCache = company as CompanyDocDetails | null;
    return inMemoryCompanyCache;
  } catch (err) {
    console.error("Error retrieving current company:", err);
    return null;
  }
}

/** Return only the verified current user's company, sharing concurrent reads. */
export async function getCurrentCompany(): Promise<CompanyDocDetails | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user ?? (await supabase.auth.getUser()).data?.user;
  const userId = user?.id ?? null;
  if (companyCacheUser !== userId) {
    clearCompanyCache();
    companyCacheUser = userId;
  }
  if (!userId) return null;
  if (inMemoryCompanyCache) return inMemoryCompanyCache;
  if (pendingCompanyPromise) return pendingCompanyPromise;
  const generation = companyCacheGeneration;
  const pending = fetchCompanyFresh(userId, generation);
  pendingCompanyPromise = pending;
  void pending.finally(() => {
    if (pendingCompanyPromise === pending) pendingCompanyPromise = null;
  });
  return pending;
}

/** Generate next sequential document number via DB function and custom formatting rules */
export async function generateDocNumber(companyId: string, prefix: string): Promise<string> {
  return generateNextDocumentNumber(companyId, prefix);
}

/** Format AED currency */
export function fmtAED(value: number | null | undefined): string {
  if (value == null) return "—";
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return "AED 0.00";
  return `AED ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Format date as DD/MM/YYYY — parses YYYY-MM-DD as local calendar date to prevent UTC midnight timezone shift */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const trimmed = iso.trim();
  // Handle YYYY-MM-DD exactly: parse as local calendar date to avoid UTC midnight shift
  // (e.g. "2026-09-01" would shift to Aug 31 in UTC+4 if parsed via new Date())
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1; // JS months are 0-indexed
    const d = parseInt(isoMatch[3], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return new Date(y, m, d).toLocaleDateString("en-GB");
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString("en-GB");
  return trimmed;
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calculate line item totals with exact 2-decimal UAE VAT rounding and NaN protection */
export function calcLineItem(qty: number, unitPrice: number, discountPct: number, vatRate: number) {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  const d = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const v = Math.max(0, Number(vatRate) || 0);

  const gross = Math.round(q * p * 100) / 100;
  const discountAmt = Math.round(gross * (d / 100) * 100) / 100;
  const taxable = Math.max(0, Math.round((gross - discountAmt) * 100) / 100);
  const vatAmount = Math.round(taxable * (v / 100) * 100) / 100;
  const lineTotal = Math.round((taxable + vatAmount) * 100) / 100;
  return { taxable, vatAmount, lineTotal, gross, discountAmt };
}

/** Status color classes */
export function statusClass(status: string): string {
  const map: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Sent: "bg-blue-50 text-blue-700",
    Accepted: "bg-emerald-50 text-emerald-700",
    Rejected: "bg-red-50 text-red-700",
    Expired: "bg-orange-50 text-orange-700",
    Paid: "bg-emerald-50 text-emerald-700",
    Cancelled: "bg-red-50 text-red-700",
    Final: "bg-emerald-50 text-emerald-700",
    Pending: "bg-amber-50 text-amber-700",
    Approved: "bg-blue-50 text-blue-700",
    Confirmed: "bg-blue-50 text-blue-700",
    Received: "bg-emerald-50 text-emerald-700",
    "Partially Received": "bg-amber-50 text-amber-700",
    partially_received: "bg-amber-50 text-amber-700",
    Completed: "bg-emerald-50 text-emerald-700",
    Active: "bg-emerald-50 text-emerald-700",
    Inactive: "bg-slate-100 text-slate-500",
    Dispatched: "bg-blue-50 text-blue-700",
    Delivered: "bg-emerald-50 text-emerald-700",
    Finalized: "bg-emerald-50 text-emerald-700",
    Present: "bg-emerald-50 text-emerald-700",
    Absent: "bg-red-50 text-red-700",
    Leave: "bg-amber-50 text-amber-700",
    Holiday: "bg-blue-50 text-blue-700",
    Late: "bg-orange-50 text-orange-700",
  };
  if (!status) return "bg-slate-100 text-slate-600";
  const normalized = status.trim().replace(/_/g, " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  return map[status] ?? map[normalized] ?? map[status.replace(/_/g, " ")] ?? "bg-slate-100 text-slate-600";
}

/**
 * Canonical employee number formatter.
 * Strictly formats employee codes to standard EMP-01, EMP-02, EMP-03... sequence
 * based on the employee's actual database code.
 *
 * NOTE: The employee number is an intrinsic property of the employee record.
 * Positional array index is NEVER used to override the employee's identity.
 */
export function formatEmployeeCode(rawCode: string | null | undefined): string {
  if (!rawCode) return "";
  const trimmed = String(rawCode).trim();
  if (!trimmed) return "";

  // Historical legacy normalization for 10th employee if raw legacy code is encountered
  if (trimmed === "EMP-2026-0027" || trimmed === "EMP-20260027" || trimmed === "20260027") {
    return "EMP-10";
  }

  // Check if raw code has year embedded, e.g. EMP-202601, EMP-2026-02, EMP-2026-10
  const yearMatch = trimmed.match(/(?:20\d\d[-_]?)0*(\d+)$/);
  if (yearMatch) {
    const n = parseInt(yearMatch[1], 10);
    if (!isNaN(n) && n > 0) {
      return `EMP-${String(n).padStart(2, "0")}`;
    }
  }

  const match = trimmed.match(/^EMP-(\d+)$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!isNaN(n) && n > 0) {
      const finalNum = n > 200000 ? (n % 1000) : n;
      return `EMP-${String(finalNum).padStart(2, "0")}`;
    }
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    const n = parseInt(digits, 10);
    if (!isNaN(n) && n > 0) {
      const finalNum = n > 200000 ? (n % 1000) : n;
      return `EMP-${String(finalNum).padStart(2, "0")}`;
    }
  }

  return trimmed;
}

export const UAE_EMIRATES = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman",
  "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
];

export const VAT_CATEGORIES = [
  "Standard Rated", "Zero Rated", "Exempt", "Out of Scope",
];

export const PAYMENT_METHODS = [
  "Cash", "Cheque", "Bank Transfer", "Credit Card", "Debit Card",
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface ParsedPayrollMonth {
  year: number;
  month: number;
  dateStr: string; // YYYY-MM-DD
  periodStr: string; // YYYY-MM
  label: string; // e.g. "September 2026"
}

/**
 * Robustly parses a payroll month value which could be:
 * - An ISO date string ("2026-09-01")
 * - A period string ("2026-09")
 * - A month number (1 - 12)
 * - null / undefined (falls back to current month/year)
 */
export function parsePayrollMonth(
  val: string | number | null | undefined,
  fallbackYear?: number | null
): ParsedPayrollMonth {
  const now = new Date();
  const defaultYear = fallbackYear && fallbackYear > 1900 ? fallbackYear : now.getFullYear();

  if (!val) {
    const m = now.getMonth() + 1;
    return {
      year: defaultYear,
      month: m,
      dateStr: `${defaultYear}-${String(m).padStart(2, "0")}-01`,
      periodStr: `${defaultYear}-${String(m).padStart(2, "0")}`,
      label: `${MONTH_NAMES[m - 1] || "Unknown"} ${defaultYear}`,
    };
  }

  // Handle ISO date format (YYYY-MM-DD) or (YYYY-MM)
  if (typeof val === "string" && val.includes("-")) {
    const parts = val.split("-");
    const y = parseInt(parts[0], 10) || defaultYear;
    const m = Math.min(12, Math.max(1, parseInt(parts[1], 10) || (now.getMonth() + 1)));
    return {
      year: y,
      month: m,
      dateStr: `${y}-${String(m).padStart(2, "0")}-01`,
      periodStr: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTH_NAMES[m - 1] || "Unknown"} ${y}`,
    };
  }

  // Handle numeric month (1 - 12)
  const num = Number(val);
  const m = (!isNaN(num) && num >= 1 && num <= 12) ? num : (now.getMonth() + 1);
  const y = defaultYear;
  return {
    year: y,
    month: m,
    dateStr: `${y}-${String(m).padStart(2, "0")}-01`,
    periodStr: `${y}-${String(m).padStart(2, "0")}`,
    label: `${MONTH_NAMES[m - 1] || "Unknown"} ${y}`,
  };
}

/** Ensure date values are safe ISO YYYY-MM-DD strings for database writes */
export function toISODate(dateVal: string | Date | null | undefined): string | null {
  if (!dateVal) return null;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal.toISOString().split("T")[0];
  }
  return null;
}

