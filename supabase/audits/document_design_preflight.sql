-- Read-only: capture actual columns, grants, policy expressions and row counts.
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user, now();
SELECT to_regclass('public.document_templates') AS template_table;
SELECT column_name,udt_name,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('document_templates','document_design_selections') ORDER BY table_name,ordinal_position;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('document_templates','document_design_selections','profiles','companies');
SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name IN ('document_templates','document_design_selections');
SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.document_templates');
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='document_template_company_access';
SELECT company_id,document_type,count(*) AS styles,count(*) FILTER(WHERE is_default) AS defaults
 FROM public.document_templates GROUP BY company_id,document_type ORDER BY company_id,document_type;
SELECT id,company_id,document_type,template_name,updated_at,md5(layout_json::text) AS layout_digest
 FROM public.document_templates ORDER BY id;
COMMIT;
