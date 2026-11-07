/**
 * Comprehensive Automated Verification Suite for PDF Designer & Layout Repairs
 * Testing all requirements from the Antigravity Master PDF Designer task:
 * 1. Measurement Sheet intelligent column sizing, right-aligned monetary values, zero overlap
 * 2. Dynamic table height without artificial blank space
 * 3. Multi-row pagination (1, 4, 15, 20, 50 rows)
 * 4. Designer workspace zoom & fit controls
 * 5. Right Inspector basic & advanced table controls with wheel scroll protection
 * 6. Print style fidelity (no whiteout of slate-50/100)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_MEASUREMENT_COLUMNS,
  DEFAULT_INVOICE_COLUMNS,
  getDefaultColumnsForDocType,
  getAutoFitColumnsForDocType,
  createDefaultLayout,
  normalizeLayout,
} from "../lib/documentDesigner.ts";
import {
  calculateTableRenderedHeight,
  computePaginationPlan,
  prepareSavedAutoFit,
} from "../lib/documentLayoutEngine.ts";

test("PDF Designer & Layout Repairs Verification Suite", async (t) => {
  await t.test("1. Measurement Sheet intelligent column sizing & alignments", () => {
    const cols = DEFAULT_MEASUREMENT_COLUMNS;
    const visibleCols = cols.filter((c) => c.visible);

    // Sum of visible columns should equal 100%
    const totalVisibleWidth = visibleCols.reduce((sum, c) => sum + c.widthPct, 0);
    assert.strictEqual(
      totalVisibleWidth,
      100,
      `Visible columns must sum to exactly 100%, got ${totalVisibleWidth}%`
    );

    // Rate column must be >= 10% and right-aligned
    const rateCol = cols.find((c) => c.key === "rate");
    assert.ok(rateCol, "Rate column must exist");
    assert.ok(
      rateCol.widthPct >= 10,
      `Rate column width must be >= 10% to prevent overlap, got ${rateCol.widthPct}%`
    );
    assert.strictEqual(
      rateCol.align,
      "right",
      `Rate column must be right-aligned, got ${rateCol.align}`
    );

    // Amount column must be >= 11% and right-aligned
    const amountCol = cols.find((c) => c.key === "line_total");
    assert.ok(amountCol, "Amount (line_total) column must exist");
    assert.ok(
      amountCol.widthPct >= 11,
      `Amount column width must be >= 11% to prevent overlap, got ${amountCol.widthPct}%`
    );
    assert.strictEqual(
      amountCol.align,
      "right",
      `Amount column must be right-aligned, got ${amountCol.align}`
    );

    // Description must have generous width for wrapping (>= 25%)
    const descCol = cols.find((c) => c.key === "description");
    assert.ok(descCol, "Description column must exist");
    assert.ok(
      descCol.widthPct >= 25,
      `Description column must have >= 25% width for natural wrapping, got ${descCol.widthPct}%`
    );

    // Calculation type should be hidden by default
    const calcCol = cols.find((c) => c.key === "calc_type");
    assert.ok(calcCol, "calc_type column should exist in schema");
    assert.strictEqual(
      calcCol.visible,
      false,
      "calc_type should be hidden by default to keep takeoff table clean"
    );
  });

  await t.test("2. Default columns helper and auto-fit normalization across document types", () => {
    const docTypes = [
      "measurement_sheet",
      "tax_invoice",
      "quotation",
      "proforma_invoice",
      "delivery_note",
      "purchase_order",
      "customer_statement",
      "salary_statement",
    ];

    for (const dt of docTypes) {
      const defaultCols = getDefaultColumnsForDocType(dt);
      assert.ok(Array.isArray(defaultCols) && defaultCols.length > 0, `Default columns must exist for ${dt}`);
      const visibleSum = defaultCols.filter((c) => c.visible).reduce((s, c) => s + c.widthPct, 0);
      assert.strictEqual(
        visibleSum,
        100,
        `Default visible columns for ${dt} must total 100%, got ${visibleSum}%`
      );

      const autoFit = getAutoFitColumnsForDocType(dt, defaultCols);
      assert.ok(Array.isArray(autoFit), `Auto-fit must return array for ${dt}`);
      const autoSum = autoFit.filter((c) => c.visible).reduce((s, c) => s + c.widthPct, 0);
      assert.strictEqual(
        autoSum,
        100,
        `Auto-fit columns for ${dt} must total 100%, got ${autoSum}%`
      );
    }
  });

  await t.test("3. Auto-migration upgrades legacy cramped measurement columns", () => {
    const legacyLayout = {
      id: "legacy_takeoff",
      name: "Legacy Measurement Sheet",
      documentType: "measurement_sheet",
      elements: [
        {
          id: "line_items",
          type: "line_items",
          label: "Takeoff Items Table",
          x: 10,
          y: 80,
          width: 190,
          height: 76,
          visible: true,
          tableSettings: {
            headerBg: "#0F172A",
            headerTextColor: "#FFFFFF",
            fontSize: 7.5,
            rowHeight: 7.5,
            borderThickness: 1,
            borderColor: "#CBD5E1",
            bodyTextColor: "#0F172A",
            columns: [
              { key: "item_no", label: "#", visible: true, widthPct: 4, align: "center" },
              { key: "area_name", label: "Area / Ref", visible: true, widthPct: 15, align: "left" },
              { key: "description", label: "Description", visible: true, widthPct: 35, align: "left" },
              { key: "dimensions", label: "Dimensions", visible: true, widthPct: 15, align: "center" },
              { key: "quantity", label: "Qty", visible: true, widthPct: 6, align: "center" },
              { key: "result", label: "Result", visible: true, widthPct: 11, align: "center" },
              { key: "rate", label: "Rate", visible: true, widthPct: 6, align: "center" }, // CRAMPED 6% center
              { key: "line_total", label: "Amount", visible: true, widthPct: 8, align: "center" }, // CRAMPED 8% center
            ],
          },
        },
      ],
      page: {
        size: "A4",
        orientation: "portrait",
        widthMm: 210,
        heightMm: 297,
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
      },
      branding: {
        logoUrl: "",
        companyNameEn: "Test",
        companyNameAr: "تجربة",
        trn: "123",
        address: "Dubai",
        primaryColor: "#000",
        secondaryColor: "#000",
      },
    };

    const normalized = normalizeLayout(legacyLayout);
    const tableElem = normalized.elements.find((e) => e.type === "line_items");
    assert.ok(tableElem && tableElem.tableSettings, "Table element must exist");

    const rateCol = tableElem.tableSettings.columns.find((c) => c.key === "rate");
    const amountCol = tableElem.tableSettings.columns.find((c) => c.key === "line_total");

    assert.ok(
      rateCol.widthPct >= 10,
      `Legacy rate column must be migrated to >= 10%, got ${rateCol.widthPct}%`
    );
    assert.strictEqual(
      rateCol.align,
      "right",
      `Legacy rate column must be migrated to right alignment`
    );

    assert.ok(
      amountCol.widthPct >= 11,
      `Legacy amount column must be migrated to >= 11%, got ${amountCol.widthPct}%`
    );
    assert.strictEqual(
      amountCol.align,
      "right",
      `Legacy amount column must be migrated to right alignment`
    );
  });

  await t.test("4. Multi-row pagination and dynamic table sizing (1, 4, 15, 20, 50 rows)", () => {
    const layout = createDefaultLayout("measurement_sheet");
    const tableElem = layout.elements.find((e) => e.type === "line_items");

    // 1 row
    const height1 = calculateTableRenderedHeight(tableElem, 1);
    assert.ok(height1 > 10 && height1 < 30, `1 row height should be compact (~15-20mm), got ${height1}mm`);

    // 4 rows (Takeoff screenshot case)
    const height4 = calculateTableRenderedHeight(tableElem, 4);
    assert.ok(height4 > 25 && height4 < 55, `4 rows height should be ~35-45mm, got ${height4}mm`);

    // Ensure 4 rows fits cleanly on a single page
    const plan4 = computePaginationPlan(layout, 4);
    assert.strictEqual(plan4.totalPages, 1, "4 rows must strictly fit on 1 page without extra blank pages");

    // 15 rows: should fit on 1 page when practical
    const plan15 = computePaginationPlan(layout, 15);
    assert.ok(plan15.totalPages >= 1 && plan15.totalPages <= 2, `15 rows pages: ${plan15.totalPages}`);

    // 20 rows: should paginate cleanly across pages
    const plan20 = computePaginationPlan(layout, 20);
    assert.ok(plan20.totalPages >= 2, `20 rows should paginate across multiple pages, got ${plan20.totalPages} pages`);

    // 50 rows: multi-page pagination
    const plan50 = computePaginationPlan(layout, 50);
    assert.ok(plan50.totalPages >= 3, `50 rows should paginate across 3+ pages, got ${plan50.totalPages} pages`);

    // Check continuation pages in 50 rows
    const firstPageItems = plan50.pageItemRanges[0].itemCount;
    const secondPageItems = plan50.pageItemRanges[1].itemCount;
    assert.ok(firstPageItems > 0, "Page 1 must have items");
    assert.ok(secondPageItems > 0, "Page 2 must have items");
  });

  await t.test("5. Designer UI components verify Zoom, Wheel protection & Accordion presence", () => {
    // Verify TopToolbar.tsx has zoom and fit buttons
    const topToolbarPath = path.resolve(process.cwd(), "components/designer/TopToolbar.tsx");
    const topToolbarCode = fs.readFileSync(topToolbarPath, "utf-8");
    assert.ok(topToolbarCode.includes("ZoomIn"), "TopToolbar must include ZoomIn icon");
    assert.ok(topToolbarCode.includes("ZoomOut"), "TopToolbar must include ZoomOut icon");
    assert.ok(topToolbarCode.includes("Fit Width"), "TopToolbar must include Fit Width button");
    assert.ok(topToolbarCode.includes("Fit Page"), "TopToolbar must include Fit Page button");

    // Verify RightInspector.tsx has table quick actions, wheel protection & accordion
    const inspectorPath = path.resolve(process.cwd(), "components/designer/RightInspector.tsx");
    const inspectorCode = fs.readFileSync(inspectorPath, "utf-8");
    assert.ok(inspectorCode.includes("Auto Fit Columns"), "RightInspector must include Auto Fit Columns");
    assert.ok(inspectorCode.includes("Auto Fit Rows"), "RightInspector must include Auto Fit Rows");
    assert.ok(inspectorCode.includes("Distribute Evenly"), "RightInspector must include Distribute Evenly");
    assert.ok(inspectorCode.includes("Fit Page Width"), "RightInspector must include Fit Page Width");
    assert.ok(inspectorCode.includes("Reset Table Layout"), "RightInspector must include Reset Table Layout");
    assert.ok(inspectorCode.includes("Auto-Balance to 100%"), "RightInspector must include Auto-Balance button for column width overflow");
    assert.ok(inspectorCode.includes("showAdvancedTableOptions"), "RightInspector must have collapsible advanced options accordion");
    assert.ok(inspectorCode.includes("onWheel={(e) => e.currentTarget.blur()}"), "RightInspector must have wheel scroll blur protection");

    // Verify DocumentCanvas.tsx selection box height hugs actual content
    const canvasPath = path.resolve(process.cwd(), "components/designer/DocumentCanvas.tsx");
    const canvasCode = fs.readFileSync(canvasPath, "utf-8");
    assert.ok(
      canvasCode.includes("elem.type === \"line_items\" && dim?.heightMm"),
      "DocumentCanvas must use rendered heightMm for line_items selection box"
    );
    assert.ok(
      canvasCode.includes("pb-40 sm:pb-48 md:pb-60"),
      "DocumentCanvas must have generous bottom scroll padding to access footers"
    );

    // Verify app/globals.css does not wipe out slate-50/100 to pure white
    const globalsPath = path.resolve(process.cwd(), "app/globals.css");
    const globalsCode = fs.readFileSync(globalsPath, "utf-8").replace(/\r\n/g, "\n");
    assert.ok(
      globalsCode.includes(".bg-slate-50 {\n    background-color: #f8fafc !important;"),
      "app/globals.css must preserve subtle #f8fafc print background for slate-50"
    );
    assert.ok(
      globalsCode.includes(".bg-slate-100 {\n    background-color: #f1f5f9 !important;"),
      "app/globals.css must preserve subtle #f1f5f9 print background for slate-100"
    );
  });
});
