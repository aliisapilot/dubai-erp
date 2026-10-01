import { ChequeRecord, getDaysDifference } from "./chequeTypes";
import { fmtAED } from "./helpers";

/**
 * Normalizes UAE or International phone numbers for WhatsApp API links.
 * Example inputs:
 *  "050 123 4567" -> "971501234567"
 *  "+971 50-1234567" -> "971501234567"
 *  "00971501234567" -> "971501234567"
 *  "971501234567" -> "971501234567"
 */
export function normalizeWhatsAppNumber(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  
  // Remove non-digit characters
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;

  // Handle UAE local format: starts with 05X
  if (digits.startsWith("05") && digits.length === 10) {
    digits = "971" + digits.substring(1);
  } else if (digits.startsWith("00")) {
    digits = digits.substring(2);
  }

  // Basic sanity check: international numbers are usually 10-15 digits
  if (digits.length < 9) return null;

  return digits;
}

/**
 * Generates a formal, professional UAE business WhatsApp reminder message
 * for a specific cheque.
 */
export function generateChequeWhatsAppMessage(cheque: ChequeRecord, companyName?: string | null): string {
  const party = cheque.payee_name || cheque.customer?.name || cheque.supplier?.name || "Valued Client";
  const days = getDaysDifference(cheque.due_date);
  const company = companyName || "Dubai ERP Finance";
  const amountStr = fmtAED(cheque.amount);

  let urgency = "";
  if (days === 0) {
    urgency = "*DUE TODAY*";
  } else if (days === 1) {
    urgency = "*DUE TOMORROW*";
  } else if (days < 0) {
    urgency = `*OVERDUE by ${Math.abs(days)} days*`;
  } else {
    urgency = `Due in ${days} days (${cheque.due_date})`;
  }

  const isIncoming = cheque.cheque_type === "incoming";
  const header = isIncoming
    ? `📋 *PAYMENT CHEQUE REMINDER*`
    : `📋 *OUTGOING CHEQUE ADVICE*`;

  const instruction = isIncoming
    ? `Kindly ensure that sufficient funds are maintained in your account prior to deposit.`
    : `Please be advised that this cheque has been issued and scheduled for presentation.`;

  return [
    header,
    `----------------------------------------`,
    `Dear ${party},`,
    ``,
    `This is a courtesy notice regarding the following cheque:`,
    ``,
    `• *Cheque Number:* #${cheque.cheque_number}`,
    `• *Amount:* ${amountStr}`,
    `• *Bank:* ${cheque.bank_name}`,
    `• *Due Date:* ${cheque.due_date} (${urgency})`,
    cheque.tax_invoice ? `• *Reference Invoice:* #${cheque.tax_invoice.invoice_number}` : "",
    ``,
    instruction,
    ``,
    `For any clarifications, please feel free to contact our accounts department.`,
    ``,
    `Best regards,`,
    `*${company}*`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Generates a consolidated Daily Digest message of today's maturing & overdue cheques
 * to send to the company finance team or business owner.
 */
export function generateDailyDigestWhatsAppMessage(cheques: ChequeRecord[], companyName?: string | null): string {
  const company = companyName || "Dubai ERP";
  const today = new Date().toISOString().split("T")[0];

  const dueToday = cheques.filter((c) => c.due_date === today && ["pending", "deposited"].includes(c.status));
  const overdue = cheques.filter((c) => c.due_date < today && ["pending", "deposited"].includes(c.status));

  const totalDueTodayAmt = dueToday.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalOverdueAmt = overdue.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const lines = [
    `📊 *CHEQUE MANAGEMENT DAILY DIGEST*`,
    `🏢 *${company}* | 📅 Date: ${today}`,
    `========================================`,
    ``,
    `*Summary:*`,
    `• Due Today: ${dueToday.length} cheque(s) — ${fmtAED(totalDueTodayAmt)}`,
    `• Overdue: ${overdue.length} cheque(s) — ${fmtAED(totalOverdueAmt)}`,
    ``,
  ];

  if (dueToday.length > 0) {
    lines.push(`⏰ *MATURING TODAY:*`);
    dueToday.slice(0, 5).forEach((c) => {
      const party = c.payee_name || c.customer?.name || c.supplier?.name || "N/A";
      lines.push(`• #${c.cheque_number} | ${fmtAED(c.amount)} | ${party} (${c.bank_name})`);
    });
    if (dueToday.length > 5) {
      lines.push(`  ...and ${dueToday.length - 5} more`);
    }
    lines.push(``);
  }

  if (overdue.length > 0) {
    lines.push(`🚨 *OVERDUE CHEQUES:*`);
    overdue.slice(0, 5).forEach((c) => {
      const party = c.payee_name || c.customer?.name || c.supplier?.name || "N/A";
      const days = Math.abs(getDaysDifference(c.due_date));
      lines.push(`• #${c.cheque_number} | ${fmtAED(c.amount)} | ${party} (${days}d overdue)`);
    });
    if (overdue.length > 5) {
      lines.push(`  ...and ${overdue.length - 5} more`);
    }
    lines.push(``);
  }

  lines.push(`🔗 Open ERP: https://dubai-erp-two.vercel.app/cheques`);
  return lines.join("\n");
}

/**
 * Builds the direct WhatsApp Web / App intent link
 */
export function getWhatsAppShareUrl(phone: string | null | undefined, message: string): string {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message);
  
  if (normalizedPhone) {
    return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Triggers opening WhatsApp in a new browser tab/app
 * Uses a dynamic anchor element click to reliably bypass browser popup blockers.
 */
export function openWhatsApp(phone: string | null | undefined, message: string): void {
  const url = getWhatsAppShareUrl(phone, message);
  if (typeof window !== "undefined") {
    try {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}
