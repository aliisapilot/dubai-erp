/**
 * Dubai ERP — Customer Statements (SOA) Document Manager Utilities
 *
 * Handles:
 * - Customer name normalization & fuzzy matching (LLC / L.L.C., punctuation, spacing)
 * - Duplicate detection (checksum, customer + SOA number, customer + filename)
 * - Metadata extraction/serialization for `document_attachments`
 * - Standardized PDF export filename generation via `documentFilename.ts`
 * - File validation for bulk SOA imports (PDF, XLSX, XLS, CSV, ZIP)
 */

import { generateDocumentPdfFilename } from "./documentFilename";
import type { RawHistoricalEntry } from "./customerStatementEngine";
import * as XLSX from "xlsx";

export interface CustomerCandidate {
  id: string;
  name: string;
  customer_code?: string | null;
  trn?: string | null;
}

export interface CustomerMatchOutcome {
  matchedCustomerId: string;
  matchedCustomerName: string;
  confidence: number;
  needsReview: boolean;
  reason: string;
  suggestions: Array<{ id: string; name: string; score: number }>;
}

export interface SoaAuditEntry {
  timestamp: string;
  user?: string;
  action: "create" | "edit" | "delete" | "cutover_approved";
  entryId?: string;
  original?: Partial<RawHistoricalEntry> | Record<string, unknown>;
  updated?: Partial<RawHistoricalEntry> | Record<string, unknown>;
  reason?: string;
}

export interface SoaRecordMetadata {
  soaNumber: string;
  statementDate: string;
  fromDate?: string | null;
  toDate?: string | null;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance?: number | null;
  checksumSha256?: string;
  needsReview?: boolean;
  isScannedPdf?: boolean;
  isVerified?: boolean;
  status?: "verified" | "pending_verification" | "rejected";
  storagePath?: string;
  storageBucket?: string;
  cutoverDate?: string | null;
  isCutoverApproved?: boolean;
  cutoverApprovedBy?: string | null;
  cutoverApprovedAt?: string | null;
  entries?: RawHistoricalEntry[];
  auditTrail?: SoaAuditEntry[];
}

export interface StoredSoaRecord {
  id: string;
  company_id: string;
  customer_id: string;
  customer_name: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  created_at: string;
  soa_number: string;
  statement_date: string;
  from_date?: string | null;
  to_date?: string | null;
  opening_balance: number;
  charges: number;
  credits: number;
  closing_balance: number | null;
  checksum_sha256: string | null;
  needs_review: boolean;
  is_scanned_pdf: boolean;
  is_verified: boolean;
  isVerified: boolean;
  status: "verified" | "pending_verification" | "rejected";
  storage_path: string | null;
  storage_bucket: string;
  cutover_date?: string | null;
  is_cutover_approved?: boolean;
  cutover_approved_by?: string | null;
  cutover_approved_at?: string | null;
  entries: RawHistoricalEntry[];
  audit_trail: SoaAuditEntry[];
}

export const SUPPORTED_SOA_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "zip"] as const;
export const MAX_SOA_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Normalizes a company/customer name for reliable matching across
 * capitalization, punctuation, spacing, and UAE legal suffixes (LLC, L.L.C., FZE, FZC, etc.).
 */
export function normalizeCustomerName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/l\.?\s*l\.?\s*c\.?[- ]?f\.?\s*z\.?/gi, " ")
    .replace(/l\.?\s*l\.?\s*c\.?/gi, " ")
    .replace(/f\.?\s*z\.?\s*[ec]?\.?/gi, " ")
    .replace(/s\.?\s*p\.?\s*c?\.?/gi, " ")
    .replace(/\b(co|company|est|establishment|trading|general\s*trading|ltd|limited|inc|corp)\b/gi, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"&““”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedSoaFilename {
  soaNumber: string;
  customerName: string;
  statementDate?: string | null;
}

/**
 * Extracts SOA Number (e.g. 'SOA101-26') and customer name (e.g. 'Al Karwan Solution FZC')
 * from systematic filenames like 'SOA101-26 Al Karwan Solution FZC.pdf'.
 */
export function parseSoaFilename(fileName: string): ParsedSoaFilename {
  const base = (fileName || "").split(/[/\\]/).pop() || fileName;
  const noExt = base.replace(/\.[a-zA-Z0-9]+$/, "").trim();

  let soaNumber = "";
  let customerName = "";
  let statementDate: string | null = null;

  const isDateToken = (tok: string): boolean => {
    return /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.\s][A-Za-z]{3,9}[-/.\s]\d{2,4})$/.test(tok.trim());
  };

  const tryNormalizeDate = (tok: string): string | null => {
    const trimmed = tok.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dmy = trimmed.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    const dMmmY = trimmed.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$/);
    if (dMmmY) {
      const months: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
      };
      const m = months[dMmmY[2].slice(0, 3).toLowerCase()];
      let y = dMmmY[3];
      if (y.length === 2) y = `20${y}`;
      if (m) return `${y}-${m}-${dMmmY[1].padStart(2, "0")}`;
    }
    return trimmed;
  };

  // Check for SOA prefix like 'SOA101-26 Al Karwan Solution FZC' or 'SOA 101-26 Customer' or 'SOA-001 - Customer - 31-Oct-2026'
  const prefixMatch = noExt.match(/^(SOA\s*[-_]?[0-9A-Za-z-_]+)\s+(.+)$/i);
  if (prefixMatch) {
    soaNumber = prefixMatch[1].trim();
    const rest = prefixMatch[2].replace(/^[-–—\s]+/, "").trim();
    if (rest.includes(" - ")) {
      const parts = rest.split(/\s+-\s+/);
      customerName = parts[0].trim();
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1].trim();
        if (isDateToken(lastPart)) {
          statementDate = tryNormalizeDate(lastPart);
        }
      }
    } else {
      customerName = rest;
    }
  } else if (noExt.includes(" - ")) {
    const parts = noExt.split(/\s+-\s+/);
    if (parts.length >= 3) {
      if (/statement/i.test(parts[0])) {
        if (/^SOA/i.test(parts[2])) {
          soaNumber = parts[2].trim();
          customerName = parts[1].trim();
        } else if (isDateToken(parts[2])) {
          customerName = parts[1].trim();
          statementDate = tryNormalizeDate(parts[2]);
        } else {
          customerName = parts[1].trim();
        }
      } else if (/^SOA/i.test(parts[0])) {
        soaNumber = parts[0].trim();
        customerName = parts[1].trim();
        if (isDateToken(parts[2])) {
          statementDate = tryNormalizeDate(parts[2]);
        }
      } else {
        customerName = parts[0].trim();
      }
    } else {
      if (/^SOA/i.test(parts[0])) {
        soaNumber = parts[0].trim();
        customerName = parts[1].trim();
      } else if (/^SOA/i.test(parts[1])) {
        soaNumber = parts[1].trim();
        customerName = parts[0].trim();
      } else if (parts[0].toLowerCase().includes("statement")) {
        customerName = parts[1].trim();
      } else {
        customerName = parts[0].trim();
      }
    }
  } else {
    const underscoreMatch = noExt.match(/^(SOA_\d+_\d+)_(.+)$/i);
    if (underscoreMatch) {
      soaNumber = underscoreMatch[1].replace(/_/g, "-");
      customerName = underscoreMatch[2].replace(/_/g, " ").trim();
    } else if (/^SOA[-_]?[0-9A-Za-z-_]+$/i.test(noExt) && !noExt.includes(" ")) {
      soaNumber = noExt;
    } else {
      // Find embedded SOA number
      const embedded = noExt.match(/\b(SOA[-_\s]?[0-9A-Za-z-_]+)\b/i);
      if (embedded) {
        soaNumber = embedded[1].trim();
        customerName = noExt.replace(embedded[0], "").replace(/[-_]/g, " ").trim();
      } else {
        customerName = noExt.replace(/[-_]/g, " ").trim();
      }
    }
  }

  // Clean customerName from common non-customer prefixes and leading/trailing dashes/spaces
  customerName = customerName
    .replace(/^(?:statement\s*of\s*account|customer\s*statement|soa)\s*[-:]?\s*/i, "")
    .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
    .trim();

  return { soaNumber, customerName, statementDate };
}

export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const matrix: number[][] = Array.from({ length: s2.length + 1 }, () =>
    Array<number>(s1.length + 1).fill(0)
  );
  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  const dist = matrix[s2.length][s1.length];
  return 1 - dist / Math.max(s1.length, s2.length);
}

/**
 * Matches an extracted customer name against existing customers without silently
 * attaching low-confidence matches to the wrong customer.
 */
export function matchCustomerCandidates(
  extractedName: string | null | undefined,
  customers: CustomerCandidate[]
): CustomerMatchOutcome {
  const raw = (extractedName || "").trim();
  if (!raw) {
    return {
      matchedCustomerId: "",
      matchedCustomerName: "",
      confidence: 0,
      needsReview: true,
      reason: "Customer name could not be detected.",
      suggestions: [],
    };
  }

  // 1. Exact case-insensitive match
  const exact = customers.find(
    (c) => c.name.trim().toLowerCase() === raw.toLowerCase()
  );
  if (exact) {
    return {
      matchedCustomerId: exact.id,
      matchedCustomerName: exact.name,
      confidence: 1,
      needsReview: false,
      reason: "Exact customer match",
      suggestions: [{ id: exact.id, name: exact.name, score: 1 }],
    };
  }

  // 2. Normalized match (ignoring LLC / L.L.C., punctuation, spacing)
  const normInput = normalizeCustomerName(raw);
  if (normInput.length >= 3) {
    const normExact = customers.find((c) => normalizeCustomerName(c.name) === normInput);
    if (normExact) {
      return {
        matchedCustomerId: normExact.id,
        matchedCustomerName: normExact.name,
        confidence: 0.96,
        needsReview: false,
        reason: "Normalized match (legal suffix / punctuation / spacing)",
        suggestions: [{ id: normExact.id, name: normExact.name, score: 0.96 }],
      };
    }
  }

  // 3. Fuzzy / partial similarity scoring
  const scored = customers
    .map((c) => {
      const nc = normalizeCustomerName(c.name);
      let score = levenshteinSimilarity(normInput || raw.toLowerCase(), nc || c.name.toLowerCase());
      if (normInput.length >= 4 && nc.length >= 4 && (nc.includes(normInput) || normInput.includes(nc))) {
        score = Math.max(score, 0.85);
      }
      return { id: c.id, name: c.name, score };
    })
    .filter((s) => s.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top = scored[0];
  if (top && top.score >= 0.88) {
    return {
      matchedCustomerId: top.id,
      matchedCustomerName: top.name,
      confidence: top.score,
      needsReview: false,
      reason: `High-confidence match (${Math.round(top.score * 100)}%)`,
      suggestions: scored,
    };
  }

  // Uncertain or no match -> require user review; never silently attach to wrong customer
  return {
    matchedCustomerId: "",
    matchedCustomerName: raw,
    confidence: top ? top.score : 0,
    needsReview: true,
    reason: top
      ? `Uncertain match (best: ${top.name} at ${Math.round(top.score * 100)}%). Please confirm.`
      : "No matching customer found. Select an existing customer or create one.",
    suggestions: scored,
  };
}

/**
 * Validates an uploaded SOA file before upload/parsing.
 */
export function validateSoaFile(file: { name: string; size: number }): {
  valid: boolean;
  ext: string;
  error?: string;
} {
  const baseName = file.name.split(/[/\\]/).pop() || file.name;
  if (baseName.startsWith("~$") || baseName.startsWith(".~")) {
    return { valid: false, ext: "", error: "Temporary Office lock file ignored." };
  }
  const ext = baseName.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_SOA_EXTENSIONS.includes(ext as (typeof SUPPORTED_SOA_EXTENSIONS)[number])) {
    return {
      valid: false,
      ext,
      error: `Unsupported format (.${ext || "unknown"}). Allowed: PDF, XLSX, XLS, CSV, ZIP.`,
    };
  }
  if (file.size <= 0) {
    return { valid: false, ext, error: "File is empty (0 bytes) or corrupted." };
  }
  if (file.size > MAX_SOA_FILE_SIZE_BYTES) {
    return { valid: false, ext, error: "File exceeds 50 MB upload limit." };
  }
  return { valid: true, ext };
}

/**
 * Serializes SOA metadata into `document_attachments.description`.
 * Uses JSON `soa_v2` payload when entries or cutover settings are present,
 * ensuring robust persistence of full transaction line items.
 */
export function buildSoaAttachmentDescription(meta: SoaRecordMetadata): string {
  const isVerified = meta.isVerified !== undefined
    ? Boolean(meta.isVerified)
    : (!meta.needsReview && Boolean(meta.entries && meta.entries.length > 0) && meta.closingBalance !== null && !meta.isScannedPdf);
  const status: "verified" | "pending_verification" | "rejected" = meta.status
    ? meta.status
    : (isVerified ? "verified" : "pending_verification");

  // Always serialize structured SOA records as lossless `soa_v2` JSON
  const payload = {
    version: "soa_v2",
    soaNumber: meta.soaNumber || "SOA",
    statementDate: meta.statementDate || null,
    fromDate: meta.fromDate || null,
    toDate: meta.toDate || null,
    openingBalance: meta.openingBalance || 0,
    charges: meta.charges || 0,
    credits: meta.credits || 0,
    closingBalance: meta.closingBalance !== undefined && meta.closingBalance !== null ? meta.closingBalance : null,
    checksumSha256: meta.checksumSha256 || null,
    needsReview: meta.needsReview || false,
    isScannedPdf: meta.isScannedPdf || false,
    isVerified,
    status,
    storagePath: meta.storagePath || null,
    storageBucket: meta.storageBucket || "smart-imports",
    cutoverDate: meta.cutoverDate || null,
    isCutoverApproved: meta.isCutoverApproved || false,
    cutoverApprovedBy: meta.cutoverApprovedBy || null,
    cutoverApprovedAt: meta.cutoverApprovedAt || null,
    entries: meta.entries || [],
    auditTrail: meta.auditTrail || [],
  };
  return JSON.stringify(payload);
}

/**
 * Parses SOA metadata from a `document_attachments` row.
 * Seamlessly handles both modern `soa_v2` JSON format and legacy formatted string.
 */
export function parseSoaAttachmentRow(row: {
  id: string;
  company_id: string;
  entity_id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  file_size?: number | null;
  description?: string | null;
  created_at: string;
  customer_name?: string | null;
}): StoredSoaRecord {
  const desc = (row.description || "").trim();

  let storagePath: string | null = null;
  let storageBucket = "smart-imports";
  if (row.file_url) {
    const pathParam = row.file_url.match(/[?&]path=([^&]+)/);
    const bucketParam = row.file_url.match(/[?&]bucket=([^&]+)/);
    if (pathParam) {
      storagePath = decodeURIComponent(pathParam[1]);
    } else if (!row.file_url.startsWith("http") && !row.file_url.startsWith("/")) {
      storagePath = row.file_url;
    }
    if (bucketParam) {
      storageBucket = decodeURIComponent(bucketParam[1]);
    }
  }

  // 1. Try JSON parsing for modern `soa_v2` records
  if (desc.startsWith("{")) {
    try {
      const data = JSON.parse(desc);
      const rawIsVerified = data.isVerified !== undefined ? data.isVerified : data.is_verified;
      const needsReview = Boolean(data.needsReview);
      const entriesList: RawHistoricalEntry[] = Array.isArray(data.entries) ? data.entries : [];
      const closingBal = data.closingBalance !== null && data.closingBalance !== undefined && data.closingBalance !== "" ? Number(data.closingBalance) : null;

      let isVerified: boolean;
      let status: "verified" | "pending_verification" | "rejected";

      if (rawIsVerified !== undefined) {
        isVerified = Boolean(rawIsVerified);
        status = (data.status as "verified" | "pending_verification" | "rejected") || (isVerified ? "verified" : "pending_verification");
      } else {
        // Safe backward-compatibility default:
        if (data.status === "verified" || (!needsReview && entriesList.length > 0 && closingBal !== null && !data.isScannedPdf)) {
          isVerified = true;
          status = "verified";
        } else if (data.status === "rejected") {
          isVerified = false;
          status = "rejected";
        } else {
          isVerified = false;
          status = "pending_verification";
        }
      }

      return {
        id: row.id,
        company_id: row.company_id,
        customer_id: row.entity_id,
        customer_name: row.customer_name || "Unknown Customer",
        file_name: row.file_name,
        file_url: row.file_url,
        file_type: row.file_type || null,
        file_size: row.file_size ?? null,
        description: row.description || null,
        created_at: row.created_at,
        soa_number: data.soaNumber || row.file_name.replace(/\.[^.]+$/, ""),
        statement_date: data.statementDate || "",
        from_date: data.fromDate || null,
        to_date: data.toDate || null,
        opening_balance: Number(data.openingBalance) || 0,
        charges: Number(data.charges) || 0,
        credits: Number(data.credits) || 0,
        closing_balance: closingBal,
        checksum_sha256: data.checksumSha256 || null,
        needs_review: needsReview,
        is_scanned_pdf: Boolean(data.isScannedPdf),
        is_verified: isVerified,
        isVerified: isVerified,
        status: status,
        storage_path: data.storagePath || storagePath,
        storage_bucket: data.storageBucket || storageBucket,
        cutover_date: data.cutoverDate || null,
        is_cutover_approved: Boolean(data.isCutoverApproved),
        cutover_approved_by: data.cutoverApprovedBy || null,
        cutover_approved_at: data.cutoverApprovedAt || null,
        entries: entriesList,
        audit_trail: Array.isArray(data.auditTrail) ? data.auditTrail : [],
      };
    } catch {
      // JSON parse failed -> fall through to legacy regex parser
    }
  }

  // 2. Legacy regex parser
  const soaMatch = desc.match(/Statement of Account\s+([^\s(]+(?:\s+[^\s(]+)*?)\s*\(([^)]*)\)/i);
  const soaNumber = soaMatch?.[1]?.trim() || row.file_name.replace(/\.[^.]+$/, "");
  const rawDate = soaMatch?.[2]?.trim();
  const statementDate = rawDate && rawDate !== "Undated" && rawDate !== "Unknown" ? rawDate : "";

  const openMatch = desc.match(/Opening:\s*AED\s*(-?[0-9.,]+)/i);
  const closeMatch = desc.match(/Closing:\s*AED\s*(-?[0-9.,]+)/i);
  const chargesMatch = desc.match(/Charges:\s*AED\s*(-?[0-9.,]+)/i);
  const creditsMatch = desc.match(/Credits:\s*AED\s*(-?[0-9.,]+)/i);
  const shaMatch = desc.match(/\[SHA256:\s*([a-f0-9_-]+)\]/i);

  const openingBalance = openMatch ? parseFloat(openMatch[1].replace(/,/g, "")) || 0 : 0;
  const closingBalance = closeMatch ? (parseFloat(closeMatch[1].replace(/,/g, "")) || 0) : null;
  const charges = chargesMatch ? parseFloat(chargesMatch[1].replace(/,/g, "")) || 0 : 0;
  const credits = creditsMatch ? parseFloat(creditsMatch[1].replace(/,/g, "")) || 0 : 0;

  const hasVerifiedTag = desc.includes("[Verified]");
  const hasRejectedTag = desc.includes("[Rejected]");
  let legacyIsVerified = false;
  let legacyStatus: "verified" | "pending_verification" | "rejected" = "pending_verification";

  if (hasVerifiedTag) {
    legacyIsVerified = true;
    legacyStatus = "verified";
  } else if (hasRejectedTag) {
    legacyIsVerified = false;
    legacyStatus = "rejected";
  } else {
    legacyIsVerified = false;
    legacyStatus = "pending_verification";
  }

  return {
    id: row.id,
    company_id: row.company_id,
    customer_id: row.entity_id,
    customer_name: row.customer_name || "Unknown Customer",
    file_name: row.file_name,
    file_url: row.file_url,
    file_type: row.file_type || null,
    file_size: row.file_size ?? null,
    description: row.description || null,
    created_at: row.created_at,
    soa_number: soaNumber,
    statement_date: statementDate,
    from_date: null,
    to_date: null,
    opening_balance: openingBalance,
    charges: charges,
    credits: credits,
    closing_balance: closingBalance,
    checksum_sha256: shaMatch?.[1] || null,
    needs_review: desc.includes("[Needs Review]") || !statementDate,
    is_scanned_pdf: desc.includes("[Scanned PDF]"),
    is_verified: legacyIsVerified,
    isVerified: legacyIsVerified,
    status: legacyStatus,
    storage_path: storagePath,
    storage_bucket: storageBucket,
    cutover_date: null,
    is_cutover_approved: false,
    cutover_approved_by: null,
    cutover_approved_at: null,
    entries: [],
    audit_trail: [],
  };
}

/**
 * Detects duplicate SOA against already-saved records using checksum,
 * customer + SOA number, or customer + filename.
 */
export function detectSoaDuplicate(
  candidate: {
    customerId: string;
    soaNumber: string;
    fileName: string;
    checksumSha256?: string;
  },
  existing: StoredSoaRecord[]
): { isDuplicate: boolean; existingRecord: StoredSoaRecord | null; reason: string } {
  if (candidate.checksumSha256) {
    const bySha = existing.find(
      (r) => r.checksum_sha256 && r.checksum_sha256 === candidate.checksumSha256
    );
    if (bySha) {
      return {
        isDuplicate: true,
        existingRecord: bySha,
        reason: `Identical file checksum already archived as ${bySha.file_name}`,
      };
    }
  }

  if (candidate.customerId && candidate.soaNumber) {
    const targetRef = candidate.soaNumber.trim().toLowerCase();
    const byRef = existing.find(
      (r) =>
        r.customer_id === candidate.customerId &&
        r.soa_number.trim().toLowerCase() === targetRef
    );
    if (byRef) {
      return {
        isDuplicate: true,
        existingRecord: byRef,
        reason: `SOA ${byRef.soa_number} already exists for ${byRef.customer_name}`,
      };
    }
  }

  if (candidate.customerId && candidate.fileName) {
    const targetFile = candidate.fileName.trim().toLowerCase();
    const byFile = existing.find(
      (r) =>
        r.customer_id === candidate.customerId &&
        r.file_name.trim().toLowerCase() === targetFile
    );
    if (byFile) {
      return {
        isDuplicate: true,
        existingRecord: byFile,
        reason: `File "${byFile.file_name}" already archived for ${byFile.customer_name}`,
      };
    }
  }

  return { isDuplicate: false, existingRecord: null, reason: "" };
}

/**
 * Generates standardized PDF filename using the central ERP naming engine:
 * `SOA Number Customer Name - Statement of Account.pdf`
 */
export function getExportSoaPdfFilename(
  soaNumber: string | null | undefined,
  customerName: string | null | undefined,
  statementDate?: string | null
): string {
  return generateDocumentPdfFilename({
    docType: "statement_of_account",
    docNumber: soaNumber || undefined,
    customerName: customerName || "Customer",
    date: statementDate || undefined,
  }).filename;
}

function parseNum(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
  if (raw == null) return 0;
  const str = String(raw).trim();
  const isNegative = /^\s*\(.*?\)\s*$/.test(str) || str.includes("-");
  const cleaned = str.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  const val = isNegative ? -Math.abs(n) : Math.abs(n);
  return Math.round(val * 100) / 100;
}

function parseSpreadsheetDate(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    // Excel date serial number
    const jsDate = new Date((raw - (25567 + 2)) * 86400 * 1000);
    if (!isNaN(jsDate.getTime())) return jsDate.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  return str.slice(0, 10);
}

export interface ExtractedSoaSpreadsheetResult {
  customerName: string;
  soaNumber: string;
  statementDate: string;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number | null;
  entries: RawHistoricalEntry[];
  needsReview: boolean;
}

/**
 * Parses full SOA transaction rows and summary header from an Excel/CSV spreadsheet.
 */
export function extractSoaRowsFromSpreadsheet(
  buffer: ArrayBuffer | Buffer,
  fileName: string
): ExtractedSoaSpreadsheetResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return {
      customerName: "",
      soaNumber: fileName.replace(/\.[^.]+$/, ""),
      statementDate: "",
      openingBalance: 0,
      charges: 0,
      credits: 0,
      closingBalance: null,
      entries: [],
      needsReview: true,
    };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  let customerName = "";
  let soaNumber = "";
  let statementDate = "";
  let openingBalance = 0;
  let closingBalance: number | null = null;
  let charges = 0;
  let credits = 0;

  // 1. Scan top header rows for Customer, SOA number, Statement Date
  for (let r = 0; r < Math.min(25, matrix.length); r++) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim();
      const lower = cell.toLowerCase();
      const nextCell = String(row[c + 1] ?? row[c + 2] ?? "").trim();

      if (!customerName && /^(customer|client|account\s*name|bill\s*to|to)\s*:?$/i.test(lower) && nextCell) {
        customerName = nextCell;
      } else if (!customerName && /^(customer|client|account\s*name)\s*[:\-]\s*(.+)$/i.test(cell)) {
        const m = cell.match(/^(?:customer|client|account\s*name)\s*[:\-]\s*(.+)$/i);
        if (m?.[1]) customerName = m[1].trim();
      }

      if (!soaNumber && /^(soa|statement\s*(?:no|number|ref)|reference)\s*:?$/i.test(lower) && nextCell) {
        soaNumber = nextCell;
      } else if (!soaNumber && /\b(SOA[-/]?\d[\w-]*)\b/i.test(cell)) {
        const m = cell.match(/\b(SOA[-/]?\d[\w-]*)\b/i);
        if (m?.[1]) soaNumber = m[1];
      }

      if (!statementDate && /^(statement\s*date|as\s*of|date)\s*:?$/i.test(lower) && nextCell) {
        statementDate = parseSpreadsheetDate(nextCell);
      }
    }
  }

  // 2. Scan table rows for date/reference/description/debit/credit/balance columns
  let headerRowIdx = -1;
  let dateCol = -1;
  let refCol = -1;
  let descCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let balanceCol = -1;

  for (let r = 0; r < Math.min(40, matrix.length); r++) {
    const row = (matrix[r] || []).map((v) => String(v ?? "").toLowerCase().trim());
    const dIdx = row.findIndex((h) => h === "debit" || h === "dr" || h.includes("debit") || h.includes("charge"));
    const cIdx = row.findIndex((h) => h === "credit" || h === "cr" || h.includes("credit"));
    const bIdx = row.findIndex((h) => h === "balance" || h.includes("balance"));
    const dateIdx = row.findIndex((h) => h === "date" || h.includes("date"));
    const rIdx = row.findIndex((h) => h === "reference" || h === "ref" || h.includes("inv") || h.includes("doc"));
    const descIdx = row.findIndex((h) => h === "description" || h === "particulars" || h.includes("desc") || h.includes("detail"));

    if (dIdx !== -1 || cIdx !== -1 || bIdx !== -1) {
      headerRowIdx = r;
      debitCol = dIdx;
      creditCol = cIdx;
      balanceCol = bIdx;
      dateCol = dateIdx;
      refCol = rIdx;
      descCol = descIdx;
      break;
    }
  }

  const entries: RawHistoricalEntry[] = [];
  let runningBal = 0;

  if (headerRowIdx !== -1) {
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rowText = row.map((v) => String(v ?? "").toLowerCase()).join(" ");
      if (!rowText.trim()) continue;

      if (rowText.includes("opening balance") || rowText.includes("brought forward") || rowText.includes("b/f")) {
        const val = balanceCol >= 0 ? parseNum(row[balanceCol]) : parseNum(row[row.length - 1]);
        if (val !== 0) {
          openingBalance = val;
          runningBal = val;
        }
        continue;
      }

      if (rowText.includes("closing balance") || rowText.includes("total balance") || rowText.includes("balance due") || rowText.includes("total:")) {
        const val = balanceCol >= 0 ? parseNum(row[balanceCol]) : parseNum(row[row.length - 1]);
        if (typeof val === "number" && !isNaN(val)) closingBalance = val;
        continue;
      }

      const rowDebit = debitCol >= 0 ? parseNum(row[debitCol]) : 0;
      const rowCredit = creditCol >= 0 ? parseNum(row[creditCol]) : 0;

      if (rowDebit === 0 && rowCredit === 0) {
        continue;
      }

      const rowDate = dateCol >= 0 ? parseSpreadsheetDate(row[dateCol]) : "";
      const rowRef = refCol >= 0 ? String(row[refCol] ?? "").trim() : "";
      const rowDesc = descCol >= 0 ? String(row[descCol] ?? "").trim() : "";
      const statedBal = balanceCol >= 0 ? parseNum(row[balanceCol]) : undefined;

      runningBal = Math.round((runningBal + rowDebit - rowCredit) * 100) / 100;
      charges += rowDebit;
      credits += rowCredit;

      entries.push({
        id: `row_${Date.now()}_${r}_${Math.random().toString(36).slice(2, 7)}`,
        date: rowDate || statementDate || "",
        reference_no: rowRef || (rowDebit > 0 ? "INV" : "REC"),
        original_reference: rowRef,
        description: rowDesc || (rowDebit > 0 ? "Invoice Charge" : "Customer Payment"),
        debit: rowDebit,
        credit: rowCredit,
        balance: statedBal !== undefined ? statedBal : runningBal,
        status: "historical",
        source_filename: fileName,
      });
    }
  }

  if (!soaNumber || !customerName) {
    const fnParsed = parseSoaFilename(fileName);
    if (!soaNumber && fnParsed.soaNumber) soaNumber = fnParsed.soaNumber;
    if (!customerName && fnParsed.customerName) customerName = fnParsed.customerName;
  }

  const validStatementDate = statementDate && /^\d{4}-\d{2}-\d{2}$/.test(statementDate) ? statementDate : "";

  const finalClosing = closingBalance !== null ? closingBalance : null;

  const needsReview = !customerName || !soaNumber || !validStatementDate || finalClosing === null || entries.length === 0;

  return {
    customerName,
    soaNumber,
    statementDate: validStatementDate,
    openingBalance,
    charges: Math.round(charges * 100) / 100,
    credits: Math.round(credits * 100) / 100,
    closingBalance: finalClosing,
    entries,
    needsReview,
  };
}
