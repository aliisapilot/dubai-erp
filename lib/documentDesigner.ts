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
  | "custom_image"
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
  fontStyle?: "normal" | "italic";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number; // px
  borderRadius?: number; // px
  padding?: number; // mm
  lineHeight?: number;
  letterSpacing?: number; // px
  opacity?: number; // 0 to 1

  // Text contents / bindings
  customText?: string;
  fieldBinding?: string;
  dynamicFields?: string[];

  // Image specific controls
  imageSrc?: string;
  imageFit?: "contain" | "cover" | "fill";
  /** Intrinsic image aspect ratio (width / height), used by locked resizing. */
  imageAspectRatio?: number;

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

export const CURRENT_LAYOUT_VERSION = 2;

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

    // 1. Company Logo (compact, centered at top, preserved aspect ratio)
    {
      id: "logo",
      type: "logo",
      label: "Company Logo",
      x: 85,
      y: 10,
      width: 40,
      height: 12,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 10,
      imageFit: "contain",
      imageAspectRatio: 10 / 3,
    },

    // 2. English Company Name (positioned right beneath logo)
    {
      id: "company_name_en",
      type: "company_name_en",
      label: "English Company Name",
      x: 12,
      y: 29,
      width: 186,
      height: 6,
      visible: true,
      locked: false,
      zIndex: 11,
      fontSize: 13.5,
      fontWeight: "bold",
      textAlign: "center",
      color: "#0F172A",
    },

    // 3. Arabic Company Name (prominent focal point in Gold accent)
    {
      id: "company_name_ar",
      type: "company_name_ar",
      label: "Arabic Company Name",
      x: 12,
      y: 35.5,
      width: 186,
      height: 7.5,
      visible: true,
      locked: false,
      zIndex: 12,
      fontSize: 20,
      fontWeight: "bold",
      textAlign: "center",
      color: "#C9A227",
    },

    // 4. Company Address & TRN Strip
    {
      id: "company_address",
      type: "company_address",
      label: "Company Address & Contact Strip",
      x: 12,
      y: 44,
      width: 186,
      height: 6,
      visible: true,
      locked: false,
      zIndex: 13,
      fontSize: 9.5,
      textAlign: "center",
      color: "#64748B",
    },

    // 5. Document Title & Reference Banner (Navy background, Gold reference)
    {
      id: "doc_title",
      type: "doc_title",
      label: "Document Title Banner",
      x: 12,
      y: 51,
      width: 186,
      height: 11,
      visible: true,
      locked: false,
      zIndex: 14,
      fontSize: 13.5,
      fontWeight: "extrabold",
      textAlign: "left",
      color: "#FFFFFF",
      backgroundColor: "#0F172A",
      borderRadius: 4,
      padding: 2.5,
      customText: `${docConfig.defaultTitle} — ${docConfig.defaultTitleAr}`,
    },

    // 6. Customer Information Card
    {
      id: "customer_info",
      type: "customer_info",
      label: "Customer Information Card",
      x: 12,
      y: 64,
      width: 91,
      height: 30,
      visible: true,
      locked: false,
      zIndex: 15,
      fontSize: 10.5,
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
      y: 64,
      width: 91,
      height: 30,
      visible: true,
      locked: false,
      zIndex: 16,
      fontSize: 10.5,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 3,
    },

    // 8. Line Items Table (Generous height using available A4 space)
    {
      id: "line_items",
      type: "line_items",
      label: "Line Items Table",
      x: 12,
      y: 96,
      width: 186,
      height: 68,
      visible: true,
      locked: false,
      zIndex: 17,
      tableSettings: {
        headerBg: "#0F172A",
        headerTextColor: "#FFFFFF",
        fontSize: 10.5,
        headerFontSize: 10.5,
        rowHeight: 9.5,
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
      y: 167,
      width: 105,
      height: 25,
      visible: true,
      locked: false,
      zIndex: 18,
      fontSize: 10.5,
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
      y: 167,
      width: 77,
      height: 46,
      visible: true,
      locked: false,
      zIndex: 19,
      fontSize: 10.5,
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
      y: 195,
      width: 105,
      height: 26,
      visible: true,
      locked: false,
      zIndex: 20,
      fontSize: 9.5,
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
      y: 224,
      width: 105,
      height: 28,
      visible: true,
      locked: false,
      zIndex: 21,
      fontSize: 9.5,
      color: "#64748B",
    },

    // 13. Company Authorized Signature & Stamp Header
    {
      id: "company_signature",
      type: "company_signature",
      label: "Company Authorized Signature",
      x: 121,
      y: 216,
      width: 44,
      height: 36,
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
      y: 216,
      width: 31,
      height: 36,
      visible: true,
      locked: false,
      lockAspectRatio: true,
      zIndex: 23,
      imageFit: "contain",
    },

    // 15. Document Footer (prominent, proportionate, solid baseline anchor)
    {
      id: "footer",
      type: "footer",
      label: "Document Footer",
      x: 12,
      y: 262,
      width: 186,
      height: 16,
      visible: true,
      locked: false,
      zIndex: 24,
      fontSize: 9.5,
      textAlign: "center",
      color: "#64748B",
      borderColor: "#CBD5E1",
      borderWidth: 1,
    },
  ];

  return {
    version: CURRENT_LAYOUT_VERSION,
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

export function getLocalStorageKey(companyId: string | null | undefined, docType: DocumentTypeId): string {
  return `${LOCAL_STORAGE_PREFIX}${companyId || "anonymous"}.${docType}`;
}

/**
 * Applies explicit, versioned migrations and validates geometry without
 * replacing deliberate user positions or sizes.
 */
export function normalizeLayout(layout: DocumentLayout): DocumentLayout {
  if (!layout || !layout.elements) return layout;
  const sourceVersion = Number.isFinite(layout.version) ? layout.version : 1;
  const pageWidth = Number.isFinite(layout.page?.widthMm) ? layout.page.widthMm : 210;
  const pageHeight = Number.isFinite(layout.page?.heightMm) ? layout.page.heightMm : 297;

  const elements = layout.elements.map((element) => {
    let el = { ...element };

    if (sourceVersion < 2 && el.id === "logo") {
      const originalFullWidth = Math.abs(el.width - 186) < 0.01 && Math.abs(el.height - 24) < 0.01;
      const interimDefault = Math.abs(el.width - 40) < 0.01 && Math.abs(el.height - 18) < 0.01;
      if (originalFullWidth) el = { ...el, x: 85, y: 10, width: 40, height: 12 };
      else if (interimDefault) el = { ...el, height: 12 };
      el.lockAspectRatio = true;
      el.imageAspectRatio = el.imageAspectRatio || 10 / 3;
    }

    if (sourceVersion < 2 && el.id === "footer" && Math.abs(el.height - 8) < 0.01) {
      el = { ...el, height: 16, y: 262, fontSize: 9.5 };
    }

    const width = Math.max(1, Math.min(pageWidth, Number.isFinite(el.width) ? el.width : 20));
    const height = Math.max(1, Math.min(pageHeight, Number.isFinite(el.height) ? el.height : 10));
    const x = Math.max(0, Math.min(pageWidth - width, Number.isFinite(el.x) ? el.x : 0));
    const y = Math.max(0, Math.min(pageHeight - height, Number.isFinite(el.y) ? el.y : 0));
    return { ...el, x, y, width, height };
  });

  return {
    ...layout,
    version: CURRENT_LAYOUT_VERSION,
    page: { ...layout.page, paper: "A4", widthMm: 210, heightMm: 297 },
    elements,
  };
}

/**
 * Assigns sequential z-indices (2, 4, 6, ...) to elements in their current array order.
 */
export function normalizeLayerZIndexes(elements: LayoutElement[]): LayoutElement[] {
  return elements.map((el, idx) => ({ ...el, zIndex: (idx + 1) * 2 }));
}

/**
 * Sorts elements by existing zIndex ascending and re-indexes them sequentially.
 */
export function sortAndNormalizeLayerZIndexes(elements: LayoutElement[]): LayoutElement[] {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  return sorted.map((el, idx) => ({ ...el, zIndex: (idx + 1) * 2 }));
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
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.layout_json) {
        return {
          layout: normalizeLayout(data.layout_json as DocumentLayout),
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
      const storageKey = getLocalStorageKey(companyId, docType);
      let stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        const legacyKey = `${LOCAL_STORAGE_PREFIX}${docType}`;
        stored = window.localStorage.getItem(legacyKey);
        if (stored) {
          window.localStorage.setItem(storageKey, stored);
          window.localStorage.removeItem(legacyKey);
        }
      }
      if (stored) {
        const parsed = JSON.parse(stored) as DocumentLayout;
        if (parsed?.elements?.length) {
          return { layout: normalizeLayout(parsed), source: "local" };
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Return fresh default layout
  return {
    layout: normalizeLayout(createDefaultLayout(docType)),
    source: "default",
  };
}

/**
 * Saves document layout to Supabase with automatic fallback to localStorage.
 */
function isMissingTableError(errorMsg?: string | null): boolean {
  if (!errorMsg) return false;
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("42p01")
  );
}

export type VisualScopeKey =
  | "logo"
  | "company_name_en"
  | "company_name_ar"
  | "company_address"
  | "header_layout"
  | "doc_title"
  | "typography"
  | "branding_colors"
  | "watermark"
  | "footer"
  | "bank_details"
  | "payment_terms"
  | "company_signature"
  | "company_stamp"
  | "page_margins";

export const VISUAL_SCOPE_DEFINITIONS: { key: VisualScopeKey; label: string; description: string }[] = [
  { key: "logo", label: "Company Logo", description: "Position, dimensions, border, aspect ratio" },
  { key: "company_name_en", label: "English Company Name", description: "Font size, family, color, alignment" },
  { key: "company_name_ar", label: "Arabic Company Name", description: "Font size, family, color, alignment" },
  { key: "company_address", label: "Company Details & TRN", description: "Font, spacing, alignment, contact strip" },
  { key: "header_layout", label: "Complete Header Layout", description: "Logo, company names, and address coordinates" },
  { key: "doc_title", label: "Document Title Styling", description: "Banner background, height, fonts, padding (preserves doc title text)" },
  { key: "typography", label: "Typography & Fonts", description: "Font families across document elements" },
  { key: "branding_colors", label: "Brand Colors Theme", description: "Primary navy, gold accent, borders, table header, highlight" },
  { key: "watermark", label: "Background & Watermark", description: "Watermark image, size, position, opacity" },
  { key: "footer", label: "Document Footer", description: "Position, height, typography, borders" },
  { key: "bank_details", label: "Bank Details Card", description: "Card position, background, borders, font size" },
  { key: "payment_terms", label: "Payment Terms Styling", description: "Font size, colors, position" },
  { key: "company_signature", label: "Authorized Signature", description: "Signature box size, position, styling" },
  { key: "company_stamp", label: "Official Stamp Area", description: "Stamp position, size, border, fit" },
  { key: "page_margins", label: "Page Margins & Background", description: "Top, bottom, left, right margins, page background" },
];

/**
 * Copies visual appearance properties from a source element into a target element,
 * intentionally excluding document-specific business text (except custom blocks).
 */
export function copyElementVisualProperties(
  sourceEl: LayoutElement,
  targetEl: LayoutElement,
  preserveCustomText = false
): LayoutElement {
  const updated: LayoutElement = {
    ...targetEl,
    x: sourceEl.x,
    y: sourceEl.y,
    width: sourceEl.width,
    height: sourceEl.height,
    visible: sourceEl.visible,
    locked: sourceEl.locked,
    zIndex: sourceEl.zIndex,
    fontSize: sourceEl.fontSize,
    fontWeight: sourceEl.fontWeight,
    fontStyle: sourceEl.fontStyle,
    fontFamily: sourceEl.fontFamily,
    textAlign: sourceEl.textAlign,
    color: sourceEl.color,
    backgroundColor: sourceEl.backgroundColor,
    borderColor: sourceEl.borderColor,
    borderWidth: sourceEl.borderWidth,
    borderRadius: sourceEl.borderRadius,
    padding: sourceEl.padding,
    lineHeight: sourceEl.lineHeight,
    letterSpacing: sourceEl.letterSpacing,
    opacity: sourceEl.opacity,
    imageFit: sourceEl.imageFit,
    imageAspectRatio: sourceEl.imageAspectRatio,
    lockAspectRatio: sourceEl.lockAspectRatio,
  };

  if (sourceEl.imageSrc) {
    updated.imageSrc = sourceEl.imageSrc;
  }

  // Only copy custom text if explicitly allowed (e.g. for custom text blocks, not document title)
  if (!preserveCustomText && sourceEl.type === "custom_text") {
    updated.customText = sourceEl.customText;
  }

  // If table settings exist, copy table styling without modifying business columns
  if (sourceEl.tableSettings && targetEl.tableSettings) {
    updated.tableSettings = {
      ...targetEl.tableSettings,
      headerBg: sourceEl.tableSettings.headerBg,
      headerTextColor: sourceEl.tableSettings.headerTextColor,
      fontSize: sourceEl.tableSettings.fontSize,
      headerFontSize: sourceEl.tableSettings.headerFontSize,
      rowHeight: sourceEl.tableSettings.rowHeight,
      borderThickness: sourceEl.tableSettings.borderThickness,
      borderColor: sourceEl.tableSettings.borderColor,
      bodyTextColor: sourceEl.tableSettings.bodyTextColor,
    };
  }

  return updated;
}

/**
 * Applies selected visual settings or a single element from a source layout
 * to a target layout, guaranteeing that business data is NEVER modified.
 */
export function applyVisualSettingsToLayout(
  sourceLayout: DocumentLayout,
  targetLayout: DocumentLayout,
  options: {
    scopes?: VisualScopeKey[];
    singleElementId?: string;
  }
): DocumentLayout {
  const updated = JSON.parse(JSON.stringify(targetLayout)) as DocumentLayout;

  // Mode 1: Single element propagation
  if (options.singleElementId) {
    const sourceEl = sourceLayout.elements.find((el) => el.id === options.singleElementId);
    if (sourceEl) {
      let found = false;
      updated.elements = updated.elements.map((targetEl) => {
        if (targetEl.id === sourceEl.id || targetEl.type === sourceEl.type) {
          found = true;
          return copyElementVisualProperties(sourceEl, targetEl, sourceEl.type === "doc_title");
        }
        return targetEl;
      });
      // If it's a custom element not yet in target layout, append it
      if (!found && (sourceEl.type === "custom_text" || sourceEl.type === "divider" || sourceEl.type === "custom_image")) {
        updated.elements.push({ ...sourceEl, id: `${sourceEl.id}_${targetLayout.documentType}` });
      }
    }
    return normalizeLayout(updated);
  }

  // Mode 2: Multi-scope visual propagation
  const scopes = new Set(options.scopes || []);

  if (scopes.has("branding_colors")) {
    updated.branding = { ...sourceLayout.branding };
  }

  if (scopes.has("page_margins")) {
    updated.page = {
      ...updated.page,
      margins: { ...sourceLayout.page.margins },
      background: sourceLayout.page.background,
      watermarkOpacity: sourceLayout.page.watermarkOpacity,
    };
  }

  const scopeElementTypes: Partial<Record<VisualScopeKey, string[]>> = {
    logo: ["logo"],
    company_name_en: ["company_name_en"],
    company_name_ar: ["company_name_ar"],
    company_address: ["company_address"],
    header_layout: ["logo", "company_name_en", "company_name_ar", "company_address"],
    doc_title: ["doc_title"],
    watermark: ["watermark"],
    footer: ["footer"],
    bank_details: ["bank_details"],
    payment_terms: ["payment_terms"],
    company_signature: ["company_signature"],
    company_stamp: ["company_stamp"],
  };

  const typesToCopy = new Set<string>();
  for (const scope of scopes) {
    const types = scopeElementTypes[scope];
    if (types) {
      types.forEach((t) => typesToCopy.add(t));
    }
  }

  updated.elements = updated.elements.map((targetEl) => {
    let el = { ...targetEl };

    if (scopes.has("typography")) {
      const matchingSource = sourceLayout.elements.find((s) => s.id === el.id || s.type === el.type);
      if (matchingSource?.fontFamily) {
        el.fontFamily = matchingSource.fontFamily;
      }
    }

    if (typesToCopy.has(el.type) || typesToCopy.has(el.id)) {
      const matchingSource = sourceLayout.elements.find((s) => s.id === el.id || s.type === el.type);
      if (matchingSource) {
        el = copyElementVisualProperties(matchingSource, el, el.type === "doc_title");
      }
    }

    return el;
  });

  return normalizeLayout(updated);
}


export async function saveDocumentLayout(
  companyId: string | null | undefined,
  docType: DocumentTypeId,
  layout: DocumentLayout,
  templateName: string = layout.templateName || "Default UAE Corporate Template"
): Promise<{ success: boolean; error?: string; warning?: string; target: "database" | "local" }> {
  // Always update localStorage first so current user session and preview are instant
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        getLocalStorageKey(companyId, docType),
        JSON.stringify(normalizeLayout(layout))
      );
    } catch (e) {
      console.warn("Failed to write layout to localStorage:", e);
    }
  }

  // If companyId is available, attempt saving to Supabase
  if (companyId) {
    try {
      const { error: clearDefaultError } = await supabase
        .from("document_templates")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("document_type", docType)
        .eq("is_default", true)
        .neq("template_name", templateName);

      if (clearDefaultError) {
        if (isMissingTableError(clearDefaultError.message)) {
          return {
            success: true,
            target: "local",
            warning: "Saved locally in browser. Database table 'document_templates' pending migration.",
          };
        }
        return {
          success: true,
          target: "local",
          warning: `Saved locally. Database sync notice: ${clearDefaultError.message}`,
        };
      }

      const { error } = await supabase.from("document_templates").upsert(
        {
          company_id: companyId,
          document_type: docType,
          template_name: templateName,
          layout_json: normalizeLayout(layout),
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
      if (isMissingTableError(error.message)) {
        return {
          success: true,
          target: "local",
          warning: "Saved locally in browser. Database table 'document_templates' pending migration.",
        };
      }
      return {
        success: true,
        target: "local",
        warning: `Saved locally. Database notice: ${error.message}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isMissingTableError(msg)) {
        return {
          success: true,
          target: "local",
          warning: "Saved locally in browser.",
        };
      }
      return {
        success: true,
        target: "local",
        warning: `Saved locally. Sync notice: ${msg}`,
      };
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
): Promise<{ layout: DocumentLayout; persistenceError?: string }> {
  const defaultLayout = createDefaultLayout(docType);
  const result = await saveDocumentLayout(companyId, docType, defaultLayout, defaultLayout.templateName);
  return { layout: defaultLayout, persistenceError: result.success ? undefined : result.error };
}

/**
 * Processes an uploaded image file (PNG, JPG, JPEG, WEBP), calculates its intrinsic
 * dimensions & aspect ratio, and creates an optimized webp/jpeg/png data URL (max 1200px)
 * so it stays lightweight (~80-150KB) and avoids localStorage quota exhaustion.
 */
export async function processAndOptimizeImage(
  file: File,
  maxDimension = 1200,
  quality = 0.88
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileName: string;
}> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please upload a valid image file (PNG, JPG, JPEG, or WEBP)."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (typeof window === "undefined") {
        resolve({
          dataUrl: rawDataUrl,
          width: 200,
          height: 100,
          aspectRatio: 2,
          fileName: file.name,
        });
        return;
      }

      const img = new window.Image();
      img.onerror = () => reject(new Error("Failed to decode image data."));
      img.onload = () => {
        const origW = img.naturalWidth || img.width || 400;
        const origH = img.naturalHeight || img.height || 200;
        const aspectRatio = origW / Math.max(1, origH);

        // Compute scaled dimensions preserving aspect ratio
        let targetW = origW;
        let targetH = origH;
        if (targetW > maxDimension || targetH > maxDimension) {
          if (targetW > targetH) {
            targetW = maxDimension;
            targetH = Math.max(1, Math.round(maxDimension / aspectRatio));
          } else {
            targetH = maxDimension;
            targetW = Math.max(1, Math.round(maxDimension * aspectRatio));
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            dataUrl: rawDataUrl,
            width: origW,
            height: origH,
            aspectRatio,
            fileName: file.name,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);
        const isTransparent = file.type === "image/png" || file.type === "image/webp";
        const format = isTransparent ? "image/png" : "image/jpeg";
        let optimizedDataUrl: string;
        try {
          optimizedDataUrl = canvas.toDataURL(format, quality);
        } catch {
          optimizedDataUrl = rawDataUrl;
        }

        resolve({
          dataUrl: optimizedDataUrl,
          width: targetW,
          height: targetH,
          aspectRatio,
          fileName: file.name,
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
