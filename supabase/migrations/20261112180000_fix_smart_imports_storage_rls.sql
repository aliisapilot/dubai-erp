-- ============================================================
-- Dubai ERP — Smart Imports Private Bucket & Company-Scoped RLS Fix
-- File: supabase/migrations/20261112180000_fix_smart_imports_storage_rls.sql
-- Safe & Idempotent Migration
-- Run in Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. Ensure private 'smart-imports' bucket exists (non-public, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smart-imports',
  'smart-imports',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Company-scoped RLS policies on storage.objects for 'smart-imports'
-- Path format: <company_id>/<batch_id>/<unique_filename>
-- Uses public.get_auth_user_company_ids() for consistent multi-tenant isolation.

DROP POLICY IF EXISTS "smart_imports_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_select" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_company_ids())
  );

DROP POLICY IF EXISTS "smart_imports_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_insert" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_company_ids())
  );

DROP POLICY IF EXISTS "smart_imports_company_scoped_update" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_company_ids())
  )
  WITH CHECK (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_company_ids())
  );

DROP POLICY IF EXISTS "smart_imports_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_delete" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_auth_user_company_ids())
  );

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
