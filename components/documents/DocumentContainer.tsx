"use client";

import React, { ReactNode, useState } from "react";
import { Download, Printer } from "lucide-react";
import { getBrandConfig, BrandColors, CompanyBrandInput } from "@/lib/brandConfig";
import { printCurrentDocument } from "@/lib/print";
import { exportDocumentToPdf } from "@/lib/exportDocumentPdf";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";
import PageDecorativeBorders from "./PageDecorativeBorders";
import { DEFAULT_PAGE_BORDERS, PageBorderSettings, DocumentLayout } from "@/lib/documentDesigner";

interface DocumentContainerProps {
  children: ReactNode;
  docNumber?: string | null;
  docTypeLabel?: string;
  status?: string | null;
  onClose?: () => void;
  onPrint?: () => void;
  showWatermark?: boolean;
  watermarkUrl?: string;
  backgroundUrl?: string;
  className?: string;
  /** Optional company object — used to inject brand color CSS variables into the document sheet */
  company?: CompanyBrandInput | null;
  /** When true, omits outer p-[12mm] padding (required when wrapping DynamicDocumentRenderer which renders its own A4 sheet) */
  noPadding?: boolean;
  /** Computed total page count for A4 pagination */
  totalPages?: number;
  /** Optional warning message when content legitimately requires multiple pages */
  warning?: string;
  /** Optional decorative border settings */
  borders?: PageBorderSettings;
  /** Optional full document layout */
  layout?: DocumentLayout;
  /** When true (e.g. inside PrintModal), hides the redundant standalone control bar and outer page padding */
  hideControls?: boolean;
  /** Optional customer or party name for generating standard PDF filename */
  partyName?: string | null;
  customerName?: string | null;
  /** Optional document date for statement/slip filenames */
  documentDate?: string | null;
}

export default function DocumentContainer({
  children,
  docNumber,
  docTypeLabel,
  status,
  onClose,
  onPrint,
  showWatermark = true,
  watermarkUrl,
  backgroundUrl,
  className = "",
  company,
  noPadding = false,
  totalPages,
  warning,
  borders,
  layout,
  hideControls = false,
  partyName,
  customerName,
  documentDate,
}: DocumentContainerProps) {
  const [isExporting, setIsExporting] = useState(false);

  const { filename: defaultPdfFilename, title: defaultDocTitle } = generateDocumentPdfFilename({
    docType: docTypeLabel || layout?.documentType,
    docNumber,
    partyName: partyName || customerName,
    date: documentDate,
  });

  const handlePrint = async () => {
    if (onPrint) {
      onPrint();
    } else {
      await printCurrentDocument({
        documentFilename: defaultPdfFilename,
        documentTitle: defaultDocTitle,
      });
    }
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await exportDocumentToPdf({
        filename: defaultPdfFilename,
      });
    } catch (err) {
      console.error("PDF Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Resolve brand config to get colors and background asset
  const brand = getBrandConfig(company ?? null);
  const bgImg = backgroundUrl || watermarkUrl || brand.assets.background;

  // Build CSS custom property overrides from brand colors so all child components
  // (DocHeader, DocSignatureArea, DocFooter, etc.) automatically pick up the theme
  // without hard-coding colors in every component.
  const colors: BrandColors = brand.colors;
  const brandVars: React.CSSProperties = {
    "--doc-primary": colors.primary,
    "--doc-accent": colors.accent,
    "--doc-text": colors.text,
    "--doc-muted": colors.muted,
    "--doc-border": colors.border,
    "--doc-table-header": colors.tableHeader,
    "--doc-total-highlight": colors.totalHighlight,
    "--doc-white": colors.white,
  } as React.CSSProperties;

  return (
    <div
      data-document-filename={defaultPdfFilename}
      data-document-title={defaultDocTitle}
      className={`print-template-wrapper ${
        hideControls || noPadding
          ? "p-0 m-0 bg-transparent min-h-0 w-auto"
          : "bg-slate-100 min-h-screen py-6 px-4"
      } print:bg-transparent print:p-0 print:m-0 print:min-h-0 print:h-auto print:w-[210mm]`}
    >
      {/* Control Bar (Screen Only - Hidden in Print or inside modal) */}
      {!hideControls && (docTypeLabel || onClose) && (
        <div className="no-print w-[210mm] max-w-full mx-auto mb-4 flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
            {docTypeLabel && <span>{docTypeLabel}:</span>}
            {docNumber && (
              <span className="font-mono text-blue-600 font-bold">{docNumber}</span>
            )}
            {status && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-normal">
                Status: {status}
              </span>
            )}
            {totalPages !== undefined && (
              totalPages > 1 ? (
                <span
                  className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700 font-medium"
                  title={warning || "Content exceeds single A4 page capacity. Formatted for multi-page printing without losing information."}
                >
                  ⚠️ Multi-Page ({totalPages} Pages)
                </span>
              ) : (
                <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 font-medium">
                  ✓ 1 Page A4
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              type="button"
              disabled={isExporting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Download pure A4 PDF directly without browser headers or margins"
            >
              <Download size={15} className="text-blue-600" />
              <span>{isExporting ? "Exporting..." : "Download PDF"}</span>
            </button>
            <button
              onClick={handlePrint}
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition shadow cursor-pointer"
              style={{ backgroundColor: colors.primary }}
            >
              <Printer size={15} /> Print / Save PDF
            </button>
            {onClose && (
              <button
                onClick={onClose}
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {noPadding ? (
        <div className={`dynamic-document-pages mx-auto w-[210mm] ${className}`} style={brandVars}>
          {children}
        </div>
      ) : (
        /* True A4 Document Sheet: exactly 210mm × 297mm. */
        <div
          className={`print-page print-document document-sheet ${totalPages === 1 ? "single-page-doc" : ""} relative mx-auto box-border min-h-[297mm] w-[210mm] border border-slate-200 bg-white p-[10mm] shadow-xl print:m-0 print:min-h-[297mm] print:w-[210mm] print:border-none print:p-[8mm] print:shadow-none overflow-hidden ${className}`}
          style={{
            ...brandVars,
          }}
        >
          {/* Decorative Page Borders Layer (Vector SVG, Print-accurate) */}
          <PageDecorativeBorders
            borders={borders || layout?.page?.borders || DEFAULT_PAGE_BORDERS}
            isDesignerPreview={false}
          />
          {showWatermark && (
            <div
              className="print-background-container absolute inset-0 z-0 h-full w-full select-none overflow-hidden pointer-events-none"
              aria-hidden="true"
            >
              <div
                className="print-background absolute inset-0 h-full w-full select-none pointer-events-none"
                style={{
                  backgroundImage: `url(${JSON.stringify(bgImg)})`,
                  backgroundPosition: "center top",
                  backgroundRepeat: "repeat-y",
                  backgroundSize: "210mm 297mm",
                  opacity: 0.045,
                }}
              />
            </div>
          )}
          <div className="print-content relative z-10 w-full">{children}</div>
        </div>
      )}
    </div>
  );
}
