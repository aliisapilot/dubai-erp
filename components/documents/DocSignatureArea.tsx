"use client";

import React from "react";
import { CompanyStamp, AuthorizedSignature } from "./StampAndSignature";

type DocSignatureAreaProps = {
  mode?: "delivery" | "standard" | "salary" | "handover";
  preparedBy?: string | null;
  approvedBy?: string | null;
  receiverName?: string | null;
  receiverMobile?: string | null;
  companyName?: string | null;
  clientName?: string | null;
  preparedByTitle?: string;
  receivedByTitle?: string;
  signatureSrc?: string;
  stampSrc?: string;
  date?: string;
  /** Authorized signatory full name shown on the company side */
  signatoryName?: string | null;
  /** Authorized signatory designation shown on the company side */
  signatoryDesignation?: string | null;
  /** Client representative designation shown on the client side */
  clientDesignation?: string | null;
};

export default function DocSignatureArea({
  mode = "standard",
  preparedBy,
  approvedBy,
  receiverName,
  receiverMobile,
  companyName,
  clientName,
  preparedByTitle,
  receivedByTitle,
  signatureSrc,
  stampSrc,
  date,
  signatoryName,
  signatoryDesignation,
}: DocSignatureAreaProps) {
  if (mode === "delivery") {
    return (
      <div className="mt-4 print:mt-2.5 grid grid-cols-2 gap-4 print:gap-3 border-t-2 pt-3 print:pt-2 text-xs avoid-break" style={{ borderColor: "var(--doc-border)" }}>
        {/* Left: Dispatch / Company Authorisation */}
        <div className="rounded border bg-slate-50/60 p-3" style={{ borderColor: "var(--doc-border)" }}>
          <div className="font-bold uppercase tracking-wide mb-2 text-[11px]" style={{ color: "var(--doc-primary)" }}>
            Issued / Dispatched By (جهة الإصدار والترحيل)
          </div>
          <div className="space-y-3 mt-4 text-[11px]" style={{ color: "var(--doc-text)" }}>
            <div>
              <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Company Name:</span>
              <span className="font-semibold">{companyName || "Dubai ERP Operations"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Prepared By:</span>
                <span className="font-semibold">{preparedBy || "Operations Dept."}</span>
              </div>
              <div>
                <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Date:</span>
                <span>{date || "____________________"}</span>
              </div>
            </div>
            <div className="pt-4 border-t border-dashed flex items-center justify-between" style={{ borderColor: "var(--doc-border)" }}>
              <div>
                <span className="block text-[10px] mb-1" style={{ color: "var(--doc-muted)" }}>Authorized Signature:</span>
                {signatureSrc ? (
                  <AuthorizedSignature src={signatureSrc} title={preparedByTitle || "Logistics Dispatcher"} />
                ) : (
                  <div className="h-12 border-b border-dashed w-36" style={{ borderColor: "var(--doc-border)" }}></div>
                )}
              </div>
              {stampSrc && <CompanyStamp src={stampSrc} size={72} />}
            </div>
          </div>
        </div>

        {/* Right: Receiver Acknowledgement */}
        <div className="rounded border bg-white p-3" style={{ borderColor: "var(--doc-border)" }}>
          <div className="font-bold uppercase tracking-wide mb-2 text-[11px]" style={{ color: "var(--doc-primary)" }}>
            Received In Good Order (استلام البضاعة بحالة سليمة)
          </div>
          <div className="space-y-3 mt-4 text-[11px]" style={{ color: "var(--doc-text)" }}>
            <div>
              <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Receiver Full Name:</span>
              <span className="font-semibold">{receiverName || "______________________________"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Receiver Mobile:</span>
                <span className="font-mono">{receiverMobile || "__________________"}</span>
              </div>
              <div>
                <span className="block text-[10px]" style={{ color: "var(--doc-muted)" }}>Received Date &amp; Time:</span>
                <span>____________________</span>
              </div>
            </div>
            <div className="pt-4 border-t border-dashed flex items-center justify-between" style={{ borderColor: "var(--doc-border)" }}>
              <div>
                <span className="block text-[10px] mb-1" style={{ color: "var(--doc-muted)" }}>Receiver Signature:</span>
                <div className="h-12 border-b border-dashed w-36" style={{ borderColor: "var(--doc-border)" }}></div>
              </div>
              <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>
                Customer Seal / Stamp
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "salary") {
    return (
      <div className="mt-4 print:mt-2.5 grid grid-cols-3 gap-3 print:gap-2 border-t-2 pt-3 print:pt-2 text-xs avoid-break" style={{ borderColor: "var(--doc-border)" }}>
        <div className="rounded border p-3 text-center" style={{ borderColor: "var(--doc-border)" }}>
          <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--doc-muted)" }}>Prepared By (إعداد)</div>
          <div className="font-bold text-xs mt-1" style={{ color: "var(--doc-primary)" }}>{preparedBy || "HR Officer"}</div>
          <div className="h-14 border-b border-dashed my-1 flex items-center justify-center" style={{ borderColor: "var(--doc-border)" }}>
            {signatureSrc && <AuthorizedSignature src={signatureSrc} title="HR / Payroll Officer" />}
          </div>
          <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>Signature &amp; Date</div>
        </div>
        <div className="rounded border p-3 text-center" style={{ borderColor: "var(--doc-border)" }}>
          <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--doc-muted)" }}>Approved By (اعتماد)</div>
          <div className="font-bold text-xs mt-1" style={{ color: "var(--doc-primary)" }}>{approvedBy || "Finance Director"}</div>
          <div className="h-14 border-b border-dashed my-1 flex items-center justify-center" style={{ borderColor: "var(--doc-border)" }}>
            {stampSrc && <CompanyStamp src={stampSrc} size={64} />}
          </div>
          <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>Signature &amp; Seal</div>
        </div>
        <div className="rounded border p-3 text-center" style={{ borderColor: "var(--doc-border)" }}>
          <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--doc-muted)" }}>Employee Acknowledgment (توقيع الموظف)</div>
          <div className="font-bold text-xs mt-1" style={{ color: "var(--doc-primary)" }}>{receiverName || "Employee"}</div>
          <div className="h-14 border-b border-dashed my-1" style={{ borderColor: "var(--doc-border)" }}></div>
          <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>Signature &amp; Date</div>
        </div>
      </div>
    );
  }

  if (mode === "handover") {
    return (
      <div className="mt-4 print:mt-2.5 grid grid-cols-2 gap-4 print:gap-3 border-t-2 pt-3 print:pt-2 text-xs avoid-break" style={{ borderColor: "var(--doc-border)" }}>
        <div className="rounded border p-3" style={{ borderColor: "var(--doc-border)" }}>
          <div className="font-bold uppercase text-[11px] mb-2" style={{ color: "var(--doc-primary)" }}>
            Main Contractor / Handover Sign-off
          </div>
          <div className="space-y-2 text-[11px]">
            <p><span style={{ color: "var(--doc-muted)" }}>Representative:</span> <span className="font-semibold">{preparedBy || "Project Manager"}</span></p>
            <div className="h-16 border-b border-dashed my-2 flex items-center justify-between" style={{ borderColor: "var(--doc-border)" }}>
              {signatureSrc ? <AuthorizedSignature src={signatureSrc} title="Project Manager" /> : <div className="w-36"></div>}
              {stampSrc && <CompanyStamp src={stampSrc} size={64} />}
            </div>
            <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>Signature &amp; Official Seal</div>
          </div>
        </div>
        <div className="rounded border p-3" style={{ borderColor: "var(--doc-border)" }}>
          <div className="font-bold uppercase text-[11px] mb-2" style={{ color: "var(--doc-primary)" }}>
            Client / Consultant Acceptance Sign-off
          </div>
          <div className="space-y-2 text-[11px]">
            <p><span style={{ color: "var(--doc-muted)" }}>Client Rep:</span> <span className="font-semibold">{clientName || "Client Engineer"}</span></p>
            <div className="h-16 border-b border-dashed my-2 flex items-center justify-between" style={{ borderColor: "var(--doc-border)" }}>
              <div className="w-36"></div>
            </div>
            <div className="text-[10px]" style={{ color: "var(--doc-muted)" }}>Client Signature &amp; Stamp</div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STANDARD MODE — Used by: Quotations, Proforma, Tax Invoices, POs, Vouchers
  //
  // LEFT  = OUR COMPANY: stamp (real image only) + signature (real image only)
  //         + authorized signatory name + designation + date
  //
  // RIGHT = CLIENT: blank signature line + client rep name + date
  //         + optional client stamp area ("Client Stamp / Seal (Optional)")
  //
  // CRITICAL: Company stamp NEVER appears on the right (client) side.
  // ════════════════════════════════════════════════════════════════════════════
  const leftHeading =
    preparedByTitle && !preparedByTitle.toLowerCase().includes("sales engineer")
      ? preparedByTitle
      : "COMPANY AUTHORIZED SIGNATURE & STAMP";

  const rightHeading =
    receivedByTitle && !receivedByTitle.toLowerCase().includes("client acceptance")
      ? receivedByTitle
      : "CLIENT ACKNOWLEDGEMENT";

  const displayDate = date
    ? new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return (
    <div
      className="mt-4 print:mt-2.5 grid grid-cols-2 gap-4 print:gap-3 border-t-2 pt-3 print:pt-2 text-xs avoid-break"
      style={{ borderTopColor: "#C9A227" }}
    >
      {/* ── LEFT: Company Authorized Signature & Stamp ─────────────────────── */}
      <div
        className="rounded border p-3.5 bg-slate-50/50 flex flex-col justify-between"
        style={{ borderColor: "var(--doc-border, #E2E8F0)" }}
      >
        <div>
          {/* Section Heading */}
          <div
            className="font-bold uppercase tracking-wider text-[11px] mb-2 pb-1 border-b"
            style={{ color: "var(--doc-primary, #0F172A)", borderBottomColor: "var(--doc-accent, #C9A227)" }}
          >
            {leftHeading}
          </div>

          {/* Company name display */}
          {companyName && (
            <div className="text-[10px] font-semibold mb-2" style={{ color: "var(--doc-text, #1E293B)" }}>
              {companyName}
            </div>
          )}

          {/* Signature + Stamp row: horizontally aligned, slightly smaller, cleanly contained without overlapping */}
          <div
            className="flex items-center justify-between min-h-[58px] px-1 mb-3 pb-2 border-b border-dashed"
            style={{ borderColor: "var(--doc-border, #E2E8F0)" }}
          >
            {/* Real company signature image (slightly smaller: 110x42), blank/line if not uploaded */}
            <div className="flex-1 flex items-center justify-start pr-2">
              {signatureSrc ? (
                <AuthorizedSignature
                  src={signatureSrc}
                  alt="Authorized Company Signature"
                  showLabel={false}
                  width={110}
                  height={42}
                />
              ) : (
                <div className="h-10 w-28 border-b border-dashed" style={{ borderColor: "var(--doc-border, #CBD5E1)" }} />
              )}
            </div>

            {/* Real company stamp image (slightly smaller: 56px), blank if not uploaded */}
            <div className="flex-shrink-0 flex items-center justify-end pl-2">
              {stampSrc ? (
                <CompanyStamp src={stampSrc} size={56} alt="Official Company Stamp" />
              ) : (
                <div
                  className="w-28 h-14 border border-dashed rounded flex items-center justify-center text-center p-1"
                  style={{ borderColor: "var(--doc-border, #CBD5E1)", backgroundColor: "var(--doc-total-highlight, #F8FAFC)" }}
                >
                  <span className="text-[8.5px] leading-tight font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>
                    Company Stamp / Seal<br />(Official)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Signatory Details with ample whitespace */}
        <div className="space-y-1.5 text-[10px] mt-1" style={{ color: "var(--doc-text, #1E293B)" }}>
          <div>
            <span className="font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>Authorized Signatory: </span>
            <span className="font-semibold">{signatoryName || preparedBy || "__________________________"}</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>Designation: </span>
            <span>{signatoryDesignation || "__________________________"}</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>Date: </span>
            <span className="font-mono">{displayDate || "__________________________"}</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Client Acknowledgement ──────────────────────────────────── */}
      <div
        className="rounded border p-3.5 bg-white flex flex-col justify-between"
        style={{ borderColor: "var(--doc-border, #E2E8F0)" }}
      >
        <div>
          {/* Section Heading */}
          <div
            className="font-bold uppercase tracking-wider text-[11px] mb-2 pb-1 border-b"
            style={{ color: "var(--doc-primary, #0F172A)", borderBottomColor: "var(--doc-accent, #C9A227)" }}
          >
            {rightHeading}
          </div>

          {/* Client name display */}
          {clientName && (
            <div className="text-[10px] font-semibold mb-2" style={{ color: "var(--doc-text, #1E293B)" }}>
              {clientName}
            </div>
          )}

          {/* Client signature line + optional client stamp area (NO company stamp here) */}
          <div
            className="flex items-center justify-between min-h-[58px] px-1 mb-3 pb-2 border-b border-dashed"
            style={{ borderColor: "var(--doc-border, #E2E8F0)" }}
          >
            {/* Blank client signature line */}
            <div className="flex-1 flex flex-col justify-end pr-2">
              <div className="h-10 w-28 border-b border-dashed" style={{ borderColor: "var(--doc-border, #CBD5E1)" }} />
            </div>

            {/* Optional Client Stamp Area: clearly labeled */}
            <div
              className="flex-shrink-0 w-32 h-14 border border-dashed rounded flex items-center justify-center text-center p-1"
              style={{ borderColor: "var(--doc-border, #CBD5E1)", backgroundColor: "var(--doc-total-highlight, #F8FAFC)" }}
            >
              <span className="text-[8.5px] leading-tight font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>
                Client Stamp / Seal<br />(Optional)
              </span>
            </div>
          </div>
        </div>

        {/* Client Details */}
        <div className="space-y-1.5 text-[10px] mt-1" style={{ color: "var(--doc-text, #1E293B)" }}>
          <div>
            <span className="font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>Client Representative: </span>
            <span className="font-semibold">{clientName || "__________________________"}</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--doc-muted, #64748B)" }}>Date: </span>
            <span className="font-mono">__________________________</span>
          </div>
        </div>
      </div>
    </div>
  );
}
