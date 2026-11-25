import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parsePdf, type PdfParseResult, type ParsedPdfTextItem } from "../lib/smartImport/parsers/pdfParser";
import { extractFromPdf } from "../lib/smartImport/extractor";
import { extractSoaTableFromCoordinates } from "../lib/smartImport/soaCoordinateExtractor";
import { buildDocumentPartySnapshot, withCustomerDocumentDetails, withSupplierDocumentDetails } from "../lib/documentCustomer";
import { generateDocumentPdfFilename } from "../lib/documentFilename";
import { normalizePdfFilename } from "../lib/exportDocumentPdf";
import { calculateCustomerStatement } from "../lib/customerStatementEngine";

function makePdfItem(str: string, x: number, y: number, width: number, page = 1): ParsedPdfTextItem {
  return { str, x, y, width, height: 10, page };
}

async function run() {
  console.log("===================================================================");
  console.log("  MASTER VERIFICATION: SOA COORDINATES, SNAPSHOTS & PDF FILENAMES  ");
  console.log("===================================================================");

  // 1. Real Regression Case: SOA137-26 Elegance Tents And Sheds Installation
  // Columns: Date | Invoice # | Description | Charges | Credits | Line Total
  // Bank Transfer rows have EMPTY Invoice # cell and EMPTY Charges cell!
  console.log("\n[1] Testing SOA137-26 Bank Transfer coordinate column extraction...");
  const soa137Items: ParsedPdfTextItem[] = [
    // Header at y=600
    makePdfItem("Date", 42, 600, 24),
    makePdfItem("Invoice #", 110, 600, 44),
    makePdfItem("Description", 190, 600, 58),
    makePdfItem("Charges", 370, 600, 42),
    makePdfItem("Credits", 445, 600, 38),
    makePdfItem("Line Total", 510, 600, 50),

    // Row 1: Tax Invoice INV133 dated 18 August 2026 (Debit 5,821.20)
    makePdfItem("18/08/2026", 42, 575, 48),
    makePdfItem("INV133", 110, 575, 36),
    makePdfItem("PVC Shed Supply & Install", 190, 575, 130),
    makePdfItem("5,821.20", 374, 575, 38), // right = 412 (Charges col)
    makePdfItem("5,821.20", 522, 575, 38), // right = 560 (Line Total col)

    // Row 2: Tax Invoice INV135 dated 02 September 2026 (Debit 5,726.70)
    makePdfItem("02/09/2026", 42, 555, 48),
    makePdfItem("INV135", 110, 555, 36),
    makePdfItem("Tent Maintenance Works", 190, 555, 120),
    makePdfItem("5,726.70", 374, 555, 38),
    makePdfItem("11,547.90", 517, 555, 43),

    // Row 3: Bank Transfer dated 16 September 2026 (EMPTY Invoice #, EMPTY Charges, Credit 5,821.20)
    makePdfItem("16/09/2026", 42, 535, 48),
    makePdfItem("Bank Transfer", 190, 535, 68),
    makePdfItem("5,821.20", 445, 535, 38), // right = 483 (Credits col!)
    makePdfItem("5,726.70", 522, 535, 38), // right = 560 (Line Total col!)

    // Row 4: Bank Transfer dated 17 September 2026 (EMPTY Invoice #, EMPTY Charges, Credit 5,726.70)
    makePdfItem("17/09/2026", 42, 515, 48),
    makePdfItem("Bank Transfer", 190, 515, 68),
    makePdfItem("5,726.70", 445, 515, 38), // right = 483 (Credits col!)
    makePdfItem("0.00", 540, 515, 20),     // right = 560 (Line Total col!)
  ];

  const mock137: PdfParseResult = {
    pagesCount: 1,
    pages: [{ pageNumber: 1, width: 595, height: 842, text: "Statement of Account", lines: [], items: soa137Items }],
    allText: "Statement of Account\nSOA137-26",
    sourceSnippets: [],
    totalCharacterCount: 400,
    nonWhitespaceCharacterCount: 350,
    imageOperatorCount: 0,
    hasSelectableText: true,
    isImageOnly: false,
  };

  const ext137 = extractFromPdf(mock137, "SOA137-26 Elegance Tents And Sheds Installation.pdf", "customer_statement");
  assert.equal(ext137.items.length, 4, "Must extract all 4 transactions");
  assert.equal(ext137.items[0].reference_no, "INV133");
  assert.equal(ext137.items[0].debit, 5821.20);
  assert.equal(ext137.items[0].credit, 0);
  assert.equal(ext137.items[1].reference_no, "INV135");
  assert.equal(ext137.items[1].debit, 5726.70);
  assert.equal(ext137.items[1].credit, 0);

  // Critical Bank Transfer checks: MUST be Credit, MUST keep empty reference, MUST NOT contain date in description
  assert.equal(ext137.items[2].debit, 0, "Bank Transfer 1 debit must be 0");
  assert.equal(ext137.items[2].credit, 5821.20, "Bank Transfer 1 must be in Credits column (5,821.20)");
  assert.equal(ext137.items[2].reference_no, undefined, "Must NOT invent invoice ref for empty Ref cell");
  assert.equal(ext137.items[2].description, "Bank Transfer", "Description must NOT contain transaction date");
  assert.equal(ext137.items[3].debit, 0, "Bank Transfer 2 debit must be 0");
  assert.equal(ext137.items[3].credit, 5726.70, "Bank Transfer 2 must be in Credits column (5,726.70)");
  assert.equal(ext137.items[3].balance, 0);
  console.log("  ✓ SOA137-26 Bank Transfer credit column, empty Ref preservation & running math PASSED!");

  // 2. Multi-page repeated headers & multi-line descriptions
  console.log("\n[2] Testing multi-page repeated headers, page breaks & multi-line descriptions...");
  const multiPageRes = extractSoaTableFromCoordinates([
    {
      pageNumber: 1,
      width: 595,
      height: 842,
      text: "",
      lines: [],
      items: [
        makePdfItem("Date", 40, 700, 24, 1),
        makePdfItem("Description", 140, 700, 58, 1),
        makePdfItem("Charges", 360, 700, 42, 1),
        makePdfItem("Credits", 440, 700, 38, 1),
        makePdfItem("Balance", 520, 700, 40, 1),
        // Wrapped multi-line desc above & below baseline
        makePdfItem("Supply & Erection of", 140, 676, 100, 1),
        makePdfItem("01/10/2026", 40, 670, 50, 1),
        makePdfItem("10,000.00", 362, 670, 40, 1),
        makePdfItem("10,000.00", 520, 670, 40, 1),
        makePdfItem("Tent Warehouse", 140, 664, 80, 1),
      ],
    },
    {
      pageNumber: 2,
      width: 595,
      height: 842,
      text: "",
      lines: [],
      items: [
        // Repeated header at slightly shifted X coordinates
        makePdfItem("Date", 45, 750, 24, 2),
        makePdfItem("Description", 145, 750, 58, 2),
        makePdfItem("Charges", 365, 750, 42, 2),
        makePdfItem("Credits", 445, 750, 38, 2),
        makePdfItem("Balance", 525, 750, 40, 2),
        makePdfItem("10/10/2026", 45, 720, 50, 2),
        makePdfItem("Wire Deposit", 145, 720, 70, 2),
        makePdfItem("4,000.00", 448, 720, 35, 2),
        makePdfItem("6,000.00", 530, 720, 35, 2),
      ],
    },
  ], "multi_page_soa.pdf");
  assert.equal(multiPageRes.items.length, 2);
  assert.ok(multiPageRes.items[0].description.includes("Supply & Erection of Tent Warehouse"), "Wrapped 2-line description stitched");
  assert.equal(multiPageRes.items[1].credit, 4000, "Page 2 wire deposit classified to Credit despite no payment keyword");
  assert.equal(multiPageRes.items[1].debit, 0);
  assert.equal(multiPageRes.items[1].calculatedTotal, 6000);
  console.log("  ✓ Multi-page & wrapped description extraction PASSED!");

  // 3. Real PDF Fixtures Check
  console.log("\n[3] Verifying coordinate extraction on real PDF fixtures...");
  const fixtures = [
    { file: "test-output/soa_001_single_page_test.pdf", expectedRows: 9, expectedDebits: 121472.40, expectedCredits: 0, expectedClosing: 121472.40 },
    { file: "test-output/statement_of_account_SOA101_fixed.pdf", expectedRows: 3, expectedDebits: 20702.32, expectedCredits: 9000.00, expectedClosing: 11702.32 },
    { file: "test-output/soa_real_chromium_test.pdf", expectedRows: 5, expectedDebits: 125972.40, expectedCredits: 84000.00, expectedClosing: 42014.40 },
    { file: "test-output/statement_al_karwan_fixed.pdf", expectedRows: 1, expectedDebits: 39560.86, expectedCredits: 0, expectedClosing: 39560.86 },
  ];

  for (const fx of fixtures) {
    const full = path.resolve(process.cwd(), fx.file);
    const buf = fs.readFileSync(full);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, path.basename(fx.file));
    const extracted = extractFromPdf(parsed, path.basename(fx.file), "customer_statement");
    const debits = Math.round(extracted.items.reduce((s, it) => s + (it.debit || 0), 0) * 100) / 100;
    const credits = Math.round(extracted.items.reduce((s, it) => s + (it.credit || 0), 0) * 100) / 100;
    const closing = Number(extracted.fields.closing_balance?.value ?? 0);

    assert.equal(extracted.items.length, fx.expectedRows, `${fx.file}: row count`);
    assert.equal(debits, fx.expectedDebits, `${fx.file}: debits`);
    assert.equal(credits, fx.expectedCredits, `${fx.file}: credits`);
    assert.equal(closing, fx.expectedClosing, `${fx.file}: closing balance`);
    console.log(`  ✓ ${path.basename(fx.file)}: ${fx.expectedRows} rows | Dr ${debits.toFixed(2)} | Cr ${credits.toFixed(2)} | Bal ${closing.toFixed(2)}`);
  }

  // Verify wrapped descriptions in Chromium fixture have zero date prefixes and full wrapped words
  {
    const full = path.resolve(process.cwd(), "test-output/soa_real_chromium_test.pdf");
    const buf = fs.readFileSync(full);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab, "soa_real_chromium_test.pdf");
    const extracted = extractFromPdf(parsed, "soa_real_chromium_test.pdf", "customer_statement");
    assert.ok(extracted.items[0].description.includes("Heavy Duty Tensile Structure"), "Wrapped invoice description intact");
    assert.ok(!extracted.items[0].description.startsWith("2026-10-14"), "Description must not prepend date");
    assert.equal(extracted.items[1].credit, 50000, "RV-001 50k in credits");
    assert.equal(extracted.items[2].credit, 30000, "RV-002 30k in credits");
    assert.equal(extracted.items[4].credit, 4000, "RV-003 4k in credits");
  }

  // 4. Document Customer Snapshot Persistence & Filename Consistency
  console.log("\n[4] Testing document customer snapshot & PDF filename consistency...");
  const masterCust = { id: "cust-1", name: "Old Master Name LLC", trn: "100111", address: "Dubai" };
  const snap = buildDocumentPartySnapshot({
    partyType: "customer",
    isCustom: false,
    partyId: "cust-1",
    masterParty: masterCust,
    name: "Al Karwan Solution FZC", // Document-level override while preserving customer_id link!
    address: "Sharjah Free Zone",
    trn: "100222",
  });
  assert.equal(snap.fullColumns.customer_id, "cust-1", "Must keep customer link");
  assert.equal(snap.fullColumns.customer_name, "Al Karwan Solution FZC", "Must persist edited name in column");
  assert.ok(snap.hasOverride, "Must detect override vs master customer");
  assert.ok(snap.notesWithFallback?.includes("Al Karwan Solution FZC"), "Fallback notes must preserve edited name");

  // Reopen document: saved snapshot MUST win over master customer record!
  const reopened = withCustomerDocumentDetails({
    id: "inv-147",
    invoice_number: "INV-147",
    customer_id: "cust-1",
    customer_name: snap.fullColumns.customer_name,
    customer: masterCust, // Current master record still has Old Master Name LLC
    notes: snap.notesWithFallback,
  });
  assert.equal(reopened.customer_name, "Al Karwan Solution FZC", "Reopened document must preserve edited name over master");

  // Legacy un-migrated schema fallback (only notes survived)
  const reopenedLegacy = withCustomerDocumentDetails({
    id: "inv-147",
    invoice_number: "INV-147",
    customer_id: "cust-1",
    customer: masterCust,
    notes: snap.notesWithFallback,
  });
  assert.equal(reopenedLegacy.customer_name, "Al Karwan Solution FZC", "Legacy fallback must also recover edited name");

  const fn = generateDocumentPdfFilename({
    docType: "tax_invoice",
    docNumber: reopened.invoice_number,
    customerName: reopened.customer_name,
    workDescription: "PVC Works",
  });
  assert.equal(fn.filename, "INV-147 Al Karwan Solution FZC - PVC Works.pdf");
  assert.equal(normalizePdfFilename("INV-147 Al Karwan Solution FZC.pdf.pdf"), "INV-147 Al Karwan Solution FZC.pdf");

  // Mobile vs Desktop filename parity across Quotations, Proforma Invoices, Delivery Notes, Purchase Orders & Receipt Vouchers
  const parityDocs = [
    {
      desktopType: "quotation",
      mobileType: "quotation",
      docNum: "QT101-26",
      party: "Edited Quote Client FZE",
      projectName: "Car Park Shade",
    },
    {
      desktopType: "proforma_invoice",
      mobileType: "proforma",
      docNum: "PI101-26",
      party: "Edited Proforma Client LLC",
      projectName: "Water Tank Liner",
    },
    {
      desktopType: "delivery_note",
      mobileType: "delivery_note",
      docNum: "DN101-26",
      party: "Edited Delivery Client",
      projectName: "Site A Install",
    },
    {
      desktopType: "purchase_order",
      mobileType: "purchase_order",
      docNum: "PO101-26",
      party: "Edited Supplier Name LLC",
      projectName: "Raw Material",
    },
    {
      desktopType: "receipt_voucher",
      mobileType: "receipt_voucher",
      docNum: "RV101-26",
      party: "Edited Payer LLC",
      workDescription: "Payment",
    },
  ];
  for (const pd of parityDocs) {
    const desktopOut = generateDocumentPdfFilename({
      documentType: pd.desktopType,
      documentNumber: pd.docNum,
      customerName: pd.desktopType === "purchase_order" ? undefined : pd.party,
      supplierName: pd.desktopType === "purchase_order" ? pd.party : undefined,
      projectName: pd.projectName,
      workDescription: pd.workDescription,
    });
    const mobileOut = generateDocumentPdfFilename({
      docType: pd.mobileType,
      docNumber: pd.docNum,
      partyName: pd.party,
      projectName: pd.projectName,
      workDescription: pd.workDescription,
    });
    assert.equal(mobileOut.filename, desktopOut.filename, `Desktop/Mobile filename parity for ${pd.desktopType}`);
  }

  // Supplier snapshot round-trip parity
  const suppSnap = buildDocumentPartySnapshot({
    partyType: "supplier",
    isCustom: false,
    partyId: "supp-1",
    masterParty: { id: "supp-1", name: "Master Steel Co", trn: "100888", address: "Sharjah" },
    name: "Branch Steel Trading LLC",
  });
  const reopenedPo = withSupplierDocumentDetails({
    id: "po-99",
    purchase_order_number: "PO-99",
    supplier_id: "supp-1",
    supplier_name: suppSnap.fullColumns.supplier_name as string,
    supplier: { id: "supp-1", name: "Master Steel Co", trn: "100888", address: "Sharjah" },
    notes: suppSnap.notesWithFallback,
  });
  assert.equal(reopenedPo.supplier_name, "Branch Steel Trading LLC", "Reopened PO preserves document-level supplier name");
  console.log("  ✓ Document snapshot & filename parity PASSED across all 6 document types!");

  // 5. Live Invoice & Payment Synchronization Isolation
  console.log("\n[5] Testing live ERP synchronization without historical double-counting...");
  const live = calculateCustomerStatement({
    initialCutoverBalance: 0,
    cutoverDate: "2026-09-30",
    fromDate: "2026-10-01",
    toDate: "2026-10-31",
    historicalEntries: [
      { id: "h1", date: "2026-08-18", reference_no: "INV133", description: "Old Inv", debit: 5821.20, credit: 0, matched_invoice_id: "inv-133" },
      { id: "h2", date: "2026-09-16", reference_no: "", description: "Bank Transfer", debit: 0, credit: 5821.20 },
    ],
    invoices: [
      { id: "inv-133", invoice_number: "INV133", invoice_date: "2026-08-18", total_amount: 5821.20, status: "issued" },
      { id: "inv-new", invoice_number: "INV147", invoice_date: "2026-10-15", total_amount: 10000, status: "issued" },
    ],
    receipts: [
      { id: "rv-new", voucher_number: "RV-050", voucher_date: "2026-10-20", amount: 3500 },
    ],
    payments: [],
    customerName: "Elegance Tents",
  });
  assert.equal(live.opening_balance, 0);
  assert.equal(live.total_debits, 10000);
  assert.equal(live.total_credits, 3500);
  assert.equal(live.closing_balance, 6500);

  // Overlapping historical SOA protection: unverified SOA excluded, single latest verified baseline used
  const withOverlappingUnverified = calculateCustomerStatement({
    initialCutoverBalance: 0,
    invoices: [{ id: "inv-live-1", invoice_number: "INV-200", invoice_date: "2026-11-10", total_amount: 5000, status: "issued" }],
    receipts: [{ id: "rv-live-1", voucher_number: "RV-200", voucher_date: "2026-11-12", amount: 1500 }],
    payments: [],
    historicalEntries: [
      { id: "h-dup", date: "2026-11-10", reference_no: "INV-200", description: "Matched Inv", debit: 5000, credit: 0 },
    ],
    customerName: "Overlap Safe Customer",
  });
  // Total debits must be 5000 (NOT 10000!) because historical row deduplicates against live INV-200
  assert.equal(withOverlappingUnverified.total_debits, 5000, "Zero double-counting of historical vs live invoice");
  assert.equal(withOverlappingUnverified.closing_balance, 3500);
  console.log("  ✓ Live ERP synchronization & overlap deduplication PASSED!");

  // 6. Isolated PostgreSQL (PGlite) Persistence Verification across All 6 Document Tables
  console.log("\n[6] Testing isolated Postgres (PGlite) document snapshot persistence across all 6 tables...");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, trn TEXT, address TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, trn TEXT, address TEXT);
    CREATE TABLE tax_invoices (id TEXT PRIMARY KEY, invoice_number TEXT, customer_id TEXT REFERENCES customers(id), customer_name TEXT, customer_trn TEXT, customer_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_customer BOOLEAN, custom_customer JSONB, notes TEXT);
    CREATE TABLE quotations (id TEXT PRIMARY KEY, quotation_number TEXT, customer_id TEXT REFERENCES customers(id), customer_name TEXT, customer_trn TEXT, customer_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_customer BOOLEAN, custom_customer JSONB, notes TEXT);
    CREATE TABLE proforma_invoices (id TEXT PRIMARY KEY, proforma_number TEXT, customer_id TEXT REFERENCES customers(id), customer_name TEXT, customer_trn TEXT, customer_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_customer BOOLEAN, custom_customer JSONB, notes TEXT);
    CREATE TABLE delivery_notes (id TEXT PRIMARY KEY, delivery_number TEXT, customer_id TEXT REFERENCES customers(id), customer_name TEXT, customer_trn TEXT, customer_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_customer BOOLEAN, custom_customer JSONB, notes TEXT);
    CREATE TABLE purchase_orders (id TEXT PRIMARY KEY, purchase_order_number TEXT, supplier_id TEXT REFERENCES suppliers(id), supplier_name TEXT, supplier_trn TEXT, supplier_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_supplier BOOLEAN, custom_supplier JSONB, notes TEXT);
    CREATE TABLE receipt_vouchers (id TEXT PRIMARY KEY, voucher_number TEXT, customer_id TEXT REFERENCES customers(id), received_from TEXT, customer_name TEXT, customer_trn TEXT, customer_address TEXT, contact_person TEXT, contact_number TEXT, contact_email TEXT, custom_project_name TEXT, is_custom_customer BOOLEAN, custom_customer JSONB, notes TEXT);

    INSERT INTO customers VALUES ('c-1', 'Master Customer LLC', '100999000', 'Dubai Industrial City');
    INSERT INTO suppliers VALUES ('s-1', 'Master Supplier LLC', '100777000', 'Sharjah Industrial Area');
  `);

  const docConfigs = [
    { table: "tax_invoices", numCol: "invoice_number", numVal: "INV500-26", type: "tax_invoice", editedParty: "Site Branch Customer LLC", partyType: "customer" as const },
    { table: "quotations", numCol: "quotation_number", numVal: "QT500-26", type: "quotation", editedParty: "Edited Quote Branch FZE", partyType: "customer" as const },
    { table: "proforma_invoices", numCol: "proforma_number", numVal: "PI500-26", type: "proforma_invoice", editedParty: "Edited Proforma Branch LLC", partyType: "customer" as const },
    { table: "delivery_notes", numCol: "delivery_number", numVal: "DN500-26", type: "delivery_note", editedParty: "Edited Site Recipient LLC", partyType: "customer" as const },
    { table: "purchase_orders", numCol: "purchase_order_number", numVal: "PO500-26", type: "purchase_order", editedParty: "Edited Steel Division LLC", partyType: "supplier" as const },
    { table: "receipt_vouchers", numCol: "voucher_number", numVal: "RV500-26", type: "receipt_voucher", editedParty: "Edited Payer Entity LLC", partyType: "customer" as const },
  ];

  for (const cfg of docConfigs) {
    const isSupp = cfg.partyType === "supplier";
    const s = buildDocumentPartySnapshot({
      partyType: cfg.partyType,
      isCustom: false,
      partyId: isSupp ? "s-1" : "c-1",
      masterParty: { id: isSupp ? "s-1" : "c-1", name: isSupp ? "Master Supplier LLC" : "Master Customer LLC", trn: "100999000", address: "Dubai" },
      name: cfg.editedParty,
      projectName: "PVC Tent Shade",
    });

    if (cfg.table === "receipt_vouchers") {
      await pg.query(
        `INSERT INTO receipt_vouchers (id, voucher_number, customer_id, received_from, customer_name, custom_project_name, is_custom_customer, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ["doc-1", cfg.numVal, s.fullColumns.customer_id, cfg.editedParty, s.fullColumns.customer_name, s.fullColumns.custom_project_name, false, s.notesWithFallback]
      );
    } else if (isSupp) {
      await pg.query(
        `INSERT INTO purchase_orders (id, purchase_order_number, supplier_id, supplier_name, custom_project_name, is_custom_supplier, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ["doc-1", cfg.numVal, s.fullColumns.supplier_id, s.fullColumns.supplier_name, s.fullColumns.custom_project_name, false, s.notesWithFallback]
      );
    } else {
      await pg.query(
        `INSERT INTO ${cfg.table} (id, ${cfg.numCol}, customer_id, customer_name, custom_project_name, is_custom_customer, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ["doc-1", cfg.numVal, s.fullColumns.customer_id, s.fullColumns.customer_name, s.fullColumns.custom_project_name, false, s.notesWithFallback]
      );
    }

    // Reload joined with master table — simulates browser refresh from Supabase
    const joinSql = isSupp
      ? `SELECT d.*, json_build_object('id', p.id, 'name', p.name, 'trn', p.trn, 'address', p.address) AS supplier FROM ${cfg.table} d LEFT JOIN suppliers p ON p.id = d.supplier_id WHERE d.id = 'doc-1'`
      : `SELECT d.*, json_build_object('id', p.id, 'name', p.name, 'trn', p.trn, 'address', p.address) AS customer FROM ${cfg.table} d LEFT JOIN customers p ON p.id = d.customer_id WHERE d.id = 'doc-1'`;
    const res = await pg.query<Record<string, unknown>>(joinSql);
    const reloaded = isSupp
      ? withSupplierDocumentDetails(res.rows[0])
      : withCustomerDocumentDetails(res.rows[0]);
    const savedName = isSupp ? (reloaded as { supplier_name?: string }).supplier_name : (reloaded as { customer_name?: string }).customer_name;
    assert.equal(savedName, cfg.editedParty, `${cfg.table}: document snapshot survives DB round-trip`);

    // Master table untouched!
    const masterCheck = await pg.query<{ name: string }>(
      isSupp ? `SELECT name FROM suppliers WHERE id = 's-1'` : `SELECT name FROM customers WHERE id = 'c-1'`
    );
    assert.equal(masterCheck.rows[0].name, isSupp ? "Master Supplier LLC" : "Master Customer LLC", `${cfg.table}: master record remains untouched`);

    // Authoritative PDF filename uses saved docNumber + edited document-specific party name
    const pdfFn = generateDocumentPdfFilename({
      docType: cfg.type,
      docNumber: String(res.rows[0][cfg.numCol]),
      partyName: savedName,
      projectName: "PVC Tent Shade",
    });
    assert.ok(pdfFn.filename.startsWith(`${cfg.numVal} ${cfg.editedParty}`), `${cfg.table}: PDF filename includes saved num & party (${pdfFn.filename})`);
  }
  await pg.close();
  console.log("  ✓ PGlite snapshot persistence, master-record isolation & PDF filenames PASSED across all 6 document types!");

  console.log("\n[7] Testing SOA137-26 + post-cutoff INV145 live synchronization & breakdown...");
  const soa137Stmt = calculateCustomerStatement({
    customerId: "cust-elegance",
    customerName: "Elegance Tents And Sheds Installation",
    initialCutoverBalance: 0,
    cutoverDate: "2026-11-11",
    statementNumber: "SOA137-26",
    statementDate: "2026-11-11",
    originalPdfClosingBalance: 39625.56,
    originalStatementCutoffDate: "2026-11-11",
    historicalEntries: [
      {
        id: "h-1",
        date: "2026-10-15",
        reference_no: "INV130",
        description: "PVC Fabrication & Installation",
        debit: 51173.46,
        credit: 0,
        status: "historical",
      },
      {
        id: "h-2",
        date: "2026-11-01",
        reference_no: "RV-090",
        description: "Bank Transfer",
        debit: 0,
        credit: 11547.9,
        status: "historical",
      },
    ],
    invoices: [
      {
        id: "inv-145",
        customer_id: "cust-elegance",
        invoice_number: "INV145",
        invoice_date: "2026-11-25",
        total_amount: 5522.0,
        status: "sent",
      },
    ],
    receipts: [],
    payments: [],
  });
  assert.equal(soa137Stmt.breakdown?.original_pdf_closing_balance, 39625.56);
  assert.equal(soa137Stmt.breakdown?.reconciled_historical_balance, 39625.56);
  assert.equal(soa137Stmt.breakdown?.post_cutoff_invoices_total, 5522.0);
  assert.equal(soa137Stmt.breakdown?.current_outstanding_balance, 45147.56);
  assert.equal(soa137Stmt.closing_balance, 45147.56);

  // Editing INV145 updates statement without duplication; recording payment reduces balance
  const soa137Updated = calculateCustomerStatement({
    customerId: "cust-elegance",
    customerName: "Elegance Tents And Sheds Installation",
    initialCutoverBalance: 0,
    cutoverDate: "2026-11-11",
    statementNumber: "SOA137-26",
    statementDate: "2026-11-11",
    originalPdfClosingBalance: 39625.56,
    originalStatementCutoffDate: "2026-11-11",
    historicalEntries: [
      {
        id: "h-1",
        date: "2026-10-15",
        reference_no: "INV130",
        description: "Edited Description - PVC Fabrication",
        debit: 51173.46,
        credit: 0,
        is_edited: true,
        status: "historical",
      },
      {
        id: "h-2",
        date: "2026-11-01",
        reference_no: "RV-090",
        description: "Bank Transfer",
        debit: 0,
        credit: 11547.9,
        status: "historical",
      },
    ],
    invoices: [
      {
        id: "inv-145",
        customer_id: "cust-elegance",
        invoice_number: "INV145",
        invoice_date: "2026-11-25",
        total_amount: 6000.0,
        status: "sent",
      },
    ],
    receipts: [
      {
        id: "rv-200",
        customer_id: "cust-elegance",
        voucher_number: "RV-200",
        voucher_date: "2026-11-26",
        amount: 2000.0,
        status: "completed",
      },
    ],
    payments: [],
  });
  assert.equal(soa137Updated.entries.filter((e) => e.invoice_id === "inv-145" || e.original_reference === "INV145").length, 1);
  assert.equal(soa137Updated.entries.find((e) => e.id === "h-1")?.description, "Edited Description - PVC Fabrication");
  assert.equal(soa137Updated.closing_balance, 43625.56);
  console.log("  ✓ SOA137-26 + INV145 breakdown, live edit sync, and payment sync PASSED!");

  console.log("\n[8] Testing coordinate extractor separation between Ref # and left-aligned Description...");
  const refDescPage = {
    pageNumber: 1,
    width: 595,
    height: 842,
    text: "",
    items: [
      { str: "Date", x: 35, y: 700, width: 25, height: 10, page: 1 },
      { str: "Ref #", x: 95, y: 700, width: 26, height: 10, page: 1 },
      { str: "Description", x: 220, y: 700, width: 55, height: 10, page: 1 },
      { str: "Charges (AED)", x: 360, y: 700, width: 65, height: 10, page: 1 },
      { str: "Credits (AED)", x: 440, y: 700, width: 60, height: 10, page: 1 },
      { str: "Balance (AED)", x: 515, y: 700, width: 65, height: 10, page: 1 },

      { str: "15/10/2026", x: 35, y: 675, width: 45, height: 10, page: 1 },
      { str: "INV101", x: 95, y: 675, width: 32, height: 10, page: 1 },
      { str: "PVC Fabrication", x: 145, y: 675, width: 70, height: 10, page: 1 },
      { str: "5,522.00", x: 380, y: 675, width: 42, height: 10, page: 1 },
      { str: "-", x: 465, y: 675, width: 5, height: 10, page: 1 },
      { str: "5,522.00", x: 535, y: 675, width: 42, height: 10, page: 1 },
    ],
  };
  const sepRes = extractSoaTableFromCoordinates([refDescPage], "test_ref_desc.pdf", 0);
  assert.equal(sepRes.items.length, 1);
  assert.equal(sepRes.items[0].reference_no, "INV101");
  assert.equal(sepRes.items[0].description, "PVC Fabrication");
  console.log("  ✓ Coordinate extractor Ref # vs Description separation PASSED!");

  console.log("\n===================================================================");
  console.log("  ALL MASTER VERIFICATION TESTS PASSED SUCCESSFULLY! ✓");
  console.log("===================================================================");
}

run().catch((err) => {
  console.error("\nMASTER VERIFICATION FAILED:", err);
  process.exit(1);
});
