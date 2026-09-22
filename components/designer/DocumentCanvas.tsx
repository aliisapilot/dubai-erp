"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { DocumentLayout, LayoutElement } from "@/lib/documentDesigner";
import DynamicDocumentRenderer, { SAMPLE_DOCUMENT_DATA } from "../documents/DynamicDocumentRenderer";
import { CompanyDocInfo } from "../documents/DocHeader";

interface DocumentCanvasProps {
  layout: DocumentLayout;
  company: CompanyDocInfo | null;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<LayoutElement>, commitHistory?: boolean) => void;
  zoom: number;
  snapGrid: boolean;
  snapMargins: boolean;
  pageNumber: number;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// Keep a stable ref to the latest value of any prop/state without triggering effect re-runs.
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export default function DocumentCanvas({
  layout,
  company,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  zoom,
  snapGrid,
  snapMargins,
  pageNumber,
}: DocumentCanvasProps) {
  // The actual A4 page DOM node — used for getBoundingClientRect-based coordinate conversion.
  const pageRef = useRef<HTMLDivElement>(null);

  // Keep latest versions of all props/state that the drag handlers need,
  // without adding them to the effect deps array (prevents listener teardown per frame).
  const latestLayout = useLatest(layout);
  const latestZoom = useLatest(zoom);
  const latestSnapGrid = useLatest(snapGrid);
  const latestSnapMargins = useLatest(snapMargins);
  const latestOnUpdateElement = useLatest(onUpdateElement);
  const latestOnSelectElement = useLatest(onSelectElement);

  // Guide lines for snap feedback
  const [guideLines, setGuideLines] = useState<{ x?: number; y?: number }>({});

  // Drag state lives in a ref (not React state) so mutations never trigger re-renders mid-drag.
  const dragRef = useRef<{
    mode: "move" | "resize";
    elementId: string;
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    aspectRatio: number;
    // pixels-per-mm of the rendered A4 sheet at current zoom, captured at drag start
    pxPerMm: number;
  } | null>(null);

  /**
   * Convert screen delta (px) → document delta (mm)
   * using the ACTUAL rendered size of the A4 page element.
   * This accounts for CSS transform scale, scroll, device pixel ratio, etc.
   */
  function computePxPerMm(): number {
    if (!pageRef.current) {
      // Fallback: 1mm ≈ 3.7795px × zoom
      return 3.7795296 * latestZoom.current;
    }
    const rect = pageRef.current.getBoundingClientRect();
    // widthMm of the A4 page vs its rendered pixel width
    return rect.width / latestLayout.current.page.widthMm;
  }

  // ── Element MouseDown → start drag ──────────────────────────────────────────
  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, elem: LayoutElement) => {
      latestOnSelectElement.current(elem.id);
      if (elem.locked) return;

      e.stopPropagation();
      e.preventDefault();

      dragRef.current = {
        mode: "move",
        elementId: elem.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: elem.x,
        initialY: elem.y,
        initialW: elem.width,
        initialH: elem.height,
        aspectRatio: elem.width / Math.max(1, elem.height),
        pxPerMm: computePxPerMm(),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Resize Handle MouseDown ──────────────────────────────────────────────────
  const handleResizeHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle, elem: LayoutElement) => {
      if (elem.locked) return;
      e.stopPropagation();
      e.preventDefault();

      dragRef.current = {
        mode: "resize",
        elementId: elem.id,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: elem.x,
        initialY: elem.y,
        initialW: elem.width,
        initialH: elem.height,
        aspectRatio: elem.width / Math.max(1, elem.height),
        pxPerMm: computePxPerMm(),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Global mouse event listeners — attached ONCE, read latest values via refs ──
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const layout = latestLayout.current;
      const snapGrid = latestSnapGrid.current;
      const snapMargins = latestSnapMargins.current;

      const deltaXmm = (e.clientX - drag.startClientX) / drag.pxPerMm;
      const deltaYmm = (e.clientY - drag.startClientY) / drag.pxPerMm;

      const guides: { x?: number; y?: number } = {};

      if (drag.mode === "move") {
        let newX = drag.initialX + deltaXmm;
        let newY = drag.initialY + deltaYmm;

        if (snapGrid) {
          newX = Math.round(newX / 5) * 5;
          newY = Math.round(newY / 5) * 5;
        }

        if (snapMargins) {
          const lm = layout.page.margins.left;
          const rm = layout.page.widthMm - layout.page.margins.right - drag.initialW;
          const tm = layout.page.margins.top;
          const cx = (layout.page.widthMm - drag.initialW) / 2;
          const SNAP = 3;

          if (Math.abs(newX - lm) < SNAP) { newX = lm; guides.x = lm; }
          else if (Math.abs(newX - rm) < SNAP) { newX = rm; guides.x = rm + drag.initialW; }
          else if (Math.abs(newX - cx) < SNAP) { newX = cx; guides.x = layout.page.widthMm / 2; }

          if (Math.abs(newY - tm) < SNAP) { newY = tm; guides.y = tm; }
        }

        newX = Math.max(0, Math.min(layout.page.widthMm - drag.initialW, newX));
        newY = Math.max(0, Math.min(layout.page.heightMm - drag.initialH, newY));

        setGuideLines(guides);
        latestOnUpdateElement.current(drag.elementId, { x: newX, y: newY }, false);
      } else if (drag.mode === "resize" && drag.handle) {
        let newW = drag.initialW;
        let newH = drag.initialH;
        let newX = drag.initialX;
        let newY = drag.initialY;
        const h = drag.handle;

        if (h.includes("e")) newW = Math.max(10, drag.initialW + deltaXmm);
        else if (h.includes("w")) {
          const eff = Math.min(drag.initialW - 10, deltaXmm);
          newW = drag.initialW - eff;
          newX = drag.initialX + eff;
        }

        if (h.includes("s")) newH = Math.max(5, drag.initialH + deltaYmm);
        else if (h.includes("n")) {
          const eff = Math.min(drag.initialH - 5, deltaYmm);
          newH = drag.initialH - eff;
          newY = drag.initialY + eff;
        }

        if (drag.aspectRatio && (h === "nw" || h === "ne" || h === "sw" || h === "se")) {
          newH = newW / drag.aspectRatio;
        }

        newW = Math.min(layout.page.widthMm - newX, newW);
        newH = Math.min(layout.page.heightMm - newY, newH);

        latestOnUpdateElement.current(drag.elementId, { x: newX, y: newY, width: newW, height: newH }, false);
      }
    }

    function handleMouseUp() {
      const drag = dragRef.current;
      if (drag) {
        // Commit the final position to history (only once on mouse-up)
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
    // Empty deps: listeners attached once, always read latest values through refs.
  }, []);

  const selectedElement = layout.elements.find((el) => el.id === selectedElementId) || null;

  return (
    <div
      onClick={() => onSelectElement(null)}
      className="flex-1 overflow-auto bg-slate-950 p-10 flex items-start justify-center relative select-none"
      style={{
        backgroundImage: "radial-gradient(circle at center, rgba(51,65,85,0.2) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/*
        Zoom container:
        - Use transform-origin: top center so the page scales from the top-center.
        - Wrap in an outer div that has explicit pixel dimensions matching the
          VISUAL size so the flexbox container correctly accounts for available space
          and doesn't mis-position the scaled element.
      */}
      <div
        style={{
          width: `${layout.page.widthMm * zoom * 3.7795296}px`,
          height: `${layout.page.heightMm * zoom * 3.7795296}px`,
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* The actual A4 sheet — positioned at top-left of the outer sizing wrapper */}
        <div
          ref={pageRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${layout.page.widthMm}mm`,
            height: `${layout.page.heightMm}mm`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* Snap guidelines */}
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
            data={SAMPLE_DOCUMENT_DATA}
            isDesignerPreview={true}
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
            scale={1}
            pageNumber={pageNumber}
          />

          {/*
            Drag & Resize Overlay
            Transparent hit-detection layer over each element.
            Positioned with the same mm coordinates as the renderer.
            pointer-events-none on wrapper; pointer-events-auto on each element div.
          */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            {layout.elements
              .filter((el) => el.visible)
              .map((elem) => {
                const isSelected = selectedElementId === elem.id;

                return (
                  <div
                    key={elem.id}
                    onMouseDown={(e) => handleElementMouseDown(e, elem)}
                    className={`absolute pointer-events-auto transition-colors ${
                      isSelected
                        ? "ring-2 ring-blue-500 ring-offset-1 z-40 cursor-move"
                        : elem.locked
                        ? "cursor-default hover:ring-1 hover:ring-slate-400/50"
                        : "hover:ring-1 hover:ring-blue-300/80 cursor-pointer"
                    }`}
                    style={{
                      left: `${elem.x}mm`,
                      top: `${elem.y}mm`,
                      width: `${elem.width}mm`,
                      height: `${elem.height}mm`,
                    }}
                  >
                    {/* 8 resize handles — only on selected, unlocked elements */}
                    {isSelected && !elem.locked && (
                      <>
                        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
                          <div
                            key={handle}
                            onMouseDown={(e) => handleResizeHandleMouseDown(e, handle, elem)}
                            className={`absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-sm z-50 shadow ${
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
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
