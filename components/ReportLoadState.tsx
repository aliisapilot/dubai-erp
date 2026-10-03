"use client";

import { Loader2 } from "lucide-react";

export default function ReportLoadState({ loading, error, onRetry, subject = "report", unavailableMessage = "Totals are unavailable until all required data loads successfully." }: {
  loading: boolean;
  error: string;
  onRetry: () => void;
  subject?: string;
  unavailableMessage?: string;
}) {
  return (
    <section data-report-print-blocked className="m-6 rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-100" aria-busy={loading}>
      {loading ? (
        <p role="status" className="flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading {subject} data…</p>
      ) : (
        <>
          <p role="alert">Could not load the {subject}: {error}</p>
          <p className="mt-2 text-sm text-slate-400">{unavailableMessage}</p>
          <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white">Retry</button>
        </>
      )}
    </section>
  );
}
