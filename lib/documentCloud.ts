import type { DocumentLayout, DocumentTypeId } from './documentDesigner';
import type { DocumentStylePreset } from './documentStylePresetModel';

export interface CloudRevision {
  templateId: string | null;
  version: number;
  selectionVersion: number;
}
export interface CloudSnapshot { template: DocumentStylePreset | null; selection_version: number }
export interface CloudRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
}
export class DocumentCloudError extends Error {
  constructor(message: string, public code = 'CLOUD_ERROR') { super(message); }
}
export function cloudError(error: unknown): DocumentCloudError {
  if (error instanceof DocumentCloudError) return error;
  const detail = error as { code?: string; message?: string };
  if (detail?.code === '40001') return new DocumentCloudError('Another session changed this style or the selected design. Your draft is preserved. Export it, then reload the cloud version before saving again.', 'CONFLICT');
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(detail?.code || '')) return new DocumentCloudError('Cloud design storage needs its approved migration. Your design has not been saved to Supabase.', 'MIGRATION_REQUIRED');
  return new DocumentCloudError(detail?.message || 'Could not reach cloud storage. Your design has not been saved to Supabase.', detail?.code);
}

// Images produced by the Designer are data URLs and travel inside the complete JSON.
// Stable HTTPS / deployed public paths are references; temporary browser URLs cannot sync.
export function collectDesignAssets(layout: DocumentLayout): Record<string, string> {
  const assets: Record<string, string> = {};
  function walk(value: unknown, path: string) {
    if (typeof value === 'string') {
      if (/^(blob:|file:|https?:\/\/(localhost|127\.0\.0\.1)(:|\/))/i.test(value)) throw new DocumentCloudError('Replace temporary or local image links with an uploaded image before cloud save.', 'INVALID_ASSET');
      if (/^(data:image\/|https:\/\/|\/company-assets\/)/i.test(value)) {
        if (/\/storage\/v1\/object\/sign\//i.test(value)) throw new DocumentCloudError('Expiring image links cannot be saved. Upload the image into the design instead.', 'INVALID_ASSET');
        assets[path] = value;
      }
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    }
  }
  walk(layout, '');
  return assets;
}
export function revisionOf(snapshot: CloudSnapshot): CloudRevision {
  return { templateId: snapshot.template?.id || null, version: snapshot.template?.version || 0, selectionVersion: snapshot.selection_version };
}
export function createDocumentCloud(client: CloudRpcClient) {
  async function rpc(name: string, args: Record<string, unknown>, timeoutMs = 8000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: unknown; error: { code?: string; message: string } | null }>((_, reject) => {
      timer = setTimeout(() => reject(new DocumentCloudError('Cloud storage request timed out.', 'TIMEOUT')), timeoutMs);
    });
    try {
      const res = await Promise.race([client.rpc(name, args), timeoutPromise]);
      if (res && 'error' in res && res.error) throw cloudError(res.error);
      return res && 'data' in res ? res.data : res;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {
    async load(companyId: string, documentType: DocumentTypeId): Promise<CloudSnapshot> {
      const snapshot = await rpc('read_document_design', { p_company_id: companyId, p_document_type: documentType }) as CloudSnapshot;
      if (!snapshot || !Number.isInteger(snapshot.selection_version)) throw new DocumentCloudError('Invalid cloud design response. Reload before editing.');
      if (snapshot.template && (snapshot.template.company_id !== companyId || snapshot.template.document_type !== documentType || snapshot.template.layout_json.documentType !== documentType)) throw new DocumentCloudError('Cloud design scope does not match this document.');
      return snapshot;
    },
    async save(companyId: string, documentType: DocumentTypeId, layout: DocumentLayout, revision: CloudRevision, name = layout.templateName, activate = true): Promise<CloudSnapshot> {
      if (!companyId || !revision || !Number.isInteger(revision.selectionVersion)) throw new DocumentCloudError('Load the cloud design successfully before saving.');
      if (layout.documentType !== documentType) throw new DocumentCloudError('The design belongs to another document type.');
      const assets = collectDesignAssets(layout);
      return await rpc('write_document_design', {
        p_company_id: companyId, p_document_type: documentType, p_template_id: revision.templateId,
        p_expected_version: revision.version, p_expected_selection: revision.selectionVersion,
        p_name: name.trim(), p_layout: { ...layout, templateName: name.trim() }, p_assets: assets, p_activate: activate,
      }) as CloudSnapshot;
    },
    async mutate(companyId: string, preset: DocumentStylePreset, action: 'rename' | 'delete' | 'select', selectionVersion = 0, name = preset.template_name): Promise<CloudSnapshot> {
      return await rpc('mutate_document_design', { p_company_id: companyId, p_document_type: preset.document_type,
        p_template_id: preset.id, p_expected_version: preset.version, p_expected_selection: selectionVersion,
        p_action: action, p_name: name.trim() }) as CloudSnapshot;
    },
  };
}
