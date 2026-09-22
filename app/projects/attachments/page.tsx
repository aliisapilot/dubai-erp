"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  FileText, Plus, Search, ArrowLeft, Loader2, X, Trash2,
  ExternalLink, Paperclip, Download, Filter, FileSpreadsheet,
  Image, FileCode, CheckCircle2
} from "lucide-react";

type DocAttachment = {
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
};

type ProjectOption = { id: string; name: string; project_number: string };

export default function DocumentAttachmentsPage() {
  const [attachments, setAttachments] = useState<DocAttachment[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [entityType, setEntityType] = useState("project");
  const [entityId, setEntityId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("PDF");
  const [fileSizeKb, setFileSizeKb] = useState("250");
  const [description, setDescription] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");

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

      const [attRes, prjRes] = await Promise.all([
        supabase
          .from("document_attachments")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("id, name, project_number")
          .eq("company_id", companyId)
          .order("name", { ascending: true })
      ]);

      setAttachments(attRes.data || []);
      setProjects(prjRes.data || []);
      if (prjRes.data && prjRes.data.length > 0) {
        setEntityId(prjRes.data[0].id);
      }
    } catch (err) {
      console.error("Error loading attachments:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setFileName("");
    setFileUrl("");
    setFileType("PDF");
    setFileSizeKb("250");
    setDescription("");
    setErrorMsg("");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) {
      setErrorMsg("Please provide both file name and document URL.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const sizeBytes = Math.round((parseFloat(fileSizeKb) || 100) * 1024);

      const { error } = await supabase
        .from("document_attachments")
        .insert({
          company_id: companyId,
          entity_type: entityType,
          entity_id: entityId || "00000000-0000-0000-0000-000000000000",
          file_name: fileName.trim(),
          file_url: fileUrl.trim(),
          file_size: sizeBytes,
          file_type: fileType,
          description: description.trim() || null,
          uploaded_by: uploadedBy.trim() || "Admin",
        });

      if (error) throw error;

      setSuccessMsg("Document attachment registered successfully.");
      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record attachment.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this document attachment?")) return;
    try {
      const { error } = await supabase.from("document_attachments").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Document attachment removed.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete attachment.";
      alert(msg);
    }
  }

  const filtered = attachments.filter(a => {
    const matchType = typeFilter === "all" || a.entity_type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch =
      a.file_name.toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q) ||
      (a.uploaded_by || "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  function getFileIcon(ext?: string | null) {
    const t = (ext || "").toLowerCase();
    if (t.includes("pdf")) return <FileText className="text-rose-500" size={18} />;
    if (t.includes("xls") || t.includes("csv")) return <FileSpreadsheet className="text-emerald-600" size={18} />;
    if (t.includes("jpg") || t.includes("png") || t.includes("jpeg")) return <Image className="text-blue-500" size={18} />;
    return <FileCode className="text-slate-500" size={18} />;
  }

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
                <Paperclip size={20} />
              </span>
              Attachments &amp; Technical Submittals
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Central repository for shop drawings, permits, test certificates, and compliance docs</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> Add Attachment
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

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search document name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Entity Types</option>
            <option value="project">Projects</option>
            <option value="wms">Work Method Statements</option>
            <option value="qaqc">QA/QC Inspections</option>
            <option value="handover">Handover Certificates</option>
            <option value="invoice">Tax Invoices</option>
            <option value="po">Purchase Orders</option>
            <option value="customer">Customers</option>
            <option value="supplier">Suppliers</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Entity Module</th>
                <th className="px-4 py-3">File Type &amp; Size</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Upload Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading attachments repository...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No document attachments found. Click &quot;Add Attachment&quot; to link engineering drawings, PDFs, or specs.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 font-semibold text-slate-900">
                        {getFileIcon(a.file_type || a.file_name)}
                        <a
                          href={a.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-600 truncate max-w-sm"
                        >
                          {a.file_name}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                        {a.entity_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {a.file_type || "File"} &bull; {a.file_size ? `${Math.round(a.file_size / 1024)} KB` : "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-700 truncate max-w-xs">
                      {a.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {a.uploaded_by || "Admin"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={a.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                          title="Open Document"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
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

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Add Technical Document Attachment</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Entity Module *</label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="project">Project</option>
                    <option value="wms">Work Method Statement</option>
                    <option value="qaqc">QA/QC Inspection</option>
                    <option value="handover">Handover Certificate</option>
                    <option value="invoice">Tax Invoice</option>
                    <option value="po">Purchase Order</option>
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Associated Project</label>
                  <select
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">File Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dubai_Municipality_Approved_Drawing_Rev2.pdf"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document URL / Storage Link *</label>
                <input
                  type="text"
                  required
                  placeholder="https://... or /documents/drawing-01.pdf"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">File Type</label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="PDF">PDF</option>
                    <option value="DOCX">DOCX</option>
                    <option value="XLSX">XLSX</option>
                    <option value="PPTX">PPTX</option>
                    <option value="JPG">JPG</option>
                    <option value="PNG">PNG</option>
                    <option value="DWG / CAD">DWG / CAD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Est. Size (KB)</label>
                  <input
                    type="number"
                    value={fileSizeKb}
                    onChange={(e) => setFileSizeKb(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Purpose</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Approved structural calculations stamped by Dubai Civil Defence..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                  Save Attachment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
