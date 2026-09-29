"use client";

import React, { useId } from "react";
import {
  DocumentLayout,
  SmartFitSettings,
  SmartFitMode,
  PrintSettings,
  BorderContrastMode,
  MarginPreset,
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_SMART_FIT_SETTINGS,
  normalizePrintSettings,
  normalizeSmartFit,
} from "@/lib/documentDesigner";
import { computeIntelligentFitProfile } from "@/lib/documentLayoutEngine";
import { printCurrentDocument } from "@/lib/print";
import {
  Printer,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Eye,
  ShieldCheck,
  FileText,
  Palette,
  Contrast,
  LayoutTemplate,
} from "lucide-react";

interface PrintingSettingsSectionProps {
  layout: DocumentLayout;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
  sampleItemCount?: number;
  onPreviewActualSize?: () => void;
  onOpenTestSheet?: () => void;
}

const MARGIN_PRESETS: Record<MarginPreset, { label: string; top: number; bottom: number; left: number; right: number; desc: string }> = {
  office_safe: {
    label: "Office Laser/Inkjet Safe",
    top: 5,
    bottom: 6,
    left: 10,
    right: 10,
    desc: "Guarantees top/bottom borders stay inside printer hardware deadzones (3.5mm-5mm)",
  },
  standard: {
    label: "Standard Document",
    top: 8,
    bottom: 8,
    left: 12,
    right: 12,
    desc: "Balanced professional margins for corporate invoices and quotes",
  },
  minimal: {
    label: "Minimal / Full Bleed",
    top: 3.5,
    bottom: 4,
    left: 6,
    right: 6,
    desc: "Maximum printable area for borderless or wide-carriage printers",
  },
  custom: {
    label: "Custom Margins",
    top: 8,
    bottom: 8,
    left: 12,
    right: 12,
    desc: "User-defined margin values in millimeters",
  },
};

export default function PrintingSettingsSection({
  layout,
  onUpdatePageSettings,
  sampleItemCount = 15,
  onPreviewActualSize,
  onOpenTestSheet,
}: PrintingSettingsSectionProps) {
  const smartFit = normalizeSmartFit(layout.page?.smartFit);
  const printSettings = normalizePrintSettings(layout.page?.printSettings);
  const minFontId = useId();
  const minRowId = useId();

  const updatePrintSettings = (patch: Partial<PrintSettings>) => {
    onUpdatePageSettings({
      printSettings: {
        ...printSettings,
        ...patch,
      },
    });
  };

  const updateSmartFit = (patch: Partial<SmartFitSettings>) => {
    onUpdatePageSettings({
      smartFit: {
        ...smartFit,
        ...patch,
      },
    });
  };

  const handleOrientationChange = (orientation: "portrait" | "landscape") => {
    const isLandscape = orientation === "landscape";
    onUpdatePageSettings({
      orientation,
      widthMm: isLandscape ? 297 : 210,
      heightMm: isLandscape ? 210 : 297,
    });
  };

  const handleMarginPresetSelect = (preset: MarginPreset) => {
    if (preset === "custom") {
      updatePrintSettings({ marginPreset: "custom" });
      return;
    }
    const config = MARGIN_PRESETS[preset];
    onUpdatePageSettings({
      margins: {
        top: config.top,
        bottom: config.bottom,
        left: config.left,
        right: config.right,
      },
      printSettings: {
        ...printSettings,
        marginPreset: preset,
      },
    });
  };

  const handleResetDefaults = () => {
    onUpdatePageSettings({
      smartFit: JSON.parse(JSON.stringify(DEFAULT_SMART_FIT_SETTINGS)),
      printSettings: JSON.parse(JSON.stringify(DEFAULT_PRINT_SETTINGS)),
    });
  };

  // Evaluate fit capacity
  const fitSample = computeIntelligentFitProfile(layout, sampleItemCount);
  const fit30 = computeIntelligentFitProfile(layout, 30);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3.5 space-y-4 text-xs">
      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-500/10 text-blue-400">
            <Printer size={15} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-wide flex items-center gap-1.5">
              <span>Printing &amp; Physical Output</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                A4 Engine
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Hardware margin safety, print-safe borders, smart fit &amp; physical printer fidelity
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-blue-300 transition cursor-pointer"
          title="Reset to recommended printing defaults"
        >
          <RotateCcw size={11} />
          <span>Reset</span>
        </button>
      </div>

      {/* ── 1. Page Orientation (A4 Portrait / Landscape) ──────────────── */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <LayoutTemplate size={12} className="text-slate-400" />
          <span>Paper Format &amp; Orientation</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleOrientationChange("portrait")}
            className={`flex flex-col items-center justify-center py-2 px-3 rounded border text-xs font-medium transition cursor-pointer ${
              (layout.page.orientation || "portrait") === "portrait"
                ? "border-blue-500 bg-blue-500/15 text-blue-200 shadow-sm"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            <span className="font-bold">A4 Portrait</span>
            <span className="text-[9.5px] opacity-75">210 × 297 mm</span>
          </button>
          <button
            type="button"
            onClick={() => handleOrientationChange("landscape")}
            className={`flex flex-col items-center justify-center py-2 px-3 rounded border text-xs font-medium transition cursor-pointer ${
              layout.page.orientation === "landscape"
                ? "border-blue-500 bg-blue-500/15 text-blue-200 shadow-sm"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            <span className="font-bold">A4 Landscape</span>
            <span className="text-[9.5px] opacity-75">297 × 210 mm</span>
          </button>
        </div>
      </div>

      {/* ── 2. Smart One-Page Fit ────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={smartFit.enabled}
              onChange={(e) => updateSmartFit({ enabled: e.target.checked })}
              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
            />
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-400" />
              <span>Smart One-Page Fit</span>
            </span>
          </label>
          <span className="text-[10px] text-slate-400 font-mono">
            {smartFit.enabled ? "Active (8-30 items)" : "Off (Strict multi-page)"}
          </span>
        </div>

        {smartFit.enabled && (
          <div className="pl-5 space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "balanced", label: "Balanced", desc: "Progressive tiers" },
                  { id: "compact", label: "Compact", desc: "Prioritize 1-page" },
                  { id: "readability", label: "Readability", desc: "Larger text" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => updateSmartFit({ mode: mode.id as SmartFitMode })}
                  className={`py-1.5 px-2 rounded border text-[11px] font-semibold transition cursor-pointer text-center ${
                    smartFit.mode === mode.id
                      ? "border-amber-500 bg-amber-500/15 text-amber-200 shadow-sm"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                  }`}
                  title={mode.desc}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Minimum Font Size Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <label htmlFor={minFontId} className="text-slate-400">
                  Minimum Font Floor:
                </label>
                <span className="font-mono font-bold text-slate-200">
                  {smartFit.minFontSize.toFixed(1)}px / {((smartFit.minFontSize * 72) / 96).toFixed(1)}pt
                </span>
              </div>
              <input
                id={minFontId}
                type="range"
                min={6.5}
                max={9.5}
                step={0.1}
                value={smartFit.minFontSize}
                onChange={(e) => updateSmartFit({ minFontSize: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 bg-slate-800 h-1 rounded cursor-pointer"
              />
            </div>

            {/* Minimum Row Height Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <label htmlFor={minRowId} className="text-slate-400">
                  Minimum Row Height:
                </label>
                <span className="font-mono font-bold text-slate-200">
                  {smartFit.minRowHeight.toFixed(1)} mm
                </span>
              </div>
              <input
                id={minRowId}
                type="range"
                min={4.0}
                max={7.5}
                step={0.1}
                value={smartFit.minRowHeight}
                onChange={(e) => updateSmartFit({ minRowHeight: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 bg-slate-800 h-1 rounded cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Printer-Safe Margins & Hardware Deadzone ───────────────────── */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>Printer Margins &amp; Hardware Deadzone</span>
          </span>
          <span className="text-[9.5px] text-slate-400">
            {layout.page.margins.top}T / {layout.page.margins.bottom}B / {layout.page.margins.left}L / {layout.page.margins.right}R mm
          </span>
        </label>

        <div className="grid grid-cols-3 gap-1.5">
          {(["office_safe", "standard", "minimal"] as MarginPreset[]).map((presetKey) => {
            const p = MARGIN_PRESETS[presetKey];
            const isSelected = printSettings.marginPreset === presetKey;
            return (
              <button
                key={presetKey}
                type="button"
                onClick={() => handleMarginPresetSelect(presetKey)}
                className={`py-1.5 px-2 rounded border text-[10.5px] font-semibold transition cursor-pointer text-center ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-200 shadow-sm"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                }`}
                title={p.desc}
              >
                {p.label.split(" ")[0]}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300 pt-1">
          <input
            type="checkbox"
            checked={printSettings.printerSafeMargins}
            onChange={(e) => updatePrintSettings({ printerSafeMargins: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer"
          />
          <span>Inset Top &amp; Bottom Borders Inside Hardware Margins (≥ 3.5mm)</span>
        </label>
      </div>

      {/* ── 4. Border Thickness & Physical Contrast ────────────────────────── */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Contrast size={13} className="text-blue-400" />
          <span>Physical Border Contrast (Laser / Inkjet)</span>
        </label>
        <p className="text-[10px] text-slate-400">
          Prevents pale 1px card/table borders from disappearing during black-and-white toner printing
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "standard", label: "Standard", desc: "#CBD5E1 Slate-300" },
              { id: "high", label: "High Contrast", desc: "#64748B Slate-500 (Recommended for Paper)" },
              { id: "maximum", label: "Maximum B&W", desc: "#1E293B Slate-800 Solid" },
            ] as const
          ).map((cMode) => (
            <button
              key={cMode.id}
              type="button"
              onClick={() => updatePrintSettings({ borderContrast: cMode.id as BorderContrastMode })}
              className={`py-1.5 px-2 rounded border text-[10.5px] font-semibold transition cursor-pointer text-center ${
                printSettings.borderContrast === cMode.id
                  ? "border-blue-500 bg-blue-500/15 text-blue-200 shadow-sm"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
              }`}
              title={cMode.desc}
            >
              {cMode.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 5. Color vs Grayscale Mode ────────────────────────────────────── */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Palette size={13} className="text-amber-400" />
          <span>Print Color Palette</span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updatePrintSettings({ colorMode: "color" })}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded border text-xs font-semibold transition cursor-pointer ${
              printSettings.colorMode === "color"
                ? "border-amber-500 bg-amber-500/15 text-amber-200 shadow-sm"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-blue-600" />
            <span>Full Brand Color</span>
          </button>
          <button
            type="button"
            onClick={() => updatePrintSettings({ colorMode: "grayscale" })}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded border text-xs font-semibold transition cursor-pointer ${
              printSettings.colorMode === "grayscale"
                ? "border-slate-400 bg-slate-700/50 text-slate-100 shadow-sm"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
            <span>Grayscale / Monochrome</span>
          </button>
        </div>

        {/* Printer Friendly Toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300 pt-1">
          <input
            type="checkbox"
            checked={printSettings.printerFriendlyMode}
            onChange={(e) => updatePrintSettings({ printerFriendlyMode: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
          />
          <span>Printer-Friendly Mode (Zero solid dark fills, saves toner, works without background graphics)</span>
        </label>
      </div>

      {/* ── 6. Live Capacity & Readiness Status ──────────────────────────── */}
      <div className="rounded border border-slate-800/80 bg-slate-900/50 p-2.5 space-y-1.5 text-[10.5px]">
        <div className="flex items-center justify-between font-bold">
          <span className="text-slate-300 flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Single-Page A4 Readiness:</span>
          </span>
          <span className="text-emerald-400 font-mono">Up to 30 items</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-slate-400 text-[10px]">
          <div>
            15 Items: <span className="font-bold text-slate-200">{fitSample.fits ? "1 A4 Page" : "2 Pages"}</span> ({fitSample.level})
          </div>
          <div>
            30 Items: <span className="font-bold text-slate-200">{fit30.fits ? "1 A4 Page" : "2 Pages"}</span> ({fit30.level})
          </div>
        </div>
      </div>

      {/* ── 7. Quick Actions: Preview, Print, and Test Sheet ─────────────── */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {onPreviewActualSize && (
            <button
              type="button"
              onClick={onPreviewActualSize}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer shadow-sm"
            >
              <Eye size={14} className="text-blue-400" />
              <span>Print Preview</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void printCurrentDocument()}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow"
          >
            <Printer size={14} />
            <span>Print / Save PDF</span>
          </button>
        </div>

        {/* Physical Print Calibration Sheet Button */}
        {onOpenTestSheet && (
          <button
            type="button"
            onClick={onOpenTestSheet}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
          >
            <FileText size={13} />
            <span>Print Physical Printer Test Sheet (Margin Rulers &amp; Bars)</span>
          </button>
        )}
      </div>
    </div>
  );
}
