/**
 * Dubai ERP: Smart Import - PDF Document Parser
 * Parses PDF documents, extracts text items with page coordinates,
 * identifies tabular sections, lines, and key-values.
 */

import type { SourceLocation } from "../types";

export interface ParsedPdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ParsedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  lines: string[];
  items: ParsedPdfTextItem[];
  characterCount?: number;
  nonWhitespaceCharacterCount?: number;
  imageOperatorCount?: number;
}

export interface PdfParseResult {
  pagesCount: number;
  pages: ParsedPdfPage[];
  allText: string;
  sourceSnippets: { location: SourceLocation; text: string }[];
  totalCharacterCount: number;
  nonWhitespaceCharacterCount: number;
  imageOperatorCount: number;
  hasSelectableText: boolean;
  isImageOnly: boolean;
}

export async function parsePdf(
  buffer: ArrayBuffer,
  fileName: string
): Promise<PdfParseResult> {
  if (typeof window === "undefined") {
    // Node.js / Next.js server runtime: bind pdf.worker.mjs directly onto globalThis
    // This allows PDFWorker to resolve WorkerMessageHandler synchronously in-process
    // without looking for external worker files in .next/server/chunks.
    try {
      if (!(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker) {
        // @ts-expect-error pdfjs-dist legacy worker does not ship separate .d.ts
        const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
      }
    } catch (workerErr) {
      console.warn("Could not preload pdf.worker.mjs in Node runtime:", workerErr);
    }
  }

  let pdfjs: {
    getDocument: (options: unknown) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getViewport: (p: { scale: number }) => { width: number; height: number };
          getTextContent: () => Promise<{ items: unknown[] }>;
        }>;
      }>;
    };
    GlobalWorkerOptions?: { workerSrc?: string };
    version?: string;
  };
  try {
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof pdfjs;
  } catch {
    pdfjs = (await import("pdfjs-dist")) as unknown as typeof pdfjs;
  }

  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.10.38"}/build/pdf.worker.min.mjs`;
    } catch {}
  }

  const uint8Data = new Uint8Array(
    (buffer as { slice?: (start: number, end?: number) => unknown }).slice
      ? (buffer as { slice: (start: number) => ArrayBuffer }).slice(0)
      : buffer
  );

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
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pages: ParsedPdfPage[] = [];
  const sourceSnippets: { location: SourceLocation; text: string }[] = [];
  const textAccumulator: string[] = [];

  let totalChars = 0;
  let totalNonWhitespaceChars = 0;
  let totalImageOps = 0;

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    // Inspect operator list for image operations
    let pageImageOps = 0;
    try {
      const opList = await (page as unknown as { getOperatorList?: () => Promise<{ fnArray: number[] }> }).getOperatorList?.();
      if (opList && Array.isArray(opList.fnArray)) {
        const paintImageXObject = (pdfjs as unknown as { OPS?: { paintImageXObject?: number } }).OPS?.paintImageXObject ?? 85;
        const paintInlineImageXObject = (pdfjs as unknown as { OPS?: { paintInlineImageXObject?: number } }).OPS?.paintInlineImageXObject ?? 86;
        for (const fn of opList.fnArray) {
          if (fn === paintImageXObject || fn === paintInlineImageXObject) {
            pageImageOps++;
          }
        }
      }
    } catch (opErr) {
      console.warn(`Could not get operator list for page ${pageNum}:`, opErr);
    }
    totalImageOps += pageImageOps;

    const items: ParsedPdfTextItem[] = [];
    const lineMap: Map<number, { str: string; x: number; width: number }[]> = new Map();
    let pageChars = 0;
    let pageNonWhitespaceChars = 0;

    for (const rawItem of textContent.items) {
      const item = rawItem as { str?: string; transform?: number[]; width?: number; height?: number };
      if (!item.str || !item.str.trim()) continue;
      const x = Math.round(item.transform?.[4] || 0);
      const y = Math.round(item.transform?.[5] || 0);
      const width = item.width || 0;
      const str = item.str;

      pageChars += str.length;
      pageNonWhitespaceChars += str.replace(/\s+/g, "").length;

      items.push({
        str,
        x,
        y,
        width,
        height: item.height || 0,
        page: pageNum,
      });

      // Group by approximate line (y coordinate bucket within 4 points)
      const bucketY = Math.round(y / 4) * 4;
      if (!lineMap.has(bucketY)) {
        lineMap.set(bucketY, []);
      }
      lineMap.get(bucketY)!.push({ str, x, width });
    }

    totalChars += pageChars;
    totalNonWhitespaceChars += pageNonWhitespaceChars;

    // Sort lines from top (highest Y in PDF coords) to bottom
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];

    for (let lineIdx = 0; lineIdx < sortedY.length; lineIdx++) {
      const y = sortedY[lineIdx];
      // Sort words on this line horizontally from left to right (by X coordinate)
      const lineWords = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      let lineStr = "";
      for (let i = 0; i < lineWords.length; i++) {
        const w = lineWords[i];
        if (i === 0) {
          lineStr = w.str;
        } else {
          const prev = lineWords[i - 1];
          const gap = w.x - (prev.x + prev.width);
          // If gap between bounding boxes is greater than 2.0 points, insert space
          if (gap > 2.0) {
            lineStr += " " + w.str;
          } else {
            lineStr += w.str;
          }
        }
      }
      lineStr = lineStr.trim();
      if (lineStr) {
        lines.push(lineStr);
        sourceSnippets.push({
          location: {
            file: fileName,
            page: pageNum,
            row: lineIdx + 1,
            rawText: lineStr,
          },
          text: `Page ${pageNum}, Line ${lineIdx + 1}: ${lineStr}`,
        });
      }
    }

    const pageText = lines.join("\n");
    textAccumulator.push(pageText);

    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      text: pageText,
      lines,
      items,
      characterCount: pageChars,
      nonWhitespaceCharacterCount: pageNonWhitespaceChars,
      imageOperatorCount: pageImageOps,
    });
  }

  const hasSelectableText = totalNonWhitespaceChars >= 20;
  const isImageOnly = totalImageOps > 0 && !hasSelectableText;

  return {
    pagesCount: pdfDoc.numPages,
    pages,
    allText: textAccumulator.join("\n\n"),
    sourceSnippets,
    totalCharacterCount: totalChars,
    nonWhitespaceCharacterCount: totalNonWhitespaceChars,
    imageOperatorCount: totalImageOps,
    hasSelectableText,
    isImageOnly,
  };
}
