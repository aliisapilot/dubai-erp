"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

export default function ERPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // On login page, render children directly without ERP sidebar/header
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const isDesigner = pathname === "/settings/designer";

  return (
    <div className="flex min-h-screen w-full m-0 p-0 bg-slate-900 text-slate-100 print:block print:min-h-0 print:bg-white print:p-0 print:m-0 print:w-[210mm]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col m-0 p-0 overflow-x-hidden print:block print:w-[210mm] print:overflow-visible print:m-0 print:p-0">
        {!isDesigner && <Navbar />}
        <div data-print-root className="flex-1 min-w-0 flex flex-col m-0 p-0 overflow-y-auto bg-slate-50 text-slate-900">
          {children}
        </div>
      </div>
    </div>
  );
}
