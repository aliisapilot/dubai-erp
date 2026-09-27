"use client";

import React, { useState } from "react";
import {
  X,
  CheckSquare,
  Square,
  Copy,
  Layers,
  Sparkles,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  DocumentLayout,
  DocumentTypeId,
  DOCUMENT_TYPE_OPTIONS,
  VisualScopeKey,
  VISUAL_SCOPE_DEFINITIONS,
  LayoutElement,
  loadDocumentLayout,
  saveDocumentLayout,
  applyVisualSettingsToLayout,
} from "@/lib/documentDesigner";

interface ApplyToOthersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocType: DocumentTypeId;
  currentLayout: DocumentLayout;
  companyId: string | null | undefined;
  targetElement?: LayoutElement | null;
  onApplied: (appliedDocCount: number, message: string) => void;
}

export default function ApplyToOthersModal({
  isOpen,
  onClose,
  currentDocType,
  currentLayout,
  companyId,
  targetElement,
  onApplied,
}: ApplyToOthersModalProps) {
  // Available other documents (excluding the active one being edited)
  const availableDocs = DOCUMENT_TYPE_OPTIONS.filter((d) => d.id !== currentDocType);

  // Selected target documents
  const [selectedDocIds, setSelectedDocIds] = useState<DocumentTypeId[]>(() =>
    availableDocs.map((d) => d.id)
  );

  // Selected visual scopes (when propagating multi-scope)
  const [selectedScopes, setSelectedScopes] = useState<VisualScopeKey[]>([
    "logo",
    "company_name_en",
    "company_name_ar",
    "company_address",
    "branding_colors",
    "watermark",
    "footer",
    "page_margins",
  ]);

  // Mode: if targetElement is provided, user can toggle between "This Element Only" or "Full Scope"
  const [applyMode, setApplyMode] = useState<"element" | "scopes">(
    targetElement ? "element" : "scopes"
  );

  const [applying, setApplying] = useState(false);

  if (!isOpen) return null;

  // Toggle single document
  const toggleDoc = (id: DocumentTypeId) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  // Select all other documents
  const selectAllDocs = () => {
    setSelectedDocIds(availableDocs.map((d) => d.id));
  };

  // Deselect all
  const deselectAllDocs = () => {
    setSelectedDocIds([]);
  };

  // Toggle visual scope
  const toggleScope = (key: VisualScopeKey) => {
    setSelectedScopes((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const selectAllScopes = () => {
    setSelectedScopes(VISUAL_SCOPE_DEFINITIONS.map((s) => s.key));
  };

  const deselectAllScopes = () => {
    setSelectedScopes([]);
  };

  // Apply handler
  const handleApply = async (overrideAllDocs = false) => {
    const targetDocs = overrideAllDocs ? availableDocs.map((d) => d.id) : selectedDocIds;
    if (targetDocs.length === 0) return;

    setApplying(true);
    let count = 0;

    try {
      for (const docId of targetDocs) {
        // 1. Load target document's current layout
        const targetRes = await loadDocumentLayout(companyId, docId);
        const existingLayout = targetRes.layout;

        // 2. Merge visual properties strictly (never business data)
        const updatedLayout = applyVisualSettingsToLayout(currentLayout, existingLayout, {
          singleElementId: applyMode === "element" && targetElement ? targetElement.id : undefined,
          scopes: applyMode === "scopes" ? selectedScopes : undefined,
        });

        // 3. Save independently into target document storage
        await saveDocumentLayout(
          companyId,
          docId,
          updatedLayout,
          updatedLayout.templateName || "Default UAE Corporate Template"
        );
        count++;
      }

      const scopeDescription =
        applyMode === "element" && targetElement
          ? `element "${targetElement.label}"`
          : `${selectedScopes.length} visual styling groups`;

      onApplied(
        count,
        `Successfully applied ${scopeDescription} to ${count} document${count === 1 ? "" : "s"}. Independent overrides preserved.`
      );
      onClose();
    } catch (err) {
      console.error("Failed to propagate document styling:", err);
      onApplied(count, `Partially applied to ${count} documents. Error: ${String(err)}`);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Copy size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Apply Design to Other Documents</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-300 font-mono px-2 py-0.5 rounded border border-amber-500/30">
                  Visual Styling Only
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Source Document: <span className="font-semibold text-slate-200 capitalize">{currentDocType.replace(/_/g, " ")}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-5 text-xs">
          {/* Mode Switcher (if targetElement selected) */}
          {targetElement && (
            <div className="flex items-center gap-2 p-1 bg-slate-950/80 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setApplyMode("element")}
                className={`flex-1 py-1.5 px-3 rounded-md font-medium text-xs transition flex items-center justify-center gap-1.5 ${
                  applyMode === "element"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers size={13} />
                <span>Apply This Element Only ({targetElement.label})</span>
              </button>
              <button
                type="button"
                onClick={() => setApplyMode("scopes")}
                className={`flex-1 py-1.5 px-3 rounded-md font-medium text-xs transition flex items-center justify-center gap-1.5 ${
                  applyMode === "scopes"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles size={13} />
                <span>Choose Visual Elements / Theme</span>
              </button>
            </div>
          )}

          {/* Section 1: Choose WHAT gets copied (when in scopes mode) */}
          {applyMode === "scopes" ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  1. Select Visual Properties to Copy
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    onClick={selectAllScopes}
                    className="text-amber-400 hover:text-amber-300 transition"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={deselectAllScopes}
                    className="text-slate-400 hover:text-slate-300 transition"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-slate-950/40 rounded-lg border border-slate-800/80">
                {VISUAL_SCOPE_DEFINITIONS.map((scope) => {
                  const isChecked = selectedScopes.includes(scope.key);
                  return (
                    <label
                      key={scope.key}
                      onClick={() => toggleScope(scope.key)}
                      className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition ${
                        isChecked
                          ? "bg-amber-500/10 border-amber-500/40 text-slate-200"
                          : "bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-amber-500 bg-slate-800 border-slate-600"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-[11px] text-slate-200 leading-tight">
                          {scope.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {scope.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
              <Layers size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300 text-xs">
                  Copying Single Element: {targetElement?.label}
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Only the position ({Math.round(targetElement?.x || 0)}×{Math.round(targetElement?.y || 0)}mm),
                  dimensions ({Math.round(targetElement?.width || 0)}×{Math.round(targetElement?.height || 0)}mm),
                  alignment, typography, and styling will be propagated.
                </p>
              </div>
            </div>
          )}

          {/* Section 2: Choose Target Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                2. Select Target Printable Documents ({selectedDocIds.length} of {availableDocs.length} selected)
              </span>
              <div className="flex items-center gap-2 text-[10px]">
                <button
                  onClick={selectAllDocs}
                  className="text-amber-400 hover:text-amber-300 transition"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={deselectAllDocs}
                  className="text-slate-400 hover:text-slate-300 transition"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-slate-950/40 rounded-lg border border-slate-800/80">
              {availableDocs.map((doc) => {
                const isChecked = selectedDocIds.includes(doc.id);
                return (
                  <label
                    key={doc.id}
                    onClick={() => toggleDoc(doc.id)}
                    className={`flex items-center justify-between p-2 rounded-md border cursor-pointer transition ${
                      isChecked
                        ? "bg-slate-800/90 border-amber-500/50 text-slate-100"
                        : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isChecked ? (
                        <CheckSquare size={14} className="text-amber-400 shrink-0" />
                      ) : (
                        <Square size={14} className="text-slate-600 shrink-0" />
                      )}
                      <div className="truncate">
                        <span className="font-medium text-[11px] text-slate-200 block truncate">
                          {doc.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-arabic block leading-tight">
                          {doc.labelAr}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                      {doc.category}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Business Data Protection Notice */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start gap-2.5 text-slate-400">
            <ShieldAlert size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-semibold text-slate-200">Strict Data Isolation Guarantee: </span>
              Business data (document numbers, dates, customer/vendor names, line items, pricing, VAT amounts, and totals) is{" "}
              <strong className="text-emerald-400">never overwritten</strong>. Each document preserves its independent overrides.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3.5 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-xs font-semibold"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleApply(true)}
              disabled={applying}
              className="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              title="Apply visual styling to all other printable documents"
            >
              <Sparkles size={13} />
              <span>Apply to All Documents</span>
            </button>

            <button
              type="button"
              onClick={() => handleApply(false)}
              disabled={applying || selectedDocIds.length === 0}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {applying ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Applying ({selectedDocIds.length})...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  <span>Apply ({selectedDocIds.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
