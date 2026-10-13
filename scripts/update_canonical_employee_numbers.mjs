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

const CANONICAL_MAPPING = [
  { id: "3c542c69-9ec7-4811-880e-992401158eec", code: "EMP-01", name: "Rahmat Ali Khan" },
  { id: "442d6c04-10a7-4bd9-af46-b5a7170fd217", code: "EMP-02", name: "Imran Khan" },
  { id: "471ac22e-c997-4be3-a01c-b7aa2638b299", code: "EMP-03", name: "Mohammed Nawaz" },
  { id: "0996cefe-5317-4939-ab11-16e275e598be", code: "EMP-04", name: "Muslim Ali" },
  { id: "e17e15c5-cfa5-4cce-b832-852ea6d95790", code: "EMP-05", name: "Aslam Alam Ansari" },
  { id: "180d547b-8f5f-4bae-8546-cbcb9955918a", code: "EMP-06", name: "Iftikhar Ahmed" },
  { id: "06c480e4-ca5d-4130-b416-3e924a1fa1de", code: "EMP-07", name: "Siraj Ahmed" },
  { id: "bc56cb05-5c42-451b-b1be-af0d56e0774e", code: "EMP-08", name: "Mohammed Osim Ansari" },
  { id: "0b5bbb0a-fd31-4d97-9b5d-4f8f45aed2e4", code: "EMP-09", name: "Kalamudin Ansari" },
  { id: "c448166f-c12a-46cc-8b5d-931ec4b9d836", code: "EMP-10", name: "Eliyas Ansari" },
];

async function main() {
  console.log("=== UPDATING 10 EMPLOYEES TO CANONICAL EMP-01..EMP-10 ===");
  for (const emp of CANONICAL_MAPPING) {
    const { error } = await supabase
      .from("employees")
      .update({
        employee_number: emp.code,
        employee_code: emp.code,
      })
      .eq("id", emp.id)
      .select("id, employee_number, employee_code, first_name");

    if (error) {
      console.error(`Failed to update ${emp.name} (${emp.id}):`, error);
    } else {
      console.log(`✓ Updated ${emp.name} -> ${emp.code}`);
    }
  }

  // Re-verify
  const { data: verified, error: verErr } = await supabase
    .from("employees")
    .select("id, employee_number, employee_code, first_name, designation, status, created_at")
    .order("employee_number", { ascending: true });

  if (verErr) {
    console.error("Verification failed:", verErr);
  } else {
    console.log("\n=== VERIFIED ALL EMPLOYEES IN DATABASE ===");
    console.table(verified);
  }
}

main().catch(console.error);
