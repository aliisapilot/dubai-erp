import { supabase } from "./supabase";
import type { DocumentTypeId } from "./documentDesigner";

export type DocSeparator = "-" | "/" | " " | "";
export type YearFormat = "YYYY" | "YY";
export type YearPosition = "after_prefix" | "after_sequence";

export interface DocNumberingConfig {
  docType: DocumentTypeId;
  customTitle: string;
  customTitleAr?: string;
  prefix: string;
  includeYear: boolean;
  yearFormat: YearFormat;
  yearPosition: YearPosition;
  separator: DocSeparator;
  padding: number; // 3, 4, 5, 6 (1 to 8)
  nextSequence?: number;
}

/** Standard default numbering and title configurations for each document type */
export const DEFAULT_NUMBERING_CONFIGS: Record<DocumentTypeId, DocNumberingConfig> = {
  tax_invoice: {
    docType: "tax_invoice",
    customTitle: "TAX INVOICE",
    customTitleAr: "فاتورة ضريبية",
    prefix: "INV",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  quotation: {
    docType: "quotation",
    customTitle: "QUOTATION",
    customTitleAr: "عرض أسعار",
    prefix: "QUO",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  proforma_invoice: {
    docType: "proforma_invoice",
    customTitle: "PROFORMA INVOICE",
    customTitleAr: "فاتورة شكلية",
    prefix: "PRO",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  delivery_note: {
    docType: "delivery_note",
    customTitle: "DELIVERY NOTE",
    customTitleAr: "إذن تسليم",
    prefix: "DN",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  purchase_order: {
    docType: "purchase_order",
    customTitle: "PURCHASE ORDER",
    customTitleAr: "أمر شراء",
    prefix: "PO",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  receipt_voucher: {
    docType: "receipt_voucher",
    customTitle: "RECEIPT VOUCHER",
    customTitleAr: "سند قبض",
    prefix: "RCV",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  customer_statement: {
    docType: "customer_statement",
    customTitle: "STATEMENT OF ACCOUNT",
    customTitleAr: "كشف حساب",
    prefix: "SOA",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  supplier_bill: {
    docType: "supplier_bill",
    customTitle: "SUPPLIER BILL",
    customTitleAr: "فاتورة مورد",
    prefix: "BILL",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  salary_statement: {
    docType: "salary_statement",
    customTitle: "SALARY STATEMENT",
    customTitleAr: "كشف رواتب",
    prefix: "SLIP",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  project_handover: {
    docType: "project_handover",
    customTitle: "PROJECT HANDOVER CERTIFICATE",
    customTitleAr: "محضر تسليم مشروع",
    prefix: "HO",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  work_method_statement: {
    docType: "work_method_statement",
    customTitle: "WORK METHOD STATEMENT",
    customTitleAr: "بيان طريقة العمل",
    prefix: "WMS",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  employee_payment_voucher: {
    docType: "employee_payment_voucher",
    customTitle: "PAYMENT VOUCHER",
    customTitleAr: "سند صرف",
    prefix: "EPV",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
  measurement_sheet: {
    docType: "measurement_sheet",
    customTitle: "MEASUREMENT & TAKEOFF SHEET",
    customTitleAr: "جدول حصر الكميات والمقاسات",
    prefix: "MS",
    includeYear: true,
    yearFormat: "YYYY",
    yearPosition: "after_prefix",
    separator: "-",
    padding: 4,
    nextSequence: 1,
  },
};

/** Mapping between common legacy prefixes and document types */
export const PREFIX_TO_DOC_TYPE: Record<string, DocumentTypeId> = {
  QUO: "quotation",
  QTN: "quotation",
  QT: "quotation",
  INV: "tax_invoice",
  TAX: "tax_invoice",
  PRO: "proforma_invoice",
  PI: "proforma_invoice",
  DN: "delivery_note",
  DLV: "delivery_note",
  PO: "purchase_order",
  RCV: "receipt_voucher",
  BILL: "supplier_bill",
  HO: "project_handover",
  WMS: "work_method_statement",
  EPV: "employee_payment_voucher",
  MS: "measurement_sheet",
  SOA: "customer_statement",
  SLIP: "salary_statement",
};

/** Mapping from document types to their database table and reference column */
export const DOC_TYPE_DB_INFO: Record<
  DocumentTypeId,
  { table: string; column: string; label: string }
> = {
  tax_invoice: { table: "tax_invoices", column: "invoice_number", label: "Tax Invoice" },
  quotation: { table: "quotations", column: "quotation_number", label: "Quotation" },
  proforma_invoice: { table: "proforma_invoices", column: "invoice_number", label: "Proforma Invoice" },
  delivery_note: { table: "delivery_notes", column: "delivery_note_number", label: "Delivery Note" },
  purchase_order: { table: "purchase_orders", column: "po_number", label: "Purchase Order" },
  receipt_voucher: { table: "receipt_vouchers", column: "voucher_number", label: "Receipt Voucher" },
  customer_statement: { table: "", column: "", label: "Statement of Account" },
  supplier_bill: { table: "supplier_bills", column: "bill_number", label: "Supplier Bill" },
  salary_statement: { table: "", column: "", label: "Salary Statement" },
  project_handover: { table: "projects", column: "handover_number", label: "Project Handover" },
  work_method_statement: { table: "projects", column: "wms_number", label: "Work Method Statement" },
  employee_payment_voucher: { table: "petty_cash_transactions", column: "voucher_number", label: "Payment Voucher" },
  measurement_sheet: { table: "measurement_projects", column: "sheet_number", label: "Measurement Sheet" },
};

/**
 * Pure function to format a document reference number based on configuration,
 * sequence number, and target date.
 */
export function formatDocNumber(
  config: Partial<DocNumberingConfig>,
  sequenceNumber: number,
  targetDate: Date = new Date()
): string {
  const padding = Math.max(1, Math.min(8, Number(config.padding) || 4));
  const seqPadded =
    sequenceNumber <= Math.pow(10, padding) - 1
      ? String(sequenceNumber).padStart(padding, "0")
      : String(sequenceNumber);

  const prefix = (config.prefix ?? "").trim();
  const includeYear = config.includeYear ?? true;
  const yearFormat = config.yearFormat ?? "YYYY";
  const yearPos = config.yearPosition ?? "after_prefix";
  const separator = config.separator !== undefined ? config.separator : "-";

  const fullYear = targetDate.getFullYear();
  const yearStr = includeYear
    ? yearFormat === "YY"
      ? String(fullYear).slice(-2)
      : String(fullYear)
    : "";

  const parts: string[] = [];

  if (prefix) {
    parts.push(prefix);
  }

  if (includeYear && yearPos === "after_prefix") {
    parts.push(yearStr);
  }

  parts.push(seqPadded);

  if (includeYear && yearPos === "after_sequence") {
    parts.push(yearStr);
  }

  // If no prefix and no year, parts only has [seqPadded]
  return parts.join(separator);
}

/**
 * Validates a document numbering configuration.
 */
export function validateDocNumberingConfig(
  config: Partial<DocNumberingConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.prefix && !/^[A-Za-z0-9_-]+$/.test(config.prefix.trim())) {
    errors.push("Prefix can only contain letters, numbers, hyphens, and underscores.");
  }

  if (config.padding !== undefined) {
    const pad = Number(config.padding);
    if (!Number.isInteger(pad) || pad < 1 || pad > 8) {
      errors.push("Number padding must be an integer between 1 and 8 digits.");
    }
  }

  if (config.nextSequence !== undefined) {
    const seq = Number(config.nextSequence);
    if (!Number.isInteger(seq) || seq < 1) {
      errors.push("Starting / next sequence number must be a positive integer (at least 1).");
    }
  }

  if (
    config.separator !== undefined &&
    !["-", "/", " ", ""].includes(config.separator)
  ) {
    errors.push("Separator must be a hyphen (-), slash (/), space ( ), or none.");
  }

  return { valid: errors.length === 0, errors };
}

/** Local storage cache key helper */
function getStorageKey(companyId: string, docType: DocumentTypeId): string {
  return `dubai-erp.doc-numbering.${companyId}.${docType}`;
}

/**
 * Loads the effective numbering configuration for a company and document type.
 * Reads from localStorage cache and falls back to system defaults.
 */
export function getCachedDocNumberingConfig(
  companyId: string,
  docType: DocumentTypeId
): DocNumberingConfig {
  const defaultCfg = DEFAULT_NUMBERING_CONFIGS[docType] || DEFAULT_NUMBERING_CONFIGS.quotation;
  if (typeof window === "undefined") {
    return { ...defaultCfg };
  }

  try {
    const keysToCheck = [
      companyId ? getStorageKey(companyId, docType) : null,
      getStorageKey("anonymous", docType),
      `dubai-erp.doc-numbering.${docType}`,
    ].filter(Boolean) as string[];

    for (const key of keysToCheck) {
      const cached = window.localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...defaultCfg,
          ...parsed,
          docType,
        };
      }
    }

    // Also check if stored in document design layout cache
    if (companyId) {
      const designKey = `dubai-erp.design-cache.${companyId}.${docType}`;
      const designRaw = window.localStorage.getItem(designKey);
      if (designRaw) {
        const parsedLayout = JSON.parse(designRaw);
        if (parsedLayout?.numberingConfig) {
          return {
            ...defaultCfg,
            ...parsedLayout.numberingConfig,
            docType,
          };
        }
      }
    }
  } catch {}

  return { ...defaultCfg };
}

/**
 * Persists the document numbering configuration for a company and document type.
 */
export async function saveDocNumberingConfig(
  companyId: string,
  docType: DocumentTypeId,
  config: DocNumberingConfig
): Promise<{ success: boolean; error?: string }> {
  const validation = validateDocNumberingConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(" ") };
  }

  // 1. Save to local storage cache immediately (company, anonymous, and global keys)
  if (typeof window !== "undefined") {
    try {
      if (companyId) {
        window.localStorage.setItem(
          getStorageKey(companyId, docType),
          JSON.stringify(config)
        );
      }
      window.localStorage.setItem(
        getStorageKey("anonymous", docType),
        JSON.stringify(config)
      );
      window.localStorage.setItem(
        `dubai-erp.doc-numbering.${docType}`,
        JSON.stringify(config)
      );
      // Dispatch custom event for same-page listeners
      window.dispatchEvent(
        new CustomEvent("dubai-erp:numbering-changed", {
          detail: { companyId, docType, config },
        })
      );
    } catch (e: unknown) {
      console.warn("Could not cache numbering config:", e);
    }
  }

  // 2. Try to persist to Supabase if custom table exists, or into document design layout
  try {
    const { error: upsertErr } = await supabase
      .from("document_numbering_configs")
      .upsert({
        company_id: companyId,
        document_type: docType,
        custom_title: config.customTitle,
        custom_title_ar: config.customTitleAr || null,
        prefix: config.prefix,
        include_year: config.includeYear,
        year_format: config.yearFormat,
        year_position: config.yearPosition,
        separator: config.separator,
        padding: config.padding,
        next_sequence: config.nextSequence || 1,
        updated_at: new Date().toISOString(),
      });

    // If the table doesn't exist yet (migration not applied), error is handled gracefully
    if (upsertErr && !upsertErr.message.includes("does not exist") && !upsertErr.message.includes("42P01")) {
      console.warn("DB numbering config notice:", upsertErr.message);
    }
  } catch {}

  return { success: true };
}

/**
 * Atomically generates the next document reference number.
 * Uses atomic Supabase RPC row-locking and verifies collision-free uniqueness.
 */
export async function generateNextDocumentNumber(
  companyId: string,
  prefixOrDocType: string
): Promise<string> {
  const cleanInput = (prefixOrDocType || "").trim().toUpperCase();
  const docType: DocumentTypeId =
    PREFIX_TO_DOC_TYPE[cleanInput] ||
    (Object.keys(DEFAULT_NUMBERING_CONFIGS).includes(prefixOrDocType as DocumentTypeId)
      ? (prefixOrDocType as DocumentTypeId)
      : "quotation");

  // Load custom format
  const config = getCachedDocNumberingConfig(companyId, docType);

  // Counter key prefix (use config.prefix if set, else document type code)
  const counterPrefix = config.prefix || cleanInput || "DOC";

  // Use the atomic database RPC function to acquire next sequence number
  const { data: rawRpcVal, error: rpcErr } = await supabase.rpc("next_doc_number", {
    p_company_id: companyId,
    p_prefix: counterPrefix,
  });

  if (rpcErr) {
    throw new Error(`Could not generate next number for ${docType}: ${rpcErr.message}`);
  }

  // Extract the atomic sequence number from the RPC result (format: PREFIX-YYYY-XXXX)
  let seqNumber = 1;
  const match = String(rawRpcVal).match(/-(\d+)$/);
  if (match) {
    seqNumber = parseInt(match[1], 10);
  }

  // Honor minimum sequence if configured
  if (config.nextSequence && config.nextSequence > seqNumber) {
    seqNumber = config.nextSequence;
  }

  // Format candidate document number
  let candidateNumber = formatDocNumber(config, seqNumber);

  // Collision check against database table if applicable
  const dbInfo = DOC_TYPE_DB_INFO[docType];
  if (dbInfo && dbInfo.table && dbInfo.column) {
    let attempts = 0;
    while (attempts < 50) {
      const { data: existing, error: checkErr } = await supabase
        .from(dbInfo.table)
        .select("id")
        .eq("company_id", companyId)
        .eq(dbInfo.column, candidateNumber)
        .limit(1);

      if (!checkErr && existing && existing.length > 0) {
        // Collision with historical document, advance sequence safely
        seqNumber += 1;
        candidateNumber = formatDocNumber(config, seqNumber);
        attempts += 1;
      } else {
        break;
      }
    }
  }

  return candidateNumber;
}

/**
 * Checks if a reference number is available (not taken by another document of the same type).
 */
export async function checkDocumentReferenceAvailable(
  companyId: string,
  docType: DocumentTypeId,
  referenceNumber: string,
  excludeId?: string
): Promise<{ available: boolean; conflictReason?: string }> {
  const trimmed = referenceNumber.trim();
  if (!trimmed) {
    return { available: false, conflictReason: "Document reference number cannot be empty." };
  }

  const dbInfo = DOC_TYPE_DB_INFO[docType];
  if (!dbInfo || !dbInfo.table || !dbInfo.column) {
    return { available: true };
  }

  let query = supabase
    .from(dbInfo.table)
    .select("id")
    .eq("company_id", companyId)
    .eq(dbInfo.column, trimmed);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    return { available: true }; // allow proceeding if query cannot be fulfilled
  }

  if (data && data.length > 0) {
    return {
      available: false,
      conflictReason: `Reference number "${trimmed}" is already assigned to an existing ${dbInfo.label}.`,
    };
  }

  return { available: true };
}

/**
 * Safely updates an existing document's visible reference number.
 * Ensures uniqueness and preserves all other record data and relationships.
 */
export async function renameDocumentReference(
  companyId: string,
  docType: DocumentTypeId,
  documentId: string,
  newReferenceNumber: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = newReferenceNumber.trim();
  if (!trimmed) {
    return { success: false, error: "New reference number cannot be empty." };
  }

  const availability = await checkDocumentReferenceAvailable(
    companyId,
    docType,
    trimmed,
    documentId
  );

  if (!availability.available) {
    return { success: false, error: availability.conflictReason };
  }

  const dbInfo = DOC_TYPE_DB_INFO[docType];
  if (!dbInfo || !dbInfo.table || !dbInfo.column) {
    return { success: false, error: `Document type "${docType}" does not support renaming.` };
  }

  const { error: updateErr } = await supabase
    .from(dbInfo.table)
    .update({
      [dbInfo.column]: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("company_id", companyId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}
