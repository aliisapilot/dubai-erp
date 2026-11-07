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
import ImmersiveLogo from "@/components/ImmersiveLogo";

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
      className={`group flex flex-col rounded-xl border p-3.5 sm:p-4 shadow-md transition-all duration-150 hover:-translate-y-0.5 ${
        alert
          ? "border-amber-500/40 bg-amber-950/20 hover:border-amber-500/60"
          : "border-slate-800 bg-slate-900/90 hover:border-slate-700 hover:bg-slate-800/80"
      }`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div
          className={`rounded-lg p-2 transition-colors ${
            alert
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-slate-800 text-slate-300 border border-slate-700/60 group-hover:bg-emerald-500/20 group-hover:text-emerald-400 group-hover:border-emerald-500/30"
          }`}
        >
          {icon}
        </div>
        {alert && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} /> Reorder
          </span>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tight font-mono">{value}</p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-slate-300">{label}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </Link>
  );

  const quickAction = (label: string, icon: React.ReactNode, href: string) => (
    <Link
      key={label}
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-3 text-xs sm:text-sm font-semibold text-slate-300 hover:border-emerald-500/40 hover:bg-slate-800 hover:text-white transition-all duration-150 group shadow-sm"
    >
      <span className="text-slate-400 group-hover:text-emerald-400 shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <ArrowRight size={14} className="ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-emerald-400" />
    </Link>
  );

  return (
    <div className="min-h-full bg-slate-900 text-slate-100">
      {/* Executive Hero Banner */}
      <header className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-md">
        {/* Subtle radial backdrop lighting and subtle micro pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_-10%,rgba(16,185,129,0.18),rgba(15,23,42,0))]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center gap-3.5 sm:gap-4 md:gap-5 min-w-0">
            {/* Proportional vertically-aligned Company Logo */}
            <ImmersiveLogo
              src={company?.logo_url}
              alt={company?.name || "Company Logo"}
              fallbackText={companyName ? companyName.substring(0, 2).toUpperCase() : "DXB"}
              className="h-14 w-14 sm:h-16 sm:w-16 md:h-18 md:w-18 shrink-0 drop-shadow-md"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live ERP Feed
                </span>
                {company?.trn && (
                  <span className="rounded-md bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-[10px] sm:text-[11px] font-mono text-slate-300">
                    TRN: {company.trn}
                  </span>
                )}
                {company?.city && (
                  <span className="rounded-md bg-slate-800/90 border border-slate-700 px-2 py-0.5 text-[10px] sm:text-[11px] text-slate-300">
                    {company.city}, UAE
                  </span>
                )}
              </div>

              {/* Single horizontal line on desktop with balanced wrapping on mobile */}
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-[26px] font-black text-white tracking-tight leading-snug drop-shadow-sm whitespace-normal sm:whitespace-nowrap overflow-hidden text-ellipsis [text-wrap:balance]">
                {companyName}
              </h1>
              <p className="mt-0.5 text-xs font-semibold text-emerald-400/90 flex items-center gap-2">
                <span>Executive Management Dashboard</span>
                <span className="text-slate-500 hidden sm:inline">•</span>
                <span className="text-slate-400 font-normal hidden sm:inline">Commercial Operations & Financial Controls</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4">
            <Loader2 size={36} className="animate-spin text-emerald-400" />
            <p className="text-slate-400 font-medium text-sm">Fetching real-time company statistics...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Financial Overview Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Wallet size={14} className="text-emerald-400" />
                  <span>Financial Balances</span>
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">Live UAE Dirham (AED)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-4 sm:p-4.5 shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Customer Receipts</p>
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <TrendingUp size={15} />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{fmtAED(stats.customerPaymentsTotal)}</p>
                  <p className="text-[11px] text-emerald-400/80 mt-1">Total collected from clients</p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 p-4 sm:p-4.5 shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Outstanding Client Dues</p>
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Clock size={15} />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{fmtAED(stats.outstandingCustomerBalance)}</p>
                  <p className="text-[11px] text-amber-400/80 mt-1">Pending customer collections</p>
                </div>

                <div className="rounded-xl border border-rose-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/40 p-4 sm:p-4.5 shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Vendor Dues (AP)</p>
                    <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <Wallet size={15} />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{fmtAED(stats.outstandingSupplierBalance)}</p>
                  <p className="text-[11px] text-rose-400/80 mt-1">Unpaid supplier bills</p>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/40 p-4 sm:p-4.5 shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Finalized Payroll</p>
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                      <BarChart3 size={15} />
                    </div>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">{fmtAED(stats.currentPayroll)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Active monthly salary commitments</p>
                </div>
              </div>
            </div>

            {/* Core Operations Counts */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Briefcase size={14} className="text-emerald-400" />
                <span>Enterprise Operations</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
                {card(<Users size={17} />, "Customers", stats.activeCustomers, `${stats.customers} total`, "/customers")}
                {card(<Truck size={17} />, "Suppliers", stats.activeSuppliers, `${stats.suppliers} total`, "/suppliers")}
                {card(<Package size={17} />, "Products", stats.products, `${stats.lowStock} low stock`, "/inventory/products", stats.lowStock > 0)}
                {card(<Briefcase size={17} />, "Projects", stats.activeProjects, `${stats.projects} total`, "/projects")}
                {card(<Users2 size={17} />, "Employees", stats.employees, "Active workforce", "/employees")}
                {card(<FileCheck2 size={17} />, "Tax Invoices", stats.taxInvoices, `${stats.pendingInvoices} pending`, "/tax-invoices")}
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Quick Navigation & Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                {quickAction("Add Customer", <Users size={14} />, "/customers")}
                {quickAction("Add Supplier", <Truck size={14} />, "/suppliers")}
                {quickAction("Add Product", <Package size={14} />, "/inventory/products")}
                {quickAction("New Quotation", <FileText size={15} />, "/quotations")}
                {quickAction("New Proforma", <FileSpreadsheet size={15} />, "/proforma-invoices")}
                {quickAction("New Tax Invoice", <FileCheck2 size={15} />, "/tax-invoices")}
                {quickAction("New Purchase Order", <ShoppingBag size={15} />, "/purchase-orders")}
                {quickAction("New Payment", <Wallet size={15} />, "/payments")}
                {quickAction("New Project", <Briefcase size={15} />, "/projects")}
                {quickAction("Add Employee", <Users2 size={15} />, "/employees")}
              </div>
            </div>

            {/* Recent Activity Table */}
            <div className="bg-slate-900/90 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div>
                  <h3 className="font-bold text-white text-sm">Recent Commercial Activity</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Latest tax invoices and commercial transactions</p>
                </div>
                <Link
                  href="/tax-invoices"
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                >
                  <span>View All</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase font-semibold text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Reference #</th>
                      <th className="px-4 py-3">Party / Client</th>
                      <th className="px-4 py-3 text-right">Amount (AED)</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentActivity.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No recent transactions found. Create your first quotation or invoice.
                        </td>
                      </tr>
                    ) : (
                      recentActivity.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-white">{tx.type}</td>
                          <td className="px-4 py-3 font-mono text-emerald-400 font-bold hover:underline">
                            <Link href="/tax-invoices">{tx.ref}</Link>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-300">{tx.party}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-white">
                            {tx.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-400">{tx.date}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                tx.status === "paid" || tx.status === "approved"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                  : tx.status === "sent"
                                  ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                  : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
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
