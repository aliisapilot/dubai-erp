"use client";

import { useEffect, useState, useMemo } from "react";
import MobileLayout from "@/components/mobile/MobileLayout";
import {
  FolderLock, Search, Download, Share2, FileText,
  FileCheck2, ShieldCheck, RefreshCw, Loader2, Check
} from "lucide-react";
import { MobilePortalDocument, shareDocument } from "@/lib/mobilePortalTypes";
import { fetchUnifiedMobileDocuments, logDocumentAccess } from "@/lib/mobilePortalService";

export default function MobileFilesPage() {
  const [files, setFiles] = useState<MobilePortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  async function loadFiles() {
    setLoading(true);
    try {
      const data = await fetchUnifiedMobileDocuments({ category: "company_file" });
      setFiles(data);
    } catch (err) {
      console.error("Failed to load files:", err);
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
      const res = await fetch(
        `/api/mobile/download?path=${encodeURIComponent(file.fileUrl)}&bucket=cheques&doc_id=${file.id}&doc_type=company_file`
      );
      const data = await res.json();

      if (data?.download_url) {
        window.open(data.download_url, "_blank");
      } else {
        alert("Failed to retrieve file download link.");
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
            className="p-2 text-slate-400 hover:text-white"
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
            className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
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
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => handleShare(f)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    {sharedId === f.id ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                    <span>Share</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(f)}
                    disabled={downloadingId === f.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
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
    </MobileLayout>
  );
}
