"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Undo2,
  Redo2,
  Save,
  RotateCcw,
  WandSparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
  Grid,
  Magnet,
  ChevronDown,
  Loader2,
  FileText,
  Copy,
  Eye,
  Sliders,
  X,
  Upload,
  ShieldCheck,
  CheckCircle2,
  PanelRight,
  Download,
  BookmarkPlus,
  Trash2,
  Layers,
  Check,
  Search,
} from "lucide-react";
import { DocumentTypeId, DOCUMENT_TYPE_OPTIONS, DesignerLayoutMode } from "@/lib/documentDesigner";
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
  onImportDesign?: () => void;
  onPrint?: () => void;
  onAddImage?: (file: File) => void;
  onAddText?: () => void;
  onToggleLeftSidebar?: () => void;
  onToggleRightInspector?: () => void;
  leftSidebarOpen?: boolean;
  rightInspectorOpen?: boolean;
  layoutMode?: DesignerLayoutMode;
  onChangeLayoutMode?: (mode: DesignerLayoutMode) => void;
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
  onImportDesign,
  onPrint,
  onAddImage,
  onAddText,
  onToggleLeftSidebar,
  onToggleRightInspector,
  leftSidebarOpen = true,
  rightInspectorOpen = true,
  layoutMode = "manual",
  onChangeLayoutMode,
}: TopToolbarProps) {
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<"grid" | "styles" | "tools">("grid");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Accessible custom dark template selector
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const templateButtonRef = useRef<HTMLButtonElement | null>(null);
  const templateDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showTemplateDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        templateDropdownRef.current &&
        !templateDropdownRef.current.contains(e.target as Node) &&
        templateButtonRef.current &&
        !templateButtonRef.current.contains(e.target as Node)
      ) {
        setShowTemplateDropdown(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowTemplateDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showTemplateDropdown]);

  const currentDocConfig = DOCUMENT_TYPE_OPTIONS.find((d) => d.id === selectedDocType) || DOCUMENT_TYPE_OPTIONS[0];
  const filteredTemplates = DOCUMENT_TYPE_OPTIONS.filter((opt) => {
    if (!templateSearch.trim()) return true;
    const q = templateSearch.toLowerCase();
    return opt.label.toLowerCase().includes(q) || opt.labelAr.toLowerCase().includes(q);
  });

  return (
    <header className="shrink-0 border-b border-slate-800 bg-slate-900 text-white select-none z-30 shadow-md">
      {/* ── Single Simplified Main Toolbar ───────────────────────────────────────────── */}
      <div className="flex h-13 w-full items-center justify-between px-2.5 sm:px-3 gap-1.5 sm:gap-2 overflow-x-auto overscroll-x-contain lg:overflow-x-visible">
        {/* 1. Template & Document Selection */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 pr-1.5 border-r border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shadow-inner">
              <FileText size={15} />
            </div>
          </div>

          {/* Custom Accessible Dark Template Selector Dropdown */}
          <div className="flex items-center gap-1 relative">
            <button
              ref={templateButtonRef}
              type="button"
              onClick={() => setShowTemplateDropdown((v) => !v)}
              className="w-[165px] sm:w-[195px] lg:w-[225px] flex items-center justify-between gap-1.5 rounded-lg border border-slate-700 bg-slate-800/95 hover:bg-slate-750 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-amber-400 cursor-pointer shadow-inner transition truncate"
              title="Select document template to edit"
              aria-haspopup="listbox"
              aria-expanded={showTemplateDropdown}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-slate-100">{currentDocConfig.label}</span>
                <span className="font-arabic text-[10px] text-amber-400/90 hidden sm:inline truncate">
                  ({currentDocConfig.labelAr})
                </span>
              </div>
              <ChevronDown
                size={13}
                className={`text-slate-400 shrink-0 transition-transform ${showTemplateDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {/* Hidden native select for standard accessibility / test runner compatibility */}
            <select
              value={selectedDocType}
              onChange={(e) => onSelectDocType(e.target.value as DocumentTypeId)}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.labelAr})
                </option>
              ))}
            </select>

            {/* Accessible Dark Dropdown Menu */}
            {showTemplateDropdown && (
              <div
                ref={templateDropdownRef}
                className="designer-scrollbar fixed z-50 w-72 sm:w-80 max-h-[min(75dvh,380px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl text-xs text-slate-200 left-3 top-14 space-y-1.5"
                role="listbox"
              >
                {/* Search input for templates */}
                <div className="relative mb-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                    autoFocus
                  />
                </div>

                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5 border-b border-slate-800">
                  Document Templates ({filteredTemplates.length})
                </div>

                <div className="space-y-0.5">
                  {filteredTemplates.map((opt) => {
                    const isSelected = opt.id === selectedDocType;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onSelectDocType(opt.id);
                          setShowTemplateDropdown(false);
                          setTemplateSearch("");
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition text-left cursor-pointer ${
                          isSelected
                            ? "bg-amber-500/20 text-amber-200 border-l-2 border-amber-400 font-bold shadow-sm"
                            : "hover:bg-slate-800 text-slate-200 hover:text-white"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{opt.label}</span>
                          <span className="font-arabic text-[10px] text-slate-400">{opt.labelAr}</span>
                        </div>
                        {isSelected && <Check size={14} className="text-amber-400 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                  {filteredTemplates.length === 0 && (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching templates found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Undo / Redo controls */}
          <div className="flex items-center gap-0.5 border-l border-slate-800 pl-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition cursor-pointer ${
                canUndo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition cursor-pointer ${
                canRedo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </button>
          </div>
        </div>

        {/* 2. Core Actions: Layout Mode | Layers | Auto Fix | Preview | PDF | Save */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* 3-Mode Priority Selector: Manual Design | Assisted Layout | Auto Fit */}
          {onChangeLayoutMode && (
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-xs font-semibold shadow-inner">
              <button
                type="button"
                onClick={() => onChangeLayoutMode("manual")}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  layoutMode === "manual"
                    ? "bg-amber-500 text-slate-950 font-bold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="MANUAL DESIGN: Full control over coordinates, font sizes and dimensions. Auto-fit will NEVER override your design."
              >
                <span>Manual</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode("assisted")}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  layoutMode === "assisted"
                    ? "bg-blue-600 text-white font-bold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="ASSISTED LAYOUT: Provides optional layout suggestions with user confirmation."
              >
                <span>Assisted</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode("auto_fit")}
                className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  layoutMode === "auto_fit"
                    ? "bg-emerald-600 text-white font-bold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="AUTO FIT: Automatic single-page A4 compaction and spacing."
              >
                <span>Auto Fit</span>
              </button>
            </div>
          )}

          {/* Layers Toggle (toggles sidebar sections) */}
          {onToggleLeftSidebar && (
            <button
              type="button"
              onClick={onToggleLeftSidebar}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition cursor-pointer ${
                leftSidebarOpen
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
              title="Toggle Layers and Sections Panel"
            >
              <Layers size={13} className={leftSidebarOpen ? "text-amber-400" : "text-slate-400"} />
              <span className="hidden xl:inline">Layers</span>
            </button>
          )}

          {/* Auto Fix: One-Click Smart Layout Optimization */}
          <button
            type="button"
            onClick={onAutoFix}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-2 sm:px-2.5 py-1.5 text-xs font-bold text-emerald-300 shadow-sm transition hover:bg-emerald-500/30 cursor-pointer disabled:opacity-50"
            title="Auto Fix: Fix overlaps, balance spacing, and fit neatly onto single A4 page"
            aria-label="Auto Fix PDF"
          >
            <WandSparkles size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">Auto Fix</span>
          </button>

          {/* Preview: Dedicated A4 Document Preview */}
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            title="Preview actual A4 document"
            aria-label="Preview"
          >
            <Eye size={13} className="text-blue-400" />
            <span className="hidden lg:inline">Preview</span>
          </button>

          {/* Download PDF / Print */}
          <button
            type="button"
            onClick={onPrint || onPreview}
            className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-950/40 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-900/60 hover:text-white cursor-pointer shadow-sm"
            title="Download or Print PDF Document"
            aria-label="Download PDF"
          >
            <Download size={13} className="text-indigo-400" />
            <span className="hidden md:inline">PDF</span>
          </button>

          {/* Save Action with Cloud Sync Status Pill */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50 ${
                cloudStatus === "unsaved"
                  ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
              title="Save layout to cloud for all devices (Ctrl+S)"
              aria-label="Save layout"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : cloudStatus === "saved" ? (
                <CheckCircle2 size={13} />
              ) : (
                <Save size={13} />
              )}
              <span>{saving ? "Saving…" : cloudStatus === "saved" ? "Saved" : "Save"}</span>
            </button>
          </div>
        </div>

        {/* 3. Advanced Tools & Panel Controls */}
        <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5 shrink-0">
          {/* Advanced Settings Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowAdvancedModal(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 p-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
            title="Advanced Settings: Grid, Margins, Alignment, Styles & Tools"
          >
            <Sliders size={14} className="text-amber-400" />
            <span className="hidden 2xl:inline">Advanced</span>
          </button>

          {/* More Actions Menu Button */}
          <div className="relative">
            <button
              ref={moreMenuButtonRef}
              type="button"
              aria-label="Document designer actions menu"
              onClick={() => setShowMoreMenu((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              title="More Actions: Auto Fix Modes & Styles"
            >
              <ChevronDown size={14} className={showMoreMenu ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>

            {showMoreMenu && (
              <div
                className="designer-scrollbar fixed z-50 w-64 max-h-[min(70dvh,320px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl text-xs text-slate-200 space-y-1 right-3 top-14"
              >
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-800">
                Auto Fix &amp; Saved Styles
              </div>
              <button
                type="button"
                onClick={() => {
                  onAutoFixAction("standard");
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition cursor-pointer"
              >
                Standard Auto Fix
              </button>
              <button
                type="button"
                onClick={() => {
                  onAutoFixAction("saved");
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition cursor-pointer"
              >
                My Saved Style
              </button>
              <button
                type="button"
                onClick={() => {
                  onAutoFixAction("create");
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition cursor-pointer"
              >
                Create New Style
              </button>
              <button
                type="button"
                onClick={() => {
                  onAutoFixAction("manage");
                  setShowMoreMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition cursor-pointer"
              >
                Manage Saved Styles
              </button>
              <div className="pt-1 border-t border-slate-800">
                <button
                  type="button"
                  aria-label="Save My Style"
                  onClick={() => {
                    onSaveMyStyle();
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-semibold transition cursor-pointer"
                >
                  Save My Style
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Right Inspector Toggle */}
          {onToggleRightInspector && (
            <button
              type="button"
              onClick={onToggleRightInspector}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                rightInspectorOpen
                  ? "text-amber-400 bg-slate-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              title="Toggle Properties Inspector"
            >
              <PanelRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Unified Advanced Settings Modal ───────────────────────────────────────── */}
      {showAdvancedModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full text-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Sliders size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Advanced Settings &amp; Tools</h3>
                  <p className="text-[11px] text-slate-400">
                    Fine-tune grid, alignment, margins, templates, and utilities
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 p-1.5 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setAdvancedTab("grid")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  advancedTab === "grid"
                    ? "bg-slate-800 text-amber-400 shadow border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Grid &amp; Alignment
              </button>
              <button
                type="button"
                onClick={() => setAdvancedTab("styles")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  advancedTab === "styles"
                    ? "bg-slate-800 text-amber-400 shadow border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Saved Styles
              </button>
              <button
                type="button"
                onClick={() => setAdvancedTab("tools")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  advancedTab === "tools"
                    ? "bg-slate-800 text-amber-400 shadow border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tools &amp; Audit
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300">
              {/* Tab 1: Grid & Alignment */}
              {advancedTab === "grid" && (
                <div className="space-y-4">
                  {/* Grid & Magnet Toggles */}
                  <div>
                    <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-2">
                      Snapping &amp; Guides
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={onToggleSnapGrid}
                        className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                          snapGrid
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                            : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Grid size={16} />
                          <span>Snap to Grid (5mm)</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${snapGrid ? "bg-amber-500/30 text-amber-200" : "bg-slate-700 text-slate-400"}`}>
                          {snapGrid ? "ON" : "OFF"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={onToggleSnapMargins}
                        className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                          snapMargins
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                            : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Magnet size={16} />
                          <span>Snap to Margins (12mm)</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${snapMargins ? "bg-amber-500/30 text-amber-200" : "bg-slate-700 text-slate-400"}`}>
                          {snapMargins ? "ON" : "OFF"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Element Alignment Controls */}
                  <div>
                    <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-2">
                      Element Alignment {hasSelectedElement ? `(${selectedElementLabel || "Selected"})` : "(Select an element on canvas to align)"}
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <button
                        type="button"
                        onClick={() => onAlign("left")}
                        disabled={!hasSelectedElement}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer"
                        title="Align Left"
                      >
                        <AlignLeft size={16} className="mb-1 text-slate-300" />
                        <span className="text-[10px]">Left</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAlign("center")}
                        disabled={!hasSelectedElement}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer"
                        title="Align Center"
                      >
                        <AlignCenter size={16} className="mb-1 text-slate-300" />
                        <span className="text-[10px]">Center</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAlign("right")}
                        disabled={!hasSelectedElement}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer"
                        title="Align Right"
                      >
                        <AlignRight size={16} className="mb-1 text-slate-300" />
                        <span className="text-[10px]">Right</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAlign("center-h")}
                        disabled={!hasSelectedElement}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer"
                        title="Center Horizontally on Page"
                      >
                        <AlignHorizontalJustifyCenter size={16} className="mb-1 text-amber-400" />
                        <span className="text-[10px]">Page H</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAlign("center-v")}
                        disabled={!hasSelectedElement}
                        className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 transition cursor-pointer"
                        title="Center Vertically on Page"
                      >
                        <AlignVerticalJustifyCenter size={16} className="mb-1 text-amber-400" />
                        <span className="text-[10px]">Page V</span>
                      </button>

                      {onDeleteSelected && (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSelected();
                            setShowAdvancedModal(false);
                          }}
                          disabled={!hasSelectedElement}
                          className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-40 transition cursor-pointer"
                          title="Delete or Hide Selected Element"
                        >
                          <Trash2 size={16} className="mb-1 text-rose-400" />
                          <span className="text-[10px]">Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Saved Styles & Presets */}
              {advancedTab === "styles" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                        Saved Style Presets
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Apply saved company designs or create a new template variant
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label="Save My Style"
                      onClick={() => {
                        onSaveMyStyle();
                        setShowAdvancedModal(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                    >
                      <BookmarkPlus size={14} />
                      <span>Save Current as New</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {stylePresets.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-700 text-center text-slate-400 text-xs">
                        No custom presets saved for this document type yet.
                      </div>
                    ) : (
                      stylePresets.map((preset) => (
                        <div
                          key={preset.id}
                          onClick={() => {
                            onSelectStylePreset(preset.id);
                            setShowAdvancedModal(false);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                            selectedStylePresetId === preset.id
                              ? "bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold"
                              : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-100">{preset.template_name}</div>
                            <div className="text-[10px] text-slate-400">
                              {preset.is_default ? "Default Template • " : ""}Version {preset.version}
                            </div>
                          </div>
                          {selectedStylePresetId === preset.id && (
                            <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold">
                              Active
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Tools & Audit */}
              {advancedTab === "tools" && (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                    Document Tools &amp; Actions
                  </h4>

                  {onImportDesign && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdvancedModal(false);
                        onImportDesign();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-850 hover:border-indigo-500/50 transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                          <Upload size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100">Import Template Design</div>
                          <div className="text-[11px] text-slate-400">Reconstruct layout from Word (.docx), Excel (.xlsx), or PDF</div>
                        </div>
                      </div>
                    </button>
                  )}

                  {onCheckLayout && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdvancedModal(false);
                        onCheckLayout();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-850 hover:border-teal-500/50 transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400">
                          <ShieldCheck size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100">Layout Flow &amp; Overlap Audit</div>
                          <div className="text-[11px] text-slate-400">Automated diagnostic scanner for overlaps, bounds, and A4 clearance</div>
                        </div>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAdvancedModal(false);
                      onOpenApplyModal();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-850 hover:border-amber-500/50 transition cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                        <Copy size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-100">Apply to Other Document Types</div>
                        <div className="text-[11px] text-slate-400">Copy header, branding, borders, or styling to other templates</div>
                      </div>
                    </div>
                  </button>

                  <div className="pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdvancedModal(false);
                        onReset();
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                          <RotateCcw size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-rose-200">Reset to Default UAE Corporate Layout</div>
                          <div className="text-[11px] text-rose-300/80">Restores standard positions (with confirmation dialog)</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 flex items-center justify-end bg-slate-950/80">
              <button
                type="button"
                onClick={() => setShowAdvancedModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
