"use client";

import { useEffect, useState } from "react";
import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";
import { DocumentLayout, createDefaultLayout, loadDocumentLayout } from "@/lib/documentDesigner";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import DocSignatureArea from "./DocSignatureArea";
import { CheckCircle } from "lucide-react";
import DocumentContainer from "./DocumentContainer";

export type HandoverData = {
  handover_number: string;
  handover_date: string;
  project_name: string;
  location?: string | null;
  customer_name: string;
  main_contractor?: string | null;
  subcontractor?: string | null;
  scope_completed: string;
  snags_remarks?: string | null;
  client_representative?: string | null;
  contractor_representative?: string | null;
  status: string;
};

type HandoverProps = {
  company: CompanyDocInfo | null;
  handover: HandoverData;
  onClose?: () => void;
};

export default function ProjectHandoverTemplate({
  company,
  handover,
  onClose,
}: HandoverProps) {
  const [customLayout, setCustomLayout] = useState<DocumentLayout>(() => createDefaultLayout("project_handover"));

  useEffect(() => {
    loadDocumentLayout(company?.id, "project_handover").then((res) => {
      setCustomLayout(res.layout);
    });
  }, [company?.id]);

  const rendererData: MockDocumentData = {
    document_number: handover.handover_number,
    document_date: handover.handover_date,
    status: handover.status,
    customer_name: handover.customer_name,
    project_name: handover.project_name,
    location: handover.location || undefined,
    scope_of_work: handover.scope_completed,
    items: [
      {
        description: `Project Handover Scope: ${handover.scope_completed}`,
        quantity: 1,
        unit: "Project",
        unit_price: 0,
        vat_amount: 0,
        line_total: 0,
      },
    ],
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    notes: handover.snags_remarks || "Works inspected and formally accepted.",
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length);
  return (
    <DocumentContainer
      docTypeLabel="Handover Certificate"
      docNumber={handover.handover_number}
      status={handover.status}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
    >
      {customLayout ? (
        <div className="flex flex-col gap-6 print:gap-0">
          {Array.from({ length: totalPages }, (_, index) => (
            <DynamicDocumentRenderer
              key={index}
              layout={customLayout}
              company={company}
              data={rendererData}
              isDesignerPreview={false}
              scale={1}
              pageNumber={index + 1}
              totalPages={totalPages}
            />
          ))}
        </div>
      ) : (
        <>
      <div className="space-y-6">
        {/* Letterhead Header */}
        <DocHeader
          company={company}
          docTitle="PROJECT HANDOVER CERTIFICATE"
          arabicTitle="شهادة تسليم واستلام مشروع"
          docNumber={handover.handover_number}
          docDate={handover.handover_date}
          subTitle="Substantial Completion & Operational Handover Document"
        />

        {/* Project Information */}
        <div className="rounded border border-slate-300 bg-slate-50 p-4 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block text-[10px]">Project Name:</span>
              <span className="font-bold text-slate-900 text-sm">{handover.project_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Project Location / Site:</span>
              <span className="font-semibold text-slate-800">{handover.location || "Dubai, UAE"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">Client / Owner:</span>
              <span className="font-bold text-slate-800">{handover.customer_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Executing Contractor:</span>
              <span className="font-bold text-slate-800">{handover.subcontractor || company?.legal_name || company?.name}</span>
            </div>
          </div>
        </div>

        {/* Scope of Completion */}
        <div className="rounded border border-slate-300 p-4 text-xs space-y-2 bg-white">
          <div className="flex items-center gap-2 text-emerald-800 font-bold uppercase text-[11px] border-b pb-1">
            <CheckCircle size={15} /> Scope of Work Substantially Completed
          </div>
          <p className="text-slate-700 leading-relaxed text-[11px] whitespace-pre-line">
            {handover.scope_completed || "The contractor has completed the scheduled installation, testing, and commissioning works in accordance with the contract requirements, approved shop drawings, and technical specifications."}
          </p>
        </div>

        {/* Snag List / Outstanding Remarks */}
        <div className="rounded border border-slate-300 p-4 text-xs space-y-2 bg-white">
          <div className="font-bold text-slate-900 uppercase text-[11px] border-b pb-1">
            Minor Snags / Punch List / Remarks (قائمة الملاحظات والمتبقيات البسيطة)
          </div>
          <p className="text-slate-700 leading-relaxed text-[11px] whitespace-pre-line">
            {handover.snags_remarks || "No major critical snags noted. All minor touch-ups and final cleaning items to be cleared within 14 calendar days from the date of this certificate."}
          </p>
        </div>

        {/* Formal Mutual Handover Declaration */}
        <div className="rounded border border-dashed border-slate-300 bg-slate-50/50 p-4 text-[11px] text-slate-700 leading-relaxed">
          <strong>Mutual Acceptance Statement (إقرار التسليم والاستلام):</strong>
          <p className="mt-1 text-slate-600">
            By signing this certificate, both the Contractor and the Client/Consultant confirm that the works described above have been inspected and handed over in satisfactory working condition. The Defects Liability Period (DLP) shall commence from the date indicated on this certificate.
          </p>
        </div>

        {/* Handover Sign-off Block */}
        <DocSignatureArea
          mode="handover"
          preparedBy={handover.contractor_representative || "Contractor Representative"}
          clientName={handover.client_representative || "Client / Consultant Representative"}
        />

        {/* Footer */}
        <DocFooter
          customText="Official Handover Document. Valid upon mutual signatures and company stamps."
        />
      </div>
        </>
      )}
    </DocumentContainer>
  );
}
