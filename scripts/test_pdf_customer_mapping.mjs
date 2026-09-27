import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../lib/documentCustomer.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { withCustomerDocumentDetails } = await import(moduleUrl);

const mobilePdfModalSource = await readFile(
  new URL("../components/mobile/MobilePdfModal.tsx", import.meta.url),
  "utf8"
);
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("flattens the Supabase customer relationship used by mobile PDF previews", () => {
  const result = withCustomerDocumentDetails({
    quotation_number: "QUO-2026-0002",
    customer_id: "customer-1",
    customer: {
      id: "customer-1",
      name: "Al Naboodah Contracting Co. L.L.C",
      trn: "100345678900003",
      address: "Sheikh Zayed Road, Dubai, United Arab Emirates",
      contact_person: "Tariq Mansoor",
      mobile: "+971 50 123 4567",
      email: "accounts@example.test",
    },
  });

  assert.equal(result.customer_name, "Al Naboodah Contracting Co. L.L.C");
  assert.equal(result.customer_trn, "100345678900003");
  assert.equal(result.customer_address, "Sheikh Zayed Road, Dubai, United Arab Emirates");
  assert.equal(result.contact_person, "Tariq Mansoor");
  assert.equal(result.contact_number, "+971 50 123 4567");
  assert.equal(result.contact_email, "accounts@example.test");
});

test("preserves document-saved details ahead of later customer-master changes", () => {
  const result = withCustomerDocumentDetails({
    customer_name: "Original Customer Name",
    customer_address: "Original delivery address",
    contact_mobile: "+971 4 000 0000",
    customer: [{
      name: "Renamed Customer",
      address: "New address",
      phone: "+971 4 999 9999",
    }],
  });

  assert.equal(result.customer_name, "Original Customer Name");
  assert.equal(result.customer_address, "Original delivery address");
  assert.equal(result.contact_number, "+971 4 000 0000");
});

test("keeps long names and addresses intact", () => {
  const name = "A Very Long Customer Trading and Contracting Company Name With Multiple Divisions L.L.C";
  const address = "Office 1204, Example Business Centre, Sheikh Zayed Road, Trade Centre District, Dubai, United Arab Emirates, P.O. Box 123456";
  const result = withCustomerDocumentDetails({ customer: { name, address } });

  assert.equal(result.customer_name, name);
  assert.equal(result.customer_address, address);
});

test("does not invent placeholder customer information", () => {
  const result = withCustomerDocumentDetails({ customer_id: null, customer: null });

  assert.equal(result.customer_name, "");
  assert.equal(result.customer_address, undefined);
  assert.equal(result.contact_number, undefined);
});

test("isolates the mobile PDF modal as the only print target", () => {
  assert.match(mobilePdfModalSource, /className="mobile-pdf-modal print-modal-container fixed inset-0/);
  assert.match(mobilePdfModalSource, /mobile-pdf-print-surface/);
  assert.match(mobilePdfModalSource, /mobile-pdf-scale-shell/);
  assert.match(mobilePdfModalSource, /mobile-pdf-print-content/);
  assert.match(
    globalCssSource,
    /body:has\(\.print-modal-container\) \*:has\(\.print-modal-container\) > \*:not\(\.print-modal-container\):not\(:has\(\.print-modal-container\)\)/
  );
  assert.match(globalCssSource, /\.print-modal-container,[\s\S]*?position: static !important;/);
  assert.match(
    globalCssSource,
    /\.mobile-pdf-print-surface,[\s\S]*?width: 210mm !important;[\s\S]*?background: #ffffff !important;[\s\S]*?transform: none !important;/
  );
  assert.match(
    globalCssSource,
    /\.mobile-pdf-modal \.print-template-wrapper > \.no-print \{[\s\S]*?display: none !important;/
  );
  assert.doesNotMatch(
    globalCssSource,
    /\.print-modal-container \.print-template-wrapper > \.no-print/
  );
});
