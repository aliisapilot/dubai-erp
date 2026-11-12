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
} from "@/lib/soaManager";

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

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, companyId } = ctx;

    const [{ data: customers, error: custErr }, { data: attachments, error: attErr }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id, name, customer_code, trn")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("document_attachments")
          .select("id, company_id, entity_id, file_name, file_url, file_type, file_size, description, created_at")
          .eq("company_id", companyId)
          .eq("entity_type", "customer")
          .order("created_at", { ascending: false }),
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

    return NextResponse.json({
      success: true,
      companyId,
      customers: customers || [],
      statements,
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
  openingBalance: number;
  charges: number;
  credits: number;
  closingBalance: number;
  checksumSha256?: string;
  needsReview?: boolean;
  isScannedPdf?: boolean;
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

        const bucket = item.storageBucket || "smart-imports";
        const fileUrl = `/api/smart-import/storage?path=${encodeURIComponent(item.storagePath)}&bucket=${encodeURIComponent(bucket)}`;
        const description = buildSoaAttachmentDescription({
          soaNumber: item.soaNumber,
          statementDate: item.statementDate,
          openingBalance: item.openingBalance,
          charges: item.charges,
          credits: item.credits,
          closingBalance: item.closingBalance,
          checksumSha256: item.checksumSha256,
          needsReview: item.needsReview,
          isScannedPdf: item.isScannedPdf,
          storagePath: item.storagePath,
          storageBucket: bucket,
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

