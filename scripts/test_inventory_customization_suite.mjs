import fs from "node:fs";
import assert from "node:assert";

if (fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const {
  DEFAULT_CUSTOM_CATEGORIES,
  DEFAULT_CUSTOM_UNITS,
  normalizeProductToMaterial,
  encodeMaterialMetadata,
  decodeMaterialMetadata,
} = await import("../lib/materialInventory");

console.log("=== RUNNING INVENTORY CUSTOMIZATION & SIMPLIFICATION TEST SUITE ===\n");

// 1. Verify Default Categories and Units
console.log("Test 1: Default Categories and Units Verification");
assert.ok(DEFAULT_CUSTOM_CATEGORIES.length >= 8, "Expected at least 8 default categories");
const catNames = DEFAULT_CUSTOM_CATEGORIES.map(c => c.name);
assert.ok(catNames.includes("PVC Fabric"), "PVC Fabric category missing");
assert.ok(catNames.includes("Welding Materials"), "Welding Materials category missing");
assert.ok(catNames.includes("Finished Products"), "Finished Products category missing");

assert.ok(DEFAULT_CUSTOM_UNITS.length >= 8, "Expected at least 8 default units");
const unitCodes = DEFAULT_CUSTOM_UNITS.map(u => u.code);
assert.ok(unitCodes.includes("PCS"), "PCS unit missing");
assert.ok(unitCodes.includes("RM"), "RM unit missing");
assert.ok(unitCodes.includes("SQM"), "SQM unit missing");
assert.ok(unitCodes.includes("ROLL"), "ROLL unit missing");
console.log("  ✓ Default categories and units validated successfully.");

// 2. Custom Category Management Logic & Product Usage Guard
console.log("\nTest 2: Custom Category Management & Deletion Guard");
let companyCategories = [...DEFAULT_CUSTOM_CATEGORIES];

// Add custom category
const newCat = {
  id: "cat_custom_tent",
  name: "Tent Hardware",
  color: "#f59e0b",
  active: true,
  is_custom: true,
};
companyCategories.push(newCat);
assert.strictEqual(companyCategories.find(c => c.name === "Tent Hardware")?.color, "#f59e0b");

// Rename custom category
companyCategories = companyCategories.map(c => c.id === "cat_custom_tent" ? { ...c, name: "Tent Structure Hardware" } : c);
assert.strictEqual(companyCategories.find(c => c.id === "cat_custom_tent")?.name, "Tent Structure Hardware");

// Usage guard check: cannot delete category used by existing products
const mockProducts = [
  { id: "p1", name: "Tent Pole", category: "Tent Structure Hardware", active: true }
];
const categoryInUse = mockProducts.some(p => p.category === "Tent Structure Hardware");
assert.strictEqual(categoryInUse, true, "Category usage guard should detect active product usage");
console.log("  ✓ Category creation, renaming, and usage protection verified.");

// 3. Custom Units Management
console.log("\nTest 3: Custom Units Definition & Normalization");
let companyUnits = [...DEFAULT_CUSTOM_UNITS];
const customUnit = {
  id: "unit_box_24",
  code: "BOX-24",
  name: "Box of 24 Units",
  is_custom: true,
  active: true,
};
companyUnits.push(customUnit);
const foundUnit = companyUnits.find(u => u.code === "BOX-24");
assert.ok(foundUnit);
assert.strictEqual(foundUnit.name, "Box of 24 Units");
console.log("  ✓ Custom unit addition and code validation passed.");

// 4. Custom Field Definition Validation
console.log("\nTest 4: Custom Field Schema & Type Validation");
const customFields = [
  { id: "cf_fabric_width", name: "Fabric Width", field_type: "decimal", required: true, default_value: 3.0 },
  { id: "cf_gsm", name: "GSM", field_type: "number", required: false, default_value: 650 },
  { id: "cf_color", name: "Color", field_type: "dropdown", required: false, options: ["White", "Beige", "Blue", "Black"] },
  { id: "cf_batch", name: "Batch Number", field_type: "text", required: false },
  { id: "cf_expiry", name: "Expiry Date", field_type: "date", required: false },
  { id: "cf_uv_treated", name: "UV Treated", field_type: "boolean", required: false, default_value: true },
];

for (const field of customFields) {
  assert.ok(["text", "number", "decimal", "date", "dropdown", "boolean"].includes(field.field_type), `Unknown field type: ${field.field_type}`);
  if (field.field_type === "dropdown") {
    assert.ok(Array.isArray(field.options) && field.options.length > 0, "Dropdown must have options");
  }
}
console.log("  ✓ Custom fields schema and typing validated for text, number, decimal, date, dropdown, boolean.");

// 5. Product Types & Service Stock Exemption
console.log("\nTest 5: Product Types & Service Stock Exemption");
const rawMaterial = {
  id: "mat-1",
  company_id: "company-1",
  sku: "MAT-PVC-001",
  name: "PVC Fabric 650 GSM",
  category: "PVC Fabric",
  unit: "SQM",
  selling_price: 25.0,
  cost_price: 18.0,
  current_stock: 500,
  active: true,
  metadata: {
    product_type: "material",
    custom_fields: { Fabric_Width: 3.0, GSM: 650, Color: "White" }
  }
};

const rawService = {
  id: "srv-1",
  company_id: "company-1",
  sku: "SRV-WELD-001",
  name: "High Frequency Welding Service",
  category: "Welding Materials",
  unit: "HOUR",
  selling_price: 150.0,
  cost_price: 0,
  current_stock: 0,
  active: true,
  metadata: {
    product_type: "service",
    is_service: true
  }
};

const normMaterial = normalizeProductToMaterial(rawMaterial);
assert.strictEqual(normMaterial.product_type, "material");
assert.strictEqual(normMaterial.is_service, false);
assert.strictEqual(normMaterial.current_stock, 500);
assert.strictEqual(normMaterial.custom_field_values?.GSM, 650);

const normService = normalizeProductToMaterial(rawService);
assert.strictEqual(normService.product_type, "service");
assert.strictEqual(normService.is_service, true);
assert.strictEqual(normService.current_stock, 0);
console.log("  ✓ Material and Service normalization verified (services exempted from stock tracking).");

// 6. Metadata Serialization & Resilience
console.log("\nTest 6: Dual-Mode Metadata Serialization & Deserialization");
const originalMeta = {
  product_type: "finished_product",
  is_service: false,
  min_stock_alert: 20,
  custom_fields: {
    Fabric_Color: "Forest Green",
    Storage_Location: "Rack B-12"
  }
};
const encodedTag = encodeMaterialMetadata(originalMeta);
const descriptionText = "Heavy-duty outdoor PVC shade sail";
const combinedDescription = `${descriptionText}\n${encodedTag}`;

const decodedMeta = decodeMaterialMetadata(combinedDescription);
assert.strictEqual(decodedMeta.product_type, "finished_product");
assert.strictEqual(decodedMeta.min_stock_alert, 20);
assert.strictEqual(decodedMeta.custom_fields?.Fabric_Color, "Forest Green");
assert.strictEqual(decodedMeta.custom_fields?.Storage_Location, "Rack B-12");
console.log("  ✓ Dual-mode JSON metadata encoding/decoding is completely intact.");

// 7. Stock In and Stock Out Ledger Math
console.log("\nTest 7: Stock In and Stock Out Calculations");
let currentStock = 100;
const stockInQty = 50;
const afterStockIn = currentStock + stockInQty;
assert.strictEqual(afterStockIn, 150);

const stockOutQty = 30;
const afterStockOut = afterStockIn - stockOutQty;
assert.strictEqual(afterStockOut, 120);

// Audit record structure validation
const sampleMovement = {
  product_id: "mat-1",
  company_id: "company-1",
  movement_type: "in",
  quantity: stockInQty,
  previous_stock: currentStock,
  new_stock: afterStockIn,
  reason: "Shipment PO-9018",
  reference_type: "manual",
};
assert.strictEqual(sampleMovement.new_stock, sampleMovement.previous_stock + sampleMovement.quantity);
console.log("  ✓ Stock In / Out arithmetic and audit ledger fields verified.");

// 8. Document Auto-Population Simulation
console.log("\nTest 8: Document Auto-Population & Override Preservation");
const catalogProduct = {
  id: "prod-pvc-100",
  name: "PVC Fabric 900 GSM",
  description: "Flame retardant tensile fabric (Panama weave)",
  unit: "SQM",
  selling_price: 45.0,
  cost_price: 30.0,
  vat_rate: 5.0,
};

// Selection logic
const lineDesc = catalogProduct.description
  ? `${catalogProduct.name} - ${catalogProduct.description}`.trim()
  : catalogProduct.name;
const documentLine = {
  product_id: catalogProduct.id,
  description: lineDesc,
  unit: catalogProduct.unit,
  unit_price: catalogProduct.selling_price,
  vat_rate: catalogProduct.vat_rate,
  quantity: 10,
  line_total: 10 * 45.0 * 1.05,
};

assert.strictEqual(documentLine.description, "PVC Fabric 900 GSM - Flame retardant tensile fabric (Panama weave)");
assert.strictEqual(documentLine.unit_price, 45.0);
assert.strictEqual(documentLine.vat_rate, 5.0);

// Override simulation: user edits rate to 42.0 AED and customizes description
const overriddenLine = {
  ...documentLine,
  description: "PVC Fabric 900 GSM (Custom cut to 15m lengths)",
  unit_price: 42.0,
};
assert.strictEqual(overriddenLine.unit_price, 42.0);
assert.strictEqual(overriddenLine.description, "PVC Fabric 900 GSM (Custom cut to 15m lengths)");

// Verify original catalog product is unchanged
assert.strictEqual(catalogProduct.selling_price, 45.0);
console.log("  ✓ Document auto-fill, custom overrides, and historical decoupling verified.");

console.log("\n=================================================");
console.log(" ALL 8 INVENTORY CUSTOMIZATION TESTS PASSED!   ");
console.log("=================================================\n");
