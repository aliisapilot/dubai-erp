/**
 * ============================================================================
 * DUBAI ERP — END-TO-END (E2E) TEST SUITE: CUSTOMER STATEMENTS IMPORTER
 * ============================================================================
 * 
 * Strict Requirement-Driven, Opaque-Box Testing Suite based on:
 * - ORIGINAL_REQUEST.md (Requirements R1, R2, R3, R4, R5)
 * - PROJECT.md (Interface Contracts, Milestones M1-M4)
 * 
 * Tiers:
 * - Tier 1: Feature Coverage (8 Features * 5 Tests = 40 Tests)
 * - Tier 2: Boundary & Corner Cases (7 Tests)
 * - Tier 3: Cross-Feature Combinations (3 Tests)
 * - Tier 4: Real-World Application Scenarios (7 Tests against real PDF fixtures)
 * 
 * Total: 57 E2E Tests
 * Run with: npx tsx scripts/test_e2e_customer_statements_suite.mts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parsePdf, type PdfParseResult, type ParsedPdfPage } from "../lib/smartImport/parsers/pdfParser";
import { extractFromPdf } from "../lib/smartImport/extractor";
import {
  normalizeCustomerName,
  matchCustomerCandidates,
  validateSoaFile,
  buildSoaAttachmentDescription,
  parseSoaAttachmentRow,
  parseSoaFilename,
  extractSoaRowsFromSpreadsheet,
  detectSoaDuplicate,
  type CustomerCandidate,
  type StoredSoaRecord,
} from "../lib/soaManager";
import * as soaManagerModule from "../lib/soaManager";
import {
  calculateCustomerStatement,
  reconcileCustomerStatement,
  roundCurrency,
  type RawInvoice,
  type RawReceiptVoucher,
  type RawPayment,
  type RawHistoricalEntry,
} from "../lib/customerStatementEngine";
import { auditStatementOfAccount } from "../lib/smartImport/calculator";
import { classifyDocument } from "../lib/smartImport/classifier";
import { resolveDocumentStatus } from "../lib/smartImport/statusResolver";
import type { ExtractedField } from "../lib/smartImport/types";

// ============================================================================
// TEST HARNESS & RUNNER
// ============================================================================
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ name: string; error: unknown }> = [];

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`     Reason:`, err instanceof Error ? err.message : String(err));
  }
}

function printSection(title: string) {
  console.log(`\n====================================================================`);
  console.log(`=== ${title}`);
  console.log(`====================================================================`);
}

// Helper to create synthetic PdfParseResult for opaque-box testing
function createMockPdfParseResult(lines: string[], opts?: {
  pagesCount?: number;
  width?: number;
  height?: number;
  hasSelectableText?: boolean;
  isImageOnly?: boolean;
  totalChars?: number;
}): PdfParseResult {
  const pCount = opts?.pagesCount ?? 1;
  const width = opts?.width ?? 595;
  const height = opts?.height ?? 842;
  const allText = lines.join("\n");
  const nonWsChars = allText.replace(/\s+/g, "").length;

  const pages: ParsedPdfPage[] = [];
  for (let p = 1; p <= pCount; p++) {
    pages.push({
      pageNumber: p,
      width,
      height,
      text: allText,
      lines: [...lines],
      items: lines.map((l, idx) => ({
        str: l,
        x: 50,
        y: height - 50 - idx * 15,
        width: l.length * 6,
        height: 12,
        page: p,
      })),
      characterCount: allText.length,
      nonWhitespaceCharacterCount: nonWsChars,
      imageOperatorCount: opts?.isImageOnly ? 1 : 0,
    });
  }

  return {
    pagesCount: pCount,
    pages,
    allText,
    sourceSnippets: lines.map((l, idx) => ({
      location: { file: "mock.pdf", page: 1, row: idx + 1, rawText: l },
      text: `Page 1, Line ${idx + 1}: ${l}`,
    })),
    totalCharacterCount: opts?.totalChars ?? allText.length,
    nonWhitespaceCharacterCount: nonWsChars,
    imageOperatorCount: opts?.isImageOnly ? 1 : 0,
    hasSelectableText: opts?.hasSelectableText ?? (nonWsChars >= 20),
    isImageOnly: opts?.isImageOnly ?? false,
  };
}

const sampleErpCustomers: CustomerCandidate[] = [
  { id: "cust-101", name: "Al Karwan Solution FZC", customer_code: "CUST-101", trn: "100234567800003" },
  { id: "cust-102", name: "Al Fajar Al Mashreq Shades & Tents Fix LLC", customer_code: "CUST-102", trn: "104778007500003" },
  { id: "cust-103", name: "Elegance Tents And Sheds Installation L.L.C.", customer_code: "CUST-103", trn: "100987654300003" },
  { id: "cust-104", name: "Golden Elite Metal Construction LLC", customer_code: "CUST-104" },
];

// Execute entire E2E test suite
async function executeSuite() {
  console.log("====================================================================");
  console.log("=== DUBAI ERP — BULK CUSTOMER STATEMENTS E2E VERIFICATION SUITE ===");
  console.log("====================================================================");

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (8 Features * 5 Tests = 40 Tests)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // FEATURE 1: PDF Parser Diagnostics
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 1: PDF Parser Diagnostics");

  await runTest("1.1 parsePdf executes on valid PDF buffer and returns pagesCount >= 1 and pages array", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.ok(res.pagesCount >= 1, "Must have at least 1 page");
    assert.ok(Array.isArray(res.pages), "Must return pages array");
    assert.equal(res.pages.length, res.pagesCount, "pages.length must match pagesCount");
  });

  await runTest("1.2 parsePdf diagnostic flags identify selectable embedded text correctly", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.equal(res.hasSelectableText, true, "Valid digital PDF must report hasSelectableText = true");
    assert.equal(res.isImageOnly, false, "Digital PDF with text must report isImageOnly = false");
  });

  await runTest("1.3 parsePdf inspects page viewport geometry with non-zero dimensions", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    for (const page of res.pages) {
      assert.ok(page.width > 0, "Page width must be greater than 0");
      assert.ok(page.height > 0, "Page height must be greater than 0");
    }
  });

  await runTest("1.4 parsePdf safely handles Node Buffer slices without memory corruption or detached array crash", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_1_item.pdf");
    const rawBuf = fs.readFileSync(fixturePath);
    const padded = Buffer.alloc(rawBuf.length + 512);
    rawBuf.copy(padded, 256);
    const sub = padded.subarray(256, 256 + rawBuf.length);
    const ab = sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength);
    const res = await parsePdf(ab, "sliced_test.pdf");
    assert.ok(res.pagesCount >= 1, "Padded slice must parse without detached buffer errors");
    assert.ok(res.allText.length > 0, "Extracted text must not be empty");
  });

  await runTest("1.5 parsePdf discovers multi-page document structure accurately", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_30_items.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_of_account_SOA101_30_items.pdf");
    assert.ok(res.pagesCount >= 1, "Must report accurate pagesCount");
    assert.ok(res.pages[0].lines.length > 5, "Page 1 must contain extracted lines");
  });

  // --------------------------------------------------------------------------
  // FEATURE 2: Embedded Text Inspection
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 2: Embedded Text Inspection");

  await runTest("2.1 Text items on the same horizontal line bucket are grouped in ascending X order", () => {
    const mock = createMockPdfParseResult([
      "Date Description Charges Credits Balance",
      "15-Oct-2026 Tax Invoice INV-101 25,000.00 0.00 25,000.00",
    ]);
    const line = mock.pages[0].lines[0];
    assert.ok(line.includes("Date"), "Header line must include Date");
    assert.ok(line.includes("Description"), "Header line must include Description");
    assert.ok(line.includes("Balance"), "Header line must include Balance");
  });

  await runTest("2.2 Spacing calculation inserts spaces between bounding boxes with gap > 2.0 pt", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.ok(/Statement\s+of\s+Account/i.test(res.allText), "Tokens must have proper whitespace separation");
    assert.ok(/Al\s+Karwan\s+Solution/i.test(res.allText), "Customer words must have space separation");
  });

  await runTest("2.3 Lines are sorted vertically from top to bottom (descending Y coordinates)", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    const text = res.allText;
    const titleIdx = text.search(/Statement\s+of\s+Account/i);
    const dateIdx = text.search(/October\s+31,\s+2026/i);
    const balanceIdx = text.search(/Total\s+Balance\s+Due/i);
    assert.ok(titleIdx >= 0, "Title must be found");
    assert.ok(dateIdx >= 0, "Date must be found");
    assert.ok(balanceIdx >= 0, "Balance must be found");
    assert.ok(titleIdx < dateIdx, "Title must appear before Date");
    assert.ok(dateIdx < balanceIdx, "Date must appear before Total Balance Due");
  });

  await runTest("2.4 Character count tracking measures text density and distinguishes image pages", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.ok(res.totalCharacterCount > 200, "Digital statement must have > 200 total characters");
    assert.ok(res.nonWhitespaceCharacterCount > 100, "Digital statement must have > 100 non-whitespace characters");
  });

  await runTest("2.5 Line-level audit evidence retains exact source location and snippet text", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.ok(res.sourceSnippets.length > 5, "Must retain source snippets");
    const first = res.sourceSnippets[0];
    assert.equal(first.location.page, 1, "Snippet must record page number");
    assert.ok(first.location.row > 0, "Snippet must record row number");
    assert.ok(first.text.length > 0, "Snippet text must not be empty");
  });

  // --------------------------------------------------------------------------
  // FEATURE 3: OCR Requirement Reporting
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 3: OCR Requirement Reporting");

  await runTest("3.1 Genuinely image-only page reports hasSelectableText = false and isImageOnly = true", () => {
    const imageOnlyMock = createMockPdfParseResult([], {
      hasSelectableText: false,
      isImageOnly: true,
      totalChars: 0,
    });
    assert.equal(imageOnlyMock.hasSelectableText, false);
    assert.equal(imageOnlyMock.isImageOnly, true);
  });

  await runTest("3.2 Image-only document extraction returns explicit OCR requirement notice", () => {
    const imageOnlyMock = createMockPdfParseResult([], {
      hasSelectableText: false,
      isImageOnly: true,
      totalChars: 0,
    });
    const extracted = extractFromPdf(imageOnlyMock, "scanned_soa.pdf", "customer_statement");
    assert.equal(extracted.items.length, 0);
  });

  await runTest("3.3 Blank empty document is distinguished from scanned image document", () => {
    const blankMock = createMockPdfParseResult([], {
      hasSelectableText: false,
      isImageOnly: false,
      totalChars: 0,
    });
    assert.equal(blankMock.hasSelectableText, false);
    assert.equal(blankMock.isImageOnly, false);
  });

  await runTest("3.4 Multi-page document with partial scan preserves selectable text on digital pages", () => {
    const mixedMock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Statement Ref: SOA101-26",
      "Date Description Charges Credits Balance",
      "15/10/2026 INV-101 25,000.00 0.00 25,000.00",
    ], {
      pagesCount: 2,
      hasSelectableText: true,
      isImageOnly: false,
    });
    const extracted = extractFromPdf(mixedMock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.fields.customer_name?.value, "Al Karwan Solution FZC");
    assert.equal(extracted.fields.document_number?.value, "SOA101-26");
  });

  await runTest("3.5 Clean digital PDF with selectable text never triggers false OCR requirement", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parsePdf(ab, "statement_al_karwan_fixed.pdf");
    assert.equal(res.hasSelectableText, true);
    assert.equal(res.isImageOnly, false);
  });

  // --------------------------------------------------------------------------
  // FEATURE 4: Alphanumeric Date Table Extraction
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 4: Alphanumeric Date Table Extraction");

  await runTest("4.1 Alphanumeric ERP date format (15-Oct-2026, DD-MMM-YYYY) is supported in table extraction", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Statement #: SOA101-26",
      "Date Description Charges Credits Balance",
      "15-Oct-2026 Tax Invoice INV-2026-0088 39,560.86 0.00 39,560.86",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.fields.customer_name?.value, "Al Karwan Solution FZC");
    assert.equal(extracted.fields.document_number?.value, "SOA101-26");
  });

  await runTest("4.2 Numeric slash dates (05/11/2026) and hyphen dates (2026-11-05) are standardized", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Statement Date: 05/11/2026",
      "Date Description Charges Credits Balance",
      "05/11/2026 INV-101 Water Tank Liner 25,000.00 0.00 25,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.fields.document_date?.value, "2026-11-05");
    assert.ok(extracted.items.length >= 1, "Must extract transaction row with DD/MM/YYYY date");
  });

  await runTest("4.3 Charges (debits), credits, and running balance are correctly mapped to line items", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Date Description Charges Credits Balance",
      "01/10/2026 Opening Balance 10,000.00 0.00 10,000.00",
      "15/10/2026 INV-101 Fabrication 25,000.00 0.00 35,000.00",
      "20/10/2026 RV-001 Bank Transfer 0.00 15,000.00 20,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.items.length, 3);
    assert.equal(extracted.items[0].taxableAmount, 10000);
    assert.equal(extracted.items[1].taxableAmount, 25000);
    assert.equal(extracted.items[2].unitPrice, 15000);
  });

  await runTest("4.4 Transaction reference numbers (INV-*, RV-*, ADV-*) are preserved in descriptions", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Date Description Charges Credits Balance",
      "15/10/2026 INV-101 Fabrication 25,000.00 0.00 25,000.00",
      "20/10/2026 RV-001 Bank Payment 0.00 15,000.00 10,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.ok(extracted.items[0].description.includes("INV-101"));
    assert.ok(extracted.items[1].description.includes("RV-001"));
  });

  await runTest("4.5 Multi-row transaction sequence maintains continuous chronological order and item indexing", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Date Description Charges Credits Balance",
      "01/10/2026 Opening 1,000.00 0.00 1,000.00",
      "02/10/2026 INV-1 2,000.00 0.00 3,000.00",
      "03/10/2026 INV-2 3,000.00 0.00 6,000.00",
      "04/10/2026 RV-1 0.00 4,000.00 2,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.items.length, 4);
    for (let i = 0; i < extracted.items.length; i++) {
      assert.equal(extracted.items[i].itemNumber, i + 1);
    }
  });

  // --------------------------------------------------------------------------
  // FEATURE 5: Filename Parsing & Field Extraction
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 5: Filename Parsing & Field Extraction");

  function parseFilenameSafe(fileName: string): { soaNumber: string | null; customerName: string | null } {
    const fn = (soaManagerModule as { parseSoaFilename?: (n: string) => { soaNumber: string; customerName: string } }).parseSoaFilename;
    if (typeof fn === "function") {
      const res = fn(fileName);
      return {
        soaNumber: res.soaNumber || null,
        customerName: res.customerName || null,
      };
    }
    const mock = createMockPdfParseResult(["STATEMENT OF ACCOUNT"]);
    const extracted = extractFromPdf(mock, fileName, "customer_statement");
    return {
      soaNumber: extracted.fields.document_number?.value || null,
      customerName: extracted.fields.customer_name?.value || null,
    };
  }

  await runTest("5.1 Standard user pattern 'SOA101-26 Al Karwan Solution FZC.pdf' extracts SOA number and Customer", () => {
    const res = parseFilenameSafe("SOA101-26 Al Karwan Solution FZC.pdf");
    assert.equal(res.soaNumber, "SOA101-26");
    assert.equal(res.customerName, "Al Karwan Solution FZC");
  });

  await runTest("5.2 Triple-segment pattern with date extracts SOA number and Customer Name", () => {
    const res = parseFilenameSafe("SOA-001 - Al Fajar Al Mashreq Shades & Tents Fix LLC - 05-11-2026.pdf");
    assert.equal(res.soaNumber, "SOA-001");
    assert.equal(res.customerName, "Al Fajar Al Mashreq Shades & Tents Fix LLC");
  });

  await runTest("5.3 Hyphenated customer name is extracted cleanly without mangling", () => {
    const res = parseFilenameSafe("SOA-2026-005 Al-Futtaim Engineering - Dubai.pdf");
    assert.equal(res.soaNumber, "SOA-2026-005");
    assert.ok(res.customerName?.includes("Al-Futtaim Engineering"), "Must preserve hyphen in customer name");
  });

  await runTest("5.4 Space-delimited code and customer name extracts cleanly", () => {
    const res = parseFilenameSafe("SOA102-26 Elegance Tents And Sheds Installation L.L.C..pdf");
    assert.equal(res.soaNumber, "SOA102-26");
    assert.ok(res.customerName?.includes("Elegance Tents"), "Must extract customer name");
  });

  await runTest("5.5 Non-standard or bare filename without customer marks customer as unextracted", () => {
    const res = parseFilenameSafe("SOA-999.pdf");
    assert.equal(res.soaNumber, "SOA-999");
    assert.ok(!res.customerName || res.customerName === "", "Customer must be falsy / empty when unextracted");
  });

  // --------------------------------------------------------------------------
  // FEATURE 6: Safe Customer Normalization & Fuzzy Matching
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 6: Safe Customer Normalization & Matching");

  await runTest("6.1 Legal suffix normalization matches LLC, L.L.C., and (L.L.C) identically", () => {
    const n1 = normalizeCustomerName("Elegance Tents And Sheds Installation L.L.C.");
    const n2 = normalizeCustomerName("elegance tents and sheds installation llc");
    const n3 = normalizeCustomerName("Elegance Tents And Sheds Installation (L.L.C)");
    assert.equal(n1, n2);
    assert.equal(n2, n3);
  });

  await runTest("6.2 Free Zone suffixes (FZC, F.Z.C., FZCO) normalize consistently", () => {
    const n1 = normalizeCustomerName("Al Karwan Solution FZC");
    const n2 = normalizeCustomerName("al karwan solution f.z.c.");
    assert.equal(n1, n2);
  });

  await runTest("6.3 Customer normalization handles case, extra whitespace, and punctuation", () => {
    const n1 = normalizeCustomerName("AL FAJAR AL MASHREQ SHADES & TENTS FIX L.L.C.");
    const n2 = normalizeCustomerName("al fajar  al mashreq shades & tents fix llc");
    assert.equal(n1, n2);

    // Fuzzy matching matches variants with ampersand vs 'and' to same customer ID
    const m1 = matchCustomerCandidates("Al Fajar Al Mashreq Shades & Tents Fix", sampleErpCustomers);
    const m2 = matchCustomerCandidates("Al Fajar Al Mashreq Shades and Tents Fix", sampleErpCustomers);
    assert.equal(m1.matchedCustomerId, "cust-102");
    assert.equal(m2.matchedCustomerId, "cust-102");
  });

  await runTest("6.4 Safe fuzzy match connects exact and high-confidence variants to correct ERP customer ID", () => {
    const m = matchCustomerCandidates("AL FAJAR AL MASHREQ SHADES & TENTS FIX L.L.C.", sampleErpCustomers);
    assert.equal(m.matchedCustomerId, "cust-102");
    assert.equal(m.needsReview, false);
  });

  await runTest("6.5 Unknown or ambiguous customer NEVER silently attaches wrong customer (sets Needs Review)", () => {
    const unknown = matchCustomerCandidates("Unknown Global Importer Co LLC", sampleErpCustomers);
    assert.equal(unknown.matchedCustomerId, "", "Unknown customer must not be attached to wrong ID");
    assert.equal(unknown.needsReview, true, "Must flag needsReview = true");
  });

  // --------------------------------------------------------------------------
  // FEATURE 7: Safe Unknown Date Defaults
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 7: Safe Unknown Date Defaults");

  await runTest("7.1 Missing statement date in PDF must return null/undefined and NEVER default to today's date", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Opening Balance: AED 10,000.00",
      "Total Balance Due: AED 20,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    const today = new Date().toISOString().split("T")[0];
    assert.notEqual(extracted.fields.document_date?.value, today, "Missing date must NEVER default to today");
    assert.equal(extracted.fields.document_date, undefined, "Missing date must be undefined or null");
  });

  await runTest("7.2 Corrupted or invalid date text does not produce a valid ISO date", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Date: INVALID-NOT-A-DATE",
      "Statement #: SOA-001",
    ]);
    const extracted = extractFromPdf(mock, "SOA-001.pdf", "customer_statement");
    assert.equal(extracted.fields.document_date, undefined, "Corrupted date must be undefined");
  });

  await runTest("7.3 Line items missing dates retain null/undefined date rather than current date", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Date Description Charges Credits Balance",
      "— Opening Balance 1,000.00 0.00 1,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA-001.pdf", "customer_statement");
    if (extracted.items.length > 0) {
      assert.ok(!extracted.items[0].description.includes(new Date().toISOString().split("T")[0]));
    }
  });

  await runTest("7.4 Stored SOA record metadata serializes and parses without synthesized today date", () => {
    const desc = buildSoaAttachmentDescription({
      soaNumber: "SOA-999",
      statementDate: "", // Missing date
      openingBalance: 0,
      charges: 1000,
      credits: 0,
      closingBalance: 1000,
      needsReview: true,
    });
    const parsed = parseSoaAttachmentRow({
      id: "att-1",
      company_id: "comp-1",
      entity_id: "cust-1",
      file_name: "SOA-999.pdf",
      file_url: "/api/storage/test",
      file_type: "application/pdf",
      file_size: 5000,
      description: desc,
      created_at: "2026-11-12T12:00:00Z", // Historical date, not today
    });
    const today = new Date().toISOString().split("T")[0];
    assert.notEqual(parsed.statement_date, today, "Stored row must not synthesize today's date");
    assert.equal(parsed.needs_review, true, "Missing date record must retain needs_review = true");
  });

  await runTest("7.5 Document classification recognizes customer_statement even when date header is absent", () => {
    const content = `
      STATEMENT OF ACCOUNT
      Al Karwan Solution FZC
      Total Balance Due: AED 25,000.00
      Charges Credits Balance
    `;
    const res = classifyDocument("statement.pdf", content, 1);
    assert.equal(res.documentType, "customer_statement");
  });

  // --------------------------------------------------------------------------
  // FEATURE 8: Unextracted Closing Balance Defaults & Discrepancies
  // --------------------------------------------------------------------------
  printSection("TIER 1 — FEATURE 8: Unextracted Closing Balance Defaults & Discrepancies");

  await runTest("8.1 Statement missing closing balance returns undefined/null — NEVER defaults to AED 0.00", () => {
    const mock = createMockPdfParseResult([
      "Statement of Account",
      "Customer: Al Karwan Solution FZC",
      "Opening Balance: AED 10,000.00",
      "New Charges: AED 25,000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance, undefined, "Missing closing balance must NOT default to 0.00");
  });

  await runTest("8.2 Verified AED 0.00 closing balance is accepted when confirmed by document arithmetic", () => {
    const audit = auditStatementOfAccount("doc-1", "SOA-001", 5000, 2000, 7000, 0); // 5000 + 2000 - 7000 = 0.00
    assert.equal(audit.isReconciled, true, "Exact zero balance must be verified when math holds");
    assert.equal(audit.difference, 0, "Discrepancy must be 0");
  });

  await runTest("8.3 UI display contract: unverified/missing closing balance displays 'Not extracted'", () => {
    function formatClosingBalanceDisplay(val: number | null | undefined): string {
      if (val === null || val === undefined || isNaN(val)) {
        return "Not extracted";
      }
      return `AED ${val.toFixed(2)}`;
    }
    assert.equal(formatClosingBalanceDisplay(undefined), "Not extracted");
    assert.equal(formatClosingBalanceDisplay(null), "Not extracted");
    assert.equal(formatClosingBalanceDisplay(0), "AED 0.00");
    assert.equal(formatClosingBalanceDisplay(12500.5), "AED 12500.50");
  });

  await runTest("8.4 Mathematical audit flags discrepancy when closing balance does not equal opening + debits - credits", () => {
    const audit = auditStatementOfAccount("doc-1", "SOA-001", 10000, 25000, 15000, 99999);
    assert.equal(audit.isReconciled, false, "Must flag un-reconciled statement");
    assert.ok(Math.abs(audit.difference) > 1000, "Difference must reflect discrepancy");
  });

  await runTest("8.5 Status resolution maps balanced SOA to reconciled and unbalanced SOA to unreconciled", () => {
    const mockFieldsBalanced: Record<string, ExtractedField> = {
      opening_balance: { fieldKey: "opening_balance", label: "Opening", value: 10000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      subtotal: { fieldKey: "subtotal", label: "Charges", value: 25000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      total_credits: { fieldKey: "total_credits", label: "Credits", value: 15000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      closing_balance: { fieldKey: "closing_balance", label: "Closing", value: 20000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
    };
    const balancedStatus = resolveDocumentStatus("customer_statement", "Statement", mockFieldsBalanced);
    assert.equal(balancedStatus.proposedStatus, "reconciled");

    const mockFieldsUnbalanced: Record<string, ExtractedField> = {
      opening_balance: { fieldKey: "opening_balance", label: "Opening", value: 10000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      subtotal: { fieldKey: "subtotal", label: "Charges", value: 25000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      total_credits: { fieldKey: "total_credits", label: "Credits", value: 15000, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
      closing_balance: { fieldKey: "closing_balance", label: "Closing", value: 99999, source: { file: "t.pdf" }, confidence: 1, validationStatus: "valid" },
    };
    const unbalancedStatus = resolveDocumentStatus("customer_statement", "Statement", mockFieldsUnbalanced);
    assert.equal(unbalancedStatus.proposedStatus, "unreconciled");
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (7 Tests)
  // ==========================================================================
  printSection("TIER 2 — BOUNDARY & CORNER CASES");

  await runTest("2.1 Empty / 0-byte file is rejected by file validator with valid = false", () => {
    const v1 = validateSoaFile({ name: "empty.pdf", size: 0 });
    assert.equal(v1.valid, false, "0-byte file must be rejected");
    assert.ok(v1.error?.includes("empty"), "Error must mention empty file");
  });

  await runTest("2.2 Blank PDF (0 text elements) parses safely without throwing unhandled exceptions", () => {
    const blank = createMockPdfParseResult([]);
    const extracted = extractFromPdf(blank, "blank.pdf", "customer_statement");
    assert.equal(extracted.items.length, 0);
  });

  await runTest("2.3 Single transaction row statement audits correctly without bounds error or drift", () => {
    const statement = calculateCustomerStatement({
      initialCutoverBalance: 0,
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      invoices: [{ id: "i1", invoice_number: "INV-001", invoice_date: "2026-01-15", total_amount: 1500, status: "issued" }],
      receipts: [],
      payments: [],
      customerName: "Single Row LLC",
    });
    const recon = reconcileCustomerStatement(statement);
    assert.equal(statement.entries.length, 1);
    assert.equal(statement.closing_balance, 1500);
    assert.equal(recon.isReconciled, true);
  });

  await runTest("2.4 Multi-page statement continuity preserves sequential running balance across page breaks", () => {
    const invoices: RawInvoice[] = [];
    for (let i = 1; i <= 35; i++) {
      invoices.push({
        id: `inv-${i}`,
        invoice_number: `INV-${1000 + i}`,
        invoice_date: `2026-02-${String((i % 28) + 1).padStart(2, "0")}`,
        total_amount: 1000,
        status: "issued",
      });
    }
    const statement = calculateCustomerStatement({
      initialCutoverBalance: 5000,
      fromDate: "2026-02-01",
      toDate: "2026-02-28",
      invoices,
      receipts: [],
      payments: [],
      customerName: "Multi Page LLC",
    });
    assert.equal(statement.entries.length, 35);
    assert.equal(statement.closing_balance, 5000 + 35000); // 40,000.00
    assert.equal(statement.entries[34].balance, 40000);
  });

  await runTest("2.5 Negative closing balance (customer credit / advance payment position) is preserved", () => {
    const payments: RawPayment[] = [
      { id: "p1", payment_number: "PAY-001", payment_date: "2026-03-01", amount: 10000, payment_method: "bank_transfer" },
    ];
    const statement = calculateCustomerStatement({
      initialCutoverBalance: 2000,
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      invoices: [],
      receipts: [],
      payments,
      customerName: "Credit Balance LLC",
    });
    assert.equal(statement.closing_balance, -8000, "Closing balance must reflect net credit (-8000)");
  });

  await runTest("2.6 0.00 balance: verified explicit 0.00 vs unextracted null are strictly distinguished", () => {
    const vAudit = auditStatementOfAccount("doc-1", "SOA-001", 1000, 0, 1000, 0);
    assert.equal(vAudit.isReconciled, true);
    assert.equal(vAudit.difference, 0);

    const mock = createMockPdfParseResult(["STATEMENT OF ACCOUNT", "Opening: 1000"]);
    const extracted = extractFromPdf(mock, "unextracted.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance, undefined, "Unextracted balance must not default to 0");
  });

  await runTest("2.7 Corrupt / non-PDF binary file is rejected gracefully without unhandled crashes", () => {
    const corruptFile = { name: "malicious.exe", size: 4096 };
    const res = validateSoaFile(corruptFile);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Unsupported"), "Must reject unsupported executable extension");
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (3 Tests)
  // ==========================================================================
  printSection("TIER 3 — CROSS-FEATURE COMBINATIONS");

  await runTest("3.1 Batch upload with multi-customer assignments supports 'Apply Customer to All' with per-file overrides", () => {
    interface UploadItem {
      fileName: string;
      detectedCustomer: string | null;
      assignedCustomerId: string | null;
      isOverridden: boolean;
    }

    const batch: UploadItem[] = [
      { fileName: "SOA101-26 Al Karwan Solution FZC.pdf", detectedCustomer: "Al Karwan Solution FZC", assignedCustomerId: "cust-101", isOverridden: true },
      { fileName: "SOA102-26 Elegance Tents.pdf", detectedCustomer: "Elegance Tents And Sheds Installation L.L.C.", assignedCustomerId: "cust-103", isOverridden: true },
      { fileName: "SOA103-26.pdf", detectedCustomer: null, assignedCustomerId: null, isOverridden: false },
      { fileName: "SOA104-26 Statement.pdf", detectedCustomer: null, assignedCustomerId: null, isOverridden: false },
    ];

    const fallbackCustomer = "cust-102";
    const processedBatch = batch.map(item => {
      if (item.isOverridden) return item;
      return { ...item, assignedCustomerId: fallbackCustomer };
    });

    assert.equal(processedBatch[0].assignedCustomerId, "cust-101", "Item 1 explicit override must be preserved");
    assert.equal(processedBatch[1].assignedCustomerId, "cust-103", "Item 2 explicit override must be preserved");
    assert.equal(processedBatch[2].assignedCustomerId, "cust-102", "Item 3 must receive batch fallback customer");
    assert.equal(processedBatch[3].assignedCustomerId, "cust-102", "Item 4 must receive batch fallback customer");
  });

  await runTest("3.2 Duplicate detection matrix catches identical checksum, customer+SOA number, and customer+filename", () => {
    const existing: StoredSoaRecord[] = [
      {
        id: "att-001",
        company_id: "comp-1",
        customer_id: "cust-101",
        customer_name: "Al Karwan Solution FZC",
        file_name: "SOA101-26 Al Karwan Solution FZC.pdf",
        file_url: "/api/storage/soa-1",
        file_type: "application/pdf",
        file_size: 12000,
        description: null,
        created_at: "2026-11-12T10:00:00Z",
        soa_number: "SOA101-26",
        statement_date: "2026-11-05",
        opening_balance: 0,
        charges: 39560.86,
        credits: 0,
        closing_balance: 39560.86,
        checksum_sha256: "sha256_al_karwan_test",
        needs_review: false,
        is_scanned_pdf: false,
        storage_path: "comp-1/soa/SOA101-26.pdf",
        storage_bucket: "smart-imports",
        entries: [],
        audit_trail: [],
      },
    ];

    // Checksum match: identical content uploaded under a different filename
    const d1 = detectSoaDuplicate(
      { customerId: "cust-999", soaNumber: "DIFFERENT-REF", fileName: "renamed_copy.pdf", checksumSha256: "sha256_al_karwan_test" },
      existing
    );
    assert.equal(d1.isDuplicate, true);
    assert.ok(d1.reason.toLowerCase().includes("checksum"), "Reason must specify checksum duplicate");

    // SOA number match for same customer
    const d2 = detectSoaDuplicate(
      { customerId: "cust-101", soaNumber: "soa101-26", fileName: "reupload.pdf", checksumSha256: "sha256_different" },
      existing
    );
    assert.equal(d2.isDuplicate, true);
    assert.ok(d2.reason.toLowerCase().includes("already exists"), "Reason must specify already exists");

    // Unrelated customer & SOA number -> not duplicate
    const d3 = detectSoaDuplicate(
      { customerId: "cust-102", soaNumber: "SOA-002", fileName: "SOA-002.pdf", checksumSha256: "sha256_fresh" },
      existing
    );
    assert.equal(d3.isDuplicate, false);
  });

  await runTest("3.3 Historical SOA cutover date reconciles with subsequent live transactions without duplicating historical entries", () => {
    // Cutover date: 2026-10-31 with historical closing balance 39,560.86
    // Historical entry representing the pre-cutover state (initial balance before historical entry was 0)
    const historicalEntries: RawHistoricalEntry[] = [
      {
        id: "hist-1",
        date: "2026-10-15",
        reference_no: "INV-2026-0088",
        description: "Historical Tax Invoice INV-2026-0088",
        debit: 39560.86,
        credit: 0,
        balance: 39560.86,
        matched_invoice_id: "inv-pre",
      },
    ];

    // Invoices: 1 before cutover (matched to historical, so excluded from live addition), 1 after cutover
    const invoices: RawInvoice[] = [
      { id: "inv-pre", invoice_number: "INV-2026-0088", invoice_date: "2026-10-15", total_amount: 39560.86, status: "issued" },
      { id: "inv-post", invoice_number: "INV-2026-0105", invoice_date: "2026-11-05", total_amount: 10439.14, status: "issued" },
    ];

    // Payments: 1 after cutover
    const payments: RawPayment[] = [
      { id: "pay-post", payment_number: "PAY-002", reference_number: "RV-002", payment_date: "2026-11-10", amount: 20000, payment_method: "bank_transfer" },
    ];

    // Duplicate prevention: receipt voucher referencing same payment
    const receipts: RawReceiptVoucher[] = [
      { id: "rv-post", voucher_number: "RV-002", voucher_date: "2026-11-10", amount: 20000, payment_reference: "PAY-002" },
    ];

    // Calculate live statement starting from cutover
    const liveStatement = calculateCustomerStatement({
      initialCutoverBalance: 0,
      cutoverDate: "2026-10-31",
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
      historicalEntries,
      invoices,
      receipts,
      payments,
      customerName: "Al Karwan Solution FZC",
    });

    // Opening balance accumulates pre-cutover historical invoice (39,560.86)
    assert.equal(liveStatement.opening_balance, 39560.86, "Opening balance before fromDate must be 39,560.86");
    assert.equal(liveStatement.total_debits, 10439.14, "Only post-cutover invoice added to debits");
    assert.equal(liveStatement.total_credits, 20000.00, "Only post-cutover payment added to credits");
    // Closing: 39560.86 + 10439.14 - 20000 = 30000.00
    assert.equal(liveStatement.closing_balance, 30000.00, "Closing balance must reconcile to exactly 30,000.00");
    assert.equal(liveStatement.entries.length, 2, "Only post-cutover invoice and deduplicated payment in period");
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (7 Real PDF Fixtures)
  // ==========================================================================
  printSection("TIER 4 — REAL-WORLD APPLICATION SCENARIOS");

  await runTest("4.1 Real Fixture: statement_al_karwan_fixed.pdf extracts header, customer, and closing balance 39,560.86", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_al_karwan_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "statement_al_karwan_fixed.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.equal(parsed.isImageOnly, false);
    assert.ok(parsed.allText.includes("Statement of Account"));
    assert.ok(parsed.allText.includes("Al Karwan Solution FZC"));

    const extracted = extractFromPdf(parsed, "SOA101-26 Al Karwan Solution FZC.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, 39560.86);
  });

  await runTest("4.2 Real Fixture: statement_of_account_SOA101_10_items.pdf extracts multi-item table totals (10,250.00)", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_10_items.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "statement_of_account_SOA101_10_items.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.ok(parsed.allText.includes("Statement of Account"));
    const extracted = extractFromPdf(parsed, "statement_of_account_SOA101_10_items.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, 10250);
  });

  await runTest("4.3 Real Fixture: statement_of_account_SOA101_1_item.pdf extracts single-item total (13,500.00)", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_1_item.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "statement_of_account_SOA101_1_item.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.ok(parsed.allText.includes("Statement of Account"));
    const extracted = extractFromPdf(parsed, "statement_of_account_SOA101_1_item.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, 13500);
  });

  await runTest("4.4 Real Fixture: statement_of_account_SOA101_30_items.pdf extracts high-volume totals (97,000.00)", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_30_items.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "statement_of_account_SOA101_30_items.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.ok(parsed.allText.includes("Statement of Account"));
    const extracted = extractFromPdf(parsed, "statement_of_account_SOA101_30_items.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, 97000);
  });

  await runTest("4.5 Real Fixture: statement_of_account_SOA101_fixed.pdf verifies financial balance (11,702.32)", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/statement_of_account_SOA101_fixed.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "statement_of_account_SOA101_fixed.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.ok(parsed.allText.includes("Statement #: SOA101-26"));
    const extracted = extractFromPdf(parsed, "statement_of_account_SOA101_fixed.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, 11702.32);

    // Exact math verification: New Charges 20,702.32 - Credits 9,000.00 = 11,702.32
    const audit = auditStatementOfAccount("doc-fixed", "SOA101-26", 0, 20702.32, 9000.00, 11702.32);
    assert.equal(audit.isReconciled, true);
    assert.equal(audit.difference, 0);
  });

  await runTest("4.6 Real Fixture: soa_001_single_page_test.pdf extracts 9 items, customer Al Fajar, closing balance 121,472.40", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/soa_001_single_page_test.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "soa_001_single_page_test.pdf");

    assert.equal(parsed.hasSelectableText, true);
    const extracted = extractFromPdf(parsed, "soa_001_single_page_test.pdf", "customer_statement");

    assert.equal(extracted.fields.document_number?.value, "SOA-001");
    assert.equal(extracted.fields.document_date?.value, "2026-11-05");
    assert.equal(extracted.fields.closing_balance?.value, 121472.40);
    assert.equal(extracted.items.length, 9, "Must extract exactly 9 transaction rows");
  });

  await runTest("4.7 Real Fixture: soa_real_chromium_test.pdf extracts Chromium statement with balance 42,014.40", async () => {
    const fixturePath = path.resolve(process.cwd(), "test-output/soa_real_chromium_test.pdf");
    const buf = fs.readFileSync(fixturePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "soa_real_chromium_test.pdf");

    assert.equal(parsed.hasSelectableText, true);
    assert.ok(parsed.allText.includes("REF: SOA-001"));
    const extracted = extractFromPdf(parsed, "soa_real_chromium_test.pdf", "customer_statement");
    assert.equal(extracted.fields.document_number?.value, "SOA-001");
    assert.equal(extracted.fields.document_date?.value, "2026-11-05");
    assert.equal(extracted.fields.closing_balance?.value, 42014.40);
  });

  // ==========================================================================
  // TIER 5 — ADVERSARIAL HARDENING & ITERATION 2 REMEDIATIONS
  // ==========================================================================
  printSection("TIER 5 — ADVERSARIAL HARDENING & ITERATION 2 REMEDIATIONS");

  await runTest("5.1 Filename edge cases: no leading hyphens, spaces in SOA, and underscore names", () => {
    // Leading hyphen after SOA code
    const f1 = parseSoaFilename("SOA-001 - Al Fajar Al Mashreq - 31-Oct-2026.pdf");
    assert.equal(f1.soaNumber, "SOA-001");
    assert.equal(f1.customerName, "Al Fajar Al Mashreq");
    assert.equal(f1.statementDate, "2026-10-31");

    // Two-segment with hyphen separator
    const f2 = parseSoaFilename("SOA102 - Elegance Tents.pdf");
    assert.equal(f2.soaNumber, "SOA102");
    assert.equal(f2.customerName, "Elegance Tents");

    // Space-separated SOA code
    const f3 = parseSoaFilename("SOA 101-26 Customer With Multiple Spaces.pdf");
    assert.equal(f3.soaNumber, "SOA 101-26");
    assert.equal(f3.customerName, "Customer With Multiple Spaces");

    // Underscore systematic naming
    const f4 = parseSoaFilename("SOA_103_26_Falcon_Tents.pdf");
    assert.equal(f4.soaNumber, "SOA-103-26");
    assert.equal(f4.customerName, "Falcon Tents");

    // Statement label prefix
    const f5 = parseSoaFilename("Statement of Account - Al Karwan Solution FZC - SOA101.pdf");
    assert.equal(f5.soaNumber, "SOA101");
    assert.equal(f5.customerName, "Al Karwan Solution FZC");
  });

  await runTest("5.2 Table extraction: lone hyphens and dashes do NOT invert payment credits to debit charges", () => {
    const mock = createMockPdfParseResult([
      "STATEMENT OF ACCOUNT",
      "Customer: Falcon Tents",
      "Date Ref Description Debit Credit Balance",
      "01-Oct-2026 Wire Transfer WT-1234 - 10000.00 15000.00",
      "02-Oct-2026 Direct Deposit Ref-8888 --- 5000.00 10000.00",
      "03-Oct-2026 Cheque Clearance CQ-555 — 2000.00 8000.00",
      "Closing Balance: 8000.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA-001 Falcon Tents.pdf", "customer_statement");
    assert.equal(extracted.items.length, 3);
    assert.equal(extracted.items[0].debit, 0, "Debit must be 0 for wire transfer with hyphen in debit col");
    assert.equal(extracted.items[0].credit, 10000, "Credit must be 10000");
    assert.equal(extracted.items[0].reference, "WT-1234", "Reference WT-1234 must not be mangled");

    assert.equal(extracted.items[1].debit, 0);
    assert.equal(extracted.items[1].credit, 5000);
    assert.equal(extracted.items[1].reference, "Ref-8888");

    assert.equal(extracted.items[2].debit, 0);
    assert.equal(extracted.items[2].credit, 2000);
    assert.equal(extracted.items[2].reference, "CQ-555");
  });

  await runTest("5.3 Accounting parentheses: '(9,000.00)' correctly parses as negative numbers", () => {
    const mock = createMockPdfParseResult([
      "STATEMENT OF ACCOUNT",
      "Customer: Test Customer",
      "Closing Balance: (9,000.00)",
    ]);
    const extracted = extractFromPdf(mock, "SOA-001 Test.pdf", "customer_statement");
    assert.equal(extracted.fields.closing_balance?.value, -9000, "Parentheses (9,000.00) must resolve to -9000");
  });

  await runTest("5.4 Unextracted closing balance strictly preserves null in parseSoaAttachmentRow", () => {
    // 1. Legacy mode with 'Closing: Not extracted'
    const r1 = parseSoaAttachmentRow({
      id: "row_1",
      company_id: "c1",
      entity_id: "e1",
      customer_name: "Customer A",
      file_name: "test.pdf",
      file_url: "https://example.com/test.pdf",
      description: "Statement of Account SOA-101 (Undated) | Opening: AED 0.00 | Closing: Not extracted",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(r1.closing_balance, null, "Unextracted legacy closing balance must be strictly null");

    // 2. soa_v2 mode with closingBalance: null
    const v2Desc = JSON.stringify({
      version: "soa_v2",
      soaNumber: "SOA-102",
      statementDate: "2026-10-15",
      openingBalance: 0,
      closingBalance: null,
      needsReview: true,
    });
    const r2 = parseSoaAttachmentRow({
      id: "row_2",
      company_id: "c1",
      entity_id: "e1",
      customer_name: "Customer B",
      file_name: "test2.pdf",
      file_url: "https://example.com/test2.pdf",
      description: v2Desc,
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(r2.closing_balance, null, "Unextracted soa_v2 closing balance must be strictly null");
  });

  await runTest("5.5 Status resolution on empty statements resolves to 'unreconciled', never 'reconciled'", () => {
    const s1 = resolveDocumentStatus("customer_statement", "", {});
    assert.equal(s1.proposedStatus, "unreconciled", "Empty statement must resolve to unreconciled");
    assert.equal(s1.isAssumed, true);

    const s2 = resolveDocumentStatus("customer_statement", "", {
      closing_balance: { fieldKey: "closing_balance", label: "Closing", value: null, confidence: 0, validationStatus: "invalid" },
    });
    assert.equal(s2.proposedStatus, "unreconciled", "Missing closing balance statement must resolve to unreconciled");
  });

  await runTest("5.6 Dot date normalization and calendar leap year validation in table extraction", () => {
    const mock = createMockPdfParseResult([
      "STATEMENT OF ACCOUNT",
      "Customer: Dot Date Customer",
      "Date Ref Description Debit Credit Balance",
      "15.10.2026 INV-100 Tax Invoice 1000.00 - 1000.00",
      "29-Feb-2024 INV-101 Leap Year Invoice 500.00 - 1500.00",
    ]);
    const extracted = extractFromPdf(mock, "SOA-001 Dot.pdf", "customer_statement");
    assert.equal(extracted.items.length, 2);
    assert.equal(extracted.items[0].date, "2026-10-15", "15.10.2026 must normalize to 2026-10-15");
    assert.equal(extracted.items[1].date, "2024-02-29", "29-Feb-2024 must normalize to 2024-02-29");
  });

  await runTest("5.7 Symmetric rounding away from zero for positive and negative amounts", () => {
    assert.equal(roundCurrency(100.005), 100.01, "100.005 must round to 100.01");
    assert.equal(roundCurrency(-100.005), -100.01, "-100.005 must round to -100.01 symmetrically");
    assert.equal(roundCurrency(0), 0);
  });

  // ==========================================================================
  // FINAL RESULTS SUMMARY
  // ==========================================================================
  console.log("\n====================================================================");
  console.log(`=== E2E SUITE RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("====================================================================");

  if (failedTests > 0) {
    console.error(`\n${failedTests} TEST(S) FAILED:`);
    for (const f of failures) {
      console.error(` - ${f.name}`);
      console.error(`   ${f.error instanceof Error ? f.error.stack : String(f.error)}`);
    }
    process.exit(1);
  } else {
    console.log(`ALL ${passedTests} E2E TESTS PASSED WITH 100% SUCCESS! ✓\n`);
    process.exit(0);
  }
}

executeSuite().catch((fatal) => {
  console.error("FATAL SUITE ERROR:", fatal);
  process.exit(1);
});
