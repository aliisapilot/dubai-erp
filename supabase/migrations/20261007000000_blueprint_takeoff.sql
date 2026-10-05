-- ============================================================
-- Dubai ERP — Blueprint Takeoff & Annotation Schema Migration
-- ============================================================

-- 1. Create a table to store uploaded blueprints per measurement sheet
CREATE TABLE IF NOT EXISTS public.measurement_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sheet_id UUID REFERENCES public.measurement_projects(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  blueprint_name TEXT NOT NULL,
  blueprint_file_path TEXT,
  file_type TEXT NOT NULL DEFAULT 'png', -- png, pdf, jpg
  width_px INTEGER NOT NULL DEFAULT 0,
  height_px INTEGER NOT NULL DEFAULT 0,
  calibration JSONB, -- stores {pointA, pointB, realWorldDistance, unit, pixelsPerMm}
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb, -- stores BlueprintAnnotation[]
  takeoff_areas JSONB NOT NULL DEFAULT '[]'::jsonb, -- stores BlueprintTakeoffArea[]
  ai_tips JSONB NOT NULL DEFAULT '[]'::jsonb, -- stores BlueprintAITip[]
  ai_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add an optional blueprint source type reference to measurement items
-- This allows linking a measurement row directly to its source in the blueprint annotations/takeoffs
ALTER TABLE public.measurement_items ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'Manual'; -- 'Manual' | 'Blueprint' | 'Scale Measured' | 'AI Detected'
ALTER TABLE public.measurement_items ADD COLUMN IF NOT EXISTS blueprint_area_id TEXT; -- Reference to a blueprint takeoff area (or dimension)

-- 3. Indexes for blueprint performance
CREATE INDEX IF NOT EXISTS idx_measurement_blueprints_company ON public.measurement_blueprints(company_id);
CREATE INDEX IF NOT EXISTS idx_measurement_blueprints_sheet ON public.measurement_blueprints(sheet_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.measurement_blueprints ENABLE ROW LEVEL SECURITY;

-- 5. Safe Multi-Tenant Policies
DROP POLICY IF EXISTS "company_measurement_blueprints" ON public.measurement_blueprints;
CREATE POLICY "company_measurement_blueprints" ON public.measurement_blueprints
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
      UNION
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND COALESCE(active, true)
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
      UNION
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND COALESCE(active, true)
    )
  );

-- 6. Permissions Grant
REVOKE ALL ON public.measurement_blueprints FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_blueprints TO authenticated;