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
const printModalSource = await readFile(new URL("../components/documents/PrintModal.tsx", import.meta.url), "utf8");
const documentContainerSource = await readFile(new URL("../components/documents/DocumentContainer.tsx", import.meta.url), "utf8");
const pageDecorativeBordersSource = await readFile(new URL("../components/documents/PageDecorativeBorders.tsx", import.meta.url), "utf8");
const pageBorderSectionSource = await readFile(new URL("../components/designer/PageBorderSection.tsx", import.meta.url), "utf8");
const designerSource = await readFile(new URL("../components/designer/DocumentDesigner.tsx", import.meta.url), "utf8");
const topToolbarSource = await readFile(new URL("../components/designer/TopToolbar.tsx", import.meta.url), "utf8");
const dynamicRendererSource = await readFile(new URL("../components/documents/DynamicDocumentRenderer.tsx", import.meta.url), "utf8");
const mobilePortalServiceSource = await readFile(new URL("../lib/mobilePortalService.ts", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../components/designer/DocumentCanvas.tsx", import.meta.url), "utf8");
const leftSidebarSource = await readFile(new URL("../components/designer/LeftSidebar.tsx", import.meta.url), "utf8");
const rightInspectorSource = await readFile(new URL("../components/designer/RightInspector.tsx", import.meta.url), "utf8");
const applyToOthersSource = await readFile(new URL("../components/designer/ApplyToOthersModal.tsx", import.meta.url), "utf8");
const designerPreviewSource = await readFile(new URL("../components/designer/DocumentPreviewModal.tsx", import.meta.url), "utf8");
const previewScaleSource = await readFile(new URL("../lib/documentPreview.ts", import.meta.url), "utf8");
const presetModelSource = await readFile(new URL("../lib/documentStylePresetModel.ts", import.meta.url), "utf8");
const layoutEngineSource = await readFile(new URL("../lib/documentLayoutEngine.ts", import.meta.url), "utf8");
const templateRlsMigrationSource = await readFile(
  new URL("../supabase/migrations/20260930000000_document_template_company_rls.sql", import.meta.url),
  "utf8"
);
const templateRepairMigrationSource = await readFile(
  new URL("../supabase/migrations/20260930010000_repair_document_templates.sql", import.meta.url),
  "utf8"
);
const previewScaleModule = ts.transpileModule(previewScaleSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const previewScaleUrl = `data:text/javascript;base64,${Buffer.from(previewScaleModule).toString("base64")}`;
const { getDocumentPreviewScale } = await import(previewScaleUrl);
const presetModelModule = ts.transpileModule(presetModelSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const presetModelUrl = `data:text/javascript;base64,${Buffer.from(presetModelModule).toString("base64")}`;
const {
  createDocumentStylePresetManager,
  getActiveDocumentStyleStorageKey,
  getDocumentTemplateStorageErrorMessage,
  getFallbackDocumentStylePreset,
  readActiveDocumentStylePresetId,
  rememberActiveDocumentStylePresetId,
  resolveDocumentStylePreset,
} = await import(presetModelUrl);
const layoutEngineModule = ts.transpileModule(layoutEngineSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const layoutEngineUrl = `data:text/javascript;base64,${Buffer.from(layoutEngineModule).toString("base64")}`;
const { computeEffectiveLayout, computeIntelligentFitProfile, computePaginationPlan } = await import(layoutEngineUrl);

function createMemoryPresetStore() {
  const records = [];
  let nextId = 1;
  return {
    records,
    async list(companyId, documentType) {
      return records.filter((row) => row.company_id === companyId && row.document_type === documentType);
    },
    async listAll(companyId) {
      return records.filter((row) => row.company_id === companyId);
    },
    async save({ companyId, documentType, name, layout }) {
      const existing = records.find((row) => row.company_id === companyId && row.document_type === documentType && row.template_name === name);
      const saved = {
        id: existing?.id || `preset-${nextId++}`,
        company_id: companyId,
        document_type: documentType,
        template_name: name,
        layout_json: JSON.parse(JSON.stringify(layout)),
        is_default: existing?.is_default || false,
        updated_at: new Date().toISOString(),
      };
      if (existing) records.splice(records.indexOf(existing), 1, saved);
      else records.push(saved);
      return saved;
    },
    async update({ companyId, documentType, id, name, layout }) {
      const preset = records.find((row) => row.company_id === companyId && row.document_type === documentType && row.id === id);
      if (!preset) throw new Error("Preset not found");
      preset.template_name = name;
      preset.layout_json = JSON.parse(JSON.stringify(layout));
      return preset;
    },
    async rename(companyId, documentType, id, name) {
      const preset = records.find((row) => row.company_id === companyId && row.document_type === documentType && row.id === id);
      if (!preset) throw new Error("Preset not found");
      preset.template_name = name;
    },
    async delete(companyId, documentType, id) {
      const index = records.findIndex((row) => row.company_id === companyId && row.document_type === documentType && row.id === id);
      if (index >= 0) records.splice(index, 1);
    },
    async setDefault(companyId, documentType, id) {
      for (const row of records) {
        if (row.company_id === companyId && row.document_type === documentType) row.is_default = row.id === id;
      }
    },
  };
}

function createFitTestLayout() {
  const basicElement = (id, type, x, y, width, height) => ({
    id,
    type,
    label: id,
    x,
    y,
    width,
    height,
    visible: true,
    locked: false,
    zIndex: 1,
  });
  return {
    version: 7,
    documentType: "quotation",
    templateName: "Regression layout",
    page: { paper: "A4", orientation: "portrait", widthMm: 210, heightMm: 297, margins: { top: 12, right: 12, bottom: 12, left: 12 }, background: "#fff", watermarkOpacity: 0.04 },
    branding: { primaryColor: "#123456", accentColor: "#C9A227", textColor: "#334155", mutedColor: "#64748B", borderColor: "#CBD5E1", tableHeaderColor: "#123456", totalHighlightColor: "#F8F6ED" },
    elements: [
      basicElement("customer_info", "customer_info", 12, 63, 91, 27),
      basicElement("doc_meta", "doc_meta", 107, 63, 91, 27),
      { ...basicElement("line_items", "line_items", 12, 95, 186, 65), tableSettings: { rowHeight: 9.5, fontSize: 10.5, headerFontSize: 10.5 } },
      basicElement("amount_in_words", "amount_in_words", 12, 167, 105, 25),
      basicElement("totals", "totals", 121, 167, 77, 40),
      basicElement("footer", "footer", 12, 262, 186, 16),
    ],
  };
}

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

test("fits A4 previews to narrow mobile widths without a minimum-scale overflow", () => {
  for (const viewportWidth of [320, 360, 390]) {
    const availableWidth = viewportWidth - 32;
    const scale = getDocumentPreviewScale(availableWidth, 794);
    assert.ok(794 * scale <= availableWidth);
    assert.ok(Math.abs((1123 * scale) / (794 * scale) - 1123 / 794) < 1e-12);
  }
  assert.equal(getDocumentPreviewScale(1000, 794), 1);
  assert.equal(getDocumentPreviewScale(1000, 794, 0.92), 0.92);
});

test("uses shared fit scaling and accessible actions in both preview modals", () => {
  assert.match(printModalSource, /getDocumentPreviewScale/);
  assert.match(printModalSource, /print-preview-scale-shell/);
  assert.match(printModalSource, /height: dimensions\.height \* scale/);
  assert.match(printModalSource, /aria-label="Fit page to width"/);
  assert.match(printModalSource, /aria-label="Print or save as PDF"/);
  assert.match(printModalSource, /aria-label="Close document preview"/);
  assert.match(printModalSource, /printCurrentDocument\(\)/);
  assert.match(mobilePdfModalSource, /getDocumentPreviewScale/);
  assert.match(mobilePdfModalSource, /aria-label="Fit page to width"/);
  assert.match(mobilePdfModalSource, /aria-label="Print or save as PDF"/);
  assert.match(mobilePdfModalSource, /pl-\[env\(safe-area-inset-left\)\]/);
  assert.match(mobilePdfModalSource, /env\(safe-area-inset-bottom\)/);
  assert.match(printModalSource, /pr-\[env\(safe-area-inset-right\)\]/);
});

test("exposes all saved-style actions beside Auto Fix and preserves long party text", () => {
  for (const label of ["Standard Auto Fix", "My Saved Style", "Create New Style", "Manage Saved Styles"]) {
    assert.ok(topToolbarSource.includes(label));
  }
  assert.match(topToolbarSource, /aria-label="Save My Style"/);
  assert.match(topToolbarSource, /overflow-x-auto overscroll-x-contain/);
  assert.match(topToolbarSource, /designer-scrollbar fixed z-50 w-64 max-h-\[min\(70dvh,320px\)\] overflow-y-auto/);
  assert.match(topToolbarSource, /moreMenuButtonRef/);
  assert.match(topToolbarSource, /aria-label="Document designer actions menu"/);
  const customerBlock = dynamicRendererSource.match(/case "customer_info": \{([\s\S]*?)case "supplier_info":/)[1];
  const supplierBlock = dynamicRendererSource.match(/case "supplier_info": \{([\s\S]*?)case "project_info":/)[1];
  const projectBlock = dynamicRendererSource.match(/case "project_info": \{([\s\S]*?)case "doc_meta":/)[1];
  assert.doesNotMatch(customerBlock, /text-\[7(?:px|\.5px)\]/);
  assert.doesNotMatch(supplierBlock + projectBlock, /line-clamp/);
  assert.match(customerBlock, /overflowWrap: "anywhere"/);
  assert.match(customerBlock, /isCompactPartyCard/);
  assert.match(customerBlock, /min-h-0 overflow-hidden flex flex-col/);
  assert.match(customerBlock, /boxSizing: "border-box"/);
  assert.match(customerBlock, /detailFontSize = isCompactPartyCard \? 9 : 9\.5/);
  // Auto Fix persistence and stale-version behavior are exercised against PostgreSQL
  // by test:design-cloud; this test retains the unrelated layout/UI checks.

});

test("scopes thin navy scrollbars to the designer and preserves native touch behavior", () => {
  assert.match(globalCssSource, /\.pdf-designer-shell \.designer-scrollbar\s*\{[\s\S]*?scrollbar-width:\s*thin;[\s\S]*?scrollbar-color:/);
  assert.match(globalCssSource, /\.pdf-designer-shell \.designer-canvas-scroll\s*\{\s*scrollbar-gutter:\s*stable;/);
  assert.match(globalCssSource, /\.designer-scrollbar::\-webkit-scrollbar-thumb:hover\s*\{[\s\S]*?background-color:\s*#b08d31;/);
  assert.match(globalCssSource, /@media \(pointer: coarse\)[\s\S]*?scrollbar-width:\s*auto;[\s\S]*?scrollbar-color:\s*auto;/);
  assert.match(globalCssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globalCssSource, /@media \(forced-colors: active\)/);
  assert.match(globalCssSource, /\.pdf-designer-shell \.designer-scrollbar:focus-visible/);
  assert.doesNotMatch(globalCssSource, /(^|\n)\s*\*\s*::?-webkit-scrollbar/);
});

test("keeps canvas, layers, settings and preview independently scrollable without nested list bars", () => {
  assert.match(canvasSource, /designer-scrollbar[^\"]*overflow-auto/);
  assert.match(canvasSource, /tabIndex=\{0\}/);
  assert.match(canvasSource, /aria-label="A4 canvas, scroll to pan the page"/);
  assert.match(leftSidebarSource, /designer-scrollbar min-h-0 flex-1 overflow-y-auto/);
  assert.match(rightInspectorSource, /designer-scrollbar[^\"]*overflow-y-auto/);
  assert.doesNotMatch(rightInspectorSource, /max-h-48 overflow-y-auto/);
  assert.match(applyToOthersSource, /designer-scrollbar min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(applyToOthersSource, /max-h-4[45] overflow-y-auto|max-h-52 overflow-y-auto/);
  assert.match(designerPreviewSource, /designer-scrollbar min-h-0 flex-1 overflow-auto/);
  assert.match(globalCssSource, /\.pdf-designer-shell \.designer-scrollbar/);
});

test("fits the canvas to its actual scrollport dimensions and rounds down safely", () => {
  assert.match(designerSource, /container\.clientWidth - horizontalPadding/);
  assert.match(designerSource, /container\.clientHeight - verticalPadding/);
  assert.match(designerSource, /Math\.floor\(calculatedZoom \* 1000\) \/ 1000/);
});

test("keeps quotation snapshot names ahead of customer master data without placeholders", () => {
  const quotationLoader = mobilePortalServiceSource.match(/\/\/ 2\. Quotations([\s\S]*?)\/\/ 3\. Proforma Invoices/)?.[1] || "";
  assert.match(quotationLoader, /\.select\("\*, customer:customers\(id, name, trn\)"\)/);
  assert.match(quotationLoader, /partyName: item\.customer_name \|\| cust\?\.name \|\| ""/);
  assert.doesNotMatch(quotationLoader, /partyName: cust\?\.name \|\| "Customer"/);
});

test("saves, loads, applies, renames, duplicates and deletes complete company document styles", async () => {
  const store = createMemoryPresetStore();
  const manager = createDocumentStylePresetManager(store);
  const layout = createFitTestLayout();
  layout.elements.push({
    id: "custom_stamp",
    type: "custom_image",
    label: "Stamp",
    x: 160,
    y: 220,
    width: 25,
    height: 25,
    visible: true,
    locked: false,
    zIndex: 10,
    imageSrc: "data:image/png;base64,stamp-fixture",
    fontFamily: "Noto Naskh Arabic",
    textAlign: "right",
    color: "#008060",
  });
  layout.elements.find((element) => element.id === "line_items").tableSettings.columns = [
    { key: "description", label: "Description / الوصف", labelAr: "الوصف", visible: true, widthPct: 60, align: "right" },
  ];

  const saved = await manager.save("company-a", "quotation", "Bilingual Brand", layout);
  await assert.rejects(
    () => manager.save("company-a", "quotation", "Bilingual Brand", layout),
    /already exists/
  );
  const loaded = await manager.list("company-a", "quotation");
  const applied = manager.apply(loaded[0], "quotation");
  assert.equal(loaded.length, 1);
  assert.equal(applied.templateName, "Bilingual Brand");
  assert.deepEqual(applied.elements, layout.elements);
  assert.equal(applied.elements.find((element) => element.id === "custom_stamp").imageSrc, "data:image/png;base64,stamp-fixture");
  assert.equal(applied.elements.find((element) => element.id === "custom_stamp").fontFamily, "Noto Naskh Arabic");
  assert.deepEqual(applied.elements.find((element) => element.id === "line_items").tableSettings.columns, layout.elements.find((element) => element.id === "line_items").tableSettings.columns);

  const duplicate = await manager.duplicate("company-a", "quotation", saved, "Bilingual Brand Copy");
  const editedCopyLayout = manager.apply(duplicate, "quotation");
  editedCopyLayout.branding.primaryColor = "#AABBCC";
  editedCopyLayout.elements.find((element) => element.id === "custom_stamp").x = 125;
  await manager.update("company-a", "quotation", duplicate.id, "Bilingual Brand Copy", editedCopyLayout);
  assert.equal(store.records.find((preset) => preset.id === saved.id).layout_json.branding.primaryColor, "#123456");
  assert.equal(store.records.find((preset) => preset.id === duplicate.id).layout_json.branding.primaryColor, "#AABBCC");
  assert.equal(store.records.find((preset) => preset.id === duplicate.id).layout_json.elements.find((element) => element.id === "custom_stamp").x, 125);
  await manager.rename("company-a", "quotation", duplicate.id, "Renamed Copy");
  await manager.delete("company-a", "quotation", saved);
  assert.equal((await manager.list("company-a", "quotation")).length, 1);
  await manager.setDefault("company-a", "quotation", duplicate.id);
  const afterRename = await manager.list("company-a", "quotation");
  assert.equal(afterRename.find((preset) => preset.id === duplicate.id).template_name, "Renamed Copy");
  assert.equal(afterRename.find((preset) => preset.id === duplicate.id).is_default, true);
  assert.equal(afterRename.filter((preset) => preset.is_default).length, 1);
  assert.throws(() => manager.delete("company-a", "quotation", afterRename.find((preset) => preset.id === duplicate.id)), /Choose another default/);
  assert.equal((await manager.list("company-a", "quotation")).length, 1);
  assert.equal((await manager.list("company-b", "quotation")).length, 0);
  assert.throws(() => manager.apply(duplicate, "tax_invoice"), /different document type/);

  const invoiceLayout = JSON.parse(JSON.stringify(layout));
  invoiceLayout.documentType = "tax_invoice";
  const invoiceStyle = await manager.save("company-a", "tax_invoice", "Invoice Brand", invoiceLayout);
  const allCompanyStyles = await manager.listAll("company-a");
  assert.equal(allCompanyStyles.length, 2);
  assert.ok(allCompanyStyles.some((preset) => preset.id === duplicate.id));
  assert.ok(allCompanyStyles.some((preset) => preset.id === invoiceStyle.id));
  assert.equal((await manager.listAll("company-b")).length, 0);
  assert.equal(getFallbackDocumentStylePreset(allCompanyStyles, "tax_invoice").id, invoiceStyle.id);
});

test("restores active styles independently by company and document type", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  rememberActiveDocumentStylePresetId(storage, "company-a", "quotation", "quote-style");
  rememberActiveDocumentStylePresetId(storage, "company-a", "tax_invoice", "invoice-style");
  rememberActiveDocumentStylePresetId(storage, "company-b", "quotation", "other-company-style");

  assert.notEqual(
    getActiveDocumentStyleStorageKey("company-a", "quotation"),
    getActiveDocumentStyleStorageKey("company-a", "tax_invoice")
  );
  assert.equal(readActiveDocumentStylePresetId(storage, "company-a", "quotation"), "quote-style");
  assert.equal(readActiveDocumentStylePresetId(storage, "company-a", "tax_invoice"), "invoice-style");
  assert.equal(readActiveDocumentStylePresetId(storage, "company-b", "quotation"), "other-company-style");

  const presets = [
    { id: "default", is_default: true },
    { id: "quote-style", is_default: false },
  ];
  assert.equal(resolveDocumentStylePreset(presets, "quote-style").id, "quote-style");
  assert.equal(resolveDocumentStylePreset(presets, "missing"), null);
  assert.equal(getFallbackDocumentStylePreset(presets).id, "default");

  rememberActiveDocumentStylePresetId(storage, "company-a", "quotation", null);
  assert.equal(readActiveDocumentStylePresetId(storage, "company-a", "quotation"), null);
  assert.equal(readActiveDocumentStylePresetId(storage, "company-a", "tax_invoice"), "invoice-style");
});




test("keeps customer information readable and shifts the table for long saved details", () => {
  const layout = createFitTestLayout();
  const profile = computeIntelligentFitProfile(layout, 2, [{ description: "Arabic / English item" }], {
    customer_name: "شركة النور العالمية للمقاولات والإنشاءات ذ.م.م. International Trading and Contracting Company LLC",
    customer_trn: "100345678900003",
    customer_address: "Office 1204, Sheikh Zayed Road, Trade Centre District, Dubai, United Arab Emirates, P.O. Box 123456",
    contact_person: "مدير الحسابات المسؤول عن المشاريع الدولية / International Accounts and Projects Manager",
    contact_number: "+971 50 123 4567",
    contact_email: "accounts.international.projects@example.test",
  });
  assert.ok(profile.partyInfoHeight > 27);
  assert.ok(profile.tableY > 95);
  const effective = computeEffectiveLayout(layout, 2, true, 1, 1, [{ description: "Arabic / English item" }], {
    customer_name: "شركة النور العالمية للمقاولات والإنشاءات ذ.م.م. International Trading and Contracting Company LLC",
    customer_trn: "100345678900003",
    customer_address: "Office 1204, Sheikh Zayed Road, Trade Centre District, Dubai, United Arab Emirates, P.O. Box 123456",
    contact_person: "مدير الحسابات المسؤول عن المشاريع الدولية / International Accounts and Projects Manager",
    contact_number: "+971 50 123 4567",
    contact_email: "accounts.international.projects@example.test",
  });
  assert.ok(effective.elements.find((element) => element.id === "customer_info").effectiveHeight >= profile.partyInfoHeight);
});

test("paginates all long bilingual item rows and maintains readable compact text on A4", () => {
  const layout = createFitTestLayout();
  const items = Array.from({ length: 24 }, (_, index) => ({
    description: `${index + 1}. ${"Custom industrial installation and safety specification ".repeat(3)} وصف عربي طويل للمواصفات والتركيب والسلامة والمواد المعتمدة في دولة الإمارات العربية المتحدة.`,
  }));
  const plan = computePaginationPlan(layout, items.length, items);
  const coveredIndexes = plan.pageItemRanges.flatMap((range) => Array.from({ length: range.endIndex - range.startIndex }, (_, offset) => range.startIndex + offset));
  assert.ok(plan.totalPages > 1);
  assert.deepEqual(coveredIndexes, Array.from({ length: items.length }, (_, index) => index));
  assert.ok(plan.fitProfile.fontSize >= 9.5);

  const shortPlan = computePaginationPlan(layout, 2, [{ description: "Short item" }, { description: "Short description" }]);
  assert.equal(shortPlan.totalPages, 1);
});

test("company template policy scopes access to owners and active company members", () => {
  assert.match(templateRlsMigrationSource, /c\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(templateRlsMigrationSource, /p\.company_id = p_company_id/);
  assert.doesNotMatch(templateRlsMigrationSource, /get_auth_user_company_ids/);
  assert.doesNotMatch(templateRlsMigrationSource, /USING\s*\(true\)|WITH CHECK\s*\(true\)/i);
  assert.match(templateRlsMigrationSource, /REVOKE ALL ON TABLE public\.document_templates FROM anon/);
});

test("explains missing template-table and company RLS errors with safe recovery steps", () => {
  const missingTable = getDocumentTemplateStorageErrorMessage({
    code: "PGRST205",
    message: "Could not find the table 'public.document_templates' in the schema cache",
  });
  assert.match(missingTable, /public\.document_templates/);
  assert.match(missingTable, /supabase\/migrations\/20260930010000_repair_document_templates\.sql/);
  assert.match(getDocumentTemplateStorageErrorMessage({ code: "42501", message: "permission denied" }), /company membership/);
  assert.equal(getDocumentTemplateStorageErrorMessage({ code: "XX000", message: "Other database error" }), "Other database error");
});

test("repair migration creates the expected company-owned schema without deleting layout rows", () => {
  assert.match(templateRepairMigrationSource, /CREATE TABLE IF NOT EXISTS public\.document_templates/);
  for (const column of ["id UUID", "company_id UUID", "document_type TEXT", "template_name TEXT", "layout_json JSONB", "is_default BOOLEAN", "created_at TIMESTAMPTZ", "updated_at TIMESTAMPTZ"]) {
    assert.ok(templateRepairMigrationSource.includes(column));
  }
  assert.match(templateRepairMigrationSource, /REFERENCES public\.companies\(id\) ON DELETE CASCADE/);
  assert.match(templateRepairMigrationSource, /UNIQUE \(company_id, document_type, template_name\)/);
  assert.match(templateRepairMigrationSource, /USING \(public\.document_template_company_access\(company_id\)\)/);
  assert.match(templateRepairMigrationSource, /NOTIFY pgrst, 'reload schema'/);
  assert.doesNotMatch(templateRepairMigrationSource, /DROP TABLE|TRUNCATE|DELETE FROM public\.document_templates/i);
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
  assert.match(globalCssSource, /\.print-modal-container \.print-template-wrapper > \.no-print \{[\s\S]*?display: none !important;/);
});

test("keeps A4 export sizing independent from on-screen preview scaling", () => {
  assert.match(globalCssSource, /@page\s*\{\s*size: A4 portrait;/);
  assert.match(globalCssSource, /\.print-document,[\s\S]*?width: 210mm !important;[\s\S]*?min-height: 297mm !important;/);
  assert.match(globalCssSource, /\.print-preview-scale-shell,[\s\S]*?width: 210mm !important;/);
  assert.match(globalCssSource, /\.print-preview-scale-content[\s\S]*?transform: none !important;/);
});

test("renders top gold and bottom navy decorative borders across dynamic and standard documents", () => {
  assert.match(documentContainerSource, /<PageDecorativeBorders/);
  assert.match(dynamicRendererSource, /<PageDecorativeBorders/);
  assert.match(pageDecorativeBordersSource, /#E0AC23/);
  assert.match(pageDecorativeBordersSource, /#173C64/);
  assert.match(pageDecorativeBordersSource, /preserveAspectRatio="none"/);
  assert.match(pageDecorativeBordersSource, /WebkitPrintColorAdjust: "exact"/);
  assert.match(pageBorderSectionSource, /Page Border (&amp;|&) Background Design/);
});

test("guarantees decorative border clearances and preserves borders during Auto Fix", () => {
  assert.match(pageDecorativeBordersSource, /calculateBorderClearances/);
  assert.match(pageDecorativeBordersSource, /safeTopLimitMm/);
  assert.match(pageDecorativeBordersSource, /safeBottomLimitMm/);
  assert.match(pageDecorativeBordersSource, /effectiveTopThickness/);
  assert.match(pageDecorativeBordersSource, /effectiveBottomThickness/);
  assert.match(designerSource, /bordersToKeep/);
  assert.match(designerSource, /Applied Auto Fix while strictly preserving your saved border & background design/);
  assert.match(globalCssSource, /\.page-decorative-borders-container\s*\{[\s\S]*?print-color-adjust:\s*exact\s*!important;/);
  assert.match(globalCssSource, /\.page-decorative-borders-container svg\s*\{[\s\S]*?print-color-adjust:\s*exact\s*!important;/);
  assert.doesNotMatch(globalCssSource, /\.page-decorative-borders-container\s+svg\s+\*\s*\{[\s\S]*?display:\s*block/);
});

test("PDF Designer provides complete controls for border colors, thickness, angles, and styles", () => {
  assert.match(pageBorderSectionSource, /Top Decorative Border/);
  assert.match(pageBorderSectionSource, /Bottom Decorative Border/);
  assert.match(pageBorderSectionSource, /Border Style/);
  assert.match(pageBorderSectionSource, /straight/);
  assert.match(pageBorderSectionSource, /diagonal/);
  assert.match(pageBorderSectionSource, /custom/);
  assert.match(pageBorderSectionSource, /geometric_ribbon/);
  assert.match(pageBorderSectionSource, /accent_corner/);
  assert.match(pageBorderSectionSource, /double_stripe/);
  assert.match(pageBorderSectionSource, /wave/);
  assert.match(pageBorderSectionSource, /Thickness \(mm\)/);
  assert.match(pageBorderSectionSource, /Rotation Angle/);
  assert.match(pageBorderSectionSource, /Auto-Clearance Guard Active/);
});

test("hardens decorative borders for printed output with universal CSS border stripes and z-30", () => {
  assert.match(pageDecorativeBordersSource, /print-border-stripe-top/);
  assert.match(pageDecorativeBordersSource, /print-border-stripe-bottom/);
  assert.match(pageDecorativeBordersSource, /z-\[30\]/);
  assert.match(pageDecorativeBordersSource, /boxSizing:\s*"border-box"/);
  assert.match(pageDecorativeBordersSource, /borderTop:/);
  assert.match(pageDecorativeBordersSource, /borderBottom:/);
  assert.match(pageBorderSectionSource, /Printer-Safe \(3\.5 mm\)/);
  assert.match(pageBorderSectionSource, /Full-Bleed \(0 mm\)/);
  assert.match(globalCssSource, /\.page-decorative-borders-container\s*\{[\s\S]*?z-index:\s*30\s*!important;/);
});



