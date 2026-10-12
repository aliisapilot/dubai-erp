/**
 * Dubai ERP: PDF Designer - Template Layout Reconstructor
 * Converts extracted raw document blocks, tables, and branding into a production DocumentLayout.
 */

import {
  CURRENT_LAYOUT_VERSION,
  DEFAULT_PAGE_BORDERS,
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_SMART_FIT_SETTINGS,
  DOCUMENT_TYPE_OPTIONS,
  DocumentLayout,
  DocumentTypeId,
  LayoutElement,
  TableColumnConfig,
  createDefaultLayout,
  DEFAULT_INVOICE_COLUMNS,
  DEFAULT_DELIVERY_COLUMNS,
  DEFAULT_STATEMENT_COLUMNS,
  DEFAULT_SALARY_COLUMNS,
  DEFAULT_MEASUREMENT_COLUMNS,
} from "../documentDesigner";
import type {
  ConversionReport,
  DetectedTableBlock,
  DetectedTextBlock,
  ExtractedImageItem,
  ImportedDocumentDraft,
  SupportedImportFormat,
} from "./types";

export interface ReconstructOptions {
  fileName: string;
  fileSizeBytes: number;
  fileType: SupportedImportFormat;
  targetDocType: DocumentTypeId;
  templateName?: string;
  orientation?: "portrait" | "landscape";
  extractedImages: ExtractedImageItem[];
  detectedBlocks: DetectedTextBlock[];
  detectedTables: DetectedTableBlock[];
  detectedBranding: {
    primaryColor: string;
    accentColor: string;
    tableHeaderColor: string;
  };
  originalPreviewUrl: string;
  userWarnings?: string[];
}

export function reconstructDocumentLayout(options: ReconstructOptions): ImportedDocumentDraft {
  const {
    fileName,
    fileSizeBytes,
    fileType,
    targetDocType,
    extractedImages,
    detectedBlocks,
    detectedTables,
    detectedBranding,
    originalPreviewUrl,
    userWarnings = [],
  } = options;

  const defaultBaseLayout = createDefaultLayout(targetDocType);

  const orientation = options.orientation || (targetDocType === "measurement_sheet" ? "landscape" : "portrait");
  const isLandscape = orientation === "landscape";
  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;

  const primaryColor = detectedBranding.primaryColor || defaultBaseLayout.branding.primaryColor;
  const accentColor = detectedBranding.accentColor || defaultBaseLayout.branding.accentColor;
  const tableHeaderColor = detectedBranding.tableHeaderColor || primaryColor;

  const finalTemplateName = options.templateName?.trim() || `Imported - ${fileName.replace(/\.[^/.]+$/, "")}`;

  // Find logo candidate image
  const logoCandidate = extractedImages.find(img => img.isLogoCandidate && img.dataUrl);

  // Check extracted blocks for company name, doc title, address, etc.
  const compNameBlock = detectedBlocks.find(b => b.suggestedType === "company_name_en");
  const compTrnBlock = detectedBlocks.find(b => b.suggestedType === "company_trn");
  const docTitleBlock = detectedBlocks.find(b => b.suggestedType === "doc_title");
  const docMetaBlock = detectedBlocks.find(b => b.suggestedType === "doc_meta");
  const customerBlock = detectedBlocks.find(b => b.suggestedType === "customer_info");
  const totalsBlock = detectedBlocks.find(b => b.suggestedType === "totals");

  // Determine Table Columns: Use detected table or document default
  let tableColumns: TableColumnConfig[] = [];
  if (detectedTables.length > 0 && detectedTables[0].columns.length >= 2) {
    tableColumns = detectedTables[0].columns;
  } else {
    if (targetDocType === "salary_statement") {
      tableColumns = DEFAULT_SALARY_COLUMNS;
    } else if (targetDocType === "delivery_note") {
      tableColumns = DEFAULT_DELIVERY_COLUMNS;
    } else if (targetDocType === "customer_statement") {
      tableColumns = DEFAULT_STATEMENT_COLUMNS;
    } else if (targetDocType === "measurement_sheet") {
      tableColumns = DEFAULT_MEASUREMENT_COLUMNS;
    } else {
      tableColumns = DEFAULT_INVOICE_COLUMNS;
    }
  }

  // Construct elements array
  const elements: LayoutElement[] = [];

  // 1. Watermark
  elements.push({
    id: "watermark",
    type: "watermark",
    label: "Background Watermark",
    x: Math.round(pageWidthMm * 0.25),
    y: Math.round(pageHeightMm * 0.3),
    width: Math.round(pageWidthMm * 0.5),
    height: Math.round(pageHeightMm * 0.4),
    visible: true,
    locked: false,
    zIndex: 1,
    opacity: 0.035,
  });

  // 2. Company Logo
  elements.push({
    id: "logo",
    type: "logo",
    label: "Company Logo",
    x: 12,
    y: 10,
    width: 38,
    height: 18,
    visible: true,
    locked: false,
    zIndex: 10,
    imageSrc: logoCandidate ? logoCandidate.dataUrl : undefined,
    imageFit: "contain",
  });

  // 3. Company Name (English)
  elements.push({
    id: "company_name_en",
    type: "company_name_en",
    label: "Company Name (EN)",
    x: 54,
    y: compNameBlock ? compNameBlock.y : 10,
    width: Math.min(pageWidthMm - 66, compNameBlock ? compNameBlock.width : 144),
    height: compNameBlock ? compNameBlock.height : 8,
    visible: true,
    locked: false,
    zIndex: 11,
    fontSize: compNameBlock ? compNameBlock.fontSize : 13,
    fontWeight: "bold",
    color: primaryColor,
    customText: compNameBlock ? compNameBlock.currentText : undefined,
  });

  // 4. Company TRN & Details
  elements.push({
    id: "company_address",
    type: "company_address",
    label: "Company Details & TRN",
    x: 54,
    y: 19,
    width: Math.min(pageWidthMm - 66, 144),
    height: 9,
    visible: true,
    locked: false,
    zIndex: 12,
    fontSize: 8.5,
    color: "#64748B",
    customText: compTrnBlock ? compTrnBlock.currentText : undefined,
  });

  // 5. Document Title Banner
  elements.push({
    id: "doc_title",
    type: "doc_title",
    label: "Document Title Banner",
    x: 12,
    y: docTitleBlock ? Math.max(28, docTitleBlock.y) : 30,
    width: pageWidthMm - 24,
    height: docTitleBlock ? Math.max(8, docTitleBlock.height) : 9,
    visible: true,
    locked: false,
    zIndex: 15,
    backgroundColor: primaryColor,
    color: "#FFFFFF",
    fontSize: docTitleBlock ? docTitleBlock.fontSize : 12,
    fontWeight: "extrabold",
    borderRadius: 3,
  });

  // 6. Document Metadata (Date, Ref No)
  const metaY = docTitleBlock ? Math.max(38, docTitleBlock.y + 10) : 41;
  elements.push({
    id: "doc_meta",
    type: "doc_meta",
    label: "Document Metadata & Date",
    x: Math.round(pageWidthMm * 0.55),
    y: docMetaBlock ? docMetaBlock.y : metaY,
    width: Math.round(pageWidthMm * 0.45) - 12,
    height: docMetaBlock ? docMetaBlock.height : 24,
    visible: true,
    locked: false,
    zIndex: 16,
    fontSize: 8.5,
    borderColor: "#CBD5E1",
    borderWidth: 1,
    borderRadius: 4,
    customText: docMetaBlock && docMetaBlock.mappedToken ? docMetaBlock.mappedToken : undefined,
  });

  // 7. Customer / Client Block
  elements.push({
    id: "customer_info",
    type: "customer_info",
    label: targetDocType === "salary_statement" ? "Employee Details" : "Customer / Client Info",
    x: 12,
    y: customerBlock ? customerBlock.y : metaY,
    width: Math.round(pageWidthMm * 0.5) - 14,
    height: customerBlock ? customerBlock.height : 24,
    visible: true,
    locked: false,
    zIndex: 17,
    fontSize: 8.5,
    borderColor: "#CBD5E1",
    borderWidth: 1,
    borderRadius: 4,
    customText: customerBlock && customerBlock.mappedToken ? customerBlock.mappedToken : undefined,
  });

  // 8. Line Items Table (with dynamic rows support)
  const tableY = detectedTables.length > 0 ? detectedTables[0].y : Math.max(70, metaY + 28);
  const tableHeight = detectedTables.length > 0 ? detectedTables[0].height : 52;

  elements.push({
    id: "elem_line_items",
    type: "line_items",
    label: "Line Items Table",
    x: 12,
    y: tableY,
    width: pageWidthMm - 24,
    height: tableHeight,
    visible: true,
    locked: false,
    zIndex: 20,
    tableSettings: {
      headerBg: tableHeaderColor,
      headerTextColor: "#FFFFFF",
      fontSize: 8.5,
      headerFontSize: 8.5,
      rowHeight: 7.5,
      headerHeight: 7.5,
      borderThickness: 1,
      borderColor: "#CBD5E1",
      bodyTextColor: "#1E293B",
      columns: tableColumns,
    },
  });

  // 9. Totals Section (Follower of table)
  const totalsY = tableY + tableHeight + 4;
  elements.push({
    id: "totals",
    type: "totals",
    label: "Totals & Tax Summary",
    x: Math.round(pageWidthMm * 0.55),
    y: totalsBlock ? Math.max(totalsY, totalsBlock.y) : totalsY,
    width: Math.round(pageWidthMm * 0.45) - 12,
    height: totalsBlock ? totalsBlock.height : 26,
    visible: true,
    locked: false,
    zIndex: 25,
    fontSize: 9.0,
    borderColor: "#CBD5E1",
    borderWidth: 1,
    borderRadius: 4,
    flowMode: "flow",
    flowAnchorId: "elem_line_items",
    minGapMm: 3,
  });

  // 10. Amount in Words
  elements.push({
    id: "amount_in_words",
    type: "amount_in_words",
    label: "Amount in Words",
    x: 12,
    y: totalsY,
    width: Math.round(pageWidthMm * 0.5) - 14,
    height: 14,
    visible: true,
    locked: false,
    zIndex: 26,
    fontSize: 8.5,
    borderColor: "#CBD5E1",
    borderWidth: 1,
    borderRadius: 4,
    flowMode: "flow",
    flowAnchorId: "elem_line_items",
    minGapMm: 3,
  });

  // 11. Payment Terms / Bank Details
  elements.push({
    id: "payment_terms",
    type: "payment_terms",
    label: "Payment Terms & Notes",
    x: 12,
    y: totalsY + 16,
    width: Math.round(pageWidthMm * 0.5) - 14,
    height: 20,
    visible: true,
    locked: false,
    zIndex: 27,
    fontSize: 8.0,
    flowMode: "flow",
    flowAnchorId: "elem_line_items",
    minGapMm: 3,
  });

  // 12. Company Signature
  elements.push({
    id: "company_signature",
    type: "company_signature",
    label: "Company Authorized Signature",
    x: pageWidthMm - 62,
    y: totalsY + 30,
    width: 50,
    height: 18,
    visible: true,
    locked: false,
    zIndex: 28,
    fontSize: 7.5,
    flowMode: "flow",
    flowAnchorId: "elem_line_items",
    minGapMm: 3,
  });

  // 13. Footer
  elements.push({
    id: "footer",
    type: "footer",
    label: "Page Footer & Contact Strip",
    x: 12,
    y: pageHeightMm - 16,
    width: pageWidthMm - 24,
    height: 10,
    visible: true,
    locked: false,
    zIndex: 30,
    fontSize: 7.5,
    color: "#64748B",
    borderColor: "#E2E8F0",
  });

  // Add any specific detected blocks that contain mapped field tokens as custom_text elements
  let customElementCount = 0;
  for (const block of detectedBlocks) {
    if (
      block.mappedToken &&
      !["company_name_en", "company_trn", "doc_title", "doc_meta", "customer_info", "totals"].includes(block.suggestedType)
    ) {
      elements.push({
        id: `custom_${block.id}`,
        type: "custom_text",
        label: `Mapped Field: ${block.mappedToken}`,
        x: Math.max(8, Math.min(pageWidthMm - block.width - 8, block.x)),
        y: Math.max(8, Math.min(pageHeightMm - block.height - 8, block.y)),
        width: block.width,
        height: block.height,
        visible: true,
        locked: false,
        zIndex: 35,
        fontSize: block.fontSize,
        fontWeight: block.fontWeight,
        textAlign: block.textAlign,
        customText: block.mappedToken,
      });
      customElementCount++;
    }
  }

  // Count auto-mapped tokens
  const autoMappedTokens = detectedBlocks.filter(b => Boolean(b.mappedToken)).length;

  const conversionNotes: string[] = [
    `Accurately reconstructed ${elements.length} layout elements from uploaded ${fileType.toUpperCase()} file.`,
    `Extracted corporate palette: Primary ${primaryColor}, Accent ${accentColor}.`,
    `Configured ${tableColumns.length} table columns with auto-wrapping and follower spacing.`,
    `A4 ${orientation} canvas set (${pageWidthMm}mm × ${pageHeightMm}mm).`,
  ];

  if (customElementCount > 0) {
    conversionNotes.push(`Mapped ${customElementCount} custom dynamic text regions with ERP tokens.`);
  }

  const warnings = [...userWarnings];
  if (detectedTables.length === 0) {
    warnings.push("No explicit table grid was detected in the document; standard ERP table structure was applied.");
  }

  const report: ConversionReport = {
    format: fileType,
    fileName,
    fileSizeBytes,
    pagesAnalyzed: 1,
    elementsDetected: detectedBlocks.length + detectedTables.length,
    tablesDetected: detectedTables.length,
    imagesDetected: extractedImages.length,
    autoMappedTokens,
    warnings,
    conversionNotes,
  };

  const reconstructedLayout: DocumentLayout = {
    version: CURRENT_LAYOUT_VERSION,
    documentType: targetDocType,
    templateName: finalTemplateName,
    documentTitle: DOCUMENT_TYPE_OPTIONS.find(d => d.id === targetDocType)?.defaultTitle || "TAX INVOICE",
    page: {
      paper: "A4",
      orientation,
      widthMm: pageWidthMm,
      heightMm: pageHeightMm,
      margins: { top: 8, right: 8, bottom: 8, left: 8 },
      background: "#FFFFFF",
      watermarkOpacity: 0.035,
      borders: {
        ...DEFAULT_PAGE_BORDERS,
        top: {
          ...DEFAULT_PAGE_BORDERS.top,
          color: accentColor,
          secondaryColor: primaryColor,
        },
        bottom: {
          ...DEFAULT_PAGE_BORDERS.bottom,
          color: primaryColor,
          secondaryColor: accentColor,
        },
      },
      smartFit: {
        ...DEFAULT_SMART_FIT_SETTINGS,
        preferSinglePage: true,
        mode: "balanced",
        automaticSpacing: true,
      },
      printSettings: {
        ...DEFAULT_PRINT_SETTINGS,
      },
    },
    branding: {
      primaryColor,
      accentColor,
      textColor: "#1E293B",
      mutedColor: "#64748B",
      borderColor: "#CBD5E1",
      tableHeaderColor,
      totalHighlightColor: "#F8F6ED",
    },
    elements,
  };

  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fileName,
    fileType,
    targetDocumentType: targetDocType,
    orientation,
    pageWidthMm,
    pageHeightMm,
    originalPreviewUrl,
    extractedImages,
    extractedColors: {
      primary: primaryColor,
      accent: accentColor,
      text: "#1E293B",
      muted: "#64748B",
      borderColor: "#CBD5E1",
      tableHeaderBg: tableHeaderColor,
      totalHighlight: "#F8F6ED",
    },
    detectedBlocks,
    detectedTables,
    conversionReport: report,
    reconstructedLayout,
  };
}
