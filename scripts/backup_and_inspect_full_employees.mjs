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

async function main() {
  const { data: emps, error } = await supabase
    .from("employees")
    .select("*")
    .order("employee_number", { ascending: true });

  if (error) {
    console.error("Error fetching employees:", error);
    return;
  }

  console.log(`=== FULL DETAILS OF ${emps.length} EMPLOYEES ===`);
  for (const e of emps) {
    console.log(JSON.stringify(e, null, 2));
  }
}

main();
