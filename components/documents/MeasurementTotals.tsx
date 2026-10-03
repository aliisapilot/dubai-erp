import type { CSSProperties } from 'react';
import { measurementSummary, measurementSummaryTypography, type MeasurementSummaryDocument } from '@/lib/measurementPdfSummary';
import type { LayoutElement } from '@/lib/documentDesigner';

export default function MeasurementTotals({element, data, appearance, colors}: {
  element: LayoutElement;
  data: MeasurementSummaryDocument;
  appearance: CSSProperties;
  colors: {primary: string; muted: string; border: string; totalHighlight: string};
}) {
  const {fontSize, lineHeight} = measurementSummaryTypography(element);
  const summary = measurementSummary(data, element.customText === 'vat_disabled');
  return <div data-measurement-summary className="w-full rounded select-text" style={{
    border: `${element.borderWidth ?? 1}px solid ${element.borderColor || colors.border}`,
    borderRadius: `${element.borderRadius ?? 4}px`, minHeight: '100%', ...appearance,
    fontSize, lineHeight, fontFamily: element.fontFamily || 'Arial, Helvetica, sans-serif', overflow: 'visible',
  }}>
    {summary.rows.map(row => <div key={row.label} data-summary-kind={row.kind} className="flex items-start justify-between gap-2 px-2 py-0.5" style={{
      paddingTop: 3, paddingBottom: 3,
      borderBottom: row.kind === 'total' ? undefined : `1px solid ${colors.border}`,
      backgroundColor: row.kind === 'total' ? colors.totalHighlight : undefined,
    }}>
      <span className="min-w-0" style={{color: row.kind === 'total' ? colors.primary : colors.muted, fontWeight: row.kind === 'total' ? 700 : 500}}>{row.label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums" style={{color: colors.primary, fontWeight: row.kind === 'total' ? 700 : 600}}>{row.value}</span>
    </div>)}
    <p data-summary-words className="m-0 px-2 py-1" style={{color: colors.muted, fontSize: Math.max(10.5, fontSize * 0.88), lineHeight, whiteSpace: 'normal', overflowWrap: 'anywhere'}}>{summary.words}</p>
  </div>;
}
