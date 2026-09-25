"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  Calendar, CheckCircle2, Plus, Search,
  ArrowLeft, Loader2, X, Trash2, Edit2
} from "lucide-react";

type ProjectOption = {
  id: string;
  name: string;
  project_number: string;
  contract_value: number | null;
};

type Milestone = {
  id: string;
  project_id: string;
  milestone_name: string;
  percentage: number | null;
  fixed_amount: number;
  due_date: string | null;
  paid_amount: number;
  balance: number;
  status: "Pending" | "Invoiced" | "Paid" | "Overdue";
  reference: string | null;
  notes: string | null;
  created_at: string;
  projects?: { name: string; project_number: string; contract_value: number | null };
};

export default function ProjectMilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState("");
  const [formName, setFormName] = useState("");
  const [formPercentage, setFormPercentage] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formPaidAmount, setFormPaidAmount] = useState("0");
  const [formStatus, setFormStatus] = useState<"Pending" | "Invoiced" | "Paid" | "Overdue">("Pending");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");

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

      const [mRes, pRes] = await Promise.all([
        supabase
          .from("project_milestones")
          .select("*, projects(name, project_number, contract_value)")
          .eq("company_id", companyId)
          .order("due_date", { ascending: true }),
        supabase
          .from("projects")
          .select("id, name, project_number, contract_value")
          .eq("company_id", companyId)
          .order("name", { ascending: true })
      ]);

      setMilestones(mRes.data || []);
      setProjects(pRes.data || []);
    } catch (err) {
      console.error("Error loading milestones:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingId(null);
    setFormProjectId(projects[0]?.id || "");
    setFormName("");
    setFormPercentage("20");
    setFormAmount("");
    setFormDueDate("");
    setFormPaidAmount("0");
    setFormStatus("Pending");
    setFormReference("");
    setFormNotes("");
    setErrorMsg("");
    setShowModal(true);
  }

  function handleEdit(m: Milestone) {
    setEditingId(m.id);
    setFormProjectId(m.project_id);
    setFormName(m.milestone_name);
    setFormPercentage(m.percentage ? m.percentage.toString() : "");
    setFormAmount(m.fixed_amount.toString());
    setFormDueDate(m.due_date || "");
    setFormPaidAmount(m.paid_amount.toString());
    setFormStatus(m.status);
    setFormReference(m.reference || "");
    setFormNotes(m.notes || "");
    setErrorMsg("");
    setShowModal(true);
  }

  // Auto calculate amount when percentage changes against project contract value
  function handleProjectOrPctChange(projId: string, pctStr: string) {
    setFormProjectId(projId);
    setFormPercentage(pctStr);
    const proj = projects.find(p => p.id === projId);
    const val = Number(proj?.contract_value || 0);
    const pct = parseFloat(pctStr);
    if (val > 0 && !isNaN(pct) && pct > 0) {
      setFormAmount(((val * pct) / 100).toFixed(2));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formProjectId) {
      setErrorMsg("Please select a project.");
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid milestone amount.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company found.");

      const paid = parseFloat(formPaidAmount) || 0;
      const balance = Math.max(0, amt - paid);
      const pctVal = parseFloat(formPercentage) || null;

      const payload = {
        company_id: companyId,
        project_id: formProjectId,
        milestone_name: formName.trim(),
        percentage: pctVal,
        fixed_amount: amt,
        due_date: formDueDate || null,
        paid_amount: paid,
        balance,
        status: formStatus,
        reference: formReference.trim() || null,
        notes: formNotes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("project_milestones")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setSuccessMsg("Milestone updated successfully.");
      } else {
        const { error } = await supabase
          .from("project_milestones")
          .insert(payload);
        if (error) throw error;
        setSuccessMsg("Milestone created successfully.");
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save milestone.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this payment milestone?")) return;
    try {
      const { error } = await supabase.from("project_milestones").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Milestone deleted.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete milestone.";
      alert(msg);
    }
  }

  const filtered = milestones.filter(m => {
    const matchProj = selectedProjectId === "all" || m.project_id === selectedProjectId;
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    const matchSearch =
      m.milestone_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.projects?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.reference || "").toLowerCase().includes(search.toLowerCase());
    return matchProj && matchStatus && matchSearch;
  });

  const totalValue = filtered.reduce((acc, m) => acc + (m.fixed_amount || 0), 0);
  const totalPaid = filtered.reduce((acc, m) => acc + (m.paid_amount || 0), 0);
  const totalDue = totalValue - totalPaid;

  // Next milestone due
  const upcoming = milestones
    .filter(m => m.status !== "Paid" && m.due_date)
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1))[0];

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
                <Calendar size={20} />
              </span>
              Project Payment Milestones
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Track contractual billing phases, collection schedules, and upcoming project dues</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> New Milestone
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Milestone Value</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalValue.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">{filtered.length} scheduled phases</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Collected / Paid</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">
            AED {totalPaid.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Confirmed client receipts</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
          <p className="text-2xl font-bold text-amber-600 mt-2 font-mono">
            AED {totalDue.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Remaining milestone payments</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Next Milestone Due</p>
          {upcoming ? (
            <div className="mt-2">
              <p className="text-sm font-bold text-blue-900 truncate">{upcoming.milestone_name}</p>
              <p className="text-xs text-blue-700 font-mono mt-0.5">
                Due: {upcoming.due_date} &bull; AED {upcoming.fixed_amount.toLocaleString("en-AE")}
              </p>
            </div>
          ) : (
            <p className="text-xs text-blue-600 mt-2">All scheduled milestones up to date</p>
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search milestone or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.project_number})</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Invoiced">Invoiced</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Milestone Name</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3 text-center">% Share</th>
                <th className="px-4 py-3 text-right">Amount (AED)</th>
                <th className="px-4 py-3 text-right">Paid (AED)</th>
                <th className="px-4 py-3 text-right">Balance (AED)</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading milestones...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No payment milestones found. Click &quot;New Milestone&quot; to set up billing schedules.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {m.milestone_name}
                      {m.reference && <span className="block text-[10px] text-slate-400 font-mono">Ref: {m.reference}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${m.project_id}`} className="font-medium text-slate-800 hover:text-emerald-600">
                        {m.projects?.name || "Project"}
                      </Link>
                      <span className="block text-[10px] text-slate-400 font-mono">{m.projects?.project_number}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-medium text-slate-600">
                      {m.percentage ? `${m.percentage}%` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {m.fixed_amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">
                      {m.paid_amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 font-semibold">
                      {m.balance.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono whitespace-nowrap">
                      {m.due_date || "TBD"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === "Paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : m.status === "Invoiced"
                          ? "bg-blue-100 text-blue-800"
                          : m.status === "Overdue"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(m)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? "Edit Payment Milestone" : "New Payment Milestone"}
              </h3>
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
                  onChange={(e) => handleProjectOrPctChange(e.target.value, formPercentage)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.project_number}) &bull; AED {Number(p.contract_value || 0).toLocaleString("en-AE")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Milestone Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Advance Payment on Signing, 50% Material Delivery..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">% of Contract</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 20"
                    value={formPercentage}
                    onChange={(e) => handleProjectOrPctChange(formProjectId, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Milestone Amount (AED) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 50000.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "Pending" | "Invoiced" | "Paid" | "Overdue")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Invoiced">Invoiced</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Paid Amount (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPaidAmount}
                    onChange={(e) => setFormPaidAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Invoice #</label>
                  <input
                    type="text"
                    placeholder="INV-2026-0001"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Terms for milestone release..."
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
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {editingId ? "Save Changes" : "Create Milestone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
