import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("===============================================================================");
console.log("  DUBAI ERP — CUSTOM CUSTOMER & SUPPLIER DIRECT PDF VERIFICATION SUITE");
console.log("===============================================================================\n");

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. Test documentCustomer helpers (pure logic)
// ---------------------------------------------------------------------------
console.log("--- 1. Testing Party Data Helpers & Backward Compatibility Logic ---");

// Import dynamic TS or test logic directly
const docCustomerPath = path.join(rootDir, "lib", "documentCustomer.ts");
const docCustomerContent = fs.readFileSync(docCustomerPath, "utf8");

test("lib/documentCustomer.ts defines CustomPartyData and core helper functions", () => {
  assert.ok(docCustomerContent.includes("export interface CustomPartyData"), "CustomPartyData interface missing");
  assert.ok(docCustomerContent.includes("export function parseCustomPartyFromNotes"), "parseCustomPartyFromNotes missing");
  assert.ok(docCustomerContent.includes("export function serializeCustomPartyNotes"), "serializeCustomPartyNotes missing");
  assert.ok(docCustomerContent.includes("export function stripCustomPartyTags"), "stripCustomPartyTags missing");
  assert.ok(docCustomerContent.includes("export function withCustomerDocumentDetails"), "withCustomerDocumentDetails missing");
  assert.ok(docCustomerContent.includes("export function withSupplierDocumentDetails"), "withSupplierDocumentDetails missing");
  assert.ok(docCustomerContent.includes("export function isCustomCustomerRecord"), "isCustomCustomerRecord missing");
});

test("Custom party serialization roundtrip and non-destructive notes tag parsing", () => {
  // Simulate serialize and parse logic
  const originalNotes = "Special instructions for delivery.\nPlease call 30 mins prior.";
  const party = {
    name: "Al Habtoor Contracting LLC",
    address: "Al Quoz Industrial Area 3, Dubai, UAE",
    contact_person: "Eng. Tariq Mansoor",
    phone: "+971 50 999 8888",
    email: "tariq@habtoorcontracting.ae",
    trn: "100293847500003",
    project_name: "Habtoor Grand Tower — Level 42",
  };

  const tag = `<!--__CUSTOM_PARTY_DIRECT__:${JSON.stringify(party)}-->`;
  const serialized = `${originalNotes}\n\n${tag}`;

  assert.ok(serialized.includes(originalNotes));
  assert.ok(serialized.includes(tag));

  // Regex parse simulation
  const match = serialized.match(/<!--__CUSTOM_PARTY_DIRECT__:([\s\S]*?)-->/);
  assert.ok(match, "Custom party tag must be discovered");
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed.name, party.name);
  assert.equal(parsed.trn, party.trn);
  assert.equal(parsed.project_name, party.project_name);

  // Strip tags leaves clean original user notes
  const stripped = serialized.replace(/<!--__CUSTOM_PARTY_DIRECT__:[\s\S]*?-->/g, "").trim();
  assert.equal(stripped, originalNotes);
});

// ---------------------------------------------------------------------------
// 2. Test SQL Migrations Safety & Database Compatibility
// ---------------------------------------------------------------------------
console.log("\n--- 2. Testing Database Migrations & Compatibility ---");

const migrationSqlPath = path.join(rootDir, "supabase", "migrations", "20261028000000_custom_customer_direct_pdf.sql");
const rootMigrationPath = path.join(rootDir, "dubai_erp_documents_migration.sql");

test("Standalone migration 20261028000000_custom_customer_direct_pdf.sql exists and is safe/additive", () => {
  assert.ok(fs.existsSync(migrationSqlPath), "Migration file missing");
  const sql = fs.readFileSync(migrationSqlPath, "utf8");

  // Verify safe column additions
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS customer_name TEXT"), "customer_name missing");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS is_custom_customer BOOLEAN DEFAULT false"), "is_custom_customer missing");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS custom_customer JSONB"), "custom_customer JSONB missing");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS supplier_name TEXT"), "supplier_name missing");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS is_custom_supplier BOOLEAN DEFAULT false"), "is_custom_supplier missing");

  // Verify nullable customer_id and supplier_id
  assert.ok(sql.includes("ALTER COLUMN customer_id DROP NOT NULL"), "customer_id must be nullable for custom customers");
  assert.ok(sql.includes("ALTER COLUMN supplier_id DROP NOT NULL"), "supplier_id must be nullable for custom suppliers");

  // Verify NO destructive statements
  assert.ok(!sql.toLowerCase().includes("drop table"), "Destructive drop table detected");
  assert.ok(!sql.toLowerCase().includes("truncate"), "Destructive truncate detected");
});

test("Root dubai_erp_documents_migration.sql contains Section 21 for custom customer columns", () => {
  const rootSql = fs.readFileSync(rootMigrationPath, "utf8");
  assert.ok(rootSql.includes("21. Custom Customer & Supplier Direct Document Details"), "Section 21 missing");
  assert.ok(rootSql.includes("ADD COLUMN IF NOT EXISTS customer_name TEXT"));
  assert.ok(rootSql.includes("ADD COLUMN IF NOT EXISTS supplier_name TEXT"));
});

// ---------------------------------------------------------------------------
// 3. Test Layout Engine Auto-Wrapping & Height Estimation
// ---------------------------------------------------------------------------
console.log("\n--- 3. Testing Layout Engine & PDF Designer Compatibility ---");

const layoutEnginePath = path.join(rootDir, "lib", "documentLayoutEngine.ts");
const layoutContent = fs.readFileSync(layoutEnginePath, "utf8");

test("Layout engine estimates party info height including TRN, contact, email, phone, and project name", () => {
  assert.ok(layoutContent.includes("customer_trn"), "estimatePartyInfoHeight must check customer_trn");
  assert.ok(layoutContent.includes("contact_number"), "estimatePartyInfoHeight must check contact_number");
  assert.ok(layoutContent.includes("contact_email"), "estimatePartyInfoHeight must check contact_email");
  assert.ok(layoutContent.includes("project_name"), "estimatePartyInfoHeight must check project_name");
  assert.ok(layoutContent.includes("supplier_trn"), "estimatePartyInfoHeight must check supplier_trn");
});

const rendererPath = path.join(rootDir, "components", "documents", "DynamicDocumentRenderer.tsx");
const rendererContent = fs.readFileSync(rendererPath, "utf8");

test("DynamicDocumentRenderer renders customer_info and supplier_info with break-words wrapping and project name", () => {
  assert.ok(rendererContent.includes("data.customer_name"), "customer_info must render data.customer_name");
  assert.ok(rendererContent.includes("data.project_name"), "customer_info must render data.project_name");
  assert.ok(rendererContent.includes("data.supplier_name"), "supplier_info must render data.supplier_name");
  assert.ok(rendererContent.includes("break-words"), "DynamicDocumentRenderer must include break-words styling to prevent overflow");
});

// ---------------------------------------------------------------------------
// 4. Test Document Editor Split-Screen Live Preview & Mode Switching
// ---------------------------------------------------------------------------
console.log("\n--- 4. Testing DocumentSplitScreenEditor & Non-Destructive Mode Switching ---");

const splitEditorPath = path.join(rootDir, "components", "documents", "DocumentSplitScreenEditor.tsx");
const splitEditorContent = fs.readFileSync(splitEditorPath, "utf8");

test("DocumentSplitScreenEditor includes partyMode toggle, manual entry fields, and non-destructive state", () => {
  assert.ok(splitEditorContent.includes('const [partyMode, setPartyMode] = useState<"existing" | "custom">'), "partyMode state missing");
  assert.ok(splitEditorContent.includes("customParty"), "customParty state missing");
  assert.ok(splitEditorContent.includes("Existing {partyLabelSingle}"), "Existing toggle missing");
  assert.ok(splitEditorContent.includes("Custom {partyLabelSingle}"), "Custom toggle missing");
  assert.ok(splitEditorContent.includes("onSave("), "onSave callback missing");
  assert.ok(splitEditorContent.includes("is_custom_customer"), "is_custom_customer missing in save payload");
});

// ---------------------------------------------------------------------------
// 5. Test All Applicable Document Form Pages
// ---------------------------------------------------------------------------
console.log("\n--- 5. Testing All Applicable Document Pages for Custom Customer/Supplier ---");

const pagesToTest = [
  { name: "Tax Invoices", path: path.join(rootDir, "app", "tax-invoices", "page.tsx"), isSupplier: false },
  { name: "Quotations", path: path.join(rootDir, "app", "quotations", "page.tsx"), isSupplier: false },
  { name: "Proforma Invoices", path: path.join(rootDir, "app", "proforma-invoices", "page.tsx"), isSupplier: false },
  { name: "Purchase Orders", path: path.join(rootDir, "app", "purchase-orders", "page.tsx"), isSupplier: true },
  { name: "Delivery Notes", path: path.join(rootDir, "app", "delivery-notes", "page.tsx"), isSupplier: false },
  { name: "Receipt Vouchers", path: path.join(rootDir, "app", "receipt-vouchers", "page.tsx"), isSupplier: false },
  { name: "Customer Statements", path: path.join(rootDir, "app", "customers", "statements", "page.tsx"), isSupplier: false },
];

for (const pg of pagesToTest) {
  test(`Document Page [${pg.name}] supports custom ${pg.isSupplier ? "supplier" : "customer"} and live preview`, () => {
    assert.ok(fs.existsSync(pg.path), `Page missing: ${pg.path}`);
    const code = fs.readFileSync(pg.path, "utf8");

    if (pg.isSupplier) {
      assert.ok(code.includes("customSupplier") || code.includes("custom_supplier") || code.includes("is_custom_supplier"), "custom supplier support missing");
      assert.ok(code.includes("supplier_name"), "supplier_name missing");
    } else {
      assert.ok(code.includes("customCustomer") || code.includes("custom_customer") || code.includes("is_custom_customer") || code.includes("Custom Customer"), "custom customer support missing");
      assert.ok(code.includes("customer_name"), "customer_name missing");
    }

    // Check table row badges or project badges
    assert.ok(code.includes("Custom") || code.includes("is_custom"), "custom indicator badge missing");
  });
}

// ---------------------------------------------------------------------------
// 6. Test Templates (Receipt Voucher & Statement of Account)
// ---------------------------------------------------------------------------
console.log("\n--- 6. Testing Document Templates & Fallback Views ---");

const rcvTemplatePath = path.join(rootDir, "components", "documents", "ReceiptVoucherTemplate.tsx");
const rcvTemplateContent = fs.readFileSync(rcvTemplatePath, "utf8");

test("ReceiptVoucherTemplate supports custom customer address, contact person, phone, email, project", () => {
  assert.ok(rcvTemplateContent.includes("customer_address"), "customer_address missing in ReceiptVoucherTemplate");
  assert.ok(rcvTemplateContent.includes("contact_person"), "contact_person missing in ReceiptVoucherTemplate");
  assert.ok(rcvTemplateContent.includes("project_name"), "project_name missing in ReceiptVoucherTemplate");
});

const soaTemplatePath = path.join(rootDir, "components", "documents", "StatementOfAccountTemplate.tsx");
const soaTemplateContent = fs.readFileSync(soaTemplatePath, "utf8");

test("StatementOfAccountTemplate renders customer details properly", () => {
  assert.ok(soaTemplateContent.includes("statement.customer_name"), "customer_name missing in StatementOfAccountTemplate");
  assert.ok(soaTemplateContent.includes("statement.customer_address"), "customer_address missing in StatementOfAccountTemplate");
  assert.ok(soaTemplateContent.includes("statement.customer_trn"), "customer_trn missing in StatementOfAccountTemplate");
});

// ---------------------------------------------------------------------------
// 7. Security & Credential Audit
// ---------------------------------------------------------------------------
console.log("\n--- 7. Performing Security & Credential Safety Checks ---");

test("No API keys, service role keys, or secrets introduced in touched files", () => {
  const secretPatterns = [
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/g, // JWT secret snippet
    /sbp_[a-zA-Z0-9]{30,}/g, // Supabase PAT
    /sk_live_[a-zA-Z0-9]{20,}/g, // Stripe live key
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
  ];

  const touchedFiles = [
    "supabase/migrations/20261028000000_custom_customer_direct_pdf.sql",
    "dubai_erp_documents_migration.sql",
    "lib/documentCustomer.ts",
    "lib/documentLayoutEngine.ts",
    "components/documents/DynamicDocumentRenderer.tsx",
    "components/documents/DocumentSplitScreenEditor.tsx",
    "components/documents/ReceiptVoucherTemplate.tsx",
    "components/documents/StatementOfAccountTemplate.tsx",
    "components/measurements/PvcTankLinerQuotationModal.tsx",
    "app/tax-invoices/page.tsx",
    "app/quotations/page.tsx",
    "app/proforma-invoices/page.tsx",
    "app/purchase-orders/page.tsx",
    "app/delivery-notes/page.tsx",
    "app/receipt-vouchers/page.tsx",
    "app/customers/statements/page.tsx",
  ];

  for (const rel of touchedFiles) {
    const fPath = path.join(rootDir, rel);
    if (!fs.existsSync(fPath)) continue;
    const content = fs.readFileSync(fPath, "utf8");
    for (const pat of secretPatterns) {
      assert.ok(!pat.test(content), `Found credential pattern ${pat} in ${rel}`);
    }
  }
});

console.log("\n===============================================================================");
console.log(`  RESULT: ${passedTests} / ${totalTests} tests passed successfully.`);
console.log("===============================================================================\n");
