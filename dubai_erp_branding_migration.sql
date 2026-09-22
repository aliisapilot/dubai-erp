-- ============================================================
-- Dubai ERP — Brand Color & Image Asset Columns Migration
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================
-- These columns enable image upload storage and color theme
-- customization for all printable documents.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stamp_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS background_url TEXT,
  ADD COLUMN IF NOT EXISTS building_image_url TEXT,
  ADD COLUMN IF NOT EXISTS footer_image_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary TEXT DEFAULT '#0F172A',
  ADD COLUMN IF NOT EXISTS brand_accent TEXT DEFAULT '#C9A227',
  ADD COLUMN IF NOT EXISTS brand_text TEXT DEFAULT '#334155',
  ADD COLUMN IF NOT EXISTS brand_muted TEXT DEFAULT '#64748B',
  ADD COLUMN IF NOT EXISTS brand_border TEXT DEFAULT '#CBD5E1',
  ADD COLUMN IF NOT EXISTS brand_table_header TEXT DEFAULT '#0F172A',
  ADD COLUMN IF NOT EXISTS brand_total_highlight TEXT DEFAULT '#F8F6ED',
  ADD COLUMN IF NOT EXISTS logo_size INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS arabic_name_size INTEGER DEFAULT 30;

-- Optional: Create Supabase Storage bucket for company assets
-- (if not already created via Dashboard)
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('company-assets', 'company-assets', true)
-- ON CONFLICT (id) DO NOTHING;

-- Grant public read access to company-assets bucket
-- (run this only if you created the bucket above)
-- CREATE POLICY "Public Read company-assets" ON storage.objects
--   FOR SELECT USING (bucket_id = 'company-assets');

-- CREATE POLICY "Authenticated Upload company-assets" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

-- Ensure employees table has needed columns and authenticated permissions
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employees TO authenticated;

-- Ensure receipt vouchers has status column and authenticated permissions
ALTER TABLE public.receipt_vouchers
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.receipt_vouchers TO authenticated;
