"use client";

import { ArrowRight, Calculator, Layers, Ruler, Save, WalletCards } from "lucide-react";
import NumericInput from "@/components/NumericInput";
import type { PvcTankLinerInput, PvcTankLinerResult } from "@/lib/measurementTypes";

type Props = {
  value: PvcTankLinerInput;
  result: PvcTankLinerResult;
  onChange: (value: PvcTankLinerInput) => void;
  onAddToQuotation?: () => void;
  onSave?: () => void;
  saving?: boolean;
};

const inputClass = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-emerald-500";

export default function PvcTankLinerCalculator({ value, result, onChange, onAddToQuotation, onSave, saving }: Props) {
  const update = <K extends keyof PvcTankLinerInput>(key: K, next: PvcTankLinerInput[K]) => {
    onChange({ ...value, [key]: next });
  };

  const measurementInput = (key: keyof PvcTankLinerInput, decimals = 2) => (
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
        <div className="mb-3 flex items-center gap-2 text-sky-300">
          <Ruler size={16} />
          <h4 className="text-xs font-black uppercase tracking-wider">Tank Details</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Tank Diameter (M)</span>
            {measurementInput("tankDiameter")}
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Tank Height (M)</span>
            {measurementInput("tankHeight")}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-amber-300">
          <Layers size={16} />
          <h4 className="text-xs font-black uppercase tracking-wider">Material / Fabrication Settings</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Fabric Width (M)</span>{measurementInput("fabricWidth")}</label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Welding Size on Seam (MM)</span>{measurementInput("weldingSizeMm", 0)}</label>
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Number of Seams</span>
            <NumericInput preset="integer" value={value.numberOfSeams} onChange={(next) => update("numberOfSeams", next)} min={0} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Diameter Allowance (M)</span>{measurementInput("diameterAllowance")}</label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Height Allowance (M)</span>{measurementInput("heightAllowance")}</label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Eyelet Size (MM)</span>{measurementInput("eyeletSizeMm", 0)}</label>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4">
        <div className="mb-3 flex items-center gap-2 text-emerald-300">
          <Calculator size={16} />
          <h4 className="text-xs font-black uppercase tracking-wider">Calculated Liner</h4>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          {[
            ["Liner Diameter", `${result.linerDiameter.toFixed(3)} M`],
            ["Liner Height", `${result.linerHeight.toFixed(3)} M`],
            ["Developed Length", `${result.developedLength.toFixed(3)} M`],
            ["Welding Size on Seam", `${result.weldingSizeMm.toFixed(0)} MM`],
            ["Number of Seams", result.numberOfSeams.toString()],
            ["Total Welding Allowance", `${result.totalWeldingAllowance.toFixed(3)} M`],
            ["Required Fabric Width", `${result.requiredFabricWidth.toFixed(3)} M`],
            ["Full Fabric Widths", result.fullFabricWidths.toString()],
            ["Gross Fabric Width", `${result.grossFabricWidth.toFixed(3)} M`],
            ["Unused / Wastage Width", `${result.wastageWidth.toFixed(3)} M`],
          ].map(([label, display]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-800 py-1.5">
              <dt className="text-slate-400">{label}</dt>
              <dd className="whitespace-nowrap font-mono font-bold text-white">{display}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-950 via-slate-950 to-sky-950 p-5 text-center shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Material Required</p>
        <div className="mt-4 rounded-xl border border-emerald-400/40 bg-black/25 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Running Meter</p>
          <p className="mt-1 font-mono text-4xl font-black text-white">{result.runningMeter.toFixed(2)} <span className="text-xl text-emerald-300">RM</span></p>
        </div>
        <div className="mt-3 rounded-xl border border-sky-400/30 bg-black/20 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300">Square Meter</p>
          <p className="mt-1 font-mono text-2xl font-black text-white">{result.squareMeter.toFixed(2)} <span className="text-base text-sky-300">M²</span></p>
        </div>
        <p className="mt-3 text-xs text-slate-300">Fabric Width: <span className="font-mono font-bold text-white">{result.fabricWidth.toFixed(2)} M</span></p>
      </section>

      <section className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-4">
        <div className="mb-3 flex items-center gap-2 text-violet-300">
          <WalletCards size={16} />
          <h4 className="text-xs font-black uppercase tracking-wider">Internal Costing</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>Costing Method</span>
            <select value={value.costingMethod} onChange={(event) => update("costingMethod", event.target.value === "m2" ? "m2" : "rm")} className={inputClass}>
              <option value="rm">Rate / RM</option>
              <option value="m2">Rate / M²</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300">
            <span>{value.costingMethod === "m2" ? "Rate / M²" : "Rate / RM"} (AED)</span>
            <NumericInput preset="currency" value={value.costingMethod === "m2" ? value.ratePerM2 : value.ratePerRm} onChange={(next) => update(value.costingMethod === "m2" ? "ratePerM2" : "ratePerRm", next)} min={0} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Fabrication Cost (AED)</span><NumericInput preset="currency" value={value.fabricationCost} onChange={(next) => update("fabricationCost", next)} min={0} className={inputClass} /></label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Other Cost (AED)</span><NumericInput preset="currency" value={value.otherCost} onChange={(next) => update("otherCost", next)} min={0} className={inputClass} /></label>
          <label className="space-y-1 text-xs font-medium text-slate-300"><span>Markup (%)</span><NumericInput preset="percentage" value={value.markupPercent} onChange={(next) => update("markupPercent", next)} min={0} className={inputClass} /></label>
          <div className="rounded-lg border border-violet-500/30 bg-slate-950 p-3 text-xs">
            <div className="flex justify-between text-slate-400"><span>Material Cost</span><strong className="font-mono text-white">AED {result.materialCost.toFixed(2)}</strong></div>
            <div className="mt-1 flex justify-between text-slate-400"><span>Cost Before Markup</span><strong className="font-mono text-white">AED {result.costBeforeMarkup.toFixed(2)}</strong></div>
            <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 text-violet-200"><span>Selling Price</span><strong className="font-mono text-base text-white">AED {result.sellingPrice.toFixed(2)}</strong></div>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={value.showMaterialRequirementOnQuotation} onChange={(event) => update("showMaterialRequirementOnQuotation", event.target.checked)} className="mt-0.5 rounded border-slate-600 text-emerald-500" />
          Show “Material Requirement: {result.runningMeter.toFixed(2)} RM / {result.squareMeter.toFixed(2)} M²” on the customer quotation.
        </label>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {onSave && (
          <button type="button" disabled={saving || result.runningMeter <= 0} onClick={onSave} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
            <Save size={18} /> Save Calculation
          </button>
        )}
        {onAddToQuotation && (
          <button type="button" disabled={saving || result.runningMeter <= 0} onClick={onAddToQuotation} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg hover:bg-emerald-400 disabled:opacity-50">
            Add to Quotation <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
