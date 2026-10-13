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
  const tables = [
    "companies",
    "profiles",
    "document_templates",
    "document_design_selections",
    "document_numbering_configs",
    "company_cheque_settings",
    "customer_reminder_configs",
  ];

  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select("*");
      if (error) {
        console.log(`Table ${t}: Error -> ${error.message}`);
      } else {
        console.log(`Table ${t}: Found ${data.length} records`);
      }
    } catch (e) {
      console.log(`Table ${t}: Exception -> ${e.message}`);
    }
  }
}

main();
