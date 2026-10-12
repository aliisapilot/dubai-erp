/**
 * Dubai ERP: PDF Designer - XLSX Template Extractor
 * Deconstructs Excel spreadsheets, cell ranges, merged headers, and tables into ERP templates.
 */

import * as XLSX from "xlsx";
import type {
  DetectedTableBlock,
  DetectedTextBlock,
  ExtractedImageItem,
  SupportedImportFormat,
} from "./types";
import { detectFieldTokenFromText } from "./fieldDefinitions";
import type { ElementType, TableColumnConfig } from "../documentDesigner";

export interface XlsxExtractionResult {
  fileType: SupportedImportFormat;
  orientation: "portrait" | "landscape";
  pageWidthMm: number;
  pageHeightMm: number;
  pagesCount: number;
  originalPreviewUrl: string;
  detectedBlocks: DetectedTextBlock[];
  detectedTables: DetectedTableBlock[];
  extractedImages: ExtractedImageItem[];
  detectedBranding: {
    primaryColor: string;
    accentColor: string;
    tableHeaderColor: string;
  };
  warnings: string[];
}

export async function extractXlsxTemplate(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<XlsxExtractionResult> {
  void fileName;
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Invalid Excel workbook: No sheets found.");
  }

  const sheet = workbook.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) {
    throw new Error("Empty Excel sheet.");
  }

  const range = XLSX.utils.decode_range(ref);
  const totalCols = range.e.c - range.s.c + 1;
  const totalRows = range.e.r - range.s.r + 1;

  // Detect orientation: sheets with > 10 columns (such as attendance/overtime/wide schedules) default to landscape
  const isLandscape = totalCols >= 10;
  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;

  const warnings: string[] = [];
  if (workbook.SheetNames.length > 1) {
    warnings.push(`Workbook contains ${workbook.SheetNames.length} sheets. Sheet "${sheetName}" was extracted as template layout.`);
  }

  // Find table header row: Look for row with keywords like Description, Qty, Rate, Total
  let tableHeaderRowIndex = -1;
  let tableHeaderCols: Array<{ colIdx: number; title: string }> = [];

  for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
    const rowCols: Array<{ colIdx: number; title: string }> = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      if (cell && cell.v !== undefined && String(cell.v).trim().length > 0) {
        rowCols.push({ colIdx: c, title: String(cell.v).trim() });
      }
    }

    const rowText = rowCols.map(c => c.title).join(" ");
    if (
      (/\b(description|item|particulars)\b/i.test(rowText) && /\b(qty|quantity|amount|total|rate|price)\b/i.test(rowText)) ||
      (/\b(emp\s*no|employee|labourer)\b/i.test(rowText) && /\b(name|days|total|ot)\b/i.test(rowText))
    ) {
      tableHeaderRowIndex = r;
      tableHeaderCols = rowCols;
      break;
    }
  }

  // Construct table columns if table detected
  const detectedTables: DetectedTableBlock[] = [];
  if (tableHeaderRowIndex !== -1 && tableHeaderCols.length >= 2) {
    const cols: TableColumnConfig[] = [];
    const colWidthPct = Math.round(100 / tableHeaderCols.length);

    for (let i = 0; i < tableHeaderCols.length; i++) {
      const it = tableHeaderCols[i];
      let key = `col_${i + 1}`;
      let align: "left" | "center" | "right" = "left";
      const clean = it.title.toLowerCase();

      if (/^(#|s\.?no|no\.?)$/i.test(clean)) {
        key = "index";
        align = "center";
      } else if (/desc/i.test(clean)) {
        key = "description";
        align = "left";
      } else if (/qty|quantity/i.test(clean)) {
        key = "quantity";
        align = "center";
      } else if (/unit$/i.test(clean)) {
        key = "unit";
        align = "center";
      } else if (/rate|price/i.test(clean)) {
        key = "unit_price";
        align = "right";
      } else if (/vat/i.test(clean)) {
        key = "vat_amount";
        align = "right";
      } else if (/total|amount/i.test(clean)) {
        key = "line_total";
        align = "right";
      }

      cols.push({
        key,
        label: it.title,
        visible: true,
        widthPct: colWidthPct,
        align,
        fontSize: 8.5,
      });
    }

    // Normalize width sum to 100
    const sumPct = cols.reduce((sum, c) => sum + c.widthPct, 0);
    if (sumPct > 0) {
      cols.forEach(c => (c.widthPct = Math.round((c.widthPct / sumPct) * 100)));
    }

    detectedTables.push({
      id: "elem_line_items",
      x: 12,
      y: 95,
      width: pageWidthMm - 24,
      height: 55,
      columns: cols,
      headerBg: isLandscape ? "#1E293B" : "#0F172A",
      headerTextColor: "#FFFFFF",
      fontSize: 8.5,
      headerFontSize: 8.5,
      rowHeight: 7.5,
      borderColor: "#CBD5E1",
    });
  }

  // Parse non-table cells into text blocks
  const detectedBlocks: DetectedTextBlock[] = [];
  let blockIdx = 1;

  for (let r = range.s.r; r <= range.e.r; r++) {
    // If inside table rows, skip
    if (tableHeaderRowIndex !== -1 && r >= tableHeaderRowIndex && r <= tableHeaderRowIndex + 6) {
      continue;
    }

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      if (!cell || cell.v === undefined) continue;

      const cellText = String(cell.v).trim();
      if (!cellText) continue;

      // Calculate approximate X and Y coordinates based on row and column
      const colFraction = c / Math.max(1, totalCols);
      const rowFraction = r / Math.max(1, totalRows);

      const x = Math.round(12 + colFraction * (pageWidthMm - 30));
      const y = Math.round(10 + rowFraction * (pageHeightMm - 35));
      const width = Math.min(pageWidthMm - x - 8, Math.max(25, cellText.length * 4));
      const height = 7;

      let suggestedType: ElementType = "custom_text";
      let fontSize = 10;
      let fontWeight: "normal" | "medium" | "semibold" | "bold" | "extrabold" = "normal";

      if (r <= 2 && cellText.length > 5 && !/invoice|quotation|date/i.test(cellText)) {
        suggestedType = "company_name_en";
        fontSize = 14;
        fontWeight = "bold";
      } else if (/trn\s*[:#]|100\d{12}/i.test(cellText)) {
        suggestedType = "company_trn";
        fontWeight = "semibold";
      } else if (/\b(tax\s*invoice|quotation|proforma|delivery\s*note|purchase\s*order|salary\s*statement)\b/i.test(cellText)) {
        suggestedType = "doc_title";
        fontSize = 13;
        fontWeight = "extrabold";
      } else if (/inv[-_]?\d+|date\s*[:#]|ref\s*[:#]/i.test(cellText) && r <= 8) {
        suggestedType = "doc_meta";
      } else if (/bill\s*to|customer|client|m\/s\b/i.test(cellText) && r <= 12) {
        suggestedType = "customer_info";
      } else if (/subtotal|grand\s*total|net\s*payable|vat\s*\(?5%\)?/i.test(cellText)) {
        suggestedType = "totals";
      } else if (/amount\s*in\s*words/i.test(cellText)) {
        suggestedType = "amount_in_words";
      } else if (/terms|conditions/i.test(cellText)) {
        suggestedType = "payment_terms";
      } else if (/iban|swift|bank\s*name/i.test(cellText)) {
        suggestedType = "bank_details";
      } else if (/authorized\s*sign|prepared\s*by|approved\s*by/i.test(cellText)) {
        suggestedType = "company_signature";
      }

      const detectedField = detectFieldTokenFromText(cellText);

      detectedBlocks.push({
        id: `elem_xlsx_block_${blockIdx++}`,
        originalText: cellText,
        currentText: cellText,
        x: Math.max(8, Math.min(pageWidthMm - 30, x)),
        y: Math.max(8, Math.min(pageHeightMm - 20, y)),
        width: Math.max(20, Math.min(pageWidthMm - 20, width)),
        height,
        fontSize,
        fontWeight,
        textAlign: c >= totalCols * 0.7 ? "right" : "left",
        suggestedType,
        mappedToken: detectedField ? detectedField.token : undefined,
      });
    }
  }

  const primaryColor = isLandscape ? "#1E293B" : "#0F172A";
  const accentColor = "#D4A72C";

  return {
    fileType: "xlsx",
    orientation: isLandscape ? "landscape" : "portrait",
    pageWidthMm,
    pageHeightMm,
    pagesCount: 1,
    originalPreviewUrl: "",
    detectedBlocks,
    detectedTables,
    extractedImages: [
      {
        id: "img_xlsx_logo",
        name: "Company Logo",
        dataUrl: "",
        widthMm: 38,
        heightMm: 18,
        xMm: 12,
        yMm: 10,
        isLogoCandidate: true,
      },
    ],
    detectedBranding: {
      primaryColor,
      accentColor,
      tableHeaderColor: primaryColor,
    },
    warnings,
  };
}
