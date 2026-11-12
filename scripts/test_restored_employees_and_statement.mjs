import fs from "fs";
import assert from "assert";

const envContent = fs.readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const session = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf-8"));
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
});

console.log("================================================================================");
console.log("VERIFYING RESTORATION OF EMPLOYEES, ATTENDANCE, OVERTIME & STATEMENTS");
console.log("================================================================================");

// 1. Verify MonthlyAttendanceOvertimeSheet employee query
const startDate = "2026-11-01";
const endDate = "2026-11-30";

const [empsRes, attRes, otRes] = await Promise.all([
  supabase
    .from("employees")
    .select("id, employee_number, first_name, designation, department, bank_name, account_number, iban, basic_salary, status")
    .in("status", ["active", "Active"])
    .order("employee_number"),
  supabase.from("attendance").select("*").gte("attendance_date", startDate).lte("attendance_date", endDate),
  supabase.from("overtime").select("*").gte("overtime_date", startDate).lte("overtime_date", endDate),
]);

assert.equal(empsRes.error, null, `Employees query error: ${empsRes.error?.message}`);
assert.equal(attRes.error, null, `Attendance query error: ${attRes.error?.message}`);
assert.equal(otRes.error, null, `Overtime query error: ${otRes.error?.message}`);

console.log(`✓ Attendance Query: ${empsRes.data.length} active employees returned.`);
assert.equal(empsRes.data.length, 8, "Expected exactly 8 active employees");

console.log(`✓ Attendance Records (Nov 2026): ${attRes.data.length} records.`);
assert.equal(attRes.data.length, 76, "Expected 76 attendance records in Nov 2026");

console.log(`✓ Overtime Records (Nov 2026): ${otRes.data.length} records.`);
assert.equal(otRes.data.length, 15, "Expected 15 overtime records in Nov 2026");

const totalOtHours = otRes.data.reduce((s, r) => s + (Number(r.hours) || 0), 0);
console.log(`✓ Total Overtime Hours (Nov 2026): ${totalOtHours.toFixed(1)} hrs.`);
assert.equal(totalOtHours, 37.0, "Expected exactly 37.0 overtime hours in Nov 2026");

// 2. Verify Payroll Summary Query
const [ssRes, psEmpsRes, psAttRes, psOtRes] = await Promise.all([
  supabase
    .from("salary_statements")
    .select("*")
    .gte("payroll_month", startDate)
    .lte("payroll_month", endDate),
  supabase
    .from("employees")
    .select("id, first_name, employee_number, designation, basic_salary")
    .order("first_name"),
  supabase
    .from("attendance")
    .select("employee_id, status, attendance_date, overtime_hours")
    .gte("attendance_date", startDate)
    .lte("attendance_date", endDate),
  supabase
    .from("overtime")
    .select("employee_id, hours, approval_status, overtime_date")
    .gte("overtime_date", startDate)
    .lte("overtime_date", endDate),
]);

assert.equal(ssRes.error, null, `Salary statements error: ${ssRes.error?.message}`);
assert.equal(psEmpsRes.error, null, `Payroll summary employees error: ${psEmpsRes.error?.message}`);
assert.equal(psAttRes.error, null, `Payroll summary attendance error: ${psAttRes.error?.message}`);
assert.equal(psOtRes.error, null, `Payroll summary overtime error: ${psOtRes.error?.message}`);
console.log(`✓ Payroll Summary Query: Successfully loaded ${psEmpsRes.data.length} employees without schema errors.`);

// 3. Verify Customer Statements: Al Karwan Solution FZC historical transactions
const { data: alkCustomer, error: custErr } = await supabase
  .from("customers")
  .select("*")
  .eq("name", "Al Karwan Solution FZC")
  .single();

assert.equal(custErr, null, `Customer query error: ${custErr?.message}`);
assert.ok(alkCustomer, "Al Karwan customer record found");

const [alkInvsRes, alkRcvsRes, alkPaysRes] = await Promise.all([
  supabase.from("tax_invoices").select("*").eq("customer_id", alkCustomer.id),
  supabase.from("receipt_vouchers").select("*").eq("customer_id", alkCustomer.id),
  supabase.from("payments").select("*").eq("customer_id", alkCustomer.id),
]);

assert.equal(alkInvsRes.error, null);
assert.equal(alkRcvsRes.error, null);
assert.equal(alkPaysRes.error, null);

console.log(`✓ Customer Ledger (Al Karwan):`);
console.log(`   - Tax Invoices: ${alkInvsRes.data.length} (Expected 16)`);
console.log(`   - Receipt Vouchers: ${alkRcvsRes.data.length} (Expected 2)`);
console.log(`   - Payments: ${alkPaysRes.data.length} (Expected 1)`);
assert.equal(alkInvsRes.data.length, 16, "Expected 16 tax invoices for Al Karwan");

// 4. Test isStatusEffective logic
const { isStatusEffective } = await import("../lib/customerStatementEngine.ts");
assert.equal(isStatusEffective("draft"), true, "Draft invoices must be effective on customer statements");
assert.equal(isStatusEffective("Draft"), true, "Draft (capitalized) must be effective");
assert.equal(isStatusEffective("posted"), true, "Posted invoices must be effective");
assert.equal(isStatusEffective("paid"), true, "Paid invoices must be effective");
assert.equal(isStatusEffective("cancelled"), false, "Cancelled invoices must NOT be effective");
assert.equal(isStatusEffective("void"), false, "Void invoices must NOT be effective");
assert.equal(isStatusEffective(null), true, "Null status defaults to effective");
console.log(`✓ isStatusEffective: Draft invoices are fully effective; cancelled and void are excluded.`);

console.log("\n================================================================================");
console.log("ALL RESTORATION CHECKS PASSED PERFECTLY!");
console.log("================================================================================");
