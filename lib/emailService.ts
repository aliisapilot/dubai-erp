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
