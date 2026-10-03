"use client";

import React, { CSSProperties, useState } from "react";
import Image from "next/image";
import { Building2, Image as ImageIcon } from "lucide-react";
import { getBrandConfig } from "@/lib/brandConfig";
import {
  documentUsesVat,
  DocumentLayout,
  DocumentTypeId,
  LayoutElement,
  TableColumnConfig,
  normalizePrintSettings,
} from "@/lib/documentDesigner";
import { CompanyDocInfo } from "./DocHeader";
import { numberToWordsArabic, numberToWordsEnglish } from "@/lib/amountInWords";
import { fmtAED, fmtDate } from "@/lib/helpers";
import PageDecorativeBorders from "./PageDecorativeBorders";
import MeasurementTotals from "./MeasurementTotals";
import { fitMeasurementSummaryLayout } from "@/lib/measurementPdfSummary";

export interface MockDocumentData {
  document_number: string;
  document_date: string;
  supply_date?: string;
  due_date?: string;
  status?: string;
  customer_name: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  supplier_name?: string;
  project_name?: string;
  project_number?: string;
  title?: string;
  location?: string;
  scope_of_work?: string;
  items: Array<{
    description: string;
    quantity: number;
    unit?: string;
    unit_price: number;
    discount?: number;
    vat_rate?: number;
    vat_amount: number;
    line_total: number;
    date?: string;
    type?: string;
    reference?: string;
    debit?: number;
    credit?: number;
    balance?: number;
    area_name?: string;
    dimensions?: string;
    calc_type?: string;
    calc_type_formula?: string;
    result_display?: string;
    result_unit?: string;
    calculated_total?: number;
  }>;
  subtotal: number;
  discount_amount?: number;
  vat_amount: number;
  vat_rate?: number;
  total_amount: number;
  advance_amount?: number;
  payment_terms?: string;
  notes?: string;
}

export const SAMPLE_DOCUMENT_DATA: MockDocumentData = {
  document_number: "INV-2026-0042",
  document_date: new Date().toISOString(),
  supply_date: new Date().toISOString(),
  due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
  status: "approved",
  customer_name: "AL NABOODAH CONTRACTING CO. L.L.C",
  customer_trn: "100345678900003",
  customer_address: "Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE",
  contact_person: "Eng. Tariq Mansoor",
  contact_number: "+971 4 399 0000",
  supplier_name: "EMIRATES STEEL ARKAN P.J.S.C",
  project_name: "Luxury Majlis & Event Tents Facility",
  project_number: "PRJ-2026-088",
  location: "Jumeirah Beach Residence, Dubai",
  scope_of_work: "Manufacturing, supply and installation of heavy-duty PVC event structures and aluminum framing.",
  items: [
    {
      description: "Custom Arabic Majlis Tent (20m x 40m) Heavy Duty Flame Retardant PVC",
      quantity: 1,
      unit: "Set",
      unit_price: 65000,
      discount: 0,
      vat_rate: 5,
      vat_amount: 3250,
      line_total: 68250,
    },
    {
      description: "Galvanized Steel & Aluminum Structural Truss Arches (300mm Profile)",
      quantity: 12,
      unit: "Pcs",
      unit_price: 3200,
      discount: 0,
      vat_rate: 5,
      vat_amount: 1920,
      line_total: 40320,
    },
    {
      description: "Double Glazed Tempered Glass Wall Panels & Entrance Double Door",
      quantity: 8,
      unit: "Units",
      unit_price: 2450,
      discount: 0,
      vat_rate: 5,
      vat_amount: 980,
      line_total: 20580,
    },
    {
      description: "On-site Rigging, Assembly, Anchoring & Safety Compliance Testing",
      quantity: 1,
      unit: "Job",
      unit_price: 15000,
      discount: 0,
      vat_rate: 5,
      vat_amount: 750,
      line_total: 15750,
    },
  ],
  subtotal: 138400,
  vat_amount: 6900,
  total_amount: 145300,
  advance_amount: 50000,
  payment_terms: "50% Advance on signing, 50% upon successful handover.",
  notes: "All materials conform to UAE Civil Defence and Dubai Municipality structural standards.",
};

const SAMPLE_NUMBERS: Record<DocumentTypeId, string> = {
  tax_invoice: "INV-2026-0042",
  quotation: "QUO-2026-0042",
  proforma_invoice: "PRO-2026-0042",
  delivery_note: "DN-2026-0042",
  purchase_order: "PO-2026-0042",
  receipt_voucher: "RCV-2026-0042",
  customer_statement: "SOA-2026-0042",
  supplier_bill: "BILL-2026-0042",
  salary_statement: "SLIP-2026-0042",
  project_handover: "HO-2026-0042",
  work_method_statement: "WMS-2026-0042",
  employee_payment_voucher: "EPV-2026-0042",
  measurement_sheet: "MS-2026-0001",
};

export function getSampleDocumentData(docType: DocumentTypeId): MockDocumentData {
  const base: MockDocumentData = {
    ...SAMPLE_DOCUMENT_DATA,
    document_number: SAMPLE_NUMBERS[docType],
    items: SAMPLE_DOCUMENT_DATA.items.map((item) => ({ ...item })),
  };

  if (docType === "delivery_note") {
    return {
      ...base,
      items: base.items.map((item) => ({ ...item, unit_price: 0, vat_amount: 0, line_total: 0 })),
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      payment_terms: undefined,
      notes: "Goods received in good condition. Receiver name, signature, and delivery time must be recorded.",
    };
  }

  if (docType === "receipt_voucher" || docType === "employee_payment_voucher") {
    const isReceipt = docType === "receipt_voucher";
    return {
      ...base,
      customer_name: isReceipt ? "AL NABOODAH CONTRACTING CO. L.L.C" : "AHMED MOHAMMED (EMP-0042)",
      customer_trn: isReceipt ? base.customer_trn : undefined,
      items: [],
      subtotal: 25000,
      vat_amount: 0,
      total_amount: 25000,
      advance_amount: undefined,
      payment_terms: isReceipt ? "Bank Transfer" : "Salary Advance - Bank Transfer",
      notes: isReceipt ? "Part payment received against customer account." : "Approved employee payment against authorized request.",
    };
  }

  if (docType === "customer_statement") {
    return {
      ...base,
      items: [
        { description: "Opening balance", date: "01/09/2026", type: "Opening", reference: "-", debit: 0, credit: 0, balance: 50000, quantity: 1, unit_price: 0, vat_amount: 0, line_total: 50000 },
        { description: "Tax invoice", date: "05/09/2026", type: "Invoice", reference: "INV-0041", debit: 145300, credit: 0, balance: 195300, quantity: 1, unit_price: 145300, vat_amount: 0, line_total: 195300 },
        { description: "Payment received", date: "18/09/2026", type: "Receipt", reference: "RCV-0042", debit: 0, credit: 50000, balance: 145300, quantity: 1, unit_price: 50000, vat_amount: 0, line_total: 145300 },
      ],
      subtotal: 145300,
      vat_amount: 0,
      total_amount: 145300,
      advance_amount: undefined,
      payment_terms: undefined,
      notes: undefined,
    };
  }

  if (docType === "salary_statement") {
    return {
      ...base,
      customer_name: "AHMED MOHAMMED (EMP-0042)",
      customer_trn: undefined,
      customer_address: "Operations Department - Site Supervisor",
      items: [
        { description: "Basic Salary", quantity: 1, unit_price: 9000, vat_amount: 0, line_total: 9000 },
        { description: "Housing Allowance", quantity: 1, unit_price: 2500, vat_amount: 0, line_total: 2500 },
        { description: "Transport Allowance", quantity: 1, unit_price: 1000, vat_amount: 0, line_total: 1000 },
        { description: "Advance Deduction", quantity: 1, unit_price: -500, vat_amount: 0, line_total: -500 },
      ],
      subtotal: 12500,
      vat_amount: 0,
      total_amount: 12000,
      advance_amount: undefined,
      payment_terms: undefined,
      notes: "Payroll period: September 2026 | Bank transfer reference: PAY-SEP-0042",
    };
  }

  if (docType === "project_handover" || docType === "work_method_statement") {
    return {
      ...base,
      items: [],
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      advance_amount: undefined,
      payment_terms: undefined,
      notes:
        docType === "project_handover"
          ? "The completed scope has been inspected and handed over with all required documentation. Outstanding observations, if any, are recorded below."
          : "Execute the described works in accordance with the approved sequence, risk controls, permits, and site safety requirements.",
    };
  }

  if (docType === "measurement_sheet") {
    return {
      ...base,
      document_number: "MS-2026-0001",
      document_date: "2026-09-30T00:00:00.000Z",
      customer_name: "Elegance Tents And Sheds Installation",
      project_name: "PVC Parking Shade Fabrication & Joint Takeoff",
      project_number: "PRJ-2026-0091",
      items: [
        {
          description: "PVC Parking Shade Fabric & Centre Joint\nParking Bay 1-6 standard cantilever shade",
          quantity: 6,
          unit: "pcs",
          unit_price: 5.0,
          vat_rate: 0,
          vat_amount: 0,
          line_total: 1401.6,
          area_name: "Area 1",
          dimensions: "L: 12000 mm\nW: 5200 mm",
          calc_type_formula: "PVC Edge + Centre Joint\n((2L + 1CJ) + 2W) * Qty => (3L + 2W) * Qty",
          result_display: "280.320 m",
          result_unit: "m",
        },
        {
          description: "PVC Parking Shade Fabric & Centre Joint\nParking Bay 7-14 standard cantilever shade",
          quantity: 8,
          unit: "pcs",
          unit_price: 5.0,
          vat_rate: 0,
          vat_amount: 0,
          line_total: 1881.6,
          area_name: "Area 2",
          dimensions: "L: 12000 mm\nW: 5200 mm",
          calc_type_formula: "PVC Edge + Centre Joint\n((2L + 1CJ) + 2W) * Qty => (3L + 2W) * Qty",
          result_display: "376.320 m",
          result_unit: "m",
        },
        {
          description: "PVC Parking Shade Fabric & Centre Joint\nParking Bay 15-22 standard cantilever shade",
          quantity: 8,
          unit: "pcs",
          unit_price: 5.0,
          vat_rate: 0,
          vat_amount: 0,
          line_total: 1884.8,
          area_name: "Area 3",
          dimensions: "L: 12000 mm\nW: 5000 mm",
          calc_type_formula: "PVC Edge + Centre Joint\n((2L + 1CJ) + 2W) * Qty => (3L + 2W) * Qty",
          result_display: "376.960 m",
          result_unit: "m",
        },
        {
          description: "PVC Parking Shade Fabric & Centre Joint\nParking Bay 23-30 standard cantilever shade",
          quantity: 8,
          unit: "pcs",
          unit_price: 5.0,
          vat_rate: 0,
          vat_amount: 0,
          line_total: 1884.8,
          area_name: "Area 4",
          dimensions: "L: 12000 mm\nW: 5000 mm",
          calc_type_formula: "PVC Edge + Centre Joint\n((2L + 1CJ) + 2W) * Qty => (3L + 2W) * Qty",
          result_display: "376.960 m",
          result_unit: "m",
        },
      ],
      subtotal: 7052.8,
      vat_amount: 352.64,
      total_amount: 7405.44,
      advance_amount: undefined,
      payment_terms: undefined,
      notes: "Dimensions normalized to metric standard (1000 mm = 1 m). Linear (m), area (m²), and counts (pcs) strictly segregated. Fabrications conform to approved engineering specifications.",
    };
  }

  return base;
}

interface DynamicDocumentRendererProps {
  layout: DocumentLayout;
  company: CompanyDocInfo | null;
  data?: MockDocumentData;
  isDesignerPreview?: boolean;
  scale?: number;
  pageNumber?: number;
  totalPages?: number;
}

import {
  computeEffectiveLayout,
  computePaginationPlan,
  ItemDescriptionLike,
  DocumentFitText,
} from "@/lib/documentLayoutEngine";

export function getItemsPerPage(layout: DocumentLayout): number {
  const lineItems = layout.elements.find((element) => element.type === "line_items" && element.visible);
  if (!lineItems) return Number.MAX_SAFE_INTEGER;
  const rowHeight = Math.max(4, lineItems.tableSettings?.rowHeight || 8.5);
  const headerHeight = Math.max(7, lineItems.tableSettings?.headerFontSize ? lineItems.tableSettings.headerFontSize * 0.35 + 4 : rowHeight);
  return Math.max(1, Math.floor((lineItems.height - headerHeight) / rowHeight));
}

export function getDocumentPageCount(
  layout: DocumentLayout,
  itemCount: number,
  itemsData?: ItemDescriptionLike[],
  documentText?: DocumentFitText
): number {
  return computePaginationPlan(fitMeasurementSummaryLayout(layout, documentText), itemCount, itemsData, documentText).totalPages;
}

export default function DynamicDocumentRenderer({
  layout: savedLayout,
  company,
  data: providedData,
  isDesignerPreview = false,
  scale = 1,
  pageNumber = 1,
  totalPages,
}: DynamicDocumentRendererProps) {
  const data = providedData || getSampleDocumentData(savedLayout.documentType);
  const layout = fitMeasurementSummaryLayout(savedLayout, data);
  const brand = getBrandConfig(company);
  const [logoFailed, setLogoFailed] = useState(false);

  const printSettings = normalizePrintSettings(layout.page?.printSettings);
  const isGrayscale = printSettings.colorMode === "grayscale";
  const isPrinterFriendly = printSettings.printerFriendlyMode;
  const isHighContrast = printSettings.borderContrast === "high" || printSettings.borderContrast === "maximum";

  const rawBorderColor =
    printSettings.borderContrast === "maximum"
      ? "#1E293B"
      : isHighContrast
      ? "#64748B"
      : (layout.branding?.borderColor || brand.colors.border);

  const colors = {
    primary: isGrayscale ? "#0F172A" : (layout.branding?.primaryColor || brand.colors.primary),
    accent: isGrayscale ? "#334155" : (layout.branding?.accentColor || brand.colors.accent),
    text: isGrayscale ? "#0F172A" : (layout.branding?.textColor || brand.colors.text),
    muted: isGrayscale ? "#475569" : (layout.branding?.mutedColor || brand.colors.muted),
    border: isGrayscale ? "#475569" : rawBorderColor,
    tableHeader: isPrinterFriendly ? "#FFFFFF" : isGrayscale ? "#0F172A" : (layout.branding?.tableHeaderColor || brand.colors.tableHeader),
    tableHeaderTextColor: isPrinterFriendly ? "#0F172A" : "#FFFFFF",
    totalHighlight: isGrayscale ? "#F1F5F9" : (layout.branding?.totalHighlightColor || brand.colors.totalHighlight),
  };

  const advance = Number(data.advance_amount) || 0;
  const balanceDue = Math.max(0, data.total_amount - advance);

  // Compute intelligent pagination plan with item line-wrap awareness
  const paginationPlan = computePaginationPlan(layout, data.items.length, data.items, data);
  const resolvedTotalPages = totalPages || paginationPlan.totalPages;
  const currentPageInfo = paginationPlan.pageItemRanges.find((p) => p.pageNumber === pageNumber) || {
    pageNumber,
    startIndex: 0,
    endIndex: data.items.length,
    itemCount: data.items.length,
    isLastPage: pageNumber >= resolvedTotalPages,
  };

  const firstItemIndex = currentPageInfo.startIndex;
  const pageItems = data.items.slice(currentPageInfo.startIndex, currentPageInfo.endIndex);
  const isLastPage = pageNumber >= resolvedTotalPages || currentPageInfo.isLastPage;
  const usesVat = documentUsesVat(layout.documentType);
  const totalCredits = data.items.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
  const totalDeductions = Math.max(0, data.subtotal - data.total_amount);

  // Calculate dynamic effective layout geometry with flow-aware positioning and intelligent single-page compaction
  const effectiveGeometry = computeEffectiveLayout(
    layout,
    pageItems.length,
    isLastPage,
    pageNumber,
    resolvedTotalPages,
    pageItems,
    data
  );

  const fontWeight = (weight: LayoutElement["fontWeight"]): CSSProperties["fontWeight"] => {
    if (weight === "extrabold") return 800;
    if (weight === "bold") return 700;
    if (weight === "semibold") return 600;
    if (weight === "medium") return 500;
    return weight === "normal" ? 400 : undefined;
  };

  const elementAppearance = (elem: LayoutElement): CSSProperties => ({
    ...(elem.fontSize !== undefined ? { fontSize: `${elem.fontSize}px` } : {}),
    ...(elem.fontWeight ? { fontWeight: fontWeight(elem.fontWeight) } : {}),
    ...(elem.fontStyle ? { fontStyle: elem.fontStyle } : {}),
    ...(elem.fontFamily ? { fontFamily: elem.fontFamily } : {}),
    ...(elem.textAlign ? { textAlign: elem.textAlign } : {}),
    ...(elem.color ? { color: elem.color } : {}),
    ...(elem.backgroundColor ? { backgroundColor: elem.backgroundColor } : {}),
    ...(elem.borderWidth !== undefined
      ? { border: `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` }
      : {}),
    ...(elem.borderRadius !== undefined ? { borderRadius: `${elem.borderRadius}px` } : {}),
    ...(elem.padding !== undefined ? { padding: `${elem.padding}mm` } : {}),
    ...(elem.lineHeight !== undefined ? { lineHeight: elem.lineHeight } : {}),
    ...(elem.letterSpacing !== undefined ? { letterSpacing: `${elem.letterSpacing}px` } : {}),
    opacity: elem.opacity ?? 1,
  });

  const replaceDocumentTokens = (value: string): string => {
    if (!value) return "";
    let str = value;
    const tokens: Record<string, string | number | undefined> = {
      company_name: brand.legal_name || brand.name || "",
      "company.name": brand.name || "",
      "company.legal_name": brand.legal_name || brand.name || "",
      company_short: brand.name || "",
      company_name_ar: brand.arabic_name || "",
      "company.arabic_name": brand.arabic_name || "",
      trn: brand.trn || "",
      company_trn: brand.trn || "",
      "company.trn": brand.trn || "",
      address: brand.address || "",
      company_address: brand.address || "",
      "company.address": brand.address || "",
      phone: brand.phone || "",
      company_phone: brand.phone || "",
      "company.phone": brand.phone || "",
      email: brand.email || "",
      company_email: brand.email || "",
      "company.email": brand.email || "",
      website: brand.website || "",
      company_website: brand.website || "",
      "company.website": brand.website || "",
      bank_name: brand.bank_name || "",
      iban: brand.iban || "",
      swift: brand.swift_bic || "",
      bank_account: brand.bank_account_name || brand.legal_name || "",

      doc_number: data.document_number || "",
      document_number: data.document_number || "",
      doc_date: fmtDate(data.document_date) || "",
      document_date: fmtDate(data.document_date) || "",
      due_date: data.due_date ? fmtDate(data.due_date) : "",
      supply_date: data.supply_date ? fmtDate(data.supply_date) : fmtDate(data.document_date) || "",
      payment_terms: data.payment_terms || "",
      project_name: data.project_name || "",
      project_number: data.project_number || "",
      site_location: data.location || "",
      notes: data.notes || "",

      customer_name: data.customer_name || "",
      customer_trn: data.customer_trn || "",
      customer_address: data.customer_address || "",
      contact_person: data.contact_person || "",
      contact_number: data.contact_number || "",
      contact_email: data.contact_email || "",

      supplier_name: data.supplier_name || data.customer_name || "",
      supplier_trn: data.customer_trn || "",
      supplier_address: data.customer_address || "",

      total_amount: data.total_amount ? String(data.total_amount) : "0.00",
      amount_in_words: numberToWordsEnglish(data.total_amount),
    };

    for (const [k, v] of Object.entries(tokens)) {
      const val = v !== undefined && v !== null ? String(v) : "";
      str = str.replaceAll(`{{${k}}}`, val).replaceAll(`{${k}}`, val);
    }
    return str;
  };

  const replaceCompanyTokens = replaceDocumentTokens;

  // Render individual element content based on its type
  function renderElementContent(elem: LayoutElement) {
    switch (elem.type) {
      case "watermark": {
        const bgImg = elem.imageSrc || brand.assets.watermark || brand.assets.background || brand.assets.logo;
        return (
          <div className="w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgImg}
              alt=""
              className="w-full h-full object-contain"
              style={{ opacity: elem.opacity ?? 0.045 }}
            />
          </div>
        );
      }

      case "logo": {
        const logoSrc = elem.imageSrc || brand.assets.logo;
        if (!logoFailed && logoSrc) {
          return (
            <div
              className="w-full h-full flex items-center justify-center overflow-hidden"
              style={{
                backgroundColor: elem.backgroundColor,
                border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
                borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
                opacity: elem.opacity ?? 1,
                ...elementAppearance(elem),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={brand.legal_name || "Company Logo"}
                className="w-full h-full"
                style={{
                  objectFit: elem.imageFit || "contain",
                }}
                onError={() => setLogoFailed(true)}
              />
            </div>
          );
        }
        return (
          <div
            className="w-full h-full flex items-center justify-center border rounded"
            style={{ borderColor: colors.border, color: colors.primary }}
          >
            <Building2 size={24} />
          </div>
        );
      }

      case "company_name_en": {
        return (
          <div
            className="w-full h-full flex items-center uppercase tracking-wider select-text"
            style={{
              justifyContent:
                elem.textAlign === "center"
                  ? "center"
                  : elem.textAlign === "right"
                  ? "flex-end"
                  : "flex-start",
              fontSize: `${elem.fontSize || 15}px`,
              fontWeight: elem.fontWeight === "extrabold" ? 800 : elem.fontWeight === "bold" ? 700 : 600,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : "0.05em",
              lineHeight: elem.lineHeight ? elem.lineHeight : undefined,
              color: elem.color || colors.primary,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText || brand.legal_name || brand.name}
          </div>
        );
      }

      case "company_name_ar": {
        return (
          <div
            className="w-full h-full flex items-center font-arabic select-text"
            dir="rtl"
            style={{
              justifyContent:
                elem.textAlign === "center"
                  ? "center"
                  : elem.textAlign === "left"
                  ? "flex-start"
                  : "flex-end",
              fontSize: `${elem.fontSize || 26}px`,
              fontWeight: elem.fontWeight === "bold" ? 700 : elem.fontWeight === "semibold" ? 600 : 700,
              fontStyle: elem.fontStyle || "normal",
              color: elem.color || colors.accent,
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : "0.01em",
              lineHeight: elem.lineHeight ? elem.lineHeight : 1.25,
              fontFamily:
                elem.fontFamily ||
                "'Segoe UI Arabic', 'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Noto Naskh Arabic', Arial, sans-serif",
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText || brand.arabic_name}
          </div>
        );
      }

      case "company_address": {
        return (
          <div
            className="w-full h-full flex flex-col justify-center text-[10px] leading-tight select-text"
            style={{
              textAlign: elem.textAlign || "center",
              color: elem.color || colors.muted,
              fontSize: `${elem.fontSize || 10}px`,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
              lineHeight: elem.lineHeight ? elem.lineHeight : undefined,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <div>{replaceCompanyTokens(elem.customText)}</div>
            ) : (
              <>
                <div>{brand.address}</div>
                <div className="font-semibold text-slate-800">
                  TRN: <span className="font-mono font-bold" style={{ color: colors.primary }}>{brand.trn}</span>
                  {brand.phone ? ` | Tel: ${brand.phone}` : ""}
                  {brand.email ? ` | Email: ${brand.email}` : ""}
                </div>
              </>
            )}
          </div>
        );
      }

      case "doc_title": {
        const titleBg = isPrinterFriendly ? "#FFFFFF" : (elem.backgroundColor || colors.primary);
        const titleColor = isPrinterFriendly ? colors.primary : (elem.color || "#FFFFFF");
        const titleBorder = isPrinterFriendly
          ? `2px solid ${colors.primary}`
          : elem.borderWidth
          ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}`
          : undefined;

        return (
          <div
            className="w-full h-full flex items-center justify-between px-3 select-text"
            style={{
              backgroundColor: titleBg,
              color: titleColor,
              border: titleBorder,
              borderRadius: `${elem.borderRadius || 4}px`,
              opacity: elem.opacity ?? 1,
              padding: elem.padding !== undefined ? `${elem.padding}mm` : undefined,
              ...elementAppearance(elem),
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="font-extrabold uppercase tracking-wider"
                style={{
                  fontSize: `${elem.fontSize || 15}px`,
                  fontStyle: elem.fontStyle || "normal",
                  fontFamily: elem.fontFamily || "inherit",
                  letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
                }}
              >
                {elem.customText || (layout.documentType === "measurement_sheet" ? "MEASUREMENT & TAKEOFF SHEET" : "TAX INVOICE")}
              </span>
            </div>
            <div className="text-right font-mono font-bold text-xs" style={{ color: colors.accent }}>
              REF: {data.document_number}
            </div>
          </div>
        );
      }

      case "customer_info": {
        const partyHeading =
          layout.documentType === "receipt_voucher"
            ? "Received From / Payer (المستلم منه):"
            : layout.documentType === "employee_payment_voucher"
            ? "Employee / Payee (المستفيد):"
            : layout.documentType === "salary_statement"
            ? "Employee Details (بيانات الموظف):"
            : layout.documentType === "measurement_sheet"
            ? "Project & Client Information (بيانات المشروع والعميل):"
            : "Customer / Client Details (بيانات العميل):";
        const partyRole =
          layout.documentType === "receipt_voucher"
            ? "Payer"
            : layout.documentType === "employee_payment_voucher"
            ? "Payee"
            : layout.documentType === "salary_statement"
            ? "Employee"
            : layout.documentType === "measurement_sheet"
            ? "Client"
            : "Buyer";
        const configuredPaddingMm = elem.padding !== undefined ? elem.padding : 3.2;
        const isUltraCompact = elem.height <= 22;
        const isCompactPartyCard = elem.height <= 28;
        const padMm = isUltraCompact ? Math.min(configuredPaddingMm, 1.8) : isCompactPartyCard ? Math.min(configuredPaddingMm, 2.2) : configuredPaddingMm;
        const detailFontSize = isCompactPartyCard ? 9 : 9.5;
        const effectiveFontSize = isUltraCompact ? 8.5 : detailFontSize;
        return (
          <div
            className="w-full h-full min-h-0 overflow-hidden flex flex-col justify-start select-text"
            style={{
              boxSizing: "border-box",
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              fontSize: `${effectiveFontSize}px`,
              color: colors.text,
              ...elementAppearance(elem),
            }}
          >
            <div
              className="flex shrink-0 justify-between items-center border-b font-bold uppercase"
              style={{
                borderColor: colors.border,
                fontSize: isUltraCompact ? "8.5px" : isCompactPartyCard ? "9px" : "10px",
                paddingBottom: isUltraCompact ? "1.5px" : isCompactPartyCard ? "2px" : "4px",
                lineHeight: 1.15,
              }}
            >
              <span style={{ color: colors.primary }}>{partyHeading}</span>
              <span style={{ color: colors.muted }}>{partyRole}</span>
            </div>
            {elem.customText ? (
              <div
                className="min-h-0 overflow-auto whitespace-pre-line select-text"
                style={{
                  marginTop: isUltraCompact ? "2px" : isCompactPartyCard ? "3px" : "6px",
                  fontSize: `${effectiveFontSize}px`,
                  lineHeight: isUltraCompact ? 1.1 : isCompactPartyCard ? 1.15 : 1.25,
                }}
              >
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <div
                className="min-h-0 overflow-hidden select-text"
                style={{
                  marginTop: isUltraCompact ? "2px" : isCompactPartyCard ? "3px" : "6px",
                  fontSize: `${effectiveFontSize}px`,
                  lineHeight: isUltraCompact ? 1.1 : isCompactPartyCard ? 1.15 : 1.25,
                }}
              >
                {layout.documentType === "measurement_sheet" ? (
                  <>
                    <div className="font-bold text-slate-900 break-words leading-tight" style={{ overflowWrap: "anywhere" }}>
                      {data.title || "Fabrication & Takeoff Sheet"}
                    </div>
                    {data.project_name && (
                      <div className="text-[10px] mt-0.5">
                        <span style={{ color: colors.muted }}>Project: </span>
                        <span className="font-semibold text-slate-900">{data.project_name} {data.project_number ? `(${data.project_number})` : ""}</span>
                      </div>
                    )}
                    {data.customer_name && (
                      <div className="text-[10px] mt-0.5">
                        <span style={{ color: colors.muted }}>Client: </span>
                        <span className="font-bold text-slate-900">{data.customer_name}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-bold text-slate-900 break-words leading-tight" style={{ overflowWrap: "anywhere" }}>{data.customer_name}</div>
                    {data.customer_trn && (
                      <div>
                        <span style={{ color: colors.muted }}>TRN: </span>
                        <span className="font-mono font-bold text-slate-900">{data.customer_trn}</span>
                      </div>
                    )}
                    {data.customer_address && (
                      <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${detailFontSize}px`, overflowWrap: "anywhere" }}>
                        {data.customer_address}
                      </div>
                    )}
                    {data.contact_person && (
                      <div className="break-words" style={{ color: colors.muted, fontSize: `${detailFontSize}px`, overflowWrap: "anywhere" }}>
                        Attn: {data.contact_person}
                      </div>
                    )}
                    {data.contact_number && (
                      <div className="break-words" style={{ color: colors.muted, fontSize: `${detailFontSize}px`, overflowWrap: "anywhere" }}>Tel/Mob: {data.contact_number}</div>
                    )}
                    {data.contact_email && (
                      <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${detailFontSize}px`, overflowWrap: "anywhere" }}>Email: {data.contact_email}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      }

      case "supplier_info": {
        const padMm = elem.padding !== undefined ? elem.padding : 3.2;
        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              fontSize: `${elem.fontSize || 10.5}px`,
              color: colors.text,
              ...elementAppearance(elem),
            }}
          >
            <div className="flex justify-between items-center border-b pb-1 font-bold uppercase text-[10px]" style={{ borderColor: colors.border }}>
              <span style={{ color: colors.primary }}>Supplier / Vendor Details (بيانات المورد):</span>
              <span style={{ color: colors.muted }}>Vendor</span>
            </div>
            {elem.customText ? (
              <div className="space-y-0.5 mt-1.5 whitespace-pre-line leading-tight select-text" style={{ fontSize: `${elem.fontSize || 10.5}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <div className="space-y-0.5 mt-1.5 text-[10.5px] leading-tight select-text">
                <div className="font-bold text-slate-900 break-words leading-tight">{data.supplier_name || data.customer_name || "Supplier Name"}</div>
                {data.contact_person && (
                  <div className="break-words text-[10px]" style={{ color: colors.muted }}>
                    Attn: {data.contact_person} {data.contact_number ? `(${data.contact_number})` : ""}
                  </div>
                )}
                {data.customer_address && (
                  <div className="break-words text-[10px]" style={{ color: colors.muted, overflowWrap: "anywhere" }}>
                    {data.customer_address}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      case "project_info": {
        const padMm = elem.padding !== undefined ? elem.padding : 3.2;
        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              fontSize: `${elem.fontSize || 10.5}px`,
              color: colors.text,
              ...elementAppearance(elem),
            }}
          >
            <div className="flex justify-between items-center border-b pb-1 font-bold uppercase text-[10px]" style={{ borderColor: colors.border }}>
              <span style={{ color: colors.primary }}>Project Details (بيانات المشروع):</span>
              <span className="font-mono font-bold" style={{ color: colors.accent }}>{data.project_number || "PRJ"}</span>
            </div>
            {elem.customText ? (
              <div className="space-y-0.5 mt-1.5 whitespace-pre-line leading-tight select-text" style={{ fontSize: `${elem.fontSize || 10.5}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <div className="space-y-0.5 mt-1.5 text-[10.5px] leading-tight select-text">
                <div className="font-bold text-slate-900 break-words leading-tight">{data.project_name || "Project Name"}</div>
                {data.location && (
                  <div className="text-[10px]" style={{ color: colors.muted }}>
                    Location: <span className="font-semibold text-slate-800">{data.location}</span>
                  </div>
                )}
                {data.scope_of_work && (
                  <div className="text-[10px] break-words" style={{ color: colors.muted, overflowWrap: "anywhere" }}>
                    Scope: {data.scope_of_work}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      case "doc_meta": {
        const showSupplyDate = ["tax_invoice", "delivery_note", "purchase_order", "supplier_bill"].includes(layout.documentType);
        const showDueDate = ["tax_invoice", "quotation", "proforma_invoice", "supplier_bill"].includes(layout.documentType);
        const showTerms = ["tax_invoice", "quotation", "proforma_invoice", "purchase_order", "supplier_bill"].includes(layout.documentType);
        const configuredPaddingMm = elem.padding !== undefined ? elem.padding : 3.2;
        const isUltraCompact = elem.height <= 22;
        const isCompactMetaCard = elem.height <= 28;
        const padMm = isUltraCompact ? Math.min(configuredPaddingMm, 1.8) : isCompactMetaCard ? Math.min(configuredPaddingMm, 2.2) : configuredPaddingMm;
        const metaFontSize = isUltraCompact ? 8.5 : isCompactMetaCard ? 9.2 : (elem.fontSize || 10.5);
        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              fontSize: `${metaFontSize}px`,
              color: colors.text,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <div className="w-full h-full min-h-0 overflow-auto whitespace-pre-line leading-relaxed select-text" style={{ fontSize: `${metaFontSize}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div
                  className="flex justify-between items-center border-b font-bold uppercase"
                  style={{
                    borderColor: colors.border,
                    fontSize: isUltraCompact ? "8.5px" : "10px",
                    paddingBottom: isUltraCompact ? "1px" : "4px",
                    lineHeight: 1.15,
                  }}
                >
                  <span style={{ color: colors.primary }}>Document Reference (البيانات):</span>
                  <span className="font-mono font-bold" style={{ color: colors.accent }}>{data.document_number}</span>
                </div>
                <div
                  className={`grid grid-cols-2 ${isUltraCompact ? "gap-x-1.5 gap-y-0.5 mt-1" : "gap-x-2 gap-y-1 mt-1.5"} leading-tight select-text`}
                  style={{ fontSize: `${metaFontSize}px` }}
                >
                  <div>
                    <span style={{ color: colors.muted }}>Date: </span>
                    <span className="font-semibold text-slate-900">{fmtDate(data.document_date)}</span>
                  </div>
                  {showSupplyDate && (
                    <div>
                      <span style={{ color: colors.muted }}>{layout.documentType === "delivery_note" ? "Delivery" : "Supply"}: </span>
                      <span className="font-semibold text-slate-900">{fmtDate(data.supply_date || data.document_date)}</span>
                    </div>
                  )}
                  {showDueDate && data.due_date && (
                    <div>
                      <span style={{ color: colors.muted }}>Due: </span>
                      <span className="font-semibold text-slate-900">{fmtDate(data.due_date)}</span>
                    </div>
                  )}
                  {showTerms && data.payment_terms && (
                    <div>
                      <span style={{ color: colors.muted }}>Terms: </span>
                      <span className="font-semibold text-slate-900">{data.payment_terms}</span>
                    </div>
                  )}
                  {data.project_name && (
                    <div className="col-span-2 pt-0.5 border-t border-slate-200 break-words" style={{ overflowWrap: "anywhere" }}>
                      <span style={{ color: colors.muted }}>Project: </span>
                      <span className="font-semibold text-slate-900">{data.project_name}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }

      case "line_items": {
        const tSettings = elem.tableSettings || {
          headerBg: colors.tableHeader,
          headerTextColor: "#FFFFFF",
          fontSize: 11,
          headerFontSize: 11,
          rowHeight: 8,
          borderThickness: 1,
          borderColor: colors.border,
          bodyTextColor: colors.text,
          columns: [
            { key: "index", label: "#", visible: true, widthPct: 6, align: "center" },
            { key: "description", label: "Item Description", visible: true, widthPct: 44, align: "left" },
            { key: "quantity", label: "Qty", visible: true, widthPct: 8, align: "center" },
            { key: "unit", label: "Unit", visible: true, widthPct: 8, align: "center" },
            { key: "unit_price", label: "Rate (AED)", visible: true, widthPct: 11, align: "right" },
            { key: "vat_amount", label: "VAT (5%)", visible: true, widthPct: 10, align: "right" },
            { key: "line_total", label: "Total (AED)", visible: true, widthPct: 13, align: "right" },
          ] as TableColumnConfig[],
        };

        const activeCols = tSettings.columns.filter((c) => c.visible);
        const dynamicCellPadding = effectiveGeometry.fitProfile?.cellPadding;
        const isCompact = (tSettings.rowHeight || 8.5) < 7.5;
        const cellPadding = dynamicCellPadding ? "" : isCompact ? "py-0.5 px-1.5" : "py-1 px-2";
        const customPaddingStyle = dynamicCellPadding ? { padding: dynamicCellPadding } : {};

        return (
          <div
            className="w-full rounded select-text"
            style={{
              border: `${tSettings.borderThickness}px solid ${tSettings.borderColor}`,
              fontSize: `${tSettings.fontSize}px`,
              minHeight: isDesignerPreview ? `${elem.height}mm` : undefined,
            }}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  style={{
                    backgroundColor: isPrinterFriendly ? "#FFFFFF" : tSettings.headerBg,
                    color: isPrinterFriendly ? colors.primary : tSettings.headerTextColor,
                    fontSize: `${tSettings.headerFontSize}px`,
                    height: `${Math.max(5.0, tSettings.rowHeight)}mm`,
                    borderTop: isPrinterFriendly ? `2px solid ${colors.primary}` : undefined,
                    borderBottom: isPrinterFriendly ? `2px solid ${colors.primary}` : undefined,
                  }}
                >
                  {activeCols.map((col) => (
                    <th
                      key={col.key}
                      className={`${cellPadding} font-semibold`}
                      style={{
                        ...customPaddingStyle,
                        width: `${col.widthPct}%`,
                        textAlign: col.align,
                        borderRight: isPrinterFriendly
                          ? `1px solid ${colors.border}`
                          : `${tSettings.borderThickness}px solid rgba(255,255,255,0.15)`,
                        lineHeight: 1.15,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody
                className="bg-white divide-y"
                style={{
                  color: tSettings.bodyTextColor,
                  borderColor: isHighContrast ? "#94A3B8" : tSettings.borderColor,
                }}
              >
                {pageItems.length === 0 ? (
                  <tr style={{ height: `${tSettings.rowHeight || 8.5}mm` }}>
                    <td
                      colSpan={activeCols.length}
                      className="text-center text-slate-400 italic text-[10px] py-2"
                    >
                      No items specified.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((item, idx) => (
                    <tr key={firstItemIndex + idx} className="hover:bg-slate-50/50" style={{ height: `${tSettings.rowHeight}mm` }}>
                      {activeCols.map((col) => {
                        let val: React.ReactNode = "";
                        if (col.key === "index") val = firstItemIndex + idx + 1;
                        else if (col.key === "description") val = item.description;
                        else if (col.key === "quantity") val = item.quantity;
                        else if (col.key === "unit") val = item.unit || "Nos";
                        else if (col.key === "unit_price") val = Number(item.unit_price).toFixed(2);
                        else if (col.key === "discount") val = (item.discount || 0).toFixed(2);
                        else if (col.key === "vat_amount") val = Number(item.vat_amount).toFixed(2);
                        else if (col.key === "line_total") val = Number(item.line_total).toFixed(2);
                        else if (col.key === "date") val = item.date ? (/^\d{4}-\d{2}-\d{2}/.test(item.date) ? fmtDate(item.date) : item.date) : "—";
                        else if (col.key === "type") val = item.type || "";
                        else if (col.key === "reference") val = item.reference || "";
                        else if (col.key === "debit") val = item.debit ? Number(item.debit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
                        else if (col.key === "credit") val = item.credit ? Number(item.credit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
                        else if (col.key === "balance") val = item.balance == null ? "—" : Number(item.balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        else if (col.key === "area_name") val = item.area_name || `Area ${firstItemIndex + idx + 1}`;
                        else if (col.key === "dimensions") val = item.dimensions || "—";
                        else if (col.key === "calc_type") val = item.calc_type_formula || item.calc_type || "—";
                        else if (col.key === "result") val = item.result_display || (item.calculated_total ? `${item.calculated_total} ${item.result_unit || "m"}` : `${Number(item.quantity).toFixed(3)} ${item.unit || "m"}`);
                        else if (col.key === "rate") val = item.unit_price ? `AED ${Number(item.unit_price).toFixed(2)}${item.result_unit ? ` / ${item.result_unit}` : ""}` : "—";

                        const isMonetary = ["unit_price", "discount", "vat_amount", "line_total", "debit", "credit", "balance", "rate", "result"].includes(col.key);

                        return (
                          <td
                            key={col.key}
                            className={`${cellPadding} break-words ${col.key === "dimensions" || col.key === "calc_type" || col.key === "description" ? "whitespace-pre-line" : ""}`}
                            style={{
                              ...customPaddingStyle,
                              textAlign: col.align,
                              fontFamily: isMonetary ? "monospace" : "inherit",
                              fontWeight: col.key === "line_total" ? 700 : 400,
                              lineHeight: 1.15,
                            }}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }

      case "amount_in_words": {
        if ((layout.documentType === "delivery_note" || layout.documentType === "project_handover") && data.total_amount === 0) {
          return (
            <div
              className="w-full h-full p-2.5 flex flex-col justify-center select-text"
              style={{
                backgroundColor: elem.backgroundColor || "#F8FAFC",
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius || 4}px`,
                fontSize: `${elem.fontSize || 10}px`,
                ...elementAppearance(elem),
              }}
            >
              <div className="font-semibold text-slate-800 text-[10px]">
                {layout.documentType === "delivery_note" ? "Delivery Verification:" : "Handover Verification:"}
              </div>
              <div className="italic text-slate-600 text-[10px] mt-0.5">
                Official document issued for physical inspection, handover, and site delivery verification.
              </div>
            </div>
          );
        }

        const isDenseWords = elem.height <= 20;
        const wordsPadding = isDenseWords ? "p-1.5" : "p-2.5";
        const wordsFontSize = isDenseWords ? 9.0 : (elem.fontSize || 10);

        return (
          <div
            className={`w-full h-full ${wordsPadding} flex flex-col justify-start ${isDenseWords ? "gap-0.5" : "gap-1"} select-text`}
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              fontSize: `${wordsFontSize}px`,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <div className="w-full h-full min-h-0 overflow-auto whitespace-pre-line leading-relaxed select-text" style={{ fontSize: `${wordsFontSize}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div className="font-semibold text-slate-800 text-[10px]">
                  Amount in Words (المبلغ بالحروف):
                  {(layout.documentType === "receipt_voucher" || layout.documentType === "employee_payment_voucher") &&
                    !effectiveGeometry.elements.some((element) => element.type === "totals" && element.visible && element.effectiveVisible !== false) && (
                      <span className="float-right font-mono font-bold">{fmtAED(data.total_amount)}</span>
                    )}
                </div>
                <div className={`italic text-slate-700 font-medium ${isDenseWords ? "text-[9.5px]" : "text-[11px]"} leading-tight`}>
                  {numberToWordsEnglish(data.total_amount)}
                </div>
                <div
                  className={`text-right font-arabic font-semibold ${isDenseWords ? "text-[9.5px]" : "text-[11px]"} pt-0.5 border-t leading-tight select-text`}
                  dir="rtl"
                  style={{
                    borderColor: colors.border,
                    color: colors.accent,
                    fontFamily: "'Segoe UI Arabic', 'Amiri', 'Noto Naskh Arabic', sans-serif",
                  }}
                >
                  {numberToWordsArabic(data.total_amount)}
                </div>
              </>
            )}
          </div>
        );
      }

      case "totals": {
        if (layout.documentType === "measurement_sheet") {
          return <MeasurementTotals element={elem} data={data} appearance={elementAppearance(elem)} colors={colors} />;
        }

        if (layout.documentType === "receipt_voucher" || layout.documentType === "employee_payment_voucher") {
          const isReceipt = layout.documentType === "receipt_voucher";
          return (
            <div
              className="w-full h-full rounded select-text flex flex-col items-stretch justify-center overflow-hidden"
              style={{
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius || 4}px`,
                ...elementAppearance(elem),
              }}
            >
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase" style={{ color: colors.muted }}>
                {isReceipt ? "Amount Received" : "Amount Paid"}
              </div>
              <div className="px-2.5 py-1.5 text-right font-mono text-base font-bold" style={{ backgroundColor: colors.totalHighlight, color: colors.primary }}>
                {fmtAED(data.total_amount)}
              </div>
            </div>
          );
        }

        if (layout.documentType === "customer_statement") {
          return (
            <div
              className="w-full h-full overflow-hidden text-xs rounded select-text flex flex-col justify-start"
              style={{
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius || 4}px`,
                fontSize: `${elem.fontSize || 11}px`,
                ...elementAppearance(elem),
              }}
            >
              <div className="flex justify-between py-1 px-2.5 bg-slate-50 border-b" style={{ borderColor: colors.border }}>
                <span className="font-bold" style={{ color: colors.muted }}>Total Invoiced (Debits):</span>
                <span className="font-mono font-bold">{fmtAED(data.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 px-2.5 border-b" style={{ borderColor: colors.border }}>
                <span className="font-bold" style={{ color: colors.muted }}>Total Paid (Credits):</span>
                <span className="font-mono font-bold" style={{ color: colors.accent }}>{fmtAED(totalCredits)}</span>
              </div>
              <div
                className="flex justify-between py-1.5 px-2.5 font-bold text-slate-900 border-b"
                style={{
                  backgroundColor: colors.totalHighlight,
                  borderColor: colors.border,
                }}
              >
                <span>Closing Balance:</span>
                <span className="font-mono" style={{ color: colors.primary }}>{fmtAED(data.total_amount)}</span>
              </div>
            </div>
          );
        }

        if (layout.documentType === "salary_statement") {
          return (
            <div className="w-full h-full overflow-hidden rounded border text-[10px]" style={{ borderColor: elem.borderColor || colors.border }}>
              <div className="flex justify-between border-b px-2.5 py-1" style={{ borderColor: colors.border }}>
                <span className="font-bold" style={{ color: colors.muted }}>Gross Earnings:</span>
                <span className="font-mono font-bold">{fmtAED(data.subtotal)}</span>
              </div>
              <div className="flex justify-between border-b px-2.5 py-1" style={{ borderColor: colors.border }}>
                <span className="font-bold" style={{ color: colors.muted }}>Deductions:</span>
                <span className="font-mono font-bold">{fmtAED(totalDeductions)}</span>
              </div>
              <div className="flex justify-between px-2.5 py-1.5 font-bold" style={{ backgroundColor: colors.totalHighlight, color: colors.primary }}>
                <span>Net Pay:</span>
                <span className="font-mono">{fmtAED(data.total_amount)}</span>
              </div>
            </div>
          );
        }

        if ((layout.documentType === "delivery_note" || layout.documentType === "project_handover") && data.total_amount === 0) {
          return (
            <div
              className="w-full h-full p-2.5 rounded text-xs select-text flex flex-col justify-center bg-slate-50 border"
              style={{
                borderColor: elem.borderColor || colors.border,
                ...elementAppearance(elem),
              }}
            >
              <div className="font-bold text-slate-800 text-[11px] mb-1">
                {layout.documentType === "delivery_note" ? "Goods Receipt Status:" : "Handover Status:"}
              </div>
              <div className="text-[10px] text-slate-600">
                {layout.documentType === "delivery_note"
                  ? "All dispatch quantities verified and accepted at site."
                  : "Works inspected and formally accepted with snag list acknowledged."}
              </div>
            </div>
          );
        }

        const isDenseTotals = elem.height <= 36;
        const rowPy = isDenseTotals ? (elem.height <= 30 ? "py-0.5" : "py-1") : "py-1";
        const rowPx = isDenseTotals ? "px-2" : "px-2.5";
        const totalsFontSize = isDenseTotals ? (elem.height <= 30 ? 9.5 : 10) : (elem.fontSize || 11);

        return (
          <div
            className="w-full h-full overflow-hidden rounded select-text flex flex-col justify-start"
            style={{
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              fontSize: `${totalsFontSize}px`,
              lineHeight: 1.15,
              ...elementAppearance(elem),
            }}
          >
            <div className={`flex justify-between ${rowPy} ${rowPx} bg-slate-50 border-b`} style={{ borderColor: colors.border }}>
              <span className="font-bold" style={{ color: colors.muted }}>Subtotal:</span>
              <span className="font-mono font-bold">{fmtAED(data.subtotal)}</span>
            </div>
            {usesVat && (
              <div className={`flex justify-between ${rowPy} ${rowPx} border-b`} style={{ borderColor: colors.border }}>
                <span className="font-bold" style={{ color: colors.muted }}>VAT Total (5%):</span>
                <span className="font-mono font-bold" style={{ color: colors.accent }}>{fmtAED(data.vat_amount)}</span>
              </div>
            )}
            <div
              className={`flex justify-between ${rowPy} ${rowPx} font-bold text-slate-900 border-b`}
              style={{
                backgroundColor: colors.totalHighlight,
                borderColor: colors.border,
              }}
            >
              <span>Grand Total:</span>
              <span className="font-mono" style={{ color: colors.primary }}>{fmtAED(data.total_amount)}</span>
            </div>
            {advance > 0 && (
              <div className={`flex justify-between ${rowPy} ${rowPx} bg-slate-50 text-[9.5px]`}>
                <span className="font-bold" style={{ color: colors.muted }}>Balance Due:</span>
                <span className="font-mono font-bold text-slate-900">{fmtAED(balanceDue)}</span>
              </div>
            )}
          </div>
        );
      }

      case "bank_details": {
        const isDenseBank = elem.height <= 20;
        const bankPadding = isDenseBank ? "p-1.5" : "p-2";
        const bankFontSize = isDenseBank ? 8.8 : (elem.fontSize || 10);
        return (
          <div
            className={`w-full h-full ${bankPadding} flex flex-col justify-center leading-tight select-text`}
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              fontSize: `${bankFontSize}px`,
              ...elementAppearance(elem),
              color: elem.color || colors.text || "#334155",
            }}
          >
            {elem.customText ? (
              <div className="whitespace-pre-line leading-snug select-text" style={{ fontSize: `${bankFontSize}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div className="font-bold text-slate-800 text-[9.5px] mb-0.5" style={{ color: colors.primary }}>
                  Bank Transfer Information (بيانات التحويل):
                </div>
                <div>Bank: <span className="font-semibold">{brand.bank_name}</span></div>
                <div>Account: <span className="font-semibold">{brand.bank_account_name || brand.legal_name}</span></div>
                <div>IBAN: <span className="font-mono font-bold text-slate-900">{brand.iban}</span></div>
                <div>SWIFT: <span className="font-mono">{brand.swift_bic}</span></div>
              </>
            )}
          </div>
        );
      }

      case "payment_terms": {
        const isDenseTerms = elem.height <= 22;
        const termsPadding = isDenseTerms ? "p-1" : "p-1.5";
        const termsFontSize = isDenseTerms ? 8.8 : (elem.fontSize || 10);
        const sectionHeading =
          layout.documentType === "delivery_note"
            ? "Delivery Notes & Condition:"
            : layout.documentType === "receipt_voucher"
            ? "Payment Method & Receipt Purpose:"
            : layout.documentType === "employee_payment_voucher"
            ? "Payment Purpose & Method:"
            : layout.documentType === "salary_statement"
            ? "Payroll Notes & Bank Reference:"
            : layout.documentType === "project_handover"
            ? "Handover Scope & Completion Remarks:"
            : layout.documentType === "work_method_statement"
            ? "Method, Scope & Safety Notes:"
            : layout.documentType === "measurement_sheet"
            ? "Measurement Notes & Compliance:"
            : "Terms & Remarks:";
        return (
          <div
            className={`w-full h-full leading-snug select-text ${termsPadding}`}
            style={{
              fontSize: `${termsFontSize}px`,
              color: elem.color || colors.muted,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <div className="whitespace-pre-line leading-snug select-text" style={{ fontSize: `${termsFontSize}px` }}>
                {replaceDocumentTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div className="font-bold text-slate-800 mb-0.5">{sectionHeading}</div>
                <div>{data.notes || "No additional remarks."}</div>
                {data.payment_terms && <div className="mt-0.5 italic">{data.payment_terms}</div>}
              </>
            )}
          </div>
        );
      }

      case "company_signature": {
        const sigSrc = elem.imageSrc || brand.assets.signature;
        return (
          <div
            className="w-full h-full flex flex-col items-center justify-between text-center select-none overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-800" style={{ color: colors.primary }}>
              {elem.customText || "COMPANY AUTHORIZED SIGNATURE"}
            </div>
            {/* Real uploaded signature only */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
              {sigSrc ? (
                <Image
                  src={sigSrc}
                  alt="Authorized Signature"
                  width={110}
                  height={38}
                  className="max-h-full max-w-full"
                  style={{ width: "auto", height: "auto", objectFit: elem.imageFit || "contain" }}
                  unoptimized
                />
              ) : (
                <div className="w-24 h-7 border-b border-dashed border-slate-300" />
              )}
            </div>
            <div className="w-full border-t border-slate-400 pt-0.5 text-[8px] text-slate-500">
              For {brand.legal_name || brand.name}
            </div>
          </div>
        );
      }

      case "company_stamp": {
        const stampSrc = elem.imageSrc || brand.assets.stamp;
        return (
          <div
            className={`w-full h-full flex flex-col items-center justify-between text-center select-none overflow-hidden ${elem.padding !== undefined ? "" : "p-1.5"}`}
            style={{
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              padding: elem.padding !== undefined ? `${elem.padding}mm` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText && (
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: colors.primary }}>
                {elem.customText}
              </div>
            )}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
              {stampSrc ? (
                <Image
                  src={stampSrc}
                  alt="Official Company Stamp"
                  width={80}
                  height={80}
                  className="max-h-full max-w-full"
                  style={{ width: "auto", height: "auto", objectFit: elem.imageFit || "contain" }}
                  unoptimized
                />
              ) : (
                <div className="w-16 h-16 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-[8px] text-slate-400 text-center p-1">
                  Official Stamp
                </div>
              )}
            </div>
            {elem.customText && (
              <div className="w-full border-t border-slate-300 pt-0.5 text-[8px] text-slate-500">
                Official Stamp / Seal
              </div>
            )}
          </div>
        );
      }

      case "building_image": {
        const bldgSrc = elem.imageSrc || brand.assets.building;
        return (
          <div
            className="w-full h-full flex items-center justify-center select-none overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {bldgSrc ? (
              <Image
                src={bldgSrc}
                alt="Company Premises"
                width={180}
                height={100}
                className="max-h-full max-w-full"
                style={{ width: "auto", height: "auto", objectFit: elem.imageFit || "cover" }}
                unoptimized
              />
            ) : (
              <div className="w-full h-full border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                Building / Premises Image
              </div>
            )}
          </div>
        );
      }

      case "company_trn": {
        return (
          <div
            className="w-full h-full flex items-center text-[11px] select-text"
            style={{
              justifyContent:
                elem.textAlign === "center"
                  ? "center"
                  : elem.textAlign === "right"
                  ? "flex-end"
                  : "flex-start",
              color: elem.color || colors.primary,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <span>{replaceDocumentTokens(elem.customText)}</span>
            ) : (
              <>
                <span className="font-semibold mr-1">TRN:</span>
                <span className="font-mono font-bold">{brand.trn}</span>
              </>
            )}
          </div>
        );
      }


      case "footer": {
        return (
          <div
            className="w-full h-full flex flex-col items-center justify-center text-[9px] select-text"
            style={{
              textAlign: elem.textAlign || "center",
              color: elem.color || colors.muted,
              fontSize: `${elem.fontSize || 9}px`,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
              lineHeight: elem.lineHeight ? elem.lineHeight : undefined,
              backgroundColor: elem.backgroundColor,
              borderTop: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderBottom: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            <div>{elem.customText || `${brand.legal_name} | Tel: ${brand.phone} | Email: ${brand.email} | Web: ${brand.website}`}</div>
            <div className="text-[8px] text-slate-400 mt-0.5">
              {usesVat
                ? "This is a computer generated document issued in accordance with UAE VAT regulations."
                : "This is a computer generated business document and does not require a physical signature unless stated."}
            </div>
            {resolvedTotalPages > 1 && (
              <div className="mt-0.5 font-mono text-[8px] text-slate-400">
                Page {pageNumber} of {resolvedTotalPages}
              </div>
            )}
          </div>
        );
      }

      case "custom_text": {
        return (
          <div
            className="w-full h-full flex items-center select-text p-1"
            style={{
              justifyContent:
                elem.textAlign === "center"
                  ? "center"
                  : elem.textAlign === "right"
                  ? "flex-end"
                  : "flex-start",
              fontSize: `${elem.fontSize || 12}px`,
              fontWeight: elem.fontWeight === "bold" ? 700 : elem.fontWeight === "semibold" ? 600 : elem.fontWeight === "extrabold" ? 800 : 400,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
              lineHeight: elem.lineHeight ? elem.lineHeight : undefined,
              color: elem.color || colors.text,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText || "Custom Text Element"}
          </div>
        );
      }

      case "custom_image": {
        const src = elem.imageSrc;
        if (!src) {
          return (
            <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-300 rounded text-slate-400 text-[10px]">
              <ImageIcon size={18} className="mb-1 text-slate-300" />
              <span>Empty Image</span>
            </div>
          );
        }
        return (
          <div
            className="w-full h-full overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={elem.label || "Custom Image"}
              className="w-full h-full"
              style={{
                objectFit: elem.imageFit || "contain",
              }}
            />
          </div>
        );
      }

      case "divider":
        return (
          <div
            className="h-full w-full"
            style={{
              borderTop: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              opacity: elem.opacity ?? 1,
            }}
          />
        );

      default:
        return (
          <div className="w-full h-full p-1 text-xs text-slate-400 border border-dashed">
            {elem.label}
          </div>
        );
    }
  }

  // A4 dimensions: 210mm x 297mm (or 297mm x 210mm in landscape)
  return (
    <div
      data-orientation={layout.page.orientation || "portrait"}
      data-print-mode={printSettings.colorMode}
      data-print-contrast={printSettings.borderContrast}
      className={`dynamic-document-page print-a4-sheet relative box-border select-none overflow-hidden bg-white shadow-2xl transition-all ${
        isDesignerPreview ? "cursor-default" : ""
      }`}
      style={{
        width: `${layout.page.widthMm}mm`,
        minHeight: `${layout.page.heightMm}mm`,
        height: `${layout.page.heightMm}mm`,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top center",
        backgroundColor: layout.page.background || "#FFFFFF",
        color: colors.text || "#334155",
        // CSS Custom variables mapped from layout branding
        ["--doc-primary" as string]: colors.primary,
        ["--doc-accent" as string]: colors.accent,
        ["--doc-text" as string]: colors.text,
        ["--doc-muted" as string]: colors.muted,
        ["--doc-border" as string]: colors.border,
      }}
    >
      {/* Decorative Page Borders Layer (Vector SVG, Print-accurate) */}
      <PageDecorativeBorders
        layout={layout}
        isDesignerPreview={isDesignerPreview}
        elements={effectiveGeometry.elements}
      />

      {/* Margin Guidelines (designer visual guides only) */}
      {isDesignerPreview && (
        <div
          className="absolute inset-0 pointer-events-none z-0 border border-dashed border-blue-200/50"
          style={{
            top: `${layout.page.margins.top}mm`,
            left: `${layout.page.margins.left}mm`,
            right: `${layout.page.margins.right}mm`,
            bottom: `${layout.page.margins.bottom}mm`,
          }}
        />
      )}

      {/* Render all visible layout elements with dynamic flow-aware geometry */}
      {effectiveGeometry.elements
        .filter((elem) => {
          if (!elem.visible || elem.effectiveVisible === false) return false;
          return true;
        })
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((elem) => {
          const posX = isDesignerPreview ? elem.x : elem.effectiveX;
          const posY = isDesignerPreview ? elem.y : elem.effectiveY;
          const width = isDesignerPreview ? elem.width : elem.effectiveWidth;
          const height = isDesignerPreview ? Math.max(elem.height, (elem as LayoutElement & {runtimeMinHeight?: number}).runtimeMinHeight ?? 0) : elem.effectiveHeight;

          return (
            <div
              key={elem.id}
              data-element-id={elem.id}
              className={`absolute ${isDesignerPreview ? "pointer-events-none" : ""}`}
              style={{
                left: `${posX}mm`,
                top: `${posY}mm`,
                width: `${width}mm`,
                minHeight: elem.type === "line_items" && !isDesignerPreview ? `${height}mm` : undefined,
                height: elem.type === "line_items" && !isDesignerPreview ? "auto" : `${height}mm`,
                zIndex: elem.zIndex,
              }}
            >
              {renderElementContent(elem)}
            </div>
          );
        })}
    </div>
  );
}
