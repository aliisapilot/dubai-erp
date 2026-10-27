import { supabase } from "./supabase";

export interface DocumentAuditLogPayload {
  companyId: string;
  documentType: string;
  documentId: string;
  documentNumber: string;
  action: "invoice_edit" | "invoice_renumber" | "invoice_status_change" | string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  notes?: string;
}

/**
 * Records an audit entry in the Supabase admin_audit_log table.
 * If authentication is unavailable or RLS denies insertion, fails gracefully without crashing user flow.
 */
export async function logDocumentAudit(payload: DocumentAuditLogPayload): Promise<void> {
  if (!payload.companyId || !payload.documentId) return;

  try {
    const { data: authData } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    const actorUserId = user?.id;
    if (!actorUserId) {
      // In case no active authenticated session is present
      return;
    }

    const auditEntry = {
      company_id: payload.companyId,
      actor_user_id: actorUserId,
      action_type: payload.action,
      action_details: {
        document_type: payload.documentType,
        document_id: payload.documentId,
        document_number: payload.documentNumber,
        previous_values: payload.previousValues || null,
        new_values: payload.newValues || null,
        notes: payload.notes || null,
        actor_email: user?.email || "Unknown User",
        timestamp: new Date().toISOString(),
      },
      record_counts: { modified: 1 },
      is_dry_run: false,
    };

    const { error } = await supabase.from("admin_audit_log").insert(auditEntry);
    if (error) {
      console.warn("Audit log notice:", error.message);
    }
  } catch (err: unknown) {
    console.warn("Audit logging notice:", err);
  }
}
