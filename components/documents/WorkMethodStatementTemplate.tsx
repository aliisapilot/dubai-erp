"use client";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import { Users, Wrench, ShieldAlert, CheckCircle2 } from "lucide-react";
import DocumentContainer from "./DocumentContainer";

export type RiskAssessmentRow = {
  activity: string;
  hazard: string;
  control_measures: string;
  risk_level?: "Low" | "Medium" | "High" | string;
};

export type QAQCChecklistItem = {
  inspection_item: string;
  acceptance_criteria?: string | null;
  status: "Pass" | "Fail" | "Hold" | "Pending" | "N/A" | string;
  remarks?: string | null;
  inspector_name?: string | null;
  inspection_date?: string | null;
  approved_by?: string | null;
};

export type WMSData = {
  wms_number: string;
  title: string;
  project_name: string;
  location?: string | null;
  main_contractor?: string | null;
  subcontractor?: string | null;
  prepared_by?: string | null;
  approved_by?: string | null;
  date: string;
  revision: string; // e.g. "Rev 00"
  purpose?: string | null;
  scope?: string | null;
  reference_documents?: string | null;
  responsibilities?: string | null;
  materials?: string | null;
  tools_equipment?: string | null;
  pre_installation?: string | null;
  installation_procedure?: string | null;
  quality_control?: string | null;
  health_safety?: string | null;
  environmental?: string | null;
  acceptance_criteria?: string | null;
  manpower_schedule?: { role: string; count: number }[];
  equipment_schedule?: { equipment: string; count: number }[];
  risk_assessment: RiskAssessmentRow[];
  qaqc_checklist: QAQCChecklistItem[];
  revision_history?: { rev: string; date: string; description: string; prepared_by: string }[];
};

type WMSProps = {
  company: CompanyDocInfo | null;
  wms: WMSData;
  onClose?: () => void;
};

export default function WorkMethodStatementTemplate({
  company,
  wms,
  onClose,
}: WMSProps) {
  return (
    <DocumentContainer
      docTypeLabel="Method Statement"
      docNumber={`${wms.wms_number} [${wms.revision}]`}
      status="Approved"
      onClose={onClose}
      company={company ?? undefined}
    >
      <div className="space-y-6">
        {/* Letterhead Header */}
        <DocHeader
          company={company}
          docTitle="METHOD STATEMENT & RISK ASSESSMENT"
          arabicTitle="خطة وطريقة تنفيذ الأعمال وتقييم المخاطر"
          docNumber={`${wms.wms_number} [${wms.revision}]`}
          docDate={wms.date}
          subTitle={wms.title}
        />

        {/* Technical Submittal Document Control Grid */}
        <div className="rounded border-2 border-slate-900 overflow-hidden text-xs">
          <div className="bg-slate-900 text-white px-3 py-1.5 font-bold uppercase tracking-wider text-[11px]">
            Technical Document Control Information
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-200 bg-slate-50">
            <div className="p-3 space-y-1.5">
              <div>
                <span className="text-slate-500 block text-[10px]">Project Name:</span>
                <span className="font-bold text-slate-900 text-sm">{wms.project_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Project Location / Plot:</span>
                <span className="font-semibold text-slate-800">{wms.location || "Dubai, UAE"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Main Contractor:</span>
                <span className="font-semibold text-slate-800">{wms.main_contractor || "Main Contractor LLC"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Specialist Subcontractor:</span>
                <span className="font-semibold text-slate-900">{wms.subcontractor || company?.legal_name || company?.name}</span>
              </div>
            </div>

            <div className="p-3 space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block text-[10px]">Document Ref:</span>
                  <span className="font-mono font-bold text-slate-900">{wms.wms_number}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Revision Status:</span>
                  <span className="font-bold font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[11px] inline-block">
                    {wms.revision}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block text-[10px]">Prepared By:</span>
                  <span className="font-semibold text-slate-800">{wms.prepared_by || "Project Engineer"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Approved By:</span>
                  <span className="font-semibold text-slate-800">{wms.approved_by || "Project Manager"}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Submittal Date:</span>
                <span className="font-mono">{new Date(wms.date).toLocaleDateString("en-GB")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1 & 2: Purpose & Scope */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-slate-300 p-3 bg-white">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b pb-1">
              1. Purpose of Work
            </h3>
            <p className="text-slate-700 leading-relaxed text-[11px]">
              {wms.purpose || "To define the systematic and safe installation, testing, and quality requirements to ensure strict compliance with project specifications, authority regulations, and engineering standards."}
            </p>
          </div>
          <div className="rounded border border-slate-300 p-3 bg-white">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b pb-1">
              2. Scope of Work
            </h3>
            <p className="text-slate-700 leading-relaxed text-[11px]">
              {wms.scope || "Covers receiving inspection, handling, site storage, pre-installation preparation, installation procedures, QA/QC verification, and safety precautions for the complete execution."}
            </p>
          </div>
        </div>

        {/* Section 3: Reference Documents & Responsibilities */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-slate-300 p-3 bg-white">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b pb-1">
              3. Reference Documents & Specifications
            </h3>
            <p className="text-slate-700 leading-relaxed text-[11px]">
              {wms.reference_documents || "Project IFC Drawings, Approved Material Submittals (MAS), UAE Fire & Life Safety Code, Project HSE Plan, and Manufacturer Technical Guidelines."}
            </p>
          </div>
          <div className="rounded border border-slate-300 p-3 bg-white">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b pb-1">
              4. Key Responsibilities
            </h3>
            <p className="text-slate-700 leading-relaxed text-[11px]">
              {wms.responsibilities || "Project Manager ensures overall compliance and resources. Site Engineer directs daily operations. QA/QC Engineer verifies inspections. Safety Officer enforces permits and PPE."}
            </p>
          </div>
        </div>

        {/* Section 5: Manpower & Equipment Schedules */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="bg-slate-800 text-white px-3 py-1.5 font-bold text-[11px] flex items-center gap-1.5">
              <Users size={13} /> 5. Manpower Allocation Schedule
            </div>
            <div className="p-2.5 bg-slate-50 space-y-1">
              {wms.manpower_schedule && wms.manpower_schedule.length > 0 ? (
                wms.manpower_schedule.map((m, idx) => (
                  <div key={idx} className="flex justify-between py-0.5 border-b border-slate-200 text-[11px]">
                    <span className="text-slate-700">{m.role}</span>
                    <span className="font-bold font-mono text-slate-900">{m.count} No(s)</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-600 text-[11px] space-y-1">
                  <div className="flex justify-between"><span>Site Engineer:</span> <span className="font-bold">1</span></div>
                  <div className="flex justify-between"><span>Safety Officer:</span> <span className="font-bold">1</span></div>
                  <div className="flex justify-between"><span>Foreman / Chargehand:</span> <span className="font-bold">2</span></div>
                  <div className="flex justify-between"><span>Skilled Technicians:</span> <span className="font-bold">6</span></div>
                  <div className="flex justify-between"><span>General Helpers:</span> <span className="font-bold">4</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-300 overflow-hidden">
            <div className="bg-slate-800 text-white px-3 py-1.5 font-bold text-[11px] flex items-center gap-1.5">
              <Wrench size={13} /> 6. Tools & Equipment Schedule
            </div>
            <div className="p-2.5 bg-slate-50 space-y-1">
              {wms.equipment_schedule && wms.equipment_schedule.length > 0 ? (
                wms.equipment_schedule.map((eq, idx) => (
                  <div key={idx} className="flex justify-between py-0.5 border-b border-slate-200 text-[11px]">
                    <span className="text-slate-700">{eq.equipment}</span>
                    <span className="font-bold font-mono text-slate-900">{eq.count} Unit(s)</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-600 text-[11px] space-y-1">
                  <div className="flex justify-between"><span>Calibrated Measuring Tools:</span> <span className="font-bold">1 Set</span></div>
                  <div className="flex justify-between"><span>Mobile Scaffolding / Ladders:</span> <span className="font-bold">2 Sets</span></div>
                  <div className="flex justify-between"><span>Power Tools & Hand Drills:</span> <span className="font-bold">4 Nos</span></div>
                  <div className="flex justify-between"><span>Safety Equipment & Fire Extinguishers:</span> <span className="font-bold">2 Sets</span></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 7 & 8: Pre-installation & Installation Procedures */}
        <div className="rounded border border-slate-300 p-4 text-xs space-y-3 bg-white">
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1">
              7. Pre-Installation Inspection & Preparation
            </h3>
            <p className="text-slate-700 leading-relaxed text-[11px]">
              {wms.pre_installation || "Verify civil clearances, benchmarks, and MEP provisions. Check delivered materials against approved submittals and delivery notes. Obtain Permit to Work (PTW) from main contractor prior to commencement."}
            </p>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1">
              8. Step-by-Step Installation Procedure
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-line text-[11px]">
              {wms.installation_procedure || "1. Mark out alignments and bracket fixing locations according to approved drawings.\n2. Fix supports securely using approved anchors and torque specifications.\n3. Position equipment and secure all structural connections.\n4. Complete connections in conformity with engineering guidelines.\n5. Conduct preliminary checks and clean the workspace."}
            </p>
          </div>
          <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1">
                9. Quality Control & Acceptance
              </h3>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                {wms.quality_control || "Inspect all works in accordance with Project Quality Plan and submit Inspection & Test Plan (ITP) for Consultant sign-off."}
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 uppercase text-[11px] mb-1">
                10. HSE & Environmental Safeguards
              </h3>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                {wms.health_safety || "Mandatory PPE (Helmet, High-Vis Vest, Safety Shoes, Eye Protection). Work-at-height harness compliance and daily toolbox talk before shift."}
              </p>
            </div>
          </div>
        </div>

        {/* Section 11: Structured Risk Assessment Table */}
        <div className="overflow-hidden rounded border border-slate-300 text-xs avoid-break">
          <div className="bg-rose-900 text-white font-bold px-3 py-2 uppercase text-[11px] flex items-center gap-2">
            <ShieldAlert size={14} /> 11. Structured Risk Assessment (تقييم المخاطر وتدابير السلامة)
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
                <th className="py-2 px-3 w-10 text-center">#</th>
                <th className="py-2 px-3 w-48">Activity / Process</th>
                <th className="py-2 px-3 w-48">Potential Hazard</th>
                <th className="py-2 px-3">Control Measures & Safeguards</th>
                <th className="py-2 px-3 w-20 text-center">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {wms.risk_assessment && wms.risk_assessment.length > 0 ? (
                wms.risk_assessment.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="py-2 px-3 text-center font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{row.activity}</td>
                    <td className="py-2 px-3 text-rose-800">{row.hazard}</td>
                    <td className="py-2 px-3 text-slate-700 text-[11px]">{row.control_measures}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        row.risk_level === "High" ? "bg-rose-100 text-rose-800" :
                        row.risk_level === "Low" ? "bg-emerald-100 text-emerald-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {row.risk_level || "Medium"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="bg-white">
                    <td className="py-2 px-3 text-center font-mono">1</td>
                    <td className="py-2 px-3 font-semibold">Material Handling & Offloading</td>
                    <td className="py-2 px-3 text-rose-800">Back strain, falling items, pinch points</td>
                    <td className="py-2 px-3 text-[11px]">Mechanical lifting for heavy loads; safety gloves; clear pathway.</td>
                    <td className="py-2 px-3 text-center"><span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold text-[10px]">Medium</span></td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-2 px-3 text-center font-mono">2</td>
                    <td className="py-2 px-3 font-semibold">Working at Height</td>
                    <td className="py-2 px-3 text-rose-800">Falls from height, falling objects</td>
                    <td className="py-2 px-3 text-[11px]">Tagged mobile tower scaffolding, safety harness clipped 100%, exclusion zone.</td>
                    <td className="py-2 px-3 text-center"><span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold text-[10px]">High</span></td>
                  </tr>
                  <tr className="bg-white">
                    <td className="py-2 px-3 text-center font-mono">3</td>
                    <td className="py-2 px-3 font-semibold">Operation of Power Tools</td>
                    <td className="py-2 px-3 text-rose-800">Electric shock, flying debris, noise</td>
                    <td className="py-2 px-3 text-[11px]">Inspected 110V/safe cables with ELCB, eye protection, ear defenders.</td>
                    <td className="py-2 px-3 text-center"><span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold text-[10px]">Medium</span></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 12: QA/QC Inspection Checklist */}
        <div className="overflow-hidden rounded border border-slate-300 text-xs avoid-break">
          <div className="bg-slate-800 text-white font-bold px-3 py-2 uppercase text-[11px] flex items-center gap-2">
            <CheckCircle2 size={14} /> 12. QA/QC Inspection Checklist (قائمة فحص ومطابقة الجودة)
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
                <th className="py-2 px-3 w-10 text-center">#</th>
                <th className="py-2 px-3">Inspection Item</th>
                <th className="py-2 px-3 w-40">Acceptance Criteria</th>
                <th className="py-2 px-3 w-24 text-center">Status</th>
                <th className="py-2 px-3 w-36">Inspector / Date</th>
                <th className="py-2 px-3 w-36">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {wms.qaqc_checklist && wms.qaqc_checklist.length > 0 ? (
                wms.qaqc_checklist.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="py-2 px-3 text-center font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium text-slate-900">{item.inspection_item}</td>
                    <td className="py-2 px-3 text-slate-600 text-[11px]">{item.acceptance_criteria || "As per IFC drawing"}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === "Pass" ? "bg-emerald-100 text-emerald-800" :
                        item.status === "Fail" ? "bg-rose-100 text-rose-800" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 text-[11px]">
                      {item.inspector_name || "QA/QC Eng."} {item.inspection_date ? `(${item.inspection_date})` : ""}
                    </td>
                    <td className="py-2 px-3 text-slate-600 text-[11px]">{item.remarks || "Compliant"}</td>
                  </tr>
                ))
              ) : (
                <>
                  <tr className="bg-white">
                    <td className="py-2 px-3 text-center font-mono">1</td>
                    <td className="py-2 px-3 font-medium">Material Receiving Verification</td>
                    <td className="py-2 px-3 text-slate-600">Conforms to approved MAS</td>
                    <td className="py-2 px-3 text-center"><span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">Pass</span></td>
                    <td className="py-2 px-3 text-slate-600">QA/QC Eng.</td>
                    <td className="py-2 px-3 text-slate-600">Approved</td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-2 px-3 text-center font-mono">2</td>
                    <td className="py-2 px-3 font-medium">Alignment & Level Verification</td>
                    <td className="py-2 px-3 text-slate-600">Within +/- 2mm tolerance</td>
                    <td className="py-2 px-3 text-center"><span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">Pass</span></td>
                    <td className="py-2 px-3 text-slate-600">Surveyor</td>
                    <td className="py-2 px-3 text-slate-600">Checked</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="py-2 px-3 text-center font-mono">3</td>
                    <td className="py-2 px-3 font-medium">Fastener Torque & Support Check</td>
                    <td className="py-2 px-3 text-slate-600">Per manufacturer chart</td>
                    <td className="py-2 px-3 text-center"><span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">Pass</span></td>
                    <td className="py-2 px-3 text-slate-600">Site Eng.</td>
                    <td className="py-2 px-3 text-slate-600">Calibrated</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 13: Revision History Table */}
        <div className="overflow-hidden rounded border border-slate-300 text-xs avoid-break">
          <div className="bg-slate-100 font-bold text-slate-900 px-3 py-1.5 border-b border-slate-200 uppercase text-[10px]">
            Technical Document Revision Control Log (سجل مراجعات الوثيقة)
          </div>
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-1.5 px-3 w-20">Rev No</th>
                <th className="py-1.5 px-3 w-28">Date</th>
                <th className="py-1.5 px-3">Revision Description</th>
                <th className="py-1.5 px-3 w-36">Prepared By</th>
                <th className="py-1.5 px-3 w-36">Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              <tr className="font-mono">
                <td className="py-1.5 px-3 font-bold text-slate-900">{wms.revision}</td>
                <td className="py-1.5 px-3 text-slate-600">{new Date(wms.date).toLocaleDateString("en-GB")}</td>
                <td className="py-1.5 px-3 font-sans text-slate-800">Initial Submittal for Consultant Approval</td>
                <td className="py-1.5 px-3 font-sans text-slate-700">{wms.prepared_by || "Project Eng."}</td>
                <td className="py-1.5 px-3 font-sans text-slate-700">{wms.approved_by || "Project Mgr."}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Sign-off Multi-Party Matrix */}
        <div className="grid grid-cols-3 gap-4 border-t-2 border-slate-300 pt-4 text-xs avoid-break">
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Subcontractor Engineer</div>
            <div className="font-bold text-slate-800 text-xs mt-1">{wms.prepared_by || "Site Engineer"}</div>
            <div className="h-12 border-b border-dashed border-slate-300 my-2"></div>
            <div className="text-[10px] text-slate-400">Signature & Date</div>
          </div>
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Subcontractor PM Approval</div>
            <div className="font-bold text-slate-800 text-xs mt-1">{wms.approved_by || "Project Manager"}</div>
            <div className="h-12 border-b border-dashed border-slate-300 my-2"></div>
            <div className="text-[10px] text-slate-400">Signature & Stamp</div>
          </div>
          <div className="rounded border border-slate-200 p-3 text-center bg-slate-50">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Main Contractor / Consultant</div>
            <div className="font-bold text-slate-800 text-xs mt-1">Review & Sign-Off</div>
            <div className="h-12 border-b border-dashed border-slate-300 my-2"></div>
            <div className="text-[10px] text-slate-400">Status: Approved as Noted</div>
          </div>
        </div>

        {/* Footer */}
        <DocFooter
          customText="Dubai ERP Project Engineering Suite — Approved Construction Submittal."
        />
      </div>
    </DocumentContainer>
  );
}
