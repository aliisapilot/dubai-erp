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
import type { DocumentStylePreset } from "@/lib/documentStylePresetModel";

export type AutoFixAction = "standard" | "saved" | "create" | "manage";

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
  cloudStatus?: "saved" | "unsaved" | "saving" | "failed" | "conflict";
  cloudVersion?: number;
  onSave: () => void;
  onReset: () => void;
  onAutoFix: () => void;
  autoFixMode: "standard" | "saved";
  onAutoFixAction: (action: AutoFixAction) => void;
  stylePresets: DocumentStylePreset[];
  selectedStylePresetId: string | null;
  onSelectStylePreset: (id: string) => void;
  onSaveMyStyle: () => void;
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
  cloudStatus = "saved",
  cloudVersion,
  onSave,
  onReset,
  onAutoFix,
  autoFixMode,
  onAutoFixAction,
  stylePresets,
  selectedStylePresetId,
  onSelectStylePreset,
  onSaveMyStyle,
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
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showMoreMenu) return;

    const updatePosition = () => {
      const trigger = moreMenuButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(280, window.innerHeight - 16);
      const below = rect.bottom + 8 + menuHeight <= window.innerHeight - 8;
      const top = below ? rect.bottom + 8 : Math.max(8, rect.top - menuHeight - 8);
      setMoreMenuPosition({ top, right: Math.max(8, window.innerWidth - rect.right) });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showMoreMenu]);

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
      <div
        className="designer-scrollbar flex h-14 w-full min-w-0 items-center justify-between gap-1.5 overflow-x-auto overscroll-x-contain px-2.5"
        role="toolbar"
        aria-label="PDF Designer primary actions"
        tabIndex={0}
      >
        {/* Left Section: Brand, Document Selector & History / Delete */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Brand & Badge */}
          <div className="flex shrink-0 items-center gap-1.5 pr-1.5 border-r border-slate-800">
            <div
              className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold"
              title={templateName ? `PDF Designer: ${templateName}` : "PDF Designer"}
            >
              <FileText size={17} />
            </div>
            <span className="font-bold text-xs tracking-wider text-slate-100 hidden 2xl:inline uppercase leading-tight">
              PDF Designer
            </span>
          </div>

          {/* Document Type Dropdown (Generous Width, Full Name Visible, Never Cut Off) */}
          <div className="flex shrink-0 items-center gap-1">
            <label className="hidden text-xs font-medium text-slate-400 2xl:inline">Document:</label>
            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => onSelectDocType(e.target.value as DocumentTypeId)}
                className="w-[185px] sm:w-[205px] md:w-[225px] rounded-lg border border-slate-700 bg-slate-800 pl-2.5 pr-7 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400 cursor-pointer shadow-inner appearance-none transition"
                aria-label="Document type"
                title="Select document template to edit"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({opt.labelAr})
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* History Controls: Undo & Redo */}
          <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-800 pl-1.5">
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
              <Undo2 size={15} />
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
              <Redo2 size={15} />
            </button>

            {/* Delete Selected Element Button (ALWAYS VISIBLE, RED ACCENT WHEN SELECTED) */}
            {onDeleteSelected && (
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={!hasSelectedElement}
                className={`flex items-center gap-1 rounded-lg border p-1.5 2xl:px-2 py-1.5 text-xs font-semibold transition ml-0.5 ${
                  hasSelectedElement
                    ? "border-rose-500/60 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 cursor-pointer shadow-sm"
                    : "border-slate-800/80 bg-slate-800/40 text-slate-500 cursor-not-allowed opacity-40"
                }`}
                title={
                  hasSelectedElement
                    ? `Delete or hide selected ${selectedElementLabel || "element"} (Delete / Backspace)`
                    : "Select an element to delete"
                }
                aria-label="Delete selected element"
              >
                <Trash2 size={14} className={hasSelectedElement ? "text-rose-400" : "text-slate-500"} />
                <span className="hidden 2xl:inline font-medium">Delete</span>
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

        {/* Right Section: Add Elements, Auto Fix, Overflow Tools, Preview/Print/Save, Panels */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Insert Content Actions */}
          {onAddImage && (
            <button
              type="button"
              onClick={() => imageUploadInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 p-1.5 2xl:px-2 py-1.5 text-xs font-semibold text-blue-300 shadow-sm transition hover:bg-blue-500/20 cursor-pointer"
              title="Upload image or logo from computer (PNG, JPG, WEBP)"
              aria-label="Add Image"
            >
              <ImageIcon size={14} className="text-blue-400" />
              <span className="hidden 2xl:inline">Add Image</span>
            </button>
          )}

          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 p-1.5 2xl:px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Add custom text block (edit text directly in inspector)"
              aria-label="Add Text"
            >
              <Type size={14} className="text-amber-400" />
              <span className="hidden 2xl:inline">Add Text</span>
            </button>
          )}

          {/* Auto Fix PDF (One-Click Smart Layout Optimization) */}
          <button
            type="button"
            onClick={onAutoFix}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 py-1.5 text-xs font-bold text-emerald-300 shadow-sm transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            title="Auto Fix: One-click optimization to fit document neatly on single A4 page"
            aria-label="Auto Fix PDF"
          >
            <WandSparkles size={14} className="text-emerald-400" />
            <span className="hidden xl:inline">Auto Fix</span>
          </button>
          <select
            value={autoFixMode}
            onChange={(event) => onAutoFixAction(event.target.value as AutoFixAction)}
            disabled={saving}
            className="h-8 max-w-[115px] rounded-lg border border-slate-700 bg-slate-800 px-1.5 text-[10px] font-semibold text-slate-200 outline-none focus:border-amber-400 sm:max-w-[145px] sm:px-2 sm:text-xs"
            aria-label="Auto Fix style"
            title="Choose Standard Auto Fix, a saved style, or manage styles"
          >
            <option value="standard">Standard Auto Fix</option>
            <option value="saved">My Saved Style</option>
            <option value="create">Create New Style</option>
            <option value="manage">Manage Saved Styles</option>
          </select>
          {autoFixMode === "saved" && (
            <select
              value={selectedStylePresetId || ""}
              onChange={(event) => onSelectStylePreset(event.target.value)}
              disabled={saving || stylePresets.length === 0}
              className="h-8 max-w-[130px] rounded-lg border border-amber-500/30 bg-slate-800 px-1.5 text-[10px] font-semibold text-amber-100 outline-none focus:border-amber-400 sm:max-w-[180px] sm:px-2 sm:text-xs"
              aria-label="Choose saved style"
            >
              {stylePresets.length === 0 ? <option value="">No saved styles</option> : stylePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.template_name} — {DOCUMENT_TYPE_OPTIONS.find((option) => option.id === preset.document_type)?.label || preset.document_type.replaceAll("_", " ")}{preset.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onSaveMyStyle}
            disabled={saving}
            className="flex h-8 items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 text-[10px] font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50 sm:text-xs"
            title="Save the complete current layout as a named style"
            aria-label="Save My Style"
          >
            <Save size={13} /><span className="hidden 2xl:inline">Save My Style</span>
          </button>

          {/* Tools & Overflow Menu (More Actions) */}
          <div className="relative" ref={moreMenuRef}>
            <button
              ref={moreMenuButtonRef}
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                showMoreMenu
                  ? "border-amber-500/50 bg-slate-800 text-amber-400"
                  : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
              title="More Actions: Apply to Others, Check Layout, Reset"
              aria-label="More Actions"
            >
              <MoreHorizontal size={14} />
              <span className="hidden xl:inline">Tools</span>
              <ChevronDown size={11} className={`transition-transform duration-150 ${showMoreMenu ? "rotate-180" : ""}`} />
            </button>

            {showMoreMenu && (
              <div
                className="designer-scrollbar fixed z-50 w-64 max-h-[min(70dvh,320px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs space-y-1 shadow-2xl animate-in fade-in zoom-in-95"
                tabIndex={0}
                aria-label="Document designer actions menu"
                style={{ top: moreMenuPosition?.top ?? -1000, right: moreMenuPosition?.right ?? 8 }}
              >
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  Document Tools
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenApplyModal();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-slate-200 hover:bg-slate-800 transition"
                >
                  <Copy size={15} className="text-amber-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-100">Apply to Other Documents</div>
                    <div className="text-[11px] text-slate-400">Copy header, footer, & styling across templates</div>
                  </div>
                </button>

                {onCheckLayout && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onCheckLayout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-slate-200 hover:bg-slate-800 transition"
                  >
                    <ShieldCheck size={15} className="text-teal-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-100">Check Layout Audit</div>
                      <div className="text-[11px] text-slate-400">Scan for overlaps, margins & single-page fit</div>
                    </div>
                  </button>
                )}

                <div className="border-t border-slate-800 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onReset();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-rose-300 hover:bg-rose-500/15 transition"
                >
                  <RotateCcw size={15} className="text-rose-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-rose-200">Reset to Default</div>
                    <div className="text-[11px] text-rose-400/80">Restore official UAE corporate layout (with confirmation)</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Primary Final Actions: Preview, Print, and Save (ALWAYS VISIBLE, FULLY ALIGNED & PINNED) */}
          <div className="flex shrink-0 items-center gap-1 border-l border-slate-800 pl-1.5">
            <button
              type="button"
              onClick={onPreview}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Preview actual A4 document"
              aria-label="Preview"
            >
              <Eye size={14} className="text-emerald-400" />
              <span className="hidden lg:inline">Preview</span>
            </button>

            <button
              type="button"
              onClick={onPrint || onPreview}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
              title="Open Print Dialog"
              aria-label="Print"
            >
              <Printer size={14} className="text-blue-400" />
              <span className="hidden lg:inline">Print</span>
            </button>

            {/* Cloud Persistence Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border transition"
                 style={{
                   borderColor:
                     cloudStatus === "saved"
                       ? "rgba(16, 185, 129, 0.3)"
                       : cloudStatus === "saving"
                       ? "rgba(245, 158, 11, 0.3)"
                       : cloudStatus === "failed"
                       ? "rgba(239, 68, 68, 0.3)"
                       : cloudStatus === "conflict"
                       ? "rgba(99, 102, 241, 0.3)"
                       : "rgba(245, 158, 11, 0.25)",
                   backgroundColor:
                     cloudStatus === "saved"
                       ? "rgba(16, 185, 129, 0.08)"
                       : cloudStatus === "saving"
                       ? "rgba(245, 158, 11, 0.08)"
                       : cloudStatus === "failed"
                       ? "rgba(239, 68, 68, 0.08)"
                       : cloudStatus === "conflict"
                       ? "rgba(99, 102, 241, 0.08)"
                       : "rgba(245, 158, 11, 0.05)",
                   color:
                     cloudStatus === "saved"
                       ? "#34d399"
                       : cloudStatus === "saving"
                       ? "#fbbf24"
                       : cloudStatus === "failed"
                       ? "#f87171"
                       : cloudStatus === "conflict"
                       ? "#818cf8"
                       : "#fbbf24",
                 }}
                 title={
                   cloudStatus === "saved"
                     ? "Design successfully synchronized to cloud"
                     : cloudStatus === "saving"
                     ? "Saving design to cloud..."
                     : cloudStatus === "failed"
                     ? "Cloud synchronization failed"
                     : cloudStatus === "conflict"
                     ? "Cloud version updated from another session"
                     : "You have unsaved changes"
                 }
            >
              {cloudStatus === "saved" ? (
                <>
                  <ShieldCheck size={11} className="text-emerald-400 shrink-0" />
                  <span>Saved to Cloud{cloudVersion ? ` (v${cloudVersion})` : ""}</span>
                </>
              ) : cloudStatus === "saving" ? (
                <>
                  <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
                  <span>Saving...</span>
                </>
              ) : cloudStatus === "failed" ? (
                <>
                  <span className="text-red-400 font-bold">⚠</span>
                  <span>Save Failed</span>
                </>
              ) : cloudStatus === "conflict" ? (
                <>
                  <span className="text-indigo-400 font-bold">ℹ</span>
                  <span>Cloud Version Updated</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>Unsaved Changes</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 cursor-pointer disabled:opacity-50"
              title="Save layout (Ctrl+S)"
              aria-label="Save layout"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>

          {/* Responsive Panel Toggle Buttons (ALWAYS VISIBLE & PADDED) */}
          <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-800 pl-1">
            {onToggleLeftSidebar && (
              <button
                type="button"
                onClick={onToggleLeftSidebar}
                className={`p-1.5 rounded-lg transition ${leftSidebarOpen ? "text-amber-400 bg-slate-800" : "text-slate-400 hover:bg-slate-800"}`}
                title="Toggle Layers Sidebar"
                aria-label="Toggle Layers Sidebar"
              >
                <PanelLeft size={15} />
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
                <PanelRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tool Row: Editing Controls (Align, Grid, Zoom, Page Nav) */}
      <div className="designer-scrollbar hidden h-11 items-center justify-between gap-2 overflow-x-auto border-t border-slate-800/80 px-3 md:flex">
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

