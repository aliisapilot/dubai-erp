"use client";

import React, { useState } from "react";
import {
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
  Search,
  ChevronDown,
  ChevronRight,
  Sliders,
  DollarSign,
  Palette,
} from "lucide-react";
import { LayoutElement, ElementType, DocumentLayout, DocumentBranding } from "@/lib/documentDesigner";
import DocumentColorsSection from "./DocumentColorsSection";

interface LeftSidebarProps {
  elements: LayoutElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  onAddCustomElement: (type: "custom_text" | "divider") => void;
  onAddImage?: (file: File) => void;
  layout?: DocumentLayout;
  onChangeLayout?: (updated: DocumentLayout) => void;
  defaultBranding?: DocumentBranding;
}

function getElementIcon(type: ElementType) {
  switch (type) {
    case "logo":
    case "watermark":
    case "building_image":
    case "custom_image":
      return <ImageIcon size={13} className="text-blue-400" />;
    case "company_name_en":
    case "company_name_ar":
    case "company_address":
    case "doc_title":
    case "custom_text":
      return <Type size={13} className="text-amber-400" />;
    case "line_items":
      return <TableIcon size={13} className="text-emerald-400" />;
    case "company_signature":
      return <FileCheck size={13} className="text-indigo-400" />;
    case "company_stamp":
      return <Stamp size={13} className="text-rose-400" />;
    case "bank_details":
      return <CreditCard size={13} className="text-teal-400" />;
    case "customer_info":
    case "supplier_info":
      return <Building size={13} className="text-purple-400" />;
    case "totals":
    case "amount_in_words":
      return <DollarSign size={13} className="text-emerald-400" />;
    default:
      return <FileText size={13} className="text-slate-400" />;
  }
}

interface SectionCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  badge?: string;
  types: ElementType[];
}

const SECTION_CATEGORIES: SectionCategory[] = [
  {
    id: "logo_company",
    title: "Logo & Company",
    icon: <Building size={14} className="text-amber-400" />,
    types: ["logo", "company_name_en", "company_name_ar", "company_address", "company_trn"],
  },
  {
    id: "customer_details",
    title: "Customer Details",
    icon: <Building size={14} className="text-blue-400" />,
    types: ["customer_info", "supplier_info"],
  },
  {
    id: "doc_info",
    title: "Document Information",
    icon: <FileText size={14} className="text-indigo-400" />,
    types: ["doc_title", "doc_meta", "project_info"],
  },
  {
    id: "items_totals",
    title: "Items & Totals",
    icon: <TableIcon size={14} className="text-emerald-400" />,
    types: ["line_items", "totals", "amount_in_words"],
  },
  {
    id: "bank_details",
    title: "Bank Details",
    icon: <CreditCard size={14} className="text-teal-400" />,
    types: ["bank_details", "payment_terms"],
  },
  {
    id: "terms_footer",
    title: "Terms & Footer",
    icon: <FileCheck size={14} className="text-rose-400" />,
    types: ["company_signature", "company_stamp", "footer", "custom_text", "custom_image", "divider"],
  },
];

export default function LeftSidebar({
  elements,
  selectedElementId,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onAddCustomElement,
  onAddImage,
  layout,
  onChangeLayout,
  defaultBranding,
}: LeftSidebarProps) {
  const [sidebarMode, setSidebarMode] = useState<"sections" | "colors" | "layers">("sections");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedElements = [...elements]
    .filter((el) => (searchQuery ? el.label.toLowerCase().includes(searchQuery.toLowerCase()) : true))
    .sort((a, b) => b.zIndex - a.zIndex);

  return (
    <aside className="w-full min-h-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-white select-none shrink-0 overflow-hidden shadow-lg">
      {/* Sidebar Header with Mode Switcher */}
      <div className="p-3 border-b border-slate-800 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
            <Sliders size={14} className="text-amber-400" />
            <span>Document Editor</span>
          </div>

          {/* Quick Add Custom Elements */}
          <div className="relative group">
            <button
              type="button"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px] px-2"
              title="Add Custom Element"
            >
              <Plus size={13} className="text-amber-400" />
              <span>Add</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-1 w-40 z-50">
              <button
                type="button"
                onClick={() => onAddCustomElement("custom_text")}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 rounded flex items-center gap-2 cursor-pointer"
              >
                <Type size={13} className="text-amber-400" />
                <span>Custom Text</span>
              </button>
              <button
                type="button"
                onClick={() => onAddCustomElement("divider")}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 rounded flex items-center gap-2 cursor-pointer"
              >
                <div className="w-3.5 h-0.5 bg-slate-400" />
                <span>Divider Line</span>
              </button>
            </div>
          </div>
        </div>

        {/* Simplified vs Colors vs Advanced Layer Mode Toggle */}
        <div className="flex rounded-lg bg-slate-950 p-0.5 text-xs font-medium border border-slate-800">
          <button
            type="button"
            onClick={() => setSidebarMode("sections")}
            className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
              sidebarMode === "sections"
                ? "bg-amber-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sections
          </button>
          <button
            type="button"
            onClick={() => setSidebarMode("colors")}
            className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
              sidebarMode === "colors"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette size={12} />
            <span>Colors</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarMode("layers")}
            className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
              sidebarMode === "layers"
                ? "bg-slate-800 text-white shadow border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Layers
          </button>
        </div>
      </div>

      {/* Mode 2: Colors Customization */}
      {sidebarMode === "colors" && layout && onChangeLayout && (
        <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DocumentColorsSection
            layout={layout}
            onChange={onChangeLayout}
            defaultBranding={defaultBranding || layout.branding}
          />
        </div>
      )}

      {/* Mode 1: 7 Simplified Logical Sections (Default) */}
      {sidebarMode === "sections" && (
        <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
          {/* Section 7: Page Layout Quick Action */}
          <button
            type="button"
            onClick={() => onSelectElement("")}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition cursor-pointer border ${
              !selectedElementId
                ? "bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold shadow-sm"
                : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300"
            }`}
            title="Configure Page Borders, Margins, Numbering & Brand Colors"
          >
            <div className="flex items-center gap-2">
              <Palette size={15} className="text-amber-400" />
              <div className="text-left">
                <div className="font-semibold text-slate-100">Page Layout &amp; Theme</div>
                <div className="text-[10px] text-slate-400 font-normal">Borders, Margins, Colors</div>
              </div>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
              Layout
            </span>
          </button>

          {/* Render the 6 Content Sections */}
          {SECTION_CATEGORIES.map((cat) => {
            const sectionElements = elements.filter((el) => cat.types.includes(el.type));
            if (sectionElements.length === 0) return null;

            const isCollapsed = Boolean(collapsedSections[cat.id]);
            const hasSelected = sectionElements.some((el) => el.id === selectedElementId);

            return (
              <div
                key={cat.id}
                className={`rounded-xl border transition-all ${
                  hasSelected
                    ? "border-amber-500/40 bg-slate-800/40"
                    : "border-slate-800/80 bg-slate-900/60 hover:border-slate-700/80"
                }`}
              >
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection(cat.id)}
                  className="w-full flex items-center justify-between p-2.5 text-xs text-left cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    {cat.icon}
                    <span className="font-semibold text-slate-200">{cat.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono font-normal">
                      ({sectionElements.length})
                    </span>
                  </div>
                  <div className="text-slate-500 hover:text-slate-300">
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {/* Section Items */}
                {!isCollapsed && (
                  <div className="px-2 pb-2 space-y-1">
                    {sectionElements.map((elem) => {
                      const isSelected = selectedElementId === elem.id;

                      return (
                        <div
                          key={elem.id}
                          onClick={() => onSelectElement(elem.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border ${
                            isSelected
                              ? "bg-amber-500/20 border-amber-500/60 text-amber-200 font-semibold shadow-sm"
                              : "bg-slate-800/30 border-transparent hover:bg-slate-800/80 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <span className="shrink-0">{getElementIcon(elem.type)}</span>
                            <span className="truncate" title={elem.label}>
                              {elem.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {elem.locked && (
                              <span title="Locked">
                                <Lock size={12} className="text-amber-400" />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleVisibility(elem.id);
                              }}
                              className={`p-1 rounded hover:bg-slate-700 transition cursor-pointer ${
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mode 2: Advanced Layer Reordering (Z-Index) */}
      {sidebarMode === "layers" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search layers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/80 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 placeholder-slate-500 outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
            {sortedElements.map((elem) => {
              const isSelected = selectedElementId === elem.id;

              return (
                <div
                  key={elem.id}
                  onClick={() => onSelectElement(elem.id)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border ${
                    isSelected
                      ? "bg-amber-500/20 border-amber-500/50 text-white font-medium"
                      : "bg-slate-800/40 border-transparent hover:bg-slate-800 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <span className="shrink-0">{getElementIcon(elem.type)}</span>
                    <span className="truncate" title={elem.label}>
                      {elem.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <div className="hidden group-hover:flex items-center gap-0.5 mr-1">
                      <button
                        type="button"
                        disabled={elem.locked}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveLayer(elem.id, "up");
                        }}
                        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                        title="Bring Layer Forward"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={elem.locked}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveLayer(elem.id, "down");
                        }}
                        className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                        title="Send Layer Backward"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(elem.id);
                      }}
                      className={`p-1 rounded hover:bg-slate-700 transition cursor-pointer ${
                        elem.locked ? "text-amber-400" : "text-slate-500 opacity-0 group-hover:opacity-100"
                      }`}
                      title={elem.locked ? "Locked" : "Lock element"}
                    >
                      {elem.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(elem.id);
                      }}
                      className={`p-1 rounded hover:bg-slate-700 transition cursor-pointer ${
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
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
        <span>Click element to edit</span>
        <span className="font-mono">A4 210×297mm</span>
      </div>
    </aside>
  );
}
