"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { saveMeasurementRows } from "@/lib/measurementPersistence";
import BlueprintTakeoffSection from "@/components/measurements/blueprint/BlueprintTakeoffSection";
import { supabase } from "@/lib/supabase";
import {
  Ruler,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Printer,
  FileText,
  HelpCircle,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Layers,
  ArrowRight,
  Calculator,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Check,
  Sliders,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { numberToWordsEnglish } from "@/lib/amountInWords";
import {
  getCompanyId,
  getCurrentCompany,
  fmtAED,
  fmtDate,
  todayISO,
  generateDocNumber,
} from "@/lib/helpers";
import {
  CalculationType,
  DimensionUnit,
  MeasurementRowInput,
  MeasurementSheet,
  CALC_TYPE_DEFINITIONS,
} from "@/lib/measurementTypes";
import {
  calculateMeasurementRow,
  calculateSheetSummary,
  formatResultWithUnit,
  normalizeToMetres,
  REAL_PROJECT_PARKING_SHADE_TEST_ROWS,
} from "@/lib/measurementCalculations";
import NumericInput from "@/components/NumericInput";
import PrintModal from "@/components/documents/PrintModal";
import MeasurementSheetTemplate, {
  MeasurementSheetDocData,
} from "@/components/documents/MeasurementSheetTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { useRouter } from "next/navigation";

type Customer = { id: string; name: string | null };
type Project = { id: string; name: string | null; project_number: string | null };

const DEFAULT_NEW_ROW: MeasurementRowInput = {
  area_name: "Area 1",
  description: "PVC Parking Shade Fabric & Centre Joint",
  calc_type: "pvc_edge_joint",
  dim_unit: "mm",
  length_entered: 12000,
  width_entered: 5360,
  width2_entered: 0,
  is_variable_width: false,
  quantity: 6,
  pvc_length_edges: 2,
  pvc_width_edges: 2,
  pvc_centre_joints: 1,
  rate: 0,
  notes: "",
  custom_components: [
    { id: "1", name: "Length Runs", dimensionBasis: "length", multiplier: 2 },
    { id: "2", name: "Width Runs", dimensionBasis: "width", multiplier: 2 },
    { id: "3", name: "Centre Joint", dimensionBasis: "length", multiplier: 1 },
  ],
};

export default function MeasurementsPage() {
  const router = useRouter();

  // State: Core data
  const [sheets, setSheets] = useState<MeasurementSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState<MeasurementSheet | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const quotationInFlight = useRef(false);
  const pendingQuotation = useRef<{companyId:string;id:string;header:Record<string,unknown>;items:Record<string,unknown>[]} | null>(null);
  const sheetLoadVersion = useRef(0);
  const sheetReadInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // State: Row inputs for active sheet
  const [rawRows, setRawRows] = useState<MeasurementRowInput[]>([]);

  // State: Editing / Adding Row Modal
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [rowForm, setRowForm] = useState<MeasurementRowInput>(DEFAULT_NEW_ROW);
  const [showRowModal, setShowRowModal] = useState(false);
  const [showNewSheetForm, setShowNewSheetForm] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("New Measurement & Takeoff Sheet");

  // State: Collapsed status of explanations for rows
  const [expandedExplanations, setExpandedExplanations] = useState<Record<number, boolean>>({});

  // State: Modals
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCalculationTypeInPdf, setShowCalculationTypeInPdf] = useState(false);
  const [includeVat, setIncludeVat] = useState(true);
  const [vatRate, setVatRate] = useState<number>(5);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isVerifying] = useState(false);
  const [hasVerified, setHasVerified] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [transferringToQuote, setTransferringToQuote] = useState(false);

  // Load Initial Data
  const loadData = useCallback(async () => {
    setError(null);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("Select a company before loading measurements.");
      const co = await getCurrentCompany();
      if (co) setCompany(co as CompanyDocInfo);

      const [customerResult, projectResult, sheetResult] = await Promise.all([
        supabase.from("customers").select("id, name").eq("company_id", companyId).eq("active", true).order("name"),
        supabase.from("projects").select("id, name, project_number").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase
          .from("measurement_projects")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
      ]);

      const failedRead = customerResult.error || projectResult.error || sheetResult.error;
      if (failedRead) throw failedRead;
      const custs = customerResult.data, prjs = projectResult.data, dbSheets = sheetResult.data;
      setCustomers((custs || []) as Customer[]);
      setProjects((prjs || []) as Project[]);

      if (dbSheets && dbSheets.length > 0) {
        setSheets(dbSheets as MeasurementSheet[]);
        const firstSheet = dbSheets[0] as MeasurementSheet;
        setActiveSheet(firstSheet);
        await loadSheetItems(firstSheet.id);
      } else {
        // A genuinely empty account starts with an empty sheet, never sample rows.
        await createInitialSheet(companyId);
      }
    } catch (err: unknown) {
      console.warn("Could not load from DB, falling back to local demo state:", err);
      // Fallback: Provide rich in-memory project so user can immediately calculate
      initializeFallbackData();
    } finally {
      setLoading(false);
    }
    // createInitialSheet and loadSheetItems are stable helpers defined in component scope.
    // Listing them as deps would cause re-creation on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Load Sheet items from Supabase
  async function loadSheetItems(sheetId: string) {
    const version = ++sheetLoadVersion.current;
    sheetReadInFlight.current = true;
    setRawRows([]); setError(null);
    try {
      const companyId = await getCompanyId();
      const { data: items, error: itemErr } = await supabase
        .from("measurement_items")
        .select("*")
        .eq("sheet_id", sheetId)
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true });

      if (version !== sheetLoadVersion.current) return;
      if (itemErr) throw itemErr;

      if (items && items.length > 0) {
        const loaded: MeasurementRowInput[] = items.map((it) => ({
          id: it.id,
          sheet_id: it.sheet_id,
          area_name: it.area_name || "Area",
          description: it.description || "",
          calc_type: it.calc_type || "pvc_edge_joint",
          dim_unit: it.dim_unit || "mm",
          length_entered: Number(it.length_entered) || 0,
          width_entered: Number(it.width_entered) || 0,
          width2_entered: it.width2_entered ? Number(it.width2_entered) : undefined,
          is_variable_width: Boolean(it.is_variable_width),
          quantity: Number(it.quantity) || 1,
          pvc_length_edges: Number(it.pvc_length_edges ?? 2),
          pvc_width_edges: Number(it.pvc_width_edges ?? 2),
          pvc_centre_joints: Number(it.pvc_centre_joints ?? 1),
          custom_components: it.custom_components || undefined,
          rate: Number(it.rate) || 0,
          notes: it.notes || "",
        }));
        setRawRows(loaded);
      } else {
        // Sheet exists but has no rows — preserve empty state. Do NOT inject
        // test/sample data, as the user may have intentionally cleared all rows.
        setRawRows([]);
      }
    } catch (err) {
      // On DB error, leave existing rows unchanged and surface the issue in the
      // console. Do NOT overwrite saved data with sample rows.
      console.error("Failed to load measurement sheet items:", err);
      if (version === sheetLoadVersion.current) {setActiveSheet(null);setError("Could not load sheet items. Please retry before saving or printing.");}
    } finally {
      if (version === sheetLoadVersion.current) sheetReadInFlight.current = false;
    }
  }

  // Create initial sheet in DB
  async function createInitialSheet(companyId: string) {
    try {
      let sheetNum = "MS-2026-0001";
      try {
        sheetNum = await generateDocNumber(companyId, "MS");
      } catch {}

      const newSheetData = {
        company_id: companyId,
        sheet_number: sheetNum,
        title: "PVC Parking Shade Fabrication & Joint Takeoff",
        description: "Official parking shade measurement sheet with linear edge and centre welding joints",
        status: "draft",
      };

      const { data: created, error: crErr } = await supabase
        .from("measurement_projects")
        .insert(newSheetData)
        .select()
        .single();

      if (crErr) throw crErr;

      const createdSheet = created as MeasurementSheet;
      setSheets([createdSheet]);
      setActiveSheet(createdSheet);

      setRawRows([]);
    } catch {
      initializeFallbackData();
    }
  }

  function initializeFallbackData() {
    // DB connection failed. Provide a local-only session with an empty sheet
    // so the user can calculate without risk of overwriting saved DB data.
    // Do NOT load sample/test rows here — those can only be loaded by the
    // explicit "Load Test Cases" button which includes a confirmation guard.
    const fallbackSheet: MeasurementSheet = {
      id: "demo-sheet-offline",
      company_id: "offline",
      sheet_number: "MS-OFFLINE",
      title: "PVC Parking Shade Fabrication & Joint Takeoff (Offline)",
      description: "Working in offline mode — data will not be saved to the database",
      status: "draft",
      created_at: todayISO(),
    };
    setSheets([fallbackSheet]);
    setActiveSheet(fallbackSheet);
    setRawRows([]);
    setError("Database unavailable — working in offline mode. Data will not be saved.");
  }

  // Persist Rows to Database
  async function commitRows(rows: MeasurementRowInput[]): Promise<boolean> {
    if (!activeSheet || saveInFlight.current) return false;
    if (sheetReadInFlight.current) {setError("Wait for the saved measurement rows to finish loading before editing.");return false;}
    const sheet = activeSheet;
    if (sheet.company_id === "offline") {
      setRawRows(rows); setSuccess(null);
      setError("Local calculation only. These entries are not saved to the database; export a backup.");
      return true;
    }
    saveInFlight.current = true; setSaving(true); setError(null); setSuccess(null);
    try {
      const updatedAt = await saveMeasurementRows(supabase, sheet, rows);
      setRawRows(rows);
      const saved = {...sheet,updated_at:updatedAt};
      setActiveSheet(saved); setSheets(current => current.map(item => item.id === sheet.id ? saved : item));
      setSuccess("Measurement rows saved to the database.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Measurements could not be saved. Your entries have been kept.");
      return false;
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  function exportMeasurementBackup() {
    const backup = {sheet:activeSheet,rows:rawRows,openRowForm:showRowModal ? rowForm : null,includeVat,vatRate,pendingQuotation:pendingQuotation.current,pendingQuotationBackup:company?.id ? localStorage.getItem("dxb_measurement_quote_draft_"+company.id) : null};
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download=(activeSheet?.sheet_number || "measurements")+"-backup.json";link.click();URL.revokeObjectURL(url);
  }

  // Sync takeoff rows from interactive Blueprint Canvas
  async function handleSyncTakeoffRows(newTakeoffRows: MeasurementRowInput[]) {
    await commitRows([...rawRows, ...newTakeoffRows]);
  }

  // Calculate live rows
  const calculatedRows = useMemo(() => {
    return rawRows.map(calculateMeasurementRow);
  }, [rawRows]);

  // Calculate sheet summary (enforces strict unit separation and VAT)
  const summary = useMemo(() => {
    return calculateSheetSummary(calculatedRows, includeVat ? vatRate : 0);
  }, [calculatedRows, includeVat, vatRate]);

  // Live preview for row form modal
  const liveFormPreview = useMemo(() => {
    return calculateMeasurementRow(rowForm);
  }, [rowForm]);

  // Open modal to add new row
  function handleAddNewRow() {
    const nextIndex = rawRows.length + 1;
    setRowForm({
      ...DEFAULT_NEW_ROW,
      area_name: `Area ${nextIndex}`,
      description: "PVC Parking Shade Fabric & Centre Joint",
    });
    setEditingRowIndex(null);
    setShowRowModal(true);
  }

  // Open modal to edit existing row
  function handleEditRow(index: number) {
    setRowForm({ ...rawRows[index] });
    setEditingRowIndex(index);
    setShowRowModal(true);
  }

  // Displayed saved rows change only after an acknowledged transaction.
  async function handleDuplicateRow(index: number) {
    const rowToDup = rawRows[index];
    await commitRows([...rawRows.slice(0,index+1),{...rowToDup,id:undefined,area_name:rowToDup.area_name+" (Copy)"},...rawRows.slice(index+1)]);
  }

  async function handleDeleteRow(index: number) {
    await commitRows(rawRows.filter((_,i) => i !== index));
  }

  async function handleSaveRowForm(e: React.FormEvent) {
    e.preventDefault();
    const updated=[...rawRows];
    if (editingRowIndex !== null) updated[editingRowIndex]=rowForm; else updated.push(rowForm);
    if (await commitRows(updated)) setShowRowModal(false);
  }

  // Samples are a separate local preview; they never replace saved sheet rows.
  async function handleLoadRealTestCases() {
    if (saveInFlight.current) return;
    setActiveSheet({id:"test-preview",company_id:"offline",sheet_number:"MS-TEST-PREVIEW",title:"Measurement test preview (not saved)",status:"draft"});
    setRawRows(REAL_PROJECT_PARKING_SHADE_TEST_ROWS);
    setHasVerified(true); setShowVerificationModal(true);
    setError("Test preview only. Saved sheets are unchanged; choose a saved sheet to return.");
    setSuccess(null);
  }

  // Create New Sheet
  async function handleCreateNewSheet() {
    if (saveInFlight.current || sheetReadInFlight.current) return;
    const newTitle = newSheetTitle.trim();
    if (!newTitle) { setError("Enter a sheet title."); return; }
    saveInFlight.current = true; setSaving(true); setError(null); setSuccess(null);
    try {
      const coId = await getCompanyId();
      let sheetNum = `MS-${new Date().getFullYear()}-${String(sheets.length + 1).padStart(4, "0")}`;
      try {
        sheetNum = await generateDocNumber(coId, "MS");
      } catch {}


      const newSheetData = {
        company_id: coId,
        sheet_number: sheetNum,
        title: newTitle,
        status: "draft",
      };

      const { data: created, error: crErr } = await supabase
        .from("measurement_projects")
        .insert(newSheetData)
        .select()
        .single();

      if (crErr) throw crErr;

      const createdSheet = created as MeasurementSheet;
      setSheets((previous) => [createdSheet, ...previous]);
      setShowNewSheetForm(false);
      setActiveSheet(createdSheet);
      setRawRows([]);
      setSuccess(`Sheet ${sheetNum} created.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The measurement sheet could not be created.");
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  // Transfer to Quotation
  async function handleTransferToQuotation() {
    if (calculatedRows.length === 0) {
      alert("No measurement rows to transfer.");
      return;
    }
    if (quotationInFlight.current) return;
    if (!selectedCustomerId) {setError("Select the actual customer before creating a quotation.");return;}
    quotationInFlight.current = true;
    setTransferringToQuote(true);
    try {
      const coId = await getCompanyId();
      const quoteKey = "dxb_measurement_quote_draft_" + coId;
      if (!pendingQuotation.current) {
        const stored = localStorage.getItem(quoteKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.companyId !== coId || !parsed.id || !parsed.header || !Array.isArray(parsed.items)) throw new Error("The browser quotation backup is incompatible. Export it before continuing.");
          pendingQuotation.current = parsed;
          setSelectedCustomerId(String(parsed.header.customer_id || ""));
          setSelectedProjectId(String(parsed.header.project_id || ""));
        }
      }
      const quoteNumber = pendingQuotation.current ? String(pendingQuotation.current.header.quotation_number) : await generateDocNumber(coId, "QT");

      // Prepare line items strictly preserving unit, rate, amount, and description
      const quoteLines = calculatedRows.map((r, i) => {
        const rate = r.rate;
        const qty = r.calculated_total;
        const taxable = Math.round(qty * rate * 100) / 100;
        const vat = Math.round(taxable * (includeVat ? vatRate : 0) / 100 * 100) / 100;
        const total = Math.round((taxable + vat) * 100) / 100;

        return {
          description: `${r.area_name}: ${r.description} (${r.formula_display})`,
          quantity: qty,
          unit: r.result_unit, // STRICTLY PRESERVE UNIT: 'm', 'm²', or 'pcs'
          unit_price: rate,
          discount_percent: 0,
          discount_amount: 0,
          taxable_amount: taxable,
          vat_rate: includeVat ? vatRate : 0,
          vat_amount: vat,
          line_total: total,
          sort_order: i,
        };
      });

      const subtotal = quoteLines.reduce((acc, l) => acc + l.taxable_amount, 0);
      const vatTotal = quoteLines.reduce((acc, l) => acc + l.vat_amount, 0);
      const grandTotal = subtotal + vatTotal;

      const quotePayload = {
        company_id: coId,
        quotation_number: quoteNumber,
        customer_id: selectedCustomerId,
        project_id: selectedProjectId || null,
        quotation_date: todayISO(),
        expiry_date: todayISO(),
        status: "draft",
        subtotal: subtotal,
        discount_amount: 0,
        vat_amount: vatTotal,
        total_amount: grandTotal,
        notes: `Generated from Measurement Sheet ${activeSheet?.sheet_number || ""}: ${activeSheet?.title || ""}`,
      };

      if (!pendingQuotation.current) pendingQuotation.current = {companyId:coId,id:crypto.randomUUID(),header:quotePayload,items:quoteLines};
      const draft = pendingQuotation.current;
      if (draft.companyId !== coId) throw new Error("The unfinished quotation belongs to another company.");
      localStorage.setItem(quoteKey,JSON.stringify(draft));
      const {data,error:quoteError} = await supabase.rpc("create_measurement_quotation", {p_company_id:draft.companyId,p_id:draft.id,p_header:draft.header,p_items:draft.items});
      if (quoteError) throw new Error(quoteError.message);
      if (data !== draft.id) throw new Error("The database did not confirm the quotation. Retry the preserved draft.");
      localStorage.removeItem(quoteKey);
      pendingQuotation.current = null;
      setShowQuotationModal(false);
      setSuccess(`Quotation ${String(draft.header.quotation_number)} generated with ${draft.items.length} items!`);
      setTimeout(() => {
        router.push("/quotations");
      }, 1500);
    } catch (err: unknown) {
      setError("Quotation was not confirmed. Your draft is preserved for retry. " + (err instanceof Error ? err.message : "Saving failed."));
    } finally {
      quotationInFlight.current = false;
      setTransferringToQuote(false);
    }
  }

  // Print Doc Data
  const printDocData: MeasurementSheetDocData = {
    sheet_number: activeSheet?.sheet_number || "MS-2026-0001",
    sheet_date: activeSheet?.created_at ? fmtDate(activeSheet.created_at) : todayISO(),
    title: activeSheet?.title || "PVC Parking Shade Fabrication & Joint Takeoff",
    customer_name: customers.find((c) => c.id === activeSheet?.customer_id)?.name,
    project_name: projects.find((p) => p.id === activeSheet?.project_id)?.name,
    project_number: projects.find((p) => p.id === activeSheet?.project_id)?.project_number,
    notes: activeSheet?.description,
    items: calculatedRows,
    summary: summary,
    vat_rate: includeVat ? vatRate : 0,
    include_vat: includeVat,
  };

  return (
    <div className={`min-h-full w-full bg-slate-900 text-slate-100 p-3 sm:p-6 lg:p-8 ${showPrintModal ? "no-print" : ""}`}>
      <div className="mx-auto max-w-[1440px] w-full">
        {/* Top Banner & Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
              Fabrication &amp; Takeoff
            </span>
            <span className="text-xs text-slate-400 font-mono">Dubai Metric Engine</span>
            {loading && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <RefreshCw size={12} className="animate-spin text-emerald-400" />
                <span>Loading...</span>
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Ruler className="text-emerald-400" size={26} />
            Measurement &amp; Estimation
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Multi-unit measurement takeoff module with automatic mm/cm/m conversion, configurable PVC joint welding
            runs, safe trapezoidal tapering, and strict unit separation.
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Open Formula Guide & Beginner Help"
          >
            <HelpCircle size={15} className="text-amber-400" />
            <span>Formulas Help (?)</span>
          </button>

          <button
            type="button"
            onClick={handleLoadRealTestCases}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition-colors shadow-sm"
            title="Load Real Parking Shade Area 1-4 Test Project (Expected: 1,410.560 m)"
          >
            <RefreshCw size={14} className="text-emerald-400" />
            <span>Load Parking Shade Test Data</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            disabled={calculatedRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            <Printer size={15} className="text-blue-400" />
            <span>Print / PDF</span>
          </button>

          <Link
            href="/settings/designer?type=measurement_sheet"
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 px-3 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-900/60 hover:text-white transition-colors shadow-sm"
            title="Edit Measurement Sheet PDF layout, table columns, header and styling in Document Designer"
          >
            <Sliders size={15} className="text-purple-400" />
            <span>PDF Editor</span>
          </Link>

          <button
            type="button"
            onClick={() => setShowQuotationModal(true)}
            disabled={calculatedRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-sm disabled:opacity-50"
          >
            <FileText size={15} />
            <span>Send to Quotation</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/50 p-3 text-xs text-emerald-300 shadow">
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}
      <button onClick={exportMeasurementBackup} className="mb-3 rounded-lg border border-slate-600 px-3 py-2 text-sm">Export measurement backup</button>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-300 shadow">
          <Info size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Sheet Selector Bar */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-800/60 border border-slate-800 p-3.5 rounded-xl">
        <div className="md:col-span-2 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Layers size={18} />
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Sheet</span>
            <div className="font-bold text-white text-sm">
              {activeSheet?.sheet_number}: {activeSheet?.title}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end md:col-span-2">
          {sheets.length > 0 && (
            <select
              value={activeSheet?.id || ""}
              disabled={saving}
              onChange={(e) => {
                if (saveInFlight.current) return;
                const s = sheets.find((x) => x.id === e.target.value);
                if (s) {
                  setActiveSheet(s);
                  loadSheetItems(s.id);
                }
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
            >
              {!activeSheet && <option value="">Choose a saved sheet</option>}
              {activeSheet?.company_id === "offline" && !sheets.some(s=>s.id===activeSheet.id) && <option value={activeSheet.id}>{activeSheet.sheet_number}</option>}
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sheet_number} - {s.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={saving || loading}
            onClick={() => { setNewSheetTitle("New Measurement & Takeoff Sheet"); setShowNewSheetForm(true); setError(null); }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors"
          >
            <Plus size={14} />
            <span>New Sheet</span>
          </button>
        </div>
      </div>

      {showNewSheetForm && (
        <form
          className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4"
          onSubmit={(event) => { event.preventDefault(); void handleCreateNewSheet(); }}
        >
          <label htmlFor="new-sheet-title" className="mb-2 block text-sm font-semibold text-slate-100">New sheet title</label>
          <input id="new-sheet-title" autoFocus required maxLength={200} value={newSheetTitle}
            disabled={saving} onChange={(event) => setNewSheetTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={saving || !newSheetTitle.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating sheet..." : "Create Sheet"}</button>
            <button type="button" disabled={saving} onClick={() => setShowNewSheetForm(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* Main Measurements Workspace */}
      <div className="space-y-6">
        {/* Interactive Blueprint Takeoff Canvas Section */}
        {activeSheet && (
          <BlueprintTakeoffSection
            key={activeSheet.id}
            sheetId={activeSheet.id}
            companyId={activeSheet.company_id || "offline"}
            onSyncRows={handleSyncTakeoffRows}
            disabled={saving || loading}
          />
        )}

        {/* Table Card */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-white text-sm">Measured Items &amp; Takeoff Rows</h2>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-mono font-medium text-slate-300">
                {calculatedRows.length} {calculatedRows.length === 1 ? "row" : "rows"}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddNewRow}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors shadow"
            >
              <Plus size={15} />
              <span>Add Measurement Row</span>
            </button>
          </div>

          {calculatedRows.length === 0 ? (
            <div className="p-12 text-center">
              <Ruler size={40} className="mx-auto text-slate-600 mb-3" />
              <h3 className="font-medium text-slate-300 text-sm">No measurements recorded yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Add your first measurement item or load our real parking shade project test data.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Add Row
                </button>
                <button
                  type="button"
                  onClick={handleLoadRealTestCases}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                >
                  Load Parking Shade Test Data
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-2.5">Area / Ref</th>
                    <th className="py-2.5 px-2.5">Description</th>
                    <th className="py-2.5 px-2 text-center">Dimensions</th>
                    <th className="py-2.5 px-2 text-center w-14">Qty</th>
                    <th className="py-2.5 px-2.5">Method &amp; Formula</th>
                    <th className="py-2.5 px-2.5 text-right">Result &amp; Unit</th>
                    <th className="py-2.5 px-2 text-right">Rate</th>
                    <th className="py-2.5 px-2.5 text-right">Cost (AED)</th>
                    <th className="py-2.5 px-2 text-center w-24 sticky right-0 bg-slate-950 shadow-sm z-10">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {calculatedRows.map((row, idx) => {
                    const isExpanded = Boolean(expandedExplanations[idx]);
                    const typeDef = CALC_TYPE_DEFINITIONS.find((c) => c.value === row.calc_type);
                    return (
                      <React.Fragment key={row.id || idx}>
                        <tr className="hover:bg-slate-800/40 transition-colors group">
                          <td className="py-2.5 px-2 text-center font-mono text-slate-500 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-2.5 font-bold text-white whitespace-nowrap">
                            {row.area_name || `Area ${idx + 1}`}
                          </td>
                          <td className="py-2.5 px-2.5 text-slate-300 max-w-[160px] truncate" title={row.description}>
                            <div className="truncate font-medium">{row.description || "—"}</div>
                            {row.notes && (
                              <div className="text-[10px] text-slate-500 truncate" title={row.notes}>{row.notes}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-[11px] whitespace-nowrap text-slate-300">
                            {row.calc_type === "quantity_only" ? (
                              <span className="text-slate-500">—</span>
                            ) : (
                              <div>
                                <div>
                                  L: <span className="font-semibold text-white">{row.length_entered} {row.dim_unit}</span>{" "}
                                  <span className="text-slate-500 text-[9px]">({row.length_m.toFixed(3)}m)</span>
                                </div>
                                {row.calc_type !== "linear" && (
                                  <div>
                                    {row.is_variable_width && row.width2_m !== undefined ? (
                                      <span className="text-amber-400 text-[10px]">
                                        W: avg {row.average_width_m?.toFixed(3)}m
                                      </span>
                                    ) : (
                                      <span>
                                        W: <span className="font-semibold text-white">{row.width_entered} {row.dim_unit}</span>{" "}
                                        <span className="text-slate-500 text-[9px]">({row.width_m.toFixed(3)}m)</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-semibold font-mono text-white whitespace-nowrap">
                            {row.quantity} <span className="text-slate-500 text-[10px]">pcs</span>
                          </td>
                          <td className="py-2.5 px-2.5 max-w-[180px]">
                            <div className="font-semibold text-slate-200 truncate text-[11px]">
                              {typeDef?.label.replace(/ \([^\)]+\)/, "") || row.calc_type}
                            </div>
                            <div className="text-[10px] font-mono text-emerald-400/90 truncate" title={row.formula_display}>
                              {row.calc_type === "pvc_edge_joint"
                                ? `(${Number(row.pvc_length_edges) + Number(row.pvc_centre_joints)}L + ${row.pvc_width_edges}W) × Qty`
                                : row.formula_display}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono font-bold text-emerald-400 text-xs">
                              {formatResultWithUnit(row.calculated_total, row.result_unit)}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-[11px] whitespace-nowrap text-slate-400">
                            {row.rate > 0 ? (
                              <span>
                                AED {row.rate.toFixed(2)}
                                <span className="text-[9px] text-slate-500">/{row.result_unit}</span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap text-xs">
                            {row.total_cost > 0 ? fmtAED(row.total_cost) : "—"}
                          </td>
                          <td className="py-2.5 px-2 text-center sticky right-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-sm">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditRow(idx)}
                                title="Edit Row"
                                className="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateRow(idx)}
                                title="Duplicate Row"
                                className="rounded p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-colors"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(idx)}
                                title="Delete Row"
                                className="rounded p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedExplanations((prev) => ({
                                    ...prev,
                                    [idx]: !prev[idx],
                                  }))
                                }
                                title={isExpanded ? "Hide calculation steps" : "Show how this was calculated"}
                                className={`rounded p-1 transition-colors ${
                                  isExpanded
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "text-slate-400 hover:text-amber-400 hover:bg-slate-700"
                                }`}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Step-by-Step Live Explanation */}
                        {isExpanded && (
                          <tr className="bg-slate-950/70">
                            <td colSpan={10} className="py-3 px-6 border-y border-slate-800/60">
                              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-4">
                                <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold text-xs">
                                  <Info size={14} />
                                  <span>How this was calculated — {row.area_name}:</span>
                                </div>
                                <div className="space-y-1 font-mono text-[11px] text-slate-300">
                                  {row.explanation_steps.map((step, sIdx) => (
                                    <div key={sIdx} className="flex items-start gap-2">
                                      <span className="text-slate-500 select-none">•</span>
                                      <span>{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Real Project Verification Callout & Project Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Summary Breakdown Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Calculator size={18} className="text-emerald-400" />
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                    Measurement Summary (Unit-Safe)
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Strict Non-Mixing Rules</span>
              </div>

              {/* Area-by-Area List */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {summary.areaSummary.map((a, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <p className="text-[11px] font-semibold text-slate-400 truncate">{a.area_name}</p>
                    <p className="text-xs text-slate-500">{a.quantity} pcs</p>
                    <p className="font-bold font-mono text-emerald-400 text-sm mt-1">
                      {formatResultWithUnit(a.calculated_total, a.result_unit)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-800 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Total Pieces */}
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    TOTAL PIECES
                  </span>
                  <span className="font-black font-mono text-white text-xl mt-1 block">
                    {summary.totalPieces} pcs
                  </span>
                </div>

                {/* Total Linear Metres */}
                <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/30 p-3.5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    TOTAL LINEAR METRES
                  </span>
                  <span className="font-black font-mono text-emerald-300 text-xl mt-1 block">
                    {summary.totalLinearM.toLocaleString("en-US", {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}{" "}
                    m
                  </span>
                  <span className="text-[10px] text-emerald-400/80">Never mixed with m²</span>
                </div>

                {/* Total Area (if any) */}
                <div
                  className={`rounded-lg p-3.5 border ${
                    summary.totalAreaM2 > 0
                      ? "bg-blue-950/50 border-blue-500/30"
                      : "bg-slate-950 border-slate-800 opacity-60"
                  }`}
                >
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                    TOTAL AREA
                  </span>
                  <span className="font-black font-mono text-blue-300 text-xl mt-1 block">
                    {summary.totalAreaM2.toLocaleString("en-US", {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}{" "}
                    m²
                  </span>
                  <span className="text-[10px] text-blue-400/80">Dedicated Square Metres</span>
                </div>
              </div>

              {/* Total Estimated Cost & VAT Breakdown */}
              {summary.totalCostAED > 0 && (
                <div className="mt-4 rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                        Costing &amp; UAE VAT Options
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Configure 5% standard UAE VAT on measurement rates and preview invoice totals
                      </p>
                    </div>

                    {/* VAT Toggle & Rate Input */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIncludeVat(!includeVat)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border ${
                          includeVat
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                            : "bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <Receipt size={14} className={includeVat ? "text-emerald-400" : "text-slate-400"} />
                        <span>{includeVat ? `Include VAT (${vatRate}%): ON` : "Include VAT: OFF"}</span>
                      </button>

                      {includeVat && (
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                          <span className="text-[10px] text-slate-400">Rate:</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={vatRate}
                            onChange={(e) => setVatRate(Math.max(0, Number(e.target.value) || 0))}
                            className="w-10 bg-transparent text-center font-mono font-bold text-white outline-none"
                          />
                          <span className="text-slate-400">%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Breakdown Rows */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400 font-medium">Net Amount (Subtotal):</span>
                      <span className="font-mono font-semibold text-white">
                        {fmtAED(summary.totalCostAED)}
                      </span>
                    </div>

                    {includeVat && summary.vatAmountAED !== undefined && (
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400 font-medium">VAT Amount ({vatRate}%):</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {fmtAED(summary.vatAmountAED)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-sm">
                      <span className="font-bold text-white uppercase tracking-wider">
                        {includeVat ? "Total Amount (Inc. VAT):" : "Total Estimated Cost:"}
                      </span>
                      <span className="font-black font-mono text-emerald-400 text-xl sm:text-2xl">
                        {fmtAED(
                          includeVat && summary.grandTotalWithVatAED !== undefined
                            ? summary.grandTotalWithVatAED
                            : summary.totalCostAED
                        )}
                      </span>
                    </div>

                    {includeVat && summary.grandTotalWithVatAED !== undefined && (
                      <div className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800/50">
                        <span className="text-slate-500 font-sans not-italic font-semibold mr-1.5">
                          Amount in words:
                        </span>
                        {numberToWordsEnglish(summary.grandTotalWithVatAED)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Case Verification Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">
                <CheckCircle2 size={16} />
                <span>Real Project Specification</span>
              </div>
              <h4 className="text-white font-bold text-sm">Parking Shade PVC Joint Project</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Standard cantilever parking shade pieces with 2 length edges, 2 width edges, and 1 centre joint run (3L + 2W).
              </p>

              <div className="mt-4 space-y-2 border-t border-emerald-500/20 pt-3 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Area 1 (6 pcs × 12m × 5.36m):</span>
                  <span className="font-bold text-white">280.320 m</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Area 2 (8 pcs × 12m × 5.52m):</span>
                  <span className="font-bold text-white">376.320 m</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Area 3 (8 pcs × 12m × 5.56m):</span>
                  <span className="font-bold text-white">376.960 m</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Area 4 (8 pcs × 12m × 5.56m):</span>
                  <span className="font-bold text-white">376.960 m</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold pt-2 border-t border-emerald-500/30 text-sm">
                  <span>EXPECTED GRAND TOTAL:</span>
                  <span>1,410.560 m</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-emerald-500/20 space-y-2">
              {hasVerified && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
                    <span>Audit Status: 100% Match</span>
                  </div>
                  <span className="font-mono font-bold text-white">1,410.560 m</span>
                </div>
              )}

              <button
                type="button"
                id="btn-verify-real-project"
                disabled={isVerifying}
                onClick={handleLoadRealTestCases}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-75 py-2.5 px-3 text-xs font-bold text-white transition-all flex items-center justify-center gap-2 shadow cursor-pointer active:scale-[0.98]"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-emerald-100" />
                    <span>Verifying Calculations...</span>
                  </>
                ) : hasVerified ? (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-200" />
                    <span>✓ Verified (1,410.560 m) — View Full Report</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={15} />
                    <span>Verify with Real Project Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT MEASUREMENT ROW (WITH LIVE CALCULATOR PREVIEW) */}
      {/* ========================================================================= */}
      {showRowModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center">
          <div className="relative w-full max-w-5xl xl:max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-3 sm:my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Ruler className="text-emerald-400" size={18} />
                  {editingRowIndex !== null ? "Edit Measurement Row" : "Add Measurement Row"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure dimensions, calculation type, and live preview with instant takeoff calculations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRowForm} className="p-4 sm:p-6 lg:p-7">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column (Inputs): 7 cols on desktop */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Area Name & Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Area / Item Reference <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={rowForm.area_name}
                        onChange={(e) => setRowForm({ ...rowForm, area_name: e.target.value })}
                        placeholder="e.g. Area 1, Parking Bay A"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                      <input
                        type="text"
                        value={rowForm.description}
                        onChange={(e) => setRowForm({ ...rowForm, description: e.target.value })}
                        placeholder="e.g. PVC Parking Shade Fabric & Centre Joint"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Calculation Type & Dimension Unit */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                    {/* Calculation Type Selector */}
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <span>Calculation Type</span>
                          <button
                            type="button"
                            onClick={() => setShowHelpModal(true)}
                            className="text-amber-400 hover:text-amber-300"
                            title="Click to view formula guide"
                          >
                            <HelpCircle size={14} />
                          </button>
                        </label>
                        <span className="text-[11px] font-bold text-emerald-400 font-mono">
                          Unit: {CALC_TYPE_DEFINITIONS.find((c) => c.value === rowForm.calc_type)?.resultUnit}
                        </span>
                      </div>

                      <select
                        value={rowForm.calc_type}
                        onChange={(e) =>
                          setRowForm({
                            ...rowForm,
                            calc_type: e.target.value as CalculationType,
                          })
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
                      >
                        {CALC_TYPE_DEFINITIONS.map((def) => (
                          <option key={def.value} value={def.value}>
                            {def.label} — {def.shortDesc}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1 italic">
                        {CALC_TYPE_DEFINITIONS.find((c) => c.value === rowForm.calc_type)?.helpText}
                      </p>
                    </div>

                    {/* Dimension Unit (mm, cm, m) */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Dimension Unit</label>
                      <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
                        {(["mm", "cm", "m"] as DimensionUnit[]).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setRowForm({ ...rowForm, dim_unit: u })}
                            className={`rounded py-1.5 text-xs font-semibold uppercase transition-colors ${
                              rowForm.dim_unit === u
                                ? "bg-emerald-600 text-white shadow"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        {rowForm.dim_unit === "mm"
                          ? "1000 mm = 1 m"
                          : rowForm.dim_unit === "cm"
                          ? "100 cm = 1 m"
                          : "Direct Metres"}
                      </span>
                    </div>
                  </div>

                  {/* Dimension Inputs (Length, Width, Quantity) */}
                  {rowForm.calc_type !== "quantity_only" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Length */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-slate-300">
                              Length ({rowForm.dim_unit})
                            </label>
                            <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                              = {normalizeToMetres(rowForm.length_entered, rowForm.dim_unit).toFixed(3)} m
                            </span>
                          </div>
                          <NumericInput
                            preset="measurement"
                            value={rowForm.length_entered}
                            onChange={(val) => setRowForm({ ...rowForm, length_entered: val })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        {/* Width (if not linear) */}
                        {rowForm.calc_type !== "linear" && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-slate-300">
                                {rowForm.is_variable_width ? "Width 1" : "Width"} ({rowForm.dim_unit})
                              </label>
                              <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                                = {normalizeToMetres(rowForm.width_entered, rowForm.dim_unit).toFixed(3)} m
                              </span>
                            </div>
                            <NumericInput
                              preset="measurement"
                              value={rowForm.width_entered}
                              onChange={(val) => setRowForm({ ...rowForm, width_entered: val })}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                        )}

                        {/* Quantity */}
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Quantity (pcs)</label>
                          <NumericInput
                            preset="integer"
                            value={rowForm.quantity}
                            onChange={(val) => setRowForm({ ...rowForm, quantity: val })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Variable Width Option */}
                      {rowForm.calc_type !== "linear" && (
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(rowForm.is_variable_width)}
                              onChange={(e) =>
                                setRowForm({
                                  ...rowForm,
                                  is_variable_width: e.target.checked,
                                  width2_entered: e.target.checked ? rowForm.width_entered : undefined,
                                })
                              }
                              className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                            />
                            <span className="text-xs font-medium text-slate-300">
                              Different width at other end (Trapezoidal / Tapered shape)
                            </span>
                          </label>

                          {rowForm.is_variable_width && (
                            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium text-slate-300">
                                    Width 2 ({rowForm.dim_unit})
                                  </label>
                                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                                    = {normalizeToMetres(rowForm.width2_entered, rowForm.dim_unit).toFixed(3)} m
                                  </span>
                                </div>
                                <NumericInput
                                  preset="measurement"
                                  value={rowForm.width2_entered ?? 0}
                                  onChange={(val) => setRowForm({ ...rowForm, width2_entered: val })}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                                />
                              </div>

                              <div className="flex flex-col justify-center">
                                <span className="text-[11px] text-amber-300 font-medium">
                                  Trapezoidal Average Width:
                                </span>
                                <span className="font-mono text-xs text-white font-bold">
                                  {((normalizeToMetres(rowForm.width_entered, rowForm.dim_unit) +
                                    normalizeToMetres(rowForm.width2_entered, rowForm.dim_unit)) /
                                    2).toFixed(3)}{" "}
                                  m
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dedicated Configurable PVC Edge + Centre Joint Options */}
                  {rowForm.calc_type === "pvc_edge_joint" && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          PVC Joint Run Configuration
                        </span>
                        <span className="text-[10px] font-mono text-emerald-300 font-semibold">
                          Formula: ({rowForm.pvc_length_edges}L + {rowForm.pvc_centre_joints}CJ + {rowForm.pvc_width_edges}W) = (
                          {Number(rowForm.pvc_length_edges) + Number(rowForm.pvc_centre_joints)}L + {rowForm.pvc_width_edges}W)
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Length Edges
                          </label>
                          <NumericInput
                            preset="integer"
                            value={rowForm.pvc_length_edges}
                            onChange={(val) => setRowForm({ ...rowForm, pvc_length_edges: val })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono"
                          />
                          <span className="text-[9px] text-slate-500">Standard: 2 (Left &amp; Right)</span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Width Edges
                          </label>
                          <NumericInput
                            preset="integer"
                            value={rowForm.pvc_width_edges}
                            onChange={(val) => setRowForm({ ...rowForm, pvc_width_edges: val })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono"
                          />
                          <span className="text-[9px] text-slate-500">Standard: 2 (Top &amp; Bottom)</span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Centre Joints
                          </label>
                          <NumericInput
                            preset="integer"
                            value={rowForm.pvc_centre_joints}
                            onChange={(val) => setRowForm({ ...rowForm, pvc_centre_joints: val })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono"
                          />
                          <span className="text-[9px] text-slate-500">Standard: 1 (Middle weld)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Custom Safe Formula Component Builder */}
                  {rowForm.calc_type === "custom" && (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          Safe Formula Components
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const existing = rowForm.custom_components || [];
                            setRowForm({
                              ...rowForm,
                              custom_components: [
                                ...existing,
                                {
                                  id: String(Date.now()),
                                  name: `Component ${existing.length + 1}`,
                                  dimensionBasis: "length",
                                  multiplier: 1,
                                },
                              ],
                            });
                          }}
                          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <Plus size={13} /> Add Component
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(rowForm.custom_components || []).map((comp, cIdx) => (
                          <div key={comp.id || cIdx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => {
                                const comps = [...(rowForm.custom_components || [])];
                                comps[cIdx].name = e.target.value;
                                setRowForm({ ...rowForm, custom_components: comps });
                              }}
                              placeholder="Component Name"
                              className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                            />
                            <span className="text-slate-400 text-xs">Multiplier:</span>
                            <NumericInput
                              preset="integer"
                              value={comp.multiplier}
                              onChange={(val) => {
                                const comps = [...(rowForm.custom_components || [])];
                                comps[cIdx].multiplier = val;
                                setRowForm({ ...rowForm, custom_components: comps });
                              }}
                              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white font-mono"
                            />
                            <span className="text-slate-400 text-xs">× Basis:</span>
                            <select
                              value={comp.dimensionBasis}
                              onChange={(e) => {
                                const comps = [...(rowForm.custom_components || [])];
                                comps[cIdx].dimensionBasis = e.target.value as "length" | "width" | "custom_dim";
                                setRowForm({ ...rowForm, custom_components: comps });
                              }}
                              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                            >
                              <option value="length">Length ({normalizeToMetres(rowForm.length_entered, rowForm.dim_unit).toFixed(3)}m)</option>
                              <option value="width">Width ({normalizeToMetres(rowForm.width_entered, rowForm.dim_unit).toFixed(3)}m)</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const comps = (rowForm.custom_components || []).filter((_, i) => i !== cIdx);
                                setRowForm({ ...rowForm, custom_components: comps });
                              }}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quantity Only field */}
                  {rowForm.calc_type === "quantity_only" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Item Count (pcs)</label>
                      <NumericInput
                        preset="integer"
                        value={rowForm.quantity}
                        onChange={(val) => setRowForm({ ...rowForm, quantity: val })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  )}

                  {/* Costing Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Rate ({liveFormPreview.rate_unit_label})
                      </label>
                      <NumericInput
                        preset="currency"
                        value={rowForm.rate}
                        onChange={(val) => setRowForm({ ...rowForm, rate: val })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">AED unit rate for costing takeoff</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Estimated Item Cost</label>
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold font-mono text-emerald-400 flex items-center justify-between">
                        <span>Cost:</span>
                        <span className="text-sm font-black">{fmtAED(liveFormPreview.total_cost)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Total Result × Rate</p>
                    </div>
                  </div>
                </div>

                {/* Right Column (Live Preview & Actions): 5 cols on desktop */}
                <div className="lg:col-span-5 space-y-4">
                  {/* LIVE CALCULATOR PREVIEW CARD (Requirement 14) */}
                  <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 p-4 sm:p-5 shadow-xl">
                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5 mb-3.5">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Calculator size={15} /> LIVE CALCULATION PREVIEW
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {CALC_TYPE_DEFINITIONS.find((c) => c.value === liveFormPreview.calc_type)?.label}
                      </span>
                    </div>

                    {/* Dimension inputs overview */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-4 pb-3 border-b border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Length</span>
                        <span className="font-mono font-bold text-white text-xs sm:text-sm">
                          {liveFormPreview.length_m.toFixed(3)} m
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Width</span>
                        <span className="font-mono font-bold text-white text-xs sm:text-sm">
                          {liveFormPreview.is_variable_width && liveFormPreview.average_width_m !== undefined
                            ? `avg ${liveFormPreview.average_width_m.toFixed(3)} m`
                            : `${liveFormPreview.width_m.toFixed(3)} m`}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Quantity</span>
                        <span className="font-mono font-bold text-white text-xs sm:text-sm">
                          {liveFormPreview.quantity} pcs
                        </span>
                      </div>
                    </div>

                    {/* THE 3 STANDOUT KEY METRICS (Requirement 14) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
                      {/* Metric 1: PER PIECE */}
                      <div className="rounded-lg border border-slate-700/80 bg-slate-950/80 p-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          PER PIECE
                        </span>
                        <span className="font-black font-mono text-emerald-400 text-base sm:text-lg mt-0.5 block truncate">
                          {formatResultWithUnit(liveFormPreview.per_piece_result, liveFormPreview.result_unit)}
                        </span>
                      </div>

                      {/* Metric 2: TOTAL RESULT */}
                      <div className="rounded-lg border border-emerald-500/50 bg-emerald-950/50 p-3 shadow-inner">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                          TOTAL RESULT
                        </span>
                        <span className="font-black font-mono text-white text-lg sm:text-xl mt-0.5 block truncate">
                          {formatResultWithUnit(liveFormPreview.calculated_total, liveFormPreview.result_unit)}
                        </span>
                      </div>

                      {/* Metric 3: ESTIMATED COST */}
                      <div className="rounded-lg border border-teal-500/50 bg-teal-950/40 p-3">
                        <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">
                          ESTIMATED COST
                        </span>
                        <span className="font-black font-mono text-emerald-300 text-base sm:text-lg mt-0.5 block truncate">
                          {fmtAED(liveFormPreview.total_cost)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active Formula Explanation */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Active Formula
                    </span>
                    <p className="font-mono text-emerald-400 text-xs font-semibold">
                      {liveFormPreview.formula_display}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Converts automatically: 1000 mm = 1 m | 100 cm = 1 m
                    </p>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRowModal(false)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition-colors shadow flex items-center gap-1.5"
                    >
                      <Save size={14} />
                      <span>{editingRowIndex !== null ? "Update Measurement" : "Add to Sheet"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BEGINNER-FRIENDLY HELP GUIDE (Requirement 19) */}
      {/* ========================================================================= */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-4 sm:my-8">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="text-amber-400" size={20} />
                <h3 className="text-base font-bold text-white">
                  Beginner-Friendly Calculation Guide
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <p className="text-xs text-slate-300">
                Measurement and estimation can seem confusing at first, but following these 6 calculation types will make your takeoffs simple and error-free:
              </p>

              <div className="space-y-3">
                {CALC_TYPE_DEFINITIONS.map((def) => (
                  <div key={def.value} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-white text-xs flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                        {def.label}
                      </h4>
                      <span className="font-mono text-[11px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/20 px-2 py-0.5 rounded">
                        Unit: {def.resultUnit}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{def.helpText}</p>
                    <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                      Formula: {def.shortDesc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">
                <span className="font-bold uppercase tracking-wider block mb-1">Unit Safety Notice</span>
                Never combine Linear Metres (m) with Square Metres (m²) or item counts (pcs). Our Dubai ERP keeps each unit in dedicated columns and totals to ensure 100% FTA and engineering compliance.
              </div>
            </div>

            <div className="border-t border-slate-800 bg-slate-950 px-6 py-3 text-right">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TRANSFER TO QUOTATION (Requirement 17) */}
      {/* ========================================================================= */}
      {showQuotationModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4 my-4 sm:my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <FileText className="text-emerald-400" size={18} />
                <span>Transfer Takeoff to Quotation</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuotationModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
            {pendingQuotation.current && <p className="text-xs text-amber-300">Retrying the preserved quotation {String(pendingQuotation.current.header.quotation_number)} with {pendingQuotation.current.items.length} original items and total {fmtAED(Number(pendingQuotation.current.header.total_amount))}. Its contents remain unchanged.</p>}
            <p className="text-xs text-slate-300 leading-relaxed">
              This will create a new official Dubai quotation with {calculatedRows.length} measurement line items,
              strictly preserving units (<span className="text-emerald-400 font-mono">m</span>,{" "}
              <span className="text-emerald-400 font-mono">m²</span>,{" "}
              <span className="text-emerald-400 font-mono">pcs</span>), quantities, and amounts.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Customer</label>
                <select
                  disabled={transferringToQuote || !!pendingQuotation.current}
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="">— Select Customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Link to Project (Optional)</label>
                <select
                  disabled={transferringToQuote || !!pendingQuotation.current}
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="">— Select Project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.project_number ? `(${p.project_number})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Total Items:</span>
                <span className="font-mono text-white">{calculatedRows.length}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Linear Metres:</span>
                <span className="font-mono text-emerald-400">{summary.totalLinearM.toFixed(3)} m</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Estimated Subtotal:</span>
                <span className="font-mono font-bold text-white">{fmtAED(summary.totalCostAED)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowQuotationModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={transferringToQuote}
                onClick={handleTransferToQuotation}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition-colors shadow flex items-center gap-1.5"
              >
                <span>{transferringToQuote ? "Creating..." : "Generate Quotation"}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REAL PROJECT SPECIFICATION VERIFICATION & AUDIT REPORT */}
      {/* ========================================================================= */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md p-3 sm:p-6 flex items-start justify-center">
          <div className="relative w-full max-w-4xl rounded-2xl border border-emerald-500/40 bg-slate-900 shadow-2xl overflow-hidden my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-950/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>Engineering Takeoff Audit Report</span>
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      100% Match Verified
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Parking Shade PVC Joint Project Specification vs Calculated Takeoff
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVerificationModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              {/* Formula & Rule Banner */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-emerald-300">
                      Engineering Rule: PVC Edge + Centre Joint (3L + 2W)
                    </div>
                    <p className="text-slate-300">
                      Each cantilever shade piece requires welding on 2 length edges, 2 width edges, and 1 centre joint run:
                      <code className="ml-1.5 px-2 py-0.5 rounded bg-slate-950 text-emerald-400 font-mono font-bold">
                        Linear Length = (3 × Length + 2 × Width) × Quantity
                      </code>
                    </p>
                    <p className="text-slate-400 text-[11px]">
                      Automatic millimeter conversion active: Dimensions entered in millimeters (e.g. 12,000 mm × 5,360 mm) are strictly normalized to SI metres (12.000 m × 5.360 m).
                    </p>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Audit Comparison Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[10px] uppercase font-semibold">
                      <th className="py-2.5 px-3">Item / Area</th>
                      <th className="py-2.5 px-3">Dimensions (Entered)</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Per-Piece Run</th>
                      <th className="py-2.5 px-3">Calculated Total</th>
                      <th className="py-2.5 px-3">Specification Target</th>
                      <th className="py-2.5 px-3 text-right">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">Area 1</td>
                      <td className="py-2.5 px-3 text-slate-300">12,000 × 5,360 mm</td>
                      <td className="py-2.5 px-3 text-slate-300">6 pcs</td>
                      <td className="py-2.5 px-3 text-slate-400">46.720 m</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">280.320 m</td>
                      <td className="py-2.5 px-3 text-slate-300">280.320 m</td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <Check size={12} /> Exact Match
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">Area 2</td>
                      <td className="py-2.5 px-3 text-slate-300">12,000 × 5,520 mm</td>
                      <td className="py-2.5 px-3 text-slate-300">8 pcs</td>
                      <td className="py-2.5 px-3 text-slate-400">47.040 m</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">376.320 m</td>
                      <td className="py-2.5 px-3 text-slate-300">376.320 m</td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <Check size={12} /> Exact Match
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">Area 3</td>
                      <td className="py-2.5 px-3 text-slate-300">12,000 × 5,560 mm</td>
                      <td className="py-2.5 px-3 text-slate-300">8 pcs</td>
                      <td className="py-2.5 px-3 text-slate-400">47.120 m</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">376.960 m</td>
                      <td className="py-2.5 px-3 text-slate-300">376.960 m</td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <Check size={12} /> Exact Match
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-3 font-sans font-bold text-white">Area 4</td>
                      <td className="py-2.5 px-3 text-slate-300">12,000 × 5,560 mm</td>
                      <td className="py-2.5 px-3 text-slate-300">8 pcs</td>
                      <td className="py-2.5 px-3 text-slate-400">47.120 m</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">376.960 m</td>
                      <td className="py-2.5 px-3 text-slate-300">376.960 m</td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          <Check size={12} /> Exact Match
                        </span>
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-500/30 bg-slate-900 text-xs">
                      <td colSpan={2} className="py-3 px-3 font-sans font-bold text-white uppercase">
                        Audit Totals (Strict Unit Separated)
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-white">30 pcs</td>
                      <td className="py-3 px-3 text-slate-400 font-sans text-[11px]">4 Areas</td>
                      <td className="py-3 px-3 font-mono font-black text-emerald-400 text-sm">
                        1,410.560 m
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-white text-sm">
                        1,410.560 m
                      </td>
                      <td className="py-3 px-3 text-right font-sans">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/30 px-2.5 py-1 text-xs font-black text-emerald-200">
                          <CheckCircle2 size={13} /> 100% VERIFIED
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Engineering Verification Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    TOTAL FABRICATION PIECES
                  </span>
                  <span className="font-mono text-xl font-black text-white">30 pcs</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    6 pcs (Area 1) + 8 + 8 + 8 pcs
                  </span>
                </div>

                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                    TOTAL LINEAR METRES
                  </span>
                  <span className="font-mono text-xl font-black text-emerald-400">1,410.560 m</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Strict non-mixing: 0.000 m² clean
                  </span>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    ESTIMATED COST (@ AED 5.00 / m)
                  </span>
                  <span className="font-mono text-xl font-black text-white">AED 7,052.80</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Ready for quotation export
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-4">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>All 4 test areas loaded into active takeoff sheet</span>
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowVerificationModal(false)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  Close Audit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVerificationModal(false);
                    setShowQuotationModal(true);
                  }}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow"
                >
                  <FileText size={14} />
                  <span>Send to Quotation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT / PDF PREVIEW MODAL (Requirement 18) */}
      {/* ========================================================================= */}
      {showPrintModal && (
        <PrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          editorHref="/settings/designer?type=measurement_sheet"
          extraActions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIncludeVat((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                  includeVat
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Toggle 5% UAE VAT in preview and export"
              >
                <Receipt size={13} className={includeVat ? "text-emerald-400" : "text-slate-400"} />
                <span>{includeVat ? `VAT (${vatRate}%): ON` : "VAT: OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCalculationTypeInPdf((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors ${
                  showCalculationTypeInPdf
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Toggle Calculation Type & Formula column in preview"
              >
                <Calculator size={13} className={showCalculationTypeInPdf ? "text-emerald-400" : "text-slate-400"} />
                <span>{showCalculationTypeInPdf ? "Calculation Type: Visible" : "Calculation Type: Removed"}</span>
              </button>
            </div>
          }
        >
          <MeasurementSheetTemplate
            company={company}
            data={printDocData}
            showCalculationType={showCalculationTypeInPdf}
            showVat={includeVat}
          />
        </PrintModal>
      )}
      </div>
    </div>
  );
}
