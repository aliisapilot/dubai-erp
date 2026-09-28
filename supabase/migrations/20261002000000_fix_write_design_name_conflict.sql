-- Migration: fix write_document_design to overwrite when name matches and template_id is null.
-- Resolves 'A style with this name already exists' when cloudRevision.templateId is null.
BEGIN;

CREATE OR REPLACE FUNCTION public.write_document_design(
 p_company_id uuid, p_document_type text, p_template_id uuid, p_expected_version bigint,
 p_expected_selection bigint, p_name text, p_layout jsonb, p_assets jsonb, p_activate boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS 
$$
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
   -- If a template with this name already exists, overwrite it (name-match overwrite intent).
   SELECT * INTO row FROM public.document_templates t
     WHERE t.company_id=p_company_id AND t.document_type=p_document_type
       AND lower(t.template_name)=lower(btrim(p_name))
     FOR UPDATE LIMIT 1;
   IF FOUND THEN
     UPDATE public.document_templates SET template_name=btrim(p_name),layout_json=p_layout,assets_json=p_assets,
       version=version+1,updated_at=clock_timestamp() WHERE id=row.id RETURNING * INTO row;
   ELSE
     INSERT INTO public.document_templates(company_id,document_type,template_name,layout_json,assets_json,is_default,version)
     VALUES(p_company_id,p_document_type,btrim(p_name),p_layout,p_assets,false,1) RETURNING * INTO row;
   END IF;
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
END 
$$
;

REVOKE ALL ON FUNCTION public.write_document_design(uuid,text,uuid,bigint,bigint,text,jsonb,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.write_document_design(uuid,text,uuid,bigint,bigint,text,jsonb,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;