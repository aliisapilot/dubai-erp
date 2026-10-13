import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const session = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf-8"));
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

async function run() {
  const tables = [
    "attendance",
    "overtime",
    "salary_statements",
    "employee_payment_vouchers",
    "monthly_payroll_adjustments",
  ];

  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select("*").limit(10);
      if (error) {
        console.log(`Table ${t}: Error ${error.message}`);
      } else {
        console.log(`Table ${t}: ${data.length} records. Sample keys:`, data[0] ? Object.keys(data[0]) : "empty");
        const found = JSON.stringify(data).includes("EMP-2026");
        console.log(`Table ${t} contains 'EMP-2026':`, found);
      }
    } catch (e) {
      console.log(`Table ${t} exception:`, e.message);
    }
  }
}

run();
