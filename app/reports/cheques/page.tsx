"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText, Download, Printer, ArrowLeft, Calendar, Filter,
  ArrowDownLeft, ArrowUpRight, ShieldAlert, BarChart3, Loader2, X
} from "lucide-react";
import { fetchCheques } from "@/lib/chequeService";
import {
  ChequeRecord, formatChequeStatus, formatChequeType,
  isChequeOverdue, UAE_BANKS
} from "@/lib/chequeTypes";
import { getCurrentCompany, fmtAED, fmtDate, todayISO } from "@/lib/helpers";
import ChequePrintTemplate from "@/components/cheques/ChequePrintTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { printCurrentDocument } from "@/lib/print";

type ReportType = "incoming" | "outgoing" | "overdue" | "monthly_summary";

export default function ChequeReportsPage() {
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Report Configuration
  const [reportType, setReportType] = useState<ReportType>("incoming");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedBank, setSelectedBank] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Print Mode
  const [printOpen, setPrintOpen] = useState(false);

  async function loadAll() {
    await Promise.resolve();
    setLoading(true);
    try {
      const [chqs, co] = await Promise.all([fetchCheques(), getCurrentCompany()]);
      setCheques(chqs);
      if (co) setCompany(co as CompanyDocInfo);
    } catch (err) {
      console.error("Failed to load cheques for reports:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial report hydration from Supabase is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  // Filtered dataset for the active report
  const filteredData = useMemo(() => {
    return cheques.filter((c) => {
      // 1. Report Mode Filter
      if (reportType === "incoming" && c.cheque_type !== "incoming") return false;
      if (reportType === "outgoing" && c.cheque_type !== "outgoing") return false;
      if (reportType === "overdue" && !isChequeOverdue(c.due_date, c.status)) return false;

      // 2. Date filters
      if (fromDate && c.due_date < fromDate) return false;
      if (toDate && c.due_date > toDate) return false;

      // 3. Bank filter
      if (selectedBank !== "all" && c.bank_name !== selectedBank) return false;

      // 4. Status filter
      if (selectedStatus !== "all" && c.status !== selectedStatus) return false;

      return true;
    });
  }, [cheques, reportType, fromDate, toDate, selectedBank, selectedStatus]);

  // Report Titles
  const reportMeta = useMemo(() => {
    switch (reportType) {
      case "incoming":
        return {
          title: "Inward Cheques Schedule (Customer PDC / CDC)",
          subtitle: "Official Register of Customer Cheques Received and Outstanding",
        };
      case "outgoing":
        return {
          title: "Outward Cheques Schedule (Supplier PDC / CDC)",
          subtitle: "Official Register of Cheques Issued to Suppliers and Creditors",
        };
      case "overdue":
        return {
          title: "Overdue & Dishonoured Cheques Exception Report",
          subtitle: "Action Required: Cheques Past Maturity Date Remaining Uncleared",
        };
      case "monthly_summary":
        return {
          title: "Monthly Cheque Maturity & Liquidity Summary",
          subtitle: "Consolidated Forecast of Cheque Clearing Schedules",
        };
    }
  }, [reportType]);

  // Monthly summary group calculations (when in monthly_summary mode)
  const monthlyGroups = useMemo(() => {
    if (reportType !== "monthly_summary") return [];
    const groups: Record<string, { month: string; incomingAmt: number; incomingCount: number; outgoingAmt: number; outgoingCount: number }> = {};

    for (const c of filteredData) {
      const monthKey = c.due_date.slice(0, 7); // YYYY-MM
      if (!groups[monthKey]) {
        const d = new Date(c.due_date);
        const label = d.toLocaleString("default", { month: "long", year: "numeric" });
        groups[monthKey] = {
          month: label,
          incomingAmt: 0,
          incomingCount: 0,
          outgoingAmt: 0,
          outgoingCount: 0,
        };
      }

      const amt = Number(c.amount) || 0;
      if (c.cheque_type === "incoming") {
        groups[monthKey].incomingAmt += amt;
        groups[monthKey].incomingCount++;
      } else {
        groups[monthKey].outgoingAmt += amt;
        groups[monthKey].outgoingCount++;
      }
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filteredData, reportType]);

  const totalAmount = useMemo(() => {
    return filteredData.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }, [filteredData]);

  // CSV / Excel Export
  function exportCSV() {
    const headers = [
      "Cheque Number",
      "Type",
      "Counterparty",
      "Bank",
      "Branch",
      "Issue Date",
      "Due Date",
      "Amount AED",
      "Status",
      "Clearance Date",
      "Notes",
    ];

    const rows = filteredData.map((c) => [
      `"${c.cheque_number}"`,
      `"${c.cheque_type}"`,
      `"${c.customer?.name || c.supplier?.name || c.payee_name || ""}"`,
      `"${c.bank_name}"`,
      `"${c.branch_name || ""}"`,
      `"${c.issue_date}"`,
      `"${c.due_date}"`,
      c.amount,
      `"${c.status}"`,
      `"${c.clearance_date || ""}"`,
      `"${(c.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `DubaiERP_${reportType}_cheque_report_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/cheques"
              className="rounded-lg p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cheque Reports &amp; Statements</h1>
                <span className="rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs font-bold">
                  A4 Print &amp; Excel
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Audited schedules and maturity reports compliant with UAE corporate standards
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={exportCSV}
              disabled={filteredData.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            >
              <Download size={15} className="text-slate-500" />
              Export to Excel (CSV)
            </button>

            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              disabled={filteredData.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
            >
              <Printer size={15} />
              Printable A4 PDF
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Report Selector Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setReportType("incoming")}
            className={`p-4 rounded-xl border text-left transition-all ${
              reportType === "incoming"
                ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm"
                : "bg-white/80 border-slate-200 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ArrowDownLeft size={16} className="text-emerald-600" /> Inward Cheques
              </span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                Customer
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Post-dated cheques received from clients</p>
          </button>

          <button
            type="button"
            onClick={() => setReportType("outgoing")}
            className={`p-4 rounded-xl border text-left transition-all ${
              reportType === "outgoing"
                ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                : "bg-white/80 border-slate-200 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ArrowUpRight size={16} className="text-blue-600" /> Outward Cheques
              </span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                Supplier
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Disbursements issued to suppliers/vendors</p>
          </button>

          <button
            type="button"
            onClick={() => setReportType("overdue")}
            className={`p-4 rounded-xl border text-left transition-all ${
              reportType === "overdue"
                ? "bg-white border-rose-500 ring-2 ring-rose-500/20 shadow-sm"
                : "bg-white/80 border-slate-200 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldAlert size={16} className="text-rose-600" /> Overdue Cheques
              </span>
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                Urgent
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Past maturity date remaining unpresented</p>
          </button>

          <button
            type="button"
            onClick={() => setReportType("monthly_summary")}
            className={`p-4 rounded-xl border text-left transition-all ${
              reportType === "monthly_summary"
                ? "bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm"
                : "bg-white/80 border-slate-200 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <BarChart3 size={16} className="text-indigo-600" /> Monthly Summary
              </span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                Cash Flow
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Month-by-month maturity breakdown</p>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Maturity From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Maturity To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Drawee Bank</label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-slate-400 focus:outline-none bg-white"
              >
                <option value="all">All UAE Banks</option>
                {UAE_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Cheque Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-slate-400 focus:outline-none bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending In Hand</option>
                <option value="deposited">Deposited in Bank</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Report Preview Surface */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          {/* Header Banner */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 mb-4 gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-900">{reportMeta.title}</h2>
              <p className="text-xs text-slate-500">{reportMeta.subtitle}</p>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Filtered Value</span>
              <span className="text-xl font-black text-slate-900 font-mono">{fmtAED(totalAmount)}</span>
            </div>
          </div>

          {/* Monthly Summary Mode Table */}
          {reportType === "monthly_summary" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Maturity Month</th>
                    <th className="py-2.5 px-3 text-right">Incoming Cheques</th>
                    <th className="py-2.5 px-3 text-right">Incoming Total (AED)</th>
                    <th className="py-2.5 px-3 text-right">Outgoing Cheques</th>
                    <th className="py-2.5 px-3 text-right">Outgoing Total (AED)</th>
                    <th className="py-2.5 px-3 text-right">Net Flow (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No cheques found in selected criteria.
                      </td>
                    </tr>
                  ) : (
                    monthlyGroups.map((g) => {
                      const net = g.incomingAmt - g.outgoingAmt;
                      return (
                        <tr key={g.month} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-bold text-slate-900">{g.month}</td>
                          <td className="py-3 px-3 text-right text-slate-600 font-mono">{g.incomingCount}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                            {fmtAED(g.incomingAmt)}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 font-mono">{g.outgoingCount}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                            {fmtAED(g.outgoingAmt)}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-black ${
                              net >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {fmtAED(net)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Tabular List of Cheques */
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Cheque No</th>
                    <th className="py-2.5 px-3">Counterparty</th>
                    <th className="py-2.5 px-3">Bank</th>
                    <th className="py-2.5 px-3">Issue Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3 text-right">Amount (AED)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        <Loader2 size={20} className="animate-spin mx-auto mb-1" />
                        Generating report data...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        No cheques match the selected reporting filters.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((c, idx) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">#{c.cheque_number}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {c.customer?.name || c.supplier?.name || c.payee_name || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{c.bank_name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{fmtDate(c.issue_date)}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{fmtDate(c.due_date)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {formatChequeStatus(c.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                    <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[11px] text-slate-700">
                      Total Schedule Value:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 text-sm">
                      {fmtAED(totalAmount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* PRINT PREVIEW MODAL */}
      {printOpen && (
        <div className="print-modal-container fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:inset-auto">
          <div className="no-print mx-auto my-4 max-w-4xl w-full flex items-center justify-between bg-slate-900 text-white p-3 rounded-t-xl print:hidden">
            <span className="font-bold text-sm">A4 Printable Cheque Report</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => printCurrentDocument()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Printer size={14} /> Print A4 PDF
              </button>
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mx-auto w-fit bg-transparent print:w-[210mm] print:m-0 print:p-0 shadow-2xl print:shadow-none">
            <ChequePrintTemplate
              mode="report"
              company={company}
              cheques={filteredData}
              reportTitle={reportMeta.title}
              reportSubtitle={reportMeta.subtitle}
            />
          </div>
        </div>
      )}
    </main>
  );
}
