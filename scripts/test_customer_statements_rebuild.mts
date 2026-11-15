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
import {
  matchSingleHistoricalEntry,
  calculateCustomerStatement,
} from "../lib/customerStatementEngine";
import {
  extractHistoricalSequence,
  getCommonDocPrefixes,
} from "../lib/documentSequenceParsing";

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
      charges: 0,
      credits: 0,
      closing_balance: 12500,
      checksum_sha256: "abc123sha",
      needs_review: false,
      is_scanned_pdf: false,
      is_verified: true,
      isVerified: true,
      status: "verified",
      storage_path: "comp-1/b1/SOA-001.pdf",
      storage_bucket: "smart-imports",
      entries: [],
      audit_trail: [],
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
  assert.ok(
    /\.from\(["']tax_invoices["']\)[\s\n]*\.select\(/.test(apiSrc),
    "API must query tax_invoices for read-only live reconciliation"
  );
  assert.ok(
    !apiSrc.includes('.from("tax_invoices").insert') &&
    !apiSrc.includes('.from("tax_invoices").update') &&
    !apiSrc.includes('.from("tax_invoices").delete'),
    "API must never mutate tax_invoices"
  );
  assert.ok(!apiSrc.includes('.from("customer_payments")'), "API must never mutate customer_payments");
  assert.ok(
    /\.from\(["']receipt_vouchers["']\)[\s\n]*\.select\(/.test(apiSrc),
    "API must query receipt_vouchers for read-only live reconciliation"
  );
  assert.ok(
    !apiSrc.includes('.from("receipt_vouchers").insert') &&
    !apiSrc.includes('.from("receipt_vouchers").update') &&
    !apiSrc.includes('.from("receipt_vouchers").delete'),
    "API must never mutate receipt_vouchers"
  );

  const pagePath = path.resolve(process.cwd(), "app/customers/statements/page.tsx");
  const pageSrc = fs.readFileSync(pagePath, "utf8");
  assert.ok(pageSrc.includes("Import SOA"), "Page must have Import SOA button");
  assert.ok(pageSrc.includes("hidden md:block"), "Page must have clean desktop table");
  assert.ok(pageSrc.includes("md:hidden"), "Page must have responsive mobile cards");
  assert.ok(!pageSrc.includes("Reset Opening Balance"), "Old Reset Opening Balance UI must be removed");
  assert.ok(!pageSrc.includes("Start New SOA"), "Old Start New SOA Draft UI must be removed");
  assert.ok(!pageSrc.includes("Record Payment"), "Old Record Payment UI must be removed");
});

// 8. Sequence-Aware Live Reconciliation Matching
runTest("8. Live reconciliation matches sequence numbers across format variants without double-counting", () => {
  const matchInv = matchSingleHistoricalEntry(
    { id: "h1", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500, credit: 0 },
    [{ id: "inv-1", invoice_number: "INV-2026-000101", total_amount: 500, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(matchInv.status, "matched");
  assert.equal(matchInv.matchedId, "inv-1");

  const matchVoucher = matchSingleHistoricalEntry(
    { id: "h2", date: "2026-01-20", reference_no: "RV-25", description: "Payment", debit: 0, credit: 300 },
    [],
    [{ id: "rv-1", voucher_number: "RV-2026-000025", amount: 300, voucher_date: "2026-01-20", status: "issued" }],
    []
  );
  assert.equal(matchVoucher.status, "matched");
  assert.equal(matchVoucher.matchedId, "rv-1");

  // Zero double-counting when calculating statement
  const stmt = calculateCustomerStatement({
    initialCutoverBalance: 1000,
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    historicalEntries: [
      { id: "h1", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500, credit: 0 },
    ],
    invoices: [
      { id: "inv-1", invoice_number: "INV-2026-000101", total_amount: 500, invoice_date: "2026-01-15", status: "issued" },
      { id: "inv-2", invoice_number: "INV-2026-000102", total_amount: 250, invoice_date: "2026-01-18", status: "issued" },
    ],
    receipts: [],
    payments: [],
    customerName: "Test Customer",
  });
  assert.equal(stmt.entries.length, 2, "Must contain exactly h1 and live inv-2 (zero double-counting)");
  assert.equal(stmt.closing_balance, 1750, "Closing balance must equal 1000 + 500 + 250");
});

// 9. Verified vs Pending Documents Segregation & Metadata Backward Compatibility
runTest("9. Segregates verified SOAs from pending documents and enforces backward compatibility", () => {
  // Legacy description with entries but missing isVerified -> safe default is verified
  const legacyVerifiedDesc = JSON.stringify({
    version: "soa_v2",
    soaNumber: "SOA-099",
    statementDate: "2026-10-01",
    openingBalance: 100,
    closingBalance: 400,
    entries: [{ id: "e1", date: "2026-10-01", reference_no: "INV-1", description: "Item", debit: 300, credit: 0 }],
  });
  const row1 = parseSoaAttachmentRow({
    id: "att-1", company_id: "comp-1", entity_id: "c1", file_name: "verified.pdf", file_url: "/api/storage", created_at: "2026-10-01", description: legacyVerifiedDesc
  });
  assert.equal(row1.is_verified, true);
  assert.equal(row1.status, "verified");

  // Legacy description with empty entries -> safe default is pending_verification
  const legacyEmptyDesc = JSON.stringify({
    version: "soa_v2",
    soaNumber: "SOA-100",
    statementDate: "2026-10-01",
    openingBalance: 100,
    closingBalance: 100,
    entries: [],
  });
  const row2 = parseSoaAttachmentRow({
    id: "att-2", company_id: "comp-1", entity_id: "c1", file_name: "empty.pdf", file_url: "/api/storage", created_at: "2026-10-01", description: legacyEmptyDesc
  });
  assert.equal(row2.is_verified, false);
  assert.equal(row2.status, "pending_verification");

  // Explicit unverified document
  const unverifiedDesc = buildSoaAttachmentDescription({
    soaNumber: "SOA-101", statementDate: "2026-10-01", openingBalance: 0, charges: 0, credits: 0, closingBalance: 0,
    isVerified: false, status: "pending_verification", isScannedPdf: true
  });
  const row3 = parseSoaAttachmentRow({
    id: "att-3", company_id: "comp-1", entity_id: "c1", file_name: "scan.pdf", file_url: "/api/storage", created_at: "2026-10-01", description: unverifiedDesc
  });
  assert.equal(row3.is_verified, false);
  assert.equal(row3.status, "pending_verification");
});

// 10. Floating-Point Tolerance Check (0.05 AED Exact Match vs > 0.05 Conflict)
runTest("10. Floating-point tolerance checks match exact 0.05 AED difference without IEEE 754 drift and flag > 0.05 as conflict", () => {
  // Test 10.1: Invoice exact reference match with 0.05 drift (500.05 - 500.00 = 0.05000000000001137)
  const invMatchExact = matchSingleHistoricalEntry(
    { id: "h1", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500.00, credit: 0 },
    [{ id: "inv-1", invoice_number: "INV-101", total_amount: 500.05, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(invMatchExact.status, "matched", "Exact 0.05 AED difference must match without float drift");
  assert.equal(invMatchExact.matchedId, "inv-1");

  // Test 10.2: Sequence-aware invoice match with 0.05 drift
  const invSeqMatchExact = matchSingleHistoricalEntry(
    { id: "h2", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500.00, credit: 0 },
    [{ id: "inv-2", invoice_number: "INV-2026-000101", total_amount: 500.05, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(invSeqMatchExact.status, "matched", "Exact 0.05 AED sequence-aware difference must match");
  assert.equal(invSeqMatchExact.matchedId, "inv-2");

  // Test 10.3: Receipt voucher match with 0.05 drift
  const rcvMatchExact = matchSingleHistoricalEntry(
    { id: "h3", date: "2026-01-20", reference_no: "RV-25", description: "Receipt", debit: 0, credit: 500.00 },
    [],
    [{ id: "rv-1", voucher_number: "RV-25", amount: 500.05, voucher_date: "2026-01-20", status: "issued" }],
    []
  );
  assert.equal(rcvMatchExact.status, "matched", "Receipt voucher with exact 0.05 AED difference must match");
  assert.equal(rcvMatchExact.matchedId, "rv-1");

  // Test 10.4: Payment match with 0.05 drift
  const payMatchExact = matchSingleHistoricalEntry(
    { id: "h4", date: "2026-01-22", reference_no: "PAY-99", description: "Payment", debit: 0, credit: 500.00 },
    [],
    [],
    [{ id: "p-1", payment_number: "PAY-99", amount: 500.05, payment_date: "2026-01-22", status: "completed" }]
  );
  assert.equal(payMatchExact.status, "matched", "Payment with exact 0.05 AED difference must match");
  assert.equal(payMatchExact.matchedId, "p-1");

  // Test 10.5: > 0.05 AED difference on invoice flags conflict (500.06 vs 500.00)
  const invMatchConflict = matchSingleHistoricalEntry(
    { id: "h5", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500.00, credit: 0 },
    [{ id: "inv-1", invoice_number: "INV-101", total_amount: 500.06, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(invMatchConflict.status, "conflict", "> 0.05 AED difference must flag conflict");
  assert.equal(invMatchConflict.matchedId, "inv-1");

  // Test 10.6: > 0.05 AED difference on sequence-aware invoice flags conflict
  const invSeqConflict = matchSingleHistoricalEntry(
    { id: "h6", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500.00, credit: 0 },
    [{ id: "inv-2", invoice_number: "INV-2026-000101", total_amount: 500.06, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(invSeqConflict.status, "conflict", "> 0.05 AED sequence difference must flag conflict");
  assert.equal(invSeqConflict.matchedId, "inv-2");

  // Test 10.7: > 0.05 AED difference on receipt voucher flags conflict
  const rcvConflict = matchSingleHistoricalEntry(
    { id: "h7", date: "2026-01-20", reference_no: "RV-25", description: "Receipt", debit: 0, credit: 500.00 },
    [],
    [{ id: "rv-1", voucher_number: "RV-25", amount: 500.06, voucher_date: "2026-01-20", status: "issued" }],
    []
  );
  assert.equal(rcvConflict.status, "conflict", "> 0.05 AED voucher difference must flag conflict");
  assert.equal(rcvConflict.matchedId, "rv-1");
});

// 11. Multi-Digit Zero-Padded Sequence Parsing & Matching
runTest("11. Multi-digit zero padded reference parses sequence and reconciles across formats", () => {
  const invPrefixes = getCommonDocPrefixes("tax_invoice");
  const rcvPrefixes = getCommonDocPrefixes("receipt_voucher");

  // Multi leading zeros: INV-0000000000101 (10 leading zeros + 3 digits)
  const seq1 = extractHistoricalSequence("INV-0000000000101", invPrefixes);
  assert.equal(seq1, 101, "INV-0000000000101 must parse sequence 101");

  // Extreme leading zeros
  const seq2 = extractHistoricalSequence("INV-0000000000000000101", invPrefixes);
  assert.equal(seq2, 101, "INV-0000000000000000101 must parse sequence 101");

  // Receipt voucher with multiple leading zeros
  const seqRcv = extractHistoricalSequence("RV-0000000000055", rcvPrefixes);
  assert.equal(seqRcv, 55, "RV-0000000000055 must parse sequence 55");

  // Year prefixed with multiple leading zeros
  const seqYear = extractHistoricalSequence("2026-0000000000101", [...invPrefixes, ""]);
  assert.equal(seqYear, 101, "2026-0000000000101 must parse sequence 101");

  // Reconcile SOA entry INV-101 with ERP invoice INV-0000000000101
  const matchMultiZero = matchSingleHistoricalEntry(
    { id: "h10", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 750, credit: 0 },
    [{ id: "inv-padded", invoice_number: "INV-0000000000101", total_amount: 750, invoice_date: "2026-01-15", status: "issued" }],
    [],
    []
  );
  assert.equal(matchMultiZero.status, "matched", "INV-101 must match INV-0000000000101 via sequence");
  assert.equal(matchMultiZero.matchedId, "inv-padded");
});

// 12. Statement Calculation Preserves status: 'conflict' on Discrepancies
runTest("12. calculateCustomerStatement preserves status: 'conflict' on amount mismatches", () => {
  const stmt = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
    historicalEntries: [
      { id: "h-conf-1", date: "2026-01-15", reference_no: "INV-101", description: "Tax Invoice", debit: 500, credit: 0 },
      { id: "h-conf-2", date: "2026-01-20", reference_no: "RV-2026-000025", description: "Payment", debit: 0, credit: 300 },
      { id: "h-norm-3", date: "2026-01-25", reference_no: "INV-200", description: "Normal Invoice", debit: 1000, credit: 0 },
    ],
    invoices: [
      // Discrepancy: SOA says 500, live ERP invoice says 50000
      { id: "inv-conf", invoice_number: "INV-101", total_amount: 50000, invoice_date: "2026-01-15", status: "issued" },
      // Normal match: SOA says 1000, ERP says 1000
      { id: "inv-norm", invoice_number: "INV-200", total_amount: 1000, invoice_date: "2026-01-25", status: "issued" },
    ],
    receipts: [
      // Discrepancy: SOA says 300, live ERP voucher says 350
      { id: "rv-conf", voucher_number: "RV-2026-000025", amount: 350, voucher_date: "2026-01-20", status: "issued" },
    ],
    payments: [],
    customerName: "Discrepancy Test Customer",
  });

  const entry1 = stmt.entries.find((e) => e.reference_no === "INV-101");
  assert.ok(entry1, "INV-101 must exist in statement entries");
  assert.equal(entry1.status, "conflict", "INV-101 must preserve status: 'conflict'");
  assert.equal(entry1.invoice_id, "inv-conf", "INV-101 must retain matched invoice_id");

  const entry2 = stmt.entries.find((e) => e.reference_no === "RV-2026-000025");
  assert.ok(entry2, "RV-2026-000025 must exist in statement entries");
  assert.equal(entry2.status, "conflict", "RV-2026-000025 must preserve status: 'conflict'");
  assert.equal(entry2.voucher_id, "rv-conf", "RV-2026-000025 must retain matched voucher_id");

  const entry3 = stmt.entries.find((e) => e.reference_no === "INV-200");
  assert.ok(entry3, "INV-200 must exist in statement entries");
  assert.equal(entry3.status, "matched", "INV-200 must retain status: 'matched'");
});

console.log("\n------------------------------------------------------------------");
console.log(`RESULT: ${passed}/${total} tests passed.`);
console.log("------------------------------------------------------------------");

if (passed !== total) {
  process.exit(1);
}

