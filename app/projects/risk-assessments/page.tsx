"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  ShieldAlert, AlertTriangle, CheckCircle2, ArrowLeft, Search,
  Plus, Loader2, X, Trash2, Edit2, Filter, ExternalLink
} from "lucide-react";

type RiskRow = {
  id: string;
  wms_id: string;
  sequence_number: number;
  sequence_order?: number;
  activity: string;
  hazard: string;
  initial_risk_level: "High" | "Medium" | "Low";
  control_measures: string;
  residual_risk_level: "High" | "Medium" | "Low";
  risk_level?: "High" | "Medium" | "Low";
  action_by: string | null;
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

export default function RiskAssessmentsPage() {
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [wmsOptions, setWmsOptions] = useState<WMSOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formWmsId, setFormWmsId] = useState("");
  const [formSequence, setFormSequence] = useState("1");
  const [formActivity, setFormActivity] = useState("");
  const [formHazard, setFormHazard] = useState("");
  const [formInitialRisk, setFormInitialRisk] = useState<"High" | "Medium" | "Low">("High");
  const [formControlMeasures, setFormControlMeasures] = useState("");
  const [formResidualRisk, setFormResidualRisk] = useState<"High" | "Medium" | "Low">("Low");
  const [formActionBy, setFormActionBy] = useState("Site Safety Officer");

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

      const [riskRes, wmsRes] = await Promise.all([
        supabase
          .from("wms_risk_assessments")
          .select("*, work_method_statements(wms_number, title, project_id, projects(name, project_number))")
          .order("sequence_order", { ascending: true }),
        supabase
          .from("work_method_statements")
          .select("id, wms_number, title")
          .eq("company_id", companyId)
          .order("wms_number", { ascending: true })
      ]);

      const riskRows = ((riskRes.data || []) as Array<Record<string, unknown>>).map((row, index) => {
        const riskLevel = (row.risk_level || "Medium") as RiskRow["risk_level"];
        return {
          ...row,
          sequence_number: Number(row.sequence_order) || index + 1,
          initial_risk_level: riskLevel,
          residual_risk_level: riskLevel,
          action_by: null,
        } as unknown as RiskRow;
      });
      setRisks(riskRows);
      setWmsOptions(wmsRes.data || []);
      if (wmsRes.data && wmsRes.data.length > 0) {
        setFormWmsId(wmsRes.data[0].id);
      }
    } catch (err) {
      console.error("Error loading risk assessments:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingId(null);
    setFormSequence(String(risks.length + 1));
    setFormActivity("");
    setFormHazard("");
    setFormInitialRisk("High");
    setFormControlMeasures("");
    setFormResidualRisk("Low");
    setFormActionBy("Site Safety Officer");
    setErrorMsg("");
    setShowModal(true);
  }

  function handleEdit(r: RiskRow) {
    setEditingId(r.id);
    setFormWmsId(r.wms_id);
    setFormSequence(String(r.sequence_number));
    setFormActivity(r.activity);
    setFormHazard(r.hazard);
    setFormInitialRisk(r.initial_risk_level);
    setFormControlMeasures(r.control_measures);
    setFormResidualRisk(r.residual_risk_level);
    setFormActionBy(r.action_by || "");
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
        sequence_order: parseInt(formSequence) || 1,
        activity: formActivity.trim(),
        hazard: formHazard.trim(),
        control_measures: formControlMeasures.trim(),
        risk_level: formResidualRisk || formInitialRisk,
      };

      if (editingId) {
        const { error } = await supabase
          .from("wms_risk_assessments")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        setSuccessMsg("Risk assessment updated successfully.");
      } else {
        const { error } = await supabase
          .from("wms_risk_assessments")
          .insert(payload);
        if (error) throw error;
        setSuccessMsg("Risk assessment added.");
      }

      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save risk assessment.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this risk hazard assessment?")) return;
    try {
      const { error } = await supabase.from("wms_risk_assessments").delete().eq("id", id);
      if (error) throw error;
      setSuccessMsg("Risk assessment removed.");
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete risk assessment.";
      alert(msg);
    }
  }

  const filtered = risks.filter(r => {
    const matchLevel = levelFilter === "all" || r.initial_risk_level === levelFilter || r.residual_risk_level === levelFilter;
    const q = search.toLowerCase();
    const matchSearch =
      r.activity.toLowerCase().includes(q) ||
      r.hazard.toLowerCase().includes(q) ||
      r.control_measures.toLowerCase().includes(q) ||
      (r.work_method_statements?.title || "").toLowerCase().includes(q);
    return matchLevel && matchSearch;
  });

  const highCount = risks.filter(r => r.initial_risk_level === "High").length;
  const medCount = risks.filter(r => r.initial_risk_level === "Medium").length;
  const lowResidual = risks.filter(r => r.residual_risk_level === "Low").length;

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
              <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                <ShieldAlert size={20} />
              </span>
              Risk Assessments (HIRA)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Hazard identification, risk level matrix, and engineering control measures</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
        >
          <Plus size={16} /> Add Hazard Assessment
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider">High Initial Hazards</p>
            <p className="text-2xl font-bold text-rose-700 mt-1 font-mono">{highCount}</p>
            <p className="text-xs text-rose-600">Requiring mandatory controls</p>
          </div>
          <div className="p-3 bg-rose-100 rounded-xl text-rose-600">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Medium Risk Activities</p>
            <p className="text-2xl font-bold text-amber-700 mt-1 font-mono">{medCount}</p>
            <p className="text-xs text-amber-600">Operational precautions applied</p>
          </div>
          <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
            <ShieldAlert size={24} />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Mitigated to Low Risk</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">{lowResidual}</p>
            <p className="text-xs text-emerald-600">Controlled residual safety</p>
          </div>
          <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search activity, hazard, or controls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="all">All Risk Levels</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-12 text-center">#</th>
                <th className="px-4 py-3">Work Activity</th>
                <th className="px-4 py-3">Identified Hazard</th>
                <th className="px-4 py-3 text-center">Initial Risk</th>
                <th className="px-4 py-3">Control Measures &amp; Safety Precautions</th>
                <th className="px-4 py-3 text-center">Residual Risk</th>
                <th className="px-4 py-3">Responsible Party</th>
                <th className="px-4 py-3">WMS Reference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading risk assessment matrix...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No risk assessment entries found. Click &quot;Add Hazard Assessment&quot; to register safety controls.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-4 py-3 text-center font-mono font-bold text-slate-500">
                      {r.sequence_number}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {r.activity}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {r.hazard}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.initial_risk_level === "High"
                          ? "bg-rose-100 text-rose-800"
                          : r.initial_risk_level === "Medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {r.initial_risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-sm">
                      {r.control_measures}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.residual_risk_level === "High"
                          ? "bg-rose-100 text-rose-800"
                          : r.residual_risk_level === "Medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {r.residual_risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.action_by || "Safety Officer"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                      {r.work_method_statements?.wms_number || "WMS"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
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
                {editingId ? "Edit Risk Assessment" : "New Hazard & Risk Assessment"}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Work Method Statement (WMS) *</label>
                <select
                  value={formWmsId}
                  onChange={(e) => setFormWmsId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {wmsOptions.map(w => (
                    <option key={w.id} value={w.id}>{w.wms_number} &bull; {w.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sequence</label>
                  <input
                    type="number"
                    value={formSequence}
                    onChange={(e) => setFormSequence(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Activity *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scaffolding erection above 3 meters"
                    value={formActivity}
                    onChange={(e) => setFormActivity(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Identified Hazard *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fall from height, collapse of unsupported frame"
                  value={formHazard}
                  onChange={(e) => setFormHazard(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Risk Level</label>
                  <select
                    value={formInitialRisk}
                    onChange={(e) => setFormInitialRisk(e.target.value as "High" | "Medium" | "Low")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Residual Risk Level</label>
                  <select
                    value={formResidualRisk}
                    onChange={(e) => setFormResidualRisk(e.target.value as "High" | "Medium" | "Low")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Control Measures *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Full body safety harness 100% tied off, green tagged scaffolding, daily tool-box talk..."
                  value={formControlMeasures}
                  onChange={(e) => setFormControlMeasures(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Action / Responsible Person</label>
                <input
                  type="text"
                  placeholder="e.g. Scaffolding Supervisor / HSE Officer"
                  value={formActionBy}
                  onChange={(e) => setFormActionBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
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
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                  {editingId ? "Save Changes" : "Record Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
