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
  computeChequeMetrics,
  getChequeUrgency,
  isChequeOverdue,
  getDaysDifference,
} = loadTs("lib/chequeTypes.ts");

const {
  buildCustomerReminderTemplate,
  buildSupervisorReminderTemplate,
  buildDeveloperTechnicalAlertTemplate,
} = loadTs("lib/emailService.ts");

const {
  normalizeWhatsAppNumber,
  generateChequeWhatsAppMessage,
  generateDailyDigestWhatsAppMessage,
  getWhatsAppShareUrl,
} = loadTs("lib/whatsappUtils.ts");


function runVerificationSuite() {
  console.log("================================================================================");
  console.log("   DUBAI ERP: FULL CHEQUE MANAGEMENT & REMINDER SYSTEM VERIFICATION SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Point 1 & 2: Financial Calculations & Retention
  // ---------------------------------------------------------------------------
  const testCheques = [
    {
      id: "chq-1",
      cheque_type: "incoming",
      cheque_number: "IN-1001",
      amount: 50000,
      due_date: new Intl.DateTimeFormat("en-CA").format(new Date()),
      status: "pending",
    },
    {
      id: "chq-2",
      cheque_type: "incoming",
      cheque_number: "IN-1002",
      amount: 30000,
      due_date: "2026-08-01",
      status: "pending", // overdue
    },
    {
      id: "chq-3",
      cheque_type: "outgoing",
      cheque_number: "OUT-2001",
      amount: 20000,
      due_date: "2026-10-15",
      status: "deposited",
    },
    {
      id: "chq-4",
      cheque_type: "outgoing",
      cheque_number: "OUT-2002",
      amount: 15000,
      due_date: "2026-09-01",
      status: "cleared", // cleared
    },
    {
      id: "chq-5",
      cheque_type: "incoming",
      cheque_number: "IN-1003",
      amount: 10000,
      due_date: "2026-09-10",
      status: "cancelled", // cancelled
    },
  ];

  const metrics = computeChequeMetrics(testCheques);
  assert(metrics.totalIncomingCount === 3, "Correct total incoming cheques count (3)");
  assert(metrics.totalIncomingAmount === 90000, "Correct total incoming amount (90,000 AED)");
  assert(metrics.totalOutgoingCount === 2, "Correct total outgoing cheques count (2)");
  assert(metrics.totalOutgoingAmount === 35000, "Correct total outgoing amount (35,000 AED)");
  assert(metrics.netPosition === 55000, "Correct net liquidity position (55,000 AED)");
  assert(metrics.dueTodayCount === 1, "Correct cheques due today count (1)");
  assert(metrics.overdueCount === 1, "Correct overdue cheques count (1)");
  assert(metrics.clearedAmount === 15000, "Correct cleared cheques amount (15,000 AED)");

  // ---------------------------------------------------------------------------
  // Point 3: Customer Reminders & Exact Part 6 Template
  // ---------------------------------------------------------------------------
  const customerTpl = buildCustomerReminderTemplate({
    customerName: "Al Futtaim Technologies",
    chequeNumber: "998877",
    amountFormatted: "AED 45,000.00",
    dueDate: "2026-10-05",
    companyName: "Dubai Enterprise LLC",
  });

  assert(customerTpl.subject === "Upcoming Cheque Reminder", "Customer subject matches Part 6 exact requirement");
  assert(customerTpl.text.includes("Dear Al Futtaim Technologies,"), "Customer greeting matches");
  assert(customerTpl.text.includes("cheque number 998877, amounting to AED 45,000.00, is due on 2026-10-05"), "Customer text matches exact template");
  assert(customerTpl.text.includes("Kindly ensure the necessary arrangements are made."), "Customer call to action matches");
  assert(customerTpl.text.includes("Dubai Enterprise LLC\nAccounts Department"), "Company branding matches");

  // ---------------------------------------------------------------------------
  // Point 4: Supervisor Reminders & Exact Part 6 Template
  // ---------------------------------------------------------------------------
  const supTpl = buildSupervisorReminderTemplate({
    chequeNumber: "998877",
    chequeType: "incoming",
    partyName: "Al Futtaim Technologies",
    bankName: "Emirates NBD",
    amountFormatted: "AED 45,000.00",
    dueDate: "2026-10-05",
    currentStatus: "pending",
    companyName: "Dubai Enterprise LLC",
  });

  assert(supTpl.subject === "Cheque Due — 998877", "Supervisor subject matches 'Cheque Due — [Cheque Number]'");
  assert(supTpl.text.includes("Incoming Cheque (Receipt)"), "Supervisor direction breakdown matches");
  assert(supTpl.text.includes("Al Futtaim Technologies"), "Supervisor party matches");
  assert(supTpl.text.includes("Emirates NBD"), "Supervisor bank matches");
  assert(supTpl.text.includes("PENDING"), "Supervisor status matches");

  // ---------------------------------------------------------------------------
  // Point 5: Developer Reminders, Diagnostics & Zero Credential Leakage
  // ---------------------------------------------------------------------------
  const rawLeakInfo = "Failed dispatch with key re_1234567890abcdef and Authorization: Bearer secret_token_xyz to postgres://user:pass123@db.supabase.co:5432";
  const devTpl = buildDeveloperTechnicalAlertTemplate({
    errorCategory: "Resend Gateway Timeout",
    failureTimestamp: "2026-09-26T22:00:00Z",
    jobReference: "/api/cron/cheque-reminders",
    diagnosticInfo: rawLeakInfo,
    suggestedSteps: ["Check Vercel Cron secrets", "Check Resend balance"],
  });

  assert(devTpl.subject === "Dubai ERP — Cheque Reminder Delivery Failure", "Developer alert subject matches Part 6");
  assert(!devTpl.text.includes("re_1234567890abcdef"), "API keys are automatically sanitized from diagnostic text");
  assert(!devTpl.text.includes("secret_token_xyz"), "Bearer tokens are automatically sanitized from diagnostic text");
  assert(!devTpl.text.includes("pass123"), "Database passwords are automatically sanitized from diagnostic text");
  assert(devTpl.text.includes("[REDACTED_API_KEY]"), "Mask placeholder replaces leaked keys");

  // ---------------------------------------------------------------------------
  // Point 6 & 7: WhatsApp Normalization & Message Link Generation
  // ---------------------------------------------------------------------------
  assert(normalizeWhatsAppNumber("055 123 4567") === "971551234567", "Normalizes UAE local mobile");
  assert(normalizeWhatsAppNumber("+971 50 999 8888") === "971509998888", "Normalizes +971 mobile with spaces");
  const waUrl = getWhatsAppShareUrl("050 111 2233", "Upcoming Cheque Reminder");
  assert(waUrl.startsWith("https://api.whatsapp.com/send?phone=971501112233&text="), "Constructs universal api.whatsapp.com link with encoded text");

  // ---------------------------------------------------------------------------
  // Point 8 & 9: Reminder Schedules & Cleared/Cancelled Exclusion
  // ---------------------------------------------------------------------------
  assert(getDaysDifference(new Intl.DateTimeFormat("en-CA").format(new Date())) === 0, "Calculates 0 days for today");
  assert(isChequeOverdue("2020-01-01", "pending") === true, "Marks past pending cheque as overdue");
  assert(isChequeOverdue("2020-01-01", "cleared") === false, "Never marks cleared cheque as overdue");
  assert(isChequeOverdue("2020-01-01", "cancelled") === false, "Never marks cancelled cheque as overdue");

  console.log("================================================================================");
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite();
