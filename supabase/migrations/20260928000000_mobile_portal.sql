-- ==============================================================================
-- Dubai ERP: Mobile Document Portal, Permissions & Access Logging Migration
-- File: supabase/migrations/20260928000000_mobile_portal.sql
-- Idempotent, non-destructive, safe for all existing business data.
-- ==============================================================================

-- 1. Extend Profiles with Mobile Portal Permissions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile_access_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_role TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS mobile_allowed_doc_types TEXT[] DEFAULT ARRAY[
    'quotation', 'proforma', 'tax_invoice', 'delivery_note', 
    'purchase_order', 'supplier_bill', 'cheque', 'company_file'
  ],
  ADD COLUMN IF NOT EXISTS can_view_financials BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_share_documents BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_download_documents BOOLEAN DEFAULT true;

-- 2. Sensitive Document Access Audit Log Table
CREATE TABLE IF NOT EXISTS public.document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_ref TEXT,
  action TEXT NOT NULL CHECK (action IN ('view', 'preview_pdf', 'download', 'share')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_access_logs_company ON public.document_access_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_user ON public.document_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_logs_doc ON public.document_access_logs(document_type, document_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.document_access_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Document Access Logs
DROP POLICY IF EXISTS "doc_access_logs_company_isolation" ON public.document_access_logs;
CREATE POLICY "doc_access_logs_company_isolation" ON public.document_access_logs
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.get_auth_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_auth_user_company_ids()));

-- 5. Grant Permissions to authenticated role
GRANT SELECT, INSERT ON TABLE public.document_access_logs TO authenticated;

-- 6. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
