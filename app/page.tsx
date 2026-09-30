"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, Truck, Package, FileText, FileSpreadsheet, FileCheck2,
  ShoppingBag, Wallet, Users2, AlertTriangle, BarChart3,
  TrendingUp, Loader2, ArrowRight, Briefcase, Clock
} from "lucide-react";
import { fmtAED, getCurrentCompany, CompanyDocDetails } from "@/lib/helpers";

type DashboardStats = {
  customers: number;
  activeCustomers: number;
  suppliers: number;
  activeSuppliers: number;
  products: number;
  lowStock: number;
  quotations: number;
  proformas: number;
  taxInvoices: number;
  pendingInvoices: number;
  outstandingCustomerBalance: number;
  outstandingSupplierBalance: number;
  projects: number;
  activeProjects: number;
  employees: number;
  currentPayroll: number;
  customerPaymentsTotal: number;
  supplierPaymentsTotal: number;
};

const emptyStats: DashboardStats = {
  customers: 0,
  activeCustomers: 0,
  suppliers: 0,
  activeSuppliers: 0,
  products: 0,
  lowStock: 0,
  quotations: 0,
  proformas: 0,
  taxInvoices: 0,
  pendingInvoices: 0,
  outstandingCustomerBalance: 0,
  outstandingSupplierBalance: 0,
  projects: 0,
  activeProjects: 0,
  employees: 0,
  currentPayroll: 0,
  customerPaymentsTotal: 0,
  supplierPaymentsTotal: 0,
};

type RecentTx = {
  id: string;
  type: string;
  ref: string;
  party: string;
  amount: number;
  date: string;
  status: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [recentActivity, setRecentActivity] = useState<RecentTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyDocDetails | null>(null);
  const [companyName, setCompanyName] = useState("Dubai ERP");

  useEffect(() => {
    let mounted = true;
    async function loadDashboard() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          router.replace("/login");
          return;
        }
        const co = await getCurrentCompany();
        if (!co) {
          if (mounted) setLoading(false);
          return;
        }
        if (mounted) {
          setCompany(co);
          setCompanyName(co.name || "Dubai ERP");
        }

        const [
          { data: cust },
          { data: supp },
          { data: prods },
          { data: quot },
          { data: prof },
          { data: tinv },
          { data: cPay },
          { data: sPay },
          { data: prjs },
          { data: bills },
          { data: emps },
          { data: ss }
        ] = await Promise.all([
          supabase.from("customers").select("id, active"),
          supabase.from("suppliers").select("id, active"),
          supabase.from("products").select("id, current_stock, minimum_stock, active"),
          supabase.from("quotations").select("id, quotation_number, quotation_date, total_amount, status, customers(name)").order("created_at", { ascending: false }).limit(5),
          supabase.from("proforma_invoices").select("id, status"),
          supabase.from("tax_invoices").select("id, invoice_number, invoice_date, status, total_amount, customers(name)").order("created_at", { ascending: false }),
          supabase.from("payments").select("id, payment_number, payment_date, amount, payment_type").in("payment_type", ["customer_receipt", "customer"]).order("created_at", { ascending: false }),
          supabase.from("payments").select("id, payment_number, payment_date, amount, payment_type").in("payment_type", ["supplier_payment", "supplier"]).order("created_at", { ascending: false }),
          supabase.from("projects").select("id, status"),
          supabase.from("supplier_bills").select("id, total_amount, paid_amount, status"),
          supabase.from("employees").select("id, status"),
          supabase.from("salary_statements").select("id, net_salary, status"),
        ]);

        if (!mounted) return;

        const p = prods || [];
        const ti = tinv || [];
        const cp = cPay || [];
        const sp = sPay || [];
        const sb = bills || [];
        const pj = prjs || [];
        const em = emps || [];
        const ssList = ss || [];

        // Financial balances
        const totalInvoiced = ti.filter(i => i.status !== "Cancelled" && i.status !== "cancelled").reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
        const totalCustomerPaid = cp.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const customerBalance = Math.max(0, totalInvoiced - totalCustomerPaid);

        const supplierBalance = sb.filter(b => b.status !== "Cancelled" && b.status !== "cancelled").reduce((s, b) => s + Math.max(0, (Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0)), 0);
        const totalSupplierPaid = sp.reduce((s, p) => s + (Number(p.amount) || 0), 0);

        setStats({
          customers: cust?.length || 0,
          activeCustomers: cust?.filter(c => c.active).length || 0,
          suppliers: supp?.length || 0,
          activeSuppliers: supp?.filter(s => s.active).length || 0,
          products: p.filter(pr => pr.active).length,
          lowStock: p.filter(pr => pr.active && (pr.current_stock || 0) <= (pr.minimum_stock || 0)).length,
          quotations: quot?.length || 0,
          proformas: prof?.length || 0,
          taxInvoices: ti.length,
          pendingInvoices: ti.filter(i => i.status === "Draft" || i.status === "Final").length,
          outstandingCustomerBalance: customerBalance,
          outstandingSupplierBalance: supplierBalance,
          projects: pj.length,
          activeProjects: pj.filter(prj => prj.status === "In Progress" || prj.status === "Planning").length,
          employees: em.length,
          currentPayroll: ssList.filter(s => ["paid", "approved", "Finalized", "Paid", "Approved"].includes(s.status || "")).reduce((s, r) => s + (Number(r.net_salary) || 0), 0),
          customerPaymentsTotal: totalCustomerPaid,
          supplierPaymentsTotal: totalSupplierPaid,
        });

        // Build recent activity list
        const activity: RecentTx[] = [];
        ti.slice(0, 5).forEach((i) => {
          const invoiceCustomer = Array.isArray(i.customers) ? i.customers[0] : i.customers;
          activity.push({
            id: i.id,
            type: "Tax Invoice",
            ref: i.invoice_number,
            party: invoiceCustomer?.name || "Client",
            amount: Number(i.total_amount || 0),
            date: i.invoice_date,
            status: i.status,
          });
        });
        setRecentActivity(activity);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadDashboard();
    return () => { mounted = false; };
  }, [router]);

  const card = (icon: React.ReactNode, label: string, value: string | number, sub: string, href: string, alert = false) => (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border bg-white p-4 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${
        alert ? "border-amber-300 bg-amber-50/30" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`rounded-lg p-2.5 transition-colors ${alert ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700 group-hover:bg-emerald-50 group-hover:text-emerald-700"}`}>
          {icon}
        </div>
        {alert && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-100/70 px-2 py-0.5 rounded-full">
            <AlertTriangle size={12} /> Reorder
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-slate-900 tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-700">{label}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </Link>
  );

  const quickAction = (label: string, icon: React.ReactNode, href: string) => (
    <Link
      key={label}
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs sm:text-sm font-semibold text-slate-700 hover:border-slate-800 hover:bg-slate-900 hover:text-white transition-all duration-150 group shadow-2xs"
    >
      <span className="text-slate-400 group-hover:text-emerald-400 shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <ArrowRight size={14} className="ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
    </Link>
  );

  return (
    <div className="min-h-full bg-slate-50">
      {/* Executive Hero Banner */}
      <header className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-md">
        {/* Subtle radial backdrop lighting and subtle micro pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_-10%,rgba(16,185,129,0.18),rgba(15,23,42,0))]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4 sm:gap-6 min-w-0">
              {/* Company Logo or Monogram (prominent desktop 80-96px, tablet 72-80px, mobile 64px) */}
              {company?.logo_url ? (
                <div className="relative h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 shrink-0 rounded-2xl border border-emerald-500/25 bg-slate-900/95 p-2.5 shadow-xl ring-1 ring-white/10 flex items-center justify-center backdrop-blur-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={company.logo_url}
                    alt={company.name || "Company Logo"}
                    className="max-h-full max-w-full object-contain drop-shadow"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white font-black text-2xl sm:text-3xl md:text-4xl shadow-xl shadow-emerald-950/50 ring-1 ring-white/10">
                  {companyName ? companyName.substring(0, 2).toUpperCase() : "DXB"}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live ERP Feed
                  </span>
                  {company?.trn && (
                    <span className="rounded-md bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-slate-300">
                      TRN: {company.trn}
                    </span>
                  )}
                  {company?.city && (
                    <span className="rounded-md bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                      {company.city}, UAE
                    </span>
                  )}
                </div>

                {/* Substantially Larger Company Name */}
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight break-words max-w-4xl leading-tight drop-shadow-sm">
                  {companyName}
                </h1>
                <p className="mt-1.5 text-xs sm:text-sm font-semibold text-emerald-400/90 flex items-center gap-2">
                  <span>Business Management Dashboard</span>
                  <span className="text-slate-500 hidden sm:inline">•</span>
                  <span className="text-slate-300 font-normal hidden sm:inline">Executive Control & Commercial Takeoffs</span>
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Comprehensive overview of your UAE business operations, cash flow, receivables, and live commercial metrics.
                </p>
              </div>
            </div>

            {/* Currency & System Status Badge */}
            <div className="flex items-center gap-3 self-start md:self-auto shrink-0 bg-slate-900/80 backdrop-blur-xs border border-slate-800 rounded-2xl p-3 sm:px-4 sm:py-3 shadow-sm">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Operating Currency</p>
                <p className="text-xs font-semibold text-white">United Arab Emirates Dirham</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold font-mono text-xs">
                AED
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 size={36} className="animate-spin text-slate-400" />
            <p className="text-slate-400 font-medium">Fetching real-time company statistics...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Quick Actions Bar */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {quickAction("Add Customer", <Users size={16} />, "/customers")}
                {quickAction("Add Supplier", <Truck size={16} />, "/suppliers")}
                {quickAction("Add Product", <Package size={16} />, "/products")}
                {quickAction("New Quotation", <FileText size={16} />, "/quotations")}
                {quickAction("New Proforma", <FileSpreadsheet size={16} />, "/proforma-invoices")}
                {quickAction("New Tax Invoice", <FileCheck2 size={16} />, "/tax-invoices")}
                {quickAction("New Purchase Order", <ShoppingBag size={16} />, "/purchase-orders")}
                {quickAction("New Payment", <Wallet size={16} />, "/payments")}
                {quickAction("New Project", <Briefcase size={16} />, "/projects")}
                {quickAction("Add Employee", <Users2 size={16} />, "/employees")}
              </div>
            </div>

            {/* Financial Overview Cards */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Financial Balances</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Customer Receipts</p>
                    <TrendingUp size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-emerald-800 font-mono">{fmtAED(stats.customerPaymentsTotal)}</p>
                  <p className="text-xs text-emerald-600 mt-1">Total collected from clients</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Outstanding Client Dues</p>
                    <Clock size={18} className="text-amber-600" />
                  </div>
                  <p className="text-2xl font-black text-amber-800 font-mono">{fmtAED(stats.outstandingCustomerBalance)}</p>
                  <p className="text-xs text-amber-600 mt-1">Pending customer collections</p>
                </div>

                <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Vendor Dues (AP)</p>
                    <Wallet size={18} className="text-rose-600" />
                  </div>
                  <p className="text-2xl font-black text-rose-800 font-mono">{fmtAED(stats.outstandingSupplierBalance)}</p>
                  <p className="text-xs text-rose-600 mt-1">Unpaid supplier bills</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Finalized Payroll</p>
                    <BarChart3 size={18} className="text-slate-600" />
                  </div>
                  <p className="text-2xl font-black text-slate-900 font-mono">{fmtAED(stats.currentPayroll)}</p>
                  <p className="text-xs text-slate-500 mt-1">Active monthly salary commitments</p>
                </div>
              </div>
            </div>

            {/* Core Counts */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Enterprise Operations</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {card(<Users size={18} />, "Customers", stats.activeCustomers, `${stats.customers} total`, "/customers")}
                {card(<Truck size={18} />, "Suppliers", stats.activeSuppliers, `${stats.suppliers} total`, "/suppliers")}
                {card(<Package size={18} />, "Products", stats.products, `${stats.lowStock} low stock`, "/inventory", stats.lowStock > 0)}
                {card(<Briefcase size={18} />, "Projects", stats.activeProjects, `${stats.projects} total`, "/projects")}
                {card(<Users2 size={18} />, "Employees", stats.employees, "Active workforce", "/employees")}
                {card(<FileCheck2 size={18} />, "Tax Invoices", stats.taxInvoices, `${stats.pendingInvoices} pending`, "/tax-invoices")}
              </div>
            </div>

            {/* Recent Activity Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Recent Commercial Activity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Latest tax invoices and commercial transactions</p>
                </div>
                <Link href="/tax-invoices" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  View All &rarr;
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Reference #</th>
                      <th className="px-4 py-3">Party / Client</th>
                      <th className="px-4 py-3 text-right">Amount (AED)</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentActivity.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No recent transactions found. Create your first quotation or invoice.
                        </td>
                      </tr>
                    ) : (
                      recentActivity.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{tx.type}</td>
                          <td className="px-4 py-2.5 font-mono text-emerald-600 font-semibold">{tx.ref}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{tx.party}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                            {tx.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-500">{tx.date}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
