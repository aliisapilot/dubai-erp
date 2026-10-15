"use client";
import React, { useState } from "react";
import { X, RotateCcw, Check, Palette } from "lucide-react";
import { AttendanceSheetColors } from "./AttendancePrintSheet";

export interface AttendanceColorPreset {
  id: string;
  name: string;
  description: string;
  colors: AttendanceSheetColors;
}

export const DEFAULT_ATTENDANCE_COLORS: Required<AttendanceSheetColors> = {
  sundayHighlight: "#d1fae5", // Soft mint
  sundayHeader: "#059669",    // Vibrant emerald
  presentColor: "#047857",    // Deep forest emerald
  absentColor: "#be123c",     // Deep rose
  holidayColor: "#0284c7",    // Sky blue
  leaveColor: "#b45309",      // Amber
  headerBg: "#0f172a",        // Deep slate / corporate navy
  headerTextColor: "#ffffff", // Pure white
};

export const COLOR_PRESETS: AttendanceColorPreset[] = [
  {
    id: "emerald",
    name: "Corporate Emerald",
    description: "Standard UAE ERP styling with crisp emerald highlights",
    colors: { ...DEFAULT_ATTENDANCE_COLORS },
  },
  {
    id: "navy",
    name: "Slate & Royal Navy",
    description: "Executive navy header with calm ice-blue Sunday accents",
    colors: {
      sundayHighlight: "#e0f2fe",
      sundayHeader: "#0369a1",
      presentColor: "#0d9488",
      absentColor: "#e11d48",
      holidayColor: "#2563eb",
      leaveColor: "#d97706",
      headerBg: "#1e293b",
      headerTextColor: "#ffffff",
    },
  },
  {
    id: "indigo",
    name: "Royal Indigo & Rose",
    description: "Modern indigo theme with high-contrast status markers",
    colors: {
      sundayHighlight: "#ede9fe",
      sundayHeader: "#6d28d9",
      presentColor: "#4f46e5",
      absentColor: "#dc2626",
      holidayColor: "#0ea5e9",
      leaveColor: "#f59e0b",
      headerBg: "#312e81",
      headerTextColor: "#ffffff",
    },
  },
  {
    id: "monochrome",
    name: "Classic Monochrome",
    description: "High-contrast neutral grayscale optimized for B&W laser printers",
    colors: {
      sundayHighlight: "#f1f5f9",
      sundayHeader: "#334155",
      presentColor: "#0f172a",
      absentColor: "#475569",
      holidayColor: "#64748b",
      leaveColor: "#64748b",
      headerBg: "#0f172a",
      headerTextColor: "#ffffff",
    },
  },
  {
    id: "teal",
    name: "Modern Teal & Gold",
    description: "Rich dark teal with warm amber accents",
    colors: {
      sundayHighlight: "#ccfbf1",
      sundayHeader: "#0f766e",
      presentColor: "#0f766e",
      absentColor: "#b91c1c",
      holidayColor: "#0284c7",
      leaveColor: "#d97706",
      headerBg: "#134e4a",
      headerTextColor: "#ffffff",
    },
  },
];

export const ATTENDANCE_COLORS_STORAGE_KEY = "dubai-erp.attendance-custom-colors";

interface AttendanceColorCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentColors?: AttendanceSheetColors;
  onSave: (colors: AttendanceSheetColors) => void;
}

export default function AttendanceColorCustomizerModal({
  isOpen,
  onClose,
  currentColors,
  onSave,
}: AttendanceColorCustomizerModalProps) {
  const [colors, setColors] = useState<AttendanceSheetColors>(() => ({
    ...DEFAULT_ATTENDANCE_COLORS,
    ...currentColors,
  }));

  if (!isOpen) return null;

  const handleChange = (key: keyof AttendanceSheetColors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyPreset = (preset: AttendanceColorPreset) => {
    setColors({ ...preset.colors });
  };

  const handleReset = () => {
    setColors({ ...DEFAULT_ATTENDANCE_COLORS });
  };

  const handleSave = () => {
    try {
      localStorage.setItem(ATTENDANCE_COLORS_STORAGE_KEY, JSON.stringify(colors));
    } catch {
      // Ignore localStorage failure
    }
    onSave(colors);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl text-white overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Palette size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Attendance &amp; Print Sheet Color Customizer
              </h3>
              <p className="text-xs text-slate-400">
                Customize Sunday highlights, status badges, and table header accents
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Preset Buttons */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Color Themes &amp; Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => {
                const isSelected =
                  colors.sundayHeader === preset.colors.sundayHeader &&
                  colors.headerBg === preset.colors.headerBg;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`flex flex-col text-left p-2.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-950/40 shadow-xs"
                        : "border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-white">{preset.name}</span>
                      {isSelected && <Check size={14} className="text-emerald-400" />}
                    </div>
                    {/* Swatches */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: preset.colors.headerBg }}
                        title="Header Background"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: preset.colors.sundayHeader }}
                        title="Sunday Column"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: preset.colors.presentColor }}
                        title="Present Badge"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: preset.colors.absentColor }}
                        title="Absent Badge"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Individual Color Controls */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
              Manual Palette Fine-Tuning
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Table Header Background</span>
                  <span className="text-[10px] text-slate-400">Main table title and column header</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.headerBg || "#0f172a"}
                    onChange={(e) => handleChange("headerBg", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.headerBg}</span>
                </div>
              </div>

              {/* Sunday Header */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Sunday Column Header</span>
                  <span className="text-[10px] text-slate-400">Day number and &apos;Su&apos; header accent</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.sundayHeader || "#059669"}
                    onChange={(e) => handleChange("sundayHeader", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.sundayHeader}</span>
                </div>
              </div>

              {/* Sunday Cell Highlight */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Sunday Column Background</span>
                  <span className="text-[10px] text-slate-400">Soft tint for Sunday table rows</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.sundayHighlight || "#d1fae5"}
                    onChange={(e) => handleChange("sundayHighlight", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.sundayHighlight}</span>
                </div>
              </div>

              {/* Present Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Present (P) Status</span>
                  <span className="text-[10px] text-slate-400">Text color for present attendances</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.presentColor || "#047857"}
                    onChange={(e) => handleChange("presentColor", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.presentColor}</span>
                </div>
              </div>

              {/* Absent Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Absent (A) Status</span>
                  <span className="text-[10px] text-slate-400">Text color for absent attendances</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.absentColor || "#be123c"}
                    onChange={(e) => handleChange("absentColor", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.absentColor}</span>
                </div>
              </div>

              {/* Holiday Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/70 border border-slate-700/80">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Holiday (H) Status</span>
                  <span className="text-[10px] text-slate-400">Public &amp; company official holidays</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.holidayColor || "#0284c7"}
                    onChange={(e) => handleChange("holidayColor", e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-300 w-16">{colors.holidayColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Mini Preview */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Live Preview
            </label>
            <div className="p-3 rounded-xl bg-white text-slate-900 border border-slate-300 shadow-inner overflow-x-auto">
              <table className="w-full border-collapse text-center text-xs">
                <thead>
                  <tr style={{ backgroundColor: colors.headerBg || "#0f172a", color: "#ffffff" }}>
                    <th className="border border-slate-400 px-2 py-1 text-left">Code</th>
                    <th className="border border-slate-400 px-3 py-1 text-left">Employee Name</th>
                    <th className="border border-slate-400 px-2 py-1">01 Sa</th>
                    <th
                      className="border border-slate-400 px-2 py-1 font-bold text-white"
                      style={{ backgroundColor: colors.sundayHeader || "#059669" }}
                    >
                      02 Su
                    </th>
                    <th className="border border-slate-400 px-2 py-1">03 Mo</th>
                    <th className="border border-slate-400 px-2 py-1">Pres</th>
                    <th className="border border-slate-400 px-2 py-1">Abs</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="border border-slate-300 px-2 py-1 font-mono font-bold">EMP-001</td>
                    <td className="border border-slate-300 px-3 py-1 text-left font-bold">Mohammed Ali</td>
                    <td className="border border-slate-300 px-2 py-1 font-bold" style={{ color: colors.presentColor || "#047857" }}>
                      P
                    </td>
                    <td
                      className="border border-slate-300 px-2 py-1 font-bold"
                      style={{
                        backgroundColor: colors.sundayHighlight || "#d1fae5",
                        color: colors.sundayHeader || "#064e3b",
                      }}
                    >
                      P
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-bold" style={{ color: colors.absentColor || "#be123c" }}>
                      A
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-bold text-emerald-800">2</td>
                    <td className="border border-slate-300 px-2 py-1 font-bold text-rose-800">1</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-900/90">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer shadow-xs active:scale-95"
            >
              <Check size={14} />
              <span>Save &amp; Apply Colors</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
