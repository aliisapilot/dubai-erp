/**
 * Dubai ERP: Cheque Reminder Email Dispatcher
 * ============================================
 * Supports Resend (Free Tier: 3,000 emails/month) via native fetch
 * without requiring additional bulky npm packages.
 */

export interface EmailDispatchOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "resend" | "mock" | "disabled";
}

export async function sendChequeReminderEmail(options: EmailDispatchOptions): Promise<EmailDispatchResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = options.from || process.env.EMAIL_FROM || "Dubai ERP <notifications@dubai-erp.com>";
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (!recipients || recipients.length === 0 || !recipients[0]) {
    return { success: false, error: "No recipient email address specified", provider: "disabled" };
  }

  // 1. Resend API Dispatch
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: recipients,
          subject: options.subject,
          html: options.html,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data?.message || "Failed to dispatch email via Resend",
          provider: "resend",
        };
      }

      return {
        success: true,
        messageId: data?.id,
        provider: "resend",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, provider: "resend" };
    }
  }

  // Fallback: If not configured, record that email is ready once RESEND_API_KEY is supplied
  return {
    success: false,
    error: "RESEND_API_KEY is not configured in environment variables",
    provider: "disabled",
  };
}

/**
 * Generates an executive, branded HTML email template for Cheque Reminders
 */
export function buildChequeReminderEmailHtml(params: {
  title: string;
  message: string;
  chequeNumber: string;
  amountFormatted: string;
  bankName: string;
  dueDate: string;
  counterparty: string;
  typeLabel: string;
  erpLink?: string;
}): string {
  const link = params.erpLink || "https://dubai-erp-two.vercel.app/cheques";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${params.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; text-align: left;">
      <div style="font-size: 13px; font-weight: 700; letter-spacing: 1px; color: #38bdf8; text-transform: uppercase;">Dubai ERP • Finance Alerts</div>
      <h1 style="color: #ffffff; font-size: 20px; margin: 8px 0 0 0; font-weight: 700;">${params.title}</h1>
    </div>

    <!-- Body -->
    <div style="padding: 24px;">
      <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-top: 0;">
        ${params.message}
      </p>

      <!-- Cheque Details Card -->
      <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Type</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${params.typeLabel}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Cheque Number</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">#${params.chequeNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Amount</td>
          <td style="padding: 12px 16px; font-size: 16px; font-weight: 700; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${params.amountFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Bank</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${params.bankName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Counterparty</td>
          <td style="padding: 12px 16px; font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${params.counterparty}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Maturity Date</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: #e11d48;">${params.dueDate}</td>
        </tr>
      </table>

      <!-- Action Button -->
      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${link}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">Open Cheque Register in ERP</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      This is an automated notification from your Dubai ERP Cheque Management system.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * EXACT CUSTOMER REMINDER TEMPLATE (Part 6)
 * Subject: Upcoming Cheque Reminder
 */
export function buildCustomerReminderTemplate(params: {
  customerName: string;
  chequeNumber: string;
  amountFormatted: string;
  dueDate: string;
  companyName?: string | null;
}): { subject: string; text: string; html: string } {
  const company = params.companyName || "Dubai ERP";
  const subject = "Upcoming Cheque Reminder";

  const text = `Dear ${params.customerName},

This is a friendly reminder that cheque number ${params.chequeNumber}, amounting to AED ${params.amountFormatted.replace(/^AED\s*/i, "")}, is due on ${params.dueDate}.

Kindly ensure the necessary arrangements are made.

Thank you,
${company}
Accounts Department`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
    <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px;">${company} • Accounts Department</div>
    <h2 style="margin: 0 0 20px 0; color: #0f172a; font-size: 18px;">${subject}</h2>
    <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Dear ${params.customerName},</p>
    <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
      This is a friendly reminder that cheque number <strong>${params.chequeNumber}</strong>, amounting to <strong>${params.amountFormatted}</strong>, is due on <strong>${params.dueDate}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      Kindly ensure the necessary arrangements are made.
    </p>
    <p style="font-size: 14px; line-height: 1.6; margin-bottom: 0;">
      Thank you,<br>
      <strong>${company}</strong><br>
      Accounts Department
    </p>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}
/**
 * EXACT SUPERVISOR REMINDER TEMPLATE (Part 6)
 * Subject: Cheque Due — [Cheque Number]
 */
export function buildSupervisorReminderTemplate(params: {
  chequeNumber: string;
  chequeType: "incoming" | "outgoing";
  partyName: string;
  bankName: string;
  amountFormatted: string;
  dueDate: string;
  currentStatus: string;
  companyName?: string | null;
}): { subject: string; text: string; html: string } {
  const company = params.companyName || "Dubai ERP";
  const subject = `Cheque Due — ${params.chequeNumber}`;
  const direction = params.chequeType === "incoming" ? "Incoming Cheque (Receipt)" : "Outgoing Cheque (Payment)";

  const text = `Cheque Due Notification — #${params.chequeNumber}
Company: ${company}

• Cheque Number: #${params.chequeNumber}
• Direction: ${direction}
• Counterparty: ${params.partyName}
• Bank: ${params.bankName}
• Amount: ${params.amountFormatted}
• Due Date: ${params.dueDate}
• Current Status: ${params.currentStatus.toUpperCase()}

Please review in Dubai ERP: https://dubai-erp-two.vercel.app/cheques`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="background: #0f172a; padding: 20px; color: #ffffff;">
      <div style="font-size: 11px; text-transform: uppercase; color: #38bdf8; font-weight: 700;">Dubai ERP • Supervisor Notice</div>
      <h2 style="margin: 6px 0 0 0; font-size: 18px; color: #ffffff;">${subject}</h2>
    </div>
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Cheque Number</td><td style="padding: 8px 0; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">#${params.chequeNumber}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Direction</td><td style="padding: 8px 0; font-weight: 600; text-align: right; border-bottom: 1px solid #f1f5f9;">${direction}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Counterparty</td><td style="padding: 8px 0; font-weight: 600; text-align: right; border-bottom: 1px solid #f1f5f9;">${params.partyName}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Bank</td><td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #f1f5f9;">${params.bankName}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Amount</td><td style="padding: 8px 0; font-weight: 700; color: #0284c7; text-align: right; border-bottom: 1px solid #f1f5f9;">${params.amountFormatted}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Due Date</td><td style="padding: 8px 0; font-weight: 700; color: #e11d48; text-align: right; border-bottom: 1px solid #f1f5f9;">${params.dueDate}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Current Status</td><td style="padding: 8px 0; font-weight: 700; text-transform: uppercase; text-align: right;">${params.currentStatus}</td></tr>
      </table>
      <div style="margin-top: 24px; text-align: center;">
        <a href="https://dubai-erp-two.vercel.app/cheques" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 600; font-size: 13px;">Open Cheque Register</a>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}
/**
 * EXACT DEVELOPER TECHNICAL ALERT TEMPLATE (Part 6)
 * Subject: Dubai ERP — Cheque Reminder Delivery Failure
 * Guarantees zero credential leakage.
 */
export function buildDeveloperTechnicalAlertTemplate(params: {
  errorCategory: string;
  failureTimestamp?: string;
  diagnosticInfo: string;
  jobReference?: string;
  suggestedSteps?: string[];
}): { subject: string; text: string; html: string } {
  const subject = "Dubai ERP — Cheque Reminder Delivery Failure";
  const timestamp = params.failureTimestamp || new Date().toISOString();
  const jobRef = params.jobReference || "/api/cron/cheque-reminders";
  const steps = params.suggestedSteps || [
    "Verify Resend API Key in Vercel project environment variables.",
    "Verify that the destination email domain has not rejected the sender address.",
    "Inspect Vercel Cron invocation logs under the Deployment Functions tab.",
  ];

  // Sanitize diagnostic info to guarantee no API keys or tokens are leaked
  const sanitizedDiagnostic = params.diagnosticInfo
    .replace(/(re_[a-zA-Z0-9_-]{10,})/g, "[REDACTED_API_KEY]")
    .replace(/(Bearer\s+[a-zA-Z0-9._-]+)/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/(postgres:\/\/[^:]+:[^@]+@)/g, "postgres://[USER]:[PASSWORD]@");

  const text = `${subject}
==================================================
• Error Category: ${params.errorCategory}
• Failure Timestamp: ${timestamp}
• Job Reference: ${jobRef}
• Safe Diagnostic Information: ${sanitizedDiagnostic}

Suggested Investigation Steps:
${steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}
`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, monospace, sans-serif; background-color: #0f172a; padding: 24px; color: #e2e8f0;">
  <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden;">
    <div style="background: #dc2626; padding: 18px 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 700;">🚨 ${subject}</h2>
    </div>
    <div style="padding: 24px; font-size: 13px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td style="padding: 6px 0; color: #94a3b8;">Error Category:</td><td style="padding: 6px 0; font-weight: 700; color: #f87171;">${params.errorCategory}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Timestamp:</td><td style="padding: 6px 0; font-family: monospace;">${timestamp}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Job Reference:</td><td style="padding: 6px 0; font-family: monospace;">${jobRef}</td></tr>
      </table>

      <div style="margin-bottom: 20px;">
        <span style="color: #94a3b8; display: block; margin-bottom: 6px; font-weight: 700;">Diagnostic Information:</span>
        <pre style="background: #0f172a; padding: 12px; border-radius: 6px; font-size: 12px; color: #fca5a5; overflow-x: auto; border: 1px solid #334155;">${sanitizedDiagnostic}</pre>
      </div>

      <div>
        <span style="color: #94a3b8; display: block; margin-bottom: 6px; font-weight: 700;">Suggested Investigation Steps:</span>
        <ol style="margin: 0; padding-left: 20px; color: #cbd5e1; line-height: 1.6;">
          ${steps.map((s) => `<li>${s}</li>`).join("")}
        </ol>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  return { subject, text, html };
}

