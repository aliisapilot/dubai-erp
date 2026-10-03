import type { DocumentLayout, LayoutElement } from './documentDesigner';
import { numberToWordsEnglish } from './amountInWords';

export interface MeasurementSummaryDocument {
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  vat_rate?: number;
  items: Array<{quantity: number; result_unit?: string; dimensions?: string; calculated_total?: number; vat_rate?: number}>;
}
export function measurementSummary(data: MeasurementSummaryDocument, vatDisabled = false) {
  const pieces = data.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const linear = data.items.reduce((sum, item) => item.result_unit === 'm' || (!item.result_unit && item.dimensions) ? sum + (Number(item.calculated_total) || 0) : sum, 0);
  const area = data.items.reduce((sum, item) => item.result_unit === 'm²' ? sum + (Number(item.calculated_total) || 0) : sum, 0);
  // Respect supplied zero values; a zero VAT amount must never turn into 5% VAT.
  const net = data.subtotal ?? data.total_amount;
  const vatRate = data.vat_rate ?? data.items.find(item => item.vat_rate !== undefined)?.vat_rate ?? 5;
  const vat = data.vat_amount ?? Math.round(net * vatRate) / 100;
  const total = vatDisabled ? net : (data.total_amount ?? net + vat);
  const number = (value: number, digits: number) => value.toLocaleString('en-AE', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const money = (value: number) => `AED ${number(value, 2)}`;
  const rows = [{label: 'Total Pieces:', value: `${number(pieces, Number.isInteger(pieces) ? 0 : 3)} pcs`, kind: 'quantity'}];
  if (linear > 0) rows.push({label: 'Total Linear Metres:', value: `${number(linear, 3)} m`, kind: 'quantity'});
  if (area > 0) rows.push({label: 'Total Square Metres:', value: `${number(area, 3)} m²`, kind: 'quantity'});
  if (!vatDisabled) rows.push({label: 'Net Amount:', value: money(net), kind: 'money'}, {label: `VAT (${number(vatRate, Number.isInteger(vatRate) ? 0 : 2)}%):`, value: money(vat), kind: 'vat'});
  rows.push({label: vatDisabled ? 'Total Estimated Cost:' : 'Total Amount:', value: money(total), kind: 'total'});
  return {rows, words: `Amount in words: ${numberToWordsEnglish(total)}`};
}
export function measurementSummaryTypography(element: LayoutElement) {
  return {fontSize: Math.max(12, element.fontSize ?? 12), lineHeight: Math.max(1.35, element.lineHeight ?? 1.35)};
}
export function measurementSummaryHeight(element: LayoutElement, data: MeasurementSummaryDocument): number {
  const {fontSize, lineHeight} = measurementSummaryTypography(element);
  const summary = measurementSummary(data, element.customText === 'vat_disabled');
  const inset = Math.max(0, element.padding ?? 0) * 2;
  const widthPx = Math.max(40, (element.width - inset) * 3.7795 - 16);
  const rowsPx = summary.rows.reduce((height, row) => {
    const labelWidth = Math.max(fontSize * 4, widthPx - row.value.length * fontSize * 0.62 - 8);
    const lines = Math.max(1, Math.ceil(row.label.length * fontSize * 0.55 / labelWidth));
    return height + lines * fontSize * lineHeight + 7;
  }, 0);
  const wordFont = Math.max(10.5, fontSize * 0.88);
  const wordsLines = Math.max(1, Math.ceil(summary.words.length * wordFont * 0.55 / widthPx));
  return Math.ceil(((rowsPx + wordsLines * wordFont * lineHeight + 8) / 3.7795 + inset + 1) * 10) / 10;
}
/** Derived print geometry only: never change or save the user's layout coordinates. */
export function fitMeasurementSummaryLayout(layout: DocumentLayout, input?: unknown): DocumentLayout {
  const data = input as MeasurementSummaryDocument | undefined;
  if (layout.documentType !== 'measurement_sheet' || !data || !Array.isArray(data.items)) return layout;
  return {...layout, elements: layout.elements.map(element => element.type === 'totals' && element.visible
    ? {...element, runtimeMinHeight: measurementSummaryHeight(element, data)} : element)};
}
