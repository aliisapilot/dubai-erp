import fs from "fs";
import path from "path";
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
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log("=== CREATING VERIFIED BACKUP OF EMPLOYEES & CORE CONFIGURATION ===");

  // 1. Backup all 10 employees
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("*")
    .order("employee_number", { ascending: true });

  if (empErr) throw new Error("Failed to fetch employees: " + empErr.message);
  console.log(`✓ Fetched ${employees.length} employees`);

  // 2. Backup Companies
  const { data: companies, error: compErr } = await supabase.from("companies").select("*");
  if (compErr) throw new Error("Failed to fetch companies: " + compErr.message);
  console.log(`✓ Fetched ${companies.length} company records`);

  // 3. Backup Profiles (User accounts & permissions)
  const { data: profiles, error: profErr } = await supabase.from("profiles").select("*");
  if (profErr) throw new Error("Failed to fetch profiles: " + profErr.message);
  console.log(`✓ Fetched ${profiles.length} user profiles`);

  // 4. Backup Document Templates (PDF designs)
  const { data: docTemplates, error: docErr } = await supabase.from("document_templates").select("*");
  if (docErr) throw new Error("Failed to fetch document templates: " + docErr.message);
  console.log(`✓ Fetched ${docTemplates.length} document templates (PDF designs)`);

  // 5. Backup Document Design Selections
  const { data: designSelections, error: selErr } = await supabase.from("document_design_selections").select("*");
  if (selErr) throw new Error("Failed to fetch design selections: " + selErr.message);
  console.log(`✓ Fetched ${designSelections.length} design selections`);

  // Write verified employee backup
  const employeeBackupPath = path.join(backupDir, "employees_backup_verified.json");
  fs.writeFileSync(employeeBackupPath, JSON.stringify(employees, null, 2), "utf-8");
  console.log(`✓ Saved employee backup to ${employeeBackupPath}`);

  // Write comprehensive system config backup
  const systemConfigBackupPath = path.join(backupDir, "erp_preserved_config_backup.json");
  const fullBackup = {
    timestamp: new Date().toISOString(),
    employee_count: employees.length,
    employees,
    companies,
    profiles,
    document_templates: docTemplates,
    document_design_selections: designSelections,
  };
  fs.writeFileSync(systemConfigBackupPath, JSON.stringify(fullBackup, null, 2), "utf-8");
  console.log(`✓ Saved full preserved configuration backup to ${systemConfigBackupPath}`);

  // Generate SQL restore/preservation script
  const sqlLines = [
    `-- =========================================================================`,
    `-- DUBAI ERP VERIFIED PRESERVATION & BACKUP SCRIPT`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- =========================================================================`,
    ``,
    `-- 1. Preserve/Restore Companies`,
  ];

  for (const c of companies) {
    sqlLines.push(
      `INSERT INTO public.companies (id, name, address, phone, email, trn, created_at) ` +
      `VALUES ('${c.id}', ${JSON.stringify(c.name)}, ${JSON.stringify(c.address || '')}, ${JSON.stringify(c.phone || '')}, ${JSON.stringify(c.email || '')}, ${JSON.stringify(c.trn || '')}, '${c.created_at || new Date().toISOString()}') ` +
      `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone, email = EXCLUDED.email, trn = EXCLUDED.trn;`
    );
  }

  sqlLines.push(``, `-- 2. Preserve/Restore Profiles`);
  for (const p of profiles) {
    sqlLines.push(
      `INSERT INTO public.profiles (id, company_id, full_name, email, role, created_at) ` +
      `VALUES ('${p.id}', '${p.company_id}', ${JSON.stringify(p.full_name || '')}, ${JSON.stringify(p.email || '')}, ${JSON.stringify(p.role || 'admin')}, '${p.created_at || new Date().toISOString()}') ` +
      `ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role;`
    );
  }

  sqlLines.push(``, `-- 3. Preserve/Restore Employees`);
  for (const e of employees) {
    sqlLines.push(
      `INSERT INTO public.employees (id, company_id, employee_number, employee_code, first_name, designation, basic_salary, payment_method, status, created_at, updated_at) ` +
      `VALUES ('${e.id}', '${e.company_id}', '${e.employee_number}', '${e.employee_code || e.employee_number}', ${JSON.stringify(e.first_name)}, ${JSON.stringify(e.designation || '')}, ${Number(e.basic_salary) || 0}, ${JSON.stringify(e.payment_method || 'Cash')}, '${e.status || 'active'}', '${e.created_at}', '${e.updated_at}') ` +
      `ON CONFLICT (id) DO UPDATE SET ` +
      `employee_number = EXCLUDED.employee_number, ` +
      `employee_code = EXCLUDED.employee_code, ` +
      `first_name = EXCLUDED.first_name, ` +
      `designation = EXCLUDED.designation, ` +
      `basic_salary = EXCLUDED.basic_salary, ` +
      `payment_method = EXCLUDED.payment_method, ` +
      `status = EXCLUDED.status;`
    );
  }

  const sqlBackupPath = path.join(backupDir, "restore_preserved_records.sql");
  fs.writeFileSync(sqlBackupPath, sqlLines.join("\n"), "utf-8");
  console.log(`✓ Saved SQL preservation script to ${sqlBackupPath}`);

  console.log("\n=== BACKUP VERIFICATION REPORT ===");
  console.log(`Employees: ${employees.length} records`);
  console.table(employees.map(e => ({
    No: e.employee_number,
    Name: e.first_name,
    Designation: e.designation,
    Salary: `AED ${e.basic_salary}`,
    Method: e.payment_method,
    UUID: e.id,
  })));
}

main().catch(console.error);
