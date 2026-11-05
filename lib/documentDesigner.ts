/**
 * ==============================================================================
 * Dubai ERP: Document Designer Core Engine & Layout Model
 * ==============================================================================
 * Comprehensive layout state, element types, A4 coordinate calculation (mm),
 * default UAE corporate templates, and database persistence with offline fallback.
 * ==============================================================================
 */

import { supabase } from "./supabase";
import { createDocumentCloud, revisionOf, cloudError, type CloudRevision } from './documentCloud';
import { preserveDesignDraft } from './documentDesignBackup';
import {
  type DocNumberingConfig,
  DEFAULT_NUMBERING_CONFIGS,
} from "./documentNumbering";

export type { DocNumberingConfig } from "./documentNumbering";
export { DEFAULT_NUMBERING_CONFIGS, formatDocNumber, getCachedDocNumberingConfig } from "./documentNumbering";
export const documentCloud = createDocumentCloud(supabase);
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange(() => documentCloud.clearPreviewCache());
  window.addEventListener('storage', event => {
    if (event.key === 'dubai-erp.design-preview-invalidated' || event.key === null) documentCloud.clearPreviewCache();
  });
}
export function peekDocumentPreview(companyId: string | null | undefined, documentType: DocumentTypeId): LoadedDocumentDesign | undefined {
  const snapshot = companyId ? documentCloud.peekPreview(companyId, documentType) : undefined;
  if (!snapshot?.template) return undefined;
  return {layout: normalizeLayout({...snapshot.template.layout_json, templateName: snapshot.template.template_name}),
    source: 'database', revision: revisionOf(snapshot), updatedAt: snapshot.template.updated_at};
}
export interface LoadedDocumentDesign {
  layout: DocumentLayout; source: 'database' | 'local' | 'default';
  revision?: CloudRevision; error?: string; updatedAt?: string;
}

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
  | "employee_payment_voucher"
  | "measurement_sheet";

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
  {
    id: "measurement_sheet",
    label: "Measurement & Takeoff Sheet",
    labelAr: "جدول حصر الكميات والمقاسات",
    defaultTitle: "MEASUREMENT & TAKEOFF SHEET",
    defaultTitleAr: "جدول حصر الكميات والمقاسات",
    category: "operations",
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
  fontSize?: number; // per-column font size in PT
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
  fontSize?: number; // in PT (e.g. 8 to 48 pt, decimal supported)
  fontWeight?: "normal" | "medium" | "semibold" | "bold" | "extrabold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number; // px
  borderRadius?: number; // px
  padding?: number; // mm
  lineHeight?: number;
  letterSpacing?: number; // px / pt
  opacity?: number; // 0 to 1
  textWrapping?: "wrap" | "nowrap" | "clip";
  autoFitText?: boolean;
  minFontSize?: number; // in PT, default 6

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
    fontSize: number; // general body font size in PT
    headerFontSize?: number; // header font size in PT
    descriptionFontSize?: number; // description column font size in PT
    qtyFontSize?: number; // qty column font size in PT
    unitFontSize?: number; // unit column font size in PT
    rateFontSize?: number; // rate column font size in PT
    amountFontSize?: number; // amount column font size in PT
    rowHeight: number; // mm
    headerHeight?: number; // mm
    cellPadding?: number; // mm
    borderThickness: number;
    borderColor: string;
    bodyTextColor: string;
    columns: TableColumnConfig[];
  };

  // Totals labels customization
  totalsLabels?: {
    subtotal?: string;
    vat?: string;
    grandTotal?: string;
    subtotalAr?: string;
    vatAr?: string;
    grandTotalAr?: string;
    balanceDue?: string;
    balanceDueAr?: string;
  };

  // Flow & Dynamic Spacing Controls
  flowMode?: "flow" | "fixed";
  flowAnchorId?: string;
  minGapMm?: number;
}

export type DecorativeBorderStyle =
  | "straight"
  | "diagonal"
  | "custom"
  | "solid"
  | "dashed"
  | "dotted"
  | "double";

export type CustomDecorativeBorderSubtype =
  | "geometric_ribbon"
  | "accent_corner"
  | "double_stripe"
  | "wave"
  | "chevron"
  | "custom_path";

export interface PageDecorativeBorder {
  enabled: boolean;
  style: DecorativeBorderStyle;
  color: string;
  thickness: number; // in mm
  position: number;  // offset in mm from edge (0 = flush with edge)
  x?: number;        // X position in mm
  y?: number;        // Y position in mm (starting Y for left/right borders)
  width?: number;    // Width in mm (for top/bottom borders)
  length?: number;   // Length in mm (for left/right borders)
  widthMode?: "full" | "margins" | "custom";
  align?: "left" | "center" | "right";
  angle: number;     // degrees (-45 to +45)
  opacity: number;   // 0.0 to 1.0 (default 1)
  locked?: boolean;
  zIndex?: number;
  customSubtype?: CustomDecorativeBorderSubtype;
  customSvgPath?: string;
  secondaryColor?: string;
}

export interface PageBorderSettings {
  top: PageDecorativeBorder;
  bottom: PageDecorativeBorder;
  left?: PageDecorativeBorder;
  right?: PageDecorativeBorder;
}

export const DEFAULT_PAGE_BORDERS: PageBorderSettings = {
  top: {
    enabled: true,
    style: "straight",
    color: "#E0AC23", // Gold
    thickness: 4,
    position: 0,
    angle: 0,
    opacity: 1,
    customSubtype: "geometric_ribbon",
    secondaryColor: "#173C64",
    widthMode: "full",
    align: "center",
  },
  bottom: {
    enabled: true,
    style: "straight",
    color: "#173C64", // Navy Blue
    thickness: 4,
    position: 0,
    angle: 0,
    opacity: 1,
    customSubtype: "geometric_ribbon",
    secondaryColor: "#E0AC23",
    widthMode: "full",
    align: "center",
  },
  left: {
    enabled: false,
    style: "solid",
    color: "#CBD5E1",
    thickness: 1,
    position: 0,
    y: 0,
    length: 297,
    angle: 0,
    opacity: 1,
  },
  right: {
    enabled: false,
    style: "solid",
    color: "#CBD5E1",
    thickness: 1,
    position: 0,
    y: 0,
    length: 297,
    angle: 0,
    opacity: 1,
  },
};

export function normalizePageBorders(borders?: Partial<PageBorderSettings> | null): Required<PageBorderSettings> {
  const defLeft = DEFAULT_PAGE_BORDERS.left!;
  const defRight = DEFAULT_PAGE_BORDERS.right!;

  return {
    top: {
      enabled: borders?.top?.enabled ?? DEFAULT_PAGE_BORDERS.top.enabled,
      style: borders?.top?.style ?? DEFAULT_PAGE_BORDERS.top.style,
      color: borders?.top?.color || DEFAULT_PAGE_BORDERS.top.color,
      thickness: Number.isFinite(borders?.top?.thickness) ? borders!.top!.thickness : DEFAULT_PAGE_BORDERS.top.thickness,
      position: Number.isFinite(borders?.top?.position) ? borders!.top!.position : DEFAULT_PAGE_BORDERS.top.position,
      x: borders?.top?.x,
      y: borders?.top?.y,
      width: borders?.top?.width,
      length: borders?.top?.length,
      widthMode: borders?.top?.widthMode || "full",
      align: borders?.top?.align || "center",
      angle: Number.isFinite(borders?.top?.angle) ? borders!.top!.angle : DEFAULT_PAGE_BORDERS.top.angle,
      opacity: Number.isFinite(borders?.top?.opacity) ? borders!.top!.opacity : DEFAULT_PAGE_BORDERS.top.opacity,
      locked: borders?.top?.locked ?? false,
      zIndex: borders?.top?.zIndex,
      customSubtype: borders?.top?.customSubtype || DEFAULT_PAGE_BORDERS.top.customSubtype,
      customSvgPath: borders?.top?.customSvgPath,
      secondaryColor: borders?.top?.secondaryColor || DEFAULT_PAGE_BORDERS.top.secondaryColor,
    },
    bottom: {
      enabled: borders?.bottom?.enabled ?? DEFAULT_PAGE_BORDERS.bottom.enabled,
      style: borders?.bottom?.style ?? DEFAULT_PAGE_BORDERS.bottom.style,
      color: borders?.bottom?.color || DEFAULT_PAGE_BORDERS.bottom.color,
      thickness: Number.isFinite(borders?.bottom?.thickness) ? borders!.bottom!.thickness : DEFAULT_PAGE_BORDERS.bottom.thickness,
      position: Number.isFinite(borders?.bottom?.position) ? borders!.bottom!.position : DEFAULT_PAGE_BORDERS.bottom.position,
      x: borders?.bottom?.x,
      y: borders?.bottom?.y,
      width: borders?.bottom?.width,
      length: borders?.bottom?.length,
      widthMode: borders?.bottom?.widthMode || "full",
      align: borders?.bottom?.align || "center",
      angle: Number.isFinite(borders?.bottom?.angle) ? borders!.bottom!.angle : DEFAULT_PAGE_BORDERS.bottom.angle,
      opacity: Number.isFinite(borders?.bottom?.opacity) ? borders!.bottom!.opacity : DEFAULT_PAGE_BORDERS.bottom.opacity,
      locked: borders?.bottom?.locked ?? false,
      zIndex: borders?.bottom?.zIndex,
      customSubtype: borders?.bottom?.customSubtype || DEFAULT_PAGE_BORDERS.bottom.customSubtype,
      customSvgPath: borders?.bottom?.customSvgPath,
      secondaryColor: borders?.bottom?.secondaryColor || DEFAULT_PAGE_BORDERS.bottom.secondaryColor,
    },
    left: {
      enabled: borders?.left?.enabled ?? defLeft.enabled,
      style: borders?.left?.style ?? defLeft.style,
      color: borders?.left?.color || defLeft.color,
      thickness: Number.isFinite(borders?.left?.thickness) ? borders!.left!.thickness : defLeft.thickness,
      position: Number.isFinite(borders?.left?.position) ? borders!.left!.position : defLeft.position,
      x: borders?.left?.x,
      y: Number.isFinite(borders?.left?.y) ? borders!.left!.y : defLeft.y,
      width: borders?.left?.width,
      length: Number.isFinite(borders?.left?.length) ? borders!.left!.length : defLeft.length,
      angle: Number.isFinite(borders?.left?.angle) ? borders!.left!.angle : defLeft.angle,
      opacity: Number.isFinite(borders?.left?.opacity) ? borders!.left!.opacity : defLeft.opacity,
      locked: borders?.left?.locked ?? false,
      zIndex: borders?.left?.zIndex,
    },
    right: {
      enabled: borders?.right?.enabled ?? defRight.enabled,
      style: borders?.right?.style ?? defRight.style,
      color: borders?.right?.color || defRight.color,
      thickness: Number.isFinite(borders?.right?.thickness) ? borders!.right!.thickness : defRight.thickness,
      position: Number.isFinite(borders?.right?.position) ? borders!.right!.position : defRight.position,
      x: borders?.right?.x,
      y: Number.isFinite(borders?.right?.y) ? borders!.right!.y : defRight.y,
      width: borders?.right?.width,
      length: Number.isFinite(borders?.right?.length) ? borders!.right!.length : defRight.length,
      angle: Number.isFinite(borders?.right?.angle) ? borders!.right!.angle : defRight.angle,
      opacity: Number.isFinite(borders?.right?.opacity) ? borders!.right!.opacity : defRight.opacity,
      locked: borders?.right?.locked ?? false,
      zIndex: borders?.right?.zIndex,
    },
  };
}

export function getBorderAsLayoutElement(
  borderId: string,
  layout: DocumentLayout
): LayoutElement | null {
  const borders = normalizePageBorders(layout.page?.borders);
  const pw = layout.page?.widthMm || 210;
  const ph = layout.page?.heightMm || 297;
  const margins = layout.page?.margins || { top: 10, bottom: 10, left: 10, right: 10 };

  if (borderId === "border_top") {
    const b = borders.top;
    let x = b.x ?? 0;
    let w = b.width;
    if (b.widthMode === "margins") {
      x = margins.left;
      w = pw - margins.left - margins.right;
    } else if (b.widthMode === "full" || w === undefined) {
      x = b.x ?? 0;
      w = w ?? (pw - x);
    }
    return {
      id: "border_top",
      type: "divider",
      label: "Top Page Border",
      x,
      y: b.position ?? 0,
      width: w,
      height: Math.max(0.5, b.thickness ?? 4),
      visible: b.enabled,
      locked: b.locked ?? false,
      color: b.color,
      opacity: b.opacity,
      zIndex: b.zIndex ?? 5,
    };
  }

  if (borderId === "border_bottom") {
    const b = borders.bottom;
    let x = b.x ?? 0;
    let w = b.width;
    if (b.widthMode === "margins") {
      x = margins.left;
      w = pw - margins.left - margins.right;
    } else if (b.widthMode === "full" || w === undefined) {
      x = b.x ?? 0;
      w = w ?? (pw - x);
    }
    const h = Math.max(0.5, b.thickness ?? 4);
    const y = ph - (b.position ?? 0) - h;
    return {
      id: "border_bottom",
      type: "divider",
      label: "Bottom Page Border",
      x,
      y,
      width: w,
      height: h,
      visible: b.enabled,
      locked: b.locked ?? false,
      color: b.color,
      opacity: b.opacity,
      zIndex: b.zIndex ?? 5,
    };
  }

  if (borderId === "border_left") {
    const b = borders.left;
    const y = b.y ?? 0;
    const len = b.length ?? (ph - y);
    const w = Math.max(0.5, b.thickness ?? 1);
    return {
      id: "border_left",
      type: "divider",
      label: "Left Page Border",
      x: b.position ?? 0,
      y,
      width: w,
      height: len,
      visible: b.enabled,
      locked: b.locked ?? false,
      color: b.color,
      opacity: b.opacity,
      zIndex: b.zIndex ?? 5,
    };
  }

  if (borderId === "border_right") {
    const b = borders.right;
    const y = b.y ?? 0;
    const len = b.length ?? (ph - y);
    const w = Math.max(0.5, b.thickness ?? 1);
    const x = pw - (b.position ?? 0) - w;
    return {
      id: "border_right",
      type: "divider",
      label: "Right Page Border",
      x,
      y,
      width: w,
      height: len,
      visible: b.enabled,
      locked: b.locked ?? false,
      color: b.color,
      opacity: b.opacity,
      zIndex: b.zIndex ?? 5,
    };
  }

  return null;
}

export type SmartFitMode = "compact" | "balanced" | "readability";
export type PreferredDensity = "auto" | "normal" | "compact" | "dense" | "ultra_dense";

export interface SmartFitSettings {
  enabled: boolean;
  mode: SmartFitMode;
  preferredDensity?: PreferredDensity;
  minFontSize: number;
  minRowHeight: number;
  minSectionGap?: number;
  maxItemsBeforeMultipage?: number;
  preferSinglePage?: boolean;
  automaticSpacing: boolean;
  printSafeBorders: boolean;
  preventOverflow: boolean;
  compactEmptySpace?: boolean;
}

export const DEFAULT_SMART_FIT_SETTINGS: SmartFitSettings = {
  enabled: true,
  mode: "balanced",
  preferredDensity: "auto",
  minFontSize: 7.5,
  minRowHeight: 4.8,
  minSectionGap: 1.5,
  maxItemsBeforeMultipage: 28,
  preferSinglePage: true,
  automaticSpacing: true,
  printSafeBorders: true,
  preventOverflow: true,
  compactEmptySpace: false,
};

export function normalizeSmartFit(smartFit?: Partial<SmartFitSettings> | null): SmartFitSettings {
  return {
    enabled: smartFit?.enabled ?? DEFAULT_SMART_FIT_SETTINGS.enabled,
    mode:
      smartFit?.mode === "compact" || smartFit?.mode === "readability" || smartFit?.mode === "balanced"
        ? smartFit.mode
        : DEFAULT_SMART_FIT_SETTINGS.mode,
    preferredDensity:
      smartFit?.preferredDensity === "normal" ||
      smartFit?.preferredDensity === "compact" ||
      smartFit?.preferredDensity === "dense" ||
      smartFit?.preferredDensity === "ultra_dense" ||
      smartFit?.preferredDensity === "auto"
        ? smartFit.preferredDensity
        : DEFAULT_SMART_FIT_SETTINGS.preferredDensity,
    minFontSize: Number.isFinite(smartFit?.minFontSize)
      ? Math.max(6.5, Math.min(12, smartFit!.minFontSize!))
      : DEFAULT_SMART_FIT_SETTINGS.minFontSize,
    minRowHeight: Number.isFinite(smartFit?.minRowHeight)
      ? Math.max(4.0, Math.min(12, smartFit!.minRowHeight!))
      : DEFAULT_SMART_FIT_SETTINGS.minRowHeight,
    minSectionGap: Number.isFinite(smartFit?.minSectionGap)
      ? Math.max(0.5, Math.min(10, smartFit!.minSectionGap!))
      : DEFAULT_SMART_FIT_SETTINGS.minSectionGap,
    maxItemsBeforeMultipage: Number.isFinite(smartFit?.maxItemsBeforeMultipage)
      ? Math.max(10, Math.min(50, smartFit!.maxItemsBeforeMultipage!))
      : DEFAULT_SMART_FIT_SETTINGS.maxItemsBeforeMultipage,
    preferSinglePage: smartFit?.preferSinglePage ?? DEFAULT_SMART_FIT_SETTINGS.preferSinglePage,
    automaticSpacing: smartFit?.automaticSpacing ?? DEFAULT_SMART_FIT_SETTINGS.automaticSpacing,
    printSafeBorders: smartFit?.printSafeBorders ?? DEFAULT_SMART_FIT_SETTINGS.printSafeBorders,
    preventOverflow: smartFit?.preventOverflow ?? DEFAULT_SMART_FIT_SETTINGS.preventOverflow,
    compactEmptySpace: smartFit?.compactEmptySpace ?? false,
  };
}

export type PrintColorMode = "color" | "grayscale";
export type BorderContrastMode = "standard" | "high" | "maximum";
export type MarginPreset = "office_safe" | "standard" | "minimal" | "custom";

export interface PrintSettings {
  colorMode: PrintColorMode;
  borderContrast: BorderContrastMode;
  printerSafeMargins: boolean;
  printerFriendlyMode: boolean;
  marginPreset: MarginPreset;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  colorMode: "color",
  borderContrast: "high",
  printerSafeMargins: true,
  printerFriendlyMode: false,
  marginPreset: "standard",
};

export function normalizePrintSettings(settings?: Partial<PrintSettings> | null): PrintSettings {
  return {
    colorMode: settings?.colorMode === "grayscale" ? "grayscale" : "color",
    borderContrast:
      settings?.borderContrast === "maximum" || settings?.borderContrast === "standard"
        ? settings.borderContrast
        : "high",
    printerSafeMargins: settings?.printerSafeMargins ?? DEFAULT_PRINT_SETTINGS.printerSafeMargins,
    printerFriendlyMode: settings?.printerFriendlyMode ?? DEFAULT_PRINT_SETTINGS.printerFriendlyMode,
    marginPreset: settings?.marginPreset || DEFAULT_PRINT_SETTINGS.marginPreset,
  };
}

export interface DocumentBranding {
  primaryColor: string;
  companyHeaderColor?: string;
  titleBackground?: string;
  titleTextColor?: string;
  accentColor: string;
  tableHeaderColor: string;
  tableHeaderTextColor?: string;
  borderColor: string;
  tableRowBackground?: string;
  tableRowAlternating?: string;
  textColor: string;
  mutedColor: string;
  totalHighlightColor: string;
  footerBackground?: string;
  footerTextColor?: string;
  attendanceSundayHighlight?: string;
  attendancePresentColor?: string;
  attendanceAbsentColor?: string;
  attendanceHolidayColor?: string;
  attendanceLeaveColor?: string;
}

export interface ColorPreset {
  id: string;
  name: string;
  nameAr: string;
  branding: DocumentBranding;
}

export const BUILT_IN_COLOR_PRESETS: ColorPreset[] = [
  {
    id: "corporate_navy",
    name: "Corporate Navy & Gold (Default)",
    nameAr: "الكحلي الرسمي والذهبي",
    branding: {
      primaryColor: "#0F172A",
      companyHeaderColor: "#0F172A",
      titleBackground: "#0F172A",
      titleTextColor: "#FFFFFF",
      accentColor: "#C9A227",
      tableHeaderColor: "#0F172A",
      tableHeaderTextColor: "#FFFFFF",
      borderColor: "#CBD5E1",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#F8FAFC",
      textColor: "#334155",
      mutedColor: "#64748B",
      totalHighlightColor: "#F8F6ED",
      footerBackground: "#FFFFFF",
      footerTextColor: "#64748B",
      attendanceSundayHighlight: "#D1FAE5",
      attendancePresentColor: "#047857",
      attendanceAbsentColor: "#BE123C",
      attendanceHolidayColor: "#0284C7",
      attendanceLeaveColor: "#B45309",
    },
  },
  {
    id: "emerald_forest",
    name: "UAE Emerald & Forest Green",
    nameAr: "الأخضر الزمردي الإماراتي",
    branding: {
      primaryColor: "#065F46",
      companyHeaderColor: "#065F46",
      titleBackground: "#065F46",
      titleTextColor: "#FFFFFF",
      accentColor: "#10B981",
      tableHeaderColor: "#047857",
      tableHeaderTextColor: "#FFFFFF",
      borderColor: "#A7F3D0",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#F0FDF4",
      textColor: "#1F2937",
      mutedColor: "#64748B",
      totalHighlightColor: "#ECFDF5",
      footerBackground: "#FFFFFF",
      footerTextColor: "#065F46",
      attendanceSundayHighlight: "#ECFDF5",
      attendancePresentColor: "#059669",
      attendanceAbsentColor: "#DC2626",
      attendanceHolidayColor: "#0284C7",
      attendanceLeaveColor: "#D97706",
    },
  },
  {
    id: "royal_indigo",
    name: "Royal Indigo & Amber",
    nameAr: "النيلي الملكي والكهرمان",
    branding: {
      primaryColor: "#312E81",
      companyHeaderColor: "#312E81",
      titleBackground: "#3730A3",
      titleTextColor: "#FFFFFF",
      accentColor: "#F59E0B",
      tableHeaderColor: "#3730A3",
      tableHeaderTextColor: "#FFFFFF",
      borderColor: "#C7D2FE",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#EEF2FF",
      textColor: "#312E4A",
      mutedColor: "#6B7280",
      totalHighlightColor: "#FEF3C7",
      footerBackground: "#FFFFFF",
      footerTextColor: "#312E81",
      attendanceSundayHighlight: "#EEF2FF",
      attendancePresentColor: "#4338CA",
      attendanceAbsentColor: "#E11D48",
      attendanceHolidayColor: "#0284C7",
      attendanceLeaveColor: "#D97706",
    },
  },
  {
    id: "executive_slate",
    name: "Executive Slate & Charcoal",
    nameAr: "الرمادي التنفيذي والفحمي",
    branding: {
      primaryColor: "#1E293B",
      companyHeaderColor: "#1E293B",
      titleBackground: "#334155",
      titleTextColor: "#FFFFFF",
      accentColor: "#3B82F6",
      tableHeaderColor: "#1E293B",
      tableHeaderTextColor: "#FFFFFF",
      borderColor: "#94A3B8",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#F1F5F9",
      textColor: "#0F172A",
      mutedColor: "#475569",
      totalHighlightColor: "#E2E8F0",
      footerBackground: "#FFFFFF",
      footerTextColor: "#475569",
      attendanceSundayHighlight: "#F1F5F9",
      attendancePresentColor: "#0284C7",
      attendanceAbsentColor: "#DC2626",
      attendanceHolidayColor: "#64748B",
      attendanceLeaveColor: "#D97706",
    },
  },
  {
    id: "minimalist_mono",
    name: "Modern Minimalist Mono",
    nameAr: "أحادي اللون العصري",
    branding: {
      primaryColor: "#18181B",
      companyHeaderColor: "#18181B",
      titleBackground: "#27272A",
      titleTextColor: "#FFFFFF",
      accentColor: "#71717A",
      tableHeaderColor: "#18181B",
      tableHeaderTextColor: "#FFFFFF",
      borderColor: "#E4E4E7",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#FAFAFA",
      textColor: "#09090B",
      mutedColor: "#71717A",
      totalHighlightColor: "#F4F4F5",
      footerBackground: "#FFFFFF",
      footerTextColor: "#71717A",
      attendanceSundayHighlight: "#F4F4F5",
      attendancePresentColor: "#18181B",
      attendanceAbsentColor: "#71717A",
      attendanceHolidayColor: "#A1A1AA",
      attendanceLeaveColor: "#52525B",
    },
  },
  {
    id: "printer_safe_bw",
    name: "Printer-Safe High Contrast (Ink Saver)",
    nameAr: "موفر الحبر عالي التباين للطباعة",
    branding: {
      primaryColor: "#000000",
      companyHeaderColor: "#000000",
      titleBackground: "#FFFFFF",
      titleTextColor: "#000000",
      accentColor: "#000000",
      tableHeaderColor: "#FFFFFF",
      tableHeaderTextColor: "#000000",
      borderColor: "#000000",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#FFFFFF",
      textColor: "#000000",
      mutedColor: "#333333",
      totalHighlightColor: "#FFFFFF",
      footerBackground: "#FFFFFF",
      footerTextColor: "#000000",
      attendanceSundayHighlight: "#F3F4F6",
      attendancePresentColor: "#000000",
      attendanceAbsentColor: "#000000",
      attendanceHolidayColor: "#333333",
      attendanceLeaveColor: "#333333",
    },
  },
];

export type DesignerLayoutMode = "manual" | "assisted" | "auto_fit";

export interface DocumentLayout {
  version: number;
  documentType: DocumentTypeId;
  templateName: string;
  layoutMode?: DesignerLayoutMode;
  documentTitle?: string;
  documentTitleAr?: string;
  numberingConfig?: DocNumberingConfig;
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
    borders?: PageBorderSettings;
    smartFit?: SmartFitSettings;
    printSettings?: PrintSettings;
    compactEmptySpace?: boolean;
  };
  branding: DocumentBranding;
  elements: LayoutElement[];
}

export const CURRENT_LAYOUT_VERSION = 9;

const VAT_DOCUMENT_TYPES = new Set<DocumentTypeId>([
  "tax_invoice",
  "quotation",
  "proforma_invoice",
  "purchase_order",
  "supplier_bill",
]);

export function documentUsesVat(docType: DocumentTypeId): boolean {
  return VAT_DOCUMENT_TYPES.has(docType);
}

const DOCUMENT_STYLES: Record<DocumentTypeId, DocumentBranding> = {
  tax_invoice: {
    primaryColor: "#0F172A",
    companyHeaderColor: "#0F172A",
    titleBackground: "#0F172A",
    titleTextColor: "#FFFFFF",
    accentColor: "#C9A227",
    textColor: "#334155",
    mutedColor: "#64748B",
    borderColor: "#CBD5E1",
    tableHeaderColor: "#0F172A",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F8FAFC",
    totalHighlightColor: "#F8F6ED",
    footerBackground: "#FFFFFF",
    footerTextColor: "#64748B",
    attendanceSundayHighlight: "#D1FAE5",
    attendancePresentColor: "#047857",
    attendanceAbsentColor: "#BE123C",
    attendanceHolidayColor: "#0284C7",
    attendanceLeaveColor: "#B45309",
  },
  quotation: {
    primaryColor: "#0F4C5C",
    companyHeaderColor: "#0F4C5C",
    titleBackground: "#0F4C5C",
    titleTextColor: "#FFFFFF",
    accentColor: "#D4A72C",
    textColor: "#263238",
    mutedColor: "#607D8B",
    borderColor: "#B0BEC5",
    tableHeaderColor: "#0F4C5C",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#EDF7F8",
    totalHighlightColor: "#EDF7F8",
    footerBackground: "#FFFFFF",
    footerTextColor: "#0F4C5C",
  },
  proforma_invoice: {
    primaryColor: "#0F172A",
    companyHeaderColor: "#0F172A",
    titleBackground: "#0F172A",
    titleTextColor: "#FFFFFF",
    accentColor: "#C9A227",
    textColor: "#334155",
    mutedColor: "#64748B",
    borderColor: "#CBD5E1",
    tableHeaderColor: "#0F172A",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F8FAFC",
    totalHighlightColor: "#F8F6ED",
    footerBackground: "#FFFFFF",
    footerTextColor: "#64748B",
  },
  delivery_note: {
    primaryColor: "#065F46",
    companyHeaderColor: "#065F46",
    titleBackground: "#065F46",
    titleTextColor: "#FFFFFF",
    accentColor: "#10B981",
    textColor: "#1F2937",
    mutedColor: "#64748B",
    borderColor: "#A7F3D0",
    tableHeaderColor: "#047857",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F0FDF4",
    totalHighlightColor: "#ECFDF5",
    footerBackground: "#FFFFFF",
    footerTextColor: "#065F46",
  },
  purchase_order: {
    primaryColor: "#7F1D1D",
    companyHeaderColor: "#7F1D1D",
    titleBackground: "#7F1D1D",
    titleTextColor: "#FFFFFF",
    accentColor: "#D4A72C",
    textColor: "#3F2A2A",
    mutedColor: "#78716C",
    borderColor: "#E7C7C7",
    tableHeaderColor: "#7F1D1D",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#FFF7ED",
    totalHighlightColor: "#FFF7ED",
    footerBackground: "#FFFFFF",
    footerTextColor: "#7F1D1D",
  },
  receipt_voucher: {
    primaryColor: "#075985",
    companyHeaderColor: "#075985",
    titleBackground: "#0369A1",
    titleTextColor: "#FFFFFF",
    accentColor: "#16A34A",
    textColor: "#1E3A5F",
    mutedColor: "#64748B",
    borderColor: "#BAE6FD",
    tableHeaderColor: "#0369A1",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F0FDF4",
    totalHighlightColor: "#F0FDF4",
    footerBackground: "#FFFFFF",
    footerTextColor: "#075985",
  },
  customer_statement: {
    primaryColor: "#1E293B",
    companyHeaderColor: "#1E293B",
    titleBackground: "#334155",
    titleTextColor: "#FFFFFF",
    accentColor: "#2563EB",
    textColor: "#334155",
    mutedColor: "#64748B",
    borderColor: "#CBD5E1",
    tableHeaderColor: "#334155",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F1F5F9",
    totalHighlightColor: "#EFF6FF",
    footerBackground: "#FFFFFF",
    footerTextColor: "#475569",
  },
  supplier_bill: {
    primaryColor: "#78350F",
    companyHeaderColor: "#78350F",
    titleBackground: "#92400E",
    titleTextColor: "#FFFFFF",
    accentColor: "#D97706",
    textColor: "#422006",
    mutedColor: "#78716C",
    borderColor: "#FED7AA",
    tableHeaderColor: "#92400E",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#FFFBEB",
    totalHighlightColor: "#FFFBEB",
    footerBackground: "#FFFFFF",
    footerTextColor: "#78350F",
  },
  salary_statement: {
    primaryColor: "#5B21B6",
    companyHeaderColor: "#5B21B6",
    titleBackground: "#6D28D9",
    titleTextColor: "#FFFFFF",
    accentColor: "#0D9488",
    textColor: "#312E4A",
    mutedColor: "#6B7280",
    borderColor: "#DDD6FE",
    tableHeaderColor: "#6D28D9",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F5F3FF",
    totalHighlightColor: "#F5F3FF",
    footerBackground: "#FFFFFF",
    footerTextColor: "#5B21B6",
  },
  project_handover: {
    primaryColor: "#14532D",
    companyHeaderColor: "#14532D",
    titleBackground: "#166534",
    titleTextColor: "#FFFFFF",
    accentColor: "#CA8A04",
    textColor: "#26352B",
    mutedColor: "#64748B",
    borderColor: "#BBF7D0",
    tableHeaderColor: "#166534",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F7FEE7",
    totalHighlightColor: "#F7FEE7",
    footerBackground: "#FFFFFF",
    footerTextColor: "#14532D",
  },
  work_method_statement: {
    primaryColor: "#9A3412",
    companyHeaderColor: "#9A3412",
    titleBackground: "#C2410C",
    titleTextColor: "#FFFFFF",
    accentColor: "#F59E0B",
    textColor: "#431407",
    mutedColor: "#78716C",
    borderColor: "#FED7AA",
    tableHeaderColor: "#C2410C",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#FFF7ED",
    totalHighlightColor: "#FFF7ED",
    footerBackground: "#FFFFFF",
    footerTextColor: "#9A3412",
  },
  employee_payment_voucher: {
    primaryColor: "#164E63",
    companyHeaderColor: "#164E63",
    titleBackground: "#155E75",
    titleTextColor: "#FFFFFF",
    accentColor: "#0891B2",
    textColor: "#243B45",
    mutedColor: "#64748B",
    borderColor: "#A5F3FC",
    tableHeaderColor: "#155E75",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#ECFEFF",
    totalHighlightColor: "#ECFEFF",
    footerBackground: "#FFFFFF",
    footerTextColor: "#164E63",
  },
  measurement_sheet: {
    primaryColor: "#0F172A",
    companyHeaderColor: "#0F172A",
    titleBackground: "#0F172A",
    titleTextColor: "#FFFFFF",
    accentColor: "#059669",
    textColor: "#334155",
    mutedColor: "#64748B",
    borderColor: "#CBD5E1",
    tableHeaderColor: "#0F172A",
    tableHeaderTextColor: "#FFFFFF",
    tableRowBackground: "#FFFFFF",
    tableRowAlternating: "#F0FDF4",
    totalHighlightColor: "#F0FDF4",
    footerBackground: "#FFFFFF",
    footerTextColor: "#64748B",
  },
};

// ── Default Table Columns ──────────────────────────────────────────────────────
export const DEFAULT_INVOICE_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 5, align: "center" },
  { key: "description", label: "Item Description / البيان", visible: true, widthPct: 40, align: "left" },
  { key: "quantity", label: "Qty", visible: true, widthPct: 8, align: "center" },
  { key: "unit", label: "Unit", visible: true, widthPct: 8, align: "center" },
  { key: "unit_price", label: "Rate (AED)", visible: true, widthPct: 12, align: "center" },
  { key: "discount", label: "Disc.", visible: false, widthPct: 8, align: "center" },
  { key: "vat_amount", label: "VAT (5%)", visible: true, widthPct: 11, align: "center" },
  { key: "line_total", label: "Total (AED)", visible: true, widthPct: 16, align: "center" },
];

export const DEFAULT_DELIVERY_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 6, align: "center" },
  { key: "description", label: "Item Description & Specifications", visible: true, widthPct: 54, align: "left" },
  { key: "quantity", label: "Delivered Qty", visible: true, widthPct: 20, align: "center" },
  { key: "unit", label: "Unit", visible: true, widthPct: 20, align: "center" },
];

export const DEFAULT_STATEMENT_COLUMNS: TableColumnConfig[] = [
  { key: "date", label: "Date", visible: true, widthPct: 11, align: "center" },
  { key: "type", label: "Type", visible: true, widthPct: 12, align: "center" },
  { key: "reference", label: "Ref #", visible: true, widthPct: 12, align: "center" },
  { key: "description", label: "Description", visible: true, widthPct: 27, align: "left" },
  { key: "debit", label: "Debit (AED)", visible: true, widthPct: 12, align: "right" },
  { key: "credit", label: "Credit (AED)", visible: true, widthPct: 12, align: "right" },
  { key: "balance", label: "Balance (AED)", visible: true, widthPct: 14, align: "right" },
];

export const SOA_REFERENCE_STATEMENT_COLUMNS: TableColumnConfig[] = [
  { key: "date", label: "Date", visible: true, widthPct: 11, align: "center" },
  { key: "type", label: "Type", visible: true, widthPct: 12, align: "center" },
  { key: "reference", label: "Ref #", visible: true, widthPct: 12, align: "center" },
  { key: "description", label: "Description", visible: true, widthPct: 27, align: "left" },
  { key: "debit", label: "Charges (AED)", visible: true, widthPct: 12, align: "right" },
  { key: "credit", label: "Credits (AED)", visible: true, widthPct: 12, align: "right" },
  { key: "balance", label: "Balance (AED)", visible: true, widthPct: 14, align: "right" },
];

export const DEFAULT_SALARY_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 8, align: "center" },
  { key: "description", label: "Earnings / Deductions", visible: true, widthPct: 62, align: "left" },
  { key: "line_total", label: "Amount (AED)", visible: true, widthPct: 30, align: "center" },
];

export const DEFAULT_MEASUREMENT_COLUMNS: TableColumnConfig[] = [
  { key: "index", label: "#", visible: true, widthPct: 4, align: "center" },
  { key: "area_name", label: "Area / Ref", visible: true, widthPct: 13, align: "left" },
  { key: "description", label: "Description & Notes", visible: true, widthPct: 33, align: "left" },
  { key: "dimensions", label: "Dimensions", visible: true, widthPct: 16, align: "center" },
  { key: "quantity", label: "Qty", visible: true, widthPct: 8, align: "center" },
  { key: "calc_type", label: "Calculation Type & Formula", visible: false, widthPct: 18, align: "left" },
  { key: "result", label: "Result & Unit", visible: true, widthPct: 12, align: "center" },
  { key: "rate", label: "Rate (AED)", visible: true, widthPct: 6, align: "center" },
  { key: "line_total", label: "Amount (AED)", visible: true, widthPct: 8, align: "center" },
];

type ElementOverrides = Record<string, Partial<LayoutElement>>;

/**
 * Enforces the business purpose of each PDF. Financial tax documents keep VAT,
 * while operational, payroll, statement, and voucher documents get dedicated
 * content blocks and compact geometry without invoice-only gaps.
 */
function applyDocumentBusinessProfile(
  sourceElements: LayoutElement[],
  docType: DocumentTypeId
): LayoutElement[] {
  const style = DOCUMENT_STYLES[docType];
  const headerIds = ["watermark", "logo", "company_name_en", "company_name_ar", "company_address", "doc_title", "doc_meta", "footer"];
  const allowedIds = new Set(headerIds);
  const overrides: ElementOverrides = {
    watermark: { x: 55, y: 92, width: 100, height: 112 },
    footer: { x: 12, y: 262, width: 186, height: 16 },
  };

  const add = (...ids: string[]) => ids.forEach((id) => allowedIds.add(id));
  const compactTable = {
    x: 12,
    y: 105,
    width: 186,
    height: 48,
    label: "Line Items Table",
  } satisfies Partial<LayoutElement>;

  if (["tax_invoice", "quotation", "proforma_invoice"].includes(docType)) {
    add("customer_info", "line_items", "amount_in_words", "totals", "bank_details", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      line_items: compactTable,
      amount_in_words: { x: 12, y: 156, width: 105, height: 26 },
      totals: { x: 121, y: 156, width: 77, height: 30, label: "Subtotal, VAT & Grand Total" },
      bank_details: { x: 12, y: 185, width: 105, height: 24 },
      payment_terms: { x: 12, y: 212, width: 105, height: 34 },
      company_signature: { x: 121, y: 190, width: 44, height: 41 },
      company_stamp: { x: 167, y: 190, width: 31, height: 41 },
    });
  } else if (docType === "purchase_order" || docType === "supplier_bill") {
    add("customer_info", "line_items", "amount_in_words", "totals", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      customer_info: { type: "supplier_info", label: "Supplier / Vendor Information" },
      line_items: compactTable,
      amount_in_words: { x: 12, y: 156, width: 105, height: 26 },
      totals: { x: 121, y: 156, width: 77, height: 30, label: "Subtotal, VAT & Grand Total" },
      payment_terms: { x: 12, y: 200, width: 105, height: 40 },
      company_signature: { x: 121, y: 190, width: 44, height: 40 },
      company_stamp: { x: 167, y: 190, width: 31, height: 40 },
    });
  } else if (docType === "delivery_note") {
    add("customer_info", "line_items", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      line_items: { x: 12, y: 105, width: 186, height: 48, label: "Delivered Items Table" },
      payment_terms: { x: 12, y: 156, width: 186, height: 45, label: "Delivery Notes & Condition", backgroundColor: "#F8FAFC", borderColor: style.borderColor, borderWidth: 1, borderRadius: 4, padding: 3 },
      company_signature: { x: 121, y: 205, width: 44, height: 42, customText: "DELIVERED BY" },
      company_stamp: { x: 167, y: 205, width: 31, height: 42 },
    });
  } else if (docType === "receipt_voucher" || docType === "employee_payment_voucher") {
    add("customer_info", "amount_in_words", "totals", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      customer_info: {
        label: docType === "receipt_voucher" ? "Received From / Payer" : "Employee / Payee Information",
      },
      amount_in_words: { x: 12, y: 96, width: 105, height: 29 },
      totals: {
        x: 121,
        y: 96,
        width: 77,
        height: 29,
        label: docType === "receipt_voucher" ? "Amount Received" : "Amount Paid",
      },
      payment_terms: {
        x: 12,
        y: 129,
        width: 186,
        height: 62,
        label: docType === "receipt_voucher" ? "Payment Method & Purpose" : "Payment Purpose & Method",
        backgroundColor: "#F8FAFC",
        borderColor: style.borderColor,
        borderWidth: 1,
        borderRadius: 4,
        padding: 3,
      },
      company_signature: {
        x: 121,
        y: 204,
        width: 44,
        height: 44,
        customText: docType === "receipt_voucher" ? "RECEIVED BY" : "AUTHORIZED BY",
      },
      company_stamp: { x: 167, y: 204, width: 31, height: 44 },
    });
  } else if (docType === "customer_statement") {
    return createSOA101ReferenceLayout().elements;
  } else if (docType === "salary_statement") {
    add("customer_info", "line_items", "totals", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      customer_info: { label: "Employee Information" },
      line_items: { x: 12, y: 95, width: 186, height: 48, label: "Salary Earnings & Deductions" },
      totals: { x: 121, y: 146, width: 77, height: 39, label: "Payroll Summary" },
      payment_terms: { x: 12, y: 146, width: 105, height: 39, label: "Payroll Notes & Bank Reference", backgroundColor: "#F8FAFC", borderColor: style.borderColor, borderWidth: 1, borderRadius: 4, padding: 3 },
      company_signature: { x: 121, y: 191, width: 44, height: 36, customText: "PAYROLL AUTHORIZED" },
      company_stamp: { x: 167, y: 191, width: 31, height: 36 },
    });
  } else if (docType === "project_handover" || docType === "work_method_statement") {
    add("customer_info", "payment_terms", "company_signature", "company_stamp");
    Object.assign(overrides, {
      customer_info: { type: "project_info", label: "Project Information" },
      payment_terms: {
        x: 12,
        y: 96,
        width: 186,
        height: 100,
        label: docType === "project_handover" ? "Handover Scope & Completion Remarks" : "Method, Scope & Safety Notes",
        backgroundColor: "#F8FAFC",
        borderColor: style.borderColor,
        borderWidth: 1,
        borderRadius: 4,
        padding: 3,
      },
      company_signature: {
        x: 121,
        y: 207,
        width: 44,
        height: 45,
        customText: docType === "project_handover" ? "HANDOVER AUTHORIZED" : "PREPARED / APPROVED BY",
      },
      company_stamp: { x: 167, y: 207, width: 31, height: 45 },
    });
  }

  if (docType === "measurement_sheet") {
    add("customer_info", "line_items", "payment_terms", "totals", "company_signature", "company_stamp");
    Object.assign(overrides, {
      customer_info: {
        x: 12,
        y: 63,
        width: 91,
        height: 20,
        label: "Project & Client Information",
      },
      doc_meta: {
        x: 107,
        y: 63,
        width: 91,
        height: 20,
        label: "Sheet Number & Date",
      },
      line_items: {
        x: 12,
        y: 86,
        width: 186,
        height: 76,
        label: "Takeoff Measurements Table",
      },
      payment_terms: {
        x: 12,
        y: 165,
        width: 105,
        height: 38,
        label: "Measurement Notes & Compliance",
        backgroundColor: "#F8FAFC",
        borderColor: style.borderColor,
        borderWidth: 1,
        borderRadius: 4,
        padding: 3,
        customText: "Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.",
      },
      totals: {
        x: 121,
        y: 165,
        width: 77,
        height: 38,
        label: "Takeoff Summary",
      },
      company_signature: {
        x: 12,
        y: 206,
        width: 90,
        height: 40,
        customText: "PREPARED BY (ESTIMATOR / ENGINEER)",
      },
      company_stamp: {
        x: 108,
        y: 206,
        width: 90,
        height: 40,
        customText: "APPROVED BY (PROJECT MANAGER / CLIENT)",
      },
    });
  }

  return sourceElements
    .filter((element) => allowedIds.has(element.id))
    .map((element) => {
      const profiled = { ...element, ...(overrides[element.id] || {}) };
      if (profiled.id === "line_items" && profiled.tableSettings) {
        const columns =
          docType === "delivery_note"
            ? DEFAULT_DELIVERY_COLUMNS
            : docType === "customer_statement"
            ? DEFAULT_STATEMENT_COLUMNS
            : docType === "salary_statement"
            ? DEFAULT_SALARY_COLUMNS
            : docType === "measurement_sheet"
            ? DEFAULT_MEASUREMENT_COLUMNS
            : DEFAULT_INVOICE_COLUMNS;
        profiled.tableSettings = {
          ...profiled.tableSettings,
          columns: columns.map((column) => ({ ...column })),
        };
      }
      return profiled;
    });
}

// ── Default UAE Corporate Template Generator ───────────────────────────────────
export function createDefaultLayout(docType: DocumentTypeId): DocumentLayout {
  if (docType === "customer_statement") {
    return createSOA101ReferenceLayout();
  }
  const docConfig = DOCUMENT_TYPE_OPTIONS.find((d) => d.id === docType) || DOCUMENT_TYPE_OPTIONS[0];
  const documentStyle = DOCUMENT_STYLES[docType];

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
      opacity: 0.08,
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
      fontSize: 11.5,
      fontWeight: "bold",
      textAlign: "center",
      color: documentStyle.primaryColor,
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
      fontSize: 13.5,
      fontWeight: "bold",
      textAlign: "center",
      color: documentStyle.accentColor,
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
      fontSize: 7.8,
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
      fontSize: 12,
      fontWeight: "extrabold",
      textAlign: "left",
      color: "#FFFFFF",
      backgroundColor: documentStyle.primaryColor,
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
      height: 38,
      visible: true,
      locked: false,
      zIndex: 15,
      fontSize: 8,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 2.5,
    },

    // 7. Document Meta & Project Ref
    {
      id: "doc_meta",
      type: "doc_meta",
      label: "Document Date & Reference",
      x: 107,
      y: 64,
      width: 91,
      height: 38,
      visible: true,
      locked: false,
      zIndex: 16,
      fontSize: 8,
      backgroundColor: "#F8FAFC",
      borderColor: "#CBD5E1",
      borderWidth: 1,
      borderRadius: 4,
      padding: 2.5,
    },

    // 8. Line Items Table (Generous height using available A4 space with 3mm clearance)
    {
      id: "line_items",
      type: "line_items",
      label: "Line Items Table",
      x: 12,
      y: 105,
      width: 186,
      height: 60,
      visible: true,
      locked: false,
      zIndex: 17,
      tableSettings: {
        headerBg: documentStyle.tableHeaderColor,
        headerTextColor: "#FFFFFF",
        fontSize: 8,
        headerFontSize: 8,
        rowHeight: 8.5,
        borderThickness: 1,
        borderColor: documentStyle.borderColor,
        bodyTextColor: documentStyle.textColor,
        columns:
          docType === "delivery_note"
            ? DEFAULT_DELIVERY_COLUMNS
            : docType === "salary_statement"
            ? DEFAULT_SALARY_COLUMNS
            : docType === "measurement_sheet"
            ? DEFAULT_MEASUREMENT_COLUMNS
            : DEFAULT_INVOICE_COLUMNS,
      },
    },

    // Tailored Follower Elements based on Document Type
    ...(docType === "delivery_note"
      ? [
          {
            id: "payment_terms",
            type: "payment_terms" as ElementType,
            label: "Delivery & Dispatch Remarks",
            x: 12,
            y: 167,
            width: 105,
            height: 45,
            visible: true,
            locked: false,
            zIndex: 18,
            fontSize: 8,
            color: "#64748B",
            customText: "Goods received in good condition and order specifications.",
          },
          {
            id: "company_signature",
            type: "company_signature" as ElementType,
            label: "Dispatched By / Driver Signature",
            x: 121,
            y: 167,
            width: 44,
            height: 45,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 19,
            fontSize: 7.5,
            customText: "DISPATCHED BY / DRIVER",
          },
          {
            id: "company_stamp",
            type: "company_stamp" as ElementType,
            label: "Received By / Customer Sign & Stamp",
            x: 167,
            y: 167,
            width: 31,
            height: 45,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 20,
            fontSize: 7.5,
            imageFit: "contain" as const,
          },
        ]
      : docType === "project_handover"
      ? [
          {
            id: "payment_terms",
            type: "payment_terms" as ElementType,
            label: "Scope of Handover & Snag List Remarks",
            x: 12,
            y: 167,
            width: 186,
            height: 38,
            visible: true,
            locked: false,
            zIndex: 18,
            fontSize: 9.5,
            color: "#64748B",
            customText: "Works inspected and formally accepted with snags documented above.",
          },
          {
            id: "company_signature",
            type: "company_signature" as ElementType,
            label: "Client Representative Signature",
            x: 12,
            y: 209,
            width: 90,
            height: 45,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 19,
            customText: "CLIENT REPRESENTATIVE SIGNATURE",
          },
          {
            id: "company_stamp",
            type: "company_stamp" as ElementType,
            label: "Contractor Representative Sign & Stamp",
            x: 108,
            y: 209,
            width: 90,
            height: 45,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 20,
            customText: "CONTRACTOR REPRESENTATIVE SIGN & STAMP",
          },
        ]
      : docType === "receipt_voucher"
      ? [
          {
            id: "amount_in_words",
            type: "amount_in_words" as ElementType,
            label: "Amount in Words (English & Arabic)",
            x: 12,
            y: 167,
            width: 186,
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
          {
            id: "payment_terms",
            type: "payment_terms" as ElementType,
            label: "Payment Method & Cheque Details",
            x: 12,
            y: 196,
            width: 105,
            height: 35,
            visible: true,
            locked: false,
            zIndex: 19,
            fontSize: 9.5,
            color: "#64748B",
          },
          {
            id: "company_signature",
            type: "company_signature" as ElementType,
            label: "Received By Signature",
            x: 121,
            y: 196,
            width: 44,
            height: 35,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 20,
            customText: "RECEIVED BY SIGNATURE",
          },
          {
            id: "company_stamp",
            type: "company_stamp" as ElementType,
            label: "Official Company Stamp",
            x: 167,
            y: 196,
            width: 31,
            height: 35,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 21,
            imageFit: "contain" as const,
          },
        ]
      : docType === "measurement_sheet"
      ? [
          {
            id: "payment_terms",
            type: "payment_terms" as ElementType,
            label: "Measurement Notes & Compliance",
            x: 12,
            y: 165,
            width: 105,
            height: 38,
            visible: true,
            locked: false,
            zIndex: 18,
            fontSize: 9.5,
            color: "#64748B",
            customText: "Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.",
          },
          {
            id: "totals",
            type: "totals" as ElementType,
            label: "Takeoff Summary",
            x: 121,
            y: 165,
            width: 77,
            height: 38,
            visible: true,
            locked: false,
            zIndex: 19,
            fontSize: 10.5,
            borderColor: "#CBD5E1",
            borderWidth: 1,
            borderRadius: 4,
            padding: 2,
          },
          {
            id: "company_signature",
            type: "company_signature" as ElementType,
            label: "Prepared By (Estimator / Engineer)",
            x: 12,
            y: 206,
            width: 90,
            height: 40,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 20,
            customText: "PREPARED BY (ESTIMATOR / ENGINEER)",
          },
          {
            id: "company_stamp",
            type: "company_stamp" as ElementType,
            label: "Approved By (Project Manager / Client)",
            x: 108,
            y: 206,
            width: 90,
            height: 40,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 21,
            customText: "APPROVED BY (PROJECT MANAGER / CLIENT)",
          },
        ]
      : [
          // 9. Amount in Words Card
          {
            id: "amount_in_words",
            type: "amount_in_words" as ElementType,
            label: "Amount in Words (English & Arabic)",
            x: 12,
            y: 167,
            width: 105,
            height: 25,
            visible: true,
            locked: false,
            zIndex: 18,
            fontSize: 8,
            backgroundColor: "#F8FAFC",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            borderRadius: 4,
            padding: 3,
          },

          // 10. Totals Breakdown Card
          {
            id: "totals",
            type: "totals" as ElementType,
            label: "Subtotal, VAT & Grand Total",
            x: 121,
            y: 167,
            width: 77,
            height: 46,
            visible: true,
            locked: false,
            zIndex: 19,
            fontSize: 8.5,
            borderColor: "#CBD5E1",
            borderWidth: 1,
            borderRadius: 4,
            padding: 2,
          },

          // 11. Bank Transfer Details
          {
            id: "bank_details",
            type: "bank_details" as ElementType,
            label: "Bank Details (IBAN & SWIFT)",
            x: 12,
            y: 195,
            width: 105,
            height: 26,
            visible: true,
            locked: false,
            zIndex: 20,
            fontSize: 8,
            backgroundColor: "#F8FAFC",
            borderColor: "#CBD5E1",
            borderWidth: 1,
            borderRadius: 4,
            padding: 2.5,
          },

          // 12. Terms & Conditions / Notes
          {
            id: "payment_terms",
            type: "payment_terms" as ElementType,
            label: "Payment Terms & Conditions",
            x: 12,
            y: 224,
            width: 105,
            height: 28,
            visible: true,
            locked: false,
            zIndex: 21,
            fontSize: 8,
            color: "#64748B",
          },

          // 13. Company Authorized Signature & Stamp Header
          {
            id: "company_signature",
            type: "company_signature" as ElementType,
            label: "Company Authorized Signature",
            x: 121,
            y: 224,
            width: 44,
            height: 32,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 22,
            fontSize: 7.5,
            customText: "COMPANY AUTHORIZED SIGNATURE",
          },

          // 14. Company Stamp
          {
            id: "company_stamp",
            type: "company_stamp" as ElementType,
            label: "Official Company Stamp",
            x: 167,
            y: 224,
            width: 31,
            height: 32,
            visible: true,
            locked: false,
            lockAspectRatio: true,
            zIndex: 23,
            fontSize: 7.5,
            imageFit: "contain" as const,
          },
        ]),

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
      fontSize: 7.5,
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
    layoutMode: "manual",
    page: {
      paper: "A4",
      orientation: "portrait",
      widthMm: 210,
      heightMm: 297,
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
      background: "#FFFFFF",
      watermarkOpacity: 0.045,
      borders: JSON.parse(JSON.stringify(DEFAULT_PAGE_BORDERS)),
      smartFit: JSON.parse(JSON.stringify(DEFAULT_SMART_FIT_SETTINGS)),
      printSettings: JSON.parse(JSON.stringify(DEFAULT_PRINT_SETTINGS)),
    },
    branding: documentStyle,
    documentTitle: docConfig.defaultTitle,
    documentTitleAr: docConfig.defaultTitleAr,
    numberingConfig: JSON.parse(
      JSON.stringify(DEFAULT_NUMBERING_CONFIGS[docType] || DEFAULT_NUMBERING_CONFIGS.quotation)
    ),
    elements: applyDocumentBusinessProfile(elements, docType),
  };
}

export const SOA_REFERENCE_TEMPLATE_NAME = "SOA-101 Al Karwan Reference (Classic Ledger)";

/**
 * Recreates the exact A4 layout of "SOA101-26 Al Karwan Solution FZC.pdf"
 * as fully editable, individual PDF Designer elements with mm coordinates.
 */
export function createSOA101ReferenceLayout(): DocumentLayout {
  return {
    version: CURRENT_LAYOUT_VERSION,
    documentType: "customer_statement",
    templateName: SOA_REFERENCE_TEMPLATE_NAME,
    layoutMode: "manual",
    page: {
      paper: "A4",
      orientation: "portrait",
      widthMm: 210,
      heightMm: 297,
      margins: { top: 10, right: 12, bottom: 12, left: 12 },
      background: "#FFFFFF",
      watermarkOpacity: 0.04,
      borders: JSON.parse(JSON.stringify(DEFAULT_PAGE_BORDERS)),
      smartFit: {
        ...DEFAULT_SMART_FIT_SETTINGS,
        compactEmptySpace: false,
      },
      printSettings: JSON.parse(JSON.stringify(DEFAULT_PRINT_SETTINGS)),
    },
    branding: {
      primaryColor: "#0F172A",
      companyHeaderColor: "#B58A2A",
      titleBackground: "transparent",
      titleTextColor: "#0F172A",
      accentColor: "#B58A2A",
      textColor: "#1E293B",
      mutedColor: "#64748B",
      borderColor: "#94A3B8",
      tableHeaderColor: "#9CA3AF",
      tableHeaderTextColor: "#0F172A",
      tableRowBackground: "#FFFFFF",
      tableRowAlternating: "#F1F5F9",
      totalHighlightColor: "#9CA3AF",
      footerBackground: "#FFFFFF",
      footerTextColor: "#334155",
    },
    documentTitle: "Statement of Account",
    documentTitleAr: "كشف حساب",
    numberingConfig: JSON.parse(
      JSON.stringify(DEFAULT_NUMBERING_CONFIGS.customer_statement || DEFAULT_NUMBERING_CONFIGS.quotation)
    ),
    elements: [
      // 1. Company Logo at top left
      {
        id: "logo",
        type: "logo",
        label: "Company Logo",
        x: 12,
        y: 10,
        width: 48,
        height: 24,
        visible: true,
        locked: false,
        zIndex: 10,
        imageFit: "contain",
      },
      // 2. Arabic Company Name below logo
      {
        id: "company_name_ar",
        type: "company_name_ar",
        label: "Arabic Company Name",
        x: 12,
        y: 35,
        width: 72,
        height: 5.5,
        visible: true,
        locked: false,
        zIndex: 11,
        fontSize: 9.5,
        fontWeight: "bold",
        color: "#B58A2A",
        textAlign: "left",
        customText: "الصفوه الذهبيه لصناعه الخيام ذ.م.م.ش.و",
      },
      // 3. English Company Name below Arabic
      {
        id: "company_name_en",
        type: "company_name_en",
        label: "English Company Name",
        x: 12,
        y: 40.5,
        width: 72,
        height: 5,
        visible: true,
        locked: false,
        zIndex: 12,
        fontSize: 8,
        fontWeight: "bold",
        color: "#B58A2A",
        textAlign: "left",
        customText: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
      },
      // 4. Statement of Account title at top right
      {
        id: "doc_title",
        type: "doc_title",
        label: "Statement of Account Title",
        x: 95,
        y: 10,
        width: 103,
        height: 14,
        visible: true,
        locked: false,
        zIndex: 13,
        fontSize: 22,
        fontWeight: "extrabold",
        textAlign: "right",
        color: "#0F172A",
        backgroundColor: "transparent",
        customText: "Statement of Account",
      },
      // 5. Date, Statement #, Customer ID, Page number box
      {
        id: "doc_meta",
        type: "doc_meta",
        label: "Statement Details (Date, SOA #, Customer ID, Page)",
        x: 120,
        y: 26,
        width: 78,
        height: 22,
        visible: true,
        locked: false,
        zIndex: 14,
        fontSize: 8.5,
        borderWidth: 1,
        borderColor: "#94A3B8",
        borderRadius: 2,
        backgroundColor: "#FFFFFF",
        padding: 1.5,
      },
      // 6. Bill To Section (Customer Information)
      {
        id: "customer_info",
        type: "customer_info",
        label: "Bill To (Customer Information)",
        x: 12,
        y: 49.5,
        width: 88,
        height: 27,
        visible: true,
        locked: false,
        zIndex: 15,
        fontSize: 8.5,
        borderWidth: 1,
        borderColor: "#94A3B8",
        borderRadius: 2,
        backgroundColor: "#FFFFFF",
        padding: 2,
      },
      // 7. Account Summary Section
      {
        id: "totals",
        type: "totals",
        label: "Account Summary",
        x: 108,
        y: 49.5,
        width: 90,
        height: 27,
        visible: true,
        locked: false,
        zIndex: 16,
        fontSize: 8.5,
        borderWidth: 1,
        borderColor: "#94A3B8",
        borderRadius: 2,
        backgroundColor: "#FFFFFF",
        padding: 1.5,
      },
      // 8. Grey-and-white alternating transaction table
      {
        id: "line_items",
        type: "line_items",
        label: "Transactions Ledger Table",
        x: 12,
        y: 79.5,
        width: 186,
        height: 131,
        visible: true,
        locked: false,
        zIndex: 17,
        tableSettings: {
          headerBg: "#9CA3AF",
          headerTextColor: "#0F172A",
          fontSize: 8.5,
          headerFontSize: 8.5,
          rowHeight: 7.5,
          borderThickness: 1,
          borderColor: "#94A3B8",
          bodyTextColor: "#0F172A",
          columns: SOA_REFERENCE_STATEMENT_COLUMNS.map((col) => ({ ...col })),
        },
      },
      // 9. Account Current Balance banner at the bottom of the table
      {
        id: "amount_in_words",
        type: "amount_in_words",
        label: "Account Current Balance Banner",
        x: 108,
        y: 212.5,
        width: 90,
        height: 8,
        visible: true,
        locked: false,
        zIndex: 18,
        fontSize: 9,
        fontWeight: "bold",
        color: "#0F172A",
        backgroundColor: "#9CA3AF",
        borderWidth: 1,
        borderColor: "#94A3B8",
        borderRadius: 2,
        customText: "Account Current Balance",
      },
      // 10. Payment message and thank you
      {
        id: "payment_terms",
        type: "payment_terms",
        label: "Payment Instructions & Thank You",
        x: 12,
        y: 222,
        width: 186,
        height: 23,
        visible: true,
        locked: false,
        zIndex: 19,
        fontSize: 8,
        textAlign: "center",
        color: "#0F172A",
        customText:
          "Your account balance is {{balance}} Please make your payment to cover the balance by the due date.\nMake all checks payable to {{company_name}}\n\nThank you for your business!",
      },
      // 11. Company contact details and footer
      {
        id: "footer",
        type: "footer",
        label: "Company Contact Details & Footer",
        x: 12,
        y: 248,
        width: 186,
        height: 24,
        visible: true,
        locked: false,
        zIndex: 20,
        fontSize: 7.5,
        textAlign: "center",
        color: "#334155",
        borderColor: "#94A3B8",
        borderWidth: 1,
        customText:
          "Should you have any enquiries concerning this statement, please contact Mohammed Ali on +971 50 404 1805\nWarehouse No. 29 Emirates Road, Al Sajaa Industrial , Sharjah , United Arab Emirates , P.O. Box: 6226\nTel: +971 6 767 9058 Fax: +971 6 767 9058 E-mail: info@goldenelitetents.ae Web: www.goldenelitetents.ae",
      },
    ],
  };
}

// ── Persistence Helpers ────────────────────────────────────────────────────────
const LOCAL_STORAGE_PREFIX = "dubai-erp.doc-layout.";
export const DEFAULT_DOCUMENT_TEMPLATE_NAME = "Default UAE Corporate Template";

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
  const isManualMode = (layout.layoutMode || "manual") === "manual";

  const migratedElements = sourceVersion < 7
    ? applyDocumentBusinessProfile(layout.elements, layout.documentType)
    : layout.elements;

  const elements = migratedElements.map((element) => {
    let el = { ...element };

    if (sourceVersion < 6 && ["tax_invoice", "quotation", "proforma_invoice", "purchase_order", "supplier_bill"].includes(layout.documentType)) {
      const isLegacyTotals =
        el.id === "totals" &&
        ((Math.abs(el.y - 145) < 0.01 && Math.abs(el.height - 43) < 0.01) ||
          (Math.abs(el.y - 167) < 0.01 && Math.abs(el.height - 46) < 0.01));
      if (isLegacyTotals) el = { ...el, y: 145, height: 30 };

      const isLegacyApproval =
        (el.id === "company_signature" || el.id === "company_stamp") &&
        (Math.abs(el.y - 192) < 0.01 || Math.abs(el.y - 194) < 0.01);
      if (isLegacyApproval) el = { ...el, y: 179 };
    }

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

    if (sourceVersion < 8) {
      if (el.type === "company_name_ar") {
        el.fontSize = el.fontSize && el.fontSize > 16 ? Math.min(14, Math.round(el.fontSize * 0.65 * 10) / 10) : (el.fontSize ?? 13.5);
      } else if (el.type === "company_name_en") {
        el.fontSize = el.fontSize && el.fontSize > 14 ? Math.min(12.5, Math.round(el.fontSize * 0.75 * 10) / 10) : (el.fontSize ?? 11.5);
      } else if (el.type === "company_address") {
        el.fontSize = el.fontSize && el.fontSize > 9 ? Math.min(8.5, Math.round(el.fontSize * 0.75 * 10) / 10) : (el.fontSize ?? 7.8);
      } else if (el.type === "doc_title") {
        el.fontSize = el.fontSize && el.fontSize > 15 ? Math.min(13, Math.round(el.fontSize * 0.75 * 10) / 10) : (el.fontSize ?? 12);
      } else if (["customer_info", "supplier_info", "project_info", "doc_meta"].includes(el.type)) {
        el.fontSize = el.fontSize && el.fontSize > 10.5 ? Math.min(9, Math.round(el.fontSize * 0.75 * 10) / 10) : (el.fontSize ?? 8);
      } else if (["totals", "amount_in_words", "bank_details", "payment_terms", "footer"].includes(el.type)) {
        el.fontSize = el.fontSize && el.fontSize > 10.5 ? Math.min(9, Math.round(el.fontSize * 0.75 * 10) / 10) : (el.fontSize ?? 8);
      }

      if (el.tableSettings) {
        if (el.tableSettings.fontSize && el.tableSettings.fontSize > 10) {
          el.tableSettings.fontSize = Math.min(8.5, Math.round(el.tableSettings.fontSize * 0.75 * 10) / 10);
        }
        if (el.tableSettings.headerFontSize && el.tableSettings.headerFontSize > 11) {
          el.tableSettings.headerFontSize = Math.min(9, Math.round(el.tableSettings.headerFontSize * 0.75 * 10) / 10);
        }
        if (Array.isArray(el.tableSettings.columns)) {
          el.tableSettings.columns = el.tableSettings.columns.map((col) => ({
            ...col,
            fontSize: col.fontSize && col.fontSize > 10 ? Math.min(8.5, Math.round(col.fontSize * 0.75 * 10) / 10) : col.fontSize,
          }));
        }
      }
    }

    if (sourceVersion < 9) {
      if (["tax_invoice", "quotation", "proforma_invoice", "purchase_order", "supplier_bill"].includes(layout.documentType)) {
        if (el.id === "doc_meta" && el.height < 38) {
          el.height = 38;
        }
        if (el.id === "customer_info" && el.height < 38) {
          el.height = 38;
        }
      }
    }

    if (el.type === "watermark") {
      el.opacity = typeof el.opacity === "number" ? Math.max(0.01, Math.min(el.opacity, 0.6)) : (layout.page?.watermarkOpacity ?? 0.08);
      el.lockAspectRatio = true;
    }

    const width = Number.isFinite(el.width) ? Math.max(1, el.width) : 20;
    const height = Number.isFinite(el.height) ? Math.max(1, el.height) : 10;
    const isManualMode = (layout.layoutMode || "manual") === "manual";
    const x = isManualMode
      ? (Number.isFinite(el.x) ? el.x : 0)
      : Math.max(0, Math.min(pageWidth - width, Number.isFinite(el.x) ? el.x : 0));
    const y = isManualMode
      ? (Number.isFinite(el.y) ? el.y : 0)
      : Math.max(0, Math.min(pageHeight - height, Number.isFinite(el.y) ? el.y : 0));
    return { ...el, x, y, width, height };
  });

  // ── Universal Physical Collision Clearance Guard ──
  // Never allow header cards to penetrate or overlap the item table header, even in Manual mode.
  const tableEl = elements.find(
    (e) => e.visible && (e.type === "line_items" || e.id === "line_items" || e.id === "salary_statement")
  );
  if (tableEl && !isManualMode) {
    const headersAbove = elements.filter(
      (e) => e.visible && e.id !== tableEl.id && e.type !== "watermark" && e.type !== "footer" && e.y < tableEl.y + 10
    );
    if (headersAbove.length > 0) {
      const maxHeaderBottom = Math.max(...headersAbove.map((h) => h.y + h.height));
      const minRequiredGap = 3.0; // Exact 3 mm required clearance
      const minAllowedTableY = Math.round((maxHeaderBottom + minRequiredGap) * 10) / 10;
      if (tableEl.y < minAllowedTableY) {
        const tableShift = Math.round((minAllowedTableY - tableEl.y) * 10) / 10;
        tableEl.y = minAllowedTableY;
        // Reposition downstream followers safely by the exact same shift delta
        elements.forEach((el) => {
          if (el.id !== tableEl.id && !headersAbove.some((h) => h.id === el.id) && el.type !== "watermark" && el.type !== "footer") {
            if (el.y >= tableEl.y - tableShift - 0.5) {
              el.y = Math.round((el.y + tableShift) * 10) / 10;
            }
          }
        });
      }
    }
  }

  // Header collision detection and self-healing:
  // ONLY run in "auto_fit" mode. In "manual" and "assisted" modes, NEVER override user positions.
  const isAutoFitMode = layout.layoutMode === "auto_fit";
  const logoEl = elements.find((e) => e.id === "logo" && e.visible);
  const enEl = elements.find((e) => e.id === "company_name_en" && e.visible);
  const arEl = elements.find((e) => e.id === "company_name_ar" && e.visible);
  const addrEl = elements.find((e) => e.id === "company_address" && e.visible);
  const titleEl = elements.find((e) => e.id === "doc_title" && e.visible);
  const headerCustomTexts = elements.filter((e) => e.type === "custom_text" && e.visible && e.y < 65);

  const hasHeaderCollision = isAutoFitMode && (() => {
    if (logoEl && enEl) {
      const horizontalOverlap = !(logoEl.x + logoEl.width <= enEl.x || enEl.x + enEl.width <= logoEl.x);
      if (horizontalOverlap && logoEl.y + logoEl.height > enEl.y - 0.5) return true;
      if (enEl.y < 20 && logoEl.y < 20) return true;
    }
    if (enEl && arEl && (enEl.y + enEl.height > arEl.y - 0.5 || arEl.y <= enEl.y)) return true;
    if (arEl && addrEl && (arEl.y + arEl.height > addrEl.y - 0.5 || addrEl.y <= arEl.y)) return true;
    if (addrEl && titleEl && (addrEl.y + addrEl.height > titleEl.y - 0.5 || titleEl.y <= addrEl.y)) return true;

    // Detect if custom header texts collide with logo, en name, ar name, address, or each other
    for (const ct of headerCustomTexts) {
      if (enEl && Math.max(0, Math.min(ct.y + ct.height, enEl.y + enEl.height) - Math.max(ct.y, enEl.y)) > 0.5) return true;
      if (arEl && Math.max(0, Math.min(ct.y + ct.height, arEl.y + arEl.height) - Math.max(ct.y, arEl.y)) > 0.5) return true;
      if (logoEl && Math.max(0, Math.min(ct.y + ct.height, logoEl.y + logoEl.height) - Math.max(ct.y, logoEl.y)) > 0.5) return true;
    }

    return false;
  })();

  if (isAutoFitMode && hasHeaderCollision) {
    let curY = 10;
    const healed = elements.map((e) => ({ ...e }));
    const getEl = (id: string) => healed.find((e) => e.id === id);

    const l = getEl("logo");
    if (l && l.visible) {
      l.x = 80;
      l.y = curY;
      l.width = 50;
      l.height = 14;
      l.lockAspectRatio = true;
      curY = l.y + l.height + 2.5; // 26.5
    }

    const en = getEl("company_name_en");
    if (en && en.visible) {
      en.x = 12;
      en.y = curY;
      en.width = 186;
      en.height = 8.0;
      en.fontSize = Math.min(en.fontSize || 12, 13);
      curY = en.y + en.height + 1.0; // 35.5
    }

    const ar = getEl("company_name_ar");
    if (ar && ar.visible) {
      ar.x = 12;
      ar.y = curY;
      ar.width = 186;
      ar.height = 8.5;
      ar.fontSize = Math.min(ar.fontSize || 13.5, 14.5);
      curY = ar.y + ar.height + 1.2; // 45.2
    }

    const addr = getEl("company_address");
    if (addr && addr.visible) {
      addr.x = 12;
      addr.y = curY;
      addr.width = 186;
      addr.height = 8.0;
      addr.fontSize = Math.min(addr.fontSize || 7.8, 8.5);
      curY = addr.y + addr.height + 1.0;
    }

    // Stack any custom text header elements (e.g. TRN, telephone, address blocks)
    const cts = healed
      .filter((e) => e.type === "custom_text" && e.visible && e.y < 65)
      .sort((a, b) => a.y - b.y);

    for (const ct of cts) {
      ct.x = 12;
      ct.y = curY;
      ct.width = 186;
      ct.height = Math.max(5.0, Math.min(8.0, ct.height || 6.0));
      ct.fontSize = Math.min(ct.fontSize || 9.0, 10.5);
      ct.textAlign = "center";
      curY = ct.y + ct.height + 1.0;
    }

    const t = getEl("doc_title");
    if (t && t.visible) {
      t.x = 12;
      t.y = Math.max(curY + 1.0, 56.0);
      t.width = 186;
      t.height = 10.5;
      t.fontSize = Math.min(t.fontSize || 12, 13);
      curY = t.y + t.height + 2.5;
    }

    const cards = healed.filter(
      (e) => ["customer_info", "supplier_info", "project_info", "doc_meta"].includes(e.type) || e.id === "doc_meta"
    );
    const cardY = Math.max(curY, 68.0);
    for (const c of cards) {
      if (c.y < 85) {
        c.y = cardY;
        c.height = Math.max(26.0, c.height);
      }
    }

    const table = getEl("line_items");
    if (table && table.y < cardY + 28) {
      table.y = cardY + 29;
    }

    elements.splice(0, elements.length, ...healed);
  }

  return {
    ...layout,
    layoutMode: layout.layoutMode || "manual",
    version: CURRENT_LAYOUT_VERSION,
    page: {
      ...layout.page,
      paper: "A4",
      widthMm: 210,
      heightMm: 297,
      background: layout.page?.background || "#FFFFFF",
      borders: normalizePageBorders(layout.page?.borders),
      smartFit: normalizeSmartFit(layout.page?.smartFit),
      printSettings: normalizePrintSettings(layout.page?.printSettings),
    },
    branding: {
      ...DOCUMENT_STYLES[layout.documentType],
      ...(layout.branding || {}),
    },
    numberingConfig:
      layout.numberingConfig ||
      JSON.parse(
        JSON.stringify(
          DEFAULT_NUMBERING_CONFIGS[layout.documentType] ||
            DEFAULT_NUMBERING_CONFIGS.quotation
        )
      ),
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
  companyId?: string | null, docType: DocumentTypeId = 'tax_invoice',
  options: { preview?: boolean; fresh?: boolean } = {}
): Promise<LoadedDocumentDesign> {
  let error: string | undefined;
  let revision: CloudRevision | undefined;
  if (companyId) {
    try {
      const snapshot = options.preview
        ? await documentCloud.loadPreview(companyId, docType, options.fresh)
        : await documentCloud.load(companyId, docType);
      revision = revisionOf(snapshot);
      if (snapshot.template) {
        const layout = normalizeLayout({ ...snapshot.template.layout_json, templateName: snapshot.template.template_name });
        // Preview reads already have a memory cache; avoid serialising large embedded images on every open.
        if (!options.preview) { try { window.localStorage.setItem('dubai-erp.design-cache.' + companyId + '.' + docType, JSON.stringify(layout)); } catch {} }
        return { layout, source: 'database', revision, updatedAt: snapshot.template.updated_at };
      }
      try {
        const { data: directTemplate, error: directErr } = await supabase
          .from('document_templates')
          .select('*')
          .eq('company_id', companyId)
          .eq('document_type', docType)
          .order('is_default', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!directErr && directTemplate && directTemplate.layout_json) {
          const layout = normalizeLayout({ ...directTemplate.layout_json, templateName: directTemplate.template_name });
          if (!options.preview) { try { window.localStorage.setItem('dubai-erp.design-cache.' + companyId + '.' + docType, JSON.stringify(layout)); } catch {} }
          return {
            layout,
            source: 'database',
            revision: { templateId: directTemplate.id, version: directTemplate.version || 1, selectionVersion: snapshot.selection_version || 0 },
            updatedAt: directTemplate.updated_at,
          };
        }
      } catch {}
    } catch (failure) { error = cloudError(failure).message; }
  } else { error = 'Sign in to a company account to load or save cloud designs.'; }
  // Recovery is explicit and never removes, migrates, or overwrites the legacy keys.
  if (typeof window !== 'undefined') {
    for (const key of [getLocalStorageKey(companyId, docType), 'dubai-erp.design-cache.' + companyId + '.' + docType]) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) { const layout = JSON.parse(raw) as DocumentLayout;
          if (layout.documentType === docType && Array.isArray(layout.elements)) return { layout: normalizeLayout(layout), source: 'local', error, revision };
        }
      } catch {}
    }
  }
  return { layout: createDefaultLayout(docType), source: 'default', error, revision };
}

/**
 * Saves document layout to Supabase with automatic fallback to localStorage.
 */


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
  | "page_margins"
  | "page_borders";

export const VISUAL_SCOPE_DEFINITIONS: { key: VisualScopeKey; label: string; description: string }[] = [
  { key: "logo", label: "Company Logo", description: "Position, dimensions, border, aspect ratio" },
  { key: "company_name_en", label: "English Company Name", description: "Font size, family, color, alignment" },
  { key: "company_name_ar", label: "Arabic Company Name", description: "Font size, family, color, alignment" },
  { key: "company_address", label: "Company Details & TRN", description: "Font, spacing, alignment, contact strip" },
  { key: "header_layout", label: "Complete Header Layout", description: "Logo, company names, and address coordinates" },
  { key: "doc_title", label: "Document Title Styling", description: "Banner background, height, fonts, padding (preserves doc title text)" },
  { key: "typography", label: "Typography & Fonts", description: "Font families across document elements" },
  { key: "branding_colors", label: "Brand Colors Theme", description: "Primary navy, gold accent, borders, table header, highlight" },
  { key: "page_borders", label: "Page Decorative Borders", description: "Top Gold #E0AC23 & Bottom Navy #173C64 borders, thickness, angle, opacity" },
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
    flowMode: sourceEl.flowMode,
    flowAnchorId: sourceEl.flowAnchorId,
    minGapMm: sourceEl.minGapMm,
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
      background: sourceLayout.page.background || "#FFFFFF",
      watermarkOpacity: sourceLayout.page.watermarkOpacity,
      ...(sourceLayout.page?.borders ? { borders: JSON.parse(JSON.stringify(sourceLayout.page.borders)) } : {}),
    };
  }

  if (scopes.has("page_borders")) {
    updated.page = {
      ...updated.page,
      borders: sourceLayout.page?.borders
        ? JSON.parse(JSON.stringify(sourceLayout.page.borders))
        : undefined,
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
  companyId: string | null | undefined, docType: DocumentTypeId, layout: DocumentLayout,
  revision?: CloudRevision
): Promise<{ success: boolean; error?: string; warning?: string; target: 'database' | 'local'; revision?: CloudRevision; updatedAt?: string; conflict?: boolean }> {
  preserveDesignDraft(companyId, docType, layout);
  try {
    if (!companyId || !revision) throw new Error('Load the cloud design successfully before saving. Your draft is preserved.');
    const saved = await documentCloud.save(companyId, docType, layout, revision);
    return { success: true, target: 'database', revision: revisionOf(saved), updatedAt: saved.template?.updated_at };
  } catch (failure) {
    const error = cloudError(failure);
    return { success: false, target: 'local', error: error.message, conflict: error.code === 'CONFLICT' };
  }
}

/**
 * Saves an imported template as a brand-new template in Supabase document_templates.
 * If isDefault is true, also activates it as the default selection for this document type.
 */
export async function saveImportedDocumentLayout(
  companyId: string | null | undefined,
  docType: DocumentTypeId,
  layout: DocumentLayout,
  selectionVersion = 0,
  templateName = layout.templateName,
  isDefault = true
): Promise<{ success: boolean; error?: string; target: 'database' | 'local'; revision?: CloudRevision; updatedAt?: string }> {
  preserveDesignDraft(companyId, docType, layout);
  try {
    if (!companyId) throw new Error('No active company selected.');
    const token: CloudRevision = { templateId: null, version: 0, selectionVersion };
    const saved = await documentCloud.save(companyId, docType, layout, token, templateName, isDefault);
    return { success: true, target: 'database', revision: revisionOf(saved), updatedAt: saved.template?.updated_at };
  } catch (failure) {
    const error = cloudError(failure);
    return { success: false, target: 'local', error: error.message };
  }
}

/**
 * Resets the layout of a document type back to the professional default.
 */
export async function resetDocumentLayout(
  companyId: string | null | undefined,
  docType: DocumentTypeId, revision?: CloudRevision
): Promise<{ layout: DocumentLayout; persistenceError?: string }> {
  const defaultLayout = createDefaultLayout(docType);
  const result = await saveDocumentLayout(companyId, docType, defaultLayout, revision);
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
