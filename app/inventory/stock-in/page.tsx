"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, generateDocNumber, todayISO, fmtAED, fmtDate } from "@/lib/helpers";
import {
  ArrowDownRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  History,
  Package,
  Plus,
  Printer,
  Ruler,
  Layers,
  Building2,
  Calendar,
  AlertCircle,
  Hash,
  Warehouse,
} from "lucide-react";
import {
  getMaterialsList,
  executeStockIn,
  calculateSqmFromRm,
  calculateRmFromSqm,
  calculateFromRolls,
  calculateTotalCost,
  roundDecimal,
  WAREHOUSE_LOCATIONS,
  type MaterialItem,
  type StockInPayload,
} from "@/lib/materialInventory";
import QuickAddMaterialModal from "@/components/inventory/QuickAddMaterialModal";
import PrintModal from "@/components/documents/PrintModal";
import GoodsReceiptNoteTemplate, { GoodsReceiptNoteData } from "@/components/documents/GoodsReceiptNoteTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

function StockInForm() {
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("productId") || "";

  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedMaterialId, setSelectedMaterialId] = useState(initialProductId);
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [supplierName, setSupplierName] = useState("");
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState("");
  const [purchaseOrderRef, setPurchaseOrderRef] = useState("");
  const [warehouse, setWarehouse] = useState<string>(WAREHOUSE_LOCATIONS[0]);
  const [batchRollRef, setBatchRollRef] = useState("");
  const [notes, setNotes] = useState("");

  // Dimension / Quantity State
  const [inputMode, setInputMode] = useState<"rm" | "sqm" | "rolls">("rm");
  const [rollsCount, setRollsCount] = useState("");
  const [lengthPerRoll, setLengthPerRoll] = useState("50");
  const [runningMetres, setRunningMetres] = useState("");
  const [squareMetres, setSquareMetres] = useState("");

  // Rate & Cost State
  const [purchaseRate, setPurchaseRate] = useState("");
  const [rateUnit, setRateUnit] = useState<"per_sqm" | "per_rm" | "per_roll" | "per_unit">("per_sqm");

  // Modal State
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Print GRN State
  const [printGrnData, setPrintGrnData] = useState<GoodsReceiptNoteData | null>(null);
  interface RecentMovementItem {
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
  const [recentMovements, setRecentMovements] = useState<RecentMovementItem[]>([]);

  async function loadRecentMovements(companyId: string) {
    const { data } = await supabase
      .from("stock_movements")
      .select("id, created_at, quantity, previous_stock, new_stock, unit_cost, reference_type, reference_number, notes, products(name, sku, unit, category)")
      .eq("company_id", companyId)
      .eq("movement_type", "IN")
      .order("created_at", { ascending: false })
      .limit(8);
    setRecentMovements((data as unknown as RecentMovementItem[]) || []);
  }

  async function loadInitialData() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const { data: coData } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
      if (coData) setCompany(coData);

      const mats = await getMaterialsList(companyId);
      setMaterials(mats);

      if (initialProductId) {
        const found = mats.find((m) => m.id === initialProductId);
        if (found) selectMaterial(found);
      }

      await loadRecentMovements(companyId);
    } catch (err) {
      console.error("Error loading stock in data:", err);
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

  function selectMaterial(mat: MaterialItem) {
    setSelectedMaterialId(mat.id);
    if (mat.cost_price > 0) {
      setPurchaseRate(mat.cost_price.toString());
    }
    if (mat.supplier_name) {
      setSupplierName(mat.supplier_name);
    }
    if (mat.roll_length > 0) {
      setLengthPerRoll(mat.roll_length.toString());
    }
    // Set appropriate rate unit
    if (mat.is_fabric) {
      setRateUnit("per_sqm");
    } else {
      setRateUnit("per_unit");
    }
  }

  // Dual-Direction Quantity Handlers
  function handleRunningMetresChange(valStr: string) {
    setRunningMetres(valStr);
    const rm = parseFloat(valStr);
    if (!isNaN(rm) && rm >= 0 && fabricWidth > 0) {
      setSquareMetres(calculateSqmFromRm(fabricWidth, rm).toString());
    } else {
      setSquareMetres("");
    }
  }

  function handleSquareMetresChange(valStr: string) {
    setSquareMetres(valStr);
    const sqm = parseFloat(valStr);
    if (!isNaN(sqm) && sqm >= 0 && fabricWidth > 0) {
      setRunningMetres(calculateRmFromSqm(fabricWidth, sqm).toString());
    } else {
      setRunningMetres("");
    }
  }

  function handleRollsChange(rollsStr: string, lenStr: string) {
    setRollsCount(rollsStr);
    setLengthPerRoll(lenStr);
    const rolls = parseFloat(rollsStr);
    const len = parseFloat(lenStr);
    if (!isNaN(rolls) && !isNaN(len) && rolls >= 0 && len >= 0) {
      const calc = calculateFromRolls(rolls, len, fabricWidth);
      setRunningMetres(calc.totalRunningMetres.toString());
      setSquareMetres(calc.totalSquareMetres.toString());
    }
  }

  // Live Calculated Values
  const parsedRm = parseFloat(runningMetres) || 0;
  const parsedSqm = parseFloat(squareMetres) || (isFabric ? calculateSqmFromRm(fabricWidth, parsedRm) : parsedRm);
  const parsedRate = parseFloat(purchaseRate) || 0;
  const parsedRolls = parseFloat(rollsCount) || 0;

  const totalCalculatedCost = calculateTotalCost(parsedRate, rateUnit, {
    squareMetres: parsedSqm,
    runningMetres: parsedRm,
    rollsCount: parsedRolls,
    unitsCount: parsedSqm,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedMaterialId) {
      setErrorMsg("Please select a material or add a new material master.");
      return;
    }

    if (parsedSqm <= 0 && parsedRm <= 0) {
      setErrorMsg("Please enter received quantity greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Active company session not found.");

      const payload: StockInPayload = {
        company_id: companyId,
        material_id: selectedMaterialId,
        receipt_date: receiptDate,
        supplier_name: supplierName.trim() || undefined,
        purchase_order_ref: purchaseOrderRef.trim() || undefined,
        supplier_invoice_ref: supplierInvoiceRef.trim() || undefined,
        rolls_count: parsedRolls > 0 ? parsedRolls : undefined,
        length_per_roll: parseFloat(lengthPerRoll) || undefined,
        running_metres: parsedRm,
        square_metres: parsedSqm,
        purchase_rate: parsedRate,
        rate_unit: rateUnit,
        total_cost: totalCalculatedCost,
        warehouse,
        batch_number: batchRollRef.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const result = await executeStockIn(payload);

      setSuccessMsg(
        `✓ Stock In confirmed successfully! GRN: ${result.docNumber}. New balance: ${result.newStock} ${selectedMaterial?.unit || "m²"}.`
      );

      // Prepare print data
      const printDoc: GoodsReceiptNoteData = {
        document_number: result.docNumber,
        receipt_date: receiptDate,
        supplier_name: supplierName.trim() || selectedMaterial?.supplier_name || "Direct Supplier",
        supplier_invoice_ref: supplierInvoiceRef.trim() || undefined,
        purchase_order_ref: purchaseOrderRef.trim() || undefined,
        warehouse,
        received_by: "Storekeeper",
        items: [
          {
            material_name: selectedMaterial?.name || "Material",
            brand: selectedMaterial?.brand || "Fabric",
            specification: selectedMaterial?.specification || undefined,
            width: fabricWidth,
            colour: selectedMaterial?.colour || undefined,
            rolls_count: parsedRolls > 0 ? parsedRolls : undefined,
            running_metres: parsedRm,
            square_metres: parsedSqm,
            unit_rate: parsedRate,
            rate_unit: rateUnit,
            total_cost: totalCalculatedCost,
            batch_roll_ref: batchRollRef.trim() || undefined,
          },
        ],
        total_square_metres: parsedSqm,
        total_running_metres: parsedRm,
        total_cost: totalCalculatedCost,
        notes: notes.trim() || undefined,
      };
      setPrintGrnData(printDoc);

      // Reset quantities
      setRunningMetres("");
      setSquareMetres("");
      setRollsCount("");
      setSupplierInvoiceRef("");
      setBatchRollRef("");
      setNotes("");

      // Refresh list & movements
      const mats = await getMaterialsList(companyId);
      setMaterials(mats);
      await loadRecentMovements(companyId);
    } catch (err: unknown) {
      console.error("Stock In submission error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to confirm stock in.");
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
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ArrowDownRight size={20} />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Stock In / Goods Receipt (GRN)</h1>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Receive fabrics, tarpaulins, hardware, and raw materials into warehouse with dual-unit tracking (RM &amp; m²)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQuickAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={15} /> Add New Material Master
          </button>
          <Link
            href="/inventory/movements"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <History size={15} /> Stock Ledger
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
          {printGrnData && (
            <button
              type="button"
              onClick={() => {}}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 self-start sm:self-auto"
            >
              <Printer size={14} /> Print Goods Receipt Note (GRN)
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

      {/* Main Grid: Form + Live Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form (2 Cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
          {/* Section 1: Material Selection */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Package size={17} />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  1. Material &amp; Specification Selection
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
              >
                <Plus size={13} /> Quick-Add Brand / Material
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Select Inventory Material <span className="text-rose-400">*</span>
              </label>
              <select
                required
                value={selectedMaterialId}
                onChange={(e) => {
                  const m = materials.find((item) => item.id === e.target.value);
                  if (m) selectMaterial(m);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Choose Material (Korean, German, Tarpaulin, Hardware...) --</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} | Brand: {m.brand} {m.fabric_width ? `(${m.fabric_width}m Width)` : ""} [In Stock: {m.current_stock} {m.unit}]
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
                  <span className="text-[10px] text-slate-500 uppercase block">Width &amp; Specs</span>
                  <span className="font-bold text-white">
                    {selectedMaterial.fabric_width > 0 ? `${selectedMaterial.fabric_width} m Width` : "Standard"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Current Stock</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {selectedMaterial.current_stock} {selectedMaterial.unit}
                    {selectedMaterial.is_fabric && (
                      <span className="text-[10px] text-slate-400 block">
                        ≈ {selectedMaterial.running_metres_available} RM
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Last Cost Rate</span>
                  <span className="font-bold text-slate-300 font-mono">
                    AED {fmtAED(selectedMaterial.cost_price)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Quantities, Rolls & Square Metre Calculator */}
          <section className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400">
                <Ruler size={17} />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  2. Received Quantities &amp; Automatic Area Calculator
                </h3>
              </div>

              {/* Input Mode Selector */}
              <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setInputMode("rm")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    inputMode === "rm" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Running Metres
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("sqm")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    inputMode === "sqm" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Square Metres
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("rolls")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    inputMode === "rolls" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Rolls Count
                </button>
              </div>
            </div>

            {/* Rolls Input Sub-card */}
            {inputMode === "rolls" && (
              <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Number of Rolls Received</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g. 4"
                    value={rollsCount}
                    onChange={(e) => handleRollsChange(e.target.value, lengthPerRoll)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Standard Length Per Roll (Metres)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    placeholder="e.g. 50"
                    value={lengthPerRoll}
                    onChange={(e) => handleRollsChange(rollsCount, e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Running Metres and Square Metres Side-by-Side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Running Metres Received (m)
                  </label>
                  <span className="text-[10px] text-slate-400">Cutting length</span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  placeholder="0.000"
                  value={runningMetres}
                  onChange={(e) => handleRunningMetresChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-emerald-400">
                    Square Metres Received (m²) <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono">Primary Inventory Unit</span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  placeholder="0.000"
                  value={squareMetres}
                  onChange={(e) => handleSquareMetresChange(e.target.value)}
                  className="w-full rounded-lg border border-emerald-500/50 bg-slate-950 px-3 py-2.5 text-sm font-mono text-emerald-300 font-bold focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Live Calculation Info Box */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-sky-400">📐 Calculation Basis:</span>
                <span>Fabric Width: <strong>{fabricWidth} m</strong></span>
                <span>× Running Metres: <strong>{parsedRm} m</strong></span>
              </span>
              <span className="font-bold text-emerald-400 text-sm font-mono">
                = {parsedSqm.toFixed(3)} m² Area
              </span>
            </div>
          </section>

          {/* Section 3: Costing, Supplier & Warehouse */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-3">
              <Building2 size={17} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                3. Purchase Cost, Supplier Reference &amp; Warehouse
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Purchase Rate (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Rate Unit</label>
                <select
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value as "per_sqm" | "per_rm" | "per_roll" | "per_unit")}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="per_sqm">Per Square Metre (m²)</option>
                  <option value="per_rm">Per Running Metre (m)</option>
                  <option value="per_roll">Per Full Roll</option>
                  <option value="per_unit">Per Piece / Unit</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Total Purchase Cost</label>
                <div className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-mono font-bold text-amber-300">
                  AED {fmtAED(totalCalculatedCost)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Supplier / Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mahler Importer L.L.C"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Supplier Invoice / GRN Ref <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-9982 or Auto GRN"
                  value={supplierInvoiceRef}
                  onChange={(e) => setSupplierInvoiceRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Warehouse Location</label>
                <select
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  {WAREHOUSE_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Batch / Roll Lot Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. LOT-2026-B81 / Roll #14-18"
                  value={batchRollRef}
                  onChange={(e) => setBatchRollRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Receipt Date</label>
                <input
                  type="date"
                  required
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Receipt Remarks / Inspection Notes
              </label>
              <textarea
                rows={2}
                placeholder="Physical quality, packing condition, visual inspection remarks..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none resize-none"
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
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-950"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Confirming Stock In...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm Goods Receipt (Stock In)
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Column: Live Pre-Confirmation Summary Card (1 Col) */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl space-y-4 sticky top-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <span className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 size={16} />
              </span>
              <h3 className="font-bold text-white text-sm">Live Receipt Summary</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Material:</span>
                <span className="font-bold text-white text-right truncate max-w-[180px]">
                  {selectedMaterial?.name || "None Selected"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Brand:</span>
                <span className="font-semibold text-slate-200">{selectedMaterial?.brand || "—"}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Fabric Width:</span>
                <span className="font-mono font-semibold text-sky-400">
                  {selectedMaterial?.fabric_width ? `${selectedMaterial.fabric_width} m` : "—"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Running Metres:</span>
                <span className="font-mono font-bold text-white">
                  {parsedRm > 0 ? `${parsedRm.toFixed(2)} m` : "0.00 m"}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 bg-emerald-950/30 px-2 rounded border border-emerald-500/20">
                <span className="text-emerald-300 font-bold">Received Area (m²):</span>
                <span className="font-mono font-extrabold text-emerald-400 text-base">
                  {parsedSqm.toFixed(2)} m²
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Unit Purchase Rate:</span>
                <span className="font-mono text-slate-200">
                  AED {fmtAED(parsedRate)} /{rateUnit.replace("per_", "")}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 bg-slate-950 px-2 rounded border border-amber-500/20">
                <span className="text-amber-400 font-bold">Total Cost:</span>
                <span className="font-mono font-extrabold text-amber-300 text-base">
                  AED {fmtAED(totalCalculatedCost)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Warehouse:</span>
                <span className="text-slate-200 font-medium truncate max-w-[160px]">{warehouse}</span>
              </div>

              {selectedMaterial && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400 block mb-1">Projected Stock Balance:</span>
                  <div className="flex items-center justify-between text-xs p-2 rounded bg-slate-950">
                    <span className="text-slate-400">
                      {selectedMaterial.current_stock} {selectedMaterial.unit}
                    </span>
                    <span className="text-slate-500">➜</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {roundDecimal(selectedMaterial.current_stock + parsedSqm, 3)} {selectedMaterial.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent Stock In Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <History size={14} className="text-sky-400" /> Recent Goods Receipts
            </h4>

            {recentMovements.length === 0 ? (
              <p className="text-xs text-slate-500">No stock in history found.</p>
            ) : (
              <div className="space-y-2">
                {recentMovements.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-slate-200 truncate max-w-[160px]">{m.products?.name}</p>
                      <p className="text-[10px] text-slate-500">{fmtDate(m.created_at)} • {m.reference_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-emerald-400">+{m.quantity} {m.products?.unit || "m²"}</p>
                      <p className="text-[10px] font-mono text-slate-400">AED {fmtAED(m.unit_cost)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Material Modal */}
      <QuickAddMaterialModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        onMaterialCreated={(newMat) => {
          setMaterials((prev) => [newMat, ...prev]);
          selectMaterial(newMat);
        }}
      />

      {/* Print Goods Receipt Note (GRN) Modal */}
      {printGrnData && (() => {
        const docFile = generateDocumentPdfFilename({
          documentType: "goods_receipt_note",
          documentNumber: printGrnData.document_number || "GRN",
          supplierName: printGrnData.supplier_name,
          items: printGrnData.items?.map((it) => ({ description: it.material_name })),
          workDescription: "Goods Receipt Note",
        });
        return (
          <PrintModal
            isOpen={Boolean(printGrnData)}
            onClose={() => setPrintGrnData(null)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <GoodsReceiptNoteTemplate
              company={company}
              data={printGrnData}
              onClose={() => setPrintGrnData(null)}
            />
          </PrintModal>
        );
      })()}
    </div>
  );
}

export default function StockInPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="animate-spin text-emerald-400" size={20} /> Loading stock in module...
        </div>
      }
    >
      <StockInForm />
    </Suspense>
  );
}
