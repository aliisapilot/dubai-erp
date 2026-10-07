import type { PvcTankLinerInputs, PvcTankLinerResults } from "./measurementTypes";

export interface PvcTankLinerCalculation {
  inputs: PvcTankLinerInputs;
  results: PvcTankLinerResults;
  explanationSteps: string[];
}

export function calculatePvcTankLiner(inputs: PvcTankLinerInputs): PvcTankLinerCalculation {
  const {
    tankDiameter = 0,
    tankHeight = 0,
    diameterAllowance = 0.20,
    heightAllowance = 0.60,
    fabricWidth = 3.00,
    weldingSizeMm = 40,
    numberOfSeams = 3,
    costingMethod = "rm",
    ratePerRm = 0,
    ratePerM2 = 0,
    fabricationCost = 0,
    otherCost = 0,
    markupPercent = 0,
  } = inputs;

  const steps: string[] = [];

  const linerDiameter = tankDiameter + diameterAllowance;
  steps.push(`Liner Diameter = ${tankDiameter.toFixed(3)} + ${diameterAllowance.toFixed(2)} = ${linerDiameter.toFixed(3)} m`);

  const linerHeight = tankHeight + heightAllowance;
  steps.push(`Liner Height = ${tankHeight.toFixed(3)} + ${heightAllowance.toFixed(2)} = ${linerHeight.toFixed(3)} m`);

  const developedLength = Math.PI * linerDiameter;
  steps.push(`Developed Length = PI x ${linerDiameter.toFixed(3)} = ${developedLength.toFixed(4)} m`);

  const weldingSizeM = weldingSizeMm / 1000;
  const totalWeldingAllowance = numberOfSeams * weldingSizeM;
  steps.push(`Welding: ${weldingSizeMm} mm = ${weldingSizeM.toFixed(3)} m x ${numberOfSeams} seams = ${totalWeldingAllowance.toFixed(3)} m`);

  const requiredFabricWidth = linerHeight + totalWeldingAllowance;
  steps.push(`Required Width = ${linerHeight.toFixed(3)} + ${totalWeldingAllowance.toFixed(3)} = ${requiredFabricWidth.toFixed(3)} m`);

  const fullFabricWidths = Math.ceil(requiredFabricWidth / fabricWidth);
  steps.push(`Full Widths = CEILING(${requiredFabricWidth.toFixed(3)} / ${fabricWidth.toFixed(2)}) = ${fullFabricWidths}`);

  const grossFabricWidth = fullFabricWidths * fabricWidth;
  steps.push(`Gross Width = ${fullFabricWidths} x ${fabricWidth.toFixed(2)} = ${grossFabricWidth.toFixed(3)} m`);

  const unusedWastageWidth = grossFabricWidth - requiredFabricWidth;
  steps.push(`Wastage = ${grossFabricWidth.toFixed(3)} - ${requiredFabricWidth.toFixed(3)} = ${unusedWastageWidth.toFixed(3)} m (retained)`);

  const runningMeter = developedLength * fullFabricWidths;
  steps.push(`Running Meter = ${developedLength.toFixed(4)} x ${fullFabricWidths} = ${runningMeter.toFixed(4)} RM`);

  const squareMeter = runningMeter * fabricWidth;
  steps.push(`Square Meter = ${runningMeter.toFixed(4)} x ${fabricWidth.toFixed(2)} = ${squareMeter.toFixed(4)} m2`);

  let materialCost = 0;
  if (costingMethod === "rm") {
    materialCost = runningMeter * ratePerRm;
    steps.push(`Material Cost (RM) = ${runningMeter.toFixed(4)} x ${ratePerRm.toFixed(2)} = ${materialCost.toFixed(2)} AED`);
  } else {
    materialCost = squareMeter * ratePerM2;
    steps.push(`Material Cost (M2) = ${squareMeter.toFixed(4)} x ${ratePerM2.toFixed(2)} = ${materialCost.toFixed(2)} AED`);
  }

  const subtotal = materialCost + fabricationCost + otherCost;
  const markup = subtotal * (markupPercent / 100);
  const sellingPrice = subtotal + markup;
  steps.push(`Subtotal = ${materialCost.toFixed(2)} + ${fabricationCost.toFixed(2)} + ${otherCost.toFixed(2)} = ${subtotal.toFixed(2)} AED`);
  if (markupPercent > 0) steps.push(`Markup ${markupPercent}% = ${markup.toFixed(2)} AED`);
  steps.push(`Selling Price = ${sellingPrice.toFixed(2)} AED`);

  const results: PvcTankLinerResults = {
    linerDiameter: parseFloat(linerDiameter.toFixed(3)),
    linerHeight: parseFloat(linerHeight.toFixed(3)),
    developedLength: parseFloat(developedLength.toFixed(3)),
    weldingSizeM: parseFloat(weldingSizeM.toFixed(3)),
    totalWeldingAllowance: parseFloat(totalWeldingAllowance.toFixed(3)),
    requiredFabricWidth: parseFloat(requiredFabricWidth.toFixed(3)),
    fullFabricWidths,
    grossFabricWidth: parseFloat(grossFabricWidth.toFixed(3)),
    unusedWastageWidth: parseFloat(unusedWastageWidth.toFixed(3)),
    runningMeter: parseFloat(runningMeter.toFixed(2)),
    squareMeter: parseFloat(squareMeter.toFixed(2)),
    materialCost: parseFloat(materialCost.toFixed(2)),
    sellingPrice: parseFloat(sellingPrice.toFixed(2)),
  };

  return { inputs, results, explanationSteps: steps };
}

export function fmtFixed(val: number, decimals: number): string {
  return Number(val).toFixed(decimals);
}

export function buildPvcTankLinerDescription(inputs: PvcTankLinerInputs, results: PvcTankLinerResults): string {
  const lines: string[] = [];
  lines.push("PVC TANK LINER");
  if (inputs.tankDiameter != null && inputs.tankHeight != null) {
    lines.push(`Tank Size: O ${fmtFixed(inputs.tankDiameter, 2)} M x H${fmtFixed(inputs.tankHeight, 2)} M`);
  }
  if (results.linerDiameter != null && results.linerHeight != null) {
    lines.push(`Liner Size: O ${fmtFixed(results.linerDiameter, 2)} M x H${fmtFixed(results.linerHeight, 2)} M`);
  }
  if (inputs.fabricWidth != null) {
    lines.push(`Fabric Width: ${fmtFixed(inputs.fabricWidth, 2)} M`);
  }
  if (inputs.weldingSizeMm != null) {
    lines.push(`Welding Size on Seam: ${inputs.weldingSizeMm} MM`);
  }
  if (inputs.eyeletSizeMm != null) {
    lines.push(`Eyelet Size: O ${inputs.eyeletSizeMm} MM`);
  }
  if (results.runningMeter != null && results.squareMeter != null) {
    lines.push("Material Requirement:");
    lines.push(`${fmtFixed(results.runningMeter, 2)} RM / ${fmtFixed(results.squareMeter, 2)} M2`);
  }
  lines.push("Supply & Fabrication as per approved drawing.");
  lines.push("Qty: 1 No.");
  return lines.join("\n");
}

export function formatPvcTankLinerResult(results: PvcTankLinerResults): string {
  const rm = results.runningMeter ?? 0;
  const sq = results.squareMeter ?? 0;
  return `${fmtFixed(rm, 2)} RM / ${fmtFixed(sq, 2)} M2`;
}


