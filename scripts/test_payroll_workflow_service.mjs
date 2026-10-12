import fs from "fs";
const envContent = fs.readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
}

import assert from "assert";
const {
  calculateAttendanceTotals,
  calculateOvertimeCharge,
  calculateCompletePayrollBreakdown,
  DEFAULT_PAYROLL_RULES,
  DEFAULT_MONTHLY_ADJUSTMENT,
} = await import("../lib/payrollWorkflowService");

console.log("=== TESTING PAYROLL WORKFLOW SERVICE ===");

// 1. Attendance & Payable Days Calculation Test
console.log("\n1. Testing Attendance & Payable Days:");
// Scenario: 22 Present, 2 Half Day (HD), 2 Absent, 4 Sunday holidays in 30 days
const statuses = [
  ...Array(22).fill("present"),
  ...Array(2).fill("late"), // HD
  ...Array(2).fill("absent"),
  ...Array(4).fill("holiday"),
];
const attRes = calculateAttendanceTotals(statuses, 30, 30, { presentAdj: 1, payableAdj: 0 });
// Actual Present = 22 + (2 * 0.5) + 1 (adj) = 24 days
assert.equal(attRes.actualAttendanceDays, 24);
// Payable Days = 30 - 2 (absent) - (2 * 0.5) (half day) = 27 days
assert.equal(attRes.payableDays, 27);
console.log("  ✓ Actual attendance (24d) strictly separated from payable days (27d)");

// 2. Overtime Costing Methods Test
console.log("\n2. Testing 3 Overtime Costing Methods (Strictly Mutually Exclusive):");
const basicSalary = 2400; // 2400 / 30 / 8 = 10 AED/hr base. With 1.25 = 12.50 AED/hr.
const otHours = 20;

// Method A: Auto UAE
const otAuto = calculateOvertimeCharge(basicSalary, otHours, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "auto",
}, DEFAULT_PAYROLL_RULES);
assert.equal(otAuto.hourlyRate, 12.5);
assert.equal(otAuto.totalCharge, 250); // 20 * 12.5 = 250
console.log("  ✓ Method A (Auto UAE):", otAuto.explanation, "-> AED", otAuto.totalCharge);

// Method B: Manual Hourly Rate
const otHourly = calculateOvertimeCharge(basicSalary, otHours, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "hourly_rate",
  overtime_rate: 20, // 20 AED/hr
}, DEFAULT_PAYROLL_RULES);
assert.equal(otHourly.hourlyRate, 20);
assert.equal(otHourly.totalCharge, 400); // 20 * 20 = 400
console.log("  ✓ Method B (Manual Hourly Rate):", otHourly.explanation, "-> AED", otHourly.totalCharge);

// Method C: Manual Flat Charge
const otFixed = calculateOvertimeCharge(basicSalary, otHours, {
  ...DEFAULT_MONTHLY_ADJUSTMENT,
  overtime_costing_method: "manual_fixed",
  overtime_manual_amount: 550, // User directly entered 550 AED
}, DEFAULT_PAYROLL_RULES);
assert.equal(otFixed.totalCharge, 550);
console.log("  ✓ Method C (Manual Total Charge):", otFixed.explanation, "-> AED", otFixed.totalCharge);

// 3. Complete Itemized Payroll Breakdown Test
console.log("\n3. Testing Complete Payroll Breakdown:");
const breakdown = calculateCompletePayrollBreakdown({
  basicSalary: 2400,
  housingAllowance: 600,
  transportAllowance: 300,
  otherAllowances: 100,
  payableDays: 27, // 3 days unpaid absence out of 30
  standardDays: 30,
  overtimeCharge: 400,
  advanceDeduction: 200,
  otherDeductions: 50,
});

// Basic: 2400
// Total Allowances: 1000 (600 + 300 + 100)
// Overtime: 400
// Absence deduction: (2400 / 30) * 3 = 240
// Advance deduction: 200
// Other deductions: 50
// Total deductions: 240 + 200 + 50 = 490
// Gross: 2400 + 1000 + 400 = 3800
// Net: 3800 - 490 = 3310
assert.equal(breakdown.basicSalary, 2400);
assert.equal(breakdown.totalAllowances, 1000);
assert.equal(breakdown.overtimeCharge, 400);
assert.equal(breakdown.absenceDeduction, 240);
assert.equal(breakdown.totalDeductions, 490);
assert.equal(breakdown.grossSalary, 3800);
assert.equal(breakdown.netSalary, 3310);
console.log("  ✓ Gross:", breakdown.grossSalary, "Deductions:", breakdown.totalDeductions, "Net Salary:", breakdown.netSalary);

console.log("\n=== ALL PAYROLL WORKFLOW TESTS PASSED 100%! ===");
