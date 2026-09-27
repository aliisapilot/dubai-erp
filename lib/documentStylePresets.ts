import { supabase } from "@/lib/supabase";
import {
  createDocumentStylePresetManager,
  DocumentStylePreset,
  DocumentStylePresetStore,
} from "@/lib/documentStylePresetModel";

const PRESET_COLUMNS = "id, company_id, document_type, template_name, layout_json, is_default, updated_at";

const store: DocumentStylePresetStore = {
  async list(companyId, documentType) {
    const { data, error } = await supabase
      .from("document_templates")
      .select(PRESET_COLUMNS)
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .order("is_default", { ascending: false })
      .order("template_name");
    if (error) throw new Error(error.message);
    return (data || []) as DocumentStylePreset[];
  },

  async save({ companyId, documentType, name, layout }) {
    const { data, error } = await supabase
      .from("document_templates")
      .insert(
        {
          company_id: companyId,
          document_type: documentType,
          template_name: name,
          layout_json: layout,
          is_default: false,
          updated_at: new Date().toISOString(),
        },
      )
      .select(PRESET_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as DocumentStylePreset;
  },

  async update({ companyId, documentType, id, name, layout }) {
    const { data, error } = await supabase
      .from("document_templates")
      .update({
        template_name: name,
        layout_json: layout,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .select(PRESET_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as DocumentStylePreset;
  },

  async rename(companyId, documentType, id, name) {
    const { error } = await supabase
      .from("document_templates")
      .update({ template_name: name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("document_type", documentType);
    if (error) throw new Error(error.message);
  },

  async delete(companyId, documentType, id) {
    const { error } = await supabase
      .from("document_templates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("document_type", documentType);
    if (error) throw new Error(error.message);
  },

  async setDefault(companyId, documentType, id) {
    const { error: clearError } = await supabase
      .from("document_templates")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .eq("is_default", true);
    if (clearError) throw new Error(clearError.message);

    const { data, error: setError } = await supabase
      .from("document_templates")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("document_type", documentType)
      .select("id")
      .single();
    if (setError) throw new Error(setError.message);
    if (!data) throw new Error("The selected style was not found for this company and document type.");
  },
};

export const documentStylePresets = createDocumentStylePresetManager(store);

export type { DocumentStylePreset } from "@/lib/documentStylePresetModel";
