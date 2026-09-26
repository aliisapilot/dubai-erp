/**
 * ==============================================================================
 * Dubai ERP: Document Layout Engine & Flow Positioning
 * ==============================================================================
 * Dynamic line-item height calculation, intelligent multi-page pagination,
 * flow-aware follower positioning, A4 boundary enforcement, and non-destructive
 * layout validation.
 * ==============================================================================
 */

import { DocumentLayout, LayoutElement } from "./documentDesigner";

export interface EffectiveLayoutElement extends LayoutElement {
  effectiveX: number;
  effectiveY: number;
  effectiveWidth: number;
  effectiveHeight: number;
  isFollower?: boolean;
  shiftY?: number;
  effectiveVisible?: boolean;
}

export type FitLevel = "standard" | "comfortable" | "compact" | "dense" | "multi_page";

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
  warning?: string;
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

/**
 * Calculates estimated line wrapping height for a single table item row
 */
export function calculateItemRowHeight(
  baseRowHeight: number,
  description?: string
): number {
  if (!description) return baseRowHeight;
  const lines = description.split("\n");
  let totalVisualLines = 0;
  for (const line of lines) {
    totalVisualLines += Math.max(1, Math.ceil(line.length / 55));
  }
  const extraLines = Math.max(0, totalVisualLines - 1);
  // Each extra wrapped line adds ~3.2mm in rendered print height
  return baseRowHeight + (extraLines * 3.2);
}

/**
 * Calculates the exact rendered height in mm of a table with N items
 */
export function calculateTableRenderedHeight(
  tableElement: LayoutElement | undefined,
  itemCount: number,
  itemsData?: ItemDescriptionLike[],
  rowHeightOverride?: number,
  headerHeightOverride?: number
): number {
  if (!tableElement) return 0;
  const baseRowHeight = rowHeightOverride || Math.max(4, tableElement.tableSettings?.rowHeight || 8.5);
  const headerFontSize = tableElement.tableSettings?.headerFontSize || 10;
  const headerHeight = headerHeightOverride || Math.max(6, Math.max(baseRowHeight, headerFontSize * 0.35 + 4));
  const effectiveCount = Math.max(1, itemCount);

  let itemsHeight = 0;
  if (itemsData && itemsData.length > 0) {
    const slice = itemsData.slice(0, effectiveCount);
    for (const it of slice) {
      itemsHeight += calculateItemRowHeight(baseRowHeight, it.description);
    }
  } else {
    itemsHeight = effectiveCount * baseRowHeight;
  }

  // Add 1.5mm for outer table borders and cell padding
  return headerHeight + itemsHeight + 1.5;
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
export function calculateFollowerVerticalSpan(
  followers: LayoutElement[],
  scale: number,
  gap: number
): number {
  if (followers.length === 0) return 0;

  // Group followers into visual columns
  // Column 1: Left / Center (x < 115) e.g. amount_in_words, bank_details, payment_terms
  // Column 2: Right (x >= 115) e.g. totals, company_signature, company_stamp
  const colLeft = followers.filter((f) => f.x < 115);
  const colRight = followers.filter((f) => f.x >= 115);

  const measureCol = (col: LayoutElement[]) => {
    if (col.length === 0) return 0;
    const sorted = [...col].sort((a, b) => a.y - b.y);
    const rows: LayoutElement[][] = [];
    for (const el of sorted) {
      const existingRow = rows.find((r) => Math.abs(r[0].y - el.y) < 5);
      if (existingRow) existingRow.push(el);
      else rows.push([el]);
    }
    let totalH = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowMaxH = Math.max(...rows[i].map((el) => el.height * scale));
      totalH += rowMaxH;
      if (i < rows.length - 1) totalH += gap;
    }
    return totalH;
  };

  const spanLeft = measureCol(colLeft);
  const spanRight = measureCol(colRight);
  return Math.max(spanLeft, spanRight);
}

/**
 * Computes an intelligent single-page A4 fitting profile for a given layout and item count.
 * Evaluates four levels of non-destructive content tightening (standard, comfortable, compact, dense)
 * before determining if multi-page pagination is genuinely required.
 */
export function computeIntelligentFitProfile(
  layout: DocumentLayout,
  totalItems: number,
  itemsData?: ItemDescriptionLike[]
): FitProfile {
  const table = layout.elements.find((el) => el.type === "line_items" && el.visible);
  const footer = layout.elements.find((el) => el.type === "footer" && el.visible);
  const footerY = footer ? footer.y : layout.page.heightMm - layout.page.margins.bottom - 16;
  const safetyBottom = footerY - 2.5;

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
    };
  }

  // Elements above table (ignoring watermark)
  const elementsAbove = layout.elements.filter(
    (el) => el.visible && el.type !== "watermark" && el.y + el.height <= table.y + 2
  );
  const maxAboveBottom = elementsAbove.length > 0
    ? Math.max(...elementsAbove.map((el) => el.y + el.height))
    : 60;

  const followers = layout.elements.filter(
    (el) => el.visible && isFollowerElement(el, table)
  );

  // Progressive intelligent compaction tiers designed to keep A4 documents on one page
  const tiers: Array<{
    level: "standard" | "comfortable" | "compact" | "dense";
    rowHeight: number;
    headerHeight: number;
    fontSize: number;
    headerFontSize: number;
    followerScale: number;
    gap: number;
    allowSlideTableUp: boolean;
  }> = [
    {
      level: "standard",
      rowHeight: Math.max(8.5, table.tableSettings?.rowHeight || 9.0),
      headerHeight: 7.5,
      fontSize: table.tableSettings?.fontSize || 10.5,
      headerFontSize: table.tableSettings?.headerFontSize || 10.5,
      followerScale: 1.0,
      gap: 3.0,
      allowSlideTableUp: false,
    },
    {
      level: "comfortable",
      rowHeight: 8.0,
      headerHeight: 7.2,
      fontSize: 9.5,
      headerFontSize: 9.5,
      followerScale: 0.92,
      gap: 2.5,
      allowSlideTableUp: true,
    },
    {
      level: "compact",
      rowHeight: 7.0,
      headerHeight: 6.5,
      fontSize: 9.0,
      headerFontSize: 9.0,
      followerScale: 0.84,
      gap: 2.0,
      allowSlideTableUp: true,
    },
    {
      level: "dense",
      rowHeight: 6.0,
      headerHeight: 6.0,
      fontSize: 8.2,
      headerFontSize: 8.2,
      followerScale: 0.76,
      gap: 1.5,
      allowSlideTableUp: true,
    },
  ];

  for (const tier of tiers) {
    // If compaction is enabled, tighten excessive gap between header/customer cards and table
    const tableY = tier.allowSlideTableUp
      ? Math.max(maxAboveBottom + 2.5, Math.min(table.y, maxAboveBottom + 5))
      : table.y;

    const tableHeight = calculateTableRenderedHeight(
      table,
      totalItems,
      itemsData,
      tier.rowHeight,
      tier.headerHeight
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
      };
    }
  }

  // When content legitimately exceeds single A4 capacity even under dense tier
  return {
    fits: false,
    level: "multi_page",
    rowHeight: 7.5,
    headerHeight: 7.0,
    fontSize: 9.0,
    headerFontSize: 9.0,
    followerScale: 0.88,
    gap: 2.5,
    tableY: table.y,
    tableHeight: calculateTableRenderedHeight(table, totalItems, itemsData, 7.5, 7.0),
    followerSpan: calculateFollowerVerticalSpan(followers, 0.88, 2.5),
    totalContentBottom: 310,
    footerY,
    warning: `Document exceeds single-page A4 capacity (${totalItems} items). Formatted cleanly for multi-page printing without data loss.`,
  };
}

/**
 * Computes intelligent pagination for a document layout and total item count
 */
export function computePaginationPlan(
  layout: DocumentLayout,
  totalItems: number,
  itemsData?: ItemDescriptionLike[]
): PaginationPlan {
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
  const fit = computeIntelligentFitProfile(layout, totalItems, itemsData);
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
  const footerTop = footer ? footer.y : layout.page.heightMm - layout.page.margins.bottom - 16;
  const safetyMarginAboveFooter = 3.5;
  const maxContentY = footerTop - safetyMarginAboveFooter;

  const rowHeight = fit.rowHeight;
  const headerHeight = fit.headerHeight;

  // Space on final page (with followers)
  const followerSpan = fit.followerSpan;
  const spaceForTableWithFollowers = Math.max(
    rowHeight * 2,
    maxContentY - fit.tableY - followerSpan - fit.gap - 2
  );
  const maxItemsWithFollowers = Math.max(
    1,
    Math.floor((spaceForTableWithFollowers - headerHeight) / rowHeight)
  );

  // Space on non-final pages (no followers, table utilizes full available vertical height)
  const spaceForTableWithoutFollowers = Math.max(
    rowHeight * 3,
    maxContentY - fit.tableY - 2
  );
  const maxItemsWithoutFollowers = Math.max(
    1,
    Math.floor((spaceForTableWithoutFollowers - headerHeight) / rowHeight)
  );

  const pageItemRanges: PaginationPlan["pageItemRanges"] = [];
  let remaining = totalItems;
  let currentIndex = 0;
  let currentPage = 1;

  while (remaining > 0) {
    if (remaining <= maxItemsWithFollowers) {
      pageItemRanges.push({
        pageNumber: currentPage,
        startIndex: currentIndex,
        endIndex: currentIndex + remaining,
        itemCount: remaining,
        isLastPage: true,
      });
      break;
    }

    const canTake = Math.min(remaining - 1, maxItemsWithoutFollowers);
    const take = Math.max(1, canTake);

    pageItemRanges.push({
      pageNumber: currentPage,
      startIndex: currentIndex,
      endIndex: currentIndex + take,
      itemCount: take,
      isLastPage: false,
    });

    currentIndex += take;
    remaining -= take;
    currentPage += 1;
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
  itemsData?: ItemDescriptionLike[]
): EffectiveLayoutResult {
  const table = layout.elements.find((el) => el.type === "line_items");

  // Determine pagination plan and fit profile
  const paginationPlan = computePaginationPlan(layout, pageItemsCount, itemsData);
  const resolvedTotalPages = totalPages || paginationPlan.totalPages;
  const isSinglePage = resolvedTotalPages === 1;
  const fitProfile = paginationPlan.fitProfile || computeIntelligentFitProfile(layout, pageItemsCount, itemsData);

  const effectiveTableY = isSinglePage && fitProfile.tableY ? fitProfile.tableY : (table ? table.y : 95);
  const effectiveRowHeight = fitProfile.rowHeight;
  const effectiveHeaderHeight = fitProfile.headerHeight;

  const actualTableHeight = table
    ? calculateTableRenderedHeight(table, pageItemsCount, itemsData, effectiveRowHeight, effectiveHeaderHeight)
    : 0;

  const tableDesignedHeight = table ? table.height : 0;
  const deltaY = table ? actualTableHeight - tableDesignedHeight : 0;
  const actualTableBottom = effectiveTableY + actualTableHeight;

  // Footer anchor position
  const footerBaselineY = layout.page.heightMm - layout.page.margins.bottom;

  // Identify follower elements
  const followers = layout.elements.filter((el) => isFollowerElement(el, table));
  const followerMap = new Map<string, { y: number; height: number }>();

  if (followers.length > 0 && isLastPage) {
    const colLeft = followers.filter((f) => f.x < 115);
    const colRight = followers.filter((f) => f.x >= 115);

    const positionColumn = (col: LayoutElement[]) => {
      const sorted = [...col].sort((a, b) => a.y - b.y);
      const rows: LayoutElement[][] = [];
      for (const el of sorted) {
        const existingRow = rows.find((r) => Math.abs(r[0].y - el.y) < 5);
        if (existingRow) existingRow.push(el);
        else rows.push([el]);
      }

      let currentY = actualTableBottom + fitProfile.gap;
      for (const row of rows) {
        const rowHeight = Math.max(
          ...row.map((el) => Math.round(el.height * fitProfile.followerScale * 10) / 10)
        );
        for (const el of row) {
          const scaledH = Math.round(el.height * fitProfile.followerScale * 10) / 10;
          followerMap.set(el.id, { y: currentY, height: scaledH });
        }
        currentY += rowHeight + fitProfile.gap;
      }
    };

    positionColumn(colLeft);
    positionColumn(colRight);
  }

  const elements: EffectiveLayoutElement[] = layout.elements.map((el) => {
    const pageMatches = el.pageNumber === undefined || el.pageNumber === pageNumber;

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

    // 5. Fixed header/info elements above the table
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
