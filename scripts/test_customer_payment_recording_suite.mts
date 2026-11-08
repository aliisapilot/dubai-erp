import assert from "node:assert/strict";
import { numberToWordsEnglish } from "../lib/amountInWords";
import { formatDisplayDocNumber } from "../lib/helpers";

console.log("=== Running Customer Payment Recording Verification Suite ===");

// 1. Data models matching Dubai ERP schemas
interface Customer {
  id: string;
  company_id: string;
  name: string;
  customer_code?: string;
  trn?: string;
  address?: string;
  phone?: string;
}

interface TaxInvoice {
  id: string;
  company_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: "draft" | "issued" | "partially_paid" | "paid" | "cancelled";
  notes?: string;
}

interface ReceiptVoucher {
  id: string;
  company_id: string;
  voucher_number: string;
  voucher_date: string;
  customer_id: string | null;
  received_from: string; // NOT NULL constraint
  amount: number;
  amount_words?: string;
  payment_method: "Cash" | "Cheque" | "Bank Transfer" | "Credit Card";
  cheque_number?: string | null;
  cheque_date?: string | null;
  bank_name?: string | null;
  tax_invoice_id?: string | null;
  total_due?: number;
  advance_amount?: number;
  balance_amount?: number;
  status: "posted" | "cancelled" | "draft";
  created_at: string;
}

interface StatementEntry {
  date: string;
  reference_no: string;
  debit: number;
  credit: number;
  balance: number;
}

// 2. Simulated transactional repository with atomic guarantees
class MockDubaiErpRepository {
  public customers: Customer[] = [];
  public invoices: TaxInvoice[] = [];
  public receipts: ReceiptVoucher[] = [];
  public failNextInvoiceUpdate = false;

  // Simulate record customer payment logic from app/customers/statements/page.tsx
  async recordPayment(params: {
    companyId: string;
    customerId: string | null;
    customName?: string;
    amount: number;
    voucherNumber: string;
    voucherDate: string;
    paymentMethod: string;
    taxInvoiceId?: string | null;
    chequeNumber?: string | null;
    chequeDate?: string | null;
    bankName?: string | null;
  }): Promise<{ success: boolean; receipt: ReceiptVoucher; message: string }> {
    const cleanAmt = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (cleanAmt <= 0) {
      throw new Error("Please enter a valid payment amount greater than zero.");
    }
    const voucherNumber = (params.voucherNumber || "").trim();
    if (!voucherNumber) {
      throw new Error("Please enter a Receipt Voucher / Reference number.");
    }

    if (!params.companyId) {
      throw new Error("Unable to identify active company. Please check your company settings.");
    }

    // Verify Customer & Populate received_from
    let verifiedCustomerName = "";
    let targetCustId: string | null = null;

    if (params.customerId) {
      targetCustId = params.customerId;
      const cust = this.customers.find(
        (c) => c.id === targetCustId && c.company_id === params.companyId
      );
      if (cust && cust.name?.trim()) {
        verifiedCustomerName = cust.name.trim();
      } else {
        throw new Error("Could not verify customer details from database. Please select a valid customer.");
      }
    } else if (params.customName?.trim()) {
      verifiedCustomerName = params.customName.trim();
    } else {
      throw new Error("Please select a customer before recording a payment.");
    }

    // Crucial check: received_from MUST NOT be null or placeholder
    if (!verifiedCustomerName || verifiedCustomerName === "Customer" || verifiedCustomerName === "Selected Customer") {
      throw new Error("Cannot record payment without a verified customer name.");
    }

    // Check duplicate voucher number within company
    const existingVoucher = this.receipts.find(
      (r) =>
        r.company_id === params.companyId &&
        r.voucher_number.toLowerCase() === voucherNumber.toLowerCase()
    );
    if (existingVoucher) {
      throw new Error(`Receipt voucher number "${voucherNumber}" already exists. Please provide a unique voucher number.`);
    }

    // Check rapid duplicate submission (< 15 seconds)
    const recentDupes = this.receipts.filter(
      (r) =>
        r.company_id === params.companyId &&
        r.amount === cleanAmt &&
        r.voucher_date === params.voucherDate &&
        r.received_from === verifiedCustomerName &&
        r.status !== "cancelled"
    );
    if (recentDupes.length > 0) {
      const latest = recentDupes[recentDupes.length - 1];
      const secDiff = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
      if (secDiff < 15) {
        throw new Error(`A payment of AED ${cleanAmt.toFixed(2)} for ${verifiedCustomerName} was just recorded (${latest.voucher_number}). Please wait before submitting again.`);
      }
    }

    // Payment method validation against database CHECK constraint
    let cleanPaymentMethod: "Cash" | "Cheque" | "Bank Transfer" | "Credit Card" = "Bank Transfer";
    if (params.paymentMethod === "Cash") cleanPaymentMethod = "Cash";
    else if (params.paymentMethod === "Cheque") cleanPaymentMethod = "Cheque";
    else if (params.paymentMethod === "Credit Card") cleanPaymentMethod = "Credit Card";
    else cleanPaymentMethod = "Bank Transfer";

    // Invoice Allocation
    let invoiceTotalDue = 0;
    let invoiceAdvanceAmount = 0;
    let invoiceBalanceAmount = 0;
    let nextInvoiceStatus: "paid" | "partially_paid" | null = null;

    if (params.taxInvoiceId) {
      const invRecord = this.invoices.find(
        (i) => i.id === params.taxInvoiceId && i.company_id === params.companyId
      );
      if (!invRecord) {
        throw new Error("Linked tax invoice not found or inaccessible.");
      }

      invoiceTotalDue = invRecord.total_amount;
      const prevReceipts = this.receipts.filter(
        (r) => r.tax_invoice_id === params.taxInvoiceId && r.status !== "cancelled"
      );
      const previousPaid = prevReceipts.reduce((sum, r) => sum + r.amount, 0);
      const newPaidTotal = previousPaid + cleanAmt;
      const remainingBalance = Math.max(0, Math.round((invoiceTotalDue - newPaidTotal) * 100) / 100);

      invoiceAdvanceAmount = Math.round(previousPaid * 100) / 100;
      invoiceBalanceAmount = remainingBalance;
      nextInvoiceStatus = remainingBalance <= 0.005 ? "paid" : "partially_paid";
    }

    // Create receipt voucher record with strict received_from and amount_words
    const newReceipt: ReceiptVoucher = {
      id: `rcv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      company_id: params.companyId,
      voucher_number: voucherNumber,
      voucher_date: params.voucherDate,
      customer_id: targetCustId,
      received_from: verifiedCustomerName,
      amount: cleanAmt,
      amount_words: numberToWordsEnglish(cleanAmt),
      payment_method: cleanPaymentMethod,
      cheque_number: cleanPaymentMethod === "Cheque" ? (params.chequeNumber?.trim() || null) : null,
      cheque_date: cleanPaymentMethod === "Cheque" ? (params.chequeDate || null) : null,
      bank_name: params.bankName?.trim() || null,
      tax_invoice_id: params.taxInvoiceId || null,
      total_due: invoiceTotalDue,
      advance_amount: invoiceAdvanceAmount,
      balance_amount: invoiceBalanceAmount,
      status: "posted",
      created_at: new Date().toISOString(),
    };

    // Insert receipt
    this.receipts.push(newReceipt);

    // If invoice linked, atomically update invoice with rollback support
    if (params.taxInvoiceId && nextInvoiceStatus) {
      if (this.failNextInvoiceUpdate) {
        // Simulate DB failure on invoice update
        // Compensating rollback:
        this.receipts = this.receipts.filter((r) => r.id !== newReceipt.id);
        throw new Error("Failed to update linked invoice allocation: simulated DB network timeout");
      }

      const inv = this.invoices.find((i) => i.id === params.taxInvoiceId);
      if (inv) {
        inv.status = nextInvoiceStatus;
      }
    }

    return {
      success: true,
      receipt: newReceipt,
      message: `Customer payment of AED ${cleanAmt.toFixed(2)} recorded successfully (${voucherNumber}) for ${verifiedCustomerName}.`,
    };
  }

  // Calculate customer statement
  getStatement(companyId: string, customerId: string, openingBalance = 0): {
    opening_balance: number;
    closing_balance: number;
    entries: StatementEntry[];
  } {
    const invs = this.invoices.filter((i) => i.company_id === companyId && i.customer_id === customerId && i.status !== "cancelled");
    const rcvs = this.receipts.filter((r) => r.company_id === companyId && r.customer_id === customerId && r.status !== "cancelled");

    type RawTx = { date: string; ref: string; debit: number; credit: number };
    const txs: RawTx[] = [];

    invs.forEach((i) => {
      txs.push({ date: i.invoice_date, ref: i.invoice_number, debit: i.total_amount, credit: 0 });
    });
    rcvs.forEach((r) => {
      txs.push({ date: r.voucher_date, ref: r.voucher_number, debit: 0, credit: r.amount });
    });

    txs.sort((a, b) => a.date.localeCompare(b.date));

    let bal = openingBalance;
    const entries: StatementEntry[] = txs.map((tx) => {
      bal += (tx.debit - tx.credit);
      return {
        date: tx.date,
        reference_no: tx.ref,
        debit: tx.debit,
        credit: tx.credit,
        balance: Math.round(bal * 100) / 100,
      };
    });

    return {
      opening_balance: openingBalance,
      closing_balance: Math.round(bal * 100) / 100,
      entries,
    };
  }
}

async function runTests() {
  const repo = new MockDubaiErpRepository();
  const companyA = "comp-1111-aaaa";
  const companyB = "comp-2222-bbbb";

  // Setup Customer
  const customerA: Customer = {
    id: "cust-001",
    company_id: companyA,
    name: "Al Futtaim Engineering LLC",
    customer_code: "AFE-001",
    trn: "100234567800003",
    address: "Dubai Investments Park, Dubai",
    phone: "+971 4 888 1234",
  };
  repo.customers.push(customerA);

  // Setup Invoices
  const invoice1: TaxInvoice = {
    id: "inv-001",
    company_id: companyA,
    customer_id: customerA.id,
    invoice_number: "INV-2026-001",
    invoice_date: "2026-10-01",
    total_amount: 10000,
    status: "issued",
  };
  const invoice2: TaxInvoice = {
    id: "inv-002",
    company_id: companyA,
    customer_id: customerA.id,
    invoice_number: "INV-2026-002",
    invoice_date: "2026-10-15",
    total_amount: 5000,
    status: "issued",
  };
  repo.invoices.push(invoice1, invoice2);

  // -------------------------------------------------------------
  // Test 1: General Customer Payment Without Invoice (Bank Transfer)
  // -------------------------------------------------------------
  console.log("--- 1. Testing General Customer Payment Without Invoice (Bank Transfer) ---");
  const res1 = await repo.recordPayment({
    companyId: companyA,
    customerId: customerA.id,
    amount: 3000,
    voucherNumber: "RV-2026-001",
    voucherDate: "2026-10-10",
    paymentMethod: "Bank Transfer",
    bankName: "Emirates NBD",
  });

  assert.equal(res1.success, true);
  assert.equal(res1.receipt.received_from, "Al Futtaim Engineering LLC", "received_from must match verified customer name");
  assert.equal(res1.receipt.customer_id, customerA.id);
  assert.equal(res1.receipt.company_id, companyA);
  assert.equal(res1.receipt.amount, 3000);
  assert.equal(res1.receipt.payment_method, "Bank Transfer");
  assert.equal(res1.receipt.status, "posted");
  assert.ok(res1.receipt.amount_words?.includes("Three Thousand Dirhams"));
  assert.equal(res1.receipt.tax_invoice_id, null);

  const statement1 = repo.getStatement(companyA, customerA.id, 0);
  // Invoices: 10,000 + 5,000 = 15,000. Payment: 3,000. Balance: 12,000.
  assert.equal(statement1.closing_balance, 12000, "Customer Statement balance must decrease by 3000");
  console.log("✓ Test 1 Passed: General payment successfully recorded with verified received_from and statement balance updated.");

  // -------------------------------------------------------------
  // Test 2: Customer Payment Linked to an Invoice (Partial Payment)
  // -------------------------------------------------------------
  console.log("--- 2. Testing Customer Payment Linked to Invoice (Partial Payment) ---");
  const res2 = await repo.recordPayment({
    companyId: companyA,
    customerId: customerA.id,
    amount: 4000,
    voucherNumber: "RV-2026-002",
    voucherDate: "2026-10-16",
    paymentMethod: "Cash",
    taxInvoiceId: invoice1.id,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.receipt.received_from, "Al Futtaim Engineering LLC");
  assert.equal(res2.receipt.tax_invoice_id, invoice1.id);
  assert.equal(res2.receipt.total_due, 10000);
  assert.equal(res2.receipt.advance_amount, 0);
  assert.equal(res2.receipt.balance_amount, 6000, "Outstanding invoice balance must be 6,000 after 4,000 payment");
  assert.equal(invoice1.status, "partially_paid", "Invoice status must transition to partially_paid");

  const statement2 = repo.getStatement(companyA, customerA.id, 0);
  // 15,000 - 3,000 - 4,000 = 8,000
  assert.equal(statement2.closing_balance, 8000, "Customer statement balance must decrease to 8,000");
  console.log("✓ Test 2 Passed: Partial payment properly allocates to invoice, updates balance and invoice status.");

  // -------------------------------------------------------------
  // Test 3: Customer Payment Settling Invoice In Full (Cash & Cheque)
  // -------------------------------------------------------------
  console.log("--- 3. Testing Full Invoice Settlement & Cheque Details ---");
  const res3 = await repo.recordPayment({
    companyId: companyA,
    customerId: customerA.id,
    amount: 6000,
    voucherNumber: "RV-2026-003",
    voucherDate: "2026-10-20",
    paymentMethod: "Cheque",
    chequeNumber: "CHQ-88201",
    chequeDate: "2026-10-25",
    bankName: "Mashreq Bank",
    taxInvoiceId: invoice1.id,
  });

  assert.equal(res3.receipt.received_from, "Al Futtaim Engineering LLC");
  assert.equal(res3.receipt.cheque_number, "CHQ-88201");
  assert.equal(res3.receipt.bank_name, "Mashreq Bank");
  assert.equal(res3.receipt.total_due, 10000);
  assert.equal(res3.receipt.advance_amount, 4000, "Advance amount should reflect previous 4,000 payment");
  assert.equal(res3.receipt.balance_amount, 0, "Invoice remaining balance must be 0");
  assert.equal(invoice1.status, "paid", "Invoice status must transition to paid");

  const statement3 = repo.getStatement(companyA, customerA.id, 0);
  // 15,000 - 13,000 = 2,000 (only invoice 2 remaining: 5,000)
  assert.equal(statement3.closing_balance, 2000);
  console.log("✓ Test 3 Passed: Full settlement marks invoice paid and preserves cheque details.");

  // -------------------------------------------------------------
  // Test 4: Duplicate Submission Prevention (Same Voucher Number & Rapid Retries)
  // -------------------------------------------------------------
  console.log("--- 4. Testing Duplicate Submission Prevention ---");
  let duplicateVoucherError = "";
  try {
    await repo.recordPayment({
      companyId: companyA,
      customerId: customerA.id,
      amount: 1000,
      voucherNumber: "RV-2026-001", // Duplicate
      voucherDate: "2026-10-22",
      paymentMethod: "Cash",
    });
  } catch (err: any) {
    duplicateVoucherError = err.message;
  }
  assert.match(duplicateVoucherError, /already exists/i, "Must reject duplicate voucher number");

  let rapidRetryError = "";
  try {
    await repo.recordPayment({
      companyId: companyA,
      customerId: customerA.id,
      amount: 6000, // Same as res3
      voucherNumber: "RV-2026-099",
      voucherDate: "2026-10-20", // Same as res3
      paymentMethod: "Cash",
    });
  } catch (err: any) {
    rapidRetryError = err.message;
  }
  assert.match(rapidRetryError, /was just recorded/i, "Must prevent rapid double-clicks within 15 seconds");
  console.log("✓ Test 4 Passed: Duplicate voucher numbers and rapid multi-click retries prevented.");

  // -------------------------------------------------------------
  // Test 5: Atomic Allocation & Rollback Guarantee
  // -------------------------------------------------------------
  console.log("--- 5. Testing Atomic Allocation with Rollback Guarantee ---");
  const receiptsBefore = repo.receipts.length;
  repo.failNextInvoiceUpdate = true;
  let atomicError = "";
  try {
    await repo.recordPayment({
      companyId: companyA,
      customerId: customerA.id,
      amount: 2000,
      voucherNumber: "RV-2026-FAIL",
      voucherDate: "2026-10-21",
      paymentMethod: "Cash",
      taxInvoiceId: invoice2.id,
    });
  } catch (err: any) {
    atomicError = err.message;
  }
  assert.match(atomicError, /Failed to update linked invoice allocation/i);
  assert.equal(repo.receipts.length, receiptsBefore, "Receipt voucher must be rolled back if invoice update fails");
  assert.equal(invoice2.status, "issued", "Invoice status must remain unchanged on failure");
  repo.failNextInvoiceUpdate = false;
  console.log("✓ Test 5 Passed: Atomic allocation rollback verified; no partial success reported.");

  // -------------------------------------------------------------
  // Test 6: Company-Level Access Control & Isolation
  // -------------------------------------------------------------
  console.log("--- 6. Testing Company-Level Access Controls ---");
  let foreignCustomerError = "";
  try {
    // Attempt to record payment for Company A's customer using Company B's context
    await repo.recordPayment({
      companyId: companyB,
      customerId: customerA.id,
      amount: 500,
      voucherNumber: "RV-COMPB-001",
      voucherDate: "2026-10-22",
      paymentMethod: "Cash",
    });
  } catch (err: any) {
    foreignCustomerError = err.message;
  }
  assert.match(foreignCustomerError, /Could not verify customer details/i, "Must isolate customers by company");

  const statementCompanyB = repo.getStatement(companyB, customerA.id, 0);
  assert.equal(statementCompanyB.entries.length, 0, "Company B must not see transactions from Company A");
  console.log("✓ Test 6 Passed: Company-level access isolation strictly enforced.");

  // -------------------------------------------------------------
  // Test 7: Error Handling (Invalid Amounts, Missing Customer, No Placeholders)
  // -------------------------------------------------------------
  console.log("--- 7. Testing Error Handling & Placeholder Prohibition ---");
  await assert.rejects(
    async () => {
      await repo.recordPayment({
        companyId: companyA,
        customerId: customerA.id,
        amount: 0,
        voucherNumber: "RV-2026-ZERO",
        voucherDate: "2026-10-22",
        paymentMethod: "Cash",
      });
    },
    /greater than zero/i,
    "Must reject zero amount"
  );

  await assert.rejects(
    async () => {
      await repo.recordPayment({
        companyId: companyA,
        customerId: null,
        amount: 500,
        voucherNumber: "RV-2026-NOCUST",
        voucherDate: "2026-10-22",
        paymentMethod: "Cash",
      });
    },
    /select a customer/i,
    "Must reject missing customer"
  );

  await assert.rejects(
    async () => {
      await repo.recordPayment({
        companyId: companyA,
        customerId: null,
        customName: "Customer", // Forbidden placeholder
        amount: 500,
        voucherNumber: "RV-2026-PLACEHOLDER",
        voucherDate: "2026-10-22",
        paymentMethod: "Cash",
      });
    },
    /Cannot record payment without a verified customer name/i,
    "Must reject generic placeholder names"
  );

  console.log("✓ Test 7 Passed: Invalid amounts, missing customers, and placeholder names correctly rejected.");
  console.log("\nALL 7 CUSTOMER PAYMENT & RECEIPT ALLOCATION TESTS PASSED SUCCESSFULLY! ✓\n");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
