"use client";
import { useEffect, useState } from 'react';
import { loadDocumentLayout, createDefaultLayout, type DocumentTypeId, type DocumentLayout } from '@/lib/documentDesigner';

export function usePersistedDocumentDesign(companyId: string | null | undefined, documentType: DocumentTypeId) {
  const key = `${companyId}:${documentType}`;
  const [state, setState] = useState<{ key: string; layout: DocumentLayout; ready: boolean; error?: string }>({ key:'', layout:createDefaultLayout(documentType), ready:false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled=false;
    loadDocumentLayout(companyId,documentType).then(result => {
      if(cancelled)return;
      setState({key,layout:result.layout,ready:result.source==='database' && !result.error,
        error:result.error || (result.source!=='database' ? 'No cloud design is selected. Open PDF Designer and save your design to cloud first.' : undefined)});
    }).catch(error => { if(!cancelled)setState({key,layout:createDefaultLayout(documentType),ready:false,error:String(error)}); });
    return () => {cancelled=true;};
  },[companyId,documentType,key,retry]);
  return { layout:state.layout,ready:state.key===key && state.ready,error:state.key===key?state.error:undefined,retry:()=>setRetry(value=>value+1) };
}
export function DesignLoadState({ error, retry }: {error?: string; retry:()=>void}) {
  return <div data-design-print-blocked="true" role="status" className="bg-white p-8 text-slate-800">
    <p>{error || 'Loading saved cloud design…'}</p>
    {error && <button type="button" onClick={retry} className="mt-3 underline">Retry cloud load</button>}
  </div>;
}
