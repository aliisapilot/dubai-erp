import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const session = JSON.parse(fs.readFileSync("c:/Users/Ali/dubai-erp/scratch/user_session.json", "utf-8"));
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${session.access_token}` } },
});

async function main() {
  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, employee_number, employee_code, first_name, designation, status, created_at")
    .order("created_at", { ascending: true });

  if (empErr) {
    console.error("Error fetching employees:", empErr);
    return;
  }

  console.log(`=== FOUND ${emps.length} EMPLOYEES IN DATABASE ===`);
  console.table(emps);

  // Also inspect attendance records count by employee_id
  const { data: att, error: attErr } = await supabase
    .from("attendance")
    .select("id, employee_id, attendance_date, status");
  if (!attErr) {
    console.log(`=== FOUND ${att.length} ATTENDANCE RECORDS ===`);
    const attCounts = {};
    for (const r of att) {
      attCounts[r.employee_id] = (attCounts[r.employee_id] || 0) + 1;
    }
    console.log("Attendance counts per employee:", attCounts);
  }

  // Also inspect overtime records count by employee_id
  const { data: ot, error: otErr } = await supabase
    .from("overtime")
    .select("id, employee_id, overtime_date, overtime_hours");
  if (!otErr) {
    console.log(`=== FOUND ${ot.length} OVERTIME RECORDS ===`);
    const otCounts = {};
    for (const r of ot) {
      otCounts[r.employee_id] = (otCounts[r.employee_id] || 0) + 1;
    }
    console.log("Overtime counts per employee:", otCounts);
  }

  // Also inspect salary_statements records count by employee_id
  const { data: stmts, error: stmtErr } = await supabase
    .from("salary_statements")
    .select("id, employee_id, payroll_month, net_salary");
  if (!stmtErr) {
    console.log(`=== FOUND ${stmts.length} SALARY STATEMENTS ===`);
    const stmtCounts = {};
    for (const r of stmts) {
      stmtCounts[r.employee_id] = (stmtCounts[r.employee_id] || 0) + 1;
    }
    console.log("Salary statement counts per employee:", stmtCounts);
  }
}

main();
