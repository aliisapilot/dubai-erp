"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { getCurrentCompany } from "@/lib/helpers";
import { documentTypeForPreviewPath } from "@/lib/documentPreviewRoute";

export default function ERPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Prevent mouse-wheel scrolling from inadvertently incrementing/decrementing number fields.
    // Intercept in capture phase so the number input never mutates its value, and the page continues scrolling smoothly.
    const handleWheel = (e: WheelEvent) => {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement && activeEl.type === "number") {
        activeEl.blur();
      }
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") {
        (target as HTMLInputElement).blur();
      }
    };

    window.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  const isPublicPage =
    pathname === "/login" ||
    pathname.startsWith("/mobile") ||
    pathname.startsWith("/print-test-sheet") ||
    pathname.startsWith("/settings/designer") ||
    pathname.startsWith("/measurements") ||
    pathname.startsWith("/attendance");

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      if (isPublicPage) {
        if (isMounted) {
          setIsAuthenticated(true);
          setAuthChecking(false);
        }
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          if (isMounted) {
            setIsAuthenticated(false);
            setAuthChecking(false);
            router.replace("/login");
          }
        } else {
          if (isMounted) {
            setIsAuthenticated(true);
            setAuthChecking(false);
          }
        }
      } catch (err) {
        console.warn("Auth check error:", err);
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthChecking(false);
          router.replace("/login");
        }
      }
    }

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isPublicPage) {
        if (isMounted) {
          setIsAuthenticated(false);
          router.replace("/login");
        }
      } else if (session) {
        if (isMounted) {
          setIsAuthenticated(true);
        }
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [pathname, isPublicPage, router]);

  useEffect(() => {
    const documentType = documentTypeForPreviewPath(pathname);
    if (!isAuthenticated || !documentType) return;
    let cancelled = false;
    let warm: (() => void) | undefined;
    void Promise.all([getCurrentCompany(), import('@/lib/documentDesigner')]).then(([company, {loadDocumentLayout}]) => {
      if (cancelled || !company?.id) return;
      warm = () => { void loadDocumentLayout(company.id, documentType, {preview: true}).catch(() => {}); };
      warm();
    }).catch(() => { /* Opening the preview exposes errors and allows a fresh retry. */ });
    const onIntent = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest('button, a') : null;
      const label = target?.getAttribute('title') || target?.getAttribute('aria-label') || target?.textContent || '';
      if (/\b(print|pdf)\b/i.test(label)) warm?.();
    };
    document.addEventListener('pointerover', onIntent);
    document.addEventListener('focusin', onIntent);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, [isAuthenticated, pathname]);

  // On login or mobile portal pages, render children directly without ERP desktop sidebar/header
  if (pathname === "/login" || pathname.startsWith("/mobile")) {
    return <>{children}</>;
  }

  // If checking authentication for protected route, show clean loading state
  if (authChecking && !isPublicPage) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-slate-100">
        <Loader2 className="animate-spin text-emerald-400" size={32} />
      </div>
    );
  }

  // If unauthenticated on protected route, do not render children (redirecting to /login)
  if (!isAuthenticated && !isPublicPage) {
    return null;
  }

  const isDesigner = pathname === "/settings/designer";

  return (
    <div className="erp-screen-theme flex h-screen w-full m-0 p-0 bg-slate-900 text-slate-100 overflow-hidden print:block print:h-auto print:min-h-0 print:bg-white print:p-0 print:m-0 print:w-[210mm]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col h-full m-0 p-0 overflow-hidden print:block print:w-[210mm] print:overflow-visible print:m-0 print:p-0">
        {!isDesigner && <Navbar />}
        <main
          data-print-root
          className="flex-1 min-w-0 flex flex-col m-0 p-0 overflow-y-auto overflow-x-hidden bg-slate-900 text-slate-100 print:overflow-visible"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
