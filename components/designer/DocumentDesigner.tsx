"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentCompany, getCachedCompanySync } from "@/lib/helpers";
import {
  DocumentLayout,
  DocumentTypeId,
  LayoutElement,
  loadDocumentLayout,
  saveDocumentLayout,
  documentCloud,
  createDefaultLayout,
  applyVisualSettingsToLayout,
  VISUAL_SCOPE_DEFINITIONS,
  normalizeLayerZIndexes,
  normalizeLayout,
  getLocalStorageKey,
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
import {
  getFallbackDocumentStylePreset,
  resolveDocumentStylePreset,
  type DocumentStylePreset,
} from "@/lib/documentStylePresetModel";
import type { AutoFixAction } from "./TopToolbar";
import AutoFixPreviewModal from "./AutoFixPreviewModal";
import StylePresetsModal from "./StylePresetsModal";
import { getBrandConfig } from '@/lib/brandConfig';
import { cloudError, revisionOf, type CloudRevision } from '@/lib/documentCloud';
import { exportDesignBackup, preserveDesignDraft } from '@/lib/documentDesignBackup';

function getInitialLayout(docType: DocumentTypeId): DocumentLayout {
  if (typeof window !== "undefined") {
    try {
      const targetCompId = getCachedCompanySync()?.id;
      if (targetCompId) {
        const cacheKey = getLocalStorageKey(targetCompId, docType);
        const fallbackKey = 'dubai-erp.design-cache.' + targetCompId + '.' + docType;
        for (const key of [cacheKey, fallbackKey]) {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const cached = JSON.parse(raw) as DocumentLayout;
            if (cached.documentType === docType && Array.isArray(cached.elements)) {
              return normalizeLayout(cached);
            }
          }
        }
      }
    } catch {}
  }
  return createDefaultLayout(docType);
}

export default function DocumentDesigner() {
  const [selectedDocType, setSelectedDocType] = useState<DocumentTypeId>("tax_invoice");
  const [layout, setLayout] = useState<DocumentLayout>(() => getInitialLayout("tax_invoice"));
  const [company, setCompany] = useState<CompanyDocInfo | null>(() => getCachedCompanySync() as CompanyDocInfo | null);
  const [companyId, setCompanyId] = useState<string | null | undefined>(() => getCachedCompanySync()?.id ?? undefined);
  const [stylePresets, setStylePresets] = useState<DocumentStylePreset[]>([]);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string | null>(null);
  const [autoFixMode, setAutoFixMode] = useState<"standard" | "saved">("standard");

  const [cloudRevision, setCloudRevision] = useState<CloudRevision>();
  const [editingRevision, setEditingRevision] = useState<CloudRevision>();
  const [persistedLayout, setPersistedLayout] = useState<DocumentLayout | null>(null);
  const [baseline, setBaseline] = useState('');
  const [cloudErrorMessage, setCloudErrorMessage] = useState<string | null>(null);
  const [cloudConflict, setCloudConflict] = useState(false);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string>();
  const [hydratedScope, setHydratedScope] = useState('');
  const [reloadCounter, setReloadCounter] = useState(0);
  const loadingCloud = hydratedScope !== `${companyId}:${selectedDocType}:${reloadCounter}`;
  const mutationRef = useRef(false);
  const dirty = Boolean(baseline && (JSON.stringify(layout) !== baseline || selectedStylePresetId !== (cloudRevision?.templateId || null)));

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
  const documentLoadRequestRef = useRef(0);
  // Stable ref to the latest handleFitWidth so effects can call it without deps.
  const handleFitWidthRef = useRef<(() => void) | null>(null);

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

  const refreshStylePresets = useCallback(async (
    docType: DocumentTypeId,
    id: string | null | undefined,
    preferredPresetId?: string | null
  ) => {
    if (!id) {
      setStylePresets([]);
      setSelectedStylePresetId(null);
      return [];
    }
    try {
      const loaded = await documentStylePresets.listAll(id);
      setStylePresets(loaded);
      setSelectedStylePresetId((current) => {
        const candidateId = preferredPresetId === undefined ? current : preferredPresetId;
        const selected = resolveDocumentStylePreset(loaded, candidateId)
          || getFallbackDocumentStylePreset(loaded, docType);
        return selected?.id || null;
      });
      return loaded;
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : "Could not load saved styles.",
        type: "error",
      });
      return [];
    }
  }, []);

  const applyStylePreset = useCallback((
    preset: DocumentStylePreset,
    targetLayout: DocumentLayout,
    targetDocumentType: DocumentTypeId
  ): DocumentLayout => {
    if (preset.layout_json.documentType !== preset.document_type) {
      throw new Error("This saved style contains an invalid document type.");
    }
    if (preset.document_type === targetDocumentType) {
      return documentStylePresets.apply(preset, targetDocumentType);
    }
    return {
      ...applyVisualSettingsToLayout(preset.layout_json, targetLayout, {
        scopes: VISUAL_SCOPE_DEFINITIONS.map((scope) => scope.key),
      }),
      documentType: targetDocumentType,
      templateName: preset.template_name,
    };
  }, []);

  // ── 1. Load Company Profile Once ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const currentCompany = await getCurrentCompany();
      if (cancelled) return;
      if (currentCompany) {
        setCompany(currentCompany as CompanyDocInfo);
        setCompanyId(currentCompany.id);
      } else {
        setCompanyId(null);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate the selected document only after company resolution. A request token
  // prevents a slower previous document load from overwriting a newer selection.
  // Phase 1: paint the cached layout instantly so the canvas is never blank.
  // Phase 2: update with the authoritative cloud version once Supabase responds.
  useEffect(() => {
    if (companyId === undefined) return;
    const requestId = ++documentLoadRequestRef.current;
    let cancelled = false;

    // Instant paint from localStorage so the canvas is visible while Supabase loads.
    if (companyId) {
      try {
        const cacheKey = getLocalStorageKey(companyId, selectedDocType);
        const fallbackKey = 'dubai-erp.design-cache.' + companyId + '.' + selectedDocType;
        for (const key of [cacheKey, fallbackKey]) {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
          if (raw) {
            const cached = JSON.parse(raw) as DocumentLayout;
            if (cached.documentType === selectedDocType && Array.isArray(cached.elements)) {
              const fastLayout = normalizeLayout(cached);
              queueMicrotask(() => {
                if (!cancelled && requestId === documentLoadRequestRef.current) {
                  setLayout(fastLayout);
                  const snap = JSON.parse(JSON.stringify(fastLayout));
                  historyRef.current = [snap];
                  historyIndexRef.current = 0;
                  setHistory([snap]);
                  setHistoryIndex(0);
                  setSelectedElementId(null);
                  setPageNumber(1);
                  window.requestAnimationFrame(() => handleFitWidthRef.current?.());
                }
              });
              break;
            }
          }
        }
      } catch { /* ignore cache errors */ }
    }

    async function hydrateDocument() {
      try {
        const layoutPromise = loadDocumentLayout(companyId, selectedDocType);
        const presetsPromise = companyId
          ? documentStylePresets.listAll(companyId)
              .then((presets) => ({ presets, error: null as Error | null }))
              .catch((error: unknown) => ({
                presets: [] as DocumentStylePreset[],
                error: error instanceof Error ? error : new Error("Could not load saved styles."),
              }))
          : Promise.resolve({ presets: [] as DocumentStylePreset[], error: null as Error | null });
        const [loaded, presetResult] = await Promise.all([layoutPromise, presetsPromise]);
        if (cancelled || requestId !== documentLoadRequestRef.current) return;

        const hydratedLayout = loaded.layout;
        const activePreset = resolveDocumentStylePreset(presetResult.presets, loaded.revision?.templateId);
        const selectedPreset = activePreset;
        setCloudRevision(loaded.revision);
        setEditingRevision(loaded.revision);
        setCloudErrorMessage(loaded.error || presetResult.error?.message || null);
        setCloudConflict(false);
        setCloudUpdatedAt(loaded.updatedAt);
        setPersistedLayout(loaded.source === 'database' ? loaded.layout : null);
        setBaseline(JSON.stringify(loaded.layout));
        setHydratedScope(`${companyId}:${selectedDocType}:${reloadCounter}`);
        const snapshot = JSON.parse(JSON.stringify(hydratedLayout));
        setStylePresets(presetResult.presets);
        setSelectedStylePresetId(selectedPreset?.id || null);
        setAutoFixMode(activePreset ? "saved" : "standard");
        setLayout(hydratedLayout);
        historyRef.current = [snapshot];
        historyIndexRef.current = 0;
        setHistory([snapshot]);
        setHistoryIndex(0);
        setSelectedElementId(null);
        setPageNumber(1);
        // Always fit layout width after cloud layout is committed.
        window.requestAnimationFrame(() => handleFitWidthRef.current?.());

        if (presetResult.error) {
          setNotification({ message: presetResult.error.message, type: "error" });
        }
      } catch (err) {
        if (!cancelled && requestId === documentLoadRequestRef.current) {
          setCloudErrorMessage(err instanceof Error ? err.message : "Failed to load cloud design.");
          setHydratedScope(`${companyId}:${selectedDocType}:${reloadCounter}`);
        }
      }
    }

    void hydrateDocument();
    return () => {
      cancelled = true;
    };
  }, [applyStylePreset, companyId, selectedDocType, reloadCounter]);

  // ── 2. Switch Document Type ────────────────────────────────────────────────
  const handleSelectDocType = useCallback((docType: DocumentTypeId) => {
    if (mutationRef.current || loadingCloud) return;
    if (dirty && !window.confirm('You have unsaved changes. Keep a browser draft and switch documents?')) return;
    if (dirty) preserveDesignDraft(companyId, selectedDocType, layout);
    setSelectedDocType(docType);
    setSelectedElementId(null);
  }, [companyId,dirty,layout,loadingCloud,selectedDocType]);

  useEffect(() => {
    if (!loadingCloud && dirty) preserveDesignDraft(companyId, selectedDocType, layout);
  }, [companyId, selectedDocType, layout, dirty, loadingCloud]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn);
  }, [dirty, saving]);
  useEffect(() => {
    if (!companyId || !cloudRevision || loadingCloud) return;
    let cancelled = false;
    const check = async () => {
      if (document.hidden || mutationRef.current) return;
      try {
        const current = revisionOf(await documentCloud.load(companyId, selectedDocType));
        if (cancelled || mutationRef.current) return;
        if (JSON.stringify(current) !== JSON.stringify(cloudRevision)) {
          if (!dirty) setReloadCounter(value => value + 1);
          else { setCloudConflict(true); setCloudErrorMessage('A newer cloud design is available. Your draft is preserved. Export it, then reload cloud to resolve the conflict.'); }
        }
      } catch (error) { if (!cancelled) setCloudErrorMessage(cloudError(error).message); }
    };
    window.addEventListener('focus',check); window.addEventListener('online',check);
    const timer = window.setInterval(check,30000);
    return () => { cancelled=true; clearInterval(timer); window.removeEventListener('focus',check); window.removeEventListener('online',check); };
  }, [companyId, selectedDocType, cloudRevision, dirty, loadingCloud]);

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


  // One cloud transaction saves the selected preset and makes it active for every device.
  const saveCurrentDesign = useCallback(async (name?: string, asNew = false) => {
    if (mutationRef.current || loadingCloud) return;
    if (!companyId || !cloudRevision || cloudConflict) {
      setCloudErrorMessage('Reload cloud successfully before saving. Export your draft first if there is a conflict.'); return;
    }
    mutationRef.current = true; setSaving(true);
    const scope = documentLoadRequestRef.current;
    const token = asNew ? { ...cloudRevision, templateId:null, version:0 }
      : { ...(editingRevision || cloudRevision), selectionVersion:cloudRevision.selectionVersion };
    const assets=getBrandConfig(company).assets;
    const byType: Record<string,string | undefined> = { logo:assets.logo, company_signature:assets.signature,
      company_stamp:assets.stamp, building_image:assets.building,watermark:assets.watermark || assets.background };
    const snapshot = { ...layout, templateName:(name || layout.templateName).trim(),
      elements:layout.elements.map(element => byType[element.type] && !element.imageSrc ? {...element,imageSrc:byType[element.type]} : element) };
    try {
      const result = await saveDocumentLayout(companyId,selectedDocType,snapshot,token);
      if (scope !== documentLoadRequestRef.current) return;
      if (!result.success) { setCloudConflict(Boolean(result.conflict)); throw new Error(result.error); }
      setCloudRevision(result.revision); setEditingRevision(result.revision); setCloudUpdatedAt(result.updatedAt);
      setPersistedLayout(snapshot); setBaseline(JSON.stringify(snapshot)); setLayout(snapshot);
      setCloudErrorMessage(null); setCloudConflict(false);
      setSelectedStylePresetId(result.revision?.templateId || null); setAutoFixMode('saved');
      await refreshStylePresets(selectedDocType,companyId,result.revision?.templateId);
      setStyleModalMode(null); setStyleSaveAsNew(false);
      setNotification({message:'Design and selected style saved to Supabase for all devices.',type:'success'});
    } catch(error) { setCloudErrorMessage(cloudError(error).message); }
    finally { mutationRef.current=false; setSaving(false); }
  }, [cloudRevision,editingRevision,cloudConflict,company,companyId,layout,loadingCloud,refreshStylePresets,selectedDocType]);
  const handleSave = useCallback(() => saveCurrentDesign(), [saveCurrentDesign]);
  const handleSaveMyStyle = useCallback((name: string) => saveCurrentDesign(name,styleSaveAsNew), [saveCurrentDesign,styleSaveAsNew]);
  const handleAutoFixAction = useCallback((action: AutoFixAction) => {
    if(action === 'standard' || action === 'saved') { setAutoFixMode(action); return; }
    if(action === 'create') setStyleSaveAsNew(true);
    setStyleModalMode(action === 'create' ? 'save' : 'manage');
  }, []);
  const handleEditStyle = useCallback((preset: DocumentStylePreset) => {
    if (dirty && !window.confirm('Keep your current draft and load this style for editing?')) return;
    if (dirty) preserveDesignDraft(companyId,selectedDocType,layout);
    pushHistory(applyStylePreset(preset,layout,selectedDocType));
    setSelectedStylePresetId(preset.id); setAutoFixMode('saved'); setStyleModalMode(null);
    setEditingRevision({ templateId:preset.document_type===selectedDocType?preset.id:null,version:preset.document_type===selectedDocType?preset.version:0,selectionVersion:cloudRevision?.selectionVersion || 0 });
    setNotification({message:'Style loaded for editing. Save to cloud to use it on all devices and PDFs.',type:'success'});
  }, [applyStylePreset,cloudRevision,companyId,dirty,layout,pushHistory,selectedDocType]);
  const handleSelectStylePreset = useCallback((id: string) => {
    const preset=stylePresets.find(item=>item.id===id); if(preset)handleEditStyle(preset);
  }, [handleEditStyle,stylePresets]);
  const runStyleMutation = useCallback(async (action: () => Promise<unknown>) => {
    if(mutationRef.current)return;
    mutationRef.current=true; setStyleModalBusy(true);
    try { await action(); await refreshStylePresets(selectedDocType,companyId,selectedStylePresetId); }
    catch(error) { const failure=cloudError(error); setCloudErrorMessage(failure.message); setCloudConflict(failure.code==='CONFLICT'); }
    finally {mutationRef.current=false;setStyleModalBusy(false);}
  }, [companyId,refreshStylePresets,selectedDocType,selectedStylePresetId]);
  const handleRenameStyle = useCallback((preset: DocumentStylePreset,name: string) => runStyleMutation(async () => {
    if(!companyId)return;
    if(dirty) throw new Error('Save or export your draft before renaming a style.');
    await documentStylePresets.rename(companyId,preset,name);
    // Do not advance the editor's revision without also reloading the matching design.
    if(preset.id===cloudRevision?.templateId) setReloadCounter(value=>value+1);
  }), [cloudRevision,companyId,dirty,runStyleMutation]);
  const handleDuplicateStyle = useCallback((preset: DocumentStylePreset,name: string) => runStyleMutation(async () => {
    if(companyId)await documentStylePresets.duplicate(companyId,preset.document_type,preset,name);
  }), [companyId,runStyleMutation]);
  const handleDeleteStyle = useCallback((preset: DocumentStylePreset) => {
    if(!companyId || !window.confirm('Delete this saved style? Export a backup first if you need to keep it.')) return;
    return runStyleMutation(()=>documentStylePresets.delete(companyId,preset.document_type,preset));
  }, [companyId,runStyleMutation]);
  const handleSetDefaultStyle = useCallback((preset: DocumentStylePreset) => runStyleMutation(async () => {
    if(!companyId || !cloudRevision || preset.document_type!==selectedDocType) throw new Error('Open this document type before selecting its cloud design.');
    if(dirty) throw new Error('Save or export and reload your current draft before changing the cloud selection.');
    await documentCloud.mutate(companyId,preset,'select',cloudRevision.selectionVersion);
    setReloadCounter(value=>value+1);
  }), [companyId,cloudRevision,dirty,runStyleMutation,selectedDocType]);
  const handleAutoFix = useCallback(async () => {
    if(!companyId || !cloudRevision || !persistedLayout || dirty) {
      setNotification({message:'Save the selected design to cloud before using Auto Fix.',type:'error'});return;
    }
    try {
      const current=await documentCloud.load(companyId,selectedDocType);
      if(JSON.stringify(revisionOf(current))!==JSON.stringify(cloudRevision)) throw cloudError({code:'40001'});
      // Ensure custom borders and page background are strictly preserved:
      const savedBorders = current.template?.layout_json?.page?.borders || persistedLayout.page?.borders || layout.page?.borders;
      const savedBackground = current.template?.layout_json?.page?.background || persistedLayout.page?.background || layout.page?.background;
      const proposedLayout: DocumentLayout = {
        ...persistedLayout,
        page: {
          ...persistedLayout.page,
          ...(savedBorders ? { borders: JSON.parse(JSON.stringify(savedBorders)) } : {}),
          background: savedBackground || "#FFFFFF",
        },
      };
      const sample=getSampleDocumentData(selectedDocType);
      const pagination=computePaginationPlan(proposedLayout,sample.items.length,sample.items);
      setAutoFixProposal({layout:proposedLayout,mode:'saved',styleName:current.template!.template_name,totalPages:pagination.totalPages,fitLevel:pagination.fitProfile?.level,warning:pagination.warning});
      setShowAutoFixPreview(true);
    } catch(error) { const failure=cloudError(error); setCloudErrorMessage(failure.message);setCloudConflict(failure.code==='CONFLICT'); }
  }, [companyId,cloudRevision,dirty,persistedLayout,selectedDocType,layout.page]);
  const handleApplyAutoFix = useCallback(() => {
    if(!autoFixProposal)return;
    const bordersToKeep = autoFixProposal.layout.page?.borders || persistedLayout?.page?.borders || layout.page.borders;
    const finalLayout: DocumentLayout = {
      ...autoFixProposal.layout,
      page: {
        ...autoFixProposal.layout.page,
        ...(bordersToKeep ? { borders: JSON.parse(JSON.stringify(bordersToKeep)) } : {}),
      },
    };
    pushHistory(finalLayout);
    setShowAutoFixPreview(false);
    setAutoFixProposal(null);
    setNotification({message:'Applied Auto Fix while strictly preserving your saved border & background design.',type:'success'});
  }, [autoFixProposal,persistedLayout?.page?.borders,layout.page.borders,pushHistory]);
  const handleConfirmReset = useCallback(() => {
    preserveDesignDraft(companyId,selectedDocType,layout);
    pushHistory(createDefaultLayout(selectedDocType));setShowResetModal(false);
    setNotification({message:'Default loaded as an unsaved draft. Save as a new style to preserve your current cloud design.',type:'success'});
  }, [companyId,layout,pushHistory,selectedDocType]);
  const recoverBrowserDraft = useCallback(() => {
    if(loadingCloud || !companyId || mutationRef.current)return;
    try {
      const raw=localStorage.getItem('dubai-erp.design-draft.'+companyId+'.'+selectedDocType)
        || localStorage.getItem('dubai-erp.doc-layout.'+companyId+'.'+selectedDocType);
      if(!raw)throw new Error('No browser-only style was found for this company and document type. Export a backup from the laptop/browser where it was edited.');
      const recovered=JSON.parse(raw) as DocumentLayout;
      if(recovered.documentType!==selectedDocType || !Array.isArray(recovered.elements))throw new Error('This browser draft is not a valid design for the selected document.');
      exportDesignBackup(layout,stylePresets);
      pushHistory({...recovered,templateName:('Recovered '+recovered.templateName).slice(0,80)});
      setSelectedStylePresetId(null);
      setEditingRevision({...cloudRevision!,templateId:null,version:0});
      setStyleSaveAsNew(true);setStyleModalMode('save');
    }catch(error){setNotification({message:cloudError(error).message,type:'error'});}
  }, [loadingCloud,companyId,selectedDocType,layout,stylePresets,pushHistory,cloudRevision]);
  const openSavedPreview = useCallback(async () => {
    if(loadingCloud || !companyId || !persistedLayout || !cloudRevision) { setCloudErrorMessage('Save a cloud design before PDF preview or export.');return; }
    try {
      const current=await documentCloud.load(companyId,selectedDocType);
      if(JSON.stringify(revisionOf(current))!==JSON.stringify(cloudRevision)) throw cloudError({code:'40001'});
      setShowPreviewModal(true);
    } catch(error) { const failure=cloudError(error);setCloudErrorMessage(failure.message);setCloudConflict(failure.code==='CONFLICT'); }
  }, [companyId,persistedLayout,cloudRevision,selectedDocType,loadingCloud]);

  // ── 12. Zoom Fitting Actions ───────────────────────────────────────────────
  const handleFitWidth = useCallback(() => {
    if (canvasContainerRef.current) {
      const container = canvasContainerRef.current;
      const styles = window.getComputedStyle(container);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const containerW = Math.max(1, container.clientWidth - horizontalPadding - 36);
      const a4WidthPx = 210 * 3.779527559; // ~793.7px
      const calculatedZoom = Math.max(0.3, Math.min(2.0, containerW / a4WidthPx));
      setZoom(Math.floor(calculatedZoom * 100) / 100);
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
      const containerW = Math.max(1, container.clientWidth - horizontalPadding);
      const containerH = Math.max(1, container.clientHeight - verticalPadding);
      const a4WidthPx = 210 * 3.779527559;
      const a4HeightPx = 297 * 3.779527559; // ~1122.5px
      const zoomW = containerW / a4WidthPx;
      const zoomH = containerH / a4HeightPx;
      const calculatedZoom = Math.max(0.05, Math.min(2.0, Math.min(zoomW, zoomH) * 0.98));
      setZoom(Math.floor(calculatedZoom * 1000) / 1000);
    } else {
      setZoom(0.75);
    }
  }, []);
  // Keep the ref pointing at the latest fit-width callback.
  useEffect(() => {
    handleFitWidthRef.current = handleFitWidth;
  }, [handleFitWidth]);

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
      // automatic Fit and overwrite the user's chosen zoom level.
      if (Math.abs(width - lastWidth) < 0.5 && Math.abs(height - lastHeight) < 0.5) return;
      lastWidth = width;
      lastHeight = height;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(handleFitWidth);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(container, { box: "border-box" });
    refit();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [handleFitWidth, leftSidebarOpen, rightInspectorOpen]);

  // ── 13. Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (loadingCloud || mutationRef.current) return;
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
    loadingCloud,
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
    <div className="pdf-designer-shell flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-slate-950 font-sans">
      {/* Editor Chrome — hidden entirely during print */}
      <div className="designer-editor-chrome print-hide no-print flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 bg-slate-900 px-4 py-2 text-sm text-slate-100" role="status" aria-live="polite">
          <span>{loadingCloud ? 'Loading cloud design…' : saving ? 'Saving to cloud…' : cloudConflict ? 'Cloud conflict — draft preserved' : cloudErrorMessage ? 'Cloud error — not synced' : dirty || !persistedLayout ? 'Unsaved changes — save to cloud' : 'Saved to cloud · version ' + cloudRevision?.version}</span>
          {cloudUpdatedAt && <span className="text-xs text-slate-400">{new Date(cloudUpdatedAt).toLocaleString()}</span>}
          {cloudErrorMessage && <span className="text-amber-300">{cloudErrorMessage}</span>}
          <button disabled={saving || styleModalBusy} onClick={() => {
            if(dirty) { exportDesignBackup(layout,stylePresets); }
            setReloadCounter(value=>value+1);
          }} className="underline">Reload cloud{dirty ? ' (exports draft)' : ''}</button>
          <button onClick={() => exportDesignBackup(layout,stylePresets)} className="underline">Export backup</button>
          <button disabled={loadingCloud || saving || styleModalBusy} onClick={recoverBrowserDraft} className="underline">Recover browser draft</button>
          <span className="text-xs text-slate-400">PDF preview/export uses the saved cloud design.</span>
        </div>
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
          saving={saving || loadingCloud || styleModalBusy}
          onSave={handleSave}
          onAutoFix={handleAutoFix}
          autoFixMode={autoFixMode}
          onAutoFixAction={handleAutoFixAction}
          stylePresets={stylePresets}
          selectedStylePresetId={selectedStylePresetId}
          onSelectStylePreset={handleSelectStylePreset}
          onSaveMyStyle={() => {
            setStyleSaveAsNew(false);
            setStyleModalMode("save");
          }}
          onReset={() => setShowResetModal(true)}
          onPreview={openSavedPreview}
          onCheckLayout={() => setShowValidatorModal(true)}
          onPrint={openSavedPreview}
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
        <div inert={saving || loadingCloud || styleModalBusy} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
          layout={showProposalPreview && autoFixProposal ? autoFixProposal.layout : persistedLayout || layout}
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
        activePresetId={styleModalMode === "save" && (
          styleSaveAsNew
          || stylePresets.find((preset) => preset.id === selectedStylePresetId)?.document_type !== selectedDocType
        ) ? null : selectedStylePresetId}
        initialName={styleModalMode === "save"
          ? stylePresets.find((preset) => preset.id === selectedStylePresetId)?.template_name
          : undefined}
        busy={styleModalBusy || saving || loadingCloud}
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
