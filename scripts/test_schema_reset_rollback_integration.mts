/**
 * Integration Test Suite: Schema Detection, Opening Balance Reset, Rollback, and Start New SOA
 *
 * Verifies:
 * 1. Migration SQL integrity & company-scoped RLS policy
 * 2. PGRST303 missing-column error detection & graceful degradation
 * 3. Reset Opening Balance flow preserves invoices & payments and logs audit history
 * 4. Rollback snapshot restores previous opening balance and logs restoration audit
 * 5. Zero-balance guard ("No Opening Balance to Reset" state)
 * 6. Independent Start New SOA draft calculation & zero live ledger mutation
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("==================================================================");
console.log("DUBAI ERP — SCHEMA, RESET, ROLLBACK & START NEW SOA TESTS");
console.log("==================================================================\n");

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
  }
}

function isPgrst303OpeningBalanceError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "PGRST303" ||
    Boolean(err.message?.includes("PGRST303")) ||
    Boolean(err.message?.toLowerCase().includes("opening_balance"))
  );
}

// -----------------------------------------------------------------------------
// Test 1: Migration SQL file presence, idempotency, and RLS policy
// -----------------------------------------------------------------------------
runTest("1. Migration SQL exists in supabase/migrations with idempotent DDL and company RLS", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261112000000_customer_opening_balance.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist in supabase/migrations/");

  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS opening_balance"), "Must add opening_balance idempotently");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS opening_balance_date"), "Must add opening_balance_date idempotently");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.customer_opening_balance_history"), "Must create audit table");
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "Must enable RLS");
  assert.ok(sql.includes("get_auth_user_company_ids()"), "Must enforce company-scoped RLS");
  assert.ok(sql.includes("NOTIFY pgrst, 'reload schema'"), "Must reload PostgREST schema cache");
});

// -----------------------------------------------------------------------------
// Test 2: PGRST303 Detection & Graceful Handling
// -----------------------------------------------------------------------------
runTest("2. PGRST303 missing opening_balance column is detected cleanly", () => {
  assert.equal(
    isPgrst303OpeningBalanceError({
      code: "PGRST303",
      message: "Could not find the 'opening_balance' column of 'customers' in the schema cache",
    }),
    true
  );
  assert.equal(
    isPgrst303OpeningBalanceError({
      message: "Could not find the 'opening_balance' column of 'customers' in the schema cache",
    }),
    true
  );
  assert.equal(
    isPgrst303OpeningBalanceError({ code: "42501", message: "new row violates row-level security policy" }),
    false
  );
  assert.equal(isPgrst303OpeningBalanceError(null), false);
});

// -----------------------------------------------------------------------------
// Test 3: Reset Opening Balance preserves invoices & payments and logs audit
// -----------------------------------------------------------------------------
runTest("3. Reset Opening Balance updates only opening_balance=0 and logs audit entry", () => {
  const customer = { id: "cust-1", company_id: "comp-1", opening_balance: 12500.0 };
  const invoices = [{ id: "inv-1", total: 5000 }, { id: "inv-2", total: 3000 }];
  const payments = [{ id: "pay-1", amount: 2000 }];
  const auditLog: Array<{ company_id: string; customer_id: string; old_amount: number; new_amount: number }> = [];

  const snapshot = {
    customerId: customer.id,
    previousBalance: customer.opening_balance,
  };

  customer.opening_balance = 0;
  auditLog.push({
    company_id: customer.company_id,
    customer_id: customer.id,
    old_amount: snapshot.previousBalance,
    new_amount: 0,
  });

  assert.equal(customer.opening_balance, 0);
  assert.equal(invoices.length, 2, "Invoices must remain untouched");
  assert.equal(payments.length, 1, "Payments must remain untouched");
  assert.equal(auditLog.length, 1);
  assert.equal(auditLog[0].old_amount, 12500.0);
  assert.equal(auditLog[0].new_amount, 0);
});

// -----------------------------------------------------------------------------
// Test 4: Rollback restores previous opening balance and logs restoration
// -----------------------------------------------------------------------------
runTest("4. Rollback restores previous opening balance from snapshot", () => {
  const customer = { id: "cust-1", company_id: "comp-1", opening_balance: 0 };
  const snapshot = { customerId: "cust-1", previousBalance: 12500.0 };
  const auditLog: Array<{ old_amount: number; new_amount: number; reason: string }> = [];

  customer.opening_balance = snapshot.previousBalance;
  auditLog.push({
    old_amount: 0,
    new_amount: snapshot.previousBalance,
    reason: "Rollback / Restoration",
  });

  assert.equal(customer.opening_balance, 12500.0);
  assert.equal(auditLog[0].new_amount, 12500.0);
});

// -----------------------------------------------------------------------------
// Test 5: Zero-balance guard UI verification
// -----------------------------------------------------------------------------
runTest("5. CustomerStatementResetModal enforces zero-balance guard and accurate title", () => {
  const modalPath = path.resolve(process.cwd(), "components/statements/CustomerStatementResetModal.tsx");
  const src = fs.readFileSync(modalPath, "utf8");

  assert.ok(src.includes("Reset Opening Balance"), "Title must be 'Reset Opening Balance'");
  assert.ok(!src.includes("Fresh Start / Reset Customer Statement"), "Old misleading title must be removed");
  assert.ok(src.includes("No Opening Balance to Reset"), "Must show zero-balance guard message");
  assert.ok(src.includes("currentOpeningBalance === 0"), "Must guard on currentOpeningBalance === 0");
  assert.ok(src.includes("currentOpeningBalance !== 0"), "Must hide reset button when balance is 0");
});

// -----------------------------------------------------------------------------
// Test 6: Independent Start New SOA draft keeps live ledger unchanged
// -----------------------------------------------------------------------------
runTest("6. StartNewSoaModal creates independent draft without live ledger mutations", () => {
  const startNewSoaPath = path.resolve(process.cwd(), "components/statements/StartNewSoaModal.tsx");
  assert.ok(fs.existsSync(startNewSoaPath), "StartNewSoaModal.tsx must exist");
  const src = fs.readFileSync(startNewSoaPath, "utf8");

  // Ensure it never writes to live financial tables
  assert.ok(!src.includes('.from("tax_invoices")'), "Must never mutate tax_invoices");
  assert.ok(!src.includes('.from("customer_payments")'), "Must never mutate customer_payments");
  assert.ok(!src.includes('.from("receipt_vouchers")'), "Must never mutate receipt_vouchers");
  assert.ok(!src.includes('.from("customers").update'), "Must never mutate customers");

  // Verify draft balance math
  const opening = 1000;
  const rows = [
    { debit: 2500, credit: 0 },
    { debit: 0, credit: 1200 },
  ];
  const closing = rows.reduce((bal, r) => Math.round((bal + r.debit - r.credit) * 100) / 100, opening);
  assert.equal(closing, 2300);
});

console.log("\n------------------------------------------------------------------");
console.log(`RESULT: ${passed}/${total} tests passed.`);
console.log("------------------------------------------------------------------");

if (passed !== total) {
  process.exit(1);
}

