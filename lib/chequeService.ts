import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber, todayISO } from "@/lib/helpers";
import {
  ChequeRecord,
  ChequeStatus,
  ChequeStatusHistoryRecord,
  ChequeFormInput,
  ChequeReminderRecord,
  ChequeReminderType,
  getDaysDifference,
} from "./chequeTypes";
import { parseDatabaseError } from "./paymentTypes";

/**
 * Loads cheques with rich joined relations for display and reporting.
 */
export async function fetchCheques(options?: {
  type?: "incoming" | "outgoing";
  status?: ChequeStatus;
  customerId?: string;
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ChequeRecord[]> {
  let query = supabase
    .from("cheques")
    .select(
      `
      *,
      customer:customers(id, name, customer_code, trn, phone),
      supplier:suppliers(id, name, supplier_code, trn, phone),
      tax_invoice:tax_invoices(id, invoice_number, total_amount),
      supplier_bill:supplier_bills(id, bill_number, total_amount, paid_amount)
    `
    )
    .order("due_date", { ascending: true });

  if (options?.type) {
    query = query.eq("cheque_type", options.type);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.customerId) {
    query = query.eq("customer_id", options.customerId);
  }
  if (options?.supplierId) {
    query = query.eq("supplier_id", options.supplierId);
  }
  if (options?.fromDate) {
    query = query.gte("due_date", options.fromDate);
  }
  if (options?.toDate) {
    query = query.lte("due_date", options.toDate);
  }

  const { data, error } = await query;
  if (error) throw new Error(parseDatabaseError(error, "Failed to load cheques"));
  return (data || []) as ChequeRecord[];
}

/**
 * Loads a single cheque by ID with all relations and history
 */
export async function fetchChequeById(id: string): Promise<{
  cheque: ChequeRecord;
  history: ChequeStatusHistoryRecord[];
}> {
  const [{ data: cheque, error: cErr }, { data: history, error: hErr }] = await Promise.all([
    supabase
      .from("cheques")
      .select(
        `
        *,
        customer:customers(id, name, customer_code, trn, phone),
        supplier:suppliers(id, name, supplier_code, trn, phone),
        tax_invoice:tax_invoices(id, invoice_number, total_amount),
        supplier_bill:supplier_bills(id, bill_number, total_amount, paid_amount)
      `
      )
      .eq("id", id)
      .single(),
    supabase
      .from("cheque_status_history")
      .select("*")
      .eq("cheque_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (cErr) throw new Error(parseDatabaseError(cErr, "Failed to retrieve cheque"));
  if (hErr) console.warn("Failed to load cheque history:", hErr.message);

  return {
    cheque: cheque as ChequeRecord,
    history: (history || []) as ChequeStatusHistoryRecord[],
  };
}

/**
 * Creates a new incoming or outgoing cheque with validation and audit history
 */
export async function createCheque(input: ChequeFormInput): Promise<ChequeRecord> {
  const amt = Number(input.amount);
  if (!amt || amt <= 0) {
    throw new Error("Cheque amount must be greater than 0 AED.");
  }
  if (!input.cheque_number?.trim()) {
    throw new Error("Cheque number is required.");
  }
  if (!input.bank_name?.trim()) {
    throw new Error("Bank name is required.");
  }
  if (!input.issue_date) {
    throw new Error("Issue date is required.");
  }
  if (!input.due_date) {
    throw new Error("Due / Maturity date is required.");
  }
  if (input.cheque_type === "incoming" && !input.customer_id && !input.payee_name) {
    throw new Error("Please select a customer or enter drawer/payee name.");
  }
  if (input.cheque_type === "outgoing" && !input.supplier_id && !input.payee_name) {
    throw new Error("Please select a supplier or enter beneficiary name.");
  }

  const companyId = await getCompanyId();
  const { data: userData } = await supabase.auth.getUser();

  const payload = {
    company_id: companyId,
    cheque_type: input.cheque_type,
    cheque_number: input.cheque_number.trim(),
    bank_name: input.bank_name.trim(),
    branch_name: input.branch_name?.trim() || null,
    amount: amt,
    issue_date: input.issue_date,
    due_date: input.due_date,
    customer_id: input.cheque_type === "incoming" ? input.customer_id || null : null,
    supplier_id: input.cheque_type === "outgoing" ? input.supplier_id || null : null,
    payee_name: input.payee_name?.trim() || null,
    tax_invoice_id: input.tax_invoice_id || null,
    supplier_bill_id: input.supplier_bill_id || null,
    status: "pending" as ChequeStatus,
    responsible_employee_id: input.responsible_employee_id || null,
    responsible_employee_name: input.responsible_employee_name?.trim() || null,
    notes: input.notes?.trim() || null,
    cheque_image_front_url: input.cheque_image_front_url || null,
    cheque_image_back_url: input.cheque_image_back_url || null,
    deposit_slip_url: input.deposit_slip_url || null,
    bounce_slip_url: input.bounce_slip_url || null,
    created_by: userData?.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: insertErr } = await supabase
    .from("cheques")
    .insert(payload)
    .select()
    .single();

  if (insertErr) throw new Error(parseDatabaseError(insertErr, "Failed to create cheque"));

  // Initial audit trail entry
  await supabase.from("cheque_status_history").insert({
    company_id: companyId,
    cheque_id: created.id,
    from_status: null,
    to_status: "pending",
    action_date: todayISO(),
    action_by: userData?.user?.id || null,
    action_by_name: userData?.user?.email || "System User",
    notes: `Cheque created as Pending (${input.cheque_type === "incoming" ? "Inward Receipt" : "Outward Disbursement"}).`,
  });

  return created as ChequeRecord;
}

/**
 * Updates an existing cheque's general details
 */
export async function updateCheque(id: string, input: Partial<ChequeFormInput>): Promise<void> {
  const companyId = await getCompanyId();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.cheque_number !== undefined) updatePayload.cheque_number = input.cheque_number.trim();
  if (input.bank_name !== undefined) updatePayload.bank_name = input.bank_name.trim();
  if (input.branch_name !== undefined) updatePayload.branch_name = input.branch_name?.trim() || null;
  if (input.amount !== undefined) updatePayload.amount = Number(input.amount);
  if (input.issue_date !== undefined) updatePayload.issue_date = input.issue_date;
  if (input.due_date !== undefined) updatePayload.due_date = input.due_date;
  if (input.customer_id !== undefined) updatePayload.customer_id = input.customer_id || null;
  if (input.supplier_id !== undefined) updatePayload.supplier_id = input.supplier_id || null;
  if (input.payee_name !== undefined) updatePayload.payee_name = input.payee_name?.trim() || null;
  if (input.tax_invoice_id !== undefined) updatePayload.tax_invoice_id = input.tax_invoice_id || null;
  if (input.supplier_bill_id !== undefined) updatePayload.supplier_bill_id = input.supplier_bill_id || null;
  if (input.responsible_employee_id !== undefined) updatePayload.responsible_employee_id = input.responsible_employee_id || null;
  if (input.responsible_employee_name !== undefined) updatePayload.responsible_employee_name = input.responsible_employee_name?.trim() || null;
  if (input.notes !== undefined) updatePayload.notes = input.notes?.trim() || null;
  if (input.cheque_image_front_url !== undefined) updatePayload.cheque_image_front_url = input.cheque_image_front_url || null;
  if (input.cheque_image_back_url !== undefined) updatePayload.cheque_image_back_url = input.cheque_image_back_url || null;
  if (input.deposit_slip_url !== undefined) updatePayload.deposit_slip_url = input.deposit_slip_url || null;
  if (input.bounce_slip_url !== undefined) updatePayload.bounce_slip_url = input.bounce_slip_url || null;

  const { error } = await supabase.from("cheques").update(updatePayload).eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(parseDatabaseError(error, "Failed to update cheque"));
}

/**
 * Transitions cheque status with full audit trail and optional safe accounting integration.
 * CRITICAL RULE: A cheque is NEVER automatically cleared on due date.
 * Clearance requires explicit human confirmation.
 */
export async function transitionChequeStatus(params: {
  chequeId: string;
  targetStatus: ChequeStatus;
  actionDate?: string;
  depositBankAccount?: string;
  clearanceReference?: string;
  bounceReason?: string;
  cancellationReason?: string;
  notes?: string;
  recordAccountingPayment?: boolean;
}): Promise<void> {
  const { chequeId, targetStatus, actionDate = todayISO(), notes } = params;

  // 1. Fetch current cheque state
  const { data: current, error: cErr } = await supabase
    .from("cheques")
    .select("*")
    .eq("id", chequeId)
    .single();

  if (cErr || !current) throw new Error("Cheque record not found.");
  const fromStatus = current.status as ChequeStatus;

  if (fromStatus === targetStatus) {
    throw new Error(`Cheque is already in status '${targetStatus}'.`);
  }

  const companyId = current.company_id;
  const { data: userData } = await supabase.auth.getUser();
  const userName = userData?.user?.email || "System User";
  const userId = userData?.user?.id || null;

  const updateFields: Record<string, unknown> = {
    status: targetStatus,
    updated_at: new Date().toISOString(),
  };

  // Status specific fields
  if (targetStatus === "deposited") {
    updateFields.deposit_date = actionDate;
    if (params.depositBankAccount) updateFields.deposit_bank_account = params.depositBankAccount;
  } else if (targetStatus === "cleared") {
    updateFields.clearance_date = actionDate;
    updateFields.clearance_reference = params.clearanceReference?.trim() || null;
  } else if (targetStatus === "bounced") {
    updateFields.bounce_date = actionDate;
    updateFields.bounce_reason = params.bounceReason?.trim() || "Insufficient funds or signature issue";
  } else if (targetStatus === "cancelled") {
    updateFields.cancellation_date = actionDate;
    updateFields.cancellation_reason = params.cancellationReason?.trim() || "Cancelled by mutual agreement";
  }

  // 2. Safe Accounting Payment Integration when CLEARED (Optional & Deduplicated)
  let linkedPaymentId: string | null = current.payment_id;
  if (targetStatus === "cleared" && params.recordAccountingPayment && !current.is_payment_recorded) {
    try {
      const isIncoming = current.cheque_type === "incoming";
      const paymentType = isIncoming ? "customer_receipt" : "supplier_payment";
      const docPrefix = isIncoming ? "REC" : "SPAY";
      const paymentNumber = await generateDocNumber(companyId, docPrefix);

      const paymentPayload = {
        company_id: companyId,
        payment_number: paymentNumber,
        payment_type: paymentType,
        customer_id: isIncoming ? current.customer_id : null,
        supplier_id: !isIncoming ? current.supplier_id : null,
        payment_date: actionDate,
        amount: Number(current.amount),
        payment_method: "cheque",
        reference_number: current.cheque_number,
        bank_name: current.bank_name,
        notes: `Cheque clearance settlement for Cheque #${current.cheque_number} (${current.bank_name}). ${notes || ""}`,
        status: "completed",
        updated_at: new Date().toISOString(),
      };

      const { data: insertedPayment, error: payErr } = await supabase
        .from("payments")
        .insert(paymentPayload)
        .select("id")
        .single();

      if (payErr) throw payErr;
      linkedPaymentId = insertedPayment.id;
      updateFields.payment_id = linkedPaymentId;
      updateFields.is_payment_recorded = true;

      // If linked to a supplier bill, update paid_amount and status safely
      if (!isIncoming && current.supplier_bill_id && insertedPayment) {
        const { data: bill } = await supabase
          .from("supplier_bills")
          .select("id, total_amount, paid_amount")
          .eq("id", current.supplier_bill_id)
          .single();

        if (bill) {
          const newPaid = Number(bill.paid_amount || 0) + Number(current.amount);
          const newStatus = newPaid >= Number(bill.total_amount) - 0.01 ? "Paid" : "Partially Paid";
          const { error: billErr } = await supabase
            .from("supplier_bills")
            .update({
              paid_amount: newPaid,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", bill.id);

          if (billErr) {
            // Roll back payment to avoid corrupted state
            await supabase.from("payments").delete().eq("id", insertedPayment.id);
            throw billErr;
          }
        }
      }
    } catch (paymentErr) {
      throw new Error(`Failed to record linked accounting payment: ${parseDatabaseError(paymentErr)}`);
    }
  }

  // 3. Update Cheque Record
  const { error: updateErr } = await supabase
    .from("cheques")
    .update(updateFields)
    .eq("id", chequeId);

  if (updateErr) throw new Error(parseDatabaseError(updateErr, "Failed to update cheque status"));

  // 4. Write Immutable Status Change History
  const historyNotes = [
    `Status changed from ${fromStatus} to ${targetStatus}.`,
    notes?.trim() || null,
    params.clearanceReference ? `Clearance Ref: ${params.clearanceReference}` : null,
    params.bounceReason ? `Bounce Reason: ${params.bounceReason}` : null,
    params.cancellationReason ? `Cancellation Reason: ${params.cancellationReason}` : null,
    linkedPaymentId ? `Linked Accounting Payment created (#${linkedPaymentId})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  await supabase.from("cheque_status_history").insert({
    company_id: companyId,
    cheque_id: chequeId,
    from_status: fromStatus,
    to_status: targetStatus,
    action_date: actionDate,
    action_by: userId,
    action_by_name: userName,
    notes: historyNotes,
    metadata: {
      clearance_ref: params.clearanceReference || null,
      bounce_reason: params.bounceReason || null,
      deposit_account: params.depositBankAccount || null,
      payment_id: linkedPaymentId || null,
    },
  });
}

/**
 * Uploads a cheque document (scan, deposit slip, bounce memo) to private storage
 */
export async function uploadChequeDocument(
  file: File,
  folder: "front" | "back" | "deposit" | "bounce"
): Promise<string> {
  const companyId = await getCompanyId();
  const fileExt = file.name.split(".").pop() || "jpg";
  const safeName = `${companyId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("cheques")
    .upload(safeName, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  return safeName;
}

/**
 * Gets a secure signed URL for viewing private cheque images
 */
export async function getChequeDocumentSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  if (storagePath.startsWith("http") || storagePath.startsWith("data:")) return storagePath;

  const { data, error } = await supabase.storage
    .from("cheques")
    .createSignedUrl(storagePath, 3600); // 1 hour valid

  if (error || !data?.signedUrl) {
    console.warn("Failed to get signed URL for", storagePath, error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Fetches active reminders for the company with deduplicated unread alerts
 */
export async function fetchActiveReminders(): Promise<ChequeReminderRecord[]> {
  const { data, error } = await supabase
    .from("cheque_reminders")
    .select(
      `
      *,
      cheque:cheques(id, cheque_number, cheque_type, amount, due_date, bank_name, status, customer_id, supplier_id, payee_name)
    `
    )
    .in("status", ["pending", "sent"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to load cheque reminders:", error);
    return [];
  }
  return (data || []) as ChequeReminderRecord[];
}

/**
 * Evaluates all uncleared cheques and creates reminders if not already sent (Idempotent Deduplication)
 */
export async function evaluateAndTriggerReminders(): Promise<{
  checked: number;
  created: number;
  skipped: number;
}> {
  const companyId = await getCompanyId();
  const { data: activeCheques, error } = await supabase
    .from("cheques")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["pending", "deposited"]);

  if (error || !activeCheques) return { checked: 0, created: 0, skipped: 0 };

  let createdCount = 0;
  let skippedCount = 0;

  for (const c of activeCheques) {
    const days = getDaysDifference(c.due_date);
    let reminderType: ChequeReminderType | null = null;
    let title = "";
    let message = "";

    const typeLabel = c.cheque_type === "incoming" ? "Incoming Customer Cheque" : "Outgoing Supplier Cheque";
    const party = c.payee_name || "Counterparty";

    if (days === 7) {
      reminderType = "7_days_before";
      title = `7-Day Cheque Notice: #${c.cheque_number}`;
      message = `${typeLabel} of AED ${Number(c.amount).toLocaleString()} (${c.bank_name}) from ${party} is due in 7 days on ${c.due_date}.`;
    } else if (days === 3) {
      reminderType = "3_days_before";
      title = `3-Day Cheque Reminder: #${c.cheque_number}`;
      message = `${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} is maturing in 3 days (${c.due_date}).`;
    } else if (days === 1) {
      reminderType = "1_day_before";
      title = `Tomorrow Due: Cheque #${c.cheque_number}`;
      message = `High Priority: ${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} matures tomorrow.`;
    } else if (days === 0) {
      reminderType = "due_today";
      title = `DUE TODAY: Cheque #${c.cheque_number}`;
      message = `Action Required: Cheque #${c.cheque_number} (AED ${Number(c.amount).toLocaleString()}, ${c.bank_name}) is due today for deposit/presentation.`;
    } else if (days < 0) {
      reminderType = "overdue";
      title = `OVERDUE CHEQUE: #${c.cheque_number} (${Math.abs(days)}d past due)`;
      message = `Attention: ${typeLabel} #${c.cheque_number} of AED ${Number(c.amount).toLocaleString()} is overdue since ${c.due_date}. Current status: ${c.status}.`;
    }

    if (reminderType) {
      // Upsert with ON CONFLICT DO NOTHING to strictly deduplicate by (cheque_id, reminder_type, due_date)
      const { data: ins, error: insErr } = await supabase
        .from("cheque_reminders")
        .insert({
          company_id: companyId,
          cheque_id: c.id,
          reminder_type: reminderType,
          due_date: c.due_date,
          notification_title: title,
          notification_message: message,
          channel: "in_app",
          status: "pending",
        })
        .select("id");

      if (!insErr && ins && ins.length > 0) {
        createdCount++;
      } else {
        skippedCount++;
      }
    }
  }

  return { checked: activeCheques.length, created: createdCount, skipped: skippedCount };
}
