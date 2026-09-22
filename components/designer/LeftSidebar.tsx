"use client";

import React, { useState } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Type,
  Table as TableIcon,
  Stamp,
  FileCheck,
  Building,
  CreditCard,
  FileText,
  AlignJustify,
  Search,
} from "lucide-react";
import { LayoutElement, ElementType } from "@/lib/documentDesigner";

interface LeftSidebarProps {
  elements: LayoutElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  onAddCustomElement: (type: "custom_text" | "divider") => void;
}

function getElementIcon(type: ElementType) {
  switch (type) {
    case "logo":
    case "watermark":
    case "building_image":
      return <ImageIcon size={14} className="text-blue-500" />;
    case "company_name_en":
    case "company_name_ar":
    case "company_address":
    case "doc_title":
    case "custom_text":
      return <Type size={14} className="text-amber-500" />;
    case "line_items":
      return <TableIcon size={14} className="text-emerald-500" />;
    case "company_signature":
      return <FileCheck size={14} className="text-indigo-500" />;
    case "company_stamp":
      return <Stamp size={14} className="text-rose-500" />;
    case "bank_details":
      return <CreditCard size={14} className="text-teal-500" />;
    case "customer_info":
    case "supplier_info":
      return <Building size={14} className="text-purple-500" />;
    default:
      return <FileText size={14} className="text-slate-400" />;
  }
}

export default function LeftSidebar({
  elements,
  selectedElementId,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onAddCustomElement,
}: LeftSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Sort elements by z-index descending (top layers appear first in UI)
  const sortedElements = [...elements]
    .filter((el) =>
      searchQuery ? el.label.toLowerCase().includes(searchQuery.toLowerCase()) : true
    )
    .sort((a, b) => b.zIndex - a.zIndex);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-white select-none shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Layers size={15} className="text-amber-400" />
          <span>Document Layers</span>
          <span className="text-[10px] text-slate-500 font-normal">
            ({elements.length})
          </span>
        </div>

        {/* Add Element Quick Action */}
        <div className="relative group">
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Add Custom Element"
          >
            <Plus size={15} />
          </button>
          <div className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1 w-36 z-50">
            <button
              onClick={() => onAddCustomElement("custom_text")}
              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 rounded flex items-center gap-2"
            >
              <Type size={13} className="text-amber-400" />
              <span>Custom Text</span>
            </button>
          </div>
        </div>
      </div>

      {/* Layer Search Filter */}
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 text-xs pl-8 pr-3 py-1.5 rounded border border-slate-700 text-slate-200 placeholder-slate-500 outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* Layers List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedElements.map((elem) => {
          const isSelected = selectedElementId === elem.id;

          return (
            <div
              key={elem.id}
              onClick={() => onSelectElement(elem.id)}
              className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition cursor-pointer border ${
                isSelected
                  ? "bg-amber-500/15 border-amber-500/50 text-white font-medium"
                  : "bg-slate-800/40 border-transparent hover:bg-slate-800 text-slate-300"
              }`}
            >
              {/* Element Icon and Label */}
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                <span className="shrink-0">{getElementIcon(elem.type)}</span>
                <span className="truncate" title={elem.label}>
                  {elem.label}
                </span>
              </div>

              {/* Layer Controls (Z-Index Reorder, Lock, Visibility) */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Layer order up/down (only visible on hover or when selected) */}
                <div className="hidden group-hover:flex items-center gap-0.5 mr-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(elem.id, "up");
                    }}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Bring Layer Forward"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(elem.id, "down");
                    }}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Send Layer Backward"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>

                {/* Lock Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock(elem.id);
                  }}
                  className={`p-1 rounded hover:bg-slate-700 transition ${
                    elem.locked ? "text-amber-400 opacity-100" : "text-slate-500 opacity-0 group-hover:opacity-100"
                  }`}
                  title={elem.locked ? "Locked" : "Lock element"}
                >
                  {elem.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>

                {/* Visibility Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(elem.id);
                  }}
                  className={`p-1 rounded hover:bg-slate-700 transition ${
                    elem.visible ? "text-slate-400 hover:text-white" : "text-red-400"
                  }`}
                  title={elem.visible ? "Hide element" : "Show element"}
                >
                  {elem.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            </div>
          );
        })}

        {sortedElements.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-500 italic">
            No matching layers found
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Click element to inspect</span>
        <span>A4 210×297mm</span>
      </div>
    </aside>
  );
}
