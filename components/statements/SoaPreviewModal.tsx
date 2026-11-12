"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabase";
import { fmtAED } from "@/lib/helpers";
import { type StoredSoaRecord, getExportSoaPdfFilename } from "@/lib/soaManager";

interface SoaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: StoredSoaRecord | null;
}

export default function SoaPreviewModal({
  isOpen,
  onClose,
  record,
}: SoaPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>("");
  const [sheets, setSheets] = useState<Array<{ name: string; rows: string[][] }>>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  const isPdf = Boolean(record?.file_name?.toLowerCase().endsWith(".pdf"));

  useEffect(() => {
    if (!isOpen || !record) return;
    let mounted = true;
    let createdUrl = "";

    async function loadDocument() {
      if (!record) return;
      setLoading(true);
      setError("");
      setPdfBlobUrl("");
      setSheets([]);
      setActiveSheetIdx(0);

      try {
        if (!record.storage_path) {
          throw new Error("Original file storage reference is missing for this record.");
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token || "";

        const url = `/api/smart-import/storage?path=${encodeURIComponent(
          record.storage_path
        )}&bucket=${encodeURIComponent(record.storage_bucket || "smart-imports")}`;

        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Could not load document (${res.status}): ${errText}`);
        }

        const buf = await res.arrayBuffer();
        if (!mounted) return;

        if (record.file_name.toLowerCase().endsWith(".pdf")) {
          const blob = new Blob([buf], { type: "application/pdf" });
          createdUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(createdUrl);
        } else {
          const wb = XLSX.read(buf, { type: "array" });
          const parsedSheets = wb.SheetNames.map((name) => {
            const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
              header: 1,
              defval: "",
            });
            return {
              name,
              rows: rawRows.slice(0, 500).map((r) => (r || []).map((c) => String(c ?? ""))),
            };
          });
          setSheets(parsedSheets);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to preview document.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadDocument();

    return () => {
      mounted = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isOpen, record]);

  if (!isOpen || !record) return null;

  async function handleDownloadOriginal() {
    if (!record?.storage_path) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      const url = `/api/smart-import/storage?path=${encodeURIComponent(
        record.storage_path
      )}&bucket=${encodeURIComponent(record.storage_bucket || "smart-imports")}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = record.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download original file.");
    }
  }

  function handleDownloadGeneratedPdf() {
    if (!record) return;
    const filename = getExportSoaPdfFilename(
      record.soa_number,
      record.customer_name,
      record.statement_date
    );

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text("Statement of Account", 40, 48);
    doc.setFontSize(10);
    doc.text(`Customer: ${record.customer_name}`, 40, 72);
    doc.text(`SOA Number: ${record.soa_number}`, 40, 88);
    doc.text(`Statement Date: ${record.statement_date}`, 40, 104);
    doc.text(`Closing Balance: ${fmtAED(record.closing_balance)}`, 40, 120);
    doc.text(`Original File: ${record.file_name}`, 40, 136);

    let y = 168;
    const activeSheet = sheets[activeSheetIdx];
    if (activeSheet && activeSheet.rows.length > 0) {
      doc.setFontSize(8);
      for (const row of activeSheet.rows.slice(0, 60)) {
        const line = row.filter((c) => c.trim() !== "").join("  |  ").slice(0, 110);
        if (line) {
          doc.text(line, 40, y);
          y += 13;
          if (y > 780) {
            doc.addPage();
            y = 48;
          }
        }
      }
    }

    doc.save(filename);
  }

  const activeSheet = sheets[activeSheetIdx];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100 flex flex-col h-[88vh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl bg-slate-800 p-2 text-cyan-400">
              {isPdf ? <FileText size={18} /> : <FileSpreadsheet size={18} />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{record.file_name}</h3>
              <p className="text-[11px] text-slate-400 truncate">
                {record.customer_name} · {record.soa_number} · {record.statement_date} ·{" "}
                <span className="text-cyan-300 font-mono">{fmtAED(record.closing_balance)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pdfBlobUrl && (
              <a
                href={pdfBlobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 text-xs font-semibold transition"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">Open Tab</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleDownloadOriginal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 text-xs font-bold transition cursor-pointer"
            >
              <Download size={13} />
              <span>Download Original</span>
            </button>
            {!isPdf && sheets.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadGeneratedPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
              >
                <Download size={13} />
                <span>PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview Body */}
        <div className="flex-1 overflow-auto bg-slate-950/60 p-4">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 size={24} className="animate-spin text-cyan-400" />
              <span>Loading original statement...</span>
            </div>
          ) : error ? (
            <div className="max-w-lg mx-auto mt-12 rounded-xl border border-rose-800 bg-rose-950/40 p-4 flex items-start gap-3 text-xs text-rose-200">
              <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Preview Unavailable</p>
                <p>{error}</p>
              </div>
            </div>
          ) : isPdf && pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title={record.file_name}
              className="w-full h-full rounded-xl border border-slate-800 bg-white"
            />
          ) : activeSheet ? (
            <div className="space-y-3">
              {sheets.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {sheets.map((s, idx) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setActiveSheetIdx(idx)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                        idx === activeSheetIdx
                          ? "bg-cyan-600 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {activeSheet.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? "bg-slate-800/80 font-bold text-slate-200"
                            : "border-t border-slate-800/70 text-slate-300 hover:bg-slate-800/40"
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No previewable content found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

