"use client";

import { useEffect, useRef, useState } from "react";
import { readProjectResult } from "@/lib/projectPersistence";
import ReportLoadState from "@/components/ReportLoadState";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany, todayISO } from "@/lib/helpers";
import {
  FileText, Search, ArrowLeft, Printer, ExternalLink, Plus
} from "lucide-react";
import WorkMethodStatementTemplate, { WMSData, RiskAssessmentRow, QAQCChecklistItem } from "@/components/documents/WorkMethodStatementTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type WMSItem = {
  id: string;
  project_id: string;
  wms_number: string;
  title: string;
  location: string | null;
  main_contractor: string | null;
  subcontractor: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  document_date: string | null;
  revision: string;
  purpose: string | null;
  scope: string | null;
  reference_documents?: string | null;
  responsibilities?: string | null;
  materials?: string | null;
  tools_equipment?: string | null;
  pre_installation?: string | null;
  installation_procedure: string | null;
  quality_control?: string | null;
  health_safety?: string | null;
  environmental?: string | null;
  acceptance_criteria?: string | null;
  status: string;
  created_at: string;
  projects?: { name: string; project_number: string };
};

export default function WorkMethodStatementsPage() {
  const [wmsList, setWmsList] = useState<WMSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewVersion = useRef(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Print preview state
  const [previewWms, setPreviewWms] = useState<WMSItem | null>(null);
  const [companyDoc, setCompanyDoc] = useState<CompanyDocInfo | null>(null);
  const [risks, setRisks] = useState<RiskAssessmentRow[]>([]);
  const [qaqc, setQaqc] = useState<QAQCChecklistItem[]>([]);

  async function loadWMS() {
    setLoading(true); setLoadError("");
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Select a company before loading method statements.");

      const { data, error } = await supabase
        .from("work_method_statements")
        .select("*, projects(name, project_number)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWmsList(data || []);

      const comp = await getCurrentCompany();
      if (comp) setCompanyDoc(comp);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load saved method statements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadWMS);
  }, []);

  async function handleOpenPreview(wms: WMSItem) {
    const version = ++previewVersion.current;
    setPreviewWms(null); setPreviewError(""); setPreviewLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Select a company before previewing a method statement.");
      const [riskRows, checklistRows] = await Promise.all([
        readProjectResult<RiskAssessmentRow[]>(supabase.from("wms_risk_assessments").select("*").eq("wms_id", wms.id).eq("company_id", companyId).order("sequence_order", {ascending:true})),
        readProjectResult<QAQCChecklistItem[]>(supabase.from("wms_qaqc_checklists").select("*").eq("wms_id", wms.id).eq("company_id", companyId).order("created_at", {ascending:true})),
      ]);
      if (version !== previewVersion.current) return;
      setRisks(riskRows || []); setQaqc(checklistRows || []); setPreviewWms(wms);
    } catch (err) {
      if (version === previewVersion.current) setPreviewError(err instanceof Error ? err.message : "Could not load saved assessments. Retry the preview.");
    } finally {
      if (version === previewVersion.current) setPreviewLoading(false);
    }
  }

  const filtered = wmsList.filter(w => {
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      w.wms_number.toLowerCase().includes(q) ||
      w.title.toLowerCase().includes(q) ||
      (w.projects?.name || "").toLowerCase().includes(q) ||
      (w.main_contractor || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  if (loadError) return <ReportLoadState loading={loading} error={loadError} subject="method statements" onRetry={() => void loadWMS()} />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {previewError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{previewError}</p>}
      {previewLoading && <p role="status">Loading saved assessments before opening the preview…</p>}
      <div className="app-screen-content no-print space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  <FileText size={20} />
                </span>
                Work Method Statements (WMS)
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">Engineering procedures, site execution sequences, and client submittal approval logs</p>
            </div>
          </div>

          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} /> Create WMS in Project
          </Link>
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search WMS #, title, project or contractor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            >
              <option value="all">All Approval Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 text-[11px] uppercase font-semibold text-slate-300 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">WMS Number</th>
                  <th className="px-4 py-3">Title &amp; Scope</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Contractor / Location</th>
                  <th className="px-4 py-3 text-center">Rev</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      Loading Work Method Statements...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      No Work Method Statements found. Open any Project to author new WMS documents.
                    </td>
                  </tr>
                ) : (
                  filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white font-mono">
                        {w.wms_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-white">{w.title}</span>
                        {w.scope && <span className="block text-[10px] text-slate-400 truncate max-w-sm">{w.scope}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/projects/${w.project_id}`} className="font-medium text-emerald-400 hover:text-emerald-300">
                          {w.projects?.name || "Project"}
                        </Link>
                        <span className="block text-[10px] text-slate-400 font-mono">{w.projects?.project_number}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {w.main_contractor || "-"}
                        {w.location && <span className="block text-[10px] text-slate-400">{w.location}</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-300">
                        {w.revision || "R0"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {w.document_date || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          w.status === "Approved"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : w.status === "Submitted"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : w.status === "Rejected"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-slate-700 text-slate-300 border border-slate-600"
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(w)}
                            className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-medium"
                            title="Print / PDF Preview"
                          >
                            <Printer size={14} /> Print
                          </button>
                          <Link
                            href={`/projects/${w.project_id}`}
                            className="text-slate-400 hover:text-white p-1"
                            title="Open Project"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PRINT PREVIEW MODAL */}
      <PrintModal isOpen={!!previewWms} onClose={() => setPreviewWms(null)}>
        {previewWms && (
          <WorkMethodStatementTemplate
            company={companyDoc}
            wms={{
              ...(previewWms as unknown as WMSData),
              project_name: previewWms.projects?.name || "Project",
              date: previewWms.document_date || todayISO(),
              risk_assessment: risks,
              qaqc_checklist: qaqc,
            }}
            onClose={() => setPreviewWms(null)}
          />
        )}
      </PrintModal>
    </div>
  );
}
