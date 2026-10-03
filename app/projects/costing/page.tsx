"use client";
import ReportLoadState from "@/components/ReportLoadState";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCompanyId } from "@/lib/helpers";
import {
   TrendingUp, ArrowLeft, Search, ExternalLink
} from "lucide-react";

type ProjectCostingSummary = {
  id: string;
  project_number: string;
  name: string;
  customer_name?: string;
  status: string;
  contract_value: number;
  invoiced: number;
  collected: number;
  labour_cost: number;
  equipment_cost: number;
  direct_expenses: number;
  supplier_bills: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
};

export default function ProjectCostingPortfolioPage() {
  const [summaries, setSummaries] = useState<ProjectCostingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loadError, setLoadError] = useState("");

  async function loadPortfolioCosting() {
    setLoading(true);
    setLoadError("");
    try {
      const companyId = await getCompanyId();
      if (!companyId) return;

      // 1. Fetch projects
      const { data: projects, error: prjErr } = await supabase
        .from("projects")
        .select("id, project_number, name, status, contract_value, customers(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (prjErr) throw prjErr;
      if (!projects || projects.length === 0) {
        setSummaries([]);
        return;
      }

      const projectIds = projects.map(p => p.id);

      // 2. Fetch parallel costing records
      const [invRes, manRes, eqRes, expRes, billRes] = await Promise.all([
        supabase.from("tax_invoices").select("id, project_id, total_amount, status").in("project_id", projectIds),
        supabase.from("project_manpower").select("project_id, total_cost").in("project_id", projectIds),
        supabase.from("project_equipment").select("project_id, total_cost").in("project_id", projectIds),
        supabase.from("project_expenses").select("project_id, amount").in("project_id", projectIds),
        supabase.from("supplier_bills").select("project_id, total_amount").in("project_id", projectIds),
      ]);

      const queryError = invRes.error || manRes.error || eqRes.error || expRes.error || billRes.error;
      if (queryError) throw new Error(queryError.message);

      const invoiceProjectMap: Record<string, string> = {};
      invRes.data?.forEach(inv => {
        if (inv.id && inv.project_id) {
          invoiceProjectMap[inv.id] = inv.project_id;
        }
      });
      const invoiceIds = Object.keys(invoiceProjectMap);

      let payData: { tax_invoice_id: string | null; amount: number | null }[] = [];
      if (invoiceIds.length > 0) {
        const { data: pays, error: paymentError } = await supabase
          .from("payments")
          .select("tax_invoice_id, amount")
          .in("tax_invoice_id", invoiceIds);
        if (paymentError) throw new Error(paymentError.message);
        payData = (pays || []) as { tax_invoice_id: string | null; amount: number | null }[];
      }

      const costMap: Record<string, ProjectCostingSummary> = {};

      for (const p of projects) {
        costMap[p.id] = {
          id: p.id,
          project_number: p.project_number,
          name: p.name,
          customer_name: (p.customers as unknown as { name: string } | null)?.name || "Direct Client",
          status: p.status,
          contract_value: Number(p.contract_value || 0),
          invoiced: 0,
          collected: 0,
          labour_cost: 0,
          equipment_cost: 0,
          direct_expenses: 0,
          supplier_bills: 0,
          total_cost: 0,
          gross_profit: 0,
          profit_margin: 0,
        };
      }

      // Aggregate invoices
      invRes.data?.forEach(inv => {
        if (inv.project_id && costMap[inv.project_id] && inv.status !== "Cancelled") {
          costMap[inv.project_id].invoiced += Number(inv.total_amount || 0);
        }
      });

      // Aggregate payments
      payData.forEach(pay => {
        const prjId = pay.tax_invoice_id ? invoiceProjectMap[pay.tax_invoice_id] : null;
        if (prjId && costMap[prjId]) {
          costMap[prjId].collected += Number(pay.amount || 0);
        }
      });

      // Aggregate labour
      manRes.data?.forEach(m => {
        if (m.project_id && costMap[m.project_id]) {
          costMap[m.project_id].labour_cost += Number(m.total_cost || 0);
        }
      });

      // Aggregate equipment
      eqRes.data?.forEach(eq => {
        if (eq.project_id && costMap[eq.project_id]) {
          costMap[eq.project_id].equipment_cost += Number(eq.total_cost || 0);
        }
      });

      // Aggregate direct expenses
      expRes.data?.forEach(e => {
        if (e.project_id && costMap[e.project_id]) {
          costMap[e.project_id].direct_expenses += Number(e.amount || 0);
        }
      });

      // Aggregate supplier bills
      billRes.data?.forEach(b => {
        if (b.project_id && costMap[b.project_id]) {
          costMap[b.project_id].supplier_bills += Number(b.total_amount || 0);
        }
      });

      // Compute totals & margins
      const list = Object.values(costMap).map(item => {
        const totalCost = item.labour_cost + item.equipment_cost + item.direct_expenses + item.supplier_bills;
        const grossProfit = item.contract_value - totalCost;
        const profitMargin = item.contract_value > 0 ? (grossProfit / item.contract_value) * 100 : 0;
        return {
          ...item,
          total_cost: totalCost,
          gross_profit: grossProfit,
          profit_margin: profitMargin,
        };
      });

      setSummaries(list);
    } catch (err) {
      console.error("Error loading portfolio costing:", err);
      setLoadError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadPortfolioCosting);
  }, []);

  const filtered = summaries.filter(s => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.project_number.toLowerCase().includes(search.toLowerCase()) ||
      (s.customer_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalContractVal = summaries.reduce((acc, s) => acc + s.contract_value, 0);
  const totalInvoiced = summaries.reduce((acc, s) => acc + s.invoiced, 0);
  const totalCosts = summaries.reduce((acc, s) => acc + s.total_cost, 0);
  const totalProfit = totalContractVal - totalCosts;
  const portfolioMargin = totalContractVal > 0 ? (totalProfit / totalContractVal) * 100 : 0;

  if (loading || loadError) return <ReportLoadState loading={loading} error={loadError} onRetry={() => void loadPortfolioCosting()} />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <TrendingUp size={20} />
              </span>
              Project Costing &amp; Profitability
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Real-time revenue, direct costs (labour, equipment, bills), and profit margins per job</p>
          </div>
        </div>
      </div>

      {/* Portfolio Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Contract Value</p>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            AED {totalContractVal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Across all active &amp; completed jobs</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Invoiced to Clients</p>
          <p className="text-2xl font-bold text-blue-600 mt-2 font-mono">
            AED {totalInvoiced.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Tax invoices issued</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Project Costs</p>
          <p className="text-2xl font-bold text-rose-600 mt-2 font-mono">
            AED {totalCosts.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">Labour + Equipment + Materials</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Estimated Gross Profit</p>
          <div className="flex items-center justify-between mt-2">
            <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              AED {totalProfit.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
            </p>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              {portfolioMargin.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-emerald-600 mt-1">Revenue minus committed costs</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by project name, # or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Project Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Planning">Planning</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* Costing Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-right">Contract Value</th>
                <th className="px-4 py-3 text-right">Labour</th>
                <th className="px-4 py-3 text-right">Equipment</th>
                <th className="px-4 py-3 text-right">Materials &amp; Direct</th>
                <th className="px-4 py-3 text-right">Total Costs</th>
                <th className="px-4 py-3 text-right">Gross Profit</th>
                <th className="px-4 py-3 text-center">Margin</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Loading project costing summaries...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    No project costing records found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isProfitable = item.gross_profit >= 0;
                  const materialsDirect = item.direct_expenses + item.supplier_bills;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${item.id}`} className="font-semibold text-slate-900 hover:text-emerald-600">
                          {item.name}
                        </Link>
                        <div className="text-[10px] text-slate-400 font-mono">{item.project_number} &bull; {item.status}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {item.customer_name}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        {item.contract_value.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {item.labour_cost > 0 ? item.labour_cost.toLocaleString("en-AE", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {item.equipment_cost > 0 ? item.equipment_cost.toLocaleString("en-AE", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {materialsDirect > 0 ? materialsDirect.toLocaleString("en-AE", { minimumFractionDigits: 2 }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-rose-600">
                        {item.total_cost.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={isProfitable ? "text-emerald-600" : "text-rose-600"}>
                          {item.gross_profit.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.profit_margin >= 20
                            ? "bg-emerald-100 text-emerald-800"
                            : item.profit_margin >= 5
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}>
                          {item.profit_margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/projects/${item.id}`}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600 font-medium"
                        >
                          Cost Sheet <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
