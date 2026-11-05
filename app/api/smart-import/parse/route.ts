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
  auditStatementOfAccount,
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
    const fileQueue: { name: string; buffer: ArrayBuffer; fileType: SupportedFileType; size: number; storagePath?: string; storageBucket?: string }[] = [];
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
            storagePath: ref.storagePath,
            storageBucket: bucket,
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
    const batchProposedCustomers: { name: string; trn?: string }[] = [];

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
          classificationReason: `Extraction failed: ${errMsg}`,
          extractionStatus: "failed",
          extractionError: errMsg,
          fields: {},
          items: [],
          customerResolution: {
            action: "skip",
            targetModule: "Customers",
            targetTable: "customers",
            extractedName: "",
            matchConfidence: 0,
            matchReason: `Extraction failed: ${errMsg}`,
          },
          supplierResolution: {
            action: "skip",
            targetModule: "Suppliers",
            targetTable: "suppliers",
            extractedName: "",
            matchConfidence: 0,
            matchReason: `Extraction failed: ${errMsg}`,
          },
          projectResolution: {
            action: "skip",
            targetModule: "Projects",
            targetTable: "projects",
            extractedName: "",
            matchConfidence: 0,
            matchReason: `Extraction failed: ${errMsg}`,
          },
          destinationMappings: [],
          validationErrors: [`Extraction Error: ${errMsg}`],
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

      let soaAudit: ReturnType<typeof auditStatementOfAccount> | null = null;
      let lineAudit: ReturnType<typeof auditLineItemCalculations> | null = null;
      let totalsAudit: ReturnType<typeof auditDocumentTotals> | null = null;

      if (classification.documentType === "customer_statement") {
        const openBal = typeof fields.opening_balance?.value === "number" ? fields.opening_balance.value : 0;
        const charges = typeof fields.subtotal?.value === "number" ? fields.subtotal.value : 0;
        const credits = typeof fields.total_credits?.value === "number" ? fields.total_credits.value : 0;
        const closeBal = typeof fields.closing_balance?.value === "number"
          ? fields.closing_balance.value
          : typeof fields.total_amount?.value === "number"
          ? fields.total_amount.value
          : 0;

        soaAudit = auditStatementOfAccount(docId, docNumStr, openBal, charges, credits, closeBal);
        allAuditRows.push(...soaAudit.auditRows);
      } else {
        lineAudit = auditLineItemCalculations(docId, docNumStr, items);
        items = lineAudit.auditedItems;
        allAuditRows.push(...lineAudit.auditRows);

        totalsAudit = auditDocumentTotals(
          docId,
          docNumStr,
          fields.subtotal?.value as number | null,
          fields.vat_amount?.value as number | null,
          fields.total_amount?.value as number | null,
          items
        );
        allAuditRows.push(...totalsAudit.auditRows);
      }

      if (measurements) {
        const measAudit = auditPvcTankLinerMeasurements(docId, docNumStr, measurements);
        measurements = measAudit.auditedMeasurement;
        allAuditRows.push(...measAudit.auditRows);
      }

      // 3. Entity Resolution with Sales/Purchase Distinctions and Batch Deduplication
      const extractedCustName = fields.customer_name?.value ? String(fields.customer_name.value) : null;
      const extractedSuppName = fields.supplier_name?.value ? String(fields.supplier_name.value) : null;
      const extractedTrn = fields.trn?.value ? String(fields.trn.value) : null;
      const extractedProjName = fields.project_name?.value ? String(fields.project_name.value) : null;

      const isPurchaseDocument = ["supplier_bill", "purchase_order"].includes(classification.documentType);

      // 5. Validation Warnings & Errors
      const validationErrors: string[] = [];
      const validationWarnings: string[] = [];

      // Customer matching (sales documents or when customer info is present)
      const customerResolution = isPurchaseDocument && !extractedCustName
        ? {
            action: "skip" as const,
            targetModule: "Customers",
            targetTable: "customers",
            extractedName: "",
            matchConfidence: 0,
            matchReason: "Purchase document; customer entity not required.",
          }
        : matchCustomer(extractedCustName, extractedTrn, existingCache, batchProposedCustomers);

      // If customer is proposed for creation, track it for subsequent documents in the batch
      if (customerResolution.action === "create_new" && extractedCustName) {
        if (classification.documentType === "customer_statement") {
          // Guardrail: Do not create new customer records automatically from SOA imports without explicit user review
          customerResolution.action = "needs_review";
          customerResolution.matchReason = `Customer '${extractedCustName}' not found in ERP. Statement of Account requires explicit approval before creating a new customer record.`;
          validationWarnings.push(`Customer '${extractedCustName}' not found in ERP. Marked for review before customer creation.`);
        } else {
          batchProposedCustomers.push({
            name: extractedCustName,
            trn: extractedTrn || undefined,
          });
        }
      }

      // Supplier matching (only for purchase documents)
      const supplierResolution = !isPurchaseDocument
        ? {
            action: "skip" as const,
            targetModule: "Suppliers",
            targetTable: "suppliers",
            extractedName: "",
            matchConfidence: 0,
            matchReason: "Sales invoice - no supplier entity required",
          }
        : matchSupplier(extractedSuppName, extractedTrn, existingCache);

      // Project matching (only if explicitly identified and justified)
      const projectResolution = matchProject(extractedProjName, customerResolution.matchedId || null, existingCache);

      // 4. Duplicate Check
      const duplicateCheck = checkDuplicateDocument(
        fields.document_number?.value ? String(fields.document_number.value) : null,
        classification.documentType,
        existingCache
      );

      // 5. Validation Check Processing
      const docTypeLabel = classification.documentType === "quotation"
        ? "Quotation"
        : classification.documentType === "proforma_invoice"
        ? "Proforma Invoice"
        : classification.documentType === "delivery_note"
        ? "Delivery Note"
        : classification.documentType === "purchase_order"
        ? "Purchase Order"
        : classification.documentType === "supplier_bill"
        ? "Supplier Bill"
        : classification.documentType === "customer_statement"
        ? "Statement of Account"
        : "Invoice";

      if (duplicateCheck.isDuplicate) {
        validationWarnings.push(duplicateCheck.reason || "Duplicate document detected.");
      }

      if (soaAudit) {
        if (!soaAudit.isReconciled) {
          validationWarnings.push(`Statement reconciliation difference of AED ${soaAudit.difference.toFixed(2)} detected.`);
          validationErrors.push(
            `Statement of Account arithmetic mismatch: Opening + Charges - Credits != Closing (discrepancy: AED ${soaAudit.difference.toFixed(2)}). Review required.`
          );
        }
      } else {
        if (lineAudit?.hasMismatches) {
          validationWarnings.push("Line item taxable amount differs from Qty × Rate − Discount calculation.");
          validationErrors.push(`Line item financial calculation mismatch. ${docTypeLabel} marked as Needs Review.`);
        }
        if (totalsAudit?.hasMismatches) {
          const diff = fields.total_amount?.value !== null && fields.total_amount?.value !== undefined
            ? Math.abs(Number(fields.total_amount.value) - totalsAudit.calculatedTotal).toFixed(2)
            : "0.00";
          validationWarnings.push("Grand total differs from calculated subtotal + VAT.");
          validationErrors.push(`Grand total verification failed against line items sum (discrepancy: AED ${diff}). ${docTypeLabel} marked as Needs Review.`);
        }
        const docSub = typeof fields.subtotal?.value === "number" ? fields.subtotal.value : null;
        const docDisc = typeof fields.discount?.value === "number" ? fields.discount.value : 0;
        const docVat = typeof fields.vat_amount?.value === "number" ? fields.vat_amount.value : null;
        const docTot = typeof fields.total_amount?.value === "number" ? fields.total_amount.value : null;
        if (docSub !== null && docVat !== null && docTot !== null) {
          const arithDiff = Math.abs((docSub - docDisc + docVat) - docTot);
          if (arithDiff > 0.05) {
            validationErrors.push(`Document internal arithmetic mismatch: Subtotal (${docSub}) - Discount (${docDisc}) + VAT (${docVat}) != Total (${docTot}) (discrepancy: AED ${arithDiff.toFixed(2)}). ${docTypeLabel} marked as Needs Review.`);
          }
        }
      }
      if (!fields.document_number) {
        validationWarnings.push("No explicit document number detected.");
      }
      if (customerResolution.action === "needs_review") {
        validationWarnings.push(`Customer '${extractedCustName}' has similar existing record requiring confirmation.`);
      }

      // Check for Filename vs Document Content Number Conflict (Task 3)
      const baseFn = fileItem.name.split(/[/\\]/).pop() || fileItem.name;
      const fnNumMatch = baseFn.match(/^([A-Za-z0-9]+[-_][0-9]+)/i);
      const fnDocNum = fnNumMatch ? fnNumMatch[1].toUpperCase() : null;
      const extractedNum = fields.document_number?.value ? String(fields.document_number.value).trim() : null;

      if (fnDocNum && extractedNum) {
        const normFn = fnDocNum.replace(/[/_]/g, "-").toUpperCase();
        const normExtracted = extractedNum.replace(/[/_]/g, "-").toUpperCase();
        const fnBase = normFn.replace(/[^A-Z0-9]/g, "");
        const extBase = normExtracted.replace(/[^A-Z0-9]/g, "");

        if (fnBase && extBase && fnBase !== extBase && !normExtracted.startsWith(normFn) && !normFn.startsWith(normExtracted)) {
          validationWarnings.push(
            `Filename identifier '${fnDocNum}' conflicts with internal document number '${extractedNum}'. Marked for review to prevent unintentional numbering collision.`
          );
          validationErrors.push(
            `Identifier Conflict: Filename states '${fnDocNum}' but document content states '${extractedNum}'. Review required.`
          );
        }
      }

      // Detect Revision Documents (e.g. (R1), Rev-1, etc.)
      const isRevision = /\b(?:\(R\d+\)|R\d+|Rev[-.\s]*\d+)\b/i.test(baseFn) ||
        (fields.document_number?.value && /\b(?:\(R\d+\)|R\d+|Rev[-.\s]*\d+)\b/i.test(String(fields.document_number.value)));
      if (isRevision) {
        validationWarnings.push(`Revision document detected (e.g. R1). Verify relationship with base document.`);
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

      if (validationErrors.length > 0) {
        destinationMappings.forEach(m => {
          if (m.proposedAction === "create_new") {
            m.proposedAction = "needs_review";
          }
        });
      }

      parsedDocuments.push({
        id: docId,
        filename: fileItem.name,
        fileSize: fileItem.size,
        fileType: fileItem.fileType,
        checksumSha256: `sha256_${fileItem.size}_${fileItem.name}`,
        documentType: classification.documentType,
        classificationConfidence: classification.confidence,
        classificationReason: classification.reason,
        extractionStatus: "success",
        fields,
        items,
        measurements,
        customerResolution,
        supplierResolution,
        projectResolution,
        statusResolution,
        storagePath: fileItem.storagePath,
        storageBucket: fileItem.storageBucket,
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
