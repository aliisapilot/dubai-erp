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
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import { formatDocNumber, formatDisplayDocNumber, type DocNumberingConfig } from "@/lib/documentNumbering";
import { CompanyDocInfo } from "./DocHeader";
import { numberToWordsArabic, numberToWordsEnglish } from "@/lib/amountInWords";
import { fmtAED, fmtDate } from "@/lib/helpers";
import { stripCustomPartyTags } from "@/lib/documentCustomer";
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
  customer_code?: string;
  customer_id?: string;
  opening_balance?: number;
  total_credits?: number;
}

export const SAMPLE_DOCUMENT_DATA: MockDocumentData = {
  document_number: "INV-2026-0042",
  document_date: "2026-09-24T08:00:00.000Z",
  supply_date: "2026-09-24T08:00:00.000Z",
  due_date: "2026-10-24T08:00:00.000Z",
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
  tax_invoice: "INV-001",
  quotation: "QUO-001",
  proforma_invoice: "PI-001",
  delivery_note: "DN-001",
  purchase_order: "PO-001",
  receipt_voucher: "RV-001",
  customer_statement: "SOA-001",
  supplier_bill: "BILL-001",
  salary_statement: "SLIP-2026-0042",
  project_handover: "HO-2026-0042",
  work_method_statement: "WMS-2026-0042",
  employee_payment_voucher: "EPV-2026-0042",
  measurement_sheet: "MS-2026-0001",
};

export function getSampleDocumentData(
  docType: DocumentTypeId,
  numberingConfig?: DocNumberingConfig
): MockDocumentData {
  const sampleDocNum = numberingConfig
    ? formatDocNumber(numberingConfig, numberingConfig.nextSequence || 1, new Date(2026, 8, 24))
    : SAMPLE_NUMBERS[docType];

  const base: MockDocumentData = {
    ...SAMPLE_DOCUMENT_DATA,
    document_number: sampleDocNum,
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
      document_number: "SOA-001",
      document_date: "2026-03-10",
      customer_name: "Al Karwan Solution FZC",
      customer_address: "Sharjah",
      customer_code: "CUST-101",
      opening_balance: 0,
      total_credits: 9000,
      items: [
        { description: "Previous Balance (Forwarded)", date: "", type: "Opening", reference: "—", debit: 0, credit: 0, balance: 0, quantity: 1, unit_price: 0, vat_amount: 0, line_total: 0 },
        { description: "Advance Payment for QTN104/26 & QTN105/26", date: "2026-02-09", type: "Payment", reference: "—", debit: 0, credit: 9000, balance: -9000, quantity: 1, unit_price: 9000, vat_amount: 0, line_total: -9000 },
        { description: "Pvc Water Tank Liner", date: "2026-03-07", type: "Invoice", reference: "INV-108", debit: 17673.60, credit: 0, balance: 8673.60, quantity: 1, unit_price: 17673.60, vat_amount: 0, line_total: 8673.60 },
        { description: "Pvc Water Tank Liner", date: "2026-03-10", type: "Invoice", reference: "INV-109", debit: 3028.72, credit: 0, balance: 11702.32, quantity: 1, unit_price: 3028.72, vat_amount: 0, line_total: 11702.32 },
      ],
      subtotal: 20702.32,
      vat_amount: 0,
      total_amount: 11702.32,
      advance_amount: undefined,
      payment_terms: "Your account balance is 11,702.32 AED. Please make your payment to cover the balance by the due date.\nMake all checks payable to Al Safwah Al Qabdha Tents IND L.L.C SP\n\nThank you for your business!",
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
  computeTextOverflowPlan,
  ItemDescriptionLike,
  DocumentFitText,
  TextContinuationPage,
} from "@/lib/documentLayoutEngine";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

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
  const fittedLayout = fitMeasurementSummaryLayout(layout, documentText);
  const plan = computePaginationPlan(fittedLayout, itemCount, itemsData, documentText);
  const basePages = plan.totalPages;
  const textPlan = computeTextOverflowPlan(fittedLayout, basePages, documentText);
  return textPlan.totalDocumentPages;
}

export function replaceDocumentTokens(
  value: string,
  providedData?: MockDocumentData,
  layout?: Partial<DocumentLayout>,
  company?: CompanyDocInfo | null
): string {
  if (!value) return "";
  const brand = getBrandConfig(company);
  const data = providedData || getSampleDocumentData(layout?.documentType || "tax_invoice");
  const hr = data as unknown as Record<string, unknown>;
  const getNum = (v: unknown): number | undefined => typeof v === "number" ? v : typeof v === "string" && !isNaN(Number(v)) ? Number(v) : undefined;
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
    payment_terms: stripCustomPartyTags(data.payment_terms) || "",
    project_name: stripCustomPartyTags(data.project_name) || "",
    project_number: data.project_number || "",
    site_location: data.location || "",
    notes: stripCustomPartyTags(data.notes) || "",

    customer_name: data.customer_name || "",
    customer_trn: data.customer_trn || "",
    customer_address: data.customer_address || "",
    contact_person: data.contact_person || "",
    contact_number: data.contact_number || "",
    contact_email: data.contact_email || "",

    supplier_name: data.supplier_name || data.customer_name || "",
    supplier_trn: data.customer_trn || "",
    supplier_address: data.customer_address || "",

    subtotal: data.subtotal ? fmtAED(data.subtotal) : "0.00",
    vat: data.vat_amount ? fmtAED(data.vat_amount) : "0.00",
    vat_amount: data.vat_amount ? fmtAED(data.vat_amount) : "0.00",
    vat_rate: data.vat_rate ? `${data.vat_rate}%` : "5%",
    grand_total: data.total_amount != null ? fmtAED(data.total_amount) : "AED 0.00",
    total_amount: data.total_amount != null ? fmtAED(data.total_amount) : "AED 0.00",
    balance: data.total_amount != null ? fmtAED(data.total_amount) : "AED 0.00",
    balance_due: fmtAED((data.total_amount || 0) - (data.advance_amount || 0)),
    closing_balance: data.total_amount != null ? fmtAED(data.total_amount) : "AED 0.00",
    current_balance: data.total_amount != null ? fmtAED(data.total_amount) : "AED 0.00",
    advance_amount: data.advance_amount ? fmtAED(data.advance_amount) : "0.00",
    amount_in_words: numberToWordsEnglish(data.total_amount),
    opening_balance: data.opening_balance != null ? fmtAED(data.opening_balance) : "AED 0.00",
    previous_balance: data.opening_balance != null ? fmtAED(data.opening_balance) : "AED 0.00",
    total_credits: data.total_credits != null ? fmtAED(data.total_credits) : "AED 0.00",
    credits: data.total_credits != null ? fmtAED(data.total_credits) : "AED 0.00",
    new_charges: data.subtotal != null ? fmtAED(data.subtotal) : "AED 0.00",
    charges: data.subtotal != null ? fmtAED(data.subtotal) : "AED 0.00",
    customer_id: (() => {
      const rawCode = (data.customer_code || "").trim();
      const rawId = (data.customer_id || "").trim();
      if (rawCode && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawCode)) {
        return rawCode;
      }
      if (rawId && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawId)) {
        return rawId.length > 8 ? rawId.slice(0, 8).toUpperCase() : rawId;
      }
      return "—";
    })(),
    customer_code: (() => {
      const rawCode = (data.customer_code || "").trim();
      const rawId = (data.customer_id || "").trim();
      if (rawCode && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawCode)) {
        return rawCode;
      }
      if (rawId && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawId)) {
        return rawId.length > 8 ? rawId.slice(0, 8).toUpperCase() : rawId;
      }
      return "—";
    })(),

    // HR & Payroll tokens
    employee_name: typeof hr.employee_name === "string" ? hr.employee_name : data.customer_name || "",
    employee_number: typeof hr.employee_number === "string" ? hr.employee_number : "",
    designation: typeof hr.designation === "string" ? hr.designation : "",
    department: typeof hr.department === "string" ? hr.department : "",
    basic_salary: getNum(hr.basic_salary) !== undefined ? fmtAED(getNum(hr.basic_salary)!) : data.subtotal ? fmtAED(Number(data.subtotal) * 0.7) : "0.00",
    allowances: getNum(hr.allowances) !== undefined ? fmtAED(getNum(hr.allowances)!) : "0.00",
    gross_salary: data.subtotal ? fmtAED(data.subtotal) : "0.00",
    overtime_hours: String(hr.overtime_hours || 0),
    overtime_amount: getNum(hr.overtime_amount) !== undefined ? fmtAED(getNum(hr.overtime_amount)!) : "0.00",
    deductions: getNum(hr.deductions) !== undefined ? fmtAED(getNum(hr.deductions)!) : "0.00",
    net_salary: getNum(hr.net_salary) !== undefined ? fmtAED(getNum(hr.net_salary)!) : data.total_amount ? fmtAED(data.total_amount) : "0.00",
  };

  for (const [k, v] of Object.entries(tokens)) {
    const val = v !== undefined && v !== null ? String(v) : "";
    str = str.replaceAll(`{{${k}}}`, val).replaceAll(`{${k}}`, val);
  }
  return str;
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
  const rawData = providedData || getSampleDocumentData(savedLayout.documentType, savedLayout.numberingConfig);
  const effectiveDocNumber = (!isDesignerPreview && providedData?.document_number)
    ? formatDisplayDocNumber(providedData.document_number, savedLayout.documentType) || providedData.document_number
    : savedLayout.numberingConfig
    ? formatDocNumber(
        savedLayout.numberingConfig,
        savedLayout.numberingConfig.nextSequence || 1,
        rawData.document_date ? new Date(rawData.document_date) : new Date(2026, 8, 24)
      )
    : rawData.document_number;
  const data = {
    ...rawData,
    document_number: effectiveDocNumber,
    payment_terms: stripCustomPartyTags(rawData.payment_terms),
    notes: stripCustomPartyTags(rawData.notes),
    project_name: stripCustomPartyTags(rawData.project_name),
  };
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
    primary: isGrayscale ? "#0F172A" : (layout.branding?.companyHeaderColor || layout.branding?.primaryColor || brand.colors.primary),
    companyHeader: isGrayscale ? "#0F172A" : (layout.branding?.companyHeaderColor || layout.branding?.primaryColor || brand.colors.primary),
    titleBg: isPrinterFriendly ? "#FFFFFF" : isGrayscale ? "#0F172A" : (layout.branding?.titleBackground || layout.branding?.primaryColor || brand.colors.primary),
    titleText: isPrinterFriendly ? (layout.branding?.titleBackground || layout.branding?.primaryColor || brand.colors.primary) : (layout.branding?.titleTextColor || "#FFFFFF"),
    accent: isGrayscale ? "#334155" : (layout.branding?.accentColor || brand.colors.accent),
    text: isGrayscale ? "#0F172A" : (layout.branding?.textColor || brand.colors.text),
    muted: isGrayscale ? "#475569" : (layout.branding?.mutedColor || brand.colors.muted),
    border: isGrayscale ? "#475569" : (layout.branding?.borderColor || rawBorderColor),
    tableHeader: isPrinterFriendly ? "#FFFFFF" : isGrayscale ? "#0F172A" : (layout.branding?.tableHeaderColor || brand.colors.tableHeader),
    tableHeaderTextColor: isPrinterFriendly ? (layout.branding?.tableHeaderColor || "#0F172A") : (layout.branding?.tableHeaderTextColor || "#FFFFFF"),
    tableRowBg: isGrayscale ? "#FFFFFF" : (layout.branding?.tableRowBackground || "#FFFFFF"),
    tableRowAlt: isGrayscale ? "#F8FAFC" : (layout.branding?.tableRowAlternating || "#F8FAFC"),
    totalHighlight: isGrayscale ? "#F1F5F9" : (layout.branding?.totalHighlightColor || brand.colors.totalHighlight),
    footerBg: isGrayscale ? "#FFFFFF" : (layout.branding?.footerBackground || "#FFFFFF"),
    footerText: isGrayscale ? "#475569" : (layout.branding?.footerTextColor || layout.branding?.mutedColor || brand.colors.muted),
  };

  const advance = Number(data.advance_amount) || 0;
  const balanceDue = Math.max(0, data.total_amount - advance);

  const documentFitData: DocumentFitText = {
    ...data,
    company_name: company?.legal_name || company?.name || undefined,
    company_name_ar: company?.arabic_name || undefined,
    company_address: company?.address || undefined,
    company_trn: company?.trn || undefined,
    company_phone: company?.phone || undefined,
    company_email: company?.email || undefined,
  };

  // Compute intelligent pagination plan with item line-wrap awareness
  const paginationPlan = computePaginationPlan(layout, data.items.length, data.items, documentFitData);
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

  // Compute text overflow plan (only for real documents, not designer preview)
  const textOverflowPlan = !isDesignerPreview
    ? computeTextOverflowPlan(layout, paginationPlan.totalPages, documentFitData)
    : { hasTextOverflow: false, continuationPages: [], totalDocumentPages: paginationPlan.totalPages, baseItemPages: paginationPlan.totalPages, suppressSignaturesOnItemPage: false };
  const isTextContinuationPage = textOverflowPlan.hasTextOverflow && pageNumber > paginationPlan.totalPages;
  const textContinuationPageInfo: TextContinuationPage | null = isTextContinuationPage
    ? (textOverflowPlan.continuationPages.find((p) => p.pageNumber === pageNumber) || null)
    : null;

  // Calculate dynamic effective layout geometry with flow-aware positioning and intelligent single-page compaction
  const effectiveGeometry = computeEffectiveLayout(
    layout,
    pageItems.length,
    isLastPage,
    pageNumber,
    resolvedTotalPages,
    pageItems,
    documentFitData
  );

  // When text overflow moves signatures to the final continuation page, suppress them on the item page
  if (textOverflowPlan.hasTextOverflow && textOverflowPlan.suppressSignaturesOnItemPage && !isTextContinuationPage) {
    for (const el of effectiveGeometry.elements) {
      if (el.type === "company_signature" || el.type === "company_stamp") {
        el.effectiveVisible = false;
      }
    }
  }

  const dataRecord = data as Record<string, unknown>;
  const { filename: autoPdfFilename, title: autoPdfTitle } = generateDocumentPdfFilename({
    docType: layout.documentType,
    docNumber: (dataRecord.document_number as string) || (dataRecord.reference_number as string) || data.document_number,
    partyName: (dataRecord.customer_name as string) || (dataRecord.supplier_name as string) || (dataRecord.employee_name as string) || data.customer_name,
    date: (dataRecord.document_date as string) || (dataRecord.date as string) || data.document_date,
  });

  const fontWeight = (weight: LayoutElement["fontWeight"]): CSSProperties["fontWeight"] => {
    if (weight === "extrabold") return 800;
    if (weight === "bold") return 700;
    if (weight === "semibold") return 600;
    if (weight === "medium") return 500;
    return weight === "normal" ? 400 : undefined;
  };

  const resolvePt = (customPt: number | undefined, fallbackPt: number): number => {
    if (customPt !== undefined && Number.isFinite(customPt)) return Math.max(4, customPt);
    return fallbackPt;
  };

  const elementAppearance = (elem: LayoutElement): CSSProperties => ({
    ...(elem.fontSize !== undefined ? { fontSize: `${elem.fontSize}pt` } : {}),
    ...(elem.fontWeight ? { fontWeight: fontWeight(elem.fontWeight) } : {}),
    ...(elem.fontStyle ? { fontStyle: elem.fontStyle } : {}),
    ...(elem.textDecoration ? { textDecoration: elem.textDecoration } : {}),
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
    ...(elem.textWrapping === "nowrap"
      ? { whiteSpace: "nowrap" }
      : elem.textWrapping === "clip"
      ? { overflow: "hidden", textOverflow: "clip", whiteSpace: "nowrap" }
      : {}),
    opacity: elem.opacity ?? 1,
  });

  const replaceTokens = (value: string): string => {
    return replaceDocumentTokens(value, data, layout, company);
  };

  const replaceCompanyTokens = replaceTokens;

  // Render individual element content based on its type
  function renderElementContent(elem: LayoutElement) {
    switch (elem.type) {
      case "watermark": {
        const bgImg = elem.imageSrc || brand.assets.watermark || brand.assets.background || brand.assets.logo;
        const effectiveOpacity = elem.opacity ?? layout.page?.watermarkOpacity ?? 0.08;
        return (
          <div className="w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgImg}
              alt=""
              className="w-full h-full object-contain"
              style={{ opacity: effectiveOpacity }}
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
        const enPt = resolvePt(elem.fontSize, 11.0);
        const textAlign = elem.textAlign || "center";
        const justifyClass = textAlign === "left" ? "justify-start" : textAlign === "right" ? "justify-end" : "justify-center";
        return (
          <div
            className={`w-full h-full flex items-center ${justifyClass} uppercase tracking-wider select-text overflow-hidden`}
            style={{
              fontWeight: elem.fontWeight === "extrabold" ? 800 : elem.fontWeight === "bold" ? 700 : 600,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : "0.04em",
              lineHeight: elem.lineHeight ? elem.lineHeight : 1.25,
              color: elem.color || colors.companyHeader,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              wordBreak: "break-word",
              overflowWrap: "break-word",
              textAlign,
              ...elementAppearance(elem),
              fontSize: `${enPt}pt`,
            }}
          >
            <span className={`w-full block ${textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center"}`}>
              {elem.customText || brand.legal_name || brand.name}
            </span>
          </div>
        );
      }

      case "company_name_ar": {
        const arPt = resolvePt(elem.fontSize, 12.5);
        const textAlign = elem.textAlign || "center";
        const justifyClass = textAlign === "left" ? "justify-start" : textAlign === "right" ? "justify-end" : "justify-center";
        return (
          <div
            className={`w-full h-full flex items-center ${justifyClass} font-arabic select-text overflow-hidden`}
            dir="rtl"
            style={{
              fontWeight: elem.fontWeight === "bold" ? 700 : elem.fontWeight === "semibold" ? 600 : 700,
              fontStyle: elem.fontStyle || "normal",
              color: elem.color || colors.accent,
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : "0.01em",
              lineHeight: elem.lineHeight ? elem.lineHeight : 1.3,
              fontFamily:
                elem.fontFamily ||
                "'Segoe UI Arabic', 'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Noto Naskh Arabic', Arial, sans-serif",
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              wordBreak: "break-word",
              overflowWrap: "break-word",
              textAlign,
              ...elementAppearance(elem),
              fontSize: `${arPt}pt`,
            }}
          >
            <span className={`w-full block ${textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center"}`}>
              {elem.customText || brand.arabic_name}
            </span>
          </div>
        );
      }

      case "company_address": {
        const addrPt = resolvePt(elem.fontSize, 7.8);
        const textAlign = elem.textAlign || "center";
        const alignClass = textAlign === "left" ? "items-start text-left" : textAlign === "right" ? "items-end text-right" : "items-center text-center";
        return (
          <div
            className={`w-full h-full flex flex-col justify-center leading-snug select-text overflow-hidden ${alignClass}`}
            style={{
              textAlign,
              color: elem.color || colors.muted,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
              lineHeight: elem.lineHeight ? elem.lineHeight : 1.3,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
              fontSize: `${addrPt}pt`,
            }}
          >
            {elem.customText ? (
              <div className={`w-full ${textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center"} leading-snug break-words`}>
                {replaceCompanyTokens(elem.customText)}
              </div>
            ) : (
              <div className={`w-full flex flex-col ${alignClass} gap-0.5`}>
                <div className={`text-slate-600 leading-tight break-words max-w-full ${textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center"}`}>
                  {brand.address}
                </div>
                <div className={`font-semibold text-slate-800 leading-tight break-words max-w-full ${textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center"}`} style={{ fontSize: `${addrPt}pt` }}>
                  TRN: <span className="font-mono font-bold" style={{ color: colors.companyHeader }}>{brand.trn || "N/A"}</span>
                  {brand.phone ? ` | Tel: ${brand.phone}` : ""}
                  {brand.email ? ` | Email: ${brand.email}` : ""}
                </div>
              </div>
            )}
          </div>
        );
      }

      case "doc_title": {
        const titleBg = isPrinterFriendly ? "#FFFFFF" : (elem.backgroundColor || colors.titleBg);
        const titleColor = isPrinterFriendly ? colors.titleBg : (elem.color || colors.titleText);
        const titleBorder = isPrinterFriendly
          ? `2px solid ${colors.titleBg}`
          : elem.borderWidth
          ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}`
          : undefined;
        const titlePt = resolvePt(elem.fontSize, 12);
        const isRightTitle = elem.textAlign === "right" || (titleBg === "transparent" && !titleBorder);

        if (isRightTitle) {
          return (
            <div
              className="w-full h-full flex items-center justify-end px-1 select-text overflow-hidden"
              style={{
                backgroundColor: titleBg === "transparent" ? "transparent" : titleBg,
                color: titleColor,
                border: titleBorder,
                borderRadius: `${elem.borderRadius || 4}px`,
                opacity: elem.opacity ?? 1,
                padding: elem.padding !== undefined ? `${elem.padding}mm` : undefined,
                ...elementAppearance(elem),
                fontSize: `${titlePt}pt`,
              }}
            >
              <span
                style={{
                  fontSize: `${titlePt}pt`,
                  fontWeight: elem.fontWeight === "extrabold" ? 800 : elem.fontWeight === "bold" ? 700 : 700,
                  fontStyle: elem.fontStyle || "normal",
                  fontFamily: elem.fontFamily || "inherit",
                  letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
                  textAlign: "right",
                }}
              >
                {elem.customText || "Statement of Account"}
              </span>
            </div>
          );
        }

        return (
          <div
            className="w-full h-full flex items-center justify-between px-3 select-text overflow-hidden"
            style={{
              backgroundColor: titleBg,
              color: titleColor,
              border: titleBorder,
              borderRadius: `${elem.borderRadius || 4}px`,
              opacity: elem.opacity ?? 1,
              padding: elem.padding !== undefined ? `${elem.padding}mm` : undefined,
              ...elementAppearance(elem),
              fontSize: `${titlePt}pt`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="font-extrabold uppercase tracking-wider"
                style={{
                  fontSize: `${titlePt}pt`,
                  fontStyle: elem.fontStyle || "normal",
                  fontFamily: elem.fontFamily || "inherit",
                  letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
                }}
              >
                {elem.customText ||
                  (layout.numberingConfig?.customTitle && layout.numberingConfig?.customTitleAr
                    ? `${layout.numberingConfig.customTitle} — ${layout.numberingConfig.customTitleAr}`
                    : layout.numberingConfig?.customTitle ||
                      DOCUMENT_TYPE_OPTIONS.find((d) => d.id === layout.documentType)?.defaultTitle ||
                      (layout.documentType === "measurement_sheet"
                        ? "MEASUREMENT & TAKEOFF SHEET"
                        : "TAX INVOICE"))}
              </span>
            </div>
            <div className="text-right font-mono font-bold" style={{ color: colors.accent, fontSize: `${Math.max(6, titlePt * 0.75)}pt` }}>
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
        const configuredPaddingMm = elem.padding !== undefined ? elem.padding : 2.5;
        const isUltraCompact = elem.height <= 22;
        const isCompactPartyCard = elem.height <= 28;
        const detailFontSize = isCompactPartyCard ? 9 : 9.5;
        void detailFontSize;
        const padMm = isUltraCompact ? 1.8 : Math.min(configuredPaddingMm, 2.5);
        const cardPt = resolvePt(elem.fontSize, isUltraCompact ? 7.2 : 8.0);

        if (layout.documentType === "customer_statement") {
          return (
            <div
              className="w-full h-full min-h-0 overflow-hidden flex flex-col justify-start select-text"
              style={{
                boxSizing: "border-box",
                backgroundColor: elem.backgroundColor || "#FFFFFF",
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius !== undefined ? elem.borderRadius : 2}px`,
                color: colors.text,
                ...elementAppearance(elem),
                fontSize: `${cardPt}pt`,
              }}
            >
              <div
                className="w-full px-2.5 py-1 font-bold text-slate-900 border-b select-none flex justify-between items-center"
                style={{
                  backgroundColor: "#9CA3AF",
                  color: "#0F172A",
                  borderColor: elem.borderColor || colors.border,
                  fontSize: `${Math.max(6, cardPt * 0.95)}pt`,
                  lineHeight: 1.2,
                }}
              >
                <span>Bill To:</span>
              </div>
              <div className="p-2 space-y-0.5 leading-tight select-text overflow-hidden">
                <div className="font-bold text-slate-900 break-words" style={{ fontSize: `${cardPt * 1.05}pt` }}>
                  {data.customer_name}
                </div>
                {data.customer_address && (
                  <div className="text-slate-700 break-words" style={{ fontSize: `${cardPt * 0.95}pt` }}>
                    {data.customer_address}
                  </div>
                )}
                {data.customer_trn && (
                  <div className="text-slate-600" style={{ fontSize: `${cardPt * 0.9}pt` }}>
                    TRN: <span className="font-mono font-semibold">{data.customer_trn}</span>
                  </div>
                )}
                {data.contact_number && (
                  <div className="text-slate-600" style={{ fontSize: `${cardPt * 0.9}pt` }}>
                    Tel: {data.contact_number}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div
            className="w-full h-full min-h-0 overflow-hidden flex flex-col justify-start select-text"
            style={{
              boxSizing: "border-box",
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              color: colors.text,
              ...elementAppearance(elem),
              fontSize: `${cardPt}pt`,
            }}
          >
            <div
              className="flex shrink-0 justify-between items-center border-b font-bold uppercase"
              style={{
                borderColor: colors.border,
                fontSize: `${Math.max(6, cardPt * 0.95)}pt`,
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
                  fontSize: `${cardPt}pt`,
                  lineHeight: isUltraCompact ? 1.1 : isCompactPartyCard ? 1.15 : 1.25,
                }}
              >
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <div
                className="min-h-0 overflow-hidden select-text"
                style={{
                  marginTop: isUltraCompact ? "2px" : isCompactPartyCard ? "3px" : "6px",
                  fontSize: `${cardPt}pt`,
                  lineHeight: isUltraCompact ? 1.1 : isCompactPartyCard ? 1.15 : 1.25,
                }}
              >
                {layout.documentType === "measurement_sheet" ? (
                  <>
                    <div className="font-bold text-slate-900 break-words leading-tight" style={{ overflowWrap: "anywhere", fontSize: `${cardPt}pt` }}>
                      {data.title || "Fabrication & Takeoff Sheet"}
                    </div>
                    {data.project_name && (
                      <div className="mt-0.5" style={{ fontSize: `${Math.max(6, cardPt * 0.9)}pt` }}>
                        <span style={{ color: colors.muted }}>Project: </span>
                        <span className="font-semibold text-slate-900">{data.project_name} {data.project_number ? `(${data.project_number})` : ""}</span>
                      </div>
                    )}
                    {data.customer_name && (
                      <div className="mt-0.5" style={{ fontSize: `${Math.max(6, cardPt * 0.9)}pt` }}>
                        <span style={{ color: colors.muted }}>Client: </span>
                        <span className="font-bold text-slate-900">{data.customer_name}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-bold text-slate-900 break-words leading-tight" style={{ overflowWrap: "anywhere", fontSize: `${cardPt}pt` }}>{data.customer_name}</div>
                    {data.customer_trn && (
                      <div style={{ fontSize: `${Math.max(6, cardPt * 0.92)}pt` }}>
                        <span style={{ color: colors.muted }}>TRN: </span>
                        <span className="font-mono font-bold text-slate-900">{data.customer_trn}</span>
                      </div>
                    )}
                    {data.customer_address && (
                      <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${Math.max(6, cardPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                        {data.customer_address}
                      </div>
                    )}
                    {data.contact_person && (
                      <div className="break-words" style={{ color: colors.muted, fontSize: `${Math.max(6, cardPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                        Attn: {data.contact_person}
                      </div>
                    )}
                    {data.contact_number && (
                      <div className="break-words" style={{ color: colors.muted, fontSize: `${Math.max(6, cardPt * 0.92)}pt`, overflowWrap: "anywhere" }}>Tel/Mob: {data.contact_number}</div>
                    )}
                    {data.contact_email && (
                      <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${Math.max(6, cardPt * 0.92)}pt`, overflowWrap: "anywhere" }}>Email: {data.contact_email}</div>
                    )}
                    {data.project_name && (layout.documentType as string) !== "measurement_sheet" && (
                      <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${Math.max(6, cardPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                        Project: <span className="font-semibold text-slate-900">{data.project_name}</span>
                      </div>
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
        const suppPt = resolvePt(elem.fontSize, 8.5);
        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              color: colors.text,
              ...elementAppearance(elem),
              fontSize: `${suppPt}pt`,
            }}
          >
            <div className="flex justify-between items-center border-b pb-1 font-bold uppercase" style={{ borderColor: colors.border, fontSize: `${Math.max(6, suppPt * 0.95)}pt` }}>
              <span style={{ color: colors.primary }}>Supplier / Vendor Details (بيانات المورد):</span>
              <span style={{ color: colors.muted }}>Vendor</span>
            </div>
            {elem.customText ? (
              <div className="space-y-0.5 mt-1.5 whitespace-pre-line leading-tight select-text" style={{ fontSize: `${suppPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <div className="space-y-0.5 mt-1.5 leading-tight select-text" style={{ fontSize: `${suppPt}pt` }}>
                <div className="font-bold text-slate-900 break-words leading-tight">{data.supplier_name || data.customer_name || "Supplier Name"}</div>
                {data.customer_trn && (
                  <div style={{ fontSize: `${Math.max(6, suppPt * 0.92)}pt` }}>
                    <span style={{ color: colors.muted }}>TRN: </span>
                    <span className="font-mono font-bold text-slate-900">{data.customer_trn}</span>
                  </div>
                )}
                {data.contact_person && (
                  <div className="break-words" style={{ color: colors.muted, fontSize: `${Math.max(6, suppPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                    Attn: {data.contact_person} {data.contact_number ? `(${data.contact_number})` : ""}
                  </div>
                )}
                {data.customer_address && (
                  <div className="break-words" style={{ color: colors.muted, overflowWrap: "anywhere", fontSize: `${Math.max(6, suppPt * 0.92)}pt` }}>
                    {data.customer_address}
                  </div>
                )}
                {data.contact_email && (
                  <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${Math.max(6, suppPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                    Email: {data.contact_email}
                  </div>
                )}
                {data.project_name && (
                  <div className="break-words leading-tight" style={{ color: colors.muted, fontSize: `${Math.max(6, suppPt * 0.92)}pt`, overflowWrap: "anywhere" }}>
                    Project: <span className="font-semibold text-slate-900">{data.project_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      case "project_info": {
        const padMm = elem.padding !== undefined ? elem.padding : 3.2;
        const prjPt = resolvePt(elem.fontSize, 8.5);
        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              color: colors.text,
              ...elementAppearance(elem),
              fontSize: `${prjPt}pt`,
            }}
          >
            <div className="flex justify-between items-center border-b pb-1 font-bold uppercase" style={{ borderColor: colors.border, fontSize: `${Math.max(6, prjPt * 0.95)}pt` }}>
              <span style={{ color: colors.primary }}>Project Details (بيانات المشروع):</span>
              <span className="font-mono font-bold" style={{ color: colors.accent }}>{data.project_number || "PRJ"}</span>
            </div>
            {elem.customText ? (
              <div className="space-y-0.5 mt-1.5 whitespace-pre-line leading-tight select-text" style={{ fontSize: `${prjPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <div className="space-y-0.5 mt-1.5 leading-tight select-text" style={{ fontSize: `${prjPt}pt` }}>
                <div className="font-bold text-slate-900 break-words leading-tight">{data.project_name || "Project Name"}</div>
                {data.location && (
                  <div style={{ color: colors.muted, fontSize: `${Math.max(6, prjPt * 0.92)}pt` }}>
                    Location: <span className="font-semibold text-slate-800">{data.location}</span>
                  </div>
                )}
                {data.scope_of_work && (
                  <div className="break-words" style={{ color: colors.muted, overflowWrap: "anywhere", fontSize: `${Math.max(6, prjPt * 0.92)}pt` }}>
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
        const configuredPaddingMm = elem.padding !== undefined ? elem.padding : 2.5;
        const isUltraCompact = elem.height <= 22;
        const padMm = isUltraCompact ? 1.8 : Math.min(configuredPaddingMm, 2.5);
        const metaPt = resolvePt(elem.fontSize, isUltraCompact ? 7.2 : 8.0);

        if (layout.documentType === "customer_statement" && !elem.customText) {
          return (
            <div
              className="w-full h-full flex flex-col justify-center select-text overflow-hidden"
              style={{
                backgroundColor: elem.backgroundColor || "#FFFFFF",
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius !== undefined ? elem.borderRadius : 2}px`,
                fontSize: `${metaPt}pt`,
                ...elementAppearance(elem),
              }}
            >
              <table className="w-full h-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
                <tbody>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2.5 py-0.5 font-medium text-slate-700 w-28" style={{ borderRight: `1px solid ${elem.borderColor || colors.border}` }}>Date:</td>
                    <td className="px-2.5 py-0.5 font-semibold text-slate-900">{fmtDate(data.document_date)}</td>
                  </tr>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2.5 py-0.5 font-medium text-slate-700" style={{ borderRight: `1px solid ${elem.borderColor || colors.border}` }}>Statement #</td>
                    <td className="px-2.5 py-0.5 font-mono font-bold text-slate-900">{data.document_number}</td>
                  </tr>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2.5 py-0.5 font-medium text-slate-700" style={{ borderRight: `1px solid ${elem.borderColor || colors.border}` }}>Customer ID:</td>
                    <td className="px-2.5 py-0.5 font-mono text-slate-900">
                      {(() => {
                        const rawCode = (data.customer_code || "").trim();
                        const rawId = (data.customer_id || "").trim();
                        if (rawCode && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawCode)) {
                          return rawCode;
                        }
                        if (rawId && !/^(QUO|QTN|QT|INV|TAX|PI|PRO|DN|DLV|PO|RV|RCV)[-_/]/i.test(rawId)) {
                          return rawId.length > 8 ? rawId.slice(0, 8).toUpperCase() : rawId;
                        }
                        return "—";
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-0.5 font-medium text-slate-700" style={{ borderRight: `1px solid ${elem.borderColor || colors.border}` }}>Page</td>
                    <td className="px-2.5 py-0.5 font-semibold text-slate-900">{pageNumber} of {resolvedTotalPages}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div
            className="w-full h-full flex flex-col justify-start select-text overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              padding: `${padMm}mm`,
              color: colors.text,
              ...elementAppearance(elem),
              fontSize: `${metaPt}pt`,
            }}
          >
            {elem.customText ? (
              <div className="w-full h-full min-h-0 overflow-auto whitespace-pre-line leading-relaxed select-text" style={{ fontSize: `${metaPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div
                  className="flex justify-between items-center border-b font-bold uppercase"
                  style={{
                    borderColor: colors.border,
                    fontSize: `${Math.max(6, metaPt * 0.95)}pt`,
                    paddingBottom: isUltraCompact ? "1px" : "4px",
                    lineHeight: 1.15,
                  }}
                >
                  <span style={{ color: colors.primary }}>Document Reference (البيانات):</span>
                  <span className="font-mono font-bold" style={{ color: colors.accent }}>{data.document_number}</span>
                </div>
                <div
                  className={`grid grid-cols-2 ${isUltraCompact ? "gap-x-1.5 gap-y-0.5 mt-1" : "gap-x-2 gap-y-1 mt-1.5"} leading-tight select-text`}
                  style={{ fontSize: `${metaPt}pt` }}
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
                  {showTerms && data.payment_terms && (() => {
                    const shouldSpanTerms = !showDueDate || !data.due_date || data.payment_terms.length > 20 || data.payment_terms.includes("\n");
                    return (
                      <div
                        className={`${shouldSpanTerms ? "col-span-2" : ""} break-words`}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        <span style={{ color: colors.muted }}>Terms: </span>
                        <span className="font-semibold text-slate-900 whitespace-pre-line">{data.payment_terms}</span>
                      </div>
                    );
                  })()}
                  {data.project_name && (
                    <div className="col-span-2 pt-1 border-t border-slate-200/80 break-words" style={{ overflowWrap: "anywhere" }} dir="auto">
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
          fontSize: 8.5,
          headerFontSize: 8.5,
          rowHeight: 8,
          borderThickness: 1,
          borderColor: colors.border,
          bodyTextColor: colors.text,
          columns: [
            { key: "index", label: "#", visible: true, widthPct: 6, align: "center" },
            { key: "description", label: "Item Description", visible: true, widthPct: 44, align: "left" },
            { key: "quantity", label: "Qty", visible: true, widthPct: 8, align: "center" },
            { key: "unit", label: "Unit", visible: true, widthPct: 8, align: "center" },
            { key: "unit_price", label: "Rate (AED)", visible: true, widthPct: 11, align: "center" },
            { key: "vat_amount", label: "VAT (5%)", visible: true, widthPct: 10, align: "center" },
            { key: "line_total", label: "Total (AED)", visible: true, widthPct: 13, align: "center" },
          ] as TableColumnConfig[],
        };

        const activeCols = tSettings.columns.filter((c) => c.visible);
        const dynamicCellPadding = effectiveGeometry.fitProfile?.cellPadding;
        const isCompact = (tSettings.rowHeight || 8.5) < 7.5;
        const cellPadding = dynamicCellPadding ? "" : isCompact ? "py-0.5 px-1.5" : "py-1 px-2";
        const customPaddingStyle: CSSProperties = tSettings.cellPadding !== undefined
          ? { padding: `${tSettings.cellPadding}mm` }
          : dynamicCellPadding
          ? { padding: dynamicCellPadding }
          : {};

        const headerHeightMm = Math.max(4.0, tSettings.headerHeight || tSettings.rowHeight || 8.5);
        const rowHeightMm = Math.max(4.0, tSettings.rowHeight || 8.5);
        const tableBaseFontSizePt = resolvePt(tSettings.fontSize, 8.5);
        const tableHeaderFontSizePt = resolvePt(tSettings.headerFontSize, 8.5);

        const tableBorderColor = isHighContrast ? "#94A3B8" : (tSettings.borderColor || colors.border);

        return (
          <div
            className="w-full rounded select-text overflow-hidden"
            style={{
              border: `${tSettings.borderThickness}px solid ${tableBorderColor}`,
              fontSize: `${tableBaseFontSizePt}pt`,
              boxSizing: "border-box",
              minHeight: isDesignerPreview ? `${elem.height}mm` : undefined,
            }}
          >
            <table className="w-full text-left border-collapse" style={{ width: "100%", tableLayout: "fixed" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: layout.documentType === "customer_statement" ? "#9CA3AF" : (isPrinterFriendly ? "#FFFFFF" : (tSettings.headerBg || colors.tableHeader)),
                    color: layout.documentType === "customer_statement" ? "#0F172A" : (isPrinterFriendly ? colors.titleBg : (tSettings.headerTextColor || colors.tableHeaderTextColor)),
                    height: `${headerHeightMm}mm`,
                    borderTop: isPrinterFriendly && layout.documentType !== "customer_statement" ? `2px solid ${colors.primary}` : undefined,
                    borderBottom: layout.documentType === "customer_statement" ? "1px solid #94A3B8" : (isPrinterFriendly ? `2px solid ${colors.primary}` : `${tSettings.borderThickness}px solid ${tableBorderColor}`),
                  }}
                >
                  {activeCols.map((col, cIdx) => {
                    const colHeaderPt = col.fontSize !== undefined ? col.fontSize : tableHeaderFontSizePt;
                    const labelContent = col.labelAr ? `${col.label}<br/><span dir="rtl" className="font-arabic text-[9px] text-slate-300">${col.labelAr}</span>` : col.label;
                    const isTargetAmountCol = ["unit_price", "vat_amount", "line_total", "rate", "discount"].includes(col.key);
                    const effectiveAlign = layout.documentType === "customer_statement"
                      ? (col.align || "left")
                      : (isTargetAmountCol && (col.align === "right" || !col.align) ? "center" : (col.align || "left"));
                    const isStatement = layout.documentType === "customer_statement";
                    return (
                      <th
                        key={col.key}
                        className={`${cellPadding} font-bold ${isStatement ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                        style={{
                          ...customPaddingStyle,
                          width: `${col.widthPct}%`,
                          fontSize: `${colHeaderPt}pt`,
                          textAlign: effectiveAlign,
                          wordBreak: isStatement ? "break-word" : undefined,
                          overflowWrap: isStatement ? "break-word" : undefined,
                          whiteSpace: isStatement ? "normal" : "nowrap",
                          padding: isStatement ? "2mm 1.5mm" : undefined,
                          borderRight: cIdx === activeCols.length - 1
                            ? undefined
                            : isPrinterFriendly && layout.documentType !== "customer_statement"
                            ? `1px solid ${colors.border}`
                            : `${tSettings.borderThickness}px solid rgba(148, 163, 184, 0.5)`,
                          lineHeight: 1.15,
                        }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: labelContent }} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody
                style={{
                  color: tSettings.bodyTextColor || colors.text,
                }}
              >
                {pageItems.length === 0 ? (
                  <tr style={{ height: `${rowHeightMm}mm` }}>
                    <td
                      colSpan={activeCols.length}
                      className="text-center text-slate-400 italic text-[10px] py-2"
                      style={{
                        borderBottom: `${tSettings.borderThickness}px solid ${tableBorderColor}`,
                      }}
                    >
                      No items specified.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((item, idx) => (
                    <tr
                      key={firstItemIndex + idx}
                      className="hover:bg-slate-50/50"
                      style={{
                        height: `${rowHeightMm}mm`,
                        backgroundColor: idx % 2 === 0 ? colors.tableRowBg : colors.tableRowAlt,
                        borderBottom: `${tSettings.borderThickness}px solid ${tableBorderColor}`,
                      }}
                    >
                      {activeCols.map((col, cIdx) => {
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
                        else if (col.key === "balance" || (layout.documentType === "customer_statement" && col.key === "line_total")) {
                          const b = item.balance !== undefined ? item.balance : item.line_total;
                          if (b == null) val = "—";
                          else if (b < 0) val = `(${Math.abs(Number(b)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
                          else val = Number(b).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                        else if (col.key === "area_name") val = item.area_name || `Area ${firstItemIndex + idx + 1}`;
                        else if (col.key === "dimensions") val = item.dimensions || "—";
                        else if (col.key === "calc_type") val = item.calc_type_formula || item.calc_type || "—";
                        else if (col.key === "result") val = item.result_display || (item.calculated_total ? `${item.calculated_total} ${item.result_unit || "m"}` : `${Number(item.quantity).toFixed(3)} ${item.unit || "m"}`);
                        else if (col.key === "rate") val = item.unit_price ? `AED ${Number(item.unit_price).toFixed(2)}${item.result_unit ? ` / ${item.result_unit}` : ""}` : "—";

                        const isMonetary = ["unit_price", "discount", "vat_amount", "line_total", "debit", "credit", "balance", "rate", "result"].includes(col.key);

                        let colBodyPt = col.fontSize;
                        if (colBodyPt === undefined) {
                          if (col.key === "description" && tSettings.descriptionFontSize !== undefined) {
                            colBodyPt = tSettings.descriptionFontSize;
                          } else if (col.key === "quantity" && tSettings.qtyFontSize !== undefined) {
                            colBodyPt = tSettings.qtyFontSize;
                          } else if (col.key === "unit" && tSettings.unitFontSize !== undefined) {
                            colBodyPt = tSettings.unitFontSize;
                          } else if (col.key === "unit_price" && tSettings.rateFontSize !== undefined) {
                            colBodyPt = tSettings.rateFontSize;
                          } else if (col.key === "line_total" && tSettings.amountFontSize !== undefined) {
                            colBodyPt = tSettings.amountFontSize;
                          } else {
                            colBodyPt = tableBaseFontSizePt;
                          }
                        }

                        const isTargetAmountCol = ["unit_price", "vat_amount", "line_total", "rate", "discount"].includes(col.key);
                        const effectiveAlign = layout.documentType === "customer_statement" && ["debit", "credit", "balance", "line_total"].includes(col.key)
                          ? (col.align || "right")
                          : isTargetAmountCol && (col.align === "right" || !col.align) ? "center" : (col.align || "left");

                        const isNoWrap = isMonetary || ["type", "date", "reference"].includes(col.key);

                        return (
                          <td
                            key={col.key}
                            className={`${cellPadding} ${isNoWrap ? "whitespace-nowrap" : "break-words"} ${col.key === "dimensions" || col.key === "calc_type" || col.key === "description" ? "whitespace-pre-line" : ""} ${isMonetary ? "font-mono" : ""}`}
                            style={{
                              ...customPaddingStyle,
                              fontSize: `${colBodyPt}pt`,
                              textAlign: effectiveAlign,
                              fontFamily: isMonetary ? "monospace" : "inherit",
                              fontWeight: col.key === "line_total" || col.key === "balance" ? 700 : 400,
                              lineHeight: 1.15,
                              borderRight: cIdx === activeCols.length - 1
                                ? undefined
                                : `1px solid ${tableBorderColor}`,
                              borderBottom: `${tSettings.borderThickness}px solid ${tableBorderColor}`,
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
          const wordsPt = resolvePt(elem.fontSize, 8.5);
          return (
            <div
              className="w-full h-full p-2.5 flex flex-col justify-center select-text"
              style={{
                backgroundColor: elem.backgroundColor || "#F8FAFC",
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius || 4}px`,
                fontSize: `${wordsPt}pt`,
                ...elementAppearance(elem),
              }}
            >
              <div className="font-semibold text-slate-800" style={{ fontSize: `${Math.max(6, wordsPt * 0.95)}pt` }}>
                {layout.documentType === "delivery_note" ? "Delivery Verification:" : "Handover Verification:"}
              </div>
              <div className="italic text-slate-600 mt-0.5" style={{ fontSize: `${Math.max(6, wordsPt * 0.9)}pt` }}>
                Official document issued for physical inspection, handover, and site delivery verification.
              </div>
            </div>
          );
        }

        if (layout.documentType === "customer_statement") {
          const wordsPt = resolvePt(elem.fontSize, 9);
          return (
            <div
              className="w-full h-full px-3 py-1 flex items-center justify-between select-text overflow-hidden font-bold"
              style={{
                backgroundColor: elem.backgroundColor || "#9CA3AF",
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius !== undefined ? elem.borderRadius : 2}px`,
                fontSize: `${wordsPt}pt`,
                color: elem.color || "#0F172A",
                ...elementAppearance(elem),
              }}
            >
              <span className="uppercase tracking-wide font-extrabold text-slate-900">
                {elem.customText || "Account Current Balance"}
              </span>
              <span className="font-mono font-extrabold text-slate-900" style={{ fontSize: `${wordsPt * 1.15}pt` }}>
                {fmtAED(data.total_amount)}
              </span>
            </div>
          );
        }

        const isDenseWords = elem.height <= 22;
        const wordsPadding = isDenseWords ? "p-1.5" : "p-2";
        const baseWordsPt = resolvePt(elem.fontSize, isDenseWords ? 7.2 : 7.6);
        const headerPt = Math.max(6, Math.min(baseWordsPt, 7.5));
        const textPt = Math.max(5.5, Math.min(baseWordsPt, 7.3));
        const arabicPt = Math.max(5.8, Math.min(baseWordsPt, 7.6));

        return (
          <div
            className={`w-full h-full ${wordsPadding} flex flex-col justify-between overflow-hidden select-text`}
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              boxSizing: "border-box",
              ...elementAppearance(elem),
              fontSize: `${textPt}pt`,
            }}
          >
            {elem.customText ? (
              <div className="w-full h-full min-h-0 overflow-hidden whitespace-pre-line leading-relaxed select-text" style={{ fontSize: `${textPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div className="font-semibold text-slate-800 shrink-0" style={{ fontSize: `${headerPt}pt`, lineHeight: 1.2 }}>
                  Amount in Words (المبلغ بالحروف):
                  {(layout.documentType === "receipt_voucher" || layout.documentType === "employee_payment_voucher") &&
                    !effectiveGeometry.elements.some((element) => element.type === "totals" && element.visible && element.effectiveVisible !== false) && (
                      <span className="float-right font-mono font-bold">{fmtAED(data.total_amount)}</span>
                    )}
                </div>
                <div className="italic text-slate-700 font-medium leading-tight break-words" style={{ fontSize: `${textPt}pt` }}>
                  {numberToWordsEnglish(data.total_amount)}
                </div>
                <div
                  className="text-right font-arabic font-semibold pt-0.5 border-t leading-tight select-text break-words"
                  dir="rtl"
                  style={{
                    borderColor: colors.border,
                    color: colors.accent,
                    fontSize: `${arabicPt}pt`,
                    direction: "rtl",
                    textAlign: "right",
                    unicodeBidi: "isolate",
                    fontFamily: "'Segoe UI Arabic', 'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', Arial, sans-serif",
                    letterSpacing: "0px",
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

        const totalsPt = resolvePt(elem.fontSize, 9.5);

        if (layout.documentType === "receipt_voucher" || layout.documentType === "employee_payment_voucher") {
          const isReceipt = layout.documentType === "receipt_voucher";
          return (
            <div
              className="w-full h-fit rounded select-text flex flex-col items-stretch justify-center overflow-hidden"
              style={{
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius || 4}px`,
                ...elementAppearance(elem),
                fontSize: `${totalsPt}pt`,
              }}
            >
              <div className="px-2.5 py-1 font-bold uppercase" style={{ color: colors.muted, fontSize: `${Math.max(6, totalsPt * 0.9)}pt` }}>
                {isReceipt ? "Amount Received" : "Amount Paid"}
              </div>
              <div className="px-2.5 py-1.5 text-right font-mono font-bold" style={{ backgroundColor: colors.totalHighlight, color: colors.primary, fontSize: `${totalsPt * 1.3}pt` }}>
                {fmtAED(data.total_amount)}
              </div>
            </div>
          );
        }

        if (layout.documentType === "customer_statement") {
          const totalsPt = resolvePt(elem.fontSize, 7.8);
          const opening = data.opening_balance ?? (data.items[0]?.type === "Opening" ? data.items[0].balance : 0);
          return (
            <div
              className="w-full h-full min-h-0 overflow-hidden rounded select-text flex flex-col justify-start"
              style={{
                border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
                borderRadius: `${elem.borderRadius !== undefined ? elem.borderRadius : 2}px`,
                backgroundColor: elem.backgroundColor || "#FFFFFF",
                ...elementAppearance(elem),
                fontSize: `${totalsPt}pt`,
              }}
            >
              <div
                className="w-full px-2.5 py-0.5 font-bold text-slate-900 border-b select-none flex items-center"
                style={{
                  backgroundColor: "#9CA3AF",
                  color: "#0F172A",
                  borderColor: elem.borderColor || colors.border,
                  fontSize: `${Math.max(6, totalsPt * 0.95)}pt`,
                  lineHeight: 1.15,
                  minHeight: "4.8mm",
                }}
              >
                Account Summary
              </div>
              <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "54%" }} />
                  <col style={{ width: "46%" }} />
                </colgroup>
                <tbody className="text-slate-800" style={{ fontSize: `${totalsPt}pt` }}>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2 py-[1px] font-medium text-slate-700 whitespace-nowrap">Previous Balance</td>
                    <td className="px-2 py-[1px] text-right font-mono font-bold whitespace-nowrap">
                      {fmtAED(opening || 0)}
                    </td>
                  </tr>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2 py-[1px] font-medium text-slate-700 whitespace-nowrap">Credits</td>
                    <td className="px-2 py-[1px] text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      {fmtAED(totalCredits || 0)}
                    </td>
                  </tr>
                  <tr className="border-b" style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2 py-[1px] font-medium text-slate-700 whitespace-nowrap">New Charges</td>
                    <td className="px-2 py-[1px] text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                      {fmtAED(data.subtotal || 0)}
                    </td>
                  </tr>
                  <tr className={data.due_date ? "border-b" : ""} style={{ borderColor: elem.borderColor || colors.border }}>
                    <td className="px-2 py-[1.2px] font-extrabold text-slate-900 whitespace-nowrap">Total Balance Due</td>
                    <td className="px-2 py-[1.2px] text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                      {fmtAED(data.total_amount)}
                    </td>
                  </tr>
                  {data.due_date && (
                    <tr>
                      <td className="px-2 py-[1px] font-medium text-slate-600 whitespace-nowrap">Payment Due Date</td>
                      <td className="px-2 py-[1px] text-right font-mono text-slate-700 whitespace-nowrap">
                        {fmtDate(data.due_date)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        }

        if (layout.documentType === "salary_statement") {
          return (
            <div className="w-full h-fit overflow-hidden rounded border" style={{ borderColor: elem.borderColor || colors.border, ...elementAppearance(elem), fontSize: `${totalsPt}pt` }}>
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
              className="w-full h-fit p-2.5 rounded select-text flex flex-col justify-center bg-slate-50 border"
              style={{
                borderColor: elem.borderColor || colors.border,
                ...elementAppearance(elem),
                fontSize: `${totalsPt}pt`,
              }}
            >
              <div className="font-bold text-slate-800 mb-1" style={{ fontSize: `${totalsPt * 1.05}pt` }}>
                {layout.documentType === "delivery_note" ? "Goods Receipt Status:" : "Handover Status:"}
              </div>
              <div className="text-slate-600" style={{ fontSize: `${totalsPt * 0.92}pt` }}>
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

        // Custom labels from layout, with defaults
        const subtotalLabel = elem.totalsLabels?.subtotal || "Subtotal";
        const subtotalLabelAr = elem.totalsLabels?.subtotalAr;
        const vatLabel = elem.totalsLabels?.vat || "VAT Total (5%)";
        const vatLabelAr = elem.totalsLabels?.vatAr;
        const grandTotalLabel = elem.totalsLabels?.grandTotal || "Grand Total";
        const grandTotalLabelAr = elem.totalsLabels?.grandTotalAr;
        const balanceDueLabel = elem.totalsLabels?.balanceDue || "Balance Due";
        const balanceDueLabelAr = elem.totalsLabels?.balanceDueAr;

        return (
          <div
            className="w-full h-fit overflow-hidden rounded select-text flex flex-col justify-start"
            style={{
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              lineHeight: 1.15,
              ...elementAppearance(elem),
              fontSize: `${totalsPt}pt`,
            }}
          >
            <div data-totals-row="subtotal" className={`flex justify-between items-center ${rowPy} ${rowPx} bg-slate-50 border-b`} style={{ borderColor: colors.border }}>
              <div className="flex flex-col">
                <span className="font-bold" style={{ color: colors.muted }}>{subtotalLabel}:</span>
                {subtotalLabelAr && (
                  <span dir="rtl" className="font-arabic text-[9px] text-slate-400 font-normal leading-none mt-0.5">{subtotalLabelAr}</span>
                )}
              </div>
              <span className="font-mono font-bold">{fmtAED(data.subtotal)}</span>
            </div>
            {usesVat && (
              <div data-totals-row="vat" className={`flex justify-between items-center ${rowPy} ${rowPx} border-b`} style={{ borderColor: colors.border }}>
                <div className="flex flex-col">
                  <span className="font-bold" style={{ color: colors.muted }}>{vatLabel}:</span>
                  {vatLabelAr && (
                    <span dir="rtl" className="font-arabic text-[9px] text-slate-400 font-normal leading-none mt-0.5">{vatLabelAr}</span>
                  )}
                </div>
                <span className="font-mono font-bold" style={{ color: colors.accent }}>{fmtAED(data.vat_amount)}</span>
              </div>
            )}
            <div
              data-totals-row="grandTotal"
              className={`flex justify-between items-center ${rowPy} ${rowPx} font-bold text-slate-900 border-b`}
              style={{
                backgroundColor: colors.totalHighlight,
                borderColor: colors.border,
              }}
            >
              <div className="flex flex-col">
                <span>{grandTotalLabel}:</span>
                {grandTotalLabelAr && (
                  <span dir="rtl" className="font-arabic text-[9px] text-slate-500 font-normal leading-none mt-0.5">{grandTotalLabelAr}</span>
                )}
              </div>
              <span className="font-mono" style={{ color: colors.primary }}>{fmtAED(data.total_amount)}</span>
            </div>
            {advance > 0 && (
              <div data-totals-row="balanceDue" className={`flex justify-between items-center ${rowPy} ${rowPx} bg-slate-50`} style={{ fontSize: `${Math.max(6, totalsPt * 0.9)}pt` }}>
                <div className="flex flex-col">
                  <span className="font-bold" style={{ color: colors.muted }}>{balanceDueLabel}:</span>
                  {balanceDueLabelAr && (
                    <span dir="rtl" className="font-arabic text-[9px] text-slate-400 font-normal leading-none mt-0.5">{balanceDueLabelAr}</span>
                  )}
                </div>
                <span className="font-mono font-bold text-slate-900">{fmtAED(balanceDue)}</span>
              </div>
            )}
          </div>
        );
      }

      case "bank_details": {
        const isDenseBank = elem.height <= 20;
        const bankPadding = isDenseBank ? "p-1.5" : "p-2";
        const bankPt = resolvePt(elem.fontSize, isDenseBank ? 8 : 8.8);
        return (
          <div
            className={`w-full h-full ${bankPadding} flex flex-col justify-center leading-tight select-text`}
            style={{
              backgroundColor: elem.backgroundColor || "#F8FAFC",
              border: `${elem.borderWidth || 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius || 4}px`,
              ...elementAppearance(elem),
              fontSize: `${bankPt}pt`,
              color: elem.color || colors.text || "#334155",
            }}
          >
            {elem.customText ? (
              <div className="whitespace-pre-line leading-snug select-text" style={{ fontSize: `${bankPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : (
              <>
                <div className="font-bold text-slate-800 mb-0.5" style={{ color: colors.primary, fontSize: `${Math.max(6, bankPt * 0.95)}pt` }}>
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
        const termsPt = resolvePt(elem.fontSize, isDenseTerms ? 7.8 : 8.5);

        // When text overflow is active, use the partitioned text for the item page
        const effectiveTermsText = textOverflowPlan.hasTextOverflow
          ? (textOverflowPlan.itemPageText?.payment_terms || "")
          : (data.payment_terms || "");
        const effectiveNotesText = textOverflowPlan.hasTextOverflow
          ? (textOverflowPlan.itemPageText?.notes || "")
          : (data.notes || "");

        // If both are empty and overflow is active, nothing to show on item page
        if (textOverflowPlan.hasTextOverflow && !effectiveTermsText && !effectiveNotesText) {
          return null;
        }

        // Parse payment terms into separate lines/bullets
        const rawTerms = effectiveTermsText;
        const termsLines = rawTerms
          ? rawTerms
              .split(/\r?\n/)
              .map((t) => t.trim().replace(/^[-•*➢]\s*/, ""))
              .filter(Boolean)
          : [];

        const hasBulletedTerms =
          termsLines.length > 1 ||
          (termsLines.length === 1 && !/^\d+\s*days?$/i.test(termsLines[0]) && termsLines[0] !== "No additional remarks.");

        const isStandardInvoiceOrQuotation = [
          "quotation",
          "proforma_invoice",
          "tax_invoice",
          "purchase_order",
        ].includes(layout.documentType);

        if (layout.documentType === "customer_statement") {
          return (
            <div
              className={`w-full h-full leading-snug select-text flex flex-col justify-center items-center text-center ${termsPadding}`}
              style={{
                color: elem.color || "#0F172A",
                ...elementAppearance(elem),
                fontSize: `${termsPt}pt`,
              }}
            >
              {elem.customText ? (
                <div className="whitespace-pre-line leading-snug select-text font-medium" style={{ fontSize: `${termsPt}pt` }}>
                  {replaceTokens(elem.customText)}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="text-slate-800">
                    Your account balance is {fmtAED(data.total_amount)}. Please make your payment to cover the balance by the due date.
                  </div>
                  <div className="font-bold text-slate-900">
                    Make all checks payable to {brand.legal_name || brand.name}
                  </div>
                  <div className="font-extrabold text-[10pt] text-slate-900 pt-0.5">
                    Thank you for your business!
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            className={`w-full h-full leading-snug select-text ${termsPadding}`}
            style={{
              color: elem.color || colors.muted,
              ...elementAppearance(elem),
              fontSize: `${termsPt}pt`,
            }}
          >
            {elem.customText ? (
              <div className="whitespace-pre-line leading-snug select-text" style={{ fontSize: `${termsPt}pt` }}>
                {replaceTokens(elem.customText)}
              </div>
            ) : hasBulletedTerms && isStandardInvoiceOrQuotation ? (
              <div className="flex flex-col h-full justify-start text-left">
                {/* ➢ Payment Terms: (Bold, Underlined heading with arrow bullet matching reference) */}
                <div
                  className="font-bold flex items-center gap-1.5 mb-1"
                  style={{
                    color: colors.primary,
                    fontSize: `${Math.max(6.5, termsPt * 0.98)}pt`,
                    lineHeight: 1.2,
                  }}
                >
                  <span className="text-slate-800 text-[10px] leading-none select-none">➢</span>
                  <span className="underline underline-offset-2">Payment Terms:</span>
                </div>

                {/* Bulleted lines underneath */}
                <ul
                  className="space-y-0.5 pl-3 list-disc text-slate-800"
                  style={{
                    fontSize: `${termsPt * 0.95}pt`,
                    lineHeight: 1.3,
                  }}
                >
                  {termsLines.map((term, i) => (
                    <li key={i} className="pl-0.5">
                      {term}
                    </li>
                  ))}
                </ul>

                {/* Additional notes/remarks if any */}
                {effectiveNotesText && effectiveNotesText !== "No additional remarks." && (
                  <div
                    className="mt-1 pt-1 border-t border-slate-200 text-slate-600"
                    style={{ fontSize: `${Math.max(5.5, termsPt * 0.85)}pt` }}
                  >
                    <span className="font-semibold text-slate-700">Remarks: </span>
                    {effectiveNotesText}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="font-bold text-slate-800 mb-0.5" style={{ fontSize: `${Math.max(6, termsPt * 0.95)}pt` }}>
                  {layout.documentType === "delivery_note"
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
                    : "Terms & Remarks:"}
                </div>
                <div>{effectiveNotesText || "No additional remarks."}</div>
                {effectiveTermsText && <div className="mt-0.5 italic">{effectiveTermsText}</div>}
              </>
            )}
          </div>
        );
      }

      case "company_signature": {
        const sigSrc = elem.imageSrc || brand.assets.signature;
        const sigPt = resolvePt(elem.fontSize, 8);
        return (
          <div
            className="w-full h-full flex flex-col items-center justify-between text-center select-none overflow-hidden"
            style={{
              backgroundColor: elem.backgroundColor || "#FFFFFF",
              border: `${elem.borderWidth !== undefined ? elem.borderWidth : 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: `${elem.borderRadius !== undefined ? elem.borderRadius : 4}px`,
              padding: elem.padding !== undefined ? `${elem.padding}mm` : "2mm 2.5mm",
              opacity: elem.opacity ?? 1,
              boxSizing: "border-box",
              ...elementAppearance(elem),
            }}
          >
            <div className="font-bold uppercase tracking-wider text-slate-800" style={{ color: colors.primary, fontSize: `${sigPt}pt`, lineHeight: 1.2 }}>
              {elem.customText || "COMPANY AUTHORIZED SIGNATURE"}
            </div>
            {/* Real uploaded signature only without distortion */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden my-1 min-h-[14mm]">
              {sigSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sigSrc}
                  alt="Authorized Signature"
                  className="max-h-full max-w-full object-contain"
                  style={{ width: "auto", height: "auto" }}
                />
              ) : (
                <div className="w-28 border-b-2 border-slate-300" />
              )}
            </div>
            <div className="w-full border-t border-slate-300 pt-1 text-slate-700 font-semibold truncate" style={{ fontSize: `${Math.max(6, sigPt * 0.9)}pt`, lineHeight: 1.2 }}>
              For {brand.legal_name || brand.name}
            </div>
          </div>
        );
      }

      case "company_stamp": {
        const stampSrc = elem.imageSrc || brand.assets.stamp;
        const stampPt = resolvePt(elem.fontSize, 8);
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
              <div className="font-bold uppercase tracking-wider" style={{ color: colors.primary, fontSize: `${stampPt}pt` }}>
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
              <div className="w-full border-t border-slate-300 pt-0.5 text-slate-500" style={{ fontSize: `${Math.max(5.5, stampPt * 0.9)}pt` }}>
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
        const trnPt = resolvePt(elem.fontSize, 9);
        return (
          <div
            className="w-full h-full flex items-center select-text"
            style={{
              justifyContent:
                elem.textAlign === "center"
                  ? "center"
                  : elem.textAlign === "right"
                  ? "flex-end"
                  : "flex-start",
              fontSize: `${trnPt}pt`,
              color: elem.color || colors.primary,
              backgroundColor: elem.backgroundColor,
              border: elem.borderWidth ? `${elem.borderWidth}px solid ${elem.borderColor || colors.border}` : undefined,
              borderRadius: elem.borderRadius ? `${elem.borderRadius}px` : undefined,
              opacity: elem.opacity ?? 1,
              ...elementAppearance(elem),
            }}
          >
            {elem.customText ? (
              <span>{replaceTokens(elem.customText)}</span>
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
        const footerPt = resolvePt(elem.fontSize, 7.5);
        const hasCustom = Boolean(elem.customText && elem.customText.trim());
        const formattedCustomText = hasCustom ? replaceTokens(elem.customText!) : "";

        return (
          <div
            className="w-full h-full flex flex-col justify-center select-text px-3 overflow-hidden"
            style={{
              textAlign: elem.textAlign || "center",
              alignItems:
                elem.textAlign === "left"
                  ? "flex-start"
                  : elem.textAlign === "right"
                  ? "flex-end"
                  : "center",
              color: elem.color || colors.footerText || "#334155",
              fontSize: `${footerPt}pt`,
              fontWeight: elem.fontWeight === "bold" ? 700 : elem.fontWeight === "semibold" ? 600 : elem.fontWeight === "medium" ? 500 : 400,
              fontStyle: elem.fontStyle || "normal",
              fontFamily: elem.fontFamily || "inherit",
              letterSpacing: elem.letterSpacing !== undefined ? `${elem.letterSpacing}px` : undefined,
              lineHeight: elem.lineHeight ? elem.lineHeight : 1.3,
              backgroundColor: elem.backgroundColor || colors.footerBg || "#FFFFFF",
              border: `${elem.borderWidth !== undefined ? elem.borderWidth : 1}px solid ${elem.borderColor || colors.border}`,
              borderRadius: elem.borderRadius !== undefined ? `${elem.borderRadius}px` : "4px",
              opacity: elem.opacity ?? 1,
              padding: elem.padding !== undefined ? `${elem.padding}mm` : "2mm 3mm",
              boxSizing: "border-box",
              ...elementAppearance(elem),
            }}
          >
            {hasCustom ? (
              layout.documentType === "customer_statement" && formattedCustomText.includes("\n") ? (
                <div className="w-full flex flex-col items-center justify-center space-y-0.5 text-center select-text">
                  {formattedCustomText.split("\n").map((line, idx) => (
                    idx === 0 ? (
                      <div key={idx} className="w-full py-0.5 border-t border-b border-slate-300 font-medium text-slate-800" style={{ fontSize: `${footerPt}pt` }}>
                        {line}
                      </div>
                    ) : (
                      <div key={idx} className="w-full text-slate-600 leading-tight" style={{ fontSize: `${footerPt}pt` }}>
                        {line}
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <div className="w-full leading-normal" style={{ whiteSpace: "pre-wrap" }}>
                  {formattedCustomText}
                </div>
              )
            ) : (
              <>
                <div className="w-full font-medium text-slate-800 leading-snug truncate" style={{ fontSize: `${footerPt}pt` }}>
                  <span>{brand.legal_name || brand.name}</span>
                  {brand.phone && <span> &bull; Tel: {brand.phone}</span>}
                  {brand.email && <span> &bull; Email: {brand.email}</span>}
                  {brand.website && <span> &bull; Web: {brand.website}</span>}
                </div>
                <div className="text-slate-600 mt-0.5 leading-snug font-normal" style={{ fontSize: `${Math.max(5.5, footerPt * 0.9)}pt` }}>
                  {usesVat
                    ? "This is a computer generated document issued in accordance with UAE VAT regulations."
                    : "This is a computer generated business document and does not require a physical signature unless stated."}
                </div>
              </>
            )}
            {resolvedTotalPages > 1 && !formattedCustomText.includes("{page_number}") && (
              <div className="mt-0.5 font-mono text-slate-500 text-center" style={{ fontSize: `${Math.max(5.5, footerPt * 0.85)}pt` }}>
                Page {pageNumber} of {resolvedTotalPages}
              </div>
            )}
          </div>
        );
      }

      case "custom_text": {
        const textPt = resolvePt(elem.fontSize, 11);
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
              fontSize: `${textPt}pt`,
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
            {elem.customText ? replaceTokens(elem.customText) : "Custom Text Element"}
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

  // =========================================================================
  // TEXT CONTINUATION PAGE RENDERING
  // If this is a text overflow continuation page, render a simplified layout
  // with the text chunks and optionally signatures/footer.
  // =========================================================================
  if (isTextContinuationPage && textContinuationPageInfo) {
    const pageW = layout.page.widthMm;
    const pageH = layout.page.heightMm;
    const topMrg = layout.page?.margins?.top || 10;
    const leftMrg = layout.page?.margins?.left || 12;
    const rightMrg = layout.page?.margins?.right || 12;
    const bottomMrg = layout.page?.margins?.bottom || 8;
    const contentW = pageW - leftMrg - rightMrg;
    // Footer element for position reference
    const footerEl = layout.elements.find((el) => el.visible && el.type === 'footer');
    const footerY = footerEl ? footerEl.y : pageH - bottomMrg - 14;
    const footerH = footerEl ? footerEl.height : 7;
    // Signature elements for reference
    const sigEl = layout.elements.find((el) => el.visible && el.type === 'company_signature');
    const stampEl = layout.elements.find((el) => el.visible && el.type === 'company_stamp');
    // Signature area: above footer
    const sigAreaBottom = footerY - 2;
    const sigH = sigEl ? sigEl.height : 24;
    const sigAreaTop = sigAreaBottom - sigH;
    // Content area: below title bar, above signature (or footer)
    const textAreaTop = topMrg + 10;
    const textAreaBottom = textContinuationPageInfo.showSignatures ? sigAreaTop - 4 : footerY - 4;
    const termsPt = 8.5;

    return (
      <div
        data-orientation={layout.page.orientation || "portrait"}
        data-print-mode={printSettings.colorMode}
        data-print-contrast={printSettings.borderContrast}
        data-continuation-page={textContinuationPageInfo.pageNumber}
        data-document-filename={autoPdfFilename}
        data-document-title={autoPdfTitle}
        className={`dynamic-document-page print-a4-sheet relative box-border select-none overflow-hidden bg-white shadow-2xl transition-all`}
        style={{
          width: `${pageW}mm`,
          minHeight: `${pageH}mm`,
          height: `${pageH}mm`,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top center",
          backgroundColor: layout.page.background || "#FFFFFF",
          color: colors.text || "#334155",
          ["--doc-primary" as string]: colors.primary,
          ["--doc-accent" as string]: colors.accent,
          ["--doc-text" as string]: colors.text,
          ["--doc-muted" as string]: colors.muted,
          ["--doc-border" as string]: colors.border,
        }}
      >
        {/* Page Borders */}
        <PageDecorativeBorders
          layout={layout}
          isDesignerPreview={false}
          elements={effectiveGeometry.elements}
        />

        {/* Continuation Header Bar */}
        <div
          className="absolute flex items-center justify-between px-3"
          style={{
            left: `${leftMrg}mm`,
            top: `${topMrg}mm`,
            width: `${contentW}mm`,
            height: "9mm",
            backgroundColor: colors.titleBg,
            borderRadius: "2px",
            color: colors.titleText,
          }}
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider truncate" style={{ fontSize: "8.5pt" }}>
            <span>{brand.legal_name || brand.name}</span>
            <span className="opacity-60">&bull;</span>
            <span>{data.title || (DOCUMENT_TYPE_OPTIONS.find((d) => d.id === layout.documentType)?.defaultTitle || "DOCUMENT")}</span>
          </div>
          <div className="text-right font-mono font-bold shrink-0" style={{ fontSize: "7.5pt", color: colors.titleText }}>
            REF: {data.document_number} &bull; Page {textContinuationPageInfo.pageNumber} of {textOverflowPlan.totalDocumentPages}
          </div>
        </div>

        {/* Text Content Area */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${leftMrg}mm`,
            top: `${textAreaTop}mm`,
            width: `${contentW}mm`,
            height: `${Math.max(10, textAreaBottom - textAreaTop)}mm`,
            fontSize: `${termsPt}pt`,
            lineHeight: 1.45,
            color: colors.muted,
          }}
        >
          {textContinuationPageInfo.sections.map((section) => (
            <div key={section.elementId} className="mb-2">
              <div
                className="font-bold mb-1"
                style={{ color: colors.primary, fontSize: `${termsPt * 0.95}pt` }}
              >
                {section.label}
              </div>
              {section.textChunks.map((chunk, ci) => (
                <div key={ci} className="whitespace-pre-line leading-snug text-slate-700" style={{ fontSize: `${termsPt}pt` }}>
                  {chunk}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Signatures on last continuation page */}
        {textContinuationPageInfo.showSignatures && (
          <>
            {/* Company Signature */}
            {sigEl && (
              <div
                className="absolute flex flex-col items-center justify-between text-center select-none overflow-hidden"
                style={{
                  left: `${sigEl.x}mm`,
                  top: `${sigAreaTop}mm`,
                  width: `${sigEl.width}mm`,
                  height: `${sigH}mm`,
                  backgroundColor: sigEl.backgroundColor || "#FFFFFF",
                  border: `1px solid ${sigEl.borderColor || colors.border}`,
                  borderRadius: `${sigEl.borderRadius ?? 4}px`,
                  padding: sigEl.padding !== undefined ? `${sigEl.padding}mm` : "2mm 2.5mm",
                  boxSizing: "border-box",
                }}
              >
                <div className="font-bold uppercase tracking-wider text-slate-800" style={{ color: colors.primary, fontSize: "8pt", lineHeight: 1.2 }}>
                  {sigEl.customText || "COMPANY AUTHORIZED SIGNATURE"}
                </div>
                <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden my-1 min-h-[14mm]">
                  {brand.assets.signature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.assets.signature} alt="Authorized Signature" className="max-h-full max-w-full object-contain" style={{ width: "auto", height: "auto" }} />
                  ) : (
                    <div className="w-28 border-b-2 border-slate-300" />
                  )}
                </div>
                <div className="w-full border-t border-slate-300 pt-1 text-slate-700 font-semibold truncate" style={{ fontSize: "7pt", lineHeight: 1.2 }}>
                  For {brand.legal_name || brand.name}
                </div>
              </div>
            )}

            {/* Company Stamp */}
            {stampEl && (
              <div
                className="absolute flex flex-col items-center justify-between text-center select-none overflow-hidden p-1.5"
                style={{
                  left: `${stampEl.x}mm`,
                  top: `${sigAreaTop}mm`,
                  width: `${stampEl.width}mm`,
                  height: `${sigH}mm`,
                  backgroundColor: stampEl.backgroundColor,
                  border: stampEl.borderWidth ? `${stampEl.borderWidth}px solid ${stampEl.borderColor || colors.border}` : undefined,
                  borderRadius: stampEl.borderRadius ? `${stampEl.borderRadius}px` : undefined,
                  opacity: stampEl.opacity ?? 1,
                }}
              >
                {stampEl.customText && (
                  <div className="font-bold uppercase tracking-wider" style={{ color: colors.primary, fontSize: "8pt" }}>
                    {stampEl.customText}
                  </div>
                )}
                <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
                  {brand.assets.stamp ? (
                    <Image
                      src={brand.assets.stamp}
                      alt="Official Company Stamp"
                      width={80}
                      height={80}
                      className="max-h-full max-w-full"
                      style={{ width: "auto", height: "auto", objectFit: stampEl.imageFit || "contain" }}
                      unoptimized
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-[8px] text-slate-400 text-center p-1">
                      Official Stamp
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {footerEl && (
          <div
            className="absolute flex items-center px-2"
            style={{
              left: `${footerEl.x}mm`,
              top: `${footerY}mm`,
              width: `${footerEl.width}mm`,
              height: `${footerH}mm`,
              backgroundColor: footerEl.backgroundColor,
              borderTop: `${footerEl.borderWidth || 1}px solid ${footerEl.borderColor || colors.border}`,
              color: footerEl.color || colors.footerText,
              fontSize: `${footerEl.fontSize || 7}pt`,
              opacity: footerEl.opacity ?? 1,
            }}
          >
            <span className="flex-1 text-left truncate">{footerEl.customText ? replaceTokens(footerEl.customText) : (brand.legal_name || brand.name)}</span>
            <span className="text-right" style={{ fontSize: "6.5pt" }}>Page {textContinuationPageInfo.pageNumber} of {textOverflowPlan.totalDocumentPages}</span>
          </div>
        )}
      </div>
    );
  }

  // A4 dimensions: 210mm x 297mm (or 297mm x 210mm in landscape)
  return (
    <div
      data-orientation={layout.page.orientation || "portrait"}
      data-print-mode={printSettings.colorMode}
      data-print-contrast={printSettings.borderContrast}
      data-document-filename={autoPdfFilename}
      data-document-title={autoPdfTitle}
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
      {/* Dynamic Document Elements */}
      {/* Render all visible layout elements with dynamic flow-aware geometry */}
      {effectiveGeometry.elements
        .filter((elem) => {
          if (!elem.visible || elem.effectiveVisible === false) return false;
          return true;
        })
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((elem) => {
          const isManual = (layout.layoutMode || "manual") === "manual";
          const posX = (isDesignerPreview || isManual) ? elem.x : (elem.effectiveX ?? elem.x);
          const posY = (isDesignerPreview || isManual)
            ? (elem.isFollower && elem.effectiveY !== undefined ? elem.effectiveY : elem.y)
            : (elem.effectiveY ?? elem.y);
          const width = (isDesignerPreview || isManual) ? elem.width : (elem.effectiveWidth ?? elem.width);
          const height = (isDesignerPreview || isManual) ? elem.height : (elem.effectiveHeight ?? elem.height);

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
