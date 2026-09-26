"use client";

import { useEffect, useState, useMemo } from "react";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePdfModal from "@/components/mobile/MobilePdfModal";
import {
  Search, Filter, FileText, Download, Share2, Eye,
  RefreshCw, Loader2, ArrowDownLeft, ArrowUpRight, Check,
  AlertCircle
} from "lucide-react";
import {
  MobilePortalDocument, MobileDocumentCategory, MOBILE_CATEGORY_TABS,
  shareDocument, getCategoryBadgeColor
} from "@/lib/mobilePortalTypes";
import { fetchUnifiedMobileDocuments, logDocumentAccess } from "@/lib/mobilePortalService";
import { getCurrentCompany, fmtAED, fmtDate } from "@/lib/helpers";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

export default function MobileDocumentPortalPage() {
  const [documents, setDocuments] = useState<MobilePortalDocument[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MobileDocumentCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [activeDocForPreview, setActiveDocForPreview] = useState<MobilePortalDocument | null>(null);
  const [shareSuccessId, setShareSuccessId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeCategory]);

  async function loadData() {
    setLoading(true);
    try {
      const [docs, co] = await Promise.all([
        fetchUnifiedMobileDocuments({ category: activeCategory }),
        getCurrentCompany(),
      ]);
      setDocuments(docs);
      if (co) setCompany(co);
    } catch (err) {
      console.error("Failed to load mobile documents:", err);
    } finally {
      setLoading(false);
    }
  }

  // Filter by search query
  const filteredDocs = useMemo(() => {
    if (!search.trim()) return documents;
    const s = search.toLowerCase();
    return documents.filter(
      (d) =>
        d.documentNumber.toLowerCase().includes(s) ||
        d.partyName.toLowerCase().includes(s) ||
        d.categoryLabel.toLowerCase().includes(s) ||
        (d.notes && d.notes.toLowerCase().includes(s))
    );
  }, [documents, search]);

  // Handle native share
  async function handleShare(doc: MobilePortalDocument) {
    const res = await shareDocument({
      title: `${doc.categoryLabel} ${doc.documentNumber}`,
      text: `${doc.categoryLabel} ${doc.documentNumber} for ${doc.partyName} (Dubai ERP).`,
      url: window.location.href,
    });

    if (res.shared) {
      setShareSuccessId(doc.id);
      setTimeout(() => setShareSuccessId(null), 2000);
      void logDocumentAccess({
        documentType: doc.category,
        documentId: doc.id,
        documentRef: doc.documentNumber,
        action: "share",
      });
    }
  }

  // Handle authorized file download
  async function handleDownload(doc: MobilePortalDocument) {
    if (!doc.fileUrl) {
      // For standard ERP records, previewing opens the printable/downloadable PDF directly
      setActiveDocForPreview(doc);
      return;
    }

    setDownloadingId(doc.id);
    try {
      const res = await fetch(
        `/api/mobile/download?path=${encodeURIComponent(doc.fileUrl)}&bucket=cheques&doc_id=${doc.id}&doc_type=${doc.category}`
      );
      const data = await res.json();

      if (data?.download_url) {
        window.open(data.download_url, "_blank");
      } else {
        alert("Failed to generate download link.");
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Download failed. Please check network connection.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by #, party, date..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none shadow-xs"
          />
        </div>

        {/* Horizontal Category Chips (Swipeable) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {MOBILE_CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveCategory(tab.key)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                {tab.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Results Counter & Refresh */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>
            Found <strong className="text-white">{filteredDocs.length}</strong> records
          </span>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin text-emerald-400" : ""} />
            <span>Sync</span>
          </button>
        </div>

        {/* Documents List */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto text-emerald-400 mb-2" />
              <p className="text-xs">Loading authorized records...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-6">
              <FileText size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No documents found</p>
              <p className="text-xs text-slate-500 mt-1">
                Try selecting a different category or clearing search filters.
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              return (
                <div
                  key={`${doc.category}-${doc.id}`}
                  className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-sm hover:border-slate-700 transition-all space-y-3"
                >
                  {/* Top Row: Category Pill + Document Number */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${getCategoryBadgeColor(doc.category)}`}>
                          {doc.categoryLabel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${doc.statusBadgeClass}`}>
                          {doc.status}
                        </span>
                      </div>
                      <h3 className="font-mono font-bold text-sm text-white">
                        {doc.documentNumber}
                      </h3>
                    </div>

                    {/* Financial Amount (if authorized) */}
                    {doc.amount !== null && doc.amount !== undefined && (
                      <div className="text-right">
                        <span className="font-mono font-black text-sm text-emerald-400 block">
                          {fmtAED(doc.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">AED</span>
                      </div>
                    )}
                  </div>

                  {/* Middle Row: Counterparty & Date */}
                  <div className="flex items-center justify-between text-xs text-slate-300 border-t border-slate-800/60 pt-2.5">
                    <div className="truncate max-w-[200px]">
                      <span className="text-[10px] text-slate-500 block leading-none">
                        {doc.partyRole}
                      </span>
                      <span className="font-medium text-slate-200 truncate block mt-0.5">
                        {doc.partyName}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-500 block leading-none">Date</span>
                      <span className="font-mono text-[11px] text-slate-300 block mt-0.5">
                        {fmtDate(doc.date)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Actions Row */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setActiveDocForPreview(doc)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
                    >
                      <Eye size={14} className="text-emerald-400" />
                      <span>View PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(doc)}
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                      title="Share via AirDrop, WhatsApp, Mail"
                    >
                      {shareSuccessId === doc.id ? (
                        <Check size={14} className="text-emerald-400" />
                      ) : (
                        <Share2 size={14} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                      title="Download Authorized File"
                    >
                      {downloadingId === doc.id ? (
                        <Loader2 size={14} className="animate-spin text-emerald-400" />
                      ) : (
                        <Download size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PDF PREVIEW MODAL */}
      {activeDocForPreview && (
        <MobilePdfModal
          document={activeDocForPreview}
          company={company}
          onClose={() => setActiveDocForPreview(null)}
        />
      )}
    </MobileLayout>
  );
}
