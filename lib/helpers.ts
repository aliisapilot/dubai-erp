import { supabase } from "@/lib/supabase";

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
  bank_name?: string | null;
  bank_account_name?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
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

  // 3. Fallback to any company visible via RLS / single-tenant setup
  const { data: anyCo } = await supabase
    .from("companies")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (anyCo?.id) return anyCo.id;

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("You are not logged in.");

  throw new Error("No company is linked to your account. Please contact your company administrator.");
}

/**
 * Loads current company details for letterhead headers, documents, and navigation
 * for either company owner or authorized company member.
 */
export async function getCurrentCompany(): Promise<CompanyDocDetails | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return null;

    // 1. Try owner lookup
    const { data: ownerCo } = await supabase
      .from("companies")
      .select("*")
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (ownerCo) return ownerCo as CompanyDocDetails;

    // 2. Try member profile lookup
    const { data: prof } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (prof?.company_id) {
      const { data: memberCo } = await supabase
        .from("companies")
        .select("*")
        .eq("id", prof.company_id)
        .maybeSingle();
      if (memberCo) return memberCo as CompanyDocDetails;
    }

    // 3. Fallback to any company visible via RLS
    const { data: anyCo } = await supabase
      .from("companies")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (anyCo) return anyCo as CompanyDocDetails;

    return null;
  } catch (err) {
    console.error("Error retrieving current company:", err);
    return null;
  }
}

/** Generate next sequential document number via DB function */
export async function generateDocNumber(companyId: string, prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_doc_number", {
    p_company_id: companyId,
    p_prefix: prefix,
  });
  if (error) {
    // Numbering must be atomic and database-side only.
    // Never fall back to timestamps/random values here.
    throw new Error(`Could not generate the next ${prefix} number: ${error.message}`);
  }
  return data as string;
}

/** Format AED currency */
export function fmtAED(value: number | null | undefined): string {
  if (value == null) return "—";
  return `AED ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Format date as DD/MM/YYYY */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB");
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calculate line item totals */
export function calcLineItem(qty: number, unitPrice: number, discountPct: number, vatRate: number) {
  const gross = qty * unitPrice;
  const discountAmt = gross * (discountPct / 100);
  const taxable = gross - discountAmt;
  const vatAmount = taxable * (vatRate / 100);
  const lineTotal = taxable + vatAmount;
  return { taxable, vatAmount, lineTotal };
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
    Approved: "bg-emerald-50 text-emerald-700",
    Received: "bg-teal-50 text-teal-700",
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
  const normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  return map[normalized] ?? map[status] ?? "bg-slate-100 text-slate-600";
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
