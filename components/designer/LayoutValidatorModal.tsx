"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { DocumentLayout, LayoutElement } from "@/lib/documentDesigner";
import {
  validateDocumentLayout,
  LayoutValidationReport,
  computePaginationPlan,
} from "@/lib/documentLayoutEngine";

interface LayoutValidatorModalProps {
  layout: DocumentLayout;
  isOpen: boolean;
  onClose: () => void;
  onSelectElement?: (elementId: string) => void;
  onApplyLayoutFix?: (updatedLayout: DocumentLayout) => void;
}

export default function LayoutValidatorModal({
  layout,
  isOpen,
  onClose,
  onSelectElement,
  onApplyLayoutFix,
}: LayoutValidatorModalProps) {
  const [filterSeverity, setFilterSeverity] = useState<"all" | "error" | "warning" | "info">("all");
  const [sampleItemCount, setSampleItemCount] = useState<number>(4);

  if (!isOpen) return null;

  const report: LayoutValidationReport = validateDocumentLayout(layout, sampleItemCount);
  const pagination = computePaginationPlan(layout, sampleItemCount);

  const filteredIssues = report.issues.filter((issue) => {
    if (filterSeverity === "all") return true;
    return issue.severity === filterSeverity;
  });

  const errorsCount = report.issues.filter((i) => i.severity === "error").length;
  const warningsCount = report.issues.filter((i) => i.severity === "warning").length;
  const infoCount = report.issues.filter((i) => i.severity === "info").length;

  // Safe non-destructive Auto-Tidy Gap Alignment: only aligns follower elements vertically with 3mm gaps
  const handleAutoTidyGaps = () => {
    if (!onApplyLayoutFix) return;
    const table = layout.elements.find((el) => el.type === "line_items");
    if (!table) return;

    let currentY = table.y + table.height + 3; // start 3mm below table
    const followers = layout.elements
      .filter((el) => el.visible && el.y >= table.y + table.height - 2 && el.type !== "footer" && el.type !== "watermark")
      .sort((a, b) => a.y - b.y);

    // Group elements by similar Y (within 4mm) to preserve side-by-side cards (e.g. totals & amount_in_words)
    const yGroups: LayoutElement[][] = [];
    for (const f of followers) {
      const existingGroup = yGroups.find((g) => Math.abs(g[0].y - f.y) <= 4);
      if (existingGroup) {
        existingGroup.push(f);
      } else {
        yGroups.push([f]);
      }
    }

    const updatedElements = [...layout.elements];
    for (const group of yGroups) {
      const groupHeight = Math.max(...group.map((el) => el.height));
      for (const el of group) {
        const index = updatedElements.findIndex((item) => item.id === el.id);
        if (index !== -1) {
          updatedElements[index] = { ...updatedElements[index], y: currentY };
        }
      }
      currentY += groupHeight + 3; // 3mm standard gap between rows
    }

    onApplyLayoutFix({ ...layout, elements: updatedElements });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                report.hasErrors
                  ? "bg-red-500/20 text-red-400"
                  : report.hasWarnings
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-emerald-500/20 text-emerald-400"
              }`}
            >
              {report.hasErrors ? (
                <AlertOctagon size={20} />
              ) : report.hasWarnings ? (
                <AlertTriangle size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Layout Health &amp; Flow Auditor</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                    report.hasErrors
                      ? "bg-red-500/20 text-red-300 border border-red-500/40"
                      : report.hasWarnings
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  }`}
                >
                  {report.hasErrors
                    ? `${errorsCount} Error${errorsCount > 1 ? "s" : ""}`
                    : report.hasWarnings
                    ? `${warningsCount} Warning${warningsCount > 1 ? "s" : ""}`
                    : "Ready for Print"}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Non-destructive audit of A4 bounds, overlaps, table sizing, and dynamic flow.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Simulation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Test Row Count:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 4, 8, 15, 20].map((count) => (
                <button
                  key={count}
                  onClick={() => setSampleItemCount(count)}
                  className={`px-2 py-1 rounded text-xs font-mono transition ${
                    sampleItemCount === count
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {count} {count === 1 ? "item" : "items"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>
              Estimated Pages: <strong className="text-white font-mono">{pagination.totalPages}</strong>
            </span>
            <span>
              A4 Printable: <strong className="text-white font-mono">210×297 mm</strong>
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterSeverity("all")}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                filterSeverity === "all"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({report.issues.length})
            </button>
            <button
              onClick={() => setFilterSeverity("error")}
              className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                filterSeverity === "error"
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "text-slate-400 hover:text-red-400"
              }`}
            >
              Errors ({errorsCount})
            </button>
            <button
              onClick={() => setFilterSeverity("warning")}
              className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                filterSeverity === "warning"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-amber-400"
              }`}
            >
              Warnings ({warningsCount})
            </button>
            <button
              onClick={() => setFilterSeverity("info")}
              className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                filterSeverity === "info"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-slate-400 hover:text-blue-400"
              }`}
            >
              Notices ({infoCount})
            </button>
          </div>

          {onApplyLayoutFix && report.issues.some((i) => i.category === "gap") && (
            <button
              onClick={handleAutoTidyGaps}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition"
              title="Align follower cards neatly 3mm apart without altering custom styling"
            >
              <Sparkles size={13} />
              <span>Auto-Tidy Gaps (3mm)</span>
            </button>
          )}
        </div>

        {/* Issues List */}
        <div className="designer-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-2.5">
          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CheckCircle2 size={40} className="text-emerald-400 mb-2 opacity-80" />
              <div className="font-bold text-sm text-slate-200">
                Layout Passed All Health Checks!
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                No A4 boundary overflows, no destructive overlaps, and follower cards flow cleanly with dynamic rows.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isError = issue.severity === "error";
              const isWarning = issue.severity === "warning";

              return (
                <div
                  key={issue.id}
                  className={`p-3 rounded-lg border text-xs transition flex items-start justify-between gap-3 ${
                    isError
                      ? "bg-red-500/10 border-red-500/30 text-red-200"
                      : isWarning
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-200"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {isError ? (
                        <AlertOctagon size={15} className="text-red-400" />
                      ) : isWarning ? (
                        <AlertTriangle size={15} className="text-amber-400" />
                      ) : (
                        <Info size={15} className="text-blue-400" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100">{issue.elementLabel || "Layout Element"}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {issue.category}
                        </span>
                      </div>
                      <div className="text-slate-300 leading-relaxed">{issue.message}</div>
                      {issue.details && (
                        <div className="text-[11px] font-mono text-slate-400">{issue.details}</div>
                      )}
                      {issue.suggestedFix && (
                        <div className="text-[11px] text-amber-300/90 flex items-center gap-1 pt-0.5">
                          <span>Recommendation:</span>
                          <span className="italic">{issue.suggestedFix}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {issue.elementId && onSelectElement && (
                    <button
                      onClick={() => {
                        onSelectElement(issue.elementId!);
                        onClose();
                      }}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer border border-slate-700"
                      title="Select and highlight this element on the designer canvas"
                    >
                      <ExternalLink size={12} />
                      <span>Select</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 p-3 bg-slate-950/70 text-xs">
          <div className="text-slate-400">
            {report.metrics.visibleElements} visible elements inspected across A4 sheet
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
