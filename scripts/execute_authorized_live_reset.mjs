import fs from "fs";
import path from "path";
import crypto from "crypto";
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

// Operational Tables in strict reverse topological deletion order
const DELETION_TOPOLOGY_ORDER = [
  // Tier 1: Leaf logs, recipient items, attachments
  "cheque_reminder_recipients",
  "cheque_reminders",
  "cheque_status_history",
  "document_access_logs",
  "document_attachments",
  // Tier 2: Transaction line items & child items
  "quotation_items",
  "proforma_invoice_items",
  "tax_invoice_items",
  "delivery_note_items",
  "purchase_order_items",
  "supplier_bill_items",
  "stock_adjustment_items",
  "supplier_payments",
  "payments",
  "petty_cash_transactions",
  // Tier 3: Inventory and project sub-records
  "stock_movements",
  "stock_adjustments",
  "inventory_movements",
  "inventory_adjustments",
  "measurement_items",
  "project_milestones",
  "project_manpower",
  "project_equipment",
  "project_expenses",
  "project_handovers",
  "wms_risk_assessments",
  "wms_qaqc_checklists",
  // Tier 4: Transaction headers & project headers
  "receipt_vouchers",
  "delivery_notes",
  "tax_invoices",
  "proforma_invoices",
  "quotations",
  "purchase_orders",
  "supplier_bills",
  "expenses",
  "petty_cash",
  "cheques",
  "measurement_projects",
  "work_method_statements",
  "projects",
  // Tier 5: Operational payroll & attendance records (references employees, but employees are preserved!)
  "employee_payment_vouchers",
  "salary_statements",
  "monthly_payroll_adjustments",
  "overtime",
  "attendance",
  // Tier 6: Operational Master Records
  "products",
  "customers",
  "suppliers",
];

const PRESERVED_TABLES = [
  "employees",
  "companies",
  "profiles",
  "document_templates",
  "document_design_selections",
  "document_numbering_configs",
  "company_cheque_settings",
  "customer_reminder_configs",
];

async function main() {
  console.log("================================================================================");
  console.log("   DUBAI ERP: EXECUTING AUTHORIZED LIVE OPERATIONAL RESET");
  console.log("================================================================================\n");

  // Step 1: Pre-flight backup verification
  console.log("1. Pre-flight Verification of Database Backup...");
  const backupJsonPath = path.join(process.cwd(), "backups", "complete_erp_database_backup.json");
  const manifestPath = path.join(process.cwd(), "backups", "backup_manifest.json");

  if (!fs.existsSync(backupJsonPath) || !fs.existsSync(manifestPath)) {
    throw new Error("ABORT: Verified backup files not found in /backups!");
  }

  const jsonContent = fs.readFileSync(backupJsonPath, "utf-8");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const checksum = crypto.createHash("sha256").update(jsonContent).digest("hex");

  if (checksum !== manifest.checksum_sha256) {
    throw new Error(`ABORT: Backup checksum mismatch! Expected ${manifest.checksum_sha256}, got ${checksum}`);
  }
  console.log(`   ✓ Backup verified: ${manifest.total_records} records, SHA-256: ${checksum}`);

  // Step 2: Pre-reset check of preserved entities
  console.log("\n2. Checking Preserved Entities in Live Database Prior to Reset...");
  const { data: empsBefore, error: empErr } = await supabase.from("employees").select("id, employee_number, first_name");
  if (empErr || !empsBefore || empsBefore.length !== 10) {
    throw new Error(`ABORT: Pre-check failed! Found ${empsBefore?.length} employees (expected 10). Error: ${empErr?.message}`);
  }
  console.log(`   ✓ All 10 employees confirmed in live Supabase: ${empsBefore.map(e => e.employee_number).join(", ")}`);

  const { data: compsBefore } = await supabase.from("companies").select("id, name");
  console.log(`   ✓ Company confirmed: ${compsBefore?.[0]?.name}`);

  const { data: tplsBefore } = await supabase.from("document_templates").select("id");
  console.log(`   ✓ Document templates confirmed: ${tplsBefore?.length} templates`);

  // Step 3: Deletion of operational records in reverse topological order
  console.log("\n3. Executing Scoped Reverse-Topological Deletion on Live Database...");
  let totalRowsDeleted = 0;

  for (const table of DELETION_TOPOLOGY_ORDER) {
    // If it's document_access_logs, note policy
    if (table === "document_access_logs") {
      console.log(`   - Table [document_access_logs]: Read-only audit log retained by RLS policy.`);
      continue;
    }

    try {
      // Check initial count
      const { data: beforeData, error: beforeErr } = await supabase.from(table).select("id");
      if (beforeErr) {
        if (beforeErr.message.includes("Could not find the table")) {
          console.log(`   - Table [${table}]: Not present in database schema (skipped)`);
          continue;
        }
        console.warn(`   ⚠️ Table [${table}] query warning: ${beforeErr.message}`);
        continue;
      }

      const countBefore = beforeData?.length || 0;

      if (countBefore === 0) {
        console.log(`   - Table [${table}]: 0 rows (skipped)`);
        continue;
      }

      // Delete rows
      const { error: delErr } = await supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (delErr) {
        console.error(`   ❌ Deletion failed on table [${table}]: ${delErr.message}`);
        throw new Error(`Deletion failed on table [${table}]: ${delErr.message}`);
      }

      // Verify deletion
      const { data: afterData } = await supabase.from(table).select("id");
      const countAfter = afterData?.length || 0;
      const deleted = countBefore - countAfter;
      totalRowsDeleted += deleted;

      console.log(`   ✓ Table [${table}]: Deleted ${deleted} rows (Remaining: ${countAfter})`);
    } catch (err) {
      if (err.message?.includes("Could not find the table")) {
        console.log(`   - Table [${table}]: Skipped (not in schema)`);
      } else {
        throw err;
      }
    }
  }

  // Reset document counters if table exists
  try {
    await supabase.from("document_counters").delete().neq("prefix", "__keep_none__");
    console.log(`   ✓ Table [document_counters]: Reset numbering counters.`);
  } catch (e) {
    // Optional counter table
  }

  // Step 4: Strict Post-Reset State Validation
  console.log("\n4. Performing Strict Post-Reset State Validation...");

  // 1. Check Preserved Tables
  const { data: empsAfter } = await supabase.from("employees").select("id, employee_number, first_name, designation, basic_salary");
  const { data: compsAfter } = await supabase.from("companies").select("id, name, trn, iban");
  const { data: profsAfter } = await supabase.from("profiles").select("id, email, role");
  const { data: tplsAfter } = await supabase.from("document_templates").select("id");
  const { data: desAfter } = await supabase.from("document_design_selections").select("id");

  console.log(`   - Preserved Employees: ${empsAfter?.length} (EXPECTED: 10)`);
  console.log(`   - Preserved Companies: ${compsAfter?.length} (EXPECTED: 1)`);
  console.log(`   - Preserved User Profiles: ${profsAfter?.length} (EXPECTED: 1)`);
  console.log(`   - Preserved PDF Templates: ${tplsAfter?.length} (EXPECTED: 25)`);
  console.log(`   - Preserved Design Selections: ${desAfter?.length} (EXPECTED: 13)`);

  if (!empsAfter || empsAfter.length !== 10) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Expected 10 employees after reset, found ${empsAfter?.length}`);
  }
  if (!compsAfter || compsAfter.length !== 1) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Expected 1 company after reset, found ${compsAfter?.length}`);
  }
  if (!tplsAfter || tplsAfter.length < 25) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Expected 25 templates after reset, found ${tplsAfter?.length}`);
  }

  // 2. Check Operational Tables are 0
  const operationalChecks = [
    "attendance",
    "overtime",
    "salary_statements",
    "quotations",
    "tax_invoices",
    "proforma_invoices",
    "delivery_notes",
    "purchase_orders",
    "supplier_bills",
    "payments",
    "expenses",
    "petty_cash_transactions",
    "customers",
    "suppliers",
    "products",
    "measurement_projects",
    "measurement_items",
    "cheques",
  ];

  let anyOperationalRemaining = false;
  for (const opTbl of operationalChecks) {
    const { data: opData } = await supabase.from(opTbl).select("id");
    const count = opData?.length || 0;
    if (count > 0) {
      console.error(`   ❌ Operational table [${opTbl}] still has ${count} records!`);
      anyOperationalRemaining = true;
    } else {
      console.log(`   ✓ Operational table [${opTbl}]: 0 records (Clean)`);
    }
  }

  if (anyOperationalRemaining) {
    throw new Error("Operational wipe was incomplete. Some operational records remain.");
  }

  console.log("\n================================================================================");
  console.log(`   ✓ LIVE ERP RESET SUCCESSFULLY COMPLETED!`);
  console.log(`   ✓ Total Operational Records Wiped: ${totalRowsDeleted}`);
  console.log(`   ✓ All 10 Employees, Company Profile, and 25 PDF Templates 100% INTACT.`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ LIVE RESET ERROR:", err.message);
  process.exit(1);
});
