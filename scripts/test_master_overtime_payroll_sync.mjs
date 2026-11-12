import assert from "assert";

const {
  calculateOvertimeCharge,
  calculateAuthoritativeMonthlyOvertime,
  calculateCompletePayrollBreakdown,
  DEFAULT_PAYROLL_RULES,
  DEFAULT_MONTHLY_ADJUSTMENT,
} = await import("../lib/payrollWorkflowService.ts");

console.log("================================================================================");
console.log("   MASTER TEST SUITE: OVERTIME, PAYROLL & SALARY STATEMENT SYNCHRONIZATION      ");
console.log("================================================================================");

// -----------------------------------------------------------------------------
// TEST 1: Exact Decimal Overtime Precision (NO INTEGER TRUNCATION)
// -----------------------------------------------------------------------------
console.log("\n[Test 1] Exact Decimal Precision (19.5 hrs @ AED 7.50 = AED 146.25):");

const imranCalc = calculateOvertimeCharge(1500, 19.5, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "hourly_rate",
  overtime_rate: 7.5,
}, DEFAULT_PAYROLL_RULES);

console.log(`  Imran Khan: 19.5 hrs * AED 7.50 = AED ${imranCalc.totalCharge} (${imranCalc.explanation})`);
assert.strictEqual(imranCalc.totalCharge, 146.25, "19.5 hrs * 7.50 MUST be exactly 146.25 (not 146.00)");
assert.notStrictEqual(imranCalc.totalCharge, 146, "19.5 hrs * 7.50 must NOT truncate to 146");

const iftikharCalc = calculateOvertimeCharge(1500, 9.0, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "hourly_rate",
  overtime_rate: 7.5,
}, DEFAULT_PAYROLL_RULES);
console.log(`  Iftikhar Ahmed: 9.0 hrs * AED 7.50 = AED ${iftikharCalc.totalCharge}`);
assert.strictEqual(iftikharCalc.totalCharge, 67.5);

const kalamudinCalc = calculateOvertimeCharge(1500, 7.0, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "hourly_rate",
  overtime_rate: 7.5,
}, DEFAULT_PAYROLL_RULES);
console.log(`  Kalamudin Ansari: 7.0 hrs * AED 7.50 = AED ${kalamudinCalc.totalCharge}`);
assert.strictEqual(kalamudinCalc.totalCharge, 52.5);

// Fractional quarter hour: 9.25 hrs * 12.33 = 114.0525 -> 114.05
const fractionalCalc = calculateOvertimeCharge(2000, 9.25, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "hourly_rate",
  overtime_rate: 12.33,
}, DEFAULT_PAYROLL_RULES);
console.log(`  Fractional: 9.25 hrs * AED 12.33 = AED ${fractionalCalc.totalCharge}`);
assert.strictEqual(fractionalCalc.totalCharge, 114.05);

console.log("  PASS: Exact decimal monetary precision verified.");

// -----------------------------------------------------------------------------
// TEST 2: Authoritative Monthly Overtime Calculation Engine
// -----------------------------------------------------------------------------
console.log("\n[Test 2] Authoritative Monthly Overtime Engine (Cross-Screen Consistency):");

// Scenario A: Standard Hourly Rate (Method = "hourly_rate")
const authHourly = calculateAuthoritativeMonthlyOvertime({
  rawHours: 19.5,
  employee: { id: "emp-1", basic_salary: 1500, overtime_rate: 7.5, overtime_costing_method: "hourly_rate" },
  periodYear: 2026,
  periodMonth: 11,
});

assert.strictEqual(authHourly.effectiveHours, 19.5);
assert.strictEqual(authHourly.rate, 7.5);
assert.strictEqual(authHourly.amount, 146.25);
assert.strictEqual(authHourly.method, "hourly_rate");
console.log(`  Scenario A (Hourly Rate): ${authHourly.effectiveHours} hrs @ AED ${authHourly.rate} = AED ${authHourly.amount} [${authHourly.method}]`);

// Scenario B: Fixed Amount (Method = "manual_fixed")
const authFixed = calculateAuthoritativeMonthlyOvertime({
  rawHours: 19.5,
  adjustment: {
    ...DEFAULT_MONTHLY_ADJUSTMENT,
    overtime_costing_method: "manual_fixed",
    overtime_manual_amount: 200,
  },
  employee: { id: "emp-2", basic_salary: 1500, overtime_rate: 7.5 },
  periodYear: 2026,
  periodMonth: 11,
});

assert.strictEqual(authFixed.effectiveHours, 19.5);
assert.strictEqual(authFixed.amount, 200);
assert.strictEqual(authFixed.method, "manual_fixed");
console.log(`  Scenario B (Fixed Amount): ${authFixed.effectiveHours} hrs -> AED ${authFixed.amount} [${authFixed.method}]`);

// Scenario C: Zero Overtime Hours
const authZero = calculateAuthoritativeMonthlyOvertime({
  rawHours: 0,
  employee: { id: "emp-3", basic_salary: 1500, overtime_rate: 7.5, overtime_costing_method: "hourly_rate" },
  periodYear: 2026,
  periodMonth: 11,
});
assert.strictEqual(authZero.effectiveHours, 0);
assert.strictEqual(authZero.amount, 0);
console.log(`  Scenario C (Zero Hours): ${authZero.effectiveHours} hrs -> AED ${authZero.amount}`);

// Scenario D: Adjustments offset
const authWithOffset = calculateAuthoritativeMonthlyOvertime({
  rawHours: 19.5,
  adjustment: {
    ...DEFAULT_MONTHLY_ADJUSTMENT,
    overtime_costing_method: "hourly_rate",
    overtime_rate: 7.5,
    overtime_hours_adjustment: 2.0, // +2 hours adjustment
  },
  employee: { id: "emp-1", basic_salary: 1500, overtime_rate: 7.5 },
  periodYear: 2026,
  periodMonth: 11,
});
assert.strictEqual(authWithOffset.effectiveHours, 21.5);
assert.strictEqual(authWithOffset.amount, 161.25);
console.log(`  Scenario D (With +2 hrs offset): 19.5 + 2 = ${authWithOffset.effectiveHours} hrs @ AED 7.50 = AED ${authWithOffset.amount}`);

console.log("  PASS: Authoritative engine handles all costing methods and adjustments.");

// -----------------------------------------------------------------------------
// TEST 3: Complete Payroll Breakdown with Exact Cents
// -----------------------------------------------------------------------------
console.log("\n[Test 3] Complete Itemized Payroll Breakdown with Cents:");

const fullBreakdown = calculateCompletePayrollBreakdown({
  basicSalary: 1500,
  housingAllowance: 300,
  transportAllowance: 150,
  otherAllowances: 0,
  payableDays: 30,
  standardDays: 30,
  overtimeCharge: 146.25,
  advanceDeduction: 0,
  otherDeductions: 0,
});

console.log(`  Basic Salary: AED ${fullBreakdown.basicSalary}`);
console.log(`  Allowances: AED ${fullBreakdown.totalAllowances}`);
console.log(`  Overtime Charge: AED ${fullBreakdown.overtimeCharge}`);
console.log(`  Gross Salary: AED ${fullBreakdown.grossSalary}`);
console.log(`  Net Salary: AED ${fullBreakdown.netSalary}`);

assert.strictEqual(fullBreakdown.overtimeCharge, 146.25);
assert.strictEqual(fullBreakdown.netSalary, 1500 + 300 + 150 + 146.25); // 2096.25
console.log("  PASS: Full breakdown preserves exact cents in net salary.");

// -----------------------------------------------------------------------------
// TEST 4: Date Normalization & Multi-Entry Summing Simulation
// -----------------------------------------------------------------------------
console.log("\n[Test 4] Date Normalization & Multiple Entry Accumulation:");

const rawDbRecords = [
  { employee_id: "e1", overtime_date: "2026-11-05T00:00:00.000Z", hours: 2.5 },
  { employee_id: "e1", overtime_date: "2026-11-05", hours: 3.0 }, // Same day second shift
  { employee_id: "e1", overtime_date: "2026-11-06T12:30:00Z", hours: 4.0 },
];

const oMap = {};
for (const r of rawDbRecords) {
  const normDate = String(r.overtime_date).split("T")[0];
  const key = `${r.employee_id}_${normDate}`;
  const hrs = Number(r.hours) || 0;
  if (!oMap[key]) {
    oMap[key] = { hours: hrs };
  } else {
    oMap[key].hours += hrs;
  }
}

assert.strictEqual(oMap["e1_2026-11-05"].hours, 5.5, "Two entries on 2026-11-05 must sum to 5.5 hrs");
assert.strictEqual(oMap["e1_2026-11-06"].hours, 4.0, "Entry on 2026-11-06 must be 4.0 hrs");
console.log("  2026-11-05 accumulated hours:", oMap["e1_2026-11-05"].hours);
console.log("  2026-11-06 accumulated hours:", oMap["e1_2026-11-06"].hours);
console.log("  PASS: Multiple overtime records per day sum correctly without overwriting.");

console.log("\n================================================================================");
console.log("   ALL OVERTIME & PAYROLL SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!          ");
console.log("================================================================================");
