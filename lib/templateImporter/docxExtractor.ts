/**
 * Dubai ERP: PDF Designer - DOCX Template Extractor
 * Unpacks .docx archives, parses document XML, and extracts paragraphs, tables, images, and styling.
 */

import type {
  DetectedTableBlock,
  DetectedTextBlock,
  ExtractedImageItem,
  SupportedImportFormat,
} from "./types";
import { detectFieldTokenFromText } from "./fieldDefinitions";
import type { ElementType, TableColumnConfig } from "../documentDesigner";

export interface DocxExtractionResult {
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

export async function extractDocxTemplate(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<DocxExtractionResult> {
  void fileName;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  const warnings: string[] = [];
  const extractedImages: ExtractedImageItem[] = [];

  // Extract embedded images from word/media/
  const mediaFiles = Object.keys(zip.files).filter(path => /^word\/media\//i.test(path));
  let imgIndex = 1;
  for (const imgPath of mediaFiles) {
    try {
      const file = zip.file(imgPath);
      if (!file) continue;
      const base64 = await file.async("base64");
      const ext = imgPath.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
      const dataUrl = `data:${mime};base64,${base64}`;

      extractedImages.push({
        id: `img_docx_${imgIndex++}`,
        name: imgPath.replace("word/media/", ""),
        dataUrl,
        widthMm: 38,
        heightMm: 18,
        xMm: 12,
        yMm: 10,
        isLogoCandidate: extractedImages.length === 0, // first image is prime logo candidate
      });
    } catch {}
  }

  // Read word/document.xml
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Invalid DOCX file: word/document.xml not found.");
  }
  const docXmlText = await docXmlFile.async("text");

  // Determine page dimensions and orientation from <w:pgSz>
  let isLandscape = false;
  const pgSzMatch = docXmlText.match(/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"([^>]*)>/i) ||
                    docXmlText.match(/<w:pgSz[^>]*w:orient="landscape"/i);

  if (pgSzMatch) {
    if (typeof pgSzMatch[1] === "string" && typeof pgSzMatch[2] === "string") {
      const w = parseInt(pgSzMatch[1], 10);
      const h = parseInt(pgSzMatch[2], 10);
      if (w > h) isLandscape = true;
    } else if (docXmlText.includes('w:orient="landscape"')) {
      isLandscape = true;
    }
  }

  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;

  // Track branding colors extracted from runs and shading
  const colorMatches = docXmlText.match(/w:color\s*w:val="([A-Fa-f0-9]{6})"/gi) || [];
  const hexColors: string[] = colorMatches
    .map(m => "#" + m.replace(/w:color\s*w:val="/i, "").replace(/"/, "").toUpperCase())
    .filter(c => c !== "#000000" && c !== "#FFFFFF");

  const primaryColor = hexColors[0] || (isLandscape ? "#1E293B" : "#0F172A");
  const accentColor = hexColors[1] || "#D4A72C";

  // Parse tables (<w:tbl>)
  const detectedTables: DetectedTableBlock[] = [];
  const tableRegex = /<w:tbl[\s\S]*?<\/w:tbl>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(docXmlText)) !== null) {
    const tblXml = tableMatch[0];
    const rowMatches = tblXml.match(/<w:tr[\s\S]*?<\/w:tr>/gi) || [];
    if (rowMatches.length < 2) continue; // Need at least header + 1 row

    // Parse header row (<w:tr>)
    const headerRow = rowMatches[0];
    if (!headerRow) continue;
    const cellMatches = headerRow.match(/<w:tc[\s\S]*?<\/w:tc>/gi) || [];
    if (cellMatches.length < 2) continue;

    const cols: TableColumnConfig[] = [];
    let headerBg = primaryColor;

    for (let c = 0; c < cellMatches.length; c++) {
      const cell = cellMatches[c];
      // Extract cell text
      const textMatches = cell.match(/<w:t[^>]*>([^<]+)<\/w:t>/gi) || [];
      const cellText = textMatches.map(t => t.replace(/<[^>]+>/g, "")).join(" ").trim();

      // Check cell shading
      const shdMatch = cell.match(/<w:shd[^>]*w:fill="([A-Fa-f0-9]{6})"/i);
      if (shdMatch && shdMatch[1] && shdMatch[1] !== "auto") {
        headerBg = "#" + shdMatch[1];
      }

      let key = `col_${c + 1}`;
      let align: "left" | "center" | "right" = "left";
      const clean = cellText.toLowerCase();

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
        label: cellText || `Column ${c + 1}`,
        visible: true,
        widthPct: Math.round(100 / cellMatches.length),
        align,
        fontSize: 8.5,
      });
    }

    if (cols.length > 0) {
      detectedTables.push({
        id: "elem_line_items",
        x: 12,
        y: 95,
        width: pageWidthMm - 24,
        height: 52,
        columns: cols,
        headerBg,
        headerTextColor: "#FFFFFF",
        fontSize: 8.5,
        headerFontSize: 8.5,
        rowHeight: 7.5,
        borderColor: "#CBD5E1",
      });
      break; // Single primary item table
    }
  }

  // Parse paragraphs (<w:p>) that are not inside tables
  // Replace tables with placeholders to avoid duplicate text
  const cleanDocXml = docXmlText.replace(/<w:tbl[\s\S]*?<\/w:tbl>/gi, "<!-- TABLE -->");
  const pRegex = /<w:p[\s\S]*?<\/w:p>/gi;
  const rawParagraphs: Array<{
    text: string;
    fontSizePt: number;
    fontWeight: "normal" | "medium" | "semibold" | "bold" | "extrabold";
    align: "left" | "center" | "right";
    color?: string;
  }> = [];

  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(cleanDocXml)) !== null) {
    const pXml = pMatch[0];
    const textMatches = pXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/gi);
    if (!textMatches) continue;
    const fullText = textMatches.map(t => t.replace(/<[^>]+>/g, "")).join("").trim();
    if (!fullText) continue;

    // Font size: <w:sz w:val="24"/> (half points -> pt)
    let fontSizePt = 10;
    const szMatch = pXml.match(/<w:sz\s*w:val="(\d+)"/i);
    if (szMatch) {
      fontSizePt = parseInt(szMatch[1], 10) / 2;
    }

    // Bold: <w:b/>
    const isBold = /<w:b(\/>|\s[^>]*\/>)/i.test(pXml);

    // Alignment: <w:jc w:val="center|right|left"/>
    let align: "left" | "center" | "right" = "left";
    const jcMatch = pXml.match(/<w:jc\s*w:val="([a-zA-Z]+)"/i);
    if (jcMatch) {
      const v = jcMatch[1].toLowerCase();
      if (v === "center") align = "center";
      else if (v === "right") align = "right";
    }

    // Color: <w:color w:val="0F172A"/>
    let color: string | undefined;
    const colorMatch = pXml.match(/<w:color\s*w:val="([A-Fa-f0-9]{6})"/i);
    if (colorMatch && colorMatch[1] && colorMatch[1] !== "auto") {
      color = "#" + colorMatch[1];
    }

    rawParagraphs.push({
      text: fullText,
      fontSizePt,
      fontWeight: isBold ? "bold" : fontSizePt >= 13 ? "semibold" : "normal",
      align,
      color,
    });
  }

  // Arrange paragraphs vertically into A4 document blocks
  const detectedBlocks: DetectedTextBlock[] = [];
  let currentY = 12;
  let blockIdx = 1;

  for (const p of rawParagraphs) {
    const text = p.text;
    const blockHeight = Math.max(6, Math.min(24, Math.round(p.fontSizePt * 0.9 * (text.length > 50 ? 2 : 1))));
    const blockWidth = p.align === "center" ? pageWidthMm - 24 : Math.min(pageWidthMm - 24, Math.max(35, text.length * 3.5));

    let suggestedType: ElementType = "custom_text";
    if (currentY <= 30 && p.fontSizePt >= 13) {
      suggestedType = "company_name_en";
    } else if (/trn\s*[:#]|100\d{12}/i.test(text) && currentY <= 50) {
      suggestedType = "company_trn";
    } else if (/\b(tax\s*invoice|quotation|proforma|delivery\s*note|purchase\s*order|salary\s*statement)\b/i.test(text)) {
      suggestedType = "doc_title";
    } else if (/inv[-_]?\d+|date\s*[:#]|ref\s*[:#]/i.test(text) && currentY <= 85) {
      suggestedType = "doc_meta";
    } else if (/bill\s*to|customer|client|m\/s\b/i.test(text) && currentY <= 110) {
      suggestedType = "customer_info";
    } else if (/subtotal|grand\s*total|net\s*payable|vat\s*\(?5%\)?/i.test(text)) {
      suggestedType = "totals";
    } else if (/amount\s*in\s*words/i.test(text)) {
      suggestedType = "amount_in_words";
    } else if (/terms|conditions/i.test(text)) {
      suggestedType = "payment_terms";
    } else if (/iban|swift|bank\s*name/i.test(text)) {
      suggestedType = "bank_details";
    } else if (/authorized\s*sign|prepared\s*by/i.test(text)) {
      suggestedType = "company_signature";
    } else if (currentY >= pageHeightMm - 30) {
      suggestedType = "footer";
    }

    const detectedField = detectFieldTokenFromText(text);

    let x = 12;
    if (p.align === "right") {
      x = pageWidthMm - blockWidth - 12;
    } else if (p.align === "center") {
      x = Math.round((pageWidthMm - blockWidth) / 2);
    }

    detectedBlocks.push({
      id: `elem_docx_block_${blockIdx++}`,
      originalText: text,
      currentText: text,
      x: Math.max(8, x),
      y: Math.round(currentY),
      width: Math.round(blockWidth),
      height: blockHeight,
      fontSize: p.fontSizePt,
      fontWeight: p.fontWeight,
      textAlign: p.align,
      color: p.color,
      suggestedType,
      mappedToken: detectedField ? detectedField.token : undefined,
    });

    currentY += blockHeight + 3;
    if (detectedTables.length > 0 && Math.abs(currentY - 95) <= 10) {
      // jump past the table
      currentY = 95 + 52 + 5;
    }
  }

  return {
    fileType: "docx",
    orientation: isLandscape ? "landscape" : "portrait",
    pageWidthMm,
    pageHeightMm,
    pagesCount: 1,
    originalPreviewUrl: extractedImages[0]?.dataUrl || "",
    detectedBlocks,
    detectedTables,
    extractedImages,
    detectedBranding: {
      primaryColor,
      accentColor,
      tableHeaderColor: primaryColor,
    },
    warnings,
  };
}
