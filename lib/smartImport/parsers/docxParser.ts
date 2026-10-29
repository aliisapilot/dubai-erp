/**
 * Dubai ERP: Smart Import - DOCX Document Parser
 * Parses Word documents (.docx), extracts paragraphs, tables, cells,
 * and key-value pairs with exact source locations.
 */

import JSZip from "jszip";
import type { SourceLocation } from "../types";

export interface ParsedDocxCell {
  rowIndex: number;
  colIndex: number;
  text: string;
}

export interface ParsedDocxRow {
  rowIndex: number;
  cells: ParsedDocxCell[];
}

export interface ParsedDocxTable {
  tableIndex: number;
  rows: ParsedDocxRow[];
}

export interface ParsedDocxParagraph {
  index: number;
  text: string;
}

export interface DocxParseResult {
  paragraphs: ParsedDocxParagraph[];
  tables: ParsedDocxTable[];
  allText: string;
  sourceSnippets: { location: SourceLocation; text: string }[];
}

function cleanXmlTags(xmlText: string): string {
  return xmlText
    .replace(/<w:tab[^>]*\/>/gi, "\t")
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<w:p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextFromWp(pXml: string): string {
  // Extract text within <w:t> tags
  const matches = pXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
  return matches
    .map(m => m.replace(/<w:t[^>]*>/i, "").replace(/<\/w:t>/i, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

export async function parseDocx(
  buffer: ArrayBuffer,
  fileName: string = "document.docx"
): Promise<DocxParseResult> {
  const baseName = (fileName || "document.docx").split(/[/\\]/).pop() || "document.docx";
  if (baseName.startsWith("~$") || baseName.startsWith(".~")) {
    const cleanDocName = baseName.replace(/^[~.$]+/, "");
    throw new Error(
      `'${baseName}' is a Microsoft Office temporary lock file (${buffer.byteLength} bytes) created by Word while editing. Please select the actual document '${cleanDocName}' instead.`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg.includes("central directory") || rawMsg.includes("zip")) {
      throw new Error(
        `Cannot open '${baseName}' as a Word (.docx) document. If the file is currently open in Microsoft Word, please make sure to select the actual document rather than Word's hidden lock file (~$...). (Error: ${rawMsg})`
      );
    }
    throw new Error(`Failed to read Word document '${baseName}': ${rawMsg}`);
  }

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error(`Invalid DOCX document '${baseName}': word/document.xml missing.`);
  }

  const docXml = await docXmlFile.async("text");

  const paragraphs: ParsedDocxParagraph[] = [];
  const tables: ParsedDocxTable[] = [];
  const sourceSnippets: { location: SourceLocation; text: string }[] = [];

  // Parse tables: <w:tbl>...</w:tbl>
  const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/gi;
  let tblMatch: RegExpExecArray | null;
  let tableIndex = 1;

  while ((tblMatch = tblRegex.exec(docXml)) !== null) {
    const tableXml = tblMatch[0];
    const rows: ParsedDocxRow[] = [];

    // Rows: <w:tr>...</w:tr>
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
    let trMatch: RegExpExecArray | null;
    let rowIndex = 1;

    while ((trMatch = trRegex.exec(tableXml)) !== null) {
      const rowXml = trMatch[0];
      const cells: ParsedDocxCell[] = [];

      // Cells: <w:tc>...</w:tc>
      const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/gi;
      let tcMatch: RegExpExecArray | null;
      let colIndex = 1;

      while ((tcMatch = tcRegex.exec(rowXml)) !== null) {
        const cellXml = tcMatch[0];
        const cellText = cleanXmlTags(cellXml);

        if (cellText) {
          cells.push({
            rowIndex,
            colIndex,
            text: cellText,
          });

          sourceSnippets.push({
            location: {
              file: fileName,
              table: tableIndex,
              row: rowIndex,
              col: colIndex,
              rawText: cellText,
            },
            text: cellText,
          });
        }
        colIndex++;
      }

      if (cells.length > 0) {
        rows.push({ rowIndex, cells });
      }
      rowIndex++;
    }

    if (rows.length > 0) {
      tables.push({ tableIndex, rows });
    }
    tableIndex++;
  }

  // Parse standalone paragraphs: <w:p>...</w:p>
  // Avoid duplicating text that is already inside tables
  const docWithoutTables = docXml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/gi, "");
  const pRegex = /<w:p[\s\S]*?<\/w:p>/gi;
  let pMatch: RegExpExecArray | null;
  let pIndex = 1;

  while ((pMatch = pRegex.exec(docWithoutTables)) !== null) {
    const pText = extractTextFromWp(pMatch[0]);
    if (pText && pText.length > 1) {
      paragraphs.push({ index: pIndex, text: pText });
      sourceSnippets.push({
        location: {
          file: fileName,
          paragraph: pIndex,
          rawText: pText,
        },
        text: pText,
      });
      pIndex++;
    }
  }

  const allText = [
    ...paragraphs.map(p => p.text),
    ...tables.flatMap(t => t.rows.flatMap(r => r.cells.map(c => c.text))),
  ].join("\n");

  return {
    paragraphs,
    tables,
    allText,
    sourceSnippets,
  };
}
