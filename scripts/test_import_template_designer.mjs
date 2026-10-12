/**
 * Test Suite: Dubai ERP - Import Template Design Feature
 * Tests real DOCX, XLSX, and PDF parsing and layout reconstruction
 * for Quotation, Tax Invoice, and Salary Statement documents.
 */

// Set mock env for standalone execution
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock-supabase.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "mock-anon-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "mock-anon-key";

import assert from "node:assert/strict";
import XLSX from "xlsx";
import JSZip from "jszip";

// Dynamic import so env vars take effect before supabase.ts initializes
const { importDocumentTemplate } = await import("../lib/templateImporter/index.ts");
const { replaceDocumentTokens, getSampleDocumentData } = await import("../components/documents/DynamicDocumentRenderer.tsx");

console.log("============================================================");
console.log("  DUBAI ERP: PDF DESIGNER - IMPORT TEMPLATE DESIGN TEST");
console.log("============================================================\n");

// Helper to create a valid minimal PDF buffer with text content
function createTestPdfBuffer(textLines) {
  let streamContent = "BT\n/F1 12 Tf\n";
  let y = 750;
  for (const line of textLines) {
    const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    streamContent += `1 0 0 1 50 ${y} Tm (${escaped}) Tj\n`;
    y -= 20;
  }
  streamContent += "ET\n";

  const streamLength = Buffer.byteLength(streamContent, "utf8");

  const header = "%PDF-1.4\n";
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];

  let body = "";
  const offsets = [0];
  let cur = Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(cur);
    body += obj;
    cur += Buffer.byteLength(obj, "utf8");
  }

  const startxref = cur;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += offsets[i].toString().padStart(10, "0") + " 00000 n \n";
  }

  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(header + body + xref + trailer, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Real XLSX Quotation Import
// ─────────────────────────────────────────────────────────────────────────────
async function testXlsxQuotationImport() {
  console.log("👉 [1/3] Testing XLSX Quotation Import...");

  // 1. Create a real Excel workbook with quotation layout
  const wb = XLSX.utils.book_new();
  const wsData = [
    ["AL BURUJ TECHNICAL SERVICES L.L.C", "", "", "", ""],
    ["TAX REGISTRATION NUMBER: 100456789000003", "", "", "", ""],
    ["QUOTATION / عرض أسعار", "", "", "", ""],
    ["Quote No: QT-2026-0042", "", "Date: 12/10/2026", "", ""],
    ["Customer: EMAAR PROPERTIES PJSC", "", "Attn: Project Manager", "", ""],
    ["Address: Downtown Dubai, UAE", "", "", "", ""],
    ["", "", "", "", ""],
    ["Item", "Description", "Qty", "Unit Price", "Total (AED)"],
    ["1", "Custom PVC Canopy Membrane 500 GSM", "2", "4500.00", "9000.00"],
    ["2", "Galvanized Steel Frame Support Structure", "1", "7200.00", "7200.00"],
    ["3", "Site Installation & Engineering Compliance", "1", "1800.00", "1800.00"],
    ["", "", "", "", ""],
    ["", "", "", "Subtotal:", "18000.00"],
    ["", "", "", "VAT (5%):", "900.00"],
    ["", "", "", "Grand Total:", "18900.00"],
    ["", "", "", "", ""],
    ["Terms: 50% Advance, 50% Upon Delivery. Validity: 30 Days.", "", "", "", ""],
    ["Authorized Signature & Stamp:", "", "", "", ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Column widths
  ws["!cols"] = [
    { wch: 10 },
    { wch: 45 },
    { wch: 10 },
    { wch: 15 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Quotation");

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // 2. Import into ERP Document Designer layout
  const imported = await importDocumentTemplate(xlsxBuffer, "AlBuruj_Quotation.xlsx", {
    targetDocType: "quotation",
    templateName: "Al Buruj Corporate Quotation",
  });

  // 3. Assertions
  assert.equal(imported.fileType, "xlsx");
  assert.equal(imported.targetDocumentType, "quotation");
  assert.equal(imported.reconstructedLayout.documentType, "quotation");
  assert.ok(imported.reconstructedLayout.elements.length >= 5, "Reconstructed layout should have elements");
  assert.ok(imported.detectedBlocks.length > 0, "Should detect text blocks");
  assert.ok(imported.detectedTables.length >= 1, "Should detect line items table");

  // Check table columns
  const table = imported.detectedTables[0];
  assert.ok(table.columns.length >= 3, "Table should have columns detected");
  console.log(`   ✓ Detected Table Columns: ${table.columns.map((c) => c.label).join(", ")}`);

  // Check mapped tokens in detected blocks
  const detectedTokens = imported.detectedBlocks.filter((b) => b.mappedToken).map((b) => b.mappedToken);
  console.log(`   ✓ Auto-Mapped Tokens in XLSX: ${detectedTokens.join(", ")}`);
  assert.ok(detectedTokens.includes("{document_number}"), "Should map quote number");
  assert.ok(detectedTokens.includes("{customer_name}"), "Should map customer name");
  assert.ok(detectedTokens.includes("{grand_total}"), "Should map grand total");

  // Check dynamic follower elements
  const lineItemElement = imported.reconstructedLayout.elements.find((el) => el.type === "line_items");
  assert.ok(lineItemElement, "Reconstructed layout must contain line_items");
  const followerElements = imported.reconstructedLayout.elements.filter(
    (el) => el.flowMode === "flow" && el.flowAnchorId === lineItemElement.id
  );
  assert.ok(followerElements.length >= 1, "Elements below table must have flowMode='flow'");
  console.log(`   ✓ Follower Elements with dynamic flow: ${followerElements.length}`);

  console.log("   ✅ XLSX Quotation Import PASSED!\n");
  return imported;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Real DOCX Tax Invoice Import
// ─────────────────────────────────────────────────────────────────────────────
async function testDocxInvoiceImport() {
  console.log("👉 [2/3] Testing DOCX Tax Invoice Import...");

  // 1. Build a valid DOCX file using JSZip
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // _rels/.rels
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // word/_rels/document.xml.rels
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
  );

  // word/document.xml with Invoice layout, table, borders, colors
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0D3B66"/></w:rPr>
        <w:t>GULF HORIZON GENERAL TRADING LLC</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr>
        <w:t>Tax Registration Number (TRN): 100987654321003</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="C0392B"/></w:rPr>
        <w:t>TAX INVOICE / فاتورة ضريبية</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Invoice Number: INV-2026-1055</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Invoice Date: 12 October 2026</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Billed To: DUBAI REAL ESTATE CORPORATION</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Customer Address: Business Bay, Tower 1, Dubai</w:t></w:r>
    </w:p>

    <!-- Table -->
    <w:tbl>
      <!-- Header Row -->
      <w:tr>
        <w:tc><w:tcPr><w:shd w:fill="0D3B66"/></w:tcPr><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:fill="0D3B66"/></w:tcPr><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:fill="0D3B66"/></w:tcPr><w:p><w:r><w:t>Quantity</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:fill="0D3B66"/></w:tcPr><w:p><w:r><w:t>Unit Price</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:fill="0D3B66"/></w:tcPr><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Row 1 -->
      <w:tr>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>High Quality Commercial Tent Fabric</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>50</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>120.00</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>6000.00</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p><w:r><w:t>Subtotal: 6,000.00 AED</w:t></w:r></w:p>
    <w:p><w:r><w:t>VAT (5%): 300.00 AED</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>Grand Total: 6,300.00 AED</w:t></w:r></w:p>
    <w:p><w:r><w:t>Payment Terms: 100% Net 30 Days</w:t></w:r></w:p>
    <w:p><w:r><w:t>Authorized Signature: _______________________</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file("word/document.xml", documentXml);

  const docxBuffer = await zip.generateAsync({ type: "nodebuffer" });

  // 2. Import into ERP Document Designer layout
  const imported = await importDocumentTemplate(docxBuffer, "GulfHorizon_TaxInvoice.docx", {
    targetDocType: "tax_invoice",
    templateName: "Gulf Horizon Tax Invoice Template",
  });

  // 3. Assertions
  assert.equal(imported.fileType, "docx");
  assert.equal(imported.targetDocumentType, "tax_invoice");
  assert.equal(imported.reconstructedLayout.documentType, "tax_invoice");
  assert.ok(imported.detectedBlocks.length > 0, "Should detect text blocks from DOCX");
  assert.ok(imported.detectedTables.length >= 1, "Should detect tables from DOCX");

  // Check branding color extraction
  console.log(`   ✓ Extracted Primary Color: ${imported.extractedColors.primary}`);
  console.log(`   ✓ Extracted Table Header Color: ${imported.extractedColors.tableHeaderBg}`);
  assert.equal(imported.extractedColors.primary.toUpperCase(), "#0D3B66", "Should extract header brand color");

  // Check auto-mapped tokens
  const detectedTokens = imported.detectedBlocks.filter((b) => b.mappedToken).map((b) => b.mappedToken);
  console.log(`   ✓ Auto-Mapped Tokens in DOCX: ${detectedTokens.join(", ")}`);
  assert.ok(detectedTokens.includes("{document_number}"), "Should map invoice number");
  assert.ok(detectedTokens.includes("{customer_name}"), "Should map customer name");
  assert.ok(detectedTokens.includes("{subtotal}"), "Should map subtotal");
  assert.ok(detectedTokens.includes("{vat}"), "Should map vat");
  assert.ok(detectedTokens.includes("{grand_total}"), "Should map grand total");

  // Reconstructed layout page dimensions
  assert.equal(imported.reconstructedLayout.page.widthMm, 210, "A4 portrait width should be 210mm");
  assert.equal(imported.reconstructedLayout.page.heightMm, 297, "A4 portrait height should be 297mm");

  console.log("   ✅ DOCX Tax Invoice Import PASSED!\n");
  return imported;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Real PDF Salary Statement & Payroll Tokens Import
// ─────────────────────────────────────────────────────────────────────────────
async function testSalaryStatementImport() {
  console.log("👉 [3/3] Testing PDF / Payroll Salary Statement Import & Tokens...");

  // 1. Create a PDF buffer with salary statement content
  const pdfLines = [
    "AL WAHDA ENGINEERING WORKS L.L.C",
    "MONTHLY SALARY STATEMENT - SALARY PAYSLIP",
    "Statement Period: October 2026",
    "Employee Name: Mohammed Rizwan",
    "Employee ID: EMP-04",
    "Designation: Senior Fabricator",
    "Basic Salary: 3500.00 AED",
    "Housing Allowance: 1000.00 AED",
    "Transportation Allowance: 500.00 AED",
    "Overtime Hours: 42.50 hrs",
    "Overtime Amount: 1105.00 AED",
    "Deductions: 0.00 AED",
    "Net Salary: 6105.00 AED",
    "Payment Mode: WPS Bank Transfer",
    "Employee Signature: __________________",
    "Company Stamp & Signature: ___________",
  ];

  const pdfBuffer = createTestPdfBuffer(pdfLines);

  // 2. Import into ERP Document Designer layout
  const imported = await importDocumentTemplate(pdfBuffer, "SalaryStatement_Oct2026.pdf", {
    targetDocType: "salary_statement",
    templateName: "Al Wahda Salary Statement",
  });

  // 3. Assertions
  assert.equal(imported.fileType, "pdf");
  assert.equal(imported.targetDocumentType, "salary_statement");
  assert.equal(imported.reconstructedLayout.documentType, "salary_statement");
  assert.ok(imported.detectedBlocks.length > 0, "Should detect text blocks from PDF");

  console.log("Detected PDF blocks:", imported.detectedBlocks.map((b) => ({ text: b.originalText, token: b.mappedToken })));
  const detectedTokens = imported.detectedBlocks.filter((b) => b.mappedToken).map((b) => b.mappedToken);
  console.log(`   ✓ Auto-Mapped Payroll Tokens in PDF: ${detectedTokens.join(", ")}`);
  assert.ok(detectedTokens.includes("{employee_name}"), "Should map employee name");
  assert.ok(detectedTokens.includes("{basic_salary}"), "Should map basic salary");
  assert.ok(detectedTokens.includes("{overtime_hours}"), "Should map overtime hours");
  assert.ok(detectedTokens.includes("{overtime_amount}"), "Should map overtime amount");
  assert.ok(detectedTokens.includes("{net_salary}"), "Should map net salary");

  // 4. Verify dynamic token replacement in DynamicDocumentRenderer
  console.log("   ✓ Testing token evaluation with DynamicDocumentRenderer data...");
  const sampleData = getSampleDocumentData("salary_statement");
  sampleData.employee_name = "Mohammed Rizwan";
  sampleData.basic_salary = 3500;
  sampleData.overtime_hours = 42.5;
  sampleData.overtime_amount = 1105;
  sampleData.net_salary = 6105;
  sampleData.document_number = "SAL-2026-10";

  // Test token replacement for custom_text elements
  const testTemplateText = "Employee: {employee_name} | Basic: {basic_salary} | OT: {overtime_hours}h ({overtime_amount}) | Net: {net_salary} | Total: {grand_total}";
  const evaluatedText = replaceDocumentTokens(testTemplateText, sampleData, { documentType: "salary_statement" });
  console.log(`   ✓ Raw Template: "${testTemplateText}"`);
  console.log(`   ✓ Evaluated Output: "${evaluatedText}"`);

  assert.ok(evaluatedText.includes("Mohammed Rizwan"), "Token {employee_name} must resolve");
  assert.ok(evaluatedText.includes("3,500.00") || evaluatedText.includes("3500"), "Token {basic_salary} must resolve");
  assert.ok(evaluatedText.includes("42.5"), "Token {overtime_hours} must resolve");
  assert.ok(evaluatedText.includes("1,105.00") || evaluatedText.includes("1105"), "Token {overtime_amount} must resolve");
  assert.ok(evaluatedText.includes("6,105.00") || evaluatedText.includes("6105"), "Token {net_salary} must resolve");

  console.log("   ✅ PDF Salary Statement Import & Tokens PASSED!\n");
  return imported;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run All Tests
// ─────────────────────────────────────────────────────────────────────────────
async function runAll() {
  try {
    await testXlsxQuotationImport();
    await testDocxInvoiceImport();
    await testSalaryStatementImport();

    console.log("============================================================");
    console.log("  🎉 ALL IMPORT TEMPLATE DESIGN TESTS COMPLETED SUCCESSFULLY!");
    console.log("============================================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  }
}

runAll();
