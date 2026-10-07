import {
  DimensionUnit,
  MeasurementRowCalculated,
  MeasurementRowInput,
  MeasurementSheetSummary,
  ResultUnit,
} from "./measurementTypes";
import {
  calculatePvcTankLiner,
  fmtFixed as pvcFmtFixed,
} from "./pvcTankLinerCalculations";

/**
 * Normalizes dimension input (mm, cm, m) into metres (m).
 * Conversions:
 * 1000 mm = 1 m
 * 100 cm = 1 m
 * 1 m = 1 m
 */
export function normalizeToMetres(val: number | string | null | undefined, unit: DimensionUnit): number {
  const num = Number(val) || 0;
  if (num <= 0) return 0;
  switch (unit) {
    case "mm":
      return num / 1000;
    case "cm":
      return num / 100;
    case "m":
    default:
      return num;
  }
}

/**
 * Formats a metric dimension into a 3-decimal string (e.g. "12.000 m" or "5.560 m")
 */
export function formatDimM(valInM: number): string {
  return `${(Number(valInM) || 0).toFixed(3)} m`;
}

/**
 * Formats a result value according to its result unit.
 * m: 3 decimal places (e.g. "280.320 m")
 * m²: 3 decimal places (e.g. "533.760 m²")
 * pcs: integer / 0 decimal places if whole, or up to 2 decimal places (e.g. "8 pcs")
 * m³: 3 decimal places (e.g. "12.500 m³")
 */
export function formatResultWithUnit(val: number, unit: ResultUnit): string {
  const n = Number(val) || 0;
  if (unit === "pcs") {
    return `${Number.isInteger(n) ? n.toString() : n.toFixed(2)} pcs`;
  }
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unit}`;
}

/**
 * Rounds a floating point number to N decimal places safely.
 */
export function roundToDecimals(val: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(val) || 0) * factor) / factor;
}

/**
 * Calculates a single measurement row with live explanation, dynamic formula, and costing.
 */
export function calculateMeasurementRow(input: MeasurementRowInput): MeasurementRowCalculated {
  const unit = input.dim_unit || "mm";
  const lengthM = normalizeToMetres(input.length_entered, unit);
  const widthM = normalizeToMetres(input.width_entered, unit);
  const isVarWidth = Boolean(input.is_variable_width);
  const width2M = isVarWidth ? normalizeToMetres(input.width2_entered, unit) : undefined;
  const avgWidthM = isVarWidth && width2M !== undefined ? (widthM + width2M) / 2 : widthM;
  const qty = Number(input.quantity) > 0 ? Number(input.quantity) : 1;
  const rate = Number(input.rate) || 0;

  let perPiece = 0;
  let total = 0;
  let resultUnit: ResultUnit = "m";
  let rateUnitLabel = "AED / m";
  let formulaDisplay = "";
  let formulaExpression = "";
  const explanationSteps: string[] = [];

  // Common explanation header
  const dimUnitText = unit === "mm" ? "mm" : unit === "cm" ? "cm" : "m";
  explanationSteps.push(
    `Entered Dimensions: Length = ${input.length_entered ?? 0} ${dimUnitText} (Normalized: ${lengthM.toFixed(3)} m)`
  );
  if (input.calc_type !== "linear" && input.calc_type !== "quantity_only") {
    if (isVarWidth && width2M !== undefined) {
      explanationSteps.push(
        `Variable Width: Width 1 = ${input.width_entered ?? 0} ${dimUnitText} (${widthM.toFixed(3)} m), Width 2 = ${input.width2_entered ?? 0} ${dimUnitText} (${width2M.toFixed(3)} m)`
      );
      explanationSteps.push(
        `Average Width = (${widthM.toFixed(3)} + ${width2M.toFixed(3)}) / 2 = ${avgWidthM.toFixed(3)} m (Trapezoidal / Average Width)`
      );
    } else {
      explanationSteps.push(
        `Entered Dimensions: Width = ${input.width_entered ?? 0} ${dimUnitText} (Normalized: ${widthM.toFixed(3)} m)`
      );
    }
  }

  switch (input.calc_type) {
    case "linear": {
      resultUnit = "m";
      rateUnitLabel = "AED / m";
      perPiece = lengthM;
      total = perPiece * qty;
      formulaDisplay = `Length × Quantity`;
      formulaExpression = `${lengthM.toFixed(3)} m × ${qty}`;

      explanationSteps.push(`Linear Length Method: Straight single length`);
      explanationSteps.push(`Per piece: ${lengthM.toFixed(3)} m`);
      explanationSteps.push(`Quantity: ${qty} pcs`);
      explanationSteps.push(`Calculation: ${lengthM.toFixed(3)} m × ${qty} = ${total.toFixed(3)} m`);
      break;
    }

    case "area": {
      resultUnit = "m²";
      rateUnitLabel = "AED / m²";
      perPiece = lengthM * avgWidthM;
      total = perPiece * qty;
      if (isVarWidth) {
        formulaDisplay = `Length × Average Width × Quantity`;
        formulaExpression = `${lengthM.toFixed(3)} m × ${avgWidthM.toFixed(3)} m × ${qty}`;
      } else {
        formulaDisplay = `Length × Width × Quantity`;
        formulaExpression = `${lengthM.toFixed(3)} m × ${widthM.toFixed(3)} m × ${qty}`;
      }

      explanationSteps.push(`Area Method (Square Metres): Surface measurement`);
      explanationSteps.push(
        `Per piece Area: ${lengthM.toFixed(3)} m × ${avgWidthM.toFixed(3)} m = ${perPiece.toFixed(3)} m²`
      );
      explanationSteps.push(`Quantity: ${qty} pcs`);
      explanationSteps.push(`Calculation: ${perPiece.toFixed(3)} m² × ${qty} = ${total.toFixed(3)} m²`);
      break;
    }

    case "perimeter": {
      resultUnit = "m";
      rateUnitLabel = "AED / m";
      if (isVarWidth && width2M !== undefined) {
        perPiece = 2 * lengthM + widthM + width2M;
        formulaDisplay = `(2 × Length + Width 1 + Width 2) × Quantity`;
        formulaExpression = `(2 × ${lengthM.toFixed(3)} + ${widthM.toFixed(3)} + ${width2M.toFixed(3)}) × ${qty}`;
      } else {
        perPiece = 2 * (lengthM + widthM);
        formulaDisplay = `2 × (Length + Width) × Quantity`;
        formulaExpression = `2 × (${lengthM.toFixed(3)} + ${widthM.toFixed(3)}) × ${qty}`;
      }
      total = perPiece * qty;

      explanationSteps.push(`Perimeter Method: Outer boundary measurement`);
      explanationSteps.push(`Per piece Perimeter: ${perPiece.toFixed(3)} m`);
      explanationSteps.push(`Quantity: ${qty} pcs`);
      explanationSteps.push(`Calculation: ${perPiece.toFixed(3)} m × ${qty} = ${total.toFixed(3)} m`);
      break;
    }

    case "pvc_edge_joint": {
      resultUnit = "m";
      rateUnitLabel = "AED / m";
      const lEdges = Number(input.pvc_length_edges ?? 2);
      const wEdges = Number(input.pvc_width_edges ?? 2);
      const cJoints = Number(input.pvc_centre_joints ?? 1);
      const totalLengthMultiplier = lEdges + cJoints; // e.g. 2 + 1 = 3

      perPiece = totalLengthMultiplier * lengthM + wEdges * avgWidthM;
      total = perPiece * qty;

      formulaDisplay = `((${lEdges}L + ${cJoints}CJ) + ${wEdges}W) × Qty  =>  (${totalLengthMultiplier}L + ${wEdges}W) × Qty`;
      formulaExpression = `((${totalLengthMultiplier} × ${lengthM.toFixed(3)}) + (${wEdges} × ${avgWidthM.toFixed(3)})) × ${qty}`;

      explanationSteps.push(
        `PVC Edge + Centre Joint Method (Linear Metres for Shade Welding & Edging):`
      );
      explanationSteps.push(
        `Configured Edges: ${lEdges} Length Edge(s) + ${cJoints} Centre Joint(s) = ${totalLengthMultiplier} Length runs; ${wEdges} Width Edge(s)`
      );
      explanationSteps.push(
        `Per Piece breakdown: (${totalLengthMultiplier} × ${lengthM.toFixed(3)} m) + (${wEdges} × ${avgWidthM.toFixed(3)} m) = ${(totalLengthMultiplier * lengthM).toFixed(3)} + ${(wEdges * avgWidthM).toFixed(3)} = ${perPiece.toFixed(3)} m`
      );
      explanationSteps.push(`Quantity: ${qty} pcs`);
      explanationSteps.push(`Total Linear Joint Length: ${perPiece.toFixed(3)} m × ${qty} = ${total.toFixed(3)} m`);
      break;
    }

    case "quantity_only": {
      resultUnit = "pcs";
      rateUnitLabel = "AED / pc";
      perPiece = 1;
      total = qty;
      formulaDisplay = `Count`;
      formulaExpression = `${qty} pcs`;

      explanationSteps.push(`Quantity Only: Item count`);
      explanationSteps.push(`Total Pieces: ${qty} pcs`);
      break;
    }

    case "pvc_tank_liner": {
      resultUnit = "m";
      rateUnitLabel = "AED / m (RM) or AED / m²";
      const pvcInputs = input.pvc_tank_liner_inputs || {};
      const pvcCalc = calculatePvcTankLiner(pvcInputs);
      const pvcResults = pvcCalc.results;
      perPiece = pvcResults.runningMeter ?? 0;
      total = perPiece * qty;
      formulaDisplay = `PVC Tank Liner: Ø${pvcFmtFixed(pvcInputs.tankDiameter || 0, 2)} x H${pvcFmtFixed(pvcInputs.tankHeight || 0, 2)} -> ${pvcFmtFixed(pvcResults.runningMeter ?? 0, 2)} RM`;
      formulaExpression = `PI x (${pvcInputs.tankDiameter} + ${pvcInputs.diameterAllowance}) x ${pvcResults.fullFabricWidths} = ${pvcFmtFixed(perPiece, 2)} RM`;
      explanationSteps.push(...pvcCalc.explanationSteps);
      // Store PVC results in custom_components for persistence
      break;
    }

    case "custom": {
      resultUnit = "m";
      rateUnitLabel = "AED / m";
      const components = input.custom_components || [
        { id: "1", name: "Length Runs", dimensionBasis: "length", multiplier: 2 },
        { id: "2", name: "Width Runs", dimensionBasis: "width", multiplier: 2 },
        { id: "3", name: "Extra Joint", dimensionBasis: "length", multiplier: 1 },
      ];

      let pieceSum = 0;
      const terms: string[] = [];
      const exprTerms: string[] = [];

      for (const comp of components) {
        const mult = Number(comp.multiplier) || 0;
        let dimM = 0;
        let dimLabel = "";

        if (comp.dimensionBasis === "length") {
          dimM = lengthM;
          dimLabel = "Length";
        } else if (comp.dimensionBasis === "width") {
          dimM = avgWidthM;
          dimLabel = "Width";
        } else {
          dimM = normalizeToMetres(comp.customDimValue, comp.customDimUnit || "mm");
          dimLabel = comp.name || "Custom Dim";
        }

        const compTotal = mult * dimM;
        pieceSum += compTotal;
        terms.push(`${mult} × ${dimLabel}`);
        exprTerms.push(`(${mult} × ${dimM.toFixed(3)}m)`);
      }

      perPiece = pieceSum;
      total = perPiece * qty;
      formulaDisplay = `(${terms.join(" + ")}) × Qty`;
      formulaExpression = `(${exprTerms.join(" + ")}) × ${qty}`;

      explanationSteps.push(`Custom Safe Component Formula:`);
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        explanationSteps.push(`- Component ${i + 1} (${comp.name}): ${comp.multiplier} × dimension = ${exprTerms[i]}`);
      }
      explanationSteps.push(`Per piece total: ${perPiece.toFixed(3)} m`);
      explanationSteps.push(`Quantity: ${qty} pcs`);
      explanationSteps.push(`Calculation: ${perPiece.toFixed(3)} m × ${qty} = ${total.toFixed(3)} m`);
      break;
    }
  }

  // Store PVC tank liner results in custom_components for persistence
  let customComponents = input.custom_components;
  if (input.calc_type === "pvc_tank_liner" && input.pvc_tank_liner_inputs) {
    const pvcInputs = input.pvc_tank_liner_inputs;
    const pvcCalc = calculatePvcTankLiner(pvcInputs);
    customComponents = [
      ...(customComponents || []),
      {
        id: "pvc_tank_liner_results",
        name: "PVC Tank Liner Results",
        dimensionBasis: "custom_dim",
        multiplier: 1,
        customDimValue: pvcCalc.results.runningMeter ?? 0,
        customDimUnit: "m",
      },
    ];
  }

  // Rounded results for precision
  const roundedPerPiece = roundToDecimals(perPiece, 3);
  const roundedTotal = roundToDecimals(total, 3);
  const totalCost = roundToDecimals(roundedTotal * rate, 2);

  if (rate > 0) {
    explanationSteps.push(
      `Costing: Rate = AED ${rate.toFixed(2)} / ${resultUnit}; Amount = ${roundedTotal.toFixed(3)} × ${rate.toFixed(2)} = AED ${totalCost.toFixed(2)}`
    );
  }

  return {
    ...input,
    length_m: roundToDecimals(lengthM, 3),
    width_m: roundToDecimals(widthM, 3),
    width2_m: width2M !== undefined ? roundToDecimals(width2M, 3) : undefined,
    average_width_m: roundToDecimals(avgWidthM, 3),
    formula_expression: formulaExpression,
    formula_display: formulaDisplay,
    per_piece_result: roundedPerPiece,
    calculated_total: roundedTotal,
    result_unit: resultUnit,
    rate_unit_label: rateUnitLabel,
    total_cost: totalCost,
    explanation_steps: explanationSteps,
    custom_components: customComponents,
  };
}

/**
 * Calculates project summary across all rows.
 * Enforces strict unit safety: NEVER mixes m with m² or pcs.
 * Produces separate totals for Linear Metres, Square Metres, Pieces, and Cost.
 */
export function calculateSheetSummary(
  rows: MeasurementRowCalculated[],
  vatRate: number = 0
): MeasurementSheetSummary {
  let totalPieces = 0;
  let totalLinearM = 0;
  let totalAreaM2 = 0;
  let totalQuantityOnlyPcs = 0;
  let totalVolumeM3 = 0;
  let totalCostAED = 0;

  const unitMap: Record<ResultUnit, { total: number; rowCount: number }> = {
    m: { total: 0, rowCount: 0 },
    "m²": { total: 0, rowCount: 0 },
    pcs: { total: 0, rowCount: 0 },
    "m³": { total: 0, rowCount: 0 },
  };

  const areaSummary: MeasurementSheetSummary["areaSummary"] = [];

  for (const row of rows) {
    const qty = Number(row.quantity) || 0;
    const calcTotal = Number(row.calculated_total) || 0;
    const cost = Number(row.total_cost) || 0;

    totalPieces += qty;
    totalCostAED += cost;

    if (row.result_unit === "m") {
      totalLinearM += calcTotal;
      unitMap.m.total += calcTotal;
      unitMap.m.rowCount += 1;
    } else if (row.result_unit === "m²") {
      totalAreaM2 += calcTotal;
      unitMap["m²"].total += calcTotal;
      unitMap["m²"].rowCount += 1;
    } else if (row.result_unit === "pcs") {
      totalQuantityOnlyPcs += calcTotal;
      unitMap.pcs.total += calcTotal;
      unitMap.pcs.rowCount += 1;
    } else if (row.result_unit === "m³") {
      totalVolumeM3 += calcTotal;
      unitMap["m³"].total += calcTotal;
      unitMap["m³"].rowCount += 1;
    }

    areaSummary.push({
      area_name: row.area_name || "Unnamed Area",
      quantity: qty,
      calculated_total: calcTotal,
      result_unit: row.result_unit,
      calc_type: row.calc_type,
      total_cost: cost,
    });
  }

  const activeUnits = Object.keys(unitMap).filter(
    (u) => unitMap[u as ResultUnit].rowCount > 0
  ) as ResultUnit[];

  const hasMixedUnits = activeUnits.length > 1;

  const unitLabels: Record<ResultUnit, string> = {
    m: "Linear Metres",
    "m²": "Square Metres",
    pcs: "Pieces",
    "m³": "Cubic Metres (Volume)",
  };

  const unitBreakdown = activeUnits.map((u) => ({
    unit: u,
    label: unitLabels[u],
    total: roundToDecimals(unitMap[u].total, 3),
    rowCount: unitMap[u].rowCount,
  }));

    const totalCost = roundToDecimals(totalCostAED, 2);
    const vatAmount = vatRate > 0 ? roundToDecimals((totalCost * vatRate) / 100, 2) : 0;
    const grandTotal = roundToDecimals(totalCost + vatAmount, 2);

    return {
      totalPieces: Math.round(totalPieces),
      totalLinearM: roundToDecimals(totalLinearM, 3),
      totalAreaM2: roundToDecimals(totalAreaM2, 3),
      totalQuantityOnlyPcs: Math.round(totalQuantityOnlyPcs),
      totalVolumeM3: roundToDecimals(totalVolumeM3, 3),
      totalCostAED: totalCost,
      vatRate: vatRate > 0 ? vatRate : undefined,
      vatAmountAED: vatRate > 0 ? vatAmount : undefined,
      grandTotalWithVatAED: vatRate > 0 ? grandTotal : undefined,
      hasMixedUnits,
      unitBreakdown,
      areaSummary,
    };
  }

/**
 * Standard Parking Shade Real Test Project Preset
 * Exactly matches the user's test project:
 * Area 1: 12000 mm × 5360 mm, Qty: 6  -> 280.320 m
 * Area 2: 12000 mm × 5520 mm, Qty: 8  -> 376.320 m
 * Area 3: 12000 mm × 5560 mm, Qty: 8  -> 376.960 m
 * Area 4: 12000 mm × 5560 mm, Qty: 8  -> 376.960 m
 * GRAND TOTAL: 1,410.560 m
 */
export const REAL_PROJECT_PARKING_SHADE_TEST_ROWS: MeasurementRowInput[] = [
  {
    area_name: "Area 1",
    description: "PVC Parking Shade Fabric & Centre Joint",
    calc_type: "pvc_edge_joint",
    dim_unit: "mm",
    length_entered: 12000,
    width_entered: 5360,
    quantity: 6,
    pvc_length_edges: 2,
    pvc_width_edges: 2,
    pvc_centre_joints: 1,
    rate: 5.0,
    notes: "Parking Bay 1-6 standard cantilever shade",
  },
  {
    area_name: "Area 2",
    description: "PVC Parking Shade Fabric & Centre Joint",
    calc_type: "pvc_edge_joint",
    dim_unit: "mm",
    length_entered: 12000,
    width_entered: 5520,
    quantity: 8,
    pvc_length_edges: 2,
    pvc_width_edges: 2,
    pvc_centre_joints: 1,
    rate: 5.0,
    notes: "Parking Bay 7-14 standard cantilever shade",
  },
  {
    area_name: "Area 3",
    description: "PVC Parking Shade Fabric & Centre Joint",
    calc_type: "pvc_edge_joint",
    dim_unit: "mm",
    length_entered: 12000,
    width_entered: 5560,
    quantity: 8,
    pvc_length_edges: 2,
    pvc_width_edges: 2,
    pvc_centre_joints: 1,
    rate: 5.0,
    notes: "Parking Bay 15-22 standard cantilever shade",
  },
  {
    area_name: "Area 4",
    description: "PVC Parking Shade Fabric & Centre Joint",
    calc_type: "pvc_edge_joint",
    dim_unit: "mm",
    length_entered: 12000,
    width_entered: 5560,
    quantity: 8,
    pvc_length_edges: 2,
    pvc_width_edges: 2,
    pvc_centre_joints: 1,
    rate: 5.0,
    notes: "Parking Bay 23-30 standard cantilever shade",
  },
];
