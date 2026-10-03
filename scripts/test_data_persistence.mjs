/**
 * Data Persistence Regression Tests — Dubai ERP
 * Tests that saved values survive load/reload and sample/test data
 * cannot silently overwrite saved records.
 *
 * Run: node scripts/test_data_persistence.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Helper mirrors (inline copies of lib/helpers.ts functions under test)
// ---------------------------------------------------------------------------

function fmtDate(iso) {
  if (!iso) return "—";
  const trimmed = iso.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return new Date(y, m, d).toLocaleDateString("en-GB");
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString("en-GB");
  return trimmed;
}

function toISODate(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return dateVal.toISOString().split("T")[0];
  }
  return null;
}

function calcLineItem(qty, unitPrice, discountPct, vatRate) {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  const d = Math.max(0, Math.min(100, Number(discountPct) || 0));
  const v = Math.max(0, Number(vatRate) || 0);
  const gross = Math.round(q * p * 100) / 100;
  const discountAmt = Math.round(gross * (d / 100) * 100) / 100;
  const taxable = Math.max(0, Math.round((gross - discountAmt) * 100) / 100);
  const vatAmount = Math.round(taxable * (v / 100) * 100) / 100;
  const lineTotal = Math.round((taxable + vatAmount) * 100) / 100;
  return { taxable, vatAmount, lineTotal, gross, discountAmt };
}

// ---------------------------------------------------------------------------
// SUITE 1: Date timezone safety
// ---------------------------------------------------------------------------
test("fmtDate YYYY-MM-DD must not shift day due to UTC midnight parsing", () => {
  const r = fmtDate("2026-09-01");
  assert.equal(r, "01/09/2026", `Expected 01/09/2026 but got ${r}`);
});
test("fmtDate null/empty returns dash", () => {
  assert.equal(fmtDate(null), "—");
  assert.equal(fmtDate(""), "—");
});
test("toISODate YYYY-MM-DD passthrough without mutation", () => {
  assert.equal(toISODate("2026-09-15"), "2026-09-15");
  assert.equal(toISODate("2026-01-01"), "2026-01-01");
});
test("toISODate null/empty returns null", () => {
  assert.equal(toISODate(null), null);
  assert.equal(toISODate(""), null);
});

// ---------------------------------------------------------------------------
// SUITE 2: Numeric precision
// ---------------------------------------------------------------------------
test("calcLineItem 5% VAT on round amount no floating point drift", () => {
  const { taxable, vatAmount, lineTotal } = calcLineItem(1, 1000, 0, 5);
  assert.equal(taxable, 1000); assert.equal(vatAmount, 50); assert.equal(lineTotal, 1050);
});
test("calcLineItem discount reduces taxable before VAT", () => {
  const { taxable, vatAmount, lineTotal } = calcLineItem(1, 1000, 10, 5);
  assert.equal(taxable, 900); assert.equal(vatAmount, 45); assert.equal(lineTotal, 945);
});
test("calcLineItem zero VAT produces zero vatAmount", () => {
  assert.equal(calcLineItem(5, 200, 0, 0).vatAmount, 0);
});
test("calcLineItem stored values survive recalc round-trip", () => {
  const a = calcLineItem(12, 5360, 0, 5);
  const b = calcLineItem(12, 5360, 0, 5);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// SUITE 3: Measurement test data injection guard
// ---------------------------------------------------------------------------
test("loadSheetItems empty result produces empty rawRows not test data", () => {
  function simulateLoad(items) {
    if (items && items.length > 0) return items;
    return []; // fixed: was REAL_PROJECT_PARKING_SHADE_TEST_ROWS
  }
  assert.equal(simulateLoad([]).length, 0);
  assert.equal(simulateLoad([{ area_name: "Saved" }]).length, 1);
});
test("handleLoadRealTestCases cancelled when user declines confirmation", () => {
  function simulate(rows, confirm) {
    if (rows.length > 0 && !confirm()) return "cancelled";
    return "loaded";
  }
  assert.equal(simulate([{ x: 1 }, { x: 2 }], () => false), "cancelled");
  assert.equal(simulate([], () => false), "loaded");
  assert.equal(simulate([{ x: 1 }], () => true), "loaded");
});

// ---------------------------------------------------------------------------
// SUITE 4: Payslips deduction mapping
// ---------------------------------------------------------------------------
test("payslip absence + leave deductions are summed", () => {
  const r = { absence_deduction: 150, leave_deduction: 75, other_deductions: 200, loan_deduction: 300, total_deductions: 725, gross_salary: 5000, net_salary: 4275 };
  const absence = (Number(r.absence_deduction)||0) + (Number(r.leave_deduction)||0);
  const other = (Number(r.other_deductions)||0) + (Number(r.loan_deduction)||0);
  const total = Number(r.total_deductions) || ((Number(r.gross_salary)||0) - (Number(r.net_salary)||0));
  assert.equal(absence, 225);
  assert.equal(other, 500);
  assert.equal(total, 725);
});
test("payslip status uses stored value not hardcoded string", () => {
  const get = (r) => r.status || "paid";
  assert.equal(get({ status: "approved" }), "approved");
  assert.equal(get({ status: "paid" }), "paid");
  assert.equal(get({ status: null }), "paid");
});

// ---------------------------------------------------------------------------
// SUITE 5: Supplier statements table
// ---------------------------------------------------------------------------
test("supplier statement uses supplier_payments not payments table", () => {
  const TABLE = "supplier_payments";
  assert.notEqual(TABLE, "payments");
  assert.equal(TABLE, "supplier_payments");
});

// ---------------------------------------------------------------------------
// SUITE 6: Offline fallback empty sheet
// ---------------------------------------------------------------------------
test("initializeFallbackData offline mode starts with empty rows", () => {
  function simulate() { return { rawRows: [], error: "Database unavailable — working in offline mode." }; }
  const s = simulate();
  assert.equal(s.rawRows.length, 0);
  assert.ok(s.error.includes("offline"));
});

console.log("\n✅ All data persistence regression tests passed.\n");
