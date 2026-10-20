"use client";

import React, { useId, useState } from "react";
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
  Lock,
  Unlock,
  Square,
  Ruler,
  Minus,
  Plus,
} from "lucide-react";

interface PageBorderSectionProps {
  layout: DocumentLayout;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
  selectedBorderId?: string | null;
  snapGrid?: boolean;
  onToggleSnapGrid?: () => void;
  snapMargins?: boolean;
  onToggleSnapMargins?: () => void;
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
  selectedBorderId,
  snapGrid = true,
  onToggleSnapGrid,
  snapMargins = true,
  onToggleSnapMargins,
}: PageBorderSectionProps) {
  const borders = normalizePageBorders(layout.page?.borders);
  const { top, bottom, left, right } = borders;
  const pageBg = layout.page?.background || "#FFFFFF";
  const margins = layout.page?.margins || { top: 10, bottom: 10, left: 10, right: 10 };
  const pw = layout.page?.widthMm || 210;
  const ph = layout.page?.heightMm || 297;

  const [userTab, setUserTab] = useState<
    "all" | "top" | "bottom" | "left" | "right" | "margins" | null
  >(null);
  const [prevSelectedBorderId, setPrevSelectedBorderId] = useState<string | null>(
    selectedBorderId || null
  );

  if (selectedBorderId !== prevSelectedBorderId) {
    setPrevSelectedBorderId(selectedBorderId || null);
    setUserTab(null);
  }

  const activeBorderTab =
    userTab ||
    (selectedBorderId === "border_top"
      ? "top"
      : selectedBorderId === "border_bottom"
      ? "bottom"
      : selectedBorderId === "border_left"
      ? "left"
      : selectedBorderId === "border_right"
      ? "right"
      : "all");

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

  const updateLeft = (patch: Partial<PageDecorativeBorder>) => {
    updateBorders({
      left: {
        ...left,
        ...patch,
      },
    });
  };

  const updateRight = (patch: Partial<PageDecorativeBorder>) => {
    updateBorders({
      right: {
        ...right,
        ...patch,
      },
    });
  };

  const updateMargin = (side: "top" | "bottom" | "left" | "right", value: number) => {
    const clamped = Math.max(0, Math.min(60, Math.round(value * 10) / 10));
    onUpdatePageSettings({
      margins: {
        ...margins,
        [side]: clamped,
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

  const handleCreateFramingBorder = () => {
    const frameColor = top.color || "#E0AC23";
    const frameThick = Math.min(3, Math.max(1, top.thickness || 2));
    onUpdatePageSettings({
      borders: {
        top: {
          ...top,
          enabled: true,
          style: "solid",
          color: frameColor,
          thickness: frameThick,
          position: 0,
          widthMode: "full",
        },
        bottom: {
          ...bottom,
          enabled: true,
          style: "solid",
          color: frameColor,
          thickness: frameThick,
          position: 0,
          widthMode: "full",
        },
        left: {
          ...left,
          enabled: true,
          style: "solid",
          color: frameColor,
          thickness: frameThick,
          position: 0,
          y: 0,
          length: ph,
        },
        right: {
          ...right,
          enabled: true,
          style: "solid",
          color: frameColor,
          thickness: frameThick,
          position: 0,
          y: 0,
          length: ph,
        },
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
              Page &amp; Borders Control
            </h3>
            <p className="text-[10px] text-slate-400">
              Independent 4-side borders, margins &amp; guides
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
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* ── Border Focus Sub-Tabs ─────────────────────────────────────────── */}
      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 text-[10px] overflow-x-auto">
        <button
          type="button"
          onClick={() => setUserTab("all")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition ${
            activeBorderTab === "all"
              ? "bg-slate-800 text-white shadow-sm border border-slate-700"
              : "text-slate-400 hover:text-white"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setUserTab("top")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
            activeBorderTab === "top"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: top.enabled ? (top.color || "#E0AC23") : "#475569" }}
          />
          <span>Top</span>
        </button>
        <button
          type="button"
          onClick={() => setUserTab("bottom")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
            activeBorderTab === "bottom"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: bottom.enabled ? (bottom.color || "#173C64") : "#475569" }}
          />
          <span>Bottom</span>
        </button>
        <button
          type="button"
          onClick={() => setUserTab("left")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
            activeBorderTab === "left"
              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: left.enabled ? (left.color || "#CBD5E1") : "#475569" }}
          />
          <span>Left</span>
        </button>
        <button
          type="button"
          onClick={() => setUserTab("right")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
            activeBorderTab === "right"
              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: right.enabled ? (right.color || "#CBD5E1") : "#475569" }}
          />
          <span>Right</span>
        </button>
        <button
          type="button"
          onClick={() => setUserTab("margins")}
          className={`flex-1 py-1 px-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
            activeBorderTab === "margins"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Ruler size={11} className="shrink-0" />
          <span>Margins</span>
        </button>
      </div>

      {/* ── Main Document Background Setting ──────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "margins") && (
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
            Preserved in pure white for crisp, high-contrast A4 prints and UAE official tax invoice guidelines.
          </p>
        </div>
      )}

      {/* ── TOP DECORATIVE BORDER ─────────────────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "top") && (
        <HorizontalBorderControlCard
          title="Top Page Border"
          borderId="border_top"
          defaultColor="#E0AC23"
          defaultColorName="Gold"
          border={top}
          onUpdate={updateTop}
          positionLabel="Top Margin Offset (mm)"
          safeNoticeText={`Safe clearance: content/logo begins at ${minContentY.toFixed(1)}mm (max safe border: ${safeTopLimitMm.toFixed(1)}mm)`}
          pageWidth={pw}
          margins={margins}
          isSelected={selectedBorderId === "border_top"}
        />
      )}

      {/* ── BOTTOM DECORATIVE BORDER ──────────────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "bottom") && (
        <HorizontalBorderControlCard
          title="Bottom Page Border"
          borderId="border_bottom"
          defaultColor="#173C64"
          defaultColorName="Navy Blue"
          border={bottom}
          onUpdate={updateBottom}
          positionLabel="Bottom Margin Offset (mm)"
          safeNoticeText={`Safe clearance: footer ends at ${maxContentY.toFixed(1)}mm (max safe border: ${(ph - safeBottomLimitMm).toFixed(1)}mm)`}
          pageWidth={pw}
          margins={margins}
          isSelected={selectedBorderId === "border_bottom"}
        />
      )}

      {/* ── LEFT DECORATIVE BORDER ────────────────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "left") && (
        <VerticalBorderControlCard
          title="Left Page Border"
          borderId="border_left"
          defaultColor="#CBD5E1"
          defaultColorName="Slate Border"
          border={left}
          onUpdate={updateLeft}
          positionLabel="Left Edge Distance (mm)"
          pageHeight={ph}
          margins={margins}
          isSelected={selectedBorderId === "border_left"}
        />
      )}

      {/* ── RIGHT DECORATIVE BORDER ───────────────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "right") && (
        <VerticalBorderControlCard
          title="Right Page Border"
          borderId="border_right"
          defaultColor="#CBD5E1"
          defaultColorName="Slate Border"
          border={right}
          onUpdate={updateRight}
          positionLabel="Right Edge Distance (mm)"
          pageHeight={ph}
          margins={margins}
          isSelected={selectedBorderId === "border_right"}
        />
      )}

      {/* ── PAGE MARGINS & SNAPPING SECTION ───────────────────────────────── */}
      {(activeBorderTab === "all" || activeBorderTab === "margins") && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Ruler size={13} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-slate-200">
                Page Margins &amp; Printable Area (mm)
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdatePageSettings({
                  margins: { top: 10, bottom: 10, left: 10, right: 10 },
                })
              }
              className="text-[9px] text-slate-400 hover:text-emerald-300 transition"
              title="Reset all margins to standard 10mm"
            >
              Reset 10mm
            </button>
          </div>

          {/* Quick Margin Presets */}
          <div className="grid grid-cols-4 gap-1 text-[9px]">
            {[
              { label: "Standard (10mm)", m: { top: 10, bottom: 10, left: 10, right: 10 } },
              { label: "Compact (8mm)", m: { top: 8, bottom: 8, left: 8, right: 8 } },
              { label: "Minimal (5mm)", m: { top: 5, bottom: 5, left: 5, right: 5 } },
              { label: "Office Safe", m: { top: 15, bottom: 15, left: 12, right: 12 } },
            ].map((preset) => {
              const isMatch =
                margins.top === preset.m.top &&
                margins.bottom === preset.m.bottom &&
                margins.left === preset.m.left &&
                margins.right === preset.m.right;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onUpdatePageSettings({ margins: preset.m })}
                  className={`py-1 rounded text-center transition cursor-pointer ${
                    isMatch
                      ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* 4 Margins Steppers & Sliders */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <MarginStepperInput
              label="Top Margin"
              value={margins.top}
              onChange={(val) => updateMargin("top", val)}
            />
            <MarginStepperInput
              label="Bottom Margin"
              value={margins.bottom}
              onChange={(val) => updateMargin("bottom", val)}
            />
            <MarginStepperInput
              label="Left Margin"
              value={margins.left}
              onChange={(val) => updateMargin("left", val)}
            />
            <MarginStepperInput
              label="Right Margin"
              value={margins.right}
              onChange={(val) => updateMargin("right", val)}
            />
          </div>

          {/* Guide & Snapping Toggles */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="text-[10px] font-semibold text-slate-400">
              Alignment Guides &amp; Canvas Snapping
            </div>
            <div className="flex flex-col gap-1.5 text-[10px]">
              {onToggleSnapMargins && (
                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <span>Show Content Margin Guides (dashed boundary)</span>
                  <input
                    type="checkbox"
                    checked={snapMargins}
                    onChange={onToggleSnapMargins}
                    className="rounded border-slate-700 bg-slate-800 accent-emerald-400 cursor-pointer"
                  />
                </label>
              )}
              {onToggleSnapGrid && (
                <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
                  <span>Snap Elements to Grid &amp; Margins</span>
                  <input
                    type="checkbox"
                    checked={snapGrid}
                    onChange={onToggleSnapGrid}
                    className="rounded border-slate-700 bg-slate-800 accent-amber-400 cursor-pointer"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-Clearance Guard Assurance Banner ─────────────────────────── */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 flex items-start gap-2 text-emerald-300">
        <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold text-emerald-200">
            Independent Boundary Control
          </p>
          <p className="text-[9px] text-emerald-400/90 leading-normal">
            Borders move freely on canvas without unintentionally shifting headers or footers.
            In manual mode, guides assist positioning without forcing automatic shrinkage.
          </p>
        </div>
      </div>

      {/* ── Quick Action Buttons ───────────────────────────────────────────── */}
      <div className="pt-1 grid grid-cols-2 gap-2 text-[10px]">
        <button
          type="button"
          onClick={handleSwapColors}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
        >
          <ArrowUpDown size={11} className="text-amber-400 shrink-0" />
          <span>Swap Top / Bottom Colors</span>
        </button>

        <button
          type="button"
          onClick={handleCreateFramingBorder}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          title="Enable all 4 borders with coordinated framing thickness and color"
        >
          <Square size={11} className="text-emerald-400 shrink-0" />
          <span>Create 4-Side Frame</span>
        </button>
      </div>
    </div>
  );
}

// ── Horizontal Border Control Card (Top / Bottom) ──────────────────────────────
function HorizontalBorderControlCard({
  title,
  borderId,
  defaultColor,
  defaultColorName,
  border,
  onUpdate,
  positionLabel,
  safeNoticeText,
  pageWidth,
  margins,
  isSelected,
}: {
  title: string;
  borderId: string;
  defaultColor: string;
  defaultColorName: string;
  border: PageDecorativeBorder;
  onUpdate: (patch: Partial<PageDecorativeBorder>) => void;
  positionLabel: string;
  safeNoticeText: string;
  pageWidth: number;
  margins: { top: number; bottom: number; left: number; right: number };
  isSelected?: boolean;
}) {
  const isEnabled = border.enabled;
  const isCustom = border.style === "custom";
  const colorInputId = useId();
  const hexInputId = useId();

  const widthMode = border.widthMode || "full";
  const currentWidth =
    widthMode === "margins"
      ? pageWidth - margins.left - margins.right
      : border.width ?? (pageWidth - (border.x ?? 0));

  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? "ring-2 ring-amber-400 border-amber-500 bg-slate-900"
          : isEnabled
          ? "border-slate-700 bg-slate-900/90"
          : "border-slate-800/80 bg-slate-950/40 opacity-70"
      } p-3 space-y-3`}
    >
      {/* Header with Enable Switch & Lock */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
            style={{ backgroundColor: border.color || defaultColor }}
          />
          <span className="text-[11px] font-bold text-slate-200 truncate">{title}</span>
          {isSelected && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40">
              Selected on Canvas
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUpdate({ locked: !border.locked })}
            className={`p-1 rounded hover:bg-slate-800 transition cursor-pointer ${
              border.locked ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title={border.locked ? "Unlock border position" : "Lock border position"}
          >
            {border.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>

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
      </div>

      {isEnabled && (
        <div className="space-y-3 pt-1">
          {/* Border Style Selection: Solid, Straight, Dashed, Dotted, Double, Diagonal, Custom */}
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wide">
              Border Style
            </label>
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
              {(
                [
                  { id: "solid", label: "Solid" },
                  { id: "dashed", label: "Dashed" },
                  { id: "dotted", label: "Dotted" },
                  { id: "double", label: "Double" },
                  { id: "straight", label: "Ribbon" },
                  { id: "diagonal", label: "Diagonal" },
                  { id: "custom", label: "Custom" },
                ] as { id: DecorativeBorderStyle; label: string }[]
              ).map((styleOpt) => (
                <button
                  key={styleOpt.id}
                  type="button"
                  onClick={() => onUpdate({ style: styleOpt.id })}
                  className={`py-1 rounded font-semibold capitalize transition ${
                    border.style === styleOpt.id ||
                    (border.style === "straight" && styleOpt.id === "solid")
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {styleOpt.label}
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

          {/* Color Setting with HEX input and Swatches */}
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
                <input
                  id={hexInputId}
                  type="text"
                  maxLength={7}
                  value={border.color || defaultColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("#") || val === "") onUpdate({ color: val });
                    else onUpdate({ color: `#${val}` });
                  }}
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-200 uppercase text-center"
                />
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

            {/* Quick Corporate Swatches */}
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

          {/* Position (Distance from edge in mm) */}
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
                max={50}
                step={0.5}
                value={border.position || 0}
                onChange={(e) => onUpdate({ position: Number(e.target.value) || 0 })}
                className="flex-1 accent-blue-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={50}
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
                title="Printer safe margin for physical office desktop printers"
              >
                Printer-Safe (3.5 mm)
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    position: borderId === "border_top" ? margins.top : margins.bottom,
                  })
                }
                className="text-[9px] px-2 py-0.5 rounded border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 cursor-pointer"
              >
                Content Margin ({borderId === "border_top" ? margins.top : margins.bottom} mm)
              </button>
            </div>
          </div>

          {/* Width & Horizontal Alignment */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-400 font-semibold">Border Width Mode</span>
              <span className="font-mono text-slate-300 font-bold">
                {Math.round(currentWidth * 10) / 10} mm
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
              {[
                { id: "full", label: "Full Width" },
                { id: "margins", label: "Within Margins" },
                { id: "custom", label: "Custom" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onUpdate({
                      widthMode: opt.id as "full" | "margins" | "custom",
                      ...(opt.id === "full" ? { x: 0, width: pageWidth } : {}),
                      ...(opt.id === "margins"
                        ? { x: margins.left, width: pageWidth - margins.left - margins.right }
                        : {}),
                    })
                  }
                  className={`py-1 rounded font-semibold transition ${
                    widthMode === opt.id
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom Width & X position controls */}
            {widthMode === "custom" && (
              <div className="mt-2 p-2 bg-slate-950/60 rounded border border-slate-800 space-y-2">
                <div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 mb-0.5">
                    <span>X Start Position</span>
                    <span className="font-mono text-white">{(border.x ?? 0).toFixed(1)} mm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={pageWidth - 10}
                      step={0.5}
                      value={border.x ?? 0}
                      onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}
                      className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min={0}
                      max={pageWidth - 10}
                      step={0.5}
                      value={border.x ?? 0}
                      onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}
                      className="w-12 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center font-mono text-[9px] text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 mb-0.5">
                    <span>Custom Width (Length)</span>
                    <span className="font-mono text-white">
                      {(border.width ?? pageWidth).toFixed(1)} mm
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={pageWidth}
                      step={0.5}
                      value={border.width ?? pageWidth}
                      onChange={(e) => onUpdate({ width: Number(e.target.value) || 10 })}
                      className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min={10}
                      max={pageWidth}
                      step={0.5}
                      value={border.width ?? pageWidth}
                      onChange={(e) => onUpdate({ width: Number(e.target.value) || 10 })}
                      className="w-12 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center font-mono text-[9px] text-white"
                    />
                  </div>
                </div>

                {/* Horizontal Alignment Presets */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[9px]">
                  <span className="text-slate-400">Align:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onUpdate({ x: margins.left, align: "left" })}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const w = border.width ?? (pageWidth - margins.left - margins.right);
                        onUpdate({ x: (pageWidth - w) / 2, align: "center" });
                      }}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                    >
                      Centre
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const w = border.width ?? (pageWidth - margins.left - margins.right);
                        onUpdate({ x: pageWidth - margins.right - w, align: "right" });
                      }}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                    >
                      Right
                    </button>
                  </div>
                </div>
              </div>
            )}
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

// ── Vertical Border Control Card (Left / Right) ────────────────────────────────
function VerticalBorderControlCard({
  title,
  borderId,
  defaultColor,
  defaultColorName,
  border,
  onUpdate,
  positionLabel,
  pageHeight,
  margins,
  isSelected,
}: {
  title: string;
  borderId: string;
  defaultColor: string;
  defaultColorName: string;
  border: PageDecorativeBorder;
  onUpdate: (patch: Partial<PageDecorativeBorder>) => void;
  positionLabel: string;
  pageHeight: number;
  margins: { top: number; bottom: number; left: number; right: number };
  isSelected?: boolean;
}) {
  const isEnabled = border.enabled;
  const colorInputId = useId();
  const hexInputId = useId();

  return (
    <div
      className={`rounded-lg border transition-all ${
        isSelected
          ? "ring-2 ring-indigo-400 border-indigo-500 bg-slate-900"
          : isEnabled
          ? "border-slate-700 bg-slate-900/90"
          : "border-slate-800/80 bg-slate-950/40 opacity-70"
      } p-3 space-y-3`}
    >
      {/* Header with Enable Switch & Lock */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
            style={{ backgroundColor: border.color || defaultColor }}
          />
          <span className="text-[11px] font-bold text-slate-200 truncate">{title}</span>
          {isSelected && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/40">
              Selected on Canvas
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUpdate({ locked: !border.locked })}
            className={`p-1 rounded hover:bg-slate-800 transition cursor-pointer ${
              border.locked ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title={border.locked ? "Unlock border position" : "Lock border position"}
          >
            {border.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>

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
      </div>

      {isEnabled && (
        <div className="space-y-3 pt-1">
          {/* Border Style Selector */}
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wide">
              Border Style
            </label>
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px]">
              {(
                [
                  { id: "solid", label: "Solid" },
                  { id: "dashed", label: "Dashed" },
                  { id: "dotted", label: "Dotted" },
                  { id: "double", label: "Double" },
                ] as { id: DecorativeBorderStyle; label: string }[]
              ).map((styleOpt) => (
                <button
                  key={styleOpt.id}
                  type="button"
                  onClick={() => onUpdate({ style: styleOpt.id })}
                  className={`py-1 rounded font-semibold capitalize transition ${
                    border.style === styleOpt.id ||
                    (border.style === "straight" && styleOpt.id === "solid")
                      ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {styleOpt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color with HEX and Swatches */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={colorInputId} className="text-[10px] text-slate-400 font-semibold cursor-pointer">
                Border Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={colorInputId}
                  type="color"
                  value={border.color || defaultColor}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <input
                  id={hexInputId}
                  type="text"
                  maxLength={7}
                  value={border.color || defaultColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("#") || val === "") onUpdate({ color: val });
                    else onUpdate({ color: `#${val}` });
                  }}
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-200 uppercase text-center"
                />
                {border.color?.toUpperCase() !== defaultColor.toUpperCase() && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ color: defaultColor })}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 transition"
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
                      ? "ring-2 ring-indigo-400 scale-110 border-white"
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
              <span className="font-mono font-bold text-indigo-300">
                {(border.thickness || 1).toFixed(1)} mm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={15}
                step={0.5}
                value={border.thickness || 1}
                onChange={(e) => onUpdate({ thickness: Number(e.target.value) || 0.5 })}
                className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0.5}
                max={15}
                step={0.5}
                value={border.thickness || 1}
                onChange={(e) => onUpdate({ thickness: Number(e.target.value) || 0.5 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
          </div>

          {/* Distance from edge */}
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
                max={50}
                step={0.5}
                value={border.position || 0}
                onChange={(e) => onUpdate({ position: Number(e.target.value) || 0 })}
                className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={border.position || 0}
                onChange={(e) => onUpdate({ position: Number(e.target.value) || 0 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
              />
            </div>
            <div className="flex items-center gap-1.5 pt-1.5">
              <button
                type="button"
                onClick={() => onUpdate({ position: 0 })}
                className={`text-[9px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  (border.position || 0) === 0
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
              >
                Page Edge (0 mm)
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    position: borderId === "border_left" ? margins.left : margins.right,
                  })
                }
                className="text-[9px] px-2 py-0.5 rounded border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 cursor-pointer"
              >
                Content Margin ({borderId === "border_left" ? margins.left : margins.right} mm)
              </button>
            </div>
          </div>

          {/* Starting Y Position & Length */}
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-400 font-semibold">Starting Y Position (mm)</span>
                <span className="font-mono text-slate-300 font-bold">
                  {(border.y ?? 0).toFixed(1)} mm
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={pageHeight - 20}
                  step={1}
                  value={border.y ?? 0}
                  onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}
                  className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={pageHeight - 20}
                  step={1}
                  value={border.y ?? 0}
                  onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}
                  className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-400 font-semibold">Border Length (mm)</span>
                <span className="font-mono text-slate-300 font-bold">
                  {(border.length ?? (pageHeight - (border.y ?? 0))).toFixed(1)} mm
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={pageHeight}
                  step={1}
                  value={border.length ?? (pageHeight - (border.y ?? 0))}
                  onChange={(e) => onUpdate({ length: Number(e.target.value) || 10 })}
                  className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <input
                  type="number"
                  min={10}
                  max={pageHeight}
                  step={1}
                  value={border.length ?? (pageHeight - (border.y ?? 0))}
                  onChange={(e) => onUpdate({ length: Number(e.target.value) || 10 })}
                  className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-center font-mono text-[10px] text-white"
                />
              </div>
              {/* Presets */}
              <div className="flex items-center gap-1.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => onUpdate({ y: 0, length: pageHeight })}
                  className="text-[9px] px-2 py-0.5 rounded border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 cursor-pointer"
                >
                  Full Height ({pageHeight} mm)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      y: margins.top,
                      length: pageHeight - margins.top - margins.bottom,
                    })
                  }
                  className="text-[9px] px-2 py-0.5 rounded border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 cursor-pointer"
                >
                  Within Margins
                </button>
              </div>
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
                className="flex-1 accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
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

// ── Margin Stepper Input Component ─────────────────────────────────────────────
function MarginStepperInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="bg-slate-900/90 rounded border border-slate-800 p-2 space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="font-mono text-emerald-400 font-bold">{value.toFixed(1)} mm</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          title="Decrease 1mm"
        >
          <Minus size={11} />
        </button>
        <input
          type="number"
          min={0}
          max={60}
          step={0.5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-[10px] text-white"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          title="Increase 1mm"
        >
          <Plus size={11} />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={50}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full accent-emerald-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
      />
    </div>
  );
}
