"use client";

import React, { Suspense } from "react";
import DocumentDesigner from "@/components/designer/DocumentDesigner";
import { useSearchParams } from "next/navigation";

function DesignerContent() {
  const searchParams = useSearchParams();
  const rawType = searchParams?.get("type") || searchParams?.get("docType") || "default";
  return <DocumentDesigner key={rawType} initialType={rawType !== "default" ? rawType : undefined} />;
}

export default function DocumentDesignerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-300">Loading PDF Designer...</div>}>
      <DesignerContent />
    </Suspense>
  );
}
