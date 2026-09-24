"use client";

import React, { useRef } from "react";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Copy,
  Eye,
  Image as ImageIcon,
  Type,
  PanelLeft,
  PanelRight,
  ShieldCheck,
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
  onCheckLayout?: () => void;
  templateName: string;
  onOpenApplyModal: () => void;
  onPrint?: () => void;
  onAddImage?: (file: File) => void;
  onAddText?: () => void;
  onToggleLeftSidebar?: () => void;
  onToggleRightInspector?: () => void;
  leftSidebarOpen?: boolean;
  rightInspectorOpen?: boolean;
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
  onCheckLayout,
  templateName,
  onOpenApplyModal,
  onPrint,
  onAddImage,
  onAddText,
  onToggleLeftSidebar,
  onToggleRightInspector,
  leftSidebarOpen = true,
  rightInspectorOpen = true,
}: TopToolbarProps) {
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  return (
    <header className="shrink-0 border-b border-slate-800 bg-slate-900 text-white select-none z-30">
      {/* Primary row: document selection and actions */}
      <div className="flex h-14 min-w-0 items-center gap-2 px-3">
        {/* Left: Document Selector & Template Info */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0 items-center gap-2 pr-2 border-r border-slate-700">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <FileText size={18} />
            </div>
            <div className="hidden xl:block">
              <span className="font-bold text-sm tracking-wide text-slate-100 block leading-tight">
                PDF DESIGNER
              </span>
              {templateName && (
                <span className="text-[10px] text-amber-400/90 font-mono block leading-none">
                  {templateName}
                </span>
              )}
            </div>
          </div>

          {/* Document Type Dropdown */}
          <div className="flex min-w-0 items-center gap-1.5">
            <label className="hidden text-xs font-medium text-slate-400 2xl:inline">Document:</label>
            <select
              value={selectedDocType}
              onChange={(e) => onSelectDocType(e.target.value as DocumentTypeId)}
              className="w-[clamp(8.5rem,18vw,12.5rem)] min-w-0 truncate rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400 cursor-pointer"
              aria-label="Document type"
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.labelAr})
                </option>
              ))}
            </select>
          </div>

          {/* Undo & Redo */}
          <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-700 pl-1.5">
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

        {/* Hidden File Input for Add Image */}
        <input
          type="file"
          ref={imageUploadInputRef}
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onAddImage) {
              onAddImage(file);
            }
            e.target.value = "";
          }}
        />

        {/* Right: Insert and document actions */}
        <div className="flex shrink-0 items-center gap-1">
          {onAddImage && (
            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-500/15 p-1.5 text-xs font-semibold text-blue-300 shadow-sm transition hover:bg-blue-500/25 cursor-pointer"
              title="Choose image file from computer (PNG, JPG, WEBP)"
            >
              <ImageIcon size={14} className="text-blue-400" />
              <span className="hidden 2xl:inline">Add Image</span>
            </button>
          )}

          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className="hidden 2xl:flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Add custom text block"
            >
              <Type size={13} className="text-amber-400" />
              <span>Add Text</span>
            </button>
          )}

          <button
            onClick={onOpenApplyModal}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 p-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 cursor-pointer"
            title="Apply visual styling to other documents"
          >
            <Copy size={14} className="text-amber-400" />
            <span className="hidden 2xl:inline">Apply to Others</span>
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-lg border border-slate-700 p-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 cursor-pointer"
            title="Reset to UAE Corporate Professional Default"
          >
            <RotateCcw size={14} />
            <span className="hidden 2xl:inline">Reset</span>
          </button>

          {onCheckLayout && (
            <button
              type="button"
              onClick={onCheckLayout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Audit document layout for gaps, overlaps, table sizing, and boundary clearance"
            >
              <ShieldCheck size={14} className="text-teal-400" />
              <span className="hidden xl:inline">Check Layout</span>
            </button>
          )}

          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            title="Preview true A4 document without editor tools"
          >
            <Eye size={14} className="text-emerald-400" />
            <span className="hidden lg:inline">Preview</span>
          </button>

          <button
            type="button"
            onClick={onPrint || onPreview}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            title="Open Print Dialog"
          >
            <Printer size={14} className="text-blue-400" />
            <span className="hidden lg:inline">Print</span>
          </button>

          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
            title="Save layout"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span className="hidden sm:inline">{saving ? "Saving..." : "Save"}</span>
          </button>

          {/* Responsive Panel Toggle Buttons */}
          <div className="flex items-center gap-0.5 border-l border-slate-800 pl-1 md:hidden">
            {onToggleLeftSidebar && (
              <button
                type="button"
                onClick={onToggleLeftSidebar}
                className={`p-1.5 rounded transition ${leftSidebarOpen ? "text-amber-400 bg-slate-800" : "text-slate-400"}`}
                title="Toggle Layers Sidebar"
              >
                <PanelLeft size={15} />
              </button>
            )}
            {onToggleRightInspector && (
              <button
                type="button"
                onClick={onToggleRightInspector}
                className={`p-1.5 rounded transition ${rightInspectorOpen ? "text-amber-400 bg-slate-800" : "text-slate-400"}`}
                title="Toggle Inspector"
              >
                <PanelRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tool row: keep editing controls visible without squeezing the primary row. */}
      <div className="hidden h-11 items-center justify-center gap-2 overflow-x-auto border-t border-slate-800/80 px-3 lg:flex">
        {/* Alignment controls (enabled when element selected) */}
        <div className="flex shrink-0 items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
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
        <div className="flex shrink-0 items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
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
        <div className="flex shrink-0 items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
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
        <div className="flex shrink-0 items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/80 text-xs">
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
    </header>
  );
}
