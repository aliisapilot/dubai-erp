"use client";
import { printCurrentDocument } from "@/lib/print";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Share2, Printer, ZoomIn, ZoomOut, Scan, ExternalLink,
  Loader2, Check, AlertCircle, Download, Pencil
} from "lucide-react";
import Link from "next/link";
import { MobilePortalDocument, shareDocument } from "@/lib/mobilePortalTypes";
import {
  fetchDocumentForPdf,
  getAuthorizedMobileDocumentUrl,
  logDocumentAccess,
} from "@/lib/mobilePortalService";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { getDocumentPreviewScale } from "@/lib/documentPreview";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";
import { exportDocumentToPdf } from "@/lib/exportDocumentPdf";

// Template imports
import TaxInvoiceTemplate, { TaxInvoiceData } from "@/components/documents/TaxInvoiceTemplate";
import QuotationTemplate, { QuotationData } from "@/components/documents/QuotationTemplate";
import ProformaInvoiceTemplate, { ProformaInvoiceData } from "@/components/documents/ProformaInvoiceTemplate";
import DeliveryNoteTemplate, { DeliveryNoteData } from "@/components/documents/DeliveryNoteTemplate";
import PurchaseOrderTemplate, { PurchaseOrderData } from "@/components/documents/PurchaseOrderTemplate";
import SupplierBillTemplate, { SupplierBillData } from "@/components/documents/SupplierBillTemplate";
import ChequePrintTemplate from "@/components/cheques/ChequePrintTemplate";
import { ChequeRecord } from "@/lib/chequeTypes";

interface MobilePdfModalProps {
  document: MobilePortalDocument;
  company: CompanyDocInfo | null;
  onClose: () => void;
}

export default function MobilePdfModal({ document, company, onClose }: MobilePdfModalProps) {
  const [fullDoc, setFullDoc] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(0.45);
  const [pageHeight, setPageHeight] = useState(1123);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sharedNotice, setSharedNotice] = useState(false);
  const [exportingAction, setExportingAction] = useState<"download" | "share" | null>(null);
  const [iosFallbackUrl, setIosFallbackUrl] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);

  const computedFile = useMemo(() => {
    const rec = (fullDoc || {}) as Record<string, unknown>;
    const partyName =
      (rec.customer_name as string | undefined) ||
      (rec.supplier_name as string | undefined) ||
      document.partyName ||
      "Customer";
    const docNum =
      (rec.invoice_number as string | undefined) ||
      (rec.quotation_number as string | undefined) ||
      (rec.proforma_number as string | undefined) ||
      (rec.delivery_note_number as string | undefined) ||
      (rec.purchase_order_number as string | undefined) ||
      (rec.bill_number as string | undefined) ||
      document.documentNumber;

    return generateDocumentPdfFilename({
      docType: document.category,
      docNumber: docNum,
      partyName,
      customerName: rec.customer_name as string | undefined,
      supplierName: rec.supplier_name as string | undefined,
      projectName: (rec.custom_project_name || rec.project_name) as string | undefined,
      notes: (rec.notes as string | undefined) || document.notes,
      items: Array.isArray(rec.items) ? (rec.items as Array<{ description?: string | null }>) : undefined,
      date: document.date,
    });
  }, [fullDoc, document]);

  const editHref = useMemo(() => {
    switch (document.category) {
      case "tax_invoice":
        return `/tax-invoices?edit=${encodeURIComponent(document.id)}`;
      case "quotation":
        return `/quotations?edit=${encodeURIComponent(document.id)}`;
      case "proforma":
        return `/proforma-invoices?edit=${encodeURIComponent(document.id)}`;
      case "delivery_note":
        return `/delivery-notes?edit=${encodeURIComponent(document.id)}`;
      case "purchase_order":
        return `/purchase-orders?edit=${encodeURIComponent(document.id)}`;
      default:
        return null;
    }
  }, [document]);

  function fitToWidth() {
    const availableWidth = (previewSurfaceRef.current?.clientWidth || window.innerWidth) - 24;
    setScale(getDocumentPreviewScale(availableWidth, 794, 0.92));
  }

  useEffect(() => {
    fitToWidth();
    window.addEventListener("resize", fitToWidth);
    return () => window.removeEventListener("resize", fitToWidth);
  }, []);

  useEffect(() => {
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => {
      globalThis.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        if (document.category === "company_file") {
          const url = await getAuthorizedMobileDocumentUrl(document);
          if (isMounted) setFileUrl(url);
          return;
        }

        const data = await fetchDocumentForPdf(document.category, document.id);
        if (!data) throw new Error("This document is not available for preview.");
        if (isMounted) {
          setFullDoc(data);
          // Log access
          void logDocumentAccess({
            documentType: document.category,
            documentId: document.id,
            documentRef: document.documentNumber,
            action: "preview_pdf",
          });
        }
      } catch (err) {
        console.error("Failed to load document for PDF preview:", err);
        if (isMounted) setError(err instanceof Error ? err.message : "The document could not be opened.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [document]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const updateHeight = () => setPageHeight(page.scrollHeight || 1123);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(page);
    return () => observer.disconnect();
  }, [fullDoc]);

  async function handleNativeShare() {
    if (document.category !== "company_file" && pageRef.current) {
      setExportingAction("share");
      setIosFallbackUrl(null);
      try {
        const res = await exportDocumentToPdf({
          filename: computedFile.filename,
          scopeElement: pageRef.current,
          action: "share",
        });
        if (res.method === "ios-fallback" && res.fallbackUrl) {
          setIosFallbackUrl(res.fallbackUrl);
        }
        setSharedNotice(true);
        setTimeout(() => setSharedNotice(false), 2500);
        void logDocumentAccess({
          documentType: document.category,
          documentId: document.id,
          documentRef: document.documentNumber,
          action: "share",
        });
        return;
      } catch (err) {
        console.warn("PDF File Share failed, falling back to URL share:", err);
      } finally {
        setExportingAction(null);
      }
    }

    const res = await shareDocument({
      title: computedFile.title,
      text: `${document.categoryLabel} ${document.documentNumber} for ${document.partyName} (Dubai ERP).`,
      url: window.location.href,
    });

    if (res.shared) {
      setSharedNotice(true);
      setTimeout(() => setSharedNotice(false), 2500);
      void logDocumentAccess({
        documentType: document.category,
        documentId: document.id,
        documentRef: document.documentNumber,
        action: "share",
      });
    }
  }

  async function handleDownloadPdf() {
    if (document.category === "company_file" && fileUrl) {
      const a = globalThis.document.createElement("a");
      a.href = fileUrl;
      a.download = computedFile.filename;
      a.rel = "noopener";
      a.click();
      return;
    }
    if (!pageRef.current) return;
    setExportingAction("download");
    setIosFallbackUrl(null);
    try {
      const res = await exportDocumentToPdf({
        filename: computedFile.filename,
        scopeElement: pageRef.current,
        action: "download",
      });
      if (res.method === "ios-fallback" && res.fallbackUrl) {
        setIosFallbackUrl(res.fallbackUrl);
      }
      void logDocumentAccess({
        documentType: document.category,
        documentId: document.id,
        documentRef: document.documentNumber,
        action: "download",
      });
    } catch (err) {
      console.error("Mobile PDF download failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setExportingAction(null);
    }
  }

  function renderDocumentTemplate() {
    if (!fullDoc) return null;

    switch (document.category) {
      case "tax_invoice":
        return <TaxInvoiceTemplate invoice={fullDoc as TaxInvoiceData} company={company} />;
      case "quotation":
        return <QuotationTemplate quotation={fullDoc as QuotationData} company={company} />;
      case "proforma":
        return <ProformaInvoiceTemplate proforma={fullDoc as ProformaInvoiceData} company={company} />;
      case "delivery_note":
        return <DeliveryNoteTemplate deliveryNote={fullDoc as DeliveryNoteData} company={company} />;
      case "purchase_order":
        return <PurchaseOrderTemplate po={fullDoc as PurchaseOrderData} company={company} />;
      case "supplier_bill":
        return <SupplierBillTemplate bill={fullDoc as SupplierBillData} company={company} />;
      case "cheque":
        return <ChequePrintTemplate mode="voucher" cheque={fullDoc as ChequeRecord} company={company} />;
      default:
        return (
          <div className="p-8 text-center text-slate-800">
            Preview not available for this file type.
          </div>
        );
    }
  }

  return (
    <div
      className="mobile-pdf-modal print-modal-container fixed inset-0 z-50 flex h-[100dvh] flex-col bg-slate-950 text-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${document.documentNumber}`}
      data-document-filename={computedFile.filename}
      data-document-title={computedFile.title}
    >
      {/* Top Controls Bar */}
      <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-slate-800 bg-slate-900 px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="font-mono font-bold text-xs text-white block truncate">
              {document.documentNumber}
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              {(fullDoc as { customer_name?: string; supplier_name?: string } | null)?.customer_name ||
                (fullDoc as { supplier_name?: string } | null)?.supplier_name ||
                document.partyName}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {editHref && (
            <Link
              href={editHref}
              onClick={onClose}
              className="flex h-11 items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
              title="Edit Document"
            >
              <Pencil size={14} />
              <span className="hidden min-[400px]:inline">Edit</span>
            </Link>
          )}

          {/* Fit / Zoom controls */}
          {document.category !== "company_file" && <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.35, s - 0.08))}
            className="hidden h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white sm:flex"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>}
          {document.category !== "company_file" && <span className="hidden w-9 text-center font-mono text-[10px] text-slate-400 sm:block">
            {Math.round(scale * 100)}%
          </span>}
          {document.category !== "company_file" && <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.0, s + 0.08))}
            className="hidden h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white sm:flex"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>}

          {document.category !== "company_file" && <button
            type="button"
            onClick={fitToWidth}
            className="hidden min-[380px]:flex h-11 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Fit page to width"
            title="Fit page to width"
          >
            <Scan size={16} />
          </button>}

          {/* Download A4 PDF */}
          <button
            type="button"
            disabled={loading || exportingAction !== null}
            onClick={() => void handleDownloadPdf()}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-blue-600 px-2.5 sm:px-3 text-xs font-bold text-white shadow-xs disabled:opacity-50"
            title={`Download ${computedFile.filename}`}
          >
            {exportingAction === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden min-[360px]:inline">PDF</span>
          </button>

          {/* Native File Share */}
          <button
            type="button"
            disabled={loading || exportingAction !== null}
            onClick={() => void handleNativeShare()}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-2.5 sm:px-3 text-xs font-bold text-white shadow-xs disabled:opacity-50"
            title="Share or Save to Files"
          >
            {exportingAction === "share" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : sharedNotice ? (
              <Check size={14} />
            ) : (
              <Share2 size={14} />
            )}
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={() => void printCurrentDocument({ documentFilename: computedFile.filename, documentTitle: computedFile.title })}
            className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
          >
            <Printer size={16} />
          </button>
        </div>
      </header>
      {iosFallbackUrl && (
        <div className="flex items-center justify-between gap-2 border-b border-blue-500/40 bg-blue-950/90 px-3 py-2 text-xs text-blue-100">
          <span className="truncate">Tap Open PDF, then Share → Save to Files ({computedFile.filename})</span>
          <a
            href={iosFallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1 font-bold text-white"
          >
            Open PDF
          </a>
        </div>
      )}

      {/* Main Preview Surface with Responsive Scale Container */}
      <div ref={previewSurfaceRef} className="mobile-pdf-print-surface flex flex-1 items-start justify-center overflow-auto bg-slate-900/60 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] custom-scrollbar sm:p-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
            <Loader2 className="animate-spin text-emerald-400 mb-2" size={26} />
            <p className="text-xs">Rendering Document PDF...</p>
          </div>
        ) : error ? (
          <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-rose-900/60 bg-rose-950/30 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 text-rose-400" size={30} />
            <p className="text-sm font-bold text-white">Unable to open document</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{error}</p>
          </div>
        ) : document.category === "company_file" && fileUrl ? (
          <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-white">
            <iframe src={fileUrl} title={document.documentNumber} className="min-h-0 flex-1 border-0" />
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 text-sm font-bold text-emerald-700">
              <ExternalLink size={16} /> Open full PDF in device viewer
            </a>
          </div>
        ) : (
          <div
            className="mobile-pdf-scale-shell relative shrink-0 print:h-auto print:w-auto"
            style={{
              width: 794 * scale,
              height: pageHeight * scale,
            }}
          >
            <div
              ref={pageRef}
              className="mobile-pdf-print-content absolute left-0 top-0 origin-top-left rounded-sm bg-white shadow-2xl transition-transform duration-150 print:static print:transform-none print:shadow-none"
              style={{ transform: `scale(${scale})`, width: 794 }}
            >
              {renderDocumentTemplate()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
