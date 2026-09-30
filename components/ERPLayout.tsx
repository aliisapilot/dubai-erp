"use client";

import { ReactNode, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

export default function ERPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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

  // On login or mobile portal pages, render children directly without ERP desktop sidebar/header
  if (pathname === "/login" || pathname.startsWith("/mobile")) {
    return <>{children}</>;
  }

  const isDesigner = pathname === "/settings/designer";

  return (
    <div className="flex h-screen w-full m-0 p-0 bg-slate-900 text-slate-100 overflow-hidden print:block print:h-auto print:min-h-0 print:bg-white print:p-0 print:m-0 print:w-[210mm]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col h-full m-0 p-0 overflow-hidden print:block print:w-[210mm] print:overflow-visible print:m-0 print:p-0">
        {!isDesigner && <Navbar />}
        <main
          data-print-root
          className="flex-1 min-w-0 flex flex-col m-0 p-0 overflow-y-auto overflow-x-hidden bg-slate-50 text-slate-900 print:overflow-visible"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
