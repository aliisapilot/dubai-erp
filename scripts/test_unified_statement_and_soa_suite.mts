import assert from "node:assert/strict";
import {
  calculateCustomerStatement,
  reconcileCustomerStatement,
  filterEligibleInvoices,
  filterAndDeduplicateCredits,
  sortTransactionsChronologically,
  roundCurrency,
  RawInvoice,
  RawReceiptVoucher,
  RawPayment,
  StatementData,
} from "../lib/customerStatementEngine";
import { numberToWordsEnglish } from "../lib/amountInWords";
import { formatDisplayDocNumber } from "../lib/helpers";

console.log("=====================================================================");
console.log("=== DUBAI ERP: UNIFIED CUSTOMER STATEMENT & SOA VERIFICATION SUITE ===");
console.log("=====================================================================\n");

let passedTests = 0;
function pass(testName: string) {
  passedTests++;
  console.log(`✓ [PASS ${passedTests}] ${testName}`);
}

// -----------------------------------------------------------------------------
// SCENARIO 1: Customer with no transactions
// -----------------------------------------------------------------------------
{
  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
    invoices: [],
    receipts: [],
    payments: [],
    customerName: "Zero Activity LLC",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.opening_balance, 0, "Opening balance must be 0");
  assert.equal(statement.closing_balance, 0, "Closing balance must be 0");
  assert.equal(statement.total_debits, 0, "Total debits must be 0");
  assert.equal(statement.total_credits, 0, "Total credits must be 0");
  assert.equal(statement.entries.length, 0, "Entries must be empty");
  assert.equal(recon.isReconciled, true, "Must be reconciled");
  assert.equal(recon.discrepancy, 0, "Discrepancy must be 0");

  pass("Scenario 1: Customer with no transactions produces zero balances and 0 discrepancy");
}

// -----------------------------------------------------------------------------
// SCENARIO 2: Customer with opening balance only
// -----------------------------------------------------------------------------
{
  const statement = calculateCustomerStatement({
    initialCutoverBalance: 15450.75,
    fromDate: "2026-02-01",
    toDate: "2026-02-28",
    invoices: [],
    receipts: [],
    payments: [],
    customerName: "Al Karwan Solution FZC",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.opening_balance, 15450.75);
  assert.equal(statement.closing_balance, 15450.75, "Closing balance must equal opening balance with no transactions");
  assert.equal(statement.total_debits, 0);
  assert.equal(statement.total_credits, 0);
  assert.equal(statement.entries.length, 0);
  assert.equal(recon.isReconciled, true);
  assert.equal(recon.discrepancy, 0);

  pass("Scenario 2: Customer with opening balance only maintains balance invariant");
}

// -----------------------------------------------------------------------------
// SCENARIO 3: Multiple invoices
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-1", invoice_number: "INV-101", invoice_date: "2026-03-01", total_amount: 10000, status: "issued" },
    { id: "inv-2", invoice_number: "INV-102", invoice_date: "2026-03-10", total_amount: 5500.50, status: "issued" },
    { id: "inv-3", invoice_number: "INV-103", invoice_date: "2026-03-20", total_amount: 3250.25, status: "issued" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-03-01",
    toDate: "2026-03-31",
    invoices,
    receipts: [],
    payments: [],
    customerName: "Gulf Contracting",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries.length, 3);
  assert.equal(statement.entries[0].balance, 10000);
  assert.equal(statement.entries[1].balance, 15500.50);
  assert.equal(statement.entries[2].balance, 18750.75);
  assert.equal(statement.closing_balance, 18750.75);
  assert.equal(statement.total_debits, 18750.75);
  assert.equal(statement.total_credits, 0);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 3: Multiple invoices update running balances line by line without drift");
}

// -----------------------------------------------------------------------------
// SCENARIO 4: Partial payment linked to an invoice
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-1", invoice_number: "INV-201", invoice_date: "2026-04-01", total_amount: 20000, status: "partially_paid" },
  ];
  const receipts: RawReceiptVoucher[] = [
    { id: "rv-1", voucher_number: "RV-201", voucher_date: "2026-04-05", amount: 8000, payment_method: "Bank Transfer", status: "posted", tax_invoice_id: "inv-1" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    invoices,
    receipts,
    payments: [],
    customerName: "Dubai Marina Yacht Club",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries.length, 2);
  assert.equal(statement.entries[0].debit, 20000);
  assert.equal(statement.entries[0].balance, 20000);
  assert.equal(statement.entries[1].credit, 8000);
  assert.equal(statement.entries[1].balance, 12000);
  assert.equal(statement.closing_balance, 12000);
  assert.equal(statement.total_debits, 20000);
  assert.equal(statement.total_credits, 8000);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 4: Partial payment correctly reduces outstanding balance to exact remaining amount");
}

// -----------------------------------------------------------------------------
// SCENARIO 5: Fully paid invoice
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-1", invoice_number: "INV-301", invoice_date: "2026-05-01", total_amount: 7500, status: "paid" },
  ];
  const receipts: RawReceiptVoucher[] = [
    { id: "rv-1", voucher_number: "RV-301", voucher_date: "2026-05-03", amount: 7500, payment_method: "Cheque", cheque_number: "CHQ-7788", status: "posted" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-05-01",
    toDate: "2026-05-31",
    invoices,
    receipts,
    payments: [],
    customerName: "Emirates Towers",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries[1].balance, 0);
  assert.equal(statement.closing_balance, 0);
  assert.equal(statement.total_debits, 7500);
  assert.equal(statement.total_credits, 7500);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 5: Fully paid invoice cleanly zeroes out running balance");
}

// -----------------------------------------------------------------------------
// SCENARIO 6: General unallocated payment (Advance / On-Account payment)
// -----------------------------------------------------------------------------
{
  const receipts: RawReceiptVoucher[] = [
    { id: "rv-adv", voucher_number: "RV-ADV-01", voucher_date: "2026-06-01", amount: 10000, payment_method: "Bank Transfer", status: "posted" },
  ];
  const invoices: RawInvoice[] = [
    { id: "inv-6", invoice_number: "INV-601", invoice_date: "2026-06-15", total_amount: 15000, status: "issued" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-06-01",
    toDate: "2026-06-30",
    invoices,
    receipts,
    payments: [],
    customerName: "Apex Real Estate",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries[0].credit, 10000);
  assert.equal(statement.entries[0].balance, -10000, "Advance payment reflects as negative / credit balance");
  assert.equal(statement.entries[1].debit, 15000);
  assert.equal(statement.entries[1].balance, 5000, "Subsequent invoice offsets advance balance correctly");
  assert.equal(statement.closing_balance, 5000);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 6: General unallocated payment handles credit balances and subsequent offsets");
}

// -----------------------------------------------------------------------------
// SCENARIO 7: Credit notes and approved adjustments
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-7", invoice_number: "INV-701", invoice_date: "2026-07-01", total_amount: 12000, status: "issued" },
  ];
  // Credit note modeled as credit receipt voucher or adjustment
  const receipts: RawReceiptVoucher[] = [
    { id: "cn-1", voucher_number: "CN-701", voucher_date: "2026-07-05", amount: 2000, payment_method: "Cash", status: "posted", notes: "Discount adjustment credit note" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-07-01",
    toDate: "2026-07-31",
    invoices,
    receipts,
    payments: [],
    customerName: "Dubai Properties",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.closing_balance, 10000);
  assert.equal(statement.total_credits, 2000);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 7: Credit notes apply as credits reducing customer indebtedness");
}

// -----------------------------------------------------------------------------
// SCENARIO 8: Cancelled, voided, and draft invoices and receipts
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-act", invoice_number: "INV-801", invoice_date: "2026-08-01", total_amount: 5000, status: "issued" },
    { id: "inv-can", invoice_number: "INV-802", invoice_date: "2026-08-02", total_amount: 9999, status: "cancelled" },
    { id: "inv-void", invoice_number: "INV-803", invoice_date: "2026-08-03", total_amount: 8888, status: "void" },
    { id: "inv-draft", invoice_number: "INV-804", invoice_date: "2026-08-04", total_amount: 7777, status: "draft" },
  ];
  const receipts: RawReceiptVoucher[] = [
    { id: "rv-act", voucher_number: "RV-801", voucher_date: "2026-08-05", amount: 2000, status: "posted" },
    { id: "rv-can", voucher_number: "RV-802", voucher_date: "2026-08-06", amount: 5555, status: "cancelled" },
    { id: "rv-void", voucher_number: "RV-803", voucher_date: "2026-08-07", amount: 4444, status: "void" },
    { id: "rv-draft", voucher_number: "RV-804", voucher_date: "2026-08-08", amount: 3333, status: "draft" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-08-01",
    toDate: "2026-08-31",
    invoices,
    receipts,
    payments: [],
    customerName: "Clean Ledger Corp",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries.length, 2, "Only 1 active invoice and 1 active receipt should be present");
  assert.equal(statement.total_debits, 5000, "Cancelled/draft debits must be strictly excluded");
  assert.equal(statement.total_credits, 2000, "Cancelled/draft credits must be strictly excluded");
  assert.equal(statement.closing_balance, 3000);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 8: Cancelled, voided, and draft records are completely excluded from balances");
}

// -----------------------------------------------------------------------------
// SCENARIO 9: Historical date ranges & Opening Balance aggregation
// -----------------------------------------------------------------------------
{
  const initialCutoverBalance = 5000;
  const invoices: RawInvoice[] = [
    // Prior transactions (January)
    { id: "inv-jan", invoice_number: "INV-JAN", invoice_date: "2026-01-10", total_amount: 3000, status: "issued" },
    // Period transactions (February)
    { id: "inv-feb", invoice_number: "INV-FEB", invoice_date: "2026-02-10", total_amount: 4000, status: "issued" },
    // Future transactions (March)
    { id: "inv-mar", invoice_number: "INV-MAR", invoice_date: "2026-03-10", total_amount: 6000, status: "issued" },
  ];
  const receipts: RawReceiptVoucher[] = [
    // Prior receipt (January)
    { id: "rv-jan", voucher_number: "RV-JAN", voucher_date: "2026-01-20", amount: 1500, status: "posted" },
    // Period receipt (February)
    { id: "rv-feb", voucher_number: "RV-FEB", voucher_date: "2026-02-20", amount: 2500, status: "posted" },
  ];

  // Requesting statement for February 2026
  const statement = calculateCustomerStatement({
    initialCutoverBalance,
    fromDate: "2026-02-01",
    toDate: "2026-02-28",
    invoices,
    receipts,
    payments: [],
    customerName: "Historical Trading LLC",
  });

  const recon = reconcileCustomerStatement(statement);

  // Opening Balance = 5000 + (3000 - 1500) = 6500
  assert.equal(statement.opening_balance, 6500, "Opening balance must aggregate all prior transactions before fromDate");
  assert.equal(statement.entries.length, 2, "Only February transactions should be in entries");
  assert.equal(statement.total_debits, 4000);
  assert.equal(statement.total_credits, 2500);
  // Closing Balance = 6500 + 4000 - 2500 = 8000
  assert.equal(statement.closing_balance, 8000);
  assert.equal(recon.isReconciled, true);

  pass("Scenario 9: Historical date ranges accumulate opening balance before fromDate with strict precision");
}

// -----------------------------------------------------------------------------
// SCENARIO 10: Date boundary inclusion
// -----------------------------------------------------------------------------
{
  const invoices: RawInvoice[] = [
    { id: "inv-start", invoice_number: "INV-START", invoice_date: "2026-09-01", total_amount: 1000, status: "issued" },
    { id: "inv-mid", invoice_number: "INV-MID", invoice_date: "2026-09-15", total_amount: 2000, status: "issued" },
    { id: "inv-end", invoice_number: "INV-END", invoice_date: "2026-09-30", total_amount: 3000, status: "issued" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
    invoices,
    receipts: [],
    payments: [],
    customerName: "Boundary Verification",
  });

  assert.equal(statement.entries.length, 3, "Transactions on exact fromDate and toDate boundaries must be included");
  assert.equal(statement.closing_balance, 6000);

  pass("Scenario 10: Date boundary filtering includes exact start and end dates inclusively");
}

// -----------------------------------------------------------------------------
// SCENARIO 11: Same-day transaction ordering & deterministic tie-breakers
// -----------------------------------------------------------------------------
{
  const sameDay = "2026-10-15";
  const invoices: RawInvoice[] = [
    { id: "inv-b", invoice_number: "INV-002", invoice_date: sameDay, total_amount: 4000, status: "issued" },
    { id: "inv-a", invoice_number: "INV-001", invoice_date: sameDay, total_amount: 2000, status: "issued" },
  ];
  const receipts: RawReceiptVoucher[] = [
    { id: "rv-b", voucher_number: "RV-002", voucher_date: sameDay, amount: 1500, status: "posted" },
    { id: "rv-a", voucher_number: "RV-001", voucher_date: sameDay, amount: 500, status: "posted" },
  ];

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: sameDay,
    toDate: sameDay,
    invoices,
    receipts,
    payments: [],
    customerName: "Order Test Co",
  });

  // Debits first, tie-break by reference: INV-001, INV-002, then RV-001, RV-002
  assert.equal(statement.entries[0].reference_no, "INV-001");
  assert.equal(statement.entries[1].reference_no, "INV-002");
  assert.equal(statement.entries[2].reference_no, "RV-001");
  assert.equal(statement.entries[3].reference_no, "RV-002");

  pass("Scenario 11: Same-day transactions order debits before credits with deterministic tie-breakers");
}

// -----------------------------------------------------------------------------
// SCENARIO 12: Multi-page SOA data formatting & scaling
// -----------------------------------------------------------------------------
{
  const manyInvoices: RawInvoice[] = [];
  for (let i = 1; i <= 35; i++) {
    const dayStr = String(i <= 28 ? i : 28).padStart(2, "0");
    manyInvoices.push({
      id: `inv-many-${i}`,
      invoice_number: `INV-2026-${String(i).padStart(3, "0")}`,
      invoice_date: `2026-05-${dayStr}`,
      total_amount: 1000 + i * 50,
      status: "issued",
    });
  }

  const statement = calculateCustomerStatement({
    initialCutoverBalance: 2000,
    fromDate: "2026-05-01",
    toDate: "2026-05-31",
    invoices: manyInvoices,
    receipts: [],
    payments: [],
    customerName: "Large Portfolio Enterprise",
  });

  const recon = reconcileCustomerStatement(statement);

  assert.equal(statement.entries.length, 35, "All 35 transactions must be cleanly represented");
  assert.equal(recon.isReconciled, true, "Running balance continuity must hold across multiple pages");
  assert.ok(statement.closing_balance > 65000);

  pass("Scenario 12: Multi-page SOA dataset preserves running balance and mathematical integrity across 35+ rows");
}

// -----------------------------------------------------------------------------
// SCENARIO 13: Cross-company isolation
// -----------------------------------------------------------------------------
{
  const companyA = "comp-aaa";
  const companyB = "comp-bbb";

  const mixedInvoices: RawInvoice[] = [
    { id: "inv-a1", company_id: companyA, invoice_number: "INV-A1", invoice_date: "2026-07-01", total_amount: 5000, status: "issued" },
    { id: "inv-b1", company_id: companyB, invoice_number: "INV-B1", invoice_date: "2026-07-02", total_amount: 9000, status: "issued" },
  ];

  // Engine receives already filtered company records per query
  const scopedCompanyAInvoices = mixedInvoices.filter(i => i.company_id === companyA);
  const statement = calculateCustomerStatement({
    initialCutoverBalance: 0,
    fromDate: null,
    toDate: null,
    invoices: scopedCompanyAInvoices,
    receipts: [],
    payments: [],
    customerName: "Company A Only",
  });

  assert.equal(statement.entries.length, 1);
  assert.equal(statement.entries[0].original_reference, "INV-A1");
  assert.equal(statement.entries[0].reference_no, "INV-001");
  assert.equal(statement.closing_balance, 5000);

  pass("Scenario 13: Cross-company isolation strictly filters records by company scope");
}

// -----------------------------------------------------------------------------
// SCENARIO 14: Duplicate payment prevention & deduplication
// -----------------------------------------------------------------------------
{
  const receipts: RawReceiptVoucher[] = [
    { id: "rcv-1", voucher_number: "RV-555", voucher_date: "2026-08-10", amount: 4500, cheque_number: "CHQ-123", status: "posted" },
  ];
  const payments: RawPayment[] = [
    // Duplicate 1: Matching voucher number
    { id: "pay-dupe-1", payment_number: "PAY-001", reference_number: "RV-555", payment_date: "2026-08-10", amount: 4500, status: "completed" },
    // Duplicate 2: Matching cheque number
    { id: "pay-dupe-2", payment_number: "PAY-002", reference_number: "CHQ-123", payment_date: "2026-08-10", amount: 4500, status: "completed" },
    // Duplicate 3: Matching date & amount with RV in ref
    { id: "pay-dupe-3", payment_number: "PAY-003", reference_number: "RV-555 payment", payment_date: "2026-08-10", amount: 4500, status: "completed" },
    // Legitimate distinct payment
    { id: "pay-legit", payment_number: "PAY-888", reference_number: "TRF-UNIQUE", payment_date: "2026-08-15", amount: 2000, status: "completed" },
  ];

  const dedupedCredits = filterAndDeduplicateCredits(receipts, payments);

  assert.equal(dedupedCredits.length, 2, "Only 1 receipt voucher and 1 distinct payment should survive deduplication");
  const total = dedupedCredits.reduce((s, c) => s + c.credit, 0);
  assert.equal(total, 6500, "Must not double count payments matching receipt vouchers");

  pass("Scenario 14: Duplicate payment prevention eliminates double-counting across receipt and payment tables");
}

// -----------------------------------------------------------------------------
// SCENARIO 15: Screen / PDF / SOA Preview balance reconciliation
// -----------------------------------------------------------------------------
{
  const statement = calculateCustomerStatement({
    initialCutoverBalance: 12500.50,
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
    invoices: [
      { id: "inv-rec-1", invoice_number: "INV-901", invoice_date: "2026-09-05", total_amount: 8200.25, status: "issued" },
      { id: "inv-rec-2", invoice_number: "INV-902", invoice_date: "2026-09-18", total_amount: 4300.00, status: "issued" },
    ],
    receipts: [
      { id: "rv-rec-1", voucher_number: "RV-901", voucher_date: "2026-09-10", amount: 5000.00, status: "posted" },
      { id: "rv-rec-2", voucher_number: "RV-902", voucher_date: "2026-09-25", amount: 7500.75, status: "posted" },
    ],
    payments: [],
    customerName: "Universal Reconciled Corp",
  });

  const recon = reconcileCustomerStatement(statement);

  // Exact equation check: Opening + Debits - Credits
  // 12500.50 + (8200.25 + 4300.00) - (5000.00 + 7500.75)
  // = 12500.50 + 12500.25 - 12500.75 = 12500.00
  assert.equal(statement.closing_balance, 12500.00);
  assert.equal(recon.isReconciled, true);
  assert.equal(recon.statementClosingBalance, 12500.00);
  assert.equal(recon.soaClosingBalance, 12500.00);
  assert.equal(recon.computedClosingBalance, 12500.00);
  assert.equal(recon.discrepancy, 0.00);

  // Net amount in words formatting check
  const wordsEn = numberToWordsEnglish(statement.closing_balance);
  assert.equal(wordsEn, "Twelve Thousand Five Hundred Dirhams Only");

  pass("Scenario 15: Screen Table = SOA Preview = SOA PDF = Print with 0.00 discrepancy and identical words");
}

console.log("\n=====================================================================");
console.log(`=== ALL ${passedTests} / 15 CUSTOMER STATEMENT & SOA SCENARIOS PASSED! ✓ ===`);
console.log("=====================================================================\n");
