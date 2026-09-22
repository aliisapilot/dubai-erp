-- ==============================================================================
-- Dubai ERP: Document Templates & PDF Designer SQL Migration
-- Run this in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  template_name TEXT NOT NULL DEFAULT 'Default Template',
  layout_json JSONB NOT NULL,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_company_type 
  ON public.document_templates (company_id, document_type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_doc_templates_company_type_name'
  ) THEN
    ALTER TABLE public.document_templates
      ADD CONSTRAINT uq_doc_templates_company_type_name 
      UNIQUE (company_id, document_type, template_name);
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage document templates" ON public.document_templates;
CREATE POLICY "Authenticated users can manage document templates"
  ON public.document_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon users can view document templates" ON public.document_templates;
CREATE POLICY "Anon users can view document templates"
  ON public.document_templates
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_templates TO authenticated;
GRANT SELECT ON TABLE public.document_templates TO anon;
