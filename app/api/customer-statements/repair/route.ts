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
import {
  matchSingleHistoricalEntry,
  normalizeDocRef,
  type RawHistoricalEntry,
  type RawInvoice,
  type RawPayment,
  type RawReceiptVoucher,
} from "@/lib/customerStatementEngine";

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

    const [{ data: attachments, error: attErr }, { data: rawCustomers, error: custErr }, invRes, recRes, payRes] =
      await Promise.all([
        query.order("created_at", { ascending: false }),
        supabase
          .from("customers")
          .select("id, name, customer_code, trn, phone, email, address")
          .eq("company_id", companyId)
          .eq("active", true),
        supabase
          .from("tax_invoices")
          .select("id, customer_id, invoice_number, invoice_date, total_amount, status")
          .eq("company_id", companyId)
          .not("status", "in", '("cancelled","void")'),
        supabase
          .from("receipt_vouchers")
          .select("id, customer_id, voucher_number, voucher_date, amount, status, payment_method, cheque_number")
          .eq("company_id", companyId)
          .not("status", "in", '("cancelled","void")'),
        supabase
          .from("payments")
          .select("id, customer_id, payment_number, reference_number, payment_date, amount, status, payment_method")
          .eq("company_id", companyId)
          .not("status", "in", '("cancelled","void")'),
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

    const invByCust = new Map<string, RawInvoice[]>();
    (invRes.data || []).forEach((row) => {
      if (!row.customer_id) return;
      const list = invByCust.get(row.customer_id) || [];
      list.push(row as RawInvoice);
      invByCust.set(row.customer_id, list);
    });
    const recByCust = new Map<string, RawReceiptVoucher[]>();
    (recRes.data || []).forEach((row) => {
      if (!row.customer_id) return;
      const list = recByCust.get(row.customer_id) || [];
      list.push(row as RawReceiptVoucher);
      recByCust.set(row.customer_id, list);
    });
    const payByCust = new Map<string, RawPayment[]>();
    (payRes.data || []).forEach((row) => {
      if (!row.customer_id) return;
      const list = payByCust.get(row.customer_id) || [];
      list.push(row as RawPayment);
      payByCust.set(row.customer_id, list);
    });

    // 2. Pre-index storage objects recursively (up to depth 3) in company's smart-imports folder
    const storageFileIndex = new Map<string, string>(); // normalized file key -> storagePath
    const normalizeKey = (name: string) =>
      name
        .replace(/^[0-9]+_[a-f0-9]+_/i, "")
        .replace(/^[0-9a-f-]{36}[-_]/i, "")
        .trim()
        .toLowerCase();

    async function indexStoragePrefix(prefix: string, depth = 0) {
      if (depth > 3) return;
      const { data: items } = await supabase.storage.from("smart-imports").list(prefix, { limit: 200 });
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!item.name) continue;
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        const isFolder = item.id === null && (!item.metadata || Object.keys(item.metadata).length === 0);
        if (isFolder) {
          await indexStoragePrefix(fullPath, depth + 1);
        } else {
          const exactLower = item.name.toLowerCase();
          const stripped = normalizeKey(item.name);
          if (!storageFileIndex.has(stripped)) storageFileIndex.set(stripped, fullPath);
          if (!storageFileIndex.has(exactLower)) storageFileIndex.set(exactLower, fullPath);
        }
      }
    }

    try {
      await indexStoragePrefix(companyId, 0);
    } catch (storageScanErr) {
      console.warn("Storage index scan warning:", storageScanErr);
    }

    let repairedCount = 0;
    let skippedCount = 0;
    let missingFilesCount = 0;
    const customerSeenTxMap = new Map<string, Map<string, string>>(); // customerId -> (txSig -> firstSoaNumber)
    const details: Array<{
      id: string;
      fileName: string;
      soaNumber?: string;
      customerName?: string;
      status: "repaired" | "skipped_verified" | "missing_file" | "failed";
      oldClosing: number | null;
      newClosing: number | null;
      calculatedClosing?: number | null;
      debits?: number;
      credits?: number;
      difference?: number | null;
      oldRows: number;
      newRows: number;
      oldDate: string;
      newDate: string;
      isMathValid: boolean;
      duplicateRowsCount?: number;
      overlappingSoaRowsCount?: number;
      matchedErpRowsCount?: number;
      conflictErpRowsCount?: number;
      overlapNote?: string;
      error?: string;
    }> = [];

    const analyzeEntries = (
      customerId: string | null | undefined,
      soaNumber: string,
      entries: RawHistoricalEntry[]
    ) => {
      let duplicateRowsCount = 0;
      let overlappingSoaRowsCount = 0;
      let matchedErpRowsCount = 0;
      let conflictErpRowsCount = 0;
      const overlapSources = new Set<string>();
      const localSeen = new Set<string>();
      const siblingMap = customerId
        ? customerSeenTxMap.get(customerId) || new Map<string, string>()
        : new Map<string, string>();
      if (customerId && !customerSeenTxMap.has(customerId)) {
        customerSeenTxMap.set(customerId, siblingMap);
      }

      const custInvs = customerId ? invByCust.get(customerId) || [] : [];
      const custRecs = customerId ? recByCust.get(customerId) || [] : [];
      const custPays = customerId ? payByCust.get(customerId) || [] : [];

      for (const e of entries) {
        const dAmt = Number(e.debit) || 0;
        const cAmt = Number(e.credit) || 0;
        if (dAmt === 0 && cAmt === 0) continue;
        const normRef = normalizeDocRef(e.reference_no || e.original_reference);
        const day = (e.date || "").slice(0, 10);
        const sig = `${day}|${normRef}|${dAmt.toFixed(2)}|${cAmt.toFixed(2)}`;

        if (localSeen.has(sig)) {
          duplicateRowsCount++;
        } else {
          localSeen.add(sig);
        }

        if (customerId) {
          const prevSoa = siblingMap.get(sig);
          if (prevSoa && prevSoa !== soaNumber) {
            overlappingSoaRowsCount++;
            overlapSources.add(prevSoa);
          } else if (!prevSoa) {
            siblingMap.set(sig, soaNumber || "Previous SOA");
          }

          const erpMatch = matchSingleHistoricalEntry(e, custInvs, custRecs, custPays);
          if (erpMatch.status === "matched") matchedErpRowsCount++;
          else if (erpMatch.status === "conflict") conflictErpRowsCount++;
        }
      }

      const notes: string[] = [];
      if (duplicateRowsCount > 0) notes.push(`${duplicateRowsCount} intra-SOA dup`);
      if (overlappingSoaRowsCount > 0) {
        notes.push(`${overlappingSoaRowsCount} overlap (${Array.from(overlapSources).slice(0, 2).join(", ")})`);
      }
      if (conflictErpRowsCount > 0) notes.push(`${conflictErpRowsCount} ERP amount conflict`);
      if (matchedErpRowsCount > 0) notes.push(`${matchedErpRowsCount} linked to live ERP`);

      return {
        duplicateRowsCount,
        overlappingSoaRowsCount,
        matchedErpRowsCount,
        conflictErpRowsCount,
        overlapNote: notes.join("; ") || undefined,
      };
    };

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
        const analysis = analyzeEntries(stored.customer_id, stored.soa_number, stored.entries);
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          soaNumber: stored.soa_number,
          customerName: stored.customer_name,
          status: "skipped_verified",
          oldClosing: stored.closing_balance,
          newClosing: stored.closing_balance,
          calculatedClosing: stored.closing_balance,
          debits: stored.charges,
          credits: stored.credits,
          difference: 0,
          oldRows: stored.entries.length,
          newRows: stored.entries.length,
          oldDate: stored.statement_date,
          newDate: stored.statement_date,
          isMathValid: true,
          ...analysis,
        });
        continue;
      }

      // Resolve storage path from metadata, file_url query (?path=), or recursive storage index
      let resolvedPath = stored.storage_path;
      if ((!resolvedPath || resolvedPath.startsWith("http") || resolvedPath.startsWith("/")) && stored.file_url) {
        try {
          const parsedUrl = new URL(stored.file_url, "http://localhost");
          const qPath = parsedUrl.searchParams.get("path");
          if (qPath && qPath.startsWith(`${companyId}/`)) {
            resolvedPath = qPath;
          }
        } catch {
          // ignore malformed URL
        }
      }
      if (!resolvedPath || resolvedPath.startsWith("http") || resolvedPath.startsWith("/")) {
        const cleanLower = stored.file_name.toLowerCase();
        resolvedPath = storageFileIndex.get(normalizeKey(stored.file_name)) || storageFileIndex.get(cleanLower) || null;
      }

      if (!resolvedPath) {
        missingFilesCount++;
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          soaNumber: stored.soa_number,
          customerName: stored.customer_name,
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
            newEntries = extraction.items.map((it, idx) => {
              const rawRef = it.reference ? String(it.reference).trim() : it.reference_no ? String(it.reference_no).trim() : "";
              return {
                id: `re_${stored.id}_${idx + 1}`,
                date: String(it.date || newStatementDate || ""),
                // Never invent invoice numbers for payments/transfers without an explicit reference
                reference_no: rawRef,
                original_reference: rawRef || undefined,
                description: String(it.description || "Statement Entry"),
                debit: Math.round((Number(it.debit ?? 0) || 0) * 100) / 100,
                credit: Math.round((Number(it.credit ?? 0) || 0) * 100) / 100,
                balance: it.balance != null ? Math.round(Number(it.balance) * 100) / 100 : undefined,
                status: "historical" as const,
                source_filename: stored.file_name,
              };
            });
          }
        }

        // Calculate debits & credits
        let totDebits = 0;
        let totCredits = 0;
        newEntries.forEach((e) => {
          totDebits += Number(e.debit) || 0;
          totCredits += Number(e.credit) || 0;
        });

        // Do NOT invent or overwrite an unextracted PDF closing balance.
        // Unknown closing balance stays `null` ("Not extracted") and requires manual review.
        const expectedClosing = Math.round((newOpeningBalance + totDebits - totCredits) * 100) / 100;
        const isMathValid = newClosingBalance !== null && Math.abs(newClosingBalance - expectedClosing) <= 0.01;

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
        const resolvedCustomerName =
          (resolvedCustomerId && custMap.get(resolvedCustomerId)) ||
          newCustomerName ||
          "Unassigned";
        const totalDebits = Math.round(totDebits * 100) / 100;
        const totalCredits = Math.round(totCredits * 100) / 100;
        const closingDiff =
          newClosingBalance !== null
            ? Math.round((newClosingBalance - expectedClosing) * 100) / 100
            : null;
        const analysis = analyzeEntries(resolvedCustomerId, newSoaNumber, newEntries);
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          soaNumber: newSoaNumber,
          customerName: resolvedCustomerName,
          status: "repaired",
          oldClosing: stored.closing_balance,
          newClosing: newClosingBalance,
          calculatedClosing: expectedClosing,
          debits: totalDebits,
          credits: totalCredits,
          difference: closingDiff,
          oldRows: stored.entries.length,
          newRows: newEntries.length,
          oldDate: stored.statement_date,
          newDate: newStatementDate || "Date required",
          isMathValid,
          ...analysis,
        });
      } catch (procErr) {
        details.push({
          id: stored.id,
          fileName: stored.file_name,
          soaNumber: stored.soa_number,
          customerName: stored.customer_name,
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

    const failedCount = details.filter((d) => d.status === "failed").length;
    const discrepanciesCount = details.filter(
      (d) => d.status === "repaired" && (!d.isMathValid || d.newClosing === null || d.newRows === 0)
    ).length;
    const duplicatesCount = details.reduce((s, d) => s + (d.duplicateRowsCount || 0), 0);
    const overlapsCount = details.reduce((s, d) => s + (d.overlappingSoaRowsCount || 0), 0);

    return NextResponse.json({
      success: true,
      dryRun,
      totalAttachments: attachments?.length || 0,
      repairedCount,
      skippedCount,
      missingFilesCount,
      failedCount,
      discrepanciesCount,
      duplicatesCount,
      overlapsCount,
      details,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Repair process failed.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
