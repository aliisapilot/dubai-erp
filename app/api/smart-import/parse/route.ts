/**
 * Dubai ERP: Smart Import - Parse & Preview API Route
 * Processes uploaded Word, Excel, CSV, PDF, and ZIP files.
 * Supports BOTH:
 *  1) Direct Supabase Storage references ({ storageBucket, storagePath, fileName, ... })
 *  2) Multipart FormData uploads (single or bounded small batches)
 * Classifies, extracts, matches entities, audits calculations, and prepares preview.
 * Strictly Read-Only (Stages 1-9: Zero database mutations).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unpackZipArchive, detectFileType } from "@/lib/smartImport/parsers/zipParser";
import { parseDocx } from "@/lib/smartImport/parsers/docxParser";
import { parseSpreadsheet } from "@/lib/smartImport/parsers/xlsxParser";
import { parsePdf } from "@/lib/smartImport/parsers/pdfParser";
import { classifyDocument } from "@/lib/smartImport/classifier";
import {
  extractFromDocx,
  extractFromSpreadsheet,
  extractFromPdf,
  type ExtractionOutput,
} from "@/lib/smartImport/extractor";
import {
  loadExistingEntities,
  matchCustomer,
  matchSupplier,
  matchProject,
  checkDuplicateDocument,
} from "@/lib/smartImport/matcher";
import {
  auditLineItemCalculations,
  auditDocumentTotals,
  auditPvcTankLinerMeasurements,
} from "@/lib/smartImport/calculator";
import { generateDestinationMappings } from "@/lib/smartImport/destinationMapper";
import { resolveDocumentStatus } from "@/lib/smartImport/statusResolver";
import {
  buildRelationshipTrees,
  computeBeforeAndAfterSummary,
} from "@/lib/smartImport/relationshipBuilder";
import type { ParsedDocument, SupportedFileType, CalculationAuditRow } from "@/lib/smartImport/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s timeout for heavy parsing on Node.js Serverless runtime

interface StorageReferenceInput {
  storageBucket?: string;
  storagePath: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
}

export async function POST(req: NextRequest) {
  const requestId = `req_parse_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");

    // Initialize Supabase reader with auth context
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });

    // Expand files from either Storage References (JSON) or Direct Upload (FormData)
    const fileQueue: { name: string; buffer: ArrayBuffer; fileType: SupportedFileType; size: number }[] = [];
    const lockFilesDetected: string[] = [];

    if (isJson) {
      // -------------------------------------------------------------
      // PATH A: Storage References (Zero Request Size Limit Issue!)
      // -------------------------------------------------------------
      const body = await req.json();
      const rawRefs: StorageReferenceInput[] = Array.isArray(body.references)
        ? body.references
        : body.storagePath
        ? [body as StorageReferenceInput]
        : [];

      if (rawRefs.length === 0) {
        return NextResponse.json(
          { success: false, error: "No storage references or files provided.", requestId },
          { status: 400, headers: { "x-request-id": requestId } }
        );
      }

      for (const ref of rawRefs) {
        const bucket = ref.storageBucket || "smart-imports";
        const baseName = ref.fileName.split(/[/\\]/).pop() || ref.fileName;

        if (baseName.startsWith("~$") || baseName.startsWith(".~")) {
          lockFilesDetected.push(baseName);
          continue;
        }

        // Download directly from private Supabase Storage
        const { data: fileBlob, error: dlErr } = await supabase.storage
          .from(bucket)
          .download(ref.storagePath);

        if (dlErr || !fileBlob) {
          console.warn(`Could not download storage path ${ref.storagePath}:`, dlErr?.message);
          continue;
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        const detected = detectFileType(ref.fileName);
        if (!detected) continue;

        if (detected === "zip") {
          const unpacked = await unpackZipArchive(arrayBuffer);
          for (const item of unpacked) {
            const itemBase = item.name.split(/[/\\]/).pop() || item.name;
            if (itemBase.startsWith("~$") || itemBase.startsWith(".~")) {
              lockFilesDetected.push(itemBase);
              continue;
            }
            fileQueue.push({
              name: item.name,
              buffer: item.buffer,
              fileType: item.fileType,
              size: item.size,
            });
          }
        } else {
          fileQueue.push({
            name: ref.fileName,
            buffer: arrayBuffer,
            fileType: detected,
            size: arrayBuffer.byteLength,
          });
        }
      }
    } else {
      // -------------------------------------------------------------
      // PATH B: Multipart FormData Direct Upload
      // -------------------------------------------------------------
      const formData = await req.formData();
      const files = formData.getAll("files") as File[];

      if (!files || files.length === 0) {
        return NextResponse.json(
          { success: false, error: "No files uploaded.", requestId },
          { status: 400, headers: { "x-request-id": requestId } }
        );
      }

      for (const f of files) {
        const baseName = f.name.split(/[/\\]/).pop() || f.name;
        if (
          baseName.startsWith("~$") ||
          baseName.startsWith(".~") ||
          (f.size < 400 && (baseName.endsWith(".docx") || baseName.endsWith(".xlsx")))
        ) {
          lockFilesDetected.push(baseName);
          continue;
        }

        const arrayBuffer = await f.arrayBuffer();
        const detected = detectFileType(f.name);

        if (!detected) continue;

        if (detected === "zip") {
          const unpacked = await unpackZipArchive(arrayBuffer);
          for (const item of unpacked) {
            const itemBase = item.name.split(/[/\\]/).pop() || item.name;
            if (itemBase.startsWith("~$") || itemBase.startsWith(".~")) {
              lockFilesDetected.push(itemBase);
              continue;
            }
            fileQueue.push({
              name: item.name,
              buffer: item.buffer,
              fileType: item.fileType,
              size: item.size,
            });
          }
        } else {
          fileQueue.push({
            name: f.name,
            buffer: arrayBuffer,
            fileType: detected,
            size: f.size,
          });
        }
      }
    }

    if (fileQueue.length === 0) {
      if (lockFilesDetected.length > 0) {
        const lockName = lockFilesDetected[0];
        const actualName = lockName.replace(/^[~.$]+/, "");
        return NextResponse.json(
          {
            success: false,
            error: `'${lockName}' is a Microsoft Office temporary lock file created by Word/Excel while a file is open. Please select the actual document '${actualName}' instead.`,
            requestId,
          },
          { status: 400, headers: { "x-request-id": requestId } }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "No supported documents (.docx, .xlsx, .xls, .csv, .pdf) found in upload.",
          requestId,
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    // Pre-load existing entities (customers, suppliers, projects, permanent employees, existing docs)
    const existingCache = await loadExistingEntities(supabase);

    const parsedDocuments: ParsedDocument[] = [];
    const allAuditRows: CalculationAuditRow[] = [];

    for (const fileItem of fileQueue) {
      const docId = `doc_${crypto.randomUUID()}`;
      let fullText = "";
      let sheetsOrTablesCount = 1;
      let extraction: ExtractionOutput | null = null;
      let classification = classifyDocument(fileItem.name, "", 1);

      // 1. Parse by format with per-file error isolation
      try {
        if (fileItem.fileType === "docx" || fileItem.fileType === "doc") {
          const docxRes = await parseDocx(fileItem.buffer, fileItem.name);
          fullText = docxRes.allText;
          sheetsOrTablesCount = docxRes.tables.length;
          classification = classifyDocument(fileItem.name, fullText, sheetsOrTablesCount);
          extraction = extractFromDocx(docxRes, fileItem.name, classification.documentType);
        } else if (fileItem.fileType === "xlsx" || fileItem.fileType === "xls" || fileItem.fileType === "csv") {
          const xlsxRes = parseSpreadsheet(fileItem.buffer, fileItem.name);
          fullText = xlsxRes.allText;
          sheetsOrTablesCount = xlsxRes.sheetNames.length;
          classification = classifyDocument(fileItem.name, fullText, sheetsOrTablesCount);
          extraction = extractFromSpreadsheet(xlsxRes, fileItem.name, classification.documentType);
        } else if (fileItem.fileType === "pdf") {
          const pdfRes = await parsePdf(fileItem.buffer, fileItem.name);
          fullText = pdfRes.allText;
          sheetsOrTablesCount = pdfRes.pagesCount;
          classification = classifyDocument(fileItem.name, fullText, sheetsOrTablesCount);
          extraction = extractFromPdf(pdfRes, fileItem.name, classification.documentType);
        }
      } catch (fileErr: unknown) {
        const errMsg = fileErr instanceof Error ? fileErr.message : String(fileErr);
        console.warn(`Error parsing file ${fileItem.name}:`, errMsg);
        parsedDocuments.push({
          id: docId,
          filename: fileItem.name,
          fileSize: fileItem.size,
          fileType: fileItem.fileType,
          checksumSha256: `sha256_${fileItem.size}_${fileItem.name}`,
          documentType: "unknown",
          classificationConfidence: 0,
          classificationReason: "Failed to parse document",
          fields: {},
          items: [],
          customerResolution: {
            action: "create_new",
            targetModule: "Customers",
            targetTable: "customers",
            extractedName: fileItem.name,
            matchConfidence: 0,
          },
          supplierResolution: {
            action: "create_new",
            targetModule: "Suppliers",
            targetTable: "suppliers",
            extractedName: fileItem.name,
            matchConfidence: 0,
          },
          projectResolution: {
            action: "create_new",
            targetModule: "Projects",
            targetTable: "projects",
            extractedName: fileItem.name,
            matchConfidence: 0,
          },
          destinationMappings: [],
          validationErrors: [errMsg],
          validationWarnings: [],
          isDuplicate: false,
          rawContentSummary: { rawSnippets: [] },
        });
        continue;
      }

      if (!extraction) continue;

      const fields = extraction.fields || {};
      let items = extraction.items || [];
      let measurements = extraction.measurements;

      // 2. Mathematical Audit
      const docNumStr = String(fields.document_number?.value || fileItem.name);
      const lineAudit = auditLineItemCalculations(docId, docNumStr, items);
      items = lineAudit.auditedItems;
      allAuditRows.push(...lineAudit.auditRows);

      const totalsAudit = auditDocumentTotals(
        docId,
        docNumStr,
        fields.subtotal?.value as number | null,
        fields.vat_amount?.value as number | null,
        fields.total_amount?.value as number | null,
        items
      );
      allAuditRows.push(...totalsAudit.auditRows);

      if (measurements) {
        const measAudit = auditPvcTankLinerMeasurements(docId, docNumStr, measurements);
        measurements = measAudit.auditedMeasurement;
        allAuditRows.push(...measAudit.auditRows);
      }

      // 3. Entity Resolution
      const extractedCustName = fields.customer_name?.value ? String(fields.customer_name.value) : null;
      const extractedSuppName = fields.supplier_name?.value ? String(fields.supplier_name.value) : null;
      const extractedTrn = fields.trn?.value ? String(fields.trn.value) : null;
      const extractedProjName = fields.project_name?.value ? String(fields.project_name.value) : null;

      const customerResolution = matchCustomer(extractedCustName, extractedTrn, existingCache);
      const supplierResolution = matchSupplier(extractedSuppName, extractedTrn, existingCache);
      const projectResolution = matchProject(extractedProjName, customerResolution.matchedId || null, existingCache);

      // 4. Duplicate Check
      const duplicateCheck = checkDuplicateDocument(
        fields.document_number?.value ? String(fields.document_number.value) : null,
        classification.documentType,
        existingCache
      );

      // 5. Validation Warnings & Errors
      const validationErrors: string[] = [];
      const validationWarnings: string[] = [];

      if (duplicateCheck.isDuplicate) {
        validationWarnings.push(duplicateCheck.reason || "Duplicate document detected.");
      }
      if (lineAudit.hasMismatches) {
        validationWarnings.push("Line item total differs from Qty × Rate calculation.");
      }
      if (totalsAudit.hasMismatches) {
        validationWarnings.push("Grand total differs from calculated subtotal + VAT.");
      }
      if (!fields.document_number) {
        validationWarnings.push("No explicit document number detected.");
      }
      if (customerResolution.action === "needs_review") {
        validationWarnings.push(`Customer '${extractedCustName}' has similar existing record requiring confirmation.`);
      }

      // 6. Status Resolution (Historical Accuracy: Never assume accepted/paid/In Progress)
      const allTextForStatus = [
        fileItem.name,
        ...Object.values(fields).map(f => String(f.value || "")),
        ...(extraction.rawSummary?.rawSnippets || []).map(s => s.text),
      ].join(" ");

      const statusResolution = resolveDocumentStatus(
        classification.documentType,
        allTextForStatus,
        fields,
        extraction.rawSummary?.rawSnippets || []
      );

      if (!fields.status) {
        fields.status = {
          fieldKey: "status",
          label: "Document Status",
          value: statusResolution.proposedStatus,
          source: { file: fileItem.name, rawText: statusResolution.rawEvidence || "Default neutral status (Assumed)" },
          confidence: statusResolution.isAssumed ? 0.7 : 0.95,
          validationStatus: statusResolution.isAssumed ? "warning" : "valid",
          originalRawValue: statusResolution.rawEvidence || statusResolution.proposedStatus,
        };
      }
      if (!fields.project_status && statusResolution.projectStatusResolution) {
        fields.project_status = {
          fieldKey: "project_status",
          label: "Project Status",
          value: statusResolution.projectStatusResolution.proposedStatus,
          source: { file: fileItem.name, rawText: statusResolution.projectStatusResolution.rawEvidence || "Default neutral status (Assumed)" },
          confidence: statusResolution.projectStatusResolution.isAssumed ? 0.7 : 0.95,
          validationStatus: statusResolution.projectStatusResolution.isAssumed ? "warning" : "valid",
          originalRawValue: statusResolution.projectStatusResolution.rawEvidence || statusResolution.projectStatusResolution.proposedStatus,
        };
      }

      // 7. Generate Destination Mappings
      const destinationMappings = generateDestinationMappings(
        fileItem.name,
        classification.documentType,
        fields,
        items,
        customerResolution,
        supplierResolution,
        projectResolution,
        measurements,
        statusResolution
      );

      parsedDocuments.push({
        id: docId,
        filename: fileItem.name,
        fileSize: fileItem.size,
        fileType: fileItem.fileType,
        checksumSha256: `sha256_${fileItem.size}_${fileItem.name}`,
        documentType: classification.documentType,
        classificationConfidence: classification.confidence,
        classificationReason: classification.reason,
        fields,
        items,
        measurements,
        customerResolution,
        supplierResolution,
        projectResolution,
        statusResolution,
        destinationMappings,
        validationErrors,
        validationWarnings,
        isDuplicate: duplicateCheck.isDuplicate,
        duplicateReason: duplicateCheck.reason,
        rawContentSummary: extraction.rawSummary || { rawSnippets: [] },
      });
    }

    // 8. Relationship Trees & Summary
    const relationshipTrees = buildRelationshipTrees(parsedDocuments);
    const { beforeCounts, proposedSummary } = computeBeforeAndAfterSummary(parsedDocuments, existingCache);

    return NextResponse.json(
      {
        success: true,
        documents: parsedDocuments,
        auditRows: allAuditRows,
        relationshipTrees,
        beforeCounts,
        proposedSummary,
        requestId,
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    console.error("Smart import parsing error:", err);
    const errMsg = err instanceof Error ? err.message : "Failed to process files.";
    return NextResponse.json(
      { success: false, error: errMsg, requestId },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
