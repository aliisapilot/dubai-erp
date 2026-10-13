/**
 * Dubai ERP: Smart Import Test Suite
 * Validates document parsing, entity resolution, math verification,
 * duplicate detection, and destination mapping.
 */

import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { parseSpreadsheet } from "../lib/smartImport/parsers/xlsxParser.ts";
import { parseDocx } from "../lib/smartImport/parsers/docxParser.ts";
import { classifyDocument } from "../lib/smartImport/classifier.ts";
import { extractFromDocx, extractFromSpreadsheet } from "../lib/smartImport/extractor.ts";
import {
  matchCustomer,
  matchSupplier,
  matchProject,
  matchEmployee,
  checkDuplicateDocument,
} from "../lib/smartImport/matcher.ts";
import {
  auditLineItemCalculations,
  auditDocumentTotals,
  auditPvcTankLinerMeasurements,
} from "../lib/smartImport/calculator.ts";
import { generateDestinationMappings } from "../lib/smartImport/destinationMapper.ts";
import { buildRelationshipTrees, computeBeforeAndAfterSummary } from "../lib/smartImport/relationshipBuilder.ts";

async function runTestSuite() {
  console.log("==========================================================");
  console.log("RUNNING DUBAI ERP SMART IMPORT AUTOMATED TEST SUITE");
  console.log("==========================================================");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
  }

  // Mock cache of existing database entities
  const mockCache = {
    customers: [
      { id: "cust-01", name: "Gulf Oasis Contracting LLC", trn: "100345678900003" },
      { id: "cust-02", name: "Al Fardan General Trading", trn: "100987654300003" },
    ],
    suppliers: [
      { id: "supp-01", name: "Emirates PVC Raw Materials Trading", trn: "100456789000003" },
    ],
    projects: [
      { id: "proj-01", name: "Dubai Hills Commercial Shades", project_number: "PRJ-1001", customer_id: "cust-01" },
    ],
    employees: [
      { id: "emp-01-uuid", employee_number: "EMP-01", first_name: "Rahmat Ali Khan" },
      { id: "emp-02-uuid", employee_number: "EMP-02", first_name: "Imran Khan" },
      { id: "emp-10-uuid", employee_number: "EMP-10", first_name: "Eliyas Ansari" },
    ],
    existingDocuments: {
      "inv-2026-001": { id: "inv-uuid-1", number: "INV-2026-001", type: "tax_invoice" },
    },
  };

  // -------------------------------------------------------------
  // TEST 1: Generate & Parse Realistic Word (.docx) Quotation
  // -------------------------------------------------------------
  console.log("\nTest 1: Word (.docx) Quotation Extraction with Table...");
  const zip = new JSZip();
  const sampleDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>PRICE QUOTATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>Quotation No: QTN-145/26</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date: 2026-03-12</w:t></w:r></w:p>
    <w:p><w:r><w:t>Customer: Al Karwan Solution FZC</w:t></w:r></w:p>
    <w:p><w:r><w:t>TRN: 100234567800003</w:t></w:r></w:p>
    <w:p><w:r><w:t>Project: Water Tank PVC Liner - Plot 44</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Rate</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>PVC Fabric 1000GSM</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>297</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>891</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Center Joint Welding</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>140</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>1680</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  zip.file("word/document.xml", sampleDocXml);
  const docxBuffer = await zip.generateAsync({ type: "arraybuffer" });

  const docxResult = await parseDocx(docxBuffer, "QTN145-26.docx");
  assert(docxResult.paragraphs.length > 0, "Parsed paragraphs from DOCX");
  assert(docxResult.tables.length === 1, "Parsed item table from DOCX");

  const classification1 = classifyDocument("QTN145-26.docx", docxResult.allText);
  assert(classification1.documentType === "quotation", "Document correctly classified as 'quotation'");

  const extraction1 = extractFromDocx(docxResult, "QTN145-26.docx", classification1.documentType);
  assert(extraction1.fields.document_number?.value === "QTN-145/26", "Extracted Document Number 'QTN-145/26'");
  assert(extraction1.fields.customer_name?.value === "Al Karwan Solution FZC", "Extracted Customer Name 'Al Karwan Solution FZC'");
  assert(extraction1.fields.trn?.value === "100234567800003", "Extracted 15-digit TRN '100234567800003'");
  assert(extraction1.fields.project_name?.value === "Water Tank PVC Liner - Plot 44", "Extracted Project Name 'Water Tank PVC Liner - Plot 44'");
  assert(extraction1.items.length === 2, "Extracted 2 line items from table");
  assert(extraction1.items[0].description.includes("PVC Fabric"), "Line 1 item description matches");

  // -------------------------------------------------------------
  // TEST 2: Customer & Project Entity Resolution (New vs Existing)
  // -------------------------------------------------------------
  console.log("\nTest 2: Entity Resolution (New Customer & Project)...");
  const custRes1 = matchCustomer(extraction1.fields.customer_name.value, extraction1.fields.trn?.value, mockCache);
  assert(custRes1.action === "create_new", "Al Karwan Solution FZC correctly identified as 'create_new'");

  const projRes1 = matchProject(extraction1.fields.project_name.value, null, mockCache);
  assert(projRes1.action === "create_new", "Water Tank PVC Liner correctly identified as 'create_new'");

  console.log("\nTest 2b: Entity Resolution (Existing Customer Match)...");
  const custRes2 = matchCustomer("Gulf Oasis Contracting LLC", "100345678900003", mockCache);
  assert(custRes2.action === "reuse_existing", "Gulf Oasis Contracting LLC correctly identified as 'reuse_existing'");
  assert(custRes2.matchedId === "cust-01", "Matched existing customer UUID 'cust-01'");

  console.log("\nTest 2c: Similar Customer Name (Needs Review)...");
  const custRes3 = matchCustomer("Gulf Oasis Contracting Co", null, mockCache);
  assert(custRes3.action === "needs_review", "Similar name correctly marked 'needs_review' rather than merged");

  // -------------------------------------------------------------
  // TEST 3: Mathematical Audits (Calculations Verification)
  // -------------------------------------------------------------
  console.log("\nTest 3: Mathematical Audit (Line items and Totals)...");
  const auditRes = auditLineItemCalculations("doc-1", "QTN-145/26", extraction1.items);
  assert(!auditRes.hasMismatches, "All line item calculations verified with 0 mismatch");

  // Test intentionally mismatched line item
  const badItems = [{
    id: "item-bad",
    description: "Wrong Calculation Item",
    quantity: 10,
    unit: "Nos",
    unitPrice: 50,
    discount: 0,
    vatRate: 5,
    vatAmount: 25,
    total: 999, // Should be 525!
    calculatedTotal: 525,
    difference: 474,
    calculationStatus: "mismatch",
    source: { file: "test.docx" },
  }];
  const badAudit = auditLineItemCalculations("doc-bad", "TEST-01", badItems);
  assert(badAudit.hasMismatches === true, "Audit successfully caught intentional calculation discrepancy");

  // -------------------------------------------------------------
  // TEST 4: PVC Tank Liner Formula Verification
  // -------------------------------------------------------------
  console.log("\nTest 4: PVC Tank Liner Cylindrical Calculations Verification...");
  const sampleMeas = {
    shape: "cylinder",
    diameter: 7.39,
    height: 6.65,
    fabricWidth: 3.0,
    weldingAllowance: 3,
    area: 197.38,
    runningMeter: 65.79,
    source: { file: "tank.xlsx" },
  };
  const measAudit = auditPvcTankLinerMeasurements("doc-meas", "MEAS-01", sampleMeas);
  assert(measAudit.auditedMeasurement.calculatedArea > 0, "Calculated surface area > 0");
  assert(measAudit.auditedMeasurement.calculatedRunningMeter > 0, "Calculated running meter requirement > 0");

  // -------------------------------------------------------------
  // TEST 5: Permanent Employee Attendance & Overtime Matching
  // -------------------------------------------------------------
  console.log("\nTest 5: Permanent Employee Matching (EMP-01 to EMP-10)...");
  const empMatch1 = matchEmployee("EMP-01", mockCache);
  assert(empMatch1.status === "matched" && empMatch1.matchedName === "Rahmat Ali Khan", "Matched EMP-01 to Rahmat Ali Khan");

  const empMatch2 = matchEmployee("Eliyas Ansari", mockCache);
  assert(empMatch2.status === "matched" && empMatch2.matchedCode === "EMP-10", "Matched Eliyas Ansari to EMP-10");

  const empMatchUnknown = matchEmployee("Unknown Person", mockCache);
  assert(empMatchUnknown.status === "unmatched", "Unknown person correctly remains unmatched (no duplicate created)");

  // -------------------------------------------------------------
  // TEST 6: Duplicate Document Detection
  // -------------------------------------------------------------
  console.log("\nTest 6: Duplicate Document Detection...");
  const dupCheck1 = checkDuplicateDocument("INV-2026-001", "tax_invoice", mockCache);
  assert(dupCheck1.isDuplicate === true, "Detected existing document 'INV-2026-001' as duplicate");

  const dupCheck2 = checkDuplicateDocument("QTN-NEW-999", "quotation", mockCache);
  assert(dupCheck2.isDuplicate === false, "Fresh document 'QTN-NEW-999' approved as non-duplicate");

  // -------------------------------------------------------------
  // TEST 7: 12-Column Destination Mapping Generation
  // -------------------------------------------------------------
  console.log("\nTest 7: 12-Column Destination Mapping Generation...");
  const mappings = generateDestinationMappings(
    "QTN145-26.docx",
    classification1.documentType,
    extraction1.fields,
    extraction1.items,
    custRes1,
    undefined,
    projRes1
  );
  assert(mappings.length >= 4, "Generated complete destination mappings");
  const custMap = mappings.find(m => m.destinationField === "name" && m.destinationTable === "customers");
  assert(custMap?.proposedAction === "create_new", "Customer destination mapping proposed action is 'create_new'");
  const docMap = mappings.find(m => m.destinationField === "quotation_number");
  assert(docMap?.extractedValue === "QTN-145/26", "Document number mapped to quotations.quotation_number");

  // -------------------------------------------------------------
  // TEST 8: Relationship Tree Construction
  // -------------------------------------------------------------
  console.log("\nTest 8: Relationship Tree Generation...");
  const dummyDoc = {
    id: "doc-dummy",
    filename: "QTN145-26.docx",
    fileSize: 1024,
    fileType: "docx",
    checksumSha256: "abc123",
    documentType: "quotation",
    classificationConfidence: 0.98,
    classificationReason: "Matched keywords",
    fields: extraction1.fields,
    items: extraction1.items,
    customerResolution: custRes1,
    projectResolution: projRes1,
    destinationMappings: mappings,
    validationErrors: [],
    validationWarnings: [],
    isDuplicate: false,
    rawContentSummary: { rawSnippets: [] },
  };

  const trees = buildRelationshipTrees([dummyDoc]);
  assert(trees.length === 1, "Generated root customer node in tree");
  assert(trees[0].type === "customer", "Root tree node is customer");
  assert(trees[0].children?.[0]?.type === "project", "Customer child is project");
  assert(trees[0].children?.[0]?.children?.[0]?.type === "document", "Project child is quotation document");

  // -------------------------------------------------------------
  // TEST 9: Multi-Sheet Excel Spreadsheet Parsing & Classification
  // -------------------------------------------------------------
  console.log("\nTest 9: Multi-Sheet Excel Spreadsheet Parsing...");
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Invoices
  const ws1Data = [
    ["Commercial Tax Invoice", "", "", ""],
    ["Invoice No:", "INV-2026-901", "Date:", "2026-03-25"],
    ["Customer:", "Gulf Oasis Contracting LLC", "TRN:", "100345678900003"],
    ["Project:", "Dubai Hills Commercial Shades", "", ""],
    ["Description", "Qty", "Rate", "Total"],
    ["Shade Membrane Replacement", 2, 4500, 9000],
    ["Installation Crew Labor", 1, 2000, 2000],
    ["Subtotal", "", "", 11000],
    ["VAT 5%", "", "", 550],
    ["Grand Total", "", "", 11550],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "TaxInvoice");

  // Sheet 2: Expenses
  const ws2Data = [
    ["Petty Cash Expense Summary", "", "", ""],
    ["Date", "Category", "Description", "Amount"],
    ["2026-03-20", "Fuel, Transport & Salik", "Truck diesel fuel", 250],
    ["2026-03-22", "Site Consumables", "Anchor bolts & hardware", 380],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  XLSX.utils.book_append_sheet(wb, ws2, "Expenses");

  const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const xlsxParsed = parseSpreadsheet(xlsxBuffer, "invoices_and_expenses.xlsx");
  assert(xlsxParsed.sheetNames.length === 2, "Parsed multi-sheet workbook with 2 sheets");
  assert(xlsxParsed.sheets["TaxInvoice"].rowCount >= 10, "TaxInvoice sheet rows parsed");
  assert(xlsxParsed.sheets["Expenses"].rowCount >= 4, "Expenses sheet rows parsed");

  const classification9 = classifyDocument("invoices_and_expenses.xlsx", xlsxParsed.allText, 2);
  assert(classification9.documentType === "tax_invoice" || classification9.documentType === "expense", "Multi-sheet classified as financial document");

  const extraction9 = extractFromSpreadsheet(xlsxParsed, "invoices_and_expenses.xlsx", "tax_invoice");
  assert(extraction9.fields.document_number?.value === "INV-2026-901", "Extracted invoice number from multi-sheet Excel");
  assert(extraction9.fields.customer_name?.value === "Gulf Oasis Contracting LLC", "Extracted customer from Excel");
  assert(extraction9.items.length >= 2, "Extracted line items from Excel");

  // -------------------------------------------------------------
  // TEST 10: Excel Download Template Generators (All 10 Modules)
  // -------------------------------------------------------------
  console.log("\nTest 10: Download Excel Template Generation...");
  const { generateTemplateWorkbook, TEMPLATE_DEFINITIONS } = await import("../lib/smartImport/templateGenerator.ts");
  const templateKeys = Object.keys(TEMPLATE_DEFINITIONS);
  assert(templateKeys.length === 10, "10 template definitions configured");

  for (const tKey of templateKeys) {
    const tBuf = generateTemplateWorkbook(tKey);
    assert(tBuf && tBuf.length > 500, `Generated valid Excel workbook buffer for template '${tKey}' (${tBuf.length} bytes)`);
  }

  // -------------------------------------------------------------
  // TEST 11: Export Data Generation (Excel & CSV)
  // -------------------------------------------------------------
  console.log("\nTest 11: Multi-Module Export Engine...");
  const { generateExcelExport, generateCsvExport } = await import("../lib/smartImport/exporter.ts");
  const exportHeaders = ["ID", "Customer Name", "TRN", "City"];
  const exportRows = [
    ["1", "Al Karwan Solution FZC", "100234567800003", "Dubai"],
    ["2", "Gulf Oasis Contracting LLC", "100345678900003", "Dubai"],
  ];
  const exportBuf = generateExcelExport(exportHeaders, exportRows, "Customers");
  assert(exportBuf && exportBuf.length > 500, "Generated Excel export workbook buffer");

  const csvString = generateCsvExport(exportHeaders, exportRows);
  assert(csvString.includes("Al Karwan Solution FZC") && csvString.includes("100234567800003"), "Generated CSV export string with correct formatting");

  // -------------------------------------------------------------
  // TEST 12: Before and After Metrics Calculation
  // -------------------------------------------------------------
  console.log("\nTest 12: Before-and-After Record Count Computation...");
  const { computeBeforeAndAfterSummary } = await import("../lib/smartImport/relationshipBuilder.ts");
  const summaryResult = computeBeforeAndAfterSummary([dummyDoc], mockCache);
  assert(summaryResult.beforeCounts.customers === 2, "Before count customers = 2");
  assert(summaryResult.proposedSummary.newCustomers === 1, "Proposed new customers = 1");
  assert(summaryResult.proposedSummary.newProjects === 1, "Proposed new projects = 1");
  assert(summaryResult.proposedSummary.newQuotations === 1, "Proposed new quotations = 1");

  console.log("==========================================================");
  console.log(`TEST SUITE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log("==========================================================");
}

runTestSuite().catch(err => {
  console.error("Test Suite Error:", err);
  process.exit(1);
});
