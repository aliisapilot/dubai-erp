"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany } from "@/lib/helpers";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Print preview state
  const [previewWms, setPreviewWms] = useState<WMSItem | null>(null);
  const [companyDoc, setCompanyDoc] = useState<CompanyDocInfo | null>(null);
  const [risks, setRisks] = useState<RiskAssessmentRow[]>([]);
  const [qaqc, setQaqc] = useState<QAQCChecklistItem[]>([]);

  async function loadWMS() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

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
      console.error("Error loading WMS documents:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadWMS);
  }, []);

  async function handleOpenPreview(wms: WMSItem) {
    setPreviewWms(wms);
    try {
      const [rRes, qRes] = await Promise.all([
        supabase.from("wms_risk_assessments").select("*").eq("wms_id", wms.id).order("sequence_order", { ascending: true }),
        supabase.from("wms_qaqc_checklists").select("*").eq("wms_id", wms.id).order("created_at", { ascending: true })
      ]);
      setRisks(rRes.data || []);
      setQaqc(qRes.data || []);
    } catch (err) {
      console.error("Error loading WMS sub-items for preview:", err);
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="app-screen-content no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                <FileText size={20} />
              </span>
              Work Method Statements (WMS)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Engineering procedures, site execution sequences, and client submittal approval logs</p>
          </div>
        </div>

        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Create WMS in Project
        </Link>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search WMS #, title, project or contractor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100">
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
                  <tr key={w.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                      {w.wms_number}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">{w.title}</span>
                      {w.scope && <span className="block text-[10px] text-slate-400 truncate max-w-sm">{w.scope}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${w.project_id}`} className="font-medium text-slate-800 hover:text-teal-600">
                        {w.projects?.name || "Project"}
                      </Link>
                      <span className="block text-[10px] text-slate-400 font-mono">{w.projects?.project_number}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.main_contractor || "-"}
                      {w.location && <span className="block text-[10px] text-slate-400">{w.location}</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                      {w.revision || "R0"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                      {w.document_date || "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        w.status === "Approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : w.status === "Submitted"
                          ? "bg-blue-100 text-blue-800"
                          : w.status === "Rejected"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(w)}
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 font-medium"
                          title="Print / PDF Preview"
                        >
                          <Printer size={14} /> Print
                        </button>
                        <Link
                          href={`/projects/${w.project_id}`}
                          className="text-slate-400 hover:text-slate-700 p-1"
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
              date: previewWms.document_date || new Date().toISOString().split("T")[0],
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
