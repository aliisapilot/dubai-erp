/**
 * Dubai ERP: Smart Import - Historical Status Accuracy & Evidence Resolver
 * Enforces historical accuracy: never assumes quotations are accepted, invoices are paid,
 * or projects are In Progress. Extracts reliable status evidence or applies neutral database fallbacks
 * visibly labeled as assumptions.
 */

import type { DocumentType, ExtractedField, StatusResolution } from "./types";

export interface StatusOption {
  value: string;
  label: string;
  isNeutralFallback?: boolean;
}

export const STATUS_OPTIONS_BY_MODULE: Record<string, StatusOption[]> = {
  quotation: [
    { value: "draft", label: "Draft (Neutral Fallback / Assumption)", isNeutralFallback: true },
    { value: "sent", label: "Sent (Submitted to Client)" },
    { value: "accepted", label: "Accepted (Client Confirmed / Signed)" },
    { value: "rejected", label: "Rejected (Client Declined)" },
    { value: "expired", label: "Expired (Validity Lapsed)" },
  ],
  tax_invoice: [
    { value: "draft", label: "Draft (Neutral Unpaid / Assumption)", isNeutralFallback: true },
    { value: "issued", label: "Issued (Billed & Outstanding)" },
    { value: "paid", label: "Paid (Verified Settled with Evidence)" },
  ],
  project: [
    { value: "Planning", label: "Planning (Neutral Fallback / Assumption)", isNeutralFallback: true },
    { value: "In Progress", label: "In Progress (Active Site Execution)" },
    { value: "On Hold", label: "On Hold (Site Suspended)" },
    { value: "Completed", label: "Completed (Works Finished)" },
    { value: "Handed Over", label: "Handed Over (Client Taking-Over)" },
  ],
  delivery_note: [
    { value: "draft", label: "Draft (Unconfirmed Dispatch / Assumption)", isNeutralFallback: true },
    { value: "delivered", label: "Delivered (Site Receipt Confirmed)" },
    { value: "cancelled", label: "Cancelled" },
  ],
  purchase_order: [
    { value: "draft", label: "Draft (Unconfirmed / Assumption)", isNeutralFallback: true },
    { value: "sent", label: "Sent (Issued to Supplier)" },
    { value: "approved", label: "Approved (Internal Authorization)" },
    { value: "received", label: "Received (Goods/Materials Delivered)" },
    { value: "cancelled", label: "Cancelled" },
  ],
  expense: [
    { value: "Paid", label: "Paid (Settled)", isNeutralFallback: true },
    { value: "Pending", label: "Pending Verification" },
  ],
};

export function normalizeQuotationStatus(status?: string | null): string {
  if (!status) return "draft";
  const s = status.toLowerCase().trim().replace(/[-_]/g, " ");
  if (s.includes("accept") || s.includes("approv") || s.includes("confirm") || s.includes("sign") || s.includes("lpo")) return "accepted";
  if (s.includes("reject") || s.includes("decline") || s.includes("cancel")) return "rejected";
  if (s.includes("expire") || s.includes("lapse")) return "expired";
  if (s.includes("sent") || s.includes("submit") || s.includes("issu")) return "sent";
  return "draft";
}

export function normalizeTaxInvoiceStatus(status?: string | null): string {
  if (!status) return "draft";
  const s = status.toLowerCase().trim().replace(/[-_]/g, " ");
  if (s.includes("paid") || s.includes("settle") || s.includes("clear") || s.includes("received")) return "paid";
  if (s.includes("issu") || s.includes("sent") || s.includes("unpaid") || s.includes("outstand") || s.includes("due")) return "issued";
  return "draft";
}

export function normalizeProjectStatus(status?: string | null): string {
  if (!status) return "Planning";
  const s = status.toLowerCase().trim().replace(/[-_]/g, " ");
  if (s.includes("hand") && s.includes("over")) return "Handed Over";
  if (s.includes("complet") || s.includes("finish") || s.includes("done") || s.includes("close")) return "Completed";
  if (s.includes("hold") || s.includes("suspend") || s.includes("halt")) return "On Hold";
  if (s.includes("progress") || s.includes("ongoing") || s.includes("execut") || s.includes("active")) return "In Progress";
  if (s.includes("plan") || s.includes("propos") || s.includes("design") || s.includes("tender")) return "Planning";
  return "Planning";
}

export function normalizeDeliveryNoteStatus(status?: string | null): string {
  if (!status) return "draft";
  const s = status.toLowerCase().trim().replace(/[-_]/g, " ");
  if (s.includes("deliver") || s.includes("received") || s.includes("dispatch")) return "delivered";
  if (s.includes("cancel") || s.includes("return")) return "cancelled";
  return "draft";
}

export function normalizePurchaseOrderStatus(status?: string | null): string {
  if (!status) return "draft";
  const s = status.toLowerCase().trim().replace(/[-_]/g, " ");
  if (s.includes("receive") || s.includes("fulfill") || s.includes("deliver")) return "received";
  if (s.includes("approv") || s.includes("confirm")) return "approved";
  if (s.includes("sent") || s.includes("issu") || s.includes("order")) return "sent";
  if (s.includes("cancel")) return "cancelled";
  return "draft";
}

/**
 * Deterministically resolves document and project statuses from document evidence.
 * If evidence is ambiguous or absent, assigns valid neutral fallback status and marks isAssumed: true.
 */
export function resolveDocumentStatus(
  docType: DocumentType,
  allText: string,
  fields: Record<string, ExtractedField>,
  rawSnippets: { location: string; text: string }[] = []
): StatusResolution {
  const textLower = `${allText || ""} ${rawSnippets.map(s => s.text).join(" ")}`.toLowerCase();

  // 1. Resolve Document Status
  let proposedStatus = "draft";
  let isAssumed = true;
  let rawEvidence: string | null = null;
  let mappingReason = "Default neutral status: No explicit status indicator found in source document (Assumption)";

  // Check explicit extracted status field first
  const explicitStatusVal = fields.status?.value ? String(fields.status.value).trim() : null;

  switch (docType) {
    case "quotation": {
      if (explicitStatusVal) {
        proposedStatus = normalizeQuotationStatus(explicitStatusVal);
        isAssumed = false;
        rawEvidence = `Explicit Status column: "${explicitStatusVal}"`;
        mappingReason = `Mapped from explicit document status field '${explicitStatusVal}'`;
      } else {
        // Evidence scanning in quotation text
        const acceptMatch = textLower.match(
          /(?:quotation|offer|proposal)\s*(?:is\s*)?(?:accepted|approved|confirmed)|(?:lpo|purchase\s*order)\s*received|customer\s*signature\s*confirmed|approved\s*by\s*client|confirmed\s*by\s*client/i
        );
        const rejectMatch = textLower.match(
          /(?:quotation|proposal)\s*(?:rejected|declined|not\s*approved)|lost\s*tender/i
        );
        const expireMatch = textLower.match(
          /validity\s*expired|validity\s*lapsed|quote\s*expired/i
        );
        const sentMatch = textLower.match(
          /sent\s*to\s*client|emailed\s*to|submitted\s*to\s*client/i
        );

        if (acceptMatch) {
          proposedStatus = "accepted";
          isAssumed = false;
          rawEvidence = acceptMatch[0];
          mappingReason = `Evidence detected in text: "${acceptMatch[0]}"`;
        } else if (rejectMatch) {
          proposedStatus = "rejected";
          isAssumed = false;
          rawEvidence = rejectMatch[0];
          mappingReason = `Evidence detected in text: "${rejectMatch[0]}"`;
        } else if (expireMatch) {
          proposedStatus = "expired";
          isAssumed = false;
          rawEvidence = expireMatch[0];
          mappingReason = `Evidence detected in text: "${expireMatch[0]}"`;
        } else if (sentMatch) {
          proposedStatus = "sent";
          isAssumed = false;
          rawEvidence = sentMatch[0];
          mappingReason = `Evidence detected in text: "${sentMatch[0]}"`;
        } else {
          // Rule 1: Never assume accepted! Neutral fallback is draft
          proposedStatus = "draft";
          isAssumed = true;
          rawEvidence = null;
          mappingReason = "Neutral assumption: No client acceptance or submission signature detected in source file (Draft)";
        }
      }
      break;
    }

    case "tax_invoice": {
      if (explicitStatusVal) {
        proposedStatus = normalizeTaxInvoiceStatus(explicitStatusVal);
        isAssumed = false;
        rawEvidence = `Explicit Status column: "${explicitStatusVal}"`;
        mappingReason = `Mapped from explicit invoice status field '${explicitStatusVal}'`;
      } else {
        // Rule 2 & 11: Never assume a historical tax invoice is paid without supporting evidence!
        const paidMatch = textLower.match(
          /paid\s*in\s*full|full\s*payment\s*received|payment\s*settled|cleared\s*cheque|received\s*via\s*bank\s*transfer|settled\s*in\s*full|receipt\s*voucher\s*no|payment\s*received/i
        );
        const issuedMatch = textLower.match(
          /tax\s*invoice|payment\s*due\s*date|unpaid|outstanding|due\s*for\s*payment/i
        );

        if (paidMatch) {
          proposedStatus = "paid";
          isAssumed = false;
          rawEvidence = paidMatch[0];
          mappingReason = `Verified payment evidence in text: "${paidMatch[0]}"`;
        } else if (issuedMatch && fields.document_number?.value) {
          // If document has invoice number and date, it was issued, but not paid
          proposedStatus = "draft";
          isAssumed = true;
          rawEvidence = null;
          mappingReason = "Neutral assumption: Invoice has no verified receipt voucher or payment clearance (Draft)";
        } else {
          proposedStatus = "draft";
          isAssumed = true;
          rawEvidence = null;
          mappingReason = "Neutral assumption: No payment clearance or settlement evidence found in source file (Draft)";
        }
      }
      break;
    }

    case "delivery_note": {
      if (explicitStatusVal) {
        proposedStatus = normalizeDeliveryNoteStatus(explicitStatusVal);
        isAssumed = false;
        rawEvidence = `Explicit Status column: "${explicitStatusVal}"`;
        mappingReason = `Mapped from delivery note status field '${explicitStatusVal}'`;
      } else {
        const delivMatch = textLower.match(
          /goods\s*received\s*in\s*good\s*condition|received\s*by\s*client|site\s*received|signed\s*delivery|delivered\s*to\s*site/i
        );
        if (delivMatch) {
          proposedStatus = "delivered";
          isAssumed = false;
          rawEvidence = delivMatch[0];
          mappingReason = `Evidence of client receipt on site: "${delivMatch[0]}"`;
        } else {
          proposedStatus = "draft";
          isAssumed = true;
          rawEvidence = null;
          mappingReason = "Neutral assumption: No client receiving stamp or POD signature detected (Draft)";
        }
      }
      break;
    }

    case "purchase_order": {
      if (explicitStatusVal) {
        proposedStatus = normalizePurchaseOrderStatus(explicitStatusVal);
        isAssumed = false;
        rawEvidence = `Explicit Status column: "${explicitStatusVal}"`;
        mappingReason = `Mapped from purchase order status field '${explicitStatusVal}'`;
      } else {
        const rcvMatch = textLower.match(/materials\s*received|goods\s*received|po\s*fulfilled/i);
        const appMatch = textLower.match(/approved\s*by\s*management|authorized\s*lpo|po\s*confirmed/i);
        const sentMatch = textLower.match(/sent\s*to\s*supplier|issued\s*to\s*vendor/i);

        if (rcvMatch) {
          proposedStatus = "received";
          isAssumed = false;
          rawEvidence = rcvMatch[0];
          mappingReason = `Evidence of supplier fulfillment: "${rcvMatch[0]}"`;
        } else if (appMatch) {
          proposedStatus = "approved";
          isAssumed = false;
          rawEvidence = appMatch[0];
          mappingReason = `Evidence of internal authorization: "${appMatch[0]}"`;
        } else if (sentMatch) {
          proposedStatus = "sent";
          isAssumed = false;
          rawEvidence = sentMatch[0];
          mappingReason = `Evidence of dispatch to vendor: "${sentMatch[0]}"`;
        } else {
          proposedStatus = "draft";
          isAssumed = true;
          rawEvidence = null;
          mappingReason = "Neutral assumption: No purchase authorization or fulfillment detected (Draft)";
        }
      }
      break;
    }

    case "expense": {
      proposedStatus = "Paid";
      isAssumed = false;
      rawEvidence = "Operational Expense";
      mappingReason = "Standard historical business expenditure";
      break;
    }

    case "measurement_project": {
      proposedStatus = "completed";
      isAssumed = false;
      rawEvidence = "Measurement Takeoff";
      mappingReason = "Calculated PVC engineering takeoff sheet";
      break;
    }
  }

  // 2. Resolve Project Status (Rule 3 & 5: Never assume In Progress! Neutral fallback is Planning)
  let projStatus = "Planning";
  let projAssumed = true;
  let projEvidence: string | null = null;
  let projReason = "Neutral assumption: No active site execution or handover certificate detected (Planning)";

  const explicitProjStatus = fields.project_status?.value ? String(fields.project_status.value).trim() : null;

  if (explicitProjStatus) {
    projStatus = normalizeProjectStatus(explicitProjStatus);
    projAssumed = false;
    projEvidence = `Explicit Project Status: "${explicitProjStatus}"`;
    projReason = `Mapped from explicit project status '${explicitProjStatus}'`;
  } else {
    const handoverMatch = textLower.match(
      /handover\s*completed|taking\s*over\s*certificate|final\s*handover|handed\s*over\s*to\s*client/i
    );
    const completeMatch = textLower.match(
      /project\s*completed|work\s*completed|site\s*installation\s*complete|job\s*closed/i
    );
    const progressMatch = textLower.match(
      /in\s*progress|active\s*site|ongoing\s*fabrication|under\s*execution|work\s*in\s*progress/i
    );
    const holdMatch = textLower.match(
      /on\s*hold|site\s*suspended|works\s*halted|delayed\s*by\s*client/i
    );

    if (handoverMatch) {
      projStatus = "Handed Over";
      projAssumed = false;
      projEvidence = handoverMatch[0];
      projReason = `Evidence detected: "${handoverMatch[0]}"`;
    } else if (completeMatch) {
      projStatus = "Completed";
      projAssumed = false;
      projEvidence = completeMatch[0];
      projReason = `Evidence detected: "${completeMatch[0]}"`;
    } else if (progressMatch) {
      projStatus = "In Progress";
      projAssumed = false;
      projEvidence = progressMatch[0];
      projReason = `Evidence detected: "${progressMatch[0]}"`;
    } else if (holdMatch) {
      projStatus = "On Hold";
      projAssumed = false;
      projEvidence = holdMatch[0];
      projReason = `Evidence detected: "${holdMatch[0]}"`;
    } else {
      // Rule 3: Never assume In Progress! Neutral fallback is Planning
      projStatus = "Planning";
      projAssumed = true;
      projEvidence = null;
      projReason = "Neutral assumption: No active site log or completion certificate found (Planning)";
    }
  }

  return {
    rawEvidence,
    proposedStatus,
    isAssumed,
    mappingReason,
    userOverridden: false,
    projectStatusResolution: {
      rawEvidence: projEvidence,
      proposedStatus: projStatus,
      isAssumed: projAssumed,
      mappingReason: projReason,
      userOverridden: false,
    },
  };
}
