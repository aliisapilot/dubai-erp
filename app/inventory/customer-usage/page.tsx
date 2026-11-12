"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId, fmtAED, fmtDate, todayISO } from "@/lib/helpers";
import {
  Users,
  Search,
  ArrowLeft,
  Calendar,
  Filter,
  FileSpreadsheet,
  Printer,
  Loader2,
  Building2,
  Download,
  Package,
  Scissors,
} from "lucide-react";
import {
  getCustomerUsageStatement,
  type MaterialMovementRecord,
} from "@/lib/materialInventory";
import PrintModal from "@/components/documents/PrintModal";
import CustomerMaterialUsageTemplate, {
  CustomerMaterialUsageData,
} from "@/components/documents/CustomerMaterialUsageTemplate";
import { CompanyDocInfo } from "@/components/documents/DocHeader";
import { generateDocumentPdfFilename } from "@/lib/documentFilename";

export default function CustomerMaterialUsagePage() {
  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; project_number: string }[]>([]);

  // Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [customCustomerQuery, setCustomCustomerQuery] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Data State
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MaterialMovementRecord[]>([]);
  const [totalSqm, setTotalSqm] = useState(0);
  const [totalRm, setTotalRm] = useState(0);
  const [totalWastage, setTotalWastage] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  // Print Statement State
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    loadMeta();
  }, []);

  async function loadMeta() {
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      const [coRes, custRes, prjRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("customers").select("id, name").eq("company_id", companyId).eq("active", true).order("name"),
        supabase.from("projects").select("id, name, project_number").eq("company_id", companyId).order("name"),
      ]);

      if (coRes.data) setCompany(coRes.data);
      if (custRes.data) setCustomers(custRes.data);
      if (prjRes.data) setProjects(prjRes.data);

      await fetchUsage(companyId);
    } catch (err) {
      console.error("Error loading usage report metadata:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsage(companyIdOverride?: string) {
    setLoading(true);
    try {
      const companyId = companyIdOverride || (await getCompanyId());
      if (!companyId) return;

      const result = await getCustomerUsageStatement(companyId, {
        customerId: selectedCustomerId !== "all" ? selectedCustomerId : undefined,
        customCustomerName: customCustomerQuery.trim() || undefined,
        projectId: selectedProjectId !== "all" ? selectedProjectId : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      setRecords(result.records);
      setTotalSqm(result.totalSquareMetres);
      setTotalRm(result.totalRunningMetres);
      setTotalWastage(result.totalWastage);
      setTotalCost(result.totalCost);
    } catch (err) {
      console.error("Error fetching usage data:", err);
    } finally {
      setLoading(false);
    }
  }

  // Brand-wise Breakdown
  const brandSummary = useMemo(() => {
    const map = new Map<string, { brand: string; square_metres: number; cost: number }>();
    for (const r of records) {
      const b = r.product?.brand || "General Fabric";
      const existing = map.get(b) || { brand: b, square_metres: 0, cost: 0 };
      existing.square_metres += r.square_metres || 0;
      existing.cost += Number(r.total_cost || 0);
      map.set(b, existing);
    }
    return Array.from(map.values()).map((v) => ({
      ...v,
      square_metres: Math.round(v.square_metres * 1000) / 1000,
      cost: Math.round(v.cost * 100) / 100,
    }));
  }, [records]);

  // Export to CSV
  function exportToCSV() {
    if (records.length === 0) return;
    const headers = [
      "Date",
      "Reference",
      "Customer",
      "Project",
      "Material Name",
      "Brand",
      "Width (m)",
      "Running Metres",
      "Square Metres (m2)",
      "Wastage (m2)",
      "Unit Cost (AED)",
      "Total Cost (AED)",
      "Issued By",
      "Notes",
    ];

    const rows = records.map((r) => [
      r.created_at ? r.created_at.split("T")[0] : "",
      r.reference_number || "",
      r.customer_name || "",
      r.project_name || "",
      r.product?.name || "",
      r.product?.brand || "",
      r.fabric_width || "",
      r.running_metres || 0,
      r.square_metres || 0,
      r.wastage_quantity || 0,
      r.unit_cost || 0,
      r.total_cost || 0,
      r.issued_by || "",
      (r.notes || "").replace(/,/g, " "),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `customer_material_usage_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Print Data Object
  const customerPrintTitle =
    selectedCustomerId !== "all"
      ? customers.find((c) => c.id === selectedCustomerId)?.name || "Customer"
      : customCustomerQuery.trim() || "All Customers / Workshop Usage";

  const printData: CustomerMaterialUsageData = {
    customer_name: customerPrintTitle,
    statement_date: todayISO(),
    date_from: startDate || undefined,
    date_to: endDate || undefined,
    project_filter:
      selectedProjectId !== "all"
        ? projects.find((p) => p.id === selectedProjectId)?.name
        : undefined,
    items: records.map((r) => ({
      issue_date: r.created_at,
      reference_number: r.reference_number || "MIN",
      project_name: r.project_name,
      material_name: r.product?.name || "Material",
      brand: r.product?.brand || "Fabric",
      width: r.fabric_width,
      running_metres: r.running_metres,
      square_metres: r.square_metres || 0,
      wastage_quantity: r.wastage_quantity,
      unit_rate: r.unit_cost || 0,
      total_cost: r.total_cost || 0,
      purpose: r.purpose,
    })),
    total_square_metres: totalSqm,
    total_running_metres: totalRm,
    total_wastage: totalWastage,
    total_cost: totalCost,
    brand_summary: brandSummary,
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
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
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Users size={20} />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Customer Material Usage Statement</h1>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              Customer-wise and project-wise fabric consumption ledger, brand breakdowns, cutting wastage, and cost auditing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={exportToCSV}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            <Download size={14} /> Export CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            <Printer size={14} /> Print Statement (PDF)
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Filter size={14} className="text-sky-400" />
          <span>Statement Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Customer Dropdown */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Select Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                if (e.target.value !== "all") setCustomCustomerQuery("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All ERP Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Name / Workshop Usage Search */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Or Custom / Workshop Name</label>
            <input
              type="text"
              placeholder="e.g. Workshop Usage, Walk-in..."
              value={customCustomerQuery}
              onChange={(e) => {
                setCustomCustomerQuery(e.target.value);
                if (e.target.value) setSelectedCustomerId("all");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Project Dropdown */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Filter by Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All Projects &amp; Jobs</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range From */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Date Range To + Apply */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-slate-400 block mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchUsage()}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
            Total Material Area Consumed
          </p>
          <p className="mt-2 text-2xl font-black text-white font-mono">
            {totalSqm.toFixed(2)} m²
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {totalRm > 0 ? `Equivalent: ${totalRm.toFixed(2)} Running Metres` : "Primary Area Calculation"}
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            Total Cutting Wastage
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xl font-black text-amber-300 font-mono">
              {totalWastage.toFixed(2)} m²
            </p>
            <Scissors size={20} className="text-amber-400" />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {totalSqm > 0 ? `${((totalWastage / (totalSqm + totalWastage)) * 100).toFixed(1)}% of total issue` : "0% Wastage"}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            Total Material Cost
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-300 font-mono">
            AED {fmtAED(totalCost)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Actual cost at inventory rates</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Transactions
          </p>
          <p className="mt-2 text-2xl font-black text-white font-mono">{records.length}</p>
          <p className="mt-1 text-xs text-slate-400">Material Issue Notes (MIN)</p>
        </div>
      </div>

      {/* Brand-Wise Summary Cards */}
      {brandSummary.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Package size={14} className="text-emerald-400" /> Brand Consumption Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {brandSummary.map((b, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-white block truncate">{b.brand}</span>
                <span className="font-mono text-base font-extrabold text-sky-400 block mt-1">
                  {b.square_metres.toFixed(2)} m²
                </span>
                <span className="text-[11px] text-slate-400 font-mono">AED {fmtAED(b.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Transactions Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-white text-sm">Dispatched Items Breakdown</h3>
          <span className="text-xs text-slate-400">{records.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <th className="p-3">Date</th>
                <th className="p-3">MIN Ref</th>
                <th className="p-3">Customer / Recipient</th>
                <th className="p-3">Project</th>
                <th className="p-3">Material &amp; Brand</th>
                <th className="p-3 text-center">Width</th>
                <th className="p-3 text-right">Running M</th>
                <th className="p-3 text-right bg-blue-950/40 text-blue-300 font-bold">Square M (m²)</th>
                <th className="p-3 text-right text-amber-400">Wastage</th>
                <th className="p-3 text-right">Cost Rate</th>
                <th className="p-3 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    <Loader2 size={20} className="animate-spin mx-auto text-sky-400 mb-2" />
                    Loading material usage records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No material consumption records found matching the selected filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 whitespace-nowrap text-slate-300">{fmtDate(r.created_at)}</td>
                    <td className="p-3 font-mono font-bold text-sky-400 whitespace-nowrap">
                      {r.reference_number || "MIN"}
                    </td>
                    <td className="p-3 font-medium text-white max-w-[160px] truncate">
                      {r.customer_name || "Workshop Usage"}
                    </td>
                    <td className="p-3 text-slate-300 max-w-[160px] truncate">
                      {r.project_name || r.purpose || "—"}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-white block">{r.product?.name || "Material"}</span>
                      <span className="text-[10px] text-slate-400">{r.product?.brand}</span>
                    </td>
                    <td className="p-3 text-center font-mono text-slate-300">
                      {r.fabric_width ? `${r.fabric_width} m` : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {r.running_metres ? `${r.running_metres.toFixed(2)} m` : "—"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-400 bg-blue-950/20">
                      {r.square_metres ? `${r.square_metres.toFixed(2)} m²` : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-amber-400">
                      {r.wastage_quantity && r.wastage_quantity > 0 ? `${r.wastage_quantity.toFixed(2)} m²` : "0.00"}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {fmtAED(r.unit_cost)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      AED {fmtAED(r.total_cost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {records.length > 0 && (
              <tfoot>
                <tr className="bg-slate-950 font-bold text-white text-xs border-t border-slate-700">
                  <td colSpan={6} className="p-3 text-right uppercase">
                    Grand Totals:
                  </td>
                  <td className="p-3 text-right font-mono">
                    {totalRm > 0 ? `${totalRm.toFixed(2)} m` : "—"}
                  </td>
                  <td className="p-3 text-right font-mono text-blue-400 text-sm bg-blue-950/40">
                    {totalSqm.toFixed(2)} m²
                  </td>
                  <td className="p-3 text-right font-mono text-amber-400 text-sm">
                    {totalWastage.toFixed(2)} m²
                  </td>
                  <td></td>
                  <td className="p-3 text-right font-mono text-emerald-400 text-sm">
                    AED {fmtAED(totalCost)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Print Statement Modal */}
      {showPrintModal && (() => {
        const docFile = generateDocumentPdfFilename({
          documentType: "material_usage_statement",
          customerName: customerPrintTitle,
          workDescription: "Material Usage Statement",
        });
        return (
          <PrintModal
            isOpen={showPrintModal}
            onClose={() => setShowPrintModal(false)}
            documentFilename={docFile.filename}
            documentTitle={docFile.title}
          >
            <CustomerMaterialUsageTemplate
              company={company}
              data={printData}
              onClose={() => setShowPrintModal(false)}
            />
          </PrintModal>
        );
      })()}
    </div>
  );
}
