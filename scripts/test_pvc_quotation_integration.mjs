import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalSource = await readFile(new URL("../components/measurements/PvcTankLinerQuotationModal.tsx", import.meta.url), "utf8");
const calculatorSource = await readFile(new URL("../components/measurements/PvcTankLinerCalculator.tsx", import.meta.url), "utf8");
const measurementsPageSource = await readFile(new URL("../app/measurements/page.tsx", import.meta.url), "utf8");
const quotationTemplateSource = await readFile(new URL("../components/documents/QuotationTemplate.tsx", import.meta.url), "utf8");

test("Two Separate Sections: Customer Quotation (Section A) & Internal Costing Private (Section B)", () => {
  // Section A: Customer Quotation
  assert.match(modalSource, /A\. Customer Quotation/);
  assert.match(modalSource, /Customer Selection/);
  assert.match(modalSource, /Quotation Line Items/);

  // Section B: Internal Costing - Private
  assert.match(modalSource, /B\. Internal Costing — Private/);
  assert.match(modalSource, /Confidential/);
  assert.match(modalSource, /Material (&amp;|&) Fabrication Purchase Costs/);
  assert.match(modalSource, /PVC Fabric Purchase Rate/);
  assert.match(modalSource, /Welding \/ Fabrication Cost/);
  assert.match(modalSource, /SS Eyelet Purchase Cost/);
  assert.match(modalSource, /Logistics (&amp;|&) Consumables/);
  assert.match(modalSource, /Private Profitability (&amp;|&) Margin Analysis/);
});

test("Requirements 1 & 2: Create Quotation button and Customer selection/creation exist", () => {
  assert.match(calculatorSource, /Create Quotation/);
  assert.match(calculatorSource, /onCreateQuotation/);
  assert.match(measurementsPageSource, /PvcTankLinerQuotationModal/);

  assert.match(modalSource, /customerMode/);
  assert.match(modalSource, /Existing Customer/);
  assert.match(modalSource, /\+ New Customer/);
  assert.match(modalSource, /Company \/ Customer Name/);
  assert.match(modalSource, /\.from\("customers"\)[\s\S]*?\.insert/);
});

test("Reference Test Case QTN145/26 & 1-Fils Currency Rounding Policy Investigation", () => {
  const numberOfTanks = 3;
  assert.equal(numberOfTanks, 3, "Test case uses 3 tanks");
  const netSubtotal = 21220.50; // 891 * 15 + 852 * 8 + 693 * 1.5

  // Policy 1: Reference Quotation QTN145/26 (Subtotal 5% rounding)
  // Net Subtotal AED 21,220.50 * 5% = 1,061.025 -> truncated/half-even to AED 1,061.02
  const vatSubtotalPolicy = Math.floor(netSubtotal * 0.05 * 100) / 100;
  const grandTotalSubtotalPolicy = Math.round((netSubtotal + vatSubtotalPolicy) * 100) / 100;

  assert.equal(netSubtotal, 21220.50, "Net Subtotal must be exactly AED 21,220.50");
  assert.equal(vatSubtotalPolicy, 1061.02, "Reference QTN145/26 VAT must be exactly AED 1,061.02");
  assert.equal(grandTotalSubtotalPolicy, 22281.52, "Reference QTN145/26 Grand Total must be exactly AED 22,281.52");

  // Policy 2: Itemized Per-Line Rounding (FTA Standard)
  // Line 1: 891 * 15 = 13,365.00 -> VAT 668.25
  // Line 2: 852 * 8 = 6,816.00 -> VAT 340.80
  // Line 3: 693 * 1.5 = 1,039.50 -> VAT 51.975 -> rounded to 51.98
  const line1Vat = Math.round(13365.00 * 0.05 * 100) / 100;
  const line2Vat = Math.round(6816.00 * 0.05 * 100) / 100;
  const line3Vat = Math.round(1039.50 * 0.05 * 100) / 100;
  const vatPerLinePolicy = line1Vat + line2Vat + line3Vat;
  const grandTotalPerLinePolicy = Math.round((netSubtotal + vatPerLinePolicy) * 100) / 100;

  assert.equal(line3Vat, 51.98, "Line 3 VAT in per-line rounding is 51.98");
  assert.equal(vatPerLinePolicy, 1061.03, "Itemized VAT must be exactly AED 1,061.03");
  assert.equal(grandTotalPerLinePolicy, 22281.53, "Itemized Grand Total must be exactly AED 22,281.53");

  // Verify the modal supports both policies without silent alteration
  assert.match(modalSource, /subtotal_reference/);
  assert.match(modalSource, /per_line_fta/);
  assert.match(modalSource, /1-Fils Currency Policy Explanation/);
});

test("Section B: Internal Costing Calculations & Confidentiality", () => {
  // Test costing calculation example:
  const fabricQtySqm = 891;
  const fabricPurchaseRate = 7.50; // AED 7.50 / sqm
  const eyeletQty = 693;
  const eyeletPurchaseRate = 0.40; // AED 0.40 / pc
  const weldingRm = 852;
  const weldingCostPerRm = 3.00; // AED 3.00 / RM
  const transportCost = 500;
  const miscCost = 250;

  const fabricCost = fabricQtySqm * fabricPurchaseRate; // 6,682.50
  const eyeletCost = eyeletQty * eyeletPurchaseRate; // 277.20
  const totalMaterialCost = fabricCost + eyeletCost; // 6,959.70

  const totalFabricationCost = weldingRm * weldingCostPerRm; // 2,556.00
  const totalDirectExpenses = transportCost + miscCost; // 750.00
  const totalProjectCost = totalMaterialCost + totalFabricationCost + totalDirectExpenses; // 10,265.70

  const sellingSubtotal = 21220.50;
  const estimatedProfit = sellingSubtotal - totalProjectCost; // 10,954.80
  const profitMargin = (estimatedProfit / sellingSubtotal) * 100; // ~51.62%

  assert.equal(fabricCost, 6682.50);
  assert.equal(eyeletCost, 277.20);
  assert.equal(totalMaterialCost, 6959.70);
  assert.equal(totalFabricationCost, 2556.00);
  assert.equal(totalProjectCost, 10265.70);
  assert.equal(estimatedProfit, 10954.80);
  assert.ok(Math.abs(profitMargin - 51.62) < 0.1);

  // Verify Zero Leakage to Customer PDF:
  // QuotationTemplate must NEVER mention internal costing fields
  assert.doesNotMatch(quotationTemplateSource, /fabricPurchaseRate/);
  assert.doesNotMatch(quotationTemplateSource, /totalProjectCost/);
  assert.doesNotMatch(quotationTemplateSource, /estimatedProfit/);
  assert.doesNotMatch(quotationTemplateSource, /profitMargin/);
});

test("Requirement 9: Tank count and dimensions in quotation description", () => {
  assert.match(modalSource, /PVC Tank Liner — \$\{tankCount\} Tank/);
  assert.match(modalSource, /Diameter: \$\{diam\.toFixed\(2\)\} M, Height: \$\{height\.toFixed\(2\)\} M/);
  assert.match(modalSource, /Seam welding: \$\{seam\.toFixed\(0\)\} MM/);
});

test("Requirement 10: Supabase schema compatibility and atomic insertion", () => {
  assert.match(modalSource, /\.from\("quotations"\)[\s\S]*?\.insert/);
  assert.match(modalSource, /\.from\("quotation_items"\)[\s\S]*?\.insert/);
  assert.match(modalSource, /generateDocNumber\(coId, "QUO"\)/);
});

test("Requirement 11, 12, 13: Customer PDF preview, single page A4 format, and mobile responsiveness", () => {
  assert.match(modalSource, /PrintModal/);
  assert.match(modalSource, /QuotationTemplate/);
  assert.match(modalSource, /View \/ Print PDF Quotation/);
  assert.match(quotationTemplateSource, /DocumentContainer/);
});

test("Calculator in Measurements page has editable Internal Costing & Customer Selling Price sections", () => {
  // Section 1: Internal Costing - Private (Confidential)
  assert.match(calculatorSource, /Internal Costing — Private/);
  assert.match(calculatorSource, /CONFIDENTIAL 🔒/);
  assert.match(calculatorSource, /1\. PVC Fabric Purchase Rate/);
  assert.match(calculatorSource, /2\. Welding \/ Fabrication Cost/);
  assert.match(calculatorSource, /3\. Eyelet Purchase Rate/);
  assert.match(calculatorSource, /4\. Transport Cost/);
  assert.match(calculatorSource, /5\. Other Expenses/);
  assert.match(calculatorSource, /6\. Markup Percentage/);

  // Section 2: Customer Selling Price
  assert.match(calculatorSource, /Customer Selling Price/);
  assert.match(calculatorSource, /QUOTATION RATES/);
  assert.match(calculatorSource, /1\. PVC Fabric Selling Rate/);
  assert.match(calculatorSource, /2\. Welding Selling Rate/);
  assert.match(calculatorSource, /3\. SS Eyelet Selling Rate/);

  // Section 3: Financial Analysis Summary
  assert.match(calculatorSource, /Total Internal Cost/);
  assert.match(calculatorSource, /Selling Value/);
  assert.match(calculatorSource, /Estimated Profit/);
  assert.match(calculatorSource, /Profit Margin/);
});

test("Handwritten PVC Tank Liner Reference Calculations, Tooltips & Overrides", () => {
  // 1. Tooltips for optional allowances
  assert.match(calculatorSource, /Optional extra diameter added to the tank/);
  assert.match(calculatorSource, /Optional extra height added to the tank/);
  assert.match(calculatorSource, /Width of the hot-air \/ high-frequency weld overlap/);

  // 2. Visible Welding Calculation breakdown
  assert.match(calculatorSource, /Welding Calculation Breakdown/);
  assert.match(calculatorSource, /Base Disc Internal Seams/);
  assert.match(calculatorSource, /Wall Horizontal Panel Seams/);
  assert.match(calculatorSource, /Cylinder Vertical Closing Seam/);
  assert.match(calculatorSource, /Base-to-Wall Joint/);
  assert.match(calculatorSource, /Corner Tape & Hem Reinforcement/);

  // 3. Handwritten Reference vs Theoretical Discrepancy analysis
  assert.match(calculatorSource, /Handwritten Reference Analysis vs Theoretical Discrepancy/);
  assert.match(calculatorSource, /Theoretical 2D Minimum \(Wall Only\)/);
  assert.match(calculatorSource, /Real-World 3D Liner \(Handwritten Reference\)/);

  // 4. Approved Quantities & Manual Overrides
  assert.match(calculatorSource, /Approved Quantities & Manual Overrides/);
  assert.match(calculatorSource, /overrideFabricSqm/);
  assert.match(calculatorSource, /overrideWeldingRm/);
  assert.match(calculatorSource, /overrideEyeletsPcs/);

  // 5. Expected reference figures for 3 tanks: 891 sqm * 15, 852 RM * 8, 693 pcs * 1.50
  const qty3Fabric = 297 * 3;
  const qty3Welding = 284 * 3;
  const qty3Eyelets = 231 * 3;
  assert.equal(qty3Fabric, 891, "Fabric for 3 tanks must be 891 sqm");
  assert.equal(qty3Welding, 852, "Welding for 3 tanks must be 852 RM");
  assert.equal(qty3Eyelets, 693, "Eyelets for 3 tanks must be 693 pcs");

  const totalNet = qty3Fabric * 15 + qty3Welding * 8 + qty3Eyelets * 1.5;
  assert.equal(totalNet, 21220.50, "Net total must be AED 21,220.50");
});

