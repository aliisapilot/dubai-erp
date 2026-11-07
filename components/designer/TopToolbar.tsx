"use client";

import React, { useRef, useState, useEffect } from "react";
import DesignerPortal from "./DesignerPortal";
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
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  LayoutGrid,
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
  onToggleFocusMode?: () => void;
  isFullscreen?: boolean;
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
  pageNumber = 1,
  totalPages = 1,
  onPageChange,
  saving,
  cloudStatus = "saved",
  cloudVersion,
  onSave,
  onReset,
  onAutoFix,
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
  onToggleLeftSidebar,
  onToggleRightInspector,
  onToggleFocusMode,
  isFullscreen,
  leftSidebarOpen = true,
  rightInspectorOpen = true,
  layoutMode = "manual",
  onChangeLayoutMode,
}: TopToolbarProps) {
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  // Global keyboard shortcuts: Escape to close modal, 'f' to toggle Focus Mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;

      if (e.key === "Escape") {
        setShowAdvancedModal(false);
      } else if (e.key.toLowerCase() === "f") {
        onToggleFocusMode?.();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onToggleFocusMode]);
  const [advancedTab, setAdvancedTab] = useState<"grid" | "styles" | "tools">("grid");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const updatePosition = () => {
      if (moreMenuButtonRef.current) {
        const rect = moreMenuButtonRef.current.getBoundingClientRect();
        setMoreMenuPosition({
          top: rect.bottom + 6,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showMoreMenu]);

  // Layout Tools Dropdown (combines Manual/Assisted/Auto Fit, Layers, and Auto Fix)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const layoutMenuDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showLayoutMenu && !showMoreMenu) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        showLayoutMenu &&
        layoutMenuDropdownRef.current &&
        !layoutMenuDropdownRef.current.contains(target) &&
        layoutMenuButtonRef.current &&
        !layoutMenuButtonRef.current.contains(target)
      ) {
        setShowLayoutMenu(false);
      }
      if (
        showMoreMenu &&
        moreMenuDropdownRef.current &&
        !moreMenuDropdownRef.current.contains(target) &&
        moreMenuButtonRef.current &&
        !moreMenuButtonRef.current.contains(target)
      ) {
        setShowMoreMenu(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowLayoutMenu(false);
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showLayoutMenu, showMoreMenu]);

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
    <header className="shrink-0 border-b border-slate-800 bg-slate-900 text-white select-none z-40 relative shadow-md">
      {/* ── Single Responsive Main Toolbar ───────────────────────────────────────────── */}
      <div className="designer-scrollbar flex h-12 w-full items-center justify-between px-2 sm:px-3 gap-1 sm:gap-1.5 overflow-x-auto overscroll-x-contain min-w-0">
        {/* 1. Document Selection & History */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="flex items-center gap-1 pr-1 border-r border-slate-800">
            <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shadow-inner">
              <FileText size={13} />
            </div>
          </div>

          {/* Custom Accessible Dark Template Selector Dropdown */}
          <div className="flex items-center gap-1 relative">
            <button
              ref={templateButtonRef}
              type="button"
              onClick={() => setShowTemplateDropdown((v) => !v)}
              className="w-[145px] sm:w-[175px] md:w-[195px] lg:w-[215px] flex items-center justify-between gap-1.5 rounded-lg border border-slate-700 bg-slate-800/95 hover:bg-slate-750 px-2.5 py-1 text-xs font-semibold text-white outline-none focus:border-amber-400 cursor-pointer shadow-inner transition truncate"
              title={templateName ? `Template: ${templateName}` : "Select document template to edit"}
              aria-haspopup="listbox"
              aria-expanded={showTemplateDropdown}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-slate-100">{currentDocConfig.label}</span>
                <span className="font-arabic text-[10px] text-amber-400/90 hidden md:inline truncate">
                  ({currentDocConfig.labelAr})
                </span>
              </div>
              <ChevronDown
                size={12}
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
                className="designer-scrollbar absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 max-h-[min(75dvh,380px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl text-xs text-slate-200 space-y-1.5"
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
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition cursor-pointer ${
                canUndo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Undo (Ctrl+Z)"
              aria-label="Undo (Ctrl+Z)"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 transition cursor-pointer ${
                canRedo ? "text-slate-200" : "text-slate-600 cursor-not-allowed"
              }`}
              title="Redo (Ctrl+Y)"
              aria-label="Redo (Ctrl+Y)"
            >
              <Redo2 size={13} />
            </button>
          </div>
        </div>

        {/* Separator between Document and View */}
        <div className="h-4 w-px bg-slate-800 shrink-0 mx-0.5" aria-hidden="true" />

        {/* 2. View & Zoom Cluster */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.3, Math.round((zoom - 0.1) * 10) / 10))}
            className="p-1 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(1.0)}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer border border-transparent hover:border-slate-700"
            title="Click to reset to 100% Zoom"
            aria-label="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(2.0, Math.round((zoom + 0.1) * 10) / 10))}
            className="p-1 rounded-lg border border-transparent hover:border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={onFitWidth}
            className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition cursor-pointer"
            title="Fit Document Width to Viewport"
            aria-label="Fit Document Width to Viewport"
          >
            Fit W
          </button>
          <button
            type="button"
            onClick={onFitPage}
            className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition cursor-pointer"
            title="Fit Entire Page in Viewport"
            aria-label="Fit Entire Page in Viewport"
          >
            Fit Page
          </button>
          {totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-0.5 border-l border-slate-700/80 pl-1 text-xs text-slate-300">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
                disabled={pageNumber <= 1}
                className="px-1 py-0.5 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer text-slate-300 hover:text-white transition"
                title="Previous Page"
                aria-label="Previous Page"
              >
                ‹
              </button>
              <span className="text-[10px] font-mono text-slate-300 px-0.5">
                {pageNumber}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, pageNumber + 1))}
                disabled={pageNumber >= totalPages}
                className="px-1 py-0.5 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer text-slate-300 hover:text-white transition"
                title="Next Page"
                aria-label="Next Page"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {/* Separator between View and Layout */}
        <div className="h-4 w-px bg-slate-800 shrink-0 mx-0.5" aria-hidden="true" />

        {/* 3. Layout Tools Dropdown (Replaces crowded individual mode/layer/autofix controls) */}
        <div className="relative shrink-0">
          <button
            ref={layoutMenuButtonRef}
            type="button"
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition cursor-pointer ${
              showLayoutMenu
                ? "border-amber-500 bg-amber-500/20 text-amber-300"
                : "border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white"
            }`}
            title="Layout Tools: Mode (Manual/Assist/Auto), Layers, and Auto Fix"
            aria-haspopup="true"
            aria-expanded={showLayoutMenu}
            aria-label="Layout Tools"
          >
            <LayoutGrid size={13} className="text-amber-400 shrink-0" />
            <span className="font-medium">Layout</span>
            {layoutMode && (
              <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold uppercase ${
                layoutMode === "manual" ? "bg-amber-500/20 text-amber-300" :
                layoutMode === "assisted" ? "bg-blue-500/20 text-blue-300" :
                "bg-emerald-500/20 text-emerald-300"
              }`}>
                {layoutMode === "manual" ? "Manual" : layoutMode === "assisted" ? "Assist" : "Auto"}
              </span>
            )}
            <ChevronDown size={12} className={`text-slate-400 transition-transform ${showLayoutMenu ? "rotate-180" : ""}`} />
          </button>

          {showLayoutMenu && (
            <div
              ref={layoutMenuDropdownRef}
              className="designer-scrollbar absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 w-72 max-h-[min(80dvh,420px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2.5 shadow-2xl text-xs text-slate-200 space-y-3 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* Layout Mode */}
              {onChangeLayoutMode && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                    Layout Mode
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => onChangeLayoutMode("manual")}
                      className={`px-2 py-1.5 rounded text-xs font-semibold transition cursor-pointer text-center ${
                        layoutMode === "manual" ? "bg-amber-500 text-slate-950 font-bold shadow" : "text-slate-400 hover:text-white"
                      }`}
                      title="Manual Design: Full control over positions"
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeLayoutMode("assisted")}
                      className={`px-2 py-1.5 rounded text-xs font-semibold transition cursor-pointer text-center ${
                        layoutMode === "assisted" ? "bg-blue-600 text-white font-bold shadow" : "text-slate-400 hover:text-white"
                      }`}
                      title="Assisted Layout: Suggestions with confirmation"
                    >
                      Assisted
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeLayoutMode("auto_fit")}
                      className={`px-2 py-1.5 rounded text-xs font-semibold transition cursor-pointer text-center ${
                        layoutMode === "auto_fit" ? "bg-emerald-600 text-white font-bold shadow" : "text-slate-400 hover:text-white"
                      }`}
                      title="Auto Fit: Automatic single-page A4 spacing"
                    >
                      Auto Fit
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 px-1 mt-1 leading-tight">
                    {layoutMode === "manual" ? "Manual: Precise coordinates. Auto-fit will never override." :
                     layoutMode === "assisted" ? "Assisted: Suggests spacing and element alignment." :
                     "Auto Fit: Automatic single-page A4 compaction and spacing."}
                  </p>
                </div>
              )}

              {/* Layers Panel Toggle */}
              {onToggleLeftSidebar && (
                <div className="border-t border-slate-800 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                    Panels
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleLeftSidebar()}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                      leftSidebarOpen
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                        : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                    title="Toggle Layers and Sections Panel"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={13} className={leftSidebarOpen ? "text-amber-400" : "text-slate-400"} />
                      <span className="font-medium">Layers &amp; Sections</span>
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${leftSidebarOpen ? "bg-amber-500/30 text-amber-300" : "bg-slate-700 text-slate-400"}`}>
                      {leftSidebarOpen ? "Shown" : "Hidden"}
                    </span>
                  </button>
                </div>
              )}

              {/* Auto Fix & Saved Styles */}
              <div className="border-t border-slate-800 pt-2 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Optimization &amp; Styles
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onAutoFix();
                    setShowLayoutMenu(false);
                  }}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Run Auto Fix: Fix overlaps and fit onto single A4 page"
                >
                  <WandSparkles size={13} />
                  <span>Run Auto Fix Now</span>
                </button>
                <div className="grid grid-cols-2 gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onAutoFixAction("standard");
                      setShowLayoutMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] transition cursor-pointer truncate"
                    title="Switch to Standard Auto Fix mode"
                  >
                    Standard Auto Fix
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAutoFixAction("saved");
                      setShowLayoutMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] transition cursor-pointer truncate"
                    title="Switch to My Saved Style mode"
                  >
                    My Saved Style
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAutoFixAction("create");
                      setShowLayoutMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] transition cursor-pointer truncate"
                    title="Create new design style preset"
                  >
                    Create New Style
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAutoFixAction("manage");
                      setShowLayoutMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[11px] transition cursor-pointer truncate"
                    title="Manage saved styles"
                  >
                    Manage Saved Styles
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSaveMyStyle();
                    setShowLayoutMenu(false);
                  }}
                  aria-label="Save My Style"
                  className="w-full text-center px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                  title="Save current layout as my default style"
                >
                  Save My Style
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Separator between Layout and Output */}
        <div className="h-4 w-px bg-slate-800 shrink-0 mx-0.5" aria-hidden="true" />

        {/* 4. Output & Save Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Preview: Dedicated A4 Document Preview */}
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white cursor-pointer"
            title="Preview actual A4 document"
            aria-label="Preview actual A4 document"
          >
            <Eye size={13} className="text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Preview</span>
          </button>

          {/* Download PDF / Print */}
          <button
            type="button"
            onClick={onPrint || onPreview}
            className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-950/40 px-2 py-1 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-900/60 hover:text-white cursor-pointer shadow-sm"
            title="Download or Print PDF Document"
            aria-label="Download or Print PDF Document"
          >
            <Download size={13} className="text-indigo-400 shrink-0" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Save Action & Small Status Indicator */}
          {saving ? (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-medium"
              title="Saving layout to cloud…"
            >
              <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />
              <span className="hidden sm:inline">Saving…</span>
            </div>
          ) : cloudStatus === "unsaved" ? (
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-1 rounded-lg border border-amber-500/60 bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-xs font-bold shadow transition cursor-pointer"
              title="Unsaved changes. Click to save layout to cloud (Ctrl+S)"
              aria-label="Save layout to cloud"
            >
              <Save size={12} className="shrink-0" />
              <span>Save</span>
            </button>
          ) : cloudStatus === "failed" || cloudStatus === "conflict" ? (
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-1 rounded-lg border border-red-500/60 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-1 text-xs font-bold transition cursor-pointer"
              title="Save conflict or error. Click to retry save"
              aria-label="Retry save"
            >
              <Save size={12} className="text-red-400 shrink-0" />
              <span>Retry</span>
            </button>
          ) : (
            /* Small Saved Status Indicator + Accessible Manual Save Action */
            <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 select-none"
                title={cloudVersion ? `All changes saved to cloud (v${cloudVersion})` : "All changes saved to cloud"}
              >
                <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Saved</span>
              </div>
              <button
                type="button"
                onClick={onSave}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                title="Re-save layout to cloud (Ctrl+S)"
                aria-label="Re-save layout to cloud"
              >
                <Save size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Separator between Output and Panels */}
        <div className="h-4 w-px bg-slate-800 shrink-0 mx-0.5" aria-hidden="true" />

        {/* 5. Panels & Focus Mode Controls (ALWAYS visible) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Right Inspector Toggle */}
          {onToggleRightInspector && (
            <button
              type="button"
              onClick={onToggleRightInspector}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                rightInspectorOpen
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
              }`}
              title="Toggle Properties Inspector"
              aria-label="Toggle Properties Inspector"
            >
              <PanelRight size={14} />
            </button>
          )}

          {/* Focus Mode Toggle — unconditionally visible at all screen widths */}
          {onToggleFocusMode && (
            <button
              type="button"
              onClick={onToggleFocusMode}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isFullscreen
                  ? "border-amber-500 bg-amber-500 text-slate-950 font-bold shadow"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
              title={isFullscreen ? "Exit Focus Mode (F)" : "Enter Focus Mode (F)"}
              aria-label={isFullscreen ? "Exit Focus Mode" : "Enter Focus Mode"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}

          {/* More Actions Menu Button (Secondary Tools) */}
          <div className="relative">
            <button
              ref={moreMenuButtonRef}
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="Document designer actions menu"
              className="flex items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-800/90 px-1.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-750 hover:text-white transition cursor-pointer"
              title="More Actions: Advanced Settings, Verification, Reset"
            >
              <Sliders size={13} className="text-slate-400" />
              <ChevronDown size={11} className={`text-slate-400 transition-transform ${showMoreMenu ? "rotate-180" : ""}`} />
            </button>

            {showMoreMenu && (
              <div
                ref={moreMenuDropdownRef}
                tabIndex={0}
                aria-label="Document designer actions menu"
                className="designer-scrollbar fixed z-50 w-64 max-h-[min(70dvh,320px)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl text-xs text-slate-200 space-y-1 animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: moreMenuPosition?.top ?? 48,
                  right: moreMenuPosition?.right ?? 8,
                }}
              >
                <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-800">
                  Advanced Tools
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvancedModal(true);
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
                >
                  <Sliders size={13} className="text-amber-400" />
                  <span>Advanced Settings &amp; Grid</span>
                </button>
                {onCheckLayout && (
                  <button
                    type="button"
                    onClick={() => {
                      onCheckLayout();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
                  >
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span>Check Layout &amp; Overlaps</span>
                  </button>
                )}
                {onOpenApplyModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenApplyModal();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
                  >
                    <Copy size={13} className="text-blue-400" />
                    <span>Apply Style to Other Docs</span>
                  </button>
                )}
                {onImportDesign && (
                  <button
                    type="button"
                    onClick={() => {
                      onImportDesign();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition cursor-pointer"
                  >
                    <Upload size={13} className="text-indigo-400" />
                    <span>Import Design JSON</span>
                  </button>
                )}
                <div className="pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      onReset();
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-rose-300 hover:bg-rose-500/20 flex items-center gap-2 transition cursor-pointer"
                  >
                    <RotateCcw size={13} className="text-rose-400" />
                    <span>Reset to Corporate Layout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Unified Advanced Settings Modal ───────────────────────────────────────── */}
      {showAdvancedModal && (
        <DesignerPortal>
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="advanced-settings-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAdvancedModal(false);
          }}
        >
          <div className="relative z-[101] bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full text-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Sliders size={16} />
                </div>
                <div>
                  <h3 id="advanced-settings-modal-title" className="text-sm font-bold text-white">Advanced Settings &amp; Tools</h3>
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
            <div className="p-5 overflow-y-auto designer-scrollbar space-y-5 text-xs text-slate-300 pr-6">
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
        </DesignerPortal>
      )}
    </header>
  );
}
