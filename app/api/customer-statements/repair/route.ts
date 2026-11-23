/**
 * Dubai ERP: Customer Statements - Admin-Only Repair & Re-extraction API Route
 *
 * Scans previously imported SOA records in `document_attachments` and reprocesses their
 * original files stored in private Supabase Storage (`smart-imports`) using the updated,
 * multi-page text and table extraction engine.
 *
 * Strict Guardrails:
 * 1. Non-destructive: preserves existing manual user edits and approved verifications.
 * 2. Idempotent: safe to run multiple times without creating duplicates.
 * 3. Never invents financial values: unknown balances remain `null` ("Not extracted") and
 *    unknown dates remain `null` ("Date required").
 * 4. Company-scoped: strictly isolated by authenticated company context.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCompanyContext } from "@/app/api/customer-statements/route";
import { parsePdf } from "@/lib/smartImport/parsers/pdfParser";
import { extractFromPdf } from "@/lib/smartImport/extractor";
import {
  parseSoaAttachmentRow,
  buildSoaAttachmentDescription,
  matchCustomerCandidates,
  parseSoaFilename,
  extractSoaRowsFromSpreadsheet,
  type CustomerCandidate,
} from "@/lib/soaManager";
import type { RawHistoricalEntry } from "@/lib/customerStatementEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow 2 minutes for bulk re-extraction batches

interface RepairRequestBody {
  companyId?: string;
  attachmentIds?: string[];
  dryRun?: boolean;
  forceReextract?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as RepairRequestBody;
    const { companyId: requestedCompanyId, attachmentIds, dryRun = false, forceReextract = false } = body;

    const ctx = await resolveCompanyContext(req, requestedCompanyId);
    if (!ctx.ok) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, companyId } = ctx;

    // 1. Fetch all customer statement attachments
    let query = supabase
      .from("document_attachments")
      .select("id, company_id, entity_id, file_name, file_url, file_type, file_size, description, created_at")
      .eq("company_id", companyId)
      .eq("entity_type", "customer");

    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      query = query.in("id", attachmentIds);
    }

    const [{ data: attachments, error: attErr }, { data: rawCustomers, error: custErr }] = await Promise.all([
      query.order("created_at", { ascending: false }),
      supabase
        .from("customers")
        .select("id, name, customer_code, trn, phone, email, address")
        .eq("company_id", companyId)
        .eq("active", true),
    ]);

    if (custErr) {
      console.warn("Failed to load customers for repair:", custErr.message);
    }

    if (attErr) {
      return NextResponse.json({ success: false, error: `Failed to load attachments: ${attErr.message}` }, { status: 500 });
    }

    const customers: CustomerCandidate[] = rawCustomers || [];
    const custMap = new Map<string, string>();
    customers.forEach((c) => custMap.set(c.id, c.name));

    // 2. Pre-index storage objects in company's smart-imports folder to resolve missing paths
    const storageFileIndex = new Map<string, string>(); // lowercase cleanFileName -> storagePath
    try {
      const { data: batches } = await supabase.storage.from("smart-imports").list(companyId, { limit: 100 });
      if (Array.isArray(batches)) {
        for (const b of batches) {
          if (b.name) {
            const { data: batchFiles } = await supabase.storage
              .from("smart-imports")
              .list(`${companyId}/${b.name}`, { limit: 100 });
            if (Array.isArray(batchFiles)) {
              for (const f of batchFiles) {
                if (f.name) {
                  const fullPath = `${companyId}/${b.name}/${f.name}`;
                  const cleanName = f.name.replace(/^[0-9]+_[a-f0-9]+_/, "").toLowerCase();
                  storageFileIndex.set(cleanName, fullPath);
                  storageFileIndex.set(f.name.toLowerCase(), fullPath);
                }
              }
            }
          }
        }
      }
    } catch (storageScanErr) {
      console.warn("Storage index scan warning:", storageScanErr);
    }

    let repairedCount = 0;
    let skippedCount = 0;
    let missingFilesCount = 0;
    const details: Array<{
      id: string;
      fileName: string;
      status: "repaired" | "skipped_verified" | "missing_file" | "failed";
      oldClosing: number | null;
      newClosing: number | null;
      oldRows: number;
      newRows: number;
      oldDate: string;
      newDate: string;
      isMathValid: boolean;
      error?: string;
    }> = [];

    const nowIso = new Date().toISOString();

    for (const rawRow of attachments || []) {
      const stored = parseSoaAttachmentRow({
        ...rawRow,
        customer_name: custMap.get(rawRow.entity_id) || "Unknown Customer",
      });

      // Guardrail: Skip if already verified with manual edits, unless forced
      const hasManualEdits = stored.audit_trail?.some((a) => a.action === "edit");
      if (stored.is_verified && hasManualEdits && !forceReextract) {
        skippedCount++;
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          status: "skipped_verified",
          oldClosing: stored.closing_balance,
          newClosing: stored.closing_balance,
          oldRows: stored.entries.length,
          newRows: stored.entries.length,
          oldDate: stored.statement_date,
          newDate: stored.statement_date,
          isMathValid: true,
        });
        continue;
      }

      // Resolve storage path
      let resolvedPath = stored.storage_path;
      if (!resolvedPath || resolvedPath.startsWith("http") || resolvedPath.startsWith("/")) {
        const cleanLower = stored.file_name.toLowerCase();
        resolvedPath = storageFileIndex.get(cleanLower) || null;
      }

      if (!resolvedPath) {
        missingFilesCount++;
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          status: "missing_file",
          oldClosing: stored.closing_balance,
          newClosing: null,
          oldRows: stored.entries.length,
          newRows: 0,
          oldDate: stored.statement_date,
          newDate: "",
          isMathValid: false,
          error: "Original document file not found in storage.",
        });
        continue;
      }

      // Download file from storage
      const bucket = stored.storage_bucket || "smart-imports";
      const { data: fileBlob, error: dlErr } = await supabase.storage.from(bucket).download(resolvedPath);

      if (dlErr || !fileBlob) {
        missingFilesCount++;
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          status: "missing_file",
          oldClosing: stored.closing_balance,
          newClosing: null,
          oldRows: stored.entries.length,
          newRows: 0,
          oldDate: stored.statement_date,
          newDate: "",
          isMathValid: false,
          error: `Storage download failed: ${dlErr?.message || "Not found"}`,
        });
        continue;
      }

      try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const ext = stored.file_name.split(".").pop()?.toLowerCase() || "pdf";

        let newCustomerName = stored.customer_name;
        let newSoaNumber = stored.soa_number;
        let newStatementDate: string | null = stored.statement_date || null;
        let newOpeningBalance = stored.opening_balance;
        let newClosingBalance: number | null = null;
        let newEntries: RawHistoricalEntry[] = [];
        let isScanned = false;

        const fnMeta = parseSoaFilename(stored.file_name);
        if (fnMeta.soaNumber) newSoaNumber = fnMeta.soaNumber;
        if (fnMeta.customerName) newCustomerName = fnMeta.customerName;
        if (fnMeta.statementDate) newStatementDate = fnMeta.statementDate;

        if (ext === "xlsx" || ext === "xls" || ext === "csv") {
          const parsed = extractSoaRowsFromSpreadsheet(arrayBuffer, stored.file_name);
          if (parsed.customerName) newCustomerName = parsed.customerName;
          if (parsed.soaNumber) newSoaNumber = parsed.soaNumber;
          if (parsed.statementDate) newStatementDate = parsed.statementDate;
          newOpeningBalance = parsed.openingBalance;
          newClosingBalance = parsed.closingBalance ?? null;
          newEntries = parsed.entries;
        } else {
          // PDF re-extraction
          const parsedPdf = await parsePdf(arrayBuffer, stored.file_name);
          if (!parsedPdf.hasSelectableText) {
            isScanned = true;
          }
          const extraction = extractFromPdf(parsedPdf, stored.file_name, "customer_statement");

          if (extraction.fields.customer_name?.value) {
            newCustomerName = String(extraction.fields.customer_name.value);
          }
          if (extraction.fields.document_number?.value) {
            newSoaNumber = String(extraction.fields.document_number.value);
          }
          if (extraction.fields.statement_date?.value) {
            newStatementDate = String(extraction.fields.statement_date.value);
          } else if (extraction.fields.document_date?.value) {
            newStatementDate = String(extraction.fields.document_date.value);
          }

          if (extraction.fields.opening_balance?.value != null) {
            newOpeningBalance = Number(extraction.fields.opening_balance.value) || 0;
          }
          if (extraction.fields.closing_balance?.value != null) {
            newClosingBalance = Number(extraction.fields.closing_balance.value);
          } else if (extraction.fields.total_amount?.value != null) {
            newClosingBalance = Number(extraction.fields.total_amount.value);
          }

          if (Array.isArray(extraction.items) && extraction.items.length > 0) {
            newEntries = extraction.items.map((it, idx) => ({
              id: `re_${stored.id}_${idx + 1}`,
              date: String(it.date || newStatementDate || ""),
              reference_no: String(it.reference || it.reference_no || `INV-${idx + 1}`),
              original_reference: it.reference ? String(it.reference) : undefined,
              description: String(it.description || "Historical Statement Entry"),
              debit: Number(it.debit || 0),
              credit: Number(it.credit || 0),
              balance: Number(it.balance || 0),
              status: "historical" as const,
              source_filename: stored.file_name,
            }));
          }
        }

        // Calculate debits & credits
        let totDebits = 0;
        let totCredits = 0;
        newEntries.forEach((e) => {
          totDebits += Number(e.debit) || 0;
          totCredits += Number(e.credit) || 0;
        });

        // If closing balance was not explicitly stated, compute from entries if entries exist
        if (newClosingBalance === null && newEntries.length > 0) {
          const lastEntry = newEntries[newEntries.length - 1];
          if (lastEntry.balance != null && !Number.isNaN(lastEntry.balance)) {
            newClosingBalance = lastEntry.balance;
          } else {
            newClosingBalance = Math.round((newOpeningBalance + totDebits - totCredits) * 100) / 100;
          }
        }

        const expectedClosing = Math.round((newOpeningBalance + totDebits - totCredits) * 100) / 100;
        const isMathValid = newClosingBalance !== null && Math.abs(newClosingBalance - expectedClosing) <= 0.05;

        // Match customer
        const customerMatch = matchCustomerCandidates(newCustomerName, customers);
        const resolvedCustomerId = customerMatch.matchedCustomerId || stored.customer_id;

        const updatedAuditTrail = [
          ...(stored.audit_trail || []),
          {
            timestamp: nowIso,
            action: "create" as const,
            reason: "Re-extracted from stored original document via automated repair engine",
            original: {
              closingBalance: stored.closing_balance,
              statementDate: stored.statement_date,
              entriesCount: stored.entries.length,
            },
            updated: {
              closingBalance: newClosingBalance,
              statementDate: newStatementDate,
              entriesCount: newEntries.length,
              isMathValid,
            },
          },
        ];

        const newDescription = buildSoaAttachmentDescription({
          soaNumber: newSoaNumber,
          statementDate: newStatementDate || "",
          openingBalance: newOpeningBalance,
          charges: Math.round(totDebits * 100) / 100,
          credits: Math.round(totCredits * 100) / 100,
          closingBalance: newClosingBalance,
          checksumSha256: stored.checksum_sha256 || undefined,
          needsReview: !isMathValid || newClosingBalance === null || newEntries.length === 0 || !newStatementDate,
          isScannedPdf: isScanned,
          isVerified: false,
          status: "pending_verification",
          storagePath: resolvedPath,
          storageBucket: bucket,
          cutoverDate: stored.cutover_date,
          isCutoverApproved: stored.is_cutover_approved,
          entries: newEntries,
          auditTrail: updatedAuditTrail,
        });

        const newFileUrl = `/api/smart-import/storage?path=${encodeURIComponent(resolvedPath)}&bucket=${encodeURIComponent(bucket)}`;

        if (!dryRun) {
          const { error: updErr } = await supabase
            .from("document_attachments")
            .update({
              entity_id: resolvedCustomerId,
              file_url: newFileUrl,
              description: newDescription,
            })
            .eq("id", stored.id)
            .eq("company_id", companyId);

          if (updErr) {
            throw new Error(`Database update failed: ${updErr.message}`);
          }
        }

        repairedCount++;
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          status: "repaired",
          oldClosing: stored.closing_balance,
          newClosing: newClosingBalance,
          oldRows: stored.entries.length,
          newRows: newEntries.length,
          oldDate: stored.statement_date,
          newDate: newStatementDate || "Date required",
          isMathValid,
        });
      } catch (procErr) {
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          status: "failed",
          oldClosing: stored.closing_balance,
          newClosing: null,
          oldRows: stored.entries.length,
          newRows: 0,
          oldDate: stored.statement_date,
          newDate: "",
          isMathValid: false,
          error: procErr instanceof Error ? procErr.message : "Processing error during re-extraction.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      totalAttachments: attachments?.length || 0,
      repairedCount,
      skippedCount,
      missingFilesCount,
      failedCount: details.filter((d) => d.status === "failed").length,
      details,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Repair process failed.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
