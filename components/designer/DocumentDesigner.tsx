"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentCompany } from "@/lib/helpers";
import {
  DocumentLayout,
  DocumentTypeId,
  LayoutElement,
  loadDocumentLayout,
  saveDocumentLayout,
  resetDocumentLayout,
  createDefaultLayout,
  normalizeLayerZIndexes,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/documentDesigner";
import TopToolbar from "./TopToolbar";
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";
import ApplyToOthersModal from "./ApplyToOthersModal";
import DocumentCanvas from "./DocumentCanvas";
import { CompanyDocInfo } from "../documents/DocHeader";
import DocumentPreviewModal from "./DocumentPreviewModal";
import LayoutValidatorModal from "./LayoutValidatorModal";
import { getDocumentPageCount, getSampleDocumentData } from "../documents/DynamicDocumentRenderer";
import { processAndOptimizeImage } from "@/lib/documentDesigner";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { computePaginationPlan } from "@/lib/documentLayoutEngine";
import { documentStylePresets } from "@/lib/documentStylePresets";
import type { DocumentStylePreset } from "@/lib/documentStylePresetModel";
import type { AutoFixAction } from "./TopToolbar";
import AutoFixPreviewModal from "./AutoFixPreviewModal";
import StylePresetsModal from "./StylePresetsModal";

export default function DocumentDesigner() {
  const [selectedDocType, setSelectedDocType] = useState<DocumentTypeId>("tax_invoice");
  const [layout, setLayout] = useState<DocumentLayout>(() => createDefaultLayout("tax_invoice"));
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState<DocumentStylePreset[]>([]);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string | null>(null);
  const [autoFixMode, setAutoFixMode] = useState<"standard" | "saved">("standard");

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
  const sampleData = getSampleDocumentData(selectedDocType);
  const totalPages = getDocumentPageCount(layout, sampleData.items.length, sampleData.items, sampleData);
  const displayedPageNumber = Math.min(pageNumber, totalPages);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // Modals & Feedback
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyTargetElement, setApplyTargetElement] = useState<LayoutElement | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(true);

  const handleOpenApplyModal = useCallback((targetElem?: LayoutElement | null) => {
    setApplyTargetElement(targetElem || null);
    setShowApplyModal(true);
  }, []);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [styleModalMode, setStyleModalMode] = useState<"save" | "manage" | null>(null);
  const [styleSaveAsNew, setStyleSaveAsNew] = useState(false);
  const [styleModalBusy, setStyleModalBusy] = useState(false);
  const [autoFixProposal, setAutoFixProposal] = useState<{
    layout: DocumentLayout;
    mode: "standard" | "saved";
    styleName?: string;
    totalPages: number;
    fitLevel?: import("@/lib/documentLayoutEngine").FitLevel;
    warning?: string;
  } | null>(null);
  const [showAutoFixPreview, setShowAutoFixPreview] = useState(false);
  const [showProposalPreview, setShowProposalPreview] = useState(false);

  const refreshStylePresets = useCallback(async (docType: DocumentTypeId, id = companyId) => {
    if (!id) {
      setStylePresets([]);
      setSelectedStylePresetId(null);
      return [];
    }
    try {
      const loaded = await documentStylePresets.list(id, docType);
      setStylePresets(loaded);
      setSelectedStylePresetId((current) =>
        loaded.some((preset) => preset.id === current)
          ? current
          : loaded.find((preset) => preset.is_default)?.id || loaded[0]?.id || null
      );
      return loaded;
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : "Could not load saved styles.",
        type: "error",
      });
      return [];
    }
  }, [companyId]);

  // ── 1. Load Company Profile & Initial Layout ────────────────────────────────
  useEffect(() => {
    async function init() {
      const currentCompany = await getCurrentCompany();
      if (currentCompany) {
        setCompany(currentCompany as CompanyDocInfo);
        setCompanyId(currentCompany.id);
      }
      const loaded = await loadDocumentLayout(currentCompany?.id, "tax_invoice");
      const snapshot = JSON.parse(JSON.stringify(loaded.layout));
      setLayout(loaded.layout);
      historyRef.current = [snapshot];
      historyIndexRef.current = 0;
      setHistory([snapshot]);
      setHistoryIndex(0);
      await refreshStylePresets("tax_invoice", currentCompany?.id);
    }
    init();
  }, [refreshStylePresets]);

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
      await refreshStylePresets(docType);
    },
    [companyId, refreshStylePresets]
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
      const sorted = [...layout.elements].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((el) => el.id === id);
      if (index === -1 || sorted[index].locked) return;

      const target = sorted[index];
      const nextList = [...sorted];
      nextList.splice(index, 1);

      if (direction === "top") nextList.push(target);
      else if (direction === "bottom") nextList.unshift(target);
      else if (direction === "up") nextList.splice(Math.min(nextList.length, index + 1), 0, target);
      else nextList.splice(Math.max(0, index - 1), 0, target);

      pushHistory({ ...layout, elements: normalizeLayerZIndexes(nextList) });
    },
    [layout, pushHistory]
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

  // ── Image Upload & Element Handlers ─────────────────────────────────────────
  const handleAddImage = useCallback(
    async (file: File) => {
      try {
        const { dataUrl, aspectRatio, fileName } = await processAndOptimizeImage(file);
        const newId = `img_${Date.now()}`;
        const initialW = 50;
        const initialH = Math.max(10, Math.min(150, Math.round((initialW / aspectRatio) * 10) / 10));

        const newElem: LayoutElement = {
          id: newId,
          type: "custom_image",
          label: fileName.replace(/\.[^/.]+$/, "").substring(0, 24) || "Custom Image",
          x: 20,
          y: 60,
          width: initialW,
          height: initialH,
          visible: true,
          locked: false,
          lockAspectRatio: true,
          zIndex: layout.elements.length + 10,
          imageSrc: dataUrl,
          imageFit: "contain",
          imageAspectRatio: aspectRatio,
          opacity: 1,
        };

        const updated = {
          ...layout,
          elements: [...layout.elements, newElem],
        };
        pushHistory(updated);
        setSelectedElementId(newId);
        setNotification({
          message: `Added image "${newElem.label}" to document.`,
          type: "success",
        });
        setTimeout(() => setNotification(null), 3000);
      } catch (err) {
        setNotification({
          message: err instanceof Error ? err.message : "Failed to load image file.",
          type: "error",
        });
        setTimeout(() => setNotification(null), 4000);
      }
    },
    [layout, pushHistory]
  );

  const handleReplaceImage = useCallback(
    async (elem: LayoutElement, file: File) => {
      try {
        const { dataUrl, aspectRatio } = await processAndOptimizeImage(file);
        const patch: Partial<LayoutElement> = {
          imageSrc: dataUrl,
          imageAspectRatio: aspectRatio,
        };
        if (elem.lockAspectRatio && aspectRatio > 0) {
          patch.height = Math.round((elem.width / aspectRatio) * 10) / 10;
        }
        handleUpdateElement(elem.id, patch, true);
        setNotification({
          message: `Replaced image for "${elem.label}".`,
          type: "success",
        });
        setTimeout(() => setNotification(null), 3000);
      } catch (err) {
        setNotification({
          message: err instanceof Error ? err.message : "Failed to replace image.",
          type: "error",
        });
        setTimeout(() => setNotification(null), 4000);
      }
    },
    [handleUpdateElement]
  );

  const handleDuplicateElement = useCallback(
    (elem: LayoutElement) => {
      const newId = `${elem.id}_copy_${Date.now().toString().slice(-4)}`;
      const newElem: LayoutElement = {
        ...JSON.parse(JSON.stringify(elem)),
        id: newId,
        label: `${elem.label} (Copy)`,
        x: Math.min(layout.page.widthMm - elem.width, elem.x + 5),
        y: Math.min(layout.page.heightMm - elem.height, elem.y + 5),
        zIndex: Math.max(...layout.elements.map((el) => el.zIndex), 0) + 1,
        locked: false,
      };

      const updated = {
        ...layout,
        elements: [...layout.elements, newElem],
      };
      pushHistory(updated);
      setSelectedElementId(newId);
      setNotification({
        message: `Duplicated "${elem.label}".`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 3000);
    },
    [layout, pushHistory]
  );

  // ── 9. Add / Delete Custom Elements ────────────────────────────────────────
  const handleAddCustomElement = useCallback(
    (type: "custom_text" | "divider") => {
      const newId = `custom_${type}_${Date.now()}`;
      const newElem: LayoutElement = {
        id: newId,
        type,
        label: type === "divider" ? "Divider" : "Custom Text Block",
        x: 20,
        y: 100,
        width: 80,
        height: type === "divider" ? 1 : 12,
        visible: true,
        locked: false,
        zIndex: layout.elements.length + 10,
        fontSize: 12,
        fontWeight: "normal",
        color: layout.branding.textColor,
        customText: type === "divider" ? undefined : "Double-click or edit in inspector",
        borderColor: type === "divider" ? layout.branding.borderColor : undefined,
        borderWidth: type === "divider" ? 1 : undefined,
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

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId) return;
    const elem = layout.elements.find((el) => el.id === selectedElementId);
    if (!elem || elem.locked) return;

    if (elem.type === "custom_text" || elem.type === "custom_image" || elem.type === "divider") {
      handleDeleteElement(elem.id);
      setNotification({
        message: `Deleted "${elem.label}".`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 2500);
    } else {
      // Standard template element: toggle visibility off (hide) so document structure remains intact
      handleToggleVisibility(elem.id);
      setNotification({
        message: `Hidden "${elem.label}" from document. Re-enable in left layers panel anytime.`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 3000);
    }
  }, [selectedElementId, layout.elements, handleDeleteElement, handleToggleVisibility]);

  const handleResetElement = useCallback(
    (id: string) => {
      const defaultLayout = createDefaultLayout(selectedDocType);
      const defEl = defaultLayout.elements.find((el) => el.id === id);
      if (!defEl) return;
      handleUpdateElement(id, { ...defEl }, true);
      setNotification({
        message: `Reset element "${defEl.label}" to UAE Corporate Professional default.`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 3000);
    },
    [selectedDocType, handleUpdateElement]
  );


  // ── 10. Save Layout ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setNotification(null);

    try {
      if (autoFixMode === "saved") {
        const preset = stylePresets.find((item) => item.id === selectedStylePresetId);
        if (!preset) throw new Error("Choose a saved style before saving its changes.");
        const updatedPreset = await documentStylePresets.update(companyId, selectedDocType, preset.id, preset.template_name, {
          ...layout,
          templateName: preset.template_name,
        });
        setSelectedStylePresetId(updatedPreset.id);
        await refreshStylePresets(selectedDocType);
        setNotification({ message: `Saved changes to “${preset.template_name}”.`, type: "success" });
      } else {
        const res = await saveDocumentLayout(companyId, selectedDocType, layout);
        setNotification({
          message: res.warning
            ? `Layout saved locally in browser. (${res.warning})`
            : `Layout for ${selectedDocType.replace("_", " ")} saved successfully to ${res.target === "database" ? "Supabase Database" : "Local Storage"}!`,
          type: res.success ? "success" : "error",
        });
      }
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Failed to save layout.", type: "error" });
    } finally {
      setSaving(false);
    }

    setTimeout(() => setNotification(null), 4000);
  }, [autoFixMode, companyId, layout, refreshStylePresets, selectedDocType, selectedStylePresetId, stylePresets]);

  const handleAutoFixAction = useCallback((action: AutoFixAction) => {
    if (action === "standard" || action === "saved") {
      setAutoFixMode(action);
      if (action === "saved" && !selectedStylePresetId) {
        setSelectedStylePresetId(stylePresets.find((preset) => preset.is_default)?.id || stylePresets[0]?.id || null);
      }
      return;
    }
    if (action === "create") setStyleSaveAsNew(true);
    setStyleModalMode(action === "create" ? "save" : "manage");
  }, [selectedStylePresetId, stylePresets]);

  const handleSaveMyStyle = useCallback(async (name: string) => {
    if (!companyId) {
      setNotification({ message: "A company account is required to save styles.", type: "error" });
      return;
    }
    setStyleModalBusy(true);
    try {
      const selectedPreset = autoFixMode === "saved" && !styleSaveAsNew
        ? stylePresets.find((preset) => preset.id === selectedStylePresetId)
        : undefined;
      const saved = selectedPreset
        ? await documentStylePresets.update(companyId, selectedDocType, selectedPreset.id, name, layout)
        : await documentStylePresets.save(companyId, selectedDocType, name, layout);
      setSelectedStylePresetId(saved.id);
      setAutoFixMode("saved");
      setStyleSaveAsNew(false);
      await refreshStylePresets(selectedDocType);
      setStyleModalMode(null);
      setNotification({ message: `Saved style “${saved.template_name}” for ${selectedDocType.replaceAll("_", " ")}.`, type: "success" });
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not save this style.", type: "error" });
    } finally {
      setStyleModalBusy(false);
    }
  }, [autoFixMode, companyId, layout, refreshStylePresets, selectedDocType, selectedStylePresetId, styleSaveAsNew, stylePresets]);

  const handleRenameStyle = useCallback(async (preset: DocumentStylePreset, name: string) => {
    if (!companyId) return;
    setStyleModalBusy(true);
    try {
      await documentStylePresets.rename(companyId, selectedDocType, preset.id, name);
      if (preset.id === selectedStylePresetId) {
        setLayout((current) => ({ ...current, templateName: name.trim() }));
      }
      await refreshStylePresets(selectedDocType);
      setNotification({ message: `Renamed style to “${name.trim()}”.`, type: "success" });
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not rename this style.", type: "error" });
    } finally {
      setStyleModalBusy(false);
    }
  }, [companyId, refreshStylePresets, selectedDocType, selectedStylePresetId]);

  const handleDuplicateStyle = useCallback(async (preset: DocumentStylePreset, name: string) => {
    if (!companyId) return;
    setStyleModalBusy(true);
    try {
      const copy = await documentStylePresets.duplicate(companyId, selectedDocType, preset, name);
      setSelectedStylePresetId(copy.id);
      await refreshStylePresets(selectedDocType);
      setNotification({ message: `Duplicated “${preset.template_name}” as “${copy.template_name}”.`, type: "success" });
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not duplicate this style.", type: "error" });
    } finally {
      setStyleModalBusy(false);
    }
  }, [companyId, refreshStylePresets, selectedDocType]);

  const handleDeleteStyle = useCallback(async (preset: DocumentStylePreset) => {
    if (!companyId || !window.confirm(`Delete saved style “${preset.template_name}”? This cannot be undone.`)) return;
    setStyleModalBusy(true);
    try {
      await documentStylePresets.delete(companyId, selectedDocType, preset);
      if (preset.id === selectedStylePresetId) setSelectedStylePresetId(null);
      await refreshStylePresets(selectedDocType);
      setNotification({ message: `Deleted style “${preset.template_name}”.`, type: "success" });
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not delete this style.", type: "error" });
    } finally {
      setStyleModalBusy(false);
    }
  }, [companyId, refreshStylePresets, selectedDocType, selectedStylePresetId]);

  const handleSetDefaultStyle = useCallback(async (preset: DocumentStylePreset) => {
    if (!companyId) return;
    setStyleModalBusy(true);
    try {
      await documentStylePresets.setDefault(companyId, selectedDocType, preset.id);
      setSelectedStylePresetId(preset.id);
      await refreshStylePresets(selectedDocType);
      setNotification({ message: `“${preset.template_name}” is now the default for this document type.`, type: "success" });
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not set the default style.", type: "error" });
    } finally {
      setStyleModalBusy(false);
    }
  }, [companyId, refreshStylePresets, selectedDocType]);

  const handleEditStyle = useCallback((preset: DocumentStylePreset) => {
    try {
      const editedLayout = documentStylePresets.apply(preset, selectedDocType);
      pushHistory(editedLayout);
      setSelectedStylePresetId(preset.id);
      setAutoFixMode("saved");
      setStyleModalMode(null);
      setSelectedElementId(null);
      setPageNumber(1);
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : "Could not load this style.", type: "error" });
    }
  }, [pushHistory, selectedDocType]);

  const handleAutoFix = useCallback(() => {
    let proposedLayout: DocumentLayout;
    let styleName: string | undefined;

    if (autoFixMode === "saved") {
      const preset = stylePresets.find((item) => item.id === selectedStylePresetId);
      if (!preset) {
        setNotification({ message: "Choose or create a saved style before using My Saved Style.", type: "error" });
        return;
      }
      try {
        proposedLayout = documentStylePresets.apply(preset, selectedDocType);
        styleName = preset.template_name;
      } catch (error) {
        setNotification({ message: error instanceof Error ? error.message : "Could not apply this saved style.", type: "error" });
        return;
      }
    } else {
      proposedLayout = JSON.parse(JSON.stringify(layout)) as DocumentLayout;
    }

    const sample = getSampleDocumentData(selectedDocType);
    const pagination = computePaginationPlan(proposedLayout, sample.items.length, sample.items);
    setAutoFixProposal({
      layout: proposedLayout,
      mode: autoFixMode,
      styleName,
      totalPages: pagination.totalPages,
      fitLevel: pagination.fitProfile?.level,
      warning: pagination.warning,
    });
    setShowAutoFixPreview(true);
  }, [autoFixMode, layout, selectedDocType, selectedStylePresetId, stylePresets]);

  const handleApplyAutoFix = useCallback(async () => {
    if (!autoFixProposal) return;
    const fixedLayout = autoFixProposal.layout;
    pushHistory(fixedLayout);
    setSelectedElementId(null);
    setPageNumber(1);
    setShowAutoFixPreview(false);
    let saveWarning: string | undefined;
    if (autoFixProposal.mode === "standard") {
      setSaving(true);
      const result = await saveDocumentLayout(companyId, selectedDocType, fixedLayout, fixedLayout.templateName);
      saveWarning = result.warning;
      setSaving(false);
    }
    setNotification({
      message: saveWarning
        ? `Layout applied. ${autoFixProposal.totalPages > 1 ? `Content will continue across ${autoFixProposal.totalPages} A4 pages. ` : ""}${saveWarning}`
        : autoFixProposal.mode === "saved"
        ? `“${autoFixProposal.styleName}” applied${autoFixProposal.totalPages > 1 ? ` across ${autoFixProposal.totalPages} A4 pages` : ""}. The saved preset was not changed; use Save to update it. No content was removed.`
        : `Layout applied and saved${autoFixProposal.totalPages > 1 ? ` across ${autoFixProposal.totalPages} A4 pages` : " for A4"}. No content was removed.`,
      type: "success",
    });
    setTimeout(() => setNotification(null), 5000);
    setAutoFixProposal(null);
  }, [autoFixProposal, companyId, pushHistory, selectedDocType]);

  // ── 11. Reset Layout to Default ────────────────────────────────────────────
  const handleConfirmReset = useCallback(async () => {
    const result = await resetDocumentLayout(companyId, selectedDocType);
    pushHistory(result.layout);
    setShowResetModal(false);
    setNotification({
      message: result.persistenceError
        ? `Reset locally, but database persistence failed: ${result.persistenceError}`
        : `Reset ${selectedDocType} to UAE Corporate Professional Default.`,
      type: result.persistenceError ? "error" : "success",
    });
    setTimeout(() => setNotification(null), 3500);
  }, [companyId, selectedDocType, pushHistory]);

  // ── 12. Zoom Fitting Actions ───────────────────────────────────────────────
  const handleFitWidth = useCallback(() => {
    if (canvasContainerRef.current) {
      const container = canvasContainerRef.current;
      const styles = window.getComputedStyle(container);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const containerW = Math.max(40, container.getBoundingClientRect().width - horizontalPadding - 16);
      const a4WidthPx = 210 * 3.779527559; // ~793.7px
      const calculatedZoom = Math.max(0.05, Math.min(2.0, containerW / a4WidthPx));
      setZoom(Math.round(calculatedZoom * 100) / 100);
    } else {
      setZoom(1.0);
    }
  }, []);

  const handleFitPage = useCallback(() => {
    if (canvasContainerRef.current) {
      const container = canvasContainerRef.current;
      const styles = window.getComputedStyle(container);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const bounds = container.getBoundingClientRect();
      const containerW = Math.max(40, bounds.width - horizontalPadding - 16);
      const containerH = Math.max(60, bounds.height - verticalPadding - 16);
      const a4WidthPx = 210 * 3.779527559;
      const a4HeightPx = 297 * 3.779527559; // ~1122.5px
      const zoomW = containerW / a4WidthPx;
      const zoomH = containerH / a4HeightPx;
      const calculatedZoom = Math.max(0.05, Math.min(2.0, Math.min(zoomW, zoomH) * 0.98));
      setZoom(Math.round(calculatedZoom * 100) / 100);
    } else {
      setZoom(0.75);
    }
  }, []);

  // Keep narrow workspaces usable. Actual canvas-size changes are handled by
  // the ResizeObserver below so browser zoom and toolbar wrapping cannot crop A4.
  useEffect(() => {
    const collapsePanelsForViewport = () => {
      if (window.innerWidth < 1280) {
        setLeftSidebarOpen(false);
        setRightInspectorOpen(false);
      }
    };
    collapsePanelsForViewport();
    const handleResize = () => {
      collapsePanelsForViewport();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let animationFrame = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    const refit = (entries?: ResizeObserverEntry[]) => {
      const entry = entries?.[0];
      const borderBox = entry?.borderBoxSize?.[0];
      const width = borderBox?.inlineSize ?? container.getBoundingClientRect().width;
      const height = borderBox?.blockSize ?? container.getBoundingClientRect().height;

      // Scrollbars can appear while manually zooming. They must not trigger an
      // automatic Fit Page and overwrite the user's chosen zoom level.
      if (Math.abs(width - lastWidth) < 0.5 && Math.abs(height - lastHeight) < 0.5) return;
      lastWidth = width;
      lastHeight = height;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(handleFitPage);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(container, { box: "border-box" });
    refit();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [handleFitPage, leftSidebarOpen, rightInspectorOpen]);

  // ── 13. Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if typing in an input or editable element
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedElementId(null);
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (isMod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (isMod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setShowPreviewModal(true);
        return;
      }

      if (selectedElementId) {
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
          e.preventDefault();
          handleDeleteSelected();
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
    handleDeleteSelected,
  ]);

  const selectedElement = layout.elements.find((el) => el.id === selectedElementId) || null;

  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-slate-950 font-sans">
      {/* Editor Chrome — hidden entirely during print */}
      <div className="designer-editor-chrome print-hide no-print flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
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
          onFitWidth={handleFitWidth}
          onFitPage={handleFitPage}
          snapGrid={snapGrid}
          onToggleSnapGrid={() => setSnapGrid(!snapGrid)}
          snapMargins={snapMargins}
          onToggleSnapMargins={() => setSnapMargins(!snapMargins)}
          onAlign={handleAlign}
          hasSelectedElement={Boolean(selectedElement && !selectedElement.locked)}
          selectedElementLabel={selectedElement?.label}
          onDeleteSelected={handleDeleteSelected}
          pageNumber={displayedPageNumber}
          totalPages={totalPages}
          onPageChange={setPageNumber}
          saving={saving}
          onSave={handleSave}
          onAutoFix={handleAutoFix}
          autoFixMode={autoFixMode}
          onAutoFixAction={handleAutoFixAction}
          stylePresets={stylePresets}
          selectedStylePresetId={selectedStylePresetId}
          onSelectStylePreset={setSelectedStylePresetId}
          onSaveMyStyle={() => {
            setStyleSaveAsNew(false);
            setStyleModalMode("save");
          }}
          onReset={() => setShowResetModal(true)}
          onPreview={() => setShowPreviewModal(true)}
          onCheckLayout={() => setShowValidatorModal(true)}
          onPrint={() => setShowPreviewModal(true)}
          onAddImage={handleAddImage}
          onAddText={() => handleAddCustomElement("custom_text")}
          onOpenApplyModal={() => handleOpenApplyModal(null)}
          onToggleLeftSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
          onToggleRightInspector={() => setRightInspectorOpen(!rightInspectorOpen)}
          leftSidebarOpen={leftSidebarOpen}
          rightInspectorOpen={rightInspectorOpen}
          templateName={layout.templateName}
        />

        {/* Main Workspace: Left Layers | Centered Canvas | Right Inspector */}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Left Sidebar: Document Layers */}
          {leftSidebarOpen && (
            <div className="absolute inset-y-0 left-0 z-40 xl:static xl:z-auto">
              <LeftSidebar
                elements={layout.elements}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onToggleVisibility={handleToggleVisibility}
                onToggleLock={handleToggleLock}
                onMoveLayer={handleMoveLayer}
                onAddCustomElement={handleAddCustomElement}
                onAddImage={handleAddImage}
              />
            </div>
          )}

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
            pageNumber={displayedPageNumber}
            containerRef={canvasContainerRef}
            onAddImage={handleAddImage}
          />

          {/* Right Sidebar: Selected Element Inspector / Page Settings */}
          {rightInspectorOpen && (
            <div className="absolute inset-y-0 right-0 z-40 xl:static xl:z-auto">
              <RightInspector
                layout={layout}
                selectedElement={selectedElement}
                onUpdateElement={handleUpdateElement}
                onUpdateLayoutBranding={handleUpdateLayoutBranding}
                onUpdatePageSettings={handleUpdatePageSettings}
                onDeleteElement={handleDeleteElement}
                onMoveLayer={handleMoveLayer}
                onResetElement={handleResetElement}
                onApplyElementToOthers={(elem) => handleOpenApplyModal(elem)}
                onDuplicateElement={handleDuplicateElement}
                onReplaceImage={handleReplaceImage}
              />
            </div>
          )}
        </div>
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

      {/* Apply to Other Documents Modal */}
      {showApplyModal && (
        <ApplyToOthersModal
          isOpen={showApplyModal}
          onClose={() => {
            setShowApplyModal(false);
            setApplyTargetElement(null);
          }}
          currentDocType={selectedDocType}
          currentLayout={layout}
          companyId={companyId}
          targetElement={applyTargetElement}
          onApplied={(count, message) => {
            setNotification({
              message: message || `Visual settings successfully applied to ${count} document${count === 1 ? "" : "s"}.`,
              type: "success",
            });
            setTimeout(() => setNotification(null), 4000);
          }}
        />
      )}

      {/* Dedicated A4 Print Preview Modal */}
      {showPreviewModal && (
        <DocumentPreviewModal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            if (showProposalPreview) {
              setShowProposalPreview(false);
              setShowAutoFixPreview(true);
            }
          }}
          layout={showProposalPreview && autoFixProposal ? autoFixProposal.layout : layout}
          company={company}
          docTitle={showProposalPreview ? `Proposed ${DOCUMENT_TYPE_OPTIONS.find((d) => d.id === selectedDocType)?.label || "Document"}` : DOCUMENT_TYPE_OPTIONS.find((d) => d.id === selectedDocType)?.label || "Document"}
          totalPages={totalPages}
        />
      )}

      {/* Layout Health & Flow Validator Modal */}
      {showValidatorModal && (
        <LayoutValidatorModal
          isOpen={showValidatorModal}
          onClose={() => setShowValidatorModal(false)}
          layout={layout}
          onSelectElement={(elId) => {
            setSelectedElementId(elId);
            setShowValidatorModal(false);
          }}
          onApplyLayoutFix={(fixedLayout) => {
            pushHistory(fixedLayout);
            setNotification({
              message: "Dynamic follower spacing aligned cleanly.",
              type: "success",
            });
            setTimeout(() => setNotification(null), 3500);
          }}
        />
      )}

      <AutoFixPreviewModal
        isOpen={showAutoFixPreview && Boolean(autoFixProposal)}
        mode={autoFixProposal?.mode || "standard"}
        styleName={autoFixProposal?.styleName}
        totalPages={autoFixProposal?.totalPages || 1}
        fitLevel={autoFixProposal?.fitLevel}
        warning={autoFixProposal?.warning}
        onClose={() => {
          setShowAutoFixPreview(false);
          setAutoFixProposal(null);
        }}
        onPreview={() => {
          setShowAutoFixPreview(false);
          setShowProposalPreview(true);
          setShowPreviewModal(true);
        }}
        onApply={handleApplyAutoFix}
      />

      <StylePresetsModal
        key={`${styleModalMode || "closed"}-${styleModalMode === "save" && styleSaveAsNew ? "new" : selectedStylePresetId || "none"}`}
        mode={styleModalMode || "manage"}
        isOpen={Boolean(styleModalMode)}
        documentType={selectedDocType}
        presets={stylePresets}
        activePresetId={styleModalMode === "save" && styleSaveAsNew ? null : selectedStylePresetId}
        busy={styleModalBusy}
        onClose={() => setStyleModalMode(null)}
        onSave={(name) => {
          setStyleSaveAsNew(false);
          void handleSaveMyStyle(name);
        }}
        onRename={handleRenameStyle}
        onDuplicate={handleDuplicateStyle}
        onDelete={handleDeleteStyle}
        onSetDefault={handleSetDefaultStyle}
        onEdit={handleEditStyle}
      />
    </div>
  );
}
