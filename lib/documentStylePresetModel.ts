import type { DocumentLayout, DocumentTypeId } from "./documentDesigner";

export interface DocumentStylePreset {
  id: string;
  company_id: string;
  document_type: DocumentTypeId;
  template_name: string;
  layout_json: DocumentLayout;
  is_default: boolean;
  updated_at: string;
}

export interface DocumentStylePresetStore {
  list(companyId: string, documentType: DocumentTypeId): Promise<DocumentStylePreset[]>;
  save(input: {
    companyId: string;
    documentType: DocumentTypeId;
    name: string;
    layout: DocumentLayout;
  }): Promise<DocumentStylePreset>;
  update(input: {
    companyId: string;
    documentType: DocumentTypeId;
    id: string;
    name: string;
    layout: DocumentLayout;
  }): Promise<DocumentStylePreset>;
  rename(companyId: string, documentType: DocumentTypeId, id: string, name: string): Promise<void>;
  delete(companyId: string, documentType: DocumentTypeId, id: string): Promise<void>;
  setDefault(companyId: string, documentType: DocumentTypeId, id: string): Promise<void>;
}

function cloneLayout(layout: DocumentLayout): DocumentLayout {
  return JSON.parse(JSON.stringify(layout)) as DocumentLayout;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name for this saved style.");
  if (trimmed.length > 80) throw new Error("Style names must be 80 characters or fewer.");
  return trimmed;
}

export function createDocumentStylePresetManager(store: DocumentStylePresetStore) {
  function requireCompany(companyId: string | null | undefined): string {
    if (!companyId) throw new Error("A company account is required to manage saved styles.");
    return companyId;
  }

  return {
    list(companyId: string | null | undefined, documentType: DocumentTypeId) {
      return store.list(requireCompany(companyId), documentType);
    },

    save(
      companyId: string | null | undefined,
      documentType: DocumentTypeId,
      name: string,
      layout: DocumentLayout
    ) {
      if (layout.documentType !== documentType) {
        throw new Error("A saved style can only be used with its matching document type.");
      }
      const authorizedCompanyId = requireCompany(companyId);
      return store.list(authorizedCompanyId, documentType).then((presets) => {
        if (presets.some((preset) => preset.template_name.toLowerCase() === validateName(name).toLowerCase())) {
          throw new Error("A saved style with this name already exists for the selected document type.");
        }
        return store.save({
          companyId: authorizedCompanyId,
          documentType,
          name: validateName(name),
          layout: cloneLayout(layout),
        });
      });
    },

    update(
      companyId: string | null | undefined,
      documentType: DocumentTypeId,
      id: string,
      name: string,
      layout: DocumentLayout
    ) {
      if (layout.documentType !== documentType) {
        throw new Error("A saved style can only be used with its matching document type.");
      }
      return store.update({
        companyId: requireCompany(companyId),
        documentType,
        id,
        name: validateName(name),
        layout: cloneLayout(layout),
      });
    },

    rename(
      companyId: string | null | undefined,
      documentType: DocumentTypeId,
      id: string,
      name: string
    ) {
      return store.rename(requireCompany(companyId), documentType, id, validateName(name));
    },

    delete(
      companyId: string | null | undefined,
      documentType: DocumentTypeId,
      preset: DocumentStylePreset
    ) {
      if (preset.is_default) {
        throw new Error("Choose another default style before deleting this one.");
      }
      return store.delete(requireCompany(companyId), documentType, preset.id);
    },

    setDefault(companyId: string | null | undefined, documentType: DocumentTypeId, id: string) {
      return store.setDefault(requireCompany(companyId), documentType, id);
    },

    duplicate(
      companyId: string | null | undefined,
      documentType: DocumentTypeId,
      preset: DocumentStylePreset,
      name: string
    ) {
      if (preset.document_type !== documentType) {
        throw new Error("A saved style can only be duplicated within its document type.");
      }
      return store.save({
        companyId: requireCompany(companyId),
        documentType,
        name: validateName(name),
        layout: cloneLayout(preset.layout_json),
      });
    },

    apply(preset: DocumentStylePreset, documentType: DocumentTypeId): DocumentLayout {
      if (preset.document_type !== documentType || preset.layout_json.documentType !== documentType) {
        throw new Error("This saved style belongs to a different document type.");
      }
      return {
        ...cloneLayout(preset.layout_json),
        templateName: preset.template_name,
      };
    },
  };
}
