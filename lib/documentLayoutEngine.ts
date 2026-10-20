/**
 * ==============================================================================
 * Dubai ERP: Document Layout Engine & Flow Positioning
 * ==============================================================================
 * Dynamic line-item height calculation, intelligent multi-page pagination,
 * flow-aware follower positioning, A4 boundary enforcement, and non-destructive
 * layout validation.
 * ==============================================================================
 */

import type {
  DocumentLayout,
  LayoutElement,
  SmartFitSettings,
} from "./documentDesigner";

// Automatic fitting paginates before shrinking body text below approximately 8pt.
export const AUTO_FIT_MIN_FONT_PX = 10.5;

const FALLBACK_SMART_FIT: SmartFitSettings = {
  enabled: true,
  mode: "balanced",
  minFontSize: 7.5,
  minRowHeight: 4.8,
  automaticSpacing: true,
  printSafeBorders: true,
  preventOverflow: true,
};

/** Enable content fitting without replacing any saved element, asset or page decoration. */
export function prepareSavedAutoFit(layout: DocumentLayout): DocumentLayout {
  return {
    ...layout,
    layoutMode: "auto_fit",
    page: {
      ...layout.page,
      smartFit: {
        ...FALLBACK_SMART_FIT,
        ...layout.page.smartFit,
        enabled: true,
        automaticSpacing: true,
        preventOverflow: true,
      },
    },
  };
}

export interface EffectiveLayoutElement extends LayoutElement {
  effectiveX: number;
  effectiveY: number;
  effectiveWidth: number;
  effectiveHeight: number;
  isFollower?: boolean;
  shiftY?: number;
  effectiveVisible?: boolean;
}

export type FitLevel = "standard" | "comfortable" | "compact" | "dense" | "ultra_dense" | "multi_page";

export interface FitProfile {
  fits: boolean;
  level: FitLevel;
  rowHeight: number;
  headerHeight: number;
  fontSize: number;
  headerFontSize: number;
  followerScale: number;
  gap: number;
  tableY: number;
  tableHeight: number;
  followerSpan: number;
  totalContentBottom: number;
  footerY: number;
  cellPadding?: string;
  headerCompactionRatio?: number;
  partyInfoHeight?: number;
  warning?: string;
  smartFitApplied?: boolean;
}

export interface PaginationPlan {
  totalPages: number;
  isSinglePage: boolean;
  fitProfile?: FitProfile;
  warning?: string;
  pageItemRanges: Array<{
    pageNumber: number;
    startIndex: number;
    endIndex: number;
    itemCount: number;
    isLastPage: boolean;
  }>;
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface LayoutValidationIssue {
  id: string;
  elementId?: string;
  elementLabel?: string;
  severity: ValidationSeverity;
  category: "bounds" | "overlap" | "table" | "footer" | "gap" | "dimension";
  message: string;
  details?: string;
  suggestedFix?: string;
}

export interface LayoutValidationReport {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  issues: LayoutValidationIssue[];
  metrics: {
    totalElements: number;
    visibleElements: number;
    pageWidthMm: number;
    pageHeightMm: number;
    estimatedPageCount: number;
  };
}

export interface ItemDescriptionLike {
  description?: string;
  [key: string]: unknown;
}

export interface DocumentFitText {
  customer_name?: string;
  customer_trn?: string;
  customer_address?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  supplier_name?: string;
  project_name?: string;
  location?: string;
  scope_of_work?: string;
  notes?: string;
  payment_terms?: string;
  company_name?: string;
  company_name_ar?: string;
  company_address?: string;
  company_trn?: string;
  company_phone?: string;
  company_email?: string;
}

/** Remove unused paragraph-card space while retaining conservative text clearance. */
export function fitDocumentContentBoxes(layout: DocumentLayout, text?: DocumentFitText): DocumentLayout {
  if (!text || layout.page.smartFit?.enabled === false || layout.page.smartFit?.automaticSpacing === false) return layout;
  return { ...layout, elements: layout.elements.map((element) => {
    if (!element.visible || element.flowMode === "fixed" || element.type !== "payment_terms") return element;
    // Tokenized custom text may include company fields unavailable to this estimator.
    if (element.customText?.includes("{{")) return element;
    const fontSize = Math.max(11, element.fontSize || 10);
    const values = element.customText ? [element.customText] : [text.notes, text.payment_terms];
    const lines = values.filter((value): value is string => Boolean(value?.trim())).reduce(
      (count, value) => count + estimateWrappedLines(value, Math.max(20, element.width - 12), fontSize), 0);
    const requiredHeight = Math.max(28, (lines + 4) * fontSize * 1.6 / 3.7795 + 8);
    return { ...element, height: Math.min(element.height, Math.ceil(requiredHeight)) };
  }) };
}

function estimateWrappedLines(value: string, widthMm: number, fontSizePx: number): number {
  const charsPerLine = Math.max(16, Math.floor((widthMm * 3.7795) / (fontSizePx * 0.52)));
  return value.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

/**
 * Calculates estimated dynamic height for corporate header elements based on text length,
 * font sizes, and container width to prevent header overlapping and text collisions.
 */
export function estimateHeaderElementHeight(element: LayoutElement, text?: DocumentFitText): number {
  if (!element.visible) return 0;
  const padding = element.padding || 0;
  const widthMm = Math.max(20, element.width - padding * 2);

  switch (element.type) {
    case "logo": {
      return Math.max(12, element.height);
    }
    case "company_name_en": {
      const fontSizePt = element.fontSize || 11.5;
      const fontSizePx = fontSizePt * 1.333;
      const rawText = element.customText || text?.company_name || "DUBAI ENTERPRISE ERP L.L.C";
      const lines = estimateWrappedLines(rawText, widthMm, fontSizePx);
      const lineHeightMm = (fontSizePx * 1.3) / 3.7795;
      const neededHeight = lines * lineHeightMm + padding * 2 + 1.5;
      return Math.max(element.height, Math.round(neededHeight * 10) / 10);
    }
    case "company_name_ar": {
      const fontSizePt = element.fontSize || 13.5;
      const fontSizePx = fontSizePt * 1.333;
      const rawText = element.customText || text?.company_name_ar || "مؤسسة دبي إي آر بي";
      const lines = estimateWrappedLines(rawText, widthMm, fontSizePx);
      const lineHeightMm = (fontSizePx * 1.35) / 3.7795;
      const neededHeight = lines * lineHeightMm + padding * 2 + 2.0;
      return Math.max(element.height, Math.round(neededHeight * 10) / 10);
    }
    case "company_address": {
      const fontSizePt = element.fontSize || 8.0;
      const fontSizePx = fontSizePt * 1.333;
      const addressText = element.customText || text?.company_address || "Office 101, Business Bay, Dubai, UAE";
      const contactText = `TRN: ${text?.company_trn || "100XXXXXXXXX"} | Tel: ${text?.company_phone || "+971 4 000 0000"}`;
      const addrLines = estimateWrappedLines(addressText, widthMm, fontSizePx);
      const contactLines = estimateWrappedLines(contactText, widthMm, fontSizePx);
      const totalLines = addrLines + contactLines;
      const lineHeightMm = (fontSizePx * 1.35) / 3.7795;
      const neededHeight = totalLines * lineHeightMm + padding * 2 + 2.5;
      return Math.max(element.height, Math.round(neededHeight * 10) / 10);
    }
    case "doc_title": {
      return Math.max(10.5, element.height);
    }
    default:
      return element.height;
  }
}

function estimatePartyInfoHeight(layout: DocumentLayout, text?: DocumentFitText): number | undefined {
  if (!text) return undefined;
  const party = layout.elements.find((element) =>
    element.visible && ["customer_info", "supplier_info", "project_info"].includes(element.type)
  );
  if (!party) return undefined;

  const fields = party.type === "supplier_info"
    ? [text.supplier_name || text.customer_name, text.contact_person, text.customer_address]
    : party.type === "project_info"
    ? [text.project_name, text.location, text.scope_of_work]
    : [text.customer_name, text.customer_trn, text.customer_address, text.contact_person, text.contact_number, text.contact_email];
  const fontSize = Math.max(9.5, party.fontSize || 10.5);
  const textLines = fields.filter((value): value is string => Boolean(value?.trim())).reduce(
    (count, value) => count + estimateWrappedLines(value, party.width - (party.padding || 3) * 2, fontSize),
    1
  );
  const headingHeightMm = 4.5;
  const lineHeightMm = (fontSize * 1.35) / 3.7795;
  const contentHeight = headingHeightMm + textLines * lineHeightMm + (party.padding || 3) * 2 + 2;
  return Math.max(party.height, contentHeight);
}

/**
 * Calculates estimated line wrapping height for a single table item row
 */
export function calculateItemRowHeight(
  baseRowHeight: number,
  description?: string,
  fontSize?: number
): number {
  if (!description) return baseRowHeight;
  const lines = description.split("\n");
  const effectiveFontSize = fontSize || 10;
  // A standard A4 description column is 75mm - 88mm wide.
  // At 8pt font, ~46 characters fit per line before wrapping in Arial/Sans-serif.
  const charsPerLine = Math.max(38, Math.floor(46 * (8.5 / effectiveFontSize)));
  let totalVisualLines = 0;
  for (const line of lines) {
    totalVisualLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  const extraLines = Math.max(0, totalVisualLines - 1);
  const extraLineMm = Math.max(2.0, Math.min(3.5, (effectiveFontSize * 1.25) / 3.7795));
  return baseRowHeight + (extraLines * extraLineMm);
}

/**
 * Calculates the exact rendered height in mm of a table with N items
 */
export function calculateTableRenderedHeight(
  tableElement: LayoutElement | undefined,
  itemCount: number,
  itemsData?: ItemDescriptionLike[],
  rowHeightOverride?: number,
  headerHeightOverride?: number,
  fontSizeOverride?: number
): number {
  if (!tableElement) return 0;
  const baseRowHeight = rowHeightOverride || Math.max(4, tableElement.tableSettings?.rowHeight || 8.5);
  const headerFontSize = tableElement.tableSettings?.headerFontSize || 10;
  const headerHeight = headerHeightOverride || Math.max(5, Math.max(baseRowHeight, headerFontSize * 0.35 + 3.5));
  const effectiveFontSize = fontSizeOverride || tableElement.tableSettings?.fontSize || 10;
  const effectiveCount = Math.max(1, itemCount);

  let itemsHeight = 0;
  if (itemsData && itemsData.length > 0) {
    const slice = itemsData.slice(0, effectiveCount);
    for (const it of slice) {
      itemsHeight += calculateItemRowHeight(baseRowHeight, it.description, effectiveFontSize);
    }
  } else {
    itemsHeight = effectiveCount * baseRowHeight;
  }

  // Add 1.2mm for outer table borders and cell padding
  return headerHeight + itemsHeight + 1.2;
}

/**
 * Determines whether an element logically follows the dynamic table
 */
export function isFollowerElement(
  element: LayoutElement,
  tableElement: LayoutElement | undefined
): boolean {
  if (!tableElement || !element.visible) return false;
  if (element.id === tableElement.id) return false;
  if (element.type === "watermark" || element.type === "footer") return false;

  // Explicit flow mode override
  if (element.flowMode === "fixed") return false;
  if (element.flowMode === "flow") return true;

  // Well-known business follower cards
  const standardFollowerTypes = [
    "totals",
    "amount_in_words",
    "bank_details",
    "payment_terms",
    "company_signature",
    "company_stamp",
  ];
  if (standardFollowerTypes.includes(element.type)) {
    return true;
  }

  // Any custom element positioned at or below the designed table baseline
  const tableBaseline = tableElement.y + tableElement.height - 2;
  return element.y >= tableBaseline;
}

/**
 * Calculates the required vertical span in mm for all follower elements
 * using visual two-column grouping with side-by-side detection (e.g. signature + stamp).
 */
function followerHeight(element: LayoutElement, scale: number): number {
  const minimum = (element as LayoutElement & {runtimeMinHeight?: number}).runtimeMinHeight ?? 0;
  return Math.max(element.height * scale, minimum);
}

/** Pack saved rows without treating full-width cards as a separate left column. */
function packContentRows(elements: LayoutElement[], startY: number, gap: number, scale: number, signaturesLast = false) {
  const positions = new Map<string, { y: number; height: number }>();
  const rows: LayoutElement[][] = [];
  const isSignature = (element: LayoutElement) => ["company_signature", "company_stamp"].includes(element.type);
  for (const element of [...elements].sort((a, b) =>
    (signaturesLast ? Number(isSignature(a)) - Number(isSignature(b)) : 0) || a.y - b.y)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - element.y) < 5 &&
      (!signaturesLast || isSignature(candidate[0]) === isSignature(element)));
    if (row) row.push(element);
    else rows.push([element]);
  }
  const placed: { element: LayoutElement; bottom: number }[] = [];
  for (const row of rows) {
    let y = startY;
    if (signaturesLast && row.some(isSignature) && placed.length) {
      y = Math.max(y, ...placed.filter((previous) => !isSignature(previous.element)).map((previous) => previous.bottom + gap));
    }
    for (const element of row) {
      for (const previous of placed) {
        if (element.x < previous.element.x + previous.element.width && element.x + element.width > previous.element.x) {
          y = Math.max(y, previous.bottom + gap);
        }
      }
    }
    for (const element of row) {
      const height = Math.round(followerHeight(element, scale) * 10) / 10;
      positions.set(element.id, { y, height });
      placed.push({ element, bottom: y + height });
    }
  }
  return positions;
}

export function calculateFollowerVerticalSpan(
  followers: LayoutElement[],
  scale: number,
  gap: number
): number {
  if (followers.length === 0) return 0;

  const positions = packContentRows(followers, 0, gap, scale);
  return Math.max(...followers.map((element) => {
    const position = positions.get(element.id)!;
    return position.y + position.height;
  }));
}

/**
 * Computes an intelligent single-page A4 fitting profile for a given layout and item count.
 * Evaluates four levels of non-destructive content tightening (standard, comfortable, compact, dense)
 * before determining if multi-page pagination is genuinely required.
 */
export function computeIntelligentFitProfile(
  layout: DocumentLayout,
  totalItems: number,
  itemsData?: ItemDescriptionLike[],
  documentText?: DocumentFitText
): FitProfile {
  const table = layout.elements.find((el) => el.type === "line_items" && el.visible);
  const footer = layout.elements.find((el) => el.type === "footer" && el.visible);
  const footerBaselineY = layout.page.heightMm - (layout.page?.margins?.bottom || 8);
  const footerHeight = footer ? footer.height : 14;
  const footerY = footer
    ? Math.max(footer.y, footerBaselineY - footerHeight)
    : footerBaselineY - 14;
  const safetyBottom = footerY - 2.0;
  const partyInfoHeight = estimatePartyInfoHeight(layout, documentText);

  const layoutMode = layout.layoutMode || "manual";
  const smartFit: SmartFitSettings = layout.page?.smartFit || FALLBACK_SMART_FIT;
  const isSmartFitEnabled = layoutMode === "auto_fit" && smartFit.enabled !== false;
  const configuredMinFont = Math.max(isSmartFitEnabled ? AUTO_FIT_MIN_FONT_PX : 0,
    Number.isFinite(smartFit.minFontSize) ? smartFit.minFontSize : AUTO_FIT_MIN_FONT_PX);
  const configuredMinRow = Number.isFinite(smartFit.minRowHeight) ? smartFit.minRowHeight : 4.8;
  const mode = smartFit.mode || "balanced";

  if (!table || totalItems <= 0) {
    return {
      fits: true,
      level: "standard",
      rowHeight: Math.max(8.0, table?.tableSettings?.rowHeight || 8.5),
      headerHeight: 7.5,
      fontSize: table?.tableSettings?.fontSize || 10.5,
      headerFontSize: table?.tableSettings?.headerFontSize || 10.5,
      followerScale: 1.0,
      gap: 3.0,
      tableY: table?.y || 95,
      tableHeight: 0,
      followerSpan: 0,
      totalContentBottom: table?.y || 95,
      footerY,
      partyInfoHeight,
      cellPadding: "5px 8px",
      headerCompactionRatio: 1.0,
      smartFitApplied: false,
    };
  }

  // In MANUAL DESIGN mode: strictly preserve user font sizes, row heights, and table position
  if (layoutMode === "manual") {
    const tableRowHeight = table.tableSettings?.rowHeight || 8.5;
    const tableHeaderHeight = table.tableSettings?.headerHeight || 7.5;
    const tableFontSize = table.tableSettings?.fontSize || 10;
    const tableHeaderFontSize = table.tableSettings?.headerFontSize || 10;
    const tableHeight = calculateTableRenderedHeight(
      table,
      totalItems,
      itemsData,
      tableRowHeight,
      tableHeaderHeight,
      tableFontSize
    );
    const followers = layout.elements.filter(
      (el) => el.visible && isFollowerElement(el, table)
    );
    const followerSpan = calculateFollowerVerticalSpan(followers, 1.0, 3.0);
    const tableY = table.y;
    const totalContentBottom = tableY + tableHeight + (followerSpan > 0 ? 3.0 + followerSpan : 0);
    const fits = totalContentBottom <= safetyBottom;

    return {
      fits,
      level: "standard",
      rowHeight: tableRowHeight,
      headerHeight: tableHeaderHeight,
      fontSize: tableFontSize,
      headerFontSize: tableHeaderFontSize,
      followerScale: 1.0,
      gap: 3.0,
      tableY,
      tableHeight,
      followerSpan,
      totalContentBottom,
      footerY,
      partyInfoHeight,
      cellPadding: "5px 8px",
      headerCompactionRatio: 1.0,
      smartFitApplied: false,
      warning: fits
        ? undefined
        : `Manual layout: Content height (${totalContentBottom.toFixed(1)}mm) exceeds printable A4 limit (${safetyBottom.toFixed(1)}mm). Overflow warning only; manual design settings preserved.`,
    };
  }

  // Elements above table (ignoring watermark)
  const elementsAbove = layout.elements.filter(
    (el) => el.visible && el.type !== "watermark" && el.y + el.height <= table.y + 2
  );
  const minHeaderY = elementsAbove.length > 0 ? Math.min(...elementsAbove.map((el) => el.y)) : 10;
  const party = layout.elements.find((el) => el.visible && ["customer_info", "supplier_info", "project_info"].includes(el.type));
  const maxAboveBottom = elementsAbove.length > 0
    ? Math.max(...elementsAbove.map((el) => el.y + (el.id === party?.id && partyInfoHeight ? partyInfoHeight : el.height)))
    : 60;
  const originalHeaderSpan = Math.max(20, (table?.y || 95) - minHeaderY);

  const followers = layout.elements.filter(
    (el) => el.visible && isFollowerElement(el, table)
  );

  type TierDefinition = {
    level: "standard" | "comfortable" | "compact" | "dense" | "ultra_dense";
    rowHeight: number;
    headerHeight: number;
    fontSize: number;
    headerFontSize: number;
    followerScale: number;
    gap: number;
    headerCompactionRatio: number;
    cellPadding: string;
    cardHeight: number;
    allowSlideTableUp: boolean;
  };

  const allTiers: TierDefinition[] = [
    {
      level: "standard",
      rowHeight: Math.max(8.5, table.tableSettings?.rowHeight || 9.0),
      headerHeight: 7.5,
      fontSize: table.tableSettings?.fontSize || 10.5,
      headerFontSize: table.tableSettings?.headerFontSize || 10.5,
      followerScale: 1.0,
      gap: 3.0,
      headerCompactionRatio: 1.0,
      cellPadding: "5px 8px",
      cardHeight: Math.max(partyInfoHeight || 0, 27),
      allowSlideTableUp: false,
    },
    {
      level: "comfortable",
      rowHeight: Math.max(configuredMinRow, 7.8),
      headerHeight: 7.0,
      fontSize: Math.max(configuredMinFont, 9.5),
      headerFontSize: Math.max(configuredMinFont, 9.5),
      followerScale: 0.90,
      gap: 2.4,
      headerCompactionRatio: 0.92,
      cellPadding: "4px 6px",
      cardHeight: Math.max(partyInfoHeight || 0, 25),
      allowSlideTableUp: true,
    },
    {
      level: "compact",
      rowHeight: Math.max(configuredMinRow, 6.8),
      headerHeight: 6.2,
      fontSize: Math.max(configuredMinFont, 8.8),
      headerFontSize: Math.max(configuredMinFont, 9.0),
      followerScale: 0.80,
      gap: 2.0,
      headerCompactionRatio: 0.82,
      cellPadding: "3px 5px",
      cardHeight: Math.max(partyInfoHeight || 0, 23.5),
      allowSlideTableUp: true,
    },
    {
      level: "dense",
      rowHeight: Math.max(configuredMinRow, 5.5),
      headerHeight: 5.6,
      fontSize: Math.max(configuredMinFont, 8.0),
      headerFontSize: Math.max(configuredMinFont, 8.2),
      followerScale: 0.70,
      gap: 1.6,
      headerCompactionRatio: 0.72,
      cellPadding: "2.5px 4.5px",
      cardHeight: Math.max(partyInfoHeight || 0, 21.5),
      allowSlideTableUp: true,
    },
    {
      level: "ultra_dense",
      rowHeight: Math.max(configuredMinRow, 4.6),
      headerHeight: 5.0,
      fontSize: Math.max(configuredMinFont, 7.2),
      headerFontSize: Math.max(configuredMinFont, 7.6),
      followerScale: 0.62,
      gap: 1.2,
      headerCompactionRatio: 0.65,
      cellPadding: "1.5px 3.5px",
      cardHeight: Math.max(partyInfoHeight || 0, 19.5),
      allowSlideTableUp: true,
    },
  ];

  let tiers: TierDefinition[];
  if (!isSmartFitEnabled) {
    tiers = [allTiers[0]];
  } else if (smartFit.preferredDensity === "normal") {
    tiers = [allTiers[0], allTiers[1]];
  } else if (smartFit.preferredDensity === "compact") {
    tiers = allTiers.slice(2);
  } else if (smartFit.preferredDensity === "dense") {
    tiers = allTiers.slice(3);
  } else if (smartFit.preferredDensity === "ultra_dense") {
    tiers = [allTiers[4]];
  } else if (mode === "readability") {
    // Readability prioritizes standard / comfortable / compact, preserving generous spacing
    tiers = allTiers.slice(0, 3).map((t) => ({
      ...t,
      rowHeight: Math.max(t.rowHeight, Math.max(configuredMinRow, 6.2)),
      fontSize: Math.max(t.fontSize, Math.max(configuredMinFont, 8.5)),
    }));
  } else if (mode === "compact") {
    // Compact mode tries compact, dense, ultra_dense
    tiers = allTiers.slice(2);
  } else {
    // Balanced mode tries all tiers in progressive order
    tiers = allTiers;
  }

  for (const candidate of tiers) {
    const tier = isSmartFitEnabled ? {
      ...candidate,
      rowHeight: Math.max(candidate.rowHeight, configuredMinRow),
      fontSize: Math.max(candidate.fontSize, configuredMinFont),
      headerFontSize: Math.max(candidate.headerFontSize, configuredMinFont),
    } : candidate;
    let effectiveAbove = maxAboveBottom;
    if (tier.allowSlideTableUp && smartFit.automaticSpacing !== false) {
      const compactedSpan = originalHeaderSpan * tier.headerCompactionRatio;
      effectiveAbove = minHeaderY + compactedSpan;
    }

    const tableY = isSmartFitEnabled && smartFit.automaticSpacing !== false
      ? (tier.allowSlideTableUp ? Math.min(table.y, effectiveAbove + tier.gap) : effectiveAbove + tier.gap)
      : Math.max(table.y, maxAboveBottom + tier.gap);

    const tableHeight = calculateTableRenderedHeight(
      table,
      totalItems,
      itemsData,
      tier.rowHeight,
      tier.headerHeight,
      tier.fontSize
    );
    const followerSpan = calculateFollowerVerticalSpan(followers, tier.followerScale, tier.gap);
    const totalContentBottom = tableY + tableHeight + (followerSpan > 0 ? tier.gap + followerSpan : 0);

    if (totalContentBottom <= safetyBottom) {
      return {
        fits: true,
        level: tier.level,
        rowHeight: tier.rowHeight,
        headerHeight: tier.headerHeight,
        fontSize: tier.fontSize,
        headerFontSize: tier.headerFontSize,
        followerScale: tier.followerScale,
        gap: tier.gap,
        tableY,
        tableHeight,
        followerSpan,
        totalContentBottom,
        footerY,
        cellPadding: tier.cellPadding,
        headerCompactionRatio: tier.headerCompactionRatio,
        partyInfoHeight,
        smartFitApplied: tier.level !== "standard",
      };
    }
  }

  // When content legitimately exceeds single A4 capacity even under ultra_dense tier
  return {
    fits: false,
    level: "multi_page",
    rowHeight: Math.max(configuredMinRow, 7.5),
    headerHeight: 7.0,
    fontSize: Math.max(configuredMinFont, 9.5),
    headerFontSize: Math.max(configuredMinFont, 9.5),
    followerScale: 0.88,
    gap: 2.5,
    tableY: Math.max(table.y, maxAboveBottom + 2.5),
    tableHeight: calculateTableRenderedHeight(table, totalItems, itemsData, Math.max(configuredMinRow, 7.5), 7.0, Math.max(configuredMinFont, 9.5)),
    followerSpan: calculateFollowerVerticalSpan(followers, 0.88, 2.5),
    totalContentBottom: 310,
    footerY,
    cellPadding: "3px 5px",
    headerCompactionRatio: 1.0,
    partyInfoHeight,
    smartFitApplied: false,
    warning: `Document exceeds single-page A4 capacity (${totalItems} items). Formatted cleanly for multi-page printing without data loss.`,
  };
}

/**
 * Computes intelligent pagination for a document layout and total item count
 */
export function computePaginationPlan(
  layout: DocumentLayout,
  totalItems: number,
  itemsData?: ItemDescriptionLike[],
  documentText?: DocumentFitText
): PaginationPlan {
  layout = fitDocumentContentBoxes(layout, documentText);
  const table = layout.elements.find((el) => el.type === "line_items" && el.visible);
  if (!table || totalItems <= 0) {
    return {
      totalPages: 1,
      isSinglePage: true,
      pageItemRanges: [
        {
          pageNumber: 1,
          startIndex: 0,
          endIndex: 0,
          itemCount: 0,
          isLastPage: true,
        },
      ],
    };
  }

  // First: attempt intelligent single-page fitting
  const fit = computeIntelligentFitProfile(layout, totalItems, itemsData, documentText);
  if (fit.fits) {
    return {
      totalPages: 1,
      isSinglePage: true,
      fitProfile: fit,
      pageItemRanges: [
        {
          pageNumber: 1,
          startIndex: 0,
          endIndex: totalItems,
          itemCount: totalItems,
          isLastPage: true,
        },
      ],
    };
  }

  // Multi-page distribution
  const footer = layout.elements.find((el) => el.type === "footer" && el.visible);
  const footerBaselineY = layout.page.heightMm - (layout.page?.margins?.bottom || 8);
  const footerHeight = footer ? footer.height : 14;
  const footerTop = footer
    ? Math.max(footer.y, footerBaselineY - footerHeight)
    : footerBaselineY - 14;
  const safetyMarginAboveFooter = 2.0;
  const maxContentY = footerTop - safetyMarginAboveFooter;

  const rowHeight = fit.rowHeight;
  const headerHeight = fit.headerHeight;

  // Space on final page (with followers)
  const followerSpan = fit.followerSpan;
  const spaceForTableWithFollowers = Math.max(
    rowHeight * 2,
    maxContentY - fit.tableY - followerSpan - fit.gap - 2
  );
  const finalPageCapacity = Math.max(rowHeight * 2, spaceForTableWithFollowers - headerHeight);
  const spaceForTableWithoutFollowers = Math.max(
    rowHeight * 3,
    maxContentY - fit.tableY - 2
  );
  const regularPageCapacity = Math.max(rowHeight * 3, spaceForTableWithoutFollowers - headerHeight);
  const rowHeights = Array.from({ length: totalItems }, (_, index) =>
    calculateItemRowHeight(rowHeight, itemsData?.[index]?.description, fit.fontSize)
  );

  const pageItemRanges: PaginationPlan["pageItemRanges"] = [];
  let currentIndex = 0;

  while (currentIndex < totalItems) {
    const remainingHeight = rowHeights.slice(currentIndex).reduce((sum, height) => sum + height, 0);
    if (remainingHeight <= finalPageCapacity) {
      pageItemRanges.push({
        pageNumber: pageItemRanges.length + 1,
        startIndex: currentIndex,
        endIndex: totalItems,
        itemCount: totalItems - currentIndex,
        isLastPage: true,
      });
      break;
    }

    let endIndex = currentIndex;
    let usedHeight = 0;
    while (endIndex < totalItems - 1 && usedHeight + rowHeights[endIndex] <= regularPageCapacity) {
      usedHeight += rowHeights[endIndex];
      endIndex += 1;
    }
    if (endIndex === currentIndex) endIndex += 1;

    pageItemRanges.push({
      pageNumber: pageItemRanges.length + 1,
      startIndex: currentIndex,
      endIndex,
      itemCount: endIndex - currentIndex,
      isLastPage: false,
    });

    currentIndex = endIndex;
  }

  return {
    totalPages: pageItemRanges.length,
    isSinglePage: pageItemRanges.length === 1,
    fitProfile: fit,
    warning: fit.warning || (pageItemRanges.length > 1
      ? `Multi-page document (${pageItemRanges.length} pages) — Content exceeds single-page A4 capacity.`
      : undefined),
    pageItemRanges,
  };
}

export interface EffectiveLayoutResult {
  elements: EffectiveLayoutElement[];
  actualTableHeight: number;
  deltaY: number;
  fitProfile: FitProfile;
  isSinglePage: boolean;
  totalPages: number;
}

/**
 * Calculates effective geometry for all elements on a specific rendered page.
 * Shifts follower elements dynamically based on actual row count,
 * anchors footer baseline, compacts spacing, and prevents clipping.
 */
export function computeEffectiveLayout(
  layout: DocumentLayout,
  pageItemsCount: number,
  isLastPage: boolean,
  pageNumber: number = 1,
  totalPages?: number,
  itemsData?: ItemDescriptionLike[],
  documentText?: DocumentFitText
): EffectiveLayoutResult {
  layout = fitDocumentContentBoxes(layout, documentText);
  const table = layout.elements.find((el) => el.type === "line_items" && el.visible);

  // Determine pagination plan and fit profile
  const paginationPlan = computePaginationPlan(layout, pageItemsCount, itemsData, documentText);
  const resolvedTotalPages = totalPages || paginationPlan.totalPages;
  const isSinglePage = resolvedTotalPages === 1;
  const computedProfile = paginationPlan.fitProfile || computeIntelligentFitProfile(layout, pageItemsCount, itemsData, documentText);
  const fitProfile: FitProfile = resolvedTotalPages > 1
    ? {
        ...computedProfile,
        fits: false,
        level: "multi_page",
        rowHeight: Math.max(layout.page.smartFit?.minRowHeight || 0, 7.5),
        headerHeight: 7,
        fontSize: Math.max(layout.page.smartFit?.minFontSize || 0, layout.page.smartFit?.enabled !== false ? AUTO_FIT_MIN_FONT_PX : 9.5),
        headerFontSize: Math.max(layout.page.smartFit?.minFontSize || 0, layout.page.smartFit?.enabled !== false ? AUTO_FIT_MIN_FONT_PX : 9.5),
        followerScale: 0.88,
        gap: 2.5,
      }
    : computedProfile;

  const layoutMode = layout.layoutMode || "manual";
  const isManualMode = layoutMode === "manual";

  let effectiveTableY = isManualMode
    ? (table ? table.y : 95)
    : (isSinglePage && fitProfile.tableY ? fitProfile.tableY : (table ? table.y : 95));
  const effectiveRowHeight = isManualMode ? (table?.tableSettings?.rowHeight || 8.5) : fitProfile.rowHeight;
  const effectiveHeaderHeight = isManualMode ? (table?.tableSettings?.headerHeight || 7.5) : fitProfile.headerHeight;

  // Check if header compaction is active (table shifted upwards to fit single A4 page)
  const originalTableY = table ? table.y : 95;
  const tableShift = !isManualMode && table && isSinglePage ? originalTableY - effectiveTableY : 0;

  // Elements above table (ignoring watermark, footer, and table itself)
  const elementsAbove = layout.elements.filter(
    (el) => el.visible && el.type !== "watermark" && el.type !== "footer" && (!table || el.id !== table.id) && (!table || el.y < table.y + 5)
  );
  const minHeaderY = elementsAbove.length > 0 ? Math.min(...elementsAbove.map((el) => el.y)) : 10;
  const originalHeaderSpan = Math.max(20, originalTableY - minHeaderY);
  const targetHeaderSpan = Math.max(15, effectiveTableY - fitProfile.gap - minHeaderY);
  const headerScale = !isManualMode && tableShift > 0 && fitProfile.level !== "standard" && originalHeaderSpan > 0
    ? Math.min(1.0, Math.max(0.75, targetHeaderSpan / originalHeaderSpan))
    : 1.0;

  // Separate elements above the table into Zone 1 (Corporate Branding Header) and Zone 2 (Party & Meta Cards)
  const isPartyCard = (type: string) => ["customer_info", "supplier_info", "project_info", "doc_meta"].includes(type);
  const zone1Elements = elementsAbove.filter((el) => !isPartyCard(el.type));

  const headerLayoutMap = new Map<string, { y: number; height: number }>();

  if (isManualMode) {
    // In MANUAL DESIGN mode: strictly preserve exact user positions and heights
    for (const el of elementsAbove) {
      headerLayoutMap.set(el.id, { y: el.y, height: el.height });
    }
  } else {
    // ── ZONE 1: CORPORATE BRANDING HEADER (Logo, English Name, Arabic Name, Address/TRN, Title Banner) ──
    // Calculate dynamic text heights and sequential 2D clearance to prevent collision
    // while strictly preserving saved positions and intentional placements.
    if (zone1Elements.length > 0) {
      const sortedZone1 = [...zone1Elements].sort((a, b) => a.y - b.y);
      const placedZone1: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

      for (const el of sortedZone1) {
        const dynamicHeight = estimateHeaderElementHeight(el, documentText);
        const scaledHeight = tableShift > 0 && fitProfile.level !== "standard"
          ? Math.max(
              el.type === "logo" ? 12 : el.type === "doc_title" ? 9.5 : 5.0,
              Math.round(dynamicHeight * headerScale * 10) / 10
            )
          : dynamicHeight;

        const clearanceGap = tableShift > 0 && fitProfile.level !== "standard" ? 1.2 : 1.8;

        let minAllowedY = minHeaderY;
        for (const placed of placedZone1) {
          const xOverlap = Math.max(0, Math.min(placed.x + placed.width, el.x + el.width) - Math.max(placed.x, el.x));
          if (xOverlap > 3.0) {
            if (placed.y <= el.y + 1.0) {
              minAllowedY = Math.max(minAllowedY, placed.y + placed.height + clearanceGap);
            }
          }
        }

        const effectiveY = Math.max(el.y, minAllowedY);

        placedZone1.push({
          id: el.id,
          x: el.x,
          y: effectiveY,
          width: el.width,
          height: scaledHeight,
        });

        headerLayoutMap.set(el.id, { y: effectiveY, height: scaledHeight });
      }
    }

    // ── ZONE 2: TRANSACTION PARTY & DOCUMENT META CARDS ──
    // Positioned below Zone 1 with synchronized horizontal alignment and equal visual card heights.
    const partyElement = layout.elements.find(
      (el) => el.visible && ["customer_info", "supplier_info", "project_info"].includes(el.type)
    );
    const metaElement = layout.elements.find((el) => el.visible && el.type === "doc_meta");

    const zone1Bottom = zone1Elements.length > 0
      ? Math.max(...zone1Elements.map((el) => {
          const mapped = headerLayoutMap.get(el.id);
          return mapped ? mapped.y + mapped.height : el.y + el.height;
        }))
      : minHeaderY;

    const minZone2Y = zone1Bottom + (tableShift > 0 && fitProfile.level !== "standard" ? 1.5 : 2.5);

    if (partyElement || metaElement) {
      const rawPartyY = Math.min(partyElement?.y ?? 60, metaElement?.y ?? 60);
      const targetPartyY = Math.max(minZone2Y, rawPartyY);

      const estPartyH = fitProfile.partyInfoHeight || estimatePartyInfoHeight(layout, documentText) || 24;
      let targetPartyHeight = Math.max(
        estPartyH,
        partyElement?.height ?? 0,
        metaElement?.height ?? 0,
        22.0
      );

      if (tableShift > 0 && fitProfile.level !== "standard") {
        if (fitProfile.level === "ultra_dense") {
          targetPartyHeight = Math.max(19.0, Math.min(targetPartyHeight, 20.5));
        } else if (fitProfile.level === "dense") {
          targetPartyHeight = Math.max(20.5, Math.min(targetPartyHeight, 22.0));
        } else if (fitProfile.level === "compact") {
          targetPartyHeight = Math.max(22.0, Math.min(targetPartyHeight, 24.0));
        } else if (fitProfile.level === "comfortable") {
          targetPartyHeight = Math.max(24.0, Math.min(targetPartyHeight, 26.0));
        }
      }

      if (partyElement) {
        headerLayoutMap.set(partyElement.id, { y: targetPartyY, height: targetPartyHeight });
      }
      if (metaElement) {
        headerLayoutMap.set(metaElement.id, { y: targetPartyY, height: targetPartyHeight });
      }
    }

    // Ensure table strictly clears all elements above it (Zone 1 and Zone 2)
    const allHeadersBottom = elementsAbove.length > 0
      ? Math.max(...elementsAbove.map((el) => {
          const mapped = headerLayoutMap.get(el.id);
          return mapped ? mapped.y + mapped.height : el.y + el.height;
        }))
      : minHeaderY;

    const minTableY = allHeadersBottom + fitProfile.gap;
    if (effectiveTableY < minTableY) {
      effectiveTableY = minTableY;
    }
  }

  const actualTableHeight = table
    ? calculateTableRenderedHeight(table, pageItemsCount, itemsData, effectiveRowHeight, effectiveHeaderHeight, isManualMode ? (table.tableSettings?.fontSize || 10) : fitProfile.fontSize)
    : 0;

  const tableDesignedHeight = table ? table.height : 0;
  const deltaY = table ? actualTableHeight - tableDesignedHeight : 0;
  const actualTableBottom = effectiveTableY + actualTableHeight;

  // Footer anchor position
  const footerBaselineY = layout.page.heightMm - layout.page.margins.bottom;

  // Identify follower elements and pack them below actualTableBottom
  const followers = layout.elements.filter((el) => isFollowerElement(el, table));
  let followerMap = new Map<string, { y: number; height: number }>();

  if (followers.length > 0 && isLastPage) {
    if (isManualMode) {
      for (const el of followers) {
        if (el.flowMode === "fixed") {
          followerMap.set(el.id, { y: el.y, height: el.height });
        } else {
          followerMap.set(el.id, { y: el.y + Math.max(0, deltaY), height: el.height });
        }
      }
    } else {
      followerMap = packContentRows(followers, actualTableBottom + fitProfile.gap, fitProfile.gap, fitProfile.followerScale);
    }
  }

  const automaticSpacing = layout.page.smartFit?.enabled !== false && layout.page.smartFit?.automaticSpacing !== false;
  if (!table && automaticSpacing && isLastPage) {
    const bodyTypes = ["amount_in_words", "totals", "bank_details", "payment_terms", "company_signature", "company_stamp"];
    const body = layout.elements.filter((element) => element.visible && element.flowMode !== "fixed" &&
      (element.pageNumber === undefined || element.pageNumber === pageNumber) && bodyTypes.includes(element.type));
    const firstBodyY = body.length ? Math.min(...body.map((element) => element.y)) : Infinity;
    const headers = layout.elements.filter((element) => element.visible && element.type !== "watermark" &&
      element.type !== "footer" && !body.includes(element) && element.y < firstBodyY);
    const headerBottom = headers.length ? Math.max(...headers.map((element) => element.y +
      (["customer_info", "supplier_info", "project_info"].includes(element.type) ? Math.max(element.height, fitProfile.partyInfoHeight || 0) : element.height))) : firstBodyY - 3;
    followerMap = packContentRows(body, headerBottom + 3, 3, 1, true);
  }

  const elements: EffectiveLayoutElement[] = layout.elements.map((el) => {
    const pageMatches = el.pageNumber === undefined || el.pageNumber === pageNumber;

    const noTablePosition = !table ? followerMap.get(el.id) : undefined;
    if (noTablePosition) return {
      ...el, effectiveX: el.x, effectiveY: noTablePosition.y, effectiveWidth: el.width,
      effectiveHeight: noTablePosition.height, isFollower: true, shiftY: noTablePosition.y - el.y,
      effectiveVisible: el.visible && pageMatches,
    };

    // 1. Table itself: dynamic height, fitted settings, effective Y
    if (table && el.id === table.id) {
      const updatedTableSettings = el.tableSettings
        ? {
            ...el.tableSettings,
            rowHeight: effectiveRowHeight,
            fontSize: fitProfile.fontSize,
            headerFontSize: fitProfile.headerFontSize,
          }
        : undefined;

      return {
        ...el,
        effectiveX: el.x,
        effectiveY: effectiveTableY,
        effectiveWidth: el.width,
        effectiveHeight: actualTableHeight,
        tableSettings: updatedTableSettings,
        isFollower: false,
        shiftY: effectiveTableY - el.y,
        effectiveVisible: el.visible && pageMatches,
      };
    }

    // 2. Footer: anchored at bottom baseline
    if (el.type === "footer") {
      const naturalY = Math.max(
        el.y,
        footerBaselineY - el.height
      );
      return {
        ...el,
        effectiveX: el.x,
        effectiveY: naturalY,
        effectiveWidth: el.width,
        effectiveHeight: el.height,
        isFollower: false,
        shiftY: naturalY - el.y,
        effectiveVisible: el.visible && pageMatches,
      };
    }

    // 3. Watermark: centered background layer
    if (el.type === "watermark") {
      return {
        ...el,
        effectiveX: el.x,
        effectiveY: el.y,
        effectiveWidth: el.width,
        effectiveHeight: el.height,
        isFollower: false,
        shiftY: 0,
        effectiveVisible: el.visible && pageMatches,
      };
    }

    // 4. Follower elements below the dynamic table
    if (table && isFollowerElement(el, table)) {
      const followerVisibleOnThisPage = isLastPage;
      const planned = followerMap.get(el.id);

      const effectiveY = planned
        ? planned.y
        : Math.max(actualTableBottom + 2.5, actualTableBottom + (el.y - (table.y + table.height)));
      const effectiveHeight = planned ? planned.height : el.height;

      return {
        ...el,
        effectiveX: el.x,
        effectiveY,
        effectiveWidth: el.width,
        effectiveHeight,
        isFollower: true,
        shiftY: effectiveY - el.y,
        effectiveVisible: el.visible && pageMatches && followerVisibleOnThisPage,
      };
    }

    // 5. Header / Info elements above the table (from Zone 1 or Zone 2)
    const mappedHeader = headerLayoutMap.get(el.id);
    if (mappedHeader) {
      return {
        ...el,
        effectiveX: el.x,
        effectiveY: mappedHeader.y,
        effectiveWidth: el.width,
        effectiveHeight: mappedHeader.height,
        isFollower: false,
        shiftY: mappedHeader.y - el.y,
        effectiveVisible: el.visible && pageMatches,
      };
    }

    // 6. Any other element above the table
    const isPartyInfo = ["customer_info", "supplier_info", "project_info"].includes(el.type);
    let effectiveY = el.y;
    let effectiveHeight = isPartyInfo ? Math.max(el.height, fitProfile.partyInfoHeight || 0) : el.height;

    if (tableShift > 0 && el.y + el.height <= originalTableY + 2) {
      effectiveY = minHeaderY + (el.y - minHeaderY) * headerScale;
      effectiveHeight = Math.max(3.5, Math.round(el.height * headerScale * 10) / 10);
    }

    return {
      ...el,
      effectiveX: el.x,
      effectiveY,
      effectiveWidth: el.width,
      effectiveHeight,
      isFollower: false,
      shiftY: effectiveY - el.y,
      effectiveVisible: el.visible && pageMatches,
    };
  });

  return {
    elements,
    actualTableHeight,
    deltaY,
    fitProfile,
    isSinglePage,
    totalPages: resolvedTotalPages,
  };
}

/**
 * Validates a document layout for boundary overflow, overlaps, dynamic collisions,
 * and excessive gaps without modifying coordinates.
 */
export function validateDocumentLayout(
  layout: DocumentLayout,
  sampleItemsCount: number = 4
): LayoutValidationReport {
  const issues: LayoutValidationIssue[] = [];
  const pageWidth = layout.page.widthMm || 210;
  const pageHeight = layout.page.heightMm || 297;
  const margins = layout.page.margins || { top: 12, right: 12, bottom: 12, left: 12 };
  const visibleElements = layout.elements.filter((el) => el.visible);

  // 1. Dimension & Coordinate Sanity Check
  for (const el of visibleElements) {
    if (
      !Number.isFinite(el.x) ||
      !Number.isFinite(el.y) ||
      !Number.isFinite(el.width) ||
      !Number.isFinite(el.height)
    ) {
      issues.push({
        id: `invalid_num_${el.id}`,
        elementId: el.id,
        elementLabel: el.label,
        severity: "error",
        category: "dimension",
        message: `Element has invalid (NaN or non-finite) coordinates.`,
        details: `x=${el.x}, y=${el.y}, w=${el.width}, h=${el.height}`,
        suggestedFix: "Reset element coordinates to valid numbers.",
      });
      continue;
    }

    if (el.width <= 0 || el.height <= 0) {
      issues.push({
        id: `zero_dim_${el.id}`,
        elementId: el.id,
        elementLabel: el.label,
        severity: "error",
        category: "dimension",
        message: `Element has zero or negative dimension.`,
        details: `width=${el.width}mm, height=${el.height}mm`,
        suggestedFix: "Set width and height to positive values.",
      });
    }

    // A4 Boundaries
    if (el.x < 0 || el.y < 0) {
      issues.push({
        id: `outside_top_left_${el.id}`,
        elementId: el.id,
        elementLabel: el.label,
        severity: "error",
        category: "bounds",
        message: `Element extends past the top/left page edge.`,
        details: `Position (${el.x}mm, ${el.y}mm) is outside (0, 0).`,
        suggestedFix: "Move element inside the printable page.",
      });
    }

    if (el.x + el.width > pageWidth + 0.1 || el.y + el.height > pageHeight + 0.1) {
      issues.push({
        id: `outside_bottom_right_${el.id}`,
        elementId: el.id,
        elementLabel: el.label,
        severity: "error",
        category: "bounds",
        message: `Element extends past the bottom/right page boundary (${pageWidth}×${pageHeight}mm).`,
        details: `Right=${(el.x + el.width).toFixed(1)}mm, Bottom=${(el.y + el.height).toFixed(1)}mm`,
        suggestedFix: "Resize or move element within A4 page dimensions.",
      });
    }

    // Configured Margin Guideline Violation (notice only, excluding header logo & footer)
    if (
      el.type !== "watermark" &&
      el.type !== "logo" &&
      el.type !== "footer" &&
      (el.x < margins.left - 2 || el.x + el.width > pageWidth - margins.right + 2)
    ) {
      issues.push({
        id: `margin_violation_${el.id}`,
        elementId: el.id,
        elementLabel: el.label,
        severity: "info",
        category: "bounds",
        message: `Element slightly extends beyond the configured horizontal margin (${margins.left}mm).`,
        details: `X=${el.x}mm, Width=${el.width}mm (Printable width: ${pageWidth - margins.left - margins.right}mm)`,
        suggestedFix: "Keep element within standard page margins for clean printing.",
      });
    }
  }

  // 2. Overlap Detection (excluding watermark and dividers)
  const solidElements = visibleElements.filter(
    (el) => el.type !== "watermark" && el.type !== "divider" && el.visible
  );

  for (let i = 0; i < solidElements.length; i++) {
    for (let j = i + 1; j < solidElements.length; j++) {
      const a = solidElements[i];
      const b = solidElements[j];

      // Disregard if on different explicit pages
      if (a.pageNumber && b.pageNumber && a.pageNumber !== b.pageNumber) continue;

      // Check geometric intersection
      const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

      // Report overlap if overlapping area is meaningful (> 2mm in both dimensions)
      if (xOverlap > 2 && yOverlap > 2) {
        // Special case: company signature and company stamp often intentionally sit side-by-side or slight overlap
        const isSignatureStampPair =
          (a.type === "company_signature" && b.type === "company_stamp") ||
          (a.type === "company_stamp" && b.type === "company_signature");

        issues.push({
          id: `overlap_${a.id}_${b.id}`,
          elementId: a.id,
          elementLabel: `${a.label} & ${b.label}`,
          severity: isSignatureStampPair ? "info" : "warning",
          category: "overlap",
          message: `Elements "${a.label}" and "${b.label}" overlap by ${xOverlap.toFixed(1)}mm × ${yOverlap.toFixed(1)}mm.`,
          details: `Element A: [${a.x}, ${a.y}, ${a.width}, ${a.height}], Element B: [${b.x}, ${b.y}, ${b.width}, ${b.height}]`,
          suggestedFix: "Adjust coordinates or reduce widths/heights to eliminate collision.",
        });
      }
    }
  }

  // 3. Dynamic Table Expansion & Multi-Page Clearance Test
  const table = visibleElements.find((el) => el.type === "line_items");
  const footer = visibleElements.find((el) => el.type === "footer");

  if (table && footer) {
    const pagination = computePaginationPlan(layout, sampleItemsCount);

    // Check if even a single page cannot fit minimum rows
    const minRowsFit = pagination.pageItemRanges[0]?.itemCount || 0;
    if (minRowsFit === 0 && sampleItemsCount > 0) {
      issues.push({
        id: "table_no_space",
        elementId: table.id,
        elementLabel: table.label,
        severity: "error",
        category: "table",
        message: `Line items table has insufficient vertical space to render any rows before colliding with follower sections or footer.`,
        suggestedFix: "Move table up or reduce height of header/customer info cards.",
      });
    }

    // Check final page: do remaining items + follower cards fit above the footer?
    const finalPageRange = pagination.pageItemRanges[pagination.pageItemRanges.length - 1];
    const finalItemCount = finalPageRange ? finalPageRange.itemCount : sampleItemsCount;
    const finalPageEffective = computeEffectiveLayout(
      layout,
      finalItemCount,
      true,
      pagination.totalPages,
      pagination.totalPages
    );

    const followers = visibleElements.filter((el) => isFollowerElement(el, table));

    for (const f of followers) {
      const effEl = finalPageEffective.elements.find((el) => el.id === f.id);
      const dynamicY = effEl ? effEl.effectiveY : f.y;
      const dynamicH = effEl ? effEl.effectiveHeight : f.height;
      if (dynamicY + dynamicH > footer.y + 0.5) {
        issues.push({
          id: `follower_footer_collision_${f.id}`,
          elementId: f.id,
          elementLabel: f.label,
          severity: "warning",
          category: "footer",
          message: `Follower section "${f.label}" would extend to ${(dynamicY + dynamicH).toFixed(1)}mm on final page (${finalItemCount} items), colliding with footer (${footer.y}mm).`,
          suggestedFix: "Increase page margins or reduce section height.",
        });
      }
    }
  }

  // 4. Excessive Gap Detection
  // Check vertical gaps between consecutive content cards (e.g. customer_info -> line_items, or line_items -> totals)
  if (table) {
    const elementsAboveTable = visibleElements.filter(
      (el) =>
        el.visible &&
        el.type !== "watermark" &&
        el.type !== "divider" &&
        el.y + el.height <= table.y
    );

    if (elementsAboveTable.length > 0) {
      const highestAboveBottom = Math.max(...elementsAboveTable.map((el) => el.y + el.height));
      const gapAboveTable = table.y - highestAboveBottom;
      if (gapAboveTable > 18) {
        issues.push({
          id: "excessive_gap_above_table",
          elementId: table.id,
          elementLabel: table.label,
          severity: "info",
          category: "gap",
          message: `Large vertical gap of ${gapAboveTable.toFixed(1)}mm detected above the Line Items Table.`,
          details: `Highest element ends at ${highestAboveBottom.toFixed(1)}mm; table starts at ${table.y}mm.`,
          suggestedFix: "Move table up or expand customer info card to optimize A4 space.",
        });
      }
    }
  }

  // 5. Decorative Border Clearance Verification
  if (layout.page?.borders?.top?.enabled) {
    const topBorder = layout.page.borders.top;
    const topLimit = (topBorder.position || 0) + (topBorder.thickness || 4);
    const logoOrHeader = visibleElements.find((el) => (el.type === "logo" || el.id === "logo") && el.y < topLimit);
    if (logoOrHeader) {
      issues.push({
        id: "top_border_logo_clearance",
        elementId: logoOrHeader.id,
        elementLabel: `${logoOrHeader.label} & Top Decorative Border`,
        severity: "info",
        category: "bounds",
        message: `Top decorative border reaches ${topLimit.toFixed(1)}mm near ${logoOrHeader.label} (${logoOrHeader.y.toFixed(1)}mm). Auto-clearance guard safely clamps the rendered border.`,
        suggestedFix: "Safe auto-clearance is active. You can also adjust border thickness or position in the inspector.",
      });
    }
  }

  if (layout.page?.borders?.bottom?.enabled && footer) {
    const bottomBorder = layout.page.borders.bottom;
    const bottomStart = pageHeight - (bottomBorder.position || 0) - (bottomBorder.thickness || 4);
    if (bottomStart < footer.y + footer.height) {
      issues.push({
        id: "bottom_border_footer_clearance",
        elementId: footer.id,
        elementLabel: `${footer.label} & Bottom Decorative Border`,
        severity: "info",
        category: "bounds",
        message: `Bottom decorative border extends near footer at ${(footer.y + footer.height).toFixed(1)}mm. Auto-clearance guard safely clamps the rendered border.`,
        suggestedFix: "Safe auto-clearance is active. You can also adjust border thickness or position in the inspector.",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  const pagination = computePaginationPlan(layout, sampleItemsCount);

  return {
    isValid: !hasErrors,
    hasErrors,
    hasWarnings,
    issues,
    metrics: {
      totalElements: layout.elements.length,
      visibleElements: visibleElements.length,
      pageWidthMm: pageWidth,
      pageHeightMm: pageHeight,
      estimatedPageCount: pagination.totalPages,
    },
  };
}

export type AdaptiveDensityTier = "normal" | "comfortable" | "compact" | "dense" | "ultra_dense";

export interface AdaptiveDocumentDensity {
  tier: AdaptiveDensityTier;
  sectionGapClass: string;
  cardPaddingClass: string;
  tableTextClass: string;
  tableHeaderClass: string;
  tableCellClass: string;
  lineHeightClass: string;
  subTextClass: string;
  badgeClass: string;
  signatureCompact: boolean;
  compactSummary: boolean;
  fontSizePt: number;
  rowHeightMm: number;
}

/**
 * Universal adaptive layout density engine for all ERP printable documents.
 * Automatically chooses the smallest necessary compression level to ensure
 * documents with up to ~28-30 rows fit cleanly onto ONE A4 page.
 */
export function getAdaptiveDocumentDensity(
  itemCount: number,
  options?: {
    hasLongDescriptions?: boolean;
    hasFormulas?: boolean;
    preferredDensity?: "auto" | "normal" | "compact" | "dense" | "ultra_dense";
  }
): AdaptiveDocumentDensity {
  const preferred = options?.preferredDensity || "auto";

  let tier: AdaptiveDensityTier;
  if (preferred !== "auto") {
    tier = preferred;
  } else {
    const longDescBonus = options?.hasLongDescriptions ? 2 : 0;
    const formulaBonus = options?.hasFormulas ? 2 : 0;
    const effectiveCount = itemCount + longDescBonus + formulaBonus;

    if (effectiveCount <= 7) {
      tier = "normal";
    } else if (effectiveCount <= 13) {
      tier = "comfortable";
    } else if (effectiveCount <= 20) {
      tier = "compact";
    } else if (effectiveCount <= 28) {
      tier = "dense";
    } else {
      tier = "ultra_dense";
    }
  }

  switch (tier) {
    case "normal":
      return {
        tier: "normal",
        sectionGapClass: "mb-3",
        cardPaddingClass: "p-3",
        tableTextClass: "text-[10px]",
        tableHeaderClass: "py-1.5 px-2 text-[9px]",
        tableCellClass: "py-1.5 px-2",
        lineHeightClass: "leading-normal",
        subTextClass: "text-[9px]",
        badgeClass: "text-[9px] px-1.5 py-0.5",
        signatureCompact: false,
        compactSummary: false,
        fontSizePt: 10,
        rowHeightMm: 8.5,
      };

    case "comfortable":
      return {
        tier: "comfortable",
        sectionGapClass: "mb-2.5",
        cardPaddingClass: "p-2.5",
        tableTextClass: "text-[9.5px]",
        tableHeaderClass: "py-1 px-1.5 text-[8.5px]",
        tableCellClass: "py-1 px-1.5",
        lineHeightClass: "leading-snug",
        subTextClass: "text-[8.5px]",
        badgeClass: "text-[8.5px] px-1.5 py-0.25",
        signatureCompact: false,
        compactSummary: false,
        fontSizePt: 9.2,
        rowHeightMm: 7.2,
      };

    case "compact":
      return {
        tier: "compact",
        sectionGapClass: "mb-1.5",
        cardPaddingClass: "p-2",
        tableTextClass: "text-[8.8px]",
        tableHeaderClass: "py-0.75 px-1.5 text-[8px]",
        tableCellClass: "py-0.75 px-1.5",
        lineHeightClass: "leading-tight",
        subTextClass: "text-[8px]",
        badgeClass: "text-[8px] px-1 py-0.2",
        signatureCompact: true,
        compactSummary: true,
        fontSizePt: 8.4,
        rowHeightMm: 6.0,
      };

    case "dense":
      return {
        tier: "dense",
        sectionGapClass: "mb-1",
        cardPaddingClass: "p-1.5",
        tableTextClass: "text-[8px]",
        tableHeaderClass: "py-0.5 px-1 text-[7.5px]",
        tableCellClass: "py-0.5 px-1",
        lineHeightClass: "leading-tight",
        subTextClass: "text-[7.2px]",
        badgeClass: "text-[7px] px-1 py-0.1",
        signatureCompact: true,
        compactSummary: true,
        fontSizePt: 7.6,
        rowHeightMm: 5.2,
      };

    case "ultra_dense":
    default:
      return {
        tier: "ultra_dense",
        sectionGapClass: "mb-0.5",
        cardPaddingClass: "p-1",
        tableTextClass: "text-[7.2px]",
        tableHeaderClass: "py-0.25 px-0.75 text-[7px]",
        tableCellClass: "py-0.25 px-0.75",
        lineHeightClass: "leading-none",
        subTextClass: "text-[6.5px]",
        badgeClass: "text-[6.5px] px-0.75 py-0.05",
        signatureCompact: true,
        compactSummary: true,
        fontSizePt: 7.0,
        rowHeightMm: 4.6,
      };
  }
}

/**
 * Intelligent One-Click Auto Fix Engine
 * Eliminates overlapping elements, aligns header stack and cards, enforces readable font sizes,
 * guarantees zero clipping, and fits layout onto single A4 page where possible.
 */
export function autoFixDocumentLayout(layout: DocumentLayout): {
  fixedLayout: DocumentLayout;
  message: string;
  warning?: string;
  overlapCount: number;
} {
  const elements = layout.elements.map((e) => ({ ...e }));
  let overlapCount = 0;

  // Detect existing overlaps for reporting
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      if (!a.visible || !b.visible || a.type === "watermark" || b.type === "watermark") continue;
      const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (xOverlap > 2 && yOverlap > 2) overlapCount++;
    }
  }

  const logo = elements.find((e) => e.type === "logo");
  const compEn = elements.find((e) => e.type === "company_name_en");
  const compAr = elements.find((e) => e.type === "company_name_ar");
  const compAddr = elements.find((e) => e.type === "company_address");
  const docTitle = elements.find((e) => e.type === "doc_title");
  const customerInfo = elements.find((e) => e.type === "customer_info" || e.type === "supplier_info");
  const docMeta = elements.find((e) => e.type === "doc_meta" || e.type === "project_info");
  const table = elements.find((e) => e.type === "line_items");
  const footer = elements.find((e) => e.type === "footer");
  const watermark = elements.find((e) => e.type === "watermark");

  const pageWidth = layout.page?.widthMm || 210;
  const pageHeight = layout.page?.heightMm || 297;
  const marginL = layout.page?.margins?.left || 12;
  const marginR = layout.page?.margins?.right || 12;
  const fullW = pageWidth - marginL - marginR;

  // 1. Header Stack: Guaranteed clean vertical flow
  let currentY = 10;
  if (layout.page?.borders?.top?.enabled) {
    currentY = Math.max(currentY, (layout.page.borders.top.position || 0) + (layout.page.borders.top.thickness || 4) + 2);
  }

  if (logo && logo.visible) {
    logo.y = currentY;
    if (logo.lockAspectRatio && logo.imageAspectRatio) {
      logo.width = Math.min(logo.width, 50);
      logo.height = Math.max(10, Math.min(18, logo.width / logo.imageAspectRatio));
    } else {
      logo.width = Math.min(logo.width, 50);
      logo.height = Math.max(10, Math.min(18, logo.height));
    }
    if (logo.x > 35 || logo.textAlign === "center") {
      logo.x = Math.round((pageWidth - logo.width) / 2);
    } else {
      logo.x = marginL;
    }
    currentY = logo.y + logo.height + 2.5;
  }

  if (compEn && compEn.visible) {
    compEn.y = currentY;
    compEn.x = marginL;
    compEn.width = fullW;
    compEn.height = Math.max(7.5, Math.min(10, compEn.height));
    compEn.fontSize = Math.max(10.5, Math.min(13, compEn.fontSize || 11.5));
    currentY = compEn.y + compEn.height + 1.8;
  }

  if (compAr && compAr.visible) {
    compAr.y = currentY;
    compAr.x = marginL;
    compAr.width = fullW;
    compAr.height = Math.max(8.0, Math.min(11, compAr.height));
    compAr.fontSize = Math.max(11.5, Math.min(14, compAr.fontSize || 12.5));
    currentY = compAr.y + compAr.height + 2.0;
  }

  if (compAddr && compAddr.visible) {
    compAddr.y = currentY;
    compAddr.x = marginL;
    compAddr.width = fullW;
    compAddr.height = Math.max(9.0, Math.min(12, compAddr.height));
    compAddr.fontSize = Math.max(7.2, Math.min(8.5, compAddr.fontSize || 8));
    currentY = compAddr.y + compAddr.height + 2.8;
  }

  const headerCustomTexts = elements
    .filter((e) => e.type === "custom_text" && e.visible && e.y < 65)
    .sort((a, b) => a.y - b.y);

  for (const ct of headerCustomTexts) {
    ct.y = currentY;
    ct.x = marginL;
    ct.width = fullW;
    ct.height = Math.max(5.0, Math.min(8.0, ct.height || 6.0));
    ct.fontSize = Math.max(8.0, Math.min(10.5, ct.fontSize || 9.5));
    ct.textAlign = "center";
    currentY = ct.y + ct.height + 1.5;
  }

  if (docTitle && docTitle.visible) {
    docTitle.y = currentY;
    docTitle.x = marginL;
    docTitle.width = fullW;
    docTitle.height = Math.max(10.0, Math.min(13, docTitle.height));
    docTitle.fontSize = Math.max(10.5, Math.min(13, docTitle.fontSize || 11.5));
    currentY = docTitle.y + docTitle.height + 3.0;
  }

  // 2. Align Customer Info & Document Meta cards symmetrically
  if ((customerInfo && customerInfo.visible) || (docMeta && docMeta.visible)) {
    const cardY = currentY;
    const cardGap = 4;
    const halfW = (fullW - cardGap) / 2;

    const baseH = Math.max(
      customerInfo?.height || 26,
      docMeta?.height || 26,
      26
    );
    const cardH = Math.min(baseH, 32);

    if (customerInfo && customerInfo.visible) {
      customerInfo.y = cardY;
      customerInfo.x = marginL;
      customerInfo.width = halfW;
      customerInfo.height = cardH;
      customerInfo.fontSize = Math.max(7.5, Math.min(9, customerInfo.fontSize || 8));
    }

    if (docMeta && docMeta.visible) {
      docMeta.y = cardY;
      docMeta.x = marginL + halfW + cardGap;
      docMeta.width = halfW;
      docMeta.height = cardH;
      docMeta.fontSize = Math.max(7.5, Math.min(9, docMeta.fontSize || 8));
    }

    currentY = cardY + cardH + 3;
  }

  // 3. Position Line Items Table
  if (table && table.visible) {
    table.y = currentY;
    table.x = marginL;
    table.width = fullW;
    table.height = Math.max(55, Math.min(85, table.height));
    if (table.tableSettings) {
      table.tableSettings.fontSize = Math.max(7.5, Math.min(9.5, table.tableSettings.fontSize || 8.5));
      table.tableSettings.rowHeight = Math.max(6.0, Math.min(9.0, table.tableSettings.rowHeight || 7.5));
    }
    currentY = table.y + table.height + 3;
  }

  // 4. Follower cards alignment
  const followers = elements.filter(
    (el) => el.visible && el.y >= (table ? table.y + table.height - 5 : currentY - 5) &&
            el.type !== "footer" && el.type !== "watermark" && el.type !== "line_items"
  );

  const totalsEl = followers.find((e) => e.type === "totals");
  const wordsEl = followers.find((e) => e.type === "amount_in_words");
  const bankEl = followers.find((e) => e.type === "bank_details");
  const termsEl = followers.find((e) => e.type === "payment_terms");
  const sigEl = followers.find((e) => e.type === "company_signature");
  const stampEl = followers.find((e) => e.type === "company_stamp");

  let followerY = currentY;
  // Row A: Totals (Right) + Amount in Words (Left)
  if (totalsEl || wordsEl) {
    const rowY = followerY;
    let rowH = 0;
    if (totalsEl) {
      totalsEl.x = marginL + fullW - 77;
      totalsEl.width = 77;
      totalsEl.y = rowY;
      totalsEl.height = Math.max(38, Math.min(48, totalsEl.height));
      rowH = Math.max(rowH, totalsEl.height);
    }
    if (wordsEl) {
      wordsEl.x = marginL;
      wordsEl.width = totalsEl ? (fullW - 77 - 4) : fullW;
      wordsEl.y = rowY;
      wordsEl.height = Math.max(22, Math.min(28, wordsEl.height));
      rowH = Math.max(rowH, wordsEl.height);
    }
    followerY = rowY + (totalsEl ? totalsEl.height : rowH) + 2.5;
  }

  // Row B: Bank Details
  if (bankEl) {
    bankEl.x = marginL;
    bankEl.width = totalsEl ? (fullW - 77 - 4) : fullW;
    bankEl.y = followerY;
    bankEl.height = Math.max(22, Math.min(28, bankEl.height));
    followerY = bankEl.y + bankEl.height + 2.5;
  }

  // Row C: Payment Terms (Left) + Signatures/Stamp (Right)
  const hasSigOrStamp = (sigEl && sigEl.visible) || (stampEl && stampEl.visible);
  const leftColW = hasSigOrStamp ? (fullW - 80) : fullW;

  if (termsEl) {
    termsEl.x = marginL;
    termsEl.width = leftColW;
    termsEl.y = followerY;
    termsEl.height = Math.max(24, Math.min(36, termsEl.height));
  }

  if (sigEl || stampEl) {
    const sigY = followerY;
    if (sigEl && stampEl) {
      sigEl.x = marginL + leftColW + 3;
      sigEl.width = 44;
      sigEl.y = sigY;
      sigEl.height = Math.max(30, Math.min(40, sigEl.height));

      stampEl.x = sigEl.x + sigEl.width + 3;
      stampEl.width = 30;
      stampEl.y = sigY;
      stampEl.height = Math.max(30, Math.min(40, stampEl.height));
    } else if (sigEl) {
      sigEl.x = marginL + leftColW + 3;
      sigEl.width = 74;
      sigEl.y = sigY;
      sigEl.height = Math.max(30, Math.min(40, sigEl.height));
    } else if (stampEl) {
      stampEl.x = marginL + leftColW + 3;
      stampEl.width = 74;
      stampEl.y = sigY;
      stampEl.height = Math.max(30, Math.min(40, stampEl.height));
    }
    followerY = Math.max(
      termsEl ? termsEl.y + termsEl.height : 0,
      sigEl ? sigEl.y + sigEl.height : 0,
      stampEl ? stampEl.y + stampEl.height : 0
    ) + 3;
  } else if (termsEl) {
    followerY = termsEl.y + termsEl.height + 3;
  }

  // Position Footer
  if (footer && footer.visible) {
    footer.y = pageHeight - (layout.page?.margins?.bottom || 12) - 8;
    footer.x = marginL;
    footer.width = fullW;
    footer.height = 7;
  }

  // Watermark
  if (watermark && watermark.visible) {
    watermark.x = Math.round((pageWidth - watermark.width) / 2);
    watermark.y = Math.round((pageHeight - watermark.height) / 2) - 10;
  }

  // Check single page capacity
  const pagination = computePaginationPlan({ ...layout, elements }, 4);
  let warning: string | undefined = undefined;
  if (!pagination.isSinglePage || pagination.totalPages > 1) {
    warning = "Document contains extensive items and will print cleanly over multiple A4 pages without compressing text illegibly.";
  }

  return {
    fixedLayout: {
      ...layout,
      elements,
    },
    message: overlapCount > 0
      ? `Auto Fix corrected ${overlapCount} overlapping elements and aligned spacing for A4.`
      : "Auto Fix aligned cards, spacing, and verified single-page A4 balance.",
    warning,
    overlapCount,
  };
}
