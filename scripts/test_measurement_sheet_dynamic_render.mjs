import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MeasurementSheetTemplate dynamic rendering and layout synchronization", async (t) => {
  const templateSource = await readFile(
    new URL("../components/documents/MeasurementSheetTemplate.tsx", import.meta.url),
    "utf8"
  );

  await t.test("Requirement 1: MeasurementSheetTemplate imports and mounts DynamicDocumentRenderer", () => {
    assert.ok(
      templateSource.includes('import DynamicDocumentRenderer'),
      "MeasurementSheetTemplate must import DynamicDocumentRenderer"
    );
    assert.ok(
      templateSource.includes('<DynamicDocumentRenderer'),
      "MeasurementSheetTemplate must render <DynamicDocumentRenderer"
    );
    assert.ok(
      templateSource.includes('layout={activeLayout}'),
      "DynamicDocumentRenderer must receive activeLayout"
    );
    assert.ok(
      templateSource.includes('data={rendererData}'),
      "DynamicDocumentRenderer must receive rendererData"
    );
  });

  await t.test("Requirement 2: Uses usePersistedDocumentDesign and DesignLoadState", () => {
    assert.ok(
      templateSource.includes('usePersistedDocumentDesign(company?.id, "measurement_sheet")'),
      "Must use persisted document design for measurement_sheet"
    );
    assert.ok(
      templateSource.includes('<DesignLoadState error={design.error} retry={design.retry} />'),
      "Must display DesignLoadState while cloud design is loading"
    );
  });

  await t.test("Requirement 3: Live overrides for calculation type and VAT apply to activeLayout", () => {
    assert.ok(
      templateSource.includes('calcCol.visible = showCalculationType'),
      "Must update calc_type column visibility when showCalculationType is passed"
    );
    assert.ok(
      templateSource.includes('totalsElem.customText = showVat ? undefined : "vat_disabled"'),
      "Must update totalsElem.customText when showVat is passed"
    );
  });

  await t.test("Requirement 4: Preserves static layout fallback if layout is not available", () => {
    assert.ok(
      templateSource.includes('activeLayout ? ('),
      "Must check activeLayout before rendering dynamic vs fallback layout"
    );
    assert.ok(
      templateSource.includes('noPadding={Boolean(activeLayout)}'),
      "Must set noPadding={Boolean(activeLayout)} so DynamicDocumentRenderer has exact A4 padding"
    );
  });
});
