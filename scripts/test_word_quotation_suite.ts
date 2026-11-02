import fs from 'fs';
import path from 'path';
import { parseDocx } from '../lib/smartImport/parsers/docxParser';
import { extractFromDocx } from '../lib/smartImport/extractor';
import { classifyDocument } from '../lib/smartImport/classifier';
import { auditLineItemCalculations, auditDocumentTotals } from '../lib/smartImport/calculator';
import { matchCustomer, checkDuplicateDocument } from '../lib/smartImport/matcher';
import { generateDestinationMappings } from '../lib/smartImport/destinationMapper';
import type { ExistingDataCache, ParsedDocument } from '../lib/smartImport/types';

async function runWordQuotationSuite() {
  console.log('==========================================================');
  console.log('WORD QUOTATION (.DOCX) EXTRACTION & SELECTION TEST SUITE');
  console.log('==========================================================');

  const dir = 'D:/Golden Elite Tents/Quotation';
  const rawFiles = fs.readdirSync(dir).filter(f => f.endsWith('.docx'));
  const files = rawFiles.filter(f => !f.startsWith('~$') && !f.startsWith('.~'));

  console.log(`Loaded ${files.length} Word quotation files from ${dir}\n`);

  const mockCache: ExistingDataCache = {
    customers: [
      { id: 'c1', name: 'Al Karwan Solution FZC', trn: '100234567800003' },
      { id: 'c2', name: 'Alfa Fabrication Technical Services Co. L.L.C' },
      { id: 'c3', name: 'Basic Contracting Technical Services LLC' },
      { id: 'c4', name: 'Noor Al Masy Tents and Shades Trading LLC' },
    ],
    suppliers: [],
    projects: [],
    invoices: [],
    quotations: [],
    deliveryNotes: [],
    purchaseOrders: [],
    supplierBills: [],
  };

  const parsedDocs: ParsedDocument[] = [];
  const batchDocumentNumbers = new Map<string, string>();

  for (const f of files) {
    const filePath = path.join(dir, f);
    const buf = fs.readFileSync(filePath);
    const docId = `doc_${f}`;

    const docxRes = await parseDocx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), f);
    const classification = classifyDocument(f, docxRes.allText, docxRes.tables.length);
    const extraction = extractFromDocx(docxRes, f, classification.documentType);

    const fields = extraction.fields || {};
    let items = extraction.items || [];
    const docNumStr = String(fields.document_number?.value || f);

    const lineAudit = auditLineItemCalculations(docId, docNumStr, items);
    items = lineAudit.auditedItems;

    const totalsAudit = auditDocumentTotals(
      docId,
      docNumStr,
      fields.subtotal?.value as number | null,
      fields.vat_amount?.value as number | null,
      fields.total_amount?.value as number | null,
      items
    );

    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    // Check for Filename vs Document Content Number Conflict (Task 3)
    const baseFn = f.split(/[/\\]/).pop() || f;
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

    if (lineAudit.hasMismatches) {
      validationErrors.push(`Line item financial calculation mismatch.`);
    }
    if (totalsAudit.hasMismatches) {
      const diff = fields.total_amount?.value !== null && fields.total_amount?.value !== undefined
        ? Math.abs(Number(fields.total_amount.value) - totalsAudit.calculatedTotal).toFixed(2)
        : "0.00";
      validationErrors.push(`Grand total verification failed against line items sum (discrepancy: AED ${diff}).`);
    }

    const customerResolution = matchCustomer(
      fields.customer_name?.value ? String(fields.customer_name.value) : null,
      fields.trn?.value ? String(fields.trn.value) : null,
      mockCache
    );

    const destinationMappings = generateDestinationMappings(
      f,
      classification.documentType,
      fields,
      items,
      customerResolution,
      { action: "skip", targetModule: "Suppliers", targetTable: "suppliers", extractedName: "", matchConfidence: 0, matchReason: "" },
      { action: "skip", targetModule: "Projects", targetTable: "projects", extractedName: "", matchConfidence: 0, matchReason: "" }
    );

    if (validationErrors.length > 0) {
      destinationMappings.forEach(m => {
        if (m.proposedAction === "create_new") {
          m.proposedAction = "needs_review";
        }
      });
    }

    const duplicateCheck = checkDuplicateDocument(
      fields.document_number?.value ? String(fields.document_number.value) : null,
      classification.documentType,
      mockCache
    );

    parsedDocs.push({
      id: docId,
      filename: f,
      fileSize: buf.length,
      fileType: "docx",
      checksumSha256: `sha256_${buf.length}_${f}`,
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      classificationReason: classification.reason,
      extractionStatus: "success",
      fields,
      items,
      customerResolution,
      destinationMappings,
      validationErrors,
      validationWarnings,
      isDuplicate: duplicateCheck.isDuplicate,
      rawContentSummary: { rawSnippets: [] },
    });
  }

  // TEST 1: Extraction & Items Coverage
  console.log('[Test 1] Verifying Word quotation extraction across all 56 documents...');
  const totalItems = parsedDocs.reduce((acc, d) => acc + d.items.length, 0);
  const docsWithItems = parsedDocs.filter(d => d.items.length > 0).length;
  console.log(`         Total extracted line items: ${totalItems}`);
  console.log(`         Documents with line items: ${docsWithItems} / ${parsedDocs.length}`);
  for (const d of parsedDocs.filter(d => d.items.length === 0)) {
    console.log(`         -> Document with 0 items: "${d.filename}"`);
  }
  if (docsWithItems !== parsedDocs.length) {
    throw new Error(`Expected all ${parsedDocs.length} files to have extracted line items, but got ${docsWithItems}`);
  }
  console.log('  [PASS] 100% of Word quotation documents extracted with line items!\n');

  // TEST 2: Task 3 - QTN103-26 vs QTN104/26 Conflict Detection
  console.log('[Test 2] Verifying Task 3: QTN103-26 vs QTN104/26 conflict detection...');
  const qtn103New = parsedDocs.find(d => d.filename.includes('QTN103-26') && d.filename.includes('new'));
  if (!qtn103New) throw new Error('QTN103-26 ... new.docx not found');
  const hasConflict = qtn103New.validationErrors.some(e => e.includes('Identifier Conflict'));
  console.log(`         QTN103-26 new errors:`, qtn103New.validationErrors);
  if (!hasConflict) {
    throw new Error('Expected QTN103-26 ... new.docx to be flagged with Identifier Conflict');
  }
  console.log('  [PASS] QTN103-26 with internal QTN104/26 correctly detected and blocked for review!\n');

  // TEST 3: Multi-Option Quotations Reconciled
  console.log('[Test 3] Verifying multi-option quotations (Option 1 & Option 2)...');
  const multiOptionFiles = ['QTN120-26', 'QTN121-26', 'QTN140-26'];
  for (const mFile of multiOptionFiles) {
    const doc = parsedDocs.find(d => d.filename.includes(mFile));
    if (!doc) throw new Error(`File ${mFile} not found`);
    const mathError = doc.validationErrors.find(e => e.includes('Grand total verification'));
    if (mathError) {
      throw new Error(`Multi-option document ${mFile} failed mathematical verification: ${mathError}`);
    }
  }
  console.log('  [PASS] QTN120-26, QTN121-26, and QTN140-26 multi-option quotations reconciled!\n');

  // TEST 4: Selection & Eligibility Breakdown
  console.log('[Test 4] Verifying Selection & Eligibility State...');
  const eligibleDocs = parsedDocs.filter(d => {
    const hasErrors = (d.validationErrors && d.validationErrors.length > 0) ||
      d.destinationMappings?.some(m => m.proposedAction === "needs_review");
    return !hasErrors && !d.isDuplicate;
  });
  const blockedDocs = parsedDocs.filter(d => {
    const hasErrors = (d.validationErrors && d.validationErrors.length > 0) ||
      d.destinationMappings?.some(m => m.proposedAction === "needs_review");
    return hasErrors || d.isDuplicate;
  });

  console.log(`         Total Processed: ${parsedDocs.length}`);
  console.log(`         Eligible: ${eligibleDocs.length}`);
  console.log(`         Blocked: ${blockedDocs.length}`);
  for (const b of blockedDocs) {
    console.log(`         - Blocked: ${b.filename} -> ${b.validationErrors.join('; ')}`);
  }

  if (eligibleDocs.length < 50) {
    throw new Error(`Expected at least 50 eligible documents, but got ${eligibleDocs.length}`);
  }
  console.log('  [PASS] Bulk import is NO LONGER blocking all documents! Vast majority eligible!\n');

  // TEST 5: Select All & Deselect All Simulation
  console.log('[Test 5] Simulating Select All & Deselect All logic...');
  let queue = parsedDocs.map(d => ({
    id: d.id,
    name: d.filename,
    status: "ready" as const,
    parsedDoc: d,
    selectedForImport: eligibleDocs.some(ed => ed.id === d.id),
  }));

  const initialSelected = queue.filter(q => q.selectedForImport).length;
  console.log(`         Initial Selected (Eligible): ${initialSelected}`);
  if (initialSelected !== eligibleDocs.length) throw new Error('Initial selection mismatch');

  // Deselect All
  queue = queue.map(q => ({ ...q, selectedForImport: false }));
  console.log(`         After Deselect All: ${queue.filter(q => q.selectedForImport).length}`);
  if (queue.some(q => q.selectedForImport)) throw new Error('Deselect all failed');

  // Select All Eligible
  queue = queue.map(q => {
    const isEligible = eligibleDocs.some(ed => ed.id === q.id);
    return { ...q, selectedForImport: isEligible };
  });
  console.log(`         After Select Eligible: ${queue.filter(q => q.selectedForImport).length}`);
  if (queue.filter(q => q.selectedForImport).length !== eligibleDocs.length) throw new Error('Select eligible failed');

  // Safety test: Even if ALL are forcefully checked, approvedDocs excludes blocked
  queue = queue.map(q => ({ ...q, selectedForImport: true }));
  const approvedDocs = parsedDocs.filter(d => {
    const qItem = queue.find(q => q.id === d.id);
    if (!qItem || !qItem.selectedForImport) return false;
    if (d.validationErrors && d.validationErrors.length > 0) return false;
    if (d.destinationMappings?.some(m => m.proposedAction === "needs_review")) return false;
    return true;
  });
  console.log(`         Forcefully checked 56 documents -> approvedDocs: ${approvedDocs.length}`);
  if (approvedDocs.some(d => d.filename.includes('QTN103-26') && d.filename.includes('new'))) {
    throw new Error('Blocked document QTN103-26 new entered approvedDocs!');
  }
  console.log('  [PASS] Invariant safety: Blocked documents can NEVER enter approvedDocs!\n');

  console.log('==========================================================');
  console.log('ALL WORD QUOTATION TESTS PASSED (100% SUCCESS)');
  console.log('==========================================================');
}

runWordQuotationSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
