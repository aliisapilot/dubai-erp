"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  Briefcase,
  ClipboardList,
  LogOut,
  ChevronDown,
  User as UserIcon,
  Globe,
  FileText,
  Receipt,
  FileSpreadsheet,
  ShoppingBag,
  Package,
  Users2,
  CalendarCheck,
  Clock,
  Banknote,
  BarChart3,
  Wallet,
  TrendingUp,
  Menu,
  CreditCard,
  FileSignature,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";
import { getCurrentCompany } from "@/lib/helpers";

type UserProfile = {
  email: string;
  companyName: string;
  trn?: string | null;
};

function getPageMeta(pathname: string): { title: string; icon: LucideIcon } {
  if (pathname === "/") return { title: "Executive Dashboard", icon: LayoutDashboard };
  if (pathname.startsWith("/tax-invoices")) return { title: "Tax Invoices", icon: Receipt };
  if (pathname.startsWith("/proforma")) return { title: "Proforma Invoices", icon: FileText };
  if (pathname.startsWith("/quotations")) return { title: "Quotations", icon: FileSpreadsheet };
  if (pathname.startsWith("/delivery-notes")) return { title: "Delivery Notes", icon: ClipboardList };
  if (pathname.startsWith("/customers/statements")) return { title: "Customer Statements", icon: FileText };
  if (pathname.startsWith("/customers")) return { title: "Customers", icon: Users };
  if (pathname.startsWith("/suppliers")) return { title: "Suppliers", icon: Truck };
  if (pathname.startsWith("/purchase-orders")) return { title: "Purchase Orders", icon: ShoppingBag };
  if (pathname.startsWith("/supplier-bills")) return { title: "Supplier Bills", icon: FileSignature };
  if (pathname.startsWith("/supplier-payments")) return { title: "Supplier Payments", icon: CreditCard };
  if (pathname.startsWith("/inventory/movements")) return { title: "Stock Movements", icon: ArrowDownRight };
  if (pathname.startsWith("/inventory")) return { title: "Inventory", icon: Package };
  if (pathname.startsWith("/products")) return { title: "Products & Services", icon: Package };
  if (pathname.startsWith("/projects")) return { title: "Projects", icon: Briefcase };
  if (pathname.startsWith("/employees")) return { title: "Employees", icon: Users2 };
  if (pathname.startsWith("/attendance")) return { title: "Attendance", icon: CalendarCheck };
  if (pathname.startsWith("/overtime")) return { title: "Overtime", icon: Clock };
  if (pathname.startsWith("/salary-statements") || pathname.startsWith("/salary")) return { title: "Salary Statements", icon: Banknote };
  if (pathname.startsWith("/payslips")) return { title: "Payslips", icon: Receipt };
  if (pathname.startsWith("/payroll-summary")) return { title: "Payroll Summary", icon: BarChart3 };
  if (pathname.startsWith("/employee-payment-vouchers")) return { title: "Payment Vouchers", icon: Wallet };
  if (pathname.startsWith("/payments")) return { title: "Payments & Banking", icon: Wallet };
  if (pathname.startsWith("/expenses")) return { title: "Expenses", icon: Receipt };
  if (pathname.startsWith("/reports")) return { title: "Reports & Analytics", icon: TrendingUp };
  if (pathname.startsWith("/settings/designer")) return { title: "PDF Designer", icon: FileText };
  if (pathname.startsWith("/settings")) return { title: "Company Settings", icon: Building2 };

  const segment = pathname.split("/").filter(Boolean)[0] || "Dashboard";
  const formatted = segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { title: formatted, icon: LayoutDashboard };
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLoginPage = pathname === "/login";
  const pageMeta = getPageMeta(pathname);
  const PageIcon = pageMeta.icon;

  useEffect(() => {
    if (isLoginPage) return;

    let isMounted = true;

    async function loadUserAndCompany() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;

        const email = userData.user.email || "User";
        const company = await getCurrentCompany();

        if (isMounted) {
          setProfile({
            email,
            companyName: company?.name || "Dubai ERP",
            trn: company?.trn || null,
          });
        }
      } catch (err) {
        console.error("Error loading user profile in navbar:", err);
      }
    }

    loadUserAndCompany();

    return () => {
      isMounted = false;
    };
  }, [pathname, isLoginPage]);

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Close dropdown on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDropdownOpen(false);
  }, [pathname]);

  if (isLoginPage) {
    return null;
  }

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

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/",
    },
    {
      name: "Projects",
      href: "/projects",
      icon: Briefcase,
      active: pathname.startsWith("/projects"),
    },
    {
      name: "Delivery Notes",
      href: "/delivery-notes",
      icon: ClipboardList,
      active: pathname.startsWith("/delivery-notes"),
    },
    {
      name: "Customers",
      href: "/customers",
      icon: Users,
      active: pathname.startsWith("/customers"),
    },
    {
      name: "Suppliers",
      href: "/suppliers",
      icon: Truck,
      active: pathname.startsWith("/suppliers"),
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Building2,
      active: pathname.startsWith("/settings") && !pathname.startsWith("/settings/designer"),
    },
  ];

  return (
    <nav className="sticky top-0 z-40 h-14 bg-slate-900 border-b border-slate-800 text-white select-none shrink-0 m-0 p-0">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Left Section: Mobile Menu Trigger + Brand (Mobile only) + Dynamic Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-erp-sidebar"))}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Toggle Navigation"
          >
            <Menu size={18} />
          </button>

          {/* Mobile DXB Brand Icon */}
          <Link href="/" className="md:hidden flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-black text-xs shadow-sm">
              DXB
            </div>
          </Link>

          {/* Active Page Indicator */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-emerald-400 border border-slate-700/60 shrink-0">
              <PageIcon size={15} />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-white truncate">
                {pageMeta.title}
              </h1>
              <span className="hidden xl:inline-flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                UAE VAT 5%
              </span>
            </div>
          </div>
        </div>

        {/* Center Section: Quick Navigation Links */}
        <div className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  item.active
                    ? "bg-slate-800 text-emerald-400 font-semibold border border-slate-700/60 shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Icon size={14} className={item.active ? "text-emerald-400" : "text-slate-400"} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Right Section: PDF Designer Action + UAE Badge + User Profile Dropdown */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* PDF Designer Shortcut Action Button */}
          <Link
            href="/settings/designer"
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
            title="Open PDF Document Designer"
          >
            <FileText size={13} />
            <span className="hidden md:inline">PDF Designer</span>
          </Link>

          {/* UAE Region & Currency Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-300">
            <Globe size={13} className="text-emerald-400" />
            <span>UAE (AED)</span>
          </div>

          {/* User Account Controls */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700/80 transition-colors"
              aria-expanded={dropdownOpen}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                {profile?.email ? profile.email.charAt(0).toUpperCase() : <UserIcon size={12} />}
              </div>
              <span className="max-w-[120px] truncate hidden md:inline text-slate-200">
                {profile?.email || "Account"}
              </span>
              <ChevronDown
                size={13}
                className={`text-slate-400 transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-800 py-1.5 shadow-2xl z-50 ring-1 ring-black/40 text-slate-200">
                {/* User Info Header */}
                <div className="border-b border-slate-700/80 px-3.5 py-2.5">
                  <p className="text-xs font-bold text-white truncate">
                    {profile?.companyName || "Dubai ERP"}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {profile?.email || ""}
                  </p>
                  {profile?.trn && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-1">
                      TRN: {profile.trn}
                    </p>
                  )}
                </div>

                {/* Navigation Links */}
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/70 hover:text-white transition-colors"
                  >
                    <Building2 size={14} className="text-slate-400" />
                    Company Settings
                  </Link>
                  <Link
                    href="/settings/designer"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/70 hover:text-white transition-colors"
                  >
                    <FileText size={14} className="text-emerald-400" />
                    PDF Designer
                  </Link>
                </div>

                {/* Sign Out Action */}
                <div className="border-t border-slate-700/80 pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    <LogOut size={14} />
                    <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
