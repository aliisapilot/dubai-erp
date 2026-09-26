import {
  buildChequeReminderEmailHtml,
  sendChequeReminderEmail,
} from "../lib/emailService.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

console.log("================================================================================");
console.log("   TESTING CHEQUE WHATSAPP REMINDERS & EMAIL ENGINE");
console.log("================================================================================");

// 1. WhatsApp Number Normalization Unit Logic
function normalizeWhatsAppNumber(rawPhone) {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("05") && digits.length === 10) {
    digits = "971" + digits.substring(1);
  } else if (digits.startsWith("00")) {
    digits = digits.substring(2);
  }
  if (digits.length < 9) return null;
  return digits;
}

assert(
  normalizeWhatsAppNumber("050 123 4567") === "971501234567",
  "Normalizes UAE local 050 format to 971501234567"
);
assert(
  normalizeWhatsAppNumber("+971-55-987-6543") === "971559876543",
  "Normalizes +971 with dashes and spaces"
);
assert(
  normalizeWhatsAppNumber("00971521112233") === "971521112233",
  "Normalizes leading 00971 international prefix"
);
assert(
  normalizeWhatsAppNumber(null) === null,
  "Handles null phone gracefully"
);

// 2. WhatsApp URL generation
function getWhatsAppShareUrl(phone, message) {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (normalizedPhone) {
    return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

const testUrl = getWhatsAppShareUrl("050 999 8888", "Hello Test");
assert(testUrl.startsWith("https://wa.me/971509998888?text=Hello%20Test"), "Constructs proper wa.me link with encoded text");

// 3. HTML Email Template
const emailHtml = buildChequeReminderEmailHtml({
  title: "DUE TODAY: Cheque #987654",
  message: "Cheque #987654 of AED 25,000.00 is due today for presentation.",
  chequeNumber: "987654",
  amountFormatted: "AED 25,000.00",
  bankName: "Emirates NBD",
  dueDate: "2026-09-30",
  counterparty: "Al Futtaim Engineering",
  typeLabel: "Incoming Cheque",
});

assert(emailHtml.includes("Dubai ERP • Finance Alerts"), "Email contains branded header");
assert(emailHtml.includes("AED 25,000.00"), "Email contains formatted currency");
assert(emailHtml.includes("Open Cheque Register in ERP"), "Email contains action button");

// 4. Email Dispatch Fallback (when RESEND_API_KEY is not configured)
const dispatchRes = await sendChequeReminderEmail({
  to: "finance@example.com",
  subject: "Test Subject",
  html: emailHtml,
});

assert(
  dispatchRes.success === false && dispatchRes.provider === "disabled",
  "Gracefully detects missing RESEND_API_KEY without crashing"
);

console.log("================================================================================");
console.log("TEST SUMMARY: All WhatsApp and Email Reminder tests passed successfully!");
console.log("================================================================================");
