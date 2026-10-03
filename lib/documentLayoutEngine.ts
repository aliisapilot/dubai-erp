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

  const smartFit: SmartFitSettings = layout.page?.smartFit || FALLBACK_SMART_FIT;
  const isSmartFitEnabled = smartFit.enabled !== false;
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

  const effectiveTableY = isSinglePage && fitProfile.tableY ? fitProfile.tableY : (table ? table.y : 95);
  const effectiveRowHeight = fitProfile.rowHeight;
  const effectiveHeaderHeight = fitProfile.headerHeight;

  const actualTableHeight = table
    ? calculateTableRenderedHeight(table, pageItemsCount, itemsData, effectiveRowHeight, effectiveHeaderHeight, fitProfile.fontSize)
    : 0;

  const tableDesignedHeight = table ? table.height : 0;
  const deltaY = table ? actualTableHeight - tableDesignedHeight : 0;
  const actualTableBottom = effectiveTableY + actualTableHeight;

  // Footer anchor position
  const footerBaselineY = layout.page.heightMm - layout.page.margins.bottom;

  // Identify follower elements
  const followers = layout.elements.filter((el) => isFollowerElement(el, table));
  let followerMap = new Map<string, { y: number; height: number }>();

  if (followers.length > 0 && isLastPage) {
    followerMap = packContentRows(followers, actualTableBottom + fitProfile.gap, fitProfile.gap, fitProfile.followerScale);
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

  // Check if header compaction is active (table shifted upwards to fit single A4 page)
  const originalTableY = table ? table.y : 95;
  const tableShift = table && isSinglePage ? originalTableY - effectiveTableY : 0;

  // Elements above table (ignoring watermark)
  const elementsAbove = layout.elements.filter(
    (el) => el.visible && el.type !== "watermark" && el.y + el.height <= originalTableY + 2
  );
  const minHeaderY = elementsAbove.length > 0 ? Math.min(...elementsAbove.map((el) => el.y)) : 10;
  const originalHeaderSpan = Math.max(20, originalTableY - minHeaderY);
  const targetHeaderSpan = Math.max(15, effectiveTableY - fitProfile.gap - minHeaderY);
  const headerScale = tableShift > 0 && fitProfile.level !== "standard" && originalHeaderSpan > 0
    ? Math.min(1.0, targetHeaderSpan / originalHeaderSpan)
    : 1.0;

  // Identify side-by-side party card (customer_info, supplier_info, project_info) and doc_meta card
  const partyElement = layout.elements.find(
    (el) => el.visible && ["customer_info", "supplier_info", "project_info"].includes(el.type)
  );
  const metaElement = layout.elements.find((el) => el.visible && el.type === "doc_meta");

  let partyMetaAlignedY: number | null = null;
  let partyMetaEqualHeight: number | null = null;

  if (partyElement && metaElement && Math.abs(partyElement.y - metaElement.y) <= 8) {
    // 1. Raw alignment
    const rawPartyY = Math.min(partyElement.y, metaElement.y);
    let rawHeight = Math.max(partyElement.height, metaElement.height, fitProfile.partyInfoHeight || 0);

    // 2. Compact cleanly if compact or dense fitProfile is active
    if (isSinglePage && fitProfile.level !== "standard") {
      if (fitProfile.level === "ultra_dense") {
        rawHeight = Math.max(19.5, Math.min(rawHeight, 21.0));
      } else if (fitProfile.level === "dense") {
        rawHeight = Math.max(21.0, Math.min(rawHeight, 22.5));
      } else if (fitProfile.level === "compact") {
        rawHeight = Math.max(22.5, Math.min(rawHeight, 24.5));
      } else if (fitProfile.level === "comfortable") {
        rawHeight = Math.max(24.5, Math.min(rawHeight, 26.5));
      }
    }

    if (tableShift > 0) {
      partyMetaAlignedY = minHeaderY + (rawPartyY - minHeaderY) * headerScale;
      partyMetaEqualHeight = Math.max(18, Math.round(rawHeight * headerScale * 10) / 10);
    } else {
      partyMetaAlignedY = rawPartyY;
      partyMetaEqualHeight = rawHeight;
    }
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

    // 5. Customer info & Document Meta: synchronized horizontal alignment and equal visual heights
    if (
      partyMetaAlignedY !== null &&
      partyMetaEqualHeight !== null &&
      (el.id === partyElement?.id || el.id === metaElement?.id)
    ) {
      return {
        ...el,
        effectiveX: el.x,
        effectiveY: partyMetaAlignedY,
        effectiveWidth: el.width,
        effectiveHeight: partyMetaEqualHeight,
        isFollower: false,
        shiftY: partyMetaAlignedY - el.y,
        effectiveVisible: el.visible && pageMatches,
      };
    }

    // 6. Fixed header/info elements above the table
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
