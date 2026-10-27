"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber, todayISO, fmtAED, fmtDate } from "@/lib/helpers";
import {
  ArrowUpRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  History,
  Package,
  Printer,
  Ruler,
  AlertCircle,
  Briefcase,
  Layers,
  Scissors,
  Sparkles,
  Warehouse,
} from "lucide-react";
import {
  getMaterialsList,
  executeStockOut,
  calculateSqmFromRm,
  calculateRmFromSqm,
  roundDecimal,
  WAREHOUSE_LOCATIONS,
  USAGE_PURPOSES,
  type MaterialItem,
  type StockOutPayload,
  type CustomerSelection,
} from "@/lib/materialInventory";
import CustomerForWhomSelector from "@/components/inventory/CustomerForWhomSelector";
import PrintModal from "@/components/documents/PrintModal";
import MaterialIssueNoteTemplate, { MaterialIssueNoteData } from "@/components/documents/MaterialIssueNoteTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type ProjectOption = {
  id: string;
  name: string;
  project_number: string;
};

function StockOutForm() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") || "";
  const initialRmParam = searchParams.get("rm") || "";
  const initialSqmParam = searchParams.get("sqm") || "";
  const initialPurposeParam = searchParams.get("purpose") || "";

  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedMaterialId, setSelectedMaterialId] = useState(initialProductId);
  const [dispatchDate, setDispatchDate] = useState(todayISO());

  // Customer / For Whom (Option A, B, C)
  const [customer, setCustomer] = useState<CustomerSelection>({
    type: "custom",
    customer_id: null,
    customer_name: "Workshop Usage",
  });

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [purpose, setPurpose] = useState(initialPurposeParam || "Project Fabrication");
  const [warehouse, setWarehouse] = useState<string>(WAREHOUSE_LOCATIONS[0]);
  const [issuedBy, setIssuedBy] = useState("Storekeeper");
  const [receivedBy, setReceivedBy] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Quantities & Wastage
  const [runningMetresUsed, setRunningMetresUsed] = useState(initialRmParam);
  const [squareMetresUsed, setSquareMetresUsed] = useState(initialSqmParam);
  const [wastageQuantity, setWastageQuantity] = useState("0");
  const [unitCost, setUnitCost] = useState("");

  // Submission & Print State
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [printMinData, setPrintMinData] = useState<MaterialIssueNoteData | null>(null);
  interface RecentDispatchItem {
    id: string;
    created_at: string;
    quantity: number;
    previous_stock: number;
    new_stock: number;
    unit_cost: number;
    reference_type: string;
    reference_number: string;
    notes: string;
    products?: {
      name: string;
      sku: string;
      unit: string;
      category: string;
    } | null;
  }
  const [recentDispatches, setRecentDispatches] = useState<RecentDispatchItem[]>([]);

  async function loadRecentDispatches(companyId: string) {
    const { data } = await supabase
      .from("stock_movements")
      .select("id, created_at, quantity, previous_stock, new_stock, unit_cost, reference_type, reference_number, notes, products(name, sku, unit, category)")
      .eq("company_id", companyId)
      .eq("movement_type", "OUT")
      .order("created_at", { ascending: false })
      .limit(10);
    setRecentDispatches((data as unknown as RecentDispatchItem[]) || []);
  }

  async function loadInitialData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data: coData } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
      if (coData) setCompany(coData);

      const [mats, prjRes] = await Promise.all([
        getMaterialsList(companyId),
        supabase.from("projects").select("id, name, project_number").eq("company_id", companyId).order("name"),
      ]);

      setMaterials(mats);
      setProjects(prjRes.data || []);

      if (initialProductId) {
        const found = mats.find((m) => m.id === initialProductId);
        if (found) selectMaterial(found);
      }

      await loadRecentDispatches(companyId);
    } catch (err) {
      console.error("Error loading stock out data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInitialData();
  }, []);

  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);
  const fabricWidth = selectedMaterial?.fabric_width || 3.0;
  const isFabric = selectedMaterial?.is_fabric ?? true;
  const availableStock = selectedMaterial?.current_stock || 0;

  function selectMaterial(mat: MaterialItem) {
    setSelectedMaterialId(mat.id);
    if (mat.cost_price > 0) {
      setUnitCost(mat.cost_price.toString());
    }
    // If running metres is entered, recalculate square metres
    if (runningMetresUsed && mat.fabric_width > 0) {
      const rm = parseFloat(runningMetresUsed);
      if (!isNaN(rm)) {
        setSquareMetresUsed(calculateSqmFromRm(mat.fabric_width, rm).toString());
      }
    }
  }

  function handleRmChange(rmStr: string) {
    setRunningMetresUsed(rmStr);
    const rm = parseFloat(rmStr);
    if (!isNaN(rm) && rm >= 0 && fabricWidth > 0) {
      setSquareMetresUsed(calculateSqmFromRm(fabricWidth, rm).toString());
    } else {
      setSquareMetresUsed("");
    }
  }

  function handleSqmChange(sqmStr: string) {
    setSquareMetresUsed(sqmStr);
    const sqm = parseFloat(sqmStr);
    if (!isNaN(sqm) && sqm >= 0 && fabricWidth > 0) {
      setRunningMetresUsed(calculateRmFromSqm(fabricWidth, sqm).toString());
    } else {
      setRunningMetresUsed("");
    }
  }

  // Calculations
  const parsedRm = parseFloat(runningMetresUsed) || 0;
  const parsedSqm = parseFloat(squareMetresUsed) || (isFabric ? calculateSqmFromRm(fabricWidth, parsedRm) : parsedRm);
  const parsedWastage = parseFloat(wastageQuantity) || 0;
  const totalStockReduction = roundDecimal(parsedSqm + parsedWastage, 3);
  const remainingStock = roundDecimal(availableStock - totalStockReduction, 3);
  const parsedCost = parseFloat(unitCost) || selectedMaterial?.cost_price || 0;
  const totalMaterialCost = roundDecimal(totalStockReduction * parsedCost, 2);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedMaterialId) {
      setErrorMsg("Please select a material to issue.");
      return;
    }

    if (totalStockReduction <= 0) {
      setErrorMsg("Please enter consumed quantity greater than zero.");
      return;
    }

    if (totalStockReduction > availableStock) {
      setErrorMsg(
        `Insufficient stock: Total reduction of ${totalStockReduction} ${selectedMaterial?.unit || "m²"} exceeds available stock (${availableStock} ${selectedMaterial?.unit || "m²"}). Negative stock prevented.`
      );
      return;
    }

    if (!customer.customer_name?.trim()) {
      setErrorMsg("Please specify the Customer or Material Recipient (or select Workshop Usage).");
      return;
    }

    setSubmitting(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Active company session not found.");

      const payload: StockOutPayload = {
        company_id: companyId,
        material_id: selectedMaterialId,
        dispatch_date: dispatchDate,
        customer,
        project_id: selectedProjectId || undefined,
        project_name: selectedProject ? `${selectedProject.project_number} — ${selectedProject.name}` : undefined,
        purpose,
        running_metres_used: parsedRm,
        square_metres_used: parsedSqm,
        wastage_quantity: parsedWastage,
        unit_cost: parsedCost,
        total_material_cost: totalMaterialCost,
        warehouse,
        issued_by: issuedBy.trim() || "Storekeeper",
        received_by: receivedBy.trim() || undefined,
        reference_number: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const result = await executeStockOut(payload);

      setSuccessMsg(
        `✓ Material successfully issued! MIN: ${result.docNumber}. Remaining Stock: ${result.newStock} ${selectedMaterial?.unit || "m²"}.`
      );

      // Prepare print data
      const printDoc: MaterialIssueNoteData = {
        document_number: result.docNumber,
        issue_date: dispatchDate,
        customer_name: customer.customer_name,
        customer_type: customer.type,
        project_name: selectedProject ? `${selectedProject.project_number} — ${selectedProject.name}` : undefined,
        purpose,
        warehouse,
        issued_by: issuedBy,
        received_by: receivedBy.trim() || undefined,
        items: [
          {
            material_name: selectedMaterial?.name || "Material",
            brand: selectedMaterial?.brand || "Fabric",
            specification: selectedMaterial?.specification || undefined,
            width: fabricWidth,
            running_metres_used: parsedRm,
            square_metres_used: parsedSqm,
            wastage_quantity: parsedWastage,
            total_deduction: totalStockReduction,
            unit_cost: parsedCost,
            total_cost: totalMaterialCost,
          },
        ],
        total_square_metres: parsedSqm,
        total_running_metres: parsedRm,
        total_wastage: parsedWastage,
        total_deduction: totalStockReduction,
        total_material_cost: totalMaterialCost,
        notes: notes.trim() || undefined,
      };
      setPrintMinData(printDoc);

      // Reset quantities
      setRunningMetresUsed("");
      setSquareMetresUsed("");
      setWastageQuantity("0");
      setReferenceNumber("");
      setNotes("");

      // Refresh data
      const mats = await getMaterialsList(companyId);
      setMaterials(mats);
      await loadRecentDispatches(companyId);
    } catch (err: unknown) {
      console.error("Stock Out submission error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to confirm material dispatch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ArrowUpRight size={20} />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Material Used / Stock Out (MIN)</h1>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Record fabric consumption, cutting wastage, and material issuance to customers, projects, or workshop
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inventory/customer-usage"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-semibold shadow-sm transition-colors"
          >
            Customer Usage Report
          </Link>
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <History size={15} /> Movements Ledger
          </Link>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold">{successMsg}</span>
          </div>
          {printMinData && (
            <button
              type="button"
              onClick={() => {}}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 self-start sm:self-auto"
            >
              <Printer size={14} /> Print Material Issue Note (MIN)
            </button>
          )}
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2.5 text-sm">
          <AlertCircle size={18} className="shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Form + Live Stock Reduction Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form (2 Cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
          {/* Section 1: Material Selection */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-3">
              <Package size={17} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                1. Select Material &amp; Specification to Dispatch
              </h3>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Material Item <span className="text-rose-400">*</span>
              </label>
              <select
                required
                value={selectedMaterialId}
                onChange={(e) => {
                  const m = materials.find((item) => item.id === e.target.value);
                  if (m) selectMaterial(m);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Select Material to Dispatch --</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} | Available: {m.current_stock} {m.unit} {m.fabric_width ? `(${m.fabric_width}m width)` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedMaterial && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Brand</span>
                  <span className="font-bold text-white">{selectedMaterial.brand}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Fabric Width</span>
                  <span className="font-bold text-sky-400 font-mono">
                    {selectedMaterial.fabric_width > 0 ? `${selectedMaterial.fabric_width} m` : "Standard"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Available Stock</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {availableStock} {selectedMaterial.unit}
                    {selectedMaterial.is_fabric && (
                      <span className="text-[10px] text-slate-400 block font-normal">
                        ≈ {selectedMaterial.running_metres_available} RM
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Inventory Cost Rate</span>
                  <span className="font-bold text-slate-300 font-mono">
                    AED {fmtAED(selectedMaterial.cost_price)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: CUSTOMER / FOR WHOM (Option A, B, C) */}
          <CustomerForWhomSelector value={customer} onChange={setCustomer} required />

          {/* Section 3: Usage Purpose & Project Linkage */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sky-400 border-b border-slate-800 pb-3">
              <Briefcase size={17} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                2. Project Linkage &amp; Purpose of Usage
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Link to Project / Job (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  <option value="">-- General / Non-Project Usage --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_number} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Purpose of Usage</label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  {USAGE_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Section 4: Material Quantities, Wastage & Costing */}
          <section className="rounded-xl border border-amber-500/30 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-3">
              <Scissors size={17} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                3. Quantities Used, Cutting Wastage &amp; Stock Deduction
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Running Metres Used (m)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={runningMetresUsed}
                  onChange={(e) => handleRmChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-blue-400 block mb-1">
                  Net Used Area (m²) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  placeholder="0.000"
                  value={squareMetresUsed}
                  onChange={(e) => handleSqmChange(e.target.value)}
                  className="w-full rounded-lg border border-blue-500/50 bg-slate-950 px-3 py-2 text-sm font-mono font-bold text-blue-300 focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-amber-400 block mb-1">
                  Cutting Wastage (m²)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={wastageQuantity}
                  onChange={(e) => setWastageQuantity(e.target.value)}
                  className="w-full rounded-lg border border-amber-500/50 bg-slate-950 px-3 py-2 text-sm font-mono text-amber-300 focus:border-amber-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400">Recorded separately for waste tracking</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Material Cost Rate (AED / m²)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Total Material Cost (AED)
                </label>
                <div className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono font-bold text-amber-300">
                  AED {fmtAED(totalMaterialCost)}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Dispatching Warehouse</label>
                <select
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  {WAREHOUSE_LOCATIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Issued By Staff <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Received By (Site Rep / Supervisor)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Foreman Ali"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Dispatch Ref / MIN Number
                </label>
                <input
                  type="text"
                  placeholder="Auto MIN-XXXX"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Cutting Instructions / Dispatch Notes
              </label>
              <textarea
                rows={2}
                placeholder="Specific roll numbers, cut panels, overlap allowances..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>
          </section>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/inventory"
              className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || totalStockReduction > availableStock}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-lg shadow-amber-950"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Confirming Stock Out...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm Material Used (Stock Out)
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Column: Real-Time Stock Impact Preview Card (Part 5 Example Spec) */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl space-y-4 sticky top-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <span className="p-1 rounded bg-amber-500/10 text-amber-400">
                <Scissors size={16} />
              </span>
              <h3 className="font-bold text-white text-sm">Stock Reduction Impact</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Material:</span>
                <span className="font-bold text-white text-right truncate max-w-[180px]">
                  {selectedMaterial?.name || "None Selected"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Fabric Width:</span>
                <span className="font-mono font-semibold text-sky-400">
                  {selectedMaterial?.fabric_width ? `${selectedMaterial.fabric_width} m` : "—"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Available Stock:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {availableStock} {selectedMaterial?.unit || "m²"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Running Metres Used:</span>
                <span className="font-mono font-semibold text-white">
                  {parsedRm > 0 ? `${parsedRm.toFixed(2)} m` : "0.00 m"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 bg-blue-950/30 px-2 rounded border border-blue-500/20">
                <span className="text-blue-300 font-semibold">Net Used Area:</span>
                <span className="font-mono font-bold text-blue-400 text-sm">
                  {parsedSqm.toFixed(2)} m²
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 bg-amber-950/30 px-2 rounded border border-amber-500/20">
                <span className="text-amber-300 font-semibold">Cutting Wastage:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {parsedWastage.toFixed(2)} m²
                </span>
              </div>

              <div className="flex justify-between items-center py-2 bg-rose-950/30 px-2 rounded border border-rose-500/30">
                <span className="text-rose-300 font-bold">Total Stock Reduction:</span>
                <span className="font-mono font-extrabold text-rose-400 text-base">
                  -{totalStockReduction.toFixed(2)} m²
                </span>
              </div>

              {/* Exact Formula Remaining Stock Preview */}
              <div
                className={`flex justify-between items-center py-2.5 px-3 rounded-lg border font-mono ${
                  remainingStock < 0
                    ? "bg-rose-950/80 border-rose-500 text-rose-300"
                    : remainingStock <= (selectedMaterial?.minimum_stock || 0)
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                    : "bg-slate-950 border-emerald-500/30 text-emerald-400"
                }`}
              >
                <div>
                  <span className="font-sans text-[11px] block uppercase font-bold text-slate-400">
                    Remaining Stock Balance
                  </span>
                  <span className="text-lg font-black">{remainingStock.toFixed(2)} {selectedMaterial?.unit || "m²"}</span>
                </div>
                {selectedMaterial?.is_fabric && fabricWidth > 0 && remainingStock >= 0 && (
                  <span className="text-xs text-slate-400">
                    ≈ {(remainingStock / fabricWidth).toFixed(1)} RM
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>Customer: <strong className="text-slate-200">{customer.customer_name}</strong></div>
                {selectedProject && (
                  <div>Project: <strong className="text-sky-300">{selectedProject.name}</strong></div>
                )}
                <div>Total Cost: <strong className="text-amber-300">AED {fmtAED(totalMaterialCost)}</strong></div>
              </div>
            </div>
          </div>

          {/* Recent Dispatches */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <History size={14} className="text-amber-400" /> Recent Material Issues
            </h4>

            {recentDispatches.length === 0 ? (
              <p className="text-xs text-slate-500">No recent dispatch history found.</p>
            ) : (
              <div className="space-y-2">
                {recentDispatches.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-slate-200 truncate max-w-[160px]">{m.products?.name}</p>
                      <p className="text-[10px] text-slate-500">{fmtDate(m.created_at)} • {m.reference_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-rose-400">-{m.quantity} {m.products?.unit || "m²"}</p>
                      <p className="text-[10px] font-mono text-slate-400">AED {fmtAED(m.unit_cost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print Material Issue Note (MIN) Modal */}
      {printMinData && (
        <PrintModal isOpen={Boolean(printMinData)} onClose={() => setPrintMinData(null)}>
          <MaterialIssueNoteTemplate
            company={company}
            data={printMinData}
            onClose={() => setPrintMinData(null)}
          />
        </PrintModal>
      )}
    </div>
  );
}

export default function StockOutPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="animate-spin text-amber-400" size={20} /> Loading stock out module...
        </div>
      }
    >
      <StockOutForm />
    </Suspense>
  );
}
