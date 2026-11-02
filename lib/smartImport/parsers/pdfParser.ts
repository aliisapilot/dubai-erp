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
}

export interface PdfParseResult {
  pagesCount: number;
  pages: ParsedPdfPage[];
  allText: string;
  sourceSnippets: { location: SourceLocation; text: string }[];
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

  const uint8Data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8Data,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pages: ParsedPdfPage[] = [];
  const sourceSnippets: { location: SourceLocation; text: string }[] = [];
  const textAccumulator: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items: ParsedPdfTextItem[] = [];
    const lineMap: Map<number, { str: string; x: number; width: number }[]> = new Map();

    for (const rawItem of textContent.items) {
      const item = rawItem as { str?: string; transform?: number[]; width?: number; height?: number };
      if (!item.str || !item.str.trim()) continue;
      const x = Math.round(item.transform?.[4] || 0);
      const y = Math.round(item.transform?.[5] || 0);
      const width = item.width || 0;
      const str = item.str;

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
    });
  }

  return {
    pagesCount: pdfDoc.numPages,
    pages,
    allText: textAccumulator.join("\n\n"),
    sourceSnippets,
  };
}
