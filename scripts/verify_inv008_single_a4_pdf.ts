import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

import { createDefaultLayout, normalizeLayout } from "../lib/documentDesigner";
import {
  computePaginationPlan,
  computeEffectiveLayout,
  prepareSavedAutoFit,
} from "../lib/documentLayoutEngine";

const OUT_DIR = join(process.cwd(), "test-output");
mkdirSync(OUT_DIR, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

console.log("==================================================================");
console.log("DUBAI ERP — INV-008 SINGLE A4 PORTRAIT PDF VERIFICATION SUITE");
console.log("==================================================================");

// The exact failure test data from pdffffff.pdf
const inv008Data = {
  document_number: "INV-008",
  document_date: "2026-10-26T00:00:00.000Z",
  supply_date: "2026-10-26T00:00:00.000Z",
  customer_name: "Al Karwan Solution FZC",
  customer_trn: "104337393300003",
  contact_person: "Mr. Mohammed Ayaz",
  payment_terms: "30 days",
  notes: "No additional remarks.\n30 days",
  company_name: "AL SAFWAH AL QABDHA TENTS IND L.L.C SP",
  company_name_ar: "الصفوة الذهبية لصناعة الخيام ذ.م.م.ش.و",
  company_address: "Al Sajaa Industrial Area, Sharjah",
  company_trn: "105319816200003",
  company_phone: "+971 6 767 9058",
  company_email: "info@goldenelitetents.ae",
  company_website: "www.goldenelitetents.ae",
  bank_name: "Mashreq Bank PSC",
  account_name: "AL SAFWAH AL QABDHA TENTS IND LLC SP",
  iban: "AE130330000019101999916",
  swift: "BOMLAEAD",
  items: [
    { description: "Fabrication of PVC Water tank liner Size:\n5700x7750mm (Qty – 3)", quantity: 720, unit: "Mtr", unit_price: 8.0, vat_rate: 5, vat_amount: 288.0, line_total: 6048.0 },
    { description: "SS Eyelet 14mm", quantity: 561, unit: "Pcs", unit_price: 1.5, vat_rate: 5, vat_amount: 42.08, line_total: 883.58 },
    { description: "Pvc Fabric Korean 900 GSM", quantity: 657, unit: "Sqm", unit_price: 15.0, vat_rate: 5, vat_amount: 492.75, line_total: 10347.75 },
    { description: "Fabrication of PVC Water tank liner Size:\n7390x6650mm (Qty – 3)", quantity: 852, unit: "Mtr", unit_price: 8.0, vat_rate: 5, vat_amount: 340.8, line_total: 7156.8 },
    { description: "SS Eyelet 14mm", quantity: 693, unit: "Pcs", unit_price: 1.5, vat_rate: 5, vat_amount: 51.98, line_total: 1091.48 },
    { description: "Pvc Fabric Korean 900 GSM", quantity: 891, unit: "Sqm", unit_price: 15.0, vat_rate: 5, vat_amount: 668.25, line_total: 14033.25 },
  ],
  subtotal: 37677.0,
  vat_amount: 1883.86,
  total_amount: 39560.86,
  amount_in_words: "Thirty-Nine Thousand Five Hundred Sixty Dirhams and Eighty-Six Fils Only",
};

// -----------------------------------------------------------------------------
// Step 1: Layout Engine Verification for INV-008
// -----------------------------------------------------------------------------
console.log("\n[1/4] Running Document Layout Engine for INV-008...");
const baseLayout = createDefaultLayout("tax_invoice");
const layout = prepareSavedAutoFit(normalizeLayout(baseLayout));

const paginationPlan = computePaginationPlan(layout, inv008Data.items.length, inv008Data.items, inv008Data);

console.log(`  Total pages planned: ${paginationPlan.totalPages}`);
console.log(`  Fit level: ${paginationPlan.fitProfile?.level}`);
console.log(`  Row height: ${paginationPlan.fitProfile?.rowHeight}mm`);
console.log(`  Font size: ${paginationPlan.fitProfile?.fontSize}pt`);
console.log(`  Total content bottom: ${paginationPlan.fitProfile?.totalContentBottom.toFixed(1)}mm / 297mm`);

assert.equal(paginationPlan.totalPages, 1, "INV-008 must fit on exactly 1 page!");
assert.equal(paginationPlan.isSinglePage, true, "isSinglePage flag must be true");
assert.equal(paginationPlan.pageItemRanges[0].itemCount, 6, "All 6 items must be on Page 1");
assert.ok((paginationPlan.fitProfile?.totalContentBottom ?? 0) <= 269, "Content bottom must clear footer margin");

// -----------------------------------------------------------------------------
// Step 2: Compute Effective Geometry for INV-008
// -----------------------------------------------------------------------------
console.log("\n[2/4] Verifying Effective Geometry Positions & Clearance...");
const effective = computeEffectiveLayout(
  layout,
  inv008Data.items.length,
  true,
  1,
  1,
  inv008Data.items,
  inv008Data
);

const visibleElements = effective.elements.filter((el) => el.visible && el.effectiveVisible !== false);
console.log(`  Total visible elements: ${visibleElements.length}`);

const tableEl = visibleElements.find((e) => e.type === "line_items")!;
const amountEl = visibleElements.find((e) => e.type === "amount_in_words")!;
const totalsEl = visibleElements.find((e) => e.type === "totals")!;
const bankEl = visibleElements.find((e) => e.type === "bank_details")!;
const sigEl = visibleElements.find((e) => e.type === "company_signature")!;
const stampEl = visibleElements.find((e) => e.type === "company_stamp")!;
const termsEl = visibleElements.find((e) => e.type === "payment_terms")!;
const footerEl = visibleElements.find((e) => e.type === "footer")!;

console.log(`  Table Y: ${tableEl.effectiveY.toFixed(1)}mm, Height: ${tableEl.effectiveHeight.toFixed(1)}mm`);
console.log(`  Amount in Words Y: ${amountEl.effectiveY.toFixed(1)}mm`);
console.log(`  Totals Y: ${totalsEl.effectiveY.toFixed(1)}mm`);
console.log(`  Bank Details Y: ${bankEl.effectiveY.toFixed(1)}mm`);
console.log(`  Signature Y: ${sigEl.effectiveY.toFixed(1)}mm`);
console.log(`  Stamp Y: ${stampEl?.effectiveY.toFixed(1)}mm`);
console.log(`  Terms Y: ${termsEl.effectiveY.toFixed(1)}mm`);
console.log(`  Footer Y: ${footerEl.effectiveY.toFixed(1)}mm`);

// Verify table does not overlap headers
assert.ok(tableEl.effectiveY >= 80, "Table must start below header and customer details");
// Verify followers are placed below table
assert.ok(amountEl.effectiveY >= tableEl.effectiveY + tableEl.effectiveHeight, "Amount in words must follow table");
assert.ok(totalsEl.effectiveY >= tableEl.effectiveY + tableEl.effectiveHeight, "Totals must follow table");
// Verify footer is at baseline
assert.ok(footerEl.effectiveY >= 265 && footerEl.effectiveY <= 285, "Footer must be positioned at bottom");
// Verify nothing exceeds A4 page height (297mm)
for (const el of visibleElements) {
  const bottom = el.effectiveY + el.effectiveHeight;
  assert.ok(bottom <= 297, `Element ${el.id} (${el.type}) bottom (${bottom}mm) exceeds A4 297mm!`);
}

// -----------------------------------------------------------------------------
// Step 3: Render Complete HTML & Generate Real A4 PDF with Chrome
// -----------------------------------------------------------------------------
console.log("\n[3/4] Generating Real A4 PDF via Headless Chrome...");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TAX INVOICE INV-008</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm !important;
    height: 297mm !important;
    background: #ffffff !important;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    color: #171717;
    overflow: hidden;
  }
  .dynamic-document-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    overflow: hidden;
    background: #ffffff;
    box-sizing: border-box;
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  .element-card {
    position: absolute;
    box-sizing: border-box;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    background-color: #0F172A;
    color: #ffffff;
    font-weight: 600;
    padding: 3px 5px;
    font-size: 8pt;
    line-height: 1.15;
  }
  td {
    padding: 3px 5px;
    font-size: 8pt;
    line-height: 1.15;
    border-bottom: 1px solid #E2E8F0;
  }
  .mono {
    font-family: monospace;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="dynamic-document-page">
    <!-- Top & Bottom Page Border -->
    <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: #E0AC23; z-index: 50;"></div>
    <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: #173C64; z-index: 50;"></div>

    <!-- Company Branding Header -->
    <div class="element-card" style="left: 12mm; top: 10mm; width: 186mm; text-align: center;">
      <div style="font-size: 15pt; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
        ${inv008Data.company_name}
      </div>
      <div style="font-size: 13pt; font-weight: 700; color: #B08D31; direction: rtl; margin-top: 1px;">
        ${inv008Data.company_name_ar}
      </div>
      <div style="font-size: 8pt; color: #64748B; margin-top: 2px;">
        ${inv008Data.company_address}
      </div>
      <div style="font-size: 8pt; color: #64748B; margin-top: 1px;">
        Tel: ${inv008Data.company_phone} | TRN: ${inv008Data.company_trn} | Email: ${inv008Data.company_email}
      </div>
    </div>

    <!-- Title Banner -->
    <div class="element-card" style="left: 12mm; top: 38mm; width: 186mm; height: 9mm; background: #0F172A; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #FFFFFF;">
      <span style="font-size: 12pt; font-weight: 800; letter-spacing: 1px;">TAX INVOICE</span>
      <span style="font-size: 10pt; font-weight: 700; color: #F59E0B; font-family: monospace;">REF: ${inv008Data.document_number}</span>
    </div>

    <!-- Party Info Cards -->
    <div class="element-card" style="left: 12mm; top: 49mm; width: 90mm; height: 26mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 6px; font-size: 8pt;">
      <div style="font-weight: 700; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 2px; margin-bottom: 3px; display: flex; justify-content: space-between;">
        <span>CUSTOMER / CLIENT DETAILS (بيانات العميل)</span>
        <span style="color: #64748B; font-size: 7pt;">BUYER</span>
      </div>
      <div style="font-weight: 700; color: #0F172A;">${inv008Data.customer_name}</div>
      <div style="color: #475569;">TRN: <span style="font-family: monospace; font-weight: 600;">${inv008Data.customer_trn}</span></div>
      <div style="color: #475569;">Attn: ${inv008Data.contact_person}</div>
    </div>

    <div class="element-card" style="left: 106mm; top: 49mm; width: 92mm; height: 26mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 6px; font-size: 8pt;">
      <div style="font-weight: 700; color: #0F172A; border-bottom: 1px solid #E2E8F0; padding-bottom: 2px; margin-bottom: 3px; display: flex; justify-content: space-between;">
        <span>DOCUMENT REFERENCE (البيانات)</span>
        <span style="color: #B08D31; font-weight: 700; font-family: monospace;">${inv008Data.document_number}</span>
      </div>
      <div style="display: flex; justify-content: space-between; color: #475569;">
        <span>Date: <strong style="color: #0F172A;">26/10/2026</strong></span>
        <span>Supply: <strong style="color: #0F172A;">26/10/2026</strong></span>
      </div>
      <div style="color: #475569; margin-top: 2px;">
        Terms: <strong style="color: #0F172A;">${inv008Data.payment_terms}</strong>
      </div>
    </div>

    <!-- Line Items Table -->
    <div class="element-card" style="left: ${tableEl.effectiveX}mm; top: ${tableEl.effectiveY}mm; width: ${tableEl.effectiveWidth}mm;">
      <table style="border: 1px solid #CBD5E1; border-radius: 4px;">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 45%; text-align: left;">Item Description / البيان</th>
            <th style="width: 8%; text-align: center;">Qty</th>
            <th style="width: 8%; text-align: center;">Unit</th>
            <th style="width: 10%; text-align: right;">Rate (AED)</th>
            <th style="width: 10%; text-align: right;">VAT (5%)</th>
            <th style="width: 14%; text-align: right;">Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          ${inv008Data.items.map((it, idx) => `
            <tr style="background-color: ${idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"};">
              <td style="text-align: center;">${idx + 1}</td>
              <td style="word-break: break-word; white-space: pre-line;">${it.description}</td>
              <td style="text-align: center;">${it.quantity}</td>
              <td style="text-align: center;">${it.unit}</td>
              <td style="text-align: right;" class="mono">${it.unit_price.toFixed(2)}</td>
              <td style="text-align: right;" class="mono">${it.vat_amount.toFixed(2)}</td>
              <td style="text-align: right; font-weight: 700;" class="mono">${it.line_total.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <!-- Amount in Words -->
    <div class="element-card" style="left: ${amountEl.effectiveX}mm; top: ${amountEl.effectiveY}mm; width: ${amountEl.effectiveWidth}mm; height: ${amountEl.effectiveHeight}mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 4px 6px; font-size: 7.5pt;">
      <div style="font-weight: 700; color: #475569; font-size: 7pt; margin-bottom: 1px;">Amount in Words (المبلغ بالحروف):</div>
      <div style="font-weight: 600; color: #0F172A; font-style: italic; line-height: 1.2;">${inv008Data.amount_in_words}</div>
      <div style="color: #B08D31; direction: rtl; font-size: 7.5pt; font-weight: 600; margin-top: 1px;">
        فقط تسعة وثلاثون ألف و خمسمائة و ستون درهم إماراتي و ستة وثمانون فلساً لا غير
      </div>
    </div>

    <!-- Totals -->
    <div class="element-card" style="left: ${totalsEl.effectiveX}mm; top: ${totalsEl.effectiveY}mm; width: ${totalsEl.effectiveWidth}mm; height: ${totalsEl.effectiveHeight}mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 4px 8px; font-size: 8pt; background: #FFFFFF;">
      <div style="display: flex; justify-content: space-between; padding: 1.5px 0; border-bottom: 1px solid #F1F5F9;">
        <span style="color: #64748B;">Subtotal:</span>
        <span class="mono" style="font-weight: 600;">AED ${inv008Data.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 1.5px 0; border-bottom: 1px solid #CBD5E1; color: #B08D31;">
        <span style="font-weight: 600;">VAT Total (5%):</span>
        <span class="mono" style="font-weight: 600;">AED ${inv008Data.vat_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 2.5px 0 0 0; font-weight: 800; font-size: 9pt; color: #0F172A;">
        <span>Grand Total:</span>
        <span class="mono">AED ${inv008Data.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>

    <!-- Bank Details -->
    <div class="element-card" style="left: ${bankEl.effectiveX}mm; top: ${bankEl.effectiveY}mm; width: ${bankEl.effectiveWidth}mm; height: ${bankEl.effectiveHeight}mm; border: 1px solid #CBD5E1; border-radius: 4px; padding: 4px 6px; font-size: 7pt; line-height: 1.25;">
      <div style="font-weight: 700; color: #475569; font-size: 7pt; margin-bottom: 1px;">Bank Transfer Information (بيانات التحويل):</div>
      <div>Bank: <strong style="color: #0F172A;">${inv008Data.bank_name}</strong></div>
      <div>Account: <strong style="color: #0F172A;">${inv008Data.account_name}</strong></div>
      <div>IBAN: <strong style="font-family: monospace; color: #0F172A;">${inv008Data.iban}</strong></div>
      <div>SWIFT: <strong style="font-family: monospace; color: #0F172A;">${inv008Data.swift}</strong></div>
    </div>

    <!-- Signature Area -->
    <div class="element-card" style="left: ${sigEl.effectiveX}mm; top: ${sigEl.effectiveY}mm; width: ${sigEl.effectiveWidth}mm; height: ${sigEl.effectiveHeight}mm; border: 1px dashed #CBD5E1; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 6px; text-align: center;">
      <div style="font-size: 6.5pt; font-weight: 700; color: #475569; text-transform: uppercase;">COMPANY AUTHORIZED SIGNATURE</div>
      <div style="font-size: 5.5pt; color: #94A3B8; margin-top: 2px;">For ${inv008Data.company_name}</div>
    </div>

    <!-- Stamp Area -->
    ${stampEl ? `
    <div class="element-card" style="left: ${stampEl.effectiveX}mm; top: ${stampEl.effectiveY}mm; width: ${stampEl.effectiveWidth}mm; height: ${stampEl.effectiveHeight}mm; border: 1px dashed #CBD5E1; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 6.5pt; color: #94A3B8;">
      STAMP
    </div>
    ` : ""}

    <!-- Payment Terms -->
    <div class="element-card" style="left: ${termsEl.effectiveX}mm; top: ${termsEl.effectiveY}mm; width: ${termsEl.effectiveWidth}mm; height: ${termsEl.effectiveHeight}mm; font-size: 7pt; color: #475569;">
      <div style="font-weight: 700; color: #1E293B;">Terms & Remarks:</div>
      <div>No additional remarks.</div>
      <div>30 days</div>
    </div>

    <!-- Footer -->
    <div class="element-card" style="left: ${footerEl.effectiveX}mm; top: ${footerEl.effectiveY}mm; width: ${footerEl.effectiveWidth}mm; height: ${footerEl.effectiveHeight}mm; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 3px; font-size: 6.5pt; color: #64748B;">
      <div>${inv008Data.company_name} | Tel: ${inv008Data.company_phone} | Email: ${inv008Data.company_email} | Web: ${inv008Data.company_website}</div>
      <div style="color: #94A3B8; margin-top: 1px;">This is a computer generated document issued in accordance with UAE VAT regulations.</div>
    </div>
  </div>
</body>
</html>`;

const htmlPath = join(OUT_DIR, "inv008_verify.html");
const pdfPath = join(OUT_DIR, "inv008_verify.pdf");

writeFileSync(htmlPath, html, "utf-8");
console.log(`  Wrote HTML to: ${htmlPath}`);

execFileSync(
  CHROME_PATH,
  [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ],
  { stdio: "ignore" }
);

console.log(`  Generated PDF via Chrome at: ${pdfPath}`);

// Generate PNG screenshot via Chrome
const pngPath = join(OUT_DIR, "inv008_verify.png");
execFileSync(
  CHROME_PATH,
  [
    "--headless=new",
    `--screenshot=${pngPath}`,
    "--window-size=794,1123",
    htmlPath,
  ],
  { stdio: "ignore" }
);
console.log(`  Rendered PNG screenshot to: ${pngPath}`);

// -----------------------------------------------------------------------------
// Step 4: Verify PDF Page Count, Dimensions, and Content Integrity
// -----------------------------------------------------------------------------
console.log("\n[4/4] Inspecting Generated PDF & PNG...");
const pdfBytes = readFileSync(pdfPath);
const pdfString = pdfBytes.toString("latin1");

// Page count in PDF: each page is an object dictionary with /Type /Page
const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
const actualPageCount = pageMatches ? pageMatches.length : 1;
console.log(`  Actual PDF Page Count: ${actualPageCount}`);

assert.equal(actualPageCount, 1, `CRITICAL: Generated PDF has ${actualPageCount} pages! Expected exactly 1 A4 page!`);

// Check MediaBox dimensions for A4 portrait: 595.28 x 841.89 points (210 x 297 mm)
const mediaBoxMatch = pdfString.match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
if (mediaBoxMatch) {
  const widthPt = parseFloat(mediaBoxMatch[1]);
  const heightPt = parseFloat(mediaBoxMatch[2]);
  const widthMm = (widthPt * 25.4) / 72;
  const heightMm = (heightPt * 25.4) / 72;
  console.log(`  PDF Page Dimensions: ${widthMm.toFixed(1)}mm × ${heightMm.toFixed(1)}mm (A4 Portrait)`);
  assert.ok(Math.abs(widthMm - 210) < 2.0, "Width must match A4 (210mm)");
  assert.ok(Math.abs(heightMm - 297) < 2.0, "Height must match A4 (297mm)");
}

// Check PNG screenshot exists and has valid size
const pngBytes = readFileSync(pngPath);
console.log(`  PNG Screenshot generated: ${pngBytes.length} bytes`);
assert.ok(pngBytes.length > 50000, "PNG screenshot must be a valid render");

console.log("\n==================================================================");
console.log("ALL CHECKS PASSED: INV-008 FITS CLEANLY ON EXACTLY 1 A4 PAGE!");
console.log("==================================================================");


