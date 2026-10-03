"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, todayISO } from "@/lib/helpers";
import {
  ShieldCheck, CheckCircle2, XCircle, AlertCircle, ArrowLeft, Search,
  Plus, Loader2, X, Trash2, Edit2
} from "lucide-react";

type QAQCItem = {
  id: string;
  wms_id: string;
  item_number: number;
  inspection_item: string;
  acceptance_criteria: string;
  status: "Pending" | "Pass" | "Fail" | "Hold" | "N/A";
  remarks: string | null;
  inspector_name: string | null;
  inspection_date: string | null;
  created_at?: string;
  work_method_statements?: {
    wms_number: string;
    title: string;
    project_id: string;
    projects?: { name: string; project_number: string };
  };
};

type WMSOption = {
  id: string;
  wms_number: string;
  title: string;
};

export default function QAQCInspectionPage() {
  const [items, setItems] = useState<QAQCItem[]>([]);
  const [wmsOptions, setWmsOptions] = useState<WMSOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formWmsId, setFormWmsId] = useState("");
  const [formItemNumber, setFormItemNumber] = useState("1");
  const [formInspectionItem, setFormInspectionItem] = useState("");
  const [formAcceptanceCriteria, setFormAcceptanceCriteria] = useState("");
  const [formStatus, setFormStatus] = useState<"Pending" | "Pass" | "Fail" | "Hold" | "N/A">("Pending");
  const [formRemarks, setFormRemarks] = useState("");
  const [formInspector, setFormInspector] = useState("");
  const [formInspectionDate, setFormInspectionDate] = useState(todayISO());

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [, setSuccessMsg] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [qcRes, wmsRes] = await Promise.all([
        supabase
          .from("wms_qaqc_checklists")
          .select("*, work_method_statements(wms_number, title, project_id, projects(name, project_number))")
          .order("created_at", { ascending: true }),
        supabase
          .from("work_method_statements")
          .select("id, wms_number, title")
          .eq("company_id", companyId)
          .order("wms_number", { ascending: true })
      ]);

      setItems(((qcRes.data || []) as Array<Record<string, unknown>>).map((row, index) => ({
        ...row,
        item_number: index + 1,
      })) as unknown as QAQCItem[]);
      setWmsOptions(wmsRes.data || []);
      if (wmsRes.data && wmsRes.data.length > 0) {
        setFormWmsId(wmsRes.data[0].id);
      }
    } catch (err) {
      console.error("Error loading QA/QC inspection checklist:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingId(null);
    setFormItemNumber(String(items.length + 1));
    setFormInspectionItem("");
    setFormAcceptanceCriteria("");
    setFormStatus("Pending");
    setFormRemarks("");
    setFormInspector("");
    setFormInspectionDate(todayISO());
    setErrorMsg("");
    setShowModal(true);
  }

  function handleEdit(item: QAQCItem) {
    setEditingId(item.id);
    setFormWmsId(item.wms_id);
    setFormItemNumber(String(item.item_number));
    setFormInspectionItem(item.inspection_item);
    setFormAcceptanceCriteria(item.acceptance_criteria);
    setFormStatus(item.status);
    setFormRemarks(item.remarks || "");
    setFormInspector(item.inspector_name || "");
    setFormInspectionDate(item.inspection_date || todayISO());
    setErrorMsg("");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formWmsId) {
      setErrorMsg("Please select a Work Method Statement.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      const payload = {
        company_id: companyId,
        wms_id: formWmsId,
        inspection_item: formInspectionItem.trim(),
        acceptance_criteria: formAcceptanceCriteria.trim(),
        status: formStatus,
        remarks: formRemarks.trim() || null,
        inspector_name: formInspector.trim() || null,
        inspection_date: formInspectionDate || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("wms_qaqc_checklists")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setSuccessMsg("Inspection checklist item updated.");
      } else {
        const { error } = await supabase
          .from("wms_qaqc_checklists")
          .insert(payload);
        if (error) throw error;
        setSuccessMsg("Inspection checklist item added.");
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save QA/QC item.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this inspection item?")) return;
    try {
      const { error } = await supabase.from("wms_qaqc_checklists").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Inspection item removed.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete item.";
      alert(msg);
    }
  }

  const filtered = items.filter(i => {
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      i.inspection_item.toLowerCase().includes(q) ||
      i.acceptance_criteria.toLowerCase().includes(q) ||
      (i.inspector_name || "").toLowerCase().includes(q) ||
      (i.remarks || "").toLowerCase().includes(q) ||
      (i.work_method_statements?.title || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const passCount = items.filter(i => i.status === "Pass").length;
  const pendingCount = items.filter(i => i.status === "Pending").length;
  const failCount = items.filter(i => i.status === "Fail").length;

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
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <ShieldCheck size={20} />
              </span>
              QA/QC Inspection Checklists
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Quality control test items, acceptance criteria verification, and inspector sign-offs</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> Add Inspection Item
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Passed Inspections</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{passCount}</p>
            <p className="text-xs text-emerald-300/80">Meets acceptance criteria</p>
          </div>
          <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Pending Verification</p>
            <p className="text-2xl font-bold text-amber-400 mt-1 font-mono">{pendingCount}</p>
            <p className="text-xs text-amber-300/80">Awaiting site inspection</p>
          </div>
          <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 border border-amber-500/30">
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Failed / Rectification</p>
            <p className="text-2xl font-bold text-rose-400 mt-1 font-mono">{failCount}</p>
            <p className="text-xs text-rose-300/80">Snagged items requiring rework</p>
          </div>
          <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400 border border-rose-500/30">
            <XCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search inspection item or criteria..."
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
            <option value="all">All Inspection Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Pass">Pass</option>
            <option value="Fail">Fail</option>
            <option value="Hold">Hold</option>
            <option value="N/A">N/A</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800 text-[11px] uppercase font-semibold text-slate-300 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 w-12 text-center">#</th>
                <th className="px-4 py-3">Inspection Item</th>
                <th className="px-4 py-3">Acceptance Criteria</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Inspector</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Remarks / Snags</th>
                <th className="px-4 py-3">WMS Reference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading QA/QC checklist items...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No QA/QC inspection items found. Click &quot;Add Inspection Item&quot; to configure quality checklists.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-700/40 transition-colors">
                    <td className="px-4 py-3 text-center font-mono font-bold text-slate-400">
                      {item.item_number}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {item.inspection_item}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {item.acceptance_criteria}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === "Pass"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : item.status === "Fail"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : item.status === "Hold"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : item.status === "N/A"
                          ? "bg-slate-700 text-slate-300 border border-slate-600"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">
                      {item.inspector_name || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                      {item.inspection_date || "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                      {item.remarks || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                      {item.work_method_statements?.wms_number || "WMS"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
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
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8 text-white">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingId ? "Edit QA/QC Inspection Item" : "New QA/QC Inspection Item"}
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
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Work Method Statement (WMS) *</label>
                <select
                  value={formWmsId}
                  onChange={(e) => setFormWmsId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                >
                  {wmsOptions.map(w => (
                    <option key={w.id} value={w.id}>{w.wms_number} &bull; {w.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Item #</label>
                  <input
                    type="number"
                    value={formItemNumber}
                    onChange={(e) => setFormItemNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Inspection Item / Task *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Concrete slump test &amp; cube sampling"
                    value={formInspectionItem}
                    onChange={(e) => setFormInspectionItem(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Acceptance Criteria *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Slump within 120 ± 25mm, temperature < 32°C, 3 cubes per 50m³ batch..."
                  value={formAcceptanceCriteria}
                  onChange={(e) => setFormAcceptanceCriteria(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Inspection Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "Pending" | "Pass" | "Fail" | "Hold" | "N/A")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Hold">Hold</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Inspection Date</label>
                  <input
                    type="date"
                    value={formInspectionDate}
                    onChange={(e) => setFormInspectionDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">QA/QC Inspector</label>
                  <input
                    type="text"
                    placeholder="Eng. Tariq Al-Mansoor"
                    value={formInspector}
                    onChange={(e) => setFormInspector(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Remarks / Snag Ref</label>
                  <input
                    type="text"
                    placeholder="Approved with no comments"
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
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
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {editingId ? "Save Changes" : "Save Inspection Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
