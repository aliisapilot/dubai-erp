"use client";
import React, { useState, useRef, useEffect } from "react";
import { BlueprintAnnotation, BlueprintPoint, DimensionUnit, BlueprintDimensionAnnotation, BlueprintAreaAnnotation, BlueprintNoteAnnotation, BlueprintCalibration } from "@/lib/blueprint/blueprintTypes";
import { distanceBetweenPoints, calculateRealAreaM2 } from "@/lib/blueprint/blueprintMath";
import { Move, Trash2, X } from "lucide-react";

export default function BlueprintCanvas({ blueprint, setBlueprint, activeTool, onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation, zoom, setZoom, pan, setPan }: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 1200, height: 800 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [clickPoints, setClickPoints] = useState<BlueprintPoint[]>([]);
  const [tempPoint, setTempPoint] = useState<BlueprintPoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<{ id: string; idx?: number } | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [inputCoords, setInputCoords] = useState<BlueprintPoint | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputUnit, setInputUnit] = useState<DimensionUnit>("mm");

  useEffect(() => {
    if (!blueprint.blueprint_file_path) return;
    const img = new Image();
    img.src = blueprint.blueprint_file_path;
    img.onload = () => {
      setImageSize({ width: img.naturalWidth || 1200, height: img.naturalHeight || 800 });
      setImageLoaded(true);
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const sx = (cw - 40) / (img.naturalWidth || 1200);
        const sy = (ch - 40) / (img.naturalHeight || 800);
        const initScale = Math.min(sx, sy, 1.5);
        setZoom(initScale);
        setPan({ x: (cw - (img.naturalWidth || 1200) * initScale) / 2, y: (ch - (img.naturalHeight || 800) * initScale) / 2 });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprint.blueprint_file_path]);

  const getLocalCoords = (cX: number, cY: number): BlueprintPoint => {
    if (!wrapperRef.current) return { x: 0, y: 0 };
    const r = wrapperRef.current.getBoundingClientRect();
    return { x: (cX - r.left) / zoom, y: (cY - r.top) / zoom };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || activeTool === "select" || isPanning) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
      return;
    }
    if (!imageLoaded) return;
    const pt = getLocalCoords(e.clientX, e.clientY);
    if (activeTool === "calibrate" || activeTool === "dimension") {
      const pts = [...clickPoints, pt];
      setClickPoints(pts);
      if (pts.length === 2) {
        setInputCoords({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
        setInputValue(""); setShowInput(true);
      }
    } else if (activeTool === "rectangle") {
      const pts = [...clickPoints, pt];
      setClickPoints(pts);
      if (pts.length === 2) {
        const [p1, p2] = pts;
        const rect = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }, { x: p2.x, y: p2.y }, { x: p1.x, y: p2.y }];
        onAddAnnotation({
          id: crypto.randomUUID(), type: "area", shape: "rectangle", points: rect,
          areaLabel: `Area ${blueprint.annotations.filter((a: BlueprintAnnotation) => a.type === "area").length + 1}`,
          realAreaM2: calculateRealAreaM2(rect, blueprint.calibration), source: blueprint.calibration ? "Scale Measured" : "Manual", confirmed: true, createdAt: new Date().toISOString()
        });
        setClickPoints([]); setTempPoint(null);
      }
    } else if (activeTool === "polygon") {
      if (clickPoints.length >= 3 && distanceBetweenPoints(pt, clickPoints[0]) < 15 / zoom) {
        onAddAnnotation({
          id: crypto.randomUUID(), type: "area", shape: "polygon", points: clickPoints,
          areaLabel: `Area ${blueprint.annotations.filter((a: BlueprintAnnotation) => a.type === "area").length + 1}`,
          realAreaM2: calculateRealAreaM2(clickPoints, blueprint.calibration), source: blueprint.calibration ? "Scale Measured" : "Manual", confirmed: true, createdAt: new Date().toISOString()
        });
        setClickPoints([]); setTempPoint(null);
      } else {
        setClickPoints([...clickPoints, pt]);
      }
    } else if (activeTool === "note" || activeTool === "label") {
      setInputCoords(pt); setInputValue(""); setShowInput(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (!imageLoaded) return;
    const pt = getLocalCoords(e.clientX, e.clientY);
    setTempPoint(pt);
    if (dragged) {
      const anno = blueprint.annotations.find((a: BlueprintAnnotation) => a.id === dragged.id);
      if (anno && anno.type === "area" && dragged.idx !== undefined) {
        const updated = [...(anno as BlueprintAreaAnnotation).points];
        updated[dragged.idx] = pt;
        onUpdateAnnotation(anno.id, { points: updated, realAreaM2: calculateRealAreaM2(updated, blueprint.calibration) });
      }
    }
  };

  const handleMouseUp = () => { setIsPanning(false); setDragged(null); };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = 1.1;
      const nextZoom = e.deltaY < 0 ? Math.min(zoom * factor, 10) : Math.max(zoom / factor, 0.1);
      const rect = el.getBoundingClientRect();
      const mX = e.clientX - rect.left;
      const mY = e.clientY - rect.top;
      setPan({
        x: mX - (mX - pan.x) * (nextZoom / zoom),
        y: mY - (mY - pan.y) * (nextZoom / zoom),
      });
      setZoom(nextZoom);
    };

    el.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheelEvent);
    };
  }, [zoom, pan, setPan, setZoom]);

  const handleConfirm = () => {
    if (!inputValue) { setShowInput(false); setClickPoints([]); return; }
    const num = parseFloat(inputValue);
    if (activeTool === "calibrate" && clickPoints.length === 2) {
      const dist = distanceBetweenPoints(clickPoints[0], clickPoints[1]);
      const mm = inputUnit === "m" ? num * 1000 : inputUnit === "cm" ? num * 10 : num;
      const calibration: BlueprintCalibration = {
        pointA: clickPoints[0], pointB: clickPoints[1], realWorldDistance: mm, unit: inputUnit,
        pixelsPerMm: dist / mm, calibratedAt: new Date().toISOString()
      };
      const annos = blueprint.annotations.map((a: BlueprintAnnotation) => {
        if (a.type === "dimension") {
          const d = a as BlueprintDimensionAnnotation;
          const r = distanceBetweenPoints(d.pointA, d.pointB) / (dist / mm);
          return { ...d, realValue: r, label: `${Math.round(inputUnit === "m" ? r / 1000 : inputUnit === "cm" ? r / 10 : r)} ${d.unit}` };
        } else if (a.type === "area") {
          const ar = a as BlueprintAreaAnnotation;
          return { ...ar, realAreaM2: calculateRealAreaM2(ar.points, calibration) };
        }
        return a;
      });
      setBlueprint({ ...blueprint, calibration, annotations: annos });
    } else if (activeTool === "dimension" && clickPoints.length === 2) {
      const mm = inputUnit === "m" ? num * 1000 : inputUnit === "cm" ? num * 10 : num;
      onAddAnnotation({
        id: crypto.randomUUID(), type: "dimension", pointA: clickPoints[0], pointB: clickPoints[1],
        realValue: mm, unit: inputUnit, label: `${num} ${inputUnit}`, source: "Manual", confirmed: true, createdAt: new Date().toISOString()
      });
    } else if (activeTool === "note" && inputCoords) {
      onAddAnnotation({ id: crypto.randomUUID(), type: "note", position: inputCoords, text: inputValue, source: "Manual", createdAt: new Date().toISOString() });
    } else if (activeTool === "label" && inputCoords) {
      onAddAnnotation({ id: crypto.randomUUID(), type: "label", position: inputCoords, text: inputValue, source: "Manual", createdAt: new Date().toISOString() });
    }
    setShowInput(false); setClickPoints([]); setTempPoint(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-[450px] md:h-[550px] w-full bg-slate-950 overflow-hidden cursor-crosshair border border-slate-800 rounded-xl select-none"
      style={{ overscrollBehavior: "contain", touchAction: "none" }}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
      onContextMenu={e => e.preventDefault()}
    >
      {blueprint.blueprint_file_path ? (
        <div
          ref={wrapperRef}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", width: `${imageSize.width}px`, height: `${imageSize.height}px` }}
          className="absolute origin-top-left transition-transform duration-75 ease-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={blueprint.blueprint_file_path} alt="blueprint" className="pointer-events-none select-none max-w-none" style={{ width: "100%", height: "100%" }} draggable={false} />
          <svg className="absolute inset-0 w-full h-full pointer-events-auto" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}>
            {blueprint.calibration && (
              <g className="stroke-emerald-400 fill-emerald-400">
                <line x1={blueprint.calibration.pointA.x} y1={blueprint.calibration.pointA.y} x2={blueprint.calibration.pointB.x} y2={blueprint.calibration.pointB.y} strokeWidth={4 / zoom} strokeDasharray={`${8 / zoom},${4 / zoom}`} />
                <circle cx={blueprint.calibration.pointA.x} cy={blueprint.calibration.pointA.y} r={6 / zoom} />
                <circle cx={blueprint.calibration.pointB.x} cy={blueprint.calibration.pointB.y} r={6 / zoom} />
              </g>
            )}
            {blueprint.annotations.map((anno: BlueprintAnnotation) => {
              const sel = selectedId === anno.id;
              if (anno.type === "dimension") {
                const d = anno as BlueprintDimensionAnnotation;
                return (
                  <g key={anno.id} onClick={e => { e.stopPropagation(); setSelectedId(anno.id); }} className="cursor-pointer">
                    <line x1={d.pointA.x} y1={d.pointA.y} x2={d.pointB.x} y2={d.pointB.y} stroke={sel ? "#10b981" : "#3b82f6"} strokeWidth={(sel ? 5 : 3) / zoom} />
                    <circle cx={d.pointA.x} cy={d.pointA.y} r={5 / zoom} fill={sel ? "#10b981" : "#3b82f6"} />
                    <circle cx={d.pointB.x} cy={d.pointB.y} r={5 / zoom} fill={sel ? "#10b981" : "#3b82f6"} />
                    <g transform={`translate(${(d.pointA.x + d.pointB.x) / 2}, ${(d.pointA.y + d.pointB.y) / 2})`}>
                      <rect x={-45 / zoom} y={-10 / zoom} width={90 / zoom} height={20 / zoom} rx={4 / zoom} fill="#0f172a" stroke={sel ? "#10b981" : "#3b82f6"} strokeWidth={1 / zoom} />
                      <text x={0} y={4 / zoom} textAnchor="middle" fill="#f8fafc" fontSize={`${11 / zoom}px`} fontWeight="bold">{d.label}</text>
                    </g>
                  </g>
                );
              } else if (anno.type === "area") {
                const a = anno as BlueprintAreaAnnotation;
                return (
                  <g key={anno.id} onClick={e => { e.stopPropagation(); setSelectedId(anno.id); }} className="cursor-pointer">
                    <polygon points={a.points.map(p => `${p.x},${p.y}`).join(" ")} fill={sel ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.15)"} stroke={sel ? "#10b981" : "#3b82f6"} strokeWidth={(sel ? 3 : 2) / zoom} />
                    {sel && a.points.map((pt, vIdx) => (
                      <circle key={vIdx} cx={pt.x} cy={pt.y} r={7 / zoom} fill="#10b981" stroke="#fff" strokeWidth={1.5 / zoom} className="cursor-move" onMouseDown={e => { e.stopPropagation(); setDragged({ id: anno.id, idx: vIdx }); }} />
                    ))}
                    {a.points.length > 0 && (
                      <g transform={`translate(${a.points[0].x}, ${a.points[0].y - 12 / zoom})`}>
                        <rect x={-45 / zoom} y={-10 / zoom} width={90 / zoom} height={20 / zoom} rx={3 / zoom} fill="#0f172a" stroke={sel ? "#10b981" : "#3b82f6"} strokeWidth={1 / zoom} />
                        <text x={0} y={4 / zoom} textAnchor="middle" fill="#fff" fontSize={`${9 / zoom}px`} fontWeight="bold">{a.areaLabel} ({a.realAreaM2.toFixed(2)}m²)</text>
                      </g>
                    )}
                  </g>
                );
              } else if (anno.type === "note" || anno.type === "label") {
                const n = anno as BlueprintNoteAnnotation;
                return (
                  <g key={anno.id} onClick={e => { e.stopPropagation(); setSelectedId(anno.id); }} className="cursor-pointer">
                    <rect x={n.position.x - 5 / zoom} y={n.position.y - 10 / zoom} width={(n.text.length * 6.5 + 12) / zoom} height={20 / zoom} rx={4 / zoom} fill={anno.type === "label" ? "#1e293b" : "#475569"} stroke={sel ? "#10b981" : "#64748b"} strokeWidth={1.5 / zoom} />
                    <text x={n.position.x + 3 / zoom} y={n.position.y + 3 / zoom} fill="#f8fafc" fontSize={`${10 / zoom}px`}>{n.text}</text>
                  </g>
                );
              }
              return null;
            })}

            {clickPoints.length > 0 && (
              <g className="stroke-amber-400 fill-amber-400">
                {clickPoints.map((pt, idx) => <circle key={idx} cx={pt.x} cy={pt.y} r={6 / zoom} />)}
                {clickPoints.length === 1 && tempPoint && (
                  <line x1={clickPoints[0].x} y1={clickPoints[0].y} x2={tempPoint.x} y2={tempPoint.y} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom},${3 / zoom}`} />
                )}
                {activeTool === "polygon" && clickPoints.length >= 2 && tempPoint && (
                  <>
                    {clickPoints.map((pt, idx) => idx === clickPoints.length - 1 ? null : (
                      <line key={idx} x1={pt.x} y1={pt.y} x2={clickPoints[idx + 1].x} y2={clickPoints[idx + 1].y} strokeWidth={2 / zoom} />
                    ))}
                    <line x1={clickPoints[clickPoints.length - 1].x} y1={clickPoints[clickPoints.length - 1].y} x2={tempPoint.x} y2={tempPoint.y} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom},${3 / zoom}`} />
                  </>
                )}
              </g>
            )}
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-slate-400">
          <Move className="h-12 w-12 text-slate-600 mb-3 animate-pulse" />
          <p className="text-sm font-semibold">No Blueprint Uploaded</p>
          <p className="text-xs text-slate-500 mt-1">Please select and upload a PNG/JPEG drawing.</p>
        </div>
      )}
      {selectedId && (
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 shadow-xl text-xs backdrop-blur-md">
          <span className="text-slate-400 font-mono">Selected: {blueprint.annotations.find((a: BlueprintAnnotation) => a.id === selectedId)?.type}</span>
          <button type="button" onClick={() => { onDeleteAnnotation(selectedId); setSelectedId(null); }} className="flex items-center gap-1 text-red-400 hover:text-red-300 font-bold ml-2 hover:bg-slate-800 p-1 rounded">
            <Trash2 size={13} /> <span>Delete</span>
          </button>
          <button type="button" onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white ml-1 p-1"><X size={13} /></button>
        </div>
      )}
      {showInput && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h4 className="text-sm font-bold text-white mb-3">
              {activeTool === "calibrate" ? "Enter Calibration Distance" : activeTool === "dimension" ? "Enter Actual Dimension Length" : "Enter Text Content"}
            </h4>
            {activeTool === "calibrate" || activeTool === "dimension" ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input type="number" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="e.g. 12000" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none" autoFocus />
                  <select value={inputUnit} onChange={e => setInputUnit(e.target.value as DimensionUnit)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none">
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </div>
            ) : (
              <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Type note or label..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500" autoFocus />
            )}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
              <button type="button" onClick={() => { setShowInput(false); setClickPoints([]); }} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">Cancel</button>
              <button type="button" onClick={handleConfirm} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
