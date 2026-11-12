import assert from "assert";

const {
  generateDocumentPdfFilename,
  sanitizeFilenamePart,
  formatFilenamePeriod,
  resolveWorkDescription,
} = await import("../lib/documentFilename.ts");

console.log("================================================================================");
console.log("   MASTER TEST SUITE: STANDARDIZED ERP PDF FILENAMES                            ");
console.log("================================================================================");

const testCases = [
  // 1. Tax Invoice
  {
    name: "Tax Invoice",
    input: {
      documentType: "tax_invoice",
      documentNumber: "INV145-26",
      customerName: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
      workDescription: "PVC Fabrication",
    },
    expected: "INV145-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - PVC Fabrication.pdf",
  },
  // 2. Quotation
  {
    name: "Quotation",
    input: {
      documentType: "quotation",
      documentNumber: "QT001-26",
      customerName: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
      workDescription: "PVC Fabrication",
    },
    expected: "QT001-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - PVC Fabrication.pdf",
  },
  // 3. Proforma Invoice
  {
    name: "Proforma Invoice",
    input: {
      documentType: "proforma_invoice",
      documentNumber: "PI001-26",
      customerName: "Al Karwan Solution FZC",
      workDescription: "PVC Water Tank Liner",
    },
    expected: "PI001-26 Al Karwan Solution FZC - PVC Water Tank Liner.pdf",
  },
  // 4. Delivery Note
  {
    name: "Delivery Note",
    input: {
      documentType: "delivery_note",
      documentNumber: "DN001-26",
      customerName: "Elegance Tents And Sheds Installation",
      workDescription: "HDPE Fabrication",
    },
    expected: "DN001-26 Elegance Tents And Sheds Installation - HDPE Fabrication.pdf",
  },
  // 5. Receipt Voucher
  {
    name: "Receipt Voucher",
    input: {
      documentType: "receipt_voucher",
      documentNumber: "RV007-26",
      customerName: "Al Fajar Al Mashreq Shades & Tents Fix LLC",
      workDescription: "Payment",
    },
    expected: "RV007-26 Al Fajar Al Mashreq Shades & Tents Fix LLC - Payment.pdf",
  },
  // 6. Purchase Order
  {
    name: "Purchase Order",
    input: {
      documentType: "purchase_order",
      documentNumber: "PO001-26",
      supplierName: "Supplier Name",
      workDescription: "PVC Fabric Purchase",
    },
    expected: "PO001-26 Supplier Name - PVC Fabric Purchase.pdf",
  },
  // 7. Supplier Statement
  {
    name: "Supplier Statement",
    input: {
      documentType: "supplier_statement",
      supplierName: "Supplier Name",
      period: "November 2026",
    },
    expected: "Supplier Statement Supplier Name - November 2026.pdf",
  },
  // 8. Customer SOA (with doc number)
  {
    name: "Customer SOA (with number)",
    input: {
      documentType: "customer_statement",
      documentNumber: "SOA001-26",
      customerName: "Customer Name",
      period: "November 2026",
    },
    expected: "SOA001-26 Customer Name - Statement of Account.pdf",
  },
  // 9. Customer SOA (without doc number)
  {
    name: "Customer SOA (without number)",
    input: {
      documentType: "customer_statement",
      customerName: "Customer Name",
      period: "November 2026",
    },
    expected: "SOA Customer Name - November 2026.pdf",
  },
  // 10. Attendance Sheet
  {
    name: "Attendance Sheet",
    input: {
      documentType: "attendance",
      period: "November 2026",
    },
    expected: "Attendance November 2026.pdf",
  },
  // 11. Overtime Sheet (All employees)
  {
    name: "Overtime Sheet",
    input: {
      documentType: "overtime",
      period: "November 2026",
    },
    expected: "Overtime November 2026.pdf",
  },
  // 12. Employee Overtime
  {
    name: "Employee Overtime",
    input: {
      documentType: "employee_overtime",
      employeeName: "Imran Khan",
      period: "November 2026",
    },
    expected: "Overtime Imran Khan - November 2026.pdf",
  },
  // 13. Payroll Summary
  {
    name: "Payroll Summary",
    input: {
      documentType: "payroll_summary",
      period: "November 2026",
    },
    expected: "Payroll Summary November 2026.pdf",
  },
  // 14. Salary Statement
  {
    name: "Salary Statement",
    input: {
      documentType: "salary_statement",
      employeeName: "Rahmat Ali Khan",
      period: "November 2026",
    },
    expected: "Salary Statement Rahmat Ali Khan - November 2026.pdf",
  },
  // 15. Payslip
  {
    name: "Payslip",
    input: {
      documentType: "payslip",
      employeeName: "Rahmat Ali Khan",
      period: "November 2026",
    },
    expected: "Payslip Rahmat Ali Khan - November 2026.pdf",
  },
  // 16. Payment Voucher (Employee Salary)
  {
    name: "Payment Voucher (Salary)",
    input: {
      documentType: "employee_payment_voucher",
      documentNumber: "PV001-26",
      employeeName: "Rahmat Ali Khan",
      period: "November 2026",
    },
    expected: "PV001-26 Rahmat Ali Khan - Salary November 2026.pdf",
  },
  // 17. Measurement Sheet
  {
    name: "Measurement Sheet",
    input: {
      documentType: "measurement_sheet",
      customerName: "Customer Name",
      workDescription: "Description",
    },
    expected: "Measurement Sheet Customer Name - Description.pdf",
  },
];

console.log(`\nValidating ${testCases.length} Canonical ERP Filename Requirements:`);

let passedCount = 0;
for (const tc of testCases) {
  const result = generateDocumentPdfFilename(tc.input);
  console.log(`\n[${tc.name}]`);
  console.log(`  Expected: "${tc.expected}"`);
  console.log(`  Actual:   "${result.filename}"`);
  assert.strictEqual(result.filename, tc.expected, `Mismatch for ${tc.name}`);
  assert.ok(result.filename.endsWith(".pdf"), "Must end with .pdf");
  assert.ok(!result.filename.includes("_"), "Must use normal spaces, NOT underscores");
  passedCount++;
}

console.log(`\nPASS: All ${passedCount} canonical filename patterns verified!`);

// -----------------------------------------------------------------------------
// Edge Cases & Sanitization Tests
// -----------------------------------------------------------------------------
console.log("\n[Edge Cases & Sanitization]");

// 1. Illegal characters in Customer or Work description
const sanitizedIllegal = generateDocumentPdfFilename({
  documentType: "tax_invoice",
  documentNumber: "INV001/26",
  customerName: 'ACME <Trading> "Co." & Sons: Dubai | Head-Office?',
  workDescription: "Supply & Install *Tent* / Shade",
});
console.log("  Sanitized illegal characters:", sanitizedIllegal.filename);
assert.ok(!sanitizedIllegal.filename.includes("<"));
assert.ok(!sanitizedIllegal.filename.includes(">"));
assert.ok(!sanitizedIllegal.filename.includes(":"));
assert.ok(!sanitizedIllegal.filename.includes('"'));
assert.ok(!sanitizedIllegal.filename.includes("/"));
assert.ok(!sanitizedIllegal.filename.includes("\\"));
assert.ok(!sanitizedIllegal.filename.includes("|"));
assert.ok(!sanitizedIllegal.filename.includes("?"));
assert.ok(!sanitizedIllegal.filename.includes("*"));
assert.ok(sanitizedIllegal.filename.endsWith(".pdf"));

// 2. Extra spaces collapsing
const multiSpace = generateDocumentPdfFilename({
  documentType: "tax_invoice",
  documentNumber: "INV100   ",
  customerName: "  Al   Fajar    LLC  ",
  workDescription: "  Steel   Fabrication  ",
});
console.log("  Collapsed spaces:", multiSpace.filename);
assert.strictEqual(multiSpace.filename, "INV100 Al Fajar LLC - Steel Fabrication.pdf");

// 3. Fallback when description is omitted (derive from items)
const fromItems = generateDocumentPdfFilename({
  documentType: "tax_invoice",
  documentNumber: "INV101-26",
  customerName: "Test Customer",
  items: [
    { description: "Supply of 650 GSM PVC Fabric Roll" },
    { description: "Installation at site" },
  ],
});
console.log("  Derived from items:", fromItems.filename);
assert.strictEqual(fromItems.filename, "INV101-26 Test Customer - Supply of 650 GSM PVC Fabric Roll.pdf");

console.log("\n================================================================================");
console.log("   ALL PDF FILENAME STANDARDIZATION TESTS PASSED SUCCESSFULLY!                 ");
console.log("================================================================================");

