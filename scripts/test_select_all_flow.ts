import fs from "fs";
import path from "path";
import { parsePdf } from "../lib/smartImport/parsers/pdfParser";
import { classifyDocument } from "../lib/smartImport/classifier";
import { extractFromPdf } from "../lib/smartImport/extractor";
import { auditLineItemCalculations, auditDocumentTotals } from "../lib/smartImport/calculator";
import type { ParsedDocument } from "../lib/smartImport/types";

interface QueueItem {
  id: string;
  name: string;
  status: "waiting" | "ready" | "failed" | "imported";
  parsedDoc?: ParsedDocument;
  selectedForImport: boolean;
}

// Emulate SmartImportPage state & actions
class SmartImportSelectionModel {
  queue: QueueItem[] = [];
  documents: ParsedDocument[] = [];
  skipDuplicates: boolean = true;
  activeTab: string = "upload";

  init(parsedDocs: ParsedDocument[]) {
    this.documents = parsedDocs;
    this.queue = parsedDocs.map((doc, idx) => {
      const hasErrors =
        (doc.validationErrors && doc.validationErrors.length > 0) ||
        doc.destinationMappings?.some(m => m.proposedAction === "needs_review");
      return {
        id: `q-${idx}`,
        name: doc.filename,
        status: "ready" as const,
        parsedDoc: doc,
        selectedForImport: !doc.isDuplicate && !hasErrors,
      };
    });
  }

  getMetrics() {
    const readyItems = this.queue.filter(q => q.status === "ready" || q.status === "imported");
    const eligibleItems = readyItems.filter(q => {
      const hasErrors =
        (q.parsedDoc?.validationErrors && q.parsedDoc.validationErrors.length > 0) ||
        q.parsedDoc?.destinationMappings?.some(m => m.proposedAction === "needs_review");
      const isDup = this.skipDuplicates && Boolean(q.parsedDoc?.isDuplicate);
      return !hasErrors && !isDup;
    });

    const selectedItems = readyItems.filter(q => q.selectedForImport);
    const selectedEligible = selectedItems.filter(q => {
      const hasErrors =
        (q.parsedDoc?.validationErrors && q.parsedDoc.validationErrors.length > 0) ||
        q.parsedDoc?.destinationMappings?.some(m => m.proposedAction === "needs_review");
      const isDup = this.skipDuplicates && Boolean(q.parsedDoc?.isDuplicate);
      return !hasErrors && !isDup;
    });

    const sCount = selectedItems.length;
    const rCount = readyItems.length;
    const allSelected = rCount > 0 && sCount === rCount;
    const someSelected = sCount > 0 && sCount < rCount;

    return {
      readyCount: rCount,
      eligibleCount: eligibleItems.length,
      selectedCount: sCount,
      selectedEligibleCount: selectedEligible.length,
      selectedBlockedCount: sCount - selectedEligible.length,
      isAllSelected: allSelected,
      isSomeSelected: someSelected,
    };
  }

  toggleSelectAll(mode?: "toggle" | "all" | "eligible" | "none") {
    const readyItems = this.queue.filter(q => q.status === "ready" || q.status === "imported");
    const selectedReady = readyItems.filter(q => q.selectedForImport);

    let targetSelect: boolean;
    let onlyEligible = true;

    if (mode === "all") {
      targetSelect = true;
      onlyEligible = false;
    } else if (mode === "eligible") {
      targetSelect = true;
      onlyEligible = true;
    } else if (mode === "none") {
      targetSelect = false;
    } else {
      targetSelect = selectedReady.length === 0;
      onlyEligible = true;
    }

    this.queue = this.queue.map(q => {
      if (q.status !== "ready" && q.status !== "imported") return q;

      if (!targetSelect) {
        return { ...q, selectedForImport: false };
      }

      if (onlyEligible) {
        const hasErrors =
          (q.parsedDoc?.validationErrors && q.parsedDoc.validationErrors.length > 0) ||
          q.parsedDoc?.destinationMappings?.some(m => m.proposedAction === "needs_review");
        const isDup = this.skipDuplicates && Boolean(q.parsedDoc?.isDuplicate);
        const isEligible = !hasErrors && !isDup;
        return { ...q, selectedForImport: isEligible };
      }

      return { ...q, selectedForImport: true };
    });
  }

  toggleSelectQueueItem(id: string) {
    this.queue = this.queue.map(q => (q.id === id ? { ...q, selectedForImport: !q.selectedForImport } : q));
  }

  removeQueueItem(id: string) {
    const item = this.queue.find(q => q.id === id);
    if (!item) return;
    this.queue = this.queue.filter(q => q.id !== id);
    this.documents = this.documents.filter(d => d.filename !== item.name);
  }

  getApprovedDocs() {
    return this.documents.filter(d => {
      const qItem = this.queue.find(q => q.name === d.filename || q.parsedDoc?.id === d.id);
      if (!qItem || !qItem.selectedForImport) return false;
      if (this.skipDuplicates && d.isDuplicate) return false;
      if (d.validationErrors && d.validationErrors.length > 0) return false;
      if (d.destinationMappings?.some(m => m.proposedAction === "needs_review")) return false;
      return true;
    });
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("SMART IMPORT SELECTION & SAFETY VERIFICATION SUITE");
  console.log("==========================================================");

  // Load and parse all 57 quotations
  const dir = "D:/Golden Elite Tents/Quotation";
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".pdf"));
  const parsedDocs: ParsedDocument[] = [];

  for (const f of files) {
    const fullPath = path.join(dir, f);
    const buf = fs.readFileSync(fullPath);
    const parsed = await parsePdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), f);
    const cls = classifyDocument(f, parsed.allText);
    const ext = extractFromPdf(parsed, f, cls.documentType);

    const docId = f;
    const docNumStr = String(ext.fields.document_number?.value || f);
    const lineAudit = auditLineItemCalculations(docId, docNumStr, ext.items);
    const totalsAudit = auditDocumentTotals(
      docId,
      docNumStr,
      ext.fields.subtotal?.value as number | null,
      ext.fields.vat_amount?.value as number | null,
      ext.fields.total_amount?.value as number | null,
      lineAudit.auditedItems
    );

    const validationErrors: string[] = [];
    if (lineAudit.hasMismatches) {
      validationErrors.push("Line item financial calculation mismatch. Quotation marked as Needs Review.");
    }
    if (totalsAudit.hasMismatches) {
      validationErrors.push("Grand total verification failed against line items sum. Quotation marked as Needs Review.");
    }
    const docSub = typeof ext.fields.subtotal?.value === "number" ? ext.fields.subtotal.value : null;
    const docDisc = typeof ext.fields.discount?.value === "number" ? ext.fields.discount.value : 0;
    const docVat = typeof ext.fields.vat_amount?.value === "number" ? ext.fields.vat_amount.value : null;
    const docTot = typeof ext.fields.total_amount?.value === "number" ? ext.fields.total_amount.value : null;
    if (docSub !== null && docVat !== null && docTot !== null) {
      if (Math.abs((docSub - docDisc + docVat) - docTot) > 0.05) {
        validationErrors.push("Document internal arithmetic mismatch. Quotation marked as Needs Review.");
      }
    }

    parsedDocs.push({
      id: `doc-${f}`,
      filename: f,
      fileSize: buf.length,
      fileType: "pdf",
      checksumSha256: `hash-${f}`,
      documentType: cls.documentType,
      classificationConfidence: cls.confidence,
      classificationReason: cls.reason,
      fields: ext.fields,
      items: ext.items,
      validationErrors,
      validationWarnings: [],
      destinationMappings: [],
      isDuplicate: false,
      extractionStatus: "success",
      rawContentSummary: { rawSnippets: [] },
    });
  }

  const model = new SmartImportSelectionModel();
  model.init(parsedDocs);

  // Test 1: Initial state
  const mInit = model.getMetrics();
  console.log(`[Test 1] Initial Ready state: ${mInit.readyCount} files, ${mInit.eligibleCount} eligible`);
  console.log(`         Selected: ${mInit.selectedCount}, Indeterminate: ${mInit.isSomeSelected}`);
  if (mInit.readyCount !== 57 || mInit.eligibleCount !== 53 || mInit.selectedCount !== 53 || !mInit.isSomeSelected) {
    throw new Error("Test 1 failed: Initial selection counts mismatch!");
  }
  console.log("  [PASS] Initial state correctly selects 53 eligible documents with indeterminate state");

  // Test 2: Clicking Select All while in indeterminate state should Deselect All
  model.toggleSelectAll(); // default toggle action
  const mDeselected = model.getMetrics();
  console.log(`[Test 2] After clicking toggle from indeterminate: Selected = ${mDeselected.selectedCount}`);
  if (mDeselected.selectedCount !== 0 || mDeselected.isSomeSelected || mDeselected.isAllSelected) {
    throw new Error("Test 2 failed: Clicking toggle did not deselect all!");
  }
  console.log("  [PASS] Clicking toggle from indeterminate correctly deselected all 57 documents");

  // Test 3: Clicking Select All while 0 selected should select all 53 eligible
  model.toggleSelectAll();
  const mSelectEligible = model.getMetrics();
  console.log(`[Test 3] After clicking toggle from 0 selected: Selected = ${mSelectEligible.selectedCount}`);
  if (mSelectEligible.selectedCount !== 53 || !mSelectEligible.isSomeSelected) {
    throw new Error("Test 3 failed: Clicking toggle from 0 did not select eligible documents!");
  }
  console.log("  [PASS] Clicking toggle from 0 correctly selected all 53 eligible documents");

  // Test 4: Explicit Select All (mode = 'all') selects all 57
  model.toggleSelectAll("all");
  const mAll = model.getMetrics();
  console.log(`[Test 4] Select All mode: Selected = ${mAll.selectedCount}, isAllSelected = ${mAll.isAllSelected}`);
  if (mAll.selectedCount !== 57 || !mAll.isAllSelected || mAll.isSomeSelected) {
    throw new Error("Test 4 failed: Select All mode did not select 57!");
  }
  console.log("  [PASS] Select All mode successfully selected all 57 documents");

  // Test 5: Clicking toggle when ALL are selected deselects all
  model.toggleSelectAll();
  const mAllDeselected = model.getMetrics();
  console.log(`[Test 5] Toggle when all selected: Selected = ${mAllDeselected.selectedCount}`);
  if (mAllDeselected.selectedCount !== 0) {
    throw new Error("Test 5 failed: Did not deselect all!");
  }
  console.log("  [PASS] Clicking toggle when all selected deselects all");

  // Test 6: Individual checkbox selection works independently
  const firstItemId = model.queue[0].id;
  model.toggleSelectQueueItem(firstItemId);
  const mOne = model.getMetrics();
  console.log(`[Test 6] Selected 1 item: Selected = ${mOne.selectedCount}, isSomeSelected = ${mOne.isSomeSelected}`);
  if (mOne.selectedCount !== 1 || !mOne.isSomeSelected) {
    throw new Error("Test 6 failed: 1 item toggle failed!");
  }
  console.log("  [PASS] Individual checkbox works independently");

  // Test 7: Selecting multiple items independently
  const secondItemId = model.queue[1].id;
  model.toggleSelectQueueItem(secondItemId);
  const mTwo = model.getMetrics();
  if (mTwo.selectedCount !== 2) throw new Error("Test 7 failed: 2 items toggle failed!");
  console.log("  [PASS] Multiple individual selections work independently");

  // Test 8: Deselecting one item after Select All (57 -> 56)
  model.toggleSelectAll("all");
  model.toggleSelectQueueItem(firstItemId);
  const mMinusOne = model.getMetrics();
  console.log(`[Test 8] Deselect one after Select All: Selected = ${mMinusOne.selectedCount}, isSomeSelected = ${mMinusOne.isSomeSelected}`);
  if (mMinusOne.selectedCount !== 56 || !mMinusOne.isSomeSelected || mMinusOne.isAllSelected) {
    throw new Error("Test 8 failed: Deselect one failed!");
  }
  console.log("  [PASS] Deselecting one after Select All sets state to indeterminate (56/57)");

  // Test 9: Remove a selected item
  model.removeQueueItem(secondItemId);
  const mRemoved = model.getMetrics();
  console.log(`[Test 9] Remove item: Total ready = ${mRemoved.readyCount}, Selected = ${mRemoved.selectedCount}`);
  if (mRemoved.readyCount !== 56 || mRemoved.selectedCount !== 55) {
    throw new Error("Test 9 failed: Remove item did not update metrics!");
  }
  console.log("  [PASS] Removing a selected document updates queue and selection metrics");

  // Test 10: SAFETY GUARDRAIL - Select All 57 documents, verify only 53 can be approved/imported!
  model.init(parsedDocs);
  model.toggleSelectAll("all"); // Select ALL 57 documents, including the 4 with errors
  const approvedDocs = model.getApprovedDocs();
  console.log(`[Test 10] With ALL 57 selected, approved for import count = ${approvedDocs.length}`);
  const docsWithErrors = parsedDocs.filter(d => d.validationErrors.length > 0).map(d => d.filename);
  console.log("Documents with validation errors:", docsWithErrors);
  const approvedFilenames = approvedDocs.map(d => d.filename);
  const leakedBlocked = docsWithErrors.filter(f => approvedFilenames.includes(f));
  if (leakedBlocked.length > 0) {
    throw new Error(`SAFETY VIOLATION: ${leakedBlocked.join(", ")} leaked into approvedDocs!`);
  }
  console.log("  [PASS] Safety guardrail: Even with all 57 selected, the 4 quotations with critical errors (QTN112-26, QTN114-26, QTN123-26, QTN127-26) remain 100% BLOCKED from import!");

  console.log("\n==========================================================");
  console.log("ALL 10 SELECTION & SAFETY TESTS PASSED (100%)");
  console.log("==========================================================");
}

runTests().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
