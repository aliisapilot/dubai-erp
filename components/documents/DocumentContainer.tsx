"use client";

import React, { ReactNode } from "react";
import { Printer } from "lucide-react";
import { getBrandConfig, BrandColors, CompanyBrandInput } from "@/lib/brandConfig";

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
}: DocumentContainerProps) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
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
  } as React.CSSProperties;

  return (
    <div className="print-template-wrapper bg-slate-100 min-h-screen py-6 px-4 print:bg-transparent print:p-0 print:m-0 print:min-h-0 print:h-auto print:w-[210mm]">
      {/* Control Bar (Screen Only - Hidden in Print) */}
      {(docTypeLabel || onClose) && (
        <div className="no-print w-[210mm] max-w-full mx-auto mb-4 flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            {docTypeLabel && <span>{docTypeLabel}:</span>}
            {docNumber && (
              <span className="font-mono text-blue-600 font-bold">{docNumber}</span>
            )}
            {status && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-normal">
                Status: {status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          className={`print-page print-document document-sheet relative mx-auto box-border min-h-[297mm] w-[210mm] border border-slate-200 bg-white p-[12mm] shadow-xl print:m-0 print:min-h-[297mm] print:w-[210mm] print:border-none print:p-[12mm] print:shadow-none ${className}`}
          style={{
            ...brandVars,
            ...(showWatermark
              ? {
                  backgroundImage: `url('${bgImg}')`,
                  backgroundPosition: "center top",
                  backgroundRepeat: "repeat-y",
                  backgroundSize: "210mm 297mm",
                }
              : {}),
          }}
        >
          {showWatermark && (
            <div
              className="print-background-container absolute inset-0 z-0 h-full w-full select-none overflow-hidden pointer-events-none"
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bgImg}
                alt=""
                className="print-background h-full w-full select-none object-cover pointer-events-none"
                style={{ position: "absolute", inset: 0, opacity: 0.045 }}
              />
            </div>
          )}
          <div className="print-content relative z-10 w-full">{children}</div>
        </div>
      )}
    </div>
  );
}
