-- ============================================================
-- Dubai ERP — Fabric & Material Stock Management System Migration
-- AL SAFWAH AL QABDHA TENTS IND L.L.C SP
-- Safe, additive migration. Preserves all existing records.
-- ============================================================

-- 1. Extend products table with Fabric & Material Master specifications
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS colour TEXT,
  ADD COLUMN IF NOT EXISTS specification TEXT,
  ADD COLUMN IF NOT EXISTS fabric_width NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS roll_length NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Extend stock_movements with Customer, Project, Fabric & Wastage tracking
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS running_metres NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS square_metres NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS wastage_quantity NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fabric_width NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS warehouse TEXT DEFAULT 'Main Warehouse',
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS roll_ref TEXT,
  ADD COLUMN IF NOT EXISTS issued_by TEXT,
  ADD COLUMN IF NOT EXISTS received_by TEXT,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Create Project Material Allocations table for planned project fabric tracking
CREATE TABLE IF NOT EXISTS public.project_material_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  allocated_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'sqm',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_stock_movements_customer_id ON public.stock_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_project_id ON public.stock_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proj_mat_alloc_project_id ON public.project_material_allocations(project_id);

-- Enable RLS on project_material_allocations
ALTER TABLE public.project_material_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_material_allocations' AND policyname = 'project_material_allocations_company_isolation'
  ) THEN
    CREATE POLICY project_material_allocations_company_isolation ON public.project_material_allocations
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
