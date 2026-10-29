"use client";
import { useEffect, useState } from 'react';
import { loadDocumentLayout, peekDocumentPreview, createDefaultLayout, type DocumentTypeId, type DocumentLayout } from '@/lib/documentDesigner';
import { prepareSavedAutoFit } from '@/lib/documentLayoutEngine';

export function usePersistedDocumentDesign(companyId: string | null | undefined, documentType: DocumentTypeId) {
  const key = `${companyId}:${documentType}`;
  const [state, setState] = useState<{ key: string; layout: DocumentLayout; ready: boolean; error?: string }>(() => {
    const cached = peekDocumentPreview(companyId, documentType);
    return { key, layout: cached?.layout || createDefaultLayout(documentType), ready: true };
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadDocumentLayout(companyId, documentType, { preview: true, fresh: retry > 0 }).then(result => {
      if (cancelled) return;
      setState({
        key,
        layout: result.layout,
        ready: Boolean(result.layout),
        error: result.error,
      });
    }).catch(error => {
      if (!cancelled) setState({ key, layout: createDefaultLayout(documentType), ready: true, error: String(error) });
    });
    return () => { cancelled = true; };
  }, [companyId, documentType, key, retry]);
  // Never expose another company's/type's previous layout during a prop change.
  const activeLayout = state.key === key ? state.layout : createDefaultLayout(documentType);
  return {
    layout: prepareSavedAutoFit(activeLayout),
    rawLayout: activeLayout,
    ready: state.key === key && state.ready,
    error: state.key === key ? state.error : undefined,
    retry: () => setRetry(value => value + 1)
  };
}
export function DesignLoadState({ error, retry }: {error?: string; retry: () => void}) {
  return <div data-design-print-blocked={error ? "true" : undefined} role="status" className="bg-white p-8 text-slate-800">
    <p>{error || 'Loading saved design…'}</p>
    {error && <button type="button" onClick={retry} className="mt-3 underline">Retry cloud load</button>}
  </div>;
}
