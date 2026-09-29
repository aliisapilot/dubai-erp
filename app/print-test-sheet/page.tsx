"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import PrintCalibrationSheet from "@/components/designer/PrintCalibrationSheet";

export default function PrintTestSheetPage() {
  const [grayscaleSim, setGrayscaleSim] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handlePrint = useCallback(() => {
    try {
      window.print();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open print dialog";
      setNotification({ message: `Printing failed: ${msg}`, type: "error" });
      setTimeout(() => setNotification(null), 4000);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrint]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const link = document.createElement("a");
      link.href = "/api/print-test-sheet/download";
      link.download = "dubai_erp_print_test_sheet_a4.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setNotification({ message: "Downloading Dubai ERP A4 Printer Calibration Sheet PDF...", type: "success" });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate PDF download";
      setNotification({ message: `Download failed: ${msg}`, type: "error" });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-6 px-4 print:p-0 print:bg-white print:text-black">
      {/* ── Top Bar (Hidden on print) ── */}
      <header className="w-full max-w-[210mm] mb-6 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-xl print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/designer"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Back to PDF Designer"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <span>Dubai ERP — A4 Physical Printer Calibration Sheet</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                A4 (210×297mm)
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Calibrate hardware margins (top, bottom, left, right), 100mm scaling, border sharpness, and grayscale halftones.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-750">
            <input
              type="checkbox"
              checked={grayscaleSim}
              onChange={(e) => setGrayscaleSim(e.target.checked)}
              className="rounded border-slate-600 text-blue-600 focus:ring-0"
            />
            <span>Simulate Grayscale Laser</span>
          </label>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            title="Download Dubai ERP A4 Calibration Sheet PDF"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer size={16} />
            <span>Print Test Sheet (Ctrl+P)</span>
          </button>
        </div>
      </header>

      {/* Floating Status Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 border ${
            notification.type === "success"
              ? "bg-slate-900 border-emerald-500 text-emerald-300"
              : "bg-slate-900 border-red-500 text-red-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={16} className="text-red-400" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* ── Calibration Sheet ── */}
      <PrintCalibrationSheet grayscaleSim={grayscaleSim} />
    </div>
  );
}
