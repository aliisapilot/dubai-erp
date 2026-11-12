"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, getCurrentCompany, generateDocNumber, todayISO } from "@/lib/helpers";
import {
  CheckCircle, ArrowLeft, Search, Plus, Printer, Loader2, X,
  Trash2, Edit2, FileCheck
} from "lucide-react";
import ProjectHandoverTemplate from "@/components/documents/ProjectHandoverTemplate";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

type HandoverItem = {
  id: string;
  project_id: string;
  handover_number: string;
  handover_date: string;
  scope_completed: string;
  snags_remarks: string | null;
  client_representative: string | null;
  contractor_representative: string | null;
  status: "Draft" | "Snag List Pending" | "Completed" | "Approved";
  created_at: string;
  projects?: { name: string; project_number: string; location?: string | null };
};

type ProjectOption = { id: string; name: string; project_number: string };

export default function ProjectHandoverPage() {
  const [handovers, setHandovers] = useState<HandoverItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState("");
  const [formNumber, setFormNumber] = useState("");
  const [formDate, setFormDate] = useState(todayISO());
  const [formScope, setFormScope] = useState("");
  const [formSnags, setFormSnags] = useState("");
  const [formClientRep, setFormClientRep] = useState("");
  const [formContractorRep, setFormContractorRep] = useState("");
  const [formStatus, setFormStatus] = useState<"Draft" | "Snag List Pending" | "Completed" | "Approved">("Draft");

  // Print preview
  const [previewHandover, setPreviewHandover] = useState<HandoverItem | null>(null);
  const [companyDoc, setCompanyDoc] = useState<CompanyDocInfo | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [hRes, pRes] = await Promise.all([
        supabase
          .from("project_handovers")
          .select("*, projects(name, project_number, location)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("id, name, project_number")
          .eq("company_id", companyId)
          .order("name", { ascending: true })
      ]);

      setHandovers((hRes.data as unknown as HandoverItem[]) || []);
      setProjects(pRes.data || []);
      if (pRes.data && pRes.data.length > 0) {
        setFormProjectId(pRes.data[0].id);
      }

      const comp = await getCurrentCompany();
      if (comp) setCompanyDoc(comp);
    } catch (err) {
      console.error("Error loading handovers:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingId(null);
    setFormNumber("");
    setFormDate(todayISO());
    setFormScope("All structural and architectural fit-out scope completed as per approved drawing revisions and employer requirements.");
    setFormSnags("No critical snags. Minor touch-up painting in corridor to be resolved within 7 days.");
    setFormClientRep("Client Project Manager");
    setFormContractorRep("Contractor Operations Director");
    setFormStatus("Completed");
    setErrorMsg("");
    setShowModal(true);
  }

  function handleEdit(h: HandoverItem) {
    setEditingId(h.id);
    setFormProjectId(h.project_id);
    setFormNumber(h.handover_number);
    setFormDate(h.handover_date);
    setFormScope(h.scope_completed);
    setFormSnags(h.snags_remarks || "");
    setFormClientRep(h.client_representative || "");
    setFormContractorRep(h.contractor_representative || "");
    setFormStatus(h.status);
    setErrorMsg("");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formProjectId) {
      setErrorMsg("Please select a project.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const hoNum = editingId ? formNumber.trim() : await generateDocNumber(companyId, "HO");

      const payload = {
        company_id: companyId,
        project_id: formProjectId,
        handover_number: hoNum,
        handover_date: formDate,
        scope_completed: formScope.trim(),
        snags_remarks: formSnags.trim() || null,
        client_representative: formClientRep.trim() || null,
        contractor_representative: formContractorRep.trim() || null,
        status: formStatus,
      };

      if (editingId) {
        const { error } = await supabase
          .from("project_handovers")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setSuccessMsg("Handover certificate updated.");
      } else {
        const { error } = await supabase
          .from("project_handovers")
          .insert(payload);
        if (error) throw error;
        setSuccessMsg("Handover certificate created.");
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save handover certificate.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this handover certificate?")) return;
    try {
      const { error } = await supabase.from("project_handovers").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Handover record deleted.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete handover.";
      alert(msg);
    }
  }

  const filtered = handovers.filter(h => {
    const matchStatus = statusFilter === "all" || h.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      h.handover_number.toLowerCase().includes(q) ||
      (h.projects?.name || "").toLowerCase().includes(q) ||
      (h.client_representative || "").toLowerCase().includes(q) ||
      (h.contractor_representative || "").toLowerCase().includes(q);
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
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <FileCheck size={20} />
              </span>
              Project Handover &amp; Snagging
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Formal taking-over certificates (TOC), snag resolution lists, and client sign-offs</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> New Handover Certificate
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-400" />
            {successMsg}
          </div>
          <button type="button" onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search handover #, project, client rep..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
          >
            <option value="all">All Handover Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Snag List Pending">Snag List Pending</option>
            <option value="Completed">Completed</option>
            <option value="Approved">Approved</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800 text-[11px] uppercase font-semibold text-slate-300 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3">Handover Certificate #</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Scope Completed</th>
                <th className="px-4 py-3">Snags / Remarks</th>
                <th className="px-4 py-3">Signatories</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading handover certificates...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No handover certificates found. Click &quot;New Handover Certificate&quot; to issue client acceptance docs.
                  </td>
                </tr>
              ) : (
                filtered.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-700/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white font-mono">
                      {h.handover_number}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${h.project_id}`} className="font-medium text-emerald-400 hover:text-emerald-300">
                        {h.projects?.name || "Project"}
                      </Link>
                      <span className="block text-[10px] text-slate-400 font-mono">{h.projects?.project_number}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                      {h.handover_date}
                    </td>
                    <td className="px-4 py-3 text-slate-300 truncate max-w-xs">
                      {h.scope_completed}
                    </td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                      {h.snags_remarks || "No snags noted"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div><span className="text-[10px] text-slate-400">Client:</span> {h.client_representative || "-"}</div>
                      <div><span className="text-[10px] text-slate-400">Contractor:</span> {h.contractor_representative || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        h.status === "Approved"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : h.status === "Completed"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : h.status === "Snag List Pending"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-slate-700 text-slate-300 border border-slate-600"
                      }`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewHandover(h)}
                          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
                          title="Print / PDF Preview"
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(h)}
                          className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(h.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
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

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8 text-white">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingId ? "Edit Handover Certificate" : "New Handover Certificate"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Project *</label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Handover # {editingId ? "(Read-only)" : "(Auto-generated on save)"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingId ? formNumber : "Auto-generated on save"}
                    className="w-full rounded-lg border border-slate-800 px-3 py-2 text-sm font-mono bg-slate-950 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Handover Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "Draft" | "Snag List Pending" | "Completed" | "Approved")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Snag List Pending">Snag List Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Completed Scope of Work *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail completed works, installations, and testing..."
                  value={formScope}
                  onChange={(e) => setFormScope(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Snagging Remarks / Outstanding Minor Items</label>
                <textarea
                  rows={2}
                  placeholder="Any minor snags agreed to be closed during Defects Liability Period (DLP)..."
                  value={formSnags}
                  onChange={(e) => setFormSnags(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Client Representative</label>
                  <input
                    type="text"
                    placeholder="Name / Title"
                    value={formClientRep}
                    onChange={(e) => setFormClientRep(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contractor Representative</label>
                  <input
                    type="text"
                    placeholder="Name / Title"
                    value={formContractorRep}
                    onChange={(e) => setFormContractorRep(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                  {editingId ? "Save Changes" : "Create Certificate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>

      {/* PRINT PREVIEW MODAL */}
      {previewHandover && (() => {
        const docFile = generateDocumentPdfFilename({
          documentType: "handover_certificate",
          documentNumber: previewHandover.handover_number || "HOC",
          customerName: previewHandover.projects?.name || previewHandover.client_representative,
          workDescription: "Handover Certificate",
        });
        return (
          <PrintModal
            isOpen={!!previewHandover}
            onClose={() => setPreviewHandover(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <ProjectHandoverTemplate
              company={companyDoc}
              handover={{
                handover_number: previewHandover.handover_number,
                handover_date: previewHandover.handover_date,
                scope_completed: previewHandover.scope_completed,
                snags_remarks: previewHandover.snags_remarks,
                client_representative: previewHandover.client_representative,
                contractor_representative: previewHandover.contractor_representative,
                status: previewHandover.status,
                project_name: previewHandover.projects?.name || "Project",
                customer_name: previewHandover.client_representative || "Client Representative",
                location: previewHandover.projects?.location || "Dubai, UAE",
              }}
              onClose={() => setPreviewHandover(null)}
            />
          </PrintModal>
        );
      })()}
    </div>
  );
}
