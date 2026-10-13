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

const tbls = [
  "cheque_status_history",
  "document_access_logs",
  "document_attachments",
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
  "employee_payment_vouchers",
  "salary_statements",
  "monthly_payroll_adjustments",
  "overtime",
  "attendance",
  "products",
  "customers",
  "suppliers",
];

async function main() {
  for (const t of tbls) {
    const { error } = await supabase.from(t).delete().eq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.log(`FAIL [${t}]: ${error.message}`);
    } else {
      console.log(`OK [${t}]`);
    }
  }
}

main().catch(console.error);
