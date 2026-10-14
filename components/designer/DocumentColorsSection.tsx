"use client";

import React, { useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import {
  DocumentLayout,
  DocumentBranding,
  BUILT_IN_COLOR_PRESETS,
  ColorPreset,
} from "@/lib/documentDesigner";

interface DocumentColorsSectionProps {
  layout: DocumentLayout;
  onChange: (updated: DocumentLayout) => void;
  defaultBranding: DocumentBranding;
}

const CUSTOM_PRESETS_STORAGE_KEY = "dubai-erp.custom-color-presets";

// Calculate contrast ratio between two hex colors (WCAG 2.1)
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

function luminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  const lum2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export default function DocumentColorsSection({
  layout,
  onChange,
  defaultBranding,
}: DocumentColorsSectionProps) {
  const branding = layout.branding || defaultBranding;
  const [customPresets, setCustomPresets] = useState<ColorPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to read custom color presets from localStorage", e);
    }
    return [];
  });
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  const saveCustomPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: ColorPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      nameAr: newPresetName.trim(),
      branding: { ...branding },
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    try {
      localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save custom color presets to localStorage", e);
    }
    setNewPresetName("");
    setShowSavePreset(false);
    setSaveSuccessMsg(`Saved preset "${newPreset.name}"!`);
    setTimeout(() => setSaveSuccessMsg(""), 3500);
  };

  const applyPreset = (preset: ColorPreset) => {
    onChange({
      ...layout,
      branding: {
        ...branding,
        ...preset.branding,
      },
    });
  };

  const updateColor = (key: keyof DocumentBranding, value: string) => {
    let cleanHex = value.trim();
    if (!cleanHex.startsWith("#") && /^[0-9A-Fa-f]{3,8}$/.test(cleanHex)) {
      cleanHex = `#${cleanHex}`;
    }
    onChange({
      ...layout,
      branding: {
        ...branding,
        [key]: cleanHex.toUpperCase(),
      },
    });
  };

  const resetSingleColor = (key: keyof DocumentBranding) => {
    const defaultVal = defaultBranding[key];
    if (defaultVal) {
      updateColor(key, defaultVal);
    }
  };

  const resetAllColors = () => {
    onChange({
      ...layout,
      branding: {
        ...defaultBranding,
      },
    });
  };

  const renderColorItem = (
    key: keyof DocumentBranding,
    label: string,
    description: string,
    defaultVal: string,
    contrastAgainst?: string
  ) => {
    const currentVal = branding[key] || defaultVal;
    let contrastRatio = 0;
    if (contrastAgainst) {
      contrastRatio = getContrastRatio(currentVal, contrastAgainst);
    }

    return (
      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-200">{label}</span>
            <p className="text-[10px] text-slate-400">{description}</p>
          </div>
          {currentVal.toUpperCase() !== defaultVal.toUpperCase() && (
            <button
              type="button"
              onClick={() => resetSingleColor(key)}
              title="Reset to default template color"
              className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700/60 transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Color Picker Swatch */}
          <div className="relative shrink-0">
            <input
              type="color"
              value={currentVal.length === 7 ? currentVal : defaultVal}
              onChange={(e) => updateColor(key, e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
            <div
              className="w-8 h-8 rounded-md border-2 border-slate-600 shadow-sm flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
              style={{ backgroundColor: currentVal }}
            />
          </div>

          {/* Hex Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={currentVal}
              onChange={(e) => updateColor(key, e.target.value)}
              placeholder={defaultVal}
              className="w-full h-8 px-2.5 font-mono text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Contrast Indicator (if applicable) */}
          {contrastAgainst && (
            <div
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                contrastRatio >= 4.5
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : contrastRatio >= 3.0
                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                  : "bg-rose-950 text-rose-400 border border-rose-800"
              }`}
              title={`Contrast Ratio: ${contrastRatio.toFixed(1)}:1 (Minimum 4.5:1 recommended for print)`}
            >
              {contrastRatio >= 4.5 ? "AAA" : contrastRatio >= 3.0 ? "AA" : "Low"}
            </div>
          )}
        </div>
      </div>
    );
  };

  const allPresets = [...BUILT_IN_COLOR_PRESETS, ...customPresets];

  return (
    <div className="flex flex-col gap-4 p-3 text-slate-200">
      {/* Top Banner & Quick Presets */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-800/80 border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Color Customization</h3>
          </div>
          <button
            type="button"
            onClick={resetAllColors}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition-colors"
          >
            <RotateCcw size={12} /> Reset All
          </button>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Customize header branding, table accents, text colors, and attendance highlights. Colors automatically sync to A4 PDF outputs and browser prints.
        </p>

        {/* Preset Selector */}
        <div className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-slate-700/60">
          <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
            <span>Color Presets</span>
            <button
              type="button"
              onClick={() => setShowSavePreset(!showSavePreset)}
              className="text-emerald-400 hover:text-emerald-300 font-normal hover:underline"
            >
              + Save Preset
            </button>
          </label>

          {showSavePreset && (
            <div className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-700 my-1">
              <input
                type="text"
                placeholder="Preset Name (e.g. Desert Gold)"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 h-7 px-2 text-xs rounded bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={saveCustomPreset}
                disabled={!newPresetName.trim()}
                className="h-7 px-2.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}

          {saveSuccessMsg && (
            <p className="text-[11px] text-emerald-400 font-semibold">{saveSuccessMsg}</p>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {allPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex flex-col p-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-700/50 hover:border-emerald-500/50 transition-all text-left group"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: preset.branding.primaryColor }} />
                  <div className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: preset.branding.accentColor }} />
                  <div className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: preset.branding.tableHeaderColor }} />
                </div>
                <span className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-300 truncate">
                  {preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Group 1: Header & Document Title */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span>🏢 Header &amp; Title</span>
        </h4>
        <div className="flex flex-col gap-2">
          {renderColorItem(
            "companyHeaderColor",
            "Company Header Color",
            "English name & primary header branding",
            defaultBranding.primaryColor
          )}
          {renderColorItem(
            "titleBackground",
            "Document Title Background",
            "Background bar for document title banner",
            defaultBranding.primaryColor
          )}
          {renderColorItem(
            "titleTextColor",
            "Document Title Text",
            "Text color inside the title banner",
            "#FFFFFF",
            branding.titleBackground || defaultBranding.primaryColor
          )}
          {renderColorItem(
            "accentColor",
            "Accent Color",
            "Arabic company name & decorative borders",
            defaultBranding.accentColor
          )}
        </div>
      </div>

      {/* Group 2: Table & Line Items */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span>📊 Table &amp; Line Items</span>
        </h4>
        <div className="flex flex-col gap-2">
          {renderColorItem(
            "tableHeaderColor",
            "Table Header Background",
            "Background fill of item table header row",
            defaultBranding.tableHeaderColor
          )}
          {renderColorItem(
            "tableHeaderTextColor",
            "Table Header Text",
            "Column titles (Item Description, Qty, Rate, Total)",
            "#FFFFFF",
            branding.tableHeaderColor || defaultBranding.tableHeaderColor
          )}
          {renderColorItem(
            "borderColor",
            "Table Borders",
            "Grid lines, cell dividers and frame borders",
            defaultBranding.borderColor
          )}
          {renderColorItem(
            "tableRowBackground",
            "Table Row Background",
            "Default background for even table rows",
            "#FFFFFF"
          )}
          {renderColorItem(
            "tableRowAlternating",
            "Alternating Row Background",
            "Zebra stripe background for odd table rows",
            "#F8FAFC"
          )}
        </div>
      </div>

      {/* Group 3: Typography, Totals & Footer */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span>📝 Typography &amp; Totals</span>
        </h4>
        <div className="flex flex-col gap-2">
          {renderColorItem(
            "textColor",
            "Primary Text Color",
            "Main document body and cell typography",
            defaultBranding.textColor,
            "#FFFFFF"
          )}
          {renderColorItem(
            "mutedColor",
            "Secondary / Muted Text",
            "Labels, TRN subtitle and meta captions",
            defaultBranding.mutedColor,
            "#FFFFFF"
          )}
          {renderColorItem(
            "totalHighlightColor",
            "Total Amount Highlight",
            "Highlight background for Total Amount Payable row",
            defaultBranding.totalHighlightColor
          )}
          {renderColorItem(
            "footerBackground",
            "Footer Background",
            "Document bottom footer strip background",
            "#FFFFFF"
          )}
          {renderColorItem(
            "footerTextColor",
            "Footer Text Color",
            "Footer typography, page numbers & contact line",
            defaultBranding.mutedColor,
            "#FFFFFF"
          )}
        </div>
      </div>

      {/* Group 4: Attendance Sheet Colors */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span>📅 Attendance Sheet Colors</span>
        </h4>
        <div className="flex flex-col gap-2">
          {renderColorItem(
            "attendanceSundayHighlight",
            "Sunday Highlight",
            "Background highlight for Sunday date columns",
            "#D1FAE5"
          )}
          {renderColorItem(
            "attendancePresentColor",
            "Present (P) Color",
            "Badge color for present employees",
            "#047857"
          )}
          {renderColorItem(
            "attendanceAbsentColor",
            "Absent (A) Color",
            "Badge color for absent employees",
            "#BE123C"
          )}
          {renderColorItem(
            "attendanceHolidayColor",
            "Holiday (H) Color",
            "Official public holiday column color",
            "#0284C7"
          )}
          {renderColorItem(
            "attendanceLeaveColor",
            "Leave (L) Color",
            "Approved annual or sick leave badge",
            "#B45309"
          )}
        </div>
      </div>

      {/* Bottom Reset Button */}
      <div className="pt-3 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={resetAllColors}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset All Colors to Template
        </button>
      </div>
    </div>
  );
}
