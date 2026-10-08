import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const calculationSource = await readFile(new URL("../lib/measurementCalculations.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(calculationSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { calculatePvcTankLiner, calculateMeasurementRow } = await import(moduleUrl);

const measurementsPage = await readFile(new URL("../app/measurements/page.tsx", import.meta.url), "utf8");
const numericInput = await readFile(new URL("../components/NumericInput.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261008010000_pvc_tank_liner_measurements.sql", import.meta.url), "utf8");

const input = {
  tankDiameter: 7.19,
  tankHeight: 6.05,
  fabricWidth: 3,
  weldingSizeMm: 40,
  numberOfSeams: 3,
  diameterAllowance: 0.2,
  heightAllowance: 0.6,
  eyeletSizeMm: 14,
  costingMethod: "rm",
  ratePerRm: 10,
  ratePerM2: 999,
  fabricationCost: 100,
  otherCost: 50,
  markupPercent: 10,
  showMaterialRequirementOnQuotation: true,
};

test("PVC tank liner verification example respects fixed-width roll material", () => {
  const result = calculatePvcTankLiner(input);
  assert.ok(Math.abs(result.linerDiameter - 7.39) < 1e-12);
  assert.ok(Math.abs(result.linerHeight - 6.65) < 1e-12);
  assert.ok(Math.abs(result.developedLength - 23.216369710028568) < 1e-12);
  assert.equal(result.totalWeldingAllowance, 0.12);
  assert.ok(Math.abs(result.requiredFabricWidth - 6.77) < 1e-12);
  assert.equal(result.fullFabricWidths, 3);
  assert.equal(result.grossFabricWidth, 9);
  assert.ok(Math.abs(result.wastageWidth - 2.23) < 1e-12);
  assert.equal(result.runningMeter.toFixed(2), "69.65");
  assert.equal(result.squareMeter.toFixed(2), "208.95");
});

test("costing uses only the selected RM or square-metre method", () => {
  const rm = calculatePvcTankLiner(input);
  assert.equal(rm.materialCost, rm.runningMeter * input.ratePerRm);
  const m2 = calculatePvcTankLiner({ ...input, costingMethod: "m2" });
  assert.equal(m2.materialCost, m2.squareMeter * input.ratePerM2);
  assert.notEqual(rm.materialCost, m2.materialCost);
});

test("measurement row keeps RM primary and stores structured liner results", () => {
  const row = calculateMeasurementRow({
    area_name: "Tank 1",
    description: "PVC TANK LINER",
    calc_type: "pvc_tank_liner",
    dim_unit: "m",
    length_entered: 0,
    width_entered: 0,
    quantity: 1,
    pvc_length_edges: 0,
    pvc_width_edges: 0,
    pvc_centre_joints: 0,
    tank_liner_data: input,
    rate: 0,
  });
  assert.equal(row.result_unit, "RM");
  assert.equal(row.calculated_total.toFixed(2), "69.65");
  assert.equal(row.tank_liner_result.squareMeter.toFixed(2), "208.95");
});

test("quotation and persistence integrations retain welding and liner specifications", () => {
  assert.match(measurementsPage, /Welding Size on Seam: \$\{liner\.weldingSizeMm\.toFixed\(0\)\} MM/);
  assert.match(measurementsPage, /quantity: 1,[\s\S]*?unit: "No\."/);
  assert.match(measurementsPage, /Material Requirement: \$\{liner\.runningMeter\.toFixed\(2\)\} RM/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS tank_liner_data jsonb/);
  assert.match(migration, /r\.tank_liner_data/);
});

test("numeric inputs remain text-based and accept decimal typing without wheel stepping", () => {
  assert.match(numericInput, /type="text"/);
  assert.match(numericInput, /inputMode=\{isInteger \? "numeric" : "decimal"\}/);
  assert.match(numericInput, /sanitized === "\."/);
  assert.doesNotMatch(numericInput, /type="number"/);
});
