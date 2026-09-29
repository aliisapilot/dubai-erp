"use client";

import React, { useId } from "react";
import {
  DocumentLayout,
  PageDecorativeBorder,
  PageBorderSettings,
  DEFAULT_PAGE_BORDERS,
  normalizePageBorders,
  DecorativeBorderStyle,
  CustomDecorativeBorderSubtype,
} from "@/lib/documentDesigner";
import { calculateBorderClearances } from "../documents/PageDecorativeBorders";
import {
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";

interface PageBorderSectionProps {
  layout: DocumentLayout;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
}

const CORPORATE_SWATCHES = [
  { name: "Gold (#E0AC23)", color: "#E0AC23" },
  { name: "Navy Blue (#173C64)", color: "#173C64" },
  { name: "Dark Slate (#0F172A)", color: "#0F172A" },
  { name: "Emerald (#065F46)", color: "#065F46" },
  { name: "Crimson (#7F1D1D)", color: "#7F1D1D" },
  { name: "Indigo (#312E81)", color: "#312E81" },
  { name: "Pure White (#FFFFFF)", color: "#FFFFFF" },
  { name: "Slate (#64748B)", color: "#64748B" },
];

export default function PageBorderSection({
  layout,
  onUpdatePageSettings,
}: PageBorderSectionProps) {
  const borders = normalizePageBorders(layout.page?.borders);
  const { top, bottom } = borders;
  const pageBg = layout.page?.background || "#FFFFFF";

  const { minContentY, safeTopLimitMm, maxContentY, safeBottomLimitMm } =
    calculateBorderClearances(layout);

  const updateBorders = (patch: Partial<PageBorderSettings>) => {
    onUpdatePageSettings({
      borders: {
        ...borders,
        ...patch,
      },
    });
  };

  const updateTop = (patch: Partial<PageDecorativeBorder>) => {
    updateBorders({
      top: {
        ...top,
        ...patch,
      },
    });
  };

  const updateBottom = (patch: Partial<PageDecorativeBorder>) => {
    updateBorders({
      bottom: {
        ...bottom,
        ...patch,
      },
    });
  };

  const handleResetDefaults = () => {
    onUpdatePageSettings({
      background: "#FFFFFF",
      borders: JSON.parse(JSON.stringify(DEFAULT_PAGE_BORDERS)),
    });
  };

  const handleSwapColors = () => {
    const prevTopColor = top.color;
    const prevBottomColor = bottom.color;
    onUpdatePageSettings({
      borders: {
        ...borders,
        top: { ...top, color: prevBottomColor, secondaryColor: prevTopColor },
        bottom: { ...bottom, color: prevTopColor, secondaryColor: prevBottomColor },
      },
    });
  };

  const bgInputId = useId();

  return (
    <div className="pt-4 border-t border-slate-800 space-y-4">
      {/* ── Section Title & Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/10 text-amber-400">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-wide">
              Page Border &amp; Background Design
            </h3>
            <p className="text-[10px] text-slate-400">
              Gold &amp; Navy decorative borders &amp; page background
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-amber-300 transition cursor-pointer"
          title="Reset borders to default Gold (#E0AC23) and Navy (#173C64)"
        >
          <RotateCcw size={11} />
          <span>Reset</span>
        </button>
      </div>

      {/* ── Main Document Background Setting ──────────────────────────────── */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor={bgInputId} className="text-[11px] font-bold text-slate-200 cursor-pointer">
            Main Document Background
          </label>
          <div className="flex items-center gap-2">
            <input
              id={bgInputId}
              type="color"
              value={pageBg.startsWith("#") ? pageBg : "#FFFFFF"}
              onChange={(e) => onUpdatePageSettings({ background: e.target.value })}
              className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-400 uppercase">
              {pageBg}
            </span>
            {pageBg.toUpperCase() !== "#FFFFFF" && (
              <button
                type="button"
                onClick={() => onUpdatePageSettings({ background: "#FFFFFF" })}
                className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-amber-400 hover:bg-slate-700 transition"
              >
                Reset White
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Main document background is preserved in pure white for crisp, high-contrast
          A4 prints and UAE official tax invoice guidelines.
        </p>
      </div>

      {/* ── TOP DECORATIVE BORDER ─────────────────────────────────────────── */}
      <BorderControlCard
        title="Top Decorative Border"
        defaultColor="#E0AC23"
        defaultColorName="Gold"
        border={top}
        onUpdate={updateTop}
        positionLabel="Top Margin Offset (mm)"
        safeNoticeText={`Safe clearance: content/logo begins at ${minContentY.toFixed(1)}mm (max safe border: ${safeTopLimitMm.toFixed(1)}mm)`}
      />

      {/* ── BOTTOM DECORATIVE BORDER ──────────────────────────────────────── */}
      <BorderControlCard
        title="Bottom Decorative Border"
        defaultColor="#173C64"
        defaultColorName="Navy Blue"
        border={bottom}
        onUpdate={updateBottom}
        positionLabel="Bottom Margin Offset (mm)"
        safeNoticeText={`Safe clearance: footer ends at ${maxContentY.toFixed(1)}mm (max safe border: ${(297 - safeBottomLimitMm).toFixed(1)}mm)`}
      />

      {/* ── Auto-Clearance Guard Assurance Banner ─────────────────────────── */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 flex items-start gap-2 text-emerald-300">
        <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold text-emerald-200">
            Auto-Clearance Guard Active
          </p>
          <p className="text-[9px] text-emerald-400/90 leading-normal">
            Borders are automatically constrained to guarantee they NEVER overlap
            your company logo, invoice tables, authorized signatures, or footer.
          </p>
        </div>
      </div>

      {/* ── Swap Colors Quick Action ──────────────────────────────────────── */}
      <div className="pt-1 flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={handleSwapColors}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer w-full justify-center"
        >
          <ArrowUpDown size={12} className="text-amber-400" />
          <span>Swap Top &amp; Bottom Border Colors</span>
        </button>
      </div>
    </div>
  );
}

// ── Border Control Card Subcomponent ──────────────────────────────────────────
function BorderControlCard({
  title,
  defaultColor,
  defaultColorName,
  border,
  onUpdate,
  positionLabel,
  safeNoticeText,
}: {
  title: string;
  defaultColor: string;
  defaultColorName: string;
  border: PageDecorativeBorder;
  onUpdate: (patch: Partial<PageDecorativeBorder>) => void;
  positionLabel: string;
  safeNoticeText: string;
}) {
  const isEnabled = border.enabled;
  const isCustom = border.style === "custom";
  const colorInputId = useId();

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isEnabled
          ? "border-slate-700 bg-slate-900/90"
          : "border-slate-800/80 bg-slate-950/40 opacity-70"
      } p-3 space-y-3`}
    >
      {/* Header with Enable Switch */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/20"
            style={{ backgroundColor: border.color || defaultColor }}
          />
          <span className="text-[11px] font-bold text-slate-200">{title}</span>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
          <span className="ml-1.5 text-[10px] font-semibold text-slate-400 peer-checked:text-emerald-400">
            {isEnabled ? "Enabled" : "Off"}
          </span>
        </label>
      </div>

      {isEnabled && (
        <div className="space-y-3 pt-1">
          {/* Style Selector: Straight | Diagonal | Custom */}
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wide">
              Border Style
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
              {(["straight", "diagonal", "custom"] as DecorativeBorderStyle[]).map((styleOpt) => (
                <button
                  key={styleOpt}
                  type="button"
                  onClick={() => onUpdate({ style: styleOpt })}
                  className={`py-1 rounded font-semibold capitalize transition ${
                    border.style === styleOpt
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {styleOpt}
                </button>
              ))}
            </div>
          </div>

          {/* If Custom: Subtype options */}
          {isCustom && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-2">
              <label className="text-[10px] text-slate-300 block font-semibold">
                Custom Style Preset
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                {[
                  { id: "geometric_ribbon", label: "Geometric Ribbon" },
                  { id: "accent_corner", label: "Corner Accents" },
                  { id: "double_stripe", label: "Double Stripe" },
                  { id: "wave", label: "Smooth Wave" },
                  { id: "custom_path", label: "Custom SVG Path" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onUpdate({
                        customSubtype: preset.id as CustomDecorativeBorderSubtype,
                      })
                    }
                    className={`px-2 py-1.5 rounded text-left transition ${
                      (border.customSubtype || "geometric_ribbon") === preset.id
                        ? "bg-blue-600/20 border border-blue-500 text-blue-300 font-bold"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {border.customSubtype === "custom_path" && (
                <div className="pt-1">
                  <label className="text-[9px] text-slate-400 block mb-1">
                    SVG Path Data (d=&quot;...&quot;)
                  </label>
                  <input
                    type="text"
                    value={border.customSvgPath || ""}
                    onChange={(e) => onUpdate({ customSvgPath: e.target.value })}
                    placeholder="M 0,0 L 210,0 L 210,5 Z"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-[9px] text-white"
                  />
                </div>
              )}

              {/* Secondary Color for Dual-Accent Styles */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400">Accent Detail Color</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={border.secondaryColor || (defaultColor === "#E0AC23" ? "#173C64" : "#E0AC23")}
                    onChange={(e) => onUpdate({ secondaryColor: e.target.value })}
                    className="w-5 h-5 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    {border.secondaryColor || (defaultColor === "#E0AC23" ? "#173C64" : "#E0AC23")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Color Setting */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={colorInputId} className="text-[10px] text-slate-400 font-semibold cursor-pointer">
                Primary Border Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={colorInputId}
                  type="color"
                  value={border.color || defaultColor}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-300 font-bold uppercase">
                  {border.color || defaultColor}
                </span>
                {border.color?.toUpperCase() !== defaultColor.toUpperCase() && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ color: defaultColor })}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 hover:bg-slate-700 transition"
                  >
                    Set {defaultColorName}
                  </button>
                )}
              </div>
            </div>

            {/* Quick Swatches */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {CORPORATE_SWATCHES.map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  onClick={() => onUpdate({ color: swatch.color })}
                  title={swatch.name}
                  className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                    (border.color || defaultColor).toLowerCase() === swatch.color.toLowerCase()
                      ? "ring-2 ring-amber-400 scale-110 border-white"
                      : "border-slate-700"
                  }`}
                  style={{ backgroundColor: swatch.color }}
                />
              ))}
            </div>
          </div>

          {/* Thickness (mm) */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-400 font-semibold">Thickness (mm)</span>
              <span className="font-mono font-bold text-amber-300">
                {(border.thickness || 4).toFixed(1)} mm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={border.thickness || 4}
                onChange={(e) => onUpdate({ thickness: Number(e.target.value) || 0.5 })}
                className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={border.thickness || 4}
                onChange={(e) => onUpdate({ thickness: Number(e.target.value) || 0.5 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
            <p className="text-[9px] text-slate-500 mt-1">{safeNoticeText}</p>
          </div>

          {/* Position (mm offset) */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-400 font-semibold">{positionLabel}</span>
              <span className="font-mono font-bold text-slate-300">
                {(border.position || 0).toFixed(1)} mm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={25}
                step={0.5}
                value={border.position || 0}
                onChange={(e) => onUpdate({ position: Number(e.target.value) || 0 })}
                className="flex-1 accent-blue-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={25}
                step={0.5}
                value={border.position || 0}
                onChange={(e) => onUpdate({ position: Number(e.target.value) || 0 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
            {/* Quick Position Presets */}
            <div className="flex items-center gap-1.5 pt-1.5">
              <button
                type="button"
                onClick={() => onUpdate({ position: 0 })}
                className={`text-[9px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  (border.position || 0) === 0
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
                title="Full-bleed edge-to-edge for digital PDF export"
              >
                Full-Bleed (0 mm)
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ position: 3.5 })}
                className={`text-[9px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  (border.position || 0) === 3.5
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
                title="Printer safe margin for physical office desktop printers (prevents roller clipping)"
              >
                Printer-Safe (3.5 mm)
              </button>
            </div>
          </div>

          {/* Rotation Angle (degrees) */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-400 font-semibold">Rotation Angle (degrees)</span>
              <span className="font-mono font-bold text-slate-300">
                {border.angle || 0}°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={border.angle || 0}
                onChange={(e) => onUpdate({ angle: Number(e.target.value) || 0 })}
                className="flex-1 accent-purple-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={-45}
                max={45}
                step={1}
                value={border.angle || 0}
                onChange={(e) => onUpdate({ angle: Number(e.target.value) || 0 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
          </div>

          {/* Opacity */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-400 font-semibold">Opacity</span>
              <span className="font-mono font-bold text-slate-300">
                {Math.round((border.opacity ?? 1) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={border.opacity ?? 1}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) || 1 })}
                className="flex-1 accent-teal-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={10}
                max={100}
                step={5}
                value={Math.round((border.opacity ?? 1) * 100)}
                onChange={(e) =>
                  onUpdate({ opacity: Math.max(0.1, Math.min(1.0, (Number(e.target.value) || 100) / 100)) })
                }
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
