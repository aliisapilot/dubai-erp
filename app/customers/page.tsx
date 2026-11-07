"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Plus,
  Search,
  Users,
  X,
  Save,
  Loader2,
  Pencil,
  Power,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";

type Customer = {
  id: string;
  company_id: string;
  customer_code: string | null;
  name: string;
  trn: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  country: string | null;
  po_box: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  notes: string | null;
  active: boolean;
};

type CustomerForm = {
  customer_code: string;
  name: string;
  trn: string;
  contact_person: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  address: string;
  city: string;
  emirate: string;
  country: string;
  po_box: string;
  payment_terms: string;
  credit_limit: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  customer_code: "",
  name: "",
  trn: "",
  contact_person: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  address: "",
  city: "",
  emirate: "",
  country: "United Arab Emirates",
  po_box: "",
  payment_terms: "",
  credit_limit: "0",
  notes: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load customers error:", error);
      setError(error.message);
      setCustomers([]);
    } else {
      setCustomers((data || []) as Customer[]);
    }

    setLoading(false);
  }

  function updateField(
    field: keyof CustomerForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openAddForm() {
    setError("");
    setSuccess("");
    setEditingCustomer(null);
    setForm(emptyForm);
    setShowMoreOptions(false);
    setShowForm(true);
  }

  function openEditForm(customer: Customer) {
    setError("");
    setSuccess("");
    setEditingCustomer(customer);

    setForm({
      customer_code: customer.customer_code || "",
      name: customer.name || "",
      trn: customer.trn || "",
      contact_person: customer.contact_person || "",
      email: customer.email || "",
      phone: customer.phone || "",
      mobile: customer.mobile || "",
      website: customer.website || "",
      address: customer.address || "",
      city: customer.city || "",
      emirate: customer.emirate || "",
      country:
        customer.country || "United Arab Emirates",
      po_box: customer.po_box || "",
      payment_terms: customer.payment_terms || "",
      credit_limit: String(
        customer.credit_limit ?? 0
      ),
      notes: customer.notes || "",
    });

    const hasAdvanced = Boolean(
      customer.address ||
      customer.contact_person ||
      customer.website ||
      customer.po_box ||
      customer.city ||
      customer.emirate ||
      customer.payment_terms ||
      (customer.credit_limit && customer.credit_limit > 0) ||
      customer.notes
    );
    setShowMoreOptions(hasAdvanced);
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingCustomer(null);
    setForm(emptyForm);
    setShowMoreOptions(false);
    setError("");
  }

  async function saveCustomer(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }

    setSaving(true);

    try {
      if (editingCustomer) {
        // EDIT EXISTING CUSTOMER
        const { error: updateError } = await supabase
          .from("customers")
          .update({
            customer_code:
              form.customer_code.trim() || null,
            name: form.name.trim(),
            trn: form.trn.trim() || null,
            contact_person:
              form.contact_person.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            mobile: form.mobile.trim() || null,
            website: form.website.trim() || null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            emirate: form.emirate || null,
            country:
              form.country.trim() ||
              "United Arab Emirates",
            po_box: form.po_box.trim() || null,
            payment_terms:
              form.payment_terms.trim() || null,
            credit_limit: Number(
              form.credit_limit || 0
            ),
            notes: form.notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingCustomer.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        setSuccess(
          "Customer updated successfully."
        );
      } else {
        // ADD NEW CUSTOMER
        const companyId = await getCompanyId();

        const customerCode =
          form.customer_code.trim() ||
          (await generateDocNumber(companyId, "CUS"));

        const { error: insertError } =
          await supabase
            .from("customers")
            .insert({
              company_id: companyId,
              customer_code: customerCode,
              name: form.name.trim(),
              trn: form.trn.trim() || null,
              contact_person:
                form.contact_person.trim() || null,
              email: form.email.trim() || null,
              phone: form.phone.trim() || null,
              mobile: form.mobile.trim() || null,
              website: form.website.trim() || null,
              address: form.address.trim() || null,
              city: form.city.trim() || null,
              emirate: form.emirate || null,
              country:
                form.country.trim() ||
                "United Arab Emirates",
              po_box: form.po_box.trim() || null,
              payment_terms:
                form.payment_terms.trim() || null,
              credit_limit: Number(
                form.credit_limit || 0
              ),
              notes: form.notes.trim() || null,
              active: true,
            });

        if (insertError) {
          throw new Error(insertError.message);
        }

        setSuccess(
          "Customer added successfully."
        );
      }

      setShowForm(false);
      setEditingCustomer(null);
      setForm(emptyForm);

      await loadCustomers();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong.";

      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCustomerStatus(
    customer: Customer
  ) {
    const action = customer.active
      ? "deactivate"
      : "reactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${customer.name}"?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    const { error: updateError } =
      await supabase
        .from("customers")
        .update({
          active: !customer.active,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", customer.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(
      customer.active
        ? "Customer deactivated successfully."
        : "Customer reactivated successfully."
    );

    await loadCustomers();
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Are you sure you want to delete customer "${customer.name}"? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      const { error: delErr } = await supabase.from("customers").delete().eq("id", customer.id);
      if (delErr) {
        if (delErr.code === "23503" || delErr.message.includes("foreign key")) {
          throw new Error(`Customer "${customer.name}" cannot be deleted because they have associated invoices, quotations, or payments. You can deactivate them instead.`);
        }
        throw new Error(delErr.message);
      }
      setSuccess(`Customer "${customer.name}" deleted successfully.`);
      await loadCustomers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete customer.");
    }
  }

  const filteredCustomers = customers.filter(
    (customer) => {
      const searchText = [
        customer.customer_code,
        customer.name,
        customer.trn,
        customer.contact_person,
        customer.email,
        customer.phone,
        customer.mobile,
        customer.city,
        customer.emirate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(
        search.toLowerCase()
      );
    }
  );

  const activeCustomers = customers.filter(
    (customer) => customer.active
  ).length;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-900 p-2.5 text-white">
                <Users size={22} />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Customers
                </h1>

                <p className="text-sm text-slate-500">
                  Manage your UAE customers and customer details
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={openAddForm}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={18} />
            Add Customer
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Messages */}
        {success && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {error && !showForm && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>

            <button
              onClick={() => setError("")}
              className="ml-4"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">
              Total Customers
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {customers.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">
              Active Customers
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {activeCustomers}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">
              Country
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              UAE
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search by customer name, code, TRN, email..."
              className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-slate-400"
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">
              Customer List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {filteredCustomers.length} customer
              {filteredCustomers.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
              <Loader2
                size={18}
                className="animate-spin"
              />
              Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <Users
                  size={25}
                  className="text-slate-400"
                />
              </div>

              <h3 className="mt-4 font-semibold text-slate-900">
                No customers found
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Try another search or add a new customer.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left">
                <thead className="border-b bg-slate-50">
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-4">
                      Code
                    </th>

                    <th className="px-5 py-4">
                      Customer
                    </th>

                    <th className="px-5 py-4">
                      TRN
                    </th>

                    <th className="px-5 py-4">
                      Contact
                    </th>

                    <th className="px-5 py-4">
                      Phone
                    </th>

                    <th className="px-5 py-4">
                      Location
                    </th>

                    <th className="px-5 py-4">
                      Status
                    </th>

                    <th className="px-5 py-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map(
                    (customer) => (
                      <tr
                        key={customer.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {customer.customer_code ||
                            "-"}
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-medium text-slate-900">
                            {customer.name}
                          </div>

                          {customer.email && (
                            <div className="mt-1 text-xs text-slate-500">
                              {customer.email}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.trn || "-"}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.contact_person ||
                            "-"}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.mobile ||
                            customer.phone ||
                            "-"}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.city ||
                            customer.emirate ||
                            "-"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              customer.active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {customer.active
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/customers/statements?customer_id=${customer.id}`}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-900 hover:text-white transition"
                              title="Customer Statement of Account"
                            >
                              <FileSpreadsheet size={15} />
                              Statement
                            </Link>

                            <button
                              onClick={() =>
                                openEditForm(
                                  customer
                                )
                              }
                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <Pencil size={15} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                toggleCustomerStatus(
                                  customer
                                )
                              }
                              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                customer.active
                                  ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              <Power size={15} />
                              {customer.active
                                ? "Deactivate"
                                : "Reactivate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteCustomer(customer)}
                              className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                              title="Delete Customer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingCustomer
                    ? "Edit Customer"
                    : "Add Customer"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingCustomer
                    ? "Update customer details"
                    : "Enter the customer business details"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveCustomer}>
              <div className="grid grid-cols-1 gap-5 px-6 py-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Customer Name *
                  </label>

                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      updateField(
                        "name",
                        event.target.value
                      )
                    }
                    placeholder="Company / customer name"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    TRN (Tax Registration Number)
                  </label>

                  <input
                    value={form.trn}
                    onChange={(event) =>
                      updateField(
                        "trn",
                        event.target.value
                      )
                    }
                    placeholder="Tax Registration Number"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Phone
                  </label>

                  <input
                    value={form.phone}
                    onChange={(event) =>
                      updateField(
                        "phone",
                        event.target.value
                      )
                    }
                    placeholder="+971 4 XXX XXXX"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField(
                        "email",
                        event.target.value
                      )
                    }
                    placeholder="customer@example.com"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>
              </div>

              {/* More Options Section */}
              <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Additional Details (Customer Code, Contact, Address, Payment Terms, Credit Limit, Notes)
                </span>
                <button
                  type="button"
                  onClick={() => setShowMoreOptions(!showMoreOptions)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
                >
                  {showMoreOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{showMoreOptions ? "Hide More Options" : "More Options"}</span>
                </button>
              </div>

              {showMoreOptions && (
                <div className="grid grid-cols-1 gap-5 border-t border-slate-200 bg-slate-50/30 px-6 py-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Customer Code
                    </label>

                    <input
                      value={form.customer_code}
                      disabled={!!editingCustomer}
                      onChange={(event) =>
                        updateField(
                          "customer_code",
                          event.target.value
                        )
                      }
                      placeholder="Auto-generated on save"
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      {editingCustomer ? "Existing customer code cannot be changed." : "Leave blank to auto-generate sequentially on save."}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Contact Person
                    </label>

                    <input
                      value={form.contact_person}
                      onChange={(event) =>
                        updateField(
                          "contact_person",
                          event.target.value
                        )
                      }
                      placeholder="Contact person"
                      className="w-full rounded-lg border border-slate-300 px-4 py-3"
                    />
                  </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Mobile
                  </label>

                  <input
                    value={form.mobile}
                    onChange={(event) =>
                      updateField(
                        "mobile",
                        event.target.value
                      )
                    }
                    placeholder="+971 5X XXX XXXX"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Website
                  </label>

                  <input
                    value={form.website}
                    onChange={(event) =>
                      updateField(
                        "website",
                        event.target.value
                      )
                    }
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Address
                  </label>

                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(event) =>
                      updateField(
                        "address",
                        event.target.value
                      )
                    }
                    placeholder="Full address"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    City
                  </label>

                  <input
                    value={form.city}
                    onChange={(event) =>
                      updateField(
                        "city",
                        event.target.value
                      )
                    }
                    placeholder="Dubai"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Emirate
                  </label>

                  <select
                    value={form.emirate}
                    onChange={(event) =>
                      updateField(
                        "emirate",
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="">
                      Select Emirate
                    </option>
                    <option value="Abu Dhabi">
                      Abu Dhabi
                    </option>
                    <option value="Ajman">Ajman</option>
                    <option value="Dubai">Dubai</option>
                    <option value="Fujairah">
                      Fujairah
                    </option>
                    <option value="Ras Al Khaimah">
                      Ras Al Khaimah
                    </option>
                    <option value="Sharjah">
                      Sharjah
                    </option>
                    <option value="Umm Al Quwain">
                      Umm Al Quwain
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Country
                  </label>

                  <input
                    value={form.country}
                    onChange={(event) =>
                      updateField(
                        "country",
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    PO Box
                  </label>

                  <input
                    value={form.po_box}
                    onChange={(event) =>
                      updateField(
                        "po_box",
                        event.target.value
                      )
                    }
                    placeholder="PO Box"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Payment Terms
                  </label>

                  <select
                    value={form.payment_terms}
                    onChange={(event) =>
                      updateField(
                        "payment_terms",
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="">
                      Select Terms
                    </option>
                    <option value="Cash">Cash</option>
                    <option value="Immediate">
                      Immediate
                    </option>
                    <option value="7 Days">
                      7 Days
                    </option>
                    <option value="15 Days">
                      15 Days
                    </option>
                    <option value="30 Days">
                      30 Days
                    </option>
                    <option value="45 Days">
                      45 Days
                    </option>
                    <option value="60 Days">
                      60 Days
                    </option>
                    <option value="90 Days">
                      90 Days
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Credit Limit (AED)
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.credit_limit}
                    onChange={(event) =>
                      updateField(
                        "credit_limit",
                        event.target.value
                      )
                    }
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Notes
                  </label>

                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) =>
                      updateField(
                        "notes",
                        event.target.value
                      )
                    }
                    placeholder="Additional notes"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3"
                  />
                </div>
              </div>
            )}

              {error && (
                <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      {editingCustomer
                        ? "Update Customer"
                        : "Save Customer"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}