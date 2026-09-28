-- PRODUCTION: require a verified external backup + approval before running.
-- This migration snapshots all existing rows before any table alteration. It never
-- rewrites layout JSON, names, company mappings, or existing default flags.
BEGIN;
CREATE SCHEMA IF NOT EXISTS erp_private;
REVOKE ALL ON SCHEMA erp_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS erp_private.design_migration_backups (
  migration text PRIMARY KEY, captured_at timestamptz NOT NULL DEFAULT now(),
  table_existed boolean NOT NULL, rows jsonb NOT NULL, policies jsonb NOT NULL
);
DO $$
DECLARE saved_rows jsonb := '[]'; saved_policies jsonb := '[]'; existed boolean;
BEGIN
  existed := to_regclass('public.document_templates') IS NOT NULL;
  IF existed THEN
    LOCK TABLE public.document_templates IN ACCESS EXCLUSIVE MODE;
    SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') INTO saved_rows FROM public.document_templates t;
    SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]') INTO saved_policies FROM pg_policies p
      WHERE schemaname = 'public' AND tablename = 'document_templates';
  END IF;
  INSERT INTO erp_private.design_migration_backups(migration,table_existed,rows,policies)
  VALUES ('20261001000000',existed,saved_rows,saved_policies) ON CONFLICT DO NOTHING;
END $$;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id), document_type text NOT NULL,
  template_name text NOT NULL, layout_json jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS assets_json jsonb NOT NULL DEFAULT '{}';
-- Existing incompatible/partial schemas fail here, rolling the entire transaction back.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.document_templates WHERE id IS NULL OR version IS NULL OR version < 1 OR
    jsonb_typeof(layout_json) <> 'object' OR layout_json IS NULL) THEN
    RAISE EXCEPTION 'Existing design rows need review. No automatic repair or replacement was attempted.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.document_design_selections (
  company_id uuid NOT NULL REFERENCES public.companies(id), document_type text NOT NULL,
  template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,document_type)
);
CREATE OR REPLACE FUNCTION public.document_template_company_access(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id=p_company_id AND c.owner_id=auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.company_id=p_company_id AND coalesce(p.active,true))
  );
$$;
REVOKE ALL ON FUNCTION public.document_template_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_template_company_access(uuid) TO authenticated;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_design_selections ENABLE ROW LEVEL SECURITY;
-- Restrictive policy bounds even unknown permissive legacy policies.
DROP POLICY IF EXISTS design_company_boundary ON public.document_templates;
CREATE POLICY design_company_boundary ON public.document_templates AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.document_template_company_access(company_id)) WITH CHECK(public.document_template_company_access(company_id));
DROP POLICY IF EXISTS design_company_read ON public.document_templates;
CREATE POLICY design_company_read ON public.document_templates FOR SELECT TO authenticated USING(public.document_template_company_access(company_id));
DROP POLICY IF EXISTS design_selection_read ON public.document_design_selections;
CREATE POLICY design_selection_read ON public.document_design_selections FOR SELECT TO authenticated USING(public.document_template_company_access(company_id));
DROP POLICY IF EXISTS design_selection_boundary ON public.document_design_selections;
CREATE POLICY design_selection_boundary ON public.document_design_selections AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.document_template_company_access(company_id)) WITH CHECK(public.document_template_company_access(company_id));
-- Old deployments must fail explicitly rather than bypass version checks via upsert.
REVOKE ALL ON public.document_templates, public.document_design_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_templates, public.document_design_selections TO authenticated;

CREATE OR REPLACE FUNCTION public.read_document_design(p_company_id uuid, p_document_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.document_template_company_access(p_company_id) THEN RAISE EXCEPTION 'Company access denied' USING ERRCODE='42501'; END IF;
 -- One statement gives a consistent selection/template snapshot under READ COMMITTED.
 SELECT jsonb_build_object('template',(
   SELECT to_jsonb(t) FROM public.document_templates t
   WHERE t.company_id=p_company_id AND t.document_type=p_document_type
     AND ((s.template_id IS NOT NULL AND t.id=s.template_id) OR (s.template_id IS NULL AND t.is_default))
   ORDER BY t.updated_at DESC,t.id LIMIT 1), 'selection_version',coalesce(s.version,0)) INTO result
 FROM (SELECT 1) singleton LEFT JOIN public.document_design_selections s
   ON s.company_id=p_company_id AND s.document_type=p_document_type;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.write_document_design(
 p_company_id uuid, p_document_type text, p_template_id uuid, p_expected_version bigint,
 p_expected_selection bigint, p_name text, p_layout jsonb, p_assets jsonb, p_activate boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.document_templates; selection_version bigint; saved_id uuid;
BEGIN
 IF NOT public.document_template_company_access(p_company_id) THEN RAISE EXCEPTION 'Company access denied' USING ERRCODE='42501'; END IF;
 IF p_document_type IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 OR
   p_layout IS NULL OR jsonb_typeof(p_layout) IS DISTINCT FROM 'object' OR
   (p_layout->>'documentType') IS DISTINCT FROM p_document_type OR
   jsonb_typeof(p_layout->'elements') IS DISTINCT FROM 'array' OR
   jsonb_typeof(p_assets) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid complete design payload' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text || ':' || p_document_type,0));
 SELECT coalesce((SELECT s.version FROM public.document_design_selections s WHERE s.company_id=p_company_id AND s.document_type=p_document_type),0) INTO selection_version;
 IF p_activate AND (p_expected_selection IS NULL OR selection_version <> p_expected_selection) THEN
   RAISE EXCEPTION 'Selected design changed in another session' USING ERRCODE='40001'; END IF;
 IF p_template_id IS NULL THEN
   IF p_expected_version IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Invalid new design version' USING ERRCODE='40001'; END IF;
   IF EXISTS (SELECT 1 FROM public.document_templates t WHERE t.company_id=p_company_id AND t.document_type=p_document_type AND lower(t.template_name)=lower(btrim(p_name))) THEN
     RAISE EXCEPTION 'A style with this name already exists. Choose a different name.' USING ERRCODE='23505'; END IF;
   INSERT INTO public.document_templates(company_id,document_type,template_name,layout_json,assets_json,is_default,version)
   VALUES(p_company_id,p_document_type,btrim(p_name),p_layout,p_assets,false,1) RETURNING * INTO row;
 ELSE
   SELECT * INTO row FROM public.document_templates t WHERE t.id=p_template_id AND t.company_id=p_company_id AND t.document_type=p_document_type FOR UPDATE;
   IF NOT FOUND OR p_expected_version IS NULL OR row.version<>p_expected_version THEN
     RAISE EXCEPTION 'Design changed in another session' USING ERRCODE='40001'; END IF;
   IF EXISTS (SELECT 1 FROM public.document_templates t WHERE t.company_id=p_company_id AND t.document_type=p_document_type AND t.id<>p_template_id AND lower(t.template_name)=lower(btrim(p_name))) THEN
     RAISE EXCEPTION 'A style with this name already exists.' USING ERRCODE='23505'; END IF;
   UPDATE public.document_templates SET template_name=btrim(p_name),layout_json=p_layout,assets_json=p_assets,
     version=version+1,updated_at=clock_timestamp() WHERE id=p_template_id RETURNING * INTO row;
 END IF;
 saved_id := row.id;
 IF p_activate THEN
   INSERT INTO public.document_design_selections(company_id,document_type,template_id,version)
   VALUES(p_company_id,p_document_type,saved_id,1)
   ON CONFLICT(company_id,document_type) DO UPDATE SET template_id=excluded.template_id,
     version=public.document_design_selections.version+1,updated_at=clock_timestamp();
   selection_version := selection_version+1;
 END IF;
 RETURN jsonb_build_object('template',to_jsonb(row),'selection_version',selection_version);
END $$;

CREATE OR REPLACE FUNCTION public.mutate_document_design(
 p_company_id uuid,p_document_type text,p_template_id uuid,p_expected_version bigint,
 p_expected_selection bigint,p_action text,p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.document_templates; selection_version bigint;
BEGIN
 IF NOT public.document_template_company_access(p_company_id) THEN RAISE EXCEPTION 'Company access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text || ':' || p_document_type,0));
 SELECT * INTO row FROM public.document_templates t WHERE t.id=p_template_id AND t.company_id=p_company_id AND t.document_type=p_document_type FOR UPDATE;
 IF NOT FOUND OR p_expected_version IS NULL OR row.version<>p_expected_version THEN RAISE EXCEPTION 'Design changed in another session' USING ERRCODE='40001'; END IF;
 IF p_action='select' THEN
   SELECT coalesce((SELECT s.version FROM public.document_design_selections s WHERE s.company_id=p_company_id AND s.document_type=p_document_type),0) INTO selection_version;
   IF p_expected_selection IS NULL OR selection_version<>p_expected_selection THEN RAISE EXCEPTION 'Selected design changed in another session' USING ERRCODE='40001'; END IF;
   INSERT INTO public.document_design_selections(company_id,document_type,template_id) VALUES(p_company_id,p_document_type,p_template_id)
   ON CONFLICT(company_id,document_type) DO UPDATE SET template_id=excluded.template_id,version=public.document_design_selections.version+1,updated_at=clock_timestamp();
 ELSIF p_action='rename' THEN
   IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid style name'; END IF;
   IF EXISTS(SELECT 1 FROM public.document_templates t WHERE t.company_id=p_company_id AND t.document_type=p_document_type AND t.id<>p_template_id AND lower(t.template_name)=lower(btrim(p_name))) THEN RAISE EXCEPTION 'A style with this name already exists.' USING ERRCODE='23505'; END IF;
   UPDATE public.document_templates SET template_name=btrim(p_name),layout_json=jsonb_set(layout_json,'{templateName}',to_jsonb(btrim(p_name))),version=version+1,updated_at=clock_timestamp() WHERE id=p_template_id;
 ELSIF p_action='delete' THEN
   IF row.is_default OR EXISTS(SELECT 1 FROM public.document_design_selections s WHERE s.template_id=p_template_id) THEN RAISE EXCEPTION 'Select another cloud design before deleting this style.'; END IF;
   DELETE FROM public.document_templates WHERE id=p_template_id;
 ELSE RAISE EXCEPTION 'Unknown design action' USING ERRCODE='22023';
 END IF;
 RETURN public.read_document_design(p_company_id,p_document_type);
END $$;
REVOKE ALL ON FUNCTION public.read_document_design(uuid,text),
 public.write_document_design(uuid,text,uuid,bigint,bigint,text,jsonb,jsonb,boolean),
 public.mutate_document_design(uuid,text,uuid,bigint,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_document_design(uuid,text),
 public.write_document_design(uuid,text,uuid,bigint,bigint,text,jsonb,jsonb,boolean),
 public.mutate_document_design(uuid,text,uuid,bigint,bigint,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
