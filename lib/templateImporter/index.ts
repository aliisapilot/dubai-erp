/**
 * Dubai ERP: PDF Designer - Unified Template Importer Engine
 * Entry point for importing DOCX, XLSX, and PDF files and reconstructing them into ERP templates.
 */

import type { DocumentTypeId } from "../documentDesigner";
import { extractPdfTemplate } from "./pdfExtractor";
import { extractDocxTemplate } from "./docxExtractor";
import { extractXlsxTemplate } from "./xlsxExtractor";
import { reconstructDocumentLayout } from "./layoutReconstructor";
import type { ImportedDocumentDraft, SupportedImportFormat } from "./types";

export * from "./types";
export * from "./fieldDefinitions";
export * from "./pdfExtractor";
export * from "./docxExtractor";
export * from "./xlsxExtractor";
export * from "./layoutReconstructor";

export interface ImportTemplateOptions {
  targetDocType: DocumentTypeId;
  templateName?: string;
  orientation?: "portrait" | "landscape";
}

/**
 * Imports an uploaded file (DOCX, XLSX, or PDF) and converts it into an editable ERP DocumentLayout.
 */
export async function importDocumentTemplate(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ImportTemplateOptions
): Promise<ImportedDocumentDraft> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  let arrayBuffer: ArrayBuffer;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    arrayBuffer = copy.buffer;
  } else if (data instanceof ArrayBuffer) {
    arrayBuffer = data;
  } else {
    const u8 = new Uint8Array(data as unknown as ArrayLike<number>);
    const copy = new Uint8Array(u8.byteLength);
    copy.set(u8);
    arrayBuffer = copy.buffer;
  }

  let format: SupportedImportFormat;
  if (ext === "pdf") {
    format = "pdf";
  } else if (ext === "docx" || ext === "doc") {
    format = "docx";
  } else if (ext === "xlsx" || ext === "xls") {
    format = "xlsx";
  } else {
    throw new Error(`Unsupported file format ".${ext}". Please upload a DOCX, XLSX, or PDF file.`);
  }

  const fileSizeBytes = arrayBuffer.byteLength;

  if (format === "pdf") {
    const extracted = await extractPdfTemplate(arrayBuffer, fileName);
    return reconstructDocumentLayout({
      fileName,
      fileSizeBytes,
      fileType: "pdf",
      targetDocType: options.targetDocType,
      templateName: options.templateName,
      orientation: options.orientation || extracted.orientation,
      extractedImages: extracted.extractedImages,
      detectedBlocks: extracted.detectedBlocks,
      detectedTables: extracted.detectedTables,
      detectedBranding: extracted.detectedBranding,
      originalPreviewUrl: extracted.originalPreviewUrl,
      userWarnings: extracted.warnings,
    });
  }

  if (format === "docx") {
    const extracted = await extractDocxTemplate(arrayBuffer, fileName);
    return reconstructDocumentLayout({
      fileName,
      fileSizeBytes,
      fileType: "docx",
      targetDocType: options.targetDocType,
      templateName: options.templateName,
      orientation: options.orientation || extracted.orientation,
      extractedImages: extracted.extractedImages,
      detectedBlocks: extracted.detectedBlocks,
      detectedTables: extracted.detectedTables,
      detectedBranding: extracted.detectedBranding,
      originalPreviewUrl: extracted.originalPreviewUrl,
      userWarnings: extracted.warnings,
    });
  }

  // format === "xlsx"
  const extracted = await extractXlsxTemplate(arrayBuffer, fileName);
  return reconstructDocumentLayout({
    fileName,
    fileSizeBytes,
    fileType: "xlsx",
    targetDocType: options.targetDocType,
    templateName: options.templateName,
    orientation: options.orientation || extracted.orientation,
    extractedImages: extracted.extractedImages,
    detectedBlocks: extracted.detectedBlocks,
    detectedTables: extracted.detectedTables,
    detectedBranding: extracted.detectedBranding,
    originalPreviewUrl: extracted.originalPreviewUrl,
    userWarnings: extracted.warnings,
  });
}
