"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Undo2,
  Redo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Save,
  RotateCcw,
  WandSparkles,
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
  ChevronDown,
  Loader2,
  FileText,
  Copy,
  Eye,
  Image as ImageIcon,
  Type,
  PanelLeft,
  PanelRight,
  ShieldCheck,
  MoreHorizontal,
} from "lucide-react";
import { DocumentTypeId, DOCUMENT_TYPE_OPTIONS } from "@/lib/documentDesigner";

interface TopToolbarProps {
  selectedDocType: DocumentTypeId;
  onSelectDocType: (docType: DocumentTypeId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected?: () => void;
  selectedElementLabel?: string;
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
  onAutoFix: () => void;
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
  onDeleteSelected,
  selectedElementLabel,
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
  onAutoFix,
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close overflow menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMoreMenu]);

  return (
    <header className="shrink-0 border-b border-slate-800 bg-slate-900 text-white select-none z-30">
      {/* Primary Row: Document Selection, Editing & Main Actions */}
      <div className="flex h-14 min-w-0 items-center justify-between gap-3 px-3">
        {/* Left Section: Brand, Document Selector & Edit History */}
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Brand & Template Badge */}
          <div className="flex shrink-0 items-center gap-2 pr-2.5 border-r border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <FileText size={18} />
            </div>
            <div className="hidden lg:block">
              <span className="font-bold text-xs tracking-wider text-slate-100 block uppercase leading-tight">
                PDF Designer
              </span>
              {templateName && (
                <span className="text-[10px] text-amber-400/90 font-mono block leading-none truncate max-w-[140px]">
                  {templateName}
                </span>
              )}
            </div>
          </div>

          {/* Document Type Dropdown (Generous Width, Full Name Visible) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="hidden text-xs font-medium text-slate-400 xl:inline">Document:</label>
            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => onSelectDocType(e.target.value as DocumentTypeId)}
                className="w-[210px] sm:w-[250px] md:w-[290px] rounded-lg border border-slate-700 bg-slate-800 pl-3 pr-8 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400 cursor-pointer shadow-inner appearance-none transition"
                aria-label="Document type"
                title="Select document template to edit"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({opt.labelAr})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* History Controls: Undo & Redo */}
          <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-800 pl-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition ${
                canUndo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition ${
                canRedo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 size={16} />
            </button>

            {/* Delete Selected Element Button */}
            {onDeleteSelected && (
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={!hasSelectedElement}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ml-1 ${
                  hasSelectedElement
                    ? "border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 cursor-pointer shadow-sm"
                    : "border-transparent text-slate-600 cursor-not-allowed opacity-40"
                }`}
                title={
                  hasSelectedElement
                    ? `Delete or hide selected ${selectedElementLabel || "element"} (Delete / Backspace)`
                    : "Select an element to delete"
                }
                aria-label="Delete selected element"
              >
                <Trash2 size={14} className={hasSelectedElement ? "text-rose-400" : "text-slate-600"} />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
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

        {/* Right Section: Insert, Secondary Tools, Primary Actions & Panels */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Insert Content Actions */}
          {onAddImage && (
            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 shadow-sm transition hover:bg-blue-500/20 cursor-pointer"
              title="Upload image from computer (PNG, JPG, WEBP)"
              aria-label="Add Image"
            >
              <ImageIcon size={14} className="text-blue-400" />
              <span className="hidden md:inline">Add Image</span>
            </button>
          )}

          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Add custom text block"
              aria-label="Add Text"
            >
              <Type size={13} className="text-amber-400" />
              <span className="hidden xl:inline">Add Text</span>
            </button>
          )}

          {/* Desktop Secondary Tools (Hidden on smaller screens and moved to overflow) */}
          <div className="hidden 2xl:flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenApplyModal}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Apply current styling to other document templates"
              aria-label="Apply to Others"
            >
              <Copy size={13} className="text-amber-400" />
              <span>Apply to Others</span>
            </button>

            <button
              type="button"
              onClick={onAutoFix}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300 shadow-sm transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              title="Auto Fix: optimizes spacing, table height, and single-page A4 fitting in one click"
              aria-label="Auto Fix PDF"
            >
              <WandSparkles size={13} />
              <span>Auto Fix PDF</span>
            </button>

            {onCheckLayout && (
              <button
                type="button"
                onClick={onCheckLayout}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
                title="Audit layout for page-boundary clearance, gaps, and collisions"
                aria-label="Check Layout"
              >
                <ShieldCheck size={13} className="text-teal-400" />
                <span>Check Layout</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Reset document layout to UAE Corporate Default"
              aria-label="Reset Template"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>

          {/* Responsive Overflow Dropdown Menu for Secondary Tools */}
          <div className="relative 2xl:hidden" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="More Actions & Tools"
              aria-label="More Actions"
            >
              <MoreHorizontal size={16} />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl z-50 text-xs space-y-1 animate-in fade-in zoom-in-95">
                {onAddText && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onAddText();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <Type size={14} className="text-amber-400" />
                    <span>Add Custom Text</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onAutoFix();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-emerald-300 hover:bg-emerald-500/15"
                >
                  <WandSparkles size={14} className="text-emerald-400" />
                  <span>Auto Fix PDF</span>
                </button>
                {onCheckLayout && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onCheckLayout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <ShieldCheck size={14} className="text-teal-400" />
                    <span>Check Layout Audit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenApplyModal();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Copy size={14} className="text-amber-400" />
                  <span>Apply to Others</span>
                </button>
                <div className="border-t border-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onReset();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-rose-300 hover:bg-rose-500/15"
                >
                  <RotateCcw size={14} className="text-rose-400" />
                  <span>Reset to Default</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Actions: Preview, Print, and Save (ALWAYS VISIBLE) */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-1.5">
            <button
              type="button"
              onClick={onPreview}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Preview actual A4 document"
              aria-label="Preview"
            >
              <Eye size={14} className="text-emerald-400" />
              <span className="hidden sm:inline">Preview</span>
            </button>

            <button
              type="button"
              onClick={onPrint || onPreview}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Open Print Dialog"
              aria-label="Print"
            >
              <Printer size={14} className="text-blue-400" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
              title="Save layout (Ctrl+S)"
              aria-label="Save layout"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>

          {/* Responsive Panel Toggle Buttons */}
          <div className="flex items-center gap-0.5 border-l border-slate-800 pl-1">
            {onToggleLeftSidebar && (
              <button
                type="button"
                onClick={onToggleLeftSidebar}
                className={`p-1.5 rounded-lg transition ${leftSidebarOpen ? "text-amber-400 bg-slate-800" : "text-slate-400 hover:bg-slate-800"}`}
                title="Toggle Layers Sidebar"
                aria-label="Toggle Layers Sidebar"
              >
                <PanelLeft size={16} />
              </button>
            )}
            {onToggleRightInspector && (
              <button
                type="button"
                onClick={onToggleRightInspector}
                className={`p-1.5 rounded-lg transition ${rightInspectorOpen ? "text-amber-400 bg-slate-800" : "text-slate-400 hover:bg-slate-800"}`}
                title="Toggle Element Inspector"
                aria-label="Toggle Inspector"
              >
                <PanelRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tool Row: Editing Controls (Align, Grid, Zoom, Page Nav) */}
      <div className="hidden h-11 items-center justify-between gap-2 overflow-x-auto border-t border-slate-800/80 px-3 md:flex">
        {/* Alignment Controls (Enabled when element is selected) */}
        <div className="flex shrink-0 items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            type="button"
            onClick={() => onAlign("left")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Left"
            aria-label="Align Left"
          >
            <AlignLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => onAlign("center")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Center Horizontally"
            aria-label="Align Center"
          >
            <AlignCenter size={15} />
          </button>
          <button
            type="button"
            onClick={() => onAlign("right")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Align Right"
            aria-label="Align Right"
          >
            <AlignRight size={15} />
          </button>
          <span className="w-[1px] h-3.5 bg-slate-700 mx-1" />
          <button
            type="button"
            onClick={() => onAlign("center-h")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Center on Page Horizontally"
            aria-label="Center Horizontally"
          >
            <AlignHorizontalJustifyCenter size={15} />
          </button>
          <button
            type="button"
            onClick={() => onAlign("center-v")}
            disabled={!hasSelectedElement}
            className={`p-1 rounded hover:bg-slate-700 transition ${
              hasSelectedElement ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
            }`}
            title="Center on Page Vertically"
            aria-label="Center Vertically"
          >
            <AlignVerticalJustifyCenter size={15} />
          </button>
        </div>

        {/* Snap Grid & Margins */}
        <div className="flex shrink-0 items-center gap-0.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            type="button"
            onClick={onToggleSnapGrid}
            className={`p-1 rounded transition flex items-center gap-1 text-xs px-2 ${
              snapGrid ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-slate-400 hover:bg-slate-700"
            }`}
            title="Toggle Snap to Grid (5mm)"
            aria-label="Toggle Grid"
          >
            <Grid size={14} /> Grid
          </button>
          <button
            type="button"
            onClick={onToggleSnapMargins}
            className={`p-1 rounded transition flex items-center gap-1 text-xs px-2 ${
              snapMargins ? "bg-amber-500/20 text-amber-400 font-semibold" : "text-slate-400 hover:bg-slate-700"
            }`}
            title="Toggle Snap to Margins (12mm)"
            aria-label="Toggle Margins"
          >
            <Magnet size={14} /> Margins
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex shrink-0 items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/80">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.1, Number((zoom - 0.1).toFixed(2))))}
            className="p-1 rounded text-slate-300 hover:bg-slate-700"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono font-medium px-1.5 text-slate-200 min-w-[45px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(1.8, Number((zoom + 0.1).toFixed(2))))}
            className="p-1 rounded text-slate-300 hover:bg-slate-700"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <input
            type="range"
            min="0.1"
            max="1.8"
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            className="hidden w-20 cursor-pointer accent-amber-500 xl:block"
            aria-label="PDF zoom level"
            title={`Zoom ${Math.round(zoom * 100)}%`}
          />
          <span className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />
          <button
            type="button"
            onClick={onFitWidth}
            className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            title="Fit Width"
          >
            Fit Width
          </button>
          <button
            type="button"
            onClick={onFitPage}
            className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            title="Fit Full Page"
          >
            Fit Page
          </button>
        </div>

        {/* Multi-page Navigation */}
        <div className="flex shrink-0 items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/80 text-xs">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className={`p-0.5 rounded ${pageNumber <= 1 ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-700"}`}
            title="Previous Page"
            aria-label="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono text-slate-300">
            Page {pageNumber} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, pageNumber + 1))}
            disabled={pageNumber >= totalPages}
            className={`p-0.5 rounded ${pageNumber >= totalPages ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-700"}`}
            title="Next Page"
            aria-label="Next Page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}

