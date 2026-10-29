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

-- 2. Storage RLS Policies: Authenticated users can upload and view within smart-imports
DROP POLICY IF EXISTS "smart_imports_authenticated_select" ON storage.objects;
CREATE POLICY "smart_imports_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'smart-imports');

DROP POLICY IF EXISTS "smart_imports_authenticated_insert" ON storage.objects;
CREATE POLICY "smart_imports_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'smart-imports');

DROP POLICY IF EXISTS "smart_imports_authenticated_delete" ON storage.objects;
CREATE POLICY "smart_imports_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'smart-imports');

NOTIFY pgrst, 'reload schema';
