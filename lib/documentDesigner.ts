/**
 * ==============================================================================
 * Dubai ERP: Document Designer Core Engine & Layout Model
 * ==============================================================================
 * Comprehensive layout state, element types, A4 coordinate calculation (mm),
 * default UAE corporate templates, and database persistence with offline fallback.
 * ==============================================================================
 */

import { supabase } from "./supabase";
import { DEFAULT_BRAND_COLORS } from "./brandConfig";

// ── Document Type Definitions ──────────────────────────────────────────────────
export type DocumentTypeId =
  | "tax_invoice"
  | "quotation"
  | "proforma_invoice"
  | "delivery_note"
  | "purchase_order"
  | "receipt_voucher"
  | "customer_statement"
  | "supplier_bill"
  | "salary_statement"
  | "project_handover"
  | "work_method_statement"
  | "employee_payment_voucher";

export interface DocumentTypeOption {
  id: DocumentTypeId;
  label: string;
  labelAr: string;
  defaultTitle: string;
  defaultTitleAr: string;
  category: "sales" | "procurement" | "operations" | "hr" | "finance";
}

export const DOCUMENT_TYPE_OPTIONS: DocumentTypeOption[] = [
  {
    id: "tax_invoice",
    label: "Tax Invoice",
    labelAr: "فاتورة ضريبية",
    defaultTitle: "TAX INVOICE",
    defaultTitleAr: "فاتورة ضريبية",
    category: "sales",
  },
  {
    id: "quotation",
    label: "Quotation / Estimate",
    labelAr: "عرض أسعار",
    defaultTitle: "QUOTATION",
    defaultTitleAr: "عرض أسعار",
    category: "sales",
  },
  {
    id: "proforma_invoice",
    label: "Proforma Invoice",
    labelAr: "فاتورة شكلية",
    defaultTitle: "PROFORMA INVOICE",
    defaultTitleAr: "فاتورة شكلية",
    category: "sales",
  },
  {
    id: "delivery_note",
    label: "Delivery Note",
    labelAr: "إذن تسليم بضاعة",
    defaultTitle: "DELIVERY NOTE",
    defaultTitleAr: "إذن تسليم",
    category: "operations",
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    labelAr: "أمر شراء",
    defaultTitle: "PURCHASE ORDER",
    defaultTitleAr: "أمر شراء",
    category: "procurement",
  },
  {
    id: "receipt_voucher",
    label: "Receipt Voucher",
    labelAr: "سند قبض",
    defaultTitle: "RECEIPT VOUCHER",
    defaultTitleAr: "سند قبض",
    category: "finance",
  },
  {
    id: "customer_statement",
    label: "Customer Statement of Account",
    labelAr: "كشف حساب عميل",
    defaultTitle: "STATEMENT OF ACCOUNT",
    defaultTitleAr: "كشف حساب",
    category: "finance",
  },
  {
    id: "supplier_bill",
    label: "Supplier Bill",
    labelAr: "فاتورة مورد",
    defaultTitle: "SUPPLIER BILL",
    defaultTitleAr: "فاتورة مورد",
    category: "procurement",
  },
  {
    id: "salary_statement",
    label: "Salary Statement / Payslip",
    labelAr: "كشف رواتب الموظفين",
    defaultTitle: "SALARY STATEMENT",
    defaultTitleAr: "كشف رواتب",
    category: "hr",
  },
  {
    id: "project_handover",
    label: "Project Handover Certificate",
    labelAr: "محضر تسليم مشروع",
    defaultTitle: "PROJECT HANDOVER CERTIFICATE",
    defaultTitleAr: "محضر تسليم مشروع",
    category: "operations",
  },
  {
    id: "work_method_statement",
    label: "Work Method Statement (WMS)",
    labelAr: "بيان طريقة العمل",
    defaultTitle: "WORK METHOD STATEMENT",
    defaultTitleAr: "بيان طريقة العمل",
    category: "operations",
  },
  {
    id: "employee_payment_voucher",
    label: "Employee Payment Voucher",
    labelAr: "سند صرف لموظف",
    defaultTitle: "PAYMENT VOUCHER",
    defaultTitleAr: "سند صرف",
    category: "hr",
  },
];

// ── Element Configuration Model ────────────────────────────────────────────────
export type ElementType =
  | "logo"
  | "company_name_en"
  | "company_name_ar"
  | "company_trn"
  | "company_address"
  | "doc_title"
  | "doc_meta"
  | "customer_info"
  | "supplier_info"
  | "project_info"
  | "line_items"
  | "totals"
  | "amount_in_words"
  | "payment_terms"
  | "bank_details"
  | "company_signature"
  | "company_stamp"
  | "footer"
  | "watermark"
  | "building_image"
  | "custom_text"
  | "divider";

export interface TableColumnConfig {
  key: string;
  label: string;
  labelAr?: string;
  visible: boolean;
  widthPct: number;
  align: "left" | "center" | "right";
}

export interface LayoutElement {
  id: string;
  type: ElementType;
  label: string;
  // Position and dimensions in millimeters (A4 = 210mm x 297mm)
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
  lockAspectRatio?: boolean;
  zIndex: number;
  pageNumber?: number; // 1 for first page, or applies to all

  // Typography & Appearance
  fontSize?: number; // px
  fontWeight?: "normal" | "medium" | "semibold" | "bold" | "extrabold";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number; // px
  borderRadius?: number; // px
  padding?: number; // mm
  lineHeight?: number;
  opacity?: number; // 0 to 1

  // Text contents / bindings
  customText?: string;
  fieldBinding?: string;
  dynamicFields?: string[];

  // Image specific controls
  imageSrc?: string;
  imageFit?: "contain" | "cover";

  // Table specific controls
  tableSettings?: {
    headerBg: string;
    headerTextColor: string;
    fontSize: number;
    headerFontSize: number;
    rowHeight: number;
    borderThickness: number;
    borderColor: string;
    bodyTextColor: string;
    columns: TableColumnConfig[];
  };
}

export interface DocumentLayout {
  version: number;
  documentType: DocumentTypeId;
  templateName: string;
  page: {
    paper: "A4";
    orientation: "portrait" | "landscape";
    widthMm: number; // 210
    heightMm: number; // 297
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    background: string;
    watermarkOpacity: number;
  };
  branding: {
    primaryColor: string;
    accentColor: string;
    textColor: string;
    mutedColor: string;
    borderColor: string;
    tableHeaderColor: string;
    totalHighlightColor: string;
  };
  elements: LayoutElement[];
}

// ── Default Table Columns ──────────────────────────────────────────────────────
export const DEFAULT_INVOICE_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 5, align: "center" },
  { key: "description", label: "Item Description / البيان", visible: true, widthPct: 40, align: "left" },
  { key: "quantity", label: "Qty", visible: true, widthPct: 8, align: "center" },
  { key: "unit", label: "Unit", visible: true, widthPct: 8, align: "center" },
  { key: "unit_price", label: "Rate (AED)", visible: true, widthPct: 12, align: "right" },
  { key: "discount", label: "Disc.", visible: false, widthPct: 8, align: "right" },
  { key: "vat_amount", label: "VAT (5%)", visible: true, widthPct: 11, align: "right" },
  { key: "line_total", label: "Total (AED)", visible: true, widthPct: 16, align: "right" },
];

export const DEFAULT_DELIVERY_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 6, align: "center" },
  { key: "description", label: "Item Description & Specifications", visible: true, widthPct: 54, align: "left" },
  { key: "quantity", label: "Delivered Qty", visible: true, widthPct: 20, align: "center" },
  { key: "unit", label: "Unit", visible: true, widthPct: 20, align: "center" },
];

export const DEFAULT_STATEMENT_COLUMNS: TableColumnConfig[] = [
  { key: "date", label: "Date", visible: true, widthPct: 12, align: "center" },
  { key: "type", label: "Type", visible: true, widthPct: 14, align: "left" },
  { key: "reference", label: "Reference #", visible: true, widthPct: 18, align: "left" },
  { key: "description", label: "Description", visible: true, widthPct: 26, align: "left" },
  { key: "debit", label: "Debit (AED)", visible: true, widthPct: 10, align: "right" },
  { key: "credit", label: "Credit (AED)", visible: true, widthPct: 10, align: "right" },
  { key: "balance", label: "Balance (AED)", visible: true, widthPct: 10, align: "right" },
];

// ── Default UAE Corporate Template Generator ───────────────────────────────────
export function createDefaultLayout(docType: DocumentTypeId): DocumentLayout {
  const docConfig = DOCUMENT_TYPE_OPTIONS.find((d) => d.id === docType) || DOCUMENT_TYPE_OPTIONS[0];

  const elements: LayoutElement[] = [
    // 0. Watermark (Background layer, centered)
    {
      id: "watermark",
      type: "watermark",
      label: "Watermark Background",
      x: 55,
      y: 95,
      width: 100,
      height: 100,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 1,
      opacity: 0.045,
      imageFit: "contain",
    },

    // 1. Company Logo (centered at top)
    {
      id: "logo",
      type: "logo",
      label: "Company Logo",
      x: 12,
      y: 12,
      width: 186,
      height: 24,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 10,
      imageFit: "contain",
    },

    // 2. English Company Name
    {
      id: "company_name_en",
      type: "company_name_en",
      label: "English Company Name",
      x: 12,
      y: 38,
      width: 186,
      height: 7,
      visible: true,
      locked: false,
      zIndex: 11,
      fontSize: 15,
      fontWeight: "bold",
      textAlign: "center",
      color: "#0F172A",
      customText: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
    },

    // 3. Arabic Company Name (prominent focal point in Gold accent)
    {
      id: "company_name_ar",
      type: "company_name_ar",
      label: "Arabic Company Name",
      x: 12,
      y: 45,
      width: 186,
      height: 10,
      visible: true,
      locked: false,
      zIndex: 12,
      fontSize: 26,
      fontWeight: "bold",
      textAlign: "center",
      color: "#C9A227",
      customText: "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.ش.و",
    },

    // 4. Company Address & TRN Strip
    {
      id: "company_address",
      type: "company_address",
      label: "Company Address & Contact Strip",
      x: 12,
      y: 56,
      width: 186,
      height: 9,
      visible: true,
      locked: false,
      zIndex: 13,
      fontSize: 10,
      textAlign: "center",
      color: "#64748B",
      customText: "Al Quoz Industrial Area 3, Dubai, UAE | TRN: {{company.trn}} | Tel: {{company.phone}}",
    },

    // 5. Document Title & Reference Banner (Navy background, Gold reference)
    {
      id: "doc_title",
      type: "doc_title",
      label: "Document Title Banner",
      x: 12,
      y: 67,
      width: 186,
      height: 13,
      visible: true,
      locked: false,
      zIndex: 14,
      fontSize: 15,
      fontWeight: "extrabold",
      textAlign: "left",
      color: "#FFFFFF",
      backgroundColor: "#0F172A",
      borderRadius: 4,
      padding: 3,
      customText: `${docConfig.defaultTitle} — ${docConfig.defaultTitleAr}`,
    },

    // 6. Customer Information Card
    {
      id: "customer_info",
      type: "customer_info",
      label: "Customer Information Card",
      x: 12,
      y: 83,
      width: 91,
      height: 30,
      visible: true,
      locked: false,
      zIndex: 15,
      fontSize: 11,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 3,
    },

    // 7. Document Meta & Project Ref
    {
      id: "doc_meta",
      type: "doc_meta",
      label: "Invoice Date & Reference Meta",
      x: 107,
      y: 83,
      width: 91,
      height: 30,
      visible: true,
      locked: false,
      zIndex: 16,
      fontSize: 11,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 3,
    },

    // 8. Line Items Table
    {
      id: "line_items",
      type: "line_items",
      label: "Line Items Table",
      x: 12,
      y: 116,
      width: 186,
      height: 52,
      visible: true,
      locked: false,
      zIndex: 17,
      tableSettings: {
        headerBg: "#0F172A",
        headerTextColor: "#FFFFFF",
        fontSize: 11,
        headerFontSize: 11,
        rowHeight: 9,
        borderThickness: 1,
        borderColor: "#CBD5E1",
        bodyTextColor: "#334155",
        columns:
          docType === "delivery_note"
            ? DEFAULT_DELIVERY_COLUMNS
            : docType === "customer_statement"
            ? DEFAULT_STATEMENT_COLUMNS
            : DEFAULT_INVOICE_COLUMNS,
      },
    },

    // 9. Amount in Words Card
    {
      id: "amount_in_words",
      type: "amount_in_words",
      label: "Amount in Words (English & Arabic)",
      x: 12,
      y: 172,
      width: 105,
      height: 25,
      visible: true,
      locked: false,
      zIndex: 18,
      fontSize: 11,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 3,
    },

    // 10. Totals Breakdown Card
    {
      id: "totals",
      type: "totals",
      label: "Subtotal, VAT & Grand Total",
      x: 121,
      y: 172,
      width: 77,
      height: 44,
      visible: true,
      locked: false,
      zIndex: 19,
      fontSize: 11,
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 2,
    },

    // 11. Bank Transfer Details
    {
      id: "bank_details",
      type: "bank_details",
      label: "Bank Details (IBAN & SWIFT)",
      x: 12,
      y: 200,
      width: 105,
      height: 27,
      visible: true,
      locked: false,
      zIndex: 20,
      fontSize: 10,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 2.5,
    },

    // 12. Terms & Conditions / Notes
    {
      id: "payment_terms",
      type: "payment_terms",
      label: "Payment Terms & Conditions",
      x: 12,
      y: 230,
      width: 105,
      height: 24,
      visible: true,
      locked: false,
      zIndex: 21,
      fontSize: 10,
      color: "#64748B",
    },

    // 13. Company Authorized Signature & Stamp Header
    {
      id: "company_signature",
      type: "company_signature",
      label: "Company Authorized Signature",
      x: 121,
      y: 220,
      width: 44,
      height: 34,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 22,
      customText: "COMPANY AUTHORIZED SIGNATURE",
    },

    // 14. Company Stamp
    {
      id: "company_stamp",
      type: "company_stamp",
      label: "Official Company Stamp",
      x: 167,
      y: 220,
      width: 31,
      height: 34,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 23,
      imageFit: "contain",
    },

    // 15. Document Footer
    {
      id: "footer",
      type: "footer",
      label: "Document Footer",
      x: 12,
      y: 278,
      width: 186,
      height: 8,
      visible: true,
      locked: false,
      zIndex: 24,
      fontSize: 9,
      textAlign: "center",
      color: "#64748B",
      borderColor: "#CBD5E1",
      borderWidth: 1,
    },
  ];

  return {
    version: 1,
    documentType: docType,
    templateName: "Default UAE Corporate Template",
    page: {
      paper: "A4",
      orientation: "portrait",
      widthMm: 210,
      heightMm: 297,
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
      background: "#FFFFFF",
      watermarkOpacity: 0.045,
    },
    branding: {
      primaryColor: DEFAULT_BRAND_COLORS.primary,
      accentColor: DEFAULT_BRAND_COLORS.accent,
      textColor: DEFAULT_BRAND_COLORS.text,
      mutedColor: DEFAULT_BRAND_COLORS.muted,
      borderColor: DEFAULT_BRAND_COLORS.border,
      tableHeaderColor: DEFAULT_BRAND_COLORS.tableHeader,
      totalHighlightColor: DEFAULT_BRAND_COLORS.totalHighlight,
    },
    elements,
  };
}

// ── Persistence Helpers ────────────────────────────────────────────────────────
const LOCAL_STORAGE_PREFIX = "dubai-erp.doc-layout.";

export function getLocalStorageKey(docType: DocumentTypeId): string {
  return `${LOCAL_STORAGE_PREFIX}${docType}`;
}

/**
 * Loads the layout for a given document type.
 * Order of resolution:
 * 1. Supabase public.document_templates (keyed by company_id and document_type)
 * 2. Browser localStorage fallback
 * 3. Default UAE corporate layout
 */
export async function loadDocumentLayout(
  companyId?: string | null,
  docType: DocumentTypeId = "tax_invoice"
): Promise<{ layout: DocumentLayout; source: "database" | "local" | "default" }> {
  // 1. Try Supabase if companyId exists
  if (companyId) {
    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("layout_json")
        .eq("company_id", companyId)
        .eq("document_type", docType)
        .eq("is_default", true)
        .maybeSingle();

      if (!error && data?.layout_json) {
        return {
          layout: data.layout_json as DocumentLayout,
          source: "database",
        };
      }
    } catch {
      // Table may not exist yet or offline; gracefully proceed to localStorage
    }
  }

  // 2. Try localStorage
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(getLocalStorageKey(docType));
      if (stored) {
        const parsed = JSON.parse(stored) as DocumentLayout;
        if (parsed?.elements?.length) {
          return { layout: parsed, source: "local" };
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Return fresh default layout
  return {
    layout: createDefaultLayout(docType),
    source: "default",
  };
}

/**
 * Saves document layout to Supabase with automatic fallback to localStorage.
 */
export async function saveDocumentLayout(
  companyId: string | null | undefined,
  docType: DocumentTypeId,
  layout: DocumentLayout,
  templateName: string = "Default Template"
): Promise<{ success: boolean; error?: string; target: "database" | "local" }> {
  // Always update localStorage first so current user session and preview are instant
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(getLocalStorageKey(docType), JSON.stringify(layout));
    } catch (e) {
      console.warn("Failed to write layout to localStorage:", e);
    }
  }

  // If companyId is available, attempt saving to Supabase
  if (companyId) {
    try {
      const { error } = await supabase.from("document_templates").upsert(
        {
          company_id: companyId,
          document_type: docType,
          template_name: templateName,
          layout_json: layout,
          is_default: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "company_id,document_type,template_name",
        }
      );

      if (!error) {
        return { success: true, target: "database" };
      }

      console.warn("Supabase document_templates upsert error:", error.message);
      return { success: true, target: "local", error: error.message };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: true, target: "local", error: msg };
    }
  }

  return { success: true, target: "local" };
}

/**
 * Resets the layout of a document type back to the professional default.
 */
export async function resetDocumentLayout(
  companyId: string | null | undefined,
  docType: DocumentTypeId
): Promise<DocumentLayout> {
  const defaultLayout = createDefaultLayout(docType);

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(getLocalStorageKey(docType));
  }

  if (companyId) {
    try {
      await supabase
        .from("document_templates")
        .delete()
        .eq("company_id", companyId)
        .eq("document_type", docType);
    } catch {
      // ignore
    }
  }

  return defaultLayout;
}
