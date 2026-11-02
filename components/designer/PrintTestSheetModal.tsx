"use client";

import DesignerPortal from "./DesignerPortal";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Printer,
  Download,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
} from "lucide-react";
import PrintCalibrationSheet from "./PrintCalibrationSheet";

interface PrintTestSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string, type: "success" | "error" | "warning") => void;
}

export default function PrintTestSheetModal({
  isOpen,
  onClose,
  onNotify,
}: PrintTestSheetModalProps) {
  const [zoom, setZoom] = useState(0.85);
  const [grayscaleSim, setGrayscaleSim] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    try {
      window.print();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open print dialog";
      if (onNotify) {
        onNotify(`Printing error: ${msg}`, "error");
      }
    }
  }, [onNotify]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrint]);

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const link = document.createElement("a");
      link.href = "/api/print-test-sheet/download";
      link.download = "dubai_erp_print_test_sheet_a4.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (onNotify) {
        onNotify("Downloading Dubai ERP A4 Printer Calibration Sheet PDF...", "success");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate PDF download";
      if (onNotify) {
        onNotify(`Download failed: ${msg}`, "error");
      }
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const handleOpenDedicatedTab = () => {
    try {
      const newWin = window.open("/print-test-sheet", "_blank");
      if (!newWin || newWin.closed || typeof newWin.closed === "undefined") {
        // Pop-up was blocked by browser
        if (onNotify) {
          onNotify(
            "Browser blocked the new tab. You can print or download directly from this preview modal.",
            "warning"
          );
        }
      } else {
        if (onNotify) {
          onNotify("Opened A4 Calibration Sheet in dedicated window.", "success");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not open new tab";
      if (onNotify) {
        onNotify(`Unable to open window: ${msg}`, "error");
      }
    }
  };

  return (
    <DesignerPortal>
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center select-none overflow-hidden print:bg-white print:p-0 print:m-0 print:block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-test-sheet-title"
    >
      {/* ── Modal Header / Action Bar (Hidden on print) ── */}
      <div className="w-full bg-slate-900 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xl print:hidden">
        {/* Left: Title & Badge */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Printer size={18} />
          </div>
          <div>
            <h2 id="print-test-sheet-title" className="text-sm font-bold text-white flex items-center gap-2">
              <span>Dubai ERP — A4 Physical Printer Calibration Sheet</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30">
                A4 (210×297mm)
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Calibrate physical margin cutoffs (top/bottom/left/right), 100mm scaling, border sharpness, and laser halftones.
            </p>
          </div>
        </div>

        {/* Center: Interactive Controls (Zoom, Grayscale laser sim) */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
            className="p-1 hover:text-white transition"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <span className="font-mono text-[11px] w-12 text-center text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
            className="p-1 hover:text-white transition"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(0.85)}
            className="p-1 hover:text-white transition ml-1 text-slate-400 hover:text-white"
            title="Reset Zoom (85%)"
          >
            <Maximize2 size={13} />
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Grayscale laser simulation toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={grayscaleSim}
              onChange={(e) => setGrayscaleSim(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 w-3.5 h-3.5"
            />
            <span>Simulate B&amp;W Laser</span>
          </label>
        </div>

        {/* Right: Actions (Open dedicated tab, Download PDF, Print, Close) */}
        <div className="flex items-center gap-2">
          {/* Dedicated Tab button */}
          <button
            type="button"
            onClick={handleOpenDedicatedTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition border border-slate-700 cursor-pointer"
            title="Open in dedicated browser window"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Open in Tab</span>
          </button>

          {/* Download PDF button */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            title="Download Dubai ERP A4 Calibration Sheet PDF"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Download Print-Ready PDF</span>
          </button>

          {/* Print button */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <Printer size={15} />
            <span>Print Test Sheet (Ctrl+P)</span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer ml-1"
            title="Close Preview (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Sheet Viewport ── */}
      <div className="flex-1 overflow-auto p-6 flex justify-center items-start print:p-0 print:overflow-visible">
        <div
          ref={sheetRef}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            transition: "transform 0.15s ease-out",
          }}
          className={`print:transform-none ${grayscaleSim ? "filter grayscale contrast-110" : ""}`}
        >
          <PrintCalibrationSheet grayscaleSim={grayscaleSim} />
        </div>
      </div>
    </div>
    </DesignerPortal>
  );
}
