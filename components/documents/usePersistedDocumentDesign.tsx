"use client";
import { useEffect, useState } from 'react';
import { loadDocumentLayout, peekDocumentPreview, createDefaultLayout, type DocumentTypeId, type DocumentLayout } from '@/lib/documentDesigner';
import { prepareSavedAutoFit } from '@/lib/documentLayoutEngine';
import { getCachedCompanySync } from '@/lib/helpers';

export function usePersistedDocumentDesign(companyId: string | null | undefined, documentType: DocumentTypeId) {
  const resolvedCompanyId = companyId || (typeof window !== "undefined" ? getCachedCompanySync()?.id : undefined);
  const key = `${resolvedCompanyId || "pending"}:${documentType}`;

  const [state, setState] = useState<{ key: string; layout: DocumentLayout; ready: boolean; error?: string }>(() => {
    if (resolvedCompanyId) {
      const cached = peekDocumentPreview(resolvedCompanyId, documentType);
      if (cached?.layout) {
        return { key, layout: cached.layout, ready: true };
      }
    }
    return {
      key,
      layout: createDefaultLayout(documentType),
      ready: !resolvedCompanyId, // If company account is expected but not yet known, wait rather than prematurely concluding default
    };
  });

  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Wait if company is still resolving
    if (!resolvedCompanyId && companyId === undefined) {
      return;
    }

    loadDocumentLayout(resolvedCompanyId, documentType, { preview: true, fresh: retry > 0 }).then(result => {
      if (cancelled) return;
      const isFailedDefault = result.source === "default" && Boolean(result.error);
      setState({
        key,
        layout: result.layout,
        ready: !isFailedDefault,
        error: result.error,
      });
    }).catch(error => {
      if (!cancelled) {
        setState({
          key,
          layout: createDefaultLayout(documentType),
          ready: false,
          error: String(error),
        });
      }
    });

    return () => { cancelled = true; };
  }, [resolvedCompanyId, companyId, documentType, key, retry]);

  // Never expose another company's/type's previous layout during a prop change.
  const activeLayout = state.key === key ? state.layout : createDefaultLayout(documentType);
  const isReady = state.key === key && state.ready;

  return {
    layout: prepareSavedAutoFit(activeLayout),
    rawLayout: activeLayout,
    ready: isReady,
    error: state.key === key ? state.error : undefined,
    retry: () => setRetry(value => value + 1)
  };
}

export function DesignLoadState({ error, retry }: {error?: string; retry: () => void}) {
  return (
    <div
      data-design-print-blocked={error ? "true" : undefined}
      role="status"
      className="bg-white p-8 text-slate-800 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center max-w-md mx-auto my-12"
    >
      <p className="font-semibold text-slate-900 text-sm">
        {error ? `Design Load Error: ${error}` : 'Loading saved design…'}
      </p>
      {error && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
        >
          Retry Cloud Load
        </button>
      )}
    </div>
  );
}

