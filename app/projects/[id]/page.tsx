"use client";

export const runtime = 'edge';

import React, { useEffect, useState, useRef, use } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  DollarSign,
  TrendingUp,
  Users,
  Wrench,
  FileText,
  ShieldCheck,
  Plus,
  Trash2,
  Printer,
  Loader2,
  Ruler,
} from "lucide-react";
import { fmtAED, statusClass, todayISO, getCurrentCompany, generateDocNumber } from "@/lib/helpers";
import WorkMethodStatementTemplate, { WMSData, RiskAssessmentRow, QAQCChecklistItem } from "@/components/documents/WorkMethodStatementTemplate";
import ProjectHandoverTemplate, { HandoverData } from "@/components/documents/ProjectHandoverTemplate";
import ReportLoadState from "@/components/ReportLoadState";
import { readProjectResult, writeProjectResult, unsavedProjectExpenses, saveProjectWmsDraft, type ProjectWmsDraft } from "@/lib/projectPersistence";
import PrintModal from "@/components/documents/PrintModal";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

type Project = {
  id: string;
  company_id: string;
  project_number: string;
  name: string;
  customer_id: string | null;
  location: string | null;
  main_contractor: string | null;
  subcontractor: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_value: number | null;
  description: string | null;
};

type Customer = { id: string; name: string | null };

type Manpower = {
  id: string;
  role_name: string;
  quantity: number;
  daily_rate: number;
  total_days: number;
  total_cost: number;
  notes: string | null;
};

type Equipment = {
  id: string;
  equipment_name: string;
  quantity: number;
  rate_per_day: number;
  total_days: number;
  total_cost: number;
  notes: string | null;
};

type ProjectExpense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
  receipt_ref?: string | null;
};

type WMS = {
  revision_history?: WMSData["revision_history"];
  id: string;
  wms_number: string;
  title: string;
  location: string | null;
  main_contractor: string | null;
  subcontractor: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  document_date: string | null;
  revision: string;
  purpose: string | null;
  scope: string | null;
  reference_documents?: string | null;
  responsibilities?: string | null;
  materials?: string | null;
  tools_equipment?: string | null;
  pre_installation?: string | null;
  installation_procedure: string | null;
  quality_control?: string | null;
  health_safety?: string | null;
  environmental?: string | null;
  acceptance_criteria?: string | null;
  status: string;
};

type Handover = {
  id: string;
  handover_number: string;
  handover_date: string;
  scope_completed: string;
  snags_remarks: string | null;
  client_representative: string | null;
  contractor_representative: string | null;
  status: string;
};

type LinkedDoc = {
  id: string;
  type: "Quotation" | "Tax Invoice" | "Delivery Note" | "Purchase Order";
  ref_number: string;
  date: string;
  amount?: number;
  status: string;
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [browserDrafts, setBrowserDrafts] = useState<ProjectExpense[]>([]);
  const [browserNotice, setBrowserNotice] = useState("");
  const loadVersion = useRef(0);
  const actionInFlight = useRef(false);
  const pendingWms = useRef<ProjectWmsDraft | null>(null);
  const [activeTab, setActiveTab] = useState<"costing" | "manpower" | "equipment" | "wms" | "handover" | "documents">("costing");

  // Costing & Data Lists
  const [manpower, setManpower] = useState<Manpower[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [wmsList, setWmsList] = useState<WMS[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);

  // Print Modals
  const [printWms, setPrintWms] = useState<WMSData | null>(null);
  const [printHandover, setPrintHandover] = useState<HandoverData | null>(null);

  // New item states
  const [savingItem, setSavingItem] = useState(false);

  // New Manpower Form State
  const [mpRole, setMpRole] = useState("");
  const [mpQty, setMpQty] = useState(1);
  const [mpRate, setMpRate] = useState(150);
  const [mpDays, setMpDays] = useState(10);

  // New Equipment Form State
  const [eqName, setEqName] = useState("");
  const [eqQty, setEqQty] = useState(1);
  const [eqRate, setEqRate] = useState(250);
  const [eqDays, setEqDays] = useState(5);

  // New Direct Expense Form State
  const [expDesc, setExpDesc] = useState("");
  const [expCat, setExpCat] = useState("Permits & Government Fees");
  const [expAmount, setExpAmount] = useState(500);
  const expDate = todayISO();
  const [expRef, setExpRef] = useState("");

  // New WMS Form State
  const [showWmsModal, setShowWmsModal] = useState(false);
  const [wmsModalTab, setWmsModalTab] = useState<"general" | "methodology" | "safety" | "risks" | "qaqc" | "revisions">("general");
  const [wmsTitle, setWmsTitle] = useState("");
  const [wmsRevision, setWmsRevision] = useState("Rev 00");
  const [wmsPreparedBy, setWmsPreparedBy] = useState("Site Engineer");
  const [wmsApprovedBy, setWmsApprovedBy] = useState("Project Manager");
  const [wmsPurpose, setWmsPurpose] = useState("To define the systematic and safe installation, testing, and quality requirements to ensure strict compliance with project specifications, authority regulations, and engineering standards.");
  const [wmsScope, setWmsScope] = useState("Covers receiving inspection, handling, site storage, pre-installation preparation, installation procedures, QA/QC verification, and safety precautions for the complete execution.");
  const [wmsRefDocs, setWmsRefDocs] = useState("Project IFC Drawings, Approved Material Submittal (MAS), UAE Fire & Life Safety Code, Project HSE Plan.");
  const [wmsResponsibilities, setWmsResponsibilities] = useState("Project Manager ensures overall compliance and resources. Site Engineer directs daily operations. QA/QC Engineer verifies inspections. Safety Officer enforces permits and PPE.");
  const [wmsMaterials, setWmsMaterials] = useState("Specified project materials delivered with Mill Test Certificates, stored off-ground on timber dunnage in shaded yard.");
  const [wmsTools, setWmsTools] = useState("110V power tools, calibrated torque wrenches, certified mobile aluminum scaffolding tower, calibrated digital multi-meter.");
  const [wmsPreInstallation, setWmsPreInstallation] = useState("Verify civil clearance, ensure work permits approved, conduct site toolbox talk, inspect approved drawings and survey markers.");
  const [wmsProcedure, setWmsProcedure] = useState("1. Mark approved coordinates per structural grids.\n2. Fix anti-vibration rubber mounts & unistrut supports.\n3. Position and align equipment/piping per specifications.\n4. Secure high-tensile hardware and torque to manufacturer ratings.\n5. Conduct static pressure and continuity testing.");
  const [wmsQualityControl, setWmsQualityControl] = useState("Raise Work Inspection Request (WIR) at each critical stage. 100% visual inspection and hydrostatic pressure test witnessing by consultant.");
  const [wmsHealthSafety, setWmsHealthSafety] = useState("Full mandatory 5-point PPE, certified scaffolders only above 2m with double lanyards, task-specific hot work permit with fire watch.");
  const [wmsEnvironmental, setWmsEnvironmental] = useState("Zero chemical discharge to municipal drain. Waste segregation at source into hazardous and non-hazardous skips.");
  const [wmsAcceptanceCriteria, setWmsAcceptanceCriteria] = useState("Complete installation compliant with approved shop drawings with 0 defects and signed consultant WIR approval.");

  const [wmsRisks, setWmsRisks] = useState<RiskAssessmentRow[]>([
    { activity: "Working at Height / Scaffolding Erection", hazard: "Falls from height, unstable scaffolding", control_measures: "Scaffolding tag green permit, safety harness clipped at 100% tie-off, competent erectors", risk_level: "High" },
    { activity: "Heavy Material Handling & Offloading", hazard: "Dropped loads, back strain, pinch points", control_measures: "Mechanical crane lifting with certified rigger, exclusion safety zone, steel-toe boots", risk_level: "Medium" },
    { activity: "Power Tools, Cutting & Grinding", hazard: "Electric shock, flying sparks, eye injury", control_measures: "110V step-down transformer with 30mA ELCB, face shields, hot work permit & fire blanket", risk_level: "Medium" },
  ]);

  const [wmsQAQC, setWmsQAQC] = useState<QAQCChecklistItem[]>([
    { inspection_item: "Approved Material Verification (MIR)", acceptance_criteria: "Matches approved submittal & brand specs", status: "Pending", inspector_name: "QA/QC Engineer" },
    { inspection_item: "Alignment, Plumb & Elevation Check", acceptance_criteria: "Within +/- 3mm tolerance of IFC drawing", status: "Pending", inspector_name: "Site Engineer" },
    { inspection_item: "Fastener Torque & Structural Anchoring", acceptance_criteria: "Calibrated torque wrench verification", status: "Pending", inspector_name: "Site Engineer" },
    { inspection_item: "Testing & Commissioning (WIR Witness)", acceptance_criteria: "Zero leaks & pressure holding 24 hours", status: "Pending", inspector_name: "Consultant Rep" },
  ]);

  const [wmsRevHistory, setWmsRevHistory] = useState([
    { rev: "Rev 00", date: todayISO(), description: "Initial Submittal for Consultant Review & Approval", prepared_by: "Site Engineer" }
  ]);

  // New Handover Form State
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [hoScope, setHoScope] = useState("");
  const [hoSnags, setHoSnags] = useState("");
  const [hoClientRep, setHoClientRep] = useState("");
  const [hoContractorRep, setHoContractorRep] = useState("");

  useEffect(() => {
    let cancelled = false;
    pendingWms.current = null;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setPrintWms(null);
      setPrintHandover(null);
      setActionError("");
      void loadProjectDetails();
    });
    return () => { cancelled = true; loadVersion.current += 1; };
  // Project identity is the complete refresh key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadProjectDetails() {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const co = await getCurrentCompany();
      if (!co?.id) throw new Error("No active company found.");
      const p = await readProjectResult<Project>(supabase.from("projects").select("*").eq("id", projectId).eq("company_id", co.id).maybeSingle());
      if (version !== loadVersion.current) return;
      if (!p) { setProject(null); return; }
      const [c, mp, eq, exps, wms, ho, quotes, invs, dns, pos] = await Promise.all([
        p.customer_id ? readProjectResult(supabase.from("customers").select("id, name").eq("id", p.customer_id).eq("company_id", co.id).single()) : null,
        readProjectResult(supabase.from("project_manpower").select("*").eq("project_id", projectId).eq("company_id", co.id).order("created_at")),
        readProjectResult(supabase.from("project_equipment").select("*").eq("project_id", projectId).eq("company_id", co.id).order("created_at")),
        readProjectResult(supabase.from("project_expenses").select("*").eq("project_id", projectId).eq("company_id", co.id).order("expense_date")),
        readProjectResult(supabase.from("work_method_statements").select("*").eq("project_id", projectId).eq("company_id", co.id).order("created_at")),
        readProjectResult(supabase.from("project_handovers").select("*").eq("project_id", projectId).eq("company_id", co.id).order("created_at")),
        readProjectResult(supabase.from("quotations").select("id, quotation_number, quotation_date, total_amount, status").eq("project_id", projectId).eq("company_id", co.id)),
        readProjectResult(supabase.from("tax_invoices").select("id, invoice_number, invoice_date, total_amount, status").eq("project_id", projectId).eq("company_id", co.id)),
        readProjectResult(supabase.from("delivery_notes").select("id, delivery_note_number, delivery_date, status").eq("project_id", projectId).eq("company_id", co.id)),
        readProjectResult(supabase.from("purchase_orders").select("id, purchase_order_number, order_date, total_amount, status").eq("project_id", projectId).eq("company_id", co.id)),
      ]);
      if (version !== loadVersion.current) return;
      setProject(p as Project);
      setCustomer(c as Customer | null);
      setCompany(co as CompanyDocInfo);
      setManpower((mp || []) as Manpower[]);
      setEquipment((eq || []) as Equipment[]);
      const savedExpenses = (exps || []) as ProjectExpense[];
      setExpenses(savedExpenses);
      setBrowserDrafts([]);
      setBrowserNotice("");
      try {
        const local = localStorage.getItem('dxb_project_expenses_' + projectId);
        if (local) {
          const parsed = JSON.parse(local);
          if (!Array.isArray(parsed) || parsed.some(row => !row || typeof row.id !== "string")) throw new Error("Invalid expense backup");
          setBrowserDrafts(unsavedProjectExpenses(savedExpenses, parsed as ProjectExpense[]));
        }
        const unfinished = localStorage.getItem('dxb_wms_draft_' + co.id + '_' + projectId);
        if (unfinished && !pendingWms.current) {
          const draft = JSON.parse(unfinished) as ProjectWmsDraft;
          if (draft.parent?.project_id === projectId && draft.parent.company_id === co.id && Array.isArray(draft.risks) && Array.isArray(draft.qaqc) && Array.isArray(draft.revHistory)) {
            pendingWms.current = draft;
            setWmsTitle(typeof draft.parent.title === "string" ? draft.parent.title : "");
            setWmsRevision(typeof draft.parent.revision === "string" ? draft.parent.revision : "");
            setWmsPreparedBy(typeof draft.parent.prepared_by === "string" ? draft.parent.prepared_by : "");
            setWmsApprovedBy(typeof draft.parent.approved_by === "string" ? draft.parent.approved_by : "");
            setWmsPurpose(typeof draft.parent.purpose === "string" ? draft.parent.purpose : "");
            setWmsScope(typeof draft.parent.scope === "string" ? draft.parent.scope : "");
            setWmsRefDocs(typeof draft.parent.reference_documents === "string" ? draft.parent.reference_documents : "");
            setWmsResponsibilities(typeof draft.parent.responsibilities === "string" ? draft.parent.responsibilities : "");
            setWmsMaterials(typeof draft.parent.materials === "string" ? draft.parent.materials : "");
            setWmsTools(typeof draft.parent.tools_equipment === "string" ? draft.parent.tools_equipment : "");
            setWmsPreInstallation(typeof draft.parent.pre_installation === "string" ? draft.parent.pre_installation : "");
            setWmsProcedure(typeof draft.parent.installation_procedure === "string" ? draft.parent.installation_procedure : "");
            setWmsQualityControl(typeof draft.parent.quality_control === "string" ? draft.parent.quality_control : "");
            setWmsHealthSafety(typeof draft.parent.health_safety === "string" ? draft.parent.health_safety : "");
            setWmsEnvironmental(typeof draft.parent.environmental === "string" ? draft.parent.environmental : "");
            setWmsAcceptanceCriteria(typeof draft.parent.acceptance_criteria === "string" ? draft.parent.acceptance_criteria : "");
            setWmsRisks(draft.risks as unknown as RiskAssessmentRow[]);
            setWmsQAQC(draft.qaqc as unknown as QAQCChecklistItem[]);
            setWmsRevHistory(draft.revHistory);
          } else {
            setBrowserNotice("An unfinished WMS backup has an incompatible format. It has been preserved for export.");
          }
        }
      } catch {
        setBrowserNotice("An existing browser backup could not be read. It has been preserved.");
      }
      setWmsList((wms || []) as WMS[]);
      setHandovers((ho || []) as Handover[]);
      const docs: LinkedDoc[] = [];
      (quotes || []).forEach(q => docs.push({id:q.id,type:"Quotation",ref_number:q.quotation_number,date:q.quotation_date,amount:q.total_amount,status:q.status}));
      (invs || []).forEach(i => docs.push({id:i.id,type:"Tax Invoice",ref_number:i.invoice_number,date:i.invoice_date,amount:i.total_amount,status:i.status}));
      (dns || []).forEach(d => docs.push({id:d.id,type:"Delivery Note",ref_number:d.delivery_note_number,date:d.delivery_date,status:d.status}));
      (pos || []).forEach(po => docs.push({id:po.id,type:"Purchase Order",ref_number:po.purchase_order_number,date:po.order_date,amount:po.total_amount,status:po.status}));
      setLinkedDocs(docs);
    } catch (error) {
      if (version === loadVersion.current) setLoadError(error instanceof Error ? error.message : "Could not load saved project data.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  async function runProjectAction(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setSavingItem(true);
    setActionError("");
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "The change could not be saved. Your entries have been kept."); }
    finally { actionInFlight.current = false; setSavingItem(false); }
  }

  function exportBrowserBackup() {
    if (!project) return;
    const backup = {project_id: projectId, expenses: localStorage.getItem('dxb_project_expenses_' + projectId), unfinishedWms: pendingWms.current, unfinishedWmsBackup: localStorage.getItem("dxb_wms_draft_" + project.company_id + "_" + projectId),
      wms: Object.fromEntries(wmsList.map(w => [w.id, localStorage.getItem('wms_extra_' + w.id)]))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)], {type:"application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = project.project_number + "-browser-backup.json"; link.click(); URL.revokeObjectURL(url);
  }

  // Only acknowledged cloud writes change displayed rows or clear form fields.
  async function handleAddManpower(e: React.FormEvent) {
    e.preventDefault();
    if (!mpRole.trim() || !project) return;
    await runProjectAction(async () => {
      await writeProjectResult(supabase.from("project_manpower").insert({project_id:projectId,company_id:project.company_id,
        role_name:mpRole.trim(),quantity:Number(mpQty),daily_rate:Number(mpRate),total_days:Number(mpDays),total_cost:Number(mpQty)*Number(mpRate)*Number(mpDays)}).select("id").single());
      setMpRole(""); await loadProjectDetails();
    });
  }

  async function handleDeleteManpower(id: string) {
    if (!project) return;
    await runProjectAction(async () => {
      await writeProjectResult(supabase.from("project_manpower").delete().eq("id",id).eq("project_id",projectId).eq("company_id",project.company_id).select("id").single());
      setManpower(rows => rows.filter(row => row.id !== id));
    });
  }

  async function handleAddEquipment(e: React.FormEvent) {
    e.preventDefault();
    if (!eqName.trim() || !project) return;
    await runProjectAction(async () => {
      await writeProjectResult(supabase.from("project_equipment").insert({project_id:projectId,company_id:project.company_id,
        equipment_name:eqName.trim(),quantity:Number(eqQty),rate_per_day:Number(eqRate),total_days:Number(eqDays),total_cost:Number(eqQty)*Number(eqRate)*Number(eqDays)}).select("id").single());
      setEqName(""); await loadProjectDetails();
    });
  }

  async function handleDeleteEquipment(id: string) {
    if (!project) return;
    await runProjectAction(async () => {
      await writeProjectResult(supabase.from("project_equipment").delete().eq("id",id).eq("project_id",projectId).eq("company_id",project.company_id).select("id").single());
      setEquipment(rows => rows.filter(row => row.id !== id));
    });
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expDesc.trim() || !project) return;
    await runProjectAction(async () => {
      const saved = await writeProjectResult<ProjectExpense>(supabase.from("project_expenses").insert({description:expDesc.trim(),category:expCat,
        amount:Number(expAmount),expense_date:expDate || todayISO(),receipt_ref:expRef.trim() || null,project_id:projectId,company_id:project.company_id}).select("*").single());
      setExpenses(rows => [...rows,saved as ProjectExpense]);
      setExpDesc(""); setExpRef("");
    });
  }

  async function handleDeleteExpense(id: string) {
    if (!project) return;
    await runProjectAction(async () => {
      await writeProjectResult(supabase.from("project_expenses").delete().eq("id",id).eq("project_id",projectId).eq("company_id",project.company_id).select("id").single());
      setExpenses(rows => rows.filter(row => row.id !== id));
    });
  }

  // Keep a stable, recoverable draft if any child write fails. Retry uses the same IDs.
  async function handleCreateWms(e: React.FormEvent) {
    e.preventDefault();
    if (!project || (!wmsTitle.trim() && !pendingWms.current)) return;
    await runProjectAction(async () => {
      if (!pendingWms.current) {
        const wmsNo = await generateDocNumber(project.company_id, "WMS");
        const id = crypto.randomUUID();
        pendingWms.current = {
          parent: {id,project_id:projectId,company_id:project.company_id,wms_number:wmsNo,title:wmsTitle.trim(),
            location:project.location,main_contractor:project.main_contractor,subcontractor:project.subcontractor,
            prepared_by:wmsPreparedBy.trim() || null,approved_by:wmsApprovedBy.trim() || null,revision:wmsRevision,
            purpose:wmsPurpose.trim() || null,scope:wmsScope.trim() || null,reference_documents:wmsRefDocs.trim() || null,
            responsibilities:wmsResponsibilities.trim() || null,materials:wmsMaterials.trim() || null,tools_equipment:wmsTools.trim() || null,
            pre_installation:wmsPreInstallation.trim() || null,installation_procedure:wmsProcedure.trim() || null,
            quality_control:wmsQualityControl.trim() || null,health_safety:wmsHealthSafety.trim() || null,
            environmental:wmsEnvironmental.trim() || null,acceptance_criteria:wmsAcceptanceCriteria.trim() || null,status:"Draft"},
          risks:wmsRisks.map((r,i)=>({id:crypto.randomUUID(),wms_id:id,company_id:project.company_id,activity:r.activity,hazard:r.hazard,
            control_measures:r.control_measures,risk_level:r.risk_level || "Medium",sequence_order:i+1})),
          qaqc:wmsQAQC.map(q=>({id:crypto.randomUUID(),wms_id:id,company_id:project.company_id,inspection_item:q.inspection_item,
            acceptance_criteria:q.acceptance_criteria || null,status:q.status || "Pending",inspector_name:q.inspector_name || null,remarks:q.remarks || null})),
          revHistory:wmsRevHistory.map(row=>({...row})),
        };
      }
      const draft = pendingWms.current;
      const key = 'dxb_wms_draft_' + project.company_id + '_' + projectId;
      // Write recovery data before network requests. Never discard another saved design or record.
      localStorage.setItem(key,JSON.stringify(draft));
      let revisionsSaved = false;
      try { revisionsSaved = await saveProjectWmsDraft(supabase,draft); }
      catch (error) { throw new Error('WMS "' + draft.parent.title + '" is unfinished. Your draft is preserved; retry to complete it. ' + (error instanceof Error ? error.message : "Saving failed.")); }
      localStorage.setItem('wms_extra_' + draft.parent.id,JSON.stringify({revHistory:draft.revHistory}));
      localStorage.removeItem(key);
      pendingWms.current = null;
      setShowWmsModal(false); setWmsTitle("");
      await loadProjectDetails();
      setBrowserNotice(revisionsSaved ? "WMS, assessments and revision history saved to cloud as a draft." : "WMS and assessments saved to cloud as a draft. The revision-history schema is not ready; a browser backup is preserved for export.");
    });
  }

  // Print WMS submittal with real structured risks, QA/QC checklist and schedules
  async function handlePrintWmsDoc(w: WMS) {
    if (!project) return;
    await runProjectAction(async () => {
    const [rData,qData] = await Promise.all([
      readProjectResult(supabase.from("wms_risk_assessments").select("*").eq("wms_id",w.id).eq("company_id",project.company_id).order("sequence_order")),
      readProjectResult(supabase.from("wms_qaqc_checklists").select("*").eq("wms_id",w.id).eq("company_id",project.company_id).order("created_at")),
    ]);
    const risks: RiskAssessmentRow[] = (rData || []).map(r=>({activity:r.activity,hazard:r.hazard,control_measures:r.control_measures,risk_level:r.risk_level}));
    const qaqc: QAQCChecklistItem[] = (qData || []).map(q=>({inspection_item:q.inspection_item,acceptance_criteria:q.acceptance_criteria,status:q.status,remarks:q.remarks,inspector_name:q.inspector_name}));
    let revHistory = Array.isArray(w.revision_history) ? w.revision_history : [{rev:w.revision,date:w.document_date || todayISO(),description:"Technical Method Statement Submittal",prepared_by:w.prepared_by || ""}];
    try {
      const local = localStorage.getItem('wms_extra_' + w.id);
      if (local) {
        const parsed = JSON.parse(local);
        if (!Array.isArray(w.revision_history) && parsed.revHistory?.length) {
          revHistory = parsed.revHistory;
          setBrowserNotice("This WMS preview includes revision history saved only in this browser. Export a backup before switching devices.");
        }
        if ((parsed.risks?.length && !risks.length) || (parsed.qaqc?.length && !qaqc.length)) {
          setBrowserNotice("Older assessments exist only in this browser. The preview uses saved cloud assessments; export the browser backup to preserve older entries.");
        }
      }
    } catch { setBrowserNotice("The browser revision backup could not be read. It has been preserved."); }

    const templateData: WMSData = {
      status: w.status,
      wms_number: w.wms_number,
      title: w.title,
      project_name: project.name,
      location: project.location,
      main_contractor: project.main_contractor,
      subcontractor: project.subcontractor,
      prepared_by: w.prepared_by,
      approved_by: w.approved_by,
      date: w.document_date || todayISO(),
      revision: w.revision,
      purpose: w.purpose,
      scope: w.scope,
      reference_documents: w.reference_documents,
      responsibilities: w.responsibilities,
      materials: w.materials,
      tools_equipment: w.tools_equipment,
      pre_installation: w.pre_installation,
      installation_procedure: w.installation_procedure,
      quality_control: w.quality_control,
      health_safety: w.health_safety,
      environmental: w.environmental,
      acceptance_criteria: w.acceptance_criteria,
      manpower_schedule: manpower.map(m => ({ role: m.role_name, count: m.quantity })),
      equipment_schedule: equipment.map(eq => ({ equipment: eq.equipment_name, count: eq.quantity })),
      risk_assessment: risks,
      qaqc_checklist: qaqc,
      revision_history: revHistory,
    };
    setPrintWms(templateData);
    });
  }

  async function handleCreateHandover(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    if (!hoScope.trim()) {setActionError("Enter the actual scope completed before saving a handover draft.");return;}
    await runProjectAction(async () => {
      const hoNo = await generateDocNumber(project.company_id,"HO");
      await writeProjectResult(supabase.from("project_handovers").insert({project_id:projectId,company_id:project.company_id,
        handover_number:hoNo,handover_date:todayISO(),scope_completed:hoScope.trim(),snags_remarks:hoSnags.trim() || null,
        client_representative:hoClientRep.trim() || null,contractor_representative:hoContractorRep.trim() || null,status:"Draft"}).select("id").single());
      setShowHandoverModal(false); await loadProjectDetails();
    });
  }

  // Financial Computations
  const totalLabourCost = manpower.reduce((s, m) => s + (Number(m.total_cost) || 0), 0);
  const totalEquipmentCost = equipment.reduce((s, eq) => s + (Number(eq.total_cost) || 0), 0);
  const totalMaterialPurchases = linkedDocs
    .filter(d => d.type === "Purchase Order")
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalDirectExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalInvoiced = linkedDocs
    .filter(d => d.type === "Tax Invoice")
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const totalProjectCost = totalLabourCost + totalEquipmentCost + totalMaterialPurchases + totalDirectExpenses;
  const contractValue = Number(project?.contract_value) || 0;
  const grossProfit = (totalInvoiced > 0 ? totalInvoiced : contractValue) - totalProjectCost;
  const profitMargin = (totalInvoiced > 0 ? totalInvoiced : contractValue) > 0
    ? (grossProfit / (totalInvoiced > 0 ? totalInvoiced : contractValue)) * 100
    : 0;

  if (loadError) return <ReportLoadState loading={loading} error={loadError} subject="project" unavailableMessage="Project totals and documents are unavailable until all saved data loads successfully." onRetry={() => void loadProjectDetails()} />;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">
        Project not found. <Link href="/projects" className="text-blue-600 underline">Return to projects</Link>
      </div>
    );
  }

  const actionFeedback = actionError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="app-screen-content no-print">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Back to Projects"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {project.project_number}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(project.status)}`}>
                  {project.status}
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-0.5">{project.name}</h1>
              <p className="text-xs text-slate-500">
                Client: <span className="font-semibold text-slate-700">{customer?.name || "—"}</span>
                {project.location && <> · Location: <span className="font-semibold text-slate-700">{project.location}</span></>}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">Contract Value</span>
            <span className="text-xl font-black font-mono text-slate-900">
              {fmtAED(project.contract_value)}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto flex max-w-7xl shrink-0 gap-6 overflow-x-auto px-6 text-xs font-semibold border-t border-slate-100">
          <button
            onClick={() => setActiveTab("costing")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "costing" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <TrendingUp size={15} /> Costing & Profitability
          </button>
          <button
            onClick={() => setActiveTab("manpower")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "manpower" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users size={15} /> Manpower Schedule ({manpower.length})
          </button>
          <button
            onClick={() => setActiveTab("equipment")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "equipment" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Wrench size={15} /> Equipment Schedule ({equipment.length})
          </button>
          <button
            onClick={() => setActiveTab("wms")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "wms" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText size={15} /> Method Statements (WMS) ({wmsList.length})
          </button>
          <button
            onClick={() => setActiveTab("handover")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "handover" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShieldCheck size={15} /> Handover Records ({handovers.length})
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`py-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "documents" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Briefcase size={15} /> Commercial Docs ({linkedDocs.length})
          </button>
          <Link
            href={`/measurements`}
            className="py-3 border-b-2 border-transparent text-emerald-700 hover:text-emerald-900 transition flex items-center gap-1.5 font-medium"
            title="Open Measurement & Takeoff Sheets"
          >
            <Ruler size={15} className="text-emerald-600" /> Takeoff &amp; Estimation
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {actionFeedback}
        {(browserNotice || browserDrafts.length > 0 || pendingWms.current) && <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {browserNotice && <p>{browserNotice}</p>}
          {browserDrafts.length > 0 && <><p>{browserDrafts.length} older expenses are saved only in this browser. They are preserved below and excluded from cloud totals.</p><ul className="mt-2 space-y-1">{browserDrafts.map(row=><li key={row.id}>{row.description} — {fmtAED(row.amount)}</li>)}</ul></>}
          {pendingWms.current && <p>An unfinished WMS draft, “{pendingWms.current.parent.title}”, is preserved. Open Create Method Statement to retry it.</p>}
          <button type="button" onClick={exportBrowserBackup} className="mt-3 rounded-lg border border-amber-300 px-3 py-2 font-semibold">Export browser backup</button>
        </section>}
        {/* TAB 1: Costing & Profitability */}
        {activeTab === "costing" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500 block font-medium">Contract Value</span>
                <span className="text-lg font-bold font-mono text-slate-900 mt-1 block">{fmtAED(contractValue)}</span>
                <span className="text-[10px] text-slate-400">Total agreed client price</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500 block font-medium">Total Project Cost</span>
                <span className="text-lg font-bold font-mono text-rose-700 mt-1 block">{fmtAED(totalProjectCost)}</span>
                <span className="text-[10px] text-slate-400">Labour + Equipment + Materials + Expenses</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500 block font-medium">Gross Profit</span>
                <span className={`text-lg font-bold font-mono mt-1 block ${grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtAED(grossProfit)}
                </span>
                <span className="text-[10px] text-slate-400">{totalInvoiced > 0 ? "Linked invoice value less project costs" : "Contract value less project costs"}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs text-slate-500 block font-medium">Profit Margin</span>
                <span className={`text-lg font-black font-mono mt-1 block ${profitMargin >= 15 ? "text-emerald-700" : profitMargin > 0 ? "text-amber-700" : "text-rose-700"}`}>
                  {profitMargin.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400">{totalInvoiced > 0 ? "Margin on linked invoice value" : "Margin on contract value"}</span>
              </div>
            </div>

            {/* Cost Breakdown Cards (4 Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Users size={15} /> Labour Costs
                  </h3>
                  <span className="font-mono font-bold text-slate-900 text-xs">{fmtAED(totalLabourCost)}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {manpower.length} scheduled manpower allocation roles.
                </p>
                <button
                  onClick={() => setActiveTab("manpower")}
                  className="mt-2 text-xs text-blue-600 hover:underline font-medium"
                >
                  Manage Manpower →
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Wrench size={15} /> Equipment Costs
                  </h3>
                  <span className="font-mono font-bold text-slate-900 text-xs">{fmtAED(totalEquipmentCost)}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {equipment.length} scheduled site machinery items.
                </p>
                <button
                  onClick={() => setActiveTab("equipment")}
                  className="mt-2 text-xs text-blue-600 hover:underline font-medium"
                >
                  Manage Equipment →
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <DollarSign size={15} /> Material Purchases
                  </h3>
                  <span className="font-mono font-bold text-slate-900 text-xs">{fmtAED(totalMaterialPurchases)}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Purchase orders issued to suppliers.
                </p>
                <button
                  onClick={() => setActiveTab("documents")}
                  className="mt-2 text-xs text-blue-600 hover:underline font-medium"
                >
                  View Linked POs →
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <DollarSign size={15} /> Direct Expenses
                  </h3>
                  <span className="font-mono font-bold text-slate-900 text-xs">{fmtAED(totalDirectExpenses)}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {expenses.length} logged permits, fees, and tests.
                </p>
                <span className="mt-2 inline-block text-xs text-emerald-700 font-medium">
                  Tracked Below ↓
                </span>
              </div>
            </div>

            {/* Direct Project Expenses & Permits Section */}
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Direct Project Expenses &amp; Permits</h3>
                    <p className="text-xs text-slate-500">Record authority fees, third-party testing, mobilization, logistics, and site consumables</p>
                  </div>
                </div>

                <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs">
                  <div className="md:col-span-2">
                    <label className="mb-1 block font-medium text-slate-600">Expense Description <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={expDesc}
                      onChange={e => setExpDesc(e.target.value)}
                      placeholder="e.g. Dubai Municipality NOC & Road Permit"
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-600">Category</label>
                    <select
                      value={expCat}
                      onChange={e => setExpCat(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none"
                    >
                      <option>Permits &amp; Government Fees</option>
                      <option>Testing &amp; Commissioning</option>
                      <option>Logistics &amp; Transport</option>
                      <option>Subcontractor Direct</option>
                      <option>Consumables &amp; Tools</option>
                      <option>Site Utilities &amp; Fuel</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-600">Amount (AED) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={expAmount}
                      onChange={e => setExpAmount(Number(e.target.value))}
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-slate-600">Receipt / Ref</label>
                    <input
                      type="text"
                      value={expRef}
                      onChange={e => setExpRef(e.target.value)}
                      placeholder="e.g. REC-8492"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={savingItem}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Plus size={14} /> Add Expense
                    </button>
                  </div>
                </form>

                {/* Expenses Table */}
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left font-semibold uppercase text-slate-500 border-b border-slate-100">
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Receipt / Ref</th>
                        <th className="px-4 py-3 text-right">Amount (AED)</th>
                        <th className="px-4 py-3 text-center w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.map(ex => (
                        <tr key={ex.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{ex.description}</td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                              {ex.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{ex.expense_date}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{ex.receipt_ref || "—"}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmtAED(ex.amount)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteExpense(ex.id)}
                              className="text-slate-400 hover:text-red-500"
                              title="Delete Expense"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {expenses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400">
                            No direct expenses logged yet. Add municipality permits, testing charges, or logistics fees above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                        <td colSpan={4} className="px-4 py-3 text-right">Total Direct Expenses:</td>
                        <td className="px-4 py-3 text-right font-mono text-sm">{fmtAED(totalDirectExpenses)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Manpower Schedule */}
        {activeTab === "manpower" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Add Manpower Allocation</h3>
              <form onSubmit={handleAddManpower} className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Role / Trade</label>
                  <input
                    type="text"
                    value={mpRole}
                    onChange={e => setMpRole(e.target.value)}
                    placeholder="e.g. Lead Pipefitter"
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Quantity (Workers)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={mpQty}
                    onChange={e => setMpQty(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Daily Rate (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={mpRate}
                    onChange={e => setMpRate(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Total Days</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={mpDays}
                    onChange={e => setMpDays(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingItem}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Plus size={14} /> Add Role
                  </button>
                </div>
              </form>
            </div>

            {/* Manpower Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left font-semibold uppercase text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3">Role / Trade</th>
                    <th className="px-4 py-3 text-center">Headcount</th>
                    <th className="px-4 py-3 text-right">Daily Rate</th>
                    <th className="px-4 py-3 text-center">Days</th>
                    <th className="px-4 py-3 text-right">Total Labour Cost</th>
                    <th className="px-4 py-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manpower.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{m.role_name}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold">{m.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtAED(m.daily_rate)}</td>
                      <td className="px-4 py-3 text-center font-mono">{m.total_days}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmtAED(m.total_cost)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteManpower(m.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {manpower.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No manpower allocated. Add worker roles above to calculate labour costs.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={4} className="px-4 py-3 text-right">Total Labour Cost:</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{fmtAED(totalLabourCost)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Equipment Schedule */}
        {activeTab === "equipment" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Add Equipment & Machinery</h3>
              <form onSubmit={handleAddEquipment} className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Equipment Name</label>
                  <input
                    type="text"
                    value={eqName}
                    onChange={e => setEqName(e.target.value)}
                    placeholder="e.g. Scaffolding Tower"
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={eqQty}
                    onChange={e => setEqQty(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Rate / Day (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={eqRate}
                    onChange={e => setEqRate(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-600">Total Days</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={eqDays}
                    onChange={e => setEqDays(Number(e.target.value))}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingItem}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Plus size={14} /> Add Equipment
                  </button>
                </div>
              </form>
            </div>

            {/* Equipment Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left font-semibold uppercase text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3">Equipment Item</th>
                    <th className="px-4 py-3 text-center">Units</th>
                    <th className="px-4 py-3 text-right">Daily Rate</th>
                    <th className="px-4 py-3 text-center">Days</th>
                    <th className="px-4 py-3 text-right">Total Equipment Cost</th>
                    <th className="px-4 py-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {equipment.map(eq => (
                    <tr key={eq.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{eq.equipment_name}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold">{eq.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtAED(eq.rate_per_day)}</td>
                      <td className="px-4 py-3 text-center font-mono">{eq.total_days}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmtAED(eq.total_cost)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteEquipment(eq.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {equipment.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No equipment recorded. Add equipment above to calculate direct machinery costs.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={4} className="px-4 py-3 text-right">Total Equipment Cost:</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{fmtAED(totalEquipmentCost)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Work Method Statements (WMS) */}
        {activeTab === "wms" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Technical Work Method Statements</h3>
                <p className="text-xs text-slate-500">Submittal documents, revision control, structured risk assessments, and QA/QC inspection checklists</p>
              </div>
              <button
                onClick={() => setShowWmsModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                <Plus size={15} /> Create Method Statement
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wmsList.map(w => (
                <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {w.wms_number}
                      </span>
                      <span className="font-bold font-mono text-xs text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                        {w.revision}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm mb-1">{w.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{w.scope || w.purpose || "Complete installation, safety & QA/QC checklist"}</p>

                    <div className="text-[11px] text-slate-600 space-y-0.5 border-t border-slate-100 pt-2">
                      <div>Prepared: <span className="font-semibold">{w.prepared_by || "Site Engineer"}</span></div>
                      <div>Approved: <span className="font-semibold">{w.approved_by || "Project Manager"}</span></div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Date: {w.document_date || "Current"}
                    </span>
                    <button
                      onClick={() => handlePrintWmsDoc(w)}
                      className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                    >
                      <Printer size={13} /> Print Submittal
                    </button>
                  </div>
                </div>
              ))}
              {wmsList.length === 0 && (
                <div className="col-span-2 rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 text-xs">
                  No Method Statements created yet. Click above to generate a technical WMS with risk assessment.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Handover Records */}
        {activeTab === "handover" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Project Handover Records</h3>
                <p className="text-xs text-slate-500">Formal handover certificates, punch list status, client representative sign-offs, and DLP commencement</p>
              </div>
              <button
                onClick={() => setShowHandoverModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                <Plus size={15} /> Create Handover Record
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {handovers.map(ho => (
                <div key={ho.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {ho.handover_number}
                      </span>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {ho.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm mb-1">Handover Certificate</h4>
                    <p className="text-xs text-slate-700 mb-2">{ho.scope_completed}</p>
                    {ho.snags_remarks && (
                      <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-900 border border-amber-200 mb-3">
                        <span className="font-bold">Snag remarks: </span> {ho.snags_remarks}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <div>Client Rep: <span className="font-semibold">{ho.client_representative || "Client"}</span></div>
                      <div>Contractor Rep: <span className="font-semibold">{ho.contractor_representative || "Contractor"}</span></div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Date: {ho.handover_date}</span>
                    <button
                      onClick={() => {
                        const hData: HandoverData = {
                          handover_number: ho.handover_number,
                          handover_date: ho.handover_date,
                          project_name: project.name,
                          location: project.location,
                          customer_name: customer?.name || "Client",
                          main_contractor: project.main_contractor,
                          subcontractor: project.subcontractor,
                          scope_completed: ho.scope_completed,
                          snags_remarks: ho.snags_remarks,
                          client_representative: ho.client_representative,
                          contractor_representative: ho.contractor_representative,
                          status: ho.status,
                        };
                        setPrintHandover(hData);
                      }}
                      className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                    >
                      <Printer size={13} /> Print Certificate
                    </button>
                  </div>
                </div>
              ))}
              {handovers.length === 0 && (
                <div className="col-span-2 rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500 text-xs">
                  No handover records logged yet. Create a handover certificate once site works reach substantial completion.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: Linked Commercial Documents */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Linked Project Documents</h3>
                <p className="text-xs text-slate-500">Quotations, Tax Invoices, Delivery Notes, and Purchase Orders tagged to this project</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left font-semibold uppercase text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-3">Document Type</th>
                    <th className="px-4 py-3">Reference No</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount (AED)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linkedDocs.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{d.type}</td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{d.ref_number}</td>
                      <td className="px-4 py-3 text-slate-600">{d.date}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {d.amount !== undefined ? fmtAED(d.amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(d.status)}`}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {linkedDocs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No commercial documents currently linked to this project. Invoices, delivery notes, and purchase orders can be linked via project selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* New WMS Modal with Tabbed Technical Submittal, Risks, QA/QC, and Revisions */}
      {showWmsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowWmsModal(false)} />
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Create Technical Work Method Statement (WMS)</h3>
                <p className="text-xs text-slate-500">Engineering submittal, structured risk matrix, QA/QC checklist & revision tracking</p>
              </div>
              <button onClick={() => setShowWmsModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 text-sm font-bold">✕</button>
            </div>

            {/* Submittal Section Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-6 overflow-x-auto text-xs">
              {([
                { key: "general", label: "1. General & Scope" },
                { key: "methodology", label: "2. Methodology & Execution" },
                { key: "safety", label: "3. HSE & Quality Policy" },
                { key: "risks", label: `4. Risk Assessment (${wmsRisks.length})` },
                { key: "qaqc", label: `5. QA/QC Checklist (${wmsQAQC.length})` },
                { key: "revisions", label: `6. Revision History (${wmsRevHistory.length})` },
              ] satisfies { key: typeof wmsModalTab; label: string }[]).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setWmsModalTab(tab.key)}
                  className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition ${
                    wmsModalTab === tab.key
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreateWms} className="min-h-0 flex-1 overflow-y-auto p-6 text-xs space-y-4">
              {actionFeedback}
              <p className="rounded-lg bg-amber-50 p-3 text-amber-800">Saved as a draft. Assessments and revision history save to cloud when the database schema is ready. A browser recovery backup is kept.</p>
              {pendingWms.current && <p role="status" className="text-amber-800">Retrying the preserved unfinished draft: {pendingWms.current.parent.title}. Its entries are locked until saving completes.</p>}
              <fieldset disabled={savingItem || !!pendingWms.current} className="space-y-4">
              {/* TAB 1: General & Scope */}
              {wmsModalTab === "general" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Submittal Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={wmsTitle}
                      onChange={e => setWmsTitle(e.target.value)}
                      placeholder="e.g. Method Statement for Chilled Water Piping Installation & Pressure Testing"
                      required
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-slate-900 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Revision</label>
                      <input
                        type="text"
                        value={wmsRevision}
                        onChange={e => setWmsRevision(e.target.value)}
                        placeholder="Rev 00"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Prepared By</label>
                      <input
                        type="text"
                        value={wmsPreparedBy}
                        onChange={e => setWmsPreparedBy(e.target.value)}
                        placeholder="Site Engineer Name"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Approved By</label>
                      <input
                        type="text"
                        value={wmsApprovedBy}
                        onChange={e => setWmsApprovedBy(e.target.value)}
                        placeholder="Project Manager / Consultant"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Purpose of Work</label>
                    <textarea
                      value={wmsPurpose}
                      onChange={e => setWmsPurpose(e.target.value)}
                      rows={3}
                      placeholder="Define the technical objective, safety compliance, and engineering standards"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Scope of Work</label>
                    <textarea
                      value={wmsScope}
                      onChange={e => setWmsScope(e.target.value)}
                      rows={3}
                      placeholder="Detail boundaries, work areas, and technical packages covered by this submittal"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: Methodology & Execution */}
              {wmsModalTab === "methodology" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Reference Documents & Codes</label>
                      <textarea
                        value={wmsRefDocs}
                        onChange={e => setWmsRefDocs(e.target.value)}
                        rows={2}
                        placeholder="Project IFC Drawings, Approved Material Submittal (MAS), UAE Fire & Life Safety Code"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Key Roles & Responsibilities</label>
                      <textarea
                        value={wmsResponsibilities}
                        onChange={e => setWmsResponsibilities(e.target.value)}
                        rows={2}
                        placeholder="Project Manager, Site Engineer, QA/QC Engineer, Safety Officer duties"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Material Handling & Storage</label>
                      <textarea
                        value={wmsMaterials}
                        onChange={e => setWmsMaterials(e.target.value)}
                        rows={2}
                        placeholder="Delivery inspection, offloading method, covered storage, and weather protection"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Plant, Tools & Equipment</label>
                      <textarea
                        value={wmsTools}
                        onChange={e => setWmsTools(e.target.value)}
                        rows={2}
                        placeholder="Power tools (110V), torque wrenches, scaffolding, PPE, calibrated test gauges"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Pre-Installation Requirements & Clearances</label>
                    <textarea
                      value={wmsPreInstallation}
                      onChange={e => setWmsPreInstallation(e.target.value)}
                      rows={2}
                      placeholder="Civil clearances, PTW approvals, toolbox talk briefings, survey coordinate checks"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Step-by-Step Installation & Execution Procedures</label>
                    <textarea
                      value={wmsProcedure}
                      onChange={e => setWmsProcedure(e.target.value)}
                      rows={5}
                      placeholder="Sequential numbered steps for site execution..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: HSE & Quality Policy */}
              {wmsModalTab === "safety" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Quality Control Strategy & Inspection Points</label>
                    <textarea
                      value={wmsQualityControl}
                      onChange={e => setWmsQualityControl(e.target.value)}
                      rows={3}
                      placeholder="WIR stages, hold points, witness points, 100% visual checks, and consultant notifications"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Health & Safety Precautions (HSE / PPE)</label>
                    <textarea
                      value={wmsHealthSafety}
                      onChange={e => setWmsHealthSafety(e.target.value)}
                      rows={3}
                      placeholder="5-point PPE, work at height controls, double lanyards, hot work permits, fire extinguishers"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Environmental & Waste Management</label>
                      <textarea
                        value={wmsEnvironmental}
                        onChange={e => setWmsEnvironmental(e.target.value)}
                        rows={3}
                        placeholder="Waste segregation at source, zero chemical discharge, noise and dust suppression"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Final Acceptance Criteria</label>
                      <textarea
                        value={wmsAcceptanceCriteria}
                        onChange={e => setWmsAcceptanceCriteria(e.target.value)}
                        rows={3}
                        placeholder="Deliverables, zero punch-list defects, approved WIR sign-off, compliance with specifications"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Structured Risk Assessment */}
              {wmsModalTab === "risks" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Site Risk Assessment Matrix</h4>
                      <p className="text-slate-500 text-[11px]">Structured job hazard analysis with activity, risk ratings, and control measures</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWmsRisks([
                        ...wmsRisks,
                        { activity: "", hazard: "", control_measures: "", risk_level: "Medium" }
                      ])}
                      className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={13} /> Add Hazard Row
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-1/4">Activity / Task</th>
                          <th className="p-2.5 w-1/4">Identified Hazard</th>
                          <th className="p-2.5">Preventative & Control Measures</th>
                          <th className="p-2.5 w-28 text-center">Risk Level</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {wmsRisks.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">
                              <input
                                type="text"
                                value={r.activity}
                                onChange={e => {
                                  const copy = [...wmsRisks];
                                  copy[idx].activity = e.target.value;
                                  setWmsRisks(copy);
                                }}
                                placeholder="Activity description"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={r.hazard}
                                onChange={e => {
                                  const copy = [...wmsRisks];
                                  copy[idx].hazard = e.target.value;
                                  setWmsRisks(copy);
                                }}
                                placeholder="Hazard / Exposure"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={r.control_measures}
                                onChange={e => {
                                  const copy = [...wmsRisks];
                                  copy[idx].control_measures = e.target.value;
                                  setWmsRisks(copy);
                                }}
                                placeholder="Control measures & safeguards"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <select
                                value={r.risk_level || "Medium"}
                                onChange={e => {
                                  const copy = [...wmsRisks];
                                  copy[idx].risk_level = e.target.value;
                                  setWmsRisks(copy);
                                }}
                                className={`w-full rounded border px-2 py-1.5 text-xs font-semibold ${
                                  r.risk_level === "High"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : r.risk_level === "Medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setWmsRisks(wmsRisks.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {wmsRisks.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
                              No risk assessment rows added yet. Click &quot;Add Hazard Row&quot; above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: QA/QC Inspection Checklist */}
              {wmsModalTab === "qaqc" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">QA/QC Inspection & Verification Checklist</h4>
                      <p className="text-slate-500 text-[11px]">Inspection items, acceptance criteria, inspector role, and verification status</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWmsQAQC([
                        ...wmsQAQC,
                        { inspection_item: "", acceptance_criteria: "", status: "Pending", inspector_name: "", remarks: "" }
                      ])}
                      className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={13} /> Add Inspection Item
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-1/4">Inspection Item</th>
                          <th className="p-2.5 w-1/4">Acceptance Criteria</th>
                          <th className="p-2.5 w-24 text-center">Status</th>
                          <th className="p-2.5 w-32">Inspector Role</th>
                          <th className="p-2.5">Remarks</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {wmsQAQC.map((q, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">
                              <input
                                type="text"
                                value={q.inspection_item}
                                onChange={e => {
                                  const copy = [...wmsQAQC];
                                  copy[idx].inspection_item = e.target.value;
                                  setWmsQAQC(copy);
                                }}
                                placeholder="e.g. MIR submittal check"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={q.acceptance_criteria || ""}
                                onChange={e => {
                                  const copy = [...wmsQAQC];
                                  copy[idx].acceptance_criteria = e.target.value;
                                  setWmsQAQC(copy);
                                }}
                                placeholder="e.g. Matches IFC tolerances"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <select
                                value={q.status || "Pending"}
                                onChange={e => {
                                  const copy = [...wmsQAQC];
                                  copy[idx].status = e.target.value;
                                  setWmsQAQC(copy);
                                }}
                                className={`w-full rounded border px-2 py-1.5 text-xs font-semibold ${
                                  q.status === "Pass"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : q.status === "Fail"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : q.status === "Hold"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                <option value="Pass">Pass</option>
                                <option value="Fail">Fail</option>
                                <option value="Hold">Hold</option>
                                <option value="Pending">Pending</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={q.inspector_name || ""}
                                onChange={e => {
                                  const copy = [...wmsQAQC];
                                  copy[idx].inspector_name = e.target.value;
                                  setWmsQAQC(copy);
                                }}
                                placeholder="e.g. QA/QC Eng"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={q.remarks || ""}
                                onChange={e => {
                                  const copy = [...wmsQAQC];
                                  copy[idx].remarks = e.target.value;
                                  setWmsQAQC(copy);
                                }}
                                placeholder="Verification notes"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setWmsQAQC(wmsQAQC.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {wmsQAQC.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400">
                              No QA/QC inspection items added yet. Click &quot;Add Inspection Item&quot; above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: Revision History Control */}
              {wmsModalTab === "revisions" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Document Revision Control Log</h4>
                      <p className="text-slate-500 text-[11px]">Submittal revision tracking per engineering standards (Rev 00, 01, 02)</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWmsRevHistory([
                        ...wmsRevHistory,
                        { rev: `Rev 0${wmsRevHistory.length}`, date: todayISO(), description: "", prepared_by: wmsPreparedBy || "Site Engineer" }
                      ])}
                      className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={13} /> Add Revision Entry
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-24">Revision</th>
                          <th className="p-2.5 w-32">Date</th>
                          <th className="p-2.5">Description of Amendments / Submittal Purpose</th>
                          <th className="p-2.5 w-36">Prepared By</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {wmsRevHistory.map((rev, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2">
                              <input
                                type="text"
                                value={rev.rev}
                                onChange={e => {
                                  const copy = [...wmsRevHistory];
                                  copy[idx].rev = e.target.value;
                                  setWmsRevHistory(copy);
                                }}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-mono font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="date"
                                value={rev.date}
                                onChange={e => {
                                  const copy = [...wmsRevHistory];
                                  copy[idx].date = e.target.value;
                                  setWmsRevHistory(copy);
                                }}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={rev.description}
                                onChange={e => {
                                  const copy = [...wmsRevHistory];
                                  copy[idx].description = e.target.value;
                                  setWmsRevHistory(copy);
                                }}
                                placeholder="e.g. Initial submittal / Revised per consultant comments"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={rev.prepared_by}
                                onChange={e => {
                                  const copy = [...wmsRevHistory];
                                  copy[idx].prepared_by = e.target.value;
                                  setWmsRevHistory(copy);
                                }}
                                placeholder="Engineer Name"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setWmsRevHistory(wmsRevHistory.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {wmsRevHistory.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
                              No revision history entries logged. Click &quot;Add Revision Entry&quot; above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              </fieldset>
              {/* Form Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div className="text-[11px] text-slate-400">
                  Fill in all relevant tabs before saving. All technical parameters are printed on official company letterhead.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWmsModal(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingItem}
                    className="rounded-lg bg-slate-900 px-5 py-2 font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {savingItem ? "Saving Submittal..." : pendingWms.current ? "Retry Unfinished WMS" : "Save Technical WMS Draft"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Handover Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHandoverModal(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="font-bold text-slate-900">Create Handover Record</h3>
              <button onClick={() => setShowHandoverModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">✕</button>
            </div>
            <form onSubmit={handleCreateHandover} className="p-6 space-y-3 text-xs">
              {actionFeedback}
              <p className="text-amber-700">Saved as a draft. Enter actual scope, snags and representatives; completion is not assumed.</p>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Scope Substantially Completed</label>
                <textarea
                  value={hoScope}
                  onChange={e => setHoScope(e.target.value)}
                  rows={3}
                  placeholder="Describe works inspected and handed over"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Snag List / Remaining Minor Items</label>
                <textarea
                  value={hoSnags}
                  onChange={e => setHoSnags(e.target.value)}
                  rows={2}
                  placeholder="Minor punch-list items to be cleared in 14 days"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Client Representative</label>
                  <input
                    type="text"
                    value={hoClientRep}
                    onChange={e => setHoClientRep(e.target.value)}
                    placeholder="Client Engineer Name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Contractor Representative</label>
                  <input
                    type="text"
                    value={hoContractorRep}
                    onChange={e => setHoContractorRep(e.target.value)}
                    placeholder="Project Manager Name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowHandoverModal(false)} className="rounded-lg border px-4 py-2 text-slate-600">Cancel</button>
                <button type="submit" disabled={savingItem} className="rounded-lg bg-slate-900 px-5 py-2 font-semibold text-white">Save Handover</button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>

      {/* WMS Print Modal */}
      <PrintModal isOpen={!!printWms} onClose={() => setPrintWms(null)}>
        {printWms && (
          <WorkMethodStatementTemplate
            company={company}
            wms={printWms}
            onClose={() => setPrintWms(null)}
          />
        )}
      </PrintModal>

      {/* Handover Print Modal */}
      <PrintModal isOpen={!!printHandover} onClose={() => setPrintHandover(null)}>
        {printHandover && (
          <ProjectHandoverTemplate
            company={company}
            handover={printHandover}
            onClose={() => setPrintHandover(null)}
          />
        )}
      </PrintModal>
    </main>
  );
}
