/**
 * Dubai ERP: PDF Designer - Template Importer Types
 */

import type { DocumentLayout, DocumentTypeId, ElementType, TableColumnConfig } from "../documentDesigner";

export type SupportedImportFormat = "pdf" | "docx" | "xlsx";

export interface ExtractedImageItem {
  id: string;
  name: string;
  dataUrl: string;
  widthMm: number;
  heightMm: number;
  xMm?: number;
  yMm?: number;
  isLogoCandidate?: boolean;
}

export interface DetectedTextBlock {
  id: string;
  originalText: string;
  currentText: string;
  x: number; // mm from left edge
  y: number; // mm from top edge
  width: number; // mm
  height: number; // mm
  fontSize: number; // pt
  fontWeight?: "normal" | "medium" | "semibold" | "bold" | "extrabold";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  suggestedType: ElementType;
  mappedToken?: string; // e.g. "{customer_name}" or custom string
}

export interface DetectedTableBlock {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: TableColumnConfig[];
  headerBg: string;
  headerTextColor: string;
  fontSize: number;
  headerFontSize?: number;
  rowHeight: number;
  borderColor: string;
  sampleRows?: Array<Record<string, string | number>>;
}

export interface ConversionReport {
  format: SupportedImportFormat;
  fileName: string;
  fileSizeBytes: number;
  pagesAnalyzed: number;
  elementsDetected: number;
  tablesDetected: number;
  imagesDetected: number;
  autoMappedTokens: number;
  warnings: string[];
  conversionNotes: string[];
}

export interface ImportedDocumentDraft {
  id: string;
  fileName: string;
  fileType: SupportedImportFormat;
  targetDocumentType: DocumentTypeId;
  orientation: "portrait" | "landscape";
  pageWidthMm: number;
  pageHeightMm: number;
  originalPreviewUrl: string; // High-res rendered image of original page 1
  extractedImages: ExtractedImageItem[];
  extractedColors: {
    primary: string;
    accent: string;
    text: string;
    muted: string;
    borderColor: string;
    tableHeaderBg: string;
    totalHighlight: string;
  };
  detectedBlocks: DetectedTextBlock[];
  detectedTables: DetectedTableBlock[];
  conversionReport: ConversionReport;
  reconstructedLayout: DocumentLayout;
}
