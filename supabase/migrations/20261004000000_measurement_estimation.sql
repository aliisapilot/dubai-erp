-- ============================================================
-- Dubai ERP — Measurement & Estimation Module Safe Migration
-- ============================================================

-- 1. Measurement Projects / Sheets
CREATE TABLE IF NOT EXISTS public.measurement_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sheet_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Measurement Items (Rows)
CREATE TABLE IF NOT EXISTS public.measurement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID NOT NULL REFERENCES public.measurement_projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  area_name TEXT NOT NULL,
  description TEXT,
  calc_type TEXT NOT NULL DEFAULT 'pvc_edge_joint',
  dim_unit TEXT NOT NULL DEFAULT 'mm',
  length_entered NUMERIC(14,3) DEFAULT 0,
  width_entered NUMERIC(14,3) DEFAULT 0,
  width2_entered NUMERIC(14,3),
  is_variable_width BOOLEAN DEFAULT false,
  length_m NUMERIC(14,3) DEFAULT 0,
  width_m NUMERIC(14,3) DEFAULT 0,
  width2_m NUMERIC(14,3),
  quantity NUMERIC(12,2) DEFAULT 1,
  pvc_length_edges NUMERIC(10,2) DEFAULT 2,
  pvc_width_edges NUMERIC(10,2) DEFAULT 2,
  pvc_centre_joints NUMERIC(10,2) DEFAULT 1,
  custom_components JSONB,
  formula_text TEXT,
  per_piece_result NUMERIC(14,3) DEFAULT 0,
  calculated_total NUMERIC(14,3) DEFAULT 0,
  result_unit TEXT DEFAULT 'm',
  rate NUMERIC(14,2) DEFAULT 0,
  total_cost NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for High-Performance Querying
CREATE INDEX IF NOT EXISTS idx_measurement_projects_company ON public.measurement_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_measurement_projects_project ON public.measurement_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_measurement_projects_customer ON public.measurement_projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_measurement_items_sheet ON public.measurement_items(sheet_id);
CREATE INDEX IF NOT EXISTS idx_measurement_items_company ON public.measurement_items(company_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.measurement_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_items ENABLE ROW LEVEL SECURITY;

-- 5. Safe Multi-Tenant Policies
DROP POLICY IF EXISTS "company_measurement_projects" ON public.measurement_projects;
CREATE POLICY "company_measurement_projects" ON public.measurement_projects
  FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "company_measurement_items" ON public.measurement_items;
CREATE POLICY "company_measurement_items" ON public.measurement_items
  FOR ALL TO authenticated
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

-- 6. Permissions Grant
GRANT ALL ON public.measurement_projects TO anon, authenticated;
GRANT ALL ON public.measurement_items TO anon, authenticated;
