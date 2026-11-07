-- ============================================================
-- Dubai ERP — Inventory Customization Migration
-- Custom Categories, Custom Units, Custom Fields & Product Types
-- Safe, strictly additive, idempotent migration.
-- Preserves all existing product & stock records.
-- ============================================================

-- 1. Extend products table with product_type if not present
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Partial unique index on company_id and lower(sku) to enforce tenant-scoped unique SKUs
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku_unique
  ON public.products(company_id, LOWER(sku))
  WHERE sku IS NOT NULL AND sku <> '';

-- 3. Dedicated Company Inventory Customization Settings table
-- Persists custom categories, custom units, and custom field definitions per company
CREATE TABLE IF NOT EXISTS public.company_inventory_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  units JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_inventory_settings_company UNIQUE (company_id)
);

-- Indexes for rapid lookups
CREATE INDEX IF NOT EXISTS idx_company_inv_settings_company ON public.company_inventory_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON public.products(product_type);

-- Enable Row Level Security on company_inventory_settings
ALTER TABLE public.company_inventory_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_inventory_settings'
      AND policyname = 'company_inventory_settings_isolation'
  ) THEN
    CREATE POLICY company_inventory_settings_isolation ON public.company_inventory_settings
      FOR ALL
      USING (
        company_id IN (
          SELECT id FROM public.companies WHERE owner_id = auth.uid()
          UNION
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT id FROM public.companies WHERE owner_id = auth.uid()
          UNION
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_inventory_settings TO authenticated;
