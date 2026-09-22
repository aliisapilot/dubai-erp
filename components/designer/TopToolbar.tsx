"use client";

import React from "react";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  RotateCcw,
  Printer,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
  Grid,
  Magnet,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
} from "lucide-react";
import { DocumentTypeId, DOCUMENT_TYPE_OPTIONS } from "@/lib/documentDesigner";

interface TopToolbarProps {
  selectedDocType: DocumentTypeId;
  onSelectDocType: (docType: DocumentTypeId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  snapGrid: boolean;
  onToggleSnapGrid: () => void;
  snapMargins: boolean;
  onToggleSnapMargins: () => void;
  onAlign: (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom" | "center-h" | "center-v") => void;
  hasSelectedElement: boolean;
  pageNumber: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  onPreview: () => void;
  templateName: string;
}

export default function TopToolbar({
  selectedDocType,
  onSelectDocType,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onFitWidth,
  onFitPage,
  snapGrid,
  onToggleSnapGrid,
  snapMargins,
  onToggleSnapMargins,
  onAlign,
  hasSelectedElement,
  pageNumber,
  totalPages,
  onPageChange,
  saving,
  onSave,
  onReset,
  onPreview,
  templateName,
}: TopToolbarProps) {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 select-none z-30 shrink-0">
      {/* Left: Document Selector & Template Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <FileText size={18} />
          </div>
          <span className="font-bold text-sm tracking-wide hidden sm:inline text-slate-100">
            PDF DESIGNER
          </span>
        </div>

        {/* Document Type Dropdown */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 font-medium hidden md:inline">Document:</label>
          <select
            value={selectedDocType}
            onChange={(e) => onSelectDocType(e.target.value as DocumentTypeId)}
            className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-400 cursor-pointer max-w-[200px] truncate"
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} ({opt.labelAr})
              </option>
            ))}
          </select>
        </div>

        {/* Undo & Redo */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              canUndo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              canRedo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      {/* Center: Alignment Tools, Snap & Zoom */}
      <div className="hidden lg:flex items-center gap-2">
        {/* Alignment controls (enabled when element selected) */}
        <div className="flex items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            onClick={() => onAlign("left")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Left"
          >
            <AlignLeft size={15} />
          </button>
          <button
            onClick={() => onAlign("center")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Center Horizontally"
          >
            <AlignCenter size={15} />
          </button>
          <button
            onClick={() => onAlign("right")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Right"
          >
            <AlignRight size={15} />
          </button>
          <span className="w-[1px] h-3.5 bg-slate-700 mx-1" />
          <button
            onClick={() => onAlign("center-h")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Center on Page Horizontally"
          >
            <AlignHorizontalJustifyCenter size={15} />
          </button>
          <button
            onClick={() => onAlign("center-v")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Center on Page Vertically"
          >
            <AlignVerticalJustifyCenter size={15} />
          </button>
        </div>

        {/* Snap Grid & Margins */}
        <div className="flex items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            onClick={onToggleSnapGrid}
            className={`p-1 rounded transition flex items-center gap-1 text-xs px-2 ${
              snapGrid ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-slate-400 hover:bg-slate-700"
            }`}
            title="Toggle Snap to Grid (5mm)"
          >
            <Grid size={14} /> Grid
          </button>
          <button
            onClick={onToggleSnapMargins}
            className={`p-1 rounded transition flex items-center gap-1 text-xs px-2 ${
              snapMargins ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-slate-400 hover:bg-slate-700"
            }`}
            title="Toggle Snap to Margins (12mm)"
          >
            <Magnet size={14} /> Margins
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.1).toFixed(2))))}
            className="p-1 rounded text-slate-300 hover:bg-slate-700"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono font-medium px-1.5 text-slate-200 min-w-[45px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(1.8, Number((zoom + 0.1).toFixed(2))))}
            className="p-1 rounded text-slate-300 hover:bg-slate-700"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <span className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />
          <button
            onClick={onFitWidth}
            className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:bg-slate-700"
          >
            Fit Width
          </button>
          <button
            onClick={onFitPage}
            className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:bg-slate-700"
          >
            Fit Page
          </button>
        </div>

        {/* Multi-page navigation */}
        <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/80 text-xs">
          <button
            onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className={`p-0.5 rounded ${pageNumber <= 1 ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-700"}`}
            title="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono text-slate-300">
            Page {pageNumber} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, pageNumber + 1))}
            disabled={pageNumber >= totalPages}
            className={`p-0.5 rounded ${pageNumber >= totalPages ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-700"}`}
            title="Next Page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Right: Actions (Reset, Preview, Save) */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition cursor-pointer"
          title="Reset to UAE Corporate Professional Default"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          onClick={onPreview}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
        >
          <Printer size={14} />
          <span>Print Preview</span>
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer shadow-sm disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save size={14} />
              <span>Save Layout</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
