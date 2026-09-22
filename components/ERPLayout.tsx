"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function ERPLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // On login page, render children directly without ERP sidebar
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 print:block print:min-h-0 print:bg-white print:p-0 print:m-0 print:w-[210mm]">
      <div className="no-print print-hide hidden md:block shrink-0">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden print:block print:w-[210mm] print:overflow-visible print:m-0 print:p-0">
        {children}
      </main>
    </div>
  );
}
