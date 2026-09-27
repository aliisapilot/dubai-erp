-- Restrict document template access to companies linked to the authenticated user.
-- This replaces the original permissive policies from 20260922160000_document_templates.sql.
-- Review and explicitly approve before applying to any production database.

DROP POLICY IF EXISTS "Authenticated users can manage document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Anon users can view document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Company members can manage document templates" ON public.document_templates;

CREATE OR REPLACE FUNCTION public.document_template_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.owner_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND (p.active IS NULL OR p.active = TRUE)
      AND p.company_id = p_company_id
  );
$$;

REVOKE ALL ON FUNCTION public.document_template_company_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_template_company_access(UUID) TO authenticated;

CREATE POLICY "Company members can manage document templates"
  ON public.document_templates
  FOR ALL
  TO authenticated
  USING (public.document_template_company_access(company_id))
  WITH CHECK (public.document_template_company_access(company_id));

REVOKE ALL ON TABLE public.document_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_templates TO authenticated;

NOTIFY pgrst, 'reload schema';
