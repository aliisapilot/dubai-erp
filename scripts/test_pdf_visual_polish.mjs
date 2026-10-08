import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console,
    require: (id) => {
      if (id.endsWith("/supabase") || id === "./supabase") return { supabase: {} };
      if (id.endsWith("documentCloud")) return { createDocumentCloud: () => ({}) };
      if (id.endsWith("documentDesignBackup")) return {};
      if (id === "@/lib/helpers" || id.endsWith("helpers")) return { fmtAED: (n) => `AED ${Number(n).toFixed(2)}`, fmtDate: (d) => d };
      if (id.startsWith(".") || id.startsWith("@/")) {
        const base = id.startsWith("@/") ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id);
        const resolved = [".ts", ".tsx"].map((ext) => base + ext).find((p) => fs.existsSync(p));
        if (resolved) return load(resolved);
      }
      return require(id);
    },
  });
  return exports;
}

const { normalizeLayout, createDefaultLayout } = load("lib/documentDesigner.ts");
const { computeEffectiveLayout } = load("lib/documentLayoutEngine.ts");

test("PDF Visual Polish & Collision Prevention Verification", async (t) => {
  await t.test("1. normalizeLayout heals corrupted / colliding header layouts", () => {
    // Simulate a corrupted layout where logo, English name, and Arabic name were saved on top of each other
    const corruptedLayout = {
      version: 4,
      documentType: "delivery_note",
      page: {
        paper: "A4",
        widthMm: 210,
        heightMm: 297,
        margins: { top: 12, right: 12, bottom: 12, left: 12 },
        watermarkOpacity: 0.8,
      },
      elements: [
        { id: "watermark", type: "watermark", visible: true, opacity: 0.9, x: 50, y: 50, width: 100, height: 100, zIndex: 1 },
        { id: "logo", type: "logo", visible: true, x: 85, y: 10, width: 40, height: 12, zIndex: 10 },
        { id: "company_name_en", type: "company_name_en", visible: true, x: 12, y: 12, width: 186, height: 6, fontSize: 18, zIndex: 11 }, // colliding with logo at y=12
        { id: "company_name_ar", type: "company_name_ar", visible: true, x: 12, y: 14, width: 186, height: 8, fontSize: 26, zIndex: 12 }, // colliding with en name at y=14
        { id: "company_address", type: "company_address", visible: true, x: 12, y: 18, width: 186, height: 6, fontSize: 12, zIndex: 13 },
        { id: "doc_title", type: "doc_title", visible: true, x: 12, y: 22, width: 186, height: 10, fontSize: 18, zIndex: 14 },
      ],
    };

    const healed = normalizeLayout(corruptedLayout);
    assert.equal(healed.version, 8, "Version bumped to 8");

    const logo = healed.elements.find(e => e.id === "logo");
    const en = healed.elements.find(e => e.id === "company_name_en");
    const ar = healed.elements.find(e => e.id === "company_name_ar");
    const addr = healed.elements.find(e => e.id === "company_address");
    const title = healed.elements.find(e => e.id === "doc_title");
    const wm = healed.elements.find(e => e.id === "watermark");

    // Check watermark opacity is safe
    assert.ok(wm.opacity <= 0.05, `Watermark opacity must be subtle (<=0.05), got ${wm.opacity}`);

    // Check sequential stacking without overlaps
    assert.ok(logo.y + logo.height <= en.y, `Logo bottom (${logo.y + logo.height}) must be <= English name Y (${en.y})`);
    assert.ok(en.y + en.height <= ar.y, `English name bottom (${en.y + en.height}) must be <= Arabic name Y (${ar.y})`);
    assert.ok(ar.y + ar.height <= addr.y, `Arabic name bottom (${ar.y + ar.height}) must be <= Address Y (${addr.y})`);
    assert.ok(addr.y + addr.height <= title.y, `Address bottom (${addr.y + addr.height}) must be <= Title Y (${title.y})`);

    // Check font sizes normalized from legacy px
    assert.ok(ar.fontSize <= 14.5, `Arabic font size must be normalized (<=14.5pt), got ${ar.fontSize}`);
    assert.ok(en.fontSize <= 12.5, `English font size must be normalized (<=12.5pt), got ${en.fontSize}`);
    assert.ok(addr.fontSize <= 8.5, `Address font size must be normalized (<=8.5pt), got ${addr.fontSize}`);
    assert.ok(title.fontSize <= 13.0, `Title font size must be normalized (<=13.0pt), got ${title.fontSize}`);
  });

  await t.test("2. computeEffectiveLayout under single-page smart fit never collides header elements", () => {
    const layout = createDefaultLayout("delivery_note");
    // Enable smart fit balanced mode
    layout.page.smartFit = {
      enabled: true,
      mode: "balanced",
      minFontSize: 7.5,
      minRowHeight: 4.8,
      automaticSpacing: true,
      printSafeBorders: true,
      preventOverflow: true,
    };

    const items = [
      { description: "Custom Arabic Majlis Tent (20m x 40m) Heavy Duty Flame Retardant PVC", quantity: 1, unit: "Set" },
      { description: "Galvanized Steel & Aluminum Structural Truss Arches (300mm Profile)", quantity: 12, unit: "Pcs" },
      { description: "Double Glazed Tempered Glass Wall Panels & Entrance Double Door", quantity: 8, unit: "Units" },
      { description: "On-site Rigging, Assembly, Anchoring & Safety Compliance Testing", quantity: 1, unit: "Job" },
    ];

    const effective = computeEffectiveLayout(layout, items.length, true, 1, 1, items);

    const logo = effective.elements.find(e => e.id === "logo");
    const en = effective.elements.find(e => e.id === "company_name_en");
    const ar = effective.elements.find(e => e.id === "company_name_ar");
    const addr = effective.elements.find(e => e.id === "company_address");
    const title = effective.elements.find(e => e.id === "doc_title");
    const customer = effective.elements.find(e => e.id === "customer_info");
    const meta = effective.elements.find(e => e.id === "doc_meta");
    const table = effective.elements.find(e => e.id === "line_items");

    // Strictly verify no vertical overlaps among header rows
    assert.ok(
      logo.effectiveY + logo.effectiveHeight <= en.effectiveY,
      `Logo bottom (${logo.effectiveY + logo.effectiveHeight}) <= English Y (${en.effectiveY})`
    );
    assert.ok(
      en.effectiveY + en.effectiveHeight <= ar.effectiveY,
      `English bottom (${en.effectiveY + en.effectiveHeight}) <= Arabic Y (${ar.effectiveY})`
    );
    assert.ok(
      ar.effectiveY + ar.effectiveHeight <= addr.effectiveY,
      `Arabic bottom (${ar.effectiveY + ar.effectiveHeight}) <= Address Y (${addr.effectiveY})`
    );
    assert.ok(
      addr.effectiveY + addr.effectiveHeight <= title.effectiveY,
      `Address bottom (${addr.effectiveY + addr.effectiveHeight}) <= Title Y (${title.effectiveY})`
    );
    assert.ok(
      title.effectiveY + title.effectiveHeight <= customer.effectiveY,
      `Title bottom (${title.effectiveY + title.effectiveHeight}) <= Customer Y (${customer.effectiveY})`
    );
    assert.equal(
      customer.effectiveY,
      meta.effectiveY,
      "Customer and Meta cards must align at the exact same Y baseline"
    );
    assert.ok(
      customer.effectiveY + customer.effectiveHeight <= table.effectiveY,
      `Customer bottom (${customer.effectiveY + customer.effectiveHeight}) <= Table Y (${table.effectiveY})`
    );
  });
});
