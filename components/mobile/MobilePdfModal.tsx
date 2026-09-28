"use client";
import { printCurrentDocument } from "@/lib/print";

import { useEffect, useRef, useState } from "react";
import {
  X, Share2, Printer, ZoomIn, ZoomOut, Scan, ExternalLink,
  Loader2, Check, AlertCircle
} from "lucide-react";
import { MobilePortalDocument, shareDocument } from "@/lib/mobilePortalTypes";
import {
  fetchDocumentForPdf,
  getAuthorizedMobileDocumentUrl,
  logDocumentAccess,
} from "@/lib/mobilePortalService";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { getDocumentPreviewScale } from "@/lib/documentPreview";

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
  const pageRef = useRef<HTMLDivElement>(null);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);

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
    const res = await shareDocument({
      title: `${document.categoryLabel} ${document.documentNumber}`,
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
    <div className="mobile-pdf-modal print-modal-container fixed inset-0 z-50 flex h-[100dvh] flex-col bg-slate-950 text-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={`Preview ${document.documentNumber}`}>
      {/* Top Controls Bar */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4">
        <div className="flex items-center gap-2 truncate pr-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
          <div className="truncate">
            <span className="font-mono font-bold text-xs text-white block truncate">
              {document.documentNumber}
            </span>
            <span className="text-[10px] text-slate-400 block truncate">
              {document.categoryLabel} &bull; {document.partyName}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Zoom controls */}
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
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Fit page to width"
            title="Fit page to width"
          >
            <Scan size={16} />
          </button>}

          {/* Native Share */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="ml-1 flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-xs"
          >
            {sharedNotice ? <Check size={14} /> : <Share2 size={14} />}
            <span>Share</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={() => void printCurrentDocument()}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
          >
            <Printer size={16} />
          </button>
        </div>
      </header>

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
