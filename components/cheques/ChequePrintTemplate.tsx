"use client";

import React from "react";
import { ChequeRecord, formatChequeStatus, formatChequeType } from "@/lib/chequeTypes";
import { fmtAED, fmtDate } from "@/lib/helpers";
import { numberToWordsEnglish } from "@/lib/amountInWords";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

interface ChequePrintProps {
  mode: "voucher" | "report";
  company: CompanyDocInfo | null;
  cheque?: ChequeRecord | null;
  cheques?: ChequeRecord[];
  reportTitle?: string;
  reportSubtitle?: string;
}

export default function ChequePrintTemplate({
  mode,
  company,
  cheque,
  cheques = [],
  reportTitle = "Cheque Register Report",
  reportSubtitle,
}: ChequePrintProps) {
  const compName = company?.name || "DUBAI ENTERPRISE L.L.C";
  const compTrn = company?.trn || "100XXXXXXXXX003";
  const compAddress = company?.address || "Business Bay, Dubai, UAE";
  const compPhone = company?.phone || company?.mobile || "+971 4 000 0000";
  const compEmail = company?.email || "accounts@dubai-erp.ae";

  if (mode === "voucher" && cheque) {
    const isIncoming = cheque.cheque_type === "incoming";
    const counterparty = isIncoming
      ? cheque.customer?.name || cheque.payee_name || "Customer"
      : cheque.supplier?.name || cheque.payee_name || "Supplier";
    const counterpartyTrn = isIncoming ? cheque.customer?.trn : cheque.supplier?.trn;
    const words = numberToWordsEnglish(Number(cheque.amount) || 0);

    return (
      <div className="print-page print-document document-sheet relative mx-auto box-border min-h-[297mm] w-[210mm] border border-slate-200 bg-white p-[10mm] shadow-xl print:m-0 print:min-h-[297mm] print:w-[210mm] print:border-none print:p-[10mm] print:shadow-none text-slate-800 font-sans text-xs leading-normal">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
          <div className="flex items-start gap-4">
            {company?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logo_url}
                alt="Logo"
                className="h-16 w-auto object-contain max-w-[140px]"
              />
            )}
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{compName}</h1>
              {company?.arabic_name && (
                <p className="text-sm font-semibold text-slate-700 font-arabic">{company.arabic_name}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">{compAddress}</p>
              <p className="text-[11px] text-slate-500">Tel: {compPhone} | Email: {compEmail}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
              {isIncoming ? "Cheque Receipt Voucher" : "Cheque Payment Voucher"}
            </span>
            <div className="mt-2 text-[11px] text-slate-600">
              <p><strong>TRN:</strong> {compTrn}</p>
              <p><strong>Cheque No:</strong> {cheque.cheque_number}</p>
              <p><strong>Date:</strong> {fmtDate(cheque.issue_date)}</p>
            </div>
          </div>
        </div>

        {/* Amount Box */}
        <div className="my-6 p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cheque Amount (AED)</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{fmtAED(cheque.amount)}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
            <div className="mt-0.5">
              <span className="inline-block px-2.5 py-0.5 rounded font-bold text-xs uppercase bg-slate-200 text-slate-800">
                {formatChequeStatus(cheque.status)}
              </span>
            </div>
          </div>
        </div>

        {/* Counterparty & Bank Details */}
        <div className="grid grid-cols-2 gap-6 my-4 border border-slate-200 rounded-lg p-4">
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1 mb-2">
              {isIncoming ? "Received From (Customer)" : "Payable To (Beneficiary)"}
            </h3>
            <p className="font-bold text-slate-900 text-sm">{counterparty}</p>
            {counterpartyTrn && <p className="text-slate-500 mt-0.5">TRN: {counterpartyTrn}</p>}
            {cheque.tax_invoice && (
              <p className="text-slate-600 mt-1 font-medium">
                Against Invoice: {cheque.tax_invoice.invoice_number} (AED {cheque.tax_invoice.total_amount?.toLocaleString()})
              </p>
            )}
            {cheque.supplier_bill && (
              <p className="text-slate-600 mt-1 font-medium">
                Against Bill: {cheque.supplier_bill.bill_number} (AED {cheque.supplier_bill.total_amount?.toLocaleString()})
              </p>
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1 mb-2">
              Banking & Cheque Information
            </h3>
            <div className="space-y-1 text-slate-700">
              <p><span className="text-slate-500 inline-block w-28">Drawee Bank:</span> <strong>{cheque.bank_name}</strong></p>
              {cheque.branch_name && (
                <p><span className="text-slate-500 inline-block w-28">Branch:</span> {cheque.branch_name}</p>
              )}
              <p><span className="text-slate-500 inline-block w-28">Cheque Number:</span> <strong className="font-mono">{cheque.cheque_number}</strong></p>
              <p><span className="text-slate-500 inline-block w-28">Issue Date:</span> {fmtDate(cheque.issue_date)}</p>
              <p><span className="text-slate-500 inline-block w-28">Due / Maturity Date:</span> <strong className="text-slate-900">{fmtDate(cheque.due_date)}</strong></p>
              {cheque.clearance_date && (
                <p><span className="text-slate-500 inline-block w-28">Clearance Date:</span> {fmtDate(cheque.clearance_date)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Amount in Words */}
        <div className="my-4 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Amount in Words</span>
          <p className="text-xs font-semibold text-slate-800 italic">{words}</p>
        </div>

        {/* Notes */}
        {cheque.notes && (
          <div className="my-4 p-3 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Notes & Purpose</span>
            <p className="text-xs text-slate-700">{cheque.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-20 pt-4 border-t border-slate-200 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="h-16 border-b border-dashed border-slate-300"></div>
            <p className="font-bold text-slate-800 text-[11px] mt-2">Prepared By</p>
            <p className="text-[10px] text-slate-400">{cheque.responsible_employee_name || "Accounts Officer"}</p>
          </div>
          <div>
            <div className="h-16 border-b border-dashed border-slate-300"></div>
            <p className="font-bold text-slate-800 text-[11px] mt-2">Verified & Reviewed By</p>
            <p className="text-[10px] text-slate-400">Chief Accountant</p>
          </div>
          <div>
            <div className="h-16 border-b border-dashed border-slate-300"></div>
            <p className="font-bold text-slate-800 text-[11px] mt-2">Authorized Signatory / Receiver</p>
            <p className="text-[10px] text-slate-400">Managing Director / Payee</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
          This is an official computer-generated document from Dubai ERP.
        </div>
      </div>
    );
  }

  // Multi-cheque Tabular Report
  const totalAmount = cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="print-page print-document document-sheet relative mx-auto box-border min-h-[297mm] w-[210mm] border border-slate-200 bg-white p-[10mm] shadow-xl print:m-0 print:min-h-[297mm] print:w-[210mm] print:border-none print:p-[10mm] print:shadow-none text-slate-800 font-sans text-xs leading-normal">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{compName}</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{compAddress} | TRN: {compTrn}</p>
        </div>
        <div className="text-right">
          <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
            {reportTitle}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Generated: {new Date().toLocaleDateString("en-GB")}</p>
        </div>
      </div>

      {reportSubtitle && (
        <p className="text-xs text-slate-600 font-medium my-3">{reportSubtitle}</p>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-3 gap-4 my-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Cheques</span>
          <p className="text-base font-black text-slate-900">{cheques.length}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Value (AED)</span>
          <p className="text-base font-black text-emerald-700">{fmtAED(totalAmount)}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Accounting Period</span>
          <p className="text-base font-semibold text-slate-700">{new Date().toLocaleString("default", { month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* Table */}
      <table className="w-full my-4 border-collapse text-[11px]">
        <thead>
          <tr className="border-b-2 border-slate-800 bg-slate-100 text-left font-bold text-slate-900">
            <th className="py-2 px-2">#</th>
            <th className="py-2 px-2">Cheque No</th>
            <th className="py-2 px-2">Type</th>
            <th className="py-2 px-2">Party / Payee</th>
            <th className="py-2 px-2">Bank</th>
            <th className="py-2 px-2">Due Date</th>
            <th className="py-2 px-2 text-right">Amount (AED)</th>
            <th className="py-2 px-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {cheques.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-400">
                No cheques found matching the criteria.
              </td>
            </tr>
          ) : (
            cheques.map((c, idx) => {
              const party =
                c.cheque_type === "incoming"
                  ? c.customer?.name || c.payee_name || "Customer"
                  : c.supplier?.name || c.payee_name || "Supplier";

              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-2 px-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                  <td className="py-2 px-2 font-mono font-bold text-slate-900">{c.cheque_number}</td>
                  <td className="py-2 px-2 capitalize">{c.cheque_type}</td>
                  <td className="py-2 px-2 font-medium text-slate-800 truncate max-w-[150px]">{party}</td>
                  <td className="py-2 px-2 text-slate-600 truncate max-w-[120px]">{c.bank_name}</td>
                  <td className="py-2 px-2 font-mono">{fmtDate(c.due_date)}</td>
                  <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                    {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                      {formatChequeStatus(c.status)}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 font-bold bg-slate-50 text-slate-900">
            <td colSpan={6} className="py-2 px-2 text-right uppercase text-[10px]">
              Total Schedule Amount:
            </td>
            <td className="py-2 px-2 text-right font-mono font-black text-emerald-800 text-xs">
              {fmtAED(totalAmount)}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {/* Signature & Signoff */}
      <div className="mt-16 pt-4 border-t border-slate-200 grid grid-cols-2 gap-12 text-center">
        <div>
          <div className="h-16 border-b border-dashed border-slate-300"></div>
          <p className="font-bold text-slate-800 text-[11px] mt-2">Prepared By: Finance Officer</p>
        </div>
        <div>
          <div className="h-16 border-b border-dashed border-slate-300"></div>
          <p className="font-bold text-slate-800 text-[11px] mt-2">Approved By: Finance Director / Partner</p>
        </div>
      </div>
    </div>
  );
}
