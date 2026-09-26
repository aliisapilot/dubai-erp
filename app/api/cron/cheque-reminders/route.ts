import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ChequeReminderType, getDaysDifference } from "@/lib/chequeTypes";
import { sendChequeReminderEmail, buildChequeReminderEmailHtml } from "@/lib/emailService";

/**
 * Scheduled Cheque Reminder Processing Endpoint
 * ============================================
 * Triggered automatically via Vercel Cron or scheduled HTTP calls.
 * Evaluates all uncleared cheques, sends notifications, and deduplicates.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authorization check
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron execution." }, { status: 401 });
    }

    // 2. Fetch all active companies
    const { data: companies, error: compErr } = await supabase.from("companies").select("id, name");
    if (compErr) throw compErr;

    let totalChecked = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const failures: { cheque_id: string; error: string }[] = [];

    for (const comp of companies || []) {
      const { data: cheques, error: chqErr } = await supabase
        .from("cheques")
        .select("*")
        .eq("company_id", comp.id)
        .in("status", ["pending", "deposited"]);

      if (chqErr || !cheques) continue;

      for (const c of cheques) {
        totalChecked++;
        const days = getDaysDifference(c.due_date);
        let reminderType: ChequeReminderType | null = null;
        let title = "";
        let message = "";

        const typeLabel = c.cheque_type === "incoming" ? "Incoming Cheque" : "Outgoing Cheque";
        const party = c.payee_name || "Counterparty";

        if (days === 7) {
          reminderType = "7_days_before";
          title = `7-Day Notice: Cheque #${c.cheque_number}`;
          message = `${typeLabel} of AED ${Number(c.amount).toLocaleString()} from/to ${party} matures in 7 days on ${c.due_date}.`;
        } else if (days === 3) {
          reminderType = "3_days_before";
          title = `3-Day Alert: Cheque #${c.cheque_number}`;
          message = `${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} matures in 3 days.`;
        } else if (days === 1) {
          reminderType = "1_day_before";
          title = `Tomorrow Due: Cheque #${c.cheque_number}`;
          message = `High Priority: ${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} matures tomorrow.`;
        } else if (days === 0) {
          reminderType = "due_today";
          title = `DUE TODAY: Cheque #${c.cheque_number}`;
          message = `Action Required: Cheque #${c.cheque_number} (AED ${Number(c.amount).toLocaleString()}, ${c.bank_name}) is due today for deposit.`;
        } else if (days < 0) {
          reminderType = "overdue";
          title = `OVERDUE CHEQUE: #${c.cheque_number} (${Math.abs(days)}d past due)`;
          message = `Attention: ${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} is overdue since ${c.due_date}.`;
        }

        if (!reminderType) continue;

        const recipientEmail = process.env.REMINDER_NOTIFICATION_EMAIL;
        const channel = recipientEmail && process.env.RESEND_API_KEY ? "both" : "in_app";

        // Idempotent insertion protected by unique constraint
        const { data: inserted, error: insErr } = await supabase
          .from("cheque_reminders")
          .insert({
            company_id: comp.id,
            cheque_id: c.id,
            reminder_type: reminderType,
            due_date: c.due_date,
            recipient_email: recipientEmail || null,
            notification_title: title,
            notification_message: message,
            channel: channel,
            status: "pending",
          })
          .select("id");

        if (insErr) {
          // If error is unique constraint duplicate, it's expected and skipped
          if (insErr.code === "23505" || insErr.message.includes("uq_cheque_reminder_dedup")) {
            totalSkipped++;
          } else {
            failures.push({ cheque_id: c.id, error: insErr.message });
          }
        } else if (inserted && inserted.length > 0) {
          totalCreated++;
          const reminderId = inserted[0].id;

          // Dispatch email if recipient and API key are configured
          if (recipientEmail && process.env.RESEND_API_KEY) {
            const html = buildChequeReminderEmailHtml({
              title,
              message,
              chequeNumber: c.cheque_number,
              amountFormatted: `AED ${Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              bankName: c.bank_name,
              dueDate: c.due_date,
              counterparty: party,
              typeLabel,
            });

            const emailRes = await sendChequeReminderEmail({
              to: recipientEmail,
              subject: `[Cheque Alert] ${title}`,
              html,
            });

            if (emailRes.success) {
              await supabase
                .from("cheque_reminders")
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                })
                .eq("id", reminderId);
            } else {
              await supabase
                .from("cheque_reminders")
                .update({
                  delivery_error: emailRes.error || "Email delivery failed",
                })
                .eq("id", reminderId);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        totalChecked,
        totalCreated,
        totalSkipped,
        failedCount: failures.length,
      },
      failures,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Scheduled reminder cron error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
