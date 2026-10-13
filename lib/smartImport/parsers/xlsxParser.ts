/**
 * Dubai ERP: Smart Import - XLSX & CSV Spreadsheet Parser
 * Reads multi-sheet Excel files and CSVs, tracks exact cell addresses (e.g. Sheet1!C12),
 * protects against formula injection, and preserves decimal precision.
 */

import * as XLSX from "xlsx";
import type { SourceLocation } from "../types";

export interface ParsedSheetCell {
  address: string; // e.g. "B4"
  row: number; // 1-indexed
  col: number; // 1-indexed
  colLetter: string; // "B"
  value: string | number | boolean | null;
  formattedText: string;
  formula?: string;
}

export interface ParsedSheetRow {
  rowNumber: number;
  cells: ParsedSheetCell[];
  rawValues: (string | number | boolean | null)[];
}

export interface ParsedSheet {
  name: string;
  rowCount: number;
  colCount: number;
  rows: ParsedSheetRow[];
  cellsByAddress: Record<string, ParsedSheetCell>;
}

export interface XlsxParseResult {
  sheetNames: string[];
  sheets: Record<string, ParsedSheet>;
  allText: string;
  sourceSnippets: { location: SourceLocation; text: string }[];
}

export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  // Protect against formula injection if exported back or interpreted
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function parseSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string
): XlsxParseResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellStyles: true,
    cellFormula: true,
  });

  const sheetNames = workbook.SheetNames;
  const sheets: Record<string, ParsedSheet> = {};
  const sourceSnippets: { location: SourceLocation; text: string }[] = [];
  const textAccumulator: string[] = [];

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const ref = ws["!ref"];
    if (!ref) {
      // Empty sheet
      sheets[sheetName] = {
        name: sheetName,
        rowCount: 0,
        colCount: 0,
        rows: [],
        cellsByAddress: {},
      };
      continue;
    }

    const range = XLSX.utils.decode_range(ref);
    const parsedRows: ParsedSheetRow[] = [];
    const cellsByAddress: Record<string, ParsedSheetCell> = {};

    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowCells: ParsedSheetCell[] = [];
      const rowRawValues: (string | number | boolean | null)[] = [];

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellAddress];

        let val: string | number | boolean | null = null;
        let formattedText = "";
        let formula: string | undefined = undefined;

        if (cell) {
          val = cell.v !== undefined ? cell.v : null;
          formattedText = cell.w ? String(cell.w).trim() : val !== null ? String(val).trim() : "";
          if (cell.f) formula = cell.f;

          // If date object, format nicely
          if (cell.t === "d" && cell.v instanceof Date) {
            formattedText = cell.v.toISOString().split("T")[0];
            val = formattedText;
          }
        }

        const parsedCell: ParsedSheetCell = {
          address: cellAddress,
          row: r + 1,
          col: c + 1,
          colLetter: XLSX.utils.encode_col(c),
          value: val,
          formattedText,
          formula,
        };

        if (formattedText) {
          cellsByAddress[cellAddress] = parsedCell;
          sourceSnippets.push({
            location: {
              file: fileName,
              sheet: sheetName,
              cell: cellAddress,
              row: r + 1,
              col: c + 1,
              rawText: formattedText,
            },
            text: `${sheetName}!${cellAddress}: ${formattedText}`,
          });
          textAccumulator.push(formattedText);
        }

        rowCells.push(parsedCell);
        rowRawValues.push(val);
      }

      // Only add row if not completely blank
      if (rowRawValues.some(v => v !== null && v !== "")) {
        parsedRows.push({
          rowNumber: r + 1,
          cells: rowCells,
          rawValues: rowRawValues,
        });
      }
    }

    sheets[sheetName] = {
      name: sheetName,
      rowCount: parsedRows.length,
      colCount: range.e.c - range.s.c + 1,
      rows: parsedRows,
      cellsByAddress,
    };
  }

  return {
    sheetNames,
    sheets,
    allText: textAccumulator.join("\n"),
    sourceSnippets,
  };
}
