/**
 * Dubai ERP: Customer Statements (SOA) Document Manager API
 *
 * Strictly manages historical SOA documents in `document_attachments` + private `smart-imports` storage.
 * Enforces company-level authentication and authorization.
 * NEVER creates or modifies tax_invoices, receipt_vouchers, customer_payments, or opening balances.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildSoaAttachmentDescription,
  parseSoaAttachmentRow,
  type SoaAuditEntry,
} from "@/lib/soaManager";
import {
  calculateCustomerStatement,
  type RawHistoricalEntry,
  type RawInvoice,
  type RawReceiptVoucher,
  type RawPayment,
} from "@/lib/customerStatementEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabaseAdminOrUserClient(token?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const cookies = req.cookies.getAll();
  for (const c of cookies) {
    if (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) {
      try {
        const decoded = decodeURIComponent(c.value);
        const parsed = JSON.parse(decoded);
        if (typeof parsed === "string") {
          const inner = JSON.parse(parsed);
          if (inner?.access_token) return inner.access_token;
        }
        if (parsed?.access_token) return parsed.access_token;
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch {
        if (c.value.length > 50 && c.value.startsWith("eyJ")) return c.value;
      }
    }
  }
  return null;
}

async function resolveCompanyContext(req: NextRequest, requestedCompanyId?: string) {
  const token = extractToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Unauthorized: Missing session token." };
  }

  const supabase = getSupabaseAdminOrUserClient(token);
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { ok: false as const, status: 401, error: "Unauthorized: Invalid or expired session." };
  }

  const user = authData.user;

  // Resolve user's authorized companies
  const [{ data: ownedCos }, { data: prof }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("owner_id", user.id),
    supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle(),
  ]);

  const authorizedIds = new Set<string>();
  (ownedCos || []).forEach((c) => authorizedIds.add(c.id));
  if (prof?.company_id) authorizedIds.add(prof.company_id);

  if (requestedCompanyId) {
    if (!authorizedIds.has(requestedCompanyId)) {
      return { ok: false as const, status: 403, error: "Forbidden: Cross-company access denied." };
    }
    return { ok: true as const, supabase, user, companyId: requestedCompanyId };
  }

  const primaryId = prof?.company_id || ownedCos?.[0]?.id;
  if (!primaryId) {
    return { ok: false as const, status: 403, error: "No authorized company found for this account." };
  }

  return { ok: true as const, supabase, user, companyId: primaryId };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedCompanyId = searchParams.get("companyId") || undefined;
    const customerId = searchParams.get("customerId") || undefined;
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, companyId } = ctx;

    const [{ data: customers, error: custErr }, { data: attachments, error: attErr }, { data: companyRecord }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id, name, customer_code, trn, phone, email, address")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("document_attachments")
          .select("id, company_id, entity_id, file_name, file_url, file_type, file_size, description, created_at")
          .eq("company_id", companyId)
          .eq("entity_type", "customer")
          .order("created_at", { ascending: false }),
        supabase
          .from("companies")
          .select("*")
          .eq("id", companyId)
          .maybeSingle(),
      ]);

    if (custErr) throw new Error(custErr.message);
    if (attErr) throw new Error(attErr.message);

    const custMap = new Map<string, string>();
    (customers || []).forEach((c) => custMap.set(c.id, c.name));

    const statements = (attachments || []).map((row) =>
      parseSoaAttachmentRow({
        ...row,
        customer_name: custMap.get(row.entity_id) || "Unknown Customer",
      })
    );

    // Segregate attachments: Only statements where s.is_verified && !s.needs_review
    // can populate customerSavedSoa. Unverified/pending statements are segregated as pendingDocuments.
    const verifiedStatements = statements.filter((s) => s.is_verified && !s.needs_review);
    const pendingDocuments = statements.filter((s) => !s.is_verified || s.needs_review);

    let statementData = null;
    let selectedCustomer = null;
    let customerSavedSoa = null;

    const targetCustomerId = customerId || customers?.[0]?.id;
    if (targetCustomerId) {
      selectedCustomer = customers?.find((c) => c.id === targetCustomerId) || null;

      // Find newest verified SOA for this customer
      customerSavedSoa = verifiedStatements.find((s) => s.customer_id === targetCustomerId) || null;

      // Fetch live invoices & receipts & payments
      const [invRes, recRes, payRes] = await Promise.all([
        supabase
          .from("tax_invoices")
          .select("id, invoice_number, invoice_date, total_amount, status, company_id, customer_id, customer_name, customer_trn, notes")
          .eq("company_id", companyId)
          .eq("customer_id", targetCustomerId)
          .not("status", "in", '("cancelled","void")'),
        supabase
          .from("receipt_vouchers")
          .select("id, voucher_number, voucher_date, amount, status, invoice_id, payment_method, reference_number, notes")
          .eq("company_id", companyId)
          .eq("customer_id", targetCustomerId)
          .not("status", "in", '("cancelled","void")'),
        supabase
          .from("payments")
          .select("id, payment_number, payment_date, amount, status, invoice_id, reference_number, notes")
          .eq("company_id", companyId)
          .eq("customer_id", targetCustomerId)
          .not("status", "in", '("cancelled","void")'),
      ]);

      const rawInvoices = (invRes.data || []) as RawInvoice[];
      const rawReceipts = (recRes.data || []) as RawReceiptVoucher[];
      const rawPayments = (payRes.data || []) as RawPayment[];

      statementData = calculateCustomerStatement({
        customerId: targetCustomerId,
        customerName: selectedCustomer?.name || customerSavedSoa?.customer_name || "Customer",
        customerTrn: selectedCustomer?.trn || null,
        customerAddress: selectedCustomer?.address || null,
        customerPhone: selectedCustomer?.phone || null,
        customerCode: selectedCustomer?.customer_code || null,
        initialCutoverBalance: customerSavedSoa?.opening_balance || 0,
        cutoverDate: customerSavedSoa?.cutover_date || null,
        fromDate: fromDate || customerSavedSoa?.from_date || null,
        toDate: toDate || customerSavedSoa?.to_date || null,
        invoices: rawInvoices,
        receipts: rawReceipts,
        payments: rawPayments,
        historicalEntries: customerSavedSoa?.entries || [],
        statementNumber: customerSavedSoa?.soa_number || undefined,
        statementDate: customerSavedSoa?.statement_date || undefined,
      });
    }

    return NextResponse.json({
      success: true,
      companyId,
      customers: customers || [],
      statements: verifiedStatements,
      pendingDocuments,
      company: companyRecord || null,
      selectedCustomer,
      statement: statementData,
      customerSavedSoa,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load customer statements." },
      { status: 500 }
    );
  }
}

export interface SaveSoaItemPayload {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageBucket?: string;
  customerId?: string;
  newCustomerName?: string;
  soaNumber: string;
  statementDate: string;
  fromDate?: string | null;
  toDate?: string | null;
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number;
  checksumSha256?: string;
  needsReview?: boolean;
  isScannedPdf?: boolean;
  isVerified?: boolean;
  status?: "verified" | "pending_verification" | "rejected";
  cutoverDate?: string | null;
  isCutoverApproved?: boolean;
  entries?: RawHistoricalEntry[];
  duplicateAction?: "skip" | "replace" | "none";
  existingAttachmentId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, companyId: requestedCompanyId } = body as {
      items: SaveSoaItemPayload[];
      companyId?: string;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "No SOA items provided to save." },
        { status: 400 }
      );
    }

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, user, companyId } = ctx;

    let importedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ fileName: string; error: string }> = [];
    const createdIds: string[] = [];

    // Cache newly created customers within this batch so multiple SOAs for the same new customer reuse it
    const createdCustomersByName = new Map<string, string>();

    for (const item of items) {
      try {
        if (!item.storagePath) {
          errors.push({ fileName: item.fileName, error: "Storage upload failed: Missing storagePath; original file was not saved." });
          continue;
        }
        // Verify storagePath is scoped to this company
        if (!item.storagePath.startsWith(`${companyId}/`)) {
          errors.push({ fileName: item.fileName, error: "Storage validation failed: Storage path does not belong to your company." });
          continue;
        }

        if (item.duplicateAction === "skip") {
          skippedCount++;
          continue;
        }

        const cleanupOrphanedStorage = async () => {
          if (item.duplicateAction !== "replace" && item.storagePath) {
            try {
              await supabase.storage
                .from(item.storageBucket || "smart-imports")
                .remove([item.storagePath]);
            } catch {
              // Best-effort cleanup
            }
          }
        };

        // Resolve customer ID (either selected existing or explicitly confirmed new customer)
        let resolvedCustomerId = item.customerId || "";
        if (!resolvedCustomerId && item.newCustomerName?.trim()) {
          const cleanNewName = item.newCustomerName.trim();
          const key = cleanNewName.toLowerCase();
          if (createdCustomersByName.has(key)) {
            resolvedCustomerId = createdCustomersByName.get(key)!;
          } else {
            // Double-check if customer already exists in DB
            const { data: existingCust } = await supabase
              .from("customers")
              .select("id")
              .eq("company_id", companyId)
              .ilike("name", cleanNewName)
              .maybeSingle();

            if (existingCust?.id) {
              resolvedCustomerId = existingCust.id;
            } else {
              const { data: insertedCust, error: custInsertErr } = await supabase
                .from("customers")
                .insert({
                  company_id: companyId,
                  name: cleanNewName,
                  active: true,
                })
                .select("id")
                .single();

              if (custInsertErr || !insertedCust?.id) {
                await cleanupOrphanedStorage();
                errors.push({
                  fileName: item.fileName,
                  error: `Customer matching failed: Could not create customer "${cleanNewName}": ${custInsertErr?.message || "Unknown error"}`,
                });
                continue;
              }
              resolvedCustomerId = insertedCust.id;
              createdCustomersByName.set(key, resolvedCustomerId);
            }
          }
        }

        if (!resolvedCustomerId) {
          await cleanupOrphanedStorage();
          errors.push({ fileName: item.fileName, error: "Customer matching failed: No customer selected." });
          continue;
        }

        // Validate verification guardrails:
        // isVerified === true can only be set if statement has non-empty entries and customer assigned.
        // Unverified files are saved with isVerified: false and status: "pending_verification".
        const hasEntries = Array.isArray(item.entries) && item.entries.length > 0;
        const hasCustomer = Boolean(resolvedCustomerId);
        const requestedVerified = Boolean(item.isVerified);

        let finalIsVerified = false;
        let finalStatus: "verified" | "pending_verification" | "rejected" = "pending_verification";

        if (requestedVerified && hasEntries && hasCustomer && !item.needsReview && !item.isScannedPdf) {
          finalIsVerified = true;
          finalStatus = "verified";
        } else {
          finalIsVerified = false;
          finalStatus = item.status === "rejected" ? "rejected" : "pending_verification";
        }

        const bucket = item.storageBucket || "smart-imports";
        const fileUrl = `/api/smart-import/storage?path=${encodeURIComponent(item.storagePath)}&bucket=${encodeURIComponent(bucket)}`;
        const description = buildSoaAttachmentDescription({
          soaNumber: item.soaNumber,
          statementDate: item.statementDate,
          fromDate: item.fromDate,
          toDate: item.toDate,
          openingBalance: item.openingBalance,
          charges: item.charges,
          credits: item.credits,
          closingBalance: item.closingBalance,
          checksumSha256: item.checksumSha256,
          needsReview: item.needsReview !== undefined ? item.needsReview : !finalIsVerified,
          isScannedPdf: item.isScannedPdf,
          isVerified: finalIsVerified,
          status: finalStatus,
          storagePath: item.storagePath,
          storageBucket: bucket,
          cutoverDate: item.cutoverDate,
          isCutoverApproved: item.isCutoverApproved,
          entries: item.entries,
        });

        if (item.duplicateAction === "replace" && item.existingAttachmentId) {
          const { error: updErr } = await supabase
            .from("document_attachments")
            .update({
              entity_id: resolvedCustomerId,
              file_name: item.fileName,
              file_url: fileUrl,
              file_type: item.fileType || "application/pdf",
              file_size: item.fileSize || 0,
              description,
            })
            .eq("id", item.existingAttachmentId)
            .eq("company_id", companyId);

          if (updErr) {
            errors.push({ fileName: item.fileName, error: `Metadata insertion failed: ${updErr.message}` });
          } else {
            replacedCount++;
            createdIds.push(item.existingAttachmentId);
          }
          continue;
        }

        const { data: insertedAtt, error: insErr } = await supabase
          .from("document_attachments")
          .insert({
            company_id: companyId,
            entity_type: "customer",
            entity_id: resolvedCustomerId,
            file_name: item.fileName,
            file_url: fileUrl,
            file_type: item.fileType || "application/pdf",
            file_size: item.fileSize || 0,
            description,
          })
          .select("id")
          .single();

        if (insErr || !insertedAtt?.id) {
          await cleanupOrphanedStorage();
          errors.push({
            fileName: item.fileName,
            error: `Metadata insertion failed: ${insErr?.message || "Failed to save SOA record."}`,
          });
        } else {
          importedCount++;
          createdIds.push(insertedAtt.id);
        }
      } catch (itemErr) {
        errors.push({
          fileName: item.fileName,
          error: itemErr instanceof Error ? itemErr.message : "Unexpected error saving SOA.",
        });
      }
    }

    // Record non-ledger audit batch in import_batches (best-effort)
    try {
      await supabase.from("import_batches").insert({
        company_id: companyId,
        batch_name: `SOA Bulk Import (${importedCount + replacedCount} saved)`,
        file_count: items.length,
        filenames: items.map((i) => i.fileName),
        status: errors.length > 0 && importedCount + replacedCount === 0 ? "failed" : "completed",
        records_created: { document_attachments: importedCount + replacedCount },
        summary: {
          module: "customer_statements_v2",
          importedCount,
          replacedCount,
          skippedCount,
          failedCount: errors.length,
          zeroLedgerMutations: true,
        },
        created_by: user.email || "Current User",
      });
    } catch {
      // Non-critical audit log
    }

    return NextResponse.json({
      success: errors.length === 0 || importedCount + replacedCount > 0,
      importedCount,
      replacedCount,
      skippedCount,
      failedCount: errors.length,
      errors,
      createdIds,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save SOAs." },
      { status: 500 }
    );
  }
}

export interface UpdateSoaPayload {
  companyId?: string;
  attachmentId: string;
  action: "edit_entry" | "add_entry" | "delete_entry" | "update_cutover";
  entryId?: string;
  entry?: Partial<RawHistoricalEntry>;
  cutoverDate?: string | null;
  isCutoverApproved?: boolean;
  reason?: string;
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as UpdateSoaPayload;
    const { attachmentId, action, entryId, entry, cutoverDate, isCutoverApproved, reason, companyId: requestedCompanyId } = body;

    if (!attachmentId) {
      return NextResponse.json({ success: false, error: "attachmentId is required." }, { status: 400 });
    }

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, user, companyId } = ctx;

    const { data: attachmentRow, error: fetchErr } = await supabase
      .from("document_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("company_id", companyId)
      .single();

    if (fetchErr || !attachmentRow) {
      return NextResponse.json({ success: false, error: "Attachment record not found." }, { status: 404 });
    }

    const stored = parseSoaAttachmentRow(attachmentRow);
    const existingEntries: RawHistoricalEntry[] = [...stored.entries];
    const auditTrail: SoaAuditEntry[] = [...stored.audit_trail];
    const nowIso = new Date().toISOString();
    const userIdentifier = user.email || "Current User";

    let updatedCutoverDate = stored.cutover_date;
    let updatedCutoverApproved = stored.is_cutover_approved;
    let cutoverApprovedBy = stored.cutover_approved_by;
    let cutoverApprovedAt = stored.cutover_approved_at;

    if (action === "edit_entry") {
      if (!entryId) {
        return NextResponse.json({ success: false, error: "entryId is required for edit_entry." }, { status: 400 });
      }
      const idx = existingEntries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "Historical entry not found." }, { status: 404 });
      }
      const originalEntry = { ...existingEntries[idx] };
      const updatedEntry: RawHistoricalEntry = {
        ...originalEntry,
        date: entry?.date ? entry.date.slice(0, 10) : originalEntry.date,
        reference_no: entry?.reference_no !== undefined ? entry.reference_no.trim() : originalEntry.reference_no,
        description: entry?.description !== undefined ? entry.description.trim() : originalEntry.description,
        debit: entry?.debit !== undefined ? Math.round(Number(entry.debit) * 100) / 100 : originalEntry.debit,
        credit: entry?.credit !== undefined ? Math.round(Number(entry.credit) * 100) / 100 : originalEntry.credit,
        is_edited: true,
      };
      existingEntries[idx] = updatedEntry;

      auditTrail.push({
        timestamp: nowIso,
        user: userIdentifier,
        action: "edit",
        entryId,
        original: originalEntry,
        updated: updatedEntry,
        reason: reason || "User edited statement transaction row",
      });
    } else if (action === "add_entry") {
      if (!entry) {
        return NextResponse.json({ success: false, error: "Entry data is required for add_entry." }, { status: 400 });
      }
      const newEntry: RawHistoricalEntry = {
        id: entry.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: entry.date ? entry.date.slice(0, 10) : nowIso.slice(0, 10),
        reference_no: entry.reference_no?.trim() || "ADJ",
        original_reference: entry.reference_no?.trim() || "ADJ",
        description: entry.description?.trim() || "Historical Adjustment",
        debit: Math.round((Number(entry.debit) || 0) * 100) / 100,
        credit: Math.round((Number(entry.credit) || 0) * 100) / 100,
        status: "historical",
        is_edited: true,
        source_doc_id: attachmentId,
        source_filename: stored.file_name,
      };
      existingEntries.push(newEntry);

      auditTrail.push({
        timestamp: nowIso,
        user: userIdentifier,
        action: "create",
        entryId: newEntry.id,
        updated: newEntry,
        reason: reason || "User added historical statement transaction row",
      });
    } else if (action === "delete_entry") {
      if (!entryId) {
        return NextResponse.json({ success: false, error: "entryId is required for delete_entry." }, { status: 400 });
      }
      const idx = existingEntries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: "Historical entry not found." }, { status: 404 });
      }
      const removed = existingEntries.splice(idx, 1)[0];
      auditTrail.push({
        timestamp: nowIso,
        user: userIdentifier,
        action: "delete",
        entryId,
        original: removed,
        reason: reason || "User deleted historical statement transaction row",
      });
    } else if (action === "update_cutover") {
      updatedCutoverDate = cutoverDate !== undefined ? cutoverDate : stored.cutover_date;
      updatedCutoverApproved = isCutoverApproved !== undefined ? isCutoverApproved : stored.is_cutover_approved;
      if (updatedCutoverApproved && !stored.is_cutover_approved) {
        cutoverApprovedBy = userIdentifier;
        cutoverApprovedAt = nowIso;
      }
      auditTrail.push({
        timestamp: nowIso,
        user: userIdentifier,
        action: "cutover_approved",
        original: { cutoverDate: stored.cutover_date, isCutoverApproved: stored.is_cutover_approved },
        updated: { cutoverDate: updatedCutoverDate, isCutoverApproved: updatedCutoverApproved },
        reason: reason || "User updated cutover settings",
      });
    }

    // Recompute charges, credits, and closing balance across historical entries
    let totalDebits = 0;
    let totalCredits = 0;
    existingEntries.forEach((e) => {
      totalDebits += Number(e.debit) || 0;
      totalCredits += Number(e.credit) || 0;
    });

    const openingBalance = stored.opening_balance;
    const closingBalance = Math.round((openingBalance + totalDebits - totalCredits) * 100) / 100;

    const isStillVerified = stored.is_verified && existingEntries.length > 0;
    const putStatus = isStillVerified ? "verified" : stored.status === "rejected" ? "rejected" : "pending_verification";

    const newDescription = buildSoaAttachmentDescription({
      soaNumber: stored.soa_number,
      statementDate: stored.statement_date,
      fromDate: stored.from_date,
      toDate: stored.to_date,
      openingBalance,
      charges: Math.round(totalDebits * 100) / 100,
      credits: Math.round(totalCredits * 100) / 100,
      closingBalance,
      checksumSha256: stored.checksum_sha256 || undefined,
      needsReview: stored.needs_review,
      isScannedPdf: stored.is_scanned_pdf,
      isVerified: isStillVerified,
      status: putStatus,
      storagePath: stored.storage_path || undefined,
      storageBucket: stored.storage_bucket,
      cutoverDate: updatedCutoverDate,
      isCutoverApproved: updatedCutoverApproved,
      cutoverApprovedBy,
      cutoverApprovedAt,
      entries: existingEntries,
      auditTrail,
    });

    const { error: updErr } = await supabase
      .from("document_attachments")
      .update({ description: newDescription })
      .eq("id", attachmentId)
      .eq("company_id", companyId);

    if (updErr) {
      return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updatedRecord: {
        ...stored,
        opening_balance: openingBalance,
        charges: Math.round(totalDebits * 100) / 100,
        credits: Math.round(totalCredits * 100) / 100,
        closing_balance: closingBalance,
        cutover_date: updatedCutoverDate,
        is_cutover_approved: updatedCutoverApproved,
        cutover_approved_by: cutoverApprovedBy,
        cutover_approved_at: cutoverApprovedAt,
        entries: existingEntries,
        audit_trail: auditTrail,
        is_verified: isStillVerified,
        isVerified: isStillVerified,
        status: putStatus,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update statement." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const requestedCompanyId = searchParams.get("companyId") || undefined;

    if (!id) {
      return NextResponse.json({ success: false, error: "Attachment ID is required." }, { status: 400 });
    }

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, companyId } = ctx;

    const { error } = await supabase
      .from("document_attachments")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("entity_type", "customer");

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to delete statement." },
      { status: 500 }
    );
  }
}

