import fs from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "lib", "index.js"));
const ts = require("typescript");

const loadedModules = new Map();
function loadTs(file) {
  const normalizedFile = file.endsWith(".ts") ? file : file + ".ts";
  const filePath = join(process.cwd(), normalizedFile);
  if (loadedModules.has(filePath)) return loadedModules.get(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const customRequire = (id) => {
    if (id.startsWith("./") || id.startsWith("../") || id.startsWith("@/")) {
      const relPath = id.startsWith("@/") ? id.replace("@/", "") : join(normalizedFile, "..", id);
      return loadTs(relPath);
    }
    return require(id);
  };
  const exports = {};
  loadedModules.set(filePath, exports);
  new Function("exports", "require", js)(exports, customRequire);
  return exports;
}

const {
  getCategoryLabel,
  getCategoryBadgeColor,
  DEFAULT_PERMISSIONS,
  isMissingMobilePermissionsSchema,
} = loadTs("lib/mobilePortalTypes.ts");

const { getChequeUrgency, isChequeOverdue } = loadTs("lib/chequeTypes.ts");


function runTests() {
  console.log("================================================================================");
  console.log("   TESTING MOBILE READ-ONLY DOCUMENT PORTAL & SECURITY PERMISSIONS");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Verify 8 Document Categories Defined
  const requiredCategories = [
    "quotation",
    "proforma",
    "tax_invoice",
    "delivery_note",
    "purchase_order",
    "supplier_bill",
    "cheque",
    "company_file",
  ];

  for (const cat of requiredCategories) {
    const label = getCategoryLabel(cat);
    const color = getCategoryBadgeColor(cat);
    assert(Boolean(label && color), `Category '${cat}' properly configured (Label: ${label})`);
  }

  // 2. Verify Mobile Permissions Schema
  assert(DEFAULT_PERMISSIONS.mobileAccessEnabled === true, "Default mobile access is enabled");
  assert(DEFAULT_PERMISSIONS.allowedCategories.length === 8, "All 8 categories permitted for full admin/member");
  assert(DEFAULT_PERMISSIONS.canViewFinancials === true, "Financial view permitted");
  assert(DEFAULT_PERMISSIONS.canShareDocuments === true, "Native sharing permitted");
  assert(DEFAULT_PERMISSIONS.canDownloadDocuments === true, "File download permitted");
  assert(
    isMissingMobilePermissionsSchema({ code: "PGRST204", message: "Could not find the mobile_access_enabled column in the schema cache" }),
    "Legacy mobile-permissions schema is detected safely"
  );
  assert(
    isMissingMobilePermissionsSchema({ code: "42501", message: "permission denied" }) === false,
    "Unrelated authorization errors never trigger legacy fallback"
  );

  // 3. Verify Cheque Reminder Categorization Logic
  const dateOnly = (offsetDays) => {
    const value = new Date();
    value.setHours(12, 0, 0, 0);
    value.setDate(value.getDate() + offsetDays);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = dateOnly(0);
  const tomorrow = dateOnly(1);
  const in3Days = dateOnly(3);
  const past5Days = dateOnly(-5);

  const urgencyToday = getChequeUrgency(today, "pending");
  assert(urgencyToday.isDueToday === true, "Today's cheque correctly flagged as Due Today");

  const urgencyOverdue = getChequeUrgency(past5Days, "pending");
  assert(urgencyOverdue.isOverdue === true, "Past cheque correctly flagged as Overdue");
  assert(isChequeOverdue(past5Days, "pending") === true, "isChequeOverdue returns true for pending past cheque");
  assert(isChequeOverdue(past5Days, "cleared") === false, "isChequeOverdue returns false for settled cleared cheque");

  const urgencyTomorrow = getChequeUrgency(tomorrow, "pending");
  assert(urgencyTomorrow.label === "Due Tomorrow", "Tomorrow's cheque correctly flagged as Due Tomorrow");

  const urgency3Days = getChequeUrgency(in3Days, "pending");
  assert(urgency3Days.days === 3, "In-3-days cheque correctly returns 3 days remaining");

  // 4. Test Summary
  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
