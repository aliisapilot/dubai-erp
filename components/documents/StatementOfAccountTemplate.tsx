"use client";
import { usePersistedDocumentDesign, DesignLoadState } from "./usePersistedDocumentDesign";

import DynamicDocumentRenderer, { getDocumentPageCount, MockDocumentData } from "./DynamicDocumentRenderer";

import React from "react";
import DocHeader, { CompanyDocInfo } from "./DocHeader";
import DocFooter from "./DocFooter";
import { numberToWordsEnglish, numberToWordsArabic } from "@/lib/amountInWords";
import DocumentContainer from "./DocumentContainer";

import type { DocumentLayout } from "@/lib/documentDesigner";

export type StatementEntry = {
  date: string;
  reference_no: string;
  original_reference?: string;
  invoice_id?: string;
  description: string;
  debit: number;   // Invoice charge
  credit: number;  // Payment receipt
  balance: number; // Running balance
};

export type StatementData = {
  statement_number: string;
  statement_date: string;
  from_date?: string | null;
  to_date?: string | null;
  customer_name: string;
  customer_trn?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_code?: string | null;
  opening_balance: number;
  entries: StatementEntry[];
  closing_balance: number;
};

type StatementProps = {
  company: CompanyDocInfo | null;
  statement: StatementData;
  overrideLayout?: DocumentLayout;
  onClose?: () => void;
};

export default function StatementOfAccountTemplate({
  company,
  statement,
  overrideLayout,
  onClose,
}: StatementProps) {
  const design = usePersistedDocumentDesign(company?.id, 'customer_statement');
  const customLayout = overrideLayout || design.layout;
  if (!overrideLayout && !design.ready) return <DesignLoadState error={design.error} retry={design.retry} />;

  const totalCharges = statement.entries.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);
  const totalCredits = statement.entries.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);

  const rendererData: MockDocumentData = {
    document_number: statement.statement_number,
    document_date: statement.statement_date,
    customer_name: statement.customer_name,
    customer_trn: statement.customer_trn || undefined,
    customer_address: statement.customer_address || undefined,
    contact_number: statement.customer_phone || undefined,
    customer_code: statement.customer_code || undefined,
    opening_balance: statement.opening_balance,
    total_credits: totalCredits,
    items: [{
      date: statement.from_date || "",
      type: "Opening",
      reference: "—",
      description: "Opening Balance Brought Forward",
      debit: 0,
      credit: 0,
      balance: statement.opening_balance,
      quantity: 1,
      unit_price: 0,
      vat_amount: 0,
      line_total: statement.opening_balance,
    }, ...statement.entries.map((e) => ({
      date: e.date,
      type: e.description.startsWith("Tax Invoice")
        ? "Tax Invoice"
        : e.description.startsWith("Payment")
        ? "Payment"
        : e.description.startsWith("Receipt Voucher")
        ? "Receipt Voucher"
        : e.description.split(" (")[0],
      reference: e.reference_no,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
      quantity: 1,
      unit_price: e.debit || e.credit || 0,
      vat_amount: 0,
      line_total: e.balance,
    }))],
    subtotal: totalCharges,
    vat_amount: 0,
    total_amount: statement.closing_balance,
    payment_terms: `Your account balance is ${statement.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED. Please make your payment to cover the balance by the due date.\nMake all checks payable to ${company?.name || "the company"}\n\nThank you for your business!`,
  };
  const totalPages = getDocumentPageCount(customLayout, rendererData.items.length, rendererData.items, rendererData);

  return (
    <DocumentContainer
      docTypeLabel="Statement of Account"
      docNumber={statement.statement_number}
      onClose={onClose}
      company={company ?? undefined}
      noPadding={Boolean(customLayout)}
      showWatermark={!customLayout}
      totalPages={totalPages}
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
      {/* Letterhead Header */}
      <DocHeader
          company={company}
          docTitle="STATEMENT OF ACCOUNT"
          arabicTitle="كشف حساب عميل"
          docNumber={statement.statement_number}
          docDate={statement.statement_date}
          subTitle={
            statement.from_date && statement.to_date
              ? `Statement Period: ${statement.from_date} to ${statement.to_date}`
              : "Customer Outstanding Balance & Ledger Statement"
          }
        />

        {/* Customer Information Box */}
        <div className="grid grid-cols-2 gap-4 my-4 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50/60 p-3">
            <div className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b border-slate-200 pb-1">
              Customer Account Details (بيانات العميل):
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="text-sm font-bold text-slate-900">{statement.customer_name}</div>
              {statement.customer_trn && (
                <div><span className="text-slate-500">TRN:</span> <span className="font-mono font-semibold">{statement.customer_trn}</span></div>
              )}
              {statement.customer_address && (
                <div><span className="text-slate-500">Address:</span> {statement.customer_address}</div>
              )}
              {statement.customer_phone && (
                <div><span className="text-slate-500">Phone:</span> {statement.customer_phone}</div>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50/60 p-3 flex flex-col justify-between">
            <div>
              <div className="font-bold text-slate-900 uppercase text-[11px] mb-1.5 border-b border-slate-200 pb-1">
                Account Summary (ملخص الحساب):
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 mt-2">
                <div>
                  <span className="text-slate-500 block text-[10px]">Opening Balance:</span>
                  <span className="font-mono font-bold">{statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Statement Date:</span>
                  <span>{new Date(statement.statement_date).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded bg-amber-50 p-2 border border-amber-200 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase">Closing Balance:</span>
              <span className="text-sm font-mono font-extrabold text-amber-950">
                {statement.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
              </span>
            </div>
          </div>
        </div>

        {/* Ledger Transactions Table */}
        <div className="mt-4 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold">
                <th className="py-2.5 px-3 w-24">Date</th>
                <th className="py-2.5 px-3 w-28">Ref / Inv #</th>
                <th className="py-2.5 px-3">Transaction Description</th>
                <th className="py-2.5 px-3 w-28 text-right">Debit / Charges</th>
                <th className="py-2.5 px-3 w-28 text-right">Credit / Paid</th>
                <th className="py-2.5 px-3 w-32 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Opening Balance Row */}
              <tr className="bg-slate-100/80 font-medium text-slate-700">
                <td className="py-2 px-3 text-[11px] font-mono">
                  {statement.from_date || "—"}
                </td>
                <td className="py-2 px-3 font-mono text-[11px]">—</td>
                <td className="py-2 px-3 font-bold text-slate-800">Opening Balance Brought Forward</td>
                <td className="py-2 px-3 text-right font-mono">—</td>
                <td className="py-2 px-3 text-right font-mono">—</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                  {statement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
              </tr>

              {/* Transactions */}
              {statement.entries.map((entry, index) => (
                <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="py-2 px-3 text-[11px] text-slate-600 font-mono">
                    {entry.date ? new Date(entry.date).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-slate-800 text-[11px]">
                    {entry.reference_no}
                  </td>
                  <td className="py-2 px-3 text-slate-800">
                    {entry.description}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-rose-700">
                    {entry.debit > 0 ? entry.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">
                    {entry.credit > 0 ? entry.credit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                    {entry.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}

              {statement.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No transactions recorded during this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs text-slate-900">
                <td colSpan={3} className="py-2.5 px-3 text-right">
                  Total Period Activity:
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                  {totalCharges.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                  {totalCredits.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-sm text-slate-950 bg-slate-200">
                  {statement.closing_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} AED
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Amount in Words Box */}
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
          <div>
            <span className="font-bold text-slate-700">Net Due in Words: </span>
            <span className="font-semibold text-slate-900">{numberToWordsEnglish(statement.closing_balance)}</span>
          </div>
          <div dir="rtl" className="text-slate-700 font-arabic">
            <span className="font-bold text-slate-800">المبلغ المستحق كتابة: </span>
            <span className="font-semibold text-slate-900">{numberToWordsArabic(statement.closing_balance)}</span>
          </div>
        </div>

        <DocFooter
          bankInfo={{
            name: company?.name,
            website: company?.website,
            email: company?.email,
          }}
          showBankDetails={true}
          notes="Please arrange payment of any overdue balance at your earliest convenience to maintain continuous supply and service."
        />
        </>
      )}
    </DocumentContainer>
  );
}
