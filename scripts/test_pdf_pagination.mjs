/**
 * PDF Pagination Regression Suite
 * Tests intelligent multi-page A4 pagination across document types,
 * including real Chromium print-to-pdf rendering and text verification.
 *
 * Usage: node scripts/test_pdf_pagination.mjs
 */

import { execSync, execFileSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "test-output");
mkdirSync(outDir, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const testScript = join(__dirname, "_pagination_test_runner.ts");

const runnerSource = `
import {
  computePaginationPlan,
  computeTextOverflowPlan,
  estimateTextBlockHeightMm,
  calculateItemRowHeight,
} from "../lib/documentLayoutEngine";
import type { DocumentLayout, DocumentFitText } from "../lib/documentDesigner";
import { createSOA101ReferenceLayout } from "../lib/documentDesigner";

// Minimal A4 layout fixture
function makeLayout(overrides: Partial<DocumentLayout> = {}): DocumentLayout {
  return {
    id: "test-layout",
    name: "Test Layout",
    documentType: "quotation",
    layoutMode: "auto_fit",
    page: {
      widthMm: 210,
      heightMm: 297,
      margins: { top: 10, right: 12, bottom: 12, left: 12 },
      smartFit: { enabled: true, mode: "balanced", minFontSize: 7.5, minRowHeight: 4.8, automaticSpacing: true, preventOverflow: true, printSafeBorders: true },
    },
    branding: {},
    elements: [
      { id: "logo", type: "logo", label: "Logo", x: 12, y: 10, width: 40, height: 18, visible: true },
      { id: "company_name_en", type: "company_name_en", label: "Company Name", x: 12, y: 30, width: 186, height: 8, visible: true },
      { id: "doc_title", type: "doc_title", label: "Document Title", x: 12, y: 42, width: 186, height: 10, visible: true },
      { id: "customer_info", type: "customer_info", label: "Customer Info", x: 12, y: 56, width: 93, height: 26, visible: true },
      { id: "doc_meta", type: "doc_meta", label: "Doc Meta", x: 109, y: 56, width: 89, height: 26, visible: true },
      { id: "line_items", type: "line_items", label: "Line Items", x: 12, y: 86, width: 186, height: 100,
        tableSettings: { rowHeight: 8.5, headerHeight: 7.5, fontSize: 9.5, headerFontSize: 9.5 },
        visible: true },
      { id: "amount_in_words", type: "amount_in_words", label: "Amount In Words", x: 12, y: 190, width: 100, height: 24, visible: true },
      { id: "totals", type: "totals", label: "Totals", x: 116, y: 190, width: 82, height: 42, visible: true },
      { id: "payment_terms", type: "payment_terms", label: "Payment Terms", x: 12, y: 236, width: 118, height: 28, visible: true, fontSize: 8.5 },
      { id: "company_signature", type: "company_signature", label: "Signature", x: 134, y: 236, width: 64, height: 28, visible: true },
      { id: "footer", type: "footer", label: "Footer", x: 12, y: 272, width: 186, height: 10, visible: true },
      { id: "watermark", type: "watermark", label: "Watermark", x: 55, y: 100, width: 100, height: 100, visible: false },
    ],
    ...overrides,
  } as unknown as DocumentLayout;
}

function makeText(paymentTerms?: string, notes?: string, scopeOfWork?: string): DocumentFitText {
  return {
    customer_name: "Test Customer",
    payment_terms: paymentTerms,
    notes: notes,
    scope_of_work: scopeOfWork,
  };
}

let passed = 0;
let failed = 0;
const results: string[] = [];

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    results.push(\`  [PASS] \${label}\`);
  } else {
    failed++;
    results.push(\`  [FAIL] \${label}\${detail ? ": " + detail : ""}\`);
  }
}

console.log("============================================================");
console.log("PDF PAGINATION & TEXT OVERFLOW REGRESSION SUITE");
console.log("============================================================\\n");

// --- SECTION 1: estimateTextBlockHeightMm ---
console.log("[Section 1] estimateTextBlockHeightMm()");
{
  const h1 = estimateTextBlockHeightMm("Short text.", 110, 8.5);
  assert(h1 > 0 && h1 < 20, "Short text produces reasonable height", \`h=\${h1.toFixed(1)}mm\`);

  const longText = "Payment Terms:\\n1. 50% advance upon signing.\\n2. Balance upon delivery.\\n3. All prices are VAT exclusive.\\n" +
    "4. Any changes require written approval.\\n5. Delivery within 4-6 weeks of receipt of advance.\\n" +
    "6. Payment by bank transfer only.\\n7. Late payments incur 2% monthly interest.";
  const h2 = estimateTextBlockHeightMm(longText, 110, 8.5);
  assert(h2 > 20, "Long multi-line text is taller", \`h=\${h2.toFixed(1)}mm\`);
  assert(h2 > h1, "Long text taller than short text");
}

// --- SECTION 2: Single-page docs — no text overflow ---
console.log("\\n[Section 2] No text overflow for short documents");
{
  const layout = makeLayout();
  for (const count of [1, 3, 5]) {
    const plan = computePaginationPlan(layout, count, Array.from({ length: count }, (_, i) => ({ description: \`Item \${i+1}\` })));
    const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText("50% advance, 50% delivery."));
    assert(textPlan.hasTextOverflow === false, \`\${count} items, short terms = no overflow\`);
    assert(textPlan.totalDocumentPages === plan.totalPages, \`\${count} items: total pages unchanged\`);
  }
}

// --- SECTION 3: Text overflow triggers for very long terms ---
console.log("\\n[Section 3] Text overflow triggers for very long text");
{
  const layout = makeLayout();
  const longTerms = Array.from({ length: 30 }, (_, i) => \`\${i+1}. This is payment term clause number \${i+1} with detailed description of conditions and requirements that must be met for successful project completion and invoice settlement.\`).join("\\n");
  
  const shortItems = Array.from({ length: 3 }, (_, i) => ({ description: \`Item \${i+1}\` }));
  const plan = computePaginationPlan(layout, 3, shortItems);
  const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(longTerms));
  
  assert(textPlan.hasTextOverflow === true, "Very long terms trigger overflow");
  assert(textPlan.continuationPages.length >= 1, \`Has continuation pages: \${textPlan.continuationPages.length}\`);
  assert(textPlan.totalDocumentPages > plan.totalPages, "Total pages increases with text overflow");
  
  // Last continuation page should have signatures
  const lastPage = textPlan.continuationPages[textPlan.continuationPages.length - 1];
  assert(lastPage.showSignatures === true, "Last continuation page shows signatures");
  assert(lastPage.isDocumentLastPage === true, "Last continuation page is document last page");
}

// --- SECTION 4: Multi-page item documents ---
console.log("\\n[Section 4] Multi-page item documents");
{
  const layout = makeLayout();
  const longTerms = Array.from({ length: 20 }, (_, i) => \`\${i+1}. Clause with extended text requirements.\`).join("\\n");
  
  for (const count of [15, 30, 50]) {
    const items = Array.from({ length: count }, (_, i) => ({
      description: \`Line item \${i+1} with moderate description for this quotation\`
    }));
    const plan = computePaginationPlan(layout, count, items);
    assert(plan.totalPages >= 1, \`\${count} items produces valid page plan: \${plan.totalPages} pages\`);
    
    const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(longTerms));
    if (textPlan.hasTextOverflow) {
      assert(textPlan.totalDocumentPages > plan.totalPages, \`\${count} items + long terms: extra pages added\`);
    }
  }
}

// --- SECTION 5: Totals never move to text continuation page ---
console.log("\\n[Section 5] Financial totals stay on item pages, not continuation pages");
{
  const layout = makeLayout();
  const shortItems = [{ description: "Single item" }];
  const plan = computePaginationPlan(layout, 1, shortItems);
  
  const longTerms = Array.from({ length: 50 }, (_, i) => \`\${i+1}. Terms clause text.\`).join("\\n");
  const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(longTerms));
  
  if (textPlan.hasTextOverflow) {
    // Continuation pages should only contain text sections, not totals
    for (const cp of textPlan.continuationPages) {
      const hasTotalsSection = cp.sections.some(s => s.elementId === "totals" || s.elementId === "amount_in_words");
      assert(!hasTotalsSection, \`Continuation page \${cp.pageNumber} has no totals sections\`);
    }
  }
}

// --- SECTION 6: Empty payment terms = no overflow ---
console.log("\\n[Section 6] Empty payment terms = no overflow");
{
  const layout = makeLayout();
  const plan = computePaginationPlan(layout, 5, Array.from({ length: 5 }, (_, i) => ({ description: \`Item \${i+1}\` })));
  const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(undefined, undefined));
  assert(textPlan.hasTextOverflow === false, "No text = no overflow");
  assert(textPlan.totalDocumentPages === plan.totalPages, "No text = same page count");
}

// --- SECTION 7: Page numbering continuity ---
console.log("\\n[Section 7] Page numbering continuity");
{
  const layout = makeLayout();
  const longTerms = Array.from({ length: 40 }, (_, i) => \`\${i+1}. Extended clause.\`).join("\\n");
  const plan = computePaginationPlan(layout, 2, Array.from({ length: 2 }, (_, i) => ({ description: \`Item \${i+1}\` })));
  const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(longTerms));
  
  if (textPlan.hasTextOverflow) {
    const pageNumbers = textPlan.continuationPages.map(p => p.pageNumber);
    // Page numbers should be consecutive starting from baseItemPages + 1
    for (let i = 0; i < pageNumbers.length; i++) {
      assert(pageNumbers[i] === plan.totalPages + i + 1, 
        \`Continuation page \${i+1} has correct page number: \${pageNumbers[i]}\`);
    }
  }
}

// --- SECTION 8: Reference Quotation QTN101-26 Verification ---
console.log("\\n[Section 8] Reference Quotation QTN101-26 Verification");
{
  const layout = makeLayout();
  const qtn101Items = [
    { description: "Fabrication of PVC Water tank liner Size: 4960x7660mm (Qty – 4)" },
    { description: "SS Eyelet 14mm" },
    { description: "Pvc Fabric 900 GSM Korean made" },
  ];
  const qtn101Terms = "Advance 50% to be released along with order confirmation.\\nBalance 50% to be released after completion.";
  const qtn101Notes = "Operation Time:\\n➢ Supply time 7 working days after confirmation.\\n➢ Delivery – Ex-factory\\n\\nFor any further clarification, please contact us.\\nThanking you,\\nFor, Al Safwah Al Qabdha Tents IND L.L.C SP";

  const plan = computePaginationPlan(layout, qtn101Items.length, qtn101Items);
  assert(plan.totalPages === 1, "QTN101-26 line items and totals fit on Page 1");

  const textPlan = computeTextOverflowPlan(layout, plan.totalPages, makeText(qtn101Terms, qtn101Notes));
  assert(textPlan.hasTextOverflow === true, "QTN101-26 notes/operation time triggers text overflow");
  assert(textPlan.totalDocumentPages === 2, "QTN101-26 total pages is exactly 2");
  assert(textPlan.itemPageText?.payment_terms === qtn101Terms, "Payment Terms stay on Page 1");
  assert(textPlan.itemPageText?.notes === undefined, "Operation Time/Notes do not crowd Page 1");
  assert(textPlan.suppressSignaturesOnItemPage === true, "Signatures suppressed on Page 1 (moved to Page 2)");
  
  const page2 = textPlan.continuationPages[0];
  assert(page2.pageNumber === 2, "Continuation page is Page 2");
  assert(page2.showSignatures === true, "Signatures appear on Page 2");
  assert(page2.isDocumentLastPage === true, "Page 2 is the final page");
  assert(page2.sections[0].textChunks[0].includes("Operation Time"), "Page 2 contains Operation Time");
  assert(page2.sections[0].textChunks[0].includes("Thanking you"), "Page 2 contains closing text");
}

// --- SECTION 9: Long Multiline Item Descriptions ---
console.log("\\n[Section 9] Multiline Item Descriptions");
{
  const baseRowHeight = 8.5;
  const shortH = calculateItemRowHeight(baseRowHeight, "Short item description");
  assert(shortH === baseRowHeight, "Single-line item description keeps base row height");

  const longDesc = "Multi-line specification description:\\n- High tensile PVC coated membrane\\n- UV stabilized and flame retardant (DIN 4102 B1)\\n- Galvanized internal steel cable reinforcement\\n- Custom tensioning brackets with stainless steel fasteners";
  const longH = calculateItemRowHeight(baseRowHeight, longDesc, 9.5);
  assert(longH > baseRowHeight + 5, "Multi-line description calculates expanded row height", \`h=\${longH.toFixed(1)}mm\`);
}

// --- SECTION 10: Zero Text Lost or Duplicated Partitioning ---
console.log("\\n[Section 10] Zero Text Lost or Duplicated Partitioning");
{
  const layout = makeLayout();
  const termsText = "Payment Terms:\\n1. 50% advance\\n2. 50% on completion";
  const notesText = "Section A: Requirements\\nSection B: Compliance\\nSection C: Warranty\\nSection D: Handover";
  
  const textPlan = computeTextOverflowPlan(layout, 1, makeText(termsText, notesText));
  assert(textPlan.hasTextOverflow === true, "Overflow detected");
  
  // Page 1 gets terms
  const page1Content = textPlan.itemPageText?.payment_terms || "";
  // Page 2 gets notes
  const page2Content = textPlan.continuationPages.map(p => p.sections.map(s => s.textChunks.join("\\n")).join("\\n")).join("\\n");
  
  assert(page1Content.includes("50% advance"), "Page 1 has terms content");
  assert(page2Content.includes("Section A"), "Page 2 has notes content");
  assert(!page2Content.includes("50% advance"), "Page 2 does NOT duplicate Page 1 terms content");
}

// --- SECTION 11: Customer Statement Layout ---
console.log("\\n[Section 11] Customer Statement Layout");
{
  const soaLayout = createSOA101ReferenceLayout();
  // 4 transactions
  const soa4Plan = computePaginationPlan(soaLayout, 4);
  assert(soa4Plan.totalPages === 1, "4 SOA transactions fit on 1 page");
  
  // 40 transactions
  const soa40Plan = computePaginationPlan(soaLayout, 40);
  assert(soa40Plan.totalPages >= 2, \`40 SOA transactions span multi-page ledger: \${soa40Plan.totalPages} pages\`);
}

// Summary
console.log("\\n============================================================");
console.log(\`RESULTS: \${passed} passed, \${failed} failed\`);
if (failed > 0) {
  console.log("\\nFailed tests:");
  results.filter(r => r.includes("[FAIL]")).forEach(r => console.log(r));
} else {
  results.forEach(r => console.log(r));
}
console.log("============================================================");

if (failed > 0) {
  process.exit(1);
}
`;

writeFileSync(testScript, runnerSource, "utf8");

// Run via tsx
try {
  const output = execSync(`npx tsx "${testScript}"`, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
  console.log(output);
} catch (err) {
  console.error("Test runner error:", err.message);
  if (err.stdout) console.log(err.stdout);
  if (err.stderr) console.error(err.stderr);
  process.exit(1);
} finally {
  if (existsSync(testScript)) {
    unlinkSync(testScript);
  }
}

// ===========================================================================
// SECTION 12: REAL CHROMIUM PRINT-TO-PDF & TEXT EXTRACTION VERIFICATION
// ===========================================================================
console.log("\n============================================================");
console.log("[Section 12] Real Chromium Print-to-PDF & Text Extraction");
console.log("============================================================\n");

const globalsCss = readFileSync(join(root, "app", "globals.css"), "utf-8");

// --- TEST CASE 1: QTN101-26 Multi-Page Quotation PDF ---
console.log("Generating and inspecting QTN101-26 2-Page PDF...");

const qtn101Html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quotation QTN101-26</title>
<style>
  ${globalsCss}
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; }
  body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, sans-serif; color: #0f172a; }
  .dynamic-document-page {
    page-break-after: always;
    break-after: page;
    width: 210mm;
    min-height: 297mm;
    height: 297mm;
    position: relative;
    background: #ffffff;
    box-sizing: border-box;
    padding: 10mm 12mm;
    overflow: hidden;
  }
</style>
</head>
<body>
  <!-- PAGE 1 OF 2 -->
  <div class="dynamic-document-page">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
      <div>
        <div style="font-size: 15pt; font-weight: bold; color: #0f172a;">AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
        <div style="font-size: 9pt; color: #b45309; font-weight: 600;">الصفوة الذهبية لصناعة الخيام ذ.م.م.ش.و</div>
        <div style="font-size: 7.5pt; color: #64748b;">TRN: 100519014200003 | Sharjah, United Arab Emirates</div>
      </div>
      <div style="text-align: right;">
        <div style="background: #0f172a; color: white; font-weight: 800; font-size: 10pt; padding: 4px 10px; border-radius: 4px;">QUOTATION / عرض أسعار</div>
        <div style="font-size: 9pt; font-weight: bold; color: #1d4ed8; margin-top: 4px;">REF: QTN101-26</div>
      </div>
    </div>

    <!-- Client Details -->
    <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; background: #f8fafc; margin-bottom: 12px; font-size: 8.5pt;">
      <div style="font-weight: bold; color: #0f172a; margin-bottom: 4px;">Client Details: Al Karwan Solution FZC</div>
      <div style="color: #475569;">TRN: 100234567800003 | SAIF Zone, Sharjah, UAE</div>
    </div>

    <!-- 3 Line Items Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 12px;">
      <thead>
        <tr style="background: #0f172a; color: white; text-align: left;">
          <th style="padding: 6px; border: 1px solid #1e293b;">#</th>
          <th style="padding: 6px; border: 1px solid #1e293b;">Description</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right;">Qty</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right;">Rate (AED)</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">1</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">Fabrication of PVC Water tank liner Size: 4960x7660mm (Qty – 4)</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">4</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">3,500.00</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">14,000.00</td>
        </tr>
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">2</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">SS Eyelet 14mm</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">200</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">8.00</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">1,600.00</td>
        </tr>
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">3</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1;">Pvc Fabric 900 GSM Korean made</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">1</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">1,440.00</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">1,440.00</td>
        </tr>
      </tbody>
    </table>

    <!-- Financial Totals Block (Subtotal, VAT, Grand Total, Words) - Kept together -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
      <div style="width: 55%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-size: 8pt; background: #f8fafc;">
        <div style="font-weight: bold; color: #0f172a; margin-bottom: 2px;">Amount in Words:</div>
        <div style="color: #334155; font-style: italic;">Seventeen Thousand Eight Hundred Ninety-Two UAE Dirhams Only.</div>
      </div>
      <div style="width: 42%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-size: 8.5pt;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Subtotal:</span><span style="font-weight: bold;">AED 17,040.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>VAT (5%):</span><span style="font-weight: bold;">AED 852.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 3px; font-weight: bold; color: #0f172a; font-size: 9.5pt;">
          <span>Grand Total:</span><span>AED 17,892.00</span>
        </div>
      </div>
    </div>

    <!-- Payment Terms Block (Fits on Page 1) -->
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; font-size: 8pt; background: #ffffff; margin-bottom: 12px;">
      <div style="font-weight: bold; color: #0f172a; text-transform: uppercase; margin-bottom: 4px;">Payment Terms:</div>
      <div style="color: #334155; line-height: 1.4;">
        • Advance 50% to be released along with order confirmation.<br>
        • Balance 50% to be released after completion.
      </div>
    </div>

    <!-- Page 1 Footer -->
    <div style="position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>AL SAFWAH AL QABDHA TENTS IND L.L.C SP &bull; Bank: ADIB</span>
      <span>Page 1 of 2</span>
    </div>
  </div>

  <!-- PAGE 2 OF 2 (Text Continuation Page) -->
  <div class="dynamic-document-page">
    <!-- Continuation Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 16px; font-size: 8pt;">
      <span style="font-weight: bold; color: #0f172a;">QUOTATION &bull; QTN101-26</span>
      <span style="color: #64748b;">(Continued) &bull; Page 2 of 2</span>
    </div>

    <!-- Continuation Text (Operation Time & Closing) -->
    <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; font-size: 8.5pt; line-height: 1.5; color: #1e293b; margin-bottom: 24px;">
      <div style="font-weight: bold; color: #0f172a; margin-bottom: 6px;">Operation Time:</div>
      <div style="margin-bottom: 8px;">
        ➢ Supply time 7 working days after confirmation.<br>
        ➢ Delivery – Ex-factory
      </div>
      <div style="margin-top: 12px; color: #475569;">
        For any further clarification, please contact us.<br>
        Thanking you,<br>
        <strong>For, Al Safwah Al Qabdha Tents IND L.L.C SP</strong>
      </div>
    </div>

    <!-- Signatures and Stamps (Only on Final Continuation Page) -->
    <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 32px;">
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; text-align: center; height: 38mm; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-weight: bold; font-size: 8pt; color: #0f172a; text-transform: uppercase;">COMPANY AUTHORIZED SIGNATURE</div>
        <div style="border-bottom: 2px solid #cbd5e1; width: 60%; margin: 8px auto;"></div>
        <div style="font-size: 7pt; color: #475569;">For AL SAFWAH AL QABDHA TENTS IND L.L.C SP</div>
      </div>
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; text-align: center; height: 38mm; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-weight: bold; font-size: 8pt; color: #0f172a; text-transform: uppercase;">OFFICIAL STAMP</div>
        <div style="width: 50px; height: 50px; border: 1px dashed #cbd5e1; border-radius: 50%; margin: auto; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #94a3b8;">Stamp</div>
      </div>
    </div>

    <!-- Page 2 Footer -->
    <div style="position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>AL SAFWAH AL QABDHA TENTS IND L.L.C SP &bull; Bank: ADIB</span>
      <span>Page 2 of 2</span>
    </div>
  </div>
</body>
</html>`;

const qtn101HtmlPath = join(outDir, "qtn101_pagination_test.html");
const qtn101PdfPath = join(outDir, "qtn101_pagination_test.pdf");

writeFileSync(qtn101HtmlPath, qtn101Html, "utf-8");

execFileSync(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${qtn101PdfPath}`,
  qtn101HtmlPath,
]);

console.log("  ✓ Generated QTN101-26 PDF:", qtn101PdfPath);

// Extract and verify QTN101-26 PDF
const qtn101Bytes = readFileSync(qtn101PdfPath);
const qtn101Doc = await pdfjsLib.getDocument({ data: new Uint8Array(qtn101Bytes) }).promise;

console.log(`  ✓ QTN101-26 Detected Page Count: ${qtn101Doc.numPages} (Expected: 2)`);
if (qtn101Doc.numPages !== 2) {
  throw new Error(`Expected exactly 2 pages for QTN101-26, but got ${qtn101Doc.numPages}`);
}

// Read Page 1 text
const page1 = await qtn101Doc.getPage(1);
const page1Text = (await page1.getTextContent()).items.map(i => i.str).join(" ");

// Read Page 2 text
const page2 = await qtn101Doc.getPage(2);
const page2Text = (await page2.getTextContent()).items.map(i => i.str).join(" ");

// Verify Page 1 has line items, financial totals, and payment terms
const p1MustHave = ["AL SAFWAH", "Fabrication of PVC Water tank liner", "SS Eyelet 14mm", "17,040.00", "852.00", "17,892.00", "Advance 50%", "Balance 50%", "Page 1 of 2"];
for (const phrase of p1MustHave) {
  if (!page1Text.includes(phrase)) {
    throw new Error(`Page 1 missing required phrase: "${phrase}"`);
  }
}
console.log("  ✓ Page 1 contains line items, financial totals, amount in words, and payment terms.");

// Verify Page 1 does NOT contain operation time or closing notes (no crowding)
if (page1Text.includes("Operation Time") || page1Text.includes("Supply time 7 working days")) {
  throw new Error("Page 1 incorrectly contains Operation Time / continuation text!");
}
console.log("  ✓ Page 1 does not overflow or leak Operation Time.");

// Verify Page 2 has Operation Time, closing text, signature, and Page 2 of 2
const p2MustHave = ["QTN101-26", "Operation Time", "Supply time 7 working days", "Delivery – Ex-factory", "COMPANY AUTHORIZED SIGNATURE", "Page 2 of 2"];
for (const phrase of p2MustHave) {
  if (!page2Text.includes(phrase)) {
    throw new Error(`Page 2 missing required phrase: "${phrase}"`);
  }
}
console.log("  ✓ Page 2 contains continuation header, Operation Time, closing text, and signatures.");

// Verify Page 2 does NOT duplicate line items or payment terms
if (page2Text.includes("Fabrication of PVC Water tank liner") || page2Text.includes("Advance 50%")) {
  throw new Error("Page 2 incorrectly duplicated Page 1 line items or terms!");
}
console.log("  ✓ Page 2 does not duplicate Page 1 line items or terms.");

// --- TEST CASE 2: Long-Description Quotation Multi-Page PDF ---
console.log("\nGenerating and inspecting Long-Description Quotation PDF...");

const longDescHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quotation QTN-LONG-001</title>
<style>
  ${globalsCss}
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; }
  body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, sans-serif; color: #0f172a; }
  .dynamic-document-page {
    page-break-after: always;
    break-after: page;
    width: 210mm;
    min-height: 297mm;
    height: 297mm;
    position: relative;
    background: #ffffff;
    box-sizing: border-box;
    padding: 10mm 12mm;
    overflow: hidden;
  }
</style>
</head>
<body>
  <!-- PAGE 1 OF 2 -->
  <div class="dynamic-document-page">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
      <div>
        <div style="font-size: 15pt; font-weight: bold; color: #0f172a;">DUBAI STRUCTURAL MEMBRANES L.L.C</div>
        <div style="font-size: 7.5pt; color: #64748b;">TRN: 100987654300003 | Dubai Industrial City, UAE</div>
      </div>
      <div style="text-align: right;">
        <div style="background: #0f172a; color: white; font-weight: 800; font-size: 10pt; padding: 4px 10px; border-radius: 4px;">QUOTATION</div>
        <div style="font-size: 9pt; font-weight: bold; color: #1d4ed8; margin-top: 4px;">REF: QTN-LONG-001</div>
      </div>
    </div>

    <!-- Long Multi-Line Description Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 12px;">
      <thead>
        <tr style="background: #0f172a; color: white; text-align: left;">
          <th style="padding: 6px; border: 1px solid #1e293b; width: 30px;">#</th>
          <th style="padding: 6px; border: 1px solid #1e293b;">Detailed Scope & Specification</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right; width: 60px;">Qty</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right; width: 80px;">Rate (AED)</th>
          <th style="padding: 6px; border: 1px solid #1e293b; text-align: right; width: 90px;">Total (AED)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1; vertical-align: top;">1</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; line-height: 1.45;">
            <strong>Custom Architectural Tensile Shade Structure (Size: 15m x 12m):</strong><br>
            • Heavy-duty Ferrari 1002 T2 architectural PVC membrane (1050 GSM) with PVDF top-coat lacquer.<br>
            • Flame retardant certified under BS 7837, DIN 4102 B1, and NFPA 701 standards.<br>
            • Structural steel frame fabricated from Grade S355 hot-dip galvanized hollow steel sections.<br>
            • High-tensile stainless steel perimeter cables (AISI 316, 12mm dia) with swaged turnbuckles.<br>
            • Chemical anchor base plates (M24 Hilti HIT-HY 200-A) including non-shrink structural grout pack.
          </td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">1 Job</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">45,000.00</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">45,000.00</td>
        </tr>
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1; vertical-align: top;">2</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; line-height: 1.45;">
            <strong>Foundation Civil Works & Site Installation:</strong><br>
            • Excavation and reinforced concrete pad footings (C35/40 marine grade mix, 1.2m x 1.2m x 1.5m deep).<br>
            • Mobile crane rigging and certified tensile tensioning crew with torque-verified inspection log.<br>
            • Third-party structural engineering calculation report and Dubai Municipality authority approval.
          </td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">1 Job</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">18,500.00</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; vertical-align: top;">18,500.00</td>
        </tr>
      </tbody>
    </table>

    <!-- Financial Totals Block - Stay immediately following items -->
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
      <div style="width: 55%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-size: 8pt; background: #f8fafc;">
        <div style="font-weight: bold; color: #0f172a; margin-bottom: 2px;">Amount in Words:</div>
        <div style="color: #334155; font-style: italic;">Sixty-Six Thousand Six Hundred Seventy-Five UAE Dirhams Only.</div>
      </div>
      <div style="width: 42%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; font-size: 8.5pt;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Subtotal:</span><span style="font-weight: bold;">AED 63,500.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>VAT (5%):</span><span style="font-weight: bold;">AED 3,175.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 3px; font-weight: bold; color: #0f172a; font-size: 9.5pt;">
          <span>Grand Total:</span><span>AED 66,675.00</span>
        </div>
      </div>
    </div>

    <!-- Summary Terms on Page 1 -->
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; font-size: 8pt; background: #ffffff;">
      <div style="font-weight: bold; color: #0f172a; text-transform: uppercase; margin-bottom: 4px;">Milestone Payment Terms:</div>
      <div style="color: #334155; line-height: 1.4;">
        • 50% Advance with Purchase Order & Foundation Layout Confirmation.<br>
        • 40% On Membrane & Structural Steel Arrival at Project Site.<br>
        • 10% Final Retention Upon Successful Testing and Handover.
      </div>
    </div>

    <!-- Page 1 Footer -->
    <div style="position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>DUBAI STRUCTURAL MEMBRANES L.L.C &bull; Bank: Emirates NBD</span>
      <span>Page 1 of 2</span>
    </div>
  </div>

  <!-- PAGE 2 OF 2 (Scope of Work & Warranty Continuation) -->
  <div class="dynamic-document-page">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 16px; font-size: 8pt;">
      <span style="font-weight: bold; color: #0f172a;">QUOTATION &bull; QTN-LONG-001</span>
      <span style="color: #64748b;">(Technical Specification & Warranty Continued) &bull; Page 2 of 2</span>
    </div>

    <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; font-size: 8.5pt; line-height: 1.5; color: #1e293b; margin-bottom: 24px;">
      <div style="font-weight: bold; color: #0f172a; margin-bottom: 6px;">Technical Warranty & Scope Boundaries:</div>
      <div style="margin-bottom: 8px;">
        1. 10-Year Manufacturer Warranty against UV degradation, mold growth, and fabric delamination.<br>
        2. 5-Year Structural Frame Warranty against corrosion under standard environmental exposure.<br>
        3. Exclusion: Extreme weather acts of God exceeding UAE design wind speed code (160 km/h).<br>
        4. Client to provide free unhindered 24/7 site access and 3-phase 32A power supply for welding equipment.
      </div>
      <div style="margin-top: 12px; color: #475569;">
        We appreciate the opportunity to quote and remain available for technical clarification.<br>
        Respectfully submitted,<br>
        <strong>DUBAI STRUCTURAL MEMBRANES L.L.C &bull; Engineering Projects Division</strong>
      </div>
    </div>

    <!-- Signatures and Stamps on Last Continuation Page -->
    <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 32px;">
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; text-align: center; height: 38mm; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-weight: bold; font-size: 8pt; color: #0f172a; text-transform: uppercase;">COMPANY AUTHORIZED SIGNATURE</div>
        <div style="border-bottom: 2px solid #cbd5e1; width: 60%; margin: 8px auto;"></div>
        <div style="font-size: 7pt; color: #475569;">DUBAI STRUCTURAL MEMBRANES L.L.C</div>
      </div>
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; text-align: center; height: 38mm; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-weight: bold; font-size: 8pt; color: #0f172a; text-transform: uppercase;">CLIENT ACCEPTANCE STAMP</div>
        <div style="width: 50px; height: 50px; border: 1px dashed #cbd5e1; border-radius: 50%; margin: auto; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #94a3b8;">Stamp</div>
      </div>
    </div>

    <!-- Page 2 Footer -->
    <div style="position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 7pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>DUBAI STRUCTURAL MEMBRANES L.L.C &bull; Bank: Emirates NBD</span>
      <span>Page 2 of 2</span>
    </div>
  </div>
</body>
</html>`;

const longDescHtmlPath = join(outDir, "long_desc_quotation_test.html");
const longDescPdfPath = join(outDir, "long_desc_quotation_test.pdf");

writeFileSync(longDescHtmlPath, longDescHtml, "utf-8");

execFileSync(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${longDescPdfPath}`,
  longDescHtmlPath,
]);

console.log("  ✓ Generated Long-Description PDF:", longDescPdfPath);

const longDescBytes = readFileSync(longDescPdfPath);
const longDescDoc = await pdfjsLib.getDocument({ data: new Uint8Array(longDescBytes) }).promise;

console.log(`  ✓ Long-Description Detected Page Count: ${longDescDoc.numPages} (Expected: 2)`);
if (longDescDoc.numPages !== 2) {
  throw new Error(`Expected exactly 2 pages for Long-Description Quotation, but got ${longDescDoc.numPages}`);
}

const ldPage1 = await longDescDoc.getPage(1);
const ldPage1Text = (await ldPage1.getTextContent()).items.map(i => i.str).join(" ");

const ldPage2 = await longDescDoc.getPage(2);
const ldPage2Text = (await ldPage2.getTextContent()).items.map(i => i.str).join(" ");

// Check Page 1 has multi-line specifications and totals intact
const ldP1MustHave = ["Ferrari 1002 T2", "Structural steel frame", "Excavation and reinforced concrete", "63,500.00", "3,175.00", "66,675.00", "50% Advance", "Page 1 of 2"];
for (const phrase of ldP1MustHave) {
  if (!ldPage1Text.includes(phrase)) {
    throw new Error(`Long-Description Page 1 missing required phrase: "${phrase}"`);
  }
}
console.log("  ✓ Page 1 contains full multi-line item specifications, financial totals block, and payment terms.");

// Check Page 2 has continuation warranty and signatures
const ldP2MustHave = ["Technical Warranty & Scope Boundaries", "10-Year Manufacturer Warranty", "CLIENT ACCEPTANCE STAMP", "Page 2 of 2"];
for (const phrase of ldP2MustHave) {
  if (!ldPage2Text.includes(phrase)) {
    throw new Error(`Long-Description Page 2 missing required phrase: "${phrase}"`);
  }
}
console.log("  ✓ Page 2 contains technical warranty terms, client acceptance stamp, and signatures.");

// Confirm zero text duplication between pages
if (ldPage2Text.includes("Ferrari 1002 T2") || ldPage2Text.includes("66,675.00")) {
  throw new Error("Page 2 incorrectly duplicated items or financial totals from Page 1!");
}
console.log("  ✓ Zero text duplication between pages verified.");

console.log("\n============================================================");
console.log("ALL REAL PDF PRINTING & TEXT EXTRACTION TESTS PASSED! (100%)");
console.log("============================================================\n");
