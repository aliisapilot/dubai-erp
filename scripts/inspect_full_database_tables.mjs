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

const candidateTables = [
  // Preserved Core Configuration
  "companies",
  "profiles",
  "employees",
  "document_templates",
  "document_design_selections",
  "document_numbering_configs",
  "document_counters",
  "company_cheque_settings",

  // Operational Modules to Reset
  "attendance",
  "overtime",
  "salary_statements",
  "employee_payment_vouchers",
  "monthly_payroll_adjustments",
  "customers",
  "suppliers",
  "products",
  "quotations",
  "quotation_items",
  "proforma_invoices",
  "proforma_invoice_items",
  "tax_invoices",
  "tax_invoice_items",
  "delivery_notes",
  "delivery_note_items",
  "receipt_vouchers",
  "purchase_orders",
  "purchase_order_items",
  "supplier_bills",
  "supplier_bill_items",
  "supplier_payments",
  "expenses",
  "petty_cash",
  "inventory_movements",
  "inventory_adjustments",
  "stock_movements",
  "stock_adjustments",
  "projects",
  "project_manpower",
  "project_equipment",
  "project_expenses",
  "project_handovers",
  "work_method_statements",
  "wms_risk_assessments",
  "wms_qaqc_checklists",
  "measurement_projects",
  "measurement_items",
  "cheques",
  "cheque_status_history",
  "cheque_reminders",
  "cheque_reminder_recipients",
  "customer_reminder_configs",
  "document_access_logs",
];

async function main() {
  console.log("=== COMPREHENSIVE SUPABASE DATABASE TABLE AUDIT ===");
  const tableStats = [];

  for (const t of candidateTables) {
    try {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      if (error) {
        if (!error.message.includes("Could not find the table") && !error.message.includes("does not exist")) {
          tableStats.push({ table: t, exists: true, count: "Error", note: error.message });
        }
      } else {
        tableStats.push({ table: t, exists: true, count: count ?? 0, note: "OK" });
      }
    } catch (e) {
      // Ignore
    }
  }

  console.log(`\nFound ${tableStats.length} active tables in public schema:`);
  console.table(tableStats);

  // Storage buckets audit
  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      console.log("\nStorage Buckets Error:", bErr.message);
    } else {
      console.log(`\nFound ${buckets?.length || 0} Storage Buckets:`);
      for (const b of buckets || []) {
        console.log(` - Bucket: ${b.name} (Public: ${b.public})`);
      }
    }
  } catch (e) {
    console.log("Storage check exception:", e.message);
  }
}

main().catch(console.error);
