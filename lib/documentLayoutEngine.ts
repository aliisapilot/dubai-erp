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
}

export interface PaginationPlan {
  totalPages: number;
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

/**
 * Calculates the exact rendered height in mm of a table with N items
 */
export function calculateTableRenderedHeight(
  tableElement: LayoutElement | undefined,
  itemCount: number
): number {
  if (!tableElement) return 0;
  const rowHeight = Math.max(4, tableElement.tableSettings?.rowHeight || 8.5);
  const headerFontSize = tableElement.tableSettings?.headerFontSize || 10;
  const headerHeight = Math.max(7, Math.max(rowHeight, headerFontSize * 0.35 + 4));
  const effectiveCount = Math.max(1, itemCount);
  // Add 1.5mm for outer table borders and cell padding
  return headerHeight + (effectiveCount * rowHeight) + 1.5;
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
 * Computes intelligent pagination for a document layout and total item count
 */
export function computePaginationPlan(
  layout: DocumentLayout,
  totalItems: number
): PaginationPlan {
  const table = layout.elements.find((el) => el.type === "line_items" && el.visible);
  if (!table || totalItems <= 0) {
    return {
      totalPages: 1,
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

  const rowHeight = Math.max(4, table.tableSettings?.rowHeight || 8.5);
  const headerHeight = Math.max(7, table.tableSettings?.headerFontSize ? table.tableSettings.headerFontSize * 0.35 + 4 : rowHeight);
  const footer = layout.elements.find((el) => el.type === "footer" && el.visible);
  const footerTop = footer ? footer.y : layout.page.heightMm - layout.page.margins.bottom - 16;
  const safetyMarginAboveFooter = 5; // mm
  const maxContentY = footerTop - safetyMarginAboveFooter;

  // Identify follower elements on the final page
  const followers = layout.elements.filter((el) => isFollowerElement(el, table));
  const tableBaseline = table.y + table.height;

  let followerBlockSpan = 0;
  if (followers.length > 0) {
    let minRelTop = Infinity;
    let maxRelBottom = -Infinity;
    for (const f of followers) {
      const relTop = f.y - tableBaseline;
      const relBottom = relTop + f.height;
      if (relTop < minRelTop) minRelTop = relTop;
      if (relBottom > maxRelBottom) maxRelBottom = relBottom;
    }
    followerBlockSpan = Math.max(0, maxRelBottom);
  }

  // Space available on a page with followers (e.g. Page 1 if 1-page doc, or final page)
  const spaceForTableWithFollowers = Math.max(
    rowHeight * 2,
    maxContentY - table.y - followerBlockSpan - 4
  );
  const maxItemsWithFollowers = Math.max(
    1,
    Math.floor((spaceForTableWithFollowers - headerHeight) / rowHeight)
  );

  // Space available on non-final pages (no follower cards rendered)
  const spaceForTableWithoutFollowers = Math.max(
    rowHeight * 3,
    maxContentY - table.y - 2
  );
  const maxItemsWithoutFollowers = Math.max(
    1,
    Math.floor((spaceForTableWithoutFollowers - headerHeight) / rowHeight)
  );

  // Case 1: All items fit on a single page with all follower cards
  if (totalItems <= maxItemsWithFollowers) {
    return {
      totalPages: 1,
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

  // Case 2: Multi-page distribution
  const pageItemRanges: PaginationPlan["pageItemRanges"] = [];
  let remaining = totalItems;
  let currentIndex = 0;
  let currentPage = 1;

  while (remaining > 0) {
    // If the remaining items can fit on this page with the follower cards, this is the final page
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

    // Otherwise, fill this non-final page as much as possible (leaving at least 1 item for the final page)
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
    pageItemRanges,
  };
}

/**
 * Calculates effective geometry for all elements on a specific rendered page.
 * Shifts follower elements dynamically based on actual row count,
 * anchors footer baseline, and prevents clipping.
 */
export function computeEffectiveLayout(
  layout: DocumentLayout,
  pageItemsCount: number,
  _isLastPage: boolean,
  _pageNumber: number = 1
): {
  elements: EffectiveLayoutElement[];
  actualTableHeight: number;
  deltaY: number;
} {
  const table = layout.elements.find((el) => el.type === "line_items");
  const actualTableHeight = table
    ? calculateTableRenderedHeight(table, pageItemsCount)
    : 0;

  const tableDesignedHeight = table ? table.height : 0;
  const deltaY = table ? actualTableHeight - tableDesignedHeight : 0;
  const tableBaseline = table ? table.y + table.height : 0;
  const actualTableBottom = table ? table.y + actualTableHeight : 0;

  // Footer anchor position
  const footerBaselineY = layout.page.heightMm - layout.page.margins.bottom;

  const elements: EffectiveLayoutElement[] = layout.elements.map((el) => {
    // 1. Table itself: dynamic height, fixed X and Y
    if (table && el.id === table.id) {
      return {
        ...el,
        effectiveX: el.x,
        effectiveY: el.y,
        effectiveWidth: el.width,
        effectiveHeight: actualTableHeight,
        isFollower: false,
        shiftY: 0,
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
      };
    }

    // 4. Follower elements below the dynamic table
    if (table && isFollowerElement(el, table)) {
      const relOffsetFromTable = el.y - tableBaseline;
      // Min gap between table bottom and follower is 2mm
      const effectiveY = Math.max(
        actualTableBottom + 2,
        actualTableBottom + relOffsetFromTable
      );

      return {
        ...el,
        effectiveX: el.x,
        effectiveY: effectiveY,
        effectiveWidth: el.width,
        effectiveHeight: el.height,
        isFollower: true,
        shiftY: effectiveY - el.y,
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
    };
  });

  return {
    elements,
    actualTableHeight,
    deltaY,
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

  // 3. Dynamic Table Expansion Test
  const table = visibleElements.find((el) => el.type === "line_items");
  const footer = visibleElements.find((el) => el.type === "footer");

  if (table && footer) {
    const renderedTableHeight = calculateTableRenderedHeight(table, sampleItemsCount);
    const tableBottom = table.y + renderedTableHeight;

    // Check if table alone collides with footer
    if (tableBottom > footer.y - 4) {
      issues.push({
        id: "table_footer_collision",
        elementId: table.id,
        elementLabel: table.label,
        severity: "warning",
        category: "table",
        message: `Line items table with ${sampleItemsCount} items extends to ${tableBottom.toFixed(1)}mm, colliding with footer at ${footer.y}mm.`,
        suggestedFix: "Multi-page pagination will automatically split items. Consider reducing default row height if fewer pages are desired.",
      });
    }

    // Check follower cards collision with footer
    const followers = visibleElements.filter((el) => isFollowerElement(el, table));
    const tableBaseline = table.y + table.height;

    for (const f of followers) {
      const relOffset = f.y - tableBaseline;
      const dynamicY = tableBottom + relOffset;
      if (dynamicY + f.height > footer.y) {
        issues.push({
          id: `follower_footer_collision_${f.id}`,
          elementId: f.id,
          elementLabel: f.label,
          severity: "warning",
          category: "footer",
          message: `Follower section "${f.label}" would extend to ${(dynamicY + f.height).toFixed(1)}mm when table has ${sampleItemsCount} items, colliding with footer (${footer.y}mm).`,
          suggestedFix: "Enable multi-page mode or reduce row height.",
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
