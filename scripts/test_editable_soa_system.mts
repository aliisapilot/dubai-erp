import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  calculateCustomerStatement,
  matchSingleHistoricalEntry,
  type RawHistoricalEntry,
  type RawInvoice,
  type RawReceiptVoucher,
  type RawPayment,
} from "../lib/customerStatementEngine";
import {
  extractSoaRowsFromSpreadsheet,
  buildSoaAttachmentDescription,
  parseSoaAttachmentRow,
  getExportSoaPdfFilename,
} from "../lib/soaManager";

console.log("=====================================================================");
console.log("=== DUBAI ERP: EDITABLE AUTO-UPDATING SOA SYSTEM VERIFICATION SUITE ===");
console.log("=====================================================================\n");

// ---------------------------------------------------------------------------
// TEST 1: Extraction of SOA line items from Spreadsheet
// ---------------------------------------------------------------------------
console.log("--> Testing Scenario 1: Spreadsheet Row Extraction...");
const testRows = [
  ["Statement of Account", "", "", ""],
  ["Customer: Al Futtaim Engineering LLC", "", "SOA No: SOA-2026-0089", ""],
  ["Statement Date: 2026-06-30", "", "", ""],
  ["Date", "Reference", "Description", "Debit", "Credit", "Balance"],
  ["2026-01-01", "B/F", "Opening Balance Brought Forward", "", "", 10000],
  ["2026-01-15", "INV-1001", "Supply of PVC Liners", 5000, 0, 15000],
  ["2026-02-10", "REC-201", "Cheque Payment Received", 0, 8000, 7000],
  ["2026-03-05", "INV-1002", "Installation charges", 3000, 0, 10000],
  ["2026-04-12", "REC-202", "Bank Transfer", 0, 4000, 6000],
  ["", "", "Total Balance Due:", "", "", 6000],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(testRows);
XLSX.utils.book_append_sheet(wb, ws, "Statement");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const extracted = extractSoaRowsFromSpreadsheet(buf, "Al_Futtaim_SOA.xlsx");
assert.equal(extracted.soaNumber, "SOA-2026-0089", "SOA number extraction failed");
assert.ok(extracted.customerName.includes("Al Futtaim Engineering"), "Customer name extraction failed");
assert.equal(extracted.openingBalance, 10000, "Opening balance extraction failed");
assert.equal(extracted.charges, 8000, "Debits sum failed");
assert.equal(extracted.credits, 12000, "Credits sum failed");
assert.equal(extracted.closingBalance, 6000, "Closing balance extraction failed");
assert.equal(extracted.entries.length, 4, "Extracted line item count should be 4");
console.log("✓ Scenario 1 Passed: Successfully extracted full line items and metadata from spreadsheet.");

// ---------------------------------------------------------------------------
// TEST 2: Real-time cell editing & running balance recalculation
// ---------------------------------------------------------------------------
console.log("\n--> Testing Scenario 2: Inline Editing & Live Running Balance Recalculation...");
const initialEntries: RawHistoricalEntry[] = [
  { id: "h1", date: "2026-01-15", reference_no: "INV-1001", description: "Supply", debit: 5000, credit: 0 },
  { id: "h2", date: "2026-02-10", reference_no: "REC-201", description: "Payment", debit: 0, credit: 8000 },
  { id: "h3", date: "2026-03-05", reference_no: "INV-1002", description: "Services", debit: 3000, credit: 0 },
];

const initialCalc = calculateCustomerStatement({
  customerId: "cust_1",
  customerName: "Al Futtaim Engineering LLC",
  initialCutoverBalance: 10000,
  invoices: [],
  receipts: [],
  payments: [],
  historicalEntries: initialEntries,
});

assert.equal(initialCalc.entries[0].balance, 15000); // 10000 + 5000
assert.equal(initialCalc.entries[1].balance, 7000);  // 15000 - 8000
assert.equal(initialCalc.entries[2].balance, 10000); // 7000 + 3000
assert.equal(initialCalc.closing_balance, 10000);

// Edit h1 debit from 5000 to 7000
const editedEntries = initialEntries.map((e) => (e.id === "h1" ? { ...e, debit: 7000, is_edited: true } : e));
const updatedCalc = calculateCustomerStatement({
  customerId: "cust_1",
  customerName: "Al Futtaim Engineering LLC",
  initialCutoverBalance: 10000,
  invoices: [],
  receipts: [],
  payments: [],
  historicalEntries: editedEntries,
});

assert.equal(updatedCalc.entries[0].balance, 17000, "First row balance must reflect 17000");
assert.equal(updatedCalc.entries[1].balance, 9000, "Second row balance must reflect 9000");
assert.equal(updatedCalc.entries[2].balance, 12000, "Third row balance must reflect 12000");
assert.equal(updatedCalc.closing_balance, 12000, "Closing balance must update from 10000 to 12000");
console.log("✓ Scenario 2 Passed: Downstream running balances and closing balance update instantly upon edit.");

// ---------------------------------------------------------------------------
// TEST 3: Zero Double-Counting of Matched ERP Invoices/Payments
// ---------------------------------------------------------------------------
console.log("\n--> Testing Scenario 3: Zero Double-Counting of Matched Transactions...");
const liveInvoices: RawInvoice[] = [
  {
    id: "inv_live_1001",
    invoice_number: "INV-1001",
    invoice_date: "2026-01-15",
    total_amount: 5000,
    status: "approved",
    company_id: "comp_1",
    customer_id: "cust_1",
    customer_name: "Al Futtaim Engineering LLC",
  },
  {
    id: "inv_live_1002",
    invoice_number: "INV-1002",
    invoice_date: "2026-03-05",
    total_amount: 3000,
    status: "sent",
    company_id: "comp_1",
    customer_id: "cust_1",
    customer_name: "Al Futtaim Engineering LLC",
  },
];

const dedupCalc = calculateCustomerStatement({
  customerId: "cust_1",
  customerName: "Al Futtaim Engineering LLC",
  initialCutoverBalance: 10000,
  invoices: liveInvoices,
  receipts: [],
  payments: [],
  historicalEntries: initialEntries, // Contains INV-1001 and INV-1002
});

// Since INV-1001 and INV-1002 exist in both historicalEntries and liveInvoices,
// they MUST be counted exactly once!
assert.equal(dedupCalc.entries.length, 3, "Total statement entries must remain 3 (no duplication!)");
assert.equal(dedupCalc.closing_balance, 10000, "Closing balance must remain 10000 without double counting");
const inv1001Row = dedupCalc.entries.find((e) => e.reference_no === "INV-1001");
assert.equal(inv1001Row?.status, "matched", "INV-1001 must be flagged as matched");
assert.equal(inv1001Row?.invoice_id, "inv_live_1001", "INV-1001 must link to live ERP record");
console.log("✓ Scenario 3 Passed: Zero double-counting verified. Matched transactions link cleanly to ERP.");

// ---------------------------------------------------------------------------
// TEST 4: Auto-update on new live ERP invoice and payment
// ---------------------------------------------------------------------------
console.log("\n--> Testing Scenario 4: Auto-update on New ERP Invoices and Payments...");
const updatedInvoices = [
  ...liveInvoices,
  {
    id: "inv_live_2001",
    invoice_number: "INV-2001",
    invoice_date: "2026-07-01",
    total_amount: 4500,
    status: "sent",
    company_id: "comp_1",
    customer_id: "cust_1",
    customer_name: "Al Futtaim Engineering LLC",
  },
];

const livePayments: RawPayment[] = [
  {
    id: "pay_live_501",
    payment_number: "PAY-501",
    payment_date: "2026-07-15",
    amount: 2500,
    status: "completed",
    company_id: "comp_1",
    customer_id: "cust_1",
  },
];

const autoUpdateCalc = calculateCustomerStatement({
  customerId: "cust_1",
  customerName: "Al Futtaim Engineering LLC",
  initialCutoverBalance: 10000,
  invoices: updatedInvoices,
  receipts: [],
  payments: livePayments,
  historicalEntries: initialEntries,
});

// Previous closing was 10000. New invoice +4500, new payment -2500 -> 12000
assert.equal(autoUpdateCalc.entries.length, 5, "Total statement entries should now be 5");
assert.equal(autoUpdateCalc.closing_balance, 12000, "Closing balance should auto-update to 12000");
const newInvRow = autoUpdateCalc.entries.find((e) => e.invoice_id === "inv_live_2001");
assert.ok(newInvRow, "New ERP invoice must be present in statement");
assert.equal(newInvRow?.status, "live", "New ERP invoice must have status: live");

const newPayRow = autoUpdateCalc.entries.find((e) => e.payment_id === "pay_live_501");
assert.ok(newPayRow, "New ERP payment must be present in statement");
assert.equal(newPayRow?.status, "live", "New ERP payment must have status: live");
console.log("✓ Scenario 4 Passed: Statement dynamically incorporates newly created ERP transactions.");

// ---------------------------------------------------------------------------
// TEST 5: Serialization, Persistence & Audit Trail
// ---------------------------------------------------------------------------
console.log("\n--> Testing Scenario 5: JSON Persistence and Audit Trail in document_attachments...");
const serialized = buildSoaAttachmentDescription({
  soaNumber: "SOA-2026-0089",
  statementDate: "2026-06-30",
  openingBalance: 10000,
  charges: 8000,
  credits: 12000,
  closingBalance: 6000,
  cutoverDate: "2026-06-01",
  isCutoverApproved: true,
  entries: initialEntries,
  auditTrail: [
    {
      timestamp: "2026-06-30T10:00:00Z",
      user: "accountant@dubai-erp.com",
      action: "create",
      reason: "Initial import",
    },
  ],
});

assert.ok(serialized.startsWith("{"), "Modern description must serialize as JSON");
const parsed = parseSoaAttachmentRow({
  id: "att_1",
  company_id: "comp_1",
  entity_id: "cust_1",
  file_name: "Al_Futtaim_SOA.xlsx",
  file_url: "https://example.com/file.xlsx",
  description: serialized,
  created_at: "2026-06-30T10:00:00Z",
  customer_name: "Al Futtaim Engineering LLC",
});

assert.equal(parsed.soa_number, "SOA-2026-0089");
assert.equal(parsed.opening_balance, 10000);
assert.equal(parsed.closing_balance, 6000);
assert.equal(parsed.cutover_date, "2026-06-01");
assert.equal(parsed.is_cutover_approved, true);
assert.equal(parsed.entries.length, 3);
assert.equal(parsed.audit_trail.length, 1);
console.log("✓ Scenario 5 Passed: Full SOA transactions and audit trail persist and deserialize accurately.");

// ---------------------------------------------------------------------------
// TEST 6: Standardized PDF Filename
// ---------------------------------------------------------------------------
console.log("\n--> Testing Scenario 6: Standardized PDF Filename...");
const filename = getExportSoaPdfFilename("SOA-2026-0089", "Al Futtaim Engineering LLC", "2026-06-30");
assert.equal(
  filename,
  "SOA-2026-0089 Al Futtaim Engineering LLC - Statement of Account.pdf",
  "Filename must match standard naming convention"
);
console.log(`✓ Scenario 6 Passed: Generated filename matches standard: "${filename}"`);

console.log("\n=====================================================================");
console.log("=== ALL 6 / 6 EDITABLE SOA SYSTEM SCENARIOS PASSED! ✓ ===");
console.log("=====================================================================");
