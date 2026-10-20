"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
  Users,
  UserPlus,
  Edit3,
  Search,
  CheckCircle2,
  Building2,
  Phone,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { CustomerSelection } from "@/lib/materialInventory";

export type CustomerOption = {
  id: string;
  name: string;
  customer_code?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  trn?: string | null;
  address?: string | null;
};

type Props = {
  value: CustomerSelection;
  onChange: (selection: CustomerSelection) => void;
  required?: boolean;
};

const QUICK_ONE_TIME_SUGGESTIONS = [
  "Workshop Usage",
  "Internal Fabrication",
  "Walk-in Customer",
  "Site Supervisor",
  "Temporary Customer",
  "Maintenance & Repairs",
];

export default function CustomerForWhomSelector({ value, onChange, required = false }: Props) {
  const [activeTab, setActiveTab] = useState<"existing" | "new" | "custom">(value.type || "existing");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // New Customer Quick-Add Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [savingNewCustomer, setSavingNewCustomer] = useState(false);
  const [newCustError, setNewCustError] = useState("");
  const [newCustForm, setNewCustForm] = useState({
    name: "",
    contact_person: "",
    mobile: "",
    email: "",
    address: "",
    trn: "",
    notes: "",
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoadingCustomers(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, customer_code, phone, mobile, email, trn, address")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (!error && data) {
        setCustomers(data);
      }
    } catch (err) {
      console.error("Error loading customers:", err);
    } finally {
      setLoadingCustomers(false);
    }
  }

  // Filtered customers for searchable dropdown
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers.slice(0, 50);
    const q = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.mobile && c.mobile.includes(q))
    );
  }, [customers, searchTerm]);

  function handleSelectExisting(cust: CustomerOption) {
    onChange({
      type: "existing",
      customer_id: cust.id,
      customer_name: cust.name,
      contact_person: "",
      mobile: cust.mobile || cust.phone || "",
      email: cust.email || "",
      trn: cust.trn || "",
      address: cust.address || "",
    });
    setSearchTerm("");
    setShowDropdown(false);
  }

  function handleCustomNameChange(name: string) {
    onChange({
      type: "custom",
      customer_id: null,
      customer_name: name,
    });
  }

  async function handleSaveNewCustomer(e: React.FormEvent) {
    e.preventDefault();
    setNewCustError("");

    const name = newCustForm.name.trim();
    if (!name) {
      setNewCustError("Customer or Company Name is required.");
      return;
    }

    // Duplicate check
    const duplicate = customers.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setNewCustError(`A customer named "${duplicate.name}" already exists in the system.`);
      return;
    }

    setSavingNewCustomer(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Active company session not found.");

      const { data: inserted, error: insErr } = await supabase
        .from("customers")
        .insert({
          company_id: companyId,
          name,
          contact_person: newCustForm.contact_person.trim() || null,
          mobile: newCustForm.mobile.trim() || null,
          email: newCustForm.email.trim() || null,
          address: newCustForm.address.trim() || null,
          trn: newCustForm.trn.trim() || null,
          notes: newCustForm.notes.trim() || null,
          active: true,
        })
        .select()
        .single();

      if (insErr) throw insErr;

      // Reload customer list & auto-select
      await loadCustomers();
      handleSelectExisting(inserted);
      setShowNewModal(false);
      setNewCustForm({
        name: "",
        contact_person: "",
        mobile: "",
        email: "",
        address: "",
        trn: "",
        notes: "",
      });
    } catch (err: unknown) {
      setNewCustError(err instanceof Error ? err.message : "Failed to save customer.");
    } finally {
      setSavingNewCustomer(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 space-y-4">
      {/* Header and 3-Way Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Users size={16} className="text-sky-400" />
            <span>Customer / Material Used For</span>
            {required && <span className="text-rose-400">*</span>}
          </label>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Select an existing customer, quick-add a new client, or enter a workshop/one-time custom recipient
          </p>
        </div>

        {/* Segmented Controller */}
        <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab("existing");
              if (value.type !== "existing" && customers.length > 0) {
                handleSelectExisting(customers[0]);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "existing"
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 size={13} />
            <span>Existing</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("new");
              setShowNewModal(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "new"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserPlus size={13} />
            <span>Add New</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("custom");
              if (value.type !== "custom") {
                handleCustomNameChange(value.customer_name || "Workshop Usage");
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "custom"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Edit3 size={13} />
            <span>Custom Name</span>
          </button>
        </div>
      </div>

      {/* OPTION A: EXISTING CUSTOMER SEARCH */}
      {activeTab === "existing" && (
        <div className="space-y-2">
          {value.customer_id ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-sky-500/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <Building2 size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{value.customer_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800">
                      ERP Customer
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-0.5">
                    {value.mobile && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {value.mobile}
                      </span>
                    )}
                    {value.trn && <span>TRN: {value.trn}</span>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onChange({ type: "existing", customer_id: null, customer_name: "" });
                  setShowDropdown(true);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search existing customer by company, name, phone, code..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              {showDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                  {loadingCustomers ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin text-sky-400" /> Loading customers...
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400">No matching customer found.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDropdown(false);
                          setShowNewModal(true);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                      >
                        <UserPlus size={12} /> Quick-add &quot;{searchTerm}&quot; as new customer
                      </button>
                    </div>
                  ) : (
                    filteredCustomers.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => handleSelectExisting(cust)}
                        className="flex items-center justify-between p-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{cust.name}</p>
                          <p className="text-xs text-slate-400">
                            {cust.customer_code && <span className="mr-2">[{cust.customer_code}]</span>}
                            {cust.mobile || cust.phone || "No phone"}
                          </p>
                        </div>
                        {cust.trn && (
                          <span className="text-[10px] text-slate-500">TRN: {cust.trn}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* OPTION C: CUSTOM NAME / ONE-TIME RECIPIENT */}
      {activeTab === "custom" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Enter Custom / Internal Usage Description:
            </label>
            <input
              type="text"
              value={value.customer_name}
              onChange={(e) => handleCustomNameChange(e.target.value)}
              placeholder="e.g. Workshop Usage, Site Supervisor, Walk-in Customer..."
              className="w-full rounded-lg border border-amber-500/50 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Quick Suggestions Pills */}
          <div>
            <span className="text-[11px] text-slate-400 block mb-1.5">Quick Selections:</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ONE_TIME_SUGGESTIONS.map((pill) => (
                <button
                  key={pill}
                  type="button"
                  onClick={() => handleCustomNameChange(pill)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    value.customer_name === pill
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-amber-400/80 bg-amber-950/20 p-2 rounded border border-amber-900/30">
            ℹ️ This custom recipient name is recorded with the inventory movement for audit and reporting without creating a permanent customer profile.
          </p>
        </div>
      )}

      {/* QUICK-ADD NEW CUSTOMER MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <UserPlus size={18} />
                <h3 className="font-bold text-white text-base">Quick-Add New Customer</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewModal(false);
                  setActiveTab("existing");
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {newCustError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} /> {newCustError}
              </div>
            )}

            <form onSubmit={handleSaveNewCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Customer / Company Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCustForm.name}
                  onChange={(e) => setNewCustForm({ ...newCustForm, name: e.target.value })}
                  placeholder="e.g. Al Baraka Contracting L.L.C"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={newCustForm.contact_person}
                    onChange={(e) =>
                      setNewCustForm({ ...newCustForm, contact_person: e.target.value })
                    }
                    placeholder="e.g. Eng. Ahmed"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Mobile / Phone
                  </label>
                  <input
                    type="text"
                    value={newCustForm.mobile}
                    onChange={(e) => setNewCustForm({ ...newCustForm, mobile: e.target.value })}
                    placeholder="e.g. +971 50 123 4567"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCustForm.email}
                    onChange={(e) => setNewCustForm({ ...newCustForm, email: e.target.value })}
                    placeholder="e.g. info@company.ae"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    TRN (Tax Registration)
                  </label>
                  <input
                    type="text"
                    value={newCustForm.trn}
                    onChange={(e) => setNewCustForm({ ...newCustForm, trn: e.target.value })}
                    placeholder="15-digit TRN"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Address / Site Location
                </label>
                <input
                  type="text"
                  value={newCustForm.address}
                  onChange={(e) => setNewCustForm({ ...newCustForm, address: e.target.value })}
                  placeholder="e.g. Industrial Area 3, Sharjah / Dubai"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setActiveTab("existing");
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingNewCustomer}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingNewCustomer ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} /> Save &amp; Select Customer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
