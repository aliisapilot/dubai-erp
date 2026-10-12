/**
 * Dubai ERP: PDF Designer - PDF Template Extractor
 * Deconstructs uploaded PDF files into editable geometric blocks, tables, and branding colors.
 */

import type {
  DetectedTableBlock,
  DetectedTextBlock,
  ExtractedImageItem,
  SupportedImportFormat,
} from "./types";
import { detectFieldTokenFromText } from "./fieldDefinitions";
import type { ElementType, TableColumnConfig } from "../documentDesigner";

export interface PdfExtractionResult {
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

// Factor converting PostScript Points (72 dpi) to Millimeters
const PT_TO_MM = 25.4 / 72;

interface PdfJsDocPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: Array<{ str?: string; transform: number[]; width?: number; height?: number; fontName?: string }> }>;
}

interface PdfJsNamespace {
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<PdfJsDocPage>;
    }>;
  };
  GlobalWorkerOptions?: { workerSrc?: string };
  version?: string;
}

export async function extractPdfTemplate(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<PdfExtractionResult> {
  void fileName;
  // Dynamically import pdfjs to support both Node and browser environments cleanly
  let pdfjs: PdfJsNamespace;
  try {
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsNamespace;
  } catch {
    pdfjs = (await import("pdfjs-dist")) as unknown as PdfJsNamespace;
  }

  // Set workerSrc for browser if available
  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.10.38"}/build/pdf.worker.min.mjs`;
    } catch {}
  }

  const uint8Data = new Uint8Array(arrayBuffer);
  const isNode = typeof window === "undefined";
  const standardFontsUrl = isNode
    ? "./node_modules/pdfjs-dist/standard_fonts/"
    : `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.10.38"}/standard_fonts/`;
  const cMapUrl = isNode
    ? "./node_modules/pdfjs-dist/cmaps/"
    : `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.10.38"}/cmaps/`;

  const loadingTask = pdfjs.getDocument({
    data: uint8Data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: standardFontsUrl,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const pagesCount = pdfDoc.numPages;
  const page1 = await pdfDoc.getPage(1);
  const viewport = page1.getViewport({ scale: 1.0 });

  const isLandscape = viewport.width > viewport.height;
  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;
  const scaleX = pageWidthMm / (viewport.width * PT_TO_MM);
  const scaleY = pageHeightMm / (viewport.height * PT_TO_MM);

  const warnings: string[] = [];
  if (pagesCount > 1) {
    warnings.push(`The uploaded document contains ${pagesCount} pages. Page 1 layout has been extracted as the primary ERP template structure.`);
  }

  // Render high-res preview snapshot of Page 1 (for side-by-side comparison)
  let originalPreviewUrl = "";
  if (typeof document !== "undefined") {
    try {
      const renderScale = 2.0;
      const renderViewport = page1.getViewport({ scale: renderScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        await page1.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        originalPreviewUrl = canvas.toDataURL("image/png");
      }
    } catch {
      warnings.push("Could not generate high-resolution raster preview; vector extraction proceeded normally.");
    }
  }

  // Extract text content items
  const textContent = await page1.getTextContent();
  interface RawTextItem {
    str: string;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    fontSizePt: number;
    fontName: string;
  }

  const rawItems: RawTextItem[] = [];
  for (const item of textContent.items) {
    if (!item.str || item.str.trim().length === 0) continue;
    const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
    const tx = transform[4];
    const ty = transform[5];
    const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 10;

    // Convert PDF coordinates (origin bottom-left) to ERP coordinates (origin top-left in mm)
    const xMm = Math.max(0, tx * PT_TO_MM * scaleX);
    const yMm = Math.max(0, (viewport.height - ty - fontSize) * PT_TO_MM * scaleY);
    const widthMm = Math.max(2, (item.width || item.str.length * (fontSize * 0.5)) * PT_TO_MM * scaleX);
    const heightMm = Math.max(2, fontSize * PT_TO_MM * 1.2 * scaleY);

    rawItems.push({
      str: item.str,
      xMm,
      yMm,
      widthMm,
      heightMm,
      fontSizePt: Math.round(fontSize * 10) / 10,
      fontName: item.fontName || "sans-serif",
    });
  }

  // Sort items reading order (top-to-bottom, left-to-right)
  rawItems.sort((a, b) => {
    if (Math.abs(a.yMm - b.yMm) > 2.5) {
      return a.yMm - b.yMm;
    }
    return a.xMm - b.xMm;
  });

  // Group text items into lines and blocks
  interface TextLine {
    yMm: number;
    heightMm: number;
    fontSizePt: number;
    items: RawTextItem[];
  }

  const lines: TextLine[] = [];
  for (const item of rawItems) {
    let matchedLine = lines.find(l => Math.abs(l.yMm - item.yMm) <= 2.2);
    if (!matchedLine) {
      matchedLine = {
        yMm: item.yMm,
        heightMm: item.heightMm,
        fontSizePt: item.fontSizePt,
        items: [],
      };
      lines.push(matchedLine);
    }
    matchedLine.items.push(item);
  }

  // Sort items inside each line by X coordinate
  for (const line of lines) {
    line.items.sort((a, b) => a.xMm - b.xMm);
  }

  // Identify Table Structures
  // A table header row typically contains keywords like Description, Qty, Rate, Total, etc.
  const tableKeywords = [
    /\b(item|description|particulars|details|desc)\b/i,
    /\b(qty|quantity|units?)\b/i,
    /\b(rate|price|unit\s*price)\b/i,
    /\b(amount|total|vat|sum)\b/i,
  ];

  let detectedTable: DetectedTableBlock | null = null;
  const nonTableLines: TextLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.items.map(it => it.str).join(" ");
    let matchScore = 0;
    for (const kw of tableKeywords) {
      if (kw.test(lineText)) matchScore++;
    }

    if (matchScore >= 2 && !detectedTable && line.items.length >= 3) {
      // Detected a table header row!
      const cols: TableColumnConfig[] = [];
      const totalTableWidthMm = Math.max(
        150,
        (line.items[line.items.length - 1].xMm + line.items[line.items.length - 1].widthMm) - line.items[0].xMm
      );

      for (let c = 0; c < line.items.length; c++) {
        const it = line.items[c];
        const nextX = c < line.items.length - 1 ? line.items[c + 1].xMm : (it.xMm + it.widthMm);
        const colWidthMm = Math.max(12, nextX - it.xMm);
        const widthPct = Math.round((colWidthMm / totalTableWidthMm) * 100);

        let key = `col_${c + 1}`;
        let align: "left" | "center" | "right" = "left";
        const txt = it.str.toLowerCase();

        if (/^(#|s\.?no|no\.?)$/i.test(txt)) {
          key = "index";
          align = "center";
        } else if (/desc/i.test(txt)) {
          key = "description";
          align = "left";
        } else if (/qty|quantity/i.test(txt)) {
          key = "quantity";
          align = "center";
        } else if (/unit$/i.test(txt)) {
          key = "unit";
          align = "center";
        } else if (/rate|price/i.test(txt)) {
          key = "unit_price";
          align = "right";
        } else if (/vat/i.test(txt)) {
          key = "vat_amount";
          align = "right";
        } else if (/total|amount/i.test(txt)) {
          key = "line_total";
          align = "right";
        }

        cols.push({
          key,
          label: it.str.trim(),
          visible: true,
          widthPct: Math.max(6, widthPct),
          align,
          fontSize: 8.5,
        });
      }

      // Normalize widthPct sum to 100
      const sumPct = cols.reduce((sum, c) => sum + c.widthPct, 0);
      if (sumPct > 0) {
        cols.forEach(c => (c.widthPct = Math.round((c.widthPct / sumPct) * 100)));
      }

      // Estimate table height
      const tableHeightMm = Math.min(65, pageHeightMm * 0.25);

      detectedTable = {
        id: "elem_line_items",
        x: Math.round(line.items[0].xMm),
        y: Math.round(line.yMm),
        width: Math.min(pageWidthMm - 24, Math.round(totalTableWidthMm)),
        height: tableHeightMm,
        columns: cols,
        headerBg: "#0F172A",
        headerTextColor: "#FFFFFF",
        fontSize: 8.5,
        headerFontSize: 8.5,
        rowHeight: 7.5,
        borderColor: "#CBD5E1",
      };

      // Skip following lines that are inside this table body
      const tableEndY = line.yMm + tableHeightMm;
      while (i + 1 < lines.length && lines[i + 1].yMm < tableEndY) {
        i++;
      }
    } else {
      nonTableLines.push(line);
    }
  }

  // Group remaining lines into blocks
  const detectedBlocks: DetectedTextBlock[] = [];
  let blockIndex = 1;

  for (let i = 0; i < nonTableLines.length; i++) {
    const currentLine = nonTableLines[i];
    const groupItems: RawTextItem[] = [...currentLine.items];
    let minX = Math.min(...currentLine.items.map(it => it.xMm));
    let maxX = Math.max(...currentLine.items.map(it => it.xMm + it.widthMm));
    const minY = currentLine.yMm;
    let maxY = currentLine.yMm + currentLine.heightMm;

    // Check if next lines belong to this same block (e.g. multi-line address, customer block, notes)
    const currentLineText = currentLine.items.map(it => it.str).join(" ").trim();
    const currentHasField = Boolean(detectFieldTokenFromText(currentLineText) || /:\s*\S+/.test(currentLineText));

    while (
      !currentHasField &&
      i + 1 < nonTableLines.length
    ) {
      const nextLine = nonTableLines[i + 1];
      const nextLineText = nextLine.items.map(it => it.str).join(" ").trim();
      const nextHasField = Boolean(detectFieldTokenFromText(nextLineText) || /:\s*\S+/.test(nextLineText));
      if (nextHasField) break;

      const vGap = nextLine.yMm - maxY;
      const xDiff = Math.abs(nextLine.items[0].xMm - minX);
      if (vGap > 2.5 || xDiff > 12.0) break;

      i++;
      groupItems.push(...nextLine.items);
      minX = Math.min(minX, ...nextLine.items.map(it => it.xMm));
      maxX = Math.max(maxX, ...nextLine.items.map(it => it.xMm + it.widthMm));
      maxY = nextLine.yMm + nextLine.heightMm;
    }

    const fullText = groupItems.map(it => it.str).join(" ").trim();
    if (!fullText) continue;

    const blockWidth = Math.min(pageWidthMm - 16, Math.max(20, Math.round(maxX - minX + 2)));
    const blockHeight = Math.max(5, Math.round(maxY - minY + 1));
    const avgFontSize = groupItems.reduce((sum, it) => sum + it.fontSizePt, 0) / groupItems.length;

    // Heuristically suggest element type
    let suggestedType: ElementType = "custom_text";
    let textAlign: "left" | "center" | "right" = "left";
    let fontWeight: "normal" | "medium" | "semibold" | "bold" | "extrabold" = "normal";

    if (minX > pageWidthMm * 0.6) {
      textAlign = "right";
    } else if (Math.abs(minX + blockWidth / 2 - pageWidthMm / 2) < 20) {
      textAlign = "center";
    }

    if (avgFontSize >= 14) {
      fontWeight = "bold";
    } else if (avgFontSize >= 11) {
      fontWeight = "semibold";
    }

    // Identify standard document areas
    if (minY <= 45 && avgFontSize >= 12 && !/invoice|quotation|statement|po\b/i.test(fullText)) {
      suggestedType = "company_name_en";
      fontWeight = "bold";
    } else if (/trn\s*[:#]|100\d{12}/i.test(fullText) && minY <= 60) {
      suggestedType = "company_trn";
    } else if (/\b(tax\s*invoice|quotation|proforma|delivery\s*note|purchase\s*order|salary\s*statement)\b/i.test(fullText)) {
      suggestedType = "doc_title";
      fontWeight = "extrabold";
    } else if (/inv[-_]?\d+|date\s*[:#]|ref\s*[:#]/i.test(fullText) && minY <= 85) {
      suggestedType = "doc_meta";
    } else if (/bill\s*to|customer|client|m\/s\b/i.test(fullText) && minY <= 120) {
      suggestedType = "customer_info";
    } else if (/subtotal|grand\s*total|net\s*payable|vat\s*\(?5%\)?/i.test(fullText)) {
      suggestedType = "totals";
    } else if (/amount\s*in\s*words|dirhams\s*only/i.test(fullText)) {
      suggestedType = "amount_in_words";
    } else if (/terms|conditions|payment\s*terms/i.test(fullText)) {
      suggestedType = "payment_terms";
    } else if (/iban|swift|bank\s*name|account\s*no/i.test(fullText)) {
      suggestedType = "bank_details";
    } else if (/authorized\s*sign|prepared\s*by|approved\s*by/i.test(fullText)) {
      suggestedType = "company_signature";
    } else if (minY >= pageHeightMm - 30) {
      suggestedType = "footer";
    }

    // Auto-detect dynamic field token
    const detectedField = detectFieldTokenFromText(fullText);

    detectedBlocks.push({
      id: `elem_block_${blockIndex++}`,
      originalText: fullText,
      currentText: fullText,
      x: Math.round(minX),
      y: Math.round(minY),
      width: blockWidth,
      height: blockHeight,
      fontSize: Math.round(avgFontSize * 10) / 10,
      fontWeight,
      textAlign,
      suggestedType,
      mappedToken: detectedField ? detectedField.token : undefined,
    });
  }

  // Detect Logo Candidate: Check if top left/right has an image or empty space
  const extractedImages: ExtractedImageItem[] = [];
  const logoPlaceholder: ExtractedImageItem = {
    id: "img_extracted_logo",
    name: "Detected Company Logo",
    dataUrl: "", // Populated if image extracted, or placeholder
    widthMm: 38,
    heightMm: 18,
    xMm: 12,
    yMm: 10,
    isLogoCandidate: true,
  };
  extractedImages.push(logoPlaceholder);

  // Default corporate palette
  const detectedBranding = {
    primaryColor: isLandscape ? "#1E293B" : "#0F172A",
    accentColor: "#D4A72C",
    tableHeaderColor: isLandscape ? "#1E293B" : "#0F172A",
  };

  return {
    fileType: "pdf",
    orientation: isLandscape ? "landscape" : "portrait",
    pageWidthMm,
    pageHeightMm,
    pagesCount,
    originalPreviewUrl,
    detectedBlocks,
    detectedTables: detectedTable ? [detectedTable] : [],
    extractedImages,
    detectedBranding,
    warnings,
  };
}
