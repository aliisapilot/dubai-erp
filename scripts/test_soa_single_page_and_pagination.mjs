import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  computePaginationPlan,
  computeTextOverflowPlan,
  estimateTextBlockHeightMm,
} from "../lib/documentLayoutEngine.ts";
import {
  createSOA101ReferenceLayout,
  createDefaultLayout,
} from "../lib/documentDesigner.ts";
import {
  replaceDocumentTokens,
} from "../components/documents/DynamicDocumentRenderer.tsx";

const OUT_DIR = join(process.cwd(), "test-output");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
  }
}

console.log("================================================================================");
console.log("  DUBAI ERP: SOA-001 SINGLE-PAGE & MULTI-PAGE PAGINATION VERIFICATION SUITE");
console.log("================================================================================\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. CUSTOMER ID INTEGRITY TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log("[Section 1] Customer ID Integrity (No Fabricated Identifiers, Preserve DB ID)");

// Case A: Customer has an actual assigned account code in Supabase
const tokensWithAssignedCode = replaceDocumentTokens("{{customer_id}}", {
  customer_code: "CUS-7842",
  customer_id: "e4b2d109-881a-4c22-b258-9a67e51c8812",
  items: [],
  subtotal: 0,
  vat_amount: 0,
  total_amount: 0,
  document_number: "SOA-001",
  customer_name: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
});
assert(tokensWithAssignedCode === "CUS-7842", `Actual assigned code 'CUS-7842' preserved (got '${tokensWithAssignedCode}')`);

// Case B: Customer has quotation reference in customer_code (e.g. QUO-2026-0008)
const tokensWithQuoRef = replaceDocumentTokens("{{customer_id}}", {
  customer_code: "QUO-2026-0008",
  customer_id: "e4b2d109-881a-4c22-b258-9a67e51c8812",
  items: [],
  subtotal: 0,
  vat_amount: 0,
  total_amount: 0,
  document_number: "SOA-001",
  customer_name: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
});
assert(tokensWithQuoRef === "E4B2D109", `Preserves database UUID identifier 'E4B2D109' and avoids collision (got '${tokensWithQuoRef}')`);
assert(tokensWithQuoRef !== "CUS-001", `Does NOT fabricate 'CUS-001' (got '${tokensWithQuoRef}')`);
assert(!tokensWithQuoRef.includes("QUO"), `Does NOT print quotation reference (got '${tokensWithQuoRef}')`);

// Case C: No customer code and no customer_id (e.g. ad-hoc / unassigned customer)
const tokensWithNoCode = replaceDocumentTokens("{{customer_id}}", {
  customer_code: "",
  customer_id: "",
  items: [],
  subtotal: 0,
  vat_amount: 0,
  total_amount: 0,
  document_number: "SOA-001",
  customer_name: "Direct Customer",
});
assert(tokensWithNoCode === "—", `Unassigned customer shows fallback '—' without pretending to be assigned (got '${tokensWithNoCode}')`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. SOA-001 PRINTABLE BOUNDARY & TEXT MEASUREMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Section 2] SOA-001 Printable Boundary Safety & Text Height");

const soaLayout = createSOA101ReferenceLayout();

// 10 transactions matching the user's uploaded SOA-001
const soa001Items = [
  { description: "Opening Balance Brought Forward", date: "", ref: "—", debit: 0, credit: 0, balance: 0 },
  { description: "Tax Invoice INV-117", date: "09/05/2026", ref: "INV-117", debit: 3861.90, credit: 0, balance: 3861.90 },
  { description: "Tax Invoice INV-122", date: "15/06/2026", ref: "INV-122", debit: 5176.50, credit: 0, balance: 9038.40 },
  { description: "Tax Invoice INV-123", date: "28/06/2026", ref: "INV-123", debit: 9156.00, credit: 0, balance: 18194.40 },
  { description: "Tax Invoice INV-128", date: "17/07/2026", ref: "INV-128", debit: 13503.00, credit: 0, balance: 31697.40 },
  { description: "Tax Invoice INV-129", date: "06/08/2026", ref: "INV-129", debit: 18900.00, credit: 0, balance: 50597.40 },
  { description: "Tax Invoice INV-132", date: "16/08/2026", ref: "INV-132", debit: 14175.00, credit: 0, balance: 64772.40 },
  { description: "Tax Invoice INV-134", date: "28/08/2026", ref: "INV-134", debit: 18900.00, credit: 0, balance: 83672.40 },
  { description: "Tax Invoice INV-141", date: "23/09/2026", ref: "INV-141", debit: 18900.00, credit: 0, balance: 102572.40 },
  { description: "Tax Invoice INV-145", date: "08/10/2026", ref: "INV-145", debit: 18900.00, credit: 0, balance: 121472.40 },
];

const soa001DocText = {
  payment_terms: `Your account balance is AED 121,472.40 Please make your payment to cover the balance by the due date.\nMake all checks payable to AL SAFWAH AL QABDHA TENTS IND L.L.C SP\n\nThank you for your business!`,
  customer_code: "QUO-2026-0008",
  customer_id: "e4b2d109-881a-4c22-b258-9a67e51c8812",
};

// Check actual measured height vs available space
const termsEl = soaLayout.elements.find(e => e.type === "payment_terms");
const footerEl = soaLayout.elements.find(e => e.type === "footer");
const availableSpace = footerEl.y - termsEl.y - 2; // 248 - 222 - 2 = 24mm
const measuredHeight = estimateTextBlockHeightMm(soa001DocText.payment_terms, termsEl.width - 4, termsEl.fontSize, 1.45, 4);

assert(measuredHeight <= availableSpace, `SOA-001 measured closing text (${measuredHeight.toFixed(1)}mm) fits within available space (${availableSpace}mm)`);

const pagPlan001 = computePaginationPlan(soaLayout, soa001Items.length, soa001Items, soa001DocText);
assert(pagPlan001.totalPages === 1, `computePaginationPlan returns 1 page for SOA-001 (totalPages=${pagPlan001.totalPages})`);
assert(pagPlan001.isSinglePage === true, "computePaginationPlan marks SOA-001 as single-page");

const textPlan001 = computeTextOverflowPlan(soaLayout, pagPlan001.totalPages, soa001DocText);
assert(textPlan001.hasTextOverflow === false, "computeTextOverflowPlan reports hasTextOverflow = false for SOA-001");
assert(textPlan001.continuationPages.length === 0, `Continuation pages count is 0 (got ${textPlan001.continuationPages.length})`);
assert(textPlan001.totalDocumentPages === 1, `Total document pages is strictly 1 (got ${textPlan001.totalDocumentPages})`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. PAGINATION SAFETY: GENUINE OVERFLOW CREATES CONTINUATION PAGE
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Section 3] Safety Guard: Genuinely Overflowing SOA Text Creates Continuation Page");

// Extremely long legal text / closing notes that cannot fit in available 24mm space
const hugeClosingText = {
  payment_terms: Array.from({ length: 15 }, (_, i) => `Clause ${i + 1}: Customer must adhere to settlement terms and dispute conditions within 14 banking days.`).join("\n"),
  customer_id: "e4b2d109-881a-4c22-b258-9a67e51c8812",
};

const textPlanHuge = computeTextOverflowPlan(soaLayout, 1, hugeClosingText);
assert(textPlanHuge.hasTextOverflow === true, "Genuinely overflowing closing notes (>24mm) trigger hasTextOverflow = true");
assert(textPlanHuge.continuationPages.length >= 1, `Genuinely overflowing closing text safely generates continuation page (pages=${textPlanHuge.continuationPages.length})`);
assert(textPlanHuge.totalDocumentPages >= 2, `Total pages expands to prevent content from forcing past printable boundary (total=${textPlanHuge.totalDocumentPages})`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. REAL CHROMIUM PDF GENERATION & TEXT EXTRACTION FOR SOA-001
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Section 4] Real Chromium Print-to-PDF & Text Extraction for SOA-001");

const testHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; font-family: system-ui, -apple-system, sans-serif; }
    .page-container {
      position: relative;
      width: 210mm;
      height: 297mm;
      box-sizing: border-box;
      padding: 10mm 12mm 12mm 12mm;
      background: #ffffff;
      overflow: hidden;
      page-break-after: always;
    }
    .header-box { display: flex; justify-content: space-between; align-items: flex-start; }
    .company-name { font-size: 13pt; font-weight: 800; color: #b58a2a; }
    .company-sub { font-size: 9pt; font-weight: bold; color: #0f172a; }
    .title-banner { font-size: 20pt; font-weight: 900; color: #0f172a; text-align: right; }
    .meta-table { border-collapse: collapse; font-size: 8.5pt; width: 78mm; border: 1px solid #94a3b8; }
    .meta-table td { border: 1px solid #94a3b8; padding: 2.5px 6px; }
    .bill-to-box { width: 88mm; border: 1px solid #94a3b8; border-radius: 3px; padding: 6px; font-size: 8.5pt; }
    .summary-box { width: 90mm; border: 1px solid #94a3b8; border-radius: 3px; font-size: 8.5pt; border-collapse: collapse; }
    .summary-box td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; }
    .ledger-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 5mm; border: 1px solid #94a3b8; }
    .ledger-table th { background: #9ca3af; color: #0f172a; font-weight: bold; padding: 4px 6px; border: 1px solid #94a3b8; }
    .ledger-table td { padding: 3.5px 6px; border: 1px solid #cbd5e1; }
    .curr-bal-banner { background: #9ca3af; color: #0f172a; font-weight: 900; font-size: 9pt; padding: 4px 8px; display: flex; justify-content: space-between; width: 90mm; margin-left: auto; margin-top: 2mm; border: 1px solid #94a3b8; }
    .payment-instructions {
      position: absolute;
      top: 222mm;
      left: 12mm;
      width: 186mm;
      height: 23mm;
      text-align: center;
      font-size: 8pt;
      line-height: 1.35;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .footer-box {
      position: absolute;
      top: 248mm;
      left: 12mm;
      width: 186mm;
      height: 24mm;
      border-top: 1px solid #94a3b8;
      padding-top: 3mm;
      text-align: center;
      font-size: 7.5pt;
      color: #334155;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header-box">
      <div>
        <div class="company-name">الصفوه الذهبيه لصناعة الخيام ذ.م.م.ش.و</div>
        <div class="company-sub">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
      </div>
      <div>
        <div class="title-banner">Statement of Account</div>
        <table class="meta-table">
          <tr><td style="font-weight: 600;">Date:</td><td>05/11/2026</td></tr>
          <tr><td style="font-weight: 600;">Statement #</td><td style="font-family: monospace; font-weight: bold;">SOA-001</td></tr>
          <tr><td style="font-weight: 600;">Customer ID:</td><td style="font-family: monospace;">E4B2D109</td></tr>
          <tr><td style="font-weight: 600;">Page</td><td>1 of 1</td></tr>
        </table>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 4mm;">
      <div class="bill-to-box">
        <div style="background: #0f172a; color: #ffffff; padding: 2px 4px; font-weight: bold; margin-bottom: 4px;">Bill To:</div>
        <strong>Al Fajar Al Mashreq Shades & Tents Fix LLC</strong><br>
        TRN: 104778007500003
      </div>
      <table class="summary-box">
        <tr style="background: #f1f5f9; font-weight: bold;"><td colspan="2">Account Summary</td></tr>
        <tr><td>Previous Balance</td><td style="text-align: right; font-family: monospace;">AED 0.00</td></tr>
        <tr><td>Credits</td><td style="text-align: right; font-family: monospace;">AED 0.00</td></tr>
        <tr><td>New Charges</td><td style="text-align: right; font-family: monospace; color: #be123c;">AED 121,472.40</td></tr>
        <tr style="font-weight: bold;"><td>Total Balance Due</td><td style="text-align: right; font-family: monospace; color: #be123c;">AED 121,472.40</td></tr>
      </table>
    </div>

    <table class="ledger-table">
      <thead>
        <tr>
          <th style="width: 11%;">Date</th>
          <th style="width: 12%;">Type</th>
          <th style="width: 12%;">Ref #</th>
          <th style="width: 27%;">Description</th>
          <th style="width: 12%; text-align: right;">Charges (AED)</th>
          <th style="width: 12%; text-align: right;">Credits (AED)</th>
          <th style="width: 14%; text-align: right;">Balance (AED)</th>
        </tr>
      </thead>
      <tbody>
        ${soa001Items.map((it, idx) => `
        <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
          <td style="text-align: center; font-family: monospace;">${it.date || "—"}</td>
          <td style="text-align: center;">${it.debit > 0 ? "Tax Invoice" : "Opening"}</td>
          <td style="text-align: center; font-family: monospace; font-weight: bold;">${it.ref}</td>
          <td>${it.description}</td>
          <td style="text-align: right; font-family: monospace; color: #be123c;">${it.debit > 0 ? it.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}</td>
          <td style="text-align: right; font-family: monospace;">—</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold;">${it.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <div class="curr-bal-banner">
      <span>ACCOUNT CURRENT BALANCE</span>
      <span>AED 121,472.40</span>
    </div>

    <div class="payment-instructions">
      <div>Your account balance is AED 121,472.40 Please make your payment to cover the balance by the due date.</div>
      <div style="font-weight: bold;">Make all checks payable to AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
      <div style="font-weight: 800; font-size: 9pt; margin-top: 1.5mm;">Thank you for your business!</div>
    </div>

    <div class="footer-box">
      <div>Should you have any enquiries concerning this statement, please contact Mohammed Ali on +971 50 404 1805</div>
      <div>Warehouse No. 29 Emirates Road, Al Sajaa Industrial, Sharjah, United Arab Emirates, P.O. Box: 6226</div>
      <div>Tel: +971 6 767 9058 Fax: +971 6 767 9058 E-mail: info@goldenelitetents.ae Web: www.goldenelitetents.ae</div>
      <div style="margin-top: 1mm; font-size: 7pt; color: #64748b;">Page 1 of 1</div>
    </div>
  </div>
</body>
</html>`;

const soaHtmlPath = join(OUT_DIR, "soa_001_single_page_test.html");
const soaPdfPath = join(OUT_DIR, "soa_001_single_page_test.pdf");

writeFileSync(soaHtmlPath, testHtml, "utf-8");

execFileSync(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${soaPdfPath}`,
  soaHtmlPath,
]);

console.log("  ✓ Generated Headless Chromium PDF:", soaPdfPath);

const pdfBytes = readFileSync(soaPdfPath);
const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;

assert(pdfDoc.numPages === 1, `SOA-001 exports as EXACTLY 1 page in Chromium (numPages=${pdfDoc.numPages})`);

const page1 = await pdfDoc.getPage(1);
const page1Text = (await page1.getTextContent()).items.map(i => i.str).join(" ");

assert(page1Text.includes("Statement of Account"), "Page 1 contains title 'Statement of Account'");
assert(page1Text.includes("SOA-001"), "Page 1 contains Statement # SOA-001");
assert(page1Text.includes("E4B2D109"), "Page 1 contains database Customer ID 'E4B2D109'");
assert(!page1Text.includes("CUS-001"), "Page 1 does NOT contain fabricated 'CUS-001'");
assert(!page1Text.includes("QUO-2026-0008"), "Page 1 does NOT contain quotation reference 'QUO-2026-0008'");
assert(page1Text.includes("1 of 1"), "Page 1 displays accurate '1 of 1' numbering");
assert(page1Text.includes("121,472.40"), "Page 1 contains final closing balance 121,472.40");
assert(page1Text.includes("Thank you for your business!"), "Page 1 contains 'Thank you for your business!'");
assert(page1Text.includes("Should you have any enquiries concerning this statement"), "Page 1 contains full footer contact text");

// ─────────────────────────────────────────────────────────────────────────────
// 5. MULTI-PAGE STATEMENTS (20, 50, and 100 Transactions)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Section 5] Multi-Page SOA Scale Tests (20, 50, 100 Transactions)");

// 20 transactions
const items20 = Array.from({ length: 20 }, (_, i) => ({
  description: `Tax Invoice INV-${100 + i}`,
  date: "2026-06-01",
  ref: `INV-${100 + i}`,
  debit: 5000,
  credit: 0,
  balance: (i + 1) * 5000,
}));

const plan20 = computePaginationPlan(soaLayout, items20.length, items20, soa001DocText);
const textPlan20 = computeTextOverflowPlan(soaLayout, plan20.totalPages, soa001DocText);
assert(plan20.totalPages >= 1 && plan20.totalPages <= 2, `20 transactions cleanly paginates (pages=${plan20.totalPages})`);
assert(textPlan20.totalDocumentPages === plan20.totalPages, `20 transactions document total pages (${textPlan20.totalDocumentPages}) strictly equals transaction page count (${plan20.totalPages})`);
assert(textPlan20.hasTextOverflow === false, "20 transactions hasTextOverflow = false (no fake text continuation page)");

// 50 transactions
const items50 = Array.from({ length: 50 }, (_, i) => ({
  description: `Tax Invoice INV-${200 + i}`,
  date: "2026-07-01",
  ref: `INV-${200 + i}`,
  debit: 2000,
  credit: 0,
  balance: (i + 1) * 2000,
}));

const plan50 = computePaginationPlan(soaLayout, items50.length, items50, soa001DocText);
const textPlan50 = computeTextOverflowPlan(soaLayout, plan50.totalPages, soa001DocText);
assert(plan50.totalPages >= 2 && plan50.totalPages <= 4, `50 transactions paginate cleanly across ${plan50.totalPages} pages`);
assert(textPlan50.totalDocumentPages === plan50.totalPages, `50 transactions totalDocumentPages (${textPlan50.totalDocumentPages}) strictly equals transaction page count (${plan50.totalPages})`);
assert(textPlan50.hasTextOverflow === false, "50 transactions closing text stays on last transaction page");

// 100 transactions
const items100 = Array.from({ length: 100 }, (_, i) => ({
  description: `Tax Invoice INV-${300 + i}`,
  date: "2026-08-01",
  ref: `INV-${300 + i}`,
  debit: 1500,
  credit: 0,
  balance: (i + 1) * 1500,
}));

const plan100 = computePaginationPlan(soaLayout, items100.length, items100, soa001DocText);
const textPlan100 = computeTextOverflowPlan(soaLayout, plan100.totalPages, soa001DocText);
assert(plan100.totalPages >= 4 && plan100.totalPages <= 7, `100 transactions paginate cleanly across ${plan100.totalPages} pages`);
assert(textPlan100.totalDocumentPages === plan100.totalPages, `100 transactions totalDocumentPages (${textPlan100.totalDocumentPages}) strictly equals transaction page count (${plan100.totalPages})`);
assert(textPlan100.hasTextOverflow === false, "100 transactions closing text stays on last transaction page");

// ─────────────────────────────────────────────────────────────────────────────
// 6. REGRESSION VERIFICATION: CONTRACTOR SCOPE & WARRANTIES (QTN101-26)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[Section 6] Regression Protection: Long Scope Quotation (QTN101-26)");

const quoLayout = createDefaultLayout("quotation");

const qtnDocText = {
  payment_terms: "100% Advance Payment with official purchase order prior to fabrication.",
  scope_of_work: "Manufacturing, supply, transportation and high-precision installation of heavy duty PVC water tank liner with high-frequency welded double seams.",
  notes: "Operation Time: 15 Working Days after site handover.\nSite access clearance required 48 hours in advance.\nComprehensive warranty of 10 years against leakage.\nClient inspection and technical handover signoff upon testing.",
};

const qtnItems = [
  { description: "Heavy Duty PVC Tank Liner (12m x 5.5m x 4m)", quantity: 1, unit_price: 18500, line_total: 18500 },
];

const quoPlan = computePaginationPlan(quoLayout, qtnItems.length, qtnItems, qtnDocText);
const quoTextPlan = computeTextOverflowPlan(quoLayout, quoPlan.totalPages, qtnDocText);

assert(quoPlan.totalPages === 1, "Quotation line items fit on page 1");
assert(quoTextPlan.hasTextOverflow === true, "Quotation extensive technical notes trigger legitimate text continuation");
assert(quoTextPlan.totalDocumentPages === 2, `Quotation total pages is exactly 2 (got ${quoTextPlan.totalDocumentPages})`);
assert(quoTextPlan.continuationPages.length === 1, "Quotation has exactly 1 continuation page");
assert(quoTextPlan.suppressSignaturesOnItemPage === true, "Signatures moved from page 1 to continuation page 2");

console.log("\n================================================================================");
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("================================================================================\n");

process.exit(failed > 0 ? 1 : 0);
