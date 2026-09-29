import { supabase } from './supabase';
import { documentCloud, normalizeLayout } from './documentDesigner';
import { cloudError } from './documentCloud';
import type { DocumentLayout, DocumentTypeId } from './documentDesigner';
import type { DocumentStylePreset } from './documentStylePresetModel';
export type { DocumentStylePreset } from './documentStylePresetModel';
const columns = 'id,company_id,document_type,template_name,layout_json,is_default,updated_at,version,assets_json';
export const documentStylePresets = {
  async listAll(companyId: string) {
    const { data, error } = await supabase.from('document_templates').select(columns).eq('company_id',companyId).order('template_name');
    if(error) throw cloudError(error); return (data || []) as DocumentStylePreset[];
  },
  async list(companyId: string, documentType: DocumentTypeId) { return (await this.listAll(companyId)).filter(p => p.document_type === documentType); },
  async duplicate(companyId: string, documentType: DocumentTypeId, preset: DocumentStylePreset, name: string) {
    const result = await documentCloud.save(companyId,documentType,preset.layout_json,{templateId:null,version:0,selectionVersion:0},name,false);
    return result.template!;
  },
  rename(companyId: string, preset: DocumentStylePreset, name: string) { return documentCloud.mutate(companyId,preset,'rename',0,name); },
  delete(companyId: string, _documentType: DocumentTypeId, preset: DocumentStylePreset) { return documentCloud.mutate(companyId,preset,'delete'); },
  apply(preset: DocumentStylePreset, documentType: DocumentTypeId): DocumentLayout {
    if(preset.document_type !== documentType || preset.layout_json.documentType !== documentType) throw new Error('Style belongs to another document type.');
    return normalizeLayout({ ...JSON.parse(JSON.stringify(preset.layout_json)), templateName:preset.template_name });
  }
};
