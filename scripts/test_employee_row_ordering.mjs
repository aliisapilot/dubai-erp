import {
  parseEmployeeNumber,
  compareEmployeeCodes,
  compareEmployees,
  compareSalaryStatements
} from "../lib/helpers.js";

console.log("=== RUNNING REGRESSION TESTS FOR EMPLOYEE ROW ORDERING ===\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Test parseEmployeeNumber
console.log("--- 1. Testing parseEmployeeNumber ---");
assert(parseEmployeeNumber("EMP-01") === 1, "EMP-01 -> 1");
assert(parseEmployeeNumber("EMP-02") === 2, "EMP-02 -> 2");
assert(parseEmployeeNumber("EMP-09") === 9, "EMP-09 -> 9");
assert(parseEmployeeNumber("EMP-10") === 10, "EMP-10 -> 10");
assert(parseEmployeeNumber("EMP-100") === 100, "EMP-100 -> 100");
assert(parseEmployeeNumber("05") === 5, "05 -> 5");
assert(parseEmployeeNumber("E-3") === 3, "E-3 -> 3");
assert(parseEmployeeNumber("") === Infinity, "empty string -> Infinity");
assert(parseEmployeeNumber(null) === Infinity, "null -> Infinity");

// 2. Test compareEmployeeCodes (EMP-01 through EMP-10)
console.log("\n--- 2. Testing compareEmployeeCodes ---");
assert(compareEmployeeCodes("EMP-01", "EMP-02") < 0, "EMP-01 < EMP-02");
assert(compareEmployeeCodes("EMP-02", "EMP-03") < 0, "EMP-02 < EMP-03");
assert(compareEmployeeCodes("EMP-09", "EMP-10") < 0, "EMP-09 < EMP-10");
assert(compareEmployeeCodes("EMP-10", "EMP-02") > 0, "EMP-10 > EMP-02 (numerical, not alphabetical)");
assert(compareEmployeeCodes("EMP-01", "EMP-01") === 0, "EMP-01 === EMP-01");

// 3. Test sorting array of employees 1..10 in reverse or shuffled order
console.log("\n--- 3. Testing compareEmployees with shuffled EMP-01..EMP-10 ---");
const employees = [
  { id: "e10", employee_number: "EMP-10", first_name: "Tenth" },
  { id: "e3", employee_number: "EMP-03", first_name: "Third" },
  { id: "e1", employee_number: "EMP-01", first_name: "First" },
  { id: "e7", employee_number: "EMP-07", first_name: "Seventh" },
  { id: "e2", employee_number: "EMP-02", first_name: "Second" },
  { id: "e5", employee_number: "EMP-05", first_name: "Fifth" },
  { id: "e8", employee_number: "EMP-08", first_name: "Eighth" },
  { id: "e4", employee_number: "EMP-04", first_name: "Fourth" },
  { id: "e9", employee_number: "EMP-09", first_name: "Ninth" },
  { id: "e6", employee_number: "EMP-06", first_name: "Sixth" },
];

const sortedEmps = [...employees].sort(compareEmployees);
const sortedCodes = sortedEmps.map(e => e.employee_number);
const expectedCodes = [
  "EMP-01", "EMP-02", "EMP-03", "EMP-04", "EMP-05",
  "EMP-06", "EMP-07", "EMP-08", "EMP-09", "EMP-10"
];
assert(
  JSON.stringify(sortedCodes) === JSON.stringify(expectedCodes),
  `Shuffled employees sort to: ${sortedCodes.join(", ")}`
);

// 4. Test compareSalaryStatements within a single month
console.log("\n--- 4. Testing compareSalaryStatements within single month ---");
const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

// Simulate database return where EMP-01 and EMP-02 were updated and are returned at the end (Postgres MVCC behavior)
const statementsSingleMonth = [
  { id: "s3", employee_id: "e3", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s4", employee_id: "e4", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s5", employee_id: "e5", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s6", employee_id: "e6", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s7", employee_id: "e7", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s8", employee_id: "e8", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s9", employee_id: "e9", payroll_month: "2026-10-01", net_salary: 1000 },
  { id: "s10", employee_id: "e10", payroll_month: "2026-10-01", net_salary: 1000 },
  // EMP-01 and EMP-02 at the bottom as reported by the user!
  { id: "s1", employee_id: "e1", payroll_month: "2026-10-01", net_salary: 1200 },
  { id: "s2", employee_id: "e2", payroll_month: "2026-10-01", net_salary: 1500 },
];

const sortedStatements = [...statementsSingleMonth].sort((a, b) => compareSalaryStatements(a, b, empMap));
const sortedStmtEmpCodes = sortedStatements.map(s => empMap[s.employee_id].employee_number);

assert(
  JSON.stringify(sortedStmtEmpCodes) === JSON.stringify(expectedCodes),
  `Single month statement sort places EMP-01 and EMP-02 back at top: ${sortedStmtEmpCodes.join(", ")}`
);

// 5. Test editing simulation: Edit EMP-01 and EMP-02, push to bottom of array, re-sort
console.log("\n--- 5. Testing edit simulation for EMP-01 and EMP-02 ---");
// Simulate updating EMP-01 with new salary
const updatedList = sortedStatements.filter(s => s.id !== "s1");
updatedList.push({ id: "s1", employee_id: "e1", payroll_month: "2026-10-01", net_salary: 1999 }); // simulated push to end

// Re-apply sorting as done in page component loadAll and filtered useMemo
const reSortedList = [...updatedList].sort((a, b) => compareSalaryStatements(a, b, empMap));
const reSortedCodes = reSortedList.map(s => empMap[s.employee_id].employee_number);

assert(
  JSON.stringify(reSortedCodes) === JSON.stringify(expectedCodes),
  `After editing EMP-01, ordering remains strictly EMP-01..EMP-10: ${reSortedCodes.join(", ")}`
);
assert(reSortedList[0].net_salary === 1999, "EMP-01 preserves updated net_salary of 1999 at position 1");

// Now simulate updating EMP-02
const updatedList2 = reSortedList.filter(s => s.id !== "s2");
updatedList2.push({ id: "s2", employee_id: "e2", payroll_month: "2026-10-01", net_salary: 2500 });
const reSortedList2 = [...updatedList2].sort((a, b) => compareSalaryStatements(a, b, empMap));
const reSortedCodes2 = reSortedList2.map(s => empMap[s.employee_id].employee_number);

assert(
  JSON.stringify(reSortedCodes2) === JSON.stringify(expectedCodes),
  `After editing EMP-02, ordering remains strictly EMP-01..EMP-10: ${reSortedCodes2.join(", ")}`
);
assert(reSortedList2[1].net_salary === 2500, "EMP-02 preserves updated net_salary of 2500 at position 2");

// 6. Test Multi-Month Ordering: Newest month first, then EMP-01..EMP-10
console.log("\n--- 6. Testing Multi-Month Ordering ---");
const multiMonthStatements = [
  // September statements
  { id: "s_sep_10", employee_id: "e10", payroll_month: "2026-09-01" },
  { id: "s_sep_1", employee_id: "e1", payroll_month: "2026-09-01" },
  { id: "s_sep_2", employee_id: "e2", payroll_month: "2026-09-01" },
  // October statements
  { id: "s_oct_2", employee_id: "e2", payroll_month: "2026-10-01" },
  { id: "s_oct_10", employee_id: "e10", payroll_month: "2026-10-01" },
  { id: "s_oct_1", employee_id: "e1", payroll_month: "2026-10-01" },
];

const sortedMultiMonth = [...multiMonthStatements].sort((a, b) => compareSalaryStatements(a, b, empMap));
const multiMonthResult = sortedMultiMonth.map(s => `${s.payroll_month.slice(0, 7)}_${empMap[s.employee_id].employee_number}`);
const expectedMultiMonth = [
  "2026-10_EMP-01",
  "2026-10_EMP-02",
  "2026-10_EMP-10",
  "2026-09_EMP-01",
  "2026-09_EMP-02",
  "2026-09_EMP-10",
];

assert(
  JSON.stringify(multiMonthResult) === JSON.stringify(expectedMultiMonth),
  `Multi-month sort orders newest month first, then employee number ascending: ${multiMonthResult.join(", ")}`
);

// Summary
console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
