"use client";

import React, { useId } from "react";
import {
  DocumentLayout,
  SmartFitSettings,
  SmartFitMode,
  DEFAULT_SMART_FIT_SETTINGS,
  normalizeSmartFit,
} from "@/lib/documentDesigner";
import { computeIntelligentFitProfile } from "@/lib/documentLayoutEngine";
import {
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from "lucide-react";

interface SmartFitSectionProps {
  layout: DocumentLayout;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
  sampleItemCount?: number;
  onPreviewActualSize?: () => void;
}

export default function SmartFitSection({
  layout,
  onUpdatePageSettings,
  sampleItemCount = 4,
  onPreviewActualSize,
}: SmartFitSectionProps) {
  const smartFit = normalizeSmartFit(layout.page?.smartFit);
  const minFontId = useId();
  const minRowId = useId();

  const updateSmartFit = (patch: Partial<SmartFitSettings>) => {
    onUpdatePageSettings({
      smartFit: {
        ...smartFit,
        ...patch,
      },
    });
  };

  const handleResetDefaults = () => {
    onUpdatePageSettings({
      smartFit: JSON.parse(JSON.stringify(DEFAULT_SMART_FIT_SETTINGS)),
    });
  };

  // Evaluate fit status with sample items and up to 30 items
  const currentFit = computeIntelligentFitProfile(layout, sampleItemCount);
  const fit30 = computeIntelligentFitProfile(layout, 30);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 space-y-4 text-xs">
      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/10 text-amber-400">
            <Sparkles size={15} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-wide flex items-center gap-1.5">
              <span>Smart One-Page Fit (A4)</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Auto
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Dynamically tightens whitespace, rows &amp; follower cards to keep documents on 1 A4 page
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-amber-300 transition cursor-pointer"
          title="Reset Smart Fit settings to defaults"
        >
          <RotateCcw size={11} />
          <span>Reset</span>
        </button>
      </div>

      {/* ── Master Enable Toggle ────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-800 bg-slate-900/80">
        <div>
          <span className="text-[11px] font-bold text-slate-200 block">
            Smart One-Page Auto-Fitting
          </span>
          <span className="text-[10px] text-slate-400">
            {smartFit.enabled
              ? "Active — Dynamically compacts up to 30 items onto 1 A4 page"
              : "Disabled — Standard fixed row heights and static pagination"}
          </span>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={smartFit.enabled}
            onChange={(e) => updateSmartFit({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {smartFit.enabled && (
        <div className="space-y-3.5 pt-1">
          {/* ── Mode Selector: Compact / Balanced / Readability ──────────── */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              Fit Strategy &amp; Priority
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
              {(
                [
                  { id: "compact", label: "Compact", desc: "Max items (up to 30+)" },
                  { id: "balanced", label: "Balanced", desc: "Default optimal balance" },
                  { id: "readability", label: "Readability", desc: "Prioritizes larger fonts" },
                ] as Array<{ id: SmartFitMode; label: string; desc: string }>
              ).map((modeOpt) => (
                <button
                  key={modeOpt.id}
                  type="button"
                  onClick={() => updateSmartFit({ mode: modeOpt.id })}
                  className={`py-1.5 px-2 rounded text-center transition-all cursor-pointer ${
                    smartFit.mode === modeOpt.id
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                  title={modeOpt.desc}
                >
                  <div className="text-[10px] leading-tight">{modeOpt.label}</div>
                  <div className="text-[8px] text-slate-500 leading-none mt-0.5">{modeOpt.desc.split(" ")[0]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Minimum Font Size (pt) ──────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <label htmlFor={minFontId} className="text-slate-300 font-semibold cursor-pointer">
                Minimum Font Size
              </label>
              <span className="font-mono font-bold text-amber-300">
                {smartFit.minFontSize.toFixed(1)} pt
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={minFontId}
                type="range"
                min={6.5}
                max={9.5}
                step={0.5}
                value={smartFit.minFontSize}
                onChange={(e) => updateSmartFit({ minFontSize: Number(e.target.value) || 7.5 })}
                className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={6.5}
                max={9.5}
                step={0.5}
                value={smartFit.minFontSize}
                onChange={(e) => updateSmartFit({ minFontSize: Number(e.target.value) || 7.5 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
            <p className="text-[9px] text-slate-500 mt-1">
              Smart Fit will never shrink table item text smaller than this limit.
            </p>
          </div>

          {/* ── Minimum Row Height (mm) ─────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <label htmlFor={minRowId} className="text-slate-300 font-semibold cursor-pointer">
                Minimum Row Height
              </label>
              <span className="font-mono font-bold text-amber-300">
                {smartFit.minRowHeight.toFixed(1)} mm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={minRowId}
                type="range"
                min={4.0}
                max={8.0}
                step={0.2}
                value={smartFit.minRowHeight}
                onChange={(e) => updateSmartFit({ minRowHeight: Number(e.target.value) || 4.8 })}
                className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={4.0}
                max={8.0}
                step={0.2}
                value={smartFit.minRowHeight}
                onChange={(e) => updateSmartFit({ minRowHeight: Number(e.target.value) || 4.8 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
            <p className="text-[9px] text-slate-500 mt-1">
              Guarantees adequate touch target and line-height for clean printing.
            </p>
          </div>

          {/* ── Toggle Switches: Automatic Spacing & Print-Safe Borders ──── */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between cursor-pointer p-2 rounded bg-slate-900/60 border border-slate-800/80">
              <div className="pr-2">
                <span className="text-[10px] font-semibold text-slate-200 block">
                  Automatic Whitespace Reduction
                </span>
                <span className="text-[9px] text-slate-400">
                  Tightens header and follower gaps progressively as items increase
                </span>
              </div>
              <input
                type="checkbox"
                checked={smartFit.automaticSpacing}
                onChange={(e) => updateSmartFit({ automaticSpacing: e.target.checked })}
                className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer p-2 rounded bg-slate-900/60 border border-slate-800/80">
              <div className="pr-2">
                <span className="text-[10px] font-semibold text-slate-200 block">
                  Print-Safe Borders &amp; Margins
                </span>
                <span className="text-[9px] text-slate-400">
                  Enforces solid section borders and protects physical printer roller margins
                </span>
              </div>
              <input
                type="checkbox"
                checked={smartFit.printSafeBorders}
                onChange={(e) => updateSmartFit({ printSafeBorders: e.target.checked })}
                className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>

          {/* ── Live Single-Page Capacity Status ────────────────────────── */}
          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/90 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300">
                Single-Page Fit Status:
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold ${
                  currentFit.fits
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                {currentFit.fits ? (
                  <>
                    <CheckCircle2 size={11} />
                    <span>1 Page A4 Guaranteed</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={11} />
                    <span>Multi-Page Required</span>
                  </>
                )}
              </span>
            </div>

            <div className="text-[9.5px] text-slate-400 flex justify-between">
              <span>Current sample ({sampleItemCount} items):</span>
              <span className="font-mono text-slate-200">
                Tier: <strong className="text-amber-300 uppercase">{currentFit.level}</strong> ({currentFit.totalContentBottom.toFixed(1)}mm / 275mm)
              </span>
            </div>

            <div className="text-[9.5px] text-slate-400 flex justify-between">
              <span>30 Items stress-test:</span>
              <span className="font-mono text-slate-200">
                {fit30.fits ? (
                  <span className="text-emerald-400 font-bold">✓ 30 Items fit on 1 Page ({fit30.totalContentBottom.toFixed(1)}mm)</span>
                ) : (
                  <span className="text-amber-400">Paginates cleanly to 2 pages</span>
                )}
              </span>
            </div>

            {onPreviewActualSize && (
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={onPreviewActualSize}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition text-[10px] font-bold border border-slate-700 cursor-pointer"
                >
                  <Eye size={12} className="text-amber-400" />
                  <span>Preview Actual Printed Size (100%)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
