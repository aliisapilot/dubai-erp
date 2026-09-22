"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Users, Truck, Package, Receipt, FileText,
  FileSpreadsheet, FileCheck2, ClipboardList, ShoppingBag,
  FileSignature, UserCheck, Users2, CalendarCheck, Clock,
  Banknote, BarChart3, Settings, ChevronDown, ChevronRight,
  LogOut, Menu, X, Wallet, Briefcase, TrendingUp, Calendar,
  Paperclip, ShieldAlert, ShieldCheck, CheckCircle2, FileCode2,
  CreditCard, ArrowDownRight, ArrowUpRight, RefreshCw, History,
  FileCheck
} from "lucide-react";
import { getCurrentCompany } from "@/lib/helpers";

type CompanyInfo = { name: string; trn: string | null; city: string | null };

type NavLinkProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
};

function NavLink({ href, icon, label, exact }: NavLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || (pathname.startsWith(href) && href !== "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-sm ${
        active
          ? "bg-slate-800 text-white font-medium shadow-sm"
          : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
      }`}
    >
      <span className={active ? "text-emerald-400" : "text-slate-400"}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

type SubLinkProps = { href: string; icon: React.ReactNode; label: string; exact?: boolean };
function SubLink({ href, icon, label, exact }: SubLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 py-1.5 text-xs transition-colors rounded px-2 ${
        active ? "text-emerald-400 font-semibold bg-slate-800/60" : "text-slate-400 hover:text-white hover:bg-slate-800/30"
      }`}
    >
      <span className={active ? "text-emerald-400" : "text-slate-500"}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Group expansion states
  const [salesOpen, setSalesOpen] = useState(
    pathname.startsWith("/customers") ||
    pathname.startsWith("/quotations") ||
    pathname.startsWith("/proforma") ||
    pathname.startsWith("/tax-invoices") ||
    pathname.startsWith("/delivery-notes") ||
    pathname.startsWith("/receipt-vouchers")
  );

  const [purchasingOpen, setPurchasingOpen] = useState(
    pathname.startsWith("/suppliers") ||
    pathname.startsWith("/purchase-orders") ||
    pathname.startsWith("/supplier-bills") ||
    pathname.startsWith("/supplier-payments")
  );

  const [inventoryOpen, setInventoryOpen] = useState(
    pathname.startsWith("/products") ||
    pathname.startsWith("/inventory")
  );

  const [projectsOpen, setProjectsOpen] = useState(
    pathname.startsWith("/projects")
  );

  const [hrOpen, setHrOpen] = useState(
    pathname.startsWith("/employees") ||
    pathname.startsWith("/attendance") ||
    pathname.startsWith("/overtime") ||
    pathname.startsWith("/salary") ||
    pathname.startsWith("/payslips") ||
    pathname.startsWith("/employee-payment-vouchers") ||
    pathname.startsWith("/payroll-summary")
  );

  const [financeOpen, setFinanceOpen] = useState(
    pathname.startsWith("/payments") ||
    pathname.startsWith("/expenses") ||
    pathname.startsWith("/petty-cash")
  );

  const [reportsOpen, setReportsOpen] = useState(
    pathname.startsWith("/reports")
  );

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;
        if (isMounted) setUserEmail(userData.user.email || "Account");
        const companyData = await getCurrentCompany();
        if (isMounted && companyData) {
          setCompany({
            name: companyData.name || "Your Company",
            trn: companyData.trn || null,
            city: companyData.city || "Dubai"
          });
        }
      } catch (err) {
        console.error("Sidebar load error:", err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setLoggingOut(false);
    }
  }

  const navContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      {/* Brand Header */}
      <div className="border-b border-slate-800 p-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-black text-sm shadow-md">
            DXB
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-tight text-base">Dubai ERP</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                5% VAT
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[150px]">{company?.name || "Enterprise"}</p>
          </div>
        </Link>
        {company?.trn && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-400">
            <span className="truncate">TRN: {company.trn}</span>
            <span className="text-emerald-400 font-medium">UAE</span>
          </div>
        )}
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 text-sm custom-scrollbar">
        {/* DASHBOARD */}
        <NavLink href="/" icon={<LayoutDashboard size={18} />} label="Dashboard" exact />

        {/* SALES */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setSalesOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <Receipt size={18} className="text-emerald-400" />
              <span>Sales</span>
            </div>
            {salesOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {salesOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/customers" icon={<Users size={14} />} label="Customers" />
              <SubLink href="/quotations" icon={<FileText size={14} />} label="Quotations" />
              <SubLink href="/proforma-invoices" icon={<FileSpreadsheet size={14} />} label="Proforma Invoices" />
              <SubLink href="/tax-invoices" icon={<FileCheck2 size={14} />} label="Tax Invoices" />
              <SubLink href="/delivery-notes" icon={<ClipboardList size={14} />} label="Delivery Notes" />
              <SubLink href="/receipt-vouchers" icon={<Receipt size={14} />} label="Receipt Vouchers" />
              <SubLink href="/customers/statements" icon={<FileSpreadsheet size={14} />} label="Customer Statements" />
            </div>
          )}
        </div>

        {/* PURCHASING */}
        <div>
          <button
            type="button"
            onClick={() => setPurchasingOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag size={18} className="text-blue-400" />
              <span>Purchasing</span>
            </div>
            {purchasingOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {purchasingOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/suppliers" icon={<Truck size={14} />} label="Suppliers" />
              <SubLink href="/purchase-orders" icon={<FileSignature size={14} />} label="Purchase Orders" />
              <SubLink href="/supplier-bills" icon={<FileCheck2 size={14} />} label="Supplier Bills" />
              <SubLink href="/supplier-payments" icon={<Wallet size={14} />} label="Supplier Payments" />
            </div>
          )}
        </div>

        {/* INVENTORY */}
        <div>
          <button
            type="button"
            onClick={() => setInventoryOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <Package size={18} className="text-amber-400" />
              <span>Inventory</span>
            </div>
            {inventoryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {inventoryOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/products" icon={<Package size={14} />} label="Products &amp; Services" />
              <SubLink href="/inventory" icon={<ClipboardList size={14} />} label="Stock Overview" exact />
              <SubLink href="/inventory/stock-in" icon={<ArrowDownRight size={14} />} label="Stock In" />
              <SubLink href="/inventory/stock-out" icon={<ArrowUpRight size={14} />} label="Stock Out" />
              <SubLink href="/inventory/adjustments" icon={<RefreshCw size={14} />} label="Stock Adjustments" />
              <SubLink href="/inventory/movements" icon={<History size={14} />} label="Stock Movements" />
            </div>
          )}
        </div>

        {/* PROJECTS */}
        <div>
          <button
            type="button"
            onClick={() => setProjectsOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <Briefcase size={18} className="text-purple-400" />
              <span>Projects</span>
            </div>
            {projectsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {projectsOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/projects" icon={<Briefcase size={14} />} label="Projects" exact />
              <SubLink href="/projects/costing" icon={<TrendingUp size={14} />} label="Project Costing" />
              <SubLink href="/projects/milestones" icon={<Calendar size={14} />} label="Payment Milestones" />
              <SubLink href="/projects/attachments" icon={<Paperclip size={14} />} label="Attachments" />
              <SubLink href="/projects/wms" icon={<FileText size={14} />} label="Work Method Statements" />
              <SubLink href="/projects/risk-assessments" icon={<ShieldAlert size={14} />} label="Risk Assessments" />
              <SubLink href="/projects/qaqc" icon={<ShieldCheck size={14} />} label="QA/QC Inspection" />
              <SubLink href="/projects/handover" icon={<FileCheck size={14} />} label="Handover" />
              <SubLink href="/projects/documents" icon={<FileCode2 size={14} />} label="Technical Documents" />
            </div>
          )}
        </div>

        {/* HR & PAYROLL */}
        <div>
          <button
            type="button"
            onClick={() => setHrOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <UserCheck size={18} className="text-teal-400" />
              <span>HR &amp; Payroll</span>
            </div>
            {hrOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {hrOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/employees" icon={<Users2 size={14} />} label="Employees" />
              <SubLink href="/attendance" icon={<CalendarCheck size={14} />} label="Attendance" />
              <SubLink href="/overtime" icon={<Clock size={14} />} label="Overtime" />
              <SubLink href="/salary-statements" icon={<Banknote size={14} />} label="Salary Statements" />
              <SubLink href="/payslips" icon={<FileText size={14} />} label="Salary Slips" />
              <SubLink href="/employee-payment-vouchers" icon={<FileCheck2 size={14} />} label="Payment Vouchers" />
              <SubLink href="/payroll-summary" icon={<BarChart3 size={14} />} label="Payroll Summary" />
            </div>
          )}
        </div>

        {/* FINANCE */}
        <div>
          <button
            type="button"
            onClick={() => setFinanceOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <Wallet size={18} className="text-emerald-400" />
              <span>Finance</span>
            </div>
            {financeOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {financeOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/payments" icon={<Wallet size={14} />} label="Payments" />
              <SubLink href="/expenses" icon={<CreditCard size={14} />} label="Expenses" />
              <SubLink href="/petty-cash" icon={<Receipt size={14} />} label="Petty Cash" />
            </div>
          )}
        </div>

        {/* REPORTS */}
        <div>
          <button
            type="button"
            onClick={() => setReportsOpen(p => !p)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/50 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <BarChart3 size={18} className="text-indigo-400" />
              <span>Reports</span>
            </div>
            {reportsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {reportsOpen && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-slate-800 pl-3">
              <SubLink href="/reports/sales" icon={<TrendingUp size={14} />} label="Sales Reports" />
              <SubLink href="/reports/purchases" icon={<ShoppingBag size={14} />} label="Purchase Reports" />
              <SubLink href="/reports/customer-statements" icon={<FileSpreadsheet size={14} />} label="Customer Statements" />
              <SubLink href="/reports/supplier-statements" icon={<Truck size={14} />} label="Supplier Statements" />
              <SubLink href="/reports/vat" icon={<FileCheck2 size={14} />} label="VAT Reports (FTA 201)" />
              <SubLink href="/reports/inventory" icon={<Package size={14} />} label="Inventory Reports" />
              <SubLink href="/reports/project-profitability" icon={<TrendingUp size={14} />} label="Project Profitability" />
              <SubLink href="/reports/payroll" icon={<BarChart3 size={14} />} label="Payroll Reports" />
            </div>
          )}
        </div>

        {/* ADMINISTRATION */}
        <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          Administration
        </div>
        <NavLink href="/settings" icon={<Settings size={18} />} label="Settings" />
        <NavLink href="/settings/designer" icon={<FileText size={18} />} label="PDF Designer" />
      </div>

      {/* User Footer */}
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{userEmail}</p>
            <p className="text-[11px] text-emerald-400 font-medium">Enterprise User</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={loggingOut}
            title="Sign Out"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Navigation */}
      <aside className="no-print print-hide hidden md:flex h-screen w-64 flex-col shrink-0 border-r border-slate-800 sticky top-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Top Bar */}
      <div className="no-print print-hide md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 text-white">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-black text-xs text-white">
            DXB
          </div>
          <span className="font-bold text-sm tracking-tight">Dubai ERP</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(p => !p)}
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
          aria-label="Toggle Navigation"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">{navContent}</div>
        </div>
      )}
    </>
  );
}
