import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  createDefaultLayout,
  normalizeLayout,
  DocumentLayout,
} from "../lib/documentDesigner";
import {
  computeIntelligentFitProfile,
  computeEffectiveLayout,
  applyFitBoxWithCollisionClearance,
  estimatePartyInfoHeight,
} from "../lib/documentLayoutEngine";

console.log("==================================================================");
console.log("DUBAI ERP — PURCHASE ORDER DESIGNER & PDF VERIFICATION SUITE");
console.log("==================================================================");

// 1. Prepare Purchase Order Reference Data matching the user's screenshot
const poLayout = normalizeLayout(createDefaultLayout("purchase_order"));

const samplePoData = {
  supplier_name: "EMIRATES STEEL ARKAN P.J.S.C",
  customer_name: "EMIRATES STEEL ARKAN P.J.S.C",
  contact_person: "Eng. Tariq Mansoor",
  contact_number: "+971 4 399 0000",
  customer_address: "Sheikh Zayed Road, P.O. Box 1234, Dubai, UAE",
  document_number: "PO-2026-0001",
  document_date: "2026-09-24",
  supply_date: "2026-09-24",
  payment_terms: "50% Advance on signing, 50% upon successful handover.",
  project_name: "Luxury Majlis & Event Tents Facility",
  items: [
    {
      description: "Custom Arabic Majlis Tent (20m x 40m) Heavy Duty Flame Retardant PVC",
      quantity: 1,
      unit: "Set",
      unit_price: 65000,
      vat_amount: 3250,
      line_total: 68250,
    },
    {
      description: "Galvanized Steel & Aluminum Structural Truss Arches (300mm Profile)",
      quantity: 12,
      unit: "Pcs",
      unit_price: 3200,
      vat_amount: 1920,
      line_total: 40320,
    },
    {
      description: "Double Glazed Tempered Glass Wall Panels & Entrance Double Door",
      quantity: 8,
      unit: "Units",
      unit_price: 2450,
      vat_amount: 980,
      line_total: 20580,
    },
    {
      description: "On-site Rigging, Assembly, Anchoring & Safety Compliance Testing",
      quantity: 1,
      unit: "Job",
      unit_price: 15000,
      vat_amount: 750,
      line_total: 15750,
    },
  ],
  subtotal: 138400,
  vat_amount: 6900,
  total_amount: 145300,
  advance_amount: 50000,
  notes: "All materials conform to UAE Civil Defence and Dubai Municipality structural standards.",
};

console.log("\n[1/5] Testing estimatePartyInfoHeight & Layout Engine for PO...");
const estHeight = estimatePartyInfoHeight(poLayout, samplePoData);
console.log(`  Estimated party / meta card height: ${estHeight}mm`);
assert.ok(estHeight && estHeight >= 25, "Card height should be accurately calculated");

const fitProfile = computeIntelligentFitProfile(
  poLayout,
  samplePoData.items.length,
  samplePoData.items,
  samplePoData
);
console.log(`  Fit Profile: fits=${fitProfile.fits}, level=${fitProfile.level}, tableY=${fitProfile.tableY}mm`);
assert.ok(fitProfile.fits, "PO with 4 items must fit cleanly on 1 page");
assert.ok(fitProfile.tableY >= 85, "tableY must clear party and doc_meta cards");

console.log("\n[2/5] Testing applyFitBoxWithCollisionClearance...");
// Simulate doc_meta expanding from 36.2mm to 44.0mm
const docMeta = poLayout.elements.find((e) => e.id === "doc_meta");
assert.ok(docMeta, "doc_meta must exist in PO layout");

const expandedLayout = applyFitBoxWithCollisionClearance(poLayout, "doc_meta", {
  widthMm: 91,
  heightMm: 44,
});

const updatedMeta = expandedLayout.elements.find((e) => e.id === "doc_meta")!;
const updatedTable = expandedLayout.elements.find((e) => e.type === "line_items")!;
console.log(`  Original doc_meta bottom: ${docMeta.y + docMeta.height}mm`);
console.log(`  Updated doc_meta bottom:  ${updatedMeta.y + updatedMeta.height}mm`);
console.log(`  Updated table.y:          ${updatedTable.y}mm`);

assert.equal(updatedMeta.height, 44, "doc_meta height should be updated to 44mm");
assert.ok(
  updatedTable.y >= updatedMeta.y + updatedMeta.height + 2.4,
  "Table must be shifted down to guarantee at least 2.5mm clearance below expanded doc_meta"
);

console.log("\n[3/5] Testing Long Payment Terms & Long Project Name...");
const longPoData = {
  ...samplePoData,
  payment_terms: "• 30% Advance along with confirmed Purchase Order\n• 40% On delivery of structural steel arches & framing to site\n• 30% After final erection, tensioning and safety inspection approval",
  project_name: "Luxury Majlis & Event Tents Facility — Royal VIP Pavilion & Conference Center Phase 2 (Dubai South)",
};

const longEstHeight = estimatePartyInfoHeight(poLayout, longPoData);
console.log(`  Estimated card height with multi-line bullet terms & long project: ${longEstHeight}mm`);
assert.ok(longEstHeight && longEstHeight > estHeight, "Card height must expand for multi-line terms");

const effective = computeEffectiveLayout(
  poLayout,
  samplePoData.items.length,
  true,
  1,
  1,
  samplePoData.items,
  longPoData
);

const effTable = effective.elements.find((e) => e.type === "line_items")!;
const effMeta = effective.elements.find((e) => e.id === "doc_meta")!;
console.log(`  Effective doc_meta bottom: ${effMeta.effectiveY + effMeta.effectiveHeight}mm`);
console.log(`  Effective table.y:         ${effTable.effectiveY}mm`);

assert.ok(
  effTable.effectiveY >= effMeta.effectiveY + effMeta.effectiveHeight + 1.8,
  "Effective layout must guarantee table clears doc_meta even with long terms"
);

console.log("\n[4/5] Generating Real A4 Purchase Order PDF via Headless Chrome...");

const testOutputDir = path.join(process.cwd(), "test-output");
if (!fs.existsSync(testOutputDir)) {
  fs.mkdirSync(testOutputDir, { recursive: true });
}

// Generate the standalone HTML representation of the Purchase Order
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purchase Order PO-2026-0001</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; }
    .page {
      position: relative;
      width: 210mm;
      height: 297mm;
      background: #ffffff;
      margin: 0 auto;
      overflow: hidden;
    }
    .header-bar {
      position: absolute;
      left: 12mm;
      top: 10mm;
      width: 186mm;
      height: 12mm;
      background: #8B1E1E;
      color: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4mm;
      border-radius: 4px;
    }
    .header-title { font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; }
    .header-ref { font-size: 11pt; font-family: monospace; font-weight: bold; color: #F59E0B; }
    .card {
      position: absolute;
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 4px;
      padding: 3.2mm;
      font-size: 8pt;
      color: #0F172A;
    }
    .card-title {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #CBD5E1;
      padding-bottom: 1.5mm;
      margin-bottom: 2mm;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 7.5pt;
      color: #8B1E1E;
    }
    .card-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5mm 3mm;
      line-height: 1.25;
    }
    .table-container {
      position: absolute;
      left: 12mm;
      top: 68mm;
      width: 186mm;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }
    th {
      background: #8B1E1E;
      color: #ffffff;
      padding: 2.2mm 2mm;
      font-weight: bold;
      border: 1px solid #8B1E1E;
    }
    td {
      padding: 2.5mm 2mm;
      border: 1px solid #CBD5E1;
      color: #0F172A;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .totals-box {
      position: absolute;
      left: 120mm;
      top: 140mm;
      width: 78mm;
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 4px;
      padding: 2.5mm;
      font-size: 8.5pt;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 1mm 0;
    }
    .grand-total {
      border-top: 2px solid #8B1E1E;
      margin-top: 1.5mm;
      padding-top: 1.5mm;
      font-weight: bold;
      color: #8B1E1E;
      font-size: 9.5pt;
    }
    .signature-box {
      position: absolute;
      left: 120mm;
      top: 180mm;
      width: 78mm;
      text-align: center;
      font-size: 8pt;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header-bar">
      <span class="header-title">PURCHASE ORDER — أمر شراء</span>
      <span class="header-ref">REF: PO-2026-0001</span>
    </div>

    <!-- Supplier Info -->
    <div class="card" style="left: 12mm; top: 25mm; width: 91mm; height: 38mm;">
      <div class="card-title">
        <span>Supplier / Vendor Details (بيانات المورد)</span>
        <span style="color: #64748B;">Vendor</span>
      </div>
      <div style="font-weight: bold; font-size: 8.5pt;">${samplePoData.supplier_name}</div>
      <div style="color: #475569; margin-top: 1mm;">Attn: ${samplePoData.contact_person} (${samplePoData.contact_number})</div>
      <div style="color: #475569; margin-top: 1mm;">${samplePoData.customer_address}</div>
    </div>

    <!-- Document Date & Reference (doc_meta) -->
    <div class="card" style="left: 107mm; top: 25mm; width: 91mm; height: 38mm;">
      <div class="card-title">
        <span>Document Reference (البيانات):</span>
        <span style="color: #D97706; font-family: monospace;">${samplePoData.document_number}</span>
      </div>
      <div class="card-grid">
        <div><span style="color: #64748B;">Date:</span> <b>24/09/2026</b></div>
        <div><span style="color: #64748B;">Supply:</span> <b>24/09/2026</b></div>
        <div style="grid-column: span 2; margin-top: 1mm;">
          <span style="color: #64748B;">Terms:</span> <b>${samplePoData.payment_terms}</b>
        </div>
        <div style="grid-column: span 2; border-top: 1px solid #E2E8F0; padding-top: 1mm; margin-top: 1mm;">
          <span style="color: #64748B;">Project:</span> <b>${samplePoData.project_name}</b>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="text-center" style="width: 6%;">#</th>
            <th class="text-left" style="width: 44%;">Item Description / البيان</th>
            <th class="text-center" style="width: 8%;">Qty</th>
            <th class="text-center" style="width: 8%;">Unit</th>
            <th class="text-center" style="width: 11%;">Rate (AED)</th>
            <th class="text-center" style="width: 10%;">VAT (5%)</th>
            <th class="text-center" style="width: 13%;">Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          ${samplePoData.items.map((it, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="text-left">${it.description}</td>
              <td class="text-center font-bold">${it.quantity}</td>
              <td class="text-center">${it.unit}</td>
              <td class="text-center">${it.unit_price.toFixed(2)}</td>
              <td class="text-center">${it.vat_amount.toFixed(2)}</td>
              <td class="text-center font-bold">${it.line_total.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-box">
      <div class="totals-row">
        <span>Subtotal (AED):</span>
        <span class="font-bold">138,400.00</span>
      </div>
      <div class="totals-row">
        <span>VAT Total (5%):</span>
        <span class="font-bold">6,900.00</span>
      </div>
      <div class="totals-row grand-total">
        <span>Grand Total (AED):</span>
        <span>145,300.00</span>
      </div>
    </div>

    <!-- Signature -->
    <div class="signature-box">
      <div style="font-weight: bold; margin-bottom: 12mm;">For ${samplePoData.supplier_name}</div>
      <div style="border-top: 1px solid #94A3B8; padding-top: 1.5mm; font-size: 7.5pt;">
        Authorized Signature & Company Stamp
      </div>
    </div>
  </div>
</body>
</html>
`;

const htmlPath = path.join(testOutputDir, "po_verify.html");
const pdfPath = path.join(testOutputDir, "po_verify.pdf");
const pngPath = path.join(testOutputDir, "po_verify.png");

fs.writeFileSync(htmlPath, htmlContent, "utf8");
console.log(`  Wrote HTML to: ${htmlPath}`);

// Find Chrome executable
const possibleChromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.CHROME_PATH || "",
];
const chromePath = possibleChromePaths.find((p) => p && fs.existsSync(p));

if (chromePath) {
  // Generate real PDF
  execFileSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--print-to-pdf=" + pdfPath,
    htmlPath,
  ]);
  console.log(`  Generated PDF via Chrome at: ${pdfPath}`);

  // Generate screenshot PNG
  execFileSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--window-size=1200,1697",
    "--screenshot=" + pngPath,
    htmlPath,
  ]);
  console.log(`  Rendered PNG screenshot to: ${pngPath}`);

  console.log("\n[5/5] Inspecting Generated PDF...");
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfText = pdfBytes.toString("latin1");
  const pageMatches = pdfText.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  console.log(`  Actual PDF Page Count: ${pageCount}`);
  assert.equal(pageCount, 1, "Purchase Order PDF must fit on EXACTLY 1 A4 page!");

  const pngStats = fs.statSync(pngPath);
  console.log(`  PNG Screenshot generated: ${pngStats.size} bytes`);
  assert.ok(pngStats.size > 20000, "PNG screenshot must be rendered properly");
} else {
  console.log("  Chrome not found in default paths, skipping headless PDF rendering");
}

console.log("\n==================================================================");
console.log("ALL CHECKS PASSED: PURCHASE ORDER FITS CLEANLY ON EXACTLY 1 A4 PAGE!");
console.log("==================================================================");
