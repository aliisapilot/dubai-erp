"use client";

import { useEffect, useState, useMemo } from "react";
import MobileLayout from "@/components/mobile/MobileLayout";
import MobilePdfModal from "@/components/mobile/MobilePdfModal";
import {
  FolderLock, Search, Download, Share2, FileText, Eye,
  RefreshCw, Loader2, Check, AlertCircle
} from "lucide-react";
import { MobilePortalDocument, shareDocument } from "@/lib/mobilePortalTypes";
import {
  fetchUnifiedMobileDocuments,
  getAuthorizedMobileDocumentUrl,
  logDocumentAccess,
} from "@/lib/mobilePortalService";
import { getCurrentCompany } from "@/lib/helpers";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

export default function MobileFilesPage() {
  const [files, setFiles] = useState<MobilePortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<MobilePortalDocument | null>(null);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFiles();
  }, []);

  async function loadFiles() {
    setLoading(true);
    setError("");
    try {
      const [data, currentCompany] = await Promise.all([
        fetchUnifiedMobileDocuments({ category: "company_file" }),
        getCurrentCompany(),
      ]);
      setFiles(data);
      setCompany(currentCompany);
    } catch (err) {
      console.error("Failed to load files:", err);
      setError(err instanceof Error ? err.message : "Company files could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return files;
    const s = search.toLowerCase();
    return files.filter(
      (f) =>
        f.documentNumber.toLowerCase().includes(s) ||
        (f.notes && f.notes.toLowerCase().includes(s)) ||
        f.partyName.toLowerCase().includes(s)
    );
  }, [files, search]);

  async function handleShare(file: MobilePortalDocument) {
    const res = await shareDocument({
      title: file.documentNumber,
      text: `Company Document: ${file.documentNumber} (${file.partyName})`,
      url: window.location.href,
    });

    if (res.shared) {
      setSharedId(file.id);
      setTimeout(() => setSharedId(null), 2000);
      void logDocumentAccess({
        documentType: "company_file",
        documentId: file.id,
        documentRef: file.documentNumber,
        action: "share",
      });
    }
  }

  async function handleDownload(file: MobilePortalDocument) {
    if (!file.fileUrl) return;

    setDownloadingId(file.id);
    try {
      const url = await getAuthorizedMobileDocumentUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Download error:", err);
      alert("Download failed. Please check network connection.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <MobileLayout>
      <div className="space-y-4 p-3 sm:p-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-100" role="alert">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <FolderLock size={18} className="text-emerald-400" />
              Company Files &amp; Attachments
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Secure access to company contracts, licenses &amp; vouchers
            </p>
          </div>

          <button
            type="button"
            onClick={loadFiles}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Refresh Files"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-emerald-400" : ""} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company files & attachments..."
            className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Files List */}
        <div className="space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto text-emerald-400 mb-2" />
              <p className="text-xs">Fetching company files...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="py-16 text-center text-slate-500 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-6">
              <FolderLock size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No company files uploaded</p>
              <p className="text-xs text-slate-500 mt-1">
                Files attached to projects, trade licenses, or expenses will appear here.
              </p>
            </div>
          ) : (
            filteredFiles.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-sm hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-slate-800 p-2.5 text-emerald-400 shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-white break-all">{f.documentNumber}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{f.partyName}</p>
                      {f.notes && <p className="text-[11px] text-slate-500 mt-1">{f.notes}</p>}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">{f.date}</span>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2 border-t border-slate-800/60 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveFile(f)}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    <Eye size={14} className="text-emerald-400" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(f)}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    {sharedId === f.id ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                    <span>Share</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(f)}
                    disabled={downloadingId === f.id}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {downloadingId === f.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {activeFile && (
        <MobilePdfModal document={activeFile} company={company} onClose={() => setActiveFile(null)} />
      )}
    </MobileLayout>
  );
}
