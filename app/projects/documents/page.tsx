"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  FileCode2, Search, ArrowLeft, Plus, ExternalLink, Loader2, X,
  Trash2, Paperclip, CheckCircle2
} from "lucide-react";

type TechnicalDoc = {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  project?: { name: string; project_number: string };
};

type ProjectOption = { id: string; name: string; project_number: string };

export default function TechnicalDocumentsPage() {
  const [docs, setDocs] = useState<TechnicalDoc[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [formProjectId, setFormProjectId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDiscipline, setFormDiscipline] = useState("MEP Engineering");
  const [formRevision, setFormRevision] = useState("Rev 0");
  const [formDescription, setFormDescription] = useState("");
  const [formConsultantRemark, setFormConsultantRemark] = useState("Code A - Approved");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadDocs();
  }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [pRes, dRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, project_number")
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
        supabase
          .from("document_attachments")
          .select("*")
          .eq("company_id", companyId)
          .in("entity_type", ["project", "wms", "qaqc", "handover"])
          .order("created_at", { ascending: false })
      ]);

      const projectList = pRes.data || [];
      setProjects(projectList);
      if (projectList.length > 0) setFormProjectId(projectList[0].id);

      // Map project details
      const prjMap: Record<string, ProjectOption> = {};
      projectList.forEach(p => { prjMap[p.id] = p; });

      const mapped = (dRes.data || []).map(d => ({
        ...d,
        project: prjMap[d.entity_id],
      }));

      setDocs(mapped);
    } catch (err) {
      console.error("Error loading technical documents:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setFormTitle("");
    setFormUrl("");
    setFormDiscipline("MEP Engineering");
    setFormRevision("Rev 0");
    setFormDescription("");
    setFormConsultantRemark("Code A - Approved");
    setErrorMsg("");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formProjectId) {
      setErrorMsg("Please select a project.");
      return;
    }
    if (!formTitle.trim() || !formUrl.trim()) {
      setErrorMsg("Please provide submittal title and document link.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const fullDesc = `[${formDiscipline}] [${formRevision}] [Status: ${formConsultantRemark}] ${formDescription.trim()}`;

      const { error } = await supabase
        .from("document_attachments")
        .insert({
          company_id: companyId,
          entity_type: "project",
          entity_id: formProjectId,
          file_name: `${formTitle.trim()} (${formRevision})`,
          file_url: formUrl.trim(),
          file_type: "PDF / Technical Submittal",
          file_size: 512000,
          description: fullDesc,
          uploaded_by: "Engineering Dept",
        });

      if (error) throw error;

      setSuccessMsg("Technical document submittal logged successfully.");
      setShowModal(false);
      loadDocs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record technical document.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this technical submittal?")) return;
    try {
      const { error } = await supabase.from("document_attachments").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Document submittal deleted.");
      loadDocs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete document.";
      alert(msg);
    }
  }

  const filtered = docs.filter(d => {
    const matchProj = projectFilter === "all" || d.entity_id === projectFilter;
    const q = search.toLowerCase();
    const matchSearch =
      d.file_name.toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q) ||
      (d.project?.name || "").toLowerCase().includes(q);
    return matchProj && matchSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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
              <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                <FileCode2 size={20} />
              </span>
              Technical Documents &amp; Submittals
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Shop drawings, material approval requests (MAR), calculation sheets, and consultant approvals</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> New Submittal
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {successMsg}
          </div>
          <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search submittal title, discipline, or remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Submittal Document Title</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Discipline &amp; Remarks</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading technical submittals...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No technical documents found. Click &quot;New Submittal&quot; to upload engineering packages.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <FileCode2 size={16} className="text-indigo-600 shrink-0" />
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600"
                        >
                          {d.file_name}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{d.project?.name || "Project Linked"}</span>
                      {d.project?.project_number && (
                        <span className="block text-[10px] text-slate-400 font-mono">{d.project.project_number}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-md">
                      {d.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.uploaded_by || "Admin"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Open Link"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">New Technical Document Submittal</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project *</label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Submittal Title / Package *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop Drawings — Fire Alarm &amp; Fighting System Layout"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discipline</label>
                  <select
                    value={formDiscipline}
                    onChange={(e) => setFormDiscipline(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="MEP Engineering">MEP Engineering</option>
                    <option value="HVAC / Mechanical">HVAC / Mechanical</option>
                    <option value="Electrical / ELV">Electrical / ELV</option>
                    <option value="Structural &amp; Civil">Structural &amp; Civil</option>
                    <option value="Architectural &amp; Fit-Out">Architectural &amp; Fit-Out</option>
                    <option value="Civil Defence / Fire">Civil Defence / Fire</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Revision</label>
                  <input
                    type="text"
                    value={formRevision}
                    onChange={(e) => setFormRevision(e.target.value)}
                    placeholder="Rev 0, Rev 1..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Consultant Review Status</label>
                <select
                  value={formConsultantRemark}
                  onChange={(e) => setFormConsultantRemark(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Code A - Approved">Code A - Approved (No Comments)</option>
                  <option value="Code B - Approved as Noted">Code B - Approved as Noted</option>
                  <option value="Code C - Revise &amp; Resubmit">Code C - Revise &amp; Resubmit</option>
                  <option value="Code D - Rejected">Code D - Rejected</option>
                  <option value="Under Review / Pending">Under Review / Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Link / Cloud Storage URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://drive.google.com/... or /submittals/mep-01.pdf"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Scope &amp; Consultant Comments</label>
                <textarea
                  rows={2}
                  placeholder="Compliance with Dubai Municipality building code and NFPA standards..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                  Save Technical Submittal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
