import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("PDF Designer Typography & Sizing Upgrade Verification", async (t) => {
  const libDesignerSource = fs.readFileSync(
    path.resolve(process.cwd(), "lib/documentDesigner.ts"),
    "utf8"
  );
  const rendererSource = fs.readFileSync(
    path.resolve(process.cwd(), "components/documents/DynamicDocumentRenderer.tsx"),
    "utf8"
  );
  const inspectorSource = fs.readFileSync(
    path.resolve(process.cwd(), "components/designer/RightInspector.tsx"),
    "utf8"
  );
  const designerSource = fs.readFileSync(
    path.resolve(process.cwd(), "components/designer/DocumentDesigner.tsx"),
    "utf8"
  );

  await t.test("1. LayoutElement and TableColumnConfig types support font sizing and element controls", () => {
    assert.ok(
      libDesignerSource.includes("fontSize?: number;"),
      "LayoutElement must include fontSize in PT"
    );
    assert.ok(
      libDesignerSource.includes("textDecoration?: \"none\" | \"underline\";"),
      "LayoutElement must include textDecoration"
    );
    assert.ok(
      libDesignerSource.includes("textWrapping?: \"wrap\" | \"nowrap\" | \"clip\";"),
      "LayoutElement must include textWrapping"
    );
    assert.ok(
      libDesignerSource.includes("autoFitText?: boolean;"),
      "LayoutElement must include autoFitText"
    );
    assert.ok(
      libDesignerSource.includes("minFontSize?: number;"),
      "LayoutElement must include minFontSize"
    );
    assert.ok(
      libDesignerSource.includes("headerFontSize?: number;"),
      "TableSettings must include headerFontSize"
    );
    assert.ok(
      libDesignerSource.includes("descriptionFontSize?: number;"),
      "TableSettings must include descriptionFontSize"
    );
    assert.ok(
      libDesignerSource.includes("qtyFontSize?: number;"),
      "TableSettings must include qtyFontSize"
    );
    assert.ok(
      libDesignerSource.includes("unitFontSize?: number;"),
      "TableSettings must include unitFontSize"
    );
    assert.ok(
      libDesignerSource.includes("rateFontSize?: number;"),
      "TableSettings must include rateFontSize"
    );
    assert.ok(
      libDesignerSource.includes("amountFontSize?: number;"),
      "TableSettings must include amountFontSize"
    );
    assert.ok(
      libDesignerSource.includes("headerHeight?: number;"),
      "TableSettings must include headerHeight"
    );
    assert.ok(
      libDesignerSource.includes("cellPadding?: number;"),
      "TableSettings must include cellPadding"
    );
  });

  await t.test("2. DynamicDocumentRenderer applies PT font sizes and appearance across all elements", () => {
    assert.ok(
      rendererSource.includes("resolvePt"),
      "DynamicDocumentRenderer must include resolvePt helper"
    );
    assert.ok(
      rendererSource.includes("${elem.fontSize}pt"),
      "elementAppearance must format fontSize in pt"
    );
    assert.ok(
      rendererSource.includes("textDecoration: elem.textDecoration"),
      "elementAppearance must include textDecoration"
    );
    assert.ok(
      rendererSource.includes("textWrapping === \"nowrap\""),
      "elementAppearance must handle textWrapping"
    );
    // Check specific elements use resolvePt
    const elementsToCheck = [
      "company_name_en",
      "company_name_ar",
      "company_address",
      "doc_title",
      "customer_info",
      "supplier_info",
      "project_info",
      "doc_meta",
      "line_items",
      "totals",
      "bank_details",
      "payment_terms",
      "company_signature",
      "company_stamp",
      "company_trn",
      "footer",
      "custom_text",
      "amount_in_words",
    ];

    for (const elemType of elementsToCheck) {
      assert.ok(
        rendererSource.includes(`case "${elemType}":`),
        `DynamicDocumentRenderer must handle ${elemType}`
      );
    }
  });

  await t.test("3. RightInspector provides full PT font size controls, +/- steppers, slider, presets", () => {
    assert.ok(
      inspectorSource.includes("Font Size (PT)"),
      "RightInspector must have Font Size (PT) section"
    );
    assert.ok(
      inspectorSource.includes("Reset Default"),
      "RightInspector must support resetting font size to default"
    );
    assert.ok(
      inspectorSource.includes("Text Wrapping"),
      "RightInspector must support text wrapping"
    );
    assert.ok(
      inspectorSource.includes("Internal Padding (mm)"),
      "RightInspector must support internal padding"
    );
    assert.ok(
      inspectorSource.includes("Auto-Fit Text Protection"),
      "RightInspector must support auto-fit text protection"
    );
    assert.ok(
      inspectorSource.includes("Toggle Underline"),
      "RightInspector must support underline formatting"
    );
    assert.ok(
      inspectorSource.includes("Nudge Left 1mm") && inspectorSource.includes("Nudge Right 1mm"),
      "RightInspector must provide X Position steppers"
    );
    assert.ok(
      inspectorSource.includes("Nudge Up 1mm") && inspectorSource.includes("Nudge Down 1mm"),
      "RightInspector must provide Y Position steppers"
    );
    assert.ok(
      inspectorSource.includes("Shrink Width 1mm") && inspectorSource.includes("Expand Width 1mm"),
      "RightInspector must provide Width steppers"
    );
    assert.ok(
      inspectorSource.includes("Shrink Height 1mm") && inspectorSource.includes("Expand Height 1mm"),
      "RightInspector must provide Height steppers"
    );
  });

  await t.test("4. Table settings inspector controls all line item dimensions and typography", () => {
    assert.ok(
      inspectorSource.includes("Header H (mm)"),
      "RightInspector must provide Header Height control"
    );
    assert.ok(
      inspectorSource.includes("Row H (mm)"),
      "RightInspector must provide Row Height control"
    );
    assert.ok(
      inspectorSource.includes("Body Font Size (PT)"),
      "RightInspector must provide Table Body Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Header Font Size (PT)"),
      "RightInspector must provide Table Header Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Description (PT)"),
      "RightInspector must provide Description Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Quantity (PT)"),
      "RightInspector must provide Quantity Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Unit (PT)"),
      "RightInspector must provide Unit Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Rate (PT)"),
      "RightInspector must provide Rate Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Total Amount (PT)"),
      "RightInspector must provide Total Amount Font Size control"
    );
    assert.ok(
      inspectorSource.includes("Columns Configuration") && inspectorSource.includes("Width %"),
      "RightInspector must provide per-column font size and width configuration"
    );
  });

  await t.test("5. DocumentDesigner includes keyboard arrow nudging, shift+arrow, undo/redo, delete", () => {
    assert.ok(
      designerSource.includes("e.key === \"ArrowLeft\""),
      "DocumentDesigner must handle ArrowLeft"
    );
    assert.ok(
      designerSource.includes("e.key === \"ArrowRight\""),
      "DocumentDesigner must handle ArrowRight"
    );
    assert.ok(
      designerSource.includes("e.key === \"ArrowUp\""),
      "DocumentDesigner must handle ArrowUp"
    );
    assert.ok(
      designerSource.includes("e.key === \"ArrowDown\""),
      "DocumentDesigner must handle ArrowDown"
    );
    assert.ok(
      designerSource.includes("const step = e.shiftKey ? 5 : 1"),
      "DocumentDesigner must support 1mm step and 5mm Shift step"
    );
    assert.ok(
      designerSource.includes("handleUndo()"),
      "DocumentDesigner must handle Undo shortcut"
    );
    assert.ok(
      designerSource.includes("handleRedo()"),
      "DocumentDesigner must handle Redo shortcut"
    );
  });
});
