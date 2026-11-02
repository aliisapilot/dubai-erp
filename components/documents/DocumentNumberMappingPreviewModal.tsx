"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Search,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Filter,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { DocumentMappingItem, fmtAED } from "@/lib/helpers";

interface DocumentNumberMappingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  mappings: DocumentMappingItem[];
  title?: string;
}

export default function DocumentNumberMappingPreviewModal({
  isOpen,
  onClose,
  mappings,
  title = "Document Numbering Simplification & Collision Preview",
}: DocumentNumberMappingPreviewModalProps) {
  const [search, setSearch] = useState("");
  const [filterCollisionOnly, setFilterCollisionOnly] = useState(false);

  const collisionCount = useMemo(
    () => mappings.filter((m) => m.hasCollision).length,
    [mappings]
  );

  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      if (filterCollisionOnly && !m.hasCollision) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        m.originalNumber.toLowerCase().includes(q) ||
        m.simplifiedNumber.toLowerCase().includes(q) ||
        (m.customerName && m.customerName.toLowerCase().includes(q)) ||
        (m.collisionDetails && m.collisionDetails.toLowerCase().includes(q))
      );
    });
  }, [mappings, filterCollisionOnly, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600/30 p-2 text-blue-400 border border-blue-500/30">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400">
                Audit preview of original historical identifiers vs simplified clean document numbers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold text-slate-900">Legal & Tax Audit Safety Guaranteed: </span>
            Original historical document numbers are preserved in Supabase and never silently modified.
            Simplified clean numbering (e.g. <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-300">INV-105</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-300">QUO-009</code>) is applied to display references and customer statements. Any records with identical numeric portions are safely detected and disambiguated below.
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-3 gap-4 px-6 pt-4 pb-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Total Documents
            </span>
            <span className="text-xl font-bold font-mono text-slate-900">
              {mappings.length}
            </span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider block">
              Clean 1:1 Mappings
            </span>
            <span className="text-xl font-bold font-mono text-emerald-800">
              {mappings.length - collisionCount}
            </span>
          </div>

          <div
            className={`rounded-xl border p-3 ${
              collisionCount > 0
                ? "border-amber-300 bg-amber-50/80"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <span
              className={`text-[11px] font-medium uppercase tracking-wider block ${
                collisionCount > 0 ? "text-amber-800 font-bold" : "text-slate-500"
              }`}
            >
              Collisions Detected
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`text-xl font-bold font-mono ${
                  collisionCount > 0 ? "text-amber-900" : "text-slate-900"
                }`}
              >
                {collisionCount}
              </span>
              {collisionCount > 0 && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  Disambiguated
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-6 py-3 flex items-center justify-between gap-3 border-b border-slate-200">
          <div className="relative flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search original #, simplified #, or customer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterCollisionOnly(!filterCollisionOnly)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition border ${
                filterCollisionOnly
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle size={13} />
              Collisions Only ({collisionCount})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold sticky top-0">
                <th className="py-2.5 px-3">Original DB Identifier</th>
                <th className="py-2.5 px-3">Simplified Display</th>
                <th className="py-2.5 px-3">Customer / Party</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredMappings.map((m, idx) => (
                <tr
                  key={m.id || idx}
                  className={
                    m.hasCollision
                      ? "bg-amber-50/70 hover:bg-amber-100/60"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="py-2 px-3 text-slate-600 font-bold">
                    {m.originalNumber}
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      {m.simplifiedNumber}
                    </span>
                    {m.hasCollision && (
                      <div className="text-[10px] text-amber-800 font-sans mt-0.5 font-medium">
                        Safe Display: <span className="font-mono font-bold">{m.displayNumber}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-800">
                    {m.customerName || "—"}
                  </td>
                  <td className="py-2 px-3 text-slate-500 font-sans">
                    {m.date || "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-800">
                    {m.totalAmount != null ? fmtAED(m.totalAmount) : "—"}
                  </td>
                  <td className="py-2 px-3 text-center font-sans">
                    {m.hasCollision ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                        title={m.collisionDetails}
                      >
                        <AlertTriangle size={11} /> Collision
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <CheckCircle2 size={11} /> Clean 1:1
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredMappings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No documents matching the filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Showing {filteredMappings.length} of {mappings.length} document references
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-sm"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

