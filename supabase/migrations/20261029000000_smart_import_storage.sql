-- ============================================================
-- Dubai ERP — Smart Import Storage Bucket Configuration
-- File: supabase/migrations/20261029000000_smart_import_storage.sql
-- Idempotent, safe configuration for private document upload storage
-- ============================================================

-- 1. Ensure private storage bucket for smart imports
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
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800;

-- 2. Storage RLS Policies: Strictly company-scoped access
-- Storage paths follow isolated structure: `<company_id>/<batch_id>/<filename>`
-- Broad access is strictly prohibited; users can only access files under their own authorized company.
DROP POLICY IF EXISTS "smart_imports_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_select" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
      UNION
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (active IS NULL OR active = true)
    )
  );

DROP POLICY IF EXISTS "smart_imports_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_insert" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
      UNION
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (active IS NULL OR active = true)
    )
  );

DROP POLICY IF EXISTS "smart_imports_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "smart_imports_company_scoped_delete" ON storage.objects;
CREATE POLICY "smart_imports_company_scoped_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'smart-imports' AND
    (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' AND
    (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
      UNION
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (active IS NULL OR active = true)
    )
  );

NOTIFY pgrst, 'reload schema';
