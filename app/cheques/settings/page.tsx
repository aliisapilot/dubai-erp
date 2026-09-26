"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Wallet, Bell, UserCheck, Code2, Users, Send, Settings,
  CheckCircle2, AlertTriangle, Plus, Trash2, Edit3, Save,
  X, Mail, MessageSquare, ShieldAlert, RefreshCw, Check, Loader2,
  Calendar, Phone, Building2, HelpCircle, ArrowLeft
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ChequeReminderRecipientRecord,
  CustomerReminderConfigRecord,
  CompanyChequeSettingsRecord,
  RecipientCategory,
  NotificationChannel,
} from "@/lib/chequeTypes";
import {
  fetchReminderRecipients,
  saveReminderRecipient,
  deleteReminderRecipient,
  fetchCustomerReminderConfigs,
  saveCustomerReminderConfig,
  fetchCompanyChequeSettings,
  saveCompanyChequeSettings,
  sendTestEmailToRecipient,
} from "@/lib/chequeRecipientService";

type TabType = "supervisors" | "developer" | "customers" | "external" | "schedule";

type CustomerRow = {
  id: string;
  name: string;
  customer_code: string | null;
  trn: string | null;
  email: string | null;
  phone: string | null;
};

export default function ChequeReminderSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("supervisors");
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<ChequeReminderRecipientRecord[]>([]);
  const [customerConfigs, setCustomerConfigs] = useState<Record<string, CustomerReminderConfigRecord>>({});
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanyChequeSettingsRecord | null>(null);

  // Success / error banners
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Recipient Modal State
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Partial<ChequeReminderRecipientRecord> | null>(null);
  const [modalCategory, setModalCategory] = useState<RecipientCategory>("supervisor");
  const [savingRecipient, setSavingRecipient] = useState(false);

  // Customer Config Modal State
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);
  const [customerEmailOverride, setCustomerEmailOverride] = useState("");
  const [customerPhoneOverride, setCustomerPhoneOverride] = useState("");
  const [customerEmailEnabled, setCustomerEmailEnabled] = useState(true);
  const [customerWhatsAppEnabled, setCustomerWhatsAppEnabled] = useState(false);
  const [customerConsentNotes, setCustomerConsentNotes] = useState("");
  const [customerOptOut, setCustomerOptOut] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // Testing states
  const [testingId, setTestingId] = useState<string | null>(null);

  async function loadAll() {
    await Promise.resolve();
    setLoading(true);
    try {
      const [recs, configs, custsRes, settings] = await Promise.all([
        fetchReminderRecipients(),
        fetchCustomerReminderConfigs(),
        supabase.from("customers").select("id, name, customer_code, trn, email, phone").eq("active", true).order("name"),
        fetchCompanyChequeSettings(),
      ]);

      setRecipients(recs);
      setCustomerConfigs(configs);
      setCustomers((custsRes.data || []) as CustomerRow[]);
      setCompanySettings(
        settings || {
          company_id: "",
          reminder_days: [7, 3, 1, 0],
          overdue_reminders_enabled: true,
          developer_alerts_enabled: true,
          whatsapp_provider: "manual",
        }
      );
    } catch (err) {
      console.error("Load settings error:", err);
      showFeedback("error", "Failed to load reminder settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial data hydration from Supabase is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  function showFeedback(type: "success" | "error", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  // Filtered lists
  const supervisorsList = useMemo(
    () => recipients.filter((r) => r.recipient_category === "supervisor"),
    [recipients]
  );

  const developerRecipient = useMemo(
    () => recipients.find((r) => r.recipient_category === "developer"),
    [recipients]
  );

  const externalList = useMemo(
    () => recipients.filter((r) => r.recipient_category === "external"),
    [recipients]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const s = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.email && c.email.toLowerCase().includes(s)) ||
        (c.customer_code && c.customer_code.toLowerCase().includes(s))
    );
  }, [customers, customerSearch]);

  // Handle Recipient Modal Open
  function openAddRecipient(category: RecipientCategory) {
    setModalCategory(category);
    setEditingRecipient({
      name: "",
      email: "",
      phone: "",
      recipient_category: category,
      is_enabled: true,
      channels: "email",
      preferences: {
        incoming: true,
        outgoing: category !== "developer",
        due_today: true,
        overdue: true,
        summary: true,
        technical_alerts: category === "developer",
      },
      assigned_customer_ids: [],
      assigned_cheque_ids: [],
      notes: "",
    });
    setIsRecipientModalOpen(true);
  }

  function openEditRecipient(r: ChequeReminderRecipientRecord) {
    setModalCategory(r.recipient_category);
    setEditingRecipient({ ...r });
    setIsRecipientModalOpen(true);
  }

  async function handleSaveRecipient(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRecipient || !editingRecipient.name || !editingRecipient.email) {
      showFeedback("error", "Name and email are required.");
      return;
    }

    setSavingRecipient(true);
    try {
      await saveReminderRecipient({
        ...editingRecipient,
        name: editingRecipient.name,
        email: editingRecipient.email,
        recipient_category: modalCategory,
      });
      showFeedback("success", "Recipient saved successfully.");
      setIsRecipientModalOpen(false);
      const updated = await fetchReminderRecipients();
      setRecipients(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback("error", `Save failed: ${msg}`);
    } finally {
      setSavingRecipient(false);
    }
  }

  async function handleDeleteRecipient(id: string, name: string) {
    if (!confirm(`Are you sure you want to remove "${name}" from reminder recipients?`)) {
      return;
    }
    try {
      await deleteReminderRecipient(id);
      showFeedback("success", "Recipient removed.");
      setRecipients((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback("error", `Delete failed: ${msg}`);
    }
  }

  async function handleTestEmail(email: string, name: string, category: RecipientCategory, id: string) {
    setTestingId(id);
    try {
      const res = await sendTestEmailToRecipient(email, name, category);
      if (res.success) {
        showFeedback("success", res.message);
      } else {
        showFeedback("error", res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback("error", msg);
    } finally {
      setTestingId(null);
    }
  }

  // Handle Customer Config Modal
  function openEditCustomer(cust: CustomerRow) {
    setEditingCustomer(cust);
    const existing = customerConfigs[cust.id];
    setCustomerEmailOverride(existing?.override_email || "");
    setCustomerPhoneOverride(existing?.override_phone || "");
    setCustomerEmailEnabled(existing?.email_enabled ?? true);
    setCustomerWhatsAppEnabled(existing?.whatsapp_enabled ?? false);
    setCustomerConsentNotes(existing?.consent_notes || "");
    setCustomerOptOut(existing?.opt_out ?? false);
  }

  async function handleSaveCustomerConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;

    setSavingCustomer(true);
    try {
      const updated = await saveCustomerReminderConfig(editingCustomer.id, {
        override_email: customerEmailOverride,
        override_phone: customerPhoneOverride,
        email_enabled: customerEmailEnabled,
        whatsapp_enabled: customerWhatsAppEnabled,
        consent_notes: customerConsentNotes,
        opt_out: customerOptOut,
      });

      setCustomerConfigs((prev) => ({ ...prev, [editingCustomer.id]: updated }));
      showFeedback("success", `Preferences updated for ${editingCustomer.name}`);
      setEditingCustomer(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback("error", `Failed to save customer config: ${msg}`);
    } finally {
      setSavingCustomer(false);
    }
  }

  // Handle Developer Settings Save
  async function handleSaveDeveloperSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!companySettings) return;

    setSavingRecipient(true);
    try {
      const saved = await saveCompanyChequeSettings(companySettings);
      setCompanySettings(saved);
      showFeedback("success", "Developer & schedule settings saved successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showFeedback("error", `Save error: ${msg}`);
    } finally {
      setSavingRecipient(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/cheques"
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Back to Cheque Register"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Cheque Reminder &amp; Notification Settings
                </h1>
                <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-bold">
                  Multi-Channel
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Manage supervisor alerts, developer failure monitoring, customer opt-ins, and external recipients
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAll}
              className="rounded-lg p-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Refresh Settings"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-emerald-600" : ""} />
            </button>
            <Link
              href="/cheques"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              Cheque Register
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto max-w-7xl px-6 flex items-center gap-1 border-t border-slate-100 overflow-x-auto text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab("supervisors")}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === "supervisors"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <UserCheck size={15} />
            Supervisors ({supervisorsList.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("developer")}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === "developer"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Code2 size={15} />
            Developer / Owner Alerts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("customers")}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === "customers"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Users size={15} />
            Customer Preferences &amp; Opt-In ({customers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("external")}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === "external"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Mail size={15} />
            External Recipients ({externalList.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === "schedule"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Calendar size={15} />
            Schedules &amp; Providers
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`rounded-xl border p-4 text-xs font-semibold flex items-center justify-between shadow-xs ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            <span>{feedback.msg}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: SUPERVISORS                                                        */}
        {/* ========================================================================= */}
        {activeTab === "supervisors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Finance &amp; Executive Supervisors</h2>
                <p className="text-xs text-slate-500">
                  Add supervisor emails to receive upcoming cheque summaries, maturity notices, and overdue alerts. No ERP accounts required.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddRecipient("supervisor")}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <Plus size={15} />
                Add Supervisor
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Supervisor Name</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Channels</th>
                    <th className="py-3 px-4">Subscribed Events</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supervisorsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <UserCheck size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-700">No supervisor recipients configured</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Click &quot;Add Supervisor&quot; above to add financial managers or department heads.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    supervisorsList.map((sup) => (
                      <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{sup.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{sup.email}</td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                            {sup.channels}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {sup.preferences.incoming && (
                              <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-semibold">Inward</span>
                            )}
                            {sup.preferences.outgoing && (
                              <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 font-semibold">Outward</span>
                            )}
                            {sup.preferences.due_today && (
                              <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5 font-semibold">Due Today</span>
                            )}
                            {sup.preferences.overdue && (
                              <span className="rounded bg-rose-50 text-rose-700 px-1.5 py-0.5 font-semibold">Overdue</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                              sup.is_enabled
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {sup.is_enabled ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTestEmail(sup.email, sup.name, "supervisor", sup.id)}
                              disabled={testingId === sup.id}
                              className="rounded p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                              title="Send Test Email"
                            >
                              {testingId === sup.id ? (
                                <Loader2 size={14} className="animate-spin text-emerald-600" />
                              ) : (
                                <Send size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditRecipient(sup)}
                              className="rounded p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              title="Edit Preferences"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecipient(sup.id, sup.name)}
                              className="rounded p-1 text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
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
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DEVELOPER / OWNER ALERTS                                           */}
        {/* ========================================================================= */}
        {activeTab === "developer" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Developer &amp; Owner Technical Monitoring</h2>
              <p className="text-xs text-slate-500">
                Receive immediate diagnostic alerts when scheduled jobs fail, emails bounce, or provider APIs encounter errors. Strictly sanitizes private tokens and passwords.
              </p>
            </div>

            <form onSubmit={handleSaveDeveloperSettings} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Developer / Owner Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={companySettings?.developer_email || ""}
                    onChange={(e) =>
                      setCompanySettings((prev) =>
                        prev ? { ...prev, developer_email: e.target.value } : null
                      )
                    }
                    placeholder="e.g. developer@yourcompany.com or aliisapilot@gmail.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used strictly for operational health alerts and delivery failure summaries.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alert Channels</label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={companySettings?.developer_alerts_enabled ?? true}
                        onChange={(e) =>
                          setCompanySettings((prev) =>
                            prev ? { ...prev, developer_alerts_enabled: e.target.checked } : null
                          )
                        }
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-semibold text-slate-800">Enable Technical Failure Alerts</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Technical Alert Coverage:</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="font-bold text-slate-800 block text-xs">Cron Execution Failures</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">Alerts if Vercel Scheduled Job encounters 500 errors or database timeouts.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="font-bold text-slate-800 block text-xs">Email Delivery Errors</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">Safe diagnostic notification if Resend API returns rejection or bounce.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <span className="font-bold text-slate-800 block text-xs">Credential Leak Protection</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">Enforces automatic masking of Bearer tokens and connection strings.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                {companySettings?.developer_email && (
                  <button
                    type="button"
                    onClick={() =>
                      handleTestEmail(
                        companySettings.developer_email!,
                        "Developer",
                        "developer",
                        "dev-test"
                      )
                    }
                    disabled={testingId === "dev-test"}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                  >
                    {testingId === "dev-test" ? (
                      <Loader2 size={13} className="animate-spin text-emerald-600" />
                    ) : (
                      <Send size={13} />
                    )}
                    Send Diagnostic Test Alert
                  </button>
                )}

                <button
                  type="submit"
                  disabled={savingRecipient}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm ml-auto"
                >
                  <Save size={14} />
                  Save Developer Settings
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CUSTOMER PREFERENCES & CONSENT                                     */}
        {/* ========================================================================= */}
        {activeTab === "customers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Customer Communication Preferences &amp; Consent</h2>
                <p className="text-xs text-slate-500">
                  Configure custom reminder emails, phone numbers, and WhatsApp opt-in consent for each customer. Reminders are sent only for eligible incoming cheques.
                </p>
              </div>
              <div className="w-64">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none bg-white"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Reminder Email</th>
                    <th className="py-3 px-4">WhatsApp Phone</th>
                    <th className="py-3 px-4 text-center">Email Alerts</th>
                    <th className="py-3 px-4 text-center">WhatsApp Opt-In</th>
                    <th className="py-3 px-4 text-center">Opt-Out</th>
                    <th className="py-3 px-4 text-right">Configure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No customers match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.slice(0, 50).map((cust) => {
                      const cfg = customerConfigs[cust.id];
                      const effEmail = cfg?.override_email || cust.email || "—";
                      const effPhone = cfg?.override_phone || cust.phone || "—";
                      const emailOn = cfg ? cfg.email_enabled : true;
                      const waOn = cfg ? cfg.whatsapp_enabled : false;
                      const optOut = cfg ? cfg.opt_out : false;

                      return (
                        <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {cust.name}
                            {cust.customer_code && (
                              <span className="block text-[10px] font-mono text-slate-400 font-normal">
                                #{cust.customer_code}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {effEmail}
                            {cfg?.override_email && (
                              <span className="block text-[9px] text-blue-600 font-sans font-semibold">Override</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {effPhone}
                            {cfg?.override_phone && (
                              <span className="block text-[9px] text-blue-600 font-sans font-semibold">Override</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                emailOn && !optOut ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {emailOn && !optOut ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                waOn && !optOut ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {waOn && !optOut ? "Opted In" : "Off"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {optOut ? (
                              <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                                Opted Out
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openEditCustomer(cust)}
                              className="rounded px-2.5 py-1 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 transition-colors font-semibold text-[11px]"
                            >
                              Edit Consent
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: EXTERNAL RECIPIENTS                                                */}
        {/* ========================================================================= */}
        {activeTab === "external" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">External Authorized Recipients</h2>
                <p className="text-xs text-slate-500">
                  Add external stakeholders (e.g. auditors, external accountants, legal counsel) who receive notices for assigned clients or cheques only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddRecipient("external")}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <Plus size={15} />
                Add External Email
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Recipient Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {externalList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Mail size={32} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-700">No external recipients configured</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Click &quot;Add External Email&quot; to authorize external auditors or advisors.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    externalList.map((ext) => (
                      <tr key={ext.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{ext.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-700">{ext.email}</td>
                        <td className="py-3 px-4 uppercase text-[10px] font-bold text-slate-600">{ext.channels}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              ext.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {ext.is_enabled ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-xs">{ext.notes || "—"}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTestEmail(ext.email, ext.name, "external", ext.id)}
                              disabled={testingId === ext.id}
                              className="rounded p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                              title="Send Test Email"
                            >
                              {testingId === ext.id ? (
                                <Loader2 size={14} className="animate-spin text-emerald-600" />
                              ) : (
                                <Send size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditRecipient(ext)}
                              className="rounded p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecipient(ext.id, ext.name)}
                              className="rounded p-1 text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
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
        )}

        {/* ========================================================================= */}
        {/* TAB 5: SCHEDULES & PROVIDERS                                              */}
        {/* ========================================================================= */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Notification Schedule &amp; API Providers</h2>
              <p className="text-xs text-slate-500">
                Configure reminder intervals and messaging gateways for production automation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Schedule Intervals */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calendar size={14} /> Automatic Reminder Intervals
                </h3>

                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked disabled className="rounded text-emerald-600" />
                    <span><strong>7 Days Before:</strong> First early notice for funding preparation</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked disabled className="rounded text-emerald-600" />
                    <span><strong>3 Days Before:</strong> Secondary alert for deposit clearance</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked disabled className="rounded text-emerald-600" />
                    <span><strong>1 Day Before:</strong> High-priority tomorrow maturity advice</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked disabled className="rounded text-emerald-600" />
                    <span><strong>Due Today:</strong> Actionable presentation notice (08:00 GST)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked disabled className="rounded text-emerald-600" />
                    <span><strong>Overdue:</strong> Daily escalation for unpresented / dishonoured leaves</span>
                  </label>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                  <strong>Vercel Cron Trigger:</strong> Scheduled daily at <code>04:00 UTC (08:00 GST)</code> via{" "}
                  <code>/api/cron/cheque-reminders</code> with secure Bearer authentication.
                </div>
              </div>

              {/* Provider Config Guide */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Settings size={14} /> Messaging Provider Status
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block">Email Gateway (Resend)</span>
                      <span className="text-[11px] text-slate-500">Free Tier: 3,000 emails/mo</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                      Active
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block">WhatsApp 1-Click Interactive</span>
                      <span className="text-[11px] text-slate-500">Zero Cost • Formatted UAE Templates</span>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                      Active
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 block">Meta WhatsApp Cloud API (Automated)</span>
                      <span className="text-[11px] text-slate-500">Optional background delivery</span>
                    </div>
                    <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                      Plug &amp; Play
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* RECIPIENT CREATE/EDIT MODAL                                               */}
      {/* ========================================================================= */}
      {isRecipientModalOpen && editingRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-3.5">
              <span className="font-bold text-sm">
                {editingRecipient.id ? "Edit Recipient" : `Add New ${modalCategory === "supervisor" ? "Supervisor" : "External Recipient"}`}
              </span>
              <button
                type="button"
                onClick={() => setIsRecipientModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRecipient} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editingRecipient.name || ""}
                  onChange={(e) => setEditingRecipient((r) => ({ ...r, name: e.target.value }))}
                  placeholder="e.g. John Doe / Finance Director"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={editingRecipient.email || ""}
                  onChange={(e) => setEditingRecipient((r) => ({ ...r, email: e.target.value }))}
                  placeholder="e.g. supervisor@company.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  value={editingRecipient.phone || ""}
                  onChange={(e) => setEditingRecipient((r) => ({ ...r, phone: e.target.value }))}
                  placeholder="e.g. +971 50 123 4567"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Preferred Channel</label>
                <select
                  value={editingRecipient.channels || "email"}
                  onChange={(e) =>
                    setEditingRecipient((r) => ({ ...r, channels: e.target.value as NotificationChannel }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none bg-white font-semibold"
                >
                  <option value="email">Email Only</option>
                  <option value="whatsapp">WhatsApp Only</option>
                  <option value="both">Both Email &amp; WhatsApp</option>
                </select>
              </div>

              {/* Notification Preferences */}
              <div className="border-t border-slate-100 pt-3">
                <span className="block font-semibold text-slate-700 mb-2">Notification Preferences</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingRecipient.preferences?.incoming ?? true}
                      onChange={(e) =>
                        setEditingRecipient((r) => ({
                          ...r,
                          preferences: { ...r!.preferences!, incoming: e.target.checked },
                        }))
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Incoming Cheques</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingRecipient.preferences?.outgoing ?? true}
                      onChange={(e) =>
                        setEditingRecipient((r) => ({
                          ...r,
                          preferences: { ...r!.preferences!, outgoing: e.target.checked },
                        }))
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Outgoing Cheques</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingRecipient.preferences?.due_today ?? true}
                      onChange={(e) =>
                        setEditingRecipient((r) => ({
                          ...r,
                          preferences: { ...r!.preferences!, due_today: e.target.checked },
                        }))
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Due Today Notices</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingRecipient.preferences?.overdue ?? true}
                      onChange={(e) =>
                        setEditingRecipient((r) => ({
                          ...r,
                          preferences: { ...r!.preferences!, overdue: e.target.checked },
                        }))
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Overdue Alerts</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Scope (Optional)</label>
                <textarea
                  rows={2}
                  value={editingRecipient.notes || ""}
                  onChange={(e) => setEditingRecipient((r) => ({ ...r, notes: e.target.value }))}
                  placeholder="e.g. Audit firm partner, external controller"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsRecipientModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRecipient}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  {savingRecipient ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Recipient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOMER CONSENT & PREFERENCES MODAL                                      */}
      {/* ========================================================================= */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-3.5">
              <div>
                <span className="font-bold text-sm block">Customer Reminder Preferences</span>
                <span className="text-[11px] text-slate-400 block">{editingCustomer.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="rounded-full p-1 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerConfig} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alternative / Accounts Reminder Email
                </label>
                <input
                  type="email"
                  value={customerEmailOverride}
                  onChange={(e) => setCustomerEmailOverride(e.target.value)}
                  placeholder={`Default: ${editingCustomer.email || "No email in master file"}`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave blank to use primary email from customer master records.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alternative WhatsApp Number (UAE)
                </label>
                <input
                  type="tel"
                  value={customerPhoneOverride}
                  onChange={(e) => setCustomerPhoneOverride(e.target.value)}
                  placeholder={`Default: ${editingCustomer.phone || "No phone in master file"}`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customerEmailEnabled}
                    onChange={(e) => setCustomerEmailEnabled(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">Send Email Reminders</span>
                    <span className="text-[11px] text-slate-500 block">
                      Dispatches friendly courtesy alerts before cheque due date.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={customerWhatsAppEnabled}
                    onChange={(e) => setCustomerWhatsAppEnabled(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">
                      WhatsApp Messaging Consent (Opt-In)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Customer has explicitly agreed to receive automated WhatsApp reminders.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer mt-2 text-rose-700">
                  <input
                    type="checkbox"
                    checked={customerOptOut}
                    onChange={(e) => setCustomerOptOut(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <div>
                    <span className="font-bold block text-xs">Customer Opt-Out (Do Not Contact)</span>
                    <span className="text-[11px] text-rose-500 block">
                      Completely suppresses all automated reminder dispatches.
                    </span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Consent Notes (Audit Trail)</label>
                <input
                  type="text"
                  value={customerConsentNotes}
                  onChange={(e) => setCustomerConsentNotes(e.target.value)}
                  placeholder="e.g. Consent received via email / onboarding contract"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  {savingCustomer ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Preferences
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
