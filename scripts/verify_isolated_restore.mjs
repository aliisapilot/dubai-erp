import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PGlite } from "@electric-sql/pglite";

async function verifyIsolatedRestore() {
  console.log("================================================================================");
  console.log("   DUBAI ERP: FULL ISOLATED RESTORE & INDEPENDENT SAFETY AUDIT (PGLITE)");
  console.log("================================================================================\n");

  const backupDir = path.join(process.cwd(), "backups");
  const backupJsonPath = path.join(backupDir, "complete_erp_database_backup.json");
  const manifestPath = path.join(backupDir, "backup_manifest.json");
  const schemaSqlPath = path.join(backupDir, "complete_erp_database_schema_and_data.sql");

  // Step 1: Verify files exist
  if (!fs.existsSync(backupJsonPath) || !fs.existsSync(manifestPath) || !fs.existsSync(schemaSqlPath)) {
    throw new Error("Required backup or SQL schema files missing in /backups!");
  }

  // Step 2: Verify SHA-256 Checksum
  console.log("1. Verifying Full Database Backup File Integrity (SHA-256)...");
  const jsonContent = fs.readFileSync(backupJsonPath, "utf-8");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const calculatedChecksum = crypto.createHash("sha256").update(jsonContent).digest("hex");

  if (calculatedChecksum !== manifest.checksum_sha256) {
    throw new Error(`Checksum mismatch! Expected ${manifest.checksum_sha256}, got ${calculatedChecksum}`);
  }
  console.log(`✓ SHA-256 Checksum Verified: ${calculatedChecksum}`);
  console.log(`✓ Total Tables in Manifest: ${manifest.total_tables}`);
  console.log(`✓ Total Records in Manifest: ${manifest.total_records}`);

  const backupData = JSON.parse(jsonContent);

  // Step 3: Verify All 10 Employees and Master Data Attributes
  console.log("\n2. Verifying All 10 Employees and Master Data in Backup Payload...");
  const employees = backupData.employees || [];
  if (employees.length !== 10) {
    throw new Error(`Expected exactly 10 employees, found ${employees.length}`);
  }

  const expectedCodes = ["EMP-01", "EMP-02", "EMP-03", "EMP-04", "EMP-05", "EMP-06", "EMP-07", "EMP-08", "EMP-09", "EMP-10"];
  for (let i = 0; i < expectedCodes.length; i++) {
    const code = expectedCodes[i];
    const emp = employees.find((e) => e.employee_code === code || e.employee_number === code);
    if (!emp) throw new Error(`Missing expected employee code ${code} in backup!`);
    const name = [emp.first_name, emp.last_name].filter(Boolean).join(" ") || emp.name;
    console.log(`   ✓ [${code}] UUID: ${emp.id} | ${name} | Basic: AED ${emp.basic_salary} | Pkg: AED ${emp.package_amount || emp.basic_salary} | Designation: ${emp.designation}`);
  }

  // Verify Company Settings
  const companies = backupData.companies || [];
  if (companies.length !== 1) throw new Error("Expected exactly 1 company record in backup!");
  const company = companies[0];
  console.log(`\n✓ Company Configuration Verified:`);
  console.log(`   - Name: ${company.name}`);
  console.log(`   - Legal Name: ${company.legal_name}`);
  console.log(`   - TRN: ${company.trn} (VAT: ${company.default_vat_rate || 5}%)`);
  console.log(`   - Bank: ${company.bank_name} (IBAN: ${company.iban || "N/A"})`);

  // Verify PDF Templates
  const templates = backupData.document_templates || [];
  if (templates.length < 25) throw new Error(`Expected at least 25 document templates, found ${templates.length}`);
  console.log(`\n✓ PDF Designer Templates Verified: ${templates.length} saved templates.`);

  // Verify Design Selections
  const selections = backupData.document_design_selections || [];
  if (selections.length < 13) throw new Error(`Expected at least 13 document design selections, found ${selections.length}`);
  console.log(`✓ Document Design Selections Verified: ${selections.length} bindings.`);

  // Verify User Profiles
  const profiles = backupData.profiles || [];
  if (profiles.length === 0) throw new Error("User profiles missing in backup!");
  console.log(`✓ User Profiles Verified: ${profiles.length} profile (${profiles[0].email}, role: ${profiles[0].role}).`);

  // Step 4: Spawning Realistic Isolated PGlite Postgres Instance
  console.log("\n3. Spawning Isolated Embedded Postgres (PGlite WASM) Engine...");
  const pg = new PGlite();

  // Step 5: Executing DDL Schema and restoring tables
  console.log("4. Restoring Schema, Foreign Keys, Indexes, Functions, and Tables into Isolated Test Database...");
  
  // Read SQL schema script
  const sqlContent = fs.readFileSync(schemaSqlPath, "utf-8");
  
  // Execute schema DDL statements
  await pg.exec(sqlContent);
  console.log("✓ SQL Schema, Foreign Keys, Indexes, RLS Policies, and Data loaded successfully into isolated test database!");

  // Step 6: Verify Database Table Counts in Isolated Database
  console.log("\n5. Verifying Restored Database Table Counts in Isolated Test DB...");
  const empCount = await pg.query("SELECT count(*) as cnt FROM public.employees");
  const compCount = await pg.query("SELECT count(*) as cnt FROM public.companies");
  const tplCount = await pg.query("SELECT count(*) as cnt FROM public.document_templates");
  const attCount = await pg.query("SELECT count(*) as cnt FROM public.attendance");
  const otCount = await pg.query("SELECT count(*) as cnt FROM public.overtime");
  const salCount = await pg.query("SELECT count(*) as cnt FROM public.salary_statements");
  const qtnCount = await pg.query("SELECT count(*) as cnt FROM public.quotations");
  const invCount = await pg.query("SELECT count(*) as cnt FROM public.tax_invoices");
  const payCount = await pg.query("SELECT count(*) as cnt FROM public.payments");
  const pctCount = await pg.query("SELECT count(*) as cnt FROM public.petty_cash_transactions");

  console.log(`   - employees: ${empCount.rows[0].cnt} rows`);
  console.log(`   - companies: ${compCount.rows[0].cnt} rows`);
  console.log(`   - document_templates: ${tplCount.rows[0].cnt} rows`);
  console.log(`   - attendance: ${attCount.rows[0].cnt} rows`);
  console.log(`   - overtime: ${otCount.rows[0].cnt} rows`);
  console.log(`   - salary_statements: ${salCount.rows[0].cnt} rows`);
  console.log(`   - quotations: ${qtnCount.rows[0].cnt} rows`);
  console.log(`   - tax_invoices: ${invCount.rows[0].cnt} rows`);
  console.log(`   - payments: ${payCount.rows[0].cnt} rows`);
  console.log(`   - petty_cash_transactions: ${pctCount.rows[0].cnt} rows`);

  // Step 7: Simulate Scoped Reset on Isolated Database (Zero Touch to Live DB)
  console.log("\n6. Simulating Bottom-Up Scoped Reset in Isolated Test Database...");
  
  // Scoped deletion in reverse topological order
  await pg.exec(`
    DELETE FROM public.cheque_status_history;
    DELETE FROM public.document_access_logs;
    DELETE FROM public.quotation_items;
    DELETE FROM public.tax_invoice_items;
    DELETE FROM public.delivery_note_items;
    DELETE FROM public.purchase_order_items;
    DELETE FROM public.supplier_bill_items;
    DELETE FROM public.measurement_items;
    DELETE FROM public.payments;
    DELETE FROM public.petty_cash_transactions;
    DELETE FROM public.expenses;
    DELETE FROM public.cheques;
    DELETE FROM public.tax_invoices;
    DELETE FROM public.quotations;
    DELETE FROM public.proforma_invoices;
    DELETE FROM public.delivery_notes;
    DELETE FROM public.purchase_orders;
    DELETE FROM public.supplier_bills;
    DELETE FROM public.measurement_projects;
    DELETE FROM public.projects;
    DELETE FROM public.salary_statements;
    DELETE FROM public.overtime;
    DELETE FROM public.attendance;
    DELETE FROM public.products;
    DELETE FROM public.customers;
    DELETE FROM public.suppliers;
  `);

  // Step 8: Verify Preserved Master Data Survived Reset
  console.log("\n7. Validating Preserved vs Reset State Post-Reset in Isolated DB...");
  const postResetEmp = await pg.query("SELECT count(*) as cnt FROM public.employees");
  const postResetComp = await pg.query("SELECT count(*) as cnt FROM public.companies");
  const postResetTpl = await pg.query("SELECT count(*) as cnt FROM public.document_templates");
  const postResetAtt = await pg.query("SELECT count(*) as cnt FROM public.attendance");
  const postResetSal = await pg.query("SELECT count(*) as cnt FROM public.salary_statements");
  const postResetQtn = await pg.query("SELECT count(*) as cnt FROM public.quotations");
  const postResetPay = await pg.query("SELECT count(*) as cnt FROM public.payments");
  const postResetPct = await pg.query("SELECT count(*) as cnt FROM public.petty_cash_transactions");

  console.log(`   - Preserved Employees: ${postResetEmp.rows[0].cnt} (EXPECTED: 10)`);
  console.log(`   - Preserved Companies: ${postResetComp.rows[0].cnt} (EXPECTED: 1)`);
  console.log(`   - Preserved PDF Templates: ${postResetTpl.rows[0].cnt} (EXPECTED: 25)`);
  console.log(`   - Reset Attendance: ${postResetAtt.rows[0].cnt} (EXPECTED: 0)`);
  console.log(`   - Reset Salary Statements: ${postResetSal.rows[0].cnt} (EXPECTED: 0)`);
  console.log(`   - Reset Quotations: ${postResetQtn.rows[0].cnt} (EXPECTED: 0)`);
  console.log(`   - Reset Payments: ${postResetPay.rows[0].cnt} (EXPECTED: 0)`);
  console.log(`   - Reset Petty Cash: ${postResetPct.rows[0].cnt} (EXPECTED: 0)`);

  if (Number(postResetEmp.rows[0].cnt) !== 10) throw new Error("Employee preservation failed in test!");
  if (Number(postResetComp.rows[0].cnt) !== 1) throw new Error("Company preservation failed in test!");
  if (Number(postResetTpl.rows[0].cnt) !== 25) throw new Error("PDF templates preservation failed in test!");
  if (Number(postResetAtt.rows[0].cnt) !== 0 || Number(postResetQtn.rows[0].cnt) !== 0) throw new Error("Operational records reset failed in test!");

  // Step 9: Verify Post-Reset Creation of New Records
  console.log("\n8. Verifying Operational Readiness for New Records Post-Reset...");
  const newEmpId = crypto.randomUUID();
  await pg.query(
    `INSERT INTO public.employees (id, company_id, employee_number, employee_code, first_name, designation, basic_salary)
     VALUES ($1, $2, 'EMP-11', 'EMP-11', 'New Technical Hire', 'Field Supervisor', 4200)`,
    [newEmpId, company.id]
  );
  const totalEmpsNow = await pg.query("SELECT count(*) as cnt FROM public.employees");
  console.log(`   ✓ New employee EMP-11 created successfully. Total employees: ${totalEmpsNow.rows[0].cnt}`);

  const newCustId = crypto.randomUUID();
  await pg.query(
    `INSERT INTO public.customers (id, company_id, name) VALUES ($1, $2, 'Dubai Construction Group LLC')`,
    [newCustId, company.id]
  );

  const newQtnId = crypto.randomUUID();
  await pg.query(
    `INSERT INTO public.quotations (id, company_id, customer_id, quotation_number, total_amount)
     VALUES ($1, $2, $3, 'QTN-2026-0001', 15750)`,
    [newQtnId, company.id, newCustId]
  );
  console.log(`   ✓ New customer and Quotation QTN-2026-0001 created and linked cleanly.`);

  console.log("\n================================================================================");
  console.log("   ✓ FULL ISOLATED RESTORE & SAFETY AUDIT PASSED WITH 100% SUCCESS!");
  console.log("   ✓ ZERO DATA DELETED OR MODIFIED IN LIVE PRODUCTION SUPABASE.");
  console.log("================================================================================\n");
}

verifyIsolatedRestore().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
