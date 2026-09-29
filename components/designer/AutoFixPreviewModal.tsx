"use client";

import { AlertTriangle, CheckCircle2, Eye, X } from "lucide-react";
import { FitLevel } from "@/lib/documentLayoutEngine";

interface AutoFixPreviewModalProps {
  isOpen: boolean;
  mode: "standard" | "saved";
  styleName?: string;
  totalPages: number;
  fitLevel?: FitLevel;
  warning?: string;
  onClose: () => void;
  onPreview: () => void;
  onApply: () => void;
}

export default function AutoFixPreviewModal({
  isOpen,
  mode,
  styleName,
  totalPages,
  fitLevel,
  warning,
  onClose,
  onPreview,
  onApply,
}: AutoFixPreviewModalProps) {
  if (!isOpen) return null;
  const overflows = totalPages > 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="auto-fix-preview-title" className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-lg p-2 ${overflows ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {overflows ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
            </div>
            <div>
              <h2 id="auto-fix-preview-title" className="text-sm font-bold text-white">Review Auto Fix</h2>
              <p className="mt-1 text-xs text-slate-400">{mode === "saved" ? `Apply saved style: ${styleName || "My Saved Style"}` : "Apply Standard Auto Fix"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Cancel Auto Fix"><X size={17} /></button>
        </header>

        <div className="space-y-3 p-4">
          <div className={`rounded-lg border p-3 ${overflows ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-emerald-500/5"}`}>
            <p className={`text-sm font-semibold ${overflows ? "text-amber-200" : "text-emerald-200"}`}>
              {overflows ? `Estimated ${totalPages} A4 pages` : "Estimated fit: one A4 page"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {overflows
                ? warning || "Content exceeds the safe single-page area. The document will paginate; no fields, rows, images or text will be hidden."
                : `Dynamic spacing profile: ${fitLevel || "standard"}. The chosen style stays intact while table rows and followers adapt to content.`}
            </p>
          </div>
          <p className="text-xs leading-5 text-slate-400">This enables Auto Fit and automatic spacing using your saved style and minimum text size. The estimate uses sample data; longer documents continue onto additional A4 pages. Apply, then save to cloud to use these settings on every device.</p>
          {overflows && <p className="rounded-lg bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-400">Safe options: keep the full content across pages, reduce unused whitespace or margins in the inspector, or adjust table row spacing. Hiding required fields is not recommended.</p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-800 p-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
          <button type="button" onClick={onPreview} className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"><Eye size={14} />Preview Layout</button>
          <button type="button" onClick={onApply} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">Apply Safely</button>
        </footer>
      </section>
    </div>
  );
}
