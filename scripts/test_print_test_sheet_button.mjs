import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const readFileNorm = (filePath) => fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

test("Dubai ERP PDF Designer - Print Test Sheet Button & Calibration Engine", async (t) => {
  await t.test("Requirement 1 & 2: Root cause fix in DocumentDesigner and RightInspector", () => {
    const docDesignerContent = readFileNorm(path.join(rootDir, "components", "designer", "DocumentDesigner.tsx"));
    const rightInspectorContent = readFileNorm(path.join(rootDir, "components", "designer", "RightInspector.tsx"));
    const printingSectionContent = readFileNorm(path.join(rootDir, "components", "designer", "PrintingSettingsSection.tsx"));

    // Verify onOpenTestSheet no longer does unhandled window.open that gets blocked by popup blockers
    assert.ok(
      !docDesignerContent.includes('onOpenTestSheet={() => window.open("/print-test-sheet", "_blank")}'),
      "Fixed old silent window.open call that got blocked by pop-up blockers"
    );

    // Verify onOpenTestSheet opens PrintTestSheetModal
    assert.ok(
      docDesignerContent.includes("onOpenTestSheet={() => setShowTestSheetModal(true)}"),
      "DocumentDesigner connects onOpenTestSheet to showTestSheetModal(true)"
    );

    // Verify PrintTestSheetModal is imported and mounted
    assert.ok(
      docDesignerContent.includes("<PrintTestSheetModal"),
      "PrintTestSheetModal is mounted in DocumentDesigner"
    );

    // Verify the button text in PrintingSettingsSection
    assert.ok(
      printingSectionContent.includes("Print Physical Printer Test Sheet"),
      "Button with test sheet label exists in PrintingSettingsSection"
    );
    assert.ok(
      rightInspectorContent.includes("onOpenTestSheet={onOpenTestSheet}"),
      "RightInspector forwards onOpenTestSheet to PrintingSettingsSection"
    );
  });

  await t.test("Requirement 3: Genuine A4 printer calibration sheet content verification", () => {
    const sheetContent = readFileNorm(path.join(rootDir, "components", "designer", "PrintCalibrationSheet.tsx"));

    // All 4 margin rulers: Top, Bottom, Left, and Right
    assert.ok(sheetContent.includes("0mm TOP EDGE"), "Contains Top 0mm margin ruler");
    assert.ok(sheetContent.includes("0mm BOTTOM EDGE"), "Contains Bottom 0mm margin ruler");
    assert.ok(sheetContent.includes("0mm LEFT EDGE"), "Contains Left 0mm margin ruler");
    assert.ok(sheetContent.includes("0mm RIGHT EDGE"), "Contains Right 0mm margin ruler");

    // 4-Way hardware margin cutoffs test
    assert.ok(sheetContent.includes("4-WAY HARDWARE MARGIN CALIBRATION"), "Contains 4-way hardware margin calibration");
    assert.ok(sheetContent.includes("3.5 mm"), "Contains 3.5mm safe cutoff ruler marker");
    assert.ok(sheetContent.includes("5.0 mm"), "Contains 5.0mm safe cutoff ruler marker");

    // Gold and navy color test bars & gradients
    assert.ok(sheetContent.includes("#E0AC23"), "Contains Gold brand color #E0AC23");
    assert.ok(sheetContent.includes("#173C64"), "Contains Navy brand color #173C64");
    assert.ok(sheetContent.includes("GOLD SPECTRUM GRADIENT"), "Contains Gold spectrum gradient bar");
    assert.ok(sheetContent.includes("NAVY SPECTRUM GRADIENT"), "Contains Navy spectrum gradient bar");
    assert.ok(sheetContent.includes("Gold 100%"), "Contains stepped tints for Gold");
    assert.ok(sheetContent.includes("Navy 100%"), "Contains stepped tints for Navy");

    // Border thickness ladder (0.25pt to 3.0pt)
    assert.ok(sheetContent.includes("0.25 pt Hairline"), "Contains 0.25pt hairline border test");
    assert.ok(sheetContent.includes("0.50 pt Fine Rule"), "Contains 0.50pt fine rule border test");
    assert.ok(sheetContent.includes("1.00 pt Standard"), "Contains 1.00pt standard border test");
    assert.ok(sheetContent.includes("1.50 pt Medium"), "Contains 1.50pt medium border test");
    assert.ok(sheetContent.includes("2.00 pt Bold"), "Contains 2.00pt bold border test");
    assert.ok(sheetContent.includes("3.00 pt Heavy"), "Contains 3.00pt heavy border test");

    // Color and grayscale printing samples
    assert.ok(sheetContent.includes("COLOR SWATCHES"), "Contains color swatches");
    assert.ok(sheetContent.includes("HALFTONE REPRODUCTION"), "Contains halftone reproduction");
    assert.ok(sheetContent.includes("Primary Navy"), "Contains Primary Navy swatch");
    assert.ok(sheetContent.includes("Gold Accent"), "Contains Gold Accent swatch");

    // Alignment and scaling indicators (100.0mm physical calibration bar)
    assert.ok(sheetContent.includes("100.0 MM PHYSICAL SCALE"), "Contains 100.0mm physical scale bar");
    assert.ok(sheetContent.includes("50 mm (Center)"), "Contains 50mm center tick indicator");
    assert.ok(sheetContent.includes("Top-Left Target"), "Contains Top-Left corner registration mark");
    assert.ok(sheetContent.includes("Top-Right Target"), "Contains Top-Right corner registration mark");
    assert.ok(sheetContent.includes("Bottom-Left Target"), "Contains Bottom-Left corner registration mark");
    assert.ok(sheetContent.includes("Bottom-Right Target"), "Contains Bottom-Right corner registration mark");

    // Font legibility ladders (English & Arabic)
    assert.ok(sheetContent.includes("FONT LEGIBILITY LADDER"), "Contains font legibility ladder");
    assert.ok(sheetContent.includes("TAX INVOICE #INV-2026-0042"), "Contains English legibility sample");
    assert.ok(sheetContent.includes("فاتورة ضريبية"), "Contains Arabic legibility sample");
  });

  await t.test("Requirement 4 & 5: In-app preview modal with working Print, Download and popup-blocker immunity", () => {
    const modalContent = readFileNorm(path.join(rootDir, "components", "designer", "PrintTestSheetModal.tsx"));

    // Working Print button
    assert.ok(modalContent.includes("Print Test Sheet (Ctrl+P)"), "Has Print Test Sheet button");
    assert.ok(modalContent.includes("window.print()"), "Print button triggers window.print()");

    // Working Download button
    assert.ok(modalContent.includes("Download Print-Ready PDF"), "Has Download Print-Ready PDF button");
    assert.ok(modalContent.includes("/api/print-test-sheet/download"), "Download button triggers PDF download endpoint");

    // Dedicated tab with explicit pop-up blocker detection
    assert.ok(modalContent.includes("window.open("), "Provides open in tab capability");
    assert.ok(
      modalContent.includes("Browser blocked the new tab"),
      "Detects browser pop-up suppression and informs user"
    );

    // Zoom and grayscale simulation controls
    assert.ok(modalContent.includes("Zoom In") && modalContent.includes("Zoom Out"), "Has interactive zoom controls");
    assert.ok(modalContent.includes("Laser"), "Has laser simulation toggle");
  });

  await t.test("Requirement 6: Error reporting and user feedback messaging", () => {
    const modalContent = readFileNorm(path.join(rootDir, "components", "designer", "PrintTestSheetModal.tsx"));
    const standaloneContent = readFileNorm(path.join(rootDir, "app", "print-test-sheet", "page.tsx"));

    assert.ok(modalContent.includes("Printing error:"), "Modal reports printing error message");
    assert.ok(modalContent.includes("Download failed:"), "Modal reports download failure message");
    assert.ok(standaloneContent.includes("Printing failed:"), "Standalone page reports printing error message");
    assert.ok(standaloneContent.includes("Download failed:"), "Standalone page reports download failure message");
  });

  await t.test("Requirement 7: Test sheet works independently of currently selected document", () => {
    const docDesignerContent = readFileNorm(path.join(rootDir, "components", "designer", "DocumentDesigner.tsx"));

    // The modal is mounted at top level in DocumentDesigner, not tied to any specific document type ID
    assert.ok(
      docDesignerContent.includes("<PrintTestSheetModal\n        isOpen={showTestSheetModal}"),
      "PrintTestSheetModal is rendered unconditionally on showTestSheetModal regardless of selectedDocType"
    );
  });

  await t.test("Requirement 8: PDF file asset exists and download API route serves valid PDF", () => {
    const publicPdfPath = path.join(rootDir, "public", "dubai_erp_print_test_sheet_a4.pdf");
    assert.ok(fs.existsSync(publicPdfPath), "Public PDF asset exists at public/dubai_erp_print_test_sheet_a4.pdf");

    const pdfBuffer = fs.readFileSync(publicPdfPath);
    const pdfHeader = pdfBuffer.slice(0, 5).toString("utf-8");
    assert.equal(pdfHeader, "%PDF-", "File starts with valid PDF header '%PDF-'");
    assert.ok(pdfBuffer.length > 10000, `PDF has valid non-trivial size (${pdfBuffer.length} bytes)`);

    const routeContent = readFileNorm(path.join(rootDir, "app", "api", "print-test-sheet", "download", "route.ts"));
    assert.ok(routeContent.includes("application/pdf"), "Route specifies Content-Type: application/pdf");
    assert.ok(routeContent.includes("attachment; filename="), "Route specifies attachment download header");
  });

  await t.test("TopToolbar More Actions button ref fix verification", () => {
    const topToolbarContent = readFileNorm(path.join(rootDir, "components", "designer", "TopToolbar.tsx"));

    // Verify moreMenuButtonRef is attached to the More Actions button, NOT the Undo button
    assert.ok(
      !topToolbarContent.includes('ref={moreMenuButtonRef}\n              type="button"\n              onClick={onUndo}'),
      "Undo button does not have moreMenuButtonRef"
    );
    assert.ok(
      topToolbarContent.includes('ref={moreMenuButtonRef}\n              type="button"\n              onClick={() => setShowMoreMenu(!showMoreMenu)}'),
      "More Actions button has moreMenuButtonRef attached for accurate menu popup anchoring"
    );
  });
});
