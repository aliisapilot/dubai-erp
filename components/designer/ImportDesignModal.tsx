"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Sparkles,
  Check,
  AlertTriangle,
  Save,
  X,
  ArrowRight,
  RotateCcw,
  Loader2,
  Columns,
  FileCheck,
} from "lucide-react";
import {
  DocumentLayout,
  DocumentTypeId,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import {
  importDocumentTemplate,
  ImportedDocumentDraft,
  ERP_FIELD_DEFINITIONS,
} from "@/lib/templateImporter";
import DynamicDocumentRenderer, { getSampleDocumentData } from "../documents/DynamicDocumentRenderer";

interface ImportDesignModalProps {
  isOpen: boolean;
  currentDocType: DocumentTypeId;
  companyId?: string | null;
  onClose: () => void;
  onApplyLayoutToDesigner: (layout: DocumentLayout, makeDefault: boolean) => void;
  onSaveToCloud: (layout: DocumentLayout, name: string, makeDefault: boolean) => Promise<void>;
}

export default function ImportDesignModal({
  isOpen,
  currentDocType,
  onClose,
  onApplyLayoutToDesigner,
  onSaveToCloud,
}: ImportDesignModalProps) {
  const [targetDocType, setTargetDocType] = useState<DocumentTypeId>(currentDocType);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportedDocumentDraft | null>(null);
  const [activeStep, setActiveStep] = useState<"upload" | "review">("upload");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState<"side_by_side" | "erp_only" | "original_only">("side_by_side");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sample data for live rendering in the right pane
  const sampleData = useMemo(() => {
    return getSampleDocumentData(targetDocType);
  }, [targetDocType]);

  if (!isOpen) return null;

  // Handle file drop / upload
  async function handleFileProcess(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const buffer = await file.arrayBuffer();
      const importedDraft = await importDocumentTemplate(buffer, file.name, {
        targetDocType,
        templateName: `Imported - ${file.name.replace(/\.[^/.]+$/, "")}`,
      });

      setDraft(importedDraft);
      setTemplateName(importedDraft.reconstructedLayout.templateName);
      setActiveStep("review");
      if (importedDraft.detectedBlocks.length > 0) {
        setSelectedBlockId(importedDraft.detectedBlocks[0].id);
      }
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Failed to parse document. Please check the file format.");
    } finally {
      setParsing(false);
    }
  }

  // Update a mapped field on a detected block
  function handleAssignToken(blockId: string, token: string) {
    if (!draft) return;

    const updatedBlocks = draft.detectedBlocks.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          mappedToken: token,
          currentText: token,
        };
      }
      return b;
    });

    // Update the element in reconstructedLayout
    const updatedElements = draft.reconstructedLayout.elements.map((elem) => {
      if (elem.id === `custom_${blockId}` || elem.id === blockId) {
        return {
          ...elem,
          customText: token,
          label: `Mapped: ${token}`,
        };
      }
      return elem;
    });

    setDraft({
      ...draft,
      detectedBlocks: updatedBlocks,
      reconstructedLayout: {
        ...draft.reconstructedLayout,
        elements: updatedElements,
      },
    });
  }

  // Update text of a block manually
  function handleUpdateBlockText(blockId: string, newText: string) {
    if (!draft) return;

    const updatedBlocks = draft.detectedBlocks.map((b) => {
      if (b.id === blockId) {
        return { ...b, currentText: newText };
      }
      return b;
    });

    const updatedElements = draft.reconstructedLayout.elements.map((elem) => {
      if (elem.id === `custom_${blockId}` || elem.id === blockId) {
        return { ...elem, customText: newText };
      }
      return elem;
    });

    setDraft({
      ...draft,
      detectedBlocks: updatedBlocks,
      reconstructedLayout: {
        ...draft.reconstructedLayout,
        elements: updatedElements,
      },
    });
  }

  // Toggle Orientation (Portrait <-> Landscape)
  function handleToggleOrientation(orient: "portrait" | "landscape") {
    if (!draft) return;
    const isLand = orient === "landscape";
    const widthMm = isLand ? 297 : 210;
    const heightMm = isLand ? 210 : 297;

    setDraft({
      ...draft,
      orientation: orient,
      pageWidthMm: widthMm,
      pageHeightMm: heightMm,
      reconstructedLayout: {
        ...draft.reconstructedLayout,
        page: {
          ...draft.reconstructedLayout.page,
          orientation: orient,
          widthMm,
          heightMm,
        },
      },
    });
  }

  // Save template and apply
  async function handleSaveAndApply(action: "designer" | "cloud_only") {
    if (!draft) return;
    setSaving(true);
    try {
      const finalLayout: DocumentLayout = {
        ...draft.reconstructedLayout,
        templateName: templateName.trim() || draft.reconstructedLayout.templateName,
      };

      if (action === "cloud_only") {
        await onSaveToCloud(finalLayout, finalLayout.templateName, setAsDefault);
        onClose();
      } else {
        // Apply directly to designer canvas and optionally save
        onApplyLayoutToDesigner(finalLayout, setAsDefault);
        onClose();
      }
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  const selectedBlock = draft?.detectedBlocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-7xl h-[94vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-3.5 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Import Template Design</h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  DOCX · XLSX · PDF
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Extract formatting, branding, tables & layout into an editable Dubai ERP template
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeStep === "review" && (
              <button
                type="button"
                onClick={() => setActiveStep("upload")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
              >
                <RotateCcw size={13} />
                <span>Upload Another</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Step 1: Upload View */}
        {activeStep === "upload" && (
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
            <div className="w-full mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Target ERP Document Type
              </label>
              <select
                value={targetDocType}
                onChange={(e) => setTargetDocType(e.target.value as DocumentTypeId)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-amber-400"
              >
                {DOCUMENT_TYPE_OPTIONS.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.label} ({doc.defaultTitle})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5">
                The imported look & formatting will be mapped to standard ERP fields for this document type.
              </p>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileProcess(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-700 hover:border-amber-400/70 rounded-2xl p-10 flex flex-col items-center justify-center text-center bg-slate-950/60 hover:bg-slate-950/90 transition cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />

              <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform mb-4 border border-amber-500/20">
                {parsing ? <Loader2 size={36} className="animate-spin text-amber-400" /> : <Upload size={36} />}
              </div>

              <h3 className="text-base font-bold text-white mb-1">
                {parsing ? "Analyzing Document Structure..." : "Drop Word, Excel or PDF File Here"}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                {parsing
                  ? "Extracting company logo, text coordinates, table grids, typography & branding colors..."
                  : "Supports .docx, .xlsx, and .pdf documents. Reconstructs headers, repeating item tables, totals, and signatures into fully editable template elements."}
              </p>

              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-semibold">
                  <FileText size={14} /> DOCX
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-xs font-semibold">
                  <FileSpreadsheet size={14} /> XLSX
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-900/40 border border-rose-700/50 text-rose-300 text-xs font-semibold">
                  <FileCheck size={14} /> PDF
                </span>
              </div>
            </div>

            {parseError && (
              <div className="mt-4 w-full p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Import Error:</strong> {parseError}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Side-by-Side Review & Visual Field Mapper */}
        {activeStep === "review" && draft && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Sub-toolbar: Preview Switcher, Orientation & Info */}
            <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {draft.fileName}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-300 capitalize">{draft.fileType} format</span>
                <span className="text-slate-400">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Target:</span>
                  <select
                    value={targetDocType}
                    onChange={(e) => {
                      const newDocType = e.target.value as DocumentTypeId;
                      setTargetDocType(newDocType);
                      if (draft) {
                        setDraft({
                          ...draft,
                          targetDocumentType: newDocType,
                          reconstructedLayout: {
                            ...draft.reconstructedLayout,
                            documentType: newDocType,
                          },
                        });
                      }
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-amber-400 focus:outline-none focus:border-amber-400"
                  >
                    {DOCUMENT_TYPE_OPTIONS.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewTab("side_by_side")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    previewTab === "side_by_side" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Side-by-Side
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("erp_only")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    previewTab === "erp_only" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ERP Template Only
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("original_only")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    previewTab === "original_only" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Original File Only
                </button>
              </div>

              {/* Orientation toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-xs font-medium">Page:</span>
                <button
                  type="button"
                  onClick={() => handleToggleOrientation("portrait")}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition ${
                    draft.orientation === "portrait"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  A4 Portrait
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleOrientation("landscape")}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition ${
                    draft.orientation === "landscape"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  A4 Landscape
                </button>
              </div>
            </div>

            {/* Main Split Body */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left Side: Original File Document */}
              {(previewTab === "side_by_side" || previewTab === "original_only") && (
                <div className="flex-1 border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/80">
                  <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">1. Original Uploaded File</span>
                    <span>Page 1 Extracted Snapshot</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                    {draft.originalPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.originalPreviewUrl}
                        alt="Original Document Preview"
                        className="max-h-[70vh] w-auto rounded shadow-xl border border-slate-700 bg-white"
                      />
                    ) : (
                      <div className="p-8 text-center text-slate-400">
                        <FileText size={48} className="mx-auto mb-2 text-slate-600" />
                        <p className="font-semibold text-sm">Visual raster preview unavailable</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Document text, tables and dimensions were successfully extracted into the ERP template preview.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Right Side: Reconstructed ERP Template Preview */}
              {(previewTab === "side_by_side" || previewTab === "erp_only") && (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-950/80">
                  <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check size={14} /> 2. Live ERP Template Preview (Dynamic Data)
                    </span>
                    <span>A4 {draft.orientation.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
                    <div className="scale-[0.62] origin-top transition-transform">
                      <DynamicDocumentRenderer
                        layout={draft.reconstructedLayout}
                        company={null}
                        data={sampleData}
                        pageNumber={1}
                        totalPages={1}
                        isDesignerPreview={false}
                        scale={1.0}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Rightmost Inspector Panel: Field Mapping & Report */}
              <div className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col min-h-0 overflow-hidden">
                <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Columns size={14} className="text-amber-400" />
                    Field Mapper
                  </span>
                  <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                    {draft.detectedBlocks.length} Blocks
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
                  {/* Conversion Report Card */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider block">
                      Extraction Summary
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-900 p-2 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Elements</span>
                        <span className="font-bold text-white text-sm">
                          {draft.conversionReport.elementsDetected}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Tables</span>
                        <span className="font-bold text-white text-sm">
                          {draft.conversionReport.tablesDetected}
                        </span>
                      </div>
                    </div>

                    {draft.conversionReport.warnings.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 mb-1">
                          <AlertTriangle size={11} /> Limitations & Notes:
                        </span>
                        <ul className="text-[10px] text-slate-400 space-y-1 list-disc list-inside">
                          {draft.conversionReport.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Field Mapping Section */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Connect Text to ERP Field
                    </label>
                    <p className="text-[10px] text-slate-400 mb-2">
                      Select an extracted block below, then choose which dynamic ERP data should fill it:
                    </p>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {draft.detectedBlocks.map((block) => {
                        const isSelected = block.id === selectedBlockId;
                        return (
                          <div
                            key={block.id}
                            onClick={() => setSelectedBlockId(block.id)}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                              isSelected
                                ? "bg-amber-500/10 border-amber-500 text-white"
                                : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono text-slate-400">
                                {block.suggestedType.replace("_", " ")}
                              </span>
                              {block.mappedToken && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/60">
                                  {block.mappedToken}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-slate-200 font-medium">{block.currentText}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Selected Block Editor */}
                  {selectedBlock && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                      <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider block">
                        Edit Selected Block
                      </span>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                          Current Text / Token
                        </label>
                        <input
                          type="text"
                          value={selectedBlock.currentText}
                          onChange={(e) => handleUpdateBlockText(selectedBlock.id, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                          Map to ERP Data Token
                        </label>
                        <select
                          value={selectedBlock.mappedToken || ""}
                          onChange={(e) => handleAssignToken(selectedBlock.id, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="">(Keep Custom Text)</option>
                          {ERP_FIELD_DEFINITIONS.map((f) => (
                            <option key={f.token} value={f.token}>
                              {f.label} ({f.token})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quick Chips */}
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400 mb-1">
                          Quick Insert Token:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {["{customer_name}", "{document_number}", "{document_date}", "{grand_total}", "{subtotal}", "{vat}"].map(
                            (tok) => (
                              <button
                                key={tok}
                                type="button"
                                onClick={() => handleAssignToken(selectedBlock.id, tok)}
                                className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[9.5px] font-mono text-amber-300 border border-slate-700 transition"
                              >
                                {tok}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 max-w-md">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Modern Bilingual Invoice"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 font-semibold"
                  />
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    id="set-as-default-cb"
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="set-as-default-cb" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                    Set as Default
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAndApply("cloud_only")}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
                  title="Save directly to Supabase cloud templates without opening in designer"
                >
                  {saving ? <Loader2 size={14} className="animate-spin text-amber-400" /> : <Save size={14} />}
                  <span>Save as New Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAndApply("designer")}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold hover:bg-amber-400 transition cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  <span>Apply & Open in Designer</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
