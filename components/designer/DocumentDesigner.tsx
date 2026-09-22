"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  DocumentLayout,
  DocumentTypeId,
  LayoutElement,
  loadDocumentLayout,
  saveDocumentLayout,
  resetDocumentLayout,
  createDefaultLayout,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import TopToolbar from "./TopToolbar";
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";
import DocumentCanvas from "./DocumentCanvas";
import { CompanyDocInfo } from "../documents/DocHeader";
import PrintModal from "../documents/PrintModal";
import DynamicDocumentRenderer, { SAMPLE_DOCUMENT_DATA } from "../documents/DynamicDocumentRenderer";
import { AlertCircle, CheckCircle2, RotateCcw, X } from "lucide-react";

export default function DocumentDesigner() {
  const [selectedDocType, setSelectedDocType] = useState<DocumentTypeId>("tax_invoice");
  const [layout, setLayout] = useState<DocumentLayout>(() => createDefaultLayout("tax_invoice"));
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // History for 50+ steps of Undo / Redo
  // Stored in BOTH state (to trigger re-renders for canUndo/canRedo) and refs (so callbacks always see current values)
  const [history, setHistory] = useState<DocumentLayout[]>([createDefaultLayout("tax_invoice")]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const historyRef = useRef<DocumentLayout[]>([createDefaultLayout("tax_invoice")]);
  const historyIndexRef = useRef<number>(0);

  // Canvas & Interaction State
  const [selectedElementId, setSelectedElementId] = useState<string | null>("logo");
  const [zoom, setZoom] = useState<number>(0.85);
  const [snapGrid, setSnapGrid] = useState<boolean>(true);
  const [snapMargins, setSnapMargins] = useState<boolean>(true);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [totalPages] = useState<number>(1);

  // Modals & Feedback
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // ── 1. Load Company Profile & Initial Layout ────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data } = await supabase.from("companies").select("*").limit(1).maybeSingle();
      if (data) {
        setCompany(data);
        setCompanyId(data.id);
      }
      const loaded = await loadDocumentLayout(data?.id, "tax_invoice");
      const snapshot = JSON.parse(JSON.stringify(loaded.layout));
      setLayout(loaded.layout);
      historyRef.current = [snapshot];
      historyIndexRef.current = 0;
      setHistory([snapshot]);
      setHistoryIndex(0);
    }
    init();
  }, []);

  // ── 2. Switch Document Type ────────────────────────────────────────────────
  const handleSelectDocType = useCallback(
    async (docType: DocumentTypeId) => {
      setSelectedDocType(docType);
      setSelectedElementId(null);
      const loaded = await loadDocumentLayout(companyId, docType);
      const snapshot = JSON.parse(JSON.stringify(loaded.layout));
      setLayout(loaded.layout);
      historyRef.current = [snapshot];
      historyIndexRef.current = 0;
      setHistory([snapshot]);
      setHistoryIndex(0);
    },
    [companyId]
  );

  // ── 3. Undo / Redo Manager ─────────────────────────────────────────────────
  // pushHistory reads from refs (always current), updates both refs and state
  const pushHistory = useCallback((newLayout: DocumentLayout) => {
    const cur = historyRef.current;
    const idx = historyIndexRef.current;
    const next = cur.slice(0, idx + 1);
    if (next.length >= 60) next.shift();
    next.push(JSON.parse(JSON.stringify(newLayout)));
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    setHistory(next);
    setHistoryIndex(next.length - 1);
    setLayout(newLayout);
  }, []);

  const handleUndo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx > 0) {
      const target = idx - 1;
      historyIndexRef.current = target;
      setHistoryIndex(target);
      setLayout(JSON.parse(JSON.stringify(historyRef.current[target])));
    }
  }, []);

  const handleRedo = useCallback(() => {
    const idx = historyIndexRef.current;
    const len = historyRef.current.length;
    if (idx < len - 1) {
      const target = idx + 1;
      historyIndexRef.current = target;
      setHistoryIndex(target);
      setLayout(JSON.parse(JSON.stringify(historyRef.current[target])));
    }
  }, []);

  // ── 4. Element Update Handler ──────────────────────────────────────────────
  // Uses refs for history so it's safe to call 60×/sec during drag without stale closures.
  const handleUpdateElement = useCallback(
    (id: string, patch: Partial<LayoutElement>, commitHistory: boolean = true) => {
      setLayout((prevLayout) => {
        const nextElements = prevLayout.elements.map((el) => {
          if (el.id !== id) return el;
          return { ...el, ...patch };
        });
        const updated = { ...prevLayout, elements: nextElements };

        if (commitHistory) {
          const cur = historyRef.current;
          const idx = historyIndexRef.current;
          const next = cur.slice(0, idx + 1);
          if (next.length >= 60) next.shift();
          next.push(JSON.parse(JSON.stringify(updated)));
          historyRef.current = next;
          historyIndexRef.current = next.length - 1;
          setHistory(next);
          setHistoryIndex(next.length - 1);
        }

        return updated;
      });
    },
    []
  );

  // ── 5. Page & Branding Updates ─────────────────────────────────────────────
  const handleUpdateLayoutBranding = useCallback(
    (brandingPatch: Partial<DocumentLayout["branding"]>) => {
      const updated: DocumentLayout = {
        ...layout,
        branding: { ...layout.branding, ...brandingPatch },
      };
      pushHistory(updated);
    },
    [layout, pushHistory]
  );

  const handleUpdatePageSettings = useCallback(
    (pagePatch: Partial<DocumentLayout["page"]>) => {
      const updated: DocumentLayout = {
        ...layout,
        page: { ...layout.page, ...pagePatch },
      };
      pushHistory(updated);
    },
    [layout, pushHistory]
  );

  // ── 6. Alignment Actions ───────────────────────────────────────────────────
  const handleAlign = useCallback(
    (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom" | "center-h" | "center-v") => {
      if (!selectedElementId) return;
      const elem = layout.elements.find((el) => el.id === selectedElementId);
      if (!elem || elem.locked) return;

      let newX = elem.x;
      let newY = elem.y;

      if (alignment === "left") newX = layout.page.margins.left;
      else if (alignment === "center" || alignment === "center-h")
        newX = (layout.page.widthMm - elem.width) / 2;
      else if (alignment === "right")
        newX = layout.page.widthMm - layout.page.margins.right - elem.width;
      else if (alignment === "top") newY = layout.page.margins.top;
      else if (alignment === "middle" || alignment === "center-v")
        newY = (layout.page.heightMm - elem.height) / 2;
      else if (alignment === "bottom")
        newY = layout.page.heightMm - layout.page.margins.bottom - elem.height;

      handleUpdateElement(elem.id, { x: newX, y: newY }, true);
    },
    [selectedElementId, layout, handleUpdateElement]
  );

  // ── 7. Layer Movement ──────────────────────────────────────────────────────
  const handleMoveLayer = useCallback(
    (id: string, direction: "up" | "down" | "top" | "bottom") => {
      const elem = layout.elements.find((el) => el.id === id);
      if (!elem) return;

      const zIndices = layout.elements.map((el) => el.zIndex);
      const maxZ = Math.max(...zIndices, 1);
      const minZ = Math.min(...zIndices, 1);

      let newZ = elem.zIndex;
      if (direction === "top") newZ = maxZ + 1;
      else if (direction === "bottom") newZ = Math.max(1, minZ - 1);
      else if (direction === "up") newZ = elem.zIndex + 1;
      else if (direction === "down") newZ = Math.max(1, elem.zIndex - 1);

      handleUpdateElement(id, { zIndex: newZ }, true);
    },
    [layout, handleUpdateElement]
  );

  // ── 8. Visibility & Lock Toggles ───────────────────────────────────────────
  const handleToggleVisibility = useCallback(
    (id: string) => {
      const elem = layout.elements.find((el) => el.id === id);
      if (elem) handleUpdateElement(id, { visible: !elem.visible }, true);
    },
    [layout, handleUpdateElement]
  );

  const handleToggleLock = useCallback(
    (id: string) => {
      const elem = layout.elements.find((el) => el.id === id);
      if (elem) handleUpdateElement(id, { locked: !elem.locked }, true);
    },
    [layout, handleUpdateElement]
  );

  // ── 9. Add / Delete Custom Elements ────────────────────────────────────────
  const handleAddCustomElement = useCallback(
    (type: "custom_text" | "divider") => {
      const newId = `custom_${type}_${Date.now()}`;
      const newElem: LayoutElement = {
        id: newId,
        type: "custom_text",
        label: "Custom Text Block",
        x: 20,
        y: 100,
        width: 80,
        height: 12,
        visible: true,
        locked: false,
        zIndex: layout.elements.length + 10,
        fontSize: 12,
        fontWeight: "normal",
        color: layout.branding.textColor,
        customText: "Double-click or edit in inspector",
      };

      const updated = {
        ...layout,
        elements: [...layout.elements, newElem],
      };
      pushHistory(updated);
      setSelectedElementId(newId);
    },
    [layout, pushHistory]
  );

  const handleDeleteElement = useCallback(
    (id: string) => {
      const updated = {
        ...layout,
        elements: layout.elements.filter((el) => el.id !== id),
      };
      pushHistory(updated);
      if (selectedElementId === id) setSelectedElementId(null);
    },
    [layout, pushHistory, selectedElementId]
  );

  // ── 10. Save Layout ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setNotification(null);

    const res = await saveDocumentLayout(companyId, selectedDocType, layout);
    setSaving(false);

    if (res.success) {
      const dest = res.target === "database" ? "Supabase Database" : "Local Workspace";
      setNotification({
        message: `Layout for ${selectedDocType.replace("_", " ")} saved successfully to ${dest}!`,
        type: "success",
      });
    } else {
      setNotification({
        message: res.error || "Failed to save layout.",
        type: "error",
      });
    }

    setTimeout(() => setNotification(null), 4000);
  }, [companyId, selectedDocType, layout]);

  // ── 11. Reset Layout to Default ────────────────────────────────────────────
  const handleConfirmReset = useCallback(async () => {
    const defaultLayout = await resetDocumentLayout(companyId, selectedDocType);
    const snapshot = JSON.parse(JSON.stringify(defaultLayout));
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    setHistory([snapshot]);
    setHistoryIndex(0);
    setLayout(defaultLayout);
    setShowResetModal(false);
    setNotification({
      message: `Reset ${selectedDocType} to UAE Corporate Professional Default.`,
      type: "success",
    });
    setTimeout(() => setNotification(null), 3500);
  }, [companyId, selectedDocType, pushHistory]);

  // ── 12. Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (selectedElementId) {
        const step = e.shiftKey ? 5 : 1;
        const elem = layout.elements.find((el) => el.id === selectedElementId);
        if (!elem || elem.locked) return;

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleUpdateElement(elem.id, { x: Math.max(0, elem.x - step) }, true);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleUpdateElement(elem.id, { x: Math.min(layout.page.widthMm - elem.width, elem.x + step) }, true);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          handleUpdateElement(elem.id, { y: Math.max(0, elem.y - step) }, true);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          handleUpdateElement(elem.id, { y: Math.min(layout.page.heightMm - elem.height, elem.y + step) }, true);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          if (elem.type === "custom_text") {
            handleDeleteElement(elem.id);
          } else {
            handleToggleVisibility(elem.id);
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleSave,
    selectedElementId,
    layout,
    handleUpdateElement,
    handleDeleteElement,
    handleToggleVisibility,
  ]);

  const selectedElement = layout.elements.find((el) => el.id === selectedElementId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Toolbar */}
      <TopToolbar
        selectedDocType={selectedDocType}
        onSelectDocType={handleSelectDocType}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        onZoomChange={setZoom}
        onFitWidth={() => setZoom(1.0)}
        onFitPage={() => setZoom(0.75)}
        snapGrid={snapGrid}
        onToggleSnapGrid={() => setSnapGrid(!snapGrid)}
        snapMargins={snapMargins}
        onToggleSnapMargins={() => setSnapMargins(!snapMargins)}
        onAlign={handleAlign}
        hasSelectedElement={Boolean(selectedElement && !selectedElement.locked)}
        pageNumber={pageNumber}
        totalPages={totalPages}
        onPageChange={setPageNumber}
        saving={saving}
        onSave={handleSave}
        onReset={() => setShowResetModal(true)}
        onPreview={() => setShowPreviewModal(true)}
        templateName={layout.templateName}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Document Layers */}
        <LeftSidebar
          elements={layout.elements}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onToggleVisibility={handleToggleVisibility}
          onToggleLock={handleToggleLock}
          onMoveLayer={handleMoveLayer}
          onAddCustomElement={handleAddCustomElement}
        />

        {/* Center: Interactive A4 Canvas */}
        <DocumentCanvas
          layout={layout}
          company={company}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElement}
          zoom={zoom}
          snapGrid={snapGrid}
          snapMargins={snapMargins}
          pageNumber={pageNumber}
        />

        {/* Right Sidebar: Selected Element Inspector / Page Settings */}
        <RightInspector
          layout={layout}
          selectedElement={selectedElement}
          onUpdateElement={handleUpdateElement}
          onUpdateLayoutBranding={handleUpdateLayoutBranding}
          onUpdatePageSettings={handleUpdatePageSettings}
          onDeleteElement={handleDeleteElement}
          onMoveLayer={handleMoveLayer}
        />
      </div>

      {/* Floating Status Toast Notification */}
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
            <AlertCircle size={16} className="text-red-400" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold">Reset Document Layout?</h3>
                <p className="text-xs text-slate-400">This action can be undone with Ctrl+Z.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Reset this <strong>{selectedDocType.replace("_", " ")}</strong> layout to the UAE
              Corporate professional default? Your uploaded logo, stamp, and company profile
              settings will NOT be deleted.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Print Preview Modal
           DynamicDocumentRenderer renders its own 210×297mm A4 sheet.
           Do NOT wrap it in DocumentContainer — that adds p-[12mm] padding
           causing all elements to be offset by 12mm vs the canvas preview. */}
      <PrintModal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)}>
        <div className="bg-slate-100 min-h-screen py-6 px-4 print:bg-transparent print:p-0">
          {/* Screen-only control bar */}
          <div className="no-print w-[210mm] max-w-full mx-auto mb-4 flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">
              {DOCUMENT_TYPE_OPTIONS.find((d) => d.id === selectedDocType)?.label} — Preview
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition shadow"
              >
                🖨 Print / Save PDF
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
          {/* A4 sheet — same renderer, same layout, no extra padding wrapper */}
          <div className="mx-auto w-fit shadow-2xl">
            <DynamicDocumentRenderer
              layout={layout}
              company={company}
              data={SAMPLE_DOCUMENT_DATA}
              isDesignerPreview={false}
              scale={1}
            />
          </div>
        </div>
      </PrintModal>
    </div>
  );
}
