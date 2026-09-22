"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { getCurrentCompany } from "@/lib/helpers";

type UserProfile = {
  email: string;
  companyName: string;
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Do not render navbar on login page
  const isLoginPage = pathname === "/login";

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
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        {/* Brand & Edition Badge */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm transition-transform group-hover:scale-105">
              <span className="text-sm font-black tracking-wider">DXB</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base tracking-tight">
                  Dubai ERP
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  UAE VAT 5%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-0.5 truncate max-w-[140px]">
                {profile?.companyName || "Enterprise"}
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    item.active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right Section: Region & User Profile */}
        <div className="flex items-center gap-3">
          {/* UAE Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            <Globe size={13} className="text-slate-400" />
            <span>UAE (AED)</span>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <UserIcon size={13} />
              </div>
              <span className="max-w-[130px] truncate hidden sm:inline">
                {profile?.email || "Account"}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-lg ring-1 ring-black/5 z-50"
                onMouseLeave={() => setDropdownOpen(false)}
              >
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {profile?.companyName || "Dubai ERP"}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {profile?.email || ""}
                  </p>
                </div>

                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Building2 size={15} className="text-slate-400" />
                    Company Settings
                  </Link>
                </div>

                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <LogOut size={15} />
                    {loggingOut ? "Signing out..." : "Sign Out"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation bar */}
      <div className="flex md:hidden border-t border-slate-200 px-4 py-2 overflow-x-auto gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                item.active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={14} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
