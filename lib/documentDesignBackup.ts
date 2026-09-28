import type { DocumentLayout, DocumentTypeId } from './documentDesigner';

const prefixes = ['dubai-erp.doc-layout.', 'dubai-erp.document-style.', 'dubai-erp.design-draft.', 'dubai-erp.design-cache.', 'dubai-erp.brand-'];
export function exportDesignBackup(current?: DocumentLayout, cloud?: unknown) {
  const browser: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some(prefix => key.startsWith(prefix))) browser[key] = localStorage.getItem(key)!;
  }
  const blob = new Blob([JSON.stringify({ format: 1, exportedAt: new Date().toISOString(), origin: location.origin, browser, current, cloud }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `erp-design-backup-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function preserveDesignDraft(companyId: string | null | undefined, type: DocumentTypeId, layout: DocumentLayout) {
  if (typeof window === 'undefined') return;
  try {
    const key = `dubai-erp.design-draft.${companyId || 'anonymous'}.${type}`;
    const previous = localStorage.getItem(key);
    // Preserve the prior draft once per session before replacing the draft slot.
    const backup = `${key}.backup.${sessionId}`;
    if (previous && !localStorage.getItem(backup)) localStorage.setItem(backup, previous);
    localStorage.setItem(key, JSON.stringify(layout));
  } catch { /* Cloud save still works when browser storage is full. Export is available. */ }
}
const sessionId = Date.now().toString(36);
