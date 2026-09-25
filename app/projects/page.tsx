"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  Search,
  Loader2,
  X,
  Save,
  Building,
  DollarSign,
  TrendingUp,
  MapPin,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { getCompanyId, statusClass, fmtAED, todayISO, generateDocNumber } from "@/lib/helpers";

type Customer = { id: string; name: string | null };

type Project = {
  id: string;
  company_id: string;
  project_number: string;
  name: string;
  customer_id: string | null;
  location: string | null;
  main_contractor: string | null;
  subcontractor: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_value: number | null;
  description: string | null;
  created_at: string | null;
};

type ProjectForm = {
  project_number: string;
  name: string;
  customer_id: string;
  location: string;
  main_contractor: string;
  subcontractor: string;
  status: string;
  start_date: string;
  end_date: string;
  contract_value: string;
  description: string;
};

const emptyForm: ProjectForm = {
  project_number: "",
  name: "",
  customer_id: "",
  location: "",
  main_contractor: "",
  subcontractor: "",
  status: "In Progress",
  start_date: todayISO(),
  end_date: "",
  contract_value: "0",
  description: "",
};

const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-slate-400 focus:outline-none";
const sel = inp + " appearance-none";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: prjs }, { data: custs }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name").eq("active", true).order("name"),
    ]);
    setProjects((prjs || []) as Project[]);
    setCustomers((custs || []) as Customer[]);
    setLoading(false);
  }

  function openAdd() {
    setError("");
    setSuccess("");
    setEditingId(null);
    setForm({ ...emptyForm, project_number: "" });
    setShowModal(true);
  }

  function openEdit(p: Project) {
    setError("");
    setSuccess("");
    setEditingId(p.id);
    setForm({
      project_number: p.project_number,
      name: p.name,
      customer_id: p.customer_id || "",
      location: p.location || "",
      main_contractor: p.main_contractor || "",
      subcontractor: p.subcontractor || "",
      status: p.status || "In Progress",
      start_date: p.start_date || todayISO(),
      end_date: p.end_date || "",
      contract_value: String(p.contract_value || 0),
      description: p.description || "",
    });
    setShowModal(true);
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete project "${name}"? This action cannot be undone.`)) return;
    try {
      const { error: err } = await supabase.from("projects").delete().eq("id", id);
      if (err) {
        if (err.code === "23503") {
          alert("Cannot delete this project because it is referenced by invoices, expenses, or handovers.");
        } else {
          alert("Error deleting project: " + err.message);
        }
        return;
      }
      setSuccess("Project deleted successfully.");
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete project");
    }
  }

  async function saveProject(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!form.name.trim()) {
      setError("Project title is required.");
      return;
    }
    setSaving(true);
    try {
      const cid = await getCompanyId();
      const projNum = editingId ? form.project_number.trim() : await generateDocNumber(cid, "PRJ");
      const payload = {
        company_id: cid,
        project_number: projNum,
        name: form.name.trim(),
        customer_id: form.customer_id || null,
        location: form.location.trim() || null,
        main_contractor: form.main_contractor.trim() || null,
        subcontractor: form.subcontractor.trim() || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        contract_value: Number(form.contract_value) || 0,
        description: form.description.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error: err } = await supabase.from("projects").update(payload).eq("id", editingId);
        if (err) throw err;
        setSuccess("Project updated successfully.");
      } else {
        const { error: err } = await supabase.from("projects").insert(payload);
        if (err) throw err;
        setSuccess("Project created successfully.");
      }

      setShowModal(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving project");
    } finally {
      setSaving(false);
    }
  }

  const custMap = Object.fromEntries(customers.map(c => [c.id, c.name]));

  const filtered = projects.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    const cName = custMap[p.customer_id || ""] || "";
    return [p.project_number, p.name, cName, p.location, p.main_contractor]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const totalContractValue = projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0);
  const activeCount = projects.filter(p => p.status === "In Progress").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <Briefcase size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Projects & Job Orders</h1>
              <p className="text-sm text-slate-500">Project costing, technical method statements, manpower, and handovers</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
          >
            <Plus size={18} /> New Project
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {success && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {error && !showModal && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs text-slate-500 block font-medium">Total Contract Value</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-extrabold font-mono text-slate-900">
                {fmtAED(totalContractValue)}
              </span>
              <DollarSign className="text-emerald-600" size={24} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs text-slate-500 block font-medium">Active Jobs in Progress</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-extrabold text-blue-600">{activeCount}</span>
              <TrendingUp className="text-blue-600" size={24} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs text-slate-500 block font-medium">Total Projects Logged</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-extrabold text-slate-800">{projects.length}</span>
              <Building className="text-slate-400" size={24} />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects by code, name, client, location, contractor…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm appearance-none focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option>Planning</option>
            <option>In Progress</option>
            <option>On Hold</option>
            <option>Completed</option>
            <option>Handed Over</option>
          </select>
        </div>

        {/* Projects Cards / Table */}
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
            <Briefcase size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No projects found. Create your first project to track job costing and technical documents.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(p => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow transition flex flex-col justify-between overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {p.project_number}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(p.status)}`}>
                      {p.status}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mb-1 line-clamp-1">
                    {p.name}
                  </h3>

                  <div className="text-xs text-slate-600 space-y-1 mb-3">
                    <p className="font-medium text-slate-800">
                      Client: {custMap[p.customer_id || ""] || "—"}
                    </p>
                    {p.location && (
                      <p className="flex items-center gap-1 text-slate-500">
                        <MapPin size={12} /> {p.location}
                      </p>
                    )}
                    {p.main_contractor && (
                      <p className="text-[11px] text-slate-500">
                        Main Contractor: {p.main_contractor}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Contract Value:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {fmtAED(p.contract_value)}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                    >
                      Edit Info
                    </button>
                    <button
                      onClick={() => deleteProject(p.id, p.name)}
                      className="text-xs text-rose-500 hover:text-rose-700 font-medium flex items-center gap-1"
                      title="Delete Project"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>

                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Project Command Center <ExternalLink size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? "Edit Project Details" : "Create New Project"}
              </h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveProject} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Project Code {editingId ? "(Read-only)" : "(Auto-generated on save)"}
                  </label>
                  <input
                    type="text"
                    value={editingId ? form.project_number : "Auto-generated on save"}
                    disabled
                    className={`${inp} bg-slate-100 text-slate-500 cursor-not-allowed`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={sel}>
                    <option>Planning</option>
                    <option>In Progress</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                    <option>Handed Over</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Project Title / Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fitout & MEP Package at Downtown Tower" required className={inp} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Customer / Client</label>
                  <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} className={sel}>
                    <option value="">— Select Customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Location / Plot Details</label>
                  <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Business Bay, Plot 104" className={inp} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Main Contractor</label>
                  <input type="text" value={form.main_contractor} onChange={e => setForm({ ...form, main_contractor: e.target.value })} placeholder="Main Contracting Company" className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Specialist Subcontractor</label>
                  <input type="text" value={form.subcontractor} onChange={e => setForm({ ...form, subcontractor: e.target.value })} placeholder="Subcontractor Name" className={inp} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Contract Value (AED)</label>
                  <input type="number" step="0.01" min="0" value={form.contract_value} onChange={e => setForm({ ...form, contract_value: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Target End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inp} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Project Description & Scope Notes</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Scope overview, special conditions, etc." className={inp} />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowModal(false)} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
