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

export interface SoaRecordMetadata {
  soaNumber: string;
  statementDate: string;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number;
  checksumSha256?: string;
  needsReview?: boolean;
  isScannedPdf?: boolean;
  storagePath?: string;
  storageBucket?: string;
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
  opening_balance: number;
  closing_balance: number;
  checksum_sha256: string | null;
  needs_review: boolean;
  is_scanned_pdf: boolean;
  storage_path: string | null;
  storage_bucket: string;
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
    .replace(/l\.?\s*l\.?\s*c\.?/gi, " ")
    .replace(/f\.?\s*z\.?\s*[ec]\.?/gi, " ")
    .replace(/\b(co|company|est|establishment|trading|general\s*trading|ltd|limited|inc|corp)\b/gi, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
 * Serializes SOA metadata into `document_attachments.description` in a format
 * backwards-compatible with existing Smart Import SOA records.
 */
export function buildSoaAttachmentDescription(meta: SoaRecordMetadata): string {
  const parts = [
    `Statement of Account ${meta.soaNumber || "SOA"} (${meta.statementDate || "Undated"})`,
  ];
  if (meta.checksumSha256) {
    parts.push(`[SHA256: ${meta.checksumSha256}]`);
  }
  parts.push(
    `| Opening: AED ${(meta.openingBalance || 0).toFixed(2)}, Charges: AED ${(meta.charges || 0).toFixed(2)}, Credits: AED ${(meta.credits || 0).toFixed(2)}, Closing: AED ${(meta.closingBalance || 0).toFixed(2)}`
  );
  if (meta.isScannedPdf) {
    parts.push("[Scanned PDF]");
  }
  if (meta.needsReview) {
    parts.push("[Needs Review]");
  }
  parts.push("[Document-only archive; zero ledger mutations]");
  return parts.join(" ");
}

/**
 * Parses SOA metadata from a `document_attachments` row.
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
  const desc = row.description || "";

  const soaMatch = desc.match(/Statement of Account\s+([^\s(]+(?:\s+[^\s(]+)*?)\s*\(([^)]*)\)/i);
  const soaNumber = soaMatch?.[1]?.trim() || row.file_name.replace(/\.[^.]+$/, "");
  const statementDate = soaMatch?.[2]?.trim() || row.created_at.slice(0, 10);

  const openMatch = desc.match(/Opening:\s*AED\s*(-?[0-9.,]+)/i);
  const closeMatch = desc.match(/Closing:\s*AED\s*(-?[0-9.,]+)/i);
  const shaMatch = desc.match(/\[SHA256:\s*([a-f0-9_-]+)\]/i);

  const openingBalance = openMatch ? parseFloat(openMatch[1].replace(/,/g, "")) || 0 : 0;
  const closingBalance = closeMatch ? parseFloat(closeMatch[1].replace(/,/g, "")) || 0 : 0;

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
    statement_date: statementDate === "Undated" ? row.created_at.slice(0, 10) : statementDate,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    checksum_sha256: shaMatch?.[1] || null,
    needs_review: desc.includes("[Needs Review]"),
    is_scanned_pdf: desc.includes("[Scanned PDF]"),
    storage_path: storagePath,
    storage_bucket: storageBucket,
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
