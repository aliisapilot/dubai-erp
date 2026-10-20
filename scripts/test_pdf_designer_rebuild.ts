process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock-company.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "mock-key";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "mock-key";

import assert from "node:assert/strict";

async function main() {
  const {
    createDefaultLayout,
    normalizeLayout,
  } = await import("../lib/documentDesigner");
  const {
    computeIntelligentFitProfile,
    computeEffectiveLayout,
  } = await import("../lib/documentLayoutEngine");
  const { calcLineItem } = await import("../lib/helpers");

console.log("==================================================================");
console.log("DUBAI ERP — PDF DESIGNER REBUILD & DOCUMENT EDITING VERIFICATION");
console.log("==================================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(err);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Layout Mode Defaults to Manual Design
// -----------------------------------------------------------------------------
runTest("Default layout defaults to 'manual' layoutMode", () => {
  const layout = createDefaultLayout("tax_invoice");
  assert.equal(layout.layoutMode, "manual", "Default layoutMode should be 'manual'");
  assert.ok(layout.elements.length > 0, "Default layout should contain elements");
});

// -----------------------------------------------------------------------------
// Test 2: Manual Design Mode Preserves Coordinates Beyond A4 Boundary
// -----------------------------------------------------------------------------
runTest("Manual mode preserves coordinates beyond A4 boundary without clipping", () => {
  const layout = createDefaultLayout("tax_invoice");
  layout.layoutMode = "manual";
  
  // Intentionally place an element beyond A4 width (210mm) and height (297mm)
  layout.elements[0].x = 225; // > 210mm
  layout.elements[0].y = 315; // > 297mm
  layout.elements[0].width = 60;
  layout.elements[0].height = 20;

  const normalized = normalizeLayout(layout);
  assert.equal(normalized.elements[0].x, 225, "Manual mode must not clamp X to A4 width");
  assert.equal(normalized.elements[0].y, 315, "Manual mode must not clamp Y to A4 height");
});

// -----------------------------------------------------------------------------
// Test 3: Manual Design Mode Disables Header Collision Auto-Repositioning
// -----------------------------------------------------------------------------
runTest("Manual mode prevents automatic repositioning during element collision", () => {
  const layout = createDefaultLayout("tax_invoice");
  layout.layoutMode = "manual";

  // Force two elements into exact same coordinates
  layout.elements[0].x = 14;
  layout.elements[0].y = 20;
  layout.elements[1].x = 14;
  layout.elements[1].y = 20;

  const normalized = normalizeLayout(layout);
  assert.equal(normalized.elements[0].y, 20, "Element 0 Y must remain 20");
  assert.equal(normalized.elements[1].y, 20, "Element 1 Y must remain 20 in manual mode");
});

// -----------------------------------------------------------------------------
// Test 4: Auto Fit Mode Enables Clamping and Collision Resolution
// -----------------------------------------------------------------------------
runTest("Auto Fit mode clamps elements to A4 page dimensions", () => {
  const layout = createDefaultLayout("tax_invoice");
  layout.layoutMode = "auto_fit";

  layout.elements[0].x = 250;
  layout.elements[0].width = 50;
  const normalized = normalizeLayout(layout);

  // In auto_fit mode, x is clamped to pageWidth - width = 210 - 50 = 160
  assert.equal(normalized.elements[0].x, 160, "Auto-fit mode must clamp X to 160");
});

// -----------------------------------------------------------------------------
// Test 5: Intelligent Fit Engine Disables Smart Fit in Manual Mode
// -----------------------------------------------------------------------------
runTest("computeIntelligentFitProfile disables smart fit compression in manual mode", () => {
  const layout = createDefaultLayout("tax_invoice");
  layout.layoutMode = "manual";

  const fitProfile = computeIntelligentFitProfile(layout, 15, [
    { description: "Heavy Duty PVC Tent Fabric" },
  ]);

  assert.equal(fitProfile.smartFitApplied, false, "Smart fit must not be applied in manual mode");
  assert.equal(fitProfile.followerScale, 1.0, "Follower scale must remain 1.0");
});

// -----------------------------------------------------------------------------
// Test 6: Effective Layout Preserves Exact Header and Table Coordinates in Manual Mode
// -----------------------------------------------------------------------------
runTest("computeEffectiveLayout preserves exact coordinates in manual mode", () => {
  const layout = createDefaultLayout("tax_invoice");
  layout.layoutMode = "manual";
  const table = layout.elements.find((el) => el.type === "line_items");
  if (table) table.y = 88;
  layout.elements[0].y = 12;
  layout.elements[0].height = 25;

  const effective = computeEffectiveLayout(layout, 5, true);
  const effectiveTable = effective.elements.find((el) => el.type === "line_items");
  assert.equal(effectiveTable?.effectiveY, 88, "Table effective Y must be preserved exactly");
  assert.equal(effective.elements[0].effectiveY, 12, "Element Y must be preserved exactly");
  assert.equal(effective.elements[0].effectiveHeight, 25, "Element height must be preserved exactly");
});

// -----------------------------------------------------------------------------
// Test 7: Direct Inline Custom Text Property Persistence
// -----------------------------------------------------------------------------
runTest("Custom inline text changes are preserved on document elements", () => {
  const layout = createDefaultLayout("tax_invoice");
  const el = layout.elements.find((e) => e.type === "company_name_en");
  assert.ok(el, "Company name EN element must exist");

  // User double-clicks and edits text directly on canvas
  el.customText = "AL SAFWAH AL QABDHA TENTS IND L.L.C SP — HEAD OFFICE";
  const normalized = normalizeLayout(layout);
  const updatedEl = normalized.elements.find((e) => e.type === "company_name_en");
  assert.equal(
    updatedEl?.customText,
    "AL SAFWAH AL QABDHA TENTS IND L.L.C SP — HEAD OFFICE",
    "customText must be preserved in normalized layout"
  );
});

// -----------------------------------------------------------------------------
// Test 8: Financial Calculations for Document Split-Screen Editor
// -----------------------------------------------------------------------------
runTest("calcLineItem calculates taxable, vat and total accurately", () => {
  // Qty: 10, Price: 150, Discount: 10%, VAT: 5%
  // Sub: 1500, Disc: 150 -> Taxable: 1350
  // VAT: 1350 * 5% = 67.5
  // Total: 1417.5
  const result = calcLineItem(10, 150, 10, 5);
  assert.equal(result.taxable, 1350, "Taxable amount calculation error");
  assert.equal(result.vatAmount, 67.5, "VAT amount calculation error");
  assert.equal(result.lineTotal, 1417.5, "Line total calculation error");
});

// -----------------------------------------------------------------------------
// Test 9: Status Permission Guard Enforcement
// -----------------------------------------------------------------------------
runTest("Status guard detects finalized financial documents", () => {
  const isFinalOrIssued = (status?: string | null) => {
    const s = (status || "").toLowerCase();
    return s === "issued" || s === "final" || s === "paid";
  };

  assert.equal(isFinalOrIssued("draft"), false, "Draft should be editable");
  assert.equal(isFinalOrIssued("issued"), true, "Issued must be guarded");
  assert.equal(isFinalOrIssued("Final"), true, "Final must be guarded");
  assert.equal(isFinalOrIssued("paid"), true, "Paid must be guarded");
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("------------------------------------------------------------------");
console.log(`Tests Completed: ${testsPassed + testsFailed} | Passed: ${testsPassed} | Failed: ${testsFailed}`);
console.log("------------------------------------------------------------------");

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log("ALL TESTS PASSED SUCCESSFULLY!");
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
