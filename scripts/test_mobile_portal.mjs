import {
  MOBILE_CATEGORY_TABS,
  getCategoryLabel,
  getCategoryBadgeColor,
  DEFAULT_PERMISSIONS,
} from "../lib/mobilePortalTypes.ts";
import { getChequeUrgency, isChequeOverdue } from "../lib/chequeTypes.ts";

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

  // 3. Verify Cheque Reminder Categorization Logic
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in20Days = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const past5Days = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

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
