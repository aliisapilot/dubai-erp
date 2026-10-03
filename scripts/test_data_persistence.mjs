import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Transpile and load measurementTypes and measurementCalculations
function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  new Function('exports', 'require', js)(exports, require);
  return exports;
}

const {
  normalizeToMetres,
  calculateMeasurementRow,
  calculateSheetSummary,
  REAL_PROJECT_PARKING_SHADE_TEST_ROWS
} = loadTs('lib/measurementCalculations.ts');

console.log('--- 1. Testing Automatic Unit Conversions ---');
assert.equal(normalizeToMetres(12000, 'mm'), 12.0);
assert.equal(normalizeToMetres(5560, 'mm'), 5.56);
assert.equal(normalizeToMetres(1200, 'cm'), 12.0);
assert.equal(normalizeToMetres(556, 'cm'), 5.56);
assert.equal(normalizeToMetres(12, 'm'), 12.0);
console.log('? Unit conversions normalize correctly (1000mm = 1m, 100cm = 1m)');

console.log('--- 2. Testing Linear Length (m) ---');
const linearRow = calculateMeasurementRow({
  area_name: 'Test Pipe',
  description: 'Fabrication Steel Tube',
  calc_type: 'linear',
  dim_unit: 'mm',
  length_entered: 12000,
  width_entered: 0,
  quantity: 8,
  pvc_length_edges: 0,
  pvc_width_edges: 0,
  pvc_centre_joints: 0,
  rate: 10
});
assert.equal(linearRow.calculated_total, 96.0);
assert.equal(linearRow.result_unit, 'm');
assert.equal(linearRow.total_cost, 960.0);
console.log('? Linear Length calculates Length × Quantity = 96.000 m');

console.log('--- 3. Testing Area / Square Metre (m²) ---');
const areaRow = calculateMeasurementRow({
  area_name: 'Fabric Roof',
  description: 'Canopy Cover',
  calc_type: 'area',
  dim_unit: 'mm',
  length_entered: 12000,
  width_entered: 5560,
  quantity: 8,
  pvc_length_edges: 0,
  pvc_width_edges: 0,
  pvc_centre_joints: 0,
  rate: 25
});
assert.equal(areaRow.calculated_total, 533.76);
assert.equal(areaRow.result_unit, 'm²');
assert.equal(areaRow.total_cost, 13344.0);
console.log('? Area calculates 12 × 5.56 × 8 = 533.760 m²');

console.log('--- 4. Testing Perimeter (m) ---');
const perimRow = calculateMeasurementRow({
  area_name: 'Boundary',
  description: 'Edge Trim',
  calc_type: 'perimeter',
  dim_unit: 'm',
  length_entered: 12,
  width_entered: 5.56,
  quantity: 8,
  pvc_length_edges: 0,
  pvc_width_edges: 0,
  pvc_centre_joints: 0,
  rate: 0
});
assert.equal(perimRow.calculated_total, 280.96);
assert.equal(perimRow.result_unit, 'm');
console.log('? Perimeter calculates 2 × (12 + 5.56) × 8 = 280.960 m');

console.log('--- 5. Testing Real Project PVC Edge + Centre Joint Test Cases ---');
const realCalculated = REAL_PROJECT_PARKING_SHADE_TEST_ROWS.map(calculateMeasurementRow);

// Area 1
console.log(`Area 1: ${realCalculated[0].calculated_total.toFixed(3)} m (expected: 280.320 m)`);
assert.equal(realCalculated[0].calculated_total, 280.32);
assert.equal(realCalculated[0].result_unit, 'm');

// Area 2
console.log(`Area 2: ${realCalculated[1].calculated_total.toFixed(3)} m (expected: 376.320 m)`);
assert.equal(realCalculated[1].calculated_total, 376.32);
assert.equal(realCalculated[1].result_unit, 'm');

// Area 3
console.log(`Area 3: ${realCalculated[2].calculated_total.toFixed(3)} m (expected: 376.960 m)`);
assert.equal(realCalculated[2].calculated_total, 376.96);
assert.equal(realCalculated[2].result_unit, 'm');

// Area 4
console.log(`Area 4: ${realCalculated[3].calculated_total.toFixed(3)} m (expected: 376.960 m)`);
assert.equal(realCalculated[3].calculated_total, 376.96);
assert.equal(realCalculated[3].result_unit, 'm');

// Grand Total
const summary = calculateSheetSummary(realCalculated);
console.log(`GRAND TOTAL LINEAR METRES: ${summary.totalLinearM.toFixed(3)} m (expected: 1410.560 m)`);
console.log(`TOTAL PIECES: ${summary.totalPieces} pcs (expected: 30 pcs)`);
console.log(`TOTAL COST: AED ${summary.totalCostAED.toFixed(2)} (expected: AED 7,052.80)`);

assert.equal(summary.totalLinearM, 1410.56);
assert.equal(summary.totalPieces, 30);
assert.equal(summary.totalAreaM2, 0); // Must NOT be m²
assert.equal(summary.totalCostAED, 7052.80);
console.log('? EXACT 1,410.560 m REPRODUCED SUCCESSFULLY!');

console.log('--- 6. Testing Configurable PVC Joints ---');
const configJointRow = calculateMeasurementRow({
  area_name: 'Double Joint Bay',
  description: 'Special Canopy',
  calc_type: 'pvc_edge_joint',
  dim_unit: 'm',
  length_entered: 10,
  width_entered: 5,
  quantity: 1,
  pvc_length_edges: 2,
  pvc_width_edges: 2,
  pvc_centre_joints: 2, // 2 length + 2 centre joints = 4L
  rate: 0
});
// 4L + 2W = 4*10 + 2*5 = 40 + 10 = 50 m
assert.equal(configJointRow.calculated_total, 50.0);
console.log('? Configurable PVC joints calculate correctly (4L + 2W = 50.000 m)');

console.log('--- 7. Testing Variable Width (Trapezoid) ---');
const varWidthArea = calculateMeasurementRow({
  area_name: 'Tapered Bay',
  description: 'Trapezoidal Section',
  calc_type: 'area',
  dim_unit: 'm',
  length_entered: 10,
  width_entered: 4,
  width2_entered: 6,
  is_variable_width: true,
  quantity: 2,
  pvc_length_edges: 0,
  pvc_width_edges: 0,
  pvc_centre_joints: 0,
  rate: 20
});
// avg width = (4 + 6) / 2 = 5m. Area = 10 * 5 * 2 = 100 m²
assert.equal(varWidthArea.calculated_total, 100.0);
assert.equal(varWidthArea.result_unit, 'm²');
console.log('? Variable width calculates trapezoidal average width correctly (100.000 m²)');

console.log('--- 8. Testing Unit Safety (No mixing m with m²) ---');
const mixedRows = [
  realCalculated[0], // 280.320 m
  areaRow            // 533.760 m²
];
const mixedSummary = calculateSheetSummary(mixedRows);
assert.equal(mixedSummary.hasMixedUnits, true);
assert.equal(mixedSummary.totalLinearM, 280.32);
assert.equal(mixedSummary.totalAreaM2, 533.76);
// Unit breakdown has separate entries
assert.equal(mixedSummary.unitBreakdown.length, 2);
console.log('? Unit safety enforced: Linear (280.320 m) and Area (533.760 m²) kept separate');

console.log('--- 9. Testing Database Migration with PGlite ---');
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite();

// Mock base Supabase schema
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
  CREATE TABLE public.companies(id uuid PRIMARY KEY, owner_id uuid);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY, company_id uuid, active boolean);
  CREATE TABLE public.customers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.projects(id uuid PRIMARY KEY, name text);
`);

const migrationSql = fs.readFileSync('supabase/migrations/20261004000000_measurement_estimation.sql', 'utf8');
await db.exec(migrationSql);

// Test inserting into measurement_projects and measurement_items
const compId = '10000000-0000-0000-0000-000000000001';
await db.query(`
  INSERT INTO public.measurement_projects (id, company_id, sheet_number, title, status)
  VALUES ('20000000-0000-0000-0000-000000000001', '${compId}', 'MS-2026-0001', 'Parking Shade PVC', 'draft')
`);

for (const row of realCalculated) {
  await db.query(`
    INSERT INTO public.measurement_items (
      sheet_id, company_id, area_name, description, calc_type, dim_unit,
      length_entered, width_entered, length_m, width_m, quantity,
      pvc_length_edges, pvc_width_edges, pvc_centre_joints,
      per_piece_result, calculated_total, result_unit, rate, total_cost
    ) VALUES (
      '20000000-0000-0000-0000-000000000001', '${compId}', $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15, $16, $17
    )
  `, [
    row.area_name, row.description, row.calc_type, row.dim_unit,
    row.length_entered, row.width_entered, row.length_m, row.width_m, row.quantity,
    row.pvc_length_edges, row.pvc_width_edges, row.pvc_centre_joints,
    row.per_piece_result, row.calculated_total, row.result_unit, row.rate, row.total_cost
  ]);
}

const dbSumRes = await db.query(`
  SELECT sum(calculated_total) as grand_linear, sum(quantity) as grand_qty, sum(total_cost) as grand_cost
  FROM public.measurement_items
  WHERE sheet_id = '20000000-0000-0000-0000-000000000001'
`);

assert.equal(Number(dbSumRes.rows[0].grand_linear), 1410.56);
assert.equal(Number(dbSumRes.rows[0].grand_qty), 30);
console.log('--- 10. Testing Rate Calculation (58 AED/m -> AED 16,258.56) ---');
const area1At58 = calculateMeasurementRow({
  ...REAL_PROJECT_PARKING_SHADE_TEST_ROWS[0], // Area 1: 280.320 m
  rate: 58
});
assert.equal(area1At58.calculated_total, 280.32);
assert.equal(area1At58.rate, 58);
assert.equal(area1At58.total_cost, 16258.56);
console.log(`? 280.320 m × AED 58/m = AED ${area1At58.total_cost.toFixed(2)} (Expected: AED 16,258.56)`);

// Decimal rate 58.50
const area1At58_5 = calculateMeasurementRow({
  ...REAL_PROJECT_PARKING_SHADE_TEST_ROWS[0],
  rate: 58.50
});
assert.equal(area1At58_5.total_cost, 16398.72);
console.log(`? Decimal rate 58.50: 280.320 m × AED 58.50/m = AED ${area1At58_5.total_cost.toFixed(2)}`);

console.log('\nALL 10 MEASUREMENT CALCULATION & DATABASE TESTS PASSED!');


