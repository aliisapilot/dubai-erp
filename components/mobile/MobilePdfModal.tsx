"use client";

import { useEffect, useState } from "react";
import {
  X, Share2, Printer, ZoomIn, ZoomOut, RotateCcw,
  Loader2, Check
} from "lucide-react";
import { MobilePortalDocument, shareDocument } from "@/lib/mobilePortalTypes";
import { fetchDocumentForPdf, logDocumentAccess } from "@/lib/mobilePortalService";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

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
  const [scale, setScale] = useState(0.48); // Optimal initial scale for iPhone screens
  const [sharedNotice, setSharedNotice] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchDocumentForPdf(document.category, document.id);
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
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [document]);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white animate-in fade-in duration-200">
      {/* Top Controls Bar */}
      <header className="flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-slate-800 pt-[calc(0.5rem+env(safe-area-inset-top))] shrink-0">
        <div className="flex items-center gap-2 truncate pr-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
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
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.35, s - 0.08))}
            className="p-1 text-slate-400 hover:text-white rounded"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] font-mono text-slate-400 w-8 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.0, s + 0.08))}
            className="p-1 text-slate-400 hover:text-white rounded"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          {/* Native Share */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="ml-1 flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs"
          >
            {sharedNotice ? <Check size={14} /> : <Share2 size={14} />}
            <span>Share</span>
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={() => window.print()}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
            title="Print PDF"
          >
            <Printer size={16} />
          </button>
        </div>
      </header>

      {/* Main Preview Surface with Responsive Scale Container */}
      <div className="flex-1 overflow-auto bg-slate-900/60 p-2 flex justify-center items-start custom-scrollbar">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
            <Loader2 className="animate-spin text-emerald-400 mb-2" size={26} />
            <p className="text-xs">Rendering Document PDF...</p>
          </div>
        ) : (
          <div
            className="transition-transform duration-150 origin-top shadow-2xl rounded-sm bg-white print:scale-100 print:m-0 print:p-0 print:shadow-none"
            style={{
              transform: `scale(${scale})`,
              marginBottom: "2rem",
            }}
          >
            {renderDocumentTemplate()}
          </div>
        )}
      </div>
    </div>
  );
}
