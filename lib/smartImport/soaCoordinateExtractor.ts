/**
 * Dubai ERP: Coordinate-Aware PDF Table Extractor for Customer Statements (SOA)
 * ============================================================================
 * Uses actual PDF text coordinates (x, y, width, height) from `ParsedPdfPage.items`
 * to detect table headers, compute column horizontal boundaries, handle empty cells,
 * preserve exact row order, stitch multi-line descriptions, and assign monetary amounts
 * strictly to their true column (Charges/Debit, Credits, Balance/Line Total).
 *
 * NEVER classifies Debits vs Credits by keyword guessing (e.g. "Bank Transfer").
 * NEVER invents invoice reference numbers when the Ref / Invoice # cell is empty.
 * NEVER prepends transaction dates into the Description field.
 */

import type { ParsedPdfPage, ParsedPdfTextItem } from "./parsers/pdfParser";
import type { ExtractedLineItem } from "./types";

export type SoaColumnRole =
  | "date"
  | "type"
  | "ref"
  | "description"
  | "debit"
  | "credit"
  | "balance";

export interface DetectedSoaColumn {
  role: SoaColumnRole;
  label: string;
  left: number;
  right: number;
  center: number;
  boundLeft: number;
  boundRight: number;
}

export interface CoordinateSoaExtractionResult {
  usedCoordinates: boolean;
  detectedColumns: DetectedSoaColumn[];
  openingBalanceFromRow: number | null;
  items: Array<
    ExtractedLineItem & {
      date?: string;
      reference?: string;
      reference_no?: string;
      debit?: number;
      credit?: number;
      balance?: number;
      needsCellReview?: boolean;
      reviewReason?: string;
    }
  >;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(n) + 1e-9) * 100) / 100);
}

function parseAmountToken(raw: string): number | null {
  const s = raw.trim();
  if (!s || /^[-—–]+$/.test(s)) return null;

  let negative = false;
  let cleaned = s.replace(/AED/gi, "").trim();

  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (/\b(?:CR|CREDIT)\b/i.test(cleaned)) {
    negative = true;
    cleaned = cleaned.replace(/\b(?:CR|CREDIT|DR|DEBIT)\b/gi, "").trim();
  } else {
    cleaned = cleaned.replace(/\b(?:CR|CREDIT|DR|DEBIT)\b/gi, "").trim();
  }

  cleaned = cleaned.replace(/,/g, "").replace(/\s+/g, "");
  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  }
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;
  return round2(negative ? -num : num);
}

function parseIsoDateStrict(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // DD-MMM-YYYY or DD MMM YYYY
  m = s.match(/^(\d{1,2})[-/.\s]+([A-Za-z]{3,9})[-/.\s]+(\d{2,4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = MONTH_MAP[m[2].toLowerCase()];
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (mo && d >= 1 && d <= 31) {
      return `${y}-${mo}-${String(d).padStart(2, "0")}`;
    }
  }

  // MMM DD, YYYY
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase()];
    const d = Number(m[2]);
    const y = Number(m[3]);
    if (mo && d >= 1 && d <= 31) {
      return `${y}-${mo}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

function looksLikeDateText(raw: string): boolean {
  return parseIsoDateStrict(raw) !== null;
}

function classifyHeaderLabel(label: string): SoaColumnRole | null {
  const norm = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(?:date|trans\.?\s*date|txn\.?\s*date|posting\s*date)$/i.test(norm)) return "date";
  if (/^(?:type|doc\.?\s*type|voucher\s*type)$/i.test(norm)) return "type";
  if (/^(?:ref\s*#?|ref\.?\s*no\.?|reference|invoice\s*#?|invoice\s*no\.?|inv\.?\s*#?|doc\.?\s*#?|voucher\s*#?)$/i.test(norm)) {
    return "ref";
  }
  if (/^(?:description|particulars|details|narration|memo|transaction\s*details?)$/i.test(norm)) {
    return "description";
  }
  if (/^(?:charges?|debit|debits|dr|debit\s*\(?aed\)?|charges\s*\(?aed\)?)$/i.test(norm)) {
    return "debit";
  }
  if (/^(?:credits?|credit|cr|payments?|receipts?|credit\s*\(?aed\)?|credits\s*\(?aed\)?)$/i.test(norm)) {
    return "credit";
  }
  if (/^(?:balance|line\s*total|running\s*balance|net\s*balance|balance\s*\(?aed\)?|total)$/i.test(norm)) {
    return "balance";
  }
  return null;
}

interface MergedToken {
  str: string;
  left: number;
  right: number;
  center: number;
  y: number;
}

/**
 * Merges horizontally adjacent PDF text items on the same baseline (or wrapped header cell)
 * into logical tokens with accurate bounding boxes.
 */
function mergeItemsHorizontally(
  items: ParsedPdfTextItem[],
  maxGapPt = 4,
  columnBounds?: DetectedSoaColumn[]
): MergedToken[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const merged: MergedToken[] = [];

  for (const item of sorted) {
    const itemText = item.str.trim();
    if (!itemText) continue;
    const itemRight = item.x + (item.width || itemText.length * 4.5);
    const last = merged[merged.length - 1];
    const gap = last ? item.x - last.right : Infinity;

    const crossesColumnBoundary =
      Boolean(last && columnBounds && columnBounds.length > 1) &&
      columnBounds!.some((col) => last.right <= col.boundRight + 1 && item.x >= col.boundRight - 1);

    const bothAreAmountsOrDashes =
      last &&
      (parseAmountToken(last.str) !== null || /^[-—–]+$/.test(last.str)) &&
      (parseAmountToken(itemText) !== null || /^[-—–]+$/.test(itemText));

    const bothAreDistinctHeaderRoles =
      last &&
      classifyHeaderLabel(last.str.replace(/\(aed\)|:/gi, "").trim()) !== null &&
      classifyHeaderLabel(itemText.replace(/\(aed\)|:/gi, "").trim()) !== null;

    if (
      last &&
      !crossesColumnBoundary &&
      !bothAreAmountsOrDashes &&
      !bothAreDistinctHeaderRoles &&
      gap <= maxGapPt &&
      Math.abs(item.y - last.y) <= 4
    ) {
      last.str = gap > 1.5 ? `${last.str} ${itemText}` : `${last.str}${itemText}`;
      last.right = Math.max(last.right, itemRight);
      last.center = (last.left + last.right) / 2;
    } else {
      merged.push({
        str: itemText,
        left: item.x,
        right: itemRight,
        center: (item.x + itemRight) / 2,
        y: item.y,
      });
    }
  }
  return merged;
}

/**
 * Merges wrapped two-line column headers positioned vertically above/below each other
 * (e.g. "Charges" at y=600 and "(AED)" at y=593, or "Invoice" + "#" or "Line" + "Total").
 */
function mergeHeaderBandItems(bandItems: ParsedPdfTextItem[]): MergedToken[] {
  // Use a tight horizontal gap (3.5pt) so adjacent right/left-aligned headers like
  // "Charges (AED)" [369..424] and "Credits (AED)" [431..482] (7pt gap) never collapse together.
  const horizontalSorted = mergeItemsHorizontally(bandItems, 3.5);
  const columns: MergedToken[] = [];

  for (const tok of horizontalSorted) {
    const existing = columns.find((c) => {
      if (Math.abs(c.y - tok.y) <= 2) return false;
      const horizOverlap = Math.min(c.right, tok.right) - Math.max(c.left, tok.left);
      const centerClose = Math.abs(c.center - tok.center) <= 14;
      return horizOverlap >= -2 || centerClose;
    });
    const tokIsOwnRole = classifyHeaderLabel(tok.str.replace(/\(aed\)|:/gi, "").trim()) !== null;
    const existingIsOwnRole = existing
      ? classifyHeaderLabel(existing.str.replace(/\(aed\)|:/gi, "").trim()) !== null
      : false;

    if (existing && !(tokIsOwnRole && existingIsOwnRole)) {
      // Top line first, bottom line second
      if (tok.y > existing.y) {
        existing.str = `${tok.str} ${existing.str}`.replace(/\s+/g, " ").trim();
      } else {
        existing.str = `${existing.str} ${tok.str}`.replace(/\s+/g, " ").trim();
      }
      existing.left = Math.min(existing.left, tok.left);
      existing.right = Math.max(existing.right, tok.right);
      existing.center = (existing.left + existing.right) / 2;
    } else {
      columns.push({ ...tok });
    }
  }

  return columns.sort((a, b) => a.left - b.left);
}

/**
 * Scans a page's items top-to-bottom to locate the table header and compute column boundaries.
 */
function detectPageTableHeader(
  pageItems: ParsedPdfTextItem[],
  pageWidth: number
): { headerY: number; headerBottomY: number; columns: DetectedSoaColumn[] } | null {
  if (!pageItems.length) return null;

  // Group into candidate Y bands (ascending Y index after sorting top-to-bottom)
  const yValues = Array.from(new Set(pageItems.map((it) => Math.round(it.y)))).sort((a, b) => b - a);

  for (const seedY of yValues) {
    const band = pageItems.filter((it) => Math.abs(it.y - seedY) <= 9);
    const mergedTokens = mergeHeaderBandItems(band);

    const detected: Array<{ role: SoaColumnRole; tok: MergedToken }> = [];
    for (const tok of mergedTokens) {
      let role = classifyHeaderLabel(tok.str);
      // Try stripping trailing (AED) or : if initial exact match missed
      if (!role) {
        role = classifyHeaderLabel(tok.str.replace(/\(aed\)|:/gi, "").trim());
      }
      if (role && !detected.some((d) => d.role === role)) {
        detected.push({ role, tok });
      }
    }

    const hasDate = detected.some((d) => d.role === "date");
    const hasMoneyCol = detected.some((d) => d.role === "debit" || d.role === "credit" || d.role === "balance");
    const hasDescOrRef = detected.some((d) => d.role === "description" || d.role === "ref");

    if (hasDate && hasMoneyCol && (hasDescOrRef || detected.length >= 3)) {
      const sortedCols = detected.sort((a, b) => a.tok.center - b.tok.center);
      const minY = Math.min(...band.map((b) => b.y));
      const columns: DetectedSoaColumn[] = sortedCols.map((entry, idx) => {
        const prev = sortedCols[idx - 1];
        const next = sortedCols[idx + 1];

        const boundLeft = idx === 0
          ? 0
          : (prev.tok.right + entry.tok.left) / 2;

        const boundRight = idx === sortedCols.length - 1
          ? Math.max(pageWidth || 600, entry.tok.right + 40)
          : entry.role === "ref" && next.role === "description"
          ? Math.min((entry.tok.right + next.tok.left) / 2, entry.tok.right + 18)
          : (entry.tok.right + next.tok.left) / 2;

        return {
          role: entry.role,
          label: entry.tok.str,
          left: entry.tok.left,
          right: entry.tok.right,
          center: entry.tok.center,
          boundLeft,
          boundRight,
        };
      });

      return {
        headerY: seedY,
        headerBottomY: minY,
        columns,
      };
    }
  }

  return null;
}

/**
 * Classifies a numeric token strictly by its horizontal coordinate against detected numeric columns.
 * Uses right-edge alignment (standard accounting PDF alignment) and midpoint split boundaries.
 */
function assignNumericColumnRole(
  item: ParsedPdfTextItem,
  numericCols: DetectedSoaColumn[]
): { role: "debit" | "credit" | "balance"; uncertain: boolean } {
  const itemLeft = item.x;
  const itemRight = item.x + (item.width || item.str.length * 4.5);
  const itemCenter = (itemLeft + itemRight) / 2;

  if (numericCols.length === 1) {
    return { role: numericCols[0].role as "debit" | "credit" | "balance", uncertain: false };
  }

  // Sort numeric cols left-to-right (typically debit -> credit -> balance)
  const cols = [...numericCols].sort((a, b) => a.right - b.right);

  // Measure distance from item's right edge to each column's right edge AND check split intervals
  let bestCol = cols[0];
  let bestDist = Infinity;
  let secondDist = Infinity;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    // For right-aligned numeric columns, right edge alignment is primary;
    // also support centered numeric headers via center distance as tiebreaker.
    const distRight = Math.abs(itemRight - col.right);
    const distCenter = Math.abs(itemCenter - col.center);
    const effectiveDist = Math.min(distRight, distCenter + 6);

    if (effectiveDist < bestDist) {
      secondDist = bestDist;
      bestDist = effectiveDist;
      bestCol = col;
    } else if (effectiveDist < secondDist) {
      secondDist = effectiveDist;
    }
  }

  // Direct interval check using right-edge midpoints between adjacent columns
  for (let i = 0; i < cols.length; i++) {
    const prevRightSplit = i === 0 ? -Infinity : (cols[i - 1].right + cols[i].right) / 2;
    const nextRightSplit = i === cols.length - 1 ? Infinity : (cols[i].right + cols[i + 1].right) / 2;
    if (itemRight >= prevRightSplit && itemRight < nextRightSplit) {
      const marginToLeft = Math.abs(itemRight - prevRightSplit);
      const marginToRight = Math.abs(nextRightSplit - itemRight);
      const uncertain = Math.min(marginToLeft, marginToRight) <= 5;
      return { role: cols[i].role as "debit" | "credit" | "balance", uncertain };
    }
  }

  return {
    role: bestCol.role as "debit" | "credit" | "balance",
    uncertain: Math.abs(secondDist - bestDist) <= 5,
  };
}

function assignTextColumnRole(
  item: ParsedPdfTextItem,
  columns: DetectedSoaColumn[]
): SoaColumnRole {
  const itemLeft = item.x;
  const itemRight = item.x + (item.width || item.str.length * 4);
  const itemCenter = (itemLeft + itemRight) / 2;

  const descCol = columns.find((c) => c.role === "description");
  const refCol = columns.find((c) => c.role === "ref");
  if (descCol && refCol && refCol.right < descCol.left) {
    // Left-aligned description text starting past the Ref header's right edge belongs to Description
    if (itemLeft >= refCol.boundRight - 2 && itemLeft < descCol.boundRight) {
      return "description";
    }
  }

  for (const col of columns) {
    if (itemCenter >= col.boundLeft && itemCenter < col.boundRight) {
      return col.role;
    }
  }
  // Fallback: nearest center
  let best = columns[0];
  let minD = Infinity;
  for (const col of columns) {
    const d = Math.abs(itemCenter - col.center);
    if (d < minD) {
      minD = d;
      best = col;
    }
  }
  return best.role;
}

function isStopFooterLine(text: string): boolean {
  const norm = text.trim();
  if (!norm) return false;
  return (
    /^(?:account\s*current\s*balance|total\s*balance\s*due|net\s*outstanding|your\s*account\s*balance\s*is)/i.test(norm) ||
    /^(?:make\s*all\s*checks\s*payable|thank\s*you\s*for\s*your\s*business|should\s*you\s*have\s*any\s*enquiries)/i.test(norm) ||
    /^page\s+\d+\s+of\s+\d+/i.test(norm) ||
    /•\s*page\s+\d+\s+of\s+\d+/i.test(norm)
  );
}

/**
 * Extracts Statement of Account table rows strictly using coordinate column boundaries.
 */
export function extractSoaTableFromCoordinates(
  pages: ParsedPdfPage[],
  fileName: string,
  initialOpeningBalance?: number | null
): CoordinateSoaExtractionResult {
  const hasCoordinates = pages.some((p) => Array.isArray(p.items) && p.items.length > 0);
  if (!hasCoordinates) {
    return {
      usedCoordinates: false,
      detectedColumns: [],
      openingBalanceFromRow: null,
      items: [],
    };
  }

  let activeColumns: DetectedSoaColumn[] = [];
  let openingBalanceFromRow: number | null =
    initialOpeningBalance !== undefined && initialOpeningBalance !== null ? initialOpeningBalance : null;
  const extractedRows: CoordinateSoaExtractionResult["items"] = [];
  let itemSeq = 1;
  let runningBalance = openingBalanceFromRow ?? 0;
  let runningInitialized = openingBalanceFromRow !== null;

  for (const page of pages) {
    if (!page.items || page.items.length === 0) continue;

    const detectedHeader = detectPageTableHeader(page.items, page.width || 595);
    if (detectedHeader) {
      activeColumns = detectedHeader.columns;
    }

    if (activeColumns.length === 0) {
      // This page has no table header yet and none inherited from previous page
      continue;
    }

    const headerBottomY = detectedHeader ? detectedHeader.headerBottomY : (page.height || 842);
    const dateCol = activeColumns.find((c) => c.role === "date");
    const numericCols = activeColumns.filter(
      (c) => c.role === "debit" || c.role === "credit" || c.role === "balance"
    );

    if (!dateCol || numericCols.length === 0) continue;

    // Collect items strictly below the table header
    const bodyItems = page.items.filter((it) => it.y < headerBottomY - 4);
    if (bodyItems.length === 0) continue;

    // Determine vertical footer boundary if summary / footer band begins
    let footerTopY = -Infinity;
    const yBuckets = new Map<number, ParsedPdfTextItem[]>();
    for (const it of bodyItems) {
      const yB = Math.round(it.y / 4) * 4;
      if (!yBuckets.has(yB)) yBuckets.set(yB, []);
      yBuckets.get(yB)!.push(it);
    }
    const sortedBucketYs = Array.from(yBuckets.keys()).sort((a, b) => b - a);
    for (const yB of sortedBucketYs) {
      const lineText = yBuckets.get(yB)!.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      if (isStopFooterLine(lineText)) {
        footerTopY = Math.max(footerTopY, yB + 4);
        break;
      }
    }

    const tableItems = bodyItems.filter((it) => it.y > footerTopY);
    if (tableItems.length === 0) continue;

    // Locate anchor rows:
    // 1) Any date item inside Date column (expanded slightly +/- 20pt for center alignment)
    // 2) Opening / Previous Balance Forwarded rows inside Type or Description columns
    interface RowAnchor {
      y: number;
      isOpeningRow: boolean;
      dateStr: string;
    }
    const anchors: RowAnchor[] = [];

    const dateCandidates = mergeItemsHorizontally(
      tableItems.filter(
        (it) => it.x + it.width / 2 >= dateCol.boundLeft - 5 && it.x + it.width / 2 <= dateCol.boundRight + 15
      ),
      6
    );

    for (const dc of dateCandidates) {
      if (looksLikeDateText(dc.str)) {
        // Avoid duplicate anchor at nearly same Y
        if (!anchors.some((a) => Math.abs(a.y - dc.y) <= 8)) {
          anchors.push({ y: dc.y, isOpeningRow: false, dateStr: dc.str });
        }
      }
    }

    // Check for explicit Opening / Previous Balance Brought Forward row without a date (e.g. Date = "—")
    for (const yB of sortedBucketYs) {
      if (yB <= footerTopY) continue;
      if (anchors.some((a) => Math.abs(a.y - yB) <= 10)) continue;
      const lineItems = tableItems.filter((it) => Math.abs(it.y - yB) <= 4);
      const lineText = lineItems.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      if (/opening\s*balance|previous\s*balance\s*\(?forwarded\)?|balance\s*brought\s*forward/i.test(lineText)) {
        anchors.push({ y: yB, isOpeningRow: true, dateStr: "" });
      }
    }

    // Also handle rows that have Type/Description + numeric amounts on a line WITHOUT a date if subtotal?
    // Subtotal / Total rows are explicitly excluded per accounting accuracy requirements.
    anchors.sort((a, b) => b.y - a.y);
    if (anchors.length === 0) continue;

    for (let k = 0; k < anchors.length; k++) {
      const anchor = anchors[k];
      const prevAnchorY = k === 0 ? headerBottomY - 2 : anchors[k - 1].y;
      const nextAnchorY = k === anchors.length - 1 ? Math.max(footerTopY, anchor.y - 36) : anchors[k + 1].y;

      const upperY = k === 0
        ? Math.min(headerBottomY - 2, anchor.y + 18)
        : (prevAnchorY + anchor.y) / 2;
      const lowerY = k === anchors.length - 1
        ? nextAnchorY
        : (anchor.y + nextAnchorY) / 2;

      const rowItems = tableItems.filter((it) => it.y <= upperY && it.y > lowerY);
      if (rowItems.length === 0) continue;

      const rowTextCombined = [...rowItems]
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .trim();

      // Skip subtotal or repeated header rows if captured inside range
      if (/^(?:sub-?total|total\s*(?:charges|credits|amount|balance)?)\b/i.test(rowTextCombined)) {
        continue;
      }

      const typeParts: ParsedPdfTextItem[] = [];
      const refParts: ParsedPdfTextItem[] = [];
      const descParts: ParsedPdfTextItem[] = [];
      let debitVal = 0;
      let creditVal = 0;
      let balanceVal: number | null = null;
      let hasDebitCell = false;
      let hasCreditCell = false;
      let hasBalanceCell = false;
      let cellReviewNeeded = false;
      const reviewReasons: string[] = [];

      // Merge horizontally close items first inside each row band so e.g. "121,472.40" or "INV-117" isn't split
      // Bucket rowItems by baseline Y (within 3pt) for horizontal merging
      const rowSubLines = new Map<number, ParsedPdfTextItem[]>();
      for (const it of rowItems) {
        const ySub = Math.round(it.y / 3) * 3;
        if (!rowSubLines.has(ySub)) rowSubLines.set(ySub, []);
        rowSubLines.get(ySub)!.push(it);
      }

      const sortedSubYs = Array.from(rowSubLines.keys()).sort((a, b) => b - a);
      for (const ySub of sortedSubYs) {
        const subItems = rowSubLines.get(ySub)!.sort((a, b) => a.x - b.x);
        const mergedLineTokens = mergeItemsHorizontally(subItems, 5, activeColumns);

        for (const tok of mergedLineTokens) {
          const fakeItem: ParsedPdfTextItem = {
            str: tok.str,
            x: tok.left,
            y: tok.y,
            width: tok.right - tok.left,
            height: 10,
            page: page.pageNumber,
          };

          // Skip date token itself if it matches anchor date
          if (
            !anchor.isOpeningRow &&
            looksLikeDateText(tok.str) &&
            tok.center >= dateCol.boundLeft - 8 &&
            tok.center <= dateCol.boundRight + 15
          ) {
            continue;
          }

          // Check if token lies in numeric column zone (from first numeric column's left margin to right edge)
          const firstNumericLeft = Math.min(...numericCols.map((c) => c.boundLeft));
          const parsedAmt = parseAmountToken(tok.str);
          const isDashToken = /^[-—–]+$/.test(tok.str.trim());

          if ((parsedAmt !== null || isDashToken) && tok.right >= firstNumericLeft - 8) {
            const { role, uncertain } = assignNumericColumnRole(fakeItem, numericCols);
            if (uncertain && parsedAmt !== null) {
              cellReviewNeeded = true;
              reviewReasons.push(`Amount ${tok.str} near ${role} boundary`);
            }
            if (role === "debit") {
              hasDebitCell = true;
              if (parsedAmt !== null) debitVal = round2(debitVal + Math.abs(parsedAmt));
            } else if (role === "credit") {
              hasCreditCell = true;
              if (parsedAmt !== null) creditVal = round2(creditVal + Math.abs(parsedAmt));
            } else if (role === "balance") {
              hasBalanceCell = true;
              if (parsedAmt !== null) balanceVal = parsedAmt;
            }
            continue;
          }

          // Otherwise classify into Date / Type / Ref / Description by X coordinate
          const textRole = assignTextColumnRole(fakeItem, activeColumns);
          if (textRole === "type") {
            typeParts.push(fakeItem);
          } else if (textRole === "ref") {
            if (!/^[-—–]+$/.test(tok.str.trim())) {
              refParts.push(fakeItem);
            }
          } else if (textRole === "description") {
            descParts.push(fakeItem);
          } else if (textRole === "date" && /^[-—–]+$/.test(tok.str.trim())) {
            // Skip placeholder dash in Date column
          } else if (textRole === "debit" || textRole === "credit" || textRole === "balance") {
            // Non-numeric label inside money area? Ignore dashes or currency headers
          } else {
            descParts.push(fakeItem);
          }
        }
      }

      const typeStr = typeParts.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      const refStr = refParts.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      const descStr = descParts
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const combinedDesc = descStr || typeStr || "Statement Entry";

      // Handle Opening / Previous Balance Forwarded rows separately from transactions
      const isOpeningEntry =
        anchor.isOpeningRow ||
        (/opening/i.test(typeStr) && /opening|previous\s*balance|brought\s*forward/i.test(combinedDesc)) ||
        /^(?:opening\s*balance|previous\s*balance\s*\(?forwarded\)?|balance\s*brought\s*forward)/i.test(combinedDesc);

      if (isOpeningEntry) {
        const opVal = balanceVal !== null ? balanceVal : round2(debitVal - creditVal);
        if (openingBalanceFromRow === null && balanceVal !== null) {
          openingBalanceFromRow = opVal;
        } else if (openingBalanceFromRow === null && (debitVal > 0 || creditVal > 0)) {
          openingBalanceFromRow = opVal;
        }
        runningBalance = openingBalanceFromRow ?? opVal;
        runningInitialized = true;
        continue;
      }

      // Skip subtotal rows matched inside text
      if (/^(?:sub-?total|total\s*(?:charges|credits|amount|balance)?|grand\s*total)$/i.test(combinedDesc)) {
        continue;
      }

      // If no numeric value was extracted at all on this row, skip non-transaction noise
      if (!hasDebitCell && !hasCreditCell && !hasBalanceCell) {
        continue;
      }
      if (debitVal === 0 && creditVal === 0 && balanceVal === null) {
        continue;
      }

      // If row has no Type/Ref column but reference number is embedded inside Description, extract reference cleanly.
      // CRITICAL: Only extract real document references if present in Ref column OR clear pattern in Description;
      // NEVER invent references (e.g. for "Bank Transfer" rows where Invoice # cell is blank).
      let finalRef = refStr;
      if (!finalRef && !activeColumns.some((c) => c.role === "ref")) {
        const refMatch = combinedDesc.match(/\b((?:INV|TAX|BILL|RV|REC|RCPT|PAY|PV|CN|DN|QTN|SO|SOA)[-_/][0-9A-Za-z-_/]+)\b/i);
        if (refMatch) finalRef = refMatch[1];
      }

      const isoDate = parseIsoDateStrict(anchor.dateStr) || anchor.dateStr;

      // Validate running balance arithmetic
      if (!runningInitialized) {
        runningBalance = openingBalanceFromRow ?? 0;
        runningInitialized = true;
      }
      const calculatedRunning = round2(runningBalance + debitVal - creditVal);
      runningBalance = calculatedRunning;

      const diff = balanceVal !== null ? round2(balanceVal - calculatedRunning) : 0;
      const calcStatus: "match" | "mismatch" | "warning" =
        balanceVal !== null && Math.abs(diff) > 0.01
          ? "mismatch"
          : cellReviewNeeded
          ? "warning"
          : "match";

      extractedRows.push({
        id: `item_soa_${itemSeq}`,
        itemNumber: itemSeq++,
        description: combinedDesc,
        date: isoDate,
        reference: finalRef || undefined,
        reference_no: finalRef || undefined,
        debit: debitVal,
        credit: creditVal,
        balance: balanceVal !== null ? balanceVal : calculatedRunning,
        quantity: 1,
        unit: "Doc",
        unitPrice: debitVal > 0 ? debitVal : creditVal,
        discount: 0,
        vatRate: 0,
        vatAmount: 0,
        taxableAmount: debitVal > 0 ? debitVal : 0,
        total: debitVal > 0 ? debitVal : creditVal,
        calculatedTotal: calculatedRunning,
        difference: diff,
        calculationStatus: calcStatus,
        needsCellReview: cellReviewNeeded || calcStatus === "mismatch",
        reviewReason: reviewReasons.length > 0 ? reviewReasons.join("; ") : undefined,
        source: {
          file: fileName,
          page: page.pageNumber,
          row: Math.round(anchor.y),
          rawText: rowTextCombined,
        },
      });
    }
  }

  return {
    usedCoordinates: true,
    detectedColumns: activeColumns,
    openingBalanceFromRow,
    items: extractedRows,
  };
}
