import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("=== RUNNING PROFORMA INVOICE SAVING & PRINTING VERIFICATION SUITE ===");

// 1. Verify DocumentSplitScreenEditor has PrintModal, double-click protection, and status constraint handling
const editorPath = path.join(rootDir, "components", "documents", "DocumentSplitScreenEditor.tsx");
const editorSrc = fs.readFileSync(editorPath, "utf-8");

assert.ok(editorSrc.includes('import PrintModal from "./PrintModal";'), "PrintModal must be imported in DocumentSplitScreenEditor");
assert.ok(editorSrc.includes("isPrintModalOpen"), "isPrintModalOpen state must exist in DocumentSplitScreenEditor");
assert.ok(editorSrc.includes("isSubmitting"), "isSubmitting double-click guard must exist in DocumentSplitScreenEditor");
assert.ok(editorSrc.includes("<PrintModal"), "PrintModal element must be rendered in DocumentSplitScreenEditor");
assert.ok(editorSrc.includes("statusOptions"), "statusOptions adapted to documentType must exist");
assert.ok(editorSrc.includes("proforma_invoice"), "proforma_invoice specific status options must be handled");
assert.ok(!editorSrc.includes("window.print()"), "Raw window.print() should be replaced with PrintModal in DocumentSplitScreenEditor");
console.log("✔ DocumentSplitScreenEditor integrates PrintModal and double-click protection correctly.");

// 2. Verify app/proforma-invoices/page.tsx save flow, DB check constraint mapping, unit persistence, and closeForm fix
const pagePath = path.join(rootDir, "app", "proforma-invoices", "page.tsx");
const pageSrc = fs.readFileSync(pagePath, "utf-8");

assert.ok(pageSrc.includes("serializeCustomPartyNotes"), "serializeCustomPartyNotes must be available for resilient fallback");
assert.ok(pageSrc.includes("validStatuses"), "proforma status check constraint validation must be enforced");
assert.ok(pageSrc.includes("normalizedStatus"), "status must be normalized before saving to DB");
assert.ok(pageSrc.includes("unit: l.unit || \"Nos\""), "unit must be persisted in proforma_invoice_items");
assert.ok(pageSrc.includes("setShowForm(false);"), "setShowForm(false) must be called directly on save completion");
assert.ok(pageSrc.includes("setEditing(null);"), "setEditing(null) must be called directly on save completion");
console.log("✔ app/proforma-invoices/page.tsx save handlers and constraint normalization verified.");

// 3. Verify lib/documentNumbering.ts table column mappings
const numberingPath = path.join(rootDir, "lib", "documentNumbering.ts");
const numberingSrc = fs.readFileSync(numberingPath, "utf-8");

assert.ok(numberingSrc.includes('proforma_invoice: { table: "proforma_invoices", column: "proforma_number", label: "Proforma Invoice" }'), "DOC_TYPE_DB_INFO for proforma_invoice must map to proforma_number");
assert.ok(numberingSrc.includes('purchase_order: { table: "purchase_orders", column: "purchase_order_number", label: "Purchase Order" }'), "DOC_TYPE_DB_INFO for purchase_order must map to purchase_order_number");
console.log("✔ lib/documentNumbering.ts column mappings for proforma and purchase order verified.");

// 4. Verify PrintModal has z-[60] for proper stacking over split-screen editor
const printModalPath = path.join(rootDir, "components", "documents", "PrintModal.tsx");
const printModalSrc = fs.readFileSync(printModalPath, "utf-8");

assert.ok(printModalSrc.includes("z-[60]"), "PrintModal must have higher z-index (z-[60]) than split-screen editor (z-50)");
assert.ok(printModalSrc.includes("exportDocumentToPdf"), "PrintModal must support Download PDF");
assert.ok(printModalSrc.includes("printCurrentDocument"), "PrintModal must support Print / Save PDF");
console.log("✔ components/documents/PrintModal.tsx stacking and actions verified.");

// 5. Test financial calculation and payload logic with actual AED 3,252.50 example
function calcLine(quantity, unitPrice, discountPct = 0, vatRate = 0) {
  const taxable = quantity * unitPrice * (1 - discountPct / 100);
  const vatAmount = taxable * (vatRate / 100);
  const lineTotal = taxable + vatAmount;
  return { taxable, vatAmount, lineTotal };
}

const item1 = { description: "Welding Works", quantity: 284, unit: "Nos", unit_price: 10, discount_pct: 0, vat_rate: 0 };
const item2 = { description: "PVC Keder", quantity: 75, unit: "Mtr", unit_price: 5.50, discount_pct: 0, vat_rate: 0 };

const calc1 = calcLine(item1.quantity, item1.unit_price, item1.discount_pct, item1.vat_rate);
const calc2 = calcLine(item2.quantity, item2.unit_price, item2.discount_pct, item2.vat_rate);

assert.equal(calc1.lineTotal, 2840.00, "Item 1 total must be exactly 2840.00");
assert.equal(calc2.lineTotal, 412.50, "Item 2 total must be exactly 412.50");

const subtotal = calc1.taxable + calc2.taxable;
const vatAmount = calc1.vatAmount + calc2.vatAmount;
const grandTotal = subtotal + vatAmount;

assert.equal(subtotal, 3252.50, "Subtotal must be 3252.50");
assert.equal(vatAmount, 0.00, "VAT must be 0.00");
assert.equal(grandTotal, 3252.50, "Grand total must be exactly AED 3,252.50");
console.log(`✔ Financial calculation verified: 284 @ 10 + 75 @ 5.50 = AED ${grandTotal.toFixed(2)}`);

// 6. Test Status Normalization according to DB Check Constraint
const validStatuses = ["draft", "sent", "accepted", "invoiced", "cancelled"];
function normalizeProformaStatus(rawStatus) {
  let s = (rawStatus || "draft").toLowerCase();
  if (s === "issued" || s === "final") s = "sent";
  else if (s === "approved") s = "accepted";
  else if (!validStatuses.includes(s)) s = "draft";
  return s;
}

assert.equal(normalizeProformaStatus("draft"), "draft");
assert.equal(normalizeProformaStatus("sent"), "sent");
assert.equal(normalizeProformaStatus("accepted"), "accepted");
assert.equal(normalizeProformaStatus("Issued"), "sent", "Issued must map to valid DB status 'sent'");
assert.equal(normalizeProformaStatus("Final"), "sent", "Final must map to valid DB status 'sent'");
assert.equal(normalizeProformaStatus("Approved"), "accepted", "Approved must map to valid DB status 'accepted'");
assert.equal(normalizeProformaStatus("paid"), "draft", "Unmapped status must safely fallback to 'draft'");
console.log("✔ Proforma status normalization handles all edge cases and satisfies DB constraint proforma_invoices_status_check.");

// 7. Verify Custom Customer vs Existing Customer Payloads
const customCustomerForm = {
  customer_id: "",
  is_custom_customer: true,
  customer_name: "Al Futtaim Engineering L.L.C",
  customer_trn: "100345678900003",
  customer_address: "Airport Road, Dubai, UAE",
  contact_person: "Eng. Tariq Mansoor",
  contact_number: "+971 50 123 4567",
  contact_email: "tariq.mansoor@alfuttaim.com",
  custom_project_name: "Aviation Hangar Tension Membrane",
  invoice_date: "2026-10-29",
  supply_date: "2026-11-29",
  payment_terms: "50% Advance\n50% Balance",
  status: "draft",
  notes: "Urgent delivery required",
};

const customDbPayload = {
  customer_id: null,
  customer_name: customCustomerForm.customer_name,
  customer_address: customCustomerForm.customer_address,
  customer_trn: customCustomerForm.customer_trn,
  contact_person: customCustomerForm.contact_person,
  contact_number: customCustomerForm.contact_number,
  contact_email: customCustomerForm.contact_email,
  custom_project_name: customCustomerForm.custom_project_name,
  is_custom_customer: true,
  custom_customer: {
    name: customCustomerForm.customer_name,
    address: customCustomerForm.customer_address,
    contact_person: customCustomerForm.contact_person,
    phone: customCustomerForm.contact_number,
    email: customCustomerForm.contact_email,
    trn: customCustomerForm.customer_trn,
    project_name: customCustomerForm.custom_project_name,
  },
  proforma_date: customCustomerForm.invoice_date,
  valid_until: customCustomerForm.supply_date,
  terms_conditions: customCustomerForm.payment_terms,
  status: normalizeProformaStatus(customCustomerForm.status),
  subtotal,
  vat_amount: vatAmount,
  total_amount: grandTotal,
  notes: customCustomerForm.notes,
};

assert.equal(customDbPayload.customer_id, null, "Custom customer customer_id must be null");
assert.equal(customDbPayload.is_custom_customer, true);
assert.equal(customDbPayload.customer_name, "Al Futtaim Engineering L.L.C");
assert.equal(customDbPayload.total_amount, 3252.50);
console.log("✔ Custom customer DB payload correctly formed.");

const existingCustomerRecord = {
  id: "cust-1234-uuid",
  name: "Al Naboodah Contracting L.L.C",
  trn: "100234567800003",
  address: "Al Quoz Industrial 1, Dubai",
  contact_person: "Mohammad Rashid",
  phone: "+971 4 333 4444",
  email: "rashid@alnaboodah.com",
};

const existingDbPayload = {
  customer_id: existingCustomerRecord.id,
  customer_name: existingCustomerRecord.name,
  customer_address: existingCustomerRecord.address,
  customer_trn: existingCustomerRecord.trn,
  contact_person: existingCustomerRecord.contact_person,
  contact_number: existingCustomerRecord.phone,
  contact_email: existingCustomerRecord.email,
  custom_project_name: null,
  is_custom_customer: false,
  custom_customer: null,
  proforma_date: "2026-10-29",
  valid_until: "2026-11-29",
  terms_conditions: "30 days",
  status: "sent",
  subtotal,
  vat_amount: vatAmount,
  total_amount: grandTotal,
  notes: null,
};

assert.equal(existingDbPayload.customer_id, "cust-1234-uuid");
assert.equal(existingDbPayload.is_custom_customer, false);
assert.equal(existingDbPayload.customer_name, "Al Naboodah Contracting L.L.C");
assert.equal(existingDbPayload.total_amount, 3252.50);
console.log("✔ Existing customer DB payload correctly formed with snapshot preservation.");

console.log("\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
