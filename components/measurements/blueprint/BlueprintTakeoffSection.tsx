"use client";

import React, { useState, useRef, useCallback } from "react";
import BlueprintCanvas from "./BlueprintCanvas";
import {
  BlueprintRecord,
  BlueprintAnnotation,
  BlueprintAreaAnnotation,
  DimensionUnit,
} from "@/lib/blueprint/blueprintTypes";
import {
  calculateParkingShadeArea,
} from "@/lib/blueprint/blueprintMath";
import {
  getLocalBlueprint,
  setLocalBlueprint,
  exportBlueprintAsJson,
  initUndoState,
  pushUndoState,
  undo,
  redo,
  UndoState,
} from "@/lib/blueprint/blueprintValidation";
import { MeasurementRowInput } from "@/lib/measurementTypes";
import {
  Layers,
  Move,
  Ruler,
  Maximize2,
  Square,
  Pentagon,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Upload,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Undo2,
  Redo2,
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

interface BlueprintTakeoffSectionProps {
  sheetId: string;
  companyId: string;
  onSyncRows: (rows: MeasurementRowInput[]) => void;
  disabled?: boolean;
}

const DEFAULT_SAMPLE_BLUEPRINT_URL = "/sample-blueprint.svg";

export default function BlueprintTakeoffSection({
  sheetId,
  companyId,
  onSyncRows,
  disabled = false,
}: BlueprintTakeoffSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<
    "select" | "calibrate" | "dimension" | "rectangle" | "polygon" | "note" | "label"
  >("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial Blueprint Record generator
  const createEmptyBlueprint = useCallback(
    (): BlueprintRecord => ({
      id: crypto.randomUUID(),
      company_id: companyId,
      sheet_id: sheetId,
      blueprint_name: "Architectural Drawing Plan",
      blueprint_file_path: DEFAULT_SAMPLE_BLUEPRINT_URL,
      file_type: "png",
      width_px: 1600,
      height_px: 1000,
      calibration: {
        pointA: { x: 120, y: 172 },
        pointB: { x: 520, y: 172 },
        realWorldDistance: 5000,
        unit: "mm" as DimensionUnit,
        pixelsPerMm: 400 / 5000, // 0.08 px/mm preset for sample
        calibratedAt: new Date().toISOString(),
      },
      annotations: [
        {
          id: "initial-area-1",
          type: "area",
          shape: "rectangle",
          points: [
            { x: 100, y: 240 },
            { x: 1060, y: 240 },
            { x: 1060, y: 669 },
            { x: 100, y: 669 },
          ],
          areaLabel: "Area 1 - Canopy Bay 1",
          realAreaM2: 64.32,
          source: "Scale Measured",
          confirmed: true,
          createdAt: new Date().toISOString(),
        },
      ],
      takeoff_areas: [],
      ai_tips: [],
      ai_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [companyId, sheetId]
  );

  const [blueprint, setBlueprintState] = useState<BlueprintRecord>(() => {
    const saved = getLocalBlueprint(sheetId);
    return saved || createEmptyBlueprint();
  });

  const [undoStack, setUndoStack] = useState<UndoState>(() => initUndoState(blueprint));

  // Persist locally on changes
  const updateBlueprint = (newBlueprint: BlueprintRecord, recordUndo = true) => {
    setBlueprintState(newBlueprint);
    setLocalBlueprint(sheetId, newBlueprint);
    if (recordUndo) {
      setUndoStack((prev) => pushUndoState(prev, newBlueprint));
    }
  };

  const handleUndo = () => {
    const res = undo(undoStack);
    if (res.state) {
      setBlueprintState(res.state);
      setUndoStack(res.newState);
      setLocalBlueprint(sheetId, res.state);
    }
  };

  const handleRedo = () => {
    const res = redo(undoStack);
    if (res.state) {
      setBlueprintState(res.state);
      setUndoStack(res.newState);
      setLocalBlueprint(sheetId, res.state);
    }
  };

  const handleAddAnnotation = (anno: BlueprintAnnotation) => {
    const updated: BlueprintRecord = {
      ...blueprint,
      annotations: [...blueprint.annotations, anno],
      updated_at: new Date().toISOString(),
    };
    updateBlueprint(updated);
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<BlueprintAnnotation>) => {
    const updated: BlueprintRecord = {
      ...blueprint,
      annotations: blueprint.annotations.map((a) => (a.id === id ? ({ ...a, ...updates } as BlueprintAnnotation) : a)),
      updated_at: new Date().toISOString(),
    };
    updateBlueprint(updated);
  };

  const handleDeleteAnnotation = (id: string) => {
    const updated: BlueprintRecord = {
      ...blueprint,
      annotations: blueprint.annotations.filter((a) => a.id !== id),
      updated_at: new Date().toISOString(),
    };
    updateBlueprint(updated);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const updated: BlueprintRecord = {
      ...blueprint,
      blueprint_name: file.name,
      blueprint_file_path: objectUrl,
      file_type: file.type.includes("png") ? "png" : "jpg",
      calibration: null, // Clear calibration for new drawing
      annotations: [], // Reset annotations for new drawing
      updated_at: new Date().toISOString(),
    };
    updateBlueprint(updated);
    setActiveTool("calibrate");
  };

  const handleLoadSample = () => {
    const sample = createEmptyBlueprint();
    sample.blueprint_name = "Al Quoz Car Park - Sample Plan (A-101)";
    updateBlueprint(sample);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleClearAll = () => {
    if (window.confirm("Clear all annotations and calibration on this canvas?")) {
      const updated: BlueprintRecord = {
        ...blueprint,
        annotations: [],
        calibration: null,
        updated_at: new Date().toISOString(),
      };
      updateBlueprint(updated);
    }
  };

  // Convert blueprint area annotations into Measurement Row Inputs
  const handleSyncToMeasurementTable = () => {
    const areaAnnotations = blueprint.annotations.filter(
      (a): a is BlueprintAreaAnnotation => a.type === "area"
    );

    if (areaAnnotations.length === 0) {
      setSyncFeedback("No area annotations found to sync. Draw at least one Rectangle or Polygon Area first.");
      setTimeout(() => setSyncFeedback(null), 4000);
      return;
    }

    const newRows: MeasurementRowInput[] = areaAnnotations.map((anno, idx) => {
      // Calculate bounding box or approx dimensions in mm if calibrated
      let lengthEntered = 12000;
      let widthEntered = 5360;

      if (blueprint.calibration && anno.points.length >= 2) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        anno.points.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });

        const dxPx = maxX - minX;
        const dyPx = maxY - minY;
        const ppm = blueprint.calibration.pixelsPerMm || 1;
        const dim1 = Math.round(dxPx / ppm);
        const dim2 = Math.round(dyPx / ppm);

        lengthEntered = Math.max(dim1, dim2);
        widthEntered = Math.min(dim1, dim2);
      }

      // Calculate parking shade fabrication numbers
      const calc = calculateParkingShadeArea({
        lengthMm: lengthEntered,
        widthMm: widthEntered,
        quantity: 1,
        centreJointCount: 1,
        centreJointOrientation: "longitudinal",
      });

      return {
        area_name: anno.areaLabel || `Area ${idx + 1}`,
        description: `PVC Parking Shade Fabric (${(lengthEntered / 1000).toFixed(2)}m × ${(widthEntered / 1000).toFixed(2)}m) - Takeoff from ${blueprint.blueprint_name}`,
        calc_type: "pvc_edge_joint",
        dim_unit: "mm",
        length_entered: lengthEntered,
        width_entered: widthEntered,
        quantity: 1,
        pvc_length_edges: 2,
        pvc_width_edges: 2,
        pvc_centre_joints: 1,
        rate: 0,
        notes: `Takeoff Area: ${anno.realAreaM2 > 0 ? anno.realAreaM2.toFixed(2) : calc.fabricAreaM2.toFixed(2)} m² (Scale: ${anno.source})`,
      };
    });

    onSyncRows(newRows);
    setSyncFeedback(`Successfully synced ${newRows.length} takeoff item(s) to Measurement Rows table below!`);
    setTimeout(() => setSyncFeedback(null), 5000);
  };

  const isCalibrated = Boolean(blueprint.calibration && blueprint.calibration.pixelsPerMm > 0);
  const areasCount = blueprint.annotations.filter((a) => a.type === "area").length;
  const dimensionsCount = blueprint.annotations.filter((a) => a.type === "dimension").length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-2xl transition-all">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 py-3 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Interactive Blueprint Takeoff &amp; Measurement Canvas
              </h3>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                CAD / Plan Scale
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Pan, calibrate scale, measure dimensions, and calculate real PVC &amp; fabric surface areas directly from architectural drawings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCalibrated ? (
            <span className="flex items-center gap-1.5 rounded-md bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 text-[11px] text-emerald-300 font-mono">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>
                Scale: 1 mm = {blueprint.calibration?.pixelsPerMm.toFixed(4)} px
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-md bg-amber-950/80 border border-amber-500/30 px-2.5 py-1 text-[11px] text-amber-300 font-mono">
              <AlertCircle size={13} className="text-amber-400" />
              <span>Uncalibrated — Click Calibrate Tool</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            <span>{isOpen ? "Collapse" : "Expand"}</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* Action & Tools Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            {/* Tool selectors */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                Tools:
              </span>

              <button
                type="button"
                onClick={() => setActiveTool("select")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "select"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Pan / Select Tool (Right-click or drag on canvas to pan)"
              >
                <Move size={14} />
                <span>Pan / Select</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool("calibrate")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "calibrate"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Calibrate Scale (Click 2 points with known distance)"
              >
                <Ruler size={14} />
                <span>Calibrate Scale</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool("dimension")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "dimension"
                    ? "bg-sky-600 text-white shadow-md shadow-sky-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Dimension Line (Click start and end points)"
              >
                <Maximize2 size={14} />
                <span>Dimension Line</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool("rectangle")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "rectangle"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Rectangle Area (Click 2 opposite corners)"
              >
                <Square size={14} />
                <span>Rectangle Area</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool("polygon")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "polygon"
                    ? "bg-purple-600 text-white shadow-md shadow-purple-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Polygon Area (Click vertices, click start point to close)"
              >
                <Pentagon size={14} />
                <span>Polygon Area</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool("note")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTool === "note"
                    ? "bg-teal-600 text-white shadow-md shadow-teal-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                title="Note / Label (Click position to place text)"
              >
                <FileText size={14} />
                <span>Note</span>
              </button>
            </div>

            {/* Canvas actions & Zoom */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
                  className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-300 min-w-14 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(6, z * 1.2))}
                  className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800"
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 ml-0.5"
                  title="Reset View"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              {/* Undo / Redo */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.pointer <= 0}
                  className="rounded-lg border border-slate-800 bg-slate-850 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors"
                  title="Undo"
                >
                  <Undo2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={undoStack.pointer >= undoStack.history.length - 1}
                  className="rounded-lg border border-slate-800 bg-slate-850 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors"
                  title="Redo"
                >
                  <Redo2 size={13} />
                </button>
              </div>

              {/* Upload & Sample buttons */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <Upload size={13} />
                <span>Upload Plan</span>
              </button>

              <button
                type="button"
                onClick={handleLoadSample}
                className="flex items-center gap-1 rounded-lg border border-sky-600/40 bg-sky-950/40 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-900/60 transition-colors"
                title="Load sample parking canopy architectural drawing"
              >
                <Sparkles size={13} />
                <span>Load Sample Plan</span>
              </button>

              <button
                type="button"
                onClick={() => exportBlueprintAsJson(blueprint)}
                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Export annotations to JSON backup"
              >
                <Download size={13} />
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 rounded-lg border border-red-900/30 bg-red-950/30 px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
                title="Clear all annotations"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Interactive Blueprint Canvas Component */}
          <div className="relative">
            <BlueprintCanvas
              blueprint={blueprint}
              setBlueprint={updateBlueprint}
              activeTool={activeTool}
              onAddAnnotation={handleAddAnnotation}
              onUpdateAnnotation={handleUpdateAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              zoom={zoom}
              setZoom={setZoom}
              pan={pan}
              setPan={setPan}
            />

            {/* Instruction tooltip badge over canvas */}
            <div className="absolute top-3 left-3 pointer-events-none rounded-lg bg-slate-950/80 backdrop-blur border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300 flex items-center gap-2">
              <span className="font-semibold text-emerald-400">Mode:</span>
              <span className="capitalize">{activeTool}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                {activeTool === "calibrate"
                  ? "Click 2 points with known distance to set scale"
                  : activeTool === "dimension"
                  ? "Click start and end points to measure distance"
                  : activeTool === "rectangle"
                  ? "Click top-left and bottom-right corners"
                  : activeTool === "polygon"
                  ? "Click vertices; click start vertex to finish"
                  : activeTool === "note"
                  ? "Click position to add note"
                  : "Drag to pan, wheel to zoom, click annotation to select"}
              </span>
            </div>
          </div>

          {/* Takeoff Results Summary & Sync to Sheet */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Digital Takeoff Breakdown
                </h4>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                  <span>
                    Measured Areas: <strong className="text-white font-mono">{areasCount}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Linear Dimensions: <strong className="text-white font-mono">{dimensionsCount}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Total Fabric Area:{" "}
                    <strong className="text-emerald-400 font-mono">
                      {blueprint.annotations
                        .filter((a): a is BlueprintAreaAnnotation => a.type === "area")
                        .reduce((sum, a) => sum + (Number(a.realAreaM2) || 0), 0)
                        .toFixed(2)}{" "}
                      m²
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {syncFeedback && (
                  <span className="text-xs font-medium text-emerald-400 animate-fadeIn">
                    {syncFeedback}
                  </span>
                )}

                <button
                  type="button"
                  disabled={disabled || areasCount === 0}
                  onClick={handleSyncToMeasurementTable}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg transition-colors disabled:opacity-40 disabled:hover:bg-emerald-600"
                >
                  <ArrowDownToLine size={15} />
                  <span>Transfer Takeoff to Measurement Rows</span>
                </button>
              </div>
            </div>

            {/* List of measured areas */}
            {areasCount > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-3 border-t border-slate-900">
                {blueprint.annotations
                  .filter((a): a is BlueprintAreaAnnotation => a.type === "area")
                  .map((area, idx) => (
                    <div
                      key={area.id || idx}
                      className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{area.areaLabel}</div>
                        <div className="text-[10px] text-slate-500">
                          {area.shape} • {area.points.length} vertices
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-400">
                          {area.realAreaM2.toFixed(2)} m²
                        </div>
                        <div className="text-[10px] text-slate-500">{area.source}</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
