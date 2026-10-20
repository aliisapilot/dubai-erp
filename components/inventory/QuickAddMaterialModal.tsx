"use client";

import { useState } from "react";
import { getCompanyId } from "@/lib/helpers";
import {
  X,
  PackagePlus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ruler,
} from "lucide-react";
import {
  saveMaterialMaster,
  INITIAL_FABRIC_BRANDS,
  MATERIAL_CATEGORIES,
  SUPPORTED_UNITS,
  calculateSqmFromRm,
  isFabricMaterial,
  type MaterialItem,
} from "@/lib/materialInventory";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onMaterialCreated: (material: MaterialItem) => void;
  initialBrand?: string;
};

export default function QuickAddMaterialModal({
  isOpen,
  onClose,
  onMaterialCreated,
  initialBrand,
}: Props) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState(initialBrand || "Korean Fabric");
  const [customBrand, setCustomBrand] = useState("");
  const [category, setCategory] = useState("Korean Fabric");
  const [sku, setSku] = useState("");
  const [fabricWidth, setFabricWidth] = useState("3.0");
  const [specification, setSpecification] = useState("650 GSM High Tensile");
  const [colour, setColour] = useState("White");
  const [rollLength, setRollLength] = useState("50");
  const [unit, setUnit] = useState("Sqm");
  const [costPrice, setCostPrice] = useState("12.50");
  const [sellingPrice, setSellingPrice] = useState("18.00");
  const [minimumStock, setMinimumStock] = useState("100");
  const [initialOpeningStock, setInitialOpeningStock] = useState("0");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const isFabric = isFabricMaterial(category, unit);
  const widthNum = parseFloat(fabricWidth) || 0;
  const effectiveBrand = brand === "Other / Custom" ? customBrand.trim() || "Custom Brand" : brand;

  // Auto-generate suggested name when brand, colour, or width changes
  function generateSuggestedName(b: string, col: string, w: string, spec: string) {
    const parts = [b, col, w ? `${w}m Width` : "", spec].filter(Boolean);
    return parts.join(" — ");
  }

  function handleBrandSelect(selected: string) {
    setBrand(selected);
    if (selected === "Korean Fabric") {
      setCategory("Korean Fabric");
      if (!name) setName(generateSuggestedName("Korean Fabric", colour, fabricWidth, specification));
    } else if (selected === "Mahler German Fabric") {
      setCategory("German Fabric");
      if (!name) setName(generateSuggestedName("Mahler German Fabric", colour, fabricWidth, specification));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const finalName = name.trim() || generateSuggestedName(effectiveBrand, colour, fabricWidth, specification);
    if (!finalName) {
      setErrorMsg("Material name is required.");
      return;
    }

    if (isFabric && widthNum <= 0) {
      setErrorMsg("Fabric width must be greater than 0 metres for fabric inventory.");
      return;
    }

    setSaving(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Active company session not found.");

      const newMaterial = await saveMaterialMaster(
        companyId,
        {
          name: finalName,
          sku: sku.trim() || null,
          brand: effectiveBrand,
          category,
          unit,
          fabric_width: widthNum,
          roll_length: parseFloat(rollLength) || 50,
          specification: specification.trim() || null,
          colour: colour.trim() || null,
          cost_price: parseFloat(costPrice) || 0,
          selling_price: parseFloat(sellingPrice) || 0,
          minimum_stock: parseFloat(minimumStock) || 0,
          supplier_name: supplierName.trim() || null,
          notes: notes.trim() || null,
          active: true,
        },
        parseFloat(initialOpeningStock) || 0
      );

      onMaterialCreated(newMaterial);
      onClose();
    } catch (err: unknown) {
      console.error("Error creating material:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to create material record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <PackagePlus size={22} />
            <div>
              <h3 className="font-bold text-white text-lg">Create New Material Master</h3>
              <p className="text-xs text-slate-400">Add Korean, German, or Custom Fabric specification</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} /> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brand Quick Pills */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Fabric Brand / Origin <span className="text-rose-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INITIAL_FABRIC_BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleBrandSelect(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    brand === b
                      ? "bg-emerald-600 text-white border-emerald-500 shadow-md"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {brand === "Other / Custom" && (
              <div className="mt-2">
                <input
                  type="text"
                  required
                  placeholder="Type custom brand name (e.g. Sioen, Heytex, Al Safwah...)"
                  value={customBrand}
                  onChange={(e) => setCustomBrand(e.target.value)}
                  className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Material Name & SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Material Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Korean Fabric — White — 3 m Width"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">SKU / Item Code</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. KOR-300-WHT"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Primary Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {SUPPORTED_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fabric Specifications: Width, Roll Length, Colour, GSM */}
          {isFabric && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
                <Ruler size={15} />
                <span>Fabric Roll Dimensions &amp; Technical Specifications</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Fabric Width (M) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    value={fabricWidth}
                    onChange={(e) => setFabricWidth(e.target.value)}
                    placeholder="3.0"
                    className="w-full rounded-lg border border-sky-500/50 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-sky-400">e.g. 2.5m, 3m, 3.2m</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Roll Length (M)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={rollLength}
                    onChange={(e) => setRollLength(e.target.value)}
                    placeholder="50"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">e.g. 50m, 100m</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Colour</label>
                  <input
                    type="text"
                    value={colour}
                    onChange={(e) => setColour(e.target.value)}
                    placeholder="e.g. White, Beige, Blue"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Specification / GSM</label>
                  <input
                    type="text"
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    placeholder="e.g. 650 GSM, 900 GSM"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              {widthNum > 0 && (
                <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-800/40 text-xs text-sky-300 flex items-center justify-between">
                  <span>📐 Live Formula: 100 Running Metres = {calculateSqmFromRm(widthNum, 100)} m²</span>
                  <span>1 Full Roll ({rollLength}m) = {calculateSqmFromRm(widthNum, parseFloat(rollLength) || 50)} m²</span>
                </div>
              )}
            </div>
          )}

          {/* Rates, Initial Opening Stock & Minimum Stock */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">Cost Rate (AED)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">Selling Rate (AED)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">Minimum Alert Stock</label>
              <input
                type="number"
                step="1"
                min="0"
                value={minimumStock}
                onChange={(e) => setMinimumStock(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">
                Opening Stock ({unit})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialOpeningStock}
                onChange={(e) => setInitialOpeningStock(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Supplier Name & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">Primary Supplier / Vendor</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Gulf Fabric Trading / International Importer"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">Notes / Description</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Tent fabrication grade, UV stabilized"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving Material...
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} /> Save Material Master
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
