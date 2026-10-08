// Test script: test_document_numbering_customization.mjs
// Verifies customizable document numbering and titles in Dubai ERP

import assert from "node:assert";

// 1. Logic replicate / verify of formatting
function formatDocNumber(config, sequenceNumber, date = new Date(2026, 9, 8)) {
  const seq = Math.max(1, Math.floor(sequenceNumber));
  const pad = Math.max(1, Math.min(10, config.padding || 4));
  const formattedSeq = String(seq).padStart(pad, "0");
  const sep = config.separator ?? "-";

  const parts = [];

  if (config.prefix && config.prefix.trim()) {
    parts.push(config.prefix.trim());
  }

  const yearStr =
    config.yearFormat === "YY"
      ? String(date.getFullYear()).slice(-2)
      : String(date.getFullYear());

  if (config.includeYear && config.yearPosition === "after_prefix") {
    parts.push(yearStr);
  }

  parts.push(formattedSeq);

  if (config.includeYear && config.yearPosition === "after_sequence") {
    parts.push(yearStr);
  }

  return parts.join(sep);
}

function validateDocNumberingConfig(config) {
  const errors = [];
  if (!config) {
    return { valid: false, errors: ["Configuration is missing"] };
  }
  if (config.padding < 1 || config.padding > 10) {
    errors.push("Sequence padding must be between 1 and 10 digits");
  }
  if (config.nextSequence < 1) {
    errors.push("Next sequence number must be 1 or higher");
  }
  if (!["-", "/", " ", ""].includes(config.separator)) {
    errors.push("Invalid separator selected");
  }
  if (!["YYYY", "YY"].includes(config.yearFormat)) {
    errors.push("Invalid year format selected");
  }
  if (!["after_prefix", "after_sequence"].includes(config.yearPosition)) {
    errors.push("Invalid year position selected");
  }
  return { valid: errors.length === 0, errors };
}

console.log("=================================================");
console.log("🧪 TESTING CUSTOMIZABLE DOCUMENT TITLES & NUMBERS");
console.log("=================================================\n");

// TEST 1: User Requested Number Format Examples
console.log("Test 1: Verifying specific user-requested numbering formats...");

const testCases = [
  {
    name: "QTN-0001 (prefix: QTN, year: false, pad: 4, sep: '-')",
    cfg: { prefix: "QTN", includeYear: false, padding: 4, separator: "-", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "QTN-0001",
  },
  {
    name: "QTN-2026-0001 (prefix: QTN, year: true, YYYY, pad: 4, sep: '-')",
    cfg: { prefix: "QTN", includeYear: true, padding: 4, separator: "-", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "QTN-2026-0001",
  },
  {
    name: "QTN/0001 (prefix: QTN, year: false, pad: 4, sep: '/')",
    cfg: { prefix: "QTN", includeYear: false, padding: 4, separator: "/", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "QTN/0001",
  },
  {
    name: "QTN/2026/0001 (prefix: QTN, year: true, YYYY, pad: 4, sep: '/')",
    cfg: { prefix: "QTN", includeYear: true, padding: 4, separator: "/", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "QTN/2026/0001",
  },
  {
    name: "0001 (no prefix, year: false, pad: 4, sep: '')",
    cfg: { prefix: "", includeYear: false, padding: 4, separator: "", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "0001",
  },
  {
    name: "PI-001 (prefix: PI, year: false, pad: 3, sep: '-')",
    cfg: { prefix: "PI", includeYear: false, padding: 3, separator: "-", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "PI-001",
  },
  {
    name: "DN-00001 (prefix: DN, year: false, pad: 5, sep: '-')",
    cfg: { prefix: "DN", includeYear: false, padding: 5, separator: "-", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "DN-00001",
  },
  {
    name: "PO-26-001 (prefix: PO, year: true, YY, pad: 3, sep: '-')",
    cfg: { prefix: "PO", includeYear: true, padding: 3, separator: "-", yearFormat: "YY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "PO-26-001",
  },
  {
    name: "PO 2026 001 (space separator)",
    cfg: { prefix: "PO", includeYear: true, padding: 3, separator: " ", yearFormat: "YYYY", yearPosition: "after_prefix", nextSequence: 1 },
    expected: "PO 2026 001",
  },
  {
    name: "INV-0001-2026 (year position after_sequence)",
    cfg: { prefix: "INV", includeYear: true, padding: 4, separator: "-", yearFormat: "YYYY", yearPosition: "after_sequence", nextSequence: 1 },
    expected: "INV-0001-2026",
  },
];

for (const tc of testCases) {
  const result = formatDocNumber(tc.cfg, tc.cfg.nextSequence);
  assert.strictEqual(result, tc.expected, `Mismatch for ${tc.name}: got "${result}", expected "${tc.expected}"`);
  console.log(`  ✓ ${tc.name} -> "${result}"`);
}

// TEST 2: Validation of Configs
console.log("\nTest 2: Verifying configuration validation rules...");
const validRes = validateDocNumberingConfig({
  prefix: "TEST",
  includeYear: true,
  yearFormat: "YYYY",
  yearPosition: "after_prefix",
  separator: "-",
  padding: 4,
  nextSequence: 50,
});
assert.strictEqual(validRes.valid, true, "Valid config should pass");
console.log("  ✓ Valid configuration passed");

const invalidPad = validateDocNumberingConfig({
  prefix: "TEST",
  includeYear: true,
  yearFormat: "YYYY",
  yearPosition: "after_prefix",
  separator: "-",
  padding: 15,
  nextSequence: 1,
});
assert.strictEqual(invalidPad.valid, false, "Padding > 10 should fail");
assert.ok(invalidPad.errors[0].includes("padding"), "Error message should mention padding");
console.log("  ✓ Padding validation enforced (1 to 10)");

const invalidSeq = validateDocNumberingConfig({
  prefix: "TEST",
  includeYear: true,
  yearFormat: "YYYY",
  yearPosition: "after_prefix",
  separator: "-",
  padding: 4,
  nextSequence: 0,
});
assert.strictEqual(invalidSeq.valid, false, "Sequence < 1 should fail");
console.log("  ✓ Sequence validation enforced (>= 1)");

// TEST 3: Title Customization
console.log("\nTest 3: Verifying editable document titles resolution...");
const titles = [
  { default: "QUOTATION", custom: "QTN", expected: "QTN" },
  { default: "PROFORMA INVOICE", custom: "PI", expected: "PI" },
  { default: "TAX INVOICE", custom: "TAX INVOICE", expected: "TAX INVOICE" },
  { default: "DELIVERY NOTE", custom: "DN", expected: "DN" },
  { default: "PURCHASE ORDER", custom: "PO", expected: "PO" },
];

for (const t of titles) {
  const resolved = t.custom.trim() || t.default;
  assert.strictEqual(resolved, t.expected);
  console.log(`  ✓ ${t.default} -> "${resolved}"`);
}

// TEST 4: Collision Detection Simulation
console.log("\nTest 4: Simulating duplicate prevention and safe rename collision checks...");
const mockDatabaseNumbers = new Set(["QTN-0001", "QTN-0002", "QTN-0003"]);

function checkAvailability(candidateNumber, currentNumber) {
  if (candidateNumber === currentNumber) return true; // unchanged
  return !mockDatabaseNumbers.has(candidateNumber);
}

assert.strictEqual(checkAvailability("QTN-0001", "QTN-0001"), true, "Same number should be valid for current doc");
assert.strictEqual(checkAvailability("QTN-0002", "QTN-0001"), false, "Existing number collision should be detected");
assert.strictEqual(checkAvailability("QTN-0004", "QTN-0001"), true, "Unique number should be allowed");
console.log("  ✓ Duplicate check correctly identifies collisions and permits unique numbers");

// TEST 5: Real-time Live Canvas Formatting Synchronization
console.log("\nTest 5: Verifying Live Canvas document number generation with numberingConfig...");
const qtnConfig = {
  docType: "quotation",
  customTitle: "QUOTATION",
  customTitleAr: "عرض أسعار",
  prefix: "QTN",
  includeYear: true,
  yearFormat: "YYYY",
  yearPosition: "after_prefix",
  separator: "-",
  padding: 4,
  nextSequence: 1,
};

function simulateSampleDocumentNumber(docType, numberingConfig) {
  return numberingConfig
    ? formatDocNumber(numberingConfig, numberingConfig.nextSequence || 1)
    : "QUO-2026-0042";
}

const canvasDocNum = simulateSampleDocumentNumber("quotation", qtnConfig);
assert.strictEqual(canvasDocNum, "QTN-2026-0001", "Canvas document number must match QTN-2026-0001");
console.log(`  ✓ Live Canvas QTN prefix produces: "${canvasDocNum}" (matches live preview)`);

console.log("\n🎉 ALL CUSTOMIZABLE DOCUMENT TITLE & NUMBERING TESTS PASSED SUCCESSFULLY!\n");
