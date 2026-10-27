"use client";
/* eslint-disable react-hooks/refs */

import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Edit3,
} from "lucide-react";
import {
  DocumentLayout,
  LayoutElement,
  getBorderAsLayoutElement,
  normalizePageBorders,
} from "@/lib/documentDesigner";
import { applyFitBoxWithCollisionClearance } from "@/lib/documentLayoutEngine";
import DynamicDocumentRenderer, { getSampleDocumentData } from "../documents/DynamicDocumentRenderer";
import { CompanyDocInfo } from "../documents/DocHeader";

interface DocumentCanvasProps {
  layout: DocumentLayout;
  company: CompanyDocInfo | null;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<LayoutElement>, commitHistory?: boolean) => void;
  onUpdateLayout?: (layout: DocumentLayout) => void;
  onDuplicateElement?: (elem: LayoutElement) => void;
  onDeleteSelected?: () => void;
  zoom: number;
  snapGrid: boolean;
  snapMargins: boolean;
  pageNumber: number;
  totalPages?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onAddImage?: (file: File) => void;
  onZoomChange?: (zoom: number) => void;
  onFitWidth?: () => void;
  onFitPage?: () => void;
  onPageChange?: (page: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export default function DocumentCanvas({
  layout,
  company,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onUpdateLayout,
  onDuplicateElement,
  onDeleteSelected,
  zoom,
  snapGrid,
  snapMargins,
  pageNumber,
  totalPages,
  containerRef,
  onAddImage,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onPageChange,
  isFullscreen,
  onToggleFullscreen,
}: DocumentCanvasProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const effectiveContainerRef = containerRef || internalContainerRef;

  const latestLayout = useLatest(layout);
  const latestSnapGrid = useLatest(snapGrid);
  const latestSnapMargins = useLatest(snapMargins);
  const latestOnUpdateElement = useLatest(onUpdateElement);
  const latestOnSelectElement = useLatest(onSelectElement);

  // Guide lines for snap feedback
  const [guideLines, setGuideLines] = useState<{ x?: number; y?: number }>({});

  // Direct in-place WYSIWYG text editing state
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const originalTextRef = useRef<string>("");
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus and select text when inline editor opens
  useEffect(() => {
    if (editingElementId && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingElementId]);

  // Shared geometry system: real-time rendered content dimensions from the DOM
  const [renderedDimensions, setRenderedDimensions] = useState<
    Record<string, { widthMm: number; heightMm: number; hasOverflow: boolean }>
  >({});

  // Hierarchical totals row inline editing
  const [editingTotalsRowKey, setEditingTotalsRowKey] = useState<
    "subtotal" | "vat" | "grandTotal" | "balanceDue" | null
  >(null);
  const [editingTotalsText, setEditingTotalsText] = useState("");
  const originalTotalsTextRef = useRef("");

  useEffect(() => {
    if (!pageRef.current) return;
    const pageNode = pageRef.current;
    const pxPerMm = 3.7795296;

    const measureElements = () => {
      const nextDims: Record<string, { widthMm: number; heightMm: number; hasOverflow: boolean }> = {};

      layout.elements.forEach((elem) => {
        const domEl = pageNode.querySelector(`[data-element-id="${elem.id}"]`) as HTMLElement | null;
        if (!domEl) return;
        const contentEl = (domEl.firstElementChild as HTMLElement) || domEl;

        const cs = window.getComputedStyle(contentEl);
        const padBottom = parseFloat(cs.paddingBottom) || 0;
        const borderTop = parseFloat(cs.borderTopWidth) || 0;
        const borderBottom = parseFloat(cs.borderBottomWidth) || 0;

        let maxChildBottom = 0;
        const children = Array.from(contentEl.children) as HTMLElement[];
        for (const child of children) {
          const bottom = child.offsetTop + child.offsetHeight;
          if (bottom > maxChildBottom) maxChildBottom = bottom;
        }

        const scrollBasedH = contentEl.scrollHeight + padBottom + borderTop + borderBottom;
        const childBasedH = maxChildBottom > 0 ? (maxChildBottom + padBottom + borderBottom) : 0;
        const contentHPx = Math.max(scrollBasedH, childBasedH, contentEl.offsetHeight, domEl.scrollHeight);
        const contentWPx = Math.max(contentEl.scrollWidth, contentEl.offsetWidth, domEl.scrollWidth);

        const renderedHMm = contentHPx > 0 ? Math.round((contentHPx / pxPerMm) * 10) / 10 : elem.height;
        const renderedWMm = contentWPx > 0 ? Math.round((contentWPx / pxPerMm) * 10) / 10 : elem.width;

        const hasOverflow = renderedHMm > elem.height + 0.8 || renderedWMm > elem.width + 0.8;

        nextDims[elem.id] = {
          widthMm: renderedWMm,
          heightMm: renderedHMm,
          hasOverflow,
        };
      });

      setRenderedDimensions((prev) => {
        const isDiff = layout.elements.some((el) => {
          const p = prev[el.id];
          const n = nextDims[el.id];
          if (!p && !n) return false;
          if (!p || !n) return true;
          return (
            Math.abs(p.widthMm - n.widthMm) > 0.3 ||
            Math.abs(p.heightMm - n.heightMm) > 0.3 ||
            p.hasOverflow !== n.hasOverflow
          );
        });
        return isDiff ? nextDims : prev;
      });
    };

    measureElements();
    const ro = new ResizeObserver(measureElements);
    ro.observe(pageNode);
    return () => ro.disconnect();
  }, [layout, zoom, company, pageNumber]);

  const handleFitBoxToContent = useCallback(
    (elem: LayoutElement) => {
      const dim = renderedDimensions[elem.id];
      if (!dim) return;
      if (onUpdateLayout) {
        const nextLayout = applyFitBoxWithCollisionClearance(latestLayout.current, elem.id, {
          widthMm: Math.max(elem.width, dim.widthMm),
          heightMm: Math.max(elem.height, dim.heightMm),
        });
        onUpdateLayout(nextLayout);
      } else {
        latestOnUpdateElement.current(
          elem.id,
          {
            width: Math.max(elem.width, dim.widthMm),
            height: Math.max(elem.height, dim.heightMm),
          },
          true
        );
      }
    },
    [renderedDimensions, onUpdateLayout, latestOnUpdateElement, latestLayout]
  );

  const startInlineTotalsEditing = useCallback(
    (elem: LayoutElement, rowKey: "subtotal" | "vat" | "grandTotal" | "balanceDue") => {
      if (elem.locked) return;
      const current =
        rowKey === "subtotal"
          ? elem.totalsLabels?.subtotal || "Subtotal"
          : rowKey === "vat"
          ? elem.totalsLabels?.vat || "VAT Total (5%)"
          : rowKey === "grandTotal"
          ? elem.totalsLabels?.grandTotal || "Grand Total"
          : elem.totalsLabels?.balanceDue || "Balance Due";
      originalTotalsTextRef.current = current;
      setEditingElementId(elem.id);
      setEditingTotalsRowKey(rowKey);
      setEditingTotalsText(current);
    },
    []
  );

  const commitInlineTotalsEditing = useCallback(
    (elemId: string, rowKey: "subtotal" | "vat" | "grandTotal" | "balanceDue", val: string) => {
      const curLayout = latestLayout.current;
      const el = curLayout.elements.find((x) => x.id === elemId);
      if (el) {
        latestOnUpdateElement.current(
          elemId,
          {
            totalsLabels: {
              ...el.totalsLabels,
              [rowKey]: val.trim() || undefined,
            },
          },
          true
        );
      }
      setEditingElementId(null);
      setEditingTotalsRowKey(null);
    },
    [latestOnUpdateElement]
  );

  const cancelInlineTotalsEditing = useCallback(() => {
    setEditingElementId(null);
    setEditingTotalsRowKey(null);
  }, []);

  // Drag state stored in ref for 60fps interaction without React render bottlenecks
  const dragRef = useRef<{
    mode: "move" | "resize";
    elementId: string;
    handle?: ResizeHandle;
    grabOffsetX: number;
    grabOffsetY: number;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    aspectRatio: number;
    lockAspectRatio: boolean;
    changed: boolean;
  } | null>(null);

  // Start inline editing on canvas
  const startInlineEditing = useCallback(
    (elem: LayoutElement) => {
      if (elem.locked) return;
      if (elem.type === "logo" || elem.type === "custom_image" || elem.type === "divider") {
        return;
      }
      let currentText = elem.customText ?? "";
      if (currentText === "") {
        if (elem.type === "company_name_en") {
          currentText = company?.legal_name || company?.name || "AL SAFWAH AL QABDHA TENTS IND L.L.C SP";
        } else if (elem.type === "company_name_ar") {
          currentText = company?.arabic_name || "شركة الصفوة القبضة لصناعة الخيام ذ.م.م ش.ش.و";
        } else if (elem.type === "company_address") {
          currentText = company?.address || "Office 101, Sharjah, UAE";
        } else if (elem.type === "company_trn") {
          currentText = `TRN: ${company?.trn || "100345678900003"}`;
        } else if (elem.type === "doc_title") {
          currentText = layout.documentTitle || "TAX INVOICE";
        } else if (elem.type === "payment_terms") {
          currentText = "Payment within 30 days of invoice date.";
        } else if (elem.type === "customer_info") {
          currentText = "CUSTOMER DETAILS:\nM/S BIN HAM TENTS & SHADES L.L.C\nTRN: 100234567800003\nDubai Industrial City, Phase 2, Dubai, UAE";
        } else if (elem.type === "bank_details") {
          currentText = "BANK TRANSFER DETAILS:\nBank: Abu Dhabi Islamic Bank (ADIB)\nAccount Name: AL SAFWAH AL QABDHA TENTS IND L.L.C SP\nIBAN: AE120340001234567890123\nSWIFT: ADIBEAA";
        } else if (elem.type === "footer") {
          currentText = "Thank you for your business! | AL SAFWAH AL QABDHA TENTS IND L.L.C SP | P.O. Box 12345, Sharjah, UAE";
        } else if (elem.type === "doc_meta") {
          currentText = "Invoice No: INV-2026-0042\nDate: 2026-10-20\nDue Date: 2026-11-19";
        } else if (elem.type === "amount_in_words") {
          currentText = "Total Amount in Words: Twelve Thousand Six Hundred UAE Dirhams Only";
        } else if (elem.type === "company_stamp") {
          currentText = "OFFICIAL COMPANY STAMP";
        } else if (elem.type === "company_signature") {
          currentText = "Authorized Signatory";
        } else if (elem.type === "custom_text") {
          currentText = "Custom Text Block";
        }
      }

      originalTextRef.current = currentText;
      setEditingElementId(elem.id);
      setEditingText(currentText);
    },
    [company, layout.documentTitle]
  );

  // Commit and finish inline editing
  const commitInlineEditing = useCallback(
    (elemId: string, value: string) => {
      latestOnUpdateElement.current(elemId, { customText: value }, true);
      setEditingElementId(null);
    },
    [latestOnUpdateElement]
  );

  // Cancel inline editing and restore original text
  const cancelInlineEditing = useCallback(
    (elemId: string) => {
      latestOnUpdateElement.current(elemId, { customText: originalTextRef.current || undefined }, false);
      setEditingElementId(null);
    },
    [latestOnUpdateElement]
  );

  // ── Element MouseDown → Select & Start Drag ─────────────────────────────────
  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, elem: LayoutElement) => {
      if (e.button !== 0) return;
      if (editingElementId === elem.id) return;
      e.stopPropagation();
      latestOnSelectElement.current(elem.id);
      if (elem.locked) return;
      e.preventDefault();

      if (!pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const currentPxPerMm = rect.width / latestLayout.current.page.widthMm;

      // Mouse position in mm relative to top-left of the A4 page
      const mouseXmm = (e.clientX - rect.left) / currentPxPerMm;
      const mouseYmm = (e.clientY - rect.top) / currentPxPerMm;

      dragRef.current = {
        mode: "move",
        elementId: elem.id,
        grabOffsetX: mouseXmm - elem.x,
        grabOffsetY: mouseYmm - elem.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: elem.x,
        initialY: elem.y,
        initialW: elem.width,
        initialH: elem.height,
        aspectRatio: elem.imageAspectRatio || elem.width / Math.max(1, elem.height),
        lockAspectRatio: Boolean(elem.lockAspectRatio),
        changed: false,
      };
    },
    [latestOnSelectElement, latestLayout, editingElementId]
  );

  // ── Resize Handle MouseDown ──────────────────────────────────────────────────
  const handleResizeHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle, elem: LayoutElement) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      if (elem.locked) return;

      dragRef.current = {
        mode: "resize",
        elementId: elem.id,
        handle,
        grabOffsetX: 0,
        grabOffsetY: 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: elem.x,
        initialY: elem.y,
        initialW: elem.width,
        initialH: elem.height,
        aspectRatio: elem.imageAspectRatio || elem.width / Math.max(1, elem.height),
        lockAspectRatio: Boolean(elem.lockAspectRatio),
        changed: false,
      };
    },
    []
  );

  // ── Window-Level Drag & Resize Listener ──────────────────────────────────────
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || !pageRef.current) return;

      const curLayout = latestLayout.current;
      const rect = pageRef.current.getBoundingClientRect();
      const currentPxPerMm = rect.width / curLayout.page.widthMm;
      const isManual = (curLayout.layoutMode || "manual") === "manual";

      if (drag.mode === "move") {
        const mouseXmm = (e.clientX - rect.left) / currentPxPerMm;
        const mouseYmm = (e.clientY - rect.top) / currentPxPerMm;

        let newX = mouseXmm - drag.grabOffsetX;
        let newY = mouseYmm - drag.grabOffsetY;

        const guides: { x?: number; y?: number } = {};

        if (latestSnapGrid.current) {
          newX = Math.round(newX / 5) * 5;
          newY = Math.round(newY / 5) * 5;
        }

        if (latestSnapMargins.current) {
          const lm = curLayout.page.margins.left;
          const rm = curLayout.page.widthMm - curLayout.page.margins.right - drag.initialW;
          const tm = curLayout.page.margins.top;
          const bm = curLayout.page.heightMm - curLayout.page.margins.bottom - drag.initialH;
          const cx = (curLayout.page.widthMm - drag.initialW) / 2;
          const SNAP = 3;

          if (Math.abs(newX - lm) < SNAP) { newX = lm; guides.x = lm; }
          else if (Math.abs(newX - rm) < SNAP) { newX = rm; guides.x = rm + drag.initialW; }
          else if (Math.abs(newX - cx) < SNAP) { newX = cx; guides.x = curLayout.page.widthMm / 2; }

          if (Math.abs(newY - tm) < SNAP) { newY = tm; guides.y = tm; }
          else if (Math.abs(newY - bm) < SNAP) { newY = bm; guides.y = bm + drag.initialH; }
        }

        // In manual mode, allow coordinates to freely extend beyond A4 bounds (shows overflow indicator)
        if (!isManual) {
          newX = Math.max(0, Math.min(curLayout.page.widthMm - drag.initialW, newX));
          newY = Math.max(0, Math.min(curLayout.page.heightMm - drag.initialH, newY));
        } else {
          newX = Math.round(newX * 10) / 10;
          newY = Math.round(newY * 10) / 10;
        }

        if (Math.abs(newX - drag.initialX) > 0.01 || Math.abs(newY - drag.initialY) > 0.01) {
          drag.changed = true;
        }
        setGuideLines(guides);
        latestOnUpdateElement.current(drag.elementId, { x: newX, y: newY }, false);
      } else if (drag.mode === "resize" && drag.handle) {
        const deltaXmm = (e.clientX - drag.startClientX) / currentPxPerMm;
        const deltaYmm = (e.clientY - drag.startClientY) / currentPxPerMm;
        const h = drag.handle;

        let newX = drag.initialX;
        let newY = drag.initialY;
        let newW = drag.initialW;
        let newH = drag.initialH;

        const isBorderDrag = drag.elementId.startsWith("border_");
        const MIN_W = isBorderDrag ? 0.5 : 5;
        const MIN_H = isBorderDrag ? 0.5 : 5;
        const lockAspect = drag.lockAspectRatio || e.shiftKey;

        if (h === "e") {
          newW = Math.max(MIN_W, drag.initialW + deltaXmm);
          if (!isManual) newW = Math.min(curLayout.page.widthMm - newX, newW);
        } else if (h === "w") {
          const maxDelta = drag.initialW - MIN_W;
          const effDelta = Math.min(maxDelta, deltaXmm);
          newX = isManual ? drag.initialX + effDelta : Math.max(0, drag.initialX + effDelta);
          newW = drag.initialW + (drag.initialX - newX);
        } else if (h === "s") {
          newH = Math.max(MIN_H, drag.initialH + deltaYmm);
          if (!isManual) newH = Math.min(curLayout.page.heightMm - newY, newH);
        } else if (h === "n") {
          const maxDelta = drag.initialH - MIN_H;
          const effDelta = Math.min(maxDelta, deltaYmm);
          newY = isManual ? drag.initialY + effDelta : Math.max(0, drag.initialY + effDelta);
          newH = drag.initialH + (drag.initialY - newY);
        } else {
          // Corner handles: se, sw, ne, nw
          if (h === "se") {
            newW = Math.max(MIN_W, drag.initialW + deltaXmm);
            newH = Math.max(MIN_H, drag.initialH + deltaYmm);
            if (lockAspect && drag.aspectRatio) {
              newH = newW / drag.aspectRatio;
            }
          } else if (h === "sw") {
            const effDeltaX = Math.min(drag.initialW - MIN_W, deltaXmm);
            newX = isManual ? drag.initialX + effDeltaX : Math.max(0, drag.initialX + effDeltaX);
            newW = drag.initialW + (drag.initialX - newX);
            newH = Math.max(MIN_H, drag.initialH + deltaYmm);
            if (lockAspect && drag.aspectRatio) {
              newH = newW / drag.aspectRatio;
            }
          } else if (h === "ne") {
            newW = Math.max(MIN_W, drag.initialW + deltaXmm);
            const effDeltaY = Math.min(drag.initialH - MIN_H, deltaYmm);
            newY = isManual ? drag.initialY + effDeltaY : Math.max(0, drag.initialY + effDeltaY);
            newH = drag.initialH + (drag.initialY - newY);
            if (lockAspect && drag.aspectRatio) {
              const targetH = newW / drag.aspectRatio;
              newY = drag.initialY + (drag.initialH - targetH);
              newH = targetH;
            }
          } else if (h === "nw") {
            const effDeltaX = Math.min(drag.initialW - MIN_W, deltaXmm);
            newX = isManual ? drag.initialX + effDeltaX : Math.max(0, drag.initialX + effDeltaX);
            newW = drag.initialW + (drag.initialX - newX);

            const effDeltaY = Math.min(drag.initialH - MIN_H, deltaYmm);
            newY = isManual ? drag.initialY + effDeltaY : Math.max(0, drag.initialY + effDeltaY);
            newH = drag.initialH + (drag.initialY - newY);

            if (lockAspect && drag.aspectRatio) {
              const targetH = newW / drag.aspectRatio;
              newY = drag.initialY + (drag.initialH - targetH);
              newH = targetH;
            }
          }

          if (!isManual) {
            if (newX < 0) { newW += newX; newX = 0; }
            if (newY < 0) { newH += newY; newY = 0; }
            newW = Math.max(MIN_W, Math.min(curLayout.page.widthMm - newX, newW));
            newH = Math.max(MIN_H, Math.min(curLayout.page.heightMm - newY, newH));
          } else {
            newW = Math.max(MIN_W, Math.round(newW * 10) / 10);
            newH = Math.max(MIN_H, Math.round(newH * 10) / 10);
            newX = Math.round(newX * 10) / 10;
            newY = Math.round(newY * 10) / 10;
          }
        }

        if (
          Math.abs(newX - drag.initialX) > 0.01 ||
          Math.abs(newY - drag.initialY) > 0.01 ||
          Math.abs(newW - drag.initialW) > 0.01 ||
          Math.abs(newH - drag.initialH) > 0.01
        ) {
          drag.changed = true;
        }
        latestOnUpdateElement.current(drag.elementId, { x: newX, y: newY, width: newW, height: newH }, false);
      }
    }

    function handleMouseUp() {
      const drag = dragRef.current;
      if (drag?.changed) {
        latestOnUpdateElement.current(drag.elementId, {}, true);
      }
      dragRef.current = null;
      setGuideLines({});
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [latestLayout, latestOnUpdateElement, latestSnapGrid, latestSnapMargins]);

  // ── Keyboard Navigation (Arrow Keys, Nudge, Duplicate, Delete, Esc) ────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (editingElementId) return; // Typing inside inline editor
      const target = e.target as HTMLElement | null;
      const targetTag = target?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select" || target?.isContentEditable) {
        return;
      }

      const selId = selectedElementId;
      if (!selId) return;
      const elem = latestLayout.current.elements.find((el) => el.id === selId);
      if (!elem) return;

      const nudge = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!elem.locked) latestOnUpdateElement.current(selId, { x: Math.round((elem.x - nudge) * 10) / 10 }, true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!elem.locked) latestOnUpdateElement.current(selId, { x: Math.round((elem.x + nudge) * 10) / 10 }, true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!elem.locked) latestOnUpdateElement.current(selId, { y: Math.round((elem.y - nudge) * 10) / 10 }, true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!elem.locked) latestOnUpdateElement.current(selId, { y: Math.round((elem.y + nudge) * 10) / 10 }, true);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (!elem.locked && onDeleteSelected) {
          onDeleteSelected();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (onDuplicateElement) {
          onDuplicateElement(elem);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        latestOnSelectElement.current(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        startInlineEditing(elem);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedElementId,
    editingElementId,
    latestLayout,
    latestOnUpdateElement,
    latestOnSelectElement,
    onDeleteSelected,
    onDuplicateElement,
    startInlineEditing,
  ]);

  return (
    <div
      ref={effectiveContainerRef}
      tabIndex={0}
      aria-label="A4 canvas, scroll to pan the page"
      onClick={() => {
        if (!editingElementId) onSelectElement(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/") && onAddImage) {
          onAddImage(file);
        }
      }}
      className="designer-scrollbar designer-canvas-scroll relative flex min-h-0 min-w-0 flex-1 select-none items-start justify-start overflow-auto overscroll-contain bg-slate-100 p-6 sm:p-8 md:p-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-500/60"
      style={{
        backgroundImage: "radial-gradient(circle at center, rgba(148,163,184,0.3) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Zoom container matching visual dimensions for reliable flex centering */}
      <div
        style={{
          width: `${layout.page.widthMm * zoom * 3.7795296}px`,
          height: `${layout.page.heightMm * zoom * 3.7795296}px`,
          flexShrink: 0,
          position: "relative",
          margin: "0 auto",
        }}
      >
        {/* The true A4 Document Sheet (210mm x 297mm) */}
        <div
          ref={pageRef}
          className="erp-document-surface absolute top-0 left-0 origin-top-left bg-white shadow-2xl rounded-sm border border-slate-300/80"
          style={{
            width: `${layout.page.widthMm}mm`,
            height: `${layout.page.heightMm}mm`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* Printable Margin Guidelines */}
          <div
            className="absolute border border-dashed border-slate-300/70 pointer-events-none z-10"
            style={{
              top: `${layout.page.margins.top}mm`,
              left: `${layout.page.margins.left}mm`,
              width: `${Math.max(10, layout.page.widthMm - layout.page.margins.left - layout.page.margins.right)}mm`,
              height: `${Math.max(10, layout.page.heightMm - layout.page.margins.top - layout.page.margins.bottom)}mm`,
            }}
          />

          {/* Margin Guides */}
          {snapMargins && (
            <div
              className="absolute border border-dashed border-indigo-400/40 pointer-events-none z-10"
              style={{
                top: `${layout.page.margins?.top ?? 10}mm`,
                left: `${layout.page.margins?.left ?? 10}mm`,
                width: `${layout.page.widthMm - (layout.page.margins?.left ?? 10) - (layout.page.margins?.right ?? 10)}mm`,
                height: `${layout.page.heightMm - (layout.page.margins?.top ?? 10) - (layout.page.margins?.bottom ?? 10)}mm`,
              }}
              title="Content Margins (Printable Area)"
            />
          )}

          {/* Snap Guide Lines */}
          {guideLines.x !== undefined && (
            <div
              className="absolute top-0 bottom-0 border-l border-cyan-400 z-50 pointer-events-none"
              style={{ left: `${guideLines.x}mm` }}
            />
          )}
          {guideLines.y !== undefined && (
            <div
              className="absolute left-0 right-0 border-t border-cyan-400 z-50 pointer-events-none"
              style={{ top: `${guideLines.y}mm` }}
            />
          )}

          {/* The Live Document Renderer — visual source of truth */}
          <DynamicDocumentRenderer
            layout={layout}
            company={company}
            data={getSampleDocumentData(layout.documentType, layout.numberingConfig)}
            isDesignerPreview={true}
            scale={1}
            pageNumber={pageNumber}
          />

          {/* Interactive Element Overlay */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            {(() => {
              const borders = normalizePageBorders(layout.page?.borders);
              const selectableBorders: LayoutElement[] = [
                borders.top.enabled ? getBorderAsLayoutElement("border_top", layout) : null,
                borders.bottom.enabled ? getBorderAsLayoutElement("border_bottom", layout) : null,
                borders.left.enabled ? getBorderAsLayoutElement("border_left", layout) : null,
                borders.right.enabled ? getBorderAsLayoutElement("border_right", layout) : null,
              ].filter(Boolean) as LayoutElement[];

              const allElements = [
                ...layout.elements
                  .filter((el) => {
                    if (!el.visible) return false;
                    if (el.pageNumber !== undefined && el.pageNumber !== pageNumber) return false;
                    return true;
                  })
                  .sort((a, b) => a.zIndex - b.zIndex),
                ...selectableBorders,
              ];

              return allElements.map((elem) => {
                const isBorder = elem.id.startsWith("border_");
                const isSelected = selectedElementId === elem.id;
                const isEditing = editingElementId === elem.id;

                const dim = renderedDimensions[elem.id];
                const isManual = (layout.layoutMode || "manual") === "manual";

                // Accurate rendered content box dimensions so the selection box completely covers
                // the visible element (including Subtotal, VAT, Grand Total, Balance Due, padding and borders)
                const boxWidth = isBorder
                  ? (elem.id === "border_left" || elem.id === "border_right" ? Math.max(elem.width, 4) : elem.width)
                  : isManual
                  ? (dim ? Math.max(elem.width, dim.widthMm) : elem.width)
                  : Math.max(elem.width, (elem as unknown as { effectiveWidth?: number }).effectiveWidth ?? elem.width);
                const boxHeight = isBorder
                  ? (elem.id === "border_top" || elem.id === "border_bottom" ? Math.max(elem.height, 4) : elem.height)
                  : isManual
                  ? (dim ? Math.max(elem.height, dim.heightMm) : elem.height)
                  : Math.max(elem.height, (elem as unknown as { effectiveHeight?: number }).effectiveHeight ?? elem.height);

                // Overflow boundary calculation
                const isOverflowX = elem.x < 0 || elem.x + elem.width > layout.page.widthMm;
                const isOverflowY = elem.y < 0 || elem.y + elem.height > layout.page.heightMm;
                const hasContentOverflow = Boolean(dim?.hasOverflow);
                const isOverflow = !isBorder && (isOverflowX || isOverflowY || hasContentOverflow);

                const isNearTop = elem.y < 12;
                const isNearBottom = elem.y + boxHeight > layout.page.heightMm - 14;

                return (
                  <div
                    key={elem.id}
                    onMouseDown={(e) => handleElementMouseDown(e, elem)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      latestOnSelectElement.current(elem.id);
                      if (elem.type !== "totals" && !isBorder) {
                        startInlineEditing(elem);
                      }
                    }}
                    className={`absolute pointer-events-auto transition-shadow ${
                      isSelected
                        ? elem.locked
                          ? "ring-2 ring-amber-400 ring-offset-1 cursor-default shadow-sm"
                          : isOverflow
                          ? "ring-2 ring-amber-500 ring-offset-1 cursor-move shadow-md"
                          : "ring-2 ring-blue-600 ring-offset-1 cursor-move shadow-md"
                        : elem.locked
                        ? "cursor-default hover:ring-1 hover:ring-amber-300/60"
                        : "hover:ring-1 hover:ring-blue-400/80 cursor-pointer"
                    }`}
                    style={{
                      left: `${elem.x}mm`,
                      top: `${isManual ? elem.y : Math.max(elem.y, (elem as unknown as { effectiveY?: number }).effectiveY ?? elem.y)}mm`,
                      width: `${boxWidth}mm`,
                      height: `${boxHeight}mm`,
                      zIndex: isSelected ? Math.max(elem.zIndex, 40) : elem.zIndex,
                    }}
                  >
                    {/* Composite totals card child row inline editing */}
                    {elem.type === "totals" && isSelected && !isEditing && (
                      <div className="absolute inset-0 flex flex-col pointer-events-none z-30">
                        {(["subtotal", "vat", "grandTotal", "balanceDue"] as const).map((rowKey) => {
                          const isEditingRow = editingTotalsRowKey === rowKey && editingElementId === elem.id;
                          return (
                            <div
                              key={rowKey}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startInlineTotalsEditing(elem, rowKey);
                              }}
                              className="flex-1 w-full pointer-events-auto hover:bg-blue-500/10 cursor-text transition group relative"
                              title={`Double-click to edit ${rowKey} label directly`}
                            >
                              {isEditingRow && (
                                <div
                                  className="absolute inset-0 bg-white/95 border-2 border-amber-500 rounded p-0.5 z-50 flex items-center shadow-lg"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editingTotalsText}
                                    onChange={(e) => setEditingTotalsText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        commitInlineTotalsEditing(elem.id, rowKey, editingTotalsText);
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        cancelInlineTotalsEditing();
                                      }
                                    }}
                                    onBlur={() => commitInlineTotalsEditing(elem.id, rowKey, editingTotalsText)}
                                    className="w-full text-xs font-bold text-slate-900 bg-transparent outline-none px-1"
                                    placeholder="Edit label..."
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Inline WYSIWYG Editor on Double-Click */}
                    {isEditing ? (
                      <div
                        className="absolute inset-0 z-50 p-1 bg-white/95 rounded shadow-2xl border-2 border-amber-500 flex flex-col pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <textarea
                          ref={inlineInputRef}
                          autoFocus
                          value={editingText}
                          onChange={(e) => {
                            setEditingText(e.target.value);
                            latestOnUpdateElement.current(elem.id, { customText: e.target.value }, false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && elem.height < 18) {
                              e.preventDefault();
                              commitInlineEditing(elem.id, editingText);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelInlineEditing(elem.id);
                            }
                          }}
                          onBlur={() => {
                            commitInlineEditing(elem.id, editingText);
                          }}
                          className="w-full h-full p-1 bg-transparent text-slate-900 resize-none focus:outline-none"
                          style={{
                            fontSize: elem.fontSize ? `${elem.fontSize * 1.333}px` : "12px",
                            fontFamily: elem.fontFamily || "inherit",
                            textAlign: elem.textAlign || (elem.type === "company_name_ar" ? "right" : "left"),
                            direction: elem.type === "company_name_ar" ? "rtl" : "ltr",
                            lineHeight: elem.lineHeight || 1.3,
                            fontWeight: elem.fontWeight === "bold" ? 700 : elem.fontWeight === "semibold" ? 600 : 400,
                            color: elem.color || "#0F172A",
                          }}
                          placeholder="Type text directly..."
                        />
                        <div className="absolute -bottom-6 left-0 bg-slate-900 text-[10px] text-amber-300 px-2 py-0.5 rounded shadow whitespace-nowrap pointer-events-none flex items-center gap-1.5 z-50">
                          <span>Enter / Blur: Save</span>
                          <span>•</span>
                          <span>Esc: Cancel</span>
                        </div>
                      </div>
                    ) : null}

                    {/* Badge tag on selected element with position, dimensions and overflow warning */}
                    {isSelected && !isEditing && (
                      <div
                        className={`absolute text-white text-[9px] px-2 py-0.5 rounded font-mono font-medium shadow select-none flex items-center gap-1.5 whitespace-nowrap z-50 pointer-events-auto ${
                          isNearTop ? "top-full mt-1.5 left-0" : "-top-7 left-0"
                        } ${
                          elem.locked ? "bg-amber-600" : isOverflow ? "bg-rose-600" : "bg-blue-600"
                        }`}
                      >
                        <span>{elem.label}</span>
                        <span className="opacity-90">
                          {Math.round(elem.x * 10) / 10}×{Math.round(elem.y * 10) / 10} mm ({Math.round(elem.width * 10) / 10}×{Math.round(elem.height * 10) / 10})
                        </span>
                        {elem.locked && <span className="text-amber-200 font-bold">🔒 LOCKED</span>}
                        {isOverflow && (
                          <span className="bg-rose-800 text-rose-100 font-bold px-1 rounded text-[8px]">
                            ⚠️ OVERFLOW
                          </span>
                        )}

                        {/* Quick inline edit trigger button */}
                        {!elem.locked && elem.type !== "logo" && elem.type !== "custom_image" && !isBorder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineEditing(elem);
                            }}
                            className="ml-1 hover:text-amber-200 cursor-pointer"
                            title="Edit text inline (or double-click element)"
                          >
                            <Edit3 size={10} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Floating Fit Box to Content action when element has visible overflow */}
                    {isSelected && !isEditing && hasContentOverflow && !isBorder && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFitBoxToContent(elem);
                        }}
                        className={`absolute bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow cursor-pointer flex items-center gap-1 z-50 transition pointer-events-auto select-none ${
                          isNearBottom ? "-top-7 right-0" : "-bottom-7 right-0"
                        }`}
                        title="Expand element box to fit all rendered content"
                      >
                        <Maximize2 size={10} />
                        <span>Fit Box to Content</span>
                      </button>
                    )}

                    {/* 8 resize handles — ONLY for selected, UNLOCKED elements */}
                    {isSelected && !elem.locked && !isEditing && (
                      <>
                        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
                          <div
                            key={handle}
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, handle, elem)}
                            className={`absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-sm z-50 shadow-md ${
                              handle === "nw" ? "-top-1.5 -left-1.5 cursor-nwse-resize"
                              : handle === "n"  ? "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"
                              : handle === "ne" ? "-top-1.5 -right-1.5 cursor-nesw-resize"
                              : handle === "e"  ? "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize"
                              : handle === "se" ? "-bottom-1.5 -right-1.5 cursor-nwse-resize"
                              : handle === "s"  ? "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize"
                              : handle === "sw" ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                              :                   "top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize"
                            }`}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Floating Bottom Canvas Controls */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-3.5 py-1.5 rounded-full shadow-2xl text-white select-none">
        {/* Zoom Out */}
        {onZoomChange && (
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.1, Number((zoom - 0.1).toFixed(2))))}
            className="p-1 hover:bg-slate-800 rounded-full transition cursor-pointer text-slate-300 hover:text-white"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
        )}

        {/* Zoom % */}
        <span
          onClick={() => onZoomChange && onZoomChange(1.0)}
          className="px-2 py-0.5 text-xs font-mono font-bold text-slate-200 hover:text-amber-400 cursor-pointer transition"
          title="Click to reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </span>

        {/* Zoom In */}
        {onZoomChange && (
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(1.8, Number((zoom + 0.1).toFixed(2))))}
            className="p-1 hover:bg-slate-800 rounded-full transition cursor-pointer text-slate-300 hover:text-white"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
        )}

        <span className="w-px h-3.5 bg-slate-700 mx-1" />

        {/* Fit Width */}
        {onFitWidth && (
          <button
            type="button"
            onClick={onFitWidth}
            className="px-2.5 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white rounded-full transition cursor-pointer"
            title="Fit Canvas to Available Width"
          >
            Fit Width
          </button>
        )}

        {/* Fit Page */}
        {onFitPage && (
          <button
            type="button"
            onClick={onFitPage}
            className="px-2.5 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white rounded-full transition cursor-pointer"
            title="Fit Full A4 Page in Window"
          >
            Fit Page
          </button>
        )}

        {/* Distraction-Free Fullscreen */}
        {onToggleFullscreen && (
          <>
            <span className="w-px h-3.5 bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`p-1 rounded-full transition cursor-pointer ${
                isFullscreen
                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </>
        )}

        {/* Multi-page controls */}
        {totalPages && totalPages > 1 && onPageChange && (
          <>
            <span className="w-px h-3.5 bg-slate-700 mx-1" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
                disabled={pageNumber <= 1}
                className="p-1 hover:bg-slate-800 rounded transition disabled:opacity-30 cursor-pointer"
                title="Previous Page"
                aria-label="Previous Page"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[11px] font-mono text-slate-300 px-1">
                {pageNumber} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, pageNumber + 1))}
                disabled={pageNumber >= totalPages}
                className="p-1 hover:bg-slate-800 rounded transition disabled:opacity-30 cursor-pointer"
                title="Next Page"
                aria-label="Next Page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
