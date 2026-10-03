import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  ChequeReminderRecipientRecord,
  CustomerReminderConfigRecord,
  CompanyChequeSettingsRecord,
  RecipientCategory,
} from "@/lib/chequeTypes";
import { sendChequeReminderEmail } from "@/lib/emailService";

export async function fetchReminderRecipients(
  category?: RecipientCategory
): Promise<ChequeReminderRecipientRecord[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  let query = supabase
    .from("cheque_reminder_recipients")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("recipient_category", category);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not load reminder recipients: ${error.message}`);
  }
  return (data || []) as ChequeReminderRecipientRecord[];
}

export async function saveReminderRecipient(
  recipient: Partial<ChequeReminderRecipientRecord> & {
    name: string;
    email: string;
    recipient_category: RecipientCategory;
  }
): Promise<ChequeReminderRecipientRecord> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No active company found.");

  const payload = {
    company_id: companyId,
    name: recipient.name.trim(),
    email: recipient.email.trim().toLowerCase(),
    phone: recipient.phone ? recipient.phone.trim() : null,
    recipient_category: recipient.recipient_category,
    is_enabled: recipient.is_enabled ?? true,
    channels: recipient.channels || "email",
    preferences: recipient.preferences || {
      incoming: true,
      outgoing: true,
      due_today: true,
      overdue: true,
      summary: true,
      technical_alerts: recipient.recipient_category === "developer",
    },
    assigned_customer_ids: recipient.assigned_customer_ids || [],
    assigned_cheque_ids: recipient.assigned_cheque_ids || [],
    notes: recipient.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (recipient.id) {
    const { data, error } = await supabase
      .from("cheque_reminder_recipients")
      .update(payload)
      .eq("id", recipient.id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) throw error;
    return data as ChequeReminderRecipientRecord;
  } else {
    const { data, error } = await supabase
      .from("cheque_reminder_recipients")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data as ChequeReminderRecipientRecord;
  }
}

export async function deleteReminderRecipient(id: string): Promise<void> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No active company found.");

  const { error } = await supabase
    .from("cheque_reminder_recipients")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
}

export async function fetchCustomerReminderConfigs(): Promise<
  Record<string, CustomerReminderConfigRecord>
> {
  const companyId = await getCompanyId();
  if (!companyId) return {};

  const { data, error } = await supabase
    .from("customer_reminder_configs")
    .select("*")
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Could not load customer reminder preferences: ${error.message}`);
  }

  const map: Record<string, CustomerReminderConfigRecord> = {};
  (data || []).forEach((row) => {
    map[row.customer_id] = row as CustomerReminderConfigRecord;
  });
  return map;
}

export async function saveCustomerReminderConfig(
  customerId: string,
  config: Partial<CustomerReminderConfigRecord>
): Promise<CustomerReminderConfigRecord> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No active company found.");

  const payload = {
    company_id: companyId,
    customer_id: customerId,
    override_email: config.override_email ? config.override_email.trim().toLowerCase() : null,
    override_phone: config.override_phone ? config.override_phone.trim() : null,
    email_enabled: config.email_enabled ?? true,
    whatsapp_enabled: config.whatsapp_enabled ?? false,
    consent_given_at: config.whatsapp_enabled ? new Date().toISOString() : config.consent_given_at || null,
    consent_notes: config.consent_notes?.trim() || null,
    opt_out: config.opt_out ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("customer_reminder_configs")
    .upsert(payload, { onConflict: "company_id,customer_id" })
    .select()
    .single();

  if (error) throw error;
  return data as CustomerReminderConfigRecord;
}

export async function fetchCompanyChequeSettings(): Promise<CompanyChequeSettingsRecord | null> {
  const companyId = await getCompanyId();
  if (!companyId) return null;

  const { data, error } = await supabase
    .from("company_cheque_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load company cheque settings: ${error.message}`);
  }
  return data as CompanyChequeSettingsRecord | null;
}

export async function saveCompanyChequeSettings(
  settings: Partial<CompanyChequeSettingsRecord>
): Promise<CompanyChequeSettingsRecord> {
  const companyId = await getCompanyId();
  if (!companyId) throw new Error("No active company found.");

  const payload = {
    company_id: companyId,
    reminder_days: settings.reminder_days || [7, 3, 1, 0],
    overdue_reminders_enabled: settings.overdue_reminders_enabled ?? true,
    developer_email: settings.developer_email ? settings.developer_email.trim().toLowerCase() : null,
    developer_alerts_enabled: settings.developer_alerts_enabled ?? true,
    whatsapp_provider: settings.whatsapp_provider || "manual",
    whatsapp_phone_number_id: settings.whatsapp_phone_number_id?.trim() || null,
    whatsapp_business_account_id: settings.whatsapp_business_account_id?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("company_cheque_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select()
    .single();

  if (error) throw error;
  return data as CompanyChequeSettingsRecord;
}

export async function sendTestEmailToRecipient(
  email: string,
  name: string,
  category: RecipientCategory
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await sendChequeReminderEmail({
      to: email,
      subject: `[Test] Dubai ERP Cheque Reminder System (${category})`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2>Dubai ERP — Verification Test Email</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>This is a test notification verifying your email configuration for <strong>${category}</strong> notifications.</p>
          <p>Your address has been confirmed to receive automated cheque maturity and due-date alerts.</p>
          <div style="margin-top: 24px; padding: 12px; background: #f1f5f9; border-radius: 6px; font-size: 12px;">
            Timestamp: ${new Date().toUTCString()} | Category: ${category}
          </div>
        </div>
      `,
    });

    if (res.success) {
      return { success: true, message: `Test email successfully sent to ${email}` };
    } else {
      return {
        success: false,
        message: res.error || "Email service returned error (verify RESEND_API_KEY).",
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
}
