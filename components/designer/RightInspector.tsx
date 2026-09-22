"use client";

import React from "react";
import {
  Sliders,
  Maximize2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Table as TableIcon,
  Layers,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";
import {
  DocumentLayout,
  LayoutElement,
  TableColumnConfig,
} from "@/lib/documentDesigner";

interface RightInspectorProps {
  layout: DocumentLayout;
  selectedElement: LayoutElement | null;
  onUpdateElement: (id: string, patch: Partial<LayoutElement>) => void;
  onUpdateLayoutBranding: (brandingPatch: Partial<DocumentLayout["branding"]>) => void;
  onUpdatePageSettings: (pagePatch: Partial<DocumentLayout["page"]>) => void;
  onDeleteElement?: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
}

const COLOR_SWATCHES = [
  "#0F172A", // Navy Primary
  "#C9A227", // Gold Accent
  "#334155", // Text Slate
  "#64748B", // Muted
  "#CBD5E1", // Border
  "#F8F6ED", // Highlight Gold Light
  "#FFFFFF", // White
  "#000000", // Black
];

export default function RightInspector({
  layout,
  selectedElement,
  onUpdateElement,
  onUpdateLayoutBranding,
  onUpdatePageSettings,
  onDeleteElement,
  onMoveLayer,
}: RightInspectorProps) {
  // If NO element is selected, show Document Page Settings and Central Branding
  if (!selectedElement) {
    return (
      <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-white select-none shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-slate-800 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Sliders size={15} className="text-amber-400" />
          <span>Page &amp; Branding Settings</span>
        </div>

        <div className="p-4 space-y-5 text-xs">
          {/* Page Margins */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
              Page Margins (mm)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Top Margin</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={layout.page.margins.top}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...layout.page.margins, top: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Bottom Margin</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={layout.page.margins.bottom}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...layout.page.margins, bottom: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Left Margin</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={layout.page.margins.left}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...layout.page.margins, left: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Right Margin</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={layout.page.margins.right}
                  onChange={(e) =>
                    onUpdatePageSettings({
                      margins: { ...layout.page.margins, right: Number(e.target.value) || 0 },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Document Branding Palette */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Document Brand Theme
            </div>

            {/* Primary Navy */}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Primary Color (Headers)</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.branding.primaryColor}
                  onChange={(e) => onUpdateLayoutBranding({ primaryColor: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-400">
                  {layout.branding.primaryColor}
                </span>
              </div>
            </div>

            {/* Accent Gold */}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Gold / Accent Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.branding.accentColor}
                  onChange={(e) => onUpdateLayoutBranding({ accentColor: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-400">
                  {layout.branding.accentColor}
                </span>
              </div>
            </div>

            {/* Table Header */}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Table Header Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.branding.tableHeaderColor}
                  onChange={(e) => onUpdateLayoutBranding({ tableHeaderColor: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-400">
                  {layout.branding.tableHeaderColor}
                </span>
              </div>
            </div>

            {/* Total Highlight */}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Total Highlight Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layout.branding.totalHighlightColor}
                  onChange={(e) => onUpdateLayoutBranding({ totalHighlightColor: e.target.value })}
                  className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-400">
                  {layout.branding.totalHighlightColor}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // Selected Element Inspector
  const elem = selectedElement;

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-white select-none shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-100 truncate max-w-[180px]">
            {elem.label}
          </div>
          <div className="text-[10px] text-amber-400 font-mono">
            Type: {elem.type}
          </div>
        </div>

        {/* Lock & Visible Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdateElement(elem.id, { locked: !elem.locked })}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              elem.locked ? "text-amber-400" : "text-slate-400"
            }`}
            title={elem.locked ? "Unlock element" : "Lock position"}
          >
            {elem.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button
            onClick={() => onUpdateElement(elem.id, { visible: !elem.visible })}
            className={`p-1.5 rounded hover:bg-slate-800 transition ${
              elem.visible ? "text-slate-300" : "text-red-400"
            }`}
            title={elem.visible ? "Hide element" : "Show element"}
          >
            {elem.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          {elem.type === "custom_text" && onDeleteElement && (
            <button
              onClick={() => onDeleteElement(elem.id)}
              className="p-1.5 rounded hover:bg-slate-800 text-red-400 hover:text-red-300 transition"
              title="Delete element"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5 text-xs">
        {/* ── Position & Dimensions (in mm) ─────────────────────────────────── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center justify-between">
            <span>Position &amp; Size (mm)</span>
            <button
              onClick={() =>
                onUpdateElement(elem.id, { lockAspectRatio: !elem.lockAspectRatio })
              }
              className={`text-[10px] flex items-center gap-1 ${
                elem.lockAspectRatio ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {elem.lockAspectRatio ? <Lock size={11} /> : <Unlock size={11} />}
              <span>Lock Aspect</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">X Position</label>
              <input
                type="number"
                min={0}
                max={210}
                step={1}
                value={Math.round(elem.x)}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, { x: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Y Position</label>
              <input
                type="number"
                min={0}
                max={297}
                step={1}
                value={Math.round(elem.y)}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, { y: Math.max(0, Math.min(290, Number(e.target.value) || 0)) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Width</label>
              <input
                type="number"
                min={10}
                max={210}
                step={1}
                value={Math.round(elem.width)}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, { width: Math.max(10, Math.min(210, Number(e.target.value) || 10)) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Height</label>
              <input
                type="number"
                min={5}
                max={297}
                step={1}
                value={Math.round(elem.height)}
                disabled={elem.locked}
                onChange={(e) =>
                  onUpdateElement(elem.id, { height: Math.max(5, Math.min(297, Number(e.target.value) || 5)) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* ── Layer Order Controls ─────────────────────────────────────────── */}
        <div className="pt-3 border-t border-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            Layer Hierarchy (Z-Index: {elem.zIndex})
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => onMoveLayer(elem.id, "top")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px]"
              title="Bring to Front"
            >
              <ArrowUpToLine size={13} />
              <span>Front</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "up")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px]"
              title="Bring Forward"
            >
              <ArrowUp size={13} />
              <span>Forward</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "down")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px]"
              title="Send Backward"
            >
              <ArrowDown size={13} />
              <span>Backward</span>
            </button>
            <button
              onClick={() => onMoveLayer(elem.id, "bottom")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex flex-col items-center gap-1 text-[10px]"
              title="Send to Back"
            >
              <ArrowDownToLine size={13} />
              <span>Back</span>
            </button>
          </div>
        </div>

        {/* ── Typography & Content ─────────────────────────────────────────── */}
        {(elem.customText !== undefined ||
          ["company_name_en", "company_name_ar", "doc_title", "custom_text", "footer"].includes(elem.type)) && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Text &amp; Typography
            </div>

            {/* Editable Content */}
            {elem.customText !== undefined && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Text Content</label>
                <input
                  type="text"
                  value={elem.customText}
                  onChange={(e) => onUpdateElement(elem.id, { customText: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
            )}

            {/* Font Size & Weight */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={48}
                  value={elem.fontSize || 12}
                  onChange={(e) =>
                    onUpdateElement(elem.id, { fontSize: Number(e.target.value) || 12 })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Weight</label>
                <select
                  value={elem.fontWeight || "normal"}
                  onChange={(e) =>
                    onUpdateElement(elem.id, { fontWeight: e.target.value as any })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="normal">Normal</option>
                  <option value="medium">Medium</option>
                  <option value="semibold">Semibold</option>
                  <option value="bold">Bold</option>
                  <option value="extrabold">Extrabold</option>
                </select>
              </div>
            </div>

            {/* Text Alignment */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Text Alignment</label>
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded border border-slate-700">
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "left" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "left" || !elem.textAlign
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "center" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "center"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateElement(elem.id, { textAlign: "right" })}
                  className={`flex-1 py-1 rounded flex justify-center ${
                    elem.textAlign === "right"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <AlignRight size={14} />
                </button>
              </div>
            </div>

            {/* Text Color */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={elem.color || "#0F172A"}
                  onChange={(e) => onUpdateElement(elem.id, { color: e.target.value })}
                  className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={elem.color || ""}
                  onChange={(e) => onUpdateElement(elem.id, { color: e.target.value })}
                  placeholder="#000000"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Table Designer (When Line-Item Table selected) ───────────────── */}
        {elem.type === "line_items" && elem.tableSettings && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
              <TableIcon size={14} className="text-emerald-400" />
              <span>Line-Item Table Settings</span>
            </div>

            {/* Header Colors */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Header Background</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={elem.tableSettings.headerBg}
                    onChange={(e) =>
                      onUpdateElement(elem.id, {
                        tableSettings: { ...elem.tableSettings!, headerBg: e.target.value },
                      })
                    }
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    {elem.tableSettings.headerBg}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Header Text</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={elem.tableSettings.headerTextColor}
                    onChange={(e) =>
                      onUpdateElement(elem.id, {
                        tableSettings: { ...elem.tableSettings!, headerTextColor: e.target.value },
                      })
                    }
                    className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    {elem.tableSettings.headerTextColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Font & Row Height */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  min={8}
                  max={16}
                  value={elem.tableSettings.fontSize}
                  onChange={(e) =>
                    onUpdateElement(elem.id, {
                      tableSettings: {
                        ...elem.tableSettings!,
                        fontSize: Number(e.target.value) || 10,
                      },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Row Height</label>
                <input
                  type="number"
                  min={6}
                  max={20}
                  value={elem.tableSettings.rowHeight}
                  onChange={(e) =>
                    onUpdateElement(elem.id, {
                      tableSettings: {
                        ...elem.tableSettings!,
                        rowHeight: Number(e.target.value) || 8,
                      },
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            </div>

            {/* Table Columns Config */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-slate-400 block mb-1.5">
                Columns Configuration (Show / Hide &amp; Width)
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {elem.tableSettings.columns.map((col, idx) => (
                  <div
                    key={col.key}
                    className="flex items-center justify-between p-1.5 rounded bg-slate-800/80 border border-slate-700/80 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...elem.tableSettings!.columns];
                          updated[idx] = { ...col, visible: !col.visible };
                          onUpdateElement(elem.id, {
                            tableSettings: { ...elem.tableSettings!, columns: updated },
                          });
                        }}
                        className={`p-0.5 rounded ${
                          col.visible ? "text-amber-400" : "text-slate-600"
                        }`}
                        title={col.visible ? "Hide Column" : "Show Column"}
                      >
                        {col.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <span className={col.visible ? "text-slate-200" : "text-slate-500 line-through"}>
                        {col.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={80}
                        value={col.widthPct}
                        onChange={(e) => {
                          const updated = [...elem.tableSettings!.columns];
                          updated[idx] = { ...col, widthPct: Number(e.target.value) || 10 };
                          onUpdateElement(elem.id, {
                            tableSettings: { ...elem.tableSettings!, columns: updated },
                          });
                        }}
                        className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right font-mono text-[10px] text-white"
                      />
                      <span className="text-[9px] text-slate-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Image Specific Controls ──────────────────────────────────────── */}
        {["logo", "watermark", "company_stamp", "building_image"].includes(elem.type) && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Image Appearance
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400">Opacity</label>
                <span className="text-[10px] font-mono text-slate-300">
                  {Math.round((elem.opacity ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((elem.opacity ?? 1) * 100)}
                onChange={(e) =>
                  onUpdateElement(elem.id, { opacity: Number(e.target.value) / 100 })
                }
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
