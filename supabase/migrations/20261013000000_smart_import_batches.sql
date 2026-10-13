-- ============================================================
-- Dubai ERP — Smart Import & Batch Audit Migration
-- File: supabase/migrations/20261013000000_smart_import_batches.sql
-- Idempotent, safe migration for tracking document import batches & rollback
-- ============================================================

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  batch_name TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 1,
  filenames JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'completed',
  records_created JSONB DEFAULT '{}'::jsonb,
  records_matched JSONB DEFAULT '{}'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  checksum_sha256 TEXT,
  rolled_back BOOLEAN DEFAULT FALSE,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_company ON public.import_batches(company_id, created_at DESC);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_manage_import_batches') THEN
    CREATE POLICY "auth_manage_import_batches" ON public.import_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON TABLE public.import_batches TO authenticated;
GRANT ALL ON TABLE public.import_batches TO anon;

NOTIFY pgrst, 'reload schema';
