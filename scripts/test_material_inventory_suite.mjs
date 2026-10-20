import fs from "node:fs";
if (fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

import assert from "node:assert";

const {
  calculateSqmFromRm,
  calculateRmFromSqm,
  calculateFromRolls,
  calculateTotalCost,
  roundDecimal,
  encodeMaterialMetadata,
  decodeMaterialMetadata,
  stripMaterialMetadata,
  normalizeProductToMaterial,
} = await import("../lib/materialInventory");

console.log("=== RUNNING MATERIAL INVENTORY CALCULATION TEST SUITE ===");

// 1. Scenario 1: Korean Fabric 3 m width, 100 running metres = 300 m²
const sqm1 = calculateSqmFromRm(3.0, 100.0);
console.log(`Test 1 (Korean Fabric 3m × 100 RM): ${sqm1} m² (Expected: 300.000 m²)`);
assert.strictEqual(sqm1, 300);

// 2. Scenario 2: Mahler German Fabric 2.5 m width, 80 running metres = 200 m²
const sqm2 = calculateSqmFromRm(2.5, 80.0);
console.log(`Test 2 (Mahler German Fabric 2.5m × 80 RM): ${sqm2} m² (Expected: 200.000 m²)`);
assert.strictEqual(sqm2, 200);

// 3. Inverse conversion: 300 m² / 3 m width = 100 running metres
const rm1 = calculateRmFromSqm(3.0, 300.0);
console.log(`Test 3 (Inverse RM calculation 300 m² / 3m): ${rm1} RM (Expected: 100.000 RM)`);
assert.strictEqual(rm1, 100);

// 4. Rolls calculation: 4 rolls of 50 m each, 3 m width -> 200 RM, 600 m²
const rollCalc = calculateFromRolls(4, 50, 3.0);
console.log(`Test 4 (Rolls: 4 rolls × 50m @ 3m): ${rollCalc.totalRunningMetres} RM, ${rollCalc.totalSquareMetres} m²`);
assert.strictEqual(rollCalc.totalRunningMetres, 200);
assert.strictEqual(rollCalc.totalSquareMetres, 600);

// 5. Stock reduction and wastage scenario (Part 5 Example):
// Material: Korean Fabric, Width: 3m, Available Stock: 500 m²
// Material Used: 40 running metres -> 120 m²
// Wastage: 5 m²
// Total Stock Reduction: 125 m²
// Remaining Stock: 375 m²
const width5 = 3.0;
const availableStock = 500;
const rmUsed = 40;
const usedArea = calculateSqmFromRm(width5, rmUsed);
const wastage = 5;
const totalReduction = roundDecimal(usedArea + wastage, 3);
const remainingStock = roundDecimal(availableStock - totalReduction, 3);
console.log(`Test 5 (Stock Out with Wastage):`);
console.log(`  Used Area: ${usedArea} m² (Expected: 120 m²)`);
console.log(`  Total Reduction: ${totalReduction} m² (Expected: 125 m²)`);
console.log(`  Remaining Stock: ${remainingStock} m² (Expected: 375 m²)`);
assert.strictEqual(usedArea, 120);
assert.strictEqual(totalReduction, 125);
assert.strictEqual(remainingStock, 375);

// 6. Cost calculations
// 300 m² @ AED 12 per m² = AED 3,600
const cost1 = calculateTotalCost(12, "per_sqm", { squareMetres: 300, runningMetres: 100 });
console.log(`Test 6a (Cost: 300 m² @ 12 AED/m²): AED ${cost1} (Expected: 3600.00)`);
assert.strictEqual(cost1, 3600);

// 100 RM @ AED 36 per RM = AED 3,600
const cost2 = calculateTotalCost(36, "per_rm", { squareMetres: 300, runningMetres: 100 });
console.log(`Test 6b (Cost: 100 RM @ 36 AED/RM): AED ${cost2} (Expected: 3600.00)`);
assert.strictEqual(cost2, 3600);

// 7. Metadata encoding/decoding resilience
const metaObj = { brand: "Korean Fabric", fabric_width: 3.0, colour: "White", gsm: "650" };
const encoded = encodeMaterialMetadata(metaObj);
const userText = "High quality PVC fabric for parking shades";
const combined = `${userText}\n${encoded}`;
const decoded = decodeMaterialMetadata(combined);
const stripped = stripMaterialMetadata(combined);

console.log(`Test 7 (Dual-mode serialization):`);
assert.strictEqual(decoded.brand, "Korean Fabric");
assert.strictEqual(decoded.fabric_width, 3.0);
assert.strictEqual(stripped, userText);
console.log("  ✓ Metadata decoded and stripped successfully");

// 8. Normalization of product with dual-mode metadata
const rawProduct = {
  id: "test-prod-1",
  company_id: "test-co",
  sku: "FAB-KOR-300",
  name: "Korean Fabric - White - 3m",
  category: "Korean Fabric",
  unit: "Sqm",
  current_stock: 500,
  cost_price: 15,
  description: combined,
};
const normalized = normalizeProductToMaterial(rawProduct);
console.log(`Test 8 (Product normalization):`);
assert.strictEqual(normalized.is_fabric, true);
assert.strictEqual(normalized.fabric_width, 3.0);
assert.strictEqual(normalized.brand, "Korean Fabric");
assert.strictEqual(normalized.square_metres_available, 500);
assert.strictEqual(normalized.running_metres_available, roundDecimal(500 / 3.0, 3));
console.log(`  ✓ Available m²: ${normalized.square_metres_available}, Available RM: ${normalized.running_metres_available}`);

console.log("\n>>> ALL INVENTORY CALCULATION TESTS PASSED SUCCESSFULLY! <<<\n");
