import assert from "node:assert/strict";

interface RawTx {
  id: string;
  date: string;
  reference_no: string;
  original_reference: string;
  debit: number;
  credit: number;
  type: "invoice" | "receipt_voucher" | "payment";
}

interface StatementEntry {
  date: string;
  reference_no: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementResult {
  opening_balance: number;
  entries: StatementEntry[];
  closing_balance: number;
}

function calculateStatement(
  appliedOpeningBalance: number,
  fromDate: string | null,
  toDate: string | null,
  rawTxs: RawTx[]
): StatementResult {
  // Sort chronologically: invoices (debits) before payments (credits) on the same date
  const sorted = [...rawTxs].sort((a, b) => {
    const dayA = a.date.slice(0, 10);
    const dayB = b.date.slice(0, 10);
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    if (a.debit > 0 && b.credit > 0) return -1;
    if (a.credit > 0 && b.debit > 0) return 1;
    return (a.reference_no || "").localeCompare(b.reference_no || "");
  });

  let computedOpening = appliedOpeningBalance;
  const filteredTxs: RawTx[] = [];

  sorted.forEach((tx) => {
    const transactionDay = tx.date.slice(0, 10);
    if (fromDate && transactionDay < fromDate) {
      computedOpening += (tx.debit - tx.credit);
    } else if ((!fromDate || transactionDay >= fromDate) && (!toDate || transactionDay <= toDate)) {
      filteredTxs.push(tx);
    }
  });

  let currentBalance = computedOpening;
  const entries: StatementEntry[] = filteredTxs.map((tx) => {
    currentBalance += (tx.debit - tx.credit);
    return {
      date: tx.date,
      reference_no: tx.reference_no,
      debit: tx.debit,
      credit: tx.credit,
      balance: currentBalance,
    };
  });

  return {
    opening_balance: Math.round(computedOpening * 100) / 100,
    entries,
    closing_balance: Math.round(currentBalance * 100) / 100,
  };
}

function deduplicateCredits(
  receiptVouchers: Array<{ id: string; voucher_number: string; voucher_date: string; amount: number; cheque_number?: string; status?: string }>,
  payments: Array<{ id: string; payment_number: string; reference_number?: string; payment_date: string; amount: number; status?: string }>
): RawTx[] {
  const credits: RawTx[] = [];
  const seenCreditRefs = new Set<string>();

  // 1. Process receipt vouchers first
  receiptVouchers.forEach((rcv) => {
    const rst = (rcv.status || "").toLowerCase().trim();
    if (rst === "cancelled" || rst === "void") return;
    if (!rcv.voucher_date || rcv.amount <= 0) return;

    const vNum = (rcv.voucher_number || "").trim();
    if (vNum) seenCreditRefs.add(vNum.toUpperCase());
    if (rcv.cheque_number) seenCreditRefs.add(rcv.cheque_number.trim().toUpperCase());
    seenCreditRefs.add(`${rcv.voucher_date.slice(0, 10)}_${rcv.amount.toFixed(2)}`);

    credits.push({
      id: rcv.id,
      date: rcv.voucher_date,
      reference_no: vNum || "RV",
      original_reference: vNum || "RV",
      debit: 0,
      credit: rcv.amount,
      type: "receipt_voucher",
    });
  });

  // 2. Process payments, deduplicating
  payments.forEach((p) => {
    const pst = (p.status || "").toLowerCase().trim();
    if (pst === "cancelled" || pst === "void") return;
    if (!p.payment_date || p.amount <= 0) return;

    const pNum = (p.payment_number || "").trim();
    const pRef = (p.reference_number || "").trim();

    if (pNum && seenCreditRefs.has(pNum.toUpperCase())) return;
    if (pRef && seenCreditRefs.has(pRef.toUpperCase())) return;
    if (seenCreditRefs.has(`${p.payment_date.slice(0, 10)}_${p.amount.toFixed(2)}`)) {
      if (pRef.toLowerCase().includes("rv") || pNum.toLowerCase().includes("rv")) return;
    }

    if (pNum) seenCreditRefs.add(pNum.toUpperCase());
    if (pRef) seenCreditRefs.add(pRef.toUpperCase());

    credits.push({
      id: p.id,
      date: p.payment_date,
      reference_no: pNum || pRef || "PAY",
      original_reference: pNum || pRef || "PAY",
      debit: 0,
      credit: p.amount,
      type: "payment",
    });
  });

  return credits;
}

console.log("=== Running Customer Statement Verification Suite ===");

// TEST 1: Opening balance calculation before fromDate
{
  const initialCutoverBalance = 5000;
  const rawTxs: RawTx[] = [
    { id: "1", date: "2026-01-10", reference_no: "INV-001", original_reference: "INV-001", debit: 2000, credit: 0, type: "invoice" },
    { id: "2", date: "2026-01-15", reference_no: "RV-001", original_reference: "RV-001", debit: 0, credit: 1500, type: "receipt_voucher" },
    { id: "3", date: "2026-02-01", reference_no: "INV-002", original_reference: "INV-002", debit: 3000, credit: 0, type: "invoice" },
    { id: "4", date: "2026-02-15", reference_no: "RV-002", original_reference: "RV-002", debit: 0, credit: 2000, type: "receipt_voucher" },
    { id: "5", date: "2026-03-05", reference_no: "INV-003", original_reference: "INV-003", debit: 1000, credit: 0, type: "invoice" },
  ];

  // From date = 2026-02-01
  // Opening balance at 2026-02-01 should be: 5000 + (2000 - 1500) = 5500
  const res = calculateStatement(initialCutoverBalance, "2026-02-01", "2026-02-28", rawTxs);
  assert.equal(res.opening_balance, 5500, "Opening balance before fromDate must accurately reflect prior transactions");
  assert.equal(res.entries.length, 2, "Only transactions in [2026-02-01, 2026-02-28] should be in entries");
  // Period debits = 3000, credits = 2000 -> Closing balance = 5500 + 3000 - 2000 = 6500
  assert.equal(res.closing_balance, 6500, "Closing balance must equal Opening + Period Debits - Period Credits");
  console.log("✓ TEST 1 Passed: Opening balance before fromDate matches authoritative formula.");
}

// TEST 2: Inclusive date filtering (transactions on fromDate and toDate included)
{
  const rawTxs: RawTx[] = [
    { id: "1", date: "2026-03-01", reference_no: "INV-010", original_reference: "INV-010", debit: 1200, credit: 0, type: "invoice" },
    { id: "2", date: "2026-03-15", reference_no: "INV-011", original_reference: "INV-011", debit: 800, credit: 0, type: "invoice" },
    { id: "3", date: "2026-03-31", reference_no: "RV-010", original_reference: "RV-010", debit: 0, credit: 2000, type: "receipt_voucher" },
  ];

  const res = calculateStatement(0, "2026-03-01", "2026-03-31", rawTxs);
  assert.equal(res.entries.length, 3, "Transactions on exact fromDate and toDate must be included");
  assert.equal(res.closing_balance, 0, "1200 + 800 - 2000 should close at 0");
  console.log("✓ TEST 2 Passed: Inclusive date filtering strictly covers boundary dates.");
}

// TEST 3: Zero transactions period (Closing Balance === Opening Balance)
{
  const res = calculateStatement(10500, "2026-05-01", "2026-05-31", []);
  assert.equal(res.opening_balance, 10500);
  assert.equal(res.closing_balance, 10500, "If no transactions exist, Closing Balance must equal Opening Balance");
  assert.equal(res.entries.length, 0);
  console.log("✓ TEST 3 Passed: Zero transactions period leaves balance invariant.");
}

// TEST 4: Credit deduplication between Receipt Vouchers and Payments
{
  const rcvs = [
    { id: "rv-1", voucher_number: "RV-101", voucher_date: "2026-02-10", amount: 4500, cheque_number: "CHQ-8899" },
    { id: "rv-2", voucher_number: "RV-102", voucher_date: "2026-02-20", amount: 1500 },
  ];
  const pays = [
    // Duplicate of rv-1 via voucher reference number
    { id: "pay-1", payment_number: "PAY-001", reference_number: "RV-101", payment_date: "2026-02-10", amount: 4500 },
    // Duplicate of rv-1 via cheque number
    { id: "pay-2", payment_number: "PAY-002", reference_number: "CHQ-8899", payment_date: "2026-02-10", amount: 4500 },
    // Duplicate of rv-2 via date and amount
    { id: "pay-3", payment_number: "PAY-003", reference_number: "RV-102 payment", payment_date: "2026-02-20", amount: 1500 },
    // Legitimate standalone payment
    { id: "pay-4", payment_number: "PAY-004", reference_number: "TRF-9900", payment_date: "2026-02-25", amount: 3000 },
  ];

  const dedupedCredits = deduplicateCredits(rcvs, pays);
  assert.equal(dedupedCredits.length, 3, "Only rv-1, rv-2, and pay-4 should be retained (no duplicates)");
  const totalCredits = dedupedCredits.reduce((s, c) => s + c.credit, 0);
  assert.equal(totalCredits, 4500 + 1500 + 3000, "Total credits must not double-count duplicate receipts");
  console.log("✓ TEST 4 Passed: Credit deduplication successfully prevents double counting.");
}

// TEST 5: Debits sorted before credits on the same calendar day
{
  const rawTxs: RawTx[] = [
    { id: "1", date: "2026-04-10", reference_no: "RV-001", original_reference: "RV-001", debit: 0, credit: 500, type: "receipt_voucher" },
    { id: "2", date: "2026-04-10", reference_no: "INV-001", original_reference: "INV-001", debit: 500, credit: 0, type: "invoice" },
  ];
  const res = calculateStatement(0, null, null, rawTxs);
  assert.equal(res.entries[0].reference_no, "INV-001", "Debit invoice must be sequenced before credit on same day");
  assert.equal(res.entries[1].reference_no, "RV-001", "Credit payment must follow invoice on same day");
  console.log("✓ TEST 5 Passed: Chronological ordering ensures debits precede credits on same date.");
}

console.log("\nALL CUSTOMER STATEMENT VERIFICATION TESTS PASSED SUCCESSFULLY! ✓");
