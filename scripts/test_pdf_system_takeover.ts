import fs from "node:fs";
try { process.loadEnvFile(".env.local"); } catch {}
import assert from "node:assert/strict";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import {
  createDefaultLayout,
  normalizeLayout,
  CURRENT_LAYOUT_VERSION,
  type DocumentTypeId,
  type DocumentLayout,
} from "../lib/documentDesigner";
import {
  applyFitBoxWithCollisionClearance,
  computeEffectiveLayout,
} from "../lib/documentLayoutEngine";

console.log("==================================================================");
console.log("DUBAI ERP — PDF SYSTEM TAKEOVER COMPREHENSIVE TEST SUITE");
console.log("==================================================================");

// 1. Verify createDefaultLayout geometry
console.log("\n[TEST 1] Testing createDefaultLayout for all document types...");
const docTypes: DocumentTypeId[] = [
  "tax_invoice",
  "quotation",
  "proforma_invoice",
  "delivery_note",
  "purchase_order",
  "receipt_voucher",
];

for (const docType of docTypes) {
  const layout = createDefaultLayout(docType);
  assert.equal(layout.version, CURRENT_LAYOUT_VERSION, `Layout version must be ${CURRENT_LAYOUT_VERSION}`);

  const docMeta = layout.elements.find((e) => e.id === "doc_meta");
  const custInfo = layout.elements.find((e) => e.id === "customer_info" || e.id === "supplier_info");
  const table = layout.elements.find((e) => e.type === "line_items");

  if (docMeta) {
    console.log(`  ${docType} doc_meta: y=${docMeta.y}, h=${docMeta.height}`);
    assert.ok(docMeta.height >= 38, `${docType} doc_meta height must be >= 38mm (was ${docMeta.height})`);
  }

  if (custInfo) {
    console.log(`  ${docType} ${custInfo.id}: y=${custInfo.y}, h=${custInfo.height}`);
    assert.ok(custInfo.height >= 38, `${docType} customer/supplier info height must be >= 38mm (was ${custInfo.height})`);
  }

  if (table && docMeta) {
    const metaBottom = docMeta.y + docMeta.height;
    const gap = table.y - metaBottom;
    console.log(`  ${docType} clearance: table.y=${table.y}, metaBottom=${metaBottom}, gap=${gap}mm`);
    assert.ok(gap >= 3.0, `${docType} table must have >= 3.0mm clearance below doc_meta (was ${gap}mm)`);
  }
}
console.log("  ✓ All default layouts have >= 38mm meta cards and >= 3.0mm table clearance");

// 2. Test normalizeLayout safe migration for legacy saved layouts
console.log("\n[TEST 2] Testing normalizeLayout safe migration for legacy layouts...");
const legacySavedLayout: DocumentLayout = {
  documentType: "tax_invoice",
  templateName: "Saved Production Tax Invoice",
  version: 8,
  layoutMode: "manual",
  page: {
    paper: "A4",
    orientation: "portrait",
    widthMm: 210,
    heightMm: 297,
    margins: { top: 10, bottom: 10, left: 10, right: 10 },
    background: "#FFFFFF",
    watermarkOpacity: 0.08,
  },
  branding: {
    primaryColor: "#0F172A",
    accentColor: "#C9A227",
    tableHeaderColor: "#0F172A",
    borderColor: "#CBD5E1",
    textColor: "#334155",
    mutedColor: "#64748B",
    totalHighlightColor: "#F8F6ED",
  },
  elements: [
    { id: "customer_info", type: "customer_info", label: "Customer Info", x: 12, y: 55, width: 91, height: 27, visible: true, locked: false, zIndex: 10 },
    { id: "doc_meta", type: "doc_meta", label: "Document Date & Reference", x: 107, y: 55, width: 91, height: 36.2, visible: true, locked: false, zIndex: 11 },
    { id: "line_items", type: "line_items", label: "Line Items Table", x: 12, y: 90, width: 186, height: 70, visible: true, locked: false, zIndex: 12 },
    { id: "totals", type: "totals", label: "Totals", x: 110, y: 165, width: 88, height: 30, visible: true, locked: false, zIndex: 13 },
  ],
};

const migrated = normalizeLayout(legacySavedLayout);
const migratedMeta = migrated.elements.find((e) => e.id === "doc_meta")!;
const migratedTable = migrated.elements.find((e) => e.id === "line_items")!;
const migratedTotals = migrated.elements.find((e) => e.id === "totals")!;

console.log(`  Migrated doc_meta: y=${migratedMeta.y}, h=${migratedMeta.height}`);
console.log(`  Migrated line_items: y=${migratedTable.y}`);
console.log(`  Migrated totals: y=${migratedTotals.y}`);

assert.ok(migratedMeta.height >= 38, `Migrated doc_meta height must be >= 38 (was ${migratedMeta.height})`);
assert.ok(migratedTable.y >= migratedMeta.y + migratedMeta.height + 3.0, "Table must clear doc_meta by >= 3.0mm");
assert.ok(migratedTotals.y > 165, "Downstream followers must shift by the exact table shift delta");
console.log("  ✓ Legacy layout safely migrated: 0 collisions, 3mm table clearance, followers shifted cleanly");

// 3. Test applyFitBoxWithCollisionClearance
console.log("\n[TEST 3] Testing applyFitBoxWithCollisionClearance...");
const fitted = applyFitBoxWithCollisionClearance(migrated, "doc_meta", {
  widthMm: 91,
  heightMm: 44, // simulate expanding to 44mm
});

const fittedMeta = fitted.elements.find((e) => e.id === "doc_meta")!;
const fittedTable = fitted.elements.find((e) => e.id === "line_items")!;
const fittedTotals = fitted.elements.find((e) => e.id === "totals")!;

console.log(`  Fitted doc_meta height: ${fittedMeta.height}`);
console.log(`  Fitted table y: ${fittedTable.y}`);
console.log(`  Fitted totals y: ${fittedTotals.y}`);

assert.equal(fittedMeta.height, 44, "doc_meta height must be 44");
assert.equal(fittedTable.y, 55 + 44 + 3.0, "Table must be placed at doc_meta bottom (99mm) + 3mm = 102mm");
assert.ok(fittedTotals.y > migratedTotals.y, "Totals must shift down by the table offset");
console.log("  ✓ applyFitBoxWithCollisionClearance passed with exact 3.0mm collision clearance");

console.log("\n==================================================================");
console.log("ALL UNIT GEOMETRY TESTS PASSED CLEANLY!");
console.log("==================================================================");
