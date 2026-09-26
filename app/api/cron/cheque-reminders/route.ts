import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  ChequeReminderType,
  CustomerReminderConfigRecord,
  getDaysDifference,
} from "@/lib/chequeTypes";
import { fmtAED } from "@/lib/helpers";
import {
  sendChequeReminderEmail,
  buildCustomerReminderTemplate,
  buildSupervisorReminderTemplate,
  buildDeveloperTechnicalAlertTemplate,
} from "@/lib/emailService";

/**
 * Scheduled Cheque Reminder Processing Endpoint
 * ============================================
 * Triggered automatically via Vercel Cron or scheduled HTTP calls.
 * Evaluates all uncleared cheques, respects customer consent,
 * sends multi-category notifications (Customer, Supervisor, External),
 * and dispatches technical diagnostic alerts to Developer on failures.
 */
export async function GET(req: NextRequest) {
  const timestamp = new Date().toISOString();
  let developerEmailToAlert: string | null = process.env.DEVELOPER_EMAIL || null;

  try {
    // 1. Authorization check
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron execution." }, { status: 401 });
    }

    // 2. Fetch all active companies
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name");
    if (compErr) throw compErr;

    let totalChecked = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let customerSentCount = 0;
    let supervisorSentCount = 0;
    const failures: { cheque_id: string; recipient: string; error: string }[] = [];

    for (const comp of companies || []) {
      // 3. Load Company Settings, Recipients & Customer Preferences
      const [
        { data: settings },
        { data: recipients },
        { data: customerConfigs },
        { data: cheques, error: chqErr },
      ] = await Promise.all([
        supabase
          .from("company_cheque_settings")
          .select("*")
          .eq("company_id", comp.id)
          .maybeSingle(),
        supabase
          .from("cheque_reminder_recipients")
          .select("*")
          .eq("company_id", comp.id)
          .eq("is_enabled", true),
        supabase
          .from("customer_reminder_configs")
          .select("*")
          .eq("company_id", comp.id),
        supabase
          .from("cheques")
          .select(`
            *,
            customer:customers(id, name, email, phone),
            supplier:suppliers(id, name, email, phone),
            tax_invoice:tax_invoices(id, invoice_number)
          `)
          .eq("company_id", comp.id)
          .in("status", ["pending", "deposited"]),
      ]);

      if (chqErr || !cheques) continue;

      if (settings?.developer_email) {
        developerEmailToAlert = settings.developer_email;
      }

      // Map customer preferences by customer ID
      const custPrefMap = new Map<string, CustomerReminderConfigRecord>();
      (customerConfigs || []).forEach((c) => custPrefMap.set(c.customer_id, c));

      // Separate recipients by category
      const supervisors = (recipients || []).filter(
        (r) => r.recipient_category === "supervisor"
      );
      const externalRecipients = (recipients || []).filter(
        (r) => r.recipient_category === "external"
      );

      for (const c of cheques) {
        totalChecked++;

        // RE-CHECK STATUS IMMEDIATELY (Part 2: Never alert for cleared or cancelled)
        if (c.status === "cleared" || c.status === "cancelled") {
          totalSkipped++;
          continue;
        }

        const days = getDaysDifference(c.due_date);
        let reminderType: ChequeReminderType | null = null;

        if (days === 7) reminderType = "7_days_before";
        else if (days === 3) reminderType = "3_days_before";
        else if (days === 1) reminderType = "1_day_before";
        else if (days === 0) reminderType = "due_today";
        else if (days < 0) reminderType = "overdue";

        if (!reminderType) continue;

        const isIncoming = c.cheque_type === "incoming";
        const partyName =
          (isIncoming ? c.customer?.name : c.supplier?.name) ||
          c.payee_name ||
          "Counterparty";
        const amountStr = fmtAED(c.amount);

        // 4. Record Deduplicated Reminder in Database
        const { data: inserted, error: insErr } = await supabase
          .from("cheque_reminders")
          .insert({
            company_id: comp.id,
            cheque_id: c.id,
            reminder_type: reminderType,
            due_date: c.due_date,
            notification_title: `Cheque Reminder: #${c.cheque_number}`,
            notification_message: `${c.cheque_type} cheque of ${amountStr} for ${partyName} due on ${c.due_date}`,
            channel: "both",
            status: "pending",
          })
          .select("id");

        if (insErr) {
          // If unique constraint duplicate, it has already been sent for this due date threshold
          if (insErr.code === "23505" || insErr.message.includes("uq_cheque_reminder_dedup")) {
            totalSkipped++;
            continue;
          } else {
            failures.push({
              cheque_id: c.id,
              recipient: "database",
              error: insErr.message,
            });
            continue;
          }
        }

        totalCreated++;
        const reminderId = inserted?.[0]?.id;

        // 5. DISPATCH CUSTOMER REMINDER (Part 3.C: Strictly for incoming cheques with consent)
        if (isIncoming && c.customer) {
          const custCfg = custPrefMap.get(c.customer.id);
          const isOptedOut = custCfg?.opt_out === true;
          const isEmailEnabled = custCfg ? custCfg.email_enabled : true;
          const targetEmail = custCfg?.override_email || c.customer.email;

          // Only send if customer is not opted out and email reminders are active
          if (!isOptedOut && isEmailEnabled && targetEmail) {
            const customerTpl = buildCustomerReminderTemplate({
              customerName: c.customer.name || "Valued Client",
              chequeNumber: c.cheque_number,
              amountFormatted: amountStr,
              dueDate: c.due_date,
              companyName: comp.name,
            });

            const emailRes = await sendChequeReminderEmail({
              to: targetEmail,
              subject: customerTpl.subject,
              html: customerTpl.html,
            });

            if (emailRes.success) {
              customerSentCount++;
            } else {
              failures.push({
                cheque_id: c.id,
                recipient: `customer:${targetEmail}`,
                error: emailRes.error || "Customer email delivery failed",
              });
            }
          }
        }

        // 6. DISPATCH SUPERVISOR REMINDERS (Part 3.A)
        for (const sup of supervisors) {
          const prefs = sup.preferences || {};
          const isSubscribedToType = isIncoming ? prefs.incoming !== false : prefs.outgoing !== false;
          const isSubscribedToTiming =
            days === 0
              ? prefs.due_today !== false
              : days < 0
              ? prefs.overdue !== false
              : true;

          if (isSubscribedToType && isSubscribedToTiming && sup.email) {
            const supTpl = buildSupervisorReminderTemplate({
              chequeNumber: c.cheque_number,
              chequeType: c.cheque_type,
              partyName,
              bankName: c.bank_name,
              amountFormatted: amountStr,
              dueDate: c.due_date,
              currentStatus: c.status,
              companyName: comp.name,
            });

            const emailRes = await sendChequeReminderEmail({
              to: sup.email,
              subject: supTpl.subject,
              html: supTpl.html,
            });

            if (emailRes.success) {
              supervisorSentCount++;
            } else {
              failures.push({
                cheque_id: c.id,
                recipient: `supervisor:${sup.email}`,
                error: emailRes.error || "Supervisor email delivery failed",
              });
            }
          }
        }

        // 7. DISPATCH EXTERNAL RECIPIENTS (Part 4: Assigned scope check)
        for (const ext of externalRecipients) {
          const assignedCusts = ext.assigned_customer_ids || [];
          const assignedChqs = ext.assigned_cheque_ids || [];

          const isAssigned =
            (assignedCusts.length === 0 && assignedChqs.length === 0) ||
            (c.customer_id && assignedCusts.includes(c.customer_id)) ||
            assignedChqs.includes(c.id);

          if (isAssigned && ext.email) {
            const supTpl = buildSupervisorReminderTemplate({
              chequeNumber: c.cheque_number,
              chequeType: c.cheque_type,
              partyName,
              bankName: c.bank_name,
              amountFormatted: amountStr,
              dueDate: c.due_date,
              currentStatus: c.status,
              companyName: comp.name,
            });

            await sendChequeReminderEmail({
              to: ext.email,
              subject: supTpl.subject,
              html: supTpl.html,
            });
          }
        }

        // Update reminder delivery status
        if (reminderId) {
          await supabase
            .from("cheque_reminders")
            .update({
              status: failures.some((f) => f.cheque_id === c.id) ? "failed" : "sent",
              sent_at: new Date().toISOString(),
              delivery_error: failures.find((f) => f.cheque_id === c.id)?.error || null,
            })
            .eq("id", reminderId);
        }
      }
    }

    // 8. DISPATCH DEVELOPER TECHNICAL ALERT IF FAILURES OCCURRED (Part 3.B & Part 6)
    if (failures.length > 0 && developerEmailToAlert) {
      const alertTpl = buildDeveloperTechnicalAlertTemplate({
        errorCategory: "Cheque Reminder Delivery Warning",
        failureTimestamp: timestamp,
        jobReference: "/api/cron/cheque-reminders",
        diagnosticInfo: `Encountered ${failures.length} delivery error(s):\n` +
          failures.map((f) => `• [${f.recipient}] ${f.error}`).join("\n"),
        suggestedSteps: [
          "Inspect recipient email validity in Cheque Reminder Settings.",
          "Verify Resend API Key quota and DNS DKIM records.",
          "Check database connection stability for public.cheque_reminders.",
        ],
      });

      await sendChequeReminderEmail({
        to: developerEmailToAlert,
        subject: alertTpl.subject,
        html: alertTpl.html,
      });
    }

    return NextResponse.json({
      success: true,
      timestamp,
      metrics: {
        totalChecked,
        totalCreated,
        totalSkipped,
        customerSentCount,
        supervisorSentCount,
        failureCount: failures.length,
      },
      failures,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Scheduled reminder cron error:", errorMsg);

    // Send technical failure alert to developer on unexpected exception
    if (developerEmailToAlert) {
      const alertTpl = buildDeveloperTechnicalAlertTemplate({
        errorCategory: "Critical Cron Execution Exception",
        failureTimestamp: timestamp,
        jobReference: "/api/cron/cheque-reminders",
        diagnosticInfo: errorMsg,
        suggestedSteps: [
          "Check Supabase database connectivity and schema cache.",
          "Verify Vercel function timeout configuration.",
          "Check CRON_SECRET authorization header.",
        ],
      });

      await sendChequeReminderEmail({
        to: developerEmailToAlert,
        subject: alertTpl.subject,
        html: alertTpl.html,
      });
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
