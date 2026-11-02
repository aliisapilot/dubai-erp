import { supabase } from './supabase';
import { documentCloud, normalizeLayout, createSOA101ReferenceLayout, SOA_REFERENCE_TEMPLATE_NAME } from './documentDesigner';
import type { DocumentLayout, DocumentTypeId } from './documentDesigner';
import type { DocumentStylePreset } from './documentStylePresetModel';
export type { DocumentStylePreset } from './documentStylePresetModel';
const columns = 'id,company_id,document_type,template_name,layout_json,is_default,updated_at,version';

function getBuiltInPresets(companyId: string, docType?: DocumentTypeId): DocumentStylePreset[] {
  const presets: DocumentStylePreset[] = [];
  if (!docType || docType === 'customer_statement') {
    presets.push({
      id: 'preset-soa-101-reference',
      company_id: companyId,
      document_type: 'customer_statement',
      template_name: SOA_REFERENCE_TEMPLATE_NAME,
      layout_json: createSOA101ReferenceLayout(),
      is_default: false,
      updated_at: '2026-10-31T00:00:00.000Z',
      version: 1,
    });
  }
  return presets;
}

export const documentStylePresets = {
  async listAll(companyId: string) {
    let existing: DocumentStylePreset[] = [];
    try {
      const { data, error } = await supabase.from('document_templates').select(columns).eq('company_id',companyId).order('template_name');
      if (!error && data) existing = data as DocumentStylePreset[];
    } catch {
      // Fall back to built-ins
    }
    const builtIns = getBuiltInPresets(companyId);
    const filteredBuiltIns = builtIns.filter(b => !existing.some(e => e.template_name === b.template_name || e.id === b.id));
    return [...existing, ...filteredBuiltIns];
  },
  async list(companyId: string, documentType: DocumentTypeId) {
    let existing: DocumentStylePreset[] = [];
    try {
      const {data, error} = await supabase.from('document_templates').select(columns).eq('company_id',companyId).eq('document_type',documentType).order('template_name');
      if (!error && data) existing = data as DocumentStylePreset[];
    } catch {
      // Fall back to built-ins
    }
    const builtIns = getBuiltInPresets(companyId, documentType);
    const filteredBuiltIns = builtIns.filter(b => !existing.some(e => e.template_name === b.template_name || e.id === b.id));
    return [...existing, ...filteredBuiltIns];
  },
  async duplicate(companyId: string, documentType: DocumentTypeId, preset: DocumentStylePreset, name: string) {
    const result = await documentCloud.save(companyId,documentType,preset.layout_json,{templateId:null,version:0,selectionVersion:0},name,false);
    return result.template!;
  },
  rename(companyId: string, preset: DocumentStylePreset, name: string) {
    if (preset.id.startsWith('preset-soa-')) {
      return documentCloud.save(companyId, preset.document_type, preset.layout_json, { templateId: null, version: 0, selectionVersion: 0 }, name, false).then(() => {});
    }
    return documentCloud.mutate(companyId,preset,'rename',0,name);
  },
  delete(companyId: string, _documentType: DocumentTypeId, preset: DocumentStylePreset) {
    if (preset.id.startsWith('preset-soa-')) return Promise.resolve();
    return documentCloud.mutate(companyId,preset,'delete');
  },
  apply(preset: DocumentStylePreset, documentType: DocumentTypeId): DocumentLayout {
    if(preset.document_type !== documentType || preset.layout_json.documentType !== documentType) throw new Error('Style belongs to another document type.');
    return normalizeLayout({ ...JSON.parse(JSON.stringify(preset.layout_json)), templateName:preset.template_name });
  }
};
