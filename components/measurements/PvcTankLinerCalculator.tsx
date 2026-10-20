"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  CircleDot,
  DollarSign,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Percent,
  Ruler,
  Save,
  ShieldCheck,
  Tag,
  TrendingUp,
  Truck,
  Wrench,
  ArrowUpRight,
  CheckCircle2,
  Warehouse,
} from "lucide-react";
import NumericInput from "@/components/NumericInput";
import type { PvcTankLinerInput, PvcTankLinerResult } from "@/lib/measurementTypes";
import { getMaterialsList, type MaterialItem } from "@/lib/materialInventory";
import { getCompanyId } from "@/lib/helpers";

type Props = {
  value: PvcTankLinerInput;
  result: PvcTankLinerResult;
  onChange: (value: PvcTankLinerInput) => void;
  onAddToQuotation?: () => void;
  onCreateQuotation?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  saveLabel?: string;
};

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-emerald-500 transition-colors";

function fmtAED(val: number): string {
  return (val || 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PvcTankLinerCalculator({
  value,
  result,
  onChange,
  onAddToQuotation,
  onCreateQuotation,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: Props) {
  const [showFormulaAnalysis, setShowFormulaAnalysis] = useState<boolean>(true);
  const [showWeldingDetails, setShowWeldingDetails] = useState<boolean>(true);

  // Material Inventory Availability Check State
  const [inventoryMaterials, setInventoryMaterials] = useState<MaterialItem[]>([]);
  const [selectedInventoryMaterialId, setSelectedInventoryMaterialId] = useState<string>("");

  useEffect(() => {
    async function loadInventory() {
      try {
        const companyId = await getCompanyId();
        if (!companyId) return;
        const mats = await getMaterialsList(companyId);
        const fabricMats = mats.filter((m) => m.is_fabric || m.fabric_width > 0);
        setInventoryMaterials(fabricMats);
        if (fabricMats.length > 0) {
          setSelectedInventoryMaterialId((curr) => curr || fabricMats[0].id);
        }
      } catch (e) {
        console.error("Error loading inventory fabrics for calculator:", e);
      }
    }
    loadInventory();
  }, []);

  const tankCount = value.tankQuantity && value.tankQuantity > 0 ? value.tankQuantity : 1;

  const update = <K extends keyof PvcTankLinerInput>(key: K, next: PvcTankLinerInput[K]) => {
    const updated = { ...value, [key]: next };

    // Synchronize legacy and enhanced fields bidirectionally
    if (key === "fabricPurchaseUnit" || key === "costingMethod") {
      const unit = (next as string) === "m2" || (next as string) === "sqm" ? "sqm" : "rm";
      updated.fabricPurchaseUnit = unit;
      updated.costingMethod = unit === "sqm" ? "m2" : "rm";
    }
    if (key === "fabricPurchaseRate") {
      const rate = Number(next) || 0;
      if (updated.fabricPurchaseUnit === "rm" || updated.costingMethod === "rm") {
        updated.ratePerRm = rate;
      } else {
        updated.ratePerM2 = rate;
      }
    }
    if (key === "weldingCost") {
      updated.fabricationCost = Number(next) || 0;
    }
    if (key === "fabricationCost") {
      updated.weldingCost = Number(next) || 0;
    }
    if (key === "otherExpenses") {
      updated.otherCost = Number(next) || 0;
    }
    if (key === "otherCost") {
      updated.otherExpenses = Number(next) || 0;
    }

    onChange(updated);
  };

  const measurementInput = (key: keyof PvcTankLinerInput, decimals = 3) => (
    <NumericInput
      preset="measurement"
      value={value[key] as number}
      onChange={(next) => update(key, next as never)}
      min={0}
      formatOnBlur
      decimalPlaces={decimals}
      className={inputClass}
    />
  );

  const purchaseUnit = value.fabricPurchaseUnit || (value.costingMethod === "m2" ? "sqm" : "rm");
  const purchaseRate =
    value.fabricPurchaseRate !== undefined && value.fabricPurchaseRate > 0
      ? value.fabricPurchaseRate
      : purchaseUnit === "sqm"
      ? value.ratePerM2 || 0
      : value.ratePerRm || 0;

  // Final approved quantities
  const finalFabricSqmPerTank = result.approvedFabricSqmPerTank;
  const finalFabricSqmAllTanks = result.approvedFabricSqmAllTanks;
  const finalWeldingRmPerTank = result.approvedWeldingRmPerTank;
  const finalWeldingRmAllTanks = result.approvedWeldingRmAllTanks;
  const finalEyeletsPerTank = result.approvedEyeletsPerTank;
  const finalEyeletsAllTanks = result.approvedEyeletsAllTanks;

  // Quotation line amounts
  const fabricSellingTotal = result.fabricSellingTotal;
  const weldingSellingTotal = result.weldingSellingTotal;
  const eyeletSellingTotal = result.eyeletSellingTotal;
  const netSubtotal = fabricSellingTotal + weldingSellingTotal + eyeletSellingTotal;

  // Individual line VAT
  const fabricVat = Math.round(fabricSellingTotal * 0.05 * 100) / 100;
  const weldingVat = Math.round(weldingSellingTotal * 0.05 * 100) / 100;
  const eyeletVat = Math.round(eyeletSellingTotal * 0.05 * 100) / 100;
  const referenceVat = Math.floor(netSubtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((netSubtotal + referenceVat) * 100) / 100;

  return (
    <div className="space-y-4">
      {/* 1. TANK DETAILS & QUANTITY */}
      <section className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-300">
            <Ruler size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">Tank Details & Multi-Tank Quantity</h4>
          </div>
          <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-300">
            {tankCount} Tank{tankCount > 1 ? "s" : ""} Selected
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Tank Diameter (M)</span>
            {measurementInput("tankDiameter")}
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Tank Height (M)</span>
            {measurementInput("tankHeight")}
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Number of Tanks</span>
            <NumericInput
              preset="integer"
              value={tankCount}
              onChange={(next) => update("tankQuantity", Math.max(1, next))}
              min={1}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {/* 2. MATERIAL SETTINGS, WELDING OVERLAP & OPTIONAL ALLOWANCES */}
      <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300">
            <Layers size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">Material / Fabrication Settings & Allowances</h4>
          </div>
          <span className="text-[10px] text-slate-400">Allowances default to 0.00 m</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Fabric Roll Width (M)</span>
            {measurementInput("fabricWidth", 2)}
          </label>

          {/* Welding Overlap (MM) - clearly separated from Welding Quantity RM */}
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1">
              <span>Welding Overlap on Seam (MM)</span>
              <span
                className="cursor-help text-amber-400 hover:text-amber-300"
                title="Width of the hot-air / high-frequency weld overlap (e.g. 40 MM) between fabric panels. This is NOT the running metres of welding."
              >
                <HelpCircle size={13} />
              </span>
            </span>
            {measurementInput("weldingSizeMm", 0)}
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Number of Seams</span>
            <NumericInput
              preset="integer"
              value={value.numberOfSeams}
              onChange={(next) => update("numberOfSeams", next)}
              min={0}
              className={inputClass}
            />
          </label>

          {/* Diameter Allowance with Tooltip */}
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1">
              <span>Diameter Allowance (M)</span>
              <span
                className="cursor-help text-sky-400 hover:text-sky-300"
                title="Optional extra diameter added to the tank for loose fit, fold-over, or top rim flange. Defaults to 0.00 m for exact dimensions."
              >
                <HelpCircle size={13} />
              </span>
            </span>
            {measurementInput("diameterAllowance", 3)}
          </label>

          {/* Height Allowance with Tooltip */}
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1">
              <span>Height Allowance (M)</span>
              <span
                className="cursor-help text-sky-400 hover:text-sky-300"
                title="Optional extra height added to the tank for floor anchoring, bottom corner turn-up, or top rim hems. Defaults to 0.00 m for exact dimensions."
              >
                <HelpCircle size={13} />
              </span>
            </span>
            {measurementInput("heightAllowance", 3)}
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Eyelet Size (MM)</span>
            {measurementInput("eyeletSizeMm", 0)}
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={value.includeBottomBase !== false}
              onChange={(e) => update("includeBottomBase", e.target.checked)}
              className="rounded border-slate-600 text-emerald-500 focus:ring-0"
            />
            <span>Include Bottom Circular Base Disc (Full 3D Tank Liner calculation)</span>
          </label>
        </div>
      </section>

      {/* 2B. CHECK MATERIAL AVAILABILITY & WAREHOUSE STOCK RESERVATION */}
      {(() => {
        const selectedInventoryMaterial = inventoryMaterials.find((m) => m.id === selectedInventoryMaterialId);
        const requiredRmAllTanks =
          value.fabricWidth > 0
            ? Math.round((result.approvedFabricSqmAllTanks / value.fabricWidth) * 100) / 100
            : 0;
        const requiredSqmAllTanks = result.approvedFabricSqmAllTanks;
        const availableSqm = selectedInventoryMaterial?.current_stock ?? 0;
        const availableRm = selectedInventoryMaterial?.running_metres_available ?? 0;
        const estimatedWastageSqm = Math.max(
          0,
          Math.round((result.approvedFabricSqmAllTanks - (result.wallFabricSqm + result.baseFabricSqm) * tankCount) * 100) / 100
        );
        const surplusOrShortage = Math.round((availableSqm - requiredSqmAllTanks) * 100) / 100;
        const isSurplus = surplusOrShortage >= 0;

        return (
          <section className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-slate-950 to-slate-950 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-emerald-400">
                <Warehouse size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Check Material Availability &amp; Warehouse Stock (No Auto-Deduction)
                </h4>
              </div>
              <span className="text-[10px] text-slate-400">
                Live Warehouse Verification
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">
                  Select Fabric from Warehouse Inventory:
                </label>
                <select
                  value={selectedInventoryMaterialId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedInventoryMaterialId(nextId);
                    const mat = inventoryMaterials.find((m) => m.id === nextId);
                    if (mat && mat.fabric_width > 0 && mat.fabric_width !== value.fabricWidth) {
                      update("fabricWidth", mat.fabric_width);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  {inventoryMaterials.length === 0 ? (
                    <option value="">No fabric materials found in warehouse</option>
                  ) : (
                    inventoryMaterials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} | {m.brand} ({m.fabric_width}m width) [In Stock: {m.current_stock} m²]
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-end">
                {selectedInventoryMaterial && (
                  <div className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Available in Warehouse</span>
                      <strong className="font-mono text-emerald-400 text-sm">
                        {availableSqm.toFixed(2)} m²
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Equivalent RM</span>
                      <strong className="font-mono text-slate-200">
                        ≈ {availableRm.toFixed(2)} m
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4-Metric Grid: Required RM, Required m², Available m², Estimated Wastage */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Required RM</span>
                <span className="font-mono font-bold text-sm text-white mt-0.5 block">
                  {requiredRmAllTanks.toFixed(2)} m
                </span>
                <span className="text-[9px] text-slate-500">at {value.fabricWidth}m width</span>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-500/30 text-center">
                <span className="text-[10px] uppercase font-bold text-blue-300 block">Required Area</span>
                <span className="font-mono font-black text-base text-blue-400 mt-0.5 block">
                  {requiredSqmAllTanks.toFixed(2)} m²
                </span>
                <span className="text-[9px] text-blue-300/70">{tankCount} Tank{tankCount > 1 ? "s" : ""}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-300 block">Estimated Wastage</span>
                <span className="font-mono font-bold text-sm text-amber-400 mt-0.5 block">
                  {estimatedWastageSqm.toFixed(2)} m²
                </span>
                <span className="text-[9px] text-amber-300/70">Cuttings &amp; scrap</span>
              </div>

              <div
                className={`p-2.5 rounded-lg border text-center ${
                  isSurplus
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/40 text-rose-300"
                }`}
              >
                <span className="text-[10px] uppercase font-bold block">
                  {isSurplus ? "Stock Surplus" : "Stock Shortage"}
                </span>
                <span className="font-mono font-black text-base mt-0.5 block">
                  {isSurplus ? `+${surplusOrShortage.toFixed(2)} m²` : `${surplusOrShortage.toFixed(2)} m²`}
                </span>
                <span className="text-[9px] block">
                  {isSurplus ? "Sufficient Stock" : "Reorder Needed"}
                </span>
              </div>
            </div>

            {/* Quick Link to Issue Material (Stock Out) */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800/80">
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span>
                  Quotation calculations do not deduct stock. To physically dispatch rolls for this job, confirm a Material Issue.
                </span>
              </p>

              {selectedInventoryMaterial && (
                <Link
                  href={`/inventory/stock-out?productId=${selectedInventoryMaterial.id}&rm=${requiredRmAllTanks}&sqm=${requiredSqmAllTanks}&purpose=PVC+Tank+Liner+Production`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm"
                >
                  <ArrowUpRight size={13} /> Issue Material in Stock Out
                </Link>
              )}
            </div>
          </section>
        );
      })()}

      {/* 3. HANDWRITTEN REFERENCE CALCULATION VS THEORETICAL MINIMUM ANALYSIS */}
      <section className="rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-950/20 via-slate-950 to-slate-950 p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFormulaAnalysis(!showFormulaAnalysis)}>
          <div className="flex items-center gap-2 text-indigo-300">
            <Info size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">
              Handwritten Reference Analysis vs Theoretical Discrepancy
            </h4>
          </div>
          <button type="button" className="text-slate-400 hover:text-white">
            {showFormulaAnalysis ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {showFormulaAnalysis && (
          <div className="mt-3 space-y-3 text-xs text-slate-300">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Comparison between the theoretical 2D unrolled wall formula and the real-world 3D shop fabrication
              calculations from the handwritten reference notes (Diameter: 7.39m, Height: 6.65m):
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <span className="block font-bold text-amber-300 text-[11px] uppercase">
                  A. Theoretical 2D Minimum (Wall Only)
                </span>
                <ul className="space-y-1 text-[11px] text-slate-400 font-mono">
                  <li>• Circumference: π × 7.390m = 23.216m</li>
                  <li>• Wall Strips needed (6.65m height / 3m): 3 widths</li>
                  <li>• Wall Fabric: 23.216m × 3 = <strong>69.65 RM (208.95 M²)</strong></li>
                  <li>• Wall Seams: 2 seams × 23.20m + 6.65m = <strong>53.05 RM</strong></li>
                  <li>• Eyelets: Top rim only (~11.9cm pitch) = <strong>195 Pcs</strong></li>
                </ul>
                <p className="text-[10px] text-rose-300/90 italic">
                  * Discrepancy: Only accounts for a hollow open cylinder with no bottom floor or scrap.
                </p>
              </div>

              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 space-y-2">
                <span className="block font-bold text-emerald-300 text-[11px] uppercase">
                  B. Real-World 3D Liner (Handwritten Reference)
                </span>
                <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <li>• Wall Panels: 3 strips × 23.20m = 69.60 RM (208.80 M²)</li>
                  <li>• Bottom Base Disc: 3 strips × 7.39m = 22.17 RM (66.51 M²)</li>
                  <li>• Overlap (2m) + Fabrication Scrap (5m) = 7.00 RM (21.00 M²)</li>
                  <li>• <strong>Total PVC Fabric: 98.77 RM × 3m = 296.31 M² → 297 M² / Tank</strong></li>
                  <li>• <strong>Total Welding: 283.83 RM → 284 RM / Tank</strong> (Base + Double Wall + Joint + Tape)</li>
                  <li>• <strong>Total Eyelets: 195 (Top) + 36 (Bottom) = 231 Pcs / Tank</strong></li>
                </ul>
                <p className="text-[10px] text-emerald-300 font-semibold">
                  ✓ Full closed water-tank liner matching reference quotation QTN145/26.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4. VISIBLE WELDING CALCULATION BREAKDOWN SECTION */}
      <section className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/20 via-slate-950 to-slate-950 p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowWeldingDetails(!showWeldingDetails)}>
          <div className="flex items-center gap-2 text-amber-300">
            <Wrench size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">
              Welding Calculation Breakdown ({result.approvedWeldingRmPerTank} RM / Tank — {result.approvedWeldingRmAllTanks} RM Total)
            </h4>
          </div>
          <button type="button" className="text-slate-400 hover:text-white">
            {showWeldingDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {showWeldingDetails && (
          <div className="mt-3 space-y-3">
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-400 text-[11px]">1. Base Disc Internal Seams</dt>
                <dd className="font-mono font-bold text-white mt-1">
                  2 seams × {result.linerDiameter.toFixed(2)}m = {result.weldingBaseSeamsRm.toFixed(2)} RM
                </dd>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-400 text-[11px]">2. Wall Horizontal Panel Seams (Double-pass)</dt>
                <dd className="font-mono font-bold text-white mt-1">
                  2 seams × {result.developedLength.toFixed(2)}m × 2 = {result.weldingWallHorizontalRm.toFixed(2)} RM
                </dd>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-400 text-[11px]">3. Cylinder Vertical Closing Seam</dt>
                <dd className="font-mono font-bold text-white mt-1">
                  1 seam × {result.linerHeight.toFixed(2)}m = {result.weldingWallVerticalRm.toFixed(2)} RM
                </dd>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-400 text-[11px]">4. Base-to-Wall Joint & Rim Seam</dt>
                <dd className="font-mono font-bold text-white mt-1">
                  3 passes × {result.developedLength.toFixed(2)}m = {result.weldingCornerRimRm.toFixed(2)} RM
                </dd>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <dt className="text-slate-400 text-[11px]">5. Corner Tape & Hem Reinforcement</dt>
                <dd className="font-mono font-bold text-white mt-1">
                  Baffle / corner reinforcement = {result.weldingReinforcementRm.toFixed(2)} RM
                </dd>
              </div>

              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5">
                <dt className="text-amber-300 font-bold text-[11px]">Total Calculated Welding (Per Tank)</dt>
                <dd className="font-mono font-black text-amber-200 mt-1">
                  {result.totalCalculatedWeldingRm.toFixed(2)} RM → {result.approvedWeldingRmPerTank} RM
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* 5. APPROVED MATERIAL QUANTITIES & MANUAL OVERRIDES (PER TANK & ALL TANKS) */}
      <section className="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-slate-950 to-slate-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-300">
            <Calculator size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">
              Approved Quantities & Manual Overrides ({tankCount} Tank{tankCount > 1 ? "s" : ""})
            </h4>
          </div>
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            Used for Quotation
          </span>
        </div>
        <p className="mb-4 text-[11px] text-slate-400">
          Displays calculated quantities alongside approved quantities per tank and multiplied for all {tankCount} tanks.
          You can manually override any quantity below.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* A. PVC FABRIC */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-400" /> PVC Fabric
              </span>
              <span className="font-mono text-[11px] font-bold text-emerald-400">Sqm</span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span>Wall (2D):</span>
                <span>{result.wallFabricSqm.toFixed(2)} M²</span>
              </div>
              <div className="flex justify-between">
                <span>Full Liner Calc:</span>
                <span>{result.totalCalculatedFabricSqm.toFixed(2)} M²</span>
              </div>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Approved Qty / Tank ({finalFabricSqmPerTank} M²)
              </span>
              <NumericInput
                preset="integer"
                value={value.overrideFabricSqm !== undefined ? value.overrideFabricSqm : 297}
                onChange={(val) => update("overrideFabricSqm", val)}
                min={0}
                className={inputClass}
              />
            </div>
            <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-mono">
              <span className="text-xs text-slate-300">Total ({tankCount} Tanks):</span>
              <strong className="text-base text-emerald-300">{finalFabricSqmAllTanks} M²</strong>
            </div>
          </div>

          {/* B. WELDING */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Wrench size={14} className="text-amber-400" /> Welding Seams
              </span>
              <span className="font-mono text-[11px] font-bold text-amber-400">RM</span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span>Wall Seams:</span>
                <span>{result.weldingWallHorizontalRm.toFixed(2)} RM</span>
              </div>
              <div className="flex justify-between">
                <span>Full Fabrication:</span>
                <span>{result.totalCalculatedWeldingRm.toFixed(2)} RM</span>
              </div>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Approved Qty / Tank ({finalWeldingRmPerTank} RM)
              </span>
              <NumericInput
                preset="integer"
                value={value.overrideWeldingRm !== undefined ? value.overrideWeldingRm : 284}
                onChange={(val) => update("overrideWeldingRm", val)}
                min={0}
                className={inputClass}
              />
            </div>
            <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-mono">
              <span className="text-xs text-slate-300">Total ({tankCount} Tanks):</span>
              <strong className="text-base text-amber-300">{finalWeldingRmAllTanks} RM</strong>
            </div>
          </div>

          {/* C. EYELETS */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <CircleDot size={14} className="text-sky-400" /> SS Eyelets
              </span>
              <span className="font-mono text-[11px] font-bold text-sky-400">Pcs</span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span>Top Rim (~12cm):</span>
                <span>{result.eyeletsTopRim} Pcs</span>
              </div>
              <div className="flex justify-between">
                <span>Bottom Fixings:</span>
                <span>{result.eyeletsBottom} Pcs</span>
              </div>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Approved Qty / Tank ({finalEyeletsPerTank} Pcs)
              </span>
              <NumericInput
                preset="integer"
                value={value.overrideEyeletsPcs !== undefined ? value.overrideEyeletsPcs : 231}
                onChange={(val) => update("overrideEyeletsPcs", val)}
                min={0}
                className={inputClass}
              />
            </div>
            <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-mono">
              <span className="text-xs text-slate-300">Total ({tankCount} Tanks):</span>
              <strong className="text-base text-sky-300">{finalEyeletsAllTanks} Pcs</strong>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CUSTOMER SELLING PRICE SECTION (QUOTATION RATES) */}
      <section className="rounded-xl border border-sky-500/40 bg-gradient-to-b from-sky-950/20 via-slate-950/90 to-slate-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-400">
            <Tag size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">Customer Selling Price & Quotation Total</h4>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-sky-300">
            <DollarSign size={12} /> QUOTATION RATES
          </span>
        </div>
        <p className="mb-4 text-[11px] text-slate-400">
          Editable selling rates applied to the {tankCount} tank quantities to generate customer quotation line items.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Fabric Selling Rate */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">1. PVC Fabric Selling Rate</span>
              <span className="text-[10px] text-slate-400 font-mono">AED / Sqm</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.sellingRateFabric !== undefined ? value.sellingRateFabric : 15.0}
                onChange={(val) => update("sellingRateFabric", val)}
                min={0}
                className={inputClass}
                placeholder="AED 15.00"
              />
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between pt-1 font-mono">
              <span>{finalFabricSqmAllTanks} Sqm × AED {value.sellingRateFabric ?? 15}</span>
              <strong className="text-sky-300 font-bold">AED {fmtAED(fabricSellingTotal)}</strong>
            </div>
            <div className="text-[9px] text-slate-500 flex justify-between pt-0.5 font-mono">
              <span>Line VAT (5%):</span>
              <span>AED {fmtAED(fabricVat)}</span>
            </div>
          </div>

          {/* Welding Selling Rate */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">2. Welding Selling Rate</span>
              <span className="text-[10px] text-slate-400 font-mono">AED / RM</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.sellingRateWelding !== undefined ? value.sellingRateWelding : 8.0}
                onChange={(val) => update("sellingRateWelding", val)}
                min={0}
                className={inputClass}
                placeholder="AED 8.00"
              />
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between pt-1 font-mono">
              <span>{finalWeldingRmAllTanks} RM × AED {value.sellingRateWelding ?? 8}</span>
              <strong className="text-sky-300 font-bold">AED {fmtAED(weldingSellingTotal)}</strong>
            </div>
            <div className="text-[9px] text-slate-500 flex justify-between pt-0.5 font-mono">
              <span>Line VAT (5%):</span>
              <span>AED {fmtAED(weldingVat)}</span>
            </div>
          </div>

          {/* Eyelet Selling Rate */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">3. SS Eyelet Selling Rate</span>
              <span className="text-[10px] text-slate-400 font-mono">AED / Pc</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.sellingRateEyelet !== undefined ? value.sellingRateEyelet : 1.5}
                onChange={(val) => update("sellingRateEyelet", val)}
                min={0}
                className={inputClass}
                placeholder="AED 1.50"
              />
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between pt-1 font-mono">
              <span>{finalEyeletsAllTanks} Pcs × AED {value.sellingRateEyelet ?? 1.5}</span>
              <strong className="text-sky-300 font-bold">AED {fmtAED(eyeletSellingTotal)}</strong>
            </div>
            <div className="text-[9px] text-slate-500 flex justify-between pt-0.5 font-mono">
              <span>Line VAT (5%):</span>
              <span>AED {fmtAED(eyeletVat)}</span>
            </div>
          </div>
        </div>

        {/* Quotation Summary Totals Bar */}
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-slate-900/90 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center sm:text-left">
            <div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Net Subtotal ({tankCount} Tanks)
              </span>
              <p className="mt-0.5 font-mono text-xl font-black text-white">AED {fmtAED(netSubtotal)}</p>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-sky-300">
                VAT (5%)
              </span>
              <p className="mt-0.5 font-mono text-xl font-black text-sky-300">AED {fmtAED(referenceVat)}</p>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                Grand Total (Inc. VAT)
              </span>
              <p className="mt-0.5 font-mono text-xl font-black text-emerald-400">AED {fmtAED(grandTotal)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. INTERNAL COSTING — PRIVATE (CONFIDENTIAL) */}
      <section className="rounded-xl border border-rose-500/40 bg-gradient-to-b from-rose-950/20 via-slate-950/90 to-slate-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <Lock size={16} />
            <h4 className="text-xs font-black uppercase tracking-wider">Internal Costing — Private</h4>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300">
            <ShieldCheck size={12} /> CONFIDENTIAL 🔒
          </span>
        </div>
        <p className="mb-4 text-[11px] text-slate-400">
          Purchase rates and internal costs are strictly private and excluded from customer quotations.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* PVC Fabric Purchase Rate */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">1. PVC Fabric Purchase Rate</span>
              <div className="flex rounded border border-slate-700 bg-slate-950 p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => update("fabricPurchaseUnit", "sqm")}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    purchaseUnit === "sqm" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  / M²
                </button>
                <button
                  type="button"
                  onClick={() => update("fabricPurchaseUnit", "rm")}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    purchaseUnit === "rm" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  / RM
                </button>
              </div>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={purchaseRate}
                onChange={(val) => update("fabricPurchaseRate", val)}
                min={0}
                className={inputClass}
                placeholder="AED Rate"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>{finalFabricSqmAllTanks} M²</span>
              <strong className="text-rose-300 font-mono">AED {fmtAED(result.fabricPurchaseCost)}</strong>
            </p>
          </div>

          {/* Welding / Fabrication Cost */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">2. Welding / Fabrication Cost</span>
              <span className="text-[10px] text-slate-500 font-mono">{finalWeldingRmAllTanks} RM</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.weldingCost || value.fabricationCost || 0}
                onChange={(val) => update("weldingCost", val)}
                min={0}
                className={inputClass}
                placeholder="AED Cost"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>Fabrication Labor</span>
              <strong className="text-rose-300 font-mono">AED {fmtAED(result.weldingCost)}</strong>
            </p>
          </div>

          {/* Eyelet Purchase Rate */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">3. Eyelet Purchase Rate</span>
              <span className="text-[10px] text-slate-500">AED / Pc</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.eyeletPurchaseRate || 0}
                onChange={(val) => update("eyeletPurchaseRate", val)}
                min={0}
                className={inputClass}
                placeholder="Rate / Pc"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>{finalEyeletsAllTanks} Pcs</span>
              <strong className="text-rose-300 font-mono">AED {fmtAED(result.eyeletPurchaseCost)}</strong>
            </p>
          </div>

          {/* Transport Cost */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
              <Truck size={13} className="text-slate-400" />
              <span>4. Transport Cost (AED)</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.transportCost || 0}
                onChange={(val) => update("transportCost", val)}
                min={0}
                className={inputClass}
                placeholder="AED Transport"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>Delivery & Handling</span>
              <strong className="text-rose-300 font-mono">AED {fmtAED(result.transportCost)}</strong>
            </p>
          </div>

          {/* Other Expenses */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <span className="text-xs font-semibold text-slate-300 block">5. Other Expenses (AED)</span>
            <div className="pt-1">
              <NumericInput
                preset="currency"
                value={value.otherExpenses || value.otherCost || 0}
                onChange={(val) => update("otherExpenses", val)}
                min={0}
                className={inputClass}
                placeholder="AED Other"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>Site Consumables & Misc</span>
              <strong className="text-rose-300 font-mono">AED {fmtAED(result.otherExpenses)}</strong>
            </p>
          </div>

          {/* Markup Percentage */}
          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
              <Percent size={13} className="text-slate-400" />
              <span>6. Markup Percentage (%)</span>
            </div>
            <div className="pt-1">
              <NumericInput
                preset="percentage"
                value={value.markupPercent || 0}
                onChange={(val) => update("markupPercent", val)}
                min={0}
                className={inputClass}
                placeholder="Markup %"
              />
            </div>
            <p className="text-[10px] text-slate-400 flex justify-between pt-1">
              <span>Margin Target</span>
              <strong className="text-slate-300 font-mono">{value.markupPercent || 0}%</strong>
            </p>
          </div>
        </div>

        {/* Financial Summary & Profit Analysis Cards */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-300">
            <TrendingUp size={14} />
            <span>Private Financial Profitability Analysis</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-300">Total Internal Cost</span>
              <p className="mt-1 font-mono text-lg font-black text-white">AED {fmtAED(result.totalInternalCost)}</p>
              <span className="text-[9px] text-slate-400">Strictly Private</span>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-300">Selling Value</span>
              <p className="mt-1 font-mono text-lg font-black text-white">AED {fmtAED(result.quotationSellingValue)}</p>
              <span className="text-[9px] text-slate-400">Net Customer Price</span>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-300">Estimated Profit</span>
              <p
                className={`mt-1 font-mono text-lg font-black ${
                  result.estimatedProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                AED {fmtAED(result.estimatedProfit)}
              </p>
              <span className="text-[9px] text-slate-400">Pre-tax Profit</span>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300">Profit Margin</span>
              <p
                className={`mt-1 font-mono text-lg font-black ${
                  result.profitMarginPercent >= 0 ? "text-amber-300" : "text-rose-400"
                }`}
              >
                {result.profitMarginPercent.toFixed(1)}%
              </p>
              <span className="text-[9px] text-slate-400">Margin on Selling</span>
            </div>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
          <input
            type="checkbox"
            checked={value.showMaterialRequirementOnQuotation}
            onChange={(event) => update("showMaterialRequirementOnQuotation", event.target.checked)}
            className="mt-0.5 rounded border-slate-600 text-emerald-500"
          />
          <span>
            Show “Material Requirement: {result.runningMeter.toFixed(2)} RM / {result.squareMeter.toFixed(2)} M²” on the customer quotation.
          </span>
        </label>
      </section>

      {/* 8. ACTIONS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <div />
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          {onSave && (
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              <span>{saveLabel || "Add to Sheet"}</span>
            </button>
          )}
          {(onCreateQuotation || onAddToQuotation) && (
            <button
              type="button"
              disabled={saving}
              onClick={onCreateQuotation || onAddToQuotation}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              <FileText size={18} />
              <span>Create Quotation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
