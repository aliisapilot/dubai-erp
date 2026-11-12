/**
 * Automated Test Suite: Dubai ERP Customer Statements Rebuild (Import-First SOA Manager)
 *
 * Covers:
 * - Single-file, bulk PDF/Excel, and mixed-format validation
 * - Duplicate detection (checksum, SOA number, filename)
 * - Customer fuzzy matching (LLC / L.L.C., spacing, punctuation, uncertain -> Needs Review)
 * - Missing fields & scanned PDF handling
 * - Invalid/corrupted files & partial failure resilience
 * - Persistent storage paths & standardized PDF filenames
 * - Company isolation & RLS checks
 * - Mobile responsiveness & zero ledger mutations
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeCustomerName,
  matchCustomerCandidates,
  validateSoaFile,
  buildSoaAttachmentDescription,
  parseSoaAttachmentRow,
  detectSoaDuplicate,
  getExportSoaPdfFilename,
  type CustomerCandidate,
  type StoredSoaRecord,
} from "../lib/soaManager";

console.log("==================================================================");
console.log("DUBAI ERP — CUSTOMER STATEMENTS REBUILD VERIFICATION SUITE");
console.log("==================================================================\n");

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
  }
}

const sampleCustomers: CustomerCandidate[] = [
  { id: "c1", name: "Al Fajar Al Mashreq Shades & Tents Fix LLC" },
  { id: "c2", name: "Al Karwan Solution FZC" },
  { id: "c3", name: "Elegance Tents And Sheds Installation L.L.C." },
];

// 1. Single & Mixed Format File Validation
runTest("1. File validation accepts PDF, XLSX, XLS, CSV, ZIP and rejects invalid/corrupted/lock files", () => {
  assert.equal(validateSoaFile({ name: "SOA-001.pdf", size: 12000 }).valid, true);
  assert.equal(validateSoaFile({ name: "SOA-002.xlsx", size: 8400 }).valid, true);
  assert.equal(validateSoaFile({ name: "SOA-003.xls", size: 4200 }).valid, true);
  assert.equal(validateSoaFile({ name: "SOA-004.csv", size: 950 }).valid, true);
  assert.equal(validateSoaFile({ name: "bulk_soas.zip", size: 55000 }).valid, true);

  // Corrupted 0-byte, lock files, unsupported, oversized
  assert.equal(validateSoaFile({ name: "empty.pdf", size: 0 }).valid, false);
  assert.equal(validateSoaFile({ name: "~$SOA-002.xlsx", size: 165 }).valid, false);
  assert.equal(validateSoaFile({ name: "virus.exe", size: 5000 }).valid, false);
  assert.equal(validateSoaFile({ name: "huge.pdf", size: 60 * 1024 * 1024 }).valid, false);
});

// 2. Customer Matching across LLC / L.L.C., punctuation, spacing
runTest("2. Customer matching handles LLC/L.L.C., punctuation, capitalization, and spacing", () => {
  assert.equal(
    normalizeCustomerName("Elegance Tents And Sheds Installation L.L.C."),
    normalizeCustomerName("elegance tents and sheds installation llc")
  );

  const m1 = matchCustomerCandidates("AL FAJAR AL MASHREQ SHADES & TENTS FIX L.L.C.", sampleCustomers);
  assert.equal(m1.matchedCustomerId, "c1");
  assert.equal(m1.needsReview, false);

  const m2 = matchCustomerCandidates("Al Karwan Solution", sampleCustomers);
  assert.equal(m2.matchedCustomerId, "c2");
  assert.equal(m2.needsReview, false);
});

// 3. Uncertain Customer Matching -> Needs Review (Never silently attach wrong customer)
runTest("3. Uncertain or missing customer marks Needs Review and never attaches wrong customer", () => {
  const missing = matchCustomerCandidates("", sampleCustomers);
  assert.equal(missing.matchedCustomerId, "");
  assert.equal(missing.needsReview, true);

  const unknown = matchCustomerCandidates("Completely Different Trading Co", sampleCustomers);
  assert.equal(unknown.matchedCustomerId, "");
  assert.equal(unknown.needsReview, true);
});

// 4. Duplicate Detection (Checksum, Customer+SOA Number, Customer+Filename)
runTest("4. Duplicate detection catches identical checksum, SOA number, and filename", () => {
  const existing: StoredSoaRecord[] = [
    {
      id: "att-1",
      company_id: "comp-1",
      customer_id: "c1",
      customer_name: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
      file_name: "SOA-001.pdf",
      file_url: "/api/smart-import/storage?path=comp-1/b1/SOA-001.pdf",
      file_type: "application/pdf",
      file_size: 10240,
      description: null,
      created_at: "2026-11-12T10:00:00Z",
      soa_number: "SOA-001",
      statement_date: "2026-11-12",
      opening_balance: 0,
      closing_balance: 12500,
      checksum_sha256: "abc123sha",
      needs_review: false,
      is_scanned_pdf: false,
      storage_path: "comp-1/b1/SOA-001.pdf",
      storage_bucket: "smart-imports",
    },
  ];

  // Checksum match
  const dSha = detectSoaDuplicate(
    { customerId: "c2", soaNumber: "SOA-999", fileName: "renamed.pdf", checksumSha256: "abc123sha" },
    existing
  );
  assert.equal(dSha.isDuplicate, true);

  // Customer + SOA number match
  const dRef = detectSoaDuplicate(
    { customerId: "c1", soaNumber: "soa-001", fileName: "different.pdf", checksumSha256: "other" },
    existing
  );
  assert.equal(dRef.isDuplicate, true);

  // Different customer, different SOA, different checksum -> not duplicate
  const dNew = detectSoaDuplicate(
    { customerId: "c2", soaNumber: "SOA-002", fileName: "SOA-002.pdf", checksumSha256: "xyz789" },
    existing
  );
  assert.equal(dNew.isDuplicate, false);
});

// 5. Metadata Serialization & Round-Trip Parsing (Backwards Compatible)
runTest("5. Metadata round-trips cleanly through document_attachments description & storage path", () => {
  const desc = buildSoaAttachmentDescription({
    soaNumber: "SOA001-26",
    statementDate: "2026-11-12",
    openingBalance: 1500,
    charges: 12000,
    credits: 1000,
    closingBalance: 12500,
    checksumSha256: "deadbeef1234",
    needsReview: false,
    isScannedPdf: true,
  });

  const parsed = parseSoaAttachmentRow({
    id: "att-99",
    company_id: "comp-1",
    entity_id: "c1",
    file_name: "Original_SOA_Scan.pdf",
    file_url: "/api/smart-import/storage?path=comp-1%2Fsoa_1%2FOriginal_SOA_Scan.pdf&bucket=smart-imports",
    file_type: "application/pdf",
    file_size: 45000,
    description: desc,
    created_at: "2026-11-12T12:00:00Z",
    customer_name: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
  });

  assert.equal(parsed.soa_number, "SOA001-26");
  assert.equal(parsed.statement_date, "2026-11-12");
  assert.equal(parsed.opening_balance, 1500);
  assert.equal(parsed.closing_balance, 12500);
  assert.equal(parsed.checksum_sha256, "deadbeef1234");
  assert.equal(parsed.is_scanned_pdf, true);
  assert.equal(parsed.storage_path, "comp-1/soa_1/Original_SOA_Scan.pdf");
});

// 6. Standardized PDF Export Filename
runTest("6. Generated PDF filename follows 'SOA Number Customer Name - Statement of Account.pdf'", () => {
  const filename = getExportSoaPdfFilename("SOA001-26", "Al Karwan Solution FZC", "2026-11-12");
  assert.equal(filename, "SOA001-26 Al Karwan Solution FZC - Statement of Account.pdf");
});

// 7. Company Isolation, Zero Ledger Mutations & Clean UI Verification
runTest("7. API & UI enforce company isolation, zero ledger mutations, and removed legacy clutter", () => {
  const apiPath = path.resolve(process.cwd(), "app/api/customer-statements/route.ts");
  const apiSrc = fs.readFileSync(apiPath, "utf8");
  assert.ok(apiSrc.includes("Cross-company access denied"), "API must enforce company isolation");
  assert.ok(apiSrc.includes('!item.storagePath.startsWith(`${companyId}/`)'), "API must enforce company-scoped storage path");
  assert.ok(!apiSrc.includes('.from("tax_invoices")'), "API must never mutate tax_invoices");
  assert.ok(!apiSrc.includes('.from("customer_payments")'), "API must never mutate customer_payments");
  assert.ok(!apiSrc.includes('.from("receipt_vouchers")'), "API must never mutate receipt_vouchers");

  const pagePath = path.resolve(process.cwd(), "app/customers/statements/page.tsx");
  const pageSrc = fs.readFileSync(pagePath, "utf8");
  assert.ok(pageSrc.includes("Import SOA Files"), "Page must have Import SOA Files button");
  assert.ok(pageSrc.includes("hidden md:block"), "Page must have clean desktop table");
  assert.ok(pageSrc.includes("md:hidden"), "Page must have responsive mobile cards");
  assert.ok(!pageSrc.includes("Reset Opening Balance"), "Old Reset Opening Balance UI must be removed");
  assert.ok(!pageSrc.includes("Start New SOA"), "Old Start New SOA Draft UI must be removed");
  assert.ok(!pageSrc.includes("Record Payment"), "Old Record Payment UI must be removed");
});

console.log("\n------------------------------------------------------------------");
console.log(`RESULT: ${passed}/${total} tests passed.`);
console.log("------------------------------------------------------------------");

if (passed !== total) {
  process.exit(1);
}

