"use client";

import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { DocumentLayout, LayoutElement } from "@/lib/documentDesigner";
import DynamicDocumentRenderer, { getSampleDocumentData } from "../documents/DynamicDocumentRenderer";
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
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onAddImage?: (file: File) => void;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// Keep a stable ref to latest values without triggering effects or violating render rules
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
  zoom,
  snapGrid,
  snapMargins,
  pageNumber,
  containerRef,
  onAddImage,
}: DocumentCanvasProps) {
  // The actual A4 page DOM node — used for getBoundingClientRect-based coordinate conversion
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

  // ── Element MouseDown → Select & Start Drag ─────────────────────────────────
  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, elem: LayoutElement) => {
      if (e.button !== 0) return;
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
    [latestOnSelectElement, latestLayout]
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

        newX = Math.max(0, Math.min(curLayout.page.widthMm - drag.initialW, newX));
        newY = Math.max(0, Math.min(curLayout.page.heightMm - drag.initialH, newY));

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

        const MIN_W = 5;
        const MIN_H = 5;
        const lockAspect = drag.lockAspectRatio || e.shiftKey;

        if (h === "e") {
          newW = Math.max(MIN_W, drag.initialW + deltaXmm);
          newW = Math.min(curLayout.page.widthMm - newX, newW);
        } else if (h === "w") {
          const maxDelta = drag.initialW - MIN_W;
          const effDelta = Math.min(maxDelta, deltaXmm);
          newX = Math.max(0, drag.initialX + effDelta);
          newW = drag.initialW + (drag.initialX - newX);
        } else if (h === "s") {
          newH = Math.max(MIN_H, drag.initialH + deltaYmm);
          newH = Math.min(curLayout.page.heightMm - newY, newH);
        } else if (h === "n") {
          const maxDelta = drag.initialH - MIN_H;
          const effDelta = Math.min(maxDelta, deltaYmm);
          newY = Math.max(0, drag.initialY + effDelta);
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
            newX = Math.max(0, drag.initialX + effDeltaX);
            newW = drag.initialW + (drag.initialX - newX);
            newH = Math.max(MIN_H, drag.initialH + deltaYmm);
            if (lockAspect && drag.aspectRatio) {
              newH = newW / drag.aspectRatio;
            }
          } else if (h === "ne") {
            newW = Math.max(MIN_W, drag.initialW + deltaXmm);
            const effDeltaY = Math.min(drag.initialH - MIN_H, deltaYmm);
            newY = Math.max(0, drag.initialY + effDeltaY);
            newH = drag.initialH + (drag.initialY - newY);
            if (lockAspect && drag.aspectRatio) {
              const targetH = newW / drag.aspectRatio;
              newY = drag.initialY + (drag.initialH - targetH);
              newH = targetH;
            }
          } else if (h === "nw") {
            const effDeltaX = Math.min(drag.initialW - MIN_W, deltaXmm);
            newX = Math.max(0, drag.initialX + effDeltaX);
            newW = drag.initialW + (drag.initialX - newX);

            const effDeltaY = Math.min(drag.initialH - MIN_H, deltaYmm);
            newY = Math.max(0, drag.initialY + effDeltaY);
            newH = drag.initialH + (drag.initialY - newY);

            if (lockAspect && drag.aspectRatio) {
              const targetH = newW / drag.aspectRatio;
              newY = drag.initialY + (drag.initialH - targetH);
              newH = targetH;
            }
          }

          if (newX < 0) { newW += newX; newX = 0; }
          if (newY < 0) { newH += newY; newY = 0; }
          newW = Math.max(MIN_W, Math.min(curLayout.page.widthMm - newX, newW));
          newH = Math.max(MIN_H, Math.min(curLayout.page.heightMm - newY, newH));
        }

        if (lockAspect && drag.aspectRatio > 0) {
          const right = drag.initialX + drag.initialW;
          const bottom = drag.initialY + drag.initialH;
          const centerX = drag.initialX + drag.initialW / 2;
          const centerY = drag.initialY + drag.initialH / 2;
          const horizontalHandle = h.includes("e") || h.includes("w");
          const verticalHandle = h.includes("n") || h.includes("s");

          let requestedWidth = horizontalHandle ? newW : newH * drag.aspectRatio;
          if (horizontalHandle && verticalHandle) {
            const fromHeight = newH * drag.aspectRatio;
            requestedWidth = Math.abs(deltaXmm) >= Math.abs(deltaYmm * drag.aspectRatio)
              ? newW
              : fromHeight;
          }

          const minimumWidth = Math.max(MIN_W, MIN_H * drag.aspectRatio);
          const maxWidthFromX = h.includes("w")
            ? right
            : h.includes("e")
              ? curLayout.page.widthMm - drag.initialX
              : 2 * Math.min(centerX, curLayout.page.widthMm - centerX);
          const maxHeightFromY = h.includes("n")
            ? bottom
            : h.includes("s")
              ? curLayout.page.heightMm - drag.initialY
              : 2 * Math.min(centerY, curLayout.page.heightMm - centerY);
          const maxWidth = Math.max(minimumWidth, Math.min(maxWidthFromX, maxHeightFromY * drag.aspectRatio));

          newW = Math.max(minimumWidth, Math.min(maxWidth, requestedWidth));
          newH = newW / drag.aspectRatio;
          newX = h.includes("w") ? right - newW : h.includes("e") ? drag.initialX : centerX - newW / 2;
          newY = h.includes("n") ? bottom - newH : h.includes("s") ? drag.initialY : centerY - newH / 2;
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
        // Commit the final position to undo history once drag ends
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

  return (
    <div
      ref={effectiveContainerRef}
      tabIndex={0}
      aria-label="A4 canvas, scroll to pan the page"
      onClick={() => onSelectElement(null)}
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
      className="designer-scrollbar designer-canvas-scroll relative flex min-h-0 min-w-0 flex-1 select-none items-start justify-start overflow-auto overscroll-contain bg-slate-950 p-6 sm:p-8 md:p-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-500/60"
      style={{
        backgroundImage: "radial-gradient(circle at center, rgba(51,65,85,0.25) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
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
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${layout.page.widthMm}mm`,
            height: `${layout.page.heightMm}mm`,
            transform: `scale(${zoom})`,
          }}
        >
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
            data={getSampleDocumentData(layout.documentType)}
            isDesignerPreview={true}
            scale={1}
            pageNumber={pageNumber}
          />

          {/*
            Interactive Element Overlay
            Transparent hit-detection layer with proper z-index and selection visuals.
          */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            {layout.elements
              .filter((el) => {
                if (!el.visible) return false;
                if (el.pageNumber !== undefined && el.pageNumber !== pageNumber) return false;
                return true;
              })
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((elem) => {
                const isSelected = selectedElementId === elem.id;

                return (
                  <div
                    key={elem.id}
                    onMouseDown={(e) => handleElementMouseDown(e, elem)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      latestOnSelectElement.current(elem.id);
                    }}
                    className={`absolute pointer-events-auto transition-shadow ${
                      isSelected
                        ? elem.locked
                          ? "ring-2 ring-amber-400 ring-offset-1 cursor-default shadow-sm"
                          : "ring-2 ring-blue-600 ring-offset-1 cursor-move shadow-md"
                        : elem.locked
                        ? "cursor-default hover:ring-1 hover:ring-amber-300/60"
                        : "hover:ring-1 hover:ring-blue-400/80 cursor-pointer"
                    }`}
                    style={{
                      left: `${elem.x}mm`,
                      top: `${elem.y}mm`,
                      width: `${elem.width}mm`,
                      height: `${elem.height}mm`,
                      zIndex: elem.zIndex,
                    }}
                  >
                    {/* Badge tag on selected element */}
                    {isSelected && (
                      <div
                        className={`absolute -top-6 left-0 text-white text-[9px] px-2 py-0.5 rounded font-mono font-medium shadow select-none flex items-center gap-1.5 whitespace-nowrap z-50 pointer-events-none ${
                          elem.locked ? "bg-amber-600" : "bg-blue-600"
                        }`}
                      >
                        <span>{elem.label}</span>
                        <span className="opacity-80">
                          {Math.round(elem.x)}×{Math.round(elem.y)} mm ({Math.round(elem.width)}×{Math.round(elem.height)})
                        </span>
                        {elem.locked && <span className="text-amber-200 font-bold">🔒 LOCKED</span>}
                      </div>
                    )}

                    {/* 8 resize handles — ONLY for selected, UNLOCKED elements */}
                    {isSelected && !elem.locked && (
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
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
