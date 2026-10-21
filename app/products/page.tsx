"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Search,
  Package,
  X,
  Save,
  Loader2,
  Pencil,
  Power,
  AlertTriangle,
  Trash2,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Users,
  Ruler,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { getCompanyId, generateDocNumber } from "@/lib/helpers";
import {
  saveMaterialMaster,
  normalizeProductToMaterial,
  type MaterialItem,
  INITIAL_FABRIC_BRANDS,
  MATERIAL_CATEGORIES,
  SUPPORTED_UNITS,
  isFabricMaterial,
  calculateSqmFromRm,
  roundDecimal,
} from "@/lib/materialInventory";

type FormState = {
  id?: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  customBrand: string;
  category: string;
  manufacturer: string;
  colour: string;
  specification: string;
  fabricWidth: string;
  rollLength: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  vatRate: string;
  minimumStock: string;
  initialOpeningStock: string;
  supplierName: string;
};

const initialFormState: FormState = {
  sku: "",
  name: "",
  description: "",
  brand: "Korean Fabric",
  customBrand: "",
  category: "Korean Fabric",
  manufacturer: "",
  colour: "White",
  specification: "650 GSM High Tensile",
  fabricWidth: "3.0",
  rollLength: "50",
  unit: "Sqm",
  costPrice: "12.50",
  sellingPrice: "18.00",
  vatRate: "5",
  minimumStock: "100",
  initialOpeningStock: "0",
  supplierName: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

function StatCard({
  label,
  value,
  subtext,
  color = "slate",
  icon,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: "slate" | "emerald" | "amber" | "indigo";
  icon?: React.ReactNode;
}) {
  const colors = {
    slate: "text-slate-800",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    indigo: "text-indigo-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className={`mt-2 text-2xl font-bold ${colors[color]}`}>{value}</p>
      {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  tooltip,
  children,
}: {
  label: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        {tooltip && <span className="text-[11px] text-slate-400">{tooltip}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ProductsPage() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<"ALL" | "FABRIC" | "NON_FABRIC" | "LOW_STOCK">(
    "ALL"
  );
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);
    setError("");
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;
      const { data, error: fetchErr } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (fetchErr) throw fetchErr;
      const normalized = (data || []).map(normalizeProductToMaterial);
      setMaterials(normalized);
    } catch (err: unknown) {
      console.error("Load materials error:", err);
      setError(err instanceof Error ? err.message : "Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openAddModal(isFabric: boolean = true) {
    setError("");
    setSuccess("");
    setEditingMaterial(null);
    setForm({
      ...initialFormState,
      category: isFabric ? "Korean Fabric" : "Steel",
      unit: isFabric ? "Sqm" : "Pcs",
      brand: isFabric ? "Korean Fabric" : "General Material",
      fabricWidth: isFabric ? "3.0" : "0",
    });
    setShowDrawer(true);
  }

  function openEditModal(mat: MaterialItem) {
    setError("");
    setSuccess("");
    setEditingMaterial(mat);

    const isFab = mat.is_fabric;
    const isStandardBrand = INITIAL_FABRIC_BRANDS.includes(mat.brand as any);

    setForm({
      id: mat.id,
      sku: mat.sku || "",
      name: mat.name || "",
      description: mat.description || "",
      brand: isStandardBrand ? mat.brand : "Other / Custom",
      customBrand: isStandardBrand ? "" : mat.brand,
      category: mat.category || "Other / Custom",
      manufacturer: mat.manufacturer || "",
      colour: mat.colour || "",
      specification: mat.specification || "",
      fabricWidth: mat.fabric_width ? String(mat.fabric_width) : isFab ? "3.0" : "0",
      rollLength: mat.roll_length ? String(mat.roll_length) : "50",
      unit: mat.unit || (isFab ? "Sqm" : "Pcs"),
      costPrice: mat.cost_price != null ? String(mat.cost_price) : "",
      sellingPrice: mat.selling_price != null ? String(mat.selling_price) : "",
      vatRate: mat.vat_rate != null ? String(mat.vat_rate) : "5",
      minimumStock: mat.minimum_stock != null ? String(mat.minimum_stock) : "0",
      initialOpeningStock: "0", // Opening stock only applicable on creation
      supplierName: mat.supplier_name || "",
    });
    setShowDrawer(true);
  }

  function closeDrawer() {
    if (saving) return;
    setShowDrawer(false);
    setEditingMaterial(null);
    setForm(initialFormState);
    setError("");
  }

  // Auto-suggest name for fabrics
  function autoSuggestName() {
    const isFab = isFabricMaterial(form.category, form.unit);
    const effectiveBrand =
      form.brand === "Other / Custom"
        ? form.customBrand.trim() || "Custom Brand"
        : form.brand;

    if (isFab) {
      const parts = [
        effectiveBrand,
        form.colour ? form.colour.trim() : "",
        form.fabricWidth ? `${form.fabricWidth}m Width` : "",
        form.specification ? form.specification.trim() : "",
      ].filter(Boolean);
      return parts.join(" — ");
    }
    return form.name;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const isFab = isFabricMaterial(form.category, form.unit);
    const widthNum = parseFloat(form.fabricWidth) || 0;

    let finalName = form.name.trim();
    if (!finalName && isFab) {
      finalName = autoSuggestName();
    }

    if (!finalName) {
      setError("Material name is required.");
      return;
    }

    if (isFab && widthNum <= 0) {
      setError("Fabric width must be greater than 0 metres for fabric inventory.");
      return;
    }

    setSaving(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Company not found.");

      const effectiveBrand =
        form.brand === "Other / Custom"
          ? form.customBrand.trim() || "Custom Brand"
          : form.brand;

      const openingStockQty = parseFloat(form.initialOpeningStock) || 0;

      await saveMaterialMaster(
        companyId,
        {
          id: editingMaterial?.id,
          name: finalName,
          sku: form.sku.trim() || null,
          brand: effectiveBrand,
          category: form.category,
          unit: form.unit,
          fabric_width: widthNum,
          roll_length: parseFloat(form.rollLength) || 50,
          specification: form.specification.trim() || null,
          colour: form.colour.trim() || null,
          manufacturer: form.manufacturer.trim() || null,
          cost_price: parseFloat(form.costPrice) || 0,
          selling_price: parseFloat(form.sellingPrice) || 0,
          vat_rate: parseFloat(form.vatRate) || 5,
          minimum_stock: parseFloat(form.minimumStock) || 0,
          supplier_name: form.supplierName.trim() || null,
          notes: form.description.trim() || null,
          active: true,
        },
        editingMaterial ? 0 : openingStockQty
      );

      setSuccess(
        editingMaterial
          ? `Material "${finalName}" updated successfully.`
          : `New material "${finalName}" registered successfully.`
      );
      closeDrawer();
      await loadMaterials();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save material.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(mat: MaterialItem) {
    setError("");
    setSuccess("");
    try {
      const { error: err } = await supabase
        .from("products")
        .update({ active: !mat.active, updated_at: new Date().toISOString() })
        .eq("id", mat.id);
      if (err) throw err;
      setSuccess(
        mat.active ? `"${mat.name}" deactivated.` : `"${mat.name}" reactivated.`
      );
      await loadMaterials();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update material status.");
    }
  }

  async function deleteMaterial(mat: MaterialItem) {
    if (
      !window.confirm(
        `Are you sure you want to delete "${mat.name}"? If it has stock movements or invoices, deactivate it instead.`
      )
    )
      return;
    setError("");
    setSuccess("");
    try {
      const { error: delErr } = await supabase.from("products").delete().eq("id", mat.id);
      if (delErr) {
        if (delErr.code === "23503" || delErr.message.includes("foreign key")) {
          throw new Error(
            `"${mat.name}" has existing stock movements or documents and cannot be permanently deleted. You can safely deactivate it instead.`
          );
        }
        throw delErr;
      }
      setSuccess(`"${mat.name}" deleted successfully.`);
      await loadMaterials();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete material.");
    }
  }

  // Filter logic
  const filtered = materials.filter((m) => {
    // Type filter
    if (filterType === "FABRIC" && !m.is_fabric) return false;
    if (filterType === "NON_FABRIC" && m.is_fabric) return false;
    if (filterType === "LOW_STOCK" && (m.current_stock > m.minimum_stock || !m.active))
      return false;

    // Category filter
    if (categoryFilter !== "ALL" && m.category !== categoryFilter) return false;

    // Brand filter
    if (brandFilter !== "ALL" && m.brand !== brandFilter) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const txt = [
        m.name,
        m.sku,
        m.brand,
        m.specification,
        m.colour,
        m.category,
        m.supplier_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return txt.includes(q);
    }
    return true;
  });

  const totalFabrics = materials.filter((m) => m.is_fabric).length;
  const totalActive = materials.filter((m) => m.active).length;
  const lowStockCount = materials.filter(
    (m) => m.active && m.current_stock <= m.minimum_stock
  ).length;

  const totalFabricArea = materials
    .filter((m) => m.is_fabric)
    .reduce((acc, m) => acc + (m.square_metres_available || 0), 0);

  const availableBrands = Array.from(new Set(materials.map((m) => m.brand).filter(Boolean)));

  const isFormFabric = isFabricMaterial(form.category, form.unit);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600/20 p-2.5 text-indigo-400 border border-indigo-500/30">
              <Layers size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Material Master &amp; Catalog
                </h1>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  Fabric &amp; Stock System
                </span>
              </div>
              <p className="text-xs text-slate-400">
                AL SAFWAH AL QABDHA TENTS IND L.L.C SP — Specs, Widths &amp; m² Stock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/inventory"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              Stock Overview
            </Link>
            <Link
              href="/inventory/stock-in"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 transition"
            >
              <ArrowDownLeft size={14} />
              Stock In
            </Link>
            <Link
              href="/inventory/stock-out"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/50 transition"
            >
              <ArrowUpRight size={14} />
              Stock Out
            </Link>
            <button
              onClick={() => openAddModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
            >
              <Plus size={15} />
              Add Fabric / Material
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* ALERTS */}
        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={16} />
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* STATS OVERVIEW */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Total Materials</p>
            <p className="mt-1 text-2xl font-bold text-white">{materials.length}</p>
            <p className="mt-1 text-xs text-slate-500">{totalFabrics} fabric specifications</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Total Fabric In Stock</p>
            <p className="mt-1 text-2xl font-bold text-indigo-400">
              {totalFabricArea.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              <span className="text-sm font-normal text-slate-400">m²</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Across all warehouses</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Active Materials</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{totalActive}</p>
            <p className="mt-1 text-xs text-slate-500">
              {materials.length - totalActive} inactive
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Low Stock Reorders</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                lowStockCount > 0 ? "text-amber-400" : "text-slate-400"
              }`}
            >
              {lowStockCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Below minimum buffer</p>
          </div>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                id="search-material-master"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials by name, brand, SKU, colour, GSM, supplier..."
                className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Quick Segment Filter */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              <button
                onClick={() => setFilterType("ALL")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  filterType === "ALL"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                All ({materials.length})
              </button>
              <button
                onClick={() => setFilterType("FABRIC")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  filterType === "FABRIC"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Fabrics ({totalFabrics})
              </button>
              <button
                onClick={() => setFilterType("NON_FABRIC")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  filterType === "NON_FABRIC"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Accessories / Steel ({materials.length - totalFabrics})
              </button>
              <button
                onClick={() => setFilterType("LOW_STOCK")}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  filterType === "LOW_STOCK"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Low Stock ({lowStockCount})
              </button>
            </div>
          </div>

          {/* Sub Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-500 flex items-center gap-1">
              <Filter size={12} /> Filters:
            </span>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Brands</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {(brandFilter !== "ALL" || categoryFilter !== "ALL" || search) && (
              <button
                onClick={() => {
                  setBrandFilter("ALL");
                  setCategoryFilter("ALL");
                  setSearch("");
                }}
                className="text-indigo-400 hover:underline ml-2"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* MATERIAL TABLE */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-500">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <Package size={40} className="mx-auto mb-3 text-slate-700" />
              <p className="text-sm text-slate-400">
                {search ? "No materials match your search." : "No materials registered yet."}
              </p>
              <button
                onClick={() => openAddModal(true)}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Add First Material
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-900/60 uppercase tracking-wider text-[11px] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">SKU / Code</th>
                    <th className="px-4 py-3 font-semibold">Material Specification</th>
                    <th className="px-4 py-3 font-semibold">Brand / Category</th>
                    <th className="px-4 py-3 font-semibold text-center min-w-[5rem]">Width</th>
                    <th className="px-4 py-3 font-semibold text-right">Cost Rate</th>
                    <th className="px-4 py-3 font-semibold text-right">Selling Rate</th>
                    <th className="px-4 py-3 font-semibold text-center">Current Stock</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((mat) => {
                    const isLow =
                      mat.minimum_stock > 0 && mat.current_stock <= mat.minimum_stock;
                    return (
                      <tr
                        key={mat.id}
                        className={`hover:bg-slate-900/40 transition-colors ${
                          !mat.active ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-slate-400">
                          {mat.sku || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            {mat.name}
                            {mat.is_fabric && (
                              <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-800/50">
                                Fabric
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                            {mat.specification && (
                              <span className="text-slate-300 font-medium">
                                {mat.specification}
                              </span>
                            )}
                            {mat.colour && (
                              <span>
                                • Colour: <strong className="text-slate-200">{mat.colour}</strong>
                              </span>
                            )}
                            {mat.supplier_name && (
                              <span>• Supplier: {mat.supplier_name}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-200">{mat.brand}</span>
                          <div className="text-[11px] text-slate-500">{mat.category}</div>
                        </td>
                        <td className="px-4 py-3 text-center min-w-[5rem]">
                          {mat.is_fabric && mat.fabric_width > 0 ? (
                            <span className="inline-flex items-center whitespace-nowrap gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 font-mono text-indigo-300 border border-slate-700">
                              {mat.fabric_width.toFixed(2)}&nbsp;m
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">
                          AED {mat.cost_price.toFixed(2)}
                          <span className="text-[10px] text-slate-500 block">
                            /{mat.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                          AED {mat.selling_price.toFixed(2)}
                          <span className="text-[10px] text-slate-500 block">
                            /{mat.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {mat.is_fabric ? (
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold text-xs ${
                                  isLow
                                    ? "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                                    : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                                }`}
                              >
                                {isLow && <AlertTriangle size={11} />}
                                {mat.square_metres_available.toFixed(1)} m²
                              </span>
                              <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                                ≈ {mat.running_metres_available.toFixed(1)} RM
                              </div>
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isLow
                                  ? "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                                  : "bg-slate-800 text-slate-200"
                              }`}
                            >
                              {mat.current_stock} {mat.unit}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              mat.active
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {mat.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              href={`/inventory/stock-in?material=${mat.id}`}
                              title="Stock In / Receive"
                              className="rounded p-1 text-slate-400 hover:bg-emerald-950 hover:text-emerald-300 transition"
                            >
                              <ArrowDownLeft size={14} />
                            </Link>
                            <Link
                              href={`/inventory/stock-out?material=${mat.id}`}
                              title="Issue / Stock Out"
                              className="rounded p-1 text-slate-400 hover:bg-indigo-950 hover:text-indigo-300 transition"
                            >
                              <ArrowUpRight size={14} />
                            </Link>
                            <button
                              onClick={() => openEditModal(mat)}
                              title="Edit Material"
                              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => toggleActive(mat)}
                              title={mat.active ? "Deactivate" : "Activate"}
                              className={`rounded p-1 transition ${
                                mat.active
                                  ? "text-slate-400 hover:bg-amber-950 hover:text-amber-400"
                                  : "text-slate-400 hover:bg-emerald-950 hover:text-emerald-400"
                              }`}
                            >
                              <Power size={13} />
                            </button>
                            <button
                              onClick={() => deleteMaterial(mat)}
                              title="Delete Material"
                              className="rounded p-1 text-slate-400 hover:bg-red-950 hover:text-red-400 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500 flex items-center justify-between">
            <span>
              Showing {filtered.length} of {materials.length} material records
            </span>
            <span className="text-slate-400 font-mono">
              AL SAFWAH AL QABDHA TENTS IND L.L.C SP
            </span>
          </div>
        </div>
      </div>

      {/* ADD / EDIT MATERIAL DRAWER (MODAL) */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white text-slate-800 shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-600 p-2 text-white shadow-sm">
                  <Package size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingMaterial ? "Edit Material Master" : "Register New Material / Fabric"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Precision Fabric &amp; Material Inventory Specifications
                  </p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}

              <form id="material-master-form" onSubmit={handleSave} className="space-y-5">
                {/* BRAND SELECTION (PART 1 MANDATORY REQUIREMENT) */}
                <Section title="1. Brand &amp; Material Classification">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Fabric Brand / Manufacturer Origin
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {INITIAL_FABRIC_BRANDS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => {
                            updateField("brand", b);
                            if (b === "Korean Fabric") {
                              updateField("category", "Korean Fabric");
                            } else if (b.includes("German")) {
                              updateField("category", "German Fabric");
                            }
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                            form.brand === b
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>

                    {form.brand === "Other / Custom" && (
                      <div className="mt-3">
                        <Field label="Custom Brand Name" required>
                          <input
                            type="text"
                            value={form.customBrand}
                            onChange={(e) => updateField("customBrand", e.target.value)}
                            placeholder="Enter custom brand or manufacturer"
                            className={inputClass}
                            required
                          />
                        </Field>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="Material Category" required>
                      <select
                        value={form.category}
                        onChange={(e) => {
                          const cat = e.target.value;
                          updateField("category", cat);
                          if (isFabricMaterial(cat, form.unit)) {
                            updateField("unit", "Sqm");
                            if (parseFloat(form.fabricWidth) <= 0)
                              updateField("fabricWidth", "3.0");
                          }
                        }}
                        className={selectClass}
                      >
                        {MATERIAL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Primary Unit" required>
                      <select
                        value={form.unit}
                        onChange={(e) => updateField("unit", e.target.value)}
                        className={selectClass}
                      >
                        {SUPPORTED_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </Section>

                {/* FABRIC SPECIFICATIONS (PART 1 & 2) */}
                <Section title="2. Technical Specifications &amp; Width">
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Fabric Width (Metres)"
                      required={isFormFabric}
                      tooltip={isFormFabric ? "Formula: m² = Width × RM" : undefined}
                    >
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.fabricWidth}
                          onChange={(e) => updateField("fabricWidth", e.target.value)}
                          placeholder="e.g. 3.00"
                          className={inputClass}
                          required={isFormFabric}
                        />
                        <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                          m
                        </span>
                      </div>
                      {isFormFabric && (
                        <div className="flex gap-1.5 mt-1.5">
                          {["2.5", "3.0", "3.2", "5.0"].map((w) => (
                            <button
                              key={w}
                              type="button"
                              onClick={() => updateField("fabricWidth", w)}
                              className="text-[10px] rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 hover:bg-slate-300 font-mono"
                            >
                              {w}m
                            </button>
                          ))}
                        </div>
                      )}
                    </Field>

                    <Field label="Standard Roll Length (m)" tooltip="Optional reference">
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={form.rollLength}
                          onChange={(e) => updateField("rollLength", e.target.value)}
                          placeholder="e.g. 50"
                          className={inputClass}
                        />
                        <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                          RM
                        </span>
                      </div>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="Specification / GSM / Thickness">
                      <input
                        type="text"
                        value={form.specification}
                        onChange={(e) => updateField("specification", e.target.value)}
                        placeholder="e.g. 650 GSM High Tensile / 0.8mm"
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Colour / Finish">
                      <input
                        type="text"
                        value={form.colour}
                        onChange={(e) => updateField("colour", e.target.value)}
                        placeholder="e.g. White, Blue, Beige, Black"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="Manufacturer / Country of Origin">
                      <input
                        type="text"
                        value={form.manufacturer}
                        onChange={(e) => updateField("manufacturer", e.target.value)}
                        placeholder="e.g. Korea, Germany, Belgium"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Preferred Supplier">
                      <input
                        type="text"
                        value={form.supplierName}
                        onChange={(e) => updateField("supplierName", e.target.value)}
                        placeholder="Supplier or Trading Co."
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </Section>

                {/* IDENTIFICATION & AUTO NAMING */}
                <Section title="3. Material Identification &amp; SKU">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Field label="SKU / Code" tooltip="Auto-generated if empty">
                        <input
                          type="text"
                          value={form.sku}
                          onChange={(e) => updateField("sku", e.target.value)}
                          placeholder="Auto (PRD-xxx)"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field
                        label="Material Name"
                        required
                        tooltip="Unique identifiable catalog item"
                      >
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => updateField("name", e.target.value)}
                            placeholder="e.g. Korean Fabric — White — 3m Width"
                            className={inputClass}
                            required
                          />
                          {isFormFabric && (
                            <button
                              type="button"
                              onClick={() => updateField("name", autoSuggestName())}
                              className="rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                            >
                              Auto Name
                            </button>
                          )}
                        </div>
                      </Field>
                    </div>
                  </div>

                  <Field label="Notes / Technical Description">
                    <textarea
                      rows={2}
                      value={form.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      placeholder="Additional workshop notes, storage racks, weld settings..."
                      className={inputClass}
                    />
                  </Field>
                </Section>

                {/* RATES & CONTROLLED OPENING STOCK */}
                <Section title="4. Pricing &amp; Controlled Stock Setup">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label={`Purchase Cost (AED/${form.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.costPrice}
                        onChange={(e) => updateField("costPrice", e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={`Selling Rate (AED/${form.unit})`}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.sellingPrice}
                        onChange={(e) => updateField("sellingPrice", e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="VAT Rate (%)">
                      <input
                        type="number"
                        step="0.01"
                        value={form.vatRate}
                        onChange={(e) => updateField("vatRate", e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field
                      label={`Minimum Stock Buffer (${form.unit})`}
                      tooltip="Triggers low-stock alert"
                    >
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={form.minimumStock}
                        onChange={(e) => updateField("minimumStock", e.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    {!editingMaterial ? (
                      <Field
                        label={`Opening Stock (${form.unit})`}
                        tooltip="Controlled initial stock receipt"
                      >
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={form.initialOpeningStock}
                          onChange={(e) => updateField("initialOpeningStock", e.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-500">
                        Opening stock cannot be modified here. Use audited Stock In or Stock
                        Adjustments to adjust live stock.
                      </div>
                    )}
                  </div>
                </Section>
              </form>
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
              <button
                type="button"
                onClick={closeDrawer}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="material-master-form"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow-sm"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving
                  ? "Saving Material..."
                  : editingMaterial
                  ? "Update Material"
                  : "Save Material Master"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
