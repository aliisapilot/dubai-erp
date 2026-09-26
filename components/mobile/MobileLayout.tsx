"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentCompany } from "@/lib/helpers";
import {
  FileText, Wallet, FolderLock, LogOut, ExternalLink,
  Loader2
} from "lucide-react";
import { CompanyDocInfo } from "@/components/documents/DocHeader";

export default function MobileLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [company, setCompany] = useState<CompanyDocInfo | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          router.replace("/login");
          return;
        }

        if (isMounted) {
          const co = await getCurrentCompany();
          if (co) setCompany(co);
          setAuthChecking(false);
        }
      } catch (err) {
        console.error("Mobile auth check error:", err);
        router.replace("/login");
      }
    }

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-300">
        <Loader2 className="animate-spin text-emerald-400 mb-2" size={28} />
        <p className="text-xs font-medium">Securing Mobile Document Portal...</p>
      </div>
    );
  }

  const isDocs = pathname === "/mobile";
  const isCheques = pathname === "/mobile/cheques";
  const isFiles = pathname === "/mobile/files";

  return (
    <div className="min-h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      {/* Top Mobile App Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-black text-xs shadow-xs">
              DXB
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-xs tracking-tight">Dubai ERP Portal</span>
                <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[8px] font-bold text-emerald-400 border border-emerald-500/30">
                  MOBILE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate max-w-[170px] leading-none mt-0.5">
                {company?.name || "Enterprise"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              title="Open Full Desktop ERP"
              className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-800 px-3 text-[10px] text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <span>Full ERP</span>
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area with Safe-Area Padding */}
      <main className="flex-1 w-full overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>

      {/* Fixed Bottom Mobile Navigation Bar (iPhone Style) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-16 w-full max-w-3xl grid-cols-4">
          {/* Documents Tab */}
          <Link
            href="/mobile"
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 transition-colors ${
              isDocs ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText size={18} />
            <span className="text-[10px]">Documents</span>
          </Link>

          {/* Cheques Tab */}
          <Link
            href="/mobile/cheques"
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 transition-colors ${
              isCheques ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wallet size={18} />
            <span className="text-[10px]">Cheques</span>
          </Link>

          {/* Company Files Tab */}
          <Link
            href="/mobile/files"
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 transition-colors ${
              isFiles ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderLock size={18} />
            <span className="text-[10px]">Files</span>
          </Link>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-slate-400 transition-colors hover:text-rose-400"
          >
            <LogOut size={18} />
            <span className="text-[10px]">Sign Out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
