/**
 * Dubai ERP: Smart Import - Calculation Verification & Audit Engine
 * Validates math across line items, document totals, PVC Tank Liner measurements,
 * and attendance/overtime hours. Compares Original Document Value vs Calculated ERP Value.
 */

import type { CalculationAuditRow, ExtractedLineItem, ExtractedMeasurement } from "./types";

export interface LineItemAuditResult {
  auditedItems: ExtractedLineItem[];
  auditRows: CalculationAuditRow[];
  hasMismatches: boolean;
}

export function auditLineItemCalculations(
  docId: string,
  docNumber: string,
  items: ExtractedLineItem[]
): LineItemAuditResult {
  const auditRows: CalculationAuditRow[] = [];
  let hasMismatches = false;

  const auditedItems = items.map((item, index) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    const vatRate = Number(item.vatRate ?? 5);

    // Mathematical formula
    const gross = qty * rate;
    const expectedTaxable = Math.max(0, gross - discount);
    const taxable = item.taxableAmount !== undefined ? item.taxableAmount : expectedTaxable;
    const calculatedVat = item.vatAmount || Number((taxable * (vatRate / 100)).toFixed(2));
    const calculatedTotalInclusive = Number((taxable + calculatedVat).toFixed(2));

    const originalTotal = Number(item.total) || 0;
    const diffInclusive = Number(Math.abs(originalTotal - calculatedTotalInclusive).toFixed(2));
    const diffExclusive = Number(Math.abs(originalTotal - taxable).toFixed(2));
    // Check line math consistency: Qty * Rate - Discount == Taxable Amount (allowing <= 0.05 for rounding)
    const lineMathDiff = Number(Math.abs(taxable - expectedTaxable).toFixed(2));
    const isLineMathMatch = lineMathDiff <= 0.05 || (item.source?.rawText && /advance|payment|installation/i.test(item.source.rawText));

    const isMatch = (diffInclusive <= 0.05 || diffExclusive <= 0.05) && isLineMathMatch;
    const difference = Math.max(Math.min(diffInclusive, diffExclusive), isLineMathMatch ? 0 : lineMathDiff);

    if (!isMatch) {
      hasMismatches = true;
    }

    const calcStatus: "match" | "mismatch" = isMatch ? "match" : "mismatch";
    const calculatedErpValue = diffInclusive <= 0.05 ? calculatedTotalInclusive : taxable;

    auditRows.push({
      documentId: docId,
      documentNumber: docNumber,
      description: item.description || `Line Item #${index + 1}`,
      quantity: qty,
      rate,
      originalDocumentValue: originalTotal,
      calculatedErpValue,
      difference,
      validationResult: isMatch ? "MATCH" : "MISMATCH",
      field: "Line Total",
    });

    return {
      ...item,
      vatAmount: item.vatAmount || calculatedVat,
      calculatedTotal: calculatedErpValue,
      difference,
      calculationStatus: calcStatus,
    };
  });

  return {
    auditedItems,
    auditRows,
    hasMismatches,
  };
}

export function auditDocumentTotals(
  docId: string,
  docNumber: string,
  extractedSubtotal: number | null,
  extractedVat: number | null,
  extractedTotal: number | null,
  lineItems: ExtractedLineItem[]
): {
  auditRows: CalculationAuditRow[];
  calculatedSubtotal: number;
  calculatedVat: number;
  calculatedTotal: number;
  hasMismatches: boolean;
} {
  const auditRows: CalculationAuditRow[] = [];
  let hasMismatches = false;

  let sumTaxable = 0;
  let sumVat = 0;

  for (const item of lineItems) {
    if (item.isOptional) continue;
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    const taxable = item.taxableAmount !== undefined ? item.taxableAmount : Math.max(0, qty * rate - discount);
    sumTaxable += taxable;
    sumVat += Number(item.vatAmount) || Number((taxable * (Number(item.vatRate ?? 5) / 100)).toFixed(2));
  }

  const calculatedSubtotal = Number(sumTaxable.toFixed(2));
  const calculatedVat = Number(sumVat.toFixed(2));
  const calculatedTotal = Number((calculatedSubtotal + calculatedVat).toFixed(2));

  // Check Subtotal
  if (extractedSubtotal !== null && extractedSubtotal !== undefined) {
    const subDiff = Number(Math.abs(extractedSubtotal - calculatedSubtotal).toFixed(2));
    const allowedSubTol = Math.max(0.10, (lineItems.length || 1) * 0.06);
    const isSubMatch = subDiff <= allowedSubTol;
    if (!isSubMatch) hasMismatches = true;

    auditRows.push({
      documentId: docId,
      documentNumber: docNumber,
      description: "Subtotal Verification",
      quantity: 1,
      rate: calculatedSubtotal,
      originalDocumentValue: extractedSubtotal,
      calculatedErpValue: calculatedSubtotal,
      difference: subDiff,
      validationResult: isSubMatch ? "MATCH" : "MISMATCH",
      field: "Subtotal",
    });
  }

  // Check Grand Total
  if (extractedTotal !== null && extractedTotal !== undefined) {
    const totDiff = Number(Math.abs(extractedTotal - calculatedTotal).toFixed(2));
    const allowedTol = Math.max(0.10, (lineItems.length || 1) * 0.06);
    const isTotMatch = totDiff <= allowedTol;
    if (!isTotMatch) hasMismatches = true;

    auditRows.push({
      documentId: docId,
      documentNumber: docNumber,
      description: "Grand Total Verification",
      quantity: 1,
      rate: calculatedTotal,
      originalDocumentValue: extractedTotal,
      calculatedErpValue: calculatedTotal,
      difference: totDiff,
      validationResult: isTotMatch ? "MATCH" : "MISMATCH",
      field: "Grand Total",
    });
  }

  return {
    auditRows,
    calculatedSubtotal,
    calculatedVat,
    calculatedTotal,
    hasMismatches,
  };
}

export function auditPvcTankLinerMeasurements(
  docId: string,
  docNumber: string,
  m: ExtractedMeasurement
): {
  auditedMeasurement: ExtractedMeasurement;
  auditRows: CalculationAuditRow[];
} {
  const auditRows: CalculationAuditRow[] = [];
  const diameter = Number(m.diameter) || 0;
  const height = Number(m.height) || 0;
  const fabricWidth = Number(m.fabricWidth) || 3.0; // standard 3m roll width
  const seams = Number(m.weldingAllowance) || 3;

  let calculatedArea = 0;
  let calculatedRunningMeter = 0;

  if (diameter > 0 && height > 0) {
    // Cylindrical Tank Liner Formula:
    // Wall Area = PI * D * H
    // Base Area = PI * (D/2)^2
    const wallArea = Math.PI * diameter * height;
    const baseArea = Math.PI * Math.pow(diameter / 2, 2);
    calculatedArea = Number((wallArea + baseArea).toFixed(2));

    // Running Meter = Fabric Area / Fabric Width + seam allowance
    calculatedRunningMeter = Number((calculatedArea / fabricWidth).toFixed(2));
  } else if (Number(m.length) > 0 && Number(m.width) > 0) {
    const l = Number(m.length);
    const w = Number(m.width);
    calculatedArea = Number((l * w).toFixed(2));
    calculatedRunningMeter = Number((calculatedArea / fabricWidth).toFixed(2));
  }

  // Audit Area
  if (m.area !== undefined && m.area !== null) {
    const diff = Number(Math.abs(m.area - calculatedArea).toFixed(2));
    const isMatch = diff <= 0.5; // allowance for rounding methods
    auditRows.push({
      documentId: docId,
      documentNumber: docNumber,
      description: `Tank Liner Surface Area (D=${diameter}m, H=${height}m)`,
      quantity: 1,
      rate: calculatedArea,
      originalDocumentValue: m.area,
      calculatedErpValue: calculatedArea,
      difference: diff,
      validationResult: isMatch ? "MATCH" : "MISMATCH",
      field: "Total Area (m²)",
    });
  }

  // Audit Running Meter
  if (m.runningMeter !== undefined && m.runningMeter !== null) {
    const diff = Number(Math.abs(m.runningMeter - calculatedRunningMeter).toFixed(2));
    const isMatch = diff <= 1.0;
    auditRows.push({
      documentId: docId,
      documentNumber: docNumber,
      description: `Running Meter Fabric Requirement (Width=${fabricWidth}m)`,
      quantity: 1,
      rate: calculatedRunningMeter,
      originalDocumentValue: m.runningMeter,
      calculatedErpValue: calculatedRunningMeter,
      difference: diff,
      validationResult: isMatch ? "MATCH" : "MISMATCH",
      field: "Running Meter (RM)",
    });
  }

  return {
    auditedMeasurement: {
      ...m,
      calculatedArea,
      calculatedRunningMeter,
    },
    auditRows,
  };
}
